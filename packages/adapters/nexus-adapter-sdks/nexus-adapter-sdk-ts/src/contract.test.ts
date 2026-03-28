import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import {
  AdapterConnectionIdentitySchema,
  AdapterServeInputFrameSchema,
  AdapterServeOutputFrameSchema,
  AdapterHealthSchema,
  AdapterInfoSchema,
  AdapterInboundRecordSchema,
  AdapterSetupResultSchema,
} from "./protocol.js";
import { readAdapterRuntimeContextFile } from "./runtime-context.js";

function contractDir(): string {
  const env = process.env.NEXUS_ADAPTER_PROTOCOL_CONTRACT_DIR;
  if (env && env.trim()) {
    return path.resolve(env);
  }
  return path.resolve(process.cwd(), "../../../../nex/docs/specs/adapters/contract");
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

describe("adapter protocol contract (active Nex docs)", () => {
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

    const inboundRecord = loadJSON(path.join(fixturesDir, "inbound_record.json"));
    expect(get("AdapterInboundRecord")(inboundRecord)).toBe(true);
    AdapterInboundRecordSchema.parse(inboundRecord);

    const health = loadJSON(path.join(fixturesDir, "adapter_health.json"));
    expect(get("AdapterHealth")(health)).toBe(true);
    AdapterHealthSchema.parse(health);

    const account = loadJSON(path.join(fixturesDir, "adapter_connection_identity.json"));
    expect(get("AdapterConnectionIdentity")(account)).toBe(true);
    AdapterConnectionIdentitySchema.parse(account);

    const setupResult = loadJSON(path.join(fixturesDir, "adapter_setup_result.json"));
    expect(get("AdapterSetupResult")(setupResult)).toBe(true);
    AdapterSetupResultSchema.parse(setupResult);

    const runtimeContextPath = path.join(fixturesDir, "runtime_context.json");
    // RuntimeContext is a supporting fixture, not a published schema definition.
    expect(loadJSON(runtimeContextPath)).toMatchObject({
      platform: "discord",
      connection_id: "echo-bot",
    });
    expect(readAdapterRuntimeContextFile(runtimeContextPath)).toMatchObject({
      platform: "discord",
      connection_id: "echo-bot",
    });

    const controlInputs = loadJSONL(path.join(fixturesDir, "control_input_frames.jsonl"));
    for (const frame of controlInputs) {
      expect(get("AdapterServeInputFrame")(frame)).toBe(true);
      AdapterServeInputFrameSchema.parse(frame);
    }

    const controlOutputs = loadJSONL(path.join(fixturesDir, "control_output_frames.jsonl"));
    for (const frame of controlOutputs) {
      expect(get("AdapterServeOutputFrame")(frame)).toBe(true);
      AdapterServeOutputFrameSchema.parse(frame);
    }
  });

  it("TS SDK schemas round-trip canonical fixtures without losing contract fields", () => {
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

    const roundTrip = <T>(ref: string, name: string, parse: (value: unknown) => T) => {
      const parsed = parse(loadJSON(path.join(fixturesDir, name)));
      const encoded = JSON.parse(JSON.stringify(parsed)) as unknown;
      expect(get(ref)(encoded)).toBe(true);
    };

    roundTrip("AdapterInfo", "adapter_info.json", (value) => AdapterInfoSchema.parse(value));
    roundTrip("AdapterInboundRecord", "inbound_record.json", (value) =>
      AdapterInboundRecordSchema.parse(value),
    );
    roundTrip("AdapterHealth", "adapter_health.json", (value) => AdapterHealthSchema.parse(value));
    roundTrip("AdapterConnectionIdentity", "adapter_connection_identity.json", (value) => AdapterConnectionIdentitySchema.parse(value));
    roundTrip("AdapterSetupResult", "adapter_setup_result.json", (value) => AdapterSetupResultSchema.parse(value));
  });
});
