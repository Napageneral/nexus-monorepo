import { createHash } from "node:crypto";
import { type AdapterInboundRecord, completeProviderSnapshot } from "@nexus-project/adapter-sdk-ts";
import {
  type CustodyDocument,
  type FlexportBundle,
  type FlexportNetwork,
  type FlexportRow,
  documentFileName,
  isFinalDocument,
} from "./client.ts";

type UnknownRecord = Record<string, unknown>;

export const PLATFORM = "flexport";
export const BUNDLE_RECORD_TYPE = "flexport_shipment_bundle";
export const NETWORK_RECORD_TYPE = "flexport_network";
export const BUNDLE_CONTRACT = "moonsleep.flexport_shipment_bundle.v1";
export const NETWORK_CONTRACT = "moonsleep.flexport_network.v1";
export const NETWORK_RECORD_ID = "network:me";
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export type Snapshot = { json: string; sha256: string };

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function oneLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const record = value as UnknownRecord;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .filter((key) => record[key] !== undefined)
        .map((key) => [key, sortKeys(record[key])]),
    );
  }
  return value;
}

/** Keys sorted recursively, no insignificant whitespace: identical content, identical bytes. */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function snapshotOf(value: unknown): Snapshot {
  const json = stableJson(value);
  return { json, sha256: createHash("sha256").update(json, "utf8").digest("hex") };
}

/** The bundle exactly as the Python reader `flexport_shipments.reading()` takes it. */
export function bundleSnapshot(bundle: FlexportBundle): Snapshot {
  return snapshotOf({
    shipment: bundle.shipment,
    containers: bundle.containers,
    legs: bundle.legs,
    customs_entries: bundle.customs_entries,
    invoices: bundle.invoices,
    documents: bundle.documents,
  });
}

export function networkSnapshot(network: FlexportNetwork): Snapshot {
  return snapshotOf({
    me_company: network.me_company,
    company_entities: network.company_entities,
    companies: network.companies,
    locations: network.locations,
  });
}

export function shipmentIdOf(shipment: FlexportRow): string {
  const id = textValue(shipment.id);
  if (!id) throw new Error("Flexport shipment has no id");
  return id;
}

function newestTimestamp(value: unknown): number | undefined {
  let newest: number | undefined;
  const visit = (node: unknown) => {
    if (typeof node === "string") {
      if (!ISO_TIMESTAMP.test(node)) return;
      const at = Date.parse(node);
      if (Number.isFinite(at) && (newest === undefined || at > newest)) newest = at;
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node && typeof node === "object") Object.values(node).forEach(visit);
  };
  visit(value);
  return newest;
}

/** shipment.updated_at, else the newest timestamp in the bundle, else the first-seen time. */
export function bundleTimestamp(bundle: FlexportBundle, firstSeenMs: number): number {
  const updatedAt = Date.parse(textValue(bundle.shipment.updated_at) ?? "");
  if (Number.isFinite(updatedAt)) return updatedAt;
  return newestTimestamp(bundle) ?? firstSeenMs;
}

export function bundleSummary(bundle: FlexportBundle): string {
  const id = shipmentIdOf(bundle.shipment);
  const name = textValue(bundle.shipment.name);
  const status = textValue(bundle.shipment.status) ?? "unknown";
  const releases = bundle.customs_entries
    .map((entry) => textValue(entry.release_status) ?? "unknown")
    .join(", ");
  return oneLine(
    `Flexport shipment ${id}${name ? ` ${name}` : ""}: ${status}; ` +
      `entries ${bundle.customs_entries.length} (${releases || "none"}); ` +
      `invoices ${bundle.invoices.length}; documents ${bundle.documents.length}`,
  );
}

export function documentAttachment(document: FlexportRow, custody: CustodyDocument) {
  return {
    id: `document:${custody.document_id}`,
    filename: documentFileName(document),
    mime_type: custody.mime_type,
    size: custody.size,
    content_hash: custody.sha256,
    local_path: custody.local_path,
    metadata: {
      flexport_document_id: custody.document_id,
      document_type: textValue(document.document_type) ?? null,
      uploaded_at: custody.uploaded_at || null,
    },
  };
}

/** Final (not archived) documents of the bundle whose bytes are already in custody, in bundle order. */
export function bundleAttachments(
  bundle: FlexportBundle,
  custody: ReadonlyMap<string, CustodyDocument>,
): NonNullable<AdapterInboundRecord["payload"]["attachments"]> {
  const attachments: NonNullable<AdapterInboundRecord["payload"]["attachments"]> = [];
  for (const document of bundle.documents) {
    const id = textValue(document.id);
    const stored = id ? custody.get(id) : undefined;
    if (stored && isFinalDocument(document)) attachments.push(documentAttachment(document, stored));
  }
  return attachments;
}

function routing(connectionId: string, containerId: string, containerName: string) {
  return {
    platform: PLATFORM,
    connection_id: connectionId,
    sender_id: "flexport",
    sender_name: "Flexport",
    receiver_id: connectionId,
    container_kind: "direct" as const,
    container_id: containerId,
    container_name: containerName,
  };
}

export function buildShipmentRecord(params: {
  connectionId: string;
  bundle: FlexportBundle;
  snapshot?: Snapshot;
  attachments: NonNullable<AdapterInboundRecord["payload"]["attachments"]>;
  firstSeenMs: number;
  /** The emission's timestamp when the caller keeps them monotonic; else bundleTimestamp(). */
  timestamp?: number;
}): AdapterInboundRecord {
  const snapshot = params.snapshot ?? bundleSnapshot(params.bundle);
  const shipmentId = shipmentIdOf(params.bundle.shipment);
  const name = textValue(params.bundle.shipment.name);
  return {
    operation: "record.ingest",
    routing: routing(params.connectionId, `shipment:${shipmentId}`, oneLine(name ?? shipmentId)),
    payload: {
      external_record_id: `shipment:${shipmentId}`,
      source_record_type: BUNDLE_RECORD_TYPE,
      provider_version_ref: `bundle:sha256:${snapshot.sha256}`,
      timestamp: params.timestamp ?? bundleTimestamp(params.bundle, params.firstSeenMs),
      content: bundleSummary(params.bundle),
      content_type: "text",
      payload: completeProviderSnapshot(snapshot.json, {
        contract: BUNDLE_CONTRACT,
        flexport_shipment_id: shipmentId,
      }),
      ...(params.attachments.length > 0 ? { attachments: params.attachments } : {}),
    },
  };
}

export function networkSummary(network: FlexportNetwork): string {
  const me = textValue(asRecord(network.me_company).name);
  return oneLine(
    `Flexport network${me ? ` of ${me}` : ""}: company entities ${network.company_entities.length}; ` +
      `companies ${network.companies.length}; locations ${network.locations.length}`,
  );
}

export function buildNetworkRecord(params: {
  connectionId: string;
  network: FlexportNetwork;
  snapshot?: Snapshot;
  /** The time this content was first emitted (the network has no updated_at of its own). */
  timestamp: number;
}): AdapterInboundRecord {
  const snapshot = params.snapshot ?? networkSnapshot(params.network);
  return {
    operation: "record.ingest",
    routing: routing(params.connectionId, "network", "Flexport network"),
    payload: {
      external_record_id: NETWORK_RECORD_ID,
      source_record_type: NETWORK_RECORD_TYPE,
      provider_version_ref: `network:sha256:${snapshot.sha256}`,
      timestamp: params.timestamp,
      content: networkSummary(params.network),
      content_type: "text",
      payload: completeProviderSnapshot(snapshot.json, { contract: NETWORK_CONTRACT }),
    },
  };
}
