import { describe, expect, it, vi } from "vitest";
import {
  loadMonitorHistory,
  loadMonitorStats,
  normalizeMonitorOperation,
} from "./monitor.ts";

type ClientRequestMock = ReturnType<typeof vi.fn>;

function makeState(requestMock: ClientRequestMock) {
  return {
    client: {
      request: requestMock,
    },
    connected: true,
    monitorHistoryOps: [],
    monitorHistoryTotal: 0,
    monitorHistoryLoading: false,
    monitorHistoryError: null,
    monitorStats: null,
    monitorStatsLoading: false,
    requestUpdate: vi.fn(),
  };
}

describe("monitor controller", () => {
  it("normalizes snake_case monitor operations", () => {
    expect(
      normalizeMonitorOperation({
        request_id: "req-1",
        method: "jobs.list",
        action: "read",
        resource: "jobs",
        permission: "core.jobs.read",
        sender_entity_id: "entity-assistant",
        phase: "completed",
        created_at: 123,
        latency_ms: 45,
      }),
    ).toEqual({
      requestId: "req-1",
      method: "jobs.list",
      action: "read",
      resource: "jobs",
      permission: "core.jobs.read",
      callerEntityId: "entity-assistant",
      phase: "completed",
      startedAt: 123,
      latencyMs: 45,
      error: null,
    });
  });

  it("loads and normalizes monitor history", async () => {
    const request = vi.fn().mockResolvedValueOnce({
      operations: [
        {
          request_id: "req-1",
          method: "jobs.list",
          action: "read",
          resource: "jobs",
          permission: "core.jobs.read",
          sender_entity_id: "entity-assistant",
          phase: "completed",
          created_at: 123,
          latency_ms: 45,
        },
      ],
      total: 1,
      hasMore: false,
    });
    const state = makeState(request);

    await loadMonitorHistory(state, { limit: 50, offset: 0 });

    expect(request).toHaveBeenCalledWith("monitor.operations.list", { limit: 50, offset: 0 });
    expect(state.monitorHistoryOps).toEqual([
      {
        requestId: "req-1",
        method: "jobs.list",
        action: "read",
        resource: "jobs",
        permission: "core.jobs.read",
        callerEntityId: "entity-assistant",
        phase: "completed",
        startedAt: 123,
        latencyMs: 45,
        error: null,
      },
    ]);
    expect(state.monitorHistoryTotal).toBe(1);
    expect(state.monitorHistoryLoading).toBe(false);
    expect(state.requestUpdate).toHaveBeenCalled();
  });

  it("loads and normalizes monitor stats", async () => {
    const request = vi.fn().mockResolvedValueOnce({
      since: 0,
      until: 120_000,
      total: 12,
      completed: 11,
      failed: 1,
      avgLatencyMs: 140,
      p95LatencyMs: 350,
      topMethods: [{ method: "jobs.list", count: 5 }],
      topErrors: [{ error: "timeout", count: 1 }],
    });
    const state = makeState(request);

    await loadMonitorStats(state);

    expect(request).toHaveBeenCalledWith("monitor.operations.stats", {});
    expect(state.monitorStats).toEqual({
      totalOperations: 12,
      completedCount: 11,
      failedCount: 1,
      avgLatencyMs: 140,
      p95LatencyMs: 350,
      operationsPerMinute: 6,
      topMethods: [{ method: "jobs.list", count: 5, avgLatencyMs: 0 }],
      topErrors: [{ method: "", error: "timeout", count: 1 }],
    });
    expect(state.monitorStatsLoading).toBe(false);
    expect(state.requestUpdate).toHaveBeenCalled();
  });
});
