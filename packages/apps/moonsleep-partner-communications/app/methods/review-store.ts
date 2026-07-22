import { createHash } from "node:crypto";
import type { NexAppMethodContext } from "../../../../../nex/src/runtime/domains/apps/context.js";
import {
  projectPartnerWorkspace,
  type IdentityResolution,
  type OpenLoopAssertion,
  type SourceCoverageAssertion,
  type WorkspaceAssertion,
} from "../src/projection.js";

type Row = Record<string, unknown>;

const REVIEW_PLATFORM = "partner-desk";
const REVIEW_CONNECTION = "moonsleep-partner-desk-reviewed";
const REVIEW_FAMILY = "workspace_review";
const REVIEW_SCHEMA_VERSION = 1;
const PAGE_SIZE = 1_000;
const MAX_HISTORY = 10_000;
const SHA256 = /^[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._@/+\-$]{0,511}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-$]{15,127}$/;

export type ReviewRequestBody = {
  workspace_key: string;
  canonical_entity_id: string;
  record_ids: string[];
  identity_resolutions: IdentityResolution[];
  workspace_assertions: WorkspaceAssertion[];
  open_loop_assertions: OpenLoopAssertion[];
  source_coverage_assertions: SourceCoverageAssertion[];
  review_note?: string;
};

type StoredReview = ReviewRequestBody & {
  assertion_family: typeof REVIEW_FAMILY;
  schema_version: typeof REVIEW_SCHEMA_VERSION;
  revision_sha256: string;
  previous_revision_sha256: string | null;
  request_body_sha256: string;
  review_idempotency_key: string;
  reviewed_at: string;
  reviewed_by_user_id: string;
  reviewed_by_email: string;
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

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function objectArray<T>(value: unknown, field: string, maximum: number): T[] {
  if (!Array.isArray(value) || value.length > maximum || value.some((entry) => Object.keys(row(entry)).length === 0)) {
    throw new Error(`${field} must be an array of at most ${maximum} objects`);
  }
  return value as T[];
}

function recordIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new Error("record_ids must contain between 1 and 50 entries");
  }
  const ids = value.map((entry, index) => requireIdentifier(entry, `record_ids[${index}]`));
  if (new Set(ids).size !== ids.length) throw new Error("record_ids must be unique");
  return ids;
}

export function parseReviewRequest(params: Row): ReviewRequestBody {
  return {
    workspace_key: requireIdentifier(params.workspace_key, "workspace_key", 128),
    canonical_entity_id: requireIdentifier(params.canonical_entity_id, "canonical_entity_id", 256),
    record_ids: recordIds(params.record_ids),
    identity_resolutions: objectArray<IdentityResolution>(params.identity_resolutions, "identity_resolutions", 50),
    workspace_assertions: objectArray<WorkspaceAssertion>(params.workspace_assertions, "workspace_assertions", 50),
    open_loop_assertions: objectArray<OpenLoopAssertion>(params.open_loop_assertions, "open_loop_assertions", 100),
    source_coverage_assertions: objectArray<SourceCoverageAssertion>(params.source_coverage_assertions, "source_coverage_assertions", 50),
    review_note: optionalText(params.review_note, "review_note", 2_048),
  };
}

function reviewThreadId(workspaceKey: string): string {
  return `partner-workspace:${workspaceKey}`;
}

function parseStoredReview(record: Row): StoredReview {
  if (text(record.platform) !== REVIEW_PLATFORM) throw new Error("review history contains a foreign platform");
  const metadata = row(record.metadata);
  if (text(metadata.family) !== REVIEW_FAMILY) throw new Error("review history contains a foreign family");
  const payload = row(record.payload);
  if (payload.assertion_family !== REVIEW_FAMILY || payload.schema_version !== REVIEW_SCHEMA_VERSION) {
    throw new Error("review history schema is invalid");
  }
  const stored = payload as StoredReview;
  if (!IDEMPOTENCY_KEY.test(text(stored.review_idempotency_key))) {
    throw new Error("review history idempotency key is invalid");
  }
  if (!stored.reviewed_at || new Date(stored.reviewed_at).toISOString() !== stored.reviewed_at) {
    throw new Error("review history timestamp is invalid");
  }
  if (!SHA256.test(text(stored.revision_sha256)) || !SHA256.test(text(stored.request_body_sha256))) {
    throw new Error("review history digest is invalid");
  }
  const revisionBody = { ...stored } as Row;
  delete revisionBody.revision_sha256;
  if (digest(revisionBody) !== stored.revision_sha256) throw new Error("review history digest mismatch");
  if (stored.previous_revision_sha256 !== null && !SHA256.test(text(stored.previous_revision_sha256))) {
    throw new Error("review history previous revision is invalid");
  }
  const request = parseReviewRequest(stored);
  const expectedRequestBodySha256 = digest({
    request,
    reviewer_id: stored.reviewed_by_user_id,
    reviewer_email: stored.reviewed_by_email,
  });
  if (expectedRequestBodySha256 !== stored.request_body_sha256) {
    throw new Error("review history request body digest mismatch");
  }
  return stored;
}

async function listReviewHistory(ctx: NexAppMethodContext, workspaceKey: string): Promise<Array<{ record: Row; review: StoredReview }>> {
  const records: Row[] = [];
  for (let offset = 0; offset < MAX_HISTORY; offset += PAGE_SIZE) {
    const response = unwrap(await ctx.nex.records.list({
      platform: REVIEW_PLATFORM,
      thread_id: reviewThreadId(workspaceKey),
      limit: PAGE_SIZE,
      offset,
    }));
    if (!Array.isArray(response.records)) throw new Error("records.list did not return records");
    const page = response.records.map(row);
    records.push(...page);
    if (records.length > MAX_HISTORY) throw new Error(`review history exceeds ${MAX_HISTORY} rows`);
    if (page.length < PAGE_SIZE) break;
  }
  return records.map((record) => {
    if (text(record.thread_id) !== reviewThreadId(workspaceKey)) {
      throw new Error("review history contains a foreign thread");
    }
    const metadata = row(record.metadata);
    if (text(metadata.source_connection_id) !== REVIEW_CONNECTION) {
      throw new Error("review history contains a foreign connection");
    }
    const review = parseStoredReview(record);
    if (review.workspace_key !== workspaceKey || text(metadata.revision_hash) !== review.revision_sha256) {
      throw new Error("review history binding is invalid");
    }
    return { record, review };
  });
}

function currentHeads(history: Array<{ record: Row; review: StoredReview }>): Array<{ record: Row; review: StoredReview }> {
  const referenced = new Set(
    history.map(({ review }) => review.previous_revision_sha256).filter((value): value is string => value !== null),
  );
  return history.filter(({ review }) => !referenced.has(review.revision_sha256));
}

function publicReview(review: StoredReview): Row {
  return {
    workspace_key: review.workspace_key,
    canonical_entity_id: review.canonical_entity_id,
    revision_sha256: review.revision_sha256,
    previous_revision_sha256: review.previous_revision_sha256,
    reviewed_at: review.reviewed_at,
    reviewed_by_user_id: review.reviewed_by_user_id,
    reviewed_by_email: review.reviewed_by_email,
    review_note: review.review_note ?? null,
    record_ids: review.record_ids,
  };
}

export async function readCurrentReview(ctx: NexAppMethodContext, workspaceKey: string): Promise<Row> {
  const history = await listReviewHistory(ctx, workspaceKey);
  if (history.length === 0) {
    return { state: "empty", workspace_key: workspaceKey, history_count: 0, provider_write_authority: false };
  }
  const heads = currentHeads(history);
  if (heads.length !== 1) {
    return {
      state: "review_conflict",
      workspace_key: workspaceKey,
      history_count: history.length,
      head_revisions: heads.map(({ review }) => review.revision_sha256).sort(),
      provider_write_authority: false,
    };
  }
  const review = heads[0].review;
  return {
    state: "current_review",
    history_count: history.length,
    review: publicReview(review),
    assertions: {
      identity_resolutions: review.identity_resolutions,
      workspace_assertions: review.workspace_assertions,
      open_loop_assertions: review.open_loop_assertions,
      source_coverage_assertions: review.source_coverage_assertions,
    },
    provider_write_authority: false,
  };
}

export async function commitReview(params: {
  ctx: NexAppMethodContext;
  request: ReviewRequestBody;
  reviewIdempotencyKey: string;
  previousRevisionSha256: string | null;
  projection: ReturnType<typeof projectPartnerWorkspace>;
}): Promise<Row> {
  const { ctx, request } = params;
  if (!IDEMPOTENCY_KEY.test(params.reviewIdempotencyKey)) throw new Error("review_idempotency_key is invalid");
  if (params.previousRevisionSha256 !== null && !SHA256.test(params.previousRevisionSha256)) {
    throw new Error("previous_revision_sha256 is invalid");
  }
  const reviewerId = requireIdentifier(ctx.user.userId, "authenticated reviewer user id", 256);
  const reviewerEmail = requireText(ctx.user.email, "authenticated reviewer email", 320).toLowerCase();
  const requestBodySha256 = digest({ request, reviewer_id: reviewerId, reviewer_email: reviewerEmail });
  const history = await listReviewHistory(ctx, request.workspace_key);
  const replay = history.find(({ review }) => review.review_idempotency_key === params.reviewIdempotencyKey);
  if (replay) {
    if (replay.review.request_body_sha256 !== requestBodySha256) {
      throw new Error("review idempotency key was already used for different assertions");
    }
    return {
      state: "review_replayed",
      created: false,
      review: publicReview(replay.review),
      projection: params.projection,
      provider_write_authority: false,
    };
  }
  const heads = currentHeads(history);
  if (heads.length > 1) throw new Error("review history has divergent heads and requires explicit reconciliation");
  const currentRevision = heads[0]?.review.revision_sha256 ?? null;
  if (currentRevision !== params.previousRevisionSha256) {
    throw new Error("review previous revision does not match the current head");
  }
  const storedWithoutRevision: Omit<StoredReview, "revision_sha256"> = {
    assertion_family: REVIEW_FAMILY,
    schema_version: REVIEW_SCHEMA_VERSION,
    ...request,
    previous_revision_sha256: currentRevision,
    request_body_sha256: requestBodySha256,
    review_idempotency_key: params.reviewIdempotencyKey,
    reviewed_at: new Date().toISOString(),
    reviewed_by_user_id: reviewerId,
    reviewed_by_email: reviewerEmail,
  };
  const revisionSha256 = digest(storedWithoutRevision);
  const stored: StoredReview = { ...storedWithoutRevision, revision_sha256: revisionSha256 };
  const externalRecordId = `partner-desk:review:${revisionSha256}`;
  const receiverEntityId = text(ctx.app.config.review_receiver_entity_id) || reviewerId;
  const ingest = unwrap(await ctx.nex.record.ingest({
    routing: {
      adapter: "moonsleep-partner-desk",
      platform: REVIEW_PLATFORM,
      connection_id: REVIEW_CONNECTION,
      sender_id: reviewerId,
      sender_name: ctx.user.displayName || reviewerEmail,
      receiver_id: receiverEntityId,
      receiver_name: "MoonSleep Partner Desk",
      container_kind: "direct",
      container_id: reviewThreadId(request.workspace_key),
      thread_id: reviewThreadId(request.workspace_key),
      metadata: { assertion_family: REVIEW_FAMILY },
    },
    payload: {
      external_record_id: externalRecordId,
      timestamp: Date.parse(stored.reviewed_at),
      content: `Reviewed Partner Desk workspace ${request.workspace_key} revision ${revisionSha256.slice(0, 12)}`,
      content_type: "text",
      payload: stored,
      metadata: {
        family: REVIEW_FAMILY,
        revision_hash: revisionSha256,
        source_connection_id: REVIEW_CONNECTION,
        assertion_family: REVIEW_FAMILY,
      },
    },
  }));
  if (ingest.status !== "completed" && text(row(ingest.result).status) !== "completed") {
    throw new Error("review record ingest did not complete");
  }
  const after = await listReviewHistory(ctx, request.workspace_key);
  const afterHeads = currentHeads(after);
  if (afterHeads.length !== 1 || afterHeads[0].review.revision_sha256 !== revisionSha256) {
    throw new Error("review commit produced a divergent head and requires explicit reconciliation");
  }
  return {
    state: "review_committed",
    created: true,
    record_id: externalRecordId,
    review: publicReview(stored),
    projection: params.projection,
    provider_write_authority: false,
  };
}
