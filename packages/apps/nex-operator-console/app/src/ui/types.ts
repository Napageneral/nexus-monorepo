export type ChannelsStatusSnapshot = {
  ts: number;
  channelOrder: string[];
  channelLabels: Record<string, string>;
  channelDetailLabels?: Record<string, string>;
  channelSystemImages?: Record<string, string>;
  channelMeta?: ChannelUiMetaEntry[];
  channels: Record<string, unknown>;
  channelAccounts: Record<string, ChannelAccountSnapshot[]>;
  channelDefaultAccountId: Record<string, string>;
};

export type ChannelUiMetaEntry = {
  id: string;
  label: string;
  detailLabel: string;
  systemImage?: string;
};

export const CRON_CHANNEL_LAST = "last";

export type ChannelAccountSnapshot = {
  accountId: string;
  name?: string | null;
  enabled?: boolean | null;
  configured?: boolean | null;
  linked?: boolean | null;
  running?: boolean | null;
  connected?: boolean | null;
  reconnectAttempts?: number | null;
  lastConnectedAt?: number | null;
  lastError?: string | null;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  lastProbeAt?: number | null;
  mode?: string | null;
  dmPolicy?: string | null;
  allowFrom?: string[] | null;
  tokenSource?: string | null;
  botTokenSource?: string | null;
  appTokenSource?: string | null;
  credentialSource?: string | null;
  audienceType?: string | null;
  audience?: string | null;
  webhookPath?: string | null;
  webhookUrl?: string | null;
  baseUrl?: string | null;
  allowUnmentionedGroups?: boolean | null;
  cliPath?: string | null;
  dbPath?: string | null;
  port?: number | null;
  probe?: unknown;
  audit?: unknown;
  application?: unknown;
};

export type WhatsAppSelf = {
  e164?: string | null;
  jid?: string | null;
};

export type WhatsAppDisconnect = {
  at: number;
  status?: number | null;
  error?: string | null;
  loggedOut?: boolean | null;
};

export type WhatsAppStatus = {
  configured: boolean;
  linked: boolean;
  authAgeMs?: number | null;
  self?: WhatsAppSelf | null;
  running: boolean;
  connected: boolean;
  lastConnectedAt?: number | null;
  lastDisconnect?: WhatsAppDisconnect | null;
  reconnectAttempts: number;
  lastMessageAt?: number | null;
  lastEventAt?: number | null;
  lastError?: string | null;
};

export type TelegramBot = {
  id?: number | null;
  username?: string | null;
};

export type TelegramWebhook = {
  url?: string | null;
  hasCustomCert?: boolean | null;
};

export type TelegramProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  bot?: TelegramBot | null;
  webhook?: TelegramWebhook | null;
};

export type TelegramStatus = {
  configured: boolean;
  tokenSource?: string | null;
  running: boolean;
  mode?: string | null;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: TelegramProbe | null;
  lastProbeAt?: number | null;
};

export type DiscordBot = {
  id?: string | null;
  username?: string | null;
};

export type DiscordProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  bot?: DiscordBot | null;
};

export type DiscordStatus = {
  configured: boolean;
  tokenSource?: string | null;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: DiscordProbe | null;
  lastProbeAt?: number | null;
};

export type GoogleChatProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
};

export type GoogleChatStatus = {
  configured: boolean;
  credentialSource?: string | null;
  audienceType?: string | null;
  audience?: string | null;
  webhookPath?: string | null;
  webhookUrl?: string | null;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: GoogleChatProbe | null;
  lastProbeAt?: number | null;
};

export type SlackBot = {
  id?: string | null;
  name?: string | null;
};

export type SlackTeam = {
  id?: string | null;
  name?: string | null;
};

export type SlackProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  bot?: SlackBot | null;
  team?: SlackTeam | null;
};

export type SlackStatus = {
  configured: boolean;
  botTokenSource?: string | null;
  appTokenSource?: string | null;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: SlackProbe | null;
  lastProbeAt?: number | null;
};

export type SignalProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  version?: string | null;
};

export type SignalStatus = {
  configured: boolean;
  baseUrl: string;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: SignalProbe | null;
  lastProbeAt?: number | null;
};

export type IMessageProbe = {
  ok: boolean;
  error?: string | null;
};

export type IMessageStatus = {
  configured: boolean;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  cliPath?: string | null;
  dbPath?: string | null;
  probe?: IMessageProbe | null;
  lastProbeAt?: number | null;
};

export type NostrProfile = {
  name?: string | null;
  displayName?: string | null;
  about?: string | null;
  picture?: string | null;
  banner?: string | null;
  website?: string | null;
  nip05?: string | null;
  lud16?: string | null;
};

export type NostrStatus = {
  configured: boolean;
  publicKey?: string | null;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  profile?: NostrProfile | null;
};

export type MSTeamsProbe = {
  ok: boolean;
  error?: string | null;
  appId?: string | null;
};

export type MSTeamsStatus = {
  configured: boolean;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  port?: number | null;
  probe?: MSTeamsProbe | null;
  lastProbeAt?: number | null;
};

export type ConfigSnapshotIssue = {
  path: string;
  message: string;
};

export type ConfigSnapshot = {
  path?: string | null;
  exists?: boolean | null;
  raw?: string | null;
  hash?: string | null;
  parsed?: unknown;
  valid?: boolean | null;
  config?: Record<string, unknown> | null;
  issues?: ConfigSnapshotIssue[] | null;
  warnings?: Array<{ message: string; path?: string }>;
  legacyIssues?: Array<{ message: string; path?: string }>;
};

export type ConfigUiHint = {
  label?: string;
  help?: string;
  group?: string;
  order?: number;
  advanced?: boolean;
  sensitive?: boolean;
  placeholder?: string;
  itemTemplate?: unknown;
};

export type ConfigUiHints = Record<string, ConfigUiHint>;

export type ConfigSchemaResponse = {
  schema: unknown;
  uiHints: ConfigUiHints;
  version: string;
  generatedAt: string;
};

export type PresenceEntry = {
  instanceId?: string | null;
  host?: string | null;
  ip?: string | null;
  version?: string | null;
  platform?: string | null;
  deviceFamily?: string | null;
  modelIdentifier?: string | null;
  roles?: string[] | null;
  scopes?: string[] | null;
  mode?: string | null;
  lastInputSeconds?: number | null;
  reason?: string | null;
  text?: string | null;
  ts?: number | null;
  tags?: string[];
  deviceId?: string;
};

export type RuntimeSessionsDefaults = {
  model: string | null;
  contextTokens: number | null;
};

export type RuntimeAgentRow = {
  id: string;
  name?: string;
  identity?: {
    name?: string;
    theme?: string;
    emoji?: string;
    avatar?: string;
    avatarUrl?: string;
  };
};

export type AgentsListResult = {
  defaultId: string;
  mainKey: string;
  scope: string;
  agents: RuntimeAgentRow[];
};

export type AgentIdentityResult = {
  agentId: string;
  name: string;
  avatar: string;
  emoji?: string;
};

export type AgentFileEntry = {
  name: string;
  path: string;
  missing: boolean;
  size?: number;
  updatedAtMs?: number;
  content?: string;
};

export type AgentsFilesListResult = {
  agentId: string;
  workspace: string;
  files: AgentFileEntry[];
};

export type AgentsFilesGetResult = {
  agentId: string;
  workspace: string;
  file: AgentFileEntry;
};

export type AgentsFilesSetResult = {
  ok: true;
  agentId: string;
  workspace: string;
  file: AgentFileEntry;
};

export type RuntimeSessionRow = {
  key: string;
  kind: "direct" | "group" | "global" | "unknown";
  conversationId?: string;
  label?: string;
  displayName?: string;
  surface?: string; // deprecated — use platform
  subject?: string;
  room?: string; // deprecated — use groupChannel
  space?: string;
  updatedAt: number | null;
  sessionId?: string;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  elevatedLevel?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  model?: string;
  modelProvider?: string;
  contextTokens?: number;
  agentId?: string;
  derivedTitle?: string;
  lastMessagePreview?: string;
  platform?: string;
  groupChannel?: string;
  chatType?: string;
  sendPolicy?: string;
  lastPlatform?: string;
  lastTo?: string;
  lastAccountId?: string;
  lastThreadId?: string;
};

export type SessionsListResult = {
  ts: number;
  path: string;
  count: number;
  defaults: RuntimeSessionsDefaults;
  sessions: RuntimeSessionRow[];
};

export type RuntimeConversationRow = {
  id: string;
  kind: "direct" | "group";
  local_entity_id: string; // deprecated — use observed_/canonical_ variants
  remote_entity_id?: string | null; // deprecated — use observed_/canonical_ variants
  observed_local_entity_id?: string;
  canonical_local_entity_id?: string;
  observed_remote_entity_id?: string;
  canonical_remote_entity_id?: string;
  platform?: string | null;
  container_id?: string | null;
  created_at: number;
  updated_at: number;
  record_count: number;
  status: string;
};

export type ConversationsListResult = {
  conversations: RuntimeConversationRow[];
};

export type SessionsPatchResult = {
  ok: true;
  path: string;
  key: string;
  entry: {
    sessionId: string;
    updatedAt?: number;
    thinkingLevel?: string;
    verboseLevel?: string;
    reasoningLevel?: string;
    elevatedLevel?: string;
  };
};

export type SessionsUsageEntry = {
  key: string;
  label?: string;
  sessionId?: string;
  updatedAt?: number;
  agentId?: string;
  channel?: string;
  chatType?: string;
  origin?: {
    label?: string;
    provider?: string;
    surface?: string;
    chatType?: string;
    from?: string;
    to?: string;
    accountId?: string;
    threadId?: string | number;
  };
  modelOverride?: string;
  providerOverride?: string;
  modelProvider?: string;
  model?: string;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    totalCost: number;
    inputCost?: number;
    outputCost?: number;
    cacheReadCost?: number;
    cacheWriteCost?: number;
    missingCostEntries: number;
    firstActivity?: number;
    lastActivity?: number;
    durationMs?: number;
    activityDates?: string[]; // YYYY-MM-DD dates when session had activity
    dailyBreakdown?: Array<{ date: string; tokens: number; cost: number }>;
    dailyMessageCounts?: Array<{
      date: string;
      total: number;
      user: number;
      assistant: number;
      toolCalls: number;
      toolResults: number;
      errors: number;
    }>;
    dailyLatency?: Array<{
      date: string;
      count: number;
      avgMs: number;
      p95Ms: number;
      minMs: number;
      maxMs: number;
    }>;
    dailyModelUsage?: Array<{
      date: string;
      provider?: string;
      model?: string;
      tokens: number;
      cost: number;
      count: number;
    }>;
    messageCounts?: {
      total: number;
      user: number;
      assistant: number;
      toolCalls: number;
      toolResults: number;
      errors: number;
    };
    toolUsage?: {
      totalCalls: number;
      uniqueTools: number;
      tools: Array<{ name: string; count: number }>;
    };
    modelUsage?: Array<{
      provider?: string;
      model?: string;
      count: number;
      totals: SessionsUsageTotals;
    }>;
    latency?: {
      count: number;
      avgMs: number;
      p95Ms: number;
      minMs: number;
      maxMs: number;
    };
  } | null;
  contextWeight?: {
    systemPrompt: { chars: number; projectContextChars: number; nonProjectContextChars: number };
    skills: { promptChars: number; entries: Array<{ name: string; blockChars: number }> };
    tools: {
      listChars: number;
      schemaChars: number;
      entries: Array<{ name: string; summaryChars: number; schemaChars: number }>;
    };
    injectedWorkspaceFiles: Array<{
      name: string;
      path: string;
      rawChars: number;
      injectedChars: number;
      truncated: boolean;
    }>;
  } | null;
};

export type SessionsUsageTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  missingCostEntries: number;
};

export type SessionsUsageResult = {
  updatedAt: number;
  startDate: string;
  endDate: string;
  sessions: SessionsUsageEntry[];
  totals: SessionsUsageTotals;
  aggregates: {
    messages: {
      total: number;
      user: number;
      assistant: number;
      toolCalls: number;
      toolResults: number;
      errors: number;
    };
    tools: {
      totalCalls: number;
      uniqueTools: number;
      tools: Array<{ name: string; count: number }>;
    };
    byModel: Array<{
      provider?: string;
      model?: string;
      count: number;
      totals: SessionsUsageTotals;
    }>;
    byProvider: Array<{
      provider?: string;
      model?: string;
      count: number;
      totals: SessionsUsageTotals;
    }>;
    byAgent: Array<{ agentId: string; totals: SessionsUsageTotals }>;
    byChannel: Array<{ channel: string; totals: SessionsUsageTotals }>;
    latency?: {
      count: number;
      avgMs: number;
      p95Ms: number;
      minMs: number;
      maxMs: number;
    };
    dailyLatency?: Array<{
      date: string;
      count: number;
      avgMs: number;
      p95Ms: number;
      minMs: number;
      maxMs: number;
    }>;
    modelDaily?: Array<{
      date: string;
      provider?: string;
      model?: string;
      tokens: number;
      cost: number;
      count: number;
    }>;
    daily: Array<{
      date: string;
      tokens: number;
      cost: number;
      messages: number;
      toolCalls: number;
      errors: number;
    }>;
  };
};

export type CostUsageDailyEntry = SessionsUsageTotals & { date: string };

export type CostUsageSummary = {
  updatedAt: number;
  days: number;
  daily: CostUsageDailyEntry[];
  totals: SessionsUsageTotals;
};

export type SessionUsageTimePoint = {
  timestamp: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
  cumulativeTokens: number;
  cumulativeCost: number;
};

export type SessionUsageTimeSeries = {
  sessionId?: string;
  points: SessionUsageTimePoint[];
};

export type JobDefinition = {
  id: string;
  name: string;
  description: string | null;
  script_path: string;
  script_hash: string | null;
  config_json: string | null;
  status: string;
  version: number;
  previous_version_id: string | null;
  timeout_ms: number | null;
  workspace_id: string | null;
  hook_points: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleJob = {
  id: string;
  name: string | null;
  job_definition_id: string;
  job_name?: string | null;
  job_description?: string | null;
  expression: string;
  timezone: string | null;
  active_from: string | null;
  active_until: string | null;
  enabled: boolean | number; // runtime returns 0 | 1 from SQLite; accept both
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleStatus = {
  enabled: boolean;
  jobs: number;
  nextWakeAtMs?: number | null;
};

export type ScheduleRunLogEntry = {
  id: string;
  job_definition_id: string;
  job_schedule_id: string | null;
  dag_run_id: string | null;
  dag_node_id: string | null;
  status: string;
  trigger_source: string | null;
  execution_envelope_json: string | null;
  input_json: string | null;
  output_json: string | null;
  error: string | null;
  turn_ids: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  metrics_json: string | null;
  created_at: string;
};

export type SkillsStatusConfigCheck = {
  path: string;
  value: unknown;
  satisfied: boolean;
};

export type SkillInstallOption = {
  id: string;
  kind: "brew" | "node" | "go" | "uv" | "download";
  label: string;
  bins: string[];
};

export type SkillStatusEntry = {
  name: string;
  description: string;
  source: string;
  filePath: string;
  baseDir: string;
  skillKey: string;
  bundled?: boolean;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  requirements: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  missing: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  configChecks: SkillsStatusConfigCheck[];
  install: SkillInstallOption[];
};

export type SkillStatusReport = {
  workspaceDir: string;
  managedSkillsDir: string;
  skills: SkillStatusEntry[];
};

export type StatusSummary = Record<string, unknown>;

export type HealthSnapshot = Record<string, unknown>;

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type LogEntry = {
  raw: string;
  time?: string | null;
  level?: LogLevel | null;
  subsystem?: string | null;
  message?: string | null;
  meta?: Record<string, unknown> | null;
};

export type MemoryReviewRun = {
  id: string;
  platform: string | null;
  from_time: number | null;
  from_time_iso: string | null;
  to_time: number | null;
  to_time_iso: string | null;
  total_episodes: number;
  status: string;
  started_at: number | null;
  started_at_iso: string | null;
  completed_at: number | null;
  completed_at_iso: string | null;
  created_at: number | null;
  created_at_iso: string | null;
  counts: {
    pending: number;
    in_progress: number;
    completed: number;
    failed: number;
  };
  facts_created: number;
  entities_created: number;
};

export type MemoryReviewEpisode = {
  id: string;
  run_id: string;
  platform: string | null;
  thread_id: string | null;
  event_count: number;
  token_estimate: number;
  status: string;
  facts_created: number;
  entities_created: number;
  started_at: number | null;
  started_at_iso: string | null;
  completed_at: number | null;
  completed_at_iso: string | null;
  error_message: string | null;
};

export type MemoryReviewAttachment = {
  id: string;
  source_attachment_id: string | null;
  filename: string | null;
  mime_type: string | null;
  media_type: string | null;
  size_bytes: number | null;
  local_path: string | null;
  url: string | null;
  metadata: Record<string, unknown> | null;
};

export type MemoryReviewTimelineEvent = {
  event_id: string;
  platform: string;
  thread_id: string | null;
  reply_to_event_id: string | null;
  sender_id: string;
  timestamp: number;
  timestamp_iso: string | null;
  content_type: string;
  content: string;
  attachments: MemoryReviewAttachment[];
};

export type MemoryReviewEpisodeDetail = {
  episode: MemoryReviewEpisode;
  timeline: MemoryReviewTimelineEvent[];
};

export type MemoryReviewFact = {
  id: string;
  text: string;
  context: string | null;
  as_of: number;
  as_of_iso: string | null;
  ingested_at: number;
  ingested_at_iso: string | null;
  source_episode_id: string | null;
  source_event_id: string | null;
  is_consolidated: boolean;
};

export type MemoryReviewEntity = {
  id: string;
  name: string;
  type: string | null;
  normalized: string | null;
  is_user: boolean;
  mention_count: number;
  first_seen: number | null;
  first_seen_iso: string | null;
  last_seen: number | null;
  last_seen_iso: string | null;
  created_at: number | null;
  created_at_iso: string | null;
  updated_at: number | null;
  updated_at_iso: string | null;
};

export type MemoryReviewObservation = {
  id: string;
  episode_id: string | null;
  parent_id?: string | null;
  status: string;
  output_text: string | null;
  created_at: number;
  created_at_iso: string | null;
  started_at: number | null;
  started_at_iso: string | null;
  completed_at: number | null;
  completed_at_iso: string | null;
  is_stale: boolean;
};

export type MemoryReviewCausalLink = {
  id: string;
  from_fact_id: string;
  to_fact_id: string;
  strength: number;
  created_at: number;
  created_at_iso: string | null;
};

export type MemoryReviewEpisodeOutputs = {
  episode_id: string;
  facts: MemoryReviewFact[];
  entities: MemoryReviewEntity[];
  fact_entities: Array<{ fact_id: string; entity_id: string }>;
  observations: MemoryReviewObservation[];
  observation_facts: Array<{
    analysis_run_id: string;
    fact_id: string;
    linked_at: number;
    linked_at_iso: string | null;
  }>;
  causal_links: MemoryReviewCausalLink[];
};

export type MemoryReviewQualityBucket =
  | "unconsolidated_facts"
  | "facts_missing_source_episode_id"
  | "facts_without_entities"
  | "entities_unknown_or_identifier_like"
  | "stale_observations_recently_touched"
  | "episodes_failed";

export type MemoryReviewQualityBucketSummary = {
  key: MemoryReviewQualityBucket;
  label: string;
  description: string;
  count: number;
};

export type MemoryReviewQualitySummary = {
  scope: {
    mode: "run" | "global";
    run_id: string | null;
  };
  buckets: Record<MemoryReviewQualityBucket, MemoryReviewQualityBucketSummary>;
};

export type MemoryReviewQualityItem = {
  id: string;
  bucket: MemoryReviewQualityBucket;
  record_type: "fact" | "entity" | "observation" | "episode";
  record_id: string;
  primary_text: string;
  secondary_text: string | null;
  run_id?: string | null;
  episode_id?: string | null;
  fact_id?: string | null;
  entity_id?: string | null;
  observation_id?: string | null;
  source_event_id?: string | null;
  status?: string | null;
  linked_facts?: number;
  timestamp?: number | null;
  timestamp_iso?: string | null;
  ingested_at?: number | null;
  ingested_at_iso?: string | null;
};

export type MemoryReviewQualityItemsResult = {
  bucket: MemoryReviewQualityBucket;
  scope: {
    mode: "run" | "global";
    run_id: string | null;
  };
  limit: number;
  offset: number;
  total: number;
  items: MemoryReviewQualityItem[];
};

export type MemoryReviewSearchType = "all" | "facts" | "entities" | "observations";

export type MemoryReviewSearchResult = {
  query: string;
  type: MemoryReviewSearchType;
  limit: number;
  facts: MemoryReviewFact[];
  entities: MemoryReviewEntity[];
  observations: MemoryReviewObservation[];
};

export type MemoryReviewEpisodeSummary = {
  source: "backfill_episode" | "memory_episode";
  id: string;
  platform: string | null;
  thread_id: string | null;
  event_count: number;
  status?: string | null;
  run_id?: string | null;
  start_time?: number | null;
  start_time_iso?: string | null;
  end_time?: number | null;
  end_time_iso?: string | null;
  started_at?: number | null;
  started_at_iso?: string | null;
  completed_at?: number | null;
  completed_at_iso?: string | null;
  definition_id?: string | null;
  parent_id?: string | null;
};

export type MemoryReviewEntityDetail = {
  entity: MemoryReviewEntity;
  linked_facts: MemoryReviewFact[];
  linked_observations: MemoryReviewObservation[];
  fact_links: Array<{ fact_id: string; entity_id: string }>;
};

export type MemoryReviewFactCausalLink = {
  id: string;
  from_fact_id: string;
  to_fact_id: string;
  strength: number;
  created_at: number;
  created_at_iso: string | null;
  related_fact_text: string;
};

export type MemoryReviewFactDetail = {
  fact: MemoryReviewFact;
  source_episode: MemoryReviewEpisodeSummary | null;
  source_event: MemoryReviewTimelineEvent | null;
  entities: MemoryReviewEntity[];
  fact_links: Array<{ fact_id: string; entity_id: string }>;
  observations: MemoryReviewObservation[];
  observation_facts: Array<{
    analysis_run_id: string;
    fact_id: string;
    linked_at: number;
    linked_at_iso: string | null;
  }>;
  causal_in: MemoryReviewFactCausalLink[];
  causal_out: MemoryReviewFactCausalLink[];
};

export type MemoryReviewObservationDetail = {
  observation: MemoryReviewObservation;
  head_observation_id: string;
  version_chain: MemoryReviewObservation[];
  supporting_facts: MemoryReviewFact[];
  supporting_entities: MemoryReviewEntity[];
  source_episode: MemoryReviewEpisodeSummary | null;
};

// ─── Monitor ──────────────────────────────────────────────────────────

export type MonitorOperation = {
  requestId: string;
  method: string;
  action: string;
  resource: string;
  permission: string;
  callerEntityId: string | null;
  phase: "started" | "completed" | "failed";
  startedAt: number;
  latencyMs: number | null;
  error: string | null;
};

export type MonitorOperationsListResult = {
  operations: MonitorOperation[];
  total: number;
  hasMore: boolean;
};

export type MonitorOperationsStatsResult = {
  totalOperations: number;
  completedCount: number;
  failedCount: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  operationsPerMinute: number;
  topMethods: Array<{ method: string; count: number; avgLatencyMs: number }>;
  topErrors: Array<{ method: string; error: string; count: number }>;
};
