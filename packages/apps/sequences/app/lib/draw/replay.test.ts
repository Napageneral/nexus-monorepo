import { createHash } from "node:crypto";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { hash, labels, ledgerOf, syntheticDrawing } from "../../test/synthetic.js";
import { entryListSha256 } from "./rank.js";
import { replayAll, verifyDrawing, type DrawingInput } from "./replay.js";

const team = [hash("team-1"), hash("team-2")];
const statusOf = (result: ReturnType<typeof replayAll>, night: string, id: string) =>
  result.drawings.find((drawing) => drawing.night === night)!.checks.find((check) => check.id === id)!.status;

describe("replay V1-V10 on synthetic drawings", () => {
  const g1 = syntheticDrawing({ night: "2026-10-21", drawing_no: 1, labels: labels("g1", 87), seed: "g1", committedAt: "2026-10-22T13:00:16Z" });
  const g2 = syntheticDrawing({ night: "2026-10-23", drawing_no: 1, labels: labels("g2", 61), seed: "g2", committedAt: "2026-10-24T22:04:00Z" });

  it("passes two honest drawings and their ledger", () => {
    const result = replayAll([g2, g1], ledgerOf([g1, g2]), team);
    expect(result.pass).toBe(true);
    expect(result.drawings.map((drawing) => drawing.night)).toEqual(["2026-10-21", "2026-10-23"]);
    expect(result.drawings[0]!.checks.map((check) => `${check.id}:${check.status}`)).toEqual([
      "V1:PASS", "V2:PASS", "V3:PASS", "V4:PASS", "V5:PASS", "V6:PASS", "V8.team:PASS", "V9:UNKNOWN", "V10:PENDING", "V8.ledger:PASS",
    ]);
    expect(result.final_ledger).toHaveLength(20);
  });

  it("fails V1, V2, V3 and V4 on tampered receipts", () => {
    const unsorted = structuredClone(g1);
    unsorted.receipt.entry_ids.reverse();
    expect(verifyDrawing(unsorted, new Set()).find((check) => check.id === "V1")!.status).toBe("FAIL");
    const badSha = structuredClone(g1);
    badSha.receipt.commit.entry_list_sha256 = entryListSha256(["e_0000000000000000"]);
    expect(verifyDrawing(badSha, new Set()).find((check) => check.id === "V2")!.status).toBe("FAIL");
    const early = structuredClone(g1);
    early.receipt.commit.drand_round = 1000;
    expect(verifyDrawing(early, new Set()).find((check) => check.id === "V3")!.status).toBe("FAIL");
    const swapped = structuredClone(g1);
    [swapped.receipt.winners[0], swapped.receipt.alternates[0]] = [swapped.receipt.alternates[0]!, swapped.receipt.winners[0]!];
    expect(verifyDrawing(swapped, new Set()).find((check) => check.id === "V4")!.status).toBe("FAIL");
  });

  it("checks entries (V6), team (V8) and the beacon (V9)", () => {
    const badEntry = structuredClone(g1);
    badEntry.entries[0]!.address_sha256 = hash("someone-else");
    expect(verifyDrawing(badEntry, new Set()).find((check) => check.id === "V6")!.status).toBe("FAIL");
    const teamIn = syntheticDrawing({ night: "2026-10-24", drawing_no: 1, labels: ["team-1", ...labels("g3", 20)], seed: "g3", committedAt: "2026-10-25T13:00:10Z" });
    expect(verifyDrawing(teamIn, new Set(team)).find((check) => check.id === "V8.team")!.status).toBe("FAIL");
    // drand randomness is sha256 over the signature bytes.
    const signature = "ab".repeat(48);
    const withBeacon = structuredClone(g1);
    withBeacon.receipt.drand_randomness = createHash("sha256").update(Buffer.from(signature, "hex")).digest("hex");
    withBeacon.beacon = { round: g1.receipt.commit.drand_round, randomness: withBeacon.receipt.drand_randomness, signature };
    expect(verifyDrawing(withBeacon, new Set()).find((check) => check.id === "V9")!.status).toBe("PASS");
    withBeacon.beacon.randomness = hash("other");
    expect(verifyDrawing(withBeacon, new Set()).find((check) => check.id === "V9")!.status).toBe("FAIL");
  });

  it("interleaves promotions by time: the first alternate not used and not in the ledger (V5)", () => {
    // g2's first alternate also won g1's drawing 2 committed before g2's promotion, so it is skipped.
    const g2d1 = syntheticDrawing({ night: "2026-10-23", drawing_no: 1, labels: labels("g2", 30), seed: "g2", committedAt: "2026-10-24T22:04:00Z" });
    const takenAlternate = g2d1.receipt.alternates[0]!;
    const takenLabel = labels("g2", 30).find((label) => `e_${hash(label).slice(0, 16)}` === takenAlternate)!;
    let g1d2: DrawingInput | null = null;
    for (let seed = 0; seed < 400 && !g1d2; seed += 1) {
      const candidate = syntheticDrawing({ night: "2026-10-21", drawing_no: 2, labels: [takenLabel, ...labels("g1b", 15)], seed: `g1d2-${seed}`, committedAt: "2026-10-25T13:00:05Z" });
      if (candidate.receipt.winners.includes(takenAlternate)) g1d2 = candidate;
    }
    expect(g1d2).not.toBeNull();
    const replaced = g2d1.receipt.winners[3]!;
    const promoted = structuredClone(g2d1);
    promoted.receipt.promoted = [{ replaces: replaced, entry_id: g2d1.receipt.alternates[1]!, why: "unclaimed", at_utc: "2026-10-31T06:00:00Z" }];
    const ok = replayAll([promoted, g1d2!], ledgerOf([promoted, g1d2!]), team);
    expect(statusOf(ok, "2026-10-23", "V5")).toBe("PASS");
    expect(ok.pass).toBe(true);
    const wrong = structuredClone(promoted);
    wrong.receipt.promoted[0]!.entry_id = takenAlternate;
    const bad = replayAll([wrong, g1d2!], ledgerOf([wrong, g1d2!]), team);
    expect(statusOf(bad, "2026-10-23", "V5")).toBe("FAIL");
  });

  it("fails V7 when winners.json and the receipts disagree, and V8 when a winner re-enters", () => {
    const ledger = ledgerOf([g1, g2]);
    delete ledger[Object.keys(ledger)[0]!];
    expect(replayAll([g1, g2], ledger, team).ledger.status).toBe("FAIL");
    const reenter = syntheticDrawing({ night: "2026-10-24", drawing_no: 1, labels: [...labels("g3", 12), "g1-0", "g1-1", "g1-2", "g1-3", "g1-4", "g1-5", "g1-6", "g1-7", "g1-8", "g1-9", ...labels("g1", 87).slice(10)], seed: "g3", committedAt: "2026-10-25T13:00:10Z" });
    const result = replayAll([g1, reenter], ledgerOf([g1, reenter]), team);
    expect(statusOf(result, "2026-10-24", "V8.ledger")).toBe("FAIL");
  });
});

// T1.5: the real October bundle, built on the Mac by scripts/sequences_import.py --all (no push).
// Set SEQUENCES_REPLAY_BUNDLE=<path> to run it; it prints counts and statuses only, never hashes.
describe.runIf(Boolean(process.env.SEQUENCES_REPLAY_BUNDLE))("replay the October bundle (SEQUENCES_REPLAY_BUNDLE)", () => {
  it("reproduces every drawing in the bundle", () => {
    const bundle = JSON.parse(fs.readFileSync(process.env.SEQUENCES_REPLAY_BUNDLE!, "utf8"));
    const result = replayAll(bundle.drawings, bundle.ledger, bundle.team_hashes);
    const lines = result.drawings.map((drawing) => `${drawing.night} d${drawing.drawing_no}: ${drawing.checks.map((check) => `${check.id} ${check.status}`).join(", ")}`);
    console.log([...lines, `V7 ${result.ledger.status}: ${result.ledger.detail}`].join("\n"));
    for (const drawing of result.drawings) {
      for (const check of drawing.checks.filter((entry) => !["V9", "V10"].includes(entry.id))) {
        expect(check.status, `${drawing.night} d${drawing.drawing_no} ${check.id}`).toBe(process.env.SEQUENCES_REPLAY_NO_ENTRIES === "1" && check.id === "V6" ? check.status : "PASS");
      }
    }
    expect(result.ledger.status).toBe("PASS");
  });
});
