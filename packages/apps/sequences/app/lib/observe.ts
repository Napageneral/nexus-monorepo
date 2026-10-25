// Observe: the engine tracks steps another owner runs (the review sender's night asks and
// follow-ups, the Mac's drawings and notes) and judges them by evidence. Unreadable evidence is
// `unknown`, never success and never "nobody got it" (P6).

export type LedgerCounts = { total: number; not_cancelled: number; first_created_at?: string | null };
export type InvitationCounts = { night: LedgerCounts | null; followup: LedgerCounts | null };

export type Verdict = "ok" | "late" | "short" | "over" | "unknown" | "pending";
export type Judgement = { verdict: Verdict; summary: string; detail: Record<string, unknown> };

function counts(value: unknown): LedgerCounts | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const total = Number(row.total ?? row.made ?? row.rows ?? row.count);
  const notCancelled = Number(row.not_cancelled ?? row.posted ?? row.sent);
  if (!Number.isFinite(total) || !Number.isFinite(notCancelled)) return null;
  const first = row.first_created_at ?? row.group_email_at_utc;
  return { total, not_cancelled: notCancelled, ...(typeof first === "string" ? { first_created_at: first } : {}) };
}

/**
 * The `invitations?night=` rows. The preferred shape is {night: {total, not_cancelled},
 * followup: {total, not_cancelled}}; the GROUP_LEDGER_SQL tuples [ledger, night, total,
 * not_cancelled] and objects naming the ledger are read too (the route is B1's; §8 contract note).
 */
export function parseInvitations(rows: unknown, night: string): InvitationCounts {
  const out: InvitationCounts = { night: null, followup: null };
  if (rows && typeof rows === "object" && !Array.isArray(rows)) {
    const record = rows as Record<string, unknown>;
    out.night = counts(record.night);
    out.followup = counts(record.followup);
    return out;
  }
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    let ledger: unknown;
    let day: unknown;
    let value: LedgerCounts | null = null;
    if (Array.isArray(row)) {
      [ledger, day] = row;
      value = { total: Number(row[2]), not_cancelled: Number(row[3]) };
    } else if (row && typeof row === "object") {
      const record = row as Record<string, unknown>;
      ledger = record.ledger ?? record.which ?? record.series ?? record.name;
      day = record.night ?? record.day ?? record.date;
      value = counts(record);
    }
    if (day !== undefined && String(day).slice(0, 10) !== night) continue;
    if (!value || !Number.isFinite(value.total) || !Number.isFinite(value.not_cancelled)) continue;
    if (ledger === "night") out.night = value;
    if (ledger === "followup") out.followup = value;
  }
  return out;
}

/** A night ask: not started by started_by is late (A1); below the band short (A4); above it A9. */
export function judgeNight(expected: Record<string, unknown>, read: InvitationCounts | null, phase: string): Judgement {
  if (!read || !read.night) {
    return read ? { verdict: phase === "o1" ? "late" : "short", summary: "no invitations for this night", detail: { posted: 0 } } : { verdict: "unknown", summary: "invitations unreadable", detail: {} };
  }
  const posted = read.night.not_cancelled;
  const lo = Number(expected.lo);
  const hi = Number(expected.hi);
  const planned = Number(expected.count);
  const detail = { posted, made: read.night.total, planned, lo, hi };
  if (phase === "o1") return posted > 0 ? { verdict: "pending", summary: `${posted.toLocaleString("en-US")} posted so far`, detail } : { verdict: "late", summary: "no invitation posted yet", detail };
  if (Number.isFinite(hi) && posted > hi) return { verdict: "over", summary: `${posted.toLocaleString("en-US")} posted, above ${planned.toLocaleString("en-US")} + ${String(expected.within)}`, detail };
  if (Number.isFinite(lo) && posted < lo) return { verdict: "short", summary: `${posted.toLocaleString("en-US")} of ${planned.toLocaleString("en-US")} posted, below the band`, detail };
  return { verdict: "ok", summary: `${posted.toLocaleString("en-US")} of ${planned.toLocaleString("en-US")} posted`, detail };
}

/** A follow-up: rows present by window end + 15 m; the final read records the count. */
export function judgeFollowup(read: InvitationCounts | null, phase: string): Judgement {
  if (!read) return { verdict: "unknown", summary: "invitations unreadable", detail: {} };
  const posted = read.followup?.not_cancelled ?? 0;
  const detail = { posted, made: read.followup?.total ?? 0 };
  if (posted === 0) return { verdict: phase === "o1" ? "late" : "short", summary: "no follow-up rows", detail };
  return { verdict: "ok", summary: `${posted.toLocaleString("en-US")} follow-ups posted`, detail };
}

export type CampaignEvidence = {
  campaign_id: string | null;
  campaign_id_prefix?: string | null;
  name: string | null;
  resend_no?: number;
  want?: number | null;
  overrides?: Record<string, unknown> | null;
  status: string | null;
  sent_at: string | null;
  list_exact: number | null;
  received: number | null;
  trust: "aggregate" | "early_read" | "untrusted" | "log_only";
  resend_of?: string | null;
};

const TRUST_RANK = { aggregate: 3, log_only: 2, early_read: 1, untrusted: 0 } as const;

/**
 * One reading per campaign: a later aggregate read beats the LOG's number, which beats the
 * receipt's early read (G2's still-entered: 51 of 51 in the LOG over the receipt's 16).
 */
export function bestPerCampaign(campaigns: readonly CampaignEvidence[]): CampaignEvidence[] {
  const best = new Map<string, CampaignEvidence>();
  for (const campaign of campaigns) {
    const key = campaign.campaign_id ?? campaign.campaign_id_prefix ?? campaign.name ?? `resend ${campaign.resend_no ?? 0}`;
    const held = best.get(key);
    if (!held || TRUST_RANK[campaign.trust] > TRUST_RANK[held.trust]) best.set(key, campaign);
  }
  return [...best.values()];
}

/**
 * A Mac note (winner or still-entered): Sent by sent_by, received == want by received_by, counted
 * from trusted campaign aggregates (a resend's received adds to its original). `want` is the
 * engine's own planned audience (winners, or entries - winners - promoted).
 */
export function judgeMacNote(expected: Record<string, unknown>, campaigns: readonly CampaignEvidence[], want: number | null, now: Date): Judgement {
  const sentBy = Date.parse(String(expected.sent_by));
  const receivedBy = Date.parse(String(expected.received_by));
  const usable = campaigns.filter((campaign) => campaign.trust !== "untrusted");
  const sent = usable.filter((campaign) => (campaign.status ?? "").toLowerCase() === "sent" || campaign.sent_at);
  const detail: Record<string, unknown> = { want, campaigns: campaigns.length, sent: sent.length };
  if (sent.length === 0) {
    if (now.getTime() > sentBy) return { verdict: "late", summary: "not sent", detail };
    return { verdict: "pending", summary: "not sent yet", detail };
  }
  const counted = bestPerCampaign(usable.filter((campaign) => campaign.received !== null));
  const received = counted.reduce((sum, campaign) => sum + (campaign.received ?? 0), 0);
  const unknown = counted.length === 0;
  detail.received = unknown ? null : received;
  detail.receipt_kind = "campaign_only";
  if (unknown) return { verdict: now.getTime() > receivedBy ? "unknown" : "pending", summary: "sent; received not read", detail };
  if (want !== null && received < want) {
    return { verdict: now.getTime() > receivedBy ? "short" : "pending", summary: `${received} received of ${want} (campaign aggregate)`, detail };
  }
  return { verdict: "ok", summary: `${received} received of ${want ?? received} (campaign aggregate)`, detail };
}
