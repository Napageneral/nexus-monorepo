#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    bindings: { type: "string" },
    token_file: { type: "string" },
    url: { type: "string", default: "http://127.0.0.1:18789" },
  },
  strict: true,
});

if (!values.bindings || !values.token_file) {
  throw new Error("--bindings and --token_file are required");
}

const token = readFileSync(values.token_file, "utf8").trim();
if (!token) throw new Error("runtime token is empty");
const bindings = JSON.parse(readFileSync(values.bindings, "utf8"));
if (!Array.isArray(bindings) || bindings.length !== 6) {
  throw new Error("exact six-record PostgreSQL revision binding inventory is required");
}
const bindingsByRevision = new Map(
  bindings.map((binding) => [
    binding.revision_id,
    {
      source_record_id: binding.source_record_id,
      payload_sha256: binding.payload_sha256,
    },
  ]),
);

function openMemory() {
  return new DatabaseSync("/var/lib/nex/state/data/memory.db", { readOnly: true });
}

function readCount(table) {
  const db = openMemory();
  try {
    return Number(db.prepare(`SELECT COUNT(*) value FROM ${table}`).get().value);
  } finally {
    db.close();
  }
}

function verifyJoinedFactProvenance() {
  const db = openMemory();
  try {
    const facts = db
      .prepare(
        `SELECT id, metadata
           FROM elements
          WHERE type = 'fact'
          ORDER BY id`,
      )
      .all();
    if (facts.length !== 26) {
      throw new Error(`expected 26 canonical facts, found ${facts.length}`);
    }
    const seenRevisionIds = new Set();
    let referenceCount = 0;
    for (const fact of facts) {
      const metadata = JSON.parse(String(fact.metadata));
      const refs = metadata.source_revision_refs;
      if (!Array.isArray(refs) || refs.length < 1) {
        throw new Error(`fact is not bound to a source revision: ${fact.id}`);
      }
      for (const ref of refs) {
        const binding = bindingsByRevision.get(ref.revision_id);
        if (!binding || binding.payload_sha256 !== ref.payload_sha256) {
          throw new Error(`fact source revision does not match PostgreSQL: ${fact.id}`);
        }
        seenRevisionIds.add(ref.revision_id);
        referenceCount += 1;
      }
    }
    if (seenRevisionIds.size !== bindingsByRevision.size) {
      throw new Error(
        `joined revision coverage mismatch: ${seenRevisionIds.size}/${bindingsByRevision.size}`,
      );
    }
    return {
      fact_count: facts.length,
      source_revision_count: seenRevisionIds.size,
      source_reference_count: referenceCount,
      revision_set_sha256: createHash("sha256")
        .update([...seenRevisionIds].sort().join("\n"))
        .digest("hex"),
    };
  } finally {
    db.close();
  }
}

function readCommitSeed() {
  const db = openMemory();
  try {
    const candidate = db
      .prepare(
        `SELECT *
           FROM observation_candidates
          ORDER BY head_key, id
          LIMIT 1`,
      )
      .get();
    if (!candidate) throw new Error("no staged Partner observation candidate is available");
    const dispositions = db
      .prepare(
        `SELECT fact_element_id, disposition
           FROM observation_candidate_dispositions
          WHERE candidate_id = ?
          ORDER BY fact_element_id`,
      )
      .all(candidate.id);
    if (dispositions.length < 1) {
      throw new Error("selected Partner candidate has no fact dispositions");
    }
    return {
      candidate_id: candidate.id,
      params: {
        headKey: "partner:cleanroom:joined-pg-memory-proof",
        expectedHeadId: null,
        inputSetId: candidate.input_set_id,
        profileId: candidate.profile_id,
        profileVersion: candidate.profile_version,
        payload: JSON.parse(candidate.payload_json),
        summary: candidate.summary,
        subjectType: candidate.subject_type,
        subjectRef: candidate.subject_ref,
        factDispositions: dispositions.map((disposition) => ({
          factElementId: disposition.fact_element_id,
          disposition: disposition.disposition,
        })),
        entityIds: JSON.parse(candidate.entity_ids_json),
        resolverId: candidate.resolver_id,
        resolverVersion: candidate.resolver_version,
        resolverPolicyVersion: candidate.resolver_policy_version,
        actorRef: "cleanroom:partner-joined-evidence-proof",
        policyRef: "policy:cleanroom-partner-joined-evidence-proof-v1",
        idempotencyKey: "partner:cleanroom:joined-pg-memory-proof:v1",
        projectionEvents: [
          {
            targetDomain: "partner-desk-cleanroom",
            projectionType: "joined_evidence_proof",
            projectionVersion: "1.0.0",
            payload: {
              synthetic: true,
              provider_calls: 0,
              provider_write_authority: false,
            },
          },
        ],
      },
    };
  } finally {
    db.close();
  }
}

async function request(operation, params) {
  const response = await fetch(
    `${values.url.replace(/\/+$/, "")}/runtime/operations/${operation}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(params),
    },
  );
  const result = await response.json().catch(() => null);
  return { response, result };
}

async function call(operation, params) {
  const { response, result } = await request(operation, params);
  if (!response.ok || result?.ok !== true) {
    const error = result?.error && typeof result.error === "object" ? result.error : {};
    throw new Error(
      `${operation} failed with HTTP ${response.status}: ${String(error.code ?? "unknown")}: ${String(error.message ?? "unavailable")}`,
    );
  }
  return result.payload ?? result;
}

async function expectFailure(operation, params, pattern) {
  const { response, result } = await request(operation, params);
  if (response.ok || result?.ok === true) {
    throw new Error(`${operation} unexpectedly succeeded`);
  }
  const message = String(result?.error?.message ?? "");
  if (!pattern.test(message)) {
    throw new Error(`${operation} failed with an unexpected error: ${message}`);
  }
  return {
    status: response.status,
    code: String(result?.error?.code ?? ""),
    message,
  };
}

const joined = verifyJoinedFactProvenance();
const seed = readCommitSeed();
const first = await call("memory.evidence.observations.commit", seed.params);
const replay = await call("memory.evidence.observations.commit", seed.params);
if (first.reused === true || replay.reused !== true) {
  throw new Error("joined observation commit replay semantics are invalid");
}
const observationId = first?.item?.observation?.id;
if (
  typeof observationId !== "string" ||
  observationId.length < 1 ||
  replay?.item?.observation?.id !== observationId
) {
  throw new Error("joined observation replay changed the canonical observation");
}

const receiptCountBeforeStale = readCount("evidence_commit_receipts");
const outboxCountBeforeStale = readCount("projection_outbox");
const stale = await expectFailure(
  "memory.evidence.observations.commit",
  {
    ...seed.params,
    summary: `${seed.params.summary} Stale cleanroom writer.`,
    idempotencyKey: "partner:cleanroom:joined-pg-memory-proof:stale",
    projectionEvents: [],
  },
  /stale observation head/,
);
if (
  readCount("evidence_commit_receipts") !== receiptCountBeforeStale ||
  readCount("projection_outbox") !== outboxCountBeforeStale
) {
  throw new Error("stale head attempt persisted a receipt or outbox row");
}

const workerRef = "worker:partner-desk-cleanroom-proof";
const claimed = await call("memory.evidence.outbox.claim", {
  targetDomain: "partner-desk-cleanroom",
  workerRef,
  limit: 10,
  leaseMs: 60_000,
});
if (!Array.isArray(claimed.items) || claimed.items.length !== 1) {
  throw new Error("expected exactly one joined-evidence outbox item");
}
const outboxId = claimed.items[0].id;
const leaseToken = claimed.items[0].lease_token;
if (typeof outboxId !== "string" || typeof leaseToken !== "string") {
  throw new Error("joined-evidence outbox lease is malformed");
}
const leaseConflict = await expectFailure(
  "memory.evidence.outbox.complete",
  {
    outboxId,
    workerRef: "worker:wrong-partner-cleanroom",
    leaseToken,
    delivered: true,
  },
  /lease mismatch/,
);
const completed = await call("memory.evidence.outbox.complete", {
  outboxId,
  workerRef,
  leaseToken,
  delivered: true,
});
if (completed?.item?.status !== "delivered") {
  throw new Error("joined-evidence outbox did not become delivered");
}
const reclaimed = await call("memory.evidence.outbox.claim", {
  targetDomain: "partner-desk-cleanroom",
  workerRef: "worker:partner-desk-cleanroom-retry",
  limit: 10,
  leaseMs: 60_000,
});
if (!Array.isArray(reclaimed.items) || reclaimed.items.length !== 0) {
  throw new Error("delivered joined-evidence outbox item was reclaimed");
}

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    operation: "prove_partner_canonical_joined_evidence",
    candidate_id: seed.candidate_id,
    joined,
    observation_id: observationId,
    observation_replay_reused: true,
    stale_head: {
      refused: true,
      status: stale.status,
      code: stale.code,
      receipt_count_unchanged: true,
      outbox_count_unchanged: true,
    },
    outbox: {
      id: outboxId,
      lease_conflict_refused: /lease mismatch/.test(leaseConflict.message),
      status: completed.item.status,
      reclaimed_after_delivery: 0,
    },
    authority: {
      provider_calls: 0,
      provider_write: false,
      identity_merge: false,
      external_domain_write: false,
      draft_or_send: false,
      live_canonical_promotion: false,
    },
  })}\n`,
);
