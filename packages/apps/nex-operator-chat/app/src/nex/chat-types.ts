export type ChatLaneMode = "agent" | "worker_session";
export type ChatRunState = "idle" | "queued" | "running" | "waiting_approval" | "error";
export type ChatMessageRole = "user" | "assistant" | "system" | "tool";
export type ChatActivityType =
  | "run_lifecycle"
  | "tool_call"
  | "file_change"
  | "web_activity"
  | "approval_request"
  | "approval_resolution"
  | "worker_spawn"
  | "warning";
export type ChatApprovalStatus = "pending" | "approved" | "denied" | "expired";
export type ChatActionInvocationMode = "prefill" | "invoke";
export type ChatEventName =
  | "lane.upserted"
  | "lane.removed"
  | "lane.state-changed"
  | "message.appended"
  | "message.updated"
  | "activity.appended"
  | "activity.updated"
  | "approval.upserted"
  | "approval.resolved"
  | "conversation.updated"
  | "delivery.updated"
  | "action.upserted"
  | "action.removed";

export type ChatLaneSummary = {
  lane_id: string;
  lane_mode: ChatLaneMode;
  agent_id: string | null;
  session_id: string | null;
  parent_lane_id: string | null;
  conversation_scope_id: string | null;
  title: string;
  subtitle: string | null;
  preview_text: string | null;
  run_state: ChatRunState;
  updated_at: number;
  unread_count: number;
  can_send: boolean;
  can_abort: boolean;
};

export type ChatMessage = {
  id: string;
  lane_id: string;
  session_id: string | null;
  turn_id: string | null;
  record_id: string | null;
  client_message_id?: string;
  role: ChatMessageRole;
  text: string;
  created_at: number;
};

export type ChatActivity = {
  id: string;
  lane_id: string;
  session_id: string | null;
  activity_type: ChatActivityType;
  status: string | null;
  title: string;
  detail: string | null;
  created_at: number;
};

export type ChatApproval = {
  id: string;
  lane_id: string;
  request_type: string | null;
  status: ChatApprovalStatus;
  summary: string | null;
  created_at: number;
  expires_at: number | null;
  resolved_at: number | null;
};

export type ChatDeliveryTarget = {
  target_id: string;
  channel: string;
  label: string;
  selected: boolean;
};

export type ChatConversationRecord = {
  id: string;
  channel: string;
  sender_entity_id: string | null;
  receiver_entity_id: string | null;
  text: string;
  timestamp: number;
};

export type ChatConversationContext = {
  conversation_scope_id: string;
  conversation_ids: string[];
  records: ChatConversationRecord[];
  delivery_targets: ChatDeliveryTarget[];
};

export type ChatLaneAction = {
  action_id: string;
  agent_id: string | null;
  label: string;
  description: string | null;
  icon: "play" | "test" | "lint" | "configure" | "build" | "debug";
  shortcut: string | null;
  invocation_mode: ChatActionInvocationMode;
  requires_input: boolean;
  default_prompt: string | null;
  display_order: number;
};

export type ChatLaneDetail = {
  lane: ChatLaneSummary;
  messages: ChatMessage[];
  older_messages_cursor?: string | null;
  activities: ChatActivity[];
  approvals: ChatApproval[];
  actions: ChatLaneAction[];
  conversation_context?: ChatConversationContext;
  model_id?: string | null;
  provider_id?: string | null;
};

export type ChatSnapshotResult = {
  sequence: number;
  default_lane_id: string | null;
  lanes: ChatLaneSummary[];
  expanded_lane?: ChatLaneDetail;
};

export type ChatEvent = {
  sequence: number;
  event_name: ChatEventName;
  lane_id: string | null;
  occurred_at: number;
  data: Record<string, unknown>;
};

export type ChatReplayResult = {
  events: ChatEvent[];
  latest_sequence: number;
  reset_required: boolean;
};

export type NexChatRuntimeStreamEvent = {
  event: "chat";
  payload: ChatEvent;
};

export type NexChatRuntimeBridge = {
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
  subscribe(listener: (event: NexChatRuntimeStreamEvent) => void): () => void;
  dispose?: () => void;
};
