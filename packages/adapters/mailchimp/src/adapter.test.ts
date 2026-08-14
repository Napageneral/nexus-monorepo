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
});
