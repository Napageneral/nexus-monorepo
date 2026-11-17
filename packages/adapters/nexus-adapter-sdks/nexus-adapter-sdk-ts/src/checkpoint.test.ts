import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  AdapterCheckpointLineSchema,
  emitAdapterCheckpoint,
  hasManagedCheckpoints,
  readAdapterCheckpoint,
  withAdapterCheckpoint,
} from "./checkpoint.js";

describe("adapter checkpoints", () => {
  it("reads managed checkpoints from the runtime context and treats absence as a cold start", () => {
    const legacy = { platform: "gmail", connection_id: "a", config: {} };
    expect(hasManagedCheckpoints(legacy)).toBe(false);
    expect(readAdapterCheckpoint(legacy, "monitor", "history")).toBeUndefined();
    const managed = { ...legacy, checkpoints: { "monitor/history": { history_id: "3332306" } } };
    expect(hasManagedCheckpoints(managed)).toBe(true);
    expect(readAdapterCheckpoint(managed, "monitor", "history")).toEqual({ history_id: "3332306" });
    expect(readAdapterCheckpoint(managed, "monitor", "other")).toBeUndefined();
    expect(hasManagedCheckpoints({ ...legacy, checkpoints: {} })).toBe(true);
  });

  it("emits the checkpoint line and validates it", () => {
    const stdout = new PassThrough();
    let written = "";
    stdout.on("data", (chunk) => {
      written += String(chunk);
    });
    emitAdapterCheckpoint(
      { scope: "monitor", key: "transactional", value: { completed_through: "2026-09-07T22:42:13.376Z" } },
      stdout as unknown as NodeJS.WriteStream,
    );
    expect(JSON.parse(written.trim())).toEqual({
      nex: "checkpoint",
      scope: "monitor",
      key: "transactional",
      value: { completed_through: "2026-09-07T22:42:13.376Z" },
    });
    expect(() =>
      emitAdapterCheckpoint({ scope: "Monitor", key: "k", value: 1 }, stdout as unknown as NodeJS.WriteStream),
    ).toThrow();
    expect(AdapterCheckpointLineSchema.safeParse({ nex: "record", scope: "a", key: "k", value: 1 }).success).toBe(
      false,
    );
  });

  it("attaches the result field only when there is something to persist", () => {
    expect(withAdapterCheckpoint({ ok: true })).toEqual({ ok: true });
    expect(
      withAdapterCheckpoint({ ok: true }, { scope: "source", key: "orders.delta", value: { cursor_iso: "x" } }),
    ).toEqual({
      ok: true,
      checkpoint: [{ scope: "source", key: "orders.delta", value: { cursor_iso: "x" } }],
    });
  });
});
