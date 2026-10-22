import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { AdapterInboundRecordSchema } from "@nexus-project/adapter-sdk-ts";
import type { CustodyDocument, FlexportBundle, FlexportNetwork } from "./client.ts";
import {
  bundleAttachments,
  bundleSnapshot,
  bundleSummary,
  bundleTimestamp,
  buildNetworkRecord,
  buildShipmentRecord,
  networkSnapshot,
  stableJson,
} from "./records.ts";

const fixtures = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../testdata/fixtures/flexport.json"), "utf8"),
);

function own(rows: Array<Record<string, any>>): Array<Record<string, any>> {
  return rows.filter((row) => row.shipment?.id === 1234567);
}

function fixtureBundle(): FlexportBundle {
  return {
    shipment: structuredClone(fixtures.shipments[0]),
    containers: own(structuredClone(fixtures.containers)),
    legs: own(structuredClone(fixtures.legs)),
    customs_entries: own(structuredClone(fixtures.customs_entries)),
    invoices: own(structuredClone(fixtures.invoices)),
    documents: own(structuredClone(fixtures.documents)),
  };
}

function reversedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversedKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .reverse()
        .map(([key, entry]) => [key, reversedKeys(entry)]),
    );
  }
  return value;
}

const custody: CustodyDocument = {
  document_id: "D1",
  uploaded_at: "2026-10-08T03:00:00.338Z",
  sha256: "a".repeat(64),
  size: 110,
  mime_type: "application/pdf",
  local_path: "/state/attachment-custody/sha256/aa/" + "a".repeat(64),
};

test("stable JSON sorts keys recursively and drops insignificant whitespace", () => {
  assert.equal(stableJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } }), '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
  assert.equal(stableJson({ a: undefined, b: "é" }), '{"b":"é"}');
});

test("the bundle has exactly the six keys the Python reader takes", () => {
  const snapshot = bundleSnapshot(fixtureBundle());
  const parsed = JSON.parse(snapshot.json);
  assert.deepEqual(Object.keys(parsed), ["containers", "customs_entries", "documents", "invoices", "legs", "shipment"]);
  assert.equal(snapshot.sha256, createHash("sha256").update(snapshot.json, "utf8").digest("hex"));
  assert.ok(!snapshot.json.includes("\n") && !snapshot.json.includes(": "));
});

test("identical input builds a byte-identical record whatever the key order", () => {
  const bundle = fixtureBundle();
  const attachments = bundleAttachments(bundle, new Map([["D1", custody]]));
  const first = buildShipmentRecord({ connectionId: "moonsleep-flexport", bundle, attachments, firstSeenMs: 1 });
  const reordered = reversedKeys(fixtureBundle()) as FlexportBundle;
  const second = buildShipmentRecord({
    connectionId: "moonsleep-flexport",
    bundle: reordered,
    attachments: bundleAttachments(reordered, new Map([["D1", custody]])),
    firstSeenMs: 2,
  });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("the shipment record follows the contract", () => {
  const bundle = fixtureBundle();
  const snapshot = bundleSnapshot(bundle);
  const record = buildShipmentRecord({
    connectionId: "moonsleep-flexport",
    bundle,
    attachments: bundleAttachments(bundle, new Map([["D1", custody], ["D3", { ...custody, document_id: "D3" }]])),
    firstSeenMs: 5,
  });
  AdapterInboundRecordSchema.parse(record);
  assert.deepEqual(record.routing, {
    platform: "flexport",
    connection_id: "moonsleep-flexport",
    sender_id: "flexport",
    sender_name: "Flexport",
    receiver_id: "moonsleep-flexport",
    container_kind: "direct",
    container_id: "shipment:1234567",
    container_name: "SWRC26012 S3 Ningbo to Vernon",
  });
  assert.equal(record.payload.external_record_id, "shipment:1234567");
  assert.equal(record.payload.source_record_type, "flexport_shipment_bundle");
  assert.equal(record.payload.provider_version_ref, `bundle:sha256:${snapshot.sha256}`);
  assert.equal(record.payload.timestamp, Date.parse("2026-10-20T12:00:00.000Z"));
  assert.equal(
    record.payload.content,
    "Flexport shipment 1234567 SWRC26012 S3 Ningbo to Vernon: in_transit_to_arrival_port; entries 1 (pending); invoices 1; documents 2",
  );
  assert.equal(record.payload.content_type, "text");
  const provider = record.payload.payload as Record<string, unknown>;
  assert.equal(provider.contract, "moonsleep.flexport_shipment_bundle.v1");
  assert.equal(provider.flexport_shipment_id, "1234567");
  assert.equal(provider.provider_object_json, snapshot.json);
  assert.equal(provider.provider_object_sha256, snapshot.sha256);
  assert.deepEqual(record.payload.attachments, [
    {
      id: "document:D1",
      filename: "CI-SWRC26012-S3.pdf",
      mime_type: "application/pdf",
      size: 110,
      content_hash: "a".repeat(64),
      local_path: custody.local_path,
      metadata: {
        flexport_document_id: "D1",
        document_type: "commercial_invoice",
        uploaded_at: "2026-10-08T03:00:00.338Z",
      },
    },
  ], "the archived D3 is never attached");
});

test("a consumer reads the bundle back from provider_object_json and verifies its digest", () => {
  const bundle = fixtureBundle();
  const record = buildShipmentRecord({ connectionId: "c", bundle, attachments: [], firstSeenMs: 0 });
  // Mirrors json.loads(payload_json)["source_metadata"]["provider_payload"]["provider_object_json"].
  const providerPayload = JSON.parse(JSON.stringify(record.payload.payload)) as Record<string, string>;
  const text = providerPayload.provider_object_json!;
  assert.equal(createHash("sha256").update(text, "utf8").digest("hex"), providerPayload.provider_object_sha256);
  assert.deepEqual(JSON.parse(text), JSON.parse(stableJson(bundle)));
  assert.equal(record.payload.attachments, undefined);
});

test("the timestamp falls back to the newest bundle time, then the first-seen time", () => {
  const bundle = fixtureBundle();
  delete bundle.shipment.updated_at;
  assert.equal(bundleTimestamp(bundle, 7), Date.parse("2026-11-03T17:00:00.000Z"));
  const bare: FlexportBundle = {
    shipment: { id: 1, status: "seller_location" },
    containers: [],
    legs: [],
    customs_entries: [],
    invoices: [],
    documents: [],
  };
  assert.equal(bundleTimestamp(bare, 7), 7);
  assert.equal(bundleSummary(bare), "Flexport shipment 1: seller_location; entries 0 (none); invoices 0; documents 0");
});

test("the network record follows the contract", () => {
  const network: FlexportNetwork = structuredClone(fixtures.network);
  const snapshot = networkSnapshot(network);
  const record = buildNetworkRecord({ connectionId: "moonsleep-flexport", network, timestamp: 1_792_000_000_000 });
  AdapterInboundRecordSchema.parse(record);
  assert.equal(record.routing.container_id, "network");
  assert.equal(record.payload.external_record_id, "network:me");
  assert.equal(record.payload.source_record_type, "flexport_network");
  assert.equal(record.payload.provider_version_ref, `network:sha256:${snapshot.sha256}`);
  assert.equal(record.payload.timestamp, 1_792_000_000_000);
  assert.equal(
    record.payload.content,
    "Flexport network of MoonSleep Inc.: company entities 2; companies 1; locations 2",
  );
  const provider = record.payload.payload as Record<string, string>;
  assert.equal(provider.contract, "moonsleep.flexport_network.v1");
  assert.deepEqual(Object.keys(JSON.parse(provider.provider_object_json!)), [
    "companies",
    "company_entities",
    "locations",
    "me_company",
  ]);
});
