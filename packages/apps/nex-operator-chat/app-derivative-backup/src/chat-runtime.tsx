import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  applyChatEvent,
  createInitialNexChatState,
  hydrateChatSnapshot,
  selectChatLane,
  setChatError,
  setChatStatus,
  type NexChatState,
} from "./chat-state";
import type {
  ChatApprovalDecision,
  ChatEvent,
  ChatReplayResult,
  ChatSnapshotResult,
  NexChatRuntimeBridge,
} from "./types";

const DEFAULT_SNAPSHOT_PARAMS = {
  include_conversation_context: true,
  message_limit: 200,
  approval_limit: 50,
  record_limit: 200,
};

type NexChatRuntimeActions = {
  selectLane(laneId: string | null): void;
  loadLane(laneId: string): Promise<void>;
  sendMessage(laneId: string, message: string): Promise<void>;
  abortLane(laneId: string): Promise<void>;
  selectDeliveryTarget(laneId: string, targetId: string): Promise<void>;
  respondToApproval(laneId: string, approvalId: string, decision: ChatApprovalDecision): Promise<void>;
  createLaneAction(
    laneId: string,
    input: {
      label: string;
      default_prompt: string;
      icon: string;
      shortcut: string | null;
      invocation_mode: "prefill" | "invoke";
      requires_input: boolean;
    },
  ): Promise<void>;
  updateLaneAction(
    laneId: string,
    actionId: string,
    input: {
      label: string;
      default_prompt: string;
      icon: string;
      shortcut: string | null;
      invocation_mode: "prefill" | "invoke";
      requires_input: boolean;
    },
  ): Promise<void>;
  deleteLaneAction(laneId: string, actionId: string): Promise<void>;
  invokeLaneAction(laneId: string, actionId: string): Promise<void>;
};

const NexChatRuntimeContext = createContext<{
  state: NexChatState;
  actions: NexChatRuntimeActions;
} | null>(null);

export function NexChatRuntimeProvider(props: {
  bridge: NexChatRuntimeBridge;
  initialLaneId?: string | null;
  requestedLaneId?: string;
  children: ReactNode;
}) {
  const [state, setState] = useState(() =>
    createInitialNexChatState(props.requestedLaneId ?? props.initialLaneId),
  );
  const stateRef = useRef(state);
  const loadedLaneIdsRef = useRef(new Set<string>());
  const recoveringRef = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const applySnapshot = useCallback((snapshot: ChatSnapshotResult) => {
    setState((current) => hydrateChatSnapshot(current, snapshot));
    if (snapshot.expanded_lane?.lane.lane_id) {
      loadedLaneIdsRef.current.add(snapshot.expanded_lane.lane.lane_id);
    }
  }, []);

  const setError = useCallback((error: unknown) => {
    setState((current) =>
      setChatError(current, error instanceof Error ? error.message : String(error)),
    );
  }, []);

  const replayFrom = useCallback(
    async (afterSequence: number) => {
      if (recoveringRef.current) {
        return;
      }
      recoveringRef.current = true;
      setState((current) => setChatStatus(current, "recovering"));
      try {
        const replay = await props.bridge.request<ChatReplayResult>("chat.replay", {
          after_sequence: afterSequence,
        });
        if (replay.reset_required) {
          const selectedLaneId = stateRef.current.selectedLaneId ?? undefined;
          const snapshot = await props.bridge.request<ChatSnapshotResult>("chat.snapshot", {
            ...DEFAULT_SNAPSHOT_PARAMS,
            ...(selectedLaneId ? { lane_id: selectedLaneId } : {}),
          });
          applySnapshot(snapshot);
        } else {
          setState((current) => {
            let next = current;
            for (const event of replay.events) {
              next = applyChatEvent(next, event);
            }
            return setChatStatus(next, "ready");
          });
        }
      } catch (error) {
        setError(error);
      } finally {
        recoveringRef.current = false;
      }
    },
    [applySnapshot, props.bridge, setError],
  );

  const handleEvent = useCallback(
    async (event: ChatEvent) => {
      const currentSequence = stateRef.current.sequence;
      if (event.sequence <= currentSequence) {
        return;
      }
      if (event.sequence === currentSequence + 1) {
        setState((current) => applyChatEvent(current, event));
        return;
      }
      await replayFrom(currentSequence);
    },
    [replayFrom],
  );

  useEffect(() => {
    let disposed = false;
    setState((current) => setChatStatus(current, "loading"));
    const laneId = props.requestedLaneId?.trim() || props.initialLaneId?.trim() || undefined;
    void props.bridge
      .request<ChatSnapshotResult>("chat.snapshot", {
        ...DEFAULT_SNAPSHOT_PARAMS,
        ...(laneId ? { lane_id: laneId } : {}),
      })
      .then((snapshot) => {
        if (disposed) {
          return;
        }
        applySnapshot(snapshot);
        unsubscribeRef.current = props.bridge.subscribe((streamEvent) => {
          if (streamEvent.event !== "chat") {
            return;
          }
          void handleEvent(streamEvent.payload);
        });
      })
      .catch((error) => {
        if (!disposed) {
          setError(error);
        }
      });

    return () => {
      disposed = true;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [applySnapshot, handleEvent, props.bridge, props.initialLaneId, props.requestedLaneId, setError]);

  const loadLane = useCallback(
    async (laneId: string) => {
      const trimmedLaneId = laneId.trim();
      if (!trimmedLaneId || loadedLaneIdsRef.current.has(trimmedLaneId)) {
        return;
      }
      try {
        const snapshot = await props.bridge.request<ChatSnapshotResult>("chat.snapshot", {
          ...DEFAULT_SNAPSHOT_PARAMS,
          lane_id: trimmedLaneId,
        });
        applySnapshot(snapshot);
      } catch (error) {
        setError(error);
      }
    },
    [applySnapshot, props.bridge, setError],
  );

  const refreshLaneSnapshot = useCallback(
    async (laneId: string) => {
      const trimmedLaneId = laneId.trim();
      if (!trimmedLaneId) {
        return;
      }
      try {
        const snapshot = await props.bridge.request<ChatSnapshotResult>("chat.snapshot", {
          ...DEFAULT_SNAPSHOT_PARAMS,
          lane_id: trimmedLaneId,
        });
        applySnapshot(snapshot);
      } catch (error) {
        setError(error);
        throw error;
      }
    },
    [applySnapshot, props.bridge, setError],
  );

  const actions = useMemo<NexChatRuntimeActions>(
    () => ({
      selectLane(laneId) {
        setState((current) => selectChatLane(current, laneId));
      },
      loadLane,
      async sendMessage(laneId, message) {
        const trimmed = message.trim();
        if (!laneId || !trimmed) {
          return;
        }
        await props.bridge.request("chat.send", {
          lane_id: laneId,
          message: trimmed,
        });
      },
      async abortLane(laneId) {
        if (!laneId) {
          return;
        }
        await props.bridge.request("chat.abort", {
          lane_id: laneId,
        });
      },
      async selectDeliveryTarget(laneId, targetId) {
        if (!laneId || !targetId) {
          return;
        }
        await props.bridge.request("chat.delivery.select", {
          lane_id: laneId,
          target_id: targetId,
        });
        await refreshLaneSnapshot(laneId);
      },
      async respondToApproval(laneId, approvalId, decision) {
        if (!laneId || !approvalId) {
          return;
        }
        await props.bridge.request("chat.approvals.respond", {
          lane_id: laneId,
          approval_id: approvalId,
          decision,
        });
        await refreshLaneSnapshot(laneId);
      },
      async createLaneAction(laneId, input) {
        await props.bridge.request("chat.actions.create", {
          lane_id: laneId,
          ...input,
        });
        await refreshLaneSnapshot(laneId);
      },
      async updateLaneAction(laneId, actionId, input) {
        await props.bridge.request("chat.actions.update", {
          lane_id: laneId,
          action_id: actionId,
          ...input,
        });
        await refreshLaneSnapshot(laneId);
      },
      async deleteLaneAction(laneId, actionId) {
        await props.bridge.request("chat.actions.delete", {
          lane_id: laneId,
          action_id: actionId,
        });
        await refreshLaneSnapshot(laneId);
      },
      async invokeLaneAction(laneId, actionId) {
        await props.bridge.request("chat.actions.invoke", {
          lane_id: laneId,
          action_id: actionId,
        });
      },
    }),
    [loadLane, props.bridge, refreshLaneSnapshot],
  );

  return (
    <NexChatRuntimeContext.Provider value={{ state, actions }}>
      {props.children}
    </NexChatRuntimeContext.Provider>
  );
}

function useNexChatRuntimeContext() {
  const context = useContext(NexChatRuntimeContext);
  if (!context) {
    throw new Error("NexChatRuntimeProvider is required");
  }
  return context;
}

export function useNexChatState() {
  return useNexChatRuntimeContext().state;
}

export function useNexChatActions() {
  return useNexChatRuntimeContext().actions;
}
