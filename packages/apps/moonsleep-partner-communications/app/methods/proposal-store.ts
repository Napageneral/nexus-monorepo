import { createHash } from "node:crypto";
import type { NexAppMethodContext } from "../../../../../nex/src/runtime/domains/apps/context.js";
import {
  projectPartnerWorkspace,
  type CommunicationRecord,
  type OpenLoopAssertion,
  type PartnerRelationshipCategory,
  type SourceCoverageAssertion,
} from "../src/projection.js";

type Row = Record<string, unknown>;

const PROPOSAL_PLATFORM = "partner-desk";
const PROPOSAL_CONNECTION = "moonsleep-partner-desk-proposals";
const PROPOSAL_FAMILY = "coverage_proposal_batch";
const PROPOSAL_SCHEMA_VERSION = 1;
const PAGE_SIZE = 1_000;
const MAX_HISTORY = 100_000;
const SHA256 = /^[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._@/+\-$]{0,511}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-$]{15,127}$/;
const PARTNER_CATEGORIES = new Set<PartnerRelationshipCategory>([
  "vendor",
  "fulfillment_partner",
  "logistics_partner",
  "packaging_partner",
  "marketplace_partner",
  "professional_service",
  "creator_partner",
]);

export type ProposalRequestBody = {
  workspace_key: string;
  proposed_canonical_entity_id: string;
  proposed_contact_id?: string;
  partner_category: PartnerRelationshipCategory;
  record_ids: string[];
  open_loop_proposals: OpenLoopAssertion[];
  source_coverage_proposals: SourceCoverageAssertion[];
  classifier_id: string;
  classifier_prompt_sha256: string;
  proposal_note?: string;
};

type SourceBinding = {
  source_record_id: string;
  source_revision_sha256: string;
};

export type StoredProposalBatch = ProposalRequestBody & {
  assertion_family: typeof PROPOSAL_FAMILY;
  schema_version: typeof PROPOSAL_SCHEMA_VERSION;
  proposal_batch_sha256: string;
  proposal_response_sha256: string;
  request_body_sha256: string;
  proposal_idempotency_key: string;
  source_bindings: SourceBinding[];
  proposed_at: string;
  proposed_by_user_id: string;
  proposed_by_email: string | null;
};

export type ProposalRecordIndexEntry = {
  proposal_batch_sha256: string;
  workspace_key: string;
  classifier_id: string;
  proposed_at: string;
  disposition: SourceCoverageAssertion["disposition"];
  open_loop_ids: string[];
};

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

function requireIdentifier(value: unknown, field: string, maximum = 512): string {
  const parsed = requireText(value, field, maximum);
  if (!IDENTIFIER.test(parsed)) throw new Error(`${field} contains unsupported characters`);
  return parsed;
}

function optionalIdentifier(value: unknown, field: string, maximum = 512): string | undefined {
  if (value === undefined) return undefined;
  return requireIdentifier(value, field, maximum);
}

function optionalText(value: unknown, field: string, maximum: number): string | undefined {
  if (value === undefined) return undefined;
  return requireText(value, field, maximum);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Row)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

function recordIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new Error("record_ids must contain between 1 and 50 entries");
  }
  const ids = value.map((entry, index) => requireIdentifier(entry, `record_ids[${index}]`));
  if (new Set(ids).size !== ids.length) throw new Error("record_ids must be unique");
  return ids;
}

function objectArray<T>(value: unknown, field: string, maximum: number): T[] {
  if (!Array.isArray(value) || value.length > maximum || value.some((entry) => Object.keys(row(entry)).length === 0)) {
    throw new Error(`${field} must be an array of at most ${maximum} objects`);
  }
  return value as T[];
}

export function parseProposalRequest(params: Row): ProposalRequestBody {
  const partnerCategory = requireText(params.partner_category, "partner_category", 64) as PartnerRelationshipCategory;
  if (!PARTNER_CATEGORIES.has(partnerCategory)) throw new Error("partner_category is invalid");
  const request: ProposalRequestBody = {
    workspace_key: requireIdentifier(params.workspace_key, "workspace_key", 128),
    proposed_canonical_entity_id: requireIdentifier(
      params.proposed_canonical_entity_id,
      "proposed_canonical_entity_id",
      256,
    ),
    proposed_contact_id: optionalIdentifier(params.proposed_contact_id, "proposed_contact_id", 256),
    partner_category: partnerCategory,
    record_ids: recordIds(params.record_ids),
    open_loop_proposals: objectArray<OpenLoopAssertion>(
      params.open_loop_proposals,
      "open_loop_proposals",
      100,
    ),
    source_coverage_proposals: objectArray<SourceCoverageAssertion>(
      params.source_coverage_proposals,
      "source_coverage_proposals",
      50,
    ),
    classifier_id: requireIdentifier(params.classifier_id, "classifier_id", 128),
    classifier_prompt_sha256: requireText(
      params.classifier_prompt_sha256,
      "classifier_prompt_sha256",
      64,
    ),
    proposal_note: optionalText(params.proposal_note, "proposal_note", 2_048),
  };
  if (!SHA256.test(request.classifier_prompt_sha256)) {
    throw new Error("classifier_prompt_sha256 is invalid");
  }
  return request;
}

function validateProposalShape(
  request: ProposalRequestBody,
  records: CommunicationRecord[],
): ReturnType<typeof projectPartnerWorkspace> {
  const ids = new Set(request.record_ids);
  if (records.length !== ids.size || records.some((record) => !ids.has(record.source_record_id))) {
    throw new Error("proposal source records do not match record_ids");
  }
  if (
    request.source_coverage_proposals.length !== request.record_ids.length ||
    new Set(request.source_coverage_proposals.map((entry) => entry.source_record_id)).size !== request.record_ids.length
  ) {
    throw new Error("proposal must provide exactly one coverage assertion per source record");
  }
  for (const coverage of request.source_coverage_proposals) {
    if (!ids.has(coverage.source_record_id)) throw new Error("proposal coverage references an unknown source record");
    if (coverage.assertion_origin !== "model" && coverage.assertion_origin !== "deterministic_rule") {
      throw new Error("proposal coverage must remain model or deterministic-rule output");
    }
  }
  for (const loop of request.open_loop_proposals) {
    if (loop.review_state !== "proposed") throw new Error("open_loop proposal must remain proposed");
    if (loop.assertion_origin !== "model" && loop.assertion_origin !== "deterministic_rule") {
      throw new Error("open_loop proposal origin is invalid");
    }
    if (loop.canonical_entity_id !== request.proposed_canonical_entity_id) {
      throw new Error("open_loop proposal crosses the proposed canonical entity");
    }
  }
  return projectPartnerWorkspace({
    records,
    identity_resolutions: request.record_ids.map((sourceRecordId) => ({
      source_record_id: sourceRecordId,
      status: "confirmed",
      decision_origin: "operator_review",
      canonical_entity_id: request.proposed_canonical_entity_id,
      ...(request.proposed_contact_id ? { contact_id: request.proposed_contact_id } : {}),
    })),
    workspace_assertions: request.record_ids.map((sourceRecordId) => ({
      source_record_id: sourceRecordId,
      category: request.partner_category,
      status: "confirmed",
      assertion_origin: "operator_review",
    })),
    open_loop_assertions: request.open_loop_proposals.map((loop) => ({
      ...loop,
      review_state: "confirmed",
      assertion_origin: "operator_review",
    })),
    source_coverage_assertions: request.source_coverage_proposals.map((coverage) => ({
      ...coverage,
      assertion_origin: "operator_review",
    })),
  });
}

function proposalThreadId(workspaceKey: string): string {
  return `partner-proposals:${workspaceKey}`;
}

function parseStoredProposal(record: Row): StoredProposalBatch {
  if (text(record.platform) !== PROPOSAL_PLATFORM) throw new Error("proposal history contains a foreign platform");
  const metadata = row(record.metadata);
  if (text(metadata.family) !== PROPOSAL_FAMILY) throw new Error("proposal history contains a foreign family");
  const payload = row(record.payload);
  if (payload.assertion_family !== PROPOSAL_FAMILY || payload.schema_version !== PROPOSAL_SCHEMA_VERSION) {
    throw new Error("proposal history schema is invalid");
  }
  const stored = payload as StoredProposalBatch;
  const request = parseProposalRequest(stored);
  if (!IDEMPOTENCY_KEY.test(text(stored.proposal_idempotency_key))) {
    throw new Error("proposal history idempotency key is invalid");
  }
  if (
    stored.proposed_by_email !== null &&
    (!text(stored.proposed_by_email) || Buffer.byteLength(stored.proposed_by_email, "utf8") > 320)
  ) {
    throw new Error("proposal history proposer email is invalid");
  }
  if (!stored.proposed_at || new Date(stored.proposed_at).toISOString() !== stored.proposed_at) {
    throw new Error("proposal history timestamp is invalid");
  }
  for (const value of [
    stored.proposal_batch_sha256,
    stored.proposal_response_sha256,
    stored.request_body_sha256,
  ]) {
    if (!SHA256.test(text(value))) throw new Error("proposal history digest is invalid");
  }
  const expectedResponseSha256 = digest({
    open_loop_proposals: request.open_loop_proposals,
    source_coverage_proposals: request.source_coverage_proposals,
  });
  if (expectedResponseSha256 !== stored.proposal_response_sha256) {
    throw new Error("proposal response digest mismatch");
  }
  if (!Array.isArray(stored.source_bindings) || stored.source_bindings.length !== request.record_ids.length) {
    throw new Error("proposal source bindings are invalid");
  }
  const bindingIds = new Set<string>();
  for (const binding of stored.source_bindings) {
    requireIdentifier(binding.source_record_id, "source_binding.source_record_id");
    if (!SHA256.test(text(binding.source_revision_sha256))) {
      throw new Error("proposal source binding digest is invalid");
    }
    bindingIds.add(binding.source_record_id);
  }
  if (bindingIds.size !== request.record_ids.length || request.record_ids.some((id) => !bindingIds.has(id))) {
    throw new Error("proposal source bindings disagree with record_ids");
  }
  const expectedRequestBodySha256 = digest({
    request,
    source_bindings: stored.source_bindings,
    proposer_id: stored.proposed_by_user_id,
    proposer_email: stored.proposed_by_email,
  });
  if (expectedRequestBodySha256 !== stored.request_body_sha256) {
    throw new Error("proposal request body digest mismatch");
  }
  const batchBody = { ...stored } as Row;
  delete batchBody.proposal_batch_sha256;
  if (digest(batchBody) !== stored.proposal_batch_sha256) {
    throw new Error("proposal batch digest mismatch");
  }
  return stored;
}

async function listAllProposalHistory(
  ctx: NexAppMethodContext,
): Promise<Array<{ record: Row; proposal: StoredProposalBatch }>> {
  const records: Row[] = [];
  for (let offset = 0; offset < MAX_HISTORY; offset += PAGE_SIZE) {
    const response = unwrap(await ctx.nex.records.list({
      platform: PROPOSAL_PLATFORM,
      limit: PAGE_SIZE,
      offset,
    }));
    if (!Array.isArray(response.records)) throw new Error("records.list did not return records");
    const page = response.records.map(row);
    records.push(...page);
    if (records.length > MAX_HISTORY) throw new Error(`proposal history exceeds ${MAX_HISTORY} rows`);
    if (page.length < PAGE_SIZE) break;
  }
  return records
    .filter((record) => text(row(record.metadata).family) === PROPOSAL_FAMILY)
    .map((record) => {
      const proposal = parseStoredProposal(record);
      if (
        text(record.thread_id) !== proposalThreadId(proposal.workspace_key) ||
        text(row(record.metadata).source_connection_id) !== PROPOSAL_CONNECTION ||
        text(row(record.metadata).revision_hash) !== proposal.proposal_batch_sha256
      ) {
        throw new Error("proposal history binding is invalid");
      }
      return { record, proposal };
    });
}

function publicProposal(proposal: StoredProposalBatch): Row {
  return {
    proposal_batch_sha256: proposal.proposal_batch_sha256,
    proposal_response_sha256: proposal.proposal_response_sha256,
    workspace_key: proposal.workspace_key,
    proposed_canonical_entity_id: proposal.proposed_canonical_entity_id,
    proposed_contact_id: proposal.proposed_contact_id ?? null,
    partner_category: proposal.partner_category,
    record_ids: proposal.record_ids,
    open_loop_proposals: proposal.open_loop_proposals,
    source_coverage_proposals: proposal.source_coverage_proposals,
    classifier_id: proposal.classifier_id,
    classifier_prompt_sha256: proposal.classifier_prompt_sha256,
    proposal_note: proposal.proposal_note ?? null,
    proposed_at: proposal.proposed_at,
    proposed_by_user_id: proposal.proposed_by_user_id,
    proposed_by_email: proposal.proposed_by_email,
  };
}

export async function listProposalBatches(ctx: NexAppMethodContext): Promise<Row> {
  const history = await listAllProposalHistory(ctx);
  const batches = history
    .map(({ proposal }) => publicProposal(proposal))
    .sort((left, right) => text(right.proposed_at).localeCompare(text(left.proposed_at)));
  return {
    state: "proposal_batch_index",
    proposal_batch_count: batches.length,
    batches,
    model_output_operational_authority: false,
    provider_write_authority: false,
  };
}

export async function proposalRecordIndex(
  ctx: NexAppMethodContext,
): Promise<Map<string, ProposalRecordIndexEntry[]>> {
  const history = await listAllProposalHistory(ctx);
  const index = new Map<string, ProposalRecordIndexEntry[]>();
  for (const { proposal } of history) {
    const coverage = new Map(
      proposal.source_coverage_proposals.map((entry) => [entry.source_record_id, entry]),
    );
    for (const recordId of proposal.record_ids) {
      const assertion = coverage.get(recordId);
      if (!assertion) throw new Error("proposal history is missing source coverage");
      const existing = index.get(recordId) ?? [];
      existing.push({
        proposal_batch_sha256: proposal.proposal_batch_sha256,
        workspace_key: proposal.workspace_key,
        classifier_id: proposal.classifier_id,
        proposed_at: proposal.proposed_at,
        disposition: assertion.disposition,
        open_loop_ids: assertion.open_loop_ids,
      });
      index.set(recordId, existing);
    }
  }
  for (const entries of index.values()) {
    entries.sort((left, right) =>
      right.proposed_at.localeCompare(left.proposed_at) ||
      left.proposal_batch_sha256.localeCompare(right.proposal_batch_sha256)
    );
  }
  return index;
}

export async function commitProposalBatch(params: {
  ctx: NexAppMethodContext;
  request: ProposalRequestBody;
  proposalIdempotencyKey: string;
  records: CommunicationRecord[];
}): Promise<Row> {
  const { ctx, request } = params;
  if (!IDEMPOTENCY_KEY.test(params.proposalIdempotencyKey)) {
    throw new Error("proposal_idempotency_key is invalid");
  }
  validateProposalShape(request, params.records);
  const proposerId = requireIdentifier(ctx.user.userId, "authenticated proposer user id", 256);
  const proposerEmail = text(ctx.user.email).toLowerCase() || null;
  const sourceBindings = [...params.records]
    .map((record) => ({
      source_record_id: record.source_record_id,
      source_revision_sha256: record.source_revision_sha256,
    }))
    .sort((left, right) => left.source_record_id.localeCompare(right.source_record_id));
  const requestBodySha256 = digest({
    request,
    source_bindings: sourceBindings,
    proposer_id: proposerId,
    proposer_email: proposerEmail,
  });
  const history = await listAllProposalHistory(ctx);
  const replay = history.find(
    ({ proposal }) => proposal.proposal_idempotency_key === params.proposalIdempotencyKey,
  );
  if (replay) {
    if (replay.proposal.request_body_sha256 !== requestBodySha256) {
      throw new Error("proposal idempotency key was already used for different output");
    }
    return {
      state: "proposal_replayed",
      created: false,
      proposal: publicProposal(replay.proposal),
      validation: {
        source_record_count: request.record_ids.length,
        open_loop_proposal_count: request.open_loop_proposals.length,
        source_coverage_proposal_count: request.source_coverage_proposals.length,
      },
      model_output_operational_authority: false,
      provider_write_authority: false,
    };
  }
  const proposalResponseSha256 = digest({
    open_loop_proposals: request.open_loop_proposals,
    source_coverage_proposals: request.source_coverage_proposals,
  });
  const storedWithoutBatchSha: Omit<StoredProposalBatch, "proposal_batch_sha256"> = {
    assertion_family: PROPOSAL_FAMILY,
    schema_version: PROPOSAL_SCHEMA_VERSION,
    ...request,
    proposal_response_sha256: proposalResponseSha256,
    request_body_sha256: requestBodySha256,
    proposal_idempotency_key: params.proposalIdempotencyKey,
    source_bindings: sourceBindings,
    proposed_at: new Date().toISOString(),
    proposed_by_user_id: proposerId,
    proposed_by_email: proposerEmail,
  };
  const proposalBatchSha256 = digest(storedWithoutBatchSha);
  const stored: StoredProposalBatch = {
    ...storedWithoutBatchSha,
    proposal_batch_sha256: proposalBatchSha256,
  };
  const externalRecordId = `partner-desk:proposal:${proposalBatchSha256}`;
  const receiverEntityId = text(ctx.app.config.review_receiver_entity_id) || proposerId;
  const ingest = unwrap(await ctx.nex.record.ingest({
    routing: {
      adapter: "moonsleep-partner-desk",
      platform: PROPOSAL_PLATFORM,
      connection_id: PROPOSAL_CONNECTION,
      sender_id: proposerId,
      sender_name: ctx.user.displayName || proposerEmail,
      receiver_id: receiverEntityId,
      receiver_name: "MoonSleep Partner Desk",
      container_kind: "direct",
      container_id: proposalThreadId(request.workspace_key),
      thread_id: proposalThreadId(request.workspace_key),
      metadata: { assertion_family: PROPOSAL_FAMILY },
    },
    payload: {
      external_record_id: externalRecordId,
      timestamp: Date.parse(stored.proposed_at),
      content: `Partner Desk proposal batch ${proposalBatchSha256.slice(0, 12)} for ${request.workspace_key}`,
      content_type: "text",
      payload: stored,
      metadata: {
        family: PROPOSAL_FAMILY,
        revision_hash: proposalBatchSha256,
        source_connection_id: PROPOSAL_CONNECTION,
        assertion_family: PROPOSAL_FAMILY,
      },
    },
  }));
  if (ingest.status !== "completed" && text(row(ingest.result).status) !== "completed") {
    throw new Error("proposal record ingest did not complete");
  }
  const after = await listAllProposalHistory(ctx);
  const created = after.find(
    ({ proposal }) => proposal.proposal_batch_sha256 === proposalBatchSha256,
  );
  if (!created || created.proposal.request_body_sha256 !== requestBodySha256) {
    throw new Error("proposal commit readback did not match the committed batch");
  }
  return {
    state: "proposal_committed",
    created: true,
    record_id: externalRecordId,
    proposal: publicProposal(stored),
    validation: {
      source_record_count: request.record_ids.length,
      open_loop_proposal_count: request.open_loop_proposals.length,
      source_coverage_proposal_count: request.source_coverage_proposals.length,
    },
    model_output_operational_authority: false,
    provider_write_authority: false,
  };
}
