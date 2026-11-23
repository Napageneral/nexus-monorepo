// The draw_group.py v3 ranking, lifted unchanged (draw_group.py:124-146, 204-206):
//   ranked = sorted(ids, key=lambda k: sha256(bytes.fromhex(seed) + k.encode()).hexdigest())
// 32 randomness bytes followed by the ASCII entry id, lowest hex first. Entry ids are ASCII, so
// JavaScript's default string sort equals Python's.
import { createHash } from "node:crypto";

export const QUICKNET_CHAIN = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
export const QUICKNET_LABEL = "quicknet 52db9ba7";
export const QUICKNET_GENESIS = 1692803367;
export const QUICKNET_PERIOD_S = 3;
export const PICK_WINNERS = 10;
export const PICK_ALTERNATES = 10;
export const ENTRY_ID_RE = /^e_[0-9a-f]{16}$/;

export function entryIdOf(addressSha256: string): string {
  return `e_${addressSha256.slice(0, 16)}`;
}

export function rankKey(seed: Buffer, id: string): string {
  return createHash("sha256").update(Buffer.concat([seed, Buffer.from(id, "utf8")])).digest("hex");
}

export function rank(randomnessHex: string, ids: readonly string[]): string[] {
  if (!/^[0-9a-f]{64}$/.test(randomnessHex)) throw new Error("rank: randomness must be 32 bytes of lowercase hex");
  const seed = Buffer.from(randomnessHex, "hex");
  const keyed = ids.map((id) => ({ id, key: rankKey(seed, id) }));
  keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return keyed.map((entry) => entry.id);
}

/** Fewer than `winners` entrants: all win, and there are fewer (or no) alternates. */
export function pick(ranked: readonly string[], winners = PICK_WINNERS, alternates = PICK_ALTERNATES): { winners: string[]; alternates: string[] } {
  return { winners: ranked.slice(0, Math.min(winners, ranked.length)), alternates: ranked.slice(winners, winners + alternates) };
}

/** When drand publishes a quicknet round (seconds since the epoch). */
export function roundPublishedAt(round: number): number {
  return QUICKNET_GENESIS + (round - 1) * QUICKNET_PERIOD_S;
}

export function entryListSha256(ids: readonly string[]): string {
  return createHash("sha256").update(ids.join("\n"), "utf8").digest("hex");
}
