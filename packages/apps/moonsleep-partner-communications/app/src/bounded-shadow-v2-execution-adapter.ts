import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../../../../../nex/src/storage/migrations/initialize.ts";
import {
  runPartnerBoundedHistoricalShadowV2,
  type PartnerShadowIdentityReceiptRow,
  type PartnerShadowV2Receipt,
  type PartnerShadowV2Request,
} from "./bounded-historical-shadow-v2.ts";
import type { PartnerShadowRevisionRow } from "./bounded-historical-shadow.ts";

const MAX_MEMBERS = 5;
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;
const SAFE_REF = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,255}$/;
const ACTIVE_MEMORY_SUFFIX = "/state/data/memory.db";

export type PartnerShadowV2AdapterInput = {
  request: PartnerShadowV2Request;
};

export type PartnerShadowV2PgResult = {
  rows: Array<Record<string, unknown>>;
};

export type PartnerShadowV2PgClient = {
  connect(): Promise<void>;
  query(
    text: string,
    values?: unknown[],
  ): Promise<PartnerShadowV2PgResult>;
  end(): Promise<void>;
};

export type PartnerShadowV2PgFactory = (
  dsn: string,
  runtimeModuleRoot: string,
) => PartnerShadowV2PgClient | Promise<PartnerShadowV2PgClient>;

export type PartnerShadowV2AdapterOptions = {
  requestPath: string;
  postgresUrlFile: string;
  postgresSchema: string;
  canonicalManifestPath: string;
  shadowMemoryPath: string;
  receiptPath: string;
  expectedOwnerUid: number;
  runtimeModuleRoot: string;
  resume: boolean;
  pgClientFactory?: PartnerShadowV2PgFactory;
};

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`${field} must be a non-empty exact string`);
  }
  return value;
}

function safeRef(value: unknown, field: string): string {
  const parsed = text(value, field);
  if (!SAFE_REF.test(parsed) || parsed.includes("@")) {
    throw new Error(`${field} must be a safe opaque reference`);
  }
  return parsed;
}

function exactInputFile(
  path: string,
  expectedMode: number,
  expectedUid: number,
): void {
  const entry = lstatSync(path);
  if (!entry.isFile() || entry.isSymbolicLink()) {
    throw new Error(`${path} must be a regular non-symlink file`);
  }
  if (entry.uid !== expectedUid || (entry.mode & 0o777) !== expectedMode) {
    throw new Error(
      `${path} must have exact owner uid ${expectedUid} and mode ${expectedMode.toString(8)}`,
    );
  }
}

function ownedParent(path: string, expectedUid: number): string {
  const parent = realpathSync(dirname(resolve(path)));
  const entry = statSync(parent);
  if (!entry.isDirectory() || entry.uid !== expectedUid || (entry.mode & 0o022) !== 0) {
    throw new Error(`${parent} must be an owner-controlled non-writable parent`);
  }
  return join(parent, basename(path));
}

function prohibitActiveMemoryPath(path: string): void {
  if (
    path.endsWith(ACTIVE_MEMORY_SUFFIX) ||
    path === "/var/lib/moonsleep-nex/state/data/memory.db" ||
    path === "/var/lib/nex/state/data/memory.db"
  ) {
    throw new Error("active production memory path is prohibited");
  }
}

export function resolveV2ShadowMemoryPath(
  path: string,
  expectedUid: number,
  resume: boolean,
): string {
  prohibitActiveMemoryPath(resolve(path));
  const resolved = ownedParent(path, expectedUid);
  prohibitActiveMemoryPath(resolved);
  if (!resume && existsSync(resolved)) {
    throw new Error("new isolated shadow memory path must not already exist");
  }
  if (resume) {
    if (!existsSync(resolved)) {
      throw new Error("resume requires an existing isolated shadow memory file");
    }
    exactInputFile(resolved, 0o600, expectedUid);
  }
  return resolved;
}

function freshReceiptPath(path: string, expectedUid: number): string {
  const resolved = ownedParent(path, expectedUid);
  if (existsSync(resolved) || existsSync(`${resolved}.tmp`)) {
    throw new Error("shadow receipt path must be fresh");
  }
  return resolved;
}

function safeSchema(postgresSchema: string): string {
  if (!SAFE_IDENTIFIER.test(postgresSchema)) {
    throw new Error("postgres schema is invalid");
  }
  return `"${postgresSchema}"`;
}

export function buildV2RevisionQuery(postgresSchema: string): string {
  const schema = safeSchema(postgresSchema);
  return [
    "SELECT json_build_object(",
    "  'id', id,",
    "  'record_row_id', record_row_id,",
    "  'payload_sha256', payload_sha256,",
    "  'connection_id', connection_id,",
    "  'platform', platform,",
    "  'source_record_type', source_record_type,",
    "  'source_timestamp', source_timestamp,",
    "  'observed_at', observed_at,",
    "  'authority_declaration_json', authority_declaration_json::text",
    ") AS revision",
    `FROM ${schema}."record_revisions"`,
    "WHERE id = ANY($1::text[])",
    "ORDER BY id;",
    "",
  ].join("\n");
}

export function buildV2IdentityQuery(postgresSchema: string): string {
  const schema = safeSchema(postgresSchema);
  return [
    "SELECT json_build_object(",
    "  'id', r.id,",
    "  'source_revision_id', r.source_revision_id,",
    "  'connection_id', r.connection_id,",
    "  'identity_contract_version', r.identity_contract_version,",
    "  'identity_result_digest', r.identity_result_digest,",
    "  'status', r.status,",
    "  'parties', COALESCE(json_agg(json_build_object(",
    "    'party_ordinal', p.party_ordinal,",
    "    'contact_observation_id', p.contact_observation_id,",
    "    'observed_entity_id', p.observed_entity_id,",
    "    'canonical_entity_id_at_commit', p.canonical_entity_id_at_commit",
    "  ) ORDER BY p.party_ordinal) FILTER (WHERE",
    "    p.receipt_id IS NOT NULL",
    "    AND p.contact_observation_id IS NOT NULL",
    "    AND p.observed_entity_id IS NOT NULL",
    "    AND p.canonical_entity_id_at_commit IS NOT NULL",
    "  ), '[]'::json)",
    ") AS identity_receipt",
    `FROM ${schema}."ingress_identity_receipts" r`,
    `LEFT JOIN ${schema}."ingress_identity_parties" p ON p.receipt_id = r.id`,
    "WHERE r.id = ANY($1::text[])",
    "GROUP BY r.id, r.source_revision_id, r.connection_id,",
    "         r.identity_contract_version, r.identity_result_digest, r.status",
    "ORDER BY r.id;",
    "",
  ].join("\n");
}

function runtimePgFactory(
  dsn: string,
  runtimeModuleRoot: string,
): PartnerShadowV2PgClient {
  const root = realpathSync(resolve(runtimeModuleRoot));
  const runtimeRequire = createRequire(join(root, "package.json"));
  const pg = runtimeRequire("pg") as {
    Client: new (
      options: Record<string, unknown>,
    ) => PartnerShadowV2PgClient;
  };
  if (typeof pg.Client !== "function") {
    throw new Error("runtime pg client is unavailable");
  }
  return new pg.Client({
    connectionString: dsn,
    application_name: "moonsleep-partner-pd11-shadow-v2",
    connectionTimeoutMillis: 10_000,
  });
}

function parseRevision(
  value: unknown,
  index: number,
): PartnerShadowRevisionRow {
  const row = object(value, `postgres revision ${index}`);
  const sourceTimestamp = Number(row.source_timestamp);
  const observedAt = Number(row.observed_at);
  if (!Number.isSafeInteger(sourceTimestamp) || !Number.isSafeInteger(observedAt)) {
    throw new Error(`postgres revision ${index} has invalid timestamps`);
  }
  return {
    id: safeRef(row.id, `postgres revision ${index}.id`),
    record_row_id: safeRef(
      row.record_row_id,
      `postgres revision ${index}.record_row_id`,
    ),
    payload_sha256: text(
      row.payload_sha256,
      `postgres revision ${index}.payload_sha256`,
    ),
    connection_id: safeRef(
      row.connection_id,
      `postgres revision ${index}.connection_id`,
    ),
    platform: text(
      row.platform,
      `postgres revision ${index}.platform`,
    ) as "gmail" | "alibaba",
    source_record_type: safeRef(
      row.source_record_type,
      `postgres revision ${index}.source_record_type`,
    ),
    source_timestamp: sourceTimestamp,
    observed_at: observedAt,
    authority_declaration_json: text(
      row.authority_declaration_json,
      `postgres revision ${index}.authority_declaration_json`,
    ),
  };
}

function parseIdentityReceipt(
  value: unknown,
  index: number,
): PartnerShadowIdentityReceiptRow {
  const row = object(value, `postgres identity receipt ${index}`);
  if (!Array.isArray(row.parties) || row.parties.length > 32) {
    throw new Error(`postgres identity receipt ${index}.parties is invalid`);
  }
  return {
    id: safeRef(row.id, `postgres identity receipt ${index}.id`),
    source_revision_id: safeRef(
      row.source_revision_id,
      `postgres identity receipt ${index}.source_revision_id`,
    ),
    connection_id: safeRef(
      row.connection_id,
      `postgres identity receipt ${index}.connection_id`,
    ),
    identity_contract_version: safeRef(
      row.identity_contract_version,
      `postgres identity receipt ${index}.identity_contract_version`,
    ),
    identity_result_digest:
      typeof row.identity_result_digest === "string"
        ? row.identity_result_digest
        : "",
    status: text(row.status, `postgres identity receipt ${index}.status`),
    parties: row.parties.map((entry, partyIndex) => {
      const party = object(
        entry,
        `postgres identity receipt ${index}.parties[${partyIndex}]`,
      );
      const ordinal = Number(party.party_ordinal);
      if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal > 31) {
        throw new Error(
          `postgres identity receipt ${index}.parties[${partyIndex}].party_ordinal is invalid`,
        );
      }
      return {
        party_ordinal: ordinal,
        contact_observation_id: safeRef(
          party.contact_observation_id,
          `postgres identity receipt ${index}.parties[${partyIndex}].contact_observation_id`,
        ),
        observed_entity_id: safeRef(
          party.observed_entity_id,
          `postgres identity receipt ${index}.parties[${partyIndex}].observed_entity_id`,
        ),
        canonical_entity_id_at_commit: safeRef(
          party.canonical_entity_id_at_commit,
          `postgres identity receipt ${index}.parties[${partyIndex}].canonical_entity_id_at_commit`,
        ),
      };
    }),
  };
}

async function readV2Snapshot(input: {
  dsn: string;
  postgresSchema: string;
  revisionIds: string[];
  identityReceiptIds: string[];
  runtimeModuleRoot: string;
  pgClientFactory: PartnerShadowV2PgFactory;
}): Promise<{
  revisions: PartnerShadowRevisionRow[];
  identityReceipts: PartnerShadowIdentityReceiptRow[];
}> {
  if (
    input.revisionIds.length < 1 ||
    input.revisionIds.length > MAX_MEMBERS ||
    new Set(input.revisionIds).size !== input.revisionIds.length ||
    input.identityReceiptIds.length !== input.revisionIds.length ||
    new Set(input.identityReceiptIds).size !== input.identityReceiptIds.length
  ) {
    throw new Error("snapshot inventory must contain 1-5 unique exact bindings");
  }
  const revisionIds = input.revisionIds.map((value, index) =>
    safeRef(value, `revision_ids[${index}]`),
  );
  const identityReceiptIds = input.identityReceiptIds.map((value, index) =>
    safeRef(value, `identity_receipt_ids[${index}]`),
  );
  const client = await input.pgClientFactory(
    input.dsn,
    input.runtimeModuleRoot,
  );
  let connected = false;
  let revisionResult: PartnerShadowV2PgResult | null = null;
  let identityResult: PartnerShadowV2PgResult | null = null;
  let failure: Error | null = null;
  try {
    await client.connect();
    connected = true;
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '15s'");
    revisionResult = await client.query(
      buildV2RevisionQuery(input.postgresSchema),
      [revisionIds],
    );
    identityResult = await client.query(
      buildV2IdentityQuery(input.postgresSchema),
      [identityReceiptIds],
    );
    await client.query("COMMIT");
  } catch {
    if (connected) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the bounded read failure.
      }
    }
    failure = new Error("read-only PostgreSQL Partner snapshot failed");
  } finally {
    try {
      await client.end();
    } catch {
      failure ??= new Error("read-only PostgreSQL client close failed");
    }
  }
  if (failure) {
    throw failure;
  }
  if (!revisionResult || !identityResult) {
    throw new Error("read-only PostgreSQL Partner snapshot is incomplete");
  }
  const revisions = revisionResult.rows.map((row, index) =>
    parseRevision(row.revision, index),
  );
  if (
    revisions.length !== revisionIds.length ||
    new Set(revisions.map((row) => row.id)).size !== revisions.length
  ) {
    throw new Error("PostgreSQL snapshot does not exactly cover source revisions");
  }
  const identityReceipts = identityResult.rows.map((row, index) =>
    parseIdentityReceipt(row.identity_receipt, index),
  );
  if (
    new Set(identityReceipts.map((row) => row.id)).size !==
    identityReceipts.length
  ) {
    throw new Error("PostgreSQL snapshot contains duplicate identity receipts");
  }
  return { revisions, identityReceipts };
}

function parseRequest(path: string): PartnerShadowV2AdapterInput {
  const parsed = object(JSON.parse(readFileSync(path, "utf8")), "adapter request");
  const request = object(parsed.request, "adapter request.request");
  if (
    !Array.isArray(request.members) ||
    request.members.length < 1 ||
    request.members.length > MAX_MEMBERS
  ) {
    throw new Error("adapter request must contain 1-5 members");
  }
  return { request: request as PartnerShadowV2Request };
}

function writeReceipt(
  path: string,
  receipt: PartnerShadowV2Receipt,
): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(receipt)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o400,
  });
  chmodSync(temporary, 0o400);
  renameSync(temporary, path);
}

export async function executePartnerShadowV2Adapter(
  options: PartnerShadowV2AdapterOptions,
): Promise<PartnerShadowV2Receipt> {
  exactInputFile(options.requestPath, 0o600, options.expectedOwnerUid);
  exactInputFile(options.postgresUrlFile, 0o400, options.expectedOwnerUid);
  exactInputFile(
    options.canonicalManifestPath,
    0o400,
    options.expectedOwnerUid,
  );
  const shadowMemoryPath = resolveV2ShadowMemoryPath(
    options.shadowMemoryPath,
    options.expectedOwnerUid,
    options.resume,
  );
  const receiptPath = freshReceiptPath(
    options.receiptPath,
    options.expectedOwnerUid,
  );
  const adapterInput = parseRequest(options.requestPath);
  const dsn = text(
    readFileSync(options.postgresUrlFile, "utf8").trim(),
    "PostgreSQL URL",
  );
  const snapshot = await readV2Snapshot({
    dsn,
    postgresSchema: options.postgresSchema,
    revisionIds: adapterInput.request.members.map((member) => member.revision_id),
    identityReceiptIds: adapterInput.request.members.map(
      (member) => member.identity_receipt_id,
    ),
    runtimeModuleRoot: options.runtimeModuleRoot,
    pgClientFactory: options.pgClientFactory ?? runtimePgFactory,
  });
  const revisions = new Map(snapshot.revisions.map((row) => [row.id, row]));
  const identities = new Map(
    snapshot.identityReceipts.map((row) => [row.id, row]),
  );
  const db = new DatabaseSync(shadowMemoryPath);
  try {
    chmodSync(shadowMemoryPath, 0o600);
    db.exec("PRAGMA foreign_keys = ON");
    initializeDatabase("memory", db);
    const receipt = await runPartnerBoundedHistoricalShadowV2({
      store: {
        async getRecordRevision(id) {
          return revisions.get(id) ?? null;
        },
        async getIdentityReceipt(id) {
          return identities.get(id) ?? null;
        },
      },
      shadowMemoryDb: db,
      request: adapterInput.request,
      canonicalManifestPath: options.canonicalManifestPath,
    });
    db.close();
    writeReceipt(receiptPath, receipt);
    return receipt;
  } catch (error) {
    db.close();
    throw error;
  }
}
