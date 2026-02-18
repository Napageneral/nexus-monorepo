import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import {
  AdapterAccountSchema,
  AdapterHealthSchema,
  AdapterInfoSchema,
  AdapterStreamStatusSchema,
  DeliveryResultSchema,
  NexusEventSchema,
  StreamEventSchema,
} from "./protocol.js";
import { readAdapterRuntimeContextFile } from "./runtime-context.js";

function contractDir(): string {
  const env = process.env.NEXUS_ADAPTER_PROTOCOL_CONTRACT_DIR;
  if (env && env.trim()) {
    return path.resolve(env);
  }
  // Default assumes this repo is checked out next to `nexus-specs`.
  return path.resolve(process.cwd(), "../../nexus-specs/specs/runtime/adapters/contract");
}

function loadJSON(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function loadJSONL(filePath: string): unknown[] {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as unknown);
}

describe("adapter protocol contract (nexus-specs)", () => {
  it("fixtures validate against adapter-protocol.schema.json and are accepted by TS SDK schemas", () => {
    const dir = contractDir();
    const schemaPath = path.join(dir, "adapter-protocol.schema.json");
    const schema = loadJSON(schemaPath) as Record<string, unknown>;

    const ajv = new Ajv2020({ allErrors: true, strict: true });
    ajv.addSchema(schema);

    const id = String(schema["$id"] ?? "");
    expect(id).toMatch(/^https?:\/\//u);

    const get = (ref: string) => {
      const v = ajv.getSchema(`${id}#/$defs/${ref}`);
      if (!v) {
        throw new Error(`missing schema ref: ${ref}`);
      }
      return v;
    };

    const fixturesDir = path.join(dir, "fixtures");

    const adapterInfo = loadJSON(path.join(fixturesDir, "adapter_info.json"));
    expect(get("AdapterInfo")(adapterInfo)).toBe(true);
    AdapterInfoSchema.parse(adapterInfo);

    const nexusEvent = loadJSON(path.join(fixturesDir, "nexus_event.json"));
    expect(get("NexusEvent")(nexusEvent)).toBe(true);
    NexusEventSchema.parse(nexusEvent);

    const deliveryOk = loadJSON(path.join(fixturesDir, "delivery_result_success.json"));
    expect(get("DeliveryResult")(deliveryOk)).toBe(true);
    DeliveryResultSchema.parse(deliveryOk);

    const deliveryRateLimited = loadJSON(path.join(fixturesDir, "delivery_result_rate_limited.json"));
    expect(get("DeliveryResult")(deliveryRateLimited)).toBe(true);
    DeliveryResultSchema.parse(deliveryRateLimited);

    const health = loadJSON(path.join(fixturesDir, "adapter_health.json"));
    expect(get("AdapterHealth")(health)).toBe(true);
    AdapterHealthSchema.parse(health);

    const account = loadJSON(path.join(fixturesDir, "adapter_account.json"));
    expect(get("AdapterAccount")(account)).toBe(true);
    AdapterAccountSchema.parse(account);

    const runtimeContextPath = path.join(fixturesDir, "runtime_context.json");
    const runtimeCtx = loadJSON(runtimeContextPath);
    expect(get("RuntimeContext")(runtimeCtx)).toBe(true);
    // TS SDK loads runtime context from disk (not via zod schema export).
    expect(readAdapterRuntimeContextFile(runtimeContextPath)).toMatchObject({
      channel: "discord",
      account_id: "echo-bot",
    });

    const streamEvents = loadJSONL(path.join(fixturesDir, "stream_events.jsonl"));
    for (const e of streamEvents) {
      expect(get("StreamEvent")(e)).toBe(true);
      StreamEventSchema.parse(e);
    }

    const streamStatuses = loadJSONL(path.join(fixturesDir, "stream_statuses.jsonl"));
    for (const s of streamStatuses) {
      expect(get("AdapterStreamStatus")(s)).toBe(true);
      AdapterStreamStatusSchema.parse(s);
    }
  });
});
