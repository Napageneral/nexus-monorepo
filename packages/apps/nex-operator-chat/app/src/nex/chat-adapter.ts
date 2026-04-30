import {
  ApprovalRequestId,
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_SERVER_SETTINGS,
  EventId,
  MessageId,
  ProjectId,
  ThreadId,
  TurnId,
  type ClientOrchestrationCommand,
  type GitStatusResult,
  type ModelSelection,
  type NativeApi,
  type OrchestrationEvent,
  type OrchestrationMessage,
  type OrchestrationReadModel,
  type OrchestrationThread,
  type ProjectScript,
  type ProviderApprovalDecision,
  type ProviderKind,
  type ServerConfig,
  type ServerConfigStreamEvent,
  type ServerProvider,
  type ServerProviderUpdatedPayload,
  type ServerLifecycleStreamEvent,
  type ServerSettings,
  type ServerSettingsPatch,
  type ServerUpsertKeybindingInput,
  type ServerUpsertKeybindingResult,
} from "@t3tools/contracts";
import { deepMerge } from "@t3tools/shared/Struct";
import { showContextMenuFallback } from "../contextMenuFallback";
import { nextProjectScriptId } from "../projectScripts";
import { requireNexChatEmbedConfig } from "./embed-config";
import type {
  ChatActionInvocationMode,
  ChatApproval,
  ChatMessage,
  ChatEvent,
  ChatLaneAction,
  ChatLaneDetail,
  ChatLaneSummary,
  ChatReplayResult,
  ChatSnapshotResult,
  NexChatRuntimeBridge,
} from "./chat-types";

type LaneGroup = {
  projectId: ReturnType<typeof ProjectId.makeUnsafe>;
  rootLane: ChatLaneSummary;
  lanes: ChatLaneSummary[];
};

type NexOrchestrationThread = OrchestrationThread & {
  olderMessagesCursor?: string | null;
};

const EMPTY_GIT_STATUS: GitStatusResult = {
  isRepo: false,
  hasOriginRemote: false,
  isDefaultBranch: false,
  branch: null,
  hasWorkingTreeChanges: false,
  workingTree: { files: [], insertions: 0, deletions: 0 },
  hasUpstream: false,
  aheadCount: 0,
  behindCount: 0,
  pr: null,
};

const STATIC_PROVIDER_CATALOG: ReadonlyArray<ServerProvider> = [
  {
    provider: "codex",
    enabled: true,
    installed: true,
    version: "nex",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: new Date(0).toISOString(),
    models: [
      { slug: "gpt-5.5", name: "GPT-5.5", isCustom: false, capabilities: null },
      { slug: "gpt-5.4", name: "GPT-5.4", isCustom: false, capabilities: null },
      { slug: "gpt-5.4-mini", name: "GPT-5.4 Mini", isCustom: false, capabilities: null },
      { slug: "gpt-5.3-codex", name: "GPT-5.3 Codex", isCustom: false, capabilities: null },
    ],
  },
  {
    provider: "claudeAgent",
    enabled: true,
    installed: true,
    version: "nex",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: new Date(0).toISOString(),
    models: [
      { slug: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", isCustom: false, capabilities: null },
      { slug: "claude-haiku-4-5", name: "Claude Haiku 4.5", isCustom: false, capabilities: null },
      { slug: "claude-opus-4-6", name: "Claude Opus 4.6", isCustom: false, capabilities: null },
    ],
  },
];

const EMBEDDED_PROJECT_ROOT = "/Users/tyler/nexus/home/projects/nexus";
const EMBEDDED_PROJECT_NAME = "nexus";

let cachedServerSettings: ServerSettings = DEFAULT_SERVER_SETTINGS;
let lastKnownSequence = 0;
let nextServerLifecycleSequence = 1;
let cachedProviderId: string | null = null;
let cachedModelId: string | null = null;
const serverConfigListeners = new Set<(event: ServerConfigStreamEvent) => void>();
const serverLifecycleListeners = new Set<(event: ServerLifecycleStreamEvent) => void>();

function bridge(): NexChatRuntimeBridge {
  return requireNexChatEmbedConfig().bridge;
}

function currentLaneIdFromLocation(): string | null {
  if (typeof window === "undefined") {
    return requireNexChatEmbedConfig().initialLaneId?.trim() || null;
  }
  const config = requireNexChatEmbedConfig();
  const pathname = window.location.pathname;
  const basepath = config.basepath?.trim() || "";
  if (basepath && pathname.startsWith(basepath)) {
    const suffix = pathname.slice(basepath.length).replace(/^\/+/, "");
    return suffix ? decodeURIComponent(suffix) : null;
  }
  return config.initialLaneId?.trim() || null;
}

function isoFromEpoch(value: number | null | undefined): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }
  return new Date(0).toISOString();
}

function truncateActivityDetail(value: string, maxLength = 1200): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function parseToolMessagePayload(text: string): Record<string, unknown> | null {
  const candidate = text.split(/\n\nEstimated tokens:/u)[0]?.trim() ?? text.trim();
  if (!candidate) {
    return null;
  }
  try {
    const parsed = JSON.parse(candidate) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractArtifactPath(text: string): string | undefined {
  return /Artifact path:\s*"([^"]+)"/u.exec(text)?.[1];
}

function providerFromLane(providerId: string | null | undefined, modelId: string | null | undefined): ProviderKind {
  const provider = providerId?.trim().toLowerCase() ?? "";
  const model = modelId?.trim().toLowerCase() ?? "";
  if (provider.includes("claude") || model.includes("claude")) {
    return "claudeAgent";
  }
  return "codex";
}

function nexProviderIdFromSelection(provider: ProviderKind | null | undefined): string | undefined {
  switch (provider) {
    case "codex":
      return "openai";
    case "claudeAgent":
      return "anthropic";
    default:
      return undefined;
  }
}

function reasoningEffortFromSelection(selection: ModelSelection | null | undefined): string | undefined {
  return selection?.provider === "codex" ? selection.options?.reasoningEffort : undefined;
}

function modelSelectionFromLane(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): ModelSelection {
  const provider = providerFromLane(providerId, modelId);
  return {
    provider,
    model: modelId?.trim() || DEFAULT_MODEL_BY_PROVIDER[provider],
  };
}

function toProjectId(rootLaneId: string) {
  return ProjectId.makeUnsafe(`project:${rootLaneId}`);
}

function projectIdToRootLaneId(projectId: string): string | null {
  return projectId.startsWith("project:") ? projectId.slice("project:".length) : null;
}

function toThreadId(laneId: string) {
  return ThreadId.makeUnsafe(laneId);
}

function defaultMessageHistoryScopeForLane(laneId: string): "lane" | undefined {
  return laneId.startsWith("lane:agent:") ? "lane" : undefined;
}

function toTurnId(value: string | null | undefined) {
  return value ? TurnId.makeUnsafe(value) : null;
}

function toMessageId(value: string | null | undefined) {
  return value ? MessageId.makeUnsafe(value) : null;
}

function compareLaneUpdated(left: ChatLaneSummary, right: ChatLaneSummary): number {
  return right.updated_at - left.updated_at;
}

function buildLaneGroups(lanes: ReadonlyArray<ChatLaneSummary>): LaneGroup[] {
  const laneById = new Map(lanes.map((lane) => [lane.lane_id, lane] as const));
  const groups = new Map<string, LaneGroup>();

  for (const lane of lanes) {
    let root = lane;
    while (root.parent_lane_id && laneById.has(root.parent_lane_id)) {
      root = laneById.get(root.parent_lane_id)!;
    }
    const projectId = toProjectId(root.lane_id);
    const existing = groups.get(root.lane_id);
    if (existing) {
      existing.lanes.push(lane);
      continue;
    }
    groups.set(root.lane_id, {
      projectId,
      rootLane: root,
      lanes: [lane],
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      lanes: [...group.lanes].sort(compareLaneUpdated),
    }))
    .sort((left, right) => compareLaneUpdated(left.rootLane, right.rootLane));
}

function buildProjectedLaneActionEntries(
  actions: ReadonlyArray<ChatLaneAction>,
): Array<{ action: ChatLaneAction; script: ProjectScript }> {
  const usedScriptIds: string[] = [];
  return actions.map((action) => {
    const scriptId = nextProjectScriptId(action.label, usedScriptIds);
    usedScriptIds.push(scriptId);
    return {
      action,
      script: {
        id: scriptId,
        name: action.label,
        command: action.default_prompt ?? "",
        icon: action.icon,
        runOnWorktreeCreate: false,
      },
    };
  });
}

function isChatLaneActionIcon(value: unknown): value is ChatLaneAction["icon"] {
  return (
    value === "play" ||
    value === "test" ||
    value === "lint" ||
    value === "configure" ||
    value === "build" ||
    value === "debug"
  );
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function chatLaneActionFromUnknown(value: unknown): ChatLaneAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const actionId = typeof record.action_id === "string" && record.action_id.trim() ? record.action_id : null;
  const label = typeof record.label === "string" && record.label.trim() ? record.label : null;
  if (!actionId || !label) {
    return null;
  }
  const invocationMode: ChatActionInvocationMode =
    record.invocation_mode === "invoke" ? "invoke" : "prefill";
  const requiresInput =
    typeof record.requires_input === "boolean"
      ? record.requires_input
      : typeof record.requires_input === "number"
        ? record.requires_input !== 0
        : true;

  return {
    action_id: actionId,
    agent_id: nullableString(record.agent_id),
    label,
    description: nullableString(record.description),
    icon: isChatLaneActionIcon(record.icon) ? record.icon : "play",
    shortcut: nullableString(record.shortcut),
    invocation_mode: invocationMode,
    requires_input: requiresInput,
    default_prompt: nullableString(record.default_prompt),
    display_order: typeof record.display_order === "number" ? record.display_order : 0,
  };
}

function chatLaneActionsFromEvent(event: ChatEvent): ChatLaneAction[] | null {
  const actions = event.data.actions;
  if (Array.isArray(actions)) {
    return actions
      .map(chatLaneActionFromUnknown)
      .filter((action): action is ChatLaneAction => action !== null)
      .toSorted((left, right) => left.display_order - right.display_order || left.action_id.localeCompare(right.action_id));
  }
  const action = chatLaneActionFromUnknown(event.data);
  return action ? [action] : null;
}

function mapApprovalToActivity(approval: ChatApproval): OrchestrationThread["activities"][number] {
  const requestKind =
    approval.request_type === "file_read_approval"
      ? "file-read"
      : approval.request_type === "file_change_approval" || approval.request_type === "apply_patch_approval"
        ? "file-change"
        : "command";
  return {
    id: EventId.makeUnsafe(`approval:${approval.id}`),
    tone: approval.status === "pending" ? "approval" : "info",
    kind: approval.status === "pending" ? "approval.requested" : "approval.resolved",
    summary: approval.summary?.trim() || "Approval update",
    payload: {
      requestId: approval.id,
      requestKind,
      requestType: approval.request_type,
      detail: approval.summary ?? undefined,
      status: approval.status,
    },
    turnId: null,
    sequence: undefined,
    createdAt: isoFromEpoch(approval.created_at),
  };
}

function chatApprovalFromEvent(event: ChatEvent, laneId: string): ChatApproval | null {
  const id = typeof event.data.id === "string" ? event.data.id : null;
  if (!id) {
    return null;
  }
  const status =
    event.data.status === "approved" ||
    event.data.status === "denied" ||
    event.data.status === "expired"
      ? event.data.status
      : "pending";
  return {
    id,
    lane_id: typeof event.data.lane_id === "string" ? event.data.lane_id : laneId,
    request_type: typeof event.data.request_type === "string" ? event.data.request_type : null,
    status,
    summary: typeof event.data.summary === "string" ? event.data.summary : null,
    created_at: typeof event.data.created_at === "number" ? event.data.created_at : event.occurred_at,
    expires_at: typeof event.data.expires_at === "number" ? event.data.expires_at : null,
    resolved_at: typeof event.data.resolved_at === "number" ? event.data.resolved_at : null,
  };
}

function mapActivityToOrchestrationActivity(
  activity: ChatLaneDetail["activities"][number],
  index: number,
): OrchestrationThread["activities"][number] {
  const tone =
    activity.activity_type === "warning"
      ? "error"
      : activity.activity_type === "tool_call" ||
          activity.activity_type === "file_change" ||
          activity.activity_type === "web_activity"
        ? "tool"
        : activity.activity_type === "approval_request" || activity.activity_type === "approval_resolution"
          ? "approval"
          : "info";

  const kind =
    activity.activity_type === "approval_request"
      ? "approval.requested"
      : activity.activity_type === "approval_resolution"
        ? "approval.resolved"
        : `chat.${activity.activity_type}`;

  return {
    id: EventId.makeUnsafe(`activity:${activity.id}`),
    tone,
    kind,
    summary: activity.title,
    payload: {
      detail: activity.detail ?? undefined,
      status: activity.status ?? undefined,
    },
    turnId: null,
    sequence: index,
    createdAt: isoFromEpoch(activity.created_at),
  };
}

function mapToolMessageToOrchestrationActivity(
  message: ChatLaneDetail["messages"][number],
  sequence?: number,
): OrchestrationThread["activities"][number] {
  const parsed = parseToolMessagePayload(message.text);
  const status = typeof parsed?.status === "string" ? parsed.status : undefined;
  const reason = typeof parsed?.reason === "string" ? parsed.reason : undefined;
  const taskText = typeof parsed?.text === "string" ? parsed.text : undefined;
  const sessionId = typeof parsed?.session_id === "string" ? parsed.session_id : undefined;
  const runId = typeof parsed?.run_id === "string" ? parsed.run_id : undefined;
  const silentCompletion = parsed?.silent_completion === true;
  const artifactPath = extractArtifactPath(message.text);

  const summary = silentCompletion
    ? "Waiting for worker findings"
    : sessionId
      ? "Worker dispatched"
      : status === "error" || status === "failed"
        ? "Tool failed"
        : status
          ? `Tool ${status}`
          : "Tool activity";
  const detail =
    reason ??
    taskText ??
    (parsed ? JSON.stringify(parsed, null, 2) : undefined) ??
    message.text;

  return {
    id: EventId.makeUnsafe(`activity:${message.id}`),
    tone: status === "error" || status === "failed" ? "error" : silentCompletion ? "info" : "tool",
    kind: silentCompletion ? "chat.waiting" : "tool.completed",
    summary,
    payload: {
      detail: truncateActivityDetail(detail),
      rawText: truncateActivityDetail(message.text),
      status,
      sessionId,
      runId,
      artifactPath,
      toolTitle: sessionId ? "agents.dispatch" : "tool",
    },
    turnId: toTurnId(message.turn_id),
    sequence,
    createdAt: isoFromEpoch(message.created_at),
  };
}

function stripInternalAssistantMarkers(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return (
        !/^\[reasoning:[^\]]+\]$/i.test(trimmed) &&
        !/^\[tool_call:[^\]]+\]$/i.test(trimmed)
      );
    })
    .join("\n")
    .trim();
}

function visibleChatMessageText(message: ChatLaneDetail["messages"][number]): string {
  return message.role === "assistant" ? stripInternalAssistantMarkers(message.text) : message.text;
}

function isRenderableChatMessage(
  message: ChatLaneDetail["messages"][number],
): message is ChatLaneDetail["messages"][number] & { role: "user" | "assistant" | "system" } {
  if (message.role === "user" && !message.record_id && !message.client_message_id) {
    return false;
  }
  if (message.role === "assistant" && visibleChatMessageText(message).length === 0) {
    return false;
  }
  return message.role === "user" || message.role === "assistant" || message.role === "system";
}

function buildLatestTurn(detail: ChatLaneDetail | undefined) {
  const messages = detail?.messages ?? [];
  const basis = [...messages]
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant" || message.role === "tool") &&
        Boolean(message.turn_id),
    )
    .toSorted((left, right) => left.created_at - right.created_at)
    .at(-1);
  if (!basis?.turn_id) {
    return null;
  }
  const latestAssistantForTurn = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.turn_id === basis.turn_id);

  const runState = detail?.lane.run_state ?? "idle";
  const latestTurnState: "error" | "running" | "completed" =
    runState === "error"
      ? "error"
      : runState === "running" || runState === "queued" || runState === "waiting_approval"
        ? "running"
        : "completed";
  const createdAt = isoFromEpoch(basis.created_at);
  return {
    turnId: TurnId.makeUnsafe(basis.turn_id),
    state: latestTurnState,
    requestedAt: createdAt,
    startedAt: createdAt,
    completedAt: latestTurnState === "completed" ? createdAt : null,
    assistantMessageId:
      latestAssistantForTurn?.turn_id === basis.turn_id
        ? toMessageId(latestAssistantForTurn.id)
        : null,
  };
}

const STALE_ACTIVE_SUBTITLE = "Stale active state aged out";

function isStaleActiveLane(lane: ChatLaneSummary): boolean {
  return lane.run_state === "idle" && lane.subtitle === STALE_ACTIVE_SUBTITLE;
}

function mapThread(
  lane: ChatLaneSummary,
  projectId: ReturnType<typeof ProjectId.makeUnsafe>,
  detail: ChatLaneDetail | undefined,
): NexOrchestrationThread {
  const modelSelection = modelSelectionFromLane(detail?.provider_id, detail?.model_id);
  const rawMessages = detail?.messages ?? [];
  const messages = rawMessages
    .filter(isRenderableChatMessage)
    .map(mapChatMessageToOrchestrationMessage);
  const activities = [
    ...rawMessages
      .filter((message) => message.role === "tool")
      .map((message, index) => mapToolMessageToOrchestrationActivity(message, index)),
    ...(detail?.activities ?? []).map(mapActivityToOrchestrationActivity),
    ...(detail?.approvals ?? []).map(mapApprovalToActivity),
  ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  const thread: NexOrchestrationThread = {
    id: toThreadId(lane.lane_id),
    projectId,
    title: lane.title,
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: buildLatestTurn(detail),
    createdAt: isoFromEpoch(lane.updated_at),
    updatedAt: isoFromEpoch(lane.updated_at),
    archivedAt: null,
    deletedAt: null,
    messages,
    proposedPlans: [],
    activities,
    checkpoints: [],
    session: lane.session_id
      ? {
          threadId: toThreadId(lane.lane_id),
          status:
            lane.run_state === "queued"
              ? "starting"
              : lane.run_state === "running" || lane.run_state === "waiting_approval"
                ? "running"
                : lane.run_state === "error"
                  ? "error"
                  : "ready",
          providerName: modelSelection.provider,
          runtimeMode: "full-access",
          activeTurnId: buildLatestTurn(detail)?.turnId ?? null,
          lastError: lane.run_state === "error" || isStaleActiveLane(lane) ? lane.subtitle : null,
          updatedAt: isoFromEpoch(lane.updated_at),
        }
      : null,
  };
  if (detail) {
    thread.olderMessagesCursor = detail.older_messages_cursor ?? null;
  }
  return thread;
}

function mapChatMessageToOrchestrationMessage(
  message: ChatLaneDetail["messages"][number] & { role: "user" | "assistant" | "system" },
): OrchestrationMessage {
  return {
    id: MessageId.makeUnsafe(
      message.role === "user" && message.client_message_id ? message.client_message_id : message.id,
    ),
    role: message.role,
    text: visibleChatMessageText(message),
    turnId: toTurnId(message.turn_id),
    streaming: false,
    createdAt: isoFromEpoch(message.created_at),
    updatedAt: isoFromEpoch(message.created_at),
  };
}

function maxUpdatedAt(lanes: ReadonlyArray<ChatLaneSummary>): number {
  return lanes.reduce((max, lane) => Math.max(max, lane.updated_at), 0);
}

function mapSnapshotToReadModel(snapshot: ChatSnapshotResult): OrchestrationReadModel {
  const groups = buildLaneGroups(snapshot.lanes);
  const expandedLane = snapshot.expanded_lane;
  const expandedLaneActionEntries = expandedLane
    ? buildProjectedLaneActionEntries(expandedLane.actions)
    : [];

  const projects = groups.map((group) => ({
    id: group.projectId,
    title: group.rootLane.title,
    workspaceRoot: group.rootLane.agent_id ?? group.rootLane.lane_id,
    defaultModelSelection: modelSelectionFromLane(expandedLane?.provider_id, expandedLane?.model_id),
    scripts:
      expandedLane && expandedLane.lane.lane_id === group.rootLane.lane_id
        ? expandedLaneActionEntries.map((entry) => entry.script)
        : [],
    createdAt: isoFromEpoch(group.rootLane.updated_at),
    updatedAt: isoFromEpoch(group.rootLane.updated_at),
    deletedAt: null,
  }));

  const detailByLaneId = expandedLane ? { [expandedLane.lane.lane_id]: expandedLane } : {};
  const threads = groups.flatMap((group) =>
    group.lanes.map((lane) => mapThread(lane, group.projectId, detailByLaneId[lane.lane_id])),
  );

  lastKnownSequence = Math.max(lastKnownSequence, snapshot.sequence);

  return {
    snapshotSequence: snapshot.sequence,
    projects,
    threads,
    updatedAt: isoFromEpoch(maxUpdatedAt(snapshot.lanes)),
  };
}

export function resolveChatSnapshotSelectedLaneId(
  snapshot: ChatSnapshotResult,
  requestedLaneId?: string | null,
): string | null {
  const laneIds = new Set(snapshot.lanes.map((lane) => lane.lane_id));
  const requested = requestedLaneId?.trim() ?? "";
  if (requested && laneIds.has(requested)) {
    return requested;
  }
  const expandedLaneId = snapshot.expanded_lane?.lane.lane_id;
  if (expandedLaneId && laneIds.has(expandedLaneId)) {
    return expandedLaneId;
  }
  const defaultLaneId = snapshot.default_lane_id?.trim() ?? "";
  if (defaultLaneId && laneIds.has(defaultLaneId)) {
    return defaultLaneId;
  }
  return (
    snapshot.lanes.find((lane) => lane.lane_mode === "agent" && !lane.parent_lane_id)?.lane_id ??
    snapshot.lanes[0]?.lane_id ??
    null
  );
}

function buildServerProvidersFromSelection(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): ReadonlyArray<ServerProvider> {
  const activeProvider = providerFromLane(providerId, modelId);
  const activeModel = modelId?.trim();
  return STATIC_PROVIDER_CATALOG.map((provider) => {
    if (!activeModel || provider.provider !== activeProvider) {
      return provider;
    }
    if (provider.models.some((model) => model.slug === activeModel)) {
      return provider;
    }
    return {
      ...provider,
      models: [
        ...provider.models,
        {
          slug: activeModel,
          name: activeModel,
          isCustom: true,
          capabilities: null,
        },
      ],
    };
  });
}

export async function requestChatSnapshot(
  explicitLaneId?: string | null,
  options?: Partial<{
    include_conversation_context: boolean;
    include_child_lanes: boolean;
    message_history_scope: "session" | "lane";
    message_limit: number;
    before_message_cursor: string;
    approval_limit: number;
    record_limit: number;
  }>,
): Promise<ChatSnapshotResult> {
  const laneId = explicitLaneId ?? currentLaneIdFromLocation();
  const requestedMessageLimit =
    typeof options?.message_limit === "number" ? Math.max(1, Math.trunc(options.message_limit)) : undefined;
  const requestedApprovalLimit =
    typeof options?.approval_limit === "number" ? Math.max(1, Math.trunc(options.approval_limit)) : undefined;
  const snapshot = await bridge().request<ChatSnapshotResult>("chat.snapshot", {
    ...(laneId ? { lane_id: laneId } : {}),
    ...(options?.include_conversation_context ? { include_conversation_context: true } : {}),
    ...(options?.include_child_lanes ? { include_child_lanes: true } : {}),
    ...(options?.message_history_scope ? { message_history_scope: options.message_history_scope } : {}),
    ...(typeof requestedMessageLimit === "number" ? { message_limit: requestedMessageLimit } : {}),
    ...(options?.before_message_cursor ? { before_message_cursor: options.before_message_cursor } : {}),
    ...(typeof requestedApprovalLimit === "number" ? { approval_limit: requestedApprovalLimit } : {}),
    ...(typeof options?.record_limit === "number" ? { record_limit: options.record_limit } : {}),
  });
  lastKnownSequence = Math.max(lastKnownSequence, snapshot.sequence);
  cachedProviderId = snapshot.expanded_lane?.provider_id ?? cachedProviderId;
  cachedModelId = snapshot.expanded_lane?.model_id ?? cachedModelId;
  return snapshot;
}

export async function requestLaneContextDetail(
  laneId: string,
  options?: Partial<{
    include_conversation_context: boolean;
    include_child_lanes: boolean;
    message_history_scope: "session" | "lane";
    message_limit: number;
    before_message_cursor: string;
    approval_limit: number;
    record_limit: number;
  }>,
): Promise<ChatLaneDetail | null> {
  const snapshot = await requestChatSnapshot(laneId, options);
  if (!snapshot.expanded_lane || snapshot.expanded_lane.lane.lane_id !== laneId) {
    return null;
  }
  return snapshot.expanded_lane;
}

export async function requestServerConfig(): Promise<ServerConfig> {
  const providers = buildServerProvidersFromSelection(cachedProviderId, cachedModelId);
  return {
    cwd: EMBEDDED_PROJECT_ROOT,
    keybindingsConfigPath: `${EMBEDDED_PROJECT_ROOT}/.nex-operator-chat-keybindings.json`,
    keybindings: [],
    issues: [],
    providers,
    availableEditors: [],
    observability: {
      logsDirectoryPath: "/Users/tyler/nexus/state/logs",
      localTracingEnabled: false,
      otlpTracesEnabled: false,
      otlpMetricsEnabled: false,
    },
    settings: cachedServerSettings,
  };
}

function emitServerConfigEvent(event: ServerConfigStreamEvent): void {
  for (const listener of serverConfigListeners) {
    listener(event);
  }
}

function emitServerLifecycleEvent(event: ServerLifecycleStreamEvent): void {
  for (const listener of serverLifecycleListeners) {
    listener(event);
  }
}

export function subscribeToServerConfig(
  listener: (event: ServerConfigStreamEvent) => void,
  options?: { onResubscribe?: () => void },
): () => void {
  serverConfigListeners.add(listener);
  options?.onResubscribe?.();

  let disposed = false;
  void requestServerConfig()
    .then((config) => {
      if (disposed) {
        return;
      }
      listener({
        version: 1,
        type: "snapshot",
        config,
      });
    })
    .catch(() => undefined);

  return () => {
    disposed = true;
    serverConfigListeners.delete(listener);
  };
}

export function subscribeToServerLifecycle(
  listener: (event: ServerLifecycleStreamEvent) => void,
  options?: { onResubscribe?: () => void },
): () => void {
  serverLifecycleListeners.add(listener);
  options?.onResubscribe?.();

  const welcomeSequence = nextServerLifecycleSequence++;
  const readySequence = nextServerLifecycleSequence++;

  listener({
    version: 1,
    sequence: welcomeSequence,
    type: "welcome",
    payload: {
      cwd: EMBEDDED_PROJECT_ROOT,
      projectName: EMBEDDED_PROJECT_NAME,
    },
  });
  listener({
    version: 1,
    sequence: readySequence,
    type: "ready",
    payload: {
      at: new Date().toISOString(),
    },
  });

  return () => {
    serverLifecycleListeners.delete(listener);
  };
}

export async function requestOrchestrationReadModel(): Promise<OrchestrationReadModel> {
  return mapSnapshotToReadModel(await requestChatSnapshot());
}

export async function requestOrchestrationBootstrapReadModel(
  requestedLaneId?: string | null,
): Promise<{ readModel: OrchestrationReadModel; selectedLaneId: string | null }> {
  const laneId = requestedLaneId?.trim() ?? "";
  const messageHistoryScope = laneId ? defaultMessageHistoryScopeForLane(laneId) : undefined;
  const snapshot = await requestChatSnapshot(laneId || null, {
    ...(messageHistoryScope ? { message_history_scope: messageHistoryScope } : {}),
  });
  return {
    readModel: mapSnapshotToReadModel(snapshot),
    selectedLaneId: resolveChatSnapshotSelectedLaneId(snapshot, laneId),
  };
}

export async function requestOrchestrationReadModelForLane(
  laneId: string,
  options?: Partial<{
    include_child_lanes: boolean;
    message_history_scope: "session" | "lane";
  }>,
): Promise<OrchestrationReadModel> {
  const messageHistoryScope =
    options?.message_history_scope ?? defaultMessageHistoryScopeForLane(laneId);
  return mapSnapshotToReadModel(
    await requestChatSnapshot(laneId, {
      ...options,
      ...(messageHistoryScope ? { message_history_scope: messageHistoryScope } : {}),
    }),
  );
}

export async function requestOlderThreadMessages(
  laneId: string,
  beforeMessageCursor: string,
  options?: {
    message_limit?: number;
  },
): Promise<{
  sequence: number;
  threadId: ThreadId;
  messages: OrchestrationMessage[];
  olderMessagesCursor: string | null;
}> {
  const messageHistoryScope = defaultMessageHistoryScopeForLane(laneId);
  const snapshot = await requestChatSnapshot(laneId, {
    message_limit: options?.message_limit ?? 25,
    before_message_cursor: beforeMessageCursor,
    ...(messageHistoryScope ? { message_history_scope: messageHistoryScope } : {}),
  });
  const detail = snapshot.expanded_lane;
  if (!detail || detail.lane.lane_id !== laneId) {
    throw new Error("Nex chat did not return the requested lane history page.");
  }
  return {
    sequence: snapshot.sequence,
    threadId: toThreadId(laneId),
    messages: detail.messages.filter(isRenderableChatMessage).map(mapChatMessageToOrchestrationMessage),
    olderMessagesCursor: detail.older_messages_cursor ?? null,
  };
}

export async function requestOrchestrationReplay(
  fromSequenceExclusive: number,
): Promise<OrchestrationEvent[]> {
  const replay = await bridge().request<ChatReplayResult>("chat.replay", {
    after_sequence: fromSequenceExclusive,
  });
  if (replay.reset_required) {
    return [];
  }
  lastKnownSequence = Math.max(lastKnownSequence, replay.latest_sequence);
  return replay.events.flatMap(mapChatEventToOrchestrationEvents);
}

export function subscribeToOrchestrationEvents(
  callback: (event: OrchestrationEvent) => void,
  options?: {
    onResubscribe?: () => void;
  },
): () => void {
  return bridge().subscribe((event) => {
    if (event.event !== "chat") {
      return;
    }
    lastKnownSequence = Math.max(lastKnownSequence, event.payload.sequence);
    for (const orchestrationEvent of mapChatEventToOrchestrationEvents(event.payload)) {
      callback(orchestrationEvent);
    }
  });
}

function mapRunStateToSessionStatus(
  runState: unknown,
): "idle" | "starting" | "running" | "ready" | "interrupted" | "stopped" | "error" {
  switch (runState) {
    case "queued":
      return "starting";
    case "running":
    case "waiting_approval":
      return "running";
    case "error":
      return "error";
    case "idle":
    default:
      return "ready";
  }
}

function mapChatMessageRole(role: unknown): "user" | "assistant" | "system" {
  if (role === "user" || role === "assistant" || role === "system") {
    return role;
  }
  return "assistant";
}

function chatMessageFromEvent(event: ChatEvent, laneId: string): ChatMessage {
  const clientMessageId =
    typeof event.data.client_message_id === "string" ? event.data.client_message_id : undefined;
  return {
    id: typeof event.data.id === "string" ? event.data.id : `message:${event.sequence}`,
    lane_id: typeof event.data.lane_id === "string" ? event.data.lane_id : laneId,
    session_id: typeof event.data.session_id === "string" ? event.data.session_id : null,
    turn_id: typeof event.data.turn_id === "string" ? event.data.turn_id : null,
    record_id: typeof event.data.record_id === "string" ? event.data.record_id : null,
    ...(clientMessageId ? { client_message_id: clientMessageId } : {}),
    role:
      event.data.role === "user" ||
      event.data.role === "assistant" ||
      event.data.role === "system" ||
      event.data.role === "tool"
        ? event.data.role
        : "assistant",
    text: typeof event.data.text === "string" ? event.data.text : "",
    created_at: typeof event.data.created_at === "number" ? event.data.created_at : event.occurred_at,
  };
}

function buildOrchestrationEventBase(event: ChatEvent, laneId: string) {
  const occurredAt = isoFromEpoch(event.occurred_at);
  return {
    sequence: event.sequence,
    eventId: EventId.makeUnsafe(`chat:${event.sequence}`),
    aggregateKind: "thread" as const,
    aggregateId: toThreadId(laneId),
    occurredAt,
    commandId: null,
    causationEventId: null,
    correlationId: null,
    metadata: {},
  };
}

function mapChatEventToOrchestrationEvents(event: ChatEvent): OrchestrationEvent[] {
  const laneId = event.lane_id ?? "lane:unknown";
  const occurredAt = isoFromEpoch(event.occurred_at);
  const base = buildOrchestrationEventBase(event, laneId);

  if (event.event_name === "message.appended" || event.event_name === "message.updated") {
    if (event.data.role === "tool") {
      return [
        {
          ...base,
          type: "thread.activity-appended",
          payload: {
            threadId: toThreadId(laneId),
            activity: mapToolMessageToOrchestrationActivity(
              chatMessageFromEvent(event, laneId),
              event.sequence,
            ),
          },
        } as OrchestrationEvent,
      ];
    }
    const message = chatMessageFromEvent(event, laneId);
    if (!isRenderableChatMessage(message)) {
      return [];
    }
    const createdAt = isoFromEpoch(
      typeof event.data.created_at === "number" ? event.data.created_at : event.occurred_at,
    );
    return [
      {
        ...base,
        type: "thread.message-sent",
        payload: {
          threadId: toThreadId(laneId),
          messageId: MessageId.makeUnsafe(
            message.role === "user" && message.client_message_id ? message.client_message_id : message.id,
          ),
          role: mapChatMessageRole(message.role),
          text: visibleChatMessageText(message),
          turnId: message.turn_id ? TurnId.makeUnsafe(message.turn_id) : null,
          streaming: false,
          createdAt,
          updatedAt: occurredAt,
        },
      } as OrchestrationEvent,
    ];
  }

  if (event.event_name === "lane.state-changed" || event.event_name === "lane.upserted") {
    const events: OrchestrationEvent[] = [
      {
        ...base,
        type: "thread.session-set",
        payload: {
          threadId: toThreadId(laneId),
          session: {
            threadId: toThreadId(laneId),
            status: mapRunStateToSessionStatus(event.data.run_state),
            providerName: providerFromLane(cachedProviderId, cachedModelId),
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: typeof event.data.subtitle === "string" ? event.data.subtitle : null,
            updatedAt: occurredAt,
          },
        },
      } as OrchestrationEvent,
    ];

    if (typeof event.data.title === "string" && event.data.title.trim().length > 0) {
      events.push({
        ...base,
        eventId: EventId.makeUnsafe(`chat:${event.sequence}:meta`),
        type: "thread.meta-updated",
        payload: {
          threadId: toThreadId(laneId),
          title: event.data.title,
          updatedAt: occurredAt,
        },
      } as OrchestrationEvent);
    }

    return events;
  }

  if (event.event_name === "action.upserted" || event.event_name === "action.removed") {
    const actions = chatLaneActionsFromEvent(event);
    if (!actions) {
      return [];
    }
    const rootLaneId = typeof event.data.root_lane_id === "string" ? event.data.root_lane_id : laneId;
    const projectId = toProjectId(rootLaneId);
    return [
      {
        ...base,
        aggregateKind: "project",
        aggregateId: projectId,
        type: "project.meta-updated",
        payload: {
          projectId,
          scripts: buildProjectedLaneActionEntries(actions).map((entry) => entry.script),
          updatedAt: occurredAt,
        },
      } as OrchestrationEvent,
    ];
  }

  if (event.event_name === "approval.upserted" || event.event_name === "approval.resolved") {
    const approval = chatApprovalFromEvent(event, laneId);
    if (!approval) {
      return [];
    }
    return [
      {
        ...base,
        type: "thread.activity-appended",
        payload: {
          threadId: toThreadId(laneId),
          activity: {
            ...mapApprovalToActivity(approval),
            sequence: event.sequence,
            createdAt:
              event.event_name === "approval.resolved" ? occurredAt : isoFromEpoch(approval.created_at),
          },
        },
      } as OrchestrationEvent,
    ];
  }

  return [
    {
      ...base,
      type: "thread.meta-updated",
      payload: {
        threadId: toThreadId(laneId),
        ...(typeof event.data.title === "string" ? { title: event.data.title } : {}),
        updatedAt: occurredAt,
      },
    } as OrchestrationEvent,
  ];
}

async function syncLaneActionsForProject(
  projectId: string,
  nextScripts: ReadonlyArray<ProjectScript>,
): Promise<number> {
  const rootLaneId = projectIdToRootLaneId(projectId);
  if (!rootLaneId) {
    return lastKnownSequence;
  }
  const snapshot = await requestChatSnapshot(rootLaneId, {
    message_limit: 1,
    approval_limit: 1,
  });
  const currentActions = snapshot.expanded_lane?.actions ?? [];
  const projectedActionEntries = buildProjectedLaneActionEntries(currentActions);
  const currentById = new Map(projectedActionEntries.map((entry) => [entry.script.id, entry.action] as const));
  const nextById = new Map(nextScripts.map((script) => [script.id, script] as const));

  for (const entry of projectedActionEntries) {
    if (!nextById.has(entry.script.id)) {
      await bridge().request("chat.actions.delete", {
        lane_id: rootLaneId,
        action_id: entry.action.action_id,
      });
    }
  }

  for (const script of nextScripts) {
    const existing = currentById.get(script.id);
    if (!existing) {
      await bridge().request("chat.actions.create", {
        lane_id: rootLaneId,
        label: script.name,
        default_prompt: script.command,
        icon: script.icon,
        shortcut: null,
        invocation_mode: "invoke",
        requires_input: false,
      });
      continue;
    }

    if (
      existing.label === script.name &&
      (existing.default_prompt ?? "") === script.command &&
      existing.icon === script.icon
    ) {
      continue;
    }

    await bridge().request("chat.actions.update", {
      lane_id: rootLaneId,
      action_id: existing.action_id,
      label: script.name,
      default_prompt: script.command,
      icon: script.icon,
      shortcut: null,
    });
  }

  const refreshed = await requestChatSnapshot(rootLaneId, {
    message_limit: 1,
    approval_limit: 1,
  });
  return refreshed.sequence;
}

function toApprovalDecision(decision: ProviderApprovalDecision): "approve" | "deny" {
  return decision === "decline" || decision === "cancel" ? "deny" : "approve";
}

export async function dispatchNexOrchestrationCommand(
  command: ClientOrchestrationCommand,
): Promise<{ sequence: number }> {
  switch (command.type) {
    case "thread.turn.start": {
      const selectedModel = command.modelSelection?.model?.trim();
      const selectedProvider = nexProviderIdFromSelection(command.modelSelection?.provider);
      const thinking = reasoningEffortFromSelection(command.modelSelection);
      const result = await bridge().request<{ request_id?: string }>("chat.send", {
        lane_id: command.threadId,
        message: command.message.text,
        idempotency_key: command.commandId,
        client_message_id: command.message.messageId,
        ...(selectedModel ? { model_id: selectedModel } : {}),
        ...(selectedProvider ? { provider_id: selectedProvider } : {}),
        ...(thinking ? { thinking } : {}),
      });
      return {
        sequence: lastKnownSequence,
      };
    }
    case "thread.turn.interrupt": {
      await bridge().request("chat.abort", { lane_id: command.threadId });
      return { sequence: lastKnownSequence };
    }
    case "thread.approval.respond": {
      await bridge().request("chat.approvals.respond", {
        lane_id: command.threadId,
        approval_id: command.requestId,
        decision: toApprovalDecision(command.decision),
      });
      return { sequence: lastKnownSequence };
    }
    case "project.meta.update": {
      const sequence = command.scripts
        ? await syncLaneActionsForProject(command.projectId, command.scripts)
        : lastKnownSequence;
      return { sequence };
    }
    case "thread.meta.update":
    case "thread.runtime-mode.set":
    case "thread.interaction-mode.set":
      return { sequence: lastKnownSequence };
    default:
      throw new Error(`Unsupported orchestration command in Nex embed: ${command.type}`);
  }
}

export async function invokeLaneAction(laneId: string, actionId: string): Promise<void> {
  await bridge().request("chat.actions.invoke", {
    lane_id: laneId,
    action_id: actionId,
  });
}

export async function selectLaneDeliveryTarget(laneId: string, targetId: string): Promise<void> {
  await bridge().request("chat.delivery.select", {
    lane_id: laneId,
    target_id: targetId,
  });
}

export function createSafeGitApi(): NativeApi["git"] {
  return {
    pull: async () => ({ status: "noop" } as never),
    refreshStatus: async () => EMPTY_GIT_STATUS,
    onStatus: (_input, callback) => {
      callback(EMPTY_GIT_STATUS);
      return () => {};
    },
    listBranches: async () => ({
      branches: [],
      isRepo: false,
      hasOriginRemote: false,
      nextCursor: null,
      totalCount: 0,
    }),
    createWorktree: async () => {
      throw new Error("Git worktree controls are disabled in the Nex chat fork.");
    },
    removeWorktree: async () => {
      throw new Error("Git worktree controls are disabled in the Nex chat fork.");
    },
    createBranch: async () => {
      throw new Error("Git branch controls are disabled in the Nex chat fork.");
    },
    checkout: async () => {
      throw new Error("Git checkout controls are disabled in the Nex chat fork.");
    },
    init: async () => {
      throw new Error("Git init is disabled in the Nex chat fork.");
    },
    resolvePullRequest: async () => {
      throw new Error("Pull request helpers are disabled in the Nex chat fork.");
    },
    preparePullRequestThread: async () => {
      throw new Error("Pull request helpers are disabled in the Nex chat fork.");
    },
  };
}

export async function updateServerSettings(
  patch: ServerSettingsPatch,
): Promise<ServerSettings> {
  cachedServerSettings = deepMerge(cachedServerSettings, patch);
  emitServerConfigEvent({
    version: 1,
    type: "settingsUpdated",
    payload: {
      settings: cachedServerSettings,
    },
  });
  return cachedServerSettings;
}

export function upsertKeybinding(
  _input: ServerUpsertKeybindingInput,
): Promise<ServerUpsertKeybindingResult> {
  const result = {
    keybindings: [],
    issues: [],
  };
  emitServerConfigEvent({
    version: 1,
    type: "keybindingsUpdated",
    payload: {
      issues: result.issues,
    },
  });
  return Promise.resolve(result);
}

export async function refreshProviders(): Promise<ServerProviderUpdatedPayload> {
  const config = await requestServerConfig();
  const payload = {
    providers: config.providers,
  };
  emitServerConfigEvent({
    version: 1,
    type: "providerStatuses",
    payload,
  });
  return payload;
}

export function showContextMenu<T extends string>(
  items: readonly { id: T; label: string; destructive?: boolean; disabled?: boolean }[],
  position?: { x: number; y: number },
): Promise<T | null> {
  return showContextMenuFallback(items, position);
}
