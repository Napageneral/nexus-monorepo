import { describe, expect, it } from "vitest";
import handlers, { health } from "./index.js";
import sequencesTick from "../jobs/tick.js";
import type { AppStore } from "../lib/types.js";

function memoryStore(): AppStore & { state: { ticks: number; last_tick_at: Date | null; last_tick_run_id: string | null } } {
  const state = { ticks: 0, last_tick_at: null as Date | null, last_tick_run_id: null as string | null };
  const store = {
    schema: "sequences",
    inTransaction: false,
    state,
    async query(text: string, values: readonly unknown[] = []) {
      if (text.startsWith("SELECT")) {
        return { rows: [{ ...state, ticks: String(state.ticks) }], rowCount: 1, fields: [] };
      }
      state.ticks += 1;
      state.last_tick_at = new Date("2026-10-27T17:00:00.000Z");
      state.last_tick_run_id = String(values[0]);
      return { rows: [{ ticks: String(state.ticks) }], rowCount: 1, fields: [] };
    },
    async transaction<T>(fn: (tx: AppStore) => Promise<T>) {
      return fn({ ...store, inTransaction: true });
    },
  };
  return store as never;
}

const app = (store?: AppStore) => ({ id: "sequences", version: "0.1.0", dataDir: "/tmp/x", packageDir: "/tmp/x", config: {}, store });

describe("sequences.health and sequences.tick", () => {
  it("exports exactly the declared method map", () => {
    expect(Object.keys(handlers)).toEqual(["sequences.health"]);
  });

  it("reads the tick the job recorded, with BIGINT text read as a number", async () => {
    const store = memoryStore();
    const before = await health({ params: {}, app: app(store) } as never);
    expect(before).toMatchObject({ schema: "sequences", ticks: 0, last_tick_at: null });
    const tick = await sequencesTick({ app: app(store), run: { id: "jobrun_1", trigger_source: "schedule" } } as never);
    expect(tick).toEqual({ contract_id: "sequences_tick_v1", run_id: "jobrun_1", trigger_source: "schedule", ticks: 1 });
    const after = await health({ params: {}, app: app(store) } as never);
    expect(after).toMatchObject({ ticks: 1, last_tick_run_id: "jobrun_1", last_tick_at: "2026-10-27T17:00:00.000Z" });
  });

  it("fails closed without ctx.app.store", async () => {
    await expect(health({ params: {}, app: app(undefined) } as never)).rejects.toThrow(/not provisioned/);
    await expect(sequencesTick({ run: { id: "jobrun_2", trigger_source: "schedule" } } as never)).rejects.toThrow(/not provisioned/);
  });
});
