import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../../../../../nex/src/storage/migrations/initialize.ts";
import {
  runPartnerBoundedHistoricalShadow,
  type PartnerShadowCohortRequest,
  type PartnerShadowReceipt,
  type PartnerShadowRevisionRow,
} from "./bounded-historical-shadow.ts";

const MAX_COHORT_MEMBERS = 5;
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;
const SAFE_REVISION_ID = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,255}$/;
const ACTIVE_MEMORY_SUFFIX = "/state/data/memory.db";

export type PartnerShadowAdapterInput = {
  request: PartnerShadowCohortRequest;
};

export type PgQueryResult = {
  rows: Array<Record<string, unknown>>;
};

export type PgReadClient = {
  connect(): Promise<void>;
  query(
    text: string,
    values?: unknown[],
  ): Promise<PgQueryResult>;
  end(): Promise<void>;
};

export type PgClientFactory = (
  dsn: string,
  runtimeModuleRoot: string,
) => PgReadClient | Promise<PgReadClient>;

export type PartnerShadowAdapterOptions = {
  requestPath: string;
  postgresUrlFile: string;
  postgresSchema: string;
  canonicalManifestPath: string;
  shadowMemoryPath: string;
  receiptPath: string;
  expectedOwnerUid: number;
  runtimeModuleRoot: string;
  pgClientFactory?: PgClientFactory;
};

function parseObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`${field} must be a non-empty exact string`);
  }
  return value;
}

function safeRevisionId(value: unknown, field: string): string {
  const parsed = exactText(value, field);
  if (!SAFE_REVISION_ID.test(parsed)) {
    throw new Error(`${field} is not a safe exact revision id`);
  }
  return parsed;
}

function exactMode(path: string, expectedMode: number, expectedUid: number): void {
  const entry = lstatSync(path);
  if (!entry.isFile() || entry.isSymbolicLink()) {
    throw new Error(`${path} must be a regular non-symlink file`);
  }
  if (entry.uid !== expectedUid) {
    throw new Error(`${path} must have exact owner uid ${expectedUid}`);
  }
  if ((entry.mode & 0o777) !== expectedMode) {
    throw new Error(`${path} must have exact mode ${expectedMode.toString(8)}`);
  }
}

function safeOwnedParent(path: string, expectedUid: number): string {
  const parent = realpathSync(dirname(resolve(path)));
  const entry = statSync(parent);
  if (!entry.isDirectory() || entry.uid !== expectedUid || (entry.mode & 0o022) !== 0) {
    throw new Error(`${parent} must be an owner-controlled non-writable parent`);
  }
  return join(parent, basename(path));
}

export function resolveFreshShadowMemoryPath(
  path: string,
  expectedUid: number,
): string {
  const lexicalPath = resolve(path);
  if (
    lexicalPath.endsWith(ACTIVE_MEMORY_SUFFIX) ||
    lexicalPath === "/var/lib/moonsleep-nex/state/data/memory.db" ||
    lexicalPath === "/var/lib/nex/state/data/memory.db"
  ) {
    throw new Error("active production memory path is prohibited");
  }
  const resolved = safeOwnedParent(path, expectedUid);
  if (
    resolved.endsWith(ACTIVE_MEMORY_SUFFIX) ||
    resolved === "/var/lib/moonsleep-nex/state/data/memory.db" ||
    resolved === "/var/lib/nex/state/data/memory.db"
  ) {
    throw new Error("active production memory path is prohibited");
  }
  if (existsSync(resolved)) {
    throw new Error("isolated shadow memory path must not already exist");
  }
  return resolved;
}

function resolveFreshReceiptPath(path: string, expectedUid: number): string {
  const resolved = safeOwnedParent(path, expectedUid);
  if (existsSync(resolved) || existsSync(`${resolved}.tmp`)) {
    throw new Error("shadow receipt path must be fresh");
  }
  return resolved;
}

export function buildReadOnlyRevisionQuery(
  postgresSchema: string,
): string {
  if (!SAFE_IDENTIFIER.test(postgresSchema)) {
    throw new Error("postgres schema is invalid");
  }
  const table = `"${postgresSchema}"."record_revisions"`;
  return [
    `SELECT json_build_object(`,
    `  'id', id,`,
    `  'record_row_id', record_row_id,`,
    `  'payload_sha256', payload_sha256,`,
    `  'connection_id', connection_id,`,
    `  'platform', platform,`,
    `  'source_record_type', source_record_type,`,
    `  'source_timestamp', source_timestamp,`,
    `  'observed_at', observed_at,`,
    `  'authority_declaration_json', authority_declaration_json::text`,
    `) AS revision`,
    `FROM ${table}`,
    `WHERE id = ANY($1::text[])`,
    "ORDER BY id;",
    "",
  ].join("\n");
}

function runtimePgClientFactory(
  dsn: string,
  runtimeModuleRoot: string,
): PgReadClient {
  const root = realpathSync(resolve(runtimeModuleRoot));
  const runtimeRequire = createRequire(join(root, "package.json"));
  const pg = runtimeRequire("pg") as {
    Client: new (options: Record<string, unknown>) => PgReadClient;
  };
  if (typeof pg.Client !== "function") {
    throw new Error("runtime pg client is unavailable");
  }
  return new pg.Client({
    connectionString: dsn,
    application_name: "moonsleep-partner-pd10-shadow",
    connectionTimeoutMillis: 10_000,
  });
}

async function readPostgresRevisions(input: {
  dsn: string;
  postgresSchema: string;
  revisionIds: string[];
  runtimeModuleRoot: string;
  pgClientFactory: PgClientFactory;
}): Promise<PartnerShadowRevisionRow[]> {
  if (
    input.revisionIds.length < 1 ||
    input.revisionIds.length > MAX_COHORT_MEMBERS ||
    new Set(input.revisionIds).size !== input.revisionIds.length
  ) {
    throw new Error("revision inventory must contain 1-5 unique ids");
  }
  const revisionIds = input.revisionIds.map((id, index) =>
    safeRevisionId(id, `revision_ids[${index}]`),
  );
  const client = await input.pgClientFactory(input.dsn, input.runtimeModuleRoot);
  let connected = false;
  let failure: Error | null = null;
  let result: PgQueryResult | null = null;
  try {
    await client.connect();
    connected = true;
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '15s'");
    result = await client.query(
      buildReadOnlyRevisionQuery(input.postgresSchema),
      [revisionIds],
    );
    await client.query("COMMIT");
  } catch {
    if (connected) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original fail-closed read error.
      }
    }
    failure = new Error("read-only PostgreSQL revision query failed");
  } finally {
    try {
      await client.end();
    } catch {
      failure ??= new Error("read-only PostgreSQL client close failed");
    }
  }
  if (failure) throw failure;
  if (!result) throw new Error("read-only PostgreSQL revision query returned no result");
  const rows = result.rows.map((row, index) => {
    const parsed = parseObject(row.revision, `postgres row ${index}.revision`);
    const sourceTimestamp = Number(parsed.source_timestamp);
    const observedAt = Number(parsed.observed_at);
    if (!Number.isSafeInteger(sourceTimestamp) || !Number.isSafeInteger(observedAt)) {
      throw new Error(`PostgreSQL revision row ${index} has invalid timestamps`);
    }
    return {
      id: exactText(parsed.id, `postgres row ${index}.id`),
      record_row_id: exactText(
        parsed.record_row_id,
        `postgres row ${index}.record_row_id`,
      ),
      payload_sha256: exactText(
        parsed.payload_sha256,
        `postgres row ${index}.payload_sha256`,
      ),
      connection_id: exactText(
        parsed.connection_id,
        `postgres row ${index}.connection_id`,
      ),
      platform: exactText(parsed.platform, `postgres row ${index}.platform`) as
        | "gmail"
        | "alibaba",
      source_record_type: exactText(
        parsed.source_record_type,
        `postgres row ${index}.source_record_type`,
      ),
      source_timestamp: sourceTimestamp,
      observed_at: observedAt,
      authority_declaration_json: exactText(
        parsed.authority_declaration_json,
        `postgres row ${index}.authority_declaration_json`,
      ),
    };
  });
  if (
    rows.length !== input.revisionIds.length ||
    new Set(rows.map((row) => row.id)).size !== rows.length
  ) {
    throw new Error("read-only PostgreSQL result does not exactly cover the requested revisions");
  }
  return rows;
}

function parseRequest(path: string): PartnerShadowAdapterInput {
  const parsed = parseObject(JSON.parse(readFileSync(path, "utf8")), "adapter request");
  const request = parseObject(parsed.request, "adapter request.request");
  if (!Array.isArray(request.members)) {
    throw new Error("adapter request members must be an array");
  }
  if (request.members.length < 1 || request.members.length > MAX_COHORT_MEMBERS) {
    throw new Error("adapter request must contain 1-5 members");
  }
  return { request: request as PartnerShadowCohortRequest };
}

function writeSealedReceipt(
  path: string,
  receipt: PartnerShadowReceipt,
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

export async function executePartnerShadowAdapter(
  options: PartnerShadowAdapterOptions,
): Promise<PartnerShadowReceipt> {
  exactMode(options.requestPath, 0o600, options.expectedOwnerUid);
  exactMode(options.postgresUrlFile, 0o400, options.expectedOwnerUid);
  exactMode(options.canonicalManifestPath, 0o400, options.expectedOwnerUid);
  const shadowMemoryPath = resolveFreshShadowMemoryPath(
    options.shadowMemoryPath,
    options.expectedOwnerUid,
  );
  const receiptPath = resolveFreshReceiptPath(
    options.receiptPath,
    options.expectedOwnerUid,
  );
  const adapterInput = parseRequest(options.requestPath);
  const dsn = exactText(readFileSync(options.postgresUrlFile, "utf8").trim(), "PostgreSQL URL");
  const revisionIds = adapterInput.request.members.map((member, index) =>
    safeRevisionId(member.revision_id, `request.members[${index}].revision_id`),
  );
  const rows = await readPostgresRevisions({
    dsn,
    postgresSchema: options.postgresSchema,
    revisionIds,
    runtimeModuleRoot: options.runtimeModuleRoot,
    pgClientFactory: options.pgClientFactory ?? runtimePgClientFactory,
  });
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  let shadowMemoryDb: DatabaseSync | null = null;
  try {
    shadowMemoryDb = new DatabaseSync(shadowMemoryPath);
    chmodSync(shadowMemoryPath, 0o600);
    shadowMemoryDb.exec("PRAGMA foreign_keys = ON");
    initializeDatabase("memory", shadowMemoryDb);
    const receipt = await runPartnerBoundedHistoricalShadow({
      revisionStore: {
        async getRecordRevision(id) {
          return rowsById.get(id) ?? null;
        },
      },
      shadowMemoryDb,
      request: adapterInput.request,
      canonicalManifestPath: options.canonicalManifestPath,
    });
    shadowMemoryDb.close();
    shadowMemoryDb = null;
    writeSealedReceipt(receiptPath, receipt);
    return receipt;
  } catch (error) {
    if (shadowMemoryDb) shadowMemoryDb.close();
    rmSync(shadowMemoryPath, { force: true });
    rmSync(`${shadowMemoryPath}-shm`, { force: true });
    rmSync(`${shadowMemoryPath}-wal`, { force: true });
    rmSync(`${receiptPath}.tmp`, { force: true });
    throw error;
  }
}
