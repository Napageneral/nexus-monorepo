import type { MonitorOperationsStatsResult } from "../types.ts";

type MonitorState = {
  client: { request: <T>(method: string, params?: unknown) => Promise<T> } | null;
  connected: boolean;
  monitorHistoryOps: import("../types.ts").MonitorOperation[];
  monitorHistoryTotal: number;
  monitorHistoryLoading: boolean;
  monitorHistoryError: string | null;
  monitorStats: MonitorOperationsStatsResult | null;
  monitorStatsLoading: boolean;
  requestUpdate?: () => void;
};

type RawMonitorOperation = {
  requestId?: unknown;
  request_id?: unknown;
  method?: unknown;
  action?: unknown;
  resource?: unknown;
  permission?: unknown;
  callerEntityId?: unknown;
  sender_entity_id?: unknown;
  phase?: unknown;
  startedAt?: unknown;
  created_at?: unknown;
  latencyMs?: unknown;
  latency_ms?: unknown;
  error?: unknown;
};

type RawMonitorOperationsListResult = {
  operations?: unknown;
  total?: unknown;
  hasMore?: unknown;
};

type RawMonitorOperationsStatsResult = {
  since?: unknown;
  until?: unknown;
  totalOperations?: unknown;
  total?: unknown;
  completedCount?: unknown;
  completed?: unknown;
  failedCount?: unknown;
  failed?: unknown;
  avgLatencyMs?: unknown;
  p95LatencyMs?: unknown;
  operationsPerMinute?: unknown;
  topMethods?: unknown;
  topErrors?: unknown;
};

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeMonitorOperation(raw: RawMonitorOperation): import("../types.ts").MonitorOperation {
  const phase =
    raw.phase === "started" || raw.phase === "completed" || raw.phase === "failed"
      ? raw.phase
      : "completed";
  return {
    requestId: toOptionalString(raw.requestId) ?? toOptionalString(raw.request_id) ?? "",
    method: toOptionalString(raw.method) ?? "",
    action: toOptionalString(raw.action) ?? "",
    resource: toOptionalString(raw.resource) ?? "",
    permission: toOptionalString(raw.permission) ?? "",
    callerEntityId: toOptionalString(raw.callerEntityId) ?? toOptionalString(raw.sender_entity_id),
    phase,
    startedAt: toNumber(raw.startedAt ?? raw.created_at),
    latencyMs: toNullableNumber(raw.latencyMs ?? raw.latency_ms),
    error: toOptionalString(raw.error),
  };
}

function normalizeMonitorStats(
  raw: RawMonitorOperationsStatsResult | null | undefined,
): MonitorOperationsStatsResult {
  const since = toNumber(raw?.since);
  const until = toNumber(raw?.until);
  const totalOperations = toNumber(raw?.totalOperations ?? raw?.total);
  const completedCount = toNumber(raw?.completedCount ?? raw?.completed);
  const failedCount = toNumber(raw?.failedCount ?? raw?.failed);
  const durationMinutes = until > since ? (until - since) / 60_000 : 0;
  const operationsPerMinute =
    durationMinutes > 0 ? Number((totalOperations / durationMinutes).toFixed(1)) : 0;

  const topMethodsRaw = Array.isArray(raw?.topMethods) ? raw.topMethods : [];
  const topErrorsRaw = Array.isArray(raw?.topErrors) ? raw.topErrors : [];
  const rawOperationsPerMinute =
    typeof raw?.operationsPerMinute === "number" && Number.isFinite(raw.operationsPerMinute)
      ? raw.operationsPerMinute
      : null;

  return {
    totalOperations,
    completedCount,
    failedCount,
    avgLatencyMs: toNumber(raw?.avgLatencyMs),
    p95LatencyMs: toNumber(raw?.p95LatencyMs),
    operationsPerMinute: rawOperationsPerMinute ?? operationsPerMinute,
    topMethods: topMethodsRaw.map((entry) => {
      const row = entry as { method?: unknown; count?: unknown; cnt?: unknown; avgLatencyMs?: unknown };
      return {
        method: toOptionalString(row.method) ?? "",
        count: toNumber(row.count ?? row.cnt),
        avgLatencyMs: toNumber(row.avgLatencyMs),
      };
    }),
    topErrors: topErrorsRaw.map((entry) => {
      const row = entry as { method?: unknown; error?: unknown; count?: unknown; cnt?: unknown };
      return {
        method: toOptionalString(row.method) ?? "",
        error: toOptionalString(row.error) ?? "",
        count: toNumber(row.count ?? row.cnt),
      };
    }),
  };
}

export async function loadMonitorHistory(
  state: MonitorState,
  filters?: {
    method?: string;
    action?: string;
    status?: string;
    since?: number;
    until?: number;
    limit?: number;
    offset?: number;
  }
): Promise<void> {
  if (!state.client || !state.connected) return;
  try {
    state.monitorHistoryLoading = true;
    state.monitorHistoryError = null;
    const result = await state.client.request<RawMonitorOperationsListResult>(
      "monitor.operations.list",
      filters ?? {}
    );
    state.monitorHistoryOps = Array.isArray(result?.operations)
      ? result.operations.map((entry) => normalizeMonitorOperation(entry as RawMonitorOperation))
      : [];
    state.monitorHistoryTotal = toNumber(result?.total);
  } catch (err) {
    state.monitorHistoryError = err instanceof Error ? err.message : String(err);
  } finally {
    state.monitorHistoryLoading = false;
    state.requestUpdate?.();
  }
}

export async function loadMonitorStats(state: MonitorState): Promise<void> {
  if (!state.client || !state.connected) return;
  try {
    state.monitorStatsLoading = true;
    const result = await state.client.request<RawMonitorOperationsStatsResult>(
      "monitor.operations.stats",
      {}
    );
    state.monitorStats = normalizeMonitorStats(result ?? null);
  } catch {
    // Stats are non-critical, silently fail
  } finally {
    state.monitorStatsLoading = false;
    state.requestUpdate?.();
  }
}
