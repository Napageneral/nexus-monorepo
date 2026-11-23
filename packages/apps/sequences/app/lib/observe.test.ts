import { describe, expect, it } from "vitest";
import { bestPerCampaign, judgeFollowup, judgeMacNote, judgeNight, parseInvitations, type CampaignEvidence } from "./observe.js";

const expected = { count: 2690, within: "5%", lo: 2690 * 0.95, hi: 2690 * 1.05 };

describe("night and follow-up counts", () => {
  it("reads the preferred shape and the GROUP_LEDGER_SQL tuple and object shapes", () => {
    const counts = { night: { total: 2700, not_cancelled: 2640 }, followup: { total: 900, not_cancelled: 880 } };
    expect(parseInvitations(counts, "2026-10-24")).toEqual(counts);
    expect(parseInvitations([["night", "2026-10-24", 2700, 2640], ["night", "2026-10-23", 1, 1], ["followup", "2026-10-24", 900, 880]], "2026-10-24")).toEqual(counts);
    expect(parseInvitations([{ ledger: "night", night: "2026-10-24", made: 2700, posted: 2640 }], "2026-10-24").night).toEqual(counts.night);
  });

  it("judges against 2,690 ± 5%: late at o1 with nothing posted, short below, over above", () => {
    expect(judgeNight(expected, { night: { total: 0, not_cancelled: 0 }, followup: null }, "o1").verdict).toBe("late");
    expect(judgeNight(expected, { night: { total: 900, not_cancelled: 880 }, followup: null }, "o1").verdict).toBe("pending");
    expect(judgeNight(expected, { night: { total: 2600, not_cancelled: 2556 }, followup: null }, "o2").verdict).toBe("ok");
    expect(judgeNight(expected, { night: { total: 2600, not_cancelled: 2555 }, followup: null }, "o2").verdict).toBe("short");
    expect(judgeNight(expected, { night: { total: 2900, not_cancelled: 2825 }, followup: null }, "o2").verdict).toBe("over");
    expect(judgeNight(expected, null, "o2").verdict).toBe("unknown");
    expect(judgeFollowup({ night: null, followup: null }, "o1").verdict).toBe("late");
    expect(judgeFollowup({ night: null, followup: { total: 10, not_cancelled: 9 } }, "o2").summary).toBe("9 follow-ups posted");
  });
});

describe("Mac note evidence", () => {
  const winner = { sent_by: "2026-10-22T14:00:00Z", received_by: "2026-10-22T15:30:00Z" };
  const campaign = (patch: Partial<CampaignEvidence>): CampaignEvidence => ({ campaign_id: "01AAAAAAAA", name: "n", status: "Sent", sent_at: "2026-10-22T13:03:00Z", list_exact: 10, received: 10, trust: "aggregate", ...patch });

  it("is late with no Sent campaign past 09:00, and pending before", () => {
    expect(judgeMacNote(winner, [], 10, new Date("2026-10-22T14:01:00Z")).verdict).toBe("late");
    expect(judgeMacNote(winner, [], 10, new Date("2026-10-22T13:30:00Z")).verdict).toBe("pending");
  });

  it("adds a resend's receipts to the original and never counts an untrusted read", () => {
    const first = campaign({ received: 7, trust: "log_only" });
    const resend = campaign({ campaign_id: "01BBBBBBBB", received: 3, resend_of: "01AAAAAAAA" });
    const duplicate = campaign({ campaign_id: "01CCCCCCCC", received: 1, trust: "untrusted" });
    expect(judgeMacNote(winner, [first, resend, duplicate], 10, new Date("2026-10-22T16:00:00Z"))).toMatchObject({ verdict: "ok", detail: { received: 10, receipt_kind: "campaign_only" } });
    expect(judgeMacNote(winner, [first], 10, new Date("2026-10-22T16:00:00Z")).verdict).toBe("short");
    expect(judgeMacNote(winner, [first], 10, new Date("2026-10-22T15:00:00Z")).verdict).toBe("pending");
    expect(judgeMacNote(winner, [campaign({ received: null })], 10, new Date("2026-10-22T16:00:00Z")).verdict).toBe("unknown");
  });

  it("keeps one reading per campaign: an aggregate beats the LOG, which beats an early read (G2's 51 over 16)", () => {
    const early = campaign({ campaign_id: "01QZGJPC", received: 16, trust: "early_read" });
    const logged = campaign({ campaign_id: "01QZGJPC", received: 51, trust: "log_only" });
    expect(bestPerCampaign([early, logged]).map((entry) => entry.received)).toEqual([51]);
    expect(judgeMacNote({ sent_by: "2026-10-24T15:17:00Z", received_by: "2026-10-24T16:17:00Z" }, [early, logged], 51, new Date("2026-10-25T00:00:00Z")).verdict).toBe("ok");
  });
});
