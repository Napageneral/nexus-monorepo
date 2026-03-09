import { describe, expect, it, vi } from "vitest";
import { handler } from "./metric-extract.js";
import type { JobScriptContext } from "../../../../../nex/src/nex/control-plane/server-work.js";

function createContext(input: Record<string, unknown>) {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const runtime = {
    callMethod: vi.fn(async (method: string, params: unknown) => {
      const payload =
        params && typeof params === "object" && !Array.isArray(params)
          ? (params as Record<string, unknown>)
          : {};
      calls.push({ method, params: payload });

      if (method === "memory.elements.list") {
        return { elements: [] };
      }
      if (method === "memory.elements.create") {
        return { element: { id: "element-1" } };
      }
      if (method === "memory.elements.update") {
        return { element: { id: "element-2" } };
      }
      throw new Error(`unexpected runtime method: ${method}`);
    }),
  };

  const ctx: JobScriptContext = {
    job: {
      id: "job-metric-extract",
      name: "metric_extract",
      description: null,
      config: {},
    },
    run: {
      id: "run-001",
      trigger_source: "test",
      created_at: new Date().toISOString(),
    },
    input,
    runtime,
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    now: new Date("2026-03-06T00:00:00.000Z"),
  };

  return { ctx, calls, runtime };
}

describe("metric_extract job", () => {
  it("creates a metric element with connection-based provenance", async () => {
    const { ctx, calls } = createContext({
      event: {
        type: "adapter.event",
        connectionId: "conn_google_glowbot_01",
        data: {
          id: "evt-1",
          timestamp: Date.parse("2026-03-05T12:00:00.000Z"),
          content: "ad_spend=123.45",
          metadata: {
            adapter_id: "google-ads",
            metric_name: "ad_spend",
            metric_value: 123.45,
            date: "2026-03-05",
            campaign_id: "cmp-123",
          },
        },
      },
    });

    const result = await handler(ctx);

    expect(result).toMatchObject({
      created: 1,
      updated: 0,
      skipped: 0,
      rejected: 0,
      processed: 1,
    });

    expect(calls[0]?.method).toBe("memory.elements.list");
    expect(calls[1]?.method).toBe("memory.elements.create");
    expect(calls[1]?.params.metadata).toMatchObject({
      connection_id: "conn_google_glowbot_01",
      adapter_id: "google-ads",
      metric_name: "ad_spend",
      metric_value: 123.45,
      date: "2026-03-05",
      metadata_key: "campaign_id:cmp-123",
    });
    expect(calls[1]?.params.sourceJobId).toBe("run-001");
  });

  it("rejects events missing canonical connection provenance", async () => {
    const { ctx, calls } = createContext({
      event: {
        type: "adapter.event",
        data: {
          metadata: {
            adapter_id: "meta-ads",
            metric_name: "ad_clicks",
            metric_value: 42,
            date: "2026-03-05",
          },
        },
      },
    });

    const result = await handler(ctx);

    expect(result).toMatchObject({
      created: 0,
      updated: 0,
      skipped: 0,
      rejected: 1,
      processed: 1,
    });
    expect(calls).toHaveLength(0);
  });

  it("updates an existing element when the metric value changes", async () => {
    const { ctx, calls, runtime } = createContext({
      event: {
        type: "adapter.event",
        connectionId: "conn_callrail_01",
        data: {
          id: "evt-2",
          metadata: {
            adapter_id: "callrail",
            metric_name: "calls_total",
            metric_value: 18,
            date: "2026-03-05",
            clinic_id: "center-1",
          },
        },
      },
    });

    runtime.callMethod = vi.fn(async (method: string, params: unknown) => {
      const payload =
        params && typeof params === "object" && !Array.isArray(params)
          ? (params as Record<string, unknown>)
          : {};
      calls.push({ method, params: payload });

      if (method === "memory.elements.list") {
        return {
          elements: [
            {
              id: "existing-1",
              metadata: JSON.stringify({
                connection_id: "conn_callrail_01",
                adapter_id: "callrail",
                metric_name: "calls_total",
                metric_value: 12,
                date: "2026-03-05",
                clinic_id: "center-1",
                metadata_key: "",
              }),
            },
          ],
        };
      }
      if (method === "memory.elements.update") {
        return { element: { id: "existing-2" } };
      }
      throw new Error(`unexpected runtime method: ${method}`);
    });
    ctx.runtime = runtime;

    const result = await handler(ctx);

    expect(result).toMatchObject({
      created: 0,
      updated: 1,
      skipped: 0,
      rejected: 0,
      processed: 1,
    });
    expect(calls[1]?.method).toBe("memory.elements.update");
    expect(calls[1]?.params.id).toBe("existing-1");
    expect(calls[1]?.params.sourceJobId).toBe("run-001");
  });

  it("keeps same-adapter connections distinct in dedup lookups", async () => {
    const { ctx, calls } = createContext({
      events: [
        {
          connectionId: "conn_google_one",
          data: {
            metadata: {
              adapter_id: "google-ads",
              metric_name: "ad_clicks",
              metric_value: 10,
              date: "2026-03-05",
            },
          },
        },
        {
          connectionId: "conn_google_two",
          data: {
            metadata: {
              adapter_id: "google-ads",
              metric_name: "ad_clicks",
              metric_value: 11,
              date: "2026-03-05",
            },
          },
        },
      ],
    });

    await handler(ctx);

    const lookupFilters = calls
      .filter((call) => call.method === "memory.elements.list")
      .map((call) => call.params.metadataFilter as Record<string, unknown>);

    expect(lookupFilters).toHaveLength(2);
    expect(lookupFilters[0]?.connection_id).toBe("conn_google_one");
    expect(lookupFilters[1]?.connection_id).toBe("conn_google_two");
  });
});
