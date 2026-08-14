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
};

describe("Mailchimp read-only evidence adapter", () => {
  it("derives the Marketing datacenter from the key suffix", () => {
    expect(__test__.marketingDatacenter("abc-us20")).toBe("us20");
    expect(__test__.marketingDatacenter("abc-us20", "us99")).toBe("us99");
  });

  it("normalizes recipient identity without retaining the email", () => {
    const expectedHash = __test__.normalizedEmailHash(" Customer@Example.com ");
    const record = __test__.marketingRecord(
      client,
      { id: "campaign-1", send_time: "2026-08-14T12:00:00Z", settings: { subject_line: "Order update" } },
      { email_id: "recipient-1", email_address: "Customer@Example.com", activity: [{ action: "sent" }] },
      { plain_text: "Your order is still moving." },
    );

    expect(record.payload.metadata?.recipient_email_sha256).toBe(expectedHash);
    expect(JSON.stringify(record)).not.toContain("Customer@Example.com");
    expect(record.payload.metadata?.read_only_source).toBe(true);
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
});
