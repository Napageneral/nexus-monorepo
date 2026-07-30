import { readFileSync } from "node:fs";
import type { DatabaseSync } from "../../../../../nex/src/storage/ledgers.ts";
import {
  runPartnerBoundedHistoricalShadow,
  type PartnerShadowCohortRequest,
  type PartnerShadowMemberRequest,
  type PartnerShadowProjection,
  type PartnerShadowReceipt,
  type PartnerShadowRevisionStore,
  type VerifiedPartnerShadowIdentityBinding,
} from "./bounded-historical-shadow.ts";
import {
  canonicalJson,
  DEFAULT_CANONICAL_MANIFEST_PATH,
  sha256,
} from "./canonical-prep.ts";

const CONTRACT_ID = "moonsleep.partner.pd11.historical-shadow.v2" as const;
const EXECUTION_MODE = "isolated_shadow_memory" as const;
const MAX_MEMBERS = 5;
const SHA256 = /^[0-9a-f]{64}$/;
const OPAQUE_REF = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,255}$/;
const COHORT_ID = /^PD-1[01]-[A-Z0-9][A-Z0-9-]{0,63}$/;

export type PartnerShadowIdentityPartyRow = {
  party_ordinal: number;
  contact_observation_id: string;
  observed_entity_id: string;
  canonical_entity_id_at_commit: string;
};

export type PartnerShadowIdentityReceiptRow = {
  id: string;
  source_revision_id: string;
  connection_id: string;
  identity_contract_version: string;
  identity_result_digest: string;
  status: string;
  parties: PartnerShadowIdentityPartyRow[];
};

export type PartnerShadowV2Store = PartnerShadowRevisionStore & {
  getIdentityReceipt(id: string): Promise<PartnerShadowIdentityReceiptRow | null>;
};

export type PartnerShadowV2MemberRequest = PartnerShadowMemberRequest & {
  identity_receipt_id: string;
  identity_contract_version: string;
  identity_result_digest: string;
  identity_party_ordinal: number;
};

export type PartnerShadowV2Request = Omit<
  PartnerShadowCohortRequest,
  "members"
> & {
  current_projection_read_receipt_sha256: string;
  members: PartnerShadowV2MemberRequest[];
};

export type PartnerShadowV2Receipt = {
  contract_id: typeof CONTRACT_ID;
  cohort_id: string;
  execution_mode: typeof EXECUTION_MODE;
  source_manifest_sha256: string;
  source_read_receipt_sha256: string;
  current_projection_read_receipt_sha256: string;
  request_sha256: string;
  exact_revision_set_sha256: string;
  identity_receipt_set_sha256: string;
  comparison_ledger_sha256: string;
  dead_letter_ledger_sha256: string;
  member_count: number;
  completed_count: number;
  dead_letter_count: number;
  comparison_count: number;
  review_required_count: number;
  resume_count: number;
  replay_stable: true;
  authority: {
    provider_calls: 0;
    model_calls: 0;
    provider_write_authority: false;
    identity_merge_authority: false;
    draft_or_send_authority: false;
    canonical_promotion_authority: false;
    production_projection_authority: false;
    active_projection_writes: 0;
  };
  receipt_sha256: string;
};

type ProgressRow = {
  member_ordinal: number;
  member_ref_sha256: string;
  status: "completed" | "dead_lettered";
  member_receipt_sha256: string | null;
};

type ComparisonRow = {
  member_ordinal: number;
  member_ref_sha256: string;
  subject_ref_sha256: string;
  old_projection_sha256: string;
  candidate_projection_sha256: string;
  differing_fields_json: string;
  review_required: number;
};

type DeadLetterRow = {
  member_ordinal: number;
  member_ref_sha256: string;
  source_revision_ref_sha256: string;
  identity_receipt_ref_sha256: string;
  error_code: string;
  error_sha256: string;
  attempt_count: number;
};

function digest(value: unknown): string {
  return sha256(Buffer.from(JSON.stringify(canonicalJson(value)), "utf8"));
}

function exactText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`${field} must be a non-empty exact string`);
  }
  return value;
}

function opaque(value: unknown, field: string): string {
  const parsed = exactText(value, field);
  if (!OPAQUE_REF.test(parsed) || parsed.includes("@")) {
    throw new Error(`${field} must be an opaque reference`);
  }
  return parsed;
}

function exactSha(value: unknown, field: string): string {
  const parsed = exactText(value, field).toLowerCase();
  if (!SHA256.test(parsed)) {
    throw new Error(`${field} must be a lowercase SHA-256`);
  }
  return parsed;
}

function sourceManifestSha256(path: string): string {
  return sha256(readFileSync(path));
}

function memberRef(member: PartnerShadowV2MemberRequest): string {
  return digest({
    record_row_id: member.record_row_id,
    revision_id: member.revision_id,
    payload_sha256: member.payload_sha256,
    identity_receipt_id: member.identity_receipt_id,
    identity_result_digest: member.identity_result_digest,
    identity_party_ordinal: member.identity_party_ordinal,
  });
}

function sortedMembers(
  request: PartnerShadowV2Request,
): PartnerShadowV2MemberRequest[] {
  if (!COHORT_ID.test(request.cohort_id)) {
    throw new Error("cohort_id is invalid");
  }
  opaque(request.connection_id, "connection_id");
  exactSha(request.source_read_receipt_sha256, "source_read_receipt_sha256");
  exactSha(
    request.current_projection_read_receipt_sha256,
    "current_projection_read_receipt_sha256",
  );
  if (request.execution_mode !== EXECUTION_MODE) {
    throw new Error("execution_mode must remain isolated_shadow_memory");
  }
  if (request.members.length < 1 || request.members.length > MAX_MEMBERS) {
    throw new Error(`bounded Partner shadow requires 1-${MAX_MEMBERS} members`);
  }
  const members = [...request.members].sort((left, right) =>
    `${left.record_row_id}\n${left.revision_id}`.localeCompare(
      `${right.record_row_id}\n${right.revision_id}`,
    ),
  );
  if (
    new Set(members.map((member) => member.record_row_id)).size !==
      members.length ||
    new Set(members.map((member) => member.revision_id)).size !== members.length ||
    new Set(members.map((member) => member.identity_receipt_id)).size !==
      members.length
  ) {
    throw new Error("bounded Partner shadow contains duplicate exact bindings");
  }
  for (const [index, member] of members.entries()) {
    opaque(member.record_row_id, `members[${index}].record_row_id`);
    opaque(member.revision_id, `members[${index}].revision_id`);
    exactSha(member.payload_sha256, `members[${index}].payload_sha256`);
    opaque(
      member.source_logical_record_ref,
      `members[${index}].source_logical_record_ref`,
    );
    exactSha(
      member.source_revision_sha256,
      `members[${index}].source_revision_sha256`,
    );
    opaque(
      member.identity_receipt_id,
      `members[${index}].identity_receipt_id`,
    );
    opaque(
      member.identity_contract_version,
      `members[${index}].identity_contract_version`,
    );
    exactSha(
      member.identity_result_digest,
      `members[${index}].identity_result_digest`,
    );
    if (
      !Number.isSafeInteger(member.identity_party_ordinal) ||
      member.identity_party_ordinal < 0 ||
      member.identity_party_ordinal > 31
    ) {
      throw new Error(`members[${index}].identity_party_ordinal is invalid`);
    }
  }
  return members;
}

function createControlTables(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS partner_shadow_runs (
      cohort_id TEXT PRIMARY KEY,
      request_sha256 TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('running', 'completed')),
      member_count INTEGER NOT NULL,
      next_member_ordinal INTEGER NOT NULL DEFAULT 0,
      resume_count INTEGER NOT NULL DEFAULT 0,
      terminal_receipt_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS partner_shadow_member_progress (
      cohort_id TEXT NOT NULL,
      member_ordinal INTEGER NOT NULL,
      member_ref_sha256 TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('completed', 'dead_lettered')),
      member_receipt_sha256 TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (cohort_id, member_ordinal),
      UNIQUE (cohort_id, member_ref_sha256),
      FOREIGN KEY (cohort_id) REFERENCES partner_shadow_runs(cohort_id)
    );
    CREATE TABLE IF NOT EXISTS partner_shadow_comparison_ledger (
      cohort_id TEXT NOT NULL,
      member_ordinal INTEGER NOT NULL,
      member_ref_sha256 TEXT NOT NULL,
      subject_ref_sha256 TEXT NOT NULL,
      old_projection_sha256 TEXT NOT NULL,
      candidate_projection_sha256 TEXT NOT NULL,
      differing_fields_json TEXT NOT NULL,
      review_required INTEGER NOT NULL CHECK (review_required IN (0, 1)),
      active_projection_write_authority INTEGER NOT NULL
        CHECK (active_projection_write_authority = 0),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (cohort_id, member_ordinal),
      FOREIGN KEY (cohort_id, member_ordinal)
        REFERENCES partner_shadow_member_progress(cohort_id, member_ordinal)
    );
    CREATE TABLE IF NOT EXISTS partner_shadow_dead_letters (
      cohort_id TEXT NOT NULL,
      member_ordinal INTEGER NOT NULL,
      member_ref_sha256 TEXT NOT NULL,
      source_revision_ref_sha256 TEXT NOT NULL,
      identity_receipt_ref_sha256 TEXT NOT NULL,
      error_code TEXT NOT NULL,
      error_sha256 TEXT NOT NULL,
      attempt_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (cohort_id, member_ordinal),
      FOREIGN KEY (cohort_id, member_ordinal)
        REFERENCES partner_shadow_member_progress(cohort_id, member_ordinal)
    );
  `);
}

function ensureRun(
  db: DatabaseSync,
  request: PartnerShadowV2Request,
  requestSha256: string,
): { completedReceipt: PartnerShadowV2Receipt | null; resumed: boolean } {
  const existing = db
    .prepare(
      `SELECT request_sha256, status, terminal_receipt_json
         FROM partner_shadow_runs
        WHERE cohort_id = ?`,
    )
    .get(request.cohort_id) as
    | {
        request_sha256: string;
        status: string;
        terminal_receipt_json: string | null;
      }
    | undefined;
  if (!existing) {
    const now = Date.now();
    db.prepare(
      `INSERT INTO partner_shadow_runs (
         cohort_id, request_sha256, status, member_count, next_member_ordinal,
         resume_count, terminal_receipt_json, created_at, updated_at
       ) VALUES (?, ?, 'running', ?, 0, 0, NULL, ?, ?)`,
    ).run(request.cohort_id, requestSha256, request.members.length, now, now);
    return { completedReceipt: null, resumed: false };
  }
  if (existing.request_sha256 !== requestSha256) {
    throw new Error("Partner shadow cohort replay changed the exact request");
  }
  if (existing.status === "completed") {
    if (!existing.terminal_receipt_json) {
      throw new Error("completed Partner shadow run is missing its terminal receipt");
    }
    return {
      completedReceipt: JSON.parse(
        existing.terminal_receipt_json,
      ) as PartnerShadowV2Receipt,
      resumed: false,
    };
  }
  db.prepare(
    `UPDATE partner_shadow_runs
        SET resume_count = resume_count + 1, updated_at = ?
      WHERE cohort_id = ?`,
  ).run(Date.now(), request.cohort_id);
  return { completedReceipt: null, resumed: true };
}

function reviewedIdentityBinding(
  member: PartnerShadowV2MemberRequest,
  request: PartnerShadowV2Request,
  receipt: PartnerShadowIdentityReceiptRow | null,
): VerifiedPartnerShadowIdentityBinding {
  if (!receipt) {
    throw new Error("reviewed identity receipt is absent");
  }
  if (receipt.status !== "applied") {
    throw new Error("reviewed identity receipt is not terminal");
  }
  if (
    receipt.id !== member.identity_receipt_id ||
    receipt.source_revision_id !== member.revision_id ||
    receipt.connection_id !== request.connection_id ||
    receipt.identity_contract_version !== member.identity_contract_version ||
    receipt.identity_result_digest !== member.identity_result_digest
  ) {
    throw new Error("reviewed identity receipt exact binding mismatch");
  }
  if (!Array.isArray(receipt.parties) || receipt.parties.length < 1) {
    throw new Error("reviewed identity receipt has no parties");
  }
  const party = receipt.parties.find(
    (candidate) =>
      candidate.party_ordinal === member.identity_party_ordinal,
  );
  if (!party) {
    throw new Error("reviewed identity receipt party is absent");
  }
  opaque(
    party.contact_observation_id,
    "identity_party.contact_observation_id",
  );
  opaque(party.observed_entity_id, "identity_party.observed_entity_id");
  opaque(
    party.canonical_entity_id_at_commit,
    "identity_party.canonical_entity_id_at_commit",
  );
  return {
    identity_receipt_id: receipt.id,
    identity_result_digest: receipt.identity_result_digest,
    contact_observation_id: party.contact_observation_id,
    canonical_entity_id: party.canonical_entity_id_at_commit,
  };
}

function comparisonFor(
  member: PartnerShadowV2MemberRequest,
  memberReceipt: PartnerShadowReceipt,
): ComparisonRow {
  const comparison = memberReceipt.comparisons[0];
  if (!comparison || memberReceipt.comparisons.length !== 1) {
    throw new Error("Partner shadow member comparison receipt is incomplete");
  }
  return {
    member_ordinal: -1,
    member_ref_sha256: memberRef(member),
    subject_ref_sha256: comparison.subject_ref_sha256,
    old_projection_sha256: comparison.old_projection_sha256,
    candidate_projection_sha256: comparison.candidate_projection_sha256,
    differing_fields_json: JSON.stringify(comparison.differing_fields),
    review_required: comparison.review_required ? 1 : 0,
  };
}

function failureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("identity receipt is absent")) {
    return "identity_receipt_absent";
  }
  if (message.includes("identity receipt is not terminal")) {
    return "identity_receipt_not_terminal";
  }
  if (message.includes("identity receipt exact binding mismatch")) {
    return "identity_receipt_binding_mismatch";
  }
  if (message.includes("identity receipt party is absent")) {
    return "identity_receipt_party_absent";
  }
  if (message.includes("source revision is absent")) {
    return "source_revision_absent";
  }
  if (message.includes("source revision tuple mismatch")) {
    return "source_revision_tuple_mismatch";
  }
  if (message.includes("source revision") && message.includes("authority")) {
    return "source_authority_invalid";
  }
  return "shadow_member_processing_failed";
}

function recordCompletedMember(
  db: DatabaseSync,
  cohortId: string,
  ordinal: number,
  member: PartnerShadowV2MemberRequest,
  memberReceipt: PartnerShadowReceipt,
): void {
  const comparison = comparisonFor(member, memberReceipt);
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO partner_shadow_member_progress (
         cohort_id, member_ordinal, member_ref_sha256, status,
         member_receipt_sha256, created_at, updated_at
       ) VALUES (?, ?, ?, 'completed', ?, ?, ?)`,
    ).run(
      cohortId,
      ordinal,
      comparison.member_ref_sha256,
      memberReceipt.receipt_sha256,
      now,
      now,
    );
    db.prepare(
      `INSERT INTO partner_shadow_comparison_ledger (
         cohort_id, member_ordinal, member_ref_sha256, subject_ref_sha256,
         old_projection_sha256, candidate_projection_sha256,
         differing_fields_json, review_required,
         active_projection_write_authority, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    ).run(
      cohortId,
      ordinal,
      comparison.member_ref_sha256,
      comparison.subject_ref_sha256,
      comparison.old_projection_sha256,
      comparison.candidate_projection_sha256,
      comparison.differing_fields_json,
      comparison.review_required,
      now,
    );
    db.prepare(
      `UPDATE partner_shadow_runs
          SET next_member_ordinal = ?, updated_at = ?
        WHERE cohort_id = ?`,
    ).run(ordinal + 1, now, cohortId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function recordDeadLetter(
  db: DatabaseSync,
  cohortId: string,
  ordinal: number,
  member: PartnerShadowV2MemberRequest,
  error: unknown,
): void {
  const now = Date.now();
  const message = error instanceof Error ? error.message : String(error);
  const memberRefSha256 = memberRef(member);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO partner_shadow_member_progress (
         cohort_id, member_ordinal, member_ref_sha256, status,
         member_receipt_sha256, created_at, updated_at
       ) VALUES (?, ?, ?, 'dead_lettered', NULL, ?, ?)`,
    ).run(cohortId, ordinal, memberRefSha256, now, now);
    db.prepare(
      `INSERT INTO partner_shadow_dead_letters (
         cohort_id, member_ordinal, member_ref_sha256,
         source_revision_ref_sha256, identity_receipt_ref_sha256,
         error_code, error_sha256, attempt_count, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      cohortId,
      ordinal,
      memberRefSha256,
      digest(member.revision_id),
      digest(member.identity_receipt_id),
      failureCode(error),
      digest(message),
      now,
      now,
    );
    db.prepare(
      `UPDATE partner_shadow_runs
          SET next_member_ordinal = ?, updated_at = ?
        WHERE cohort_id = ?`,
    ).run(ordinal + 1, now, cohortId);
    db.exec("COMMIT");
  } catch (writeError) {
    db.exec("ROLLBACK");
    throw writeError;
  }
}

function terminalReceipt(
  db: DatabaseSync,
  request: PartnerShadowV2Request,
  requestSha256: string,
  members: PartnerShadowV2MemberRequest[],
  canonicalManifestPath: string,
): PartnerShadowV2Receipt {
  const progress = db
    .prepare(
      `SELECT member_ordinal, member_ref_sha256, status, member_receipt_sha256
         FROM partner_shadow_member_progress
        WHERE cohort_id = ?
        ORDER BY member_ordinal`,
    )
    .all(request.cohort_id) as unknown as ProgressRow[];
  const comparisons = db
    .prepare(
      `SELECT member_ordinal, member_ref_sha256, subject_ref_sha256,
              old_projection_sha256, candidate_projection_sha256,
              differing_fields_json, review_required
         FROM partner_shadow_comparison_ledger
        WHERE cohort_id = ?
        ORDER BY member_ordinal`,
    )
    .all(request.cohort_id) as unknown as ComparisonRow[];
  const deadLetters = db
    .prepare(
      `SELECT member_ordinal, member_ref_sha256, source_revision_ref_sha256,
              identity_receipt_ref_sha256, error_code, error_sha256,
              attempt_count
         FROM partner_shadow_dead_letters
        WHERE cohort_id = ?
        ORDER BY member_ordinal`,
    )
    .all(request.cohort_id) as unknown as DeadLetterRow[];
  if (progress.length !== members.length) {
    throw new Error("Partner shadow terminal progress is incomplete");
  }
  const run = db
    .prepare(
      `SELECT resume_count
         FROM partner_shadow_runs
        WHERE cohort_id = ?`,
    )
    .get(request.cohort_id) as { resume_count: number };
  const body = {
    contract_id: CONTRACT_ID,
    cohort_id: request.cohort_id,
    execution_mode: EXECUTION_MODE,
    source_manifest_sha256: sourceManifestSha256(canonicalManifestPath),
    source_read_receipt_sha256: request.source_read_receipt_sha256,
    current_projection_read_receipt_sha256:
      request.current_projection_read_receipt_sha256,
    request_sha256: requestSha256,
    exact_revision_set_sha256: digest(
      members.map((member) => ({
        record_row_id: member.record_row_id,
        revision_id: member.revision_id,
        payload_sha256: member.payload_sha256,
      })),
    ),
    identity_receipt_set_sha256: digest(
      members.map((member) => ({
        identity_receipt_id: member.identity_receipt_id,
        identity_contract_version: member.identity_contract_version,
        identity_result_digest: member.identity_result_digest,
        identity_party_ordinal: member.identity_party_ordinal,
      })),
    ),
    comparison_ledger_sha256: digest(comparisons),
    dead_letter_ledger_sha256: digest(deadLetters),
    member_count: members.length,
    completed_count: progress.filter((row) => row.status === "completed").length,
    dead_letter_count: deadLetters.length,
    comparison_count: comparisons.length,
    review_required_count: comparisons.filter(
      (row) => Number(row.review_required) === 1,
    ).length,
    resume_count: Number(run.resume_count),
    replay_stable: true as const,
    authority: {
      provider_calls: 0 as const,
      model_calls: 0 as const,
      provider_write_authority: false as const,
      identity_merge_authority: false as const,
      draft_or_send_authority: false as const,
      canonical_promotion_authority: false as const,
      production_projection_authority: false as const,
      active_projection_writes: 0 as const,
    },
  };
  return {
    ...body,
    receipt_sha256: digest(body),
  };
}

export async function runPartnerBoundedHistoricalShadowV2(input: {
  store: PartnerShadowV2Store;
  shadowMemoryDb: DatabaseSync;
  request: PartnerShadowV2Request;
  canonicalManifestPath?: string;
  interruptAfterTerminalMembers?: number;
}): Promise<PartnerShadowV2Receipt> {
  const canonicalManifestPath =
    input.canonicalManifestPath ?? DEFAULT_CANONICAL_MANIFEST_PATH;
  const members = sortedMembers(input.request);
  const stableRequest: PartnerShadowV2Request = {
    ...input.request,
    members,
  };
  const requestSha256 = digest(stableRequest);
  createControlTables(input.shadowMemoryDb);
  const run = ensureRun(input.shadowMemoryDb, stableRequest, requestSha256);
  if (run.completedReceipt) {
    return run.completedReceipt;
  }
  const existingProgress = new Set(
    (
      input.shadowMemoryDb
        .prepare(
          `SELECT member_ordinal
             FROM partner_shadow_member_progress
            WHERE cohort_id = ?`,
        )
        .all(stableRequest.cohort_id) as Array<{ member_ordinal: number }>
    ).map((row) => Number(row.member_ordinal)),
  );
  let terminalMembersThisInvocation = 0;
  for (const [ordinal, member] of members.entries()) {
    if (existingProgress.has(ordinal)) {
      continue;
    }
    try {
      const identityReceipt = await input.store.getIdentityReceipt(
        member.identity_receipt_id,
      );
      const binding = reviewedIdentityBinding(
        member,
        stableRequest,
        identityReceipt,
      );
      const memberReceipt = await runPartnerBoundedHistoricalShadow({
        revisionStore: input.store,
        shadowMemoryDb: input.shadowMemoryDb,
        canonicalManifestPath,
        request: {
          cohort_id: `PD-10-SHADOW-${digest(stableRequest.cohort_id)
            .slice(0, 16)
            .toUpperCase()}`,
          connection_id: stableRequest.connection_id,
          source_read_receipt_sha256:
            stableRequest.source_read_receipt_sha256,
          execution_mode: EXECUTION_MODE,
          members: [member],
        },
        identityBindings: new Map([[member.revision_id, binding]]),
      });
      recordCompletedMember(
        input.shadowMemoryDb,
        stableRequest.cohort_id,
        ordinal,
        member,
        memberReceipt,
      );
    } catch (error) {
      recordDeadLetter(
        input.shadowMemoryDb,
        stableRequest.cohort_id,
        ordinal,
        member,
        error,
      );
    }
    terminalMembersThisInvocation += 1;
    if (
      input.interruptAfterTerminalMembers !== undefined &&
      terminalMembersThisInvocation === input.interruptAfterTerminalMembers
    ) {
      throw new Error("synthetic Partner shadow interruption");
    }
  }
  const receipt = terminalReceipt(
    input.shadowMemoryDb,
    stableRequest,
    requestSha256,
    members,
    canonicalManifestPath,
  );
  input.shadowMemoryDb.exec("BEGIN IMMEDIATE");
  try {
    input.shadowMemoryDb
      .prepare(
        `UPDATE partner_shadow_runs
            SET status = 'completed',
                terminal_receipt_json = ?,
                next_member_ordinal = ?,
                updated_at = ?
          WHERE cohort_id = ? AND request_sha256 = ?`,
      )
      .run(
        JSON.stringify(receipt),
        members.length,
        Date.now(),
        stableRequest.cohort_id,
        requestSha256,
      );
    input.shadowMemoryDb.exec("COMMIT");
  } catch (error) {
    input.shadowMemoryDb.exec("ROLLBACK");
    throw error;
  }
  return receipt;
}
