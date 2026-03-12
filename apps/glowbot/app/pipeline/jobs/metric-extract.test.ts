import { describe, expect, it, vi } from "vitest";
import { handler } from "./metric-extract.js";
import type { JobScriptContext } from "../../../../../nex/src/nex/control-plane/server-work.js";

type RuntimeCall = {
  method: string;
  params: Record<string, unknown>;
};

type RecordFixture = {
  id?: string;
  record_id?: string;
  content?: string;
  timestamp?: number;
  platform?: string;
  receiver_id?: string;
  metadata?: Record<string, unknown>;
};

function createContext(params: {
  input: Record<string, unknown>;
  record?: RecordFixture | null;
  existingElements?: Array<Record<string, unknown>>;
}) {
  const calls: RuntimeCall[] = [];
  const runtime = {
    callMethod: vi.fn(async (method: string, paramsValue: unknown) => {
      const paramsRecord =
        paramsValue && typeof paramsValue === "object" && !Array.isArray(paramsValue)
          ? (paramsValue as Record<string, unknown>)
          : {};
      calls.push({ method, params: paramsRecord });

      if (method === "records.get") {
        return params.record ? { record: params.record } : { record: null };
      }
      if (method === "memory.elements.list") {
        return {
          elements: params.existingElements ?? [],
        };
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
      trigger_source: "event",
      created_at: new Date().toISOString(),
    },
    input: params.input,
    runtime,
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    now: new Date("2026-03-10T00:00:00.000Z"),
  };

  return { ctx, calls };
}

describe("metric_extract job", () => {
  it("creates a metric element from a canonical record.ingested event", async () => {
    const { ctx, calls } = createContext({
      input: {
        event: {
          type: "record.ingested",
          properties: {
            record_id: "google-ads:evt-1",
          },
        },
      },
      record: {
        id: "evt-1",
        record_id: "google-ads:evt-1",
        content: "ad_spend=123.45",
        timestamp: Date.parse("2026-03-05T12:00:00.000Z"),
        platform: "google-ads",
        receiver_id: "conn_google_glowbot_01",
        metadata: {
          adapter_id: "google-ads",
          metric_name: "ad_spend",
          metric_value: 123.45,
          date: "2026-03-05",
          campaign_id: "cmp-123",
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
    expect(calls[0]?.method).toBe("records.get");
    expect(calls[0]?.params).toEqual({ id: "google-ads:evt-1" });
    expect(calls[1]?.method).toBe("memory.elements.list");
    expect(calls[2]?.method).toBe("memory.elements.create");
    expect(calls[2]?.params.metadata).toMatchObject({
      connection_id: "conn_google_glowbot_01",
      adapter_id: "google-ads",
      metric_name: "ad_spend",
      metric_value: 123.45,
      date: "2026-03-05",
      metadata_key: "campaign_id:cmp-123",
    });
    expect(calls[2]?.params.sourceEventId).toBe("google-ads:evt-1");
    expect(calls[2]?.params.sourceJobId).toBeUndefined();
  });

  it("returns a no-op result when schedule-driven execution has no event input", async () => {
    const { ctx, calls } = createContext({
      input: {},
    });

    const result = await handler(ctx);

    expect(result).toEqual({
      created: 0,
      updated: 0,
      skipped: 0,
      rejected: 0,
      processed: 0,
    });
    expect(calls).toEqual([]);
  });

  it("rejects records missing canonical connection provenance", async () => {
    const { ctx, calls } = createContext({
      input: {
        event: {
          type: "record.ingested",
          properties: {
            record_id: "meta-ads:evt-2",
          },
        },
      },
      record: {
        id: "evt-2",
        record_id: "meta-ads:evt-2",
        platform: "meta-ads",
        metadata: {
          adapter_id: "meta-ads",
          metric_name: "ad_clicks",
          metric_value: 42,
          date: "2026-03-05",
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
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("records.get");
  });

  it("updates an existing element when the metric value changes", async () => {
    const { ctx, calls } = createContext({
      input: {
        event: {
          type: "record.ingested",
          properties: {
            record_id: "callrail:evt-3",
          },
        },
      },
      record: {
        id: "evt-3",
        record_id: "callrail:evt-3",
        platform: "callrail",
        receiver_id: "conn_callrail_01",
        metadata: {
          adapter_id: "callrail",
          metric_name: "calls_total",
          metric_value: 18,
          date: "2026-03-05",
          clinic_id: "center-1",
        },
      },
      existingElements: [
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
    });

    const result = await handler(ctx);

    expect(result).toMatchObject({
      created: 0,
      updated: 1,
      skipped: 0,
      rejected: 0,
      processed: 1,
    });
    expect(calls[2]?.method).toBe("memory.elements.update");
    expect(calls[2]?.params.id).toBe("existing-1");
    expect(calls[2]?.params.sourceEventId).toBe("callrail:evt-3");
    expect(calls[2]?.params.sourceJobId).toBeUndefined();
  });

  it("keeps same-platform connections distinct in dedup lookups", async () => {
    const first = createContext({
      input: {
        event: {
          type: "record.ingested",
          properties: {
            record_id: "google-ads:evt-4",
          },
        },
      },
      record: {
        id: "evt-4",
        record_id: "google-ads:evt-4",
        platform: "google-ads",
        receiver_id: "conn_google_one",
        metadata: {
          adapter_id: "google-ads",
          metric_name: "ad_clicks",
          metric_value: 10,
          date: "2026-03-05",
        },
      },
    });
    const second = createContext({
      input: {
        event: {
          type: "record.ingested",
          properties: {
            record_id: "google-ads:evt-5",
          },
        },
      },
      record: {
        id: "evt-5",
        record_id: "google-ads:evt-5",
        platform: "google-ads",
        receiver_id: "conn_google_two",
        metadata: {
          adapter_id: "google-ads",
          metric_name: "ad_clicks",
          metric_value: 11,
          date: "2026-03-05",
        },
      },
    });

    await handler(first.ctx);
    await handler(second.ctx);

    const firstFilter = first.calls.find((call) => call.method === "memory.elements.list")?.params
      .metadataFilter as Record<string, unknown>;
    const secondFilter = second.calls.find((call) => call.method === "memory.elements.list")?.params
      .metadataFilter as Record<string, unknown>;

    expect(firstFilter.connection_id).toBe("conn_google_one");
    expect(secondFilter.connection_id).toBe("conn_google_two");
  });
});
