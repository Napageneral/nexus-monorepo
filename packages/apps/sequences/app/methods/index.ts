import { requireStore } from "../lib/store.js";
import type { MethodContext } from "../lib/types.js";

type HealthRow = {
  last_tick_at: Date | string | null;
  last_tick_run_id: string | null;
  ticks: string | number;
};

export async function health(ctx: MethodContext) {
  const store = requireStore(ctx.app);
  const result = await store.query<HealthRow>(
    "SELECT last_tick_at, last_tick_run_id, ticks FROM health WHERE id = 'singleton'",
  );
  const row = result.rows[0];
  return {
    contract_id: "sequences_health_v1",
    app_id: ctx.app.id,
    app_version: ctx.app.version,
    schema: store.schema,
    last_tick_at: row?.last_tick_at ? new Date(row.last_tick_at).toISOString() : null,
    last_tick_run_id: row?.last_tick_run_id ?? null,
    // BIGINT arrives as text from the store; the app decides how to read it.
    ticks: Number(row?.ticks ?? 0),
    provider_write_authority: false,
  };
}

// The loader takes this default object as the method map; every key must be declared in
// app.nexus.json and start with "sequences.".
export default {
  "sequences.health": health,
};
