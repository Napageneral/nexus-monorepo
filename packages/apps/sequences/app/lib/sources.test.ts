import { describe, expect, it } from "vitest";
import { fakeFetch } from "../test/fake-runtime.js";
import { answerSha256, contractProblem, entriesRowsOf, readDrand, readSource, sourcePath } from "./sources.js";

const access = { id: "test-id", secret: "test-secret" };
// A real answer from the ops API's own code (sequences_sources.finish_answer, run in Python): its
// sha256 is over the answer without ok, as_of, in_recovery and sha256, and the engine must agree.
const good = {
  ok: true, contract: "sequences_sources_v1", source: "invitations", params: { night: "2026-10-24" }, as_of: "2026-10-27T18:00:00Z", in_recovery: false, window_days: 10,
  rows: [{ ledger: "night", night: "2026-10-24", made: 2690, posted: 2595, first_created_at: "2026-10-25T00:17:30Z" }],
  count: 1, sha256: "3a71b2f067cb4b2edc576ceed1c8d29bf8022f02b4d5c13eb838064a8ecb8e35",
};
const noSleep = { sleep: async () => {} };

describe("the ops sources client", () => {
  it("sends the Access headers to the exact route and accepts the contract", async () => {
    const seen: Array<Record<string, string>> = [];
    const fetch = async (url: string, init: { headers: Record<string, string> }) => {
      seen.push({ url, ...init.headers });
      return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify(good) };
    };
    const read = await readSource("invitations", { night: "2026-10-24" }, access, { fetch, ...noSleep });
    expect(read).toMatchObject({ ok: true, sha_matches: true, url_path: "/invitations?night=2026-10-24" });
    expect(seen[0]).toEqual({ url: "https://ops.moonsleep.co/api/sequences/sources/invitations?night=2026-10-24", "CF-Access-Client-Id": "test-id", "CF-Access-Client-Secret": "test-secret", Accept: "application/json" });
  });

  it("holds with hold.source_stale on a broken contract, an address, or a 4xx; never treats it as data", async () => {
    expect(contractProblem({ ...good, contract: "x" })).toMatch(/contract/);
    expect(contractProblem({ ...good, as_of: undefined })).toMatch(/as_of/);
    expect(contractProblem({ ...good, rows: [1, 2], count: 1 })).toMatch(/count 1 but 2 rows/);
    expect(contractProblem({ ...good, rows: { who: "someone@example.test" } })).toMatch(/HR-21/);
    const forbidden = fakeFetch({ invitations: () => ({ status: 403 }) });
    expect(await readSource("invitations", { night: "2026-10-24" }, access, { fetch: forbidden.fetch, ...noSleep })).toMatchObject({ ok: false, code: "hold.source_stale", status: 403, attempts: 1 });
  });

  it("retries three times on transport errors, 5xx and 429 (honouring Retry-After), then reports unreachable", async () => {
    const waits: number[] = [];
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      if (calls === 1) throw new Error("ECONNRESET");
      if (calls === 2) return { status: 429, headers: { get: (name: string) => (name === "retry-after" ? "7" : null) }, text: async () => "" };
      if (calls === 3) return { status: 503, headers: { get: () => null }, text: async () => "" };
      return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify(good) };
    };
    const read = await readSource("invitations", { night: "2026-10-24" }, access, { fetch, sleep: async (ms) => void waits.push(ms) });
    expect(read).toMatchObject({ ok: true, attempts: 4 });
    expect(waits).toEqual([1000, 7000, 4000]);
    const down = fakeFetch({ invitations: () => ({ status: 502 }) });
    expect(await readSource("invitations", { night: "2026-10-24" }, access, { fetch: down.fetch, ...noSleep })).toMatchObject({ ok: false, code: "transient.ops_unreachable", attempts: 4 });
  });

  it("refuses without a credential and names only released routes", async () => {
    expect(await readSource("entries", {}, null)).toMatchObject({ ok: false, code: "transient.credentials_unavailable" });
    expect(() => sourcePath("desk_complaints", {})).toThrow(/not released/);
    expect(sourcePath("entries", { night: "2026-10-24", deadline: "2026-10-28T04:59:59.000Z", explain: "" })).toBe("/entries?night=2026-10-24&deadline=2026-10-28T04%3A59%3A59.000Z");
  });

  it("reads drand quicknet without a credential", async () => {
    const { fetch, seen } = fakeFetch({ "drand:round": () => ({ status: 200, body: { round: 33290248, randomness: "ab" } }) });
    expect(await readDrand(33290248, { fetch, ...noSleep })).toMatchObject({ ok: true, body: { round: 33290248 } });
    expect(seen).toEqual(["/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/33290248"]);
  });

  it("reads the ops API's entries layout: entrants in rows, group fields beside them, explain split", () => {
    const h = (n: number) => n.toString(16).padStart(64, "0");
    const answer = {
      ok: true, contract: "sequences_sources_v1", source: "entries", params: { night: "2026-10-24", deadline: "2026-10-25T04:59:59+00:00", explain: [h(2)] },
      as_of: "2026-10-25T13:00:30Z", in_recovery: true, group_size: 3, invitation_statuses: { sent: 2, "cancelled:klaviyo_bounced": 1 },
      group_email_at_utc: "2026-10-25T00:17:30Z", reviews_entered: 2, members: [h(3), h(1)],
      rows: [{ entry_id: `e_${h(1).slice(0, 16)}`, address_sha256: h(1), review_ids: ["rev_a", "rev_b"] }],
      review_entrants: [{ entry_id: `e_${h(1).slice(0, 16)}`, address_sha256: h(1), review_ids: ["rev_a", "rev_b"] }],
      explain: { hashes: [h(2)], invitations: [{ address_sha256: h(2), created_at: "2026-10-25T00:20:00Z", status: "cancelled:klaviyo_bounced", updated_at: "2026-10-25T13:10:00Z" }], reviews: [] },
      count: 1,
    };
    const rows = entriesRowsOf(answer);
    expect(rows).toMatchObject({ group_size: 3, reviews_entered: 2, group_email_at_utc: "2026-10-25T00:17:30Z", member_hashes: [h(1), h(3)] });
    expect(rows.review_entrants).toEqual([{ entry_id: `e_${h(1).slice(0, 16)}`, address_sha256: h(1), review_ids: ["rev_a", "rev_b"] }]);
    expect(rows.explain!.members).toEqual([{ address_sha256: h(2), created_at: "2026-10-25T00:20:00Z", invitation_status: "cancelled", last_error: "klaviyo_bounced", updated_at: "2026-10-25T13:10:00Z" }]);
    expect(answerSha256({ ...answer, ok: false, as_of: "x", in_recovery: false })).toBe(answerSha256(answer));
  });
});
