// Synthetic October-shaped fixtures for tests: every hash is sha256 of a made-up label, so no test
// ever reads the Mac's private files or carries a real address hash.
import { createHash } from "node:crypto";
import { QUICKNET_GENESIS, QUICKNET_LABEL, entryIdOf, entryListSha256, pick, rank } from "../lib/draw/rank.js";
import type { DrawingInput, Promotion } from "../lib/draw/replay.js";

export const hash = (label: string) => createHash("sha256").update(label).digest("hex");

/** A round published `afterSeconds` after `committedAt`. */
export function roundAfter(committedAt: string, afterSeconds = 92): number {
  return Math.ceil((Date.parse(committedAt) / 1000 + afterSeconds - QUICKNET_GENESIS) / 3) + 1;
}

export function syntheticDrawing(input: {
  night: string;
  drawing_no: number;
  labels: string[];
  seed: string;
  committedAt: string;
  promoted?: Promotion[];
  free?: string[];
  statuses?: Record<string, number>;
  groupSize?: number;
}): DrawingInput {
  const entries = input.labels
    .map((label) => {
      const address = hash(label);
      return { entry_id: entryIdOf(address), address_sha256: address, basis: (input.free ?? []).includes(label) ? ["free"] : [`review:rev_${hash(`review-${label}`).slice(0, 32)}`] };
    })
    .sort((a, b) => (a.entry_id < b.entry_id ? -1 : 1));
  const ids = entries.map((entry) => entry.entry_id);
  const randomness = hash(`randomness-${input.seed}`);
  const picked = pick(rank(randomness, ids));
  return {
    night: input.night,
    drawing_no: input.drawing_no,
    receipt: {
      commit: {
        group: input.night,
        drawing: input.drawing_no,
        deadline_utc: `${input.night}T04:59:59+00:00`,
        group_size: input.groupSize ?? 2600,
        invitation_statuses: input.statuses ?? { sent: 2500, submitted: 100 },
        group_email_at_utc: `${input.night}T00:30:00+00:00`,
        entries: ids.length,
        reviews_entered: ids.length,
        free_entries_from_group: (input.free ?? []).length,
        free_carried_from_drawing_1: 0,
        left_out_earlier_winners_or_team: 0,
        entry_list_sha256: entryListSha256(ids),
        committed_at_utc: input.committedAt,
        drand_round: roundAfter(input.committedAt),
        drand_chain: QUICKNET_LABEL,
      },
      entry_ids: ids,
      drand_randomness: randomness,
      winners: picked.winners,
      alternates: picked.alternates,
      promoted: input.promoted ?? [],
      method: "rank = sha256(drand randomness bytes || entry_id); lowest first",
    },
    entries,
    free_hashes: (input.free ?? []).map(hash),
    beacon: null,
  };
}

export function ledgerOf(drawings: DrawingInput[]): Record<string, string> {
  const ledger: Record<string, string> = {};
  for (const drawing of drawings) {
    const addresses = new Map(drawing.entries.map((entry) => [entry.entry_id, entry.address_sha256]));
    const finals = new Set(drawing.receipt.winners);
    for (const promotion of drawing.receipt.promoted) {
      finals.delete(promotion.replaces);
      if (promotion.entry_id) finals.add(promotion.entry_id);
    }
    for (const id of finals) ledger[id] = addresses.get(id)!;
  }
  return ledger;
}

export const labels = (prefix: string, n: number) => Array.from({ length: n }, (_, index) => `${prefix}-${index}`);
