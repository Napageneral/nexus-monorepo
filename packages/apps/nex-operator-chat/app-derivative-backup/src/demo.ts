import type {
  ChatApprovalDecision,
  ChatEvent,
  ChatLaneDetail,
  ChatLaneSummary,
  ChatReplayResult,
  ChatSnapshotResult,
  NexChatRuntimeBridge,
} from "./types";

const DEMO_SNAPSHOT: ChatSnapshotResult = {
  sequence: 6,
  default_lane_id: "lane:agent:manager",
  lanes: [
    {
      lane_id: "lane:agent:manager",
      lane_mode: "agent",
      agent_id: "entity-manager",
      session_id: "session:manager",
      parent_lane_id: null,
      conversation_scope_id: "scope:direct:entity-manager:entity-casey",
      title: "Manager Agent",
      subtitle: "Casey shipping lane",
      preview_text: "Latest update drafted for Casey.",
      run_state: "running",
      updated_at: 6,
      unread_count: 0,
      can_send: true,
      can_abort: true,
    },
    {
      lane_id: "lane:worker_session:session:worker",
      lane_mode: "worker_session",
      agent_id: "entity-worker",
      session_id: "session:worker",
      parent_lane_id: "lane:agent:manager",
      conversation_scope_id: "scope:direct:entity-manager:entity-casey",
      title: "Worker Agent",
      subtitle: "Delay investigation",
      preview_text: "Carrier handoff issue isolated.",
      run_state: "idle",
      updated_at: 3,
      unread_count: 0,
      can_send: true,
      can_abort: false,
    },
  ],
  expanded_lane: {
    lane: {
      lane_id: "lane:agent:manager",
      lane_mode: "agent",
      agent_id: "entity-manager",
      session_id: "session:manager",
      parent_lane_id: null,
      conversation_scope_id: "scope:direct:entity-manager:entity-casey",
      title: "Manager Agent",
      subtitle: "Casey shipping lane",
      preview_text: "Latest update drafted for Casey.",
      run_state: "waiting_approval",
      updated_at: 6,
      unread_count: 0,
      can_send: true,
      can_abort: true,
    },
    messages: [
      {
        id: "m1",
        lane_id: "lane:agent:manager",
        session_id: "session:manager",
        turn_id: "turn:1",
        record_id: "record:1",
        role: "user",
        text: "Please update Casey about the shipment delay.",
        created_at: 1,
      },
      {
        id: "m2",
        lane_id: "lane:agent:manager",
        session_id: "session:manager",
        turn_id: "turn:2",
        record_id: "record:2",
        role: "assistant",
        text: "I pulled the worker findings and I am drafting the outbound message now.",
        created_at: 2,
      },
    ],
    activities: [
      {
        id: "a1",
        lane_id: "lane:agent:manager",
        session_id: "session:manager",
        activity_type: "worker_spawn",
        status: "completed",
        title: "Worker dispatched",
        detail: "Worker Agent investigated the carrier handoff issue.",
        created_at: 3,
      },
    ],
    approvals: [
      {
        id: "approval:demo:write",
        lane_id: "lane:agent:manager",
        request_type: "filesystem.write",
        status: "pending",
        summary: "Approve the drafted update before it is sent to Casey.",
        created_at: 4,
        expires_at: null,
        resolved_at: null,
      },
    ],
    actions: [
      {
        action_id: "action:status-update",
        agent_id: "entity-manager",
        label: "Status update",
        description: "Draft a concise outbound update for Casey.",
        icon: "play",
        shortcut: "mod+shift+u",
        invocation_mode: "prefill",
        requires_input: true,
        default_prompt: "Draft a concise outbound update for Casey using the latest worker findings.",
        display_order: 0,
      },
    ],
    conversation_context: {
      conversation_scope_id: "scope:direct:entity-manager:entity-casey",
      conversation_ids: ["conversation:imessage:casey", "conversation:discord:casey"],
      records: [
        {
          id: "r1",
          channel: "imessage",
          sender_entity_id: "entity-casey",
          receiver_entity_id: "entity-manager",
          text: "Any update on my order?",
          timestamp: 1,
        },
        {
          id: "r2",
          channel: "discord",
          sender_entity_id: "entity-manager",
          receiver_entity_id: "entity-casey",
          text: "I found the carrier handoff issue and I am preparing the response now.",
          timestamp: 3,
        },
      ],
      delivery_targets: [
        {
          target_id: "conversation:imessage:casey",
          channel: "imessage",
          label: "Casey (imessage)",
          selected: true,
        },
        {
          target_id: "conversation:discord:casey",
          channel: "discord",
          label: "Casey (discord)",
          selected: false,
        },
      ],
    },
  },
};

export function createDemoBridge(): NexChatRuntimeBridge {
  const listeners = new Set<(event: { event: "chat"; payload: ChatEvent }) => void>();
  const state = createDemoState();

  return {
    async request<T = unknown>(method: string, params?: unknown): Promise<T> {
      if (method === "chat.snapshot") {
        const laneId =
          params && typeof params === "object" && "lane_id" in params && typeof params.lane_id === "string"
            ? params.lane_id
            : null;
        return buildSnapshot(state, laneId) as T;
      }
      if (method === "chat.replay") {
        const afterSequence =
          params &&
          typeof params === "object" &&
          "after_sequence" in params &&
          typeof params.after_sequence === "number"
            ? params.after_sequence
            : 0;
        const replay: ChatReplayResult = {
          events: state.events.filter((event) => event.sequence > afterSequence),
          latest_sequence: state.sequence,
          reset_required: false,
        };
        return replay as T;
      }
      if (
        method === "chat.approvals.respond" &&
        params &&
        typeof params === "object" &&
        "lane_id" in params &&
        typeof params.lane_id === "string" &&
        "approval_id" in params &&
        typeof params.approval_id === "string" &&
        "decision" in params &&
        (params.decision === "approve" || params.decision === "deny")
      ) {
        const detail = ensureLaneDetail(state, params.lane_id);
        const approval = detail?.approvals.find((entry) => entry.id === params.approval_id);
        if (!detail || !approval) {
          throw new Error("unknown demo approval");
        }
        const decision = params.decision as ChatApprovalDecision;
        const status = decision === "approve" ? "approved" : "denied";
        approval.status = status;
        approval.resolved_at = Date.now();
        emitChatEvent(state, listeners, {
          sequence: ++state.sequence,
          event_name: "approval.resolved",
          lane_id: params.lane_id,
          occurred_at: approval.resolved_at,
          data: {
            id: approval.id,
            lane_id: params.lane_id,
            request_type: approval.request_type,
            status,
            summary: approval.summary,
            created_at: approval.created_at,
            expires_at: approval.expires_at,
            resolved_at: approval.resolved_at,
          },
        });
        emitChatEvent(state, listeners, {
          sequence: ++state.sequence,
          event_name: "lane.state-changed",
          lane_id: params.lane_id,
          occurred_at: approval.resolved_at + 1,
          data: {
            lane_id: params.lane_id,
            run_state: "idle",
            can_abort: false,
          },
        });
        return { ok: true, lane_id: params.lane_id, approval_id: approval.id, status } as T;
      }
      if (
        method === "chat.send" &&
        params &&
        typeof params === "object" &&
        "lane_id" in params &&
        typeof params.lane_id === "string" &&
        "message" in params &&
        typeof params.message === "string"
      ) {
        const lane = state.lanes.get(params.lane_id);
        const detail = lane ? ensureLaneDetail(state, lane.lane_id) : null;
        if (!lane || !detail) {
          throw new Error("unknown demo lane");
        }
        const now = Date.now();
        const requestId = `demo:${now}`;
        emitChatEvent(state, listeners, {
          sequence: ++state.sequence,
          event_name: "lane.state-changed",
          lane_id: lane.lane_id,
          occurred_at: now,
          data: {
            lane_id: lane.lane_id,
            session_id: lane.session_id,
            preview_text: params.message,
            run_state: "queued",
            can_abort: true,
          },
        });
        emitChatEvent(state, listeners, {
          sequence: ++state.sequence,
          event_name: "message.appended",
          lane_id: lane.lane_id,
          occurred_at: now + 1,
          data: {
            id: `demo:user:${now}`,
            lane_id: lane.lane_id,
            session_id: lane.session_id,
            turn_id: `turn:${now}`,
            record_id: `record:${now}`,
            role: "user",
            text: params.message,
            created_at: now + 1,
            preview_text: params.message,
          },
        });

        window.setTimeout(() => {
          emitChatEvent(state, listeners, {
            sequence: ++state.sequence,
            event_name: "message.appended",
            lane_id: lane.lane_id,
            occurred_at: now + 2,
            data: {
              id: `demo:assistant:${now}`,
              lane_id: lane.lane_id,
              session_id: lane.session_id,
              turn_id: `turn:${now}:assistant`,
              record_id: `record:${now}:assistant`,
              role: "assistant",
              text: `Demo lane ${lane.title} received: ${params.message}`,
              created_at: now + 2,
              preview_text: `Demo lane ${lane.title} received: ${params.message}`,
            },
          });
          emitChatEvent(state, listeners, {
            sequence: ++state.sequence,
            event_name: "lane.state-changed",
            lane_id: lane.lane_id,
            occurred_at: now + 3,
            data: {
              lane_id: lane.lane_id,
              session_id: lane.session_id,
              preview_text: `Demo lane ${lane.title} received: ${params.message}`,
              run_state: "idle",
              can_abort: false,
            },
          });
        }, 250);

        return {
          status: "queued",
          lane_id: lane.lane_id,
          session_id: lane.session_id,
          request_id: requestId,
        } as T;
      }
      if (
        method === "chat.abort" &&
        params &&
        typeof params === "object" &&
        "lane_id" in params &&
        typeof params.lane_id === "string"
      ) {
        const lane = state.lanes.get(params.lane_id);
        if (!lane) {
          throw new Error("unknown demo lane");
        }
        emitChatEvent(state, listeners, {
          sequence: ++state.sequence,
          event_name: "lane.state-changed",
          lane_id: lane.lane_id,
          occurred_at: Date.now(),
          data: {
            lane_id: lane.lane_id,
            session_id: lane.session_id,
            run_state: "idle",
            can_abort: false,
          },
        });
        return { ok: true, lane_id: lane.lane_id } as T;
      }
      if (
        method === "chat.delivery.select" &&
        params &&
        typeof params === "object" &&
        "lane_id" in params &&
        typeof params.lane_id === "string" &&
        "target_id" in params &&
        typeof params.target_id === "string"
      ) {
        const detail = ensureLaneDetail(state, params.lane_id);
        if (!detail?.conversation_context) {
          throw new Error("demo lane has no delivery context");
        }
        detail.conversation_context.delivery_targets = detail.conversation_context.delivery_targets.map((target) => ({
          ...target,
          selected: target.target_id === params.target_id,
        }));
        emitChatEvent(state, listeners, {
          sequence: ++state.sequence,
          event_name: "delivery.updated",
          lane_id: params.lane_id,
          occurred_at: Date.now(),
          data: {
            lane_id: params.lane_id,
          },
        });
        return { ok: true, lane_id: params.lane_id, target_id: params.target_id } as T;
      }
      throw new Error(`demo bridge does not implement ${method}`);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

type DemoState = {
  sequence: number;
  lanes: Map<string, ChatLaneSummary>;
  laneDetails: Record<string, ChatLaneDetail>;
  events: ChatEvent[];
};

function createDemoState(): DemoState {
  const snapshot = structuredClone(DEMO_SNAPSHOT);
  const workerLane = snapshot.lanes.find((lane) => lane.lane_id === "lane:worker_session:session:worker");
  return {
    sequence: snapshot.sequence,
    lanes: new Map(snapshot.lanes.map((lane) => [lane.lane_id, lane])),
    laneDetails: {
      [snapshot.expanded_lane!.lane.lane_id]: snapshot.expanded_lane!,
      ...(workerLane
        ? {
            [workerLane.lane_id]: {
              lane: workerLane,
              messages: [
                {
                  id: "m3",
                  lane_id: workerLane.lane_id,
                  session_id: workerLane.session_id,
                  turn_id: "turn:3",
                  record_id: "record:3",
                  role: "assistant",
                  text: "The carrier handoff issue is isolated to the Dallas transfer hub.",
                  created_at: 3,
                },
              ],
              activities: [],
              approvals: [],
              actions: [],
            },
          }
        : {}),
    },
    events: [],
  };
}

function buildSnapshot(state: DemoState, laneId: string | null): ChatSnapshotResult {
  const expandedLaneId = laneId ?? DEMO_SNAPSHOT.default_lane_id;
  return {
    sequence: state.sequence,
    default_lane_id: DEMO_SNAPSHOT.default_lane_id,
    lanes: [...state.lanes.values()].sort((left, right) => right.updated_at - left.updated_at),
    expanded_lane: expandedLaneId ? ensureLaneDetail(state, expandedLaneId) ?? undefined : undefined,
  };
}

function ensureLaneDetail(state: DemoState, laneId: string): ChatLaneDetail | null {
  const lane = state.lanes.get(laneId);
  if (!lane) {
    return null;
  }
  if (!state.laneDetails[laneId]) {
    state.laneDetails[laneId] = {
      lane,
      messages: [],
      activities: [],
      approvals: [],
      actions: [],
    };
  }
  state.laneDetails[laneId]!.lane = lane;
  return state.laneDetails[laneId]!;
}

function emitChatEvent(
  state: DemoState,
  listeners: Set<(event: { event: "chat"; payload: ChatEvent }) => void>,
  event: ChatEvent,
) {
  state.events.push(event);
  const laneId = event.lane_id ?? (typeof event.data.lane_id === "string" ? event.data.lane_id : null);
  if (laneId) {
    const existingLane = state.lanes.get(laneId);
    if (existingLane) {
      const nextLane = {
        ...existingLane,
        preview_text:
          typeof event.data.preview_text === "string"
            ? event.data.preview_text
            : existingLane.preview_text,
        run_state:
          event.data.run_state === "queued" ||
          event.data.run_state === "running" ||
          event.data.run_state === "waiting_approval" ||
          event.data.run_state === "error"
            ? event.data.run_state
            : event.data.run_state === "idle"
              ? "idle"
              : existingLane.run_state,
        can_abort:
          typeof event.data.can_abort === "boolean"
            ? event.data.can_abort
            : existingLane.can_abort,
        updated_at: event.occurred_at,
      } satisfies ChatLaneSummary;
      state.lanes.set(laneId, nextLane);
      const detail = ensureLaneDetail(state, laneId);
      if (detail) {
        detail.lane = nextLane;
      }
    }

    if (event.event_name === "message.appended") {
      const detail = ensureLaneDetail(state, laneId);
      if (detail) {
        detail.messages = [
          ...detail.messages,
          {
            id: String(event.data.id),
            lane_id: laneId,
            session_id:
              typeof event.data.session_id === "string" ? event.data.session_id : null,
            turn_id: typeof event.data.turn_id === "string" ? event.data.turn_id : null,
            record_id: typeof event.data.record_id === "string" ? event.data.record_id : null,
            role:
              event.data.role === "user" ||
              event.data.role === "assistant" ||
              event.data.role === "system" ||
              event.data.role === "tool"
                ? event.data.role
                : "assistant",
            text: String(event.data.text ?? ""),
            created_at:
              typeof event.data.created_at === "number" ? event.data.created_at : event.occurred_at,
          },
        ];
      }
    }

    if (event.event_name === "delivery.updated") {
      const detail = ensureLaneDetail(state, laneId);
      if (detail?.conversation_context && typeof event.data.target_id === "string") {
        detail.conversation_context.delivery_targets = detail.conversation_context.delivery_targets.map((target) => ({
          ...target,
          selected: target.target_id === event.data.target_id,
        }));
      }
    }
  }

  for (const listener of listeners) {
    listener({ event: "chat", payload: event });
  }
}
