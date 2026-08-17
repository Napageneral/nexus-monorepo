import { describe, expect, it } from "vitest";
import { __test__ } from "./adapter.js";

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
    expect(stats).toEqual({
      capObserved: true,
      continuityProven: true,
      historicalGapDetected: false,
      candidateCount: 1000,
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
      undefined,
      true,
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
    const first = __test__.transactionalExportRecord(client, row, "export-1", 0);
    const replay = __test__.transactionalExportRecord(client, row, "export-2", 0);
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
    const first = __test__.transactionalExportRecord(client, sent, "export-1", 0);
    const revision = __test__.transactionalExportRecord(
      client,
      delivered,
      "export-2",
      0,
    );
    expect(first.payload.external_record_id).toBe(revision.payload.external_record_id);
    expect(first.payload.metadata?.revision_hash).not.toBe(
      revision.payload.metadata?.revision_hash,
    );
  });

  it("prefers provider message identity over mutable export fields", () => {
    const first = __test__.transactionalExportStableIdentity(
      { "Message ID": "provider-1", Status: "sent" },
      "recipient-hash",
      0,
    );
    const second = __test__.transactionalExportStableIdentity(
      { "Message ID": "provider-1", Status: "bounced" },
      "recipient-hash",
      0,
    );
    expect(first).toBe(second);
  });
});
