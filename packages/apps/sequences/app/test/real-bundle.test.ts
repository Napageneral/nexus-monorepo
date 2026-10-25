import { afterAll, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import methods from "../methods/index.js";
import { HAS_DATABASE, adminQuery, cleanup, fixture } from "./pg-store.js";
import { importBundle } from "../lib/import.js";
import { loadStepByRef } from "../lib/repo.js";

// T1.5 on the real October evidence: SEQUENCES_REAL_BUNDLE is the hashes-only bundle that
// moonsleep-v1's scripts/sequences_import.py --all writes (no push). It never enters git.
const BUNDLE = process.env.SEQUENCES_REAL_BUNDLE ?? "";
const now = new Date("2026-10-27T18:00:00Z");
const actor = "claude@tyler-mac#t15";

describe.runIf(HAS_DATABASE && BUNDLE !== "")("the real October bundle", () => {
  afterAll(cleanup);

  it("previews with every check passing, then applies and adopts every drawing", async () => {
    const bundle = JSON.parse(readFileSync(BUNDLE, "utf8"));
    const { store, schema } = await fixture();
    const preview = await importBundle(store, bundle, { mode: "preview", actor, now });
    const lines = preview.problems.map((entry) => `${entry.code}: ${entry.message}`);
    expect(lines).toEqual([]);
    const validation = preview.data.validation as { pass: boolean; drawings: Array<{ night: string; drawing_no: number; pass: boolean; checks: Array<{ id: string; status: string }> }> };
    for (const drawing of validation.drawings) {
      console.log(`${drawing.night} drawing ${drawing.drawing_no}: ${drawing.checks.map((check) => `${check.id} ${check.status}`).join(" · ")}`);
    }
    expect(validation.pass).toBe(true);
    const applied = await importBundle(store, bundle, { mode: "apply", preview_token: preview.token!, actor, now });
    expect(applied.problems.map((entry) => entry.message)).toEqual([]);
    console.log(`counts ${JSON.stringify(applied.data.counts)}`);
    const drawings = (await adminQuery(`SELECT count(*)::int AS n FROM ${schema}.drawings WHERE mode = 'adopted'`)).rows[0].n;
    expect(drawings).toBe(bundle.drawings.length);
    for (const drawing of bundle.drawings as Array<{ night: string; drawing_no: number }>) {
      const night = ["2026-10-21", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"].indexOf(drawing.night) + 1;
      const step = await loadStepByRef(store, `review-giveaway-2026-10/g${night}.draw_${drawing.drawing_no}`);
      expect(step?.state).toBe("adopted");
    }
    const again = await importBundle(store, bundle, { mode: "apply", preview_token: preview.token!, actor, now });
    expect(again.data.replayed).toBe(true);
    // SEQUENCES_PAGE_OUT: write the page and health answers for the ops-ui and dead-man parsers to read.
    if (process.env.SEQUENCES_PAGE_OUT) {
      const ctx = (params: Record<string, unknown>) => ({ app: { id: "sequences", version: "0.1.0", store } as never, params, nex: {} as never, user: null } as never);
      const page = await methods["sequences.page.get"](ctx({ s: "review-giveaway-2026-10", via: { route: "page", operator_ref: "service:machine", operator_role: "machine", session: null } }));
      const health = await methods["sequences.health"](ctx({}));
      writeFileSync(process.env.SEQUENCES_PAGE_OUT, JSON.stringify({ page, health }), { mode: 0o600 });
    }
  });
});
