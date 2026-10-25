// The shadow compare (build manual §3e): the engine rebuilds a Mac drawing's entrant list from the
// ops `entries` route, applies the same free entries, team and ledger, and must reproduce the Mac's
// commit exactly and, with the Mac's own randomness, its winners and alternates. Any difference is
// classified from the route's `explain` rows; one unexplained difference fails the P3 gate.
import { entryIdOf, entryListSha256, pick, rank } from "./rank.js";

export type EntriesRows = {
  group_size: number;
  invitation_statuses: Record<string, number>;
  group_email_at_utc: string | null;
  reviews_entered: number;
  review_entrants: Array<{ address_sha256: string; entry_id?: string; review_ids?: string[] }>;
  member_hashes?: string[];
};

export type ExplainRows = {
  members?: Array<{ address_sha256: string; member?: boolean; created_at?: string | null; invitation_status?: string | null; status?: string | null; last_error?: string | null; updated_at?: string | null }>;
  reviews?: Array<{ address_sha256: string; review_id?: string; at?: string | null; moderation_status?: string | null; rejected_at?: string | null; updated_at?: string | null }>;
};

export type Snapshot = { phase: string; as_of: string; sha256: string; rows: EntriesRows };

export type MacDrawing = {
  commit: Record<string, unknown> & { committed_at_utc: string; entries: number; entry_list_sha256: string };
  entry_ids: string[];
  drand_randomness: string;
  winners: string[];
  alternates: string[];
  entries: Array<{ entry_id: string; address_sha256: string; basis: string[] }>;
  free_hashes: string[];
};

export type DiffClass = "review_rejected_after_commit" | "invitation_cancelled_after_commit" | "as_of_gap" | "unexplained";
export type Diff = { entry_id: string; side: "engine_only" | "mac_only"; class: DiffClass; evidence: string };

export type Compare = {
  pass: boolean;
  read: { phase: string; as_of: string; sha256: string; seconds_from_commit: number };
  engine: Record<string, unknown>;
  mac: Record<string, unknown>;
  mismatched: string[];
  diffs: Diff[];
  unexplained: number;
  needs_explain: string[];
};

/** R = the read nearest the Mac's committed_at (S1 at draw time + 30 s, or S2 on import). */
export function nearestRead(snapshots: readonly Snapshot[], committedAt: string): Snapshot | null {
  const commit = Date.parse(committedAt);
  return [...snapshots].filter((snapshot) => snapshot.phase !== "s0").sort((a, b) => Math.abs(Date.parse(a.as_of) - commit) - Math.abs(Date.parse(b.as_of) - commit))[0] ?? null;
}

function isMember(rows: EntriesRows, explain: ExplainRows | null, hash: string): boolean | null {
  if (rows.member_hashes) return rows.member_hashes.includes(hash);
  const row = explain?.members?.find((entry) => entry.address_sha256 === hash);
  if (!row) return explain ? false : null;
  if (typeof row.member === "boolean") return row.member;
  const status = row.invitation_status ?? row.status ?? "";
  return status !== "cancelled" || row.last_error === "klaviyo_unconfirmed";
}

/**
 * Builds the engine's entrant list from R and compares it with the Mac's commit.
 * `ledgerAtCommit` is the set of entry ids in the winners ledger as of the Mac's committed_at.
 * `drawing1` carries drawing 1's entries for a drawing 2 (its free entrants carry over).
 */
export function compareShadow(input: {
  read: Snapshot;
  explain: ExplainRows | null;
  mac: MacDrawing;
  drawing1?: MacDrawing | null;
  teamHashes: readonly string[];
  ledgerAtCommit: ReadonlySet<string>;
  picks?: { winners: number; alternates: number };
}): Compare {
  const { read, mac } = input;
  const rows = read.rows;
  const team = new Set(input.teamHashes);
  const entrants = new Map<string, string>(); // entry_id -> address hash
  for (const entrant of rows.review_entrants) entrants.set(entryIdOf(entrant.address_sha256), entrant.address_sha256);
  const needsExplain: string[] = [];
  const memberCheck = (hash: string) => {
    const member = isMember(rows, input.explain, hash);
    if (member === null) needsExplain.push(hash);
    return member === true;
  };
  for (const hash of mac.free_hashes) if (memberCheck(hash)) entrants.set(entryIdOf(hash), hash);
  for (const entry of input.drawing1?.entries ?? []) {
    if (entry.basis.includes("free") && memberCheck(entry.address_sha256)) entrants.set(entry.entry_id, entry.address_sha256);
  }
  let leftOut = 0;
  for (const [id, hash] of [...entrants]) {
    if (team.has(hash) || input.ledgerAtCommit.has(id)) {
      entrants.delete(id);
      leftOut += 1;
    }
  }
  const ids = [...entrants.keys()].sort();
  const sha = entryListSha256(ids);
  const picked = pick(rank(mac.drand_randomness, ids), input.picks?.winners ?? 10, input.picks?.alternates ?? 10);
  const engine = {
    entries: ids.length,
    entry_list_sha256: sha,
    group_size: rows.group_size,
    invitation_statuses: rows.invitation_statuses,
    reviews_entered: rows.reviews_entered,
    left_out_earlier_winners_or_team: leftOut,
    winners: picked.winners,
    alternates: picked.alternates,
  };
  const macView = {
    entries: mac.commit.entries,
    entry_list_sha256: mac.commit.entry_list_sha256,
    group_size: mac.commit.group_size,
    invitation_statuses: mac.commit.invitation_statuses,
    reviews_entered: mac.commit.reviews_entered,
    left_out_earlier_winners_or_team: mac.commit.left_out_earlier_winners_or_team,
    winners: mac.winners,
    alternates: mac.alternates,
  };
  const mismatched = (Object.keys(engine) as Array<keyof typeof engine>).filter((key) => JSON.stringify(engine[key]) !== JSON.stringify(macView[key]));

  const macHashes = new Map(mac.entries.map((entry) => [entry.entry_id, entry.address_sha256]));
  const engineOnly = ids.filter((id) => !mac.entry_ids.includes(id));
  const macOnly = mac.entry_ids.filter((id) => !entrants.has(id));
  const diffs: Diff[] = [
    ...engineOnly.map((id) => classify(id, entrants.get(id) ?? "", "engine_only", input.explain, mac.commit.committed_at_utc, read.as_of)),
    ...macOnly.map((id) => classify(id, macHashes.get(id) ?? "", "mac_only", input.explain, mac.commit.committed_at_utc, read.as_of)),
  ];
  const unexplained = diffs.filter((diff) => diff.class === "unexplained").length;
  return {
    pass: mismatched.length === 0 && diffs.length === 0 && needsExplain.length === 0,
    read: { phase: read.phase, as_of: read.as_of, sha256: read.sha256, seconds_from_commit: Math.round((Date.parse(read.as_of) - Date.parse(mac.commit.committed_at_utc)) / 1000) },
    engine,
    mac: macView,
    mismatched,
    diffs,
    unexplained,
    needs_explain: needsExplain,
  };
}

/** The address hashes a mismatch needs `entries?explain=` rows for. */
export function diffHashes(compare: Compare, mac: MacDrawing, read: Snapshot): string[] {
  const macHashes = new Map(mac.entries.map((entry) => [entry.entry_id, entry.address_sha256]));
  const engineHashes = new Map(read.rows.review_entrants.map((entrant) => [entryIdOf(entrant.address_sha256), entrant.address_sha256]));
  return [...new Set([...compare.diffs.map((diff) => (diff.side === "mac_only" ? macHashes.get(diff.entry_id) : engineHashes.get(diff.entry_id)) ?? ""), ...compare.needs_explain])].filter(Boolean).sort();
}

function between(text: string | null | undefined, a: number, b: number): boolean {
  if (!text) return false;
  const at = Date.parse(text);
  return Number.isFinite(at) && at >= Math.min(a, b) && at <= Math.max(a, b);
}

/** Each difference gets the most specific class its explain rows support; otherwise unexplained. */
export function classify(entryId: string, hash: string, side: Diff["side"], explain: ExplainRows | null, committedAt: string, readAt: string): Diff {
  const commit = Date.parse(committedAt);
  const read = Date.parse(readAt);
  const reviews = explain?.reviews?.filter((row) => row.address_sha256 === hash) ?? [];
  const member = explain?.members?.find((row) => row.address_sha256 === hash);
  if (side === "mac_only") {
    const rejected = reviews.find((row) => row.moderation_status === "rejected" && row.rejected_at && Date.parse(row.rejected_at) > commit);
    if (rejected) return { entry_id: entryId, side, class: "review_rejected_after_commit", evidence: `review rejected ${rejected.rejected_at}` };
    const status = member?.invitation_status ?? member?.status;
    if (member && status === "cancelled" && /klaviyo_(bounced|dropped)/.test(member.last_error ?? "") && member.updated_at && Date.parse(member.updated_at) > commit) {
      return { entry_id: entryId, side, class: "invitation_cancelled_after_commit", evidence: `invitation ${member.last_error} ${member.updated_at}` };
    }
  }
  const moved = reviews.find((row) => between(row.updated_at, commit, read) || between(row.at, commit, read)) ?? (member && between(member.updated_at, commit, read) ? member : null);
  if (moved) return { entry_id: entryId, side, class: "as_of_gap", evidence: `a row changed between the commit and the read (${String((moved as { updated_at?: string | null }).updated_at ?? "")})` };
  return { entry_id: entryId, side, class: "unexplained", evidence: explain ? "no explain row accounts for it" : "no explain read yet" };
}
