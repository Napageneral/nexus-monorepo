import type {
  ChatActivity,
  ChatApproval,
  ChatEvent,
  ChatLaneAction,
  ChatLaneDetail,
  ChatLaneSummary,
  ChatMessage,
  ChatSnapshotResult,
} from "./types";

export type NexChatStatus = "idle" | "loading" | "ready" | "recovering" | "error";

export type NexChatState = {
  status: NexChatStatus;
  sequence: number;
  defaultLaneId: string | null;
  selectedLaneId: string | null;
  lanes: ChatLaneSummary[];
  laneDetailsById: Record<string, ChatLaneDetail>;
  lastError: string | null;
};

export function createInitialNexChatState(initialLaneId?: string | null): NexChatState {
  return {
    status: "idle",
    sequence: 0,
    defaultLaneId: initialLaneId?.trim() || null,
    selectedLaneId: initialLaneId?.trim() || null,
    lanes: [],
    laneDetailsById: {},
    lastError: null,
  };
}

function upsertLane(lanes: ChatLaneSummary[], lane: ChatLaneSummary): ChatLaneSummary[] {
  const next = lanes.filter((entry) => entry.lane_id !== lane.lane_id);
  next.push(lane);
  return next.sort((left, right) => right.updated_at - left.updated_at);
}

function removeLane(lanes: ChatLaneSummary[], laneId: string): ChatLaneSummary[] {
  return lanes.filter((entry) => entry.lane_id !== laneId);
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  const next = items.filter((entry) => entry.id !== nextItem.id);
  next.push(nextItem);
  return next.sort((left, right) => {
    const leftTime = (left as T & { created_at?: number }).created_at ?? 0;
    const rightTime = (right as T & { created_at?: number }).created_at ?? 0;
    return leftTime - rightTime;
  });
}

function upsertActionById(items: ChatLaneAction[], nextItem: ChatLaneAction): ChatLaneAction[] {
  const next = items.filter((entry) => entry.action_id !== nextItem.action_id);
  next.push(nextItem);
  return next.sort((left, right) => left.display_order - right.display_order);
}

function laneSummaryFromEvent(
  event: ChatEvent,
  existing: ChatLaneSummary | undefined,
): ChatLaneSummary | null {
  const data = event.data;
  const laneId = typeof data.lane_id === "string" ? data.lane_id : event.lane_id;
  if (!laneId) {
    return null;
  }
  const nextRunState =
    data.run_state === "queued" ||
    data.run_state === "running" ||
    data.run_state === "waiting_approval" ||
    data.run_state === "error"
      ? data.run_state
      : existing?.run_state ?? "idle";
  return {
    lane_id: laneId,
    lane_mode:
      data.lane_mode === "worker_session"
        ? "worker_session"
        : existing?.lane_mode ?? "agent",
    agent_id:
      typeof data.agent_id === "string" ? data.agent_id : existing?.agent_id ?? null,
    session_id:
      typeof data.session_id === "string" ? data.session_id : existing?.session_id ?? null,
    parent_lane_id:
      typeof data.parent_lane_id === "string"
        ? data.parent_lane_id
        : existing?.parent_lane_id ?? null,
    conversation_scope_id:
      typeof data.conversation_scope_id === "string"
        ? data.conversation_scope_id
        : existing?.conversation_scope_id ?? null,
    title: typeof data.title === "string" ? data.title : existing?.title ?? laneId,
    subtitle:
      typeof data.subtitle === "string" ? data.subtitle : existing?.subtitle ?? null,
    preview_text:
      typeof data.preview_text === "string"
        ? data.preview_text
        : existing?.preview_text ?? null,
    run_state: nextRunState,
    updated_at: event.occurred_at,
    unread_count:
      typeof data.unread_count === "number"
        ? data.unread_count
        : existing?.unread_count ?? 0,
    can_send:
      typeof data.can_send === "boolean" ? data.can_send : existing?.can_send ?? true,
    can_abort:
      typeof data.can_abort === "boolean"
        ? data.can_abort
        : nextRunState === "queued" || nextRunState === "running"
          ? true
          : existing?.can_abort ?? false,
  };
}

function asMessage(data: Record<string, unknown>): ChatMessage | null {
  if (typeof data.id !== "string" || typeof data.lane_id !== "string" || typeof data.text !== "string") {
    return null;
  }
  return {
    id: data.id,
    lane_id: data.lane_id,
    session_id: typeof data.session_id === "string" ? data.session_id : null,
    turn_id: typeof data.turn_id === "string" ? data.turn_id : null,
    record_id: typeof data.record_id === "string" ? data.record_id : null,
    role:
      data.role === "user" || data.role === "assistant" || data.role === "system" || data.role === "tool"
        ? data.role
        : "assistant",
    text: data.text,
    created_at: typeof data.created_at === "number" ? data.created_at : 0,
  };
}

function asActivity(data: Record<string, unknown>): ChatActivity | null {
  if (
    typeof data.id !== "string" ||
    typeof data.lane_id !== "string" ||
    typeof data.activity_type !== "string" ||
    typeof data.title !== "string"
  ) {
    return null;
  }
  return {
    id: data.id,
    lane_id: data.lane_id,
    session_id: typeof data.session_id === "string" ? data.session_id : null,
    activity_type: data.activity_type as ChatActivity["activity_type"],
    status: typeof data.status === "string" ? data.status : null,
    title: data.title,
    detail: typeof data.detail === "string" ? data.detail : null,
    created_at: typeof data.created_at === "number" ? data.created_at : 0,
  };
}

function asApproval(data: Record<string, unknown>): ChatApproval | null {
  if (typeof data.id !== "string" || typeof data.lane_id !== "string" || typeof data.status !== "string") {
    return null;
  }
  return {
    id: data.id,
    lane_id: data.lane_id,
    request_type: typeof data.request_type === "string" ? data.request_type : null,
    status: data.status as ChatApproval["status"],
    summary: typeof data.summary === "string" ? data.summary : null,
    created_at: typeof data.created_at === "number" ? data.created_at : 0,
    expires_at: typeof data.expires_at === "number" ? data.expires_at : null,
    resolved_at: typeof data.resolved_at === "number" ? data.resolved_at : null,
  };
}

function asLaneAction(data: Record<string, unknown>): ChatLaneAction | null {
  if (typeof data.action_id !== "string" || typeof data.label !== "string") {
    return null;
  }
  return {
    action_id: data.action_id,
    agent_id: typeof data.agent_id === "string" ? data.agent_id : null,
    label: data.label,
    description: typeof data.description === "string" ? data.description : null,
    icon:
      data.icon === "test" ||
      data.icon === "lint" ||
      data.icon === "configure" ||
      data.icon === "build" ||
      data.icon === "debug"
        ? data.icon
        : "play",
    shortcut: typeof data.shortcut === "string" ? data.shortcut : null,
    invocation_mode: data.invocation_mode === "invoke" ? "invoke" : "prefill",
    requires_input: data.requires_input === true,
    default_prompt: typeof data.default_prompt === "string" ? data.default_prompt : null,
    display_order: typeof data.display_order === "number" ? data.display_order : 0,
  };
}

export function applySnapshotToState(
  state: NexChatState,
  snapshot: ChatSnapshotResult,
  preferredLaneId?: string | null,
): NexChatState {
  const laneDetailsById = { ...state.laneDetailsById };
  if (snapshot.expanded_lane) {
    laneDetailsById[snapshot.expanded_lane.lane.lane_id] = {
      ...snapshot.expanded_lane,
      actions: snapshot.expanded_lane.actions ?? [],
    };
  }
  return {
    ...state,
    status: "ready",
    sequence: snapshot.sequence,
    defaultLaneId:
      snapshot.expanded_lane?.lane.lane_id ?? snapshot.default_lane_id ?? state.defaultLaneId,
    selectedLaneId:
      preferredLaneId ??
      snapshot.expanded_lane?.lane.lane_id ??
      snapshot.default_lane_id ??
      state.selectedLaneId,
    lanes: snapshot.lanes,
    laneDetailsById,
    lastError: null,
  };
}

export function applyChatEventToState(
  state: NexChatState,
  event: ChatEvent,
): NexChatState {
  const next = {
    ...state,
    sequence: Math.max(state.sequence, event.sequence),
    lastError: null,
  };
  const laneId = event.lane_id ?? (typeof event.data.lane_id === "string" ? event.data.lane_id : null);
  if (event.event_name === "lane.removed" && laneId) {
    const laneDetailsById = { ...state.laneDetailsById };
    delete laneDetailsById[laneId];
    return {
      ...next,
      lanes: removeLane(state.lanes, laneId),
      defaultLaneId: state.defaultLaneId === laneId ? null : state.defaultLaneId,
      selectedLaneId: state.selectedLaneId === laneId ? null : state.selectedLaneId,
      laneDetailsById,
    };
  }

  const maybeLane = laneSummaryFromEvent(
    event,
    laneId ? state.lanes.find((entry) => entry.lane_id === laneId) : undefined,
  );
  let lanes = state.lanes;
  const laneDetailsById = { ...state.laneDetailsById };
  if (maybeLane) {
    lanes = upsertLane(state.lanes, maybeLane);
    const existingDetail = laneDetailsById[maybeLane.lane_id];
    if (existingDetail) {
      laneDetailsById[maybeLane.lane_id] = {
        ...existingDetail,
        lane: {
          ...existingDetail.lane,
          ...maybeLane,
        },
      };
    }
  }

  if (laneId) {
    const existingDetail = laneDetailsById[laneId];
    if (existingDetail && (event.event_name === "message.appended" || event.event_name === "message.updated")) {
      const message = asMessage(event.data);
      if (message) {
        laneDetailsById[laneId] = {
          ...existingDetail,
          messages: upsertById(existingDetail.messages, message),
        };
      }
    }
    if (existingDetail && (event.event_name === "activity.appended" || event.event_name === "activity.updated")) {
      const activity = asActivity(event.data);
      if (activity) {
        laneDetailsById[laneId] = {
          ...existingDetail,
          activities: upsertById(existingDetail.activities, activity),
        };
      }
    }
    if (existingDetail && (event.event_name === "approval.upserted" || event.event_name === "approval.resolved")) {
      const approval = asApproval(event.data);
      if (approval) {
        laneDetailsById[laneId] = {
          ...existingDetail,
          approvals: upsertById(existingDetail.approvals, approval),
        };
      }
    }
    if (existingDetail && event.event_name === "action.upserted") {
      const action = asLaneAction(event.data);
      if (action) {
        laneDetailsById[laneId] = {
          ...existingDetail,
          actions: upsertActionById(existingDetail.actions, action),
        };
      }
    }
    if (existingDetail && event.event_name === "action.removed") {
      const actionId = typeof event.data.action_id === "string" ? event.data.action_id : null;
      if (actionId) {
        laneDetailsById[laneId] = {
          ...existingDetail,
          actions: existingDetail.actions.filter((entry) => entry.action_id !== actionId),
        };
      }
    }
  }

  return {
    ...next,
    lanes,
    laneDetailsById,
  };
}

export function hydrateChatSnapshot(
  state: NexChatState,
  snapshot: ChatSnapshotResult,
  preferredLaneId?: string | null,
): NexChatState {
  return applySnapshotToState(state, snapshot, preferredLaneId);
}

export function applyChatEvent(state: NexChatState, event: ChatEvent): NexChatState {
  return applyChatEventToState(state, event);
}

export function selectChatLane(state: NexChatState, laneId: string | null): NexChatState {
  return {
    ...state,
    selectedLaneId: laneId?.trim() || null,
  };
}

export function setChatStatus(state: NexChatState, status: NexChatStatus): NexChatState {
  return {
    ...state,
    status,
  };
}

export function setChatError(state: NexChatState, message: string | null): NexChatState {
  return {
    ...state,
    status: message ? "error" : "ready",
    lastError: message,
  };
}
