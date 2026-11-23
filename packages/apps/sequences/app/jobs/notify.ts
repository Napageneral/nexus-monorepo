import { alertsDueDelivery, renderAlert } from "../lib/alerts.js";
import { refuseTrigger } from "../lib/claim.js";
import { appendEvent, requireStore, tx } from "../lib/store.js";
import type { JobContext } from "../lib/types.js";

/**
 * sequences.notify: one delivery round for every open immediate alert that is due one (never sent,
 * or last sent 6 h ago and nobody recorded telling Tyler). P1b renders and records only: the
 * off-host dead-man reads sequences.health, finds each alert's delivery_key and emails it once
 * (no SMTP credential lives in Nex until §8 R-2 is proven). Words carry ids and counts only.
 */
export default async function sequencesNotify(ctx: JobContext) {
  const refused = refuseTrigger(ctx, "sequences", "sequences_notify_v1");
  if (refused) return refused;
  const store = requireStore(ctx.app);
  const now = ctx.now ?? new Date();
  const rounds = await tx(store, async (q) => {
    const due = await alertsDueDelivery(q, now);
    for (const alert of due) {
      await q.query("UPDATE alerts SET rendered = $2, deliveries = deliveries + 1, last_delivered_at = $3 WHERE id = $1 AND state = 'open'", [alert.id, renderAlert(alert), now.toISOString()]);
      await appendEvent(q, { actor: `job:${ctx.run.id}`, event: "alert.delivery_round", detail: { alert: alert.id, round: alert.deliveries + 1, via: "deadman" } });
    }
    return due.map((alert) => `${alert.id}#${alert.deliveries + 1}`);
  });
  return { contract_id: "sequences_notify_v1", run_id: ctx.run.id, delivery: "deadman", rounds };
}
