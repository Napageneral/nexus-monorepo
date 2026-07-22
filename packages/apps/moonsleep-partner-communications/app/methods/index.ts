import { createHash } from "node:crypto";
import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import {
  projectPartnerWorkspace,
  type CommunicationRecord,
  type IdentityResolution,
  type OpenLoopAssertion,
  type SourceCoverageAssertion,
  type WorkspaceAssertion,
} from "../src/projection.js";
import {
  commitReview,
  listReviewWorkspaces,
  parseReviewRequest,
  readCurrentReview,
} from "./review-store.js";

type Row = Record<string, unknown>;

const PAGE_SIZE = 1_000;
const MAX_SCAN = 100_000;
const SHA256 = /^[0-9a-f]{64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unwrap(value: unknown): Row {
  const valueRow = row(value);
  if (valueRow.ok === false) throw new Error(text(row(valueRow.error).message) || "Nex operation failed");
  const nested = row(valueRow.payload);
  return Object.keys(nested).length > 0 ? nested : valueRow;
}

function requireText(value: unknown, field: string, maximum: number): string {
  const parsed = text(value);
  if (value !== parsed || !parsed || Buffer.byteLength(parsed, "utf8") > maximum) {
    throw new Error(`${field} is invalid`);
  }
  return parsed;
}

function requireRecordIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new Error("record_ids must contain between 1 and 50 entries");
  }
  const ids = value.map((entry, index) => requireText(entry, `record_ids[${index}]`, 512));
  if (new Set(ids).size !== ids.length) throw new Error("record_ids must be unique");
  return ids;
}

function objectArray<T>(value: unknown, field: string, maximum: number): T[] {
  if (!Array.isArray(value) || value.length > maximum || value.some((entry) => Object.keys(row(entry)).length === 0)) {
    throw new Error(`${field} must be an array of at most ${maximum} objects`);
  }
  return value as T[];
}

function attachments(record: Row): Row[] {
  return Array.isArray(record.attachments) ? record.attachments.map(row) : [];
}

function attachmentCount(record: Row): number {
  const hydrated = attachments(record);
  if (hydrated.length > 0) return hydrated.length;
  const family = text(row(record.metadata).family);
  const opaque = row(record.payload);
  if (family === "message" && Array.isArray(opaque.source_attachments)) {
    return opaque.source_attachments.length;
  }
  return family === "orphan_attachment" ? 1 : 0;
}

function canonicalValue(value: unknown, field: string): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`${field} contains an unsafe number`);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => canonicalValue(entry, `${field}[${index}]`));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Row)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested, `${field}.${key}`)]),
    );
  }
  throw new Error(`${field} contains unsupported data`);
}

function gmailConnectionAnchor(record: Row): string {
  const metadata = row(record.metadata);
  const explicit = text(metadata.source_connection_id);
  if (explicit) return requireText(explicit.toLowerCase(), "metadata.source_connection_id", 256);
  const direction = text(metadata.direction);
  const observedMailbox = direction === "outbound" || direction === "outgoing"
    ? text(record.sender_contact_id) || text(metadata.sender_contact_id)
    : direction === "inbound" || direction === "incoming"
      ? text(record.receiver_contact_id) || text(metadata.receiver_contact_id)
      : "";
  const normalized = requireText(observedMailbox.toLowerCase(), "Gmail observed mailbox", 256);
  if (!EMAIL.test(normalized)) throw new Error("Gmail observed mailbox is not an email address");
  return normalized;
}

function gmailSourceRevisionDigest(record: Row): string {
  const metadata = { ...row(record.metadata) };
  delete metadata._daemon;
  const sourceObservation = {
    id: record.id,
    record_id: record.record_id,
    platform: record.platform,
    timestamp: record.timestamp,
    content: record.content,
    content_type: record.content_type,
    attachments: record.attachments ?? null,
    recipients: record.recipients ?? null,
    sender_entity_id: record.sender_entity_id ?? null,
    receiver_entity_id: record.receiver_entity_id ?? null,
    sender_contact_id: record.sender_contact_id ?? null,
    receiver_contact_id: record.receiver_contact_id ?? null,
    space_id: record.space_id ?? null,
    container_kind: record.container_kind ?? null,
    container_id: record.container_id ?? null,
    thread_id: record.thread_id,
    reply_to_id: record.reply_to_id ?? null,
    payload: record.payload ?? null,
    metadata,
  };
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(sourceObservation, "Gmail source observation")), "utf8")
    .digest("hex");
}

function validateProviderDigest(record: Row): void {
  const opaque = row(record.payload);
  const family = text(row(record.metadata).family);
  const jsonField = family === "orphan_attachment" ? "provider_attachment_json" : "provider_object_json";
  const shaField = family === "orphan_attachment" ? "provider_attachment_sha256" : "provider_object_sha256";
  const sourceJson = opaque[jsonField];
  const declared = text(opaque[shaField]);
  if (typeof sourceJson !== "string" || !SHA256.test(declared)) {
    throw new Error(`Alibaba ${family || "record"} is missing exact source evidence`);
  }
  const actual = createHash("sha256").update(sourceJson, "utf8").digest("hex");
  if (actual !== declared) throw new Error("Alibaba source evidence digest mismatch");
}

function toCommunicationRecord(record: Row): CommunicationRecord {
  const metadata = row(record.metadata);
  const provider = text(record.platform);
  if (provider !== "alibaba" && provider !== "gmail") {
    throw new Error("record is not supported partner communication evidence");
  }
  if (provider === "alibaba") validateProviderDigest(record);
  const sourceRevision = provider === "gmail"
    ? gmailSourceRevisionDigest(record)
    : requireText(metadata.revision_hash, "metadata.revision_hash", 64);
  if (!SHA256.test(sourceRevision)) throw new Error("metadata.revision_hash is invalid");
  const timestampValue = record.timestamp;
  if (typeof timestampValue !== "number" || !Number.isSafeInteger(timestampValue) || timestampValue < 0) {
    throw new Error(`${provider} record timestamp is invalid`);
  }
  const content = typeof record.content === "string" ? record.content : "";
  return {
    source_record_id: requireText(record.id, "record.id", 512),
    source_revision_sha256: sourceRevision,
    provider,
    connection_id: provider === "gmail"
      ? gmailConnectionAnchor(record)
      : requireText(metadata.source_connection_id, "metadata.source_connection_id", 256),
    provider_thread_id: requireText(record.thread_id, "record.thread_id", 512),
    provider_message_id: text(metadata.message_id) || requireText(record.id, "record.id", 512),
    observed_at: new Date(timestampValue).toISOString(),
    direction: ["outgoing", "outbound"].includes(text(metadata.direction)) ? "outbound" : "inbound",
    summary: content.slice(0, 16_384) || `[${provider} evidence without text]`,
    attachment_count: attachmentCount(record),
  };
}

async function listConversationRecords(params: {
  nex: unknown;
  provider: "alibaba" | "gmail";
  connectionId: string;
  providerThreadId: string;
}): Promise<Row[]> {
  const recordsClient = (params.nex as {
    records: { list: (input: Row) => Promise<unknown> };
  }).records;
  const result: Row[] = [];
  let scanned = 0;
  for (let offset = 0; offset < MAX_SCAN; offset += PAGE_SIZE) {
    const response = unwrap(await recordsClient.list({
      platform: params.provider,
      thread_id: params.providerThreadId,
      limit: PAGE_SIZE,
      offset,
    }));
    if (!Array.isArray(response.records)) throw new Error("records.list did not return records");
    const page = response.records.map(row);
    scanned += page.length;
    if (scanned > MAX_SCAN) throw new Error(`${params.provider} scan exceeds ${MAX_SCAN} rows`);
    for (const record of page) {
      if (text(record.platform) !== params.provider) throw new Error(`${params.provider} scan returned a foreign platform`);
      const sourceConnectionId = params.provider === "gmail"
        ? gmailConnectionAnchor(record)
        : text(row(record.metadata).source_connection_id);
      if (params.provider === "gmail" && sourceConnectionId !== params.connectionId.toLowerCase()) continue;
      if (params.provider === "alibaba" && sourceConnectionId !== params.connectionId) {
        throw new Error(`${params.provider} scan returned a foreign connection`);
      }
      if (text(record.thread_id) === params.providerThreadId) result.push(record);
    }
    if (page.length < PAGE_SIZE) break;
  }
  result.sort((left, right) => text(left.id).localeCompare(text(right.id)));
  return result;
}

const healthcheck: NexAppMethodHandler = async (ctx) => ({
  status: "ok",
  app: { id: ctx.app.id, version: ctx.app.version },
  model: {
    primary_work_object: "independent_partner_open_loop",
    native_provider_conversations_preserved: true,
    categories_are_facets: true,
    model_proposals_require_review: true,
    exact_closure_evidence_required: true,
  },
  continuous_projection: "dormant_pending_backfill_parity_and_activation_receipt",
  reply_authority: false,
  provider_write_authority: false,
});

export const inspectAlibabaConversation: NexAppMethodHandler = async (ctx) => {
  const connectionId = requireText(ctx.params.connection_id, "connection_id", 128);
  const providerThreadId = requireText(ctx.params.provider_thread_id, "provider_thread_id", 512);
  const records = await listConversationRecords({ nex: ctx.nex, provider: "alibaba", connectionId, providerThreadId });
  if (records.length === 0) throw new Error("Alibaba conversation has no committed records");
  let messageRecords = 0;
  let orphanAttachmentRecords = 0;
  let attachmentRows = 0;
  let firstObservedAt = Number.POSITIVE_INFINITY;
  let lastObservedAt = 0;
  const recordHash = createHash("sha256");
  for (const record of records) {
    validateProviderDigest(record);
    const family = text(row(record.metadata).family);
    if (family === "message") messageRecords += 1;
    else if (family === "orphan_attachment") orphanAttachmentRecords += 1;
    else throw new Error(`Alibaba conversation contains unsupported family: ${family}`);
    attachmentRows += attachmentCount(record);
    const observedAt = Number(record.timestamp);
    firstObservedAt = Math.min(firstObservedAt, observedAt);
    lastObservedAt = Math.max(lastObservedAt, observedAt);
    recordHash.update(`${text(record.id)}\n`, "utf8");
  }
  return {
    state: "committed_complete_native_conversation",
    connection_id: connectionId,
    provider_thread_id: providerThreadId,
    record_count: records.length,
    message_record_count: messageRecords,
    orphan_attachment_record_count: orphanAttachmentRecords,
    attachment_row_count: attachmentRows,
    record_id_set_sha256: recordHash.digest("hex"),
    first_observed_at: new Date(firstObservedAt).toISOString(),
    last_observed_at: new Date(lastObservedAt).toISOString(),
    provider_content_returned: false,
    provider_write_authority: false,
  };
};

export const inspectGmailConversation: NexAppMethodHandler = async (ctx) => {
  const connectionId = requireText(ctx.params.connection_id, "connection_id", 128);
  const providerThreadId = requireText(ctx.params.provider_thread_id, "provider_thread_id", 512);
  const records = await listConversationRecords({ nex: ctx.nex, provider: "gmail", connectionId, providerThreadId });
  if (records.length === 0) throw new Error("Gmail conversation has no committed records");
  let attachmentRows = 0;
  let firstObservedAt = Number.POSITIVE_INFINITY;
  let lastObservedAt = 0;
  const recordHash = createHash("sha256");
  for (const record of records) {
    toCommunicationRecord(record);
    attachmentRows += attachmentCount(record);
    const observedAt = Number(record.timestamp);
    firstObservedAt = Math.min(firstObservedAt, observedAt);
    lastObservedAt = Math.max(lastObservedAt, observedAt);
    recordHash.update(`${text(record.id)}\n`, "utf8");
  }
  return {
    state: "committed_complete_native_conversation",
    provider: "gmail",
    connection_id: connectionId,
    provider_thread_id: providerThreadId,
    record_count: records.length,
    attachment_row_count: attachmentRows,
    record_id_set_sha256: recordHash.digest("hex"),
    first_observed_at: new Date(firstObservedAt).toISOString(),
    last_observed_at: new Date(lastObservedAt).toISOString(),
    provider_content_returned: false,
    provider_write_authority: false,
  };
};

export const projectReviewedCohort: NexAppMethodHandler = async (ctx) => {
  const ids = requireRecordIds(ctx.params.record_ids);
  const records: CommunicationRecord[] = [];
  for (const id of ids) {
    const response = unwrap(await ctx.nex.records.get({ id }));
    records.push(toCommunicationRecord(row(response.record)));
  }
  return {
    state: "reviewed_projection",
    ...projectPartnerWorkspace({
      records,
      identity_resolutions: objectArray<IdentityResolution>(ctx.params.identity_resolutions, "identity_resolutions", 50),
      workspace_assertions: objectArray<WorkspaceAssertion>(ctx.params.workspace_assertions, "workspace_assertions", 50),
      open_loop_assertions: objectArray<OpenLoopAssertion>(ctx.params.open_loop_assertions, "open_loop_assertions", 100),
      source_coverage_assertions: objectArray<SourceCoverageAssertion>(ctx.params.source_coverage_assertions, "source_coverage_assertions", 50),
    }),
    provider_write_authority: false,
  };
};

export const getCurrentReview: NexAppMethodHandler = async (ctx) => {
  const workspaceKey = requireText(ctx.params.workspace_key, "workspace_key", 128);
  const current = await readCurrentReview(ctx, workspaceKey);
  if (current.state !== "current_review") return current;
  const review = row(current.review);
  const assertions = row(current.assertions);
  const ids = requireRecordIds(review.record_ids);
  const records: CommunicationRecord[] = [];
  for (const id of ids) {
    const response = unwrap(await ctx.nex.records.get({ id }));
    records.push(toCommunicationRecord(row(response.record)));
  }
  return {
    ...current,
    projection: projectPartnerWorkspace({
      records,
      identity_resolutions: objectArray<IdentityResolution>(assertions.identity_resolutions, "identity_resolutions", 50),
      workspace_assertions: objectArray<WorkspaceAssertion>(assertions.workspace_assertions, "workspace_assertions", 50),
      open_loop_assertions: objectArray<OpenLoopAssertion>(assertions.open_loop_assertions, "open_loop_assertions", 100),
      source_coverage_assertions: objectArray<SourceCoverageAssertion>(assertions.source_coverage_assertions, "source_coverage_assertions", 50),
    }),
  };
};

export const listReviewedWorkspaces: NexAppMethodHandler = async (ctx) => await listReviewWorkspaces(ctx);

export const commitReviewedCohort: NexAppMethodHandler = async (ctx) => {
  const request = parseReviewRequest(ctx.params);
  const records: CommunicationRecord[] = [];
  for (const id of request.record_ids) {
    const response = unwrap(await ctx.nex.records.get({ id }));
    records.push(toCommunicationRecord(row(response.record)));
  }
  const projection = projectPartnerWorkspace({
    records,
    identity_resolutions: request.identity_resolutions,
    workspace_assertions: request.workspace_assertions,
    open_loop_assertions: request.open_loop_assertions,
    source_coverage_assertions: request.source_coverage_assertions,
  });
  const previousRevision = ctx.params.previous_revision_sha256 === null || ctx.params.previous_revision_sha256 === undefined
    ? null
    : requireText(ctx.params.previous_revision_sha256, "previous_revision_sha256", 64);
  return await commitReview({
    ctx,
    request,
    reviewIdempotencyKey: requireText(ctx.params.review_idempotency_key, "review_idempotency_key", 128),
    previousRevisionSha256: previousRevision,
    projection,
  });
};

export default {
  "moonsleep-partner-desk.healthcheck": healthcheck,
  "moonsleep-partner-desk.alibaba.inspect-conversation": inspectAlibabaConversation,
  "moonsleep-partner-desk.gmail.inspect-conversation": inspectGmailConversation,
  "moonsleep-partner-desk.project-reviewed-cohort": projectReviewedCohort,
  "moonsleep-partner-desk.review.current": getCurrentReview,
  "moonsleep-partner-desk.review.workspaces": listReviewedWorkspaces,
  "moonsleep-partner-desk.review.commit": commitReviewedCohort,
};
