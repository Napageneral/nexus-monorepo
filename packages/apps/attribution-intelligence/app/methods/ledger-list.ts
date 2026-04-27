import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import { asOptionalBoolean, asOptionalNumber, asOptionalString, asString } from "./_shared.js";
import { listLedgerOutcomes, withAttributionDb } from "../storage/store.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const scopeId = asString(ctx.params.scope_id, "scope_id");
  const days = asOptionalNumber(ctx.params.days);
  const limit = asOptionalNumber(ctx.params.limit);
  const offset = asOptionalNumber(ctx.params.offset);
  const reviewOnly = asOptionalBoolean(ctx.params.review_only);
  const unresolvedOnly = asOptionalBoolean(ctx.params.unresolved_only);
  const weakMatchOnly = asOptionalBoolean(ctx.params.weak_match_only);
  const paidOnly = asOptionalBoolean(ctx.params.paid_only);
  const exactPaidIdOnly = asOptionalBoolean(ctx.params.exact_paid_id_only);
  const utmOnly = asOptionalBoolean(ctx.params.utm_only);
  const directOrUnknownOnly = asOptionalBoolean(ctx.params.direct_or_unknown_only);
  const sourceChannel = asOptionalString(ctx.params.source_channel);
  const query = asOptionalString(ctx.params.q);
  const payload = withAttributionDb(ctx.app.dataDir, (db) =>
    listLedgerOutcomes(db, {
      scopeId,
      days: days ?? 30,
      limit: limit ?? 50,
      offset: offset ?? 0,
      reviewOnly: reviewOnly ?? false,
      unresolvedOnly: unresolvedOnly ?? false,
      weakMatchOnly: weakMatchOnly ?? false,
      paidOnly: paidOnly ?? false,
      exactPaidIdOnly: exactPaidIdOnly ?? false,
      utmOnly: utmOnly ?? false,
      directOrUnknownOnly: directOrUnknownOnly ?? false,
      sourceChannel,
      query,
    }),
  );
  return {
    scopeId,
    days: days ?? 30,
    limit: limit ?? 50,
    offset: offset ?? 0,
    filters: {
      review_only: reviewOnly ?? false,
      unresolved_only: unresolvedOnly ?? false,
      weak_match_only: weakMatchOnly ?? false,
      paid_only: paidOnly ?? false,
      exact_paid_id_only: exactPaidIdOnly ?? false,
      utm_only: utmOnly ?? false,
      direct_or_unknown_only: directOrUnknownOnly ?? false,
      source_channel: sourceChannel,
      q: query,
    },
    total: payload.total,
    current_window: payload.currentWindow,
    summary: payload.summary,
    rows: payload.rows,
  };
};
