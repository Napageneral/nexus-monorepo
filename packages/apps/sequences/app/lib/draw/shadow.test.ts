import { describe, expect, it } from "vitest";
import { hash, labels, syntheticDrawing } from "../../test/synthetic.js";
import { entryIdOf } from "./rank.js";
import { classify, compareShadow, diffHashes, nearestRead, type EntriesRows, type MacDrawing, type Snapshot } from "./shadow.js";

const team = [hash("team-1")];
const committedAt = "2026-10-28T13:00:12Z";

function macFrom(input: Parameters<typeof syntheticDrawing>[0]): MacDrawing {
  const drawing = syntheticDrawing(input);
  return { ...drawing.receipt, entries: drawing.entries, free_hashes: drawing.free_hashes };
}

function readOf(labelsIn: string[], extra: Partial<EntriesRows> = {}, asOf = "2026-10-28T13:00:30Z"): Snapshot {
  return {
    phase: "s1",
    as_of: asOf,
    sha256: hash(`read-${asOf}`),
    rows: {
      group_size: 2600,
      invitation_statuses: { sent: 2500, submitted: 100 },
      group_email_at_utc: "2026-10-24T00:30:00+00:00",
      reviews_entered: labelsIn.length,
      review_entrants: labelsIn.map((label) => ({ address_sha256: hash(label), entry_id: entryIdOf(hash(label)), review_ids: [] })),
      ...extra,
    },
  };
}

describe("shadow compare", () => {
  const people = labels("g3", 40);

  it("passes when the engine's read reproduces the Mac's commit and ranking exactly", () => {
    const mac = macFrom({ night: "2026-10-24", drawing_no: 2, labels: people, seed: "g3d2", committedAt });
    const compare = compareShadow({ read: readOf(people), explain: null, mac, teamHashes: team, ledgerAtCommit: new Set() });
    expect(compare.pass).toBe(true);
    expect(compare.engine.entry_list_sha256).toBe(mac.commit.entry_list_sha256);
    expect(compare.engine.winners).toEqual(mac.winners);
    expect(compare.read.seconds_from_commit).toBe(18);
  });

  it("adds member free entries and drawing 1's carried free entrants, then removes team and the ledger", () => {
    const d1 = macFrom({ night: "2026-10-24", drawing_no: 1, labels: [...people.slice(0, 20), "free-carried"], free: ["free-carried"], seed: "g3d1", committedAt: "2026-10-25T13:00:05Z" });
    const winnerOfD1 = people[0]!;
    const macLabels = [...people.slice(1), "free-new", "free-carried"];
    const mac = macFrom({ night: "2026-10-24", drawing_no: 2, labels: macLabels, free: ["free-new", "free-carried"], seed: "g3d2", committedAt });
    mac.commit.left_out_earlier_winners_or_team = 2; // the earlier winner and the team member
    const read = readOf([...people, "team-1"], { member_hashes: [hash("free-new"), hash("free-carried")], reviews_entered: people.length + 1 });
    mac.commit.reviews_entered = people.length + 1;
    const compare = compareShadow({ read, explain: null, mac, drawing1: d1, teamHashes: team, ledgerAtCommit: new Set([entryIdOf(hash(winnerOfD1))]) });
    expect(compare.mismatched).toEqual([]);
    expect(compare.pass).toBe(true);
  });

  it("classifies each difference from the explain rows", () => {
    const mac = macFrom({ night: "2026-10-24", drawing_no: 2, labels: people, seed: "g3d2", committedAt });
    const read = readOf(people.slice(0, 38), {}, "2026-10-28T13:00:30Z");
    const rejected = hash(people[38]!);
    const bounced = hash(people[39]!);
    const explain = {
      reviews: [{ address_sha256: rejected, moderation_status: "rejected", rejected_at: "2026-10-28T13:00:20Z", updated_at: "2026-10-28T13:00:20Z" }],
      members: [{ address_sha256: bounced, invitation_status: "cancelled", last_error: "klaviyo_bounced", updated_at: "2026-10-28T13:00:25Z" }],
    };
    const compare = compareShadow({ read, explain, mac, teamHashes: team, ledgerAtCommit: new Set() });
    expect(compare.pass).toBe(false);
    expect(compare.mismatched).toContain("entry_list_sha256");
    expect(compare.diffs.map((diff) => diff.class).sort()).toEqual(["invitation_cancelled_after_commit", "review_rejected_after_commit"]);
    expect(compare.unexplained).toBe(0);
    expect(diffHashes(compare, mac, read)).toEqual([bounced, rejected].sort());
  });

  it("calls a difference with no explaining row unexplained, and a row that moved in between an as-of gap", () => {
    expect(classify("e_1", hash("x"), "engine_only", null, committedAt, "2026-10-28T13:00:30Z").class).toBe("unexplained");
    const moved = { reviews: [{ address_sha256: hash("x"), updated_at: "2026-10-28T13:00:28Z" }] };
    expect(classify("e_1", hash("x"), "engine_only", moved, committedAt, "2026-10-28T13:00:30Z").class).toBe("as_of_gap");
  });

  it("picks the read nearest the commit, never the close read", () => {
    const reads = [
      { ...readOf([], {}, "2026-10-28T05:04:59Z"), phase: "s0" },
      { ...readOf([], {}, "2026-10-28T13:00:30Z"), phase: "s1" },
      { ...readOf([], {}, "2026-10-28T13:05:00Z"), phase: "s2" },
    ];
    expect(nearestRead(reads, committedAt)!.phase).toBe("s1");
    expect(nearestRead(reads, "2026-10-28T13:04:00Z")!.phase).toBe("s2");
  });
});
