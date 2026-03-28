import type { MonitorOperationsListResult, MonitorOperationsStatsResult } from "../types.ts";

type MonitorState = {
  client: { request: <T>(method: string, params?: unknown) => Promise<T> } | null;
  connected: boolean;
  monitorHistoryOps: import("../types.ts").MonitorOperation[];
  monitorHistoryTotal: number;
  monitorHistoryLoading: boolean;
  monitorHistoryError: string | null;
  monitorStats: MonitorOperationsStatsResult | null;
  monitorStatsLoading: boolean;
};

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
    const result = await state.client.request<MonitorOperationsListResult>(
      "monitor.operations.list",
      filters ?? {}
    );
    state.monitorHistoryOps = result?.operations ?? [];
    state.monitorHistoryTotal = result?.total ?? 0;
  } catch (err) {
    state.monitorHistoryError = err instanceof Error ? err.message : String(err);
  } finally {
    state.monitorHistoryLoading = false;
  }
}

export async function loadMonitorStats(state: MonitorState): Promise<void> {
  if (!state.client || !state.connected) return;
  try {
    state.monitorStatsLoading = true;
    const result = await state.client.request<MonitorOperationsStatsResult>(
      "monitor.operations.stats",
      {}
    );
    state.monitorStats = result ?? null;
  } catch {
    // Stats are non-critical, silently fail
  } finally {
    state.monitorStatsLoading = false;
  }
}
