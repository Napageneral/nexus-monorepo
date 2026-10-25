// Synthetic October-shaped fixtures for tests: every hash is sha256 of a made-up label, so no test
// ever reads the Mac's private files or carries a real address hash.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
    // draw_group.py's winners.json: every winner stays, even one a promotion replaced.
    const finals = new Set(drawing.receipt.winners);
    for (const promotion of drawing.receipt.promoted) if (promotion.entry_id) finals.add(promotion.entry_id);
    for (const id of finals) ledger[id] = addresses.get(id)!;
  }
  return ledger;
}

export const labels = (prefix: string, n: number) => Array.from({ length: n }, (_, index) => `${prefix}-${index}`);

const FIXTURES = fileURLToPath(new URL("./fixtures/october/", import.meta.url));
export const octoberFile = (name: string) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));

export const G1 = () => syntheticDrawing({ night: "2026-10-21", drawing_no: 1, labels: labels("g1", 87), seed: "g1", committedAt: "2026-10-22T13:00:16Z" });
export const G2 = () => syntheticDrawing({ night: "2026-10-23", drawing_no: 1, labels: labels("g2", 61), seed: "g2", committedAt: "2026-10-24T22:04:00Z" });

/** A full October-shaped bundle: the fixture definitions and series file, two drawings, G1's notes. */
export function syntheticBundle(input: { drawings?: DrawingInput[]; scope?: "full" | "drawing"; notes?: unknown[]; withFiles?: boolean } = {}) {
  const drawings = input.drawings ?? [G1(), G2()];
  return {
    contract: "sequences.import.bundle.v1",
    series: "review-giveaway-2026-10",
    scope: input.scope ?? "full",
    built_at: "2026-10-27T17:00:00Z",
    ...(input.scope === "drawing"
      ? {}
      : {
          definitions: [
            { body: octoberFile("review-group-giveaway.json"), yaml_sha256: hash("yaml-rgg"), source_commit: "2bd010e31" },
            { body: octoberFile("prize-claim.json"), yaml_sha256: hash("yaml-pc"), source_commit: "2bd010e31" },
          ],
          series_file: { body: octoberFile("review-giveaway-2026-10.json"), yaml_sha256: hash("yaml-series"), source_commit: "2bd010e31" },
        }),
    files: drawings.map((drawing) => ({ path_rel: `drawings/group-${drawing.night}-drawing-${drawing.drawing_no}.json`, sha256: hash(`file-${drawing.night}-${drawing.drawing_no}`), bytes: 4096 })),
    team_hashes: [hash("team-1"), hash("team-2")],
    ledger: ledgerOf(drawings),
    drawings,
    notes: input.notes ?? [
      {
        night: "2026-10-21",
        drawing_no: 1,
        note: "winner",
        campaigns: [
          { campaign_id: "01M5HV8HW0NETS7142VGNK7BMK", name: "Review group winners · 2026-10-21 · drawing 1", list_id: "SGkfWS", template: "VYUs5K", status: "Sent", sent_at: "2026-10-22T13:03:47Z", list_exact: 10, received: 7, trust: "log_only", source: "LOG.md:249" },
          { campaign_id: "01M5J1G6EW5X877CGMEVCMC0GS", name: "Review group winners · 2026-10-21 · drawing 1 · resend", status: "Sent", sent_at: "2026-10-22T14:50:00Z", list_exact: 3, received: 3, resend_of: "01M5HV8HW0NETS7142VGNK7BMK", trust: "aggregate", source: "adopt.json" },
        ],
      },
      {
        night: "2026-10-21",
        drawing_no: 1,
        note: "still_entered",
        campaigns: [
          { campaign_id: null, campaign_id_prefix: "01M5J1SB", name: "Review group still entered · 2026-10-21 · drawing 1", template: "UenmrW", list_id: "WWUyQt", status: "Sent", sent_at: "2026-10-22T15:00:00Z", list_exact: 77, received: 77, trust: "log_only", source: "LOG.md:249" },
          { campaign_id: "01M5J2MZPD3JJFQW2G5PWE17DM", name: "Review group still entered · 2026-10-21 · drawing 1", status: "Sent", sent_at: "2026-10-22T15:14:43Z", received: 1, trust: "untrusted", source: "receipts" },
        ],
      },
    ],
    nights: [{ night: "2026-10-21", mac_send: { selected: 2690, sent: 2629, opted_out: 55, errored: 6, flow: "Uds4A2" } }],
  };
}
