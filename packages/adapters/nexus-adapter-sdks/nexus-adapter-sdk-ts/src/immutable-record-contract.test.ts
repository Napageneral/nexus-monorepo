import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { messageRecord } from "./event.js";
import {
  AdapterInboundRecordSchema,
  CompleteProviderSnapshotSchema,
  completeProviderSnapshot,
} from "./protocol.js";

describe("immutable Record adapter contract", () => {
  it("builds complete provider snapshots and preserves provider provenance", () => {
    const providerObjectJson = '{"id":"456","title":"Fulfillment Runbook","version":{"number":7}}';
    const snapshot = completeProviderSnapshot(providerObjectJson, { page_id: "456" });
    const record = messageRecord({
      platform: "confluence",
      connectionId: "moonsleep-confluence",
      providerAccountRef: "moonsleep.atlassian.net",
      externalRecordId: "ari:cloud:confluence:site-1:page/456",
      sourceRecordType: "page",
      providerVersionRef: "7",
      senderId: "atlassian-user-123",
      containerId: "page-456",
      containerKind: "group",
      content: "Fulfillment runbook snapshot",
      completeProviderSnapshot: snapshot,
    });

    expect(AdapterInboundRecordSchema.parse(record)).toMatchObject({
      routing: { provider_account_ref: "moonsleep.atlassian.net" },
      payload: {
        external_record_id: "ari:cloud:confluence:site-1:page/456",
        source_record_type: "page",
        provider_version_ref: "7",
        payload: {
          provider_object_json: providerObjectJson,
          provider_object_sha256: createHash("sha256").update(providerObjectJson).digest("hex"),
        },
      },
    });
  });

  it("accepts legacy provenance omissions and rejects canonical Nex identity fields", () => {
    const legacy = {
      operation: "record.ingest",
      routing: {
        platform: "gmail",
        connection_id: "casey@moonsleep.co",
        sender_id: "sender@example.com",
        container_id: "sender@example.com",
        container_kind: "direct",
      },
      payload: {
        external_record_id: "gmail:message:abc123",
        timestamp: 1_700_000_000_000,
        content: "Subject: hello",
        content_type: "text",
      },
    };

    expect(() => AdapterInboundRecordSchema.parse(legacy)).not.toThrow();
    for (const field of ["record_id", "canonical_record_id", "identity_sha256", "payload_sha256"]) {
      expect(() =>
        AdapterInboundRecordSchema.parse({
          ...legacy,
          payload: { ...legacy.payload, [field]: "adapter-controlled" },
        }),
      ).toThrow();
    }
  });

  it("rejects partial, decoded, and mismatched complete snapshots", () => {
    const providerObjectJson = '{"id":"gid://shopify/Order/1"}';
    for (const snapshot of [
      { provider_object_json: providerObjectJson },
      {
        provider_object_json: providerObjectJson,
        provider_object_sha256: "0".repeat(64),
      },
      {
        provider_object_json: providerObjectJson,
        provider_object_sha256: createHash("sha256").update(providerObjectJson).digest("hex"),
        provider_object: { id: "gid://shopify/Order/1" },
      },
    ]) {
      expect(() => CompleteProviderSnapshotSchema.parse(snapshot)).toThrow();
    }
  });
});
