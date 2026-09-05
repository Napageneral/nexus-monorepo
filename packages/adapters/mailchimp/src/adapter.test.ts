import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { __test__ } from "./adapter.js";
import { startProviderStub, type ProviderStub, type StubFixture, type StubMessage } from "./provider-stub.js";

const client = {
  connectionId: "moon-mailchimp",
  accountLabel: "MoonSleep Mailchimp",
  marketingApiKey: "secret-us20",
  transactionalApiKey: "secret",
  marketingBaseUrl: "https://us20.api.mailchimp.com/3.0",
  transactionalBaseUrl: "https://mandrillapp.com/api/1.0",
  fetchFn: fetch,
  runtimeConfig: {},
};

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

function campaign(id: string, sendTime: Date, recipients: number) {
  return {
    id,
    send_time: sendTime.toISOString(),
    subject: `Update ${id}`,
    recipients: Array.from({ length: recipients }, (_, index) => ({
      email_id: `${id}-r${index}`,
      email_address: `customer-${index}@example.com`,
    })),
  };
}

function message(index: number, sentAt: Date, extra: Partial<StubMessage> = {}): StubMessage {
  return {
    _id: `msg-${index}`,
    ts: Math.floor(sentAt.getTime() / 1000),
    email: `customer-${index}@example.com`,
    subject: "An update on your MoonSleep order",
    state: "sent",
    ...extra,
  };
}

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

async function stubbedClient(fixture: StubFixture, runtimeConfig: Record<string, unknown> = {}) {
  const stub = await startProviderStub(fixture);
  const stateDir = mkdtempSync(join(tmpdir(), "mailchimp-adapter-"));
  const previous = process.env.NEXUS_ADAPTER_STATE_DIR;
  process.env.NEXUS_ADAPTER_STATE_DIR = stateDir;
  cleanups.push(async () => {
    await stub.close();
    rmSync(stateDir, { recursive: true, force: true });
    if (previous === undefined) delete process.env.NEXUS_ADAPTER_STATE_DIR;
    else process.env.NEXUS_ADAPTER_STATE_DIR = previous;
  });
  return {
    stub,
    stateDir,
    client: {
      ...client,
      marketingBaseUrl: stub.marketingBaseUrl,
      transactionalBaseUrl: stub.transactionalBaseUrl,
      runtimeConfig,
    },
  };
}

function receipts(stateDir: string): Record<string, unknown>[] {
  const root = join(stateDir, "ingestion-run-history");
  return readdirSync(root)
    .sort()
    .map((name) => JSON.parse(readFileSync(join(root, name), "utf8")) as Record<string, unknown>);
}

async function backfill(stubbed: Awaited<ReturnType<typeof stubbedClient>>, since: Date, to: Date) {
  const emitted: Array<{ payload: { external_record_id: string; timestamp: number; metadata?: Record<string, unknown> } }> = [];
  await __test__.ingestWindow(stubbed.client, { since, to }, (record) => emitted.push(record), { kind: "backfill" });
  return emitted;
}

const ids = (records: Array<{ payload: { external_record_id: string } }>) =>
  records.map((record) => record.payload.external_record_id);

const timestamps = (records: Array<{ payload: { timestamp: number } }>) =>
  records.map((record) => record.payload.timestamp);

const isNonDecreasing = (values: number[]) => values.every((value, index) => index === 0 || value >= values[index - 1]!);

function stageDirectory(): string {
  const dir = mkdtempSync(join(tmpdir(), "mailchimp-stage-test-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

type StagedRecord = { payload: { external_record_id: string; timestamp: number; metadata?: Record<string, unknown> } };

function chunkLines(path: string): StagedRecord[] {
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as StagedRecord);
}

describe("Mailchimp read-only evidence adapter", () => {
  it("grounds the connection in a stable local receiver contact", () => {
    expect(__test__.connectionIdentity(client)).toMatchObject({
      id: "moon-mailchimp",
      account: "MoonSleep Mailchimp",
      account_contact: {
        platform: "mailchimp",
        space_id: "moon-mailchimp",
        contact_id: "moon-mailchimp",
      },
    });
  });

  it("returns the same authoritative account contact from provider health", async () => {
    const result = await __test__.health({
      ...client,
      fetchFn: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    });
    expect(result).toMatchObject({
      connected: true,
      connection_id: "moon-mailchimp",
      account: "MoonSleep Mailchimp",
      account_contact: {
        platform: "mailchimp",
        space_id: "moon-mailchimp",
        contact_id: "moon-mailchimp",
      },
    });
  });

  it("derives the Marketing datacenter from the key suffix", () => {
    expect(__test__.marketingDatacenter("abc-us20")).toBe("us20");
    expect(__test__.marketingDatacenter("abc-us20", "us99")).toBe("us99");
  });

  it("normalizes recipient identity without retaining the email", () => {
    const expectedHash = __test__.normalizedEmailHash(" Customer@Example.com ");
    const record = __test__.marketingRecipientRecord(
      client,
      { id: "campaign-1", send_time: "2026-08-14T12:00:00Z", settings: { subject_line: "Order update" } },
      { email_id: "recipient-1", email_address: "Customer@Example.com", activity: [{ action: "sent" }] },
    );

    expect(record.payload.metadata?.recipient_email_sha256).toBe(expectedHash);
    expect(JSON.stringify(record)).not.toContain("Customer@Example.com");
    expect(record.payload.metadata?.read_only_source).toBe(true);
    expect(record.payload.metadata?.delivery_state).toBe("verified_delivered");
  });

  it("stores campaign content once instead of repeating it for every recipient", () => {
    const record = __test__.marketingCampaignRecord(
      client,
      { id: "campaign-1", send_time: "2026-08-14T12:00:00Z", settings: { subject_line: "Order update" } },
      { plain_text: "Your order is still moving." },
    );
    expect(record.payload.external_record_id).toContain("marketing-campaign:campaign-1");
    expect(record.payload.content).toContain("Your order is still moving.");
  });

  it("projects Transactional history without retaining raw recipient email", () => {
    const record = __test__.transactionalRecord(client, {
      _id: "message-1",
      email: "customer@example.com",
      subject: "MoonSleep order update",
      state: "sent",
      ts: 1786708800,
    });

    expect(record.payload.external_record_id).toContain("transactional:message-1");
    expect(record.payload.metadata?.direction).toBe("moonsleep_to_customer");
    expect(JSON.stringify(record)).not.toContain("customer@example.com");
  });

  it("admits a capped current tail only when it overlaps the durable cursor", async () => {
    const calls: Array<{ date_from: string; date_to: string; limit: number }> = [];
    const messages = Array.from({ length: 999 }, (_, index) => ({
      _id: `message-${index}`,
      email: `customer-${index}@example.com`,
      state: "sent",
      ts: 100 + index,
    }));
    messages.push({ ...messages[0]! });
    const cappedClient = {
      ...client,
      fetchFn: async (_url: URL | RequestInfo, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body)) as {
          date_from: string;
          date_to: string;
          limit: number;
        };
        calls.push(payload);
        return new Response(JSON.stringify(messages));
      },
    };
    const emitted: unknown[] = [];
    const stats = await __test__.searchTransactionalTail(
      cappedClient,
      new Date("2026-08-17T00:00:00Z"),
      new Date("2026-08-17T04:00:00Z"),
      (record) => emitted.push(record),
      new Date(500 * 1000),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      date_from: "2026-08-17",
      date_to: "2026-08-17",
      limit: 1000,
    });
    expect(stats).toMatchObject({
      source: "search",
      capObserved: true,
      continuityProven: true,
      historicalGapDetected: false,
      searchCandidateCount: 1000,
      emittedCount: 999,
      deduplicatedCount: 1,
      oldestMessageAt: "1970-01-01T00:01:40.000Z",
      newestMessageAt: "1970-01-01T00:18:18.000Z",
    });
    expect(emitted).toHaveLength(999);
    expect(JSON.stringify(emitted)).not.toContain("@example.com");
  });

  it("records historical debt while establishing a capped monitor bootstrap", async () => {
    const cappedClient = {
      ...client,
      fetchFn: async () => new Response(JSON.stringify(
        Array.from({ length: 1000 }, (_, index) => ({ _id: `capped-${index}`, ts: 100 + index })),
      )),
    };
    const stats = await __test__.searchTransactionalTail(
      cappedClient,
      new Date("2026-08-17T00:00:00Z"),
      new Date("2026-08-17T04:00:00Z"),
      () => undefined,
    );
    expect(stats.capObserved).toBe(true);
    expect(stats.continuityProven).toBe(false);
    expect(stats.historicalGapDetected).toBe(true);
  });

  it("fails closed when a capped current tail no longer overlaps its cursor", async () => {
    const cappedClient = {
      ...client,
      fetchFn: async () => new Response(JSON.stringify(
        Array.from({ length: 1000 }, (_, index) => ({ _id: `capped-${index}`, ts: 100 + index })),
      )),
    };
    await expect(__test__.searchTransactionalTail(
      cappedClient,
      new Date("2026-08-17T00:00:00Z"),
      new Date("2026-08-17T04:00:00Z"),
      () => undefined,
      new Date(50 * 1000),
    )).rejects.toThrow("no longer overlaps the durable cursor");
  });

  it("creates stable export evidence without retaining raw recipient email", () => {
    const row = {
      Date: "2026-08-14 12:00:00",
      "Email Address": "customer@example.com",
      Subject: "Order #1234 update",
      Status: "sent",
    };
    const hash = __test__.normalizedEmailHash(row["Email Address"]);
    const ref = __test__.transactionalExportMessageRef(row, hash, 0);
    const first = __test__.transactionalExportRecord(client, row, ref);
    const replay = __test__.transactionalExportRecord(client, row, ref);
    expect(ref).toMatch(/^export:[0-9a-f]{64}$/u);
    expect(first.payload.external_record_id).toBe(`mailchimp:moon-mailchimp:transactional:${ref}`);
    expect(first.payload.external_record_id).toBe(replay.payload.external_record_id);
    expect(first.payload.metadata?.delivery_state).toBe("verified_delivered");
    expect(JSON.stringify(first)).not.toContain("customer@example.com");
  });

  it("keeps export identity stable across delivery-state revisions", () => {
    const sent = {
      Date: "2026-08-14 12:00:00",
      "Email Address": "customer@example.com",
      Subject: "Order #1234 update",
      Status: "sent",
    };
    const delivered = { ...sent, Status: "delivered" };
    const hash = __test__.normalizedEmailHash(sent["Email Address"]);
    expect(__test__.transactionalExportMessageRef(sent, hash, 0)).toBe(
      __test__.transactionalExportMessageRef(delivered, hash, 0),
    );
    const first = __test__.transactionalExportRecord(client, sent, "export:same");
    const revision = __test__.transactionalExportRecord(client, delivered, "export:same");
    expect(first.payload.external_record_id).toBe(revision.payload.external_record_id);
    expect(first.payload.metadata?.revision_hash).not.toBe(revision.payload.metadata?.revision_hash);
  });

  it("lands an export row that carries the provider message id under the search identity", () => {
    expect(__test__.transactionalExportMessageRef({ "Message ID": "provider-1", Status: "sent" }, "hash", 0))
      .toBe("provider-1");
    expect(__test__.transactionalExportMessageRef({ "Message ID": "provider-1", Status: "bounced" }, "hash", 3))
      .toBe("provider-1");
  });

  it("aligns the export bounds to the whole days the search covers", () => {
    expect(__test__.exportDateBounds(new Date("2026-08-12T06:30:00Z"), new Date("2026-08-17T21:53:00Z"))).toEqual({
      date_from: "2026-08-12 00:00:00",
      date_to: "2026-08-17 23:59:59",
    });
  });
});

describe("explicit backfill windows", () => {
  it("uses the search inside the horizon and lands every record under its provider id", async () => {
    const stubbed = await stubbedClient({
      campaigns: [campaign("c1", daysAgo(3), 3), campaign("c2", daysAgo(2), 2), campaign("old", daysAgo(40), 5)],
      messages: [message(1, daysAgo(2)), message(2, daysAgo(1)), message(3, daysAgo(60))],
    });
    const emitted = await backfill(stubbed, daysAgo(5), new Date());

    expect(ids(emitted).sort()).toEqual([
      "mailchimp:moon-mailchimp:marketing-campaign:c1",
      "mailchimp:moon-mailchimp:marketing:c1:c1-r0",
      "mailchimp:moon-mailchimp:marketing:c1:c1-r1",
      "mailchimp:moon-mailchimp:marketing:c1:c1-r2",
      "mailchimp:moon-mailchimp:marketing-campaign:c2",
      "mailchimp:moon-mailchimp:marketing:c2:c2-r0",
      "mailchimp:moon-mailchimp:marketing:c2:c2-r1",
      "mailchimp:moon-mailchimp:transactional:msg-1",
      "mailchimp:moon-mailchimp:transactional:msg-2",
    ].sort());
    expect(isNonDecreasing(timestamps(emitted))).toBe(true);
    expect(stubbed.stub.calls.some((call) => call.includes("/exports/"))).toBe(false);
    expect(JSON.stringify(emitted)).not.toContain("@example.com");
    expect(receipts(stubbed.stateDir)).toEqual([
      expect.objectContaining({
        contract_version: "nexus_mailchimp_ingestion_run_v3",
        result: "succeeded",
        mode: "backfill",
        campaign_count: 2,
        campaign_record_count: 2,
        recipient_record_count: 5,
        transactional_source: "search",
        transactional_export_reason: null,
        transactional_search_candidate_count: 2,
        transactional_emitted_count: 2,
        total_emitted_count: 9,
      }),
    ]);
  });

  it("uses the activity export beyond the search horizon and reuses search identities for rows it saw", async () => {
    const stubbed = await stubbedClient({
      campaigns: [campaign("c1", daysAgo(45), 2)],
      messages: [message(1, daysAgo(45)), message(2, daysAgo(44)), message(3, daysAgo(2)), message(4, daysAgo(1))],
      search: { horizon_days: 7 },
    });
    const emitted = await backfill(stubbed, daysAgo(60), new Date());

    const transactional = ids(emitted).filter((id) => id.includes(":transactional:"));
    expect(transactional).toHaveLength(4);
    expect(transactional.filter((id) => /:transactional:msg-[34]$/u.test(id))).toHaveLength(2);
    expect(transactional.filter((id) => /:transactional:export:[0-9a-f]{64}$/u.test(id))).toHaveLength(2);
    expect(new Set(transactional).size).toBe(4);
    expect(stubbed.stub.calls).toContain("POST /api/1.0/exports/activity.json");
    expect(receipts(stubbed.stateDir)[0]).toMatchObject({
      result: "succeeded",
      transactional_source: "export",
      transactional_export_reason: "beyond_search_horizon",
      transactional_export_id: "export-1",
      transactional_search_candidate_count: 2,
      transactional_export_row_count: 4,
      transactional_export_search_matched_count: 2,
      transactional_emitted_count: 4,
      transactional_deduplicated_count: 0,
      total_emitted_count: 7,
    });
  });

  it("falls back to the export when the search cap would truncate the window", async () => {
    const recent = Array.from({ length: 1000 }, (_, index) => message(index, new Date(Date.now() - index * 60_000)));
    const older = Array.from({ length: 5 }, (_, index) => message(2000 + index, daysAgo(3)));
    const stubbed = await stubbedClient({ campaigns: [], messages: [...recent, ...older] });
    const emitted = await backfill(stubbed, daysAgo(5), new Date());

    expect(emitted).toHaveLength(1005);
    expect(new Set(ids(emitted)).size).toBe(1005);
    expect(ids(emitted).filter((id) => id.includes(":transactional:export:"))).toHaveLength(5);
    expect(receipts(stubbed.stateDir)[0]).toMatchObject({
      transactional_source: "export",
      transactional_export_reason: "search_cap",
      transactional_search_cap_observed: true,
      transactional_search_candidate_count: 1000,
      transactional_export_row_count: 1005,
      transactional_export_search_matched_count: 1000,
    });
  });

  it("fails closed with the reason when the export no longer covers a window the search still sees", async () => {
    const stubbed = await stubbedClient({
      campaigns: [campaign("c1", daysAgo(20), 1)],
      messages: [message(1, daysAgo(20)), message(2, daysAgo(19))],
      export: { retained_rows: 1 },
    });
    await expect(backfill(stubbed, daysAgo(30), new Date())).rejects.toThrow(
      "export does not cover the window (beyond_search_horizon): the export returned 1 rows but the search found 2 messages",
    );
    expect(receipts(stubbed.stateDir)[0]).toMatchObject({
      result: "failed",
      error_class: "Error",
      campaign_record_count: 0,
      recipient_record_count: 0,
      transactional_source: null,
      total_emitted_count: 0,
    });
  });

  it("emits both sources in non-decreasing timestamp order whatever order the provider lists campaigns", async () => {
    const base = Math.floor(daysAgo(45).getTime() / 1000) * 1000;
    const at = (offsetMs: number) => new Date(base + offsetMs);
    const stubbed = await stubbedClient({
      campaigns: [campaign("later", at(DAY_MS), 1), campaign("earlier", at(0), 2)],
      messages: [message(1, at(-60_000)), message(2, at(DAY_MS + 60_000)), message(3, at(30 * DAY_MS))],
      search: { horizon_days: 7 },
    });
    const emitted = await backfill(stubbed, daysAgo(60), new Date());

    expect(ids(emitted)).toEqual([
      expect.stringMatching(/:transactional:export:[0-9a-f]{64}$/u),
      "mailchimp:moon-mailchimp:marketing-campaign:earlier",
      "mailchimp:moon-mailchimp:marketing:earlier:earlier-r0",
      "mailchimp:moon-mailchimp:marketing:earlier:earlier-r1",
      "mailchimp:moon-mailchimp:marketing-campaign:later",
      "mailchimp:moon-mailchimp:marketing:later:later-r0",
      expect.stringMatching(/:transactional:export:[0-9a-f]{64}$/u),
      expect.stringMatching(/:transactional:export:[0-9a-f]{64}$/u),
    ]);
    expect(isNonDecreasing(timestamps(emitted))).toBe(true);
  });

  it("uses a provider message id column when the export carries one", async () => {
    const stubbed = await stubbedClient({
      campaigns: [],
      messages: [message(1, daysAgo(20)), message(2, daysAgo(19))],
      search: { horizon_days: 7 },
      export: { message_id_column: true },
    });
    const emitted = await backfill(stubbed, daysAgo(30), new Date());
    expect(ids(emitted).sort()).toEqual([
      "mailchimp:moon-mailchimp:transactional:msg-1",
      "mailchimp:moon-mailchimp:transactional:msg-2",
    ]);
    expect(emitted[0]!.payload.metadata?.provider_export_id).toBeUndefined();
    expect(receipts(stubbed.stateDir)[0]).toMatchObject({ transactional_export_id: "export-1" });
  });

  it("emits an export row identically whichever export served it", async () => {
    const stubbed = await stubbedClient({
      campaigns: [],
      messages: [message(1, daysAgo(30)), message(2, daysAgo(25))],
    });
    const wide = await backfill(stubbed, daysAgo(40), daysAgo(20));
    const narrow = await backfill(stubbed, daysAgo(28), daysAgo(20));

    expect(stubbed.stub.calls.filter((call) => call === "POST /api/1.0/exports/activity.json")).toHaveLength(2);
    expect(receipts(stubbed.stateDir).map((receipt) => receipt.transactional_export_id)).toEqual(["export-1", "export-2"]);
    expect(narrow).toHaveLength(1);
    expect(narrow[0]).toEqual(wide.find((record) => record.payload.external_record_id === narrow[0]!.payload.external_record_id));
  });

  it("replays a window identically and reuses the export checkpoint", async () => {
    const stubbed = await stubbedClient({
      campaigns: [campaign("c1", daysAgo(30), 2)],
      messages: [message(1, daysAgo(30))],
      export: { pending_polls: 1 },
    }, { transactional_export_poll_ms: 10 });
    const first = await backfill(stubbed, daysAgo(40), daysAgo(20));
    const second = await backfill(stubbed, daysAgo(40), daysAgo(20));

    expect(ids(second)).toEqual(ids(first));
    expect(stubbed.stub.calls.filter((call) => call === "POST /api/1.0/exports/activity.json")).toHaveLength(1);
    const [one, two] = receipts(stubbed.stateDir);
    expect(one?.output_digest).toBe(two?.output_digest);
    expect(two).toMatchObject({ transactional_export_id: "export-1", transactional_emitted_count: 1 });
  });

  it("replaces a checkpointed export the provider no longer knows", async () => {
    const stubbed = await stubbedClient({
      campaigns: [],
      messages: [message(1, daysAgo(30))],
    });
    const bounds = __test__.exportDateBounds(daysAgo(40), daysAgo(20));
    const checkpointPath = join(
      stubbed.stateDir,
      `transactional-export-${createHash("sha256").update(`${client.connectionId}\n${bounds.date_from}\n${bounds.date_to}`).digest("hex")}.json`,
    );
    writeFileSync(checkpointPath, JSON.stringify({ export_id: "expired-export", since: bounds.date_from, to: bounds.date_to }));

    const emitted = await backfill(stubbed, daysAgo(40), daysAgo(20));

    expect(emitted).toHaveLength(1);
    expect(stubbed.stub.calls.filter((call) => call === "POST /api/1.0/exports/activity.json")).toHaveLength(1);
    expect(JSON.parse(readFileSync(checkpointPath, "utf8"))).toMatchObject({ export_id: "export-1" });
    expect(receipts(stubbed.stateDir)[0]).toMatchObject({ result: "succeeded", transactional_export_id: "export-1" });
  });

  it("honours a longer configured search horizon", async () => {
    const stubbed = await stubbedClient({
      campaigns: [],
      messages: [message(1, daysAgo(20))],
    }, { transactional_search_horizon_days: 30 });
    await backfill(stubbed, daysAgo(25), new Date());
    expect(receipts(stubbed.stateDir)[0]).toMatchObject({
      transactional_source: "search",
      transactional_search_horizon_days: 30,
    });
  });
});

describe("records.backfill.stage", () => {
  // Two campaigns and a Transactional window the export must serve, listed by the
  // provider newest first; explicit second-aligned timestamps keep the order exact.
  function stagedFixture(): StubFixture {
    const base = Math.floor(daysAgo(45).getTime() / 1000) * 1000;
    const at = (offsetMs: number) => new Date(base + offsetMs);
    return {
      campaigns: [campaign("c2", at(DAY_MS), 2), campaign("c1", at(0), 3)],
      messages: [message(1, at(-60 * 60_000)), message(2, at(DAY_MS + 60 * 60_000)), message(3, daysAgo(2)), message(4, daysAgo(1))],
      search: { horizon_days: 7 },
    };
  }

  it("stages the window as chunk files the runtime imports, identical to the streamed records", async () => {
    const stubbed = await stubbedClient(stagedFixture(), { backfill_stage_chunk_records: 4 });
    const stageDir = stageDirectory();
    const since = daysAgo(60);
    const to = new Date();

    const manifest = await __test__.stageBackfillWindow(stubbed.client, {
      since: since.toISOString(),
      to: to.toISOString(),
      stage_dir: stageDir,
    });

    expect(manifest).toMatchObject({
      version: 1,
      format: "jsonl_files",
      stage_dir: stageDir,
      manifest_path: join(stageDir, "manifest.json"),
      totals: { records: 11 },
      mailchimp: {
        window: { since: since.toISOString(), to: to.toISOString() },
        chunk_records: 4,
        complete: true,
        cursor: { last_record_id: "mailchimp:moon-mailchimp:transactional:msg-4", campaign_id: null },
      },
    });
    expect(manifest.chunks.map((chunk) => [chunk.path, chunk.records])).toEqual([
      [join(stageDir, "chunk-00000.jsonl"), 4],
      [join(stageDir, "chunk-00001.jsonl"), 4],
      [join(stageDir, "chunk-00002.jsonl"), 3],
    ]);
    expect(JSON.parse(readFileSync(manifest.manifest_path, "utf8"))).toEqual(manifest);
    expect(readdirSync(stageDir).sort()).toEqual(["chunk-00000.jsonl", "chunk-00001.jsonl", "chunk-00002.jsonl", "manifest.json"]);

    const staged = manifest.chunks.flatMap((chunk) => {
      const lines = chunkLines(chunk.path);
      expect(lines).toHaveLength(chunk.records);
      expect(chunk.first_record_id).toBe(lines[0]!.payload.external_record_id);
      expect(chunk.last_record_id).toBe(lines.at(-1)!.payload.external_record_id);
      expect(chunk.first_timestamp_ms).toBe(Math.min(...timestamps(lines)));
      expect(chunk.last_timestamp_ms).toBe(Math.max(...timestamps(lines)));
      return lines;
    });
    expect(ids(staged)).toEqual([
      expect.stringMatching(/:transactional:export:[0-9a-f]{64}$/u),
      "mailchimp:moon-mailchimp:marketing-campaign:c1",
      "mailchimp:moon-mailchimp:marketing:c1:c1-r0",
      "mailchimp:moon-mailchimp:marketing:c1:c1-r1",
      "mailchimp:moon-mailchimp:marketing:c1:c1-r2",
      "mailchimp:moon-mailchimp:marketing-campaign:c2",
      "mailchimp:moon-mailchimp:marketing:c2:c2-r0",
      "mailchimp:moon-mailchimp:marketing:c2:c2-r1",
      expect.stringMatching(/:transactional:export:[0-9a-f]{64}$/u),
      "mailchimp:moon-mailchimp:transactional:msg-3",
      "mailchimp:moon-mailchimp:transactional:msg-4",
    ]);
    expect(isNonDecreasing(timestamps(staged))).toBe(true);
    expect(staged.map((record) => record.payload.metadata?.revision_hash)).not.toContain(undefined);
    for (const chunk of manifest.chunks) expect(readFileSync(chunk.path, "utf8")).not.toContain("@example.com");

    // The streamed path emits the same records in the same order and reuses the export.
    const streamed = await backfill(stubbed, since, to);
    expect(ids(streamed)).toEqual(ids(staged));
    expect(stubbed.stub.calls.filter((call) => call === "POST /api/1.0/exports/activity.json")).toHaveLength(1);
    const [stagedReceipt, streamedReceipt] = receipts(stubbed.stateDir);
    expect(stagedReceipt).toMatchObject({
      contract_version: "nexus_mailchimp_ingestion_run_v3",
      result: "succeeded",
      mode: "backfill",
      transport: "staged",
      stage_chunk_records: 4,
      stage_chunk_count: 3,
      campaign_count: 2,
      campaign_record_count: 2,
      recipient_record_count: 5,
      transactional_source: "export",
      transactional_export_reason: "beyond_search_horizon",
      transactional_export_row_count: 4,
      transactional_emitted_count: 4,
      total_emitted_count: 11,
    });
    expect(streamedReceipt).toMatchObject({ transport: "stream", total_emitted_count: 11 });
    expect(streamedReceipt?.output_digest).toBe(stagedReceipt?.output_digest);
  });

  it("stages the same window twice with identical chunks", async () => {
    const stubbed = await stubbedClient(stagedFixture(), { backfill_stage_chunk_records: 4 });
    const payload = { since: daysAgo(60).toISOString(), to: new Date().toISOString() };
    const first = await __test__.stageBackfillWindow(stubbed.client, { ...payload, stage_dir: stageDirectory() });
    const second = await __test__.stageBackfillWindow(stubbed.client, { ...payload, stage_dir: stageDirectory() });

    const contents = (manifest: typeof first) => manifest.chunks.map((chunk) => readFileSync(chunk.path, "utf8"));
    expect(contents(second)).toEqual(contents(first));
    expect(second.chunks.map((chunk) => chunk.records)).toEqual(first.chunks.map((chunk) => chunk.records));
    expect(stubbed.stub.calls.filter((call) => call === "POST /api/1.0/exports/activity.json")).toHaveLength(1);
    const [one, two] = receipts(stubbed.stateDir);
    expect(one?.output_digest).toBe(two?.output_digest);
  });

  it("stages into a fresh temporary directory when stage_dir is omitted", async () => {
    const stubbed = await stubbedClient({ campaigns: [campaign("c1", daysAgo(3), 1)], messages: [] });
    const manifest = await __test__.stageBackfillWindow(stubbed.client, { since: daysAgo(5).toISOString() });
    cleanups.push(() => rmSync(manifest.stage_dir, { recursive: true, force: true }));

    expect(realpathSync(manifest.stage_dir).startsWith(realpathSync(tmpdir()))).toBe(true);
    expect(manifest.totals.records).toBe(2);
    expect(existsSync(manifest.manifest_path)).toBe(true);
  });

  it("refuses a stage_dir that already holds files before reading anything", async () => {
    const stubbed = await stubbedClient({ campaigns: [], messages: [] });
    const stageDir = stageDirectory();
    writeFileSync(join(stageDir, "manifest.json"), "{}");
    await expect(__test__.stageBackfillWindow(stubbed.client, { since: daysAgo(5).toISOString(), stage_dir: stageDir }))
      .rejects.toThrow("stage_dir must be an empty directory");
    expect(stubbed.stub.calls).toEqual([]);
    expect(readdirSync(stubbed.stateDir)).toEqual([]);
  });

  it("keeps the manifest truthful when the window fails part way", async () => {
    const stubbed = await stubbedClient(stagedFixture(), { backfill_stage_chunk_records: 4 });
    const stageDir = stageDirectory();
    const failing = {
      ...stubbed.client,
      fetchFn: async (url: URL | RequestInfo, init?: RequestInit) =>
        String(url).includes("/campaigns/c2/content")
          ? new Response(JSON.stringify({ detail: "campaign content unavailable" }), { status: 404 })
          : await fetch(url, init),
    };

    await expect(__test__.stageBackfillWindow(failing, {
      since: daysAgo(60).toISOString(),
      to: new Date().toISOString(),
      stage_dir: stageDir,
    })).rejects.toThrow("Mailchimp read failed: campaign content unavailable");

    const manifest = JSON.parse(readFileSync(join(stageDir, "manifest.json"), "utf8")) as {
      chunks: Array<{ path: string; records: number }>;
      totals: { records: number };
      mailchimp: { complete: boolean; cursor: { last_record_id: string; campaign_id: string } };
    };
    expect(manifest.chunks.map((chunk) => [chunk.path, chunk.records])).toEqual([[join(stageDir, "chunk-00000.jsonl"), 4]]);
    expect(manifest.totals.records).toBe(4);
    expect(manifest.mailchimp).toMatchObject({
      complete: false,
      cursor: { last_record_id: "mailchimp:moon-mailchimp:marketing:c1:c1-r2", campaign_id: "c1" },
    });
    expect(chunkLines(join(stageDir, "chunk-00001.jsonl"))).toHaveLength(1);
    expect(receipts(stubbed.stateDir)[0]).toMatchObject({
      result: "failed",
      transport: "staged",
      stage_chunk_count: 2,
      campaign_record_count: 1,
      recipient_record_count: 3,
      total_emitted_count: 5,
    });
  });
});

describe("mailchimp.backfill.plan", () => {
  it("reports the campaigns, the estimates, and the transactional path without creating an export", async () => {
    const stubbed = await stubbedClient({
      campaigns: [campaign("big", daysAgo(100), 2500), campaign("small", daysAgo(50), 15), campaign("later", daysAgo(1), 3)],
      messages: [message(1, daysAgo(2))],
    });
    const plan = await __test__.planBackfillWindow(stubbed.client, {
      since: daysAgo(120).toISOString(),
      to: daysAgo(10).toISOString(),
    });

    expect(plan).toMatchObject({
      campaign_count: 2,
      campaigns: [
        expect.objectContaining({ id: "big", emails_sent: 2500, record_count: 2501, read_calls: 4 }),
        expect.objectContaining({ id: "small", emails_sent: 15, record_count: 16, read_calls: 2 }),
      ],
      estimated_record_count: 2517,
      estimated_read_calls: 1 + 6 + 1 + 3,
      transactional: {
        path: "export",
        export_reason: "beyond_search_horizon",
        search_candidate_count: 0,
        search_cap_observed: false,
        search_horizon_days: 7,
        within_search_horizon: false,
        export_window: __test__.exportDateBounds(daysAgo(120), daysAgo(10)),
        export_requested: false,
      },
      mutates_remote: false,
    });
    expect(stubbed.stub.calls.some((call) => call.includes("/exports/"))).toBe(false);
    expect(readdirSync(stubbed.stateDir)).toEqual([]);
  });

  it("plans a recent uncapped window on the search path", async () => {
    const stubbed = await stubbedClient({ campaigns: [], messages: [message(1, daysAgo(1))] });
    const plan = await __test__.planBackfillWindow(stubbed.client, { since: daysAgo(3).toISOString() });
    expect(plan.transactional).toMatchObject({ path: "search", export_reason: null, search_candidate_count: 1 });
    expect(plan.estimated_record_count).toBe(1);
  });

  it("rejects an unusable window before reading anything", async () => {
    const stubbed = await stubbedClient({ campaigns: [], messages: [] });
    await expect(__test__.planBackfillWindow(stubbed.client, { since: "yesterday" })).rejects.toThrow(
      "since must be an ISO 8601 date",
    );
    await expect(__test__.planBackfillWindow(stubbed.client, {
      since: daysAgo(1).toISOString(),
      to: daysAgo(2).toISOString(),
    })).rejects.toThrow("to must be later than since");
    expect(stubbed.stub.calls).toEqual([]);
  });
});
