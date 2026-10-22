import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative } from "node:path";

type UnknownRecord = Record<string, unknown>;

export type FlexportRow = UnknownRecord;

export type FlexportConfig = {
  poll_interval_ms: number;
  network_interval_ms: number;
  lookback_days: number;
  token_budget_per_day: number;
  max_document_bytes: number;
  base_url: string;
};

export type FlexportBundle = {
  shipment: FlexportRow;
  containers: FlexportRow[];
  legs: FlexportRow[];
  customs_entries: FlexportRow[];
  invoices: FlexportRow[];
  documents: FlexportRow[];
};

export type FlexportNetwork = {
  me_company: unknown;
  company_entities: FlexportRow[];
  companies: FlexportRow[];
  locations: FlexportRow[];
};

export type CustodyDocument = {
  document_id: string;
  uploaded_at: string;
  sha256: string;
  size: number;
  mime_type: string;
  local_path: string;
};

export type TokenStatus = {
  token_cached: boolean;
  token_expires_at: string | null;
  token_requests_24h: number;
  token_request_failures: number;
  token_requests_paused_until: string | null;
  auth_failed_at: string | null;
};

export type FlexportClientOptions = {
  connectionId: string;
  clientId: string;
  clientSecret: string;
  config: FlexportConfig;
  stateDir?: string | null;
  signal?: AbortSignal;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  requestTimeoutMs?: number;
};

export const DEFAULT_BASE_URL = "https://api.flexport.com";
export const TOKEN_AUDIENCE = "https://api.flexport.com";
export const API_VERSION = "2";
export const PAGE_SIZE = 100;
export const MAX_PAGES = 200;
export const MAX_RETRIES = 3;
export const MAX_RETRY_WAIT_MS = 30_000;
export const FLEXPORT_DAILY_TOKEN_CAP = 10;
export const RUNTIME_ATTACHMENT_LIMIT_BYTES = 50 * 1024 * 1024;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const TOKEN_REUSE_MARGIN_MS = HOUR_MS;
// Renewal starts with an hour left; until a new token is in hand the old one is used up to a
// minute before it expires.
const TOKEN_EXPIRY_GUARD_MS = MINUTE_MS;
// A 401 on a token issued this recently is an authentication failure, not an expired token.
const AUTH_FAILURE_TOKEN_AGE_MS = 10 * MINUTE_MS;
const AUTH_FAILURE_PAUSE_MS = HOUR_MS;
// Consecutive failed token requests wait 15 min, then 1 h, then 4 h; a success resets the count.
const TOKEN_FAILURE_BACKOFF_MS = [15 * MINUTE_MS, HOUR_MS, 4 * HOUR_MS] as const;
const TOKEN_LOCK_STALE_MS = 120_000;
const TOKEN_LOCK_WAIT_MS = 130_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const MAX_ERROR_BODY_BYTES = 64 * 1024;
const MAX_JSON_BODY_BYTES = 64 * 1024 * 1024;
const CONNECTION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ERROR_CODE = /^[a-z_]{1,64}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const LOOPBACK_BASE_URL = /^http:\/\/(127\.0\.0\.1|localhost):([0-9]{1,5})$/;
const MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;
const MIME_BY_EXTENSION: Record<string, string> = {
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".txt": "text/plain",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
};

export class FlexportError extends Error {
  /** The HTTP status Flexport answered with, when there was a response. */
  readonly status: number | undefined;
  /**
   * True when the next shipment of a pass would fail the same way and spend another token
   * request: no usable token, or Flexport refused the token (HTTP 401). The pass stops there.
   */
  readonly abortsPass: boolean;

  constructor(message: string, options: { status?: number; abortsPass?: boolean } = {}) {
    super(message);
    this.name = "FlexportError";
    this.status = options.status;
    this.abortsPass = options.abortsPass === true;
  }
}

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : fallback;
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function credentialFingerprint(clientId: string, clientSecret: string): string {
  return sha256Hex(`${clientId}\0${clientSecret}`);
}

/** Flexport counts token requests per client id, so the request history follows this, not the secret. */
export function clientFingerprint(clientId: string): string {
  return sha256Hex(clientId);
}

/**
 * The base URL is pinned at client creation: production is exactly https://api.flexport.com, and
 * the only override is a loopback HTTP origin (tests and the runtime cleanroom). Anything else would
 * send the client secret somewhere a reviewer never saw.
 */
export function normalizeBaseUrl(value: unknown): string {
  const raw = textValue(value);
  if (!raw) return DEFAULT_BASE_URL;
  const candidate = raw.replace(/\/+$/, "");
  if (candidate === DEFAULT_BASE_URL) return candidate;
  const loopback = LOOPBACK_BASE_URL.exec(candidate);
  if (loopback) {
    const port = Number(loopback[2]);
    if (Number.isInteger(port) && port >= 1 && port <= 65535) return candidate;
  }
  throw new FlexportError(
    "Flexport base_url must be https://api.flexport.com or http://127.0.0.1:<port> / http://localhost:<port>",
  );
}

export function readFlexportConfig(value: unknown): FlexportConfig {
  const config = asRecord(value);
  return {
    poll_interval_ms: positiveInteger(config.poll_interval_ms, 30 * 60 * 1000),
    network_interval_ms: positiveInteger(config.network_interval_ms, DAY_MS),
    lookback_days: positiveInteger(config.lookback_days, 90),
    token_budget_per_day: Math.min(
      positiveInteger(config.token_budget_per_day, 8),
      FLEXPORT_DAILY_TOKEN_CAP,
    ),
    max_document_bytes: Math.min(
      positiveInteger(config.max_document_bytes, RUNTIME_ATTACHMENT_LIMIT_BYTES),
      RUNTIME_ATTACHMENT_LIMIT_BYTES,
    ),
    base_url: normalizeBaseUrl(config.base_url),
  };
}

export function requireConnectionId(value: unknown): string {
  const connectionId = textValue(value);
  if (!connectionId || !CONNECTION_ID.test(connectionId)) {
    throw new FlexportError("Flexport connection id is missing or invalid");
  }
  return connectionId;
}

// --- private state files -------------------------------------------------------------

function currentUid(): number | undefined {
  return typeof process.getuid === "function" ? process.getuid() : undefined;
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string" ? error.code : undefined;
}

function pathWithin(root: string, candidate: string): boolean {
  const offset = relative(root, candidate);
  return offset === "" || (!offset.startsWith("..") && !isAbsolute(offset));
}

/** Creates (0700) or checks each directory below root; a link or file in the way is refused. */
export function ensurePrivateDirectory(root: string, ...segments: string[]): string {
  if (!isAbsolute(root)) throw new FlexportError("Flexport adapter state directory must be absolute");
  if (!existsSync(root)) mkdirSync(root, { recursive: true, mode: 0o700 });
  if (!lstatSync(root).isDirectory()) {
    throw new FlexportError("Flexport adapter state directory is unsafe");
  }
  const realRoot = realpathSync(root);
  let current = realRoot;
  for (const segment of segments) {
    current = join(current, segment);
    if (!existsSync(current)) {
      try {
        mkdirSync(current, { mode: 0o700 });
      } catch (error) {
        if (errorCode(error) !== "EEXIST") throw error;
      }
    }
    const metadata = lstatSync(current);
    if (!metadata.isDirectory()) {
      throw new FlexportError(`Flexport adapter state directory is unsafe: ${segment}`);
    }
    chmodSync(current, 0o700);
  }
  const realCurrent = realpathSync(current);
  if (!pathWithin(realRoot, realCurrent)) {
    throw new FlexportError("Flexport adapter state directory escapes the state root");
  }
  return realCurrent;
}

/** Reads a private JSON state file: no link, a regular 0600 file owned by this uid, or refused. */
export function readPrivateJson(path: string): unknown {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    if (errorCode(error) === "ELOOP") {
      throw new FlexportError(`Flexport state file is a link: ${basename(path)}`);
    }
    throw error;
  }
  try {
    const metadata = fstatSync(fd);
    const uid = currentUid();
    if (
      !metadata.isFile() ||
      (metadata.mode & 0o777) !== 0o600 ||
      (uid !== undefined && metadata.uid !== uid)
    ) {
      throw new FlexportError(`Flexport state file is not a private 0600 file: ${basename(path)}`);
    }
    const text = readFileSync(fd, "utf8");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new FlexportError(`Flexport state file is malformed: ${basename(path)}`);
    }
  } finally {
    closeSync(fd);
  }
}

/** Writes a private JSON state file through an O_EXCL temporary and an atomic rename. */
export function writePrivateJson(path: string, value: unknown): void {
  writePrivateBytes(path, Buffer.from(`${JSON.stringify(value)}\n`, "utf8"));
}

function writePrivateBytes(path: string, bytes: Uint8Array): void {
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  let fd: number | undefined;
  try {
    fd = openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    const written = fstatSync(fd);
    if (!written.isFile() || written.nlink !== 1 || written.size !== bytes.length) {
      throw new FlexportError(`Flexport state write is incomplete: ${basename(path)}`);
    }
    closeSync(fd);
    fd = undefined;
    renameSync(temporary, path);
    chmodSync(path, 0o600);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary file may already have been renamed into place.
    }
    throw error;
  }
}

export function statePaths(stateDir: string, connectionId: string) {
  const id = requireConnectionId(connectionId);
  return {
    tokenCache: () => join(ensurePrivateDirectory(stateDir, "token-cache"), `${id}.json`),
    documentIndex: () => join(ensurePrivateDirectory(stateDir, "documents"), `${id}.json`),
    emitted: () => join(ensurePrivateDirectory(stateDir, "emitted"), `${id}.json`),
    status: () => join(ensurePrivateDirectory(stateDir, "status"), `${id}.json`),
    custodyDirectory: (sha256: string) =>
      ensurePrivateDirectory(stateDir, "attachment-custody", "sha256", sha256.slice(0, 2)),
  };
}

/** Status and token files read for health: absent directories are not created on a read. */
export function readStateFileIfPresent(stateDir: string, folder: string, connectionId: string): unknown {
  const id = requireConnectionId(connectionId);
  const folderPath = join(stateDir, folder);
  if (!existsSync(folderPath)) return undefined;
  if (!lstatSync(folderPath).isDirectory()) {
    throw new FlexportError(`Flexport adapter state directory is unsafe: ${folder}`);
  }
  return readPrivateJson(join(folderPath, `${id}.json`));
}

// --- token cache -----------------------------------------------------------------------

type TokenCache = {
  version: 1;
  credential_fingerprint: string;
  /** sha256(client_id); null in a cache written before it was recorded. */
  client_fingerprint: string | null;
  access_token: string | null;
  expires_at: string | null;
  issued_at: string | null;
  requests: string[];
  /** Consecutive failed token requests, and the earliest time the next one may be sent. */
  failed_requests: number;
  next_request_at: string | null;
  /** The last 401 on a token younger than 10 min: no new token request for an hour after it. */
  auth_failed_at: string | null;
};

type HeldToken = { token: string; expiresAt: number; issuedAt: number | undefined };

function parseTokenCache(value: unknown): TokenCache | undefined {
  if (value === undefined) return undefined;
  const record = asRecord(value);
  if (record.version !== 1 || !Array.isArray(record.requests)) {
    throw new FlexportError("Flexport token cache is malformed");
  }
  const failed = record.failed_requests;
  return {
    version: 1,
    credential_fingerprint: textValue(record.credential_fingerprint) ?? "",
    client_fingerprint: textValue(record.client_fingerprint) ?? null,
    access_token: textValue(record.access_token) ?? null,
    expires_at: textValue(record.expires_at) ?? null,
    issued_at: textValue(record.issued_at) ?? null,
    requests: record.requests.filter((entry): entry is string => typeof entry === "string"),
    failed_requests: typeof failed === "number" && Number.isSafeInteger(failed) && failed > 0 ? failed : 0,
    next_request_at: textValue(record.next_request_at) ?? null,
    auth_failed_at: textValue(record.auth_failed_at) ?? null,
  };
}

/**
 * The cache as this credential sees it. Another credential's token, failure backoff and
 * authentication pause are discarded; its request history is kept unless the client id changed
 * (Flexport counts token requests per client). A cache that never recorded its client keeps it too.
 */
function cacheForCredential(cache: TokenCache | undefined, fingerprint: string, client: string): TokenCache {
  if (cache && cache.credential_fingerprint === fingerprint) return { ...cache, client_fingerprint: client };
  const sameClient = cache !== undefined && (cache.client_fingerprint === null || cache.client_fingerprint === client);
  return {
    version: 1,
    credential_fingerprint: fingerprint,
    client_fingerprint: client,
    access_token: null,
    expires_at: null,
    issued_at: null,
    requests: sameClient && cache ? cache.requests : [],
    failed_requests: 0,
    next_request_at: null,
    auth_failed_at: null,
  };
}

function trailingRequests(requests: string[], nowMs: number): string[] {
  return requests.filter((entry) => {
    const at = Date.parse(entry);
    return Number.isFinite(at) && at > nowMs - DAY_MS && at <= nowMs + HOUR_MS;
  });
}

function heldToken(cache: TokenCache): HeldToken | undefined {
  if (!cache.access_token) return undefined;
  const expiresAt = cache.expires_at ? Date.parse(cache.expires_at) : Number.NaN;
  if (!Number.isFinite(expiresAt)) return undefined;
  const issuedAt = cache.issued_at ? Date.parse(cache.issued_at) : Number.NaN;
  return { token: cache.access_token, expiresAt, issuedAt: Number.isFinite(issuedAt) ? issuedAt : undefined };
}

/** More than an hour left: used as is, no renewal. */
function isFresh(token: HeldToken, nowMs: number): boolean {
  return token.expiresAt - nowMs > TOKEN_REUSE_MARGIN_MS;
}

/** Not expired yet: still used while a renewal is refused or fails. */
function isLive(token: HeldToken, nowMs: number): boolean {
  return token.expiresAt - nowMs > TOKEN_EXPIRY_GUARD_MS;
}

function isoAt(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

function authPauseEndsAt(cache: TokenCache): number | undefined {
  const failedAt = Date.parse(cache.auth_failed_at ?? "");
  return Number.isFinite(failedAt) ? failedAt + AUTH_FAILURE_PAUSE_MS : undefined;
}

function backoffEndsAt(cache: TokenCache): number | undefined {
  const nextAt = Date.parse(cache.next_request_at ?? "");
  return Number.isFinite(nextAt) ? nextAt : undefined;
}

/** Why a new token request may not be sent now, or undefined when it may. */
function tokenRequestRefusal(cache: TokenCache, nowMs: number, budget: number): string | undefined {
  const pausedUntil = authPauseEndsAt(cache);
  if (pausedUntil !== undefined && nowMs < pausedUntil) {
    return (
      `Flexport token requests are paused until ${isoAt(pausedUntil)}: Flexport refused a token issued ` +
      "minutes earlier (HTTP 401); not requesting another"
    );
  }
  const backoffUntil = backoffEndsAt(cache);
  if (backoffUntil !== undefined && nowMs < backoffUntil) {
    return (
      `Flexport token requests are backing off until ${isoAt(backoffUntil)} after ` +
      `${cache.failed_requests} failed token request(s); not requesting another`
    );
  }
  const history = trailingRequests(cache.requests, nowMs);
  if (history.length >= budget) {
    return (
      `Flexport token budget exhausted: ${history.length} token requests in the trailing 24 h ` +
      `(budget ${budget}); not requesting another`
    );
  }
  return undefined;
}

function jwtExpiryMs(token: string): number | undefined {
  const segment = token.split(".")[1];
  if (!segment) return undefined;
  try {
    const claims = asRecord(JSON.parse(Buffer.from(segment, "base64url").toString("utf8")));
    return typeof claims.exp === "number" && Number.isFinite(claims.exp) ? claims.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/** Token freshness for health: no network, no lock, never creates state directories. */
export function readTokenStatus(params: {
  stateDir: string | null | undefined;
  connectionId: string;
  clientId: string;
  clientSecret: string;
  now?: number;
}): TokenStatus {
  const nowMs = params.now ?? Date.now();
  const empty: TokenStatus = {
    token_cached: false,
    token_expires_at: null,
    token_requests_24h: 0,
    token_request_failures: 0,
    token_requests_paused_until: null,
    auth_failed_at: null,
  };
  if (!params.stateDir) return empty;
  const stored = parseTokenCache(readStateFileIfPresent(params.stateDir, "token-cache", params.connectionId));
  if (!stored) return empty;
  const cache = cacheForCredential(
    stored,
    credentialFingerprint(params.clientId, params.clientSecret),
    clientFingerprint(params.clientId),
  );
  const held = heldToken(cache);
  const live = held && isLive(held, nowMs) ? held : undefined;
  const pausedUntil = Math.max(authPauseEndsAt(cache) ?? 0, backoffEndsAt(cache) ?? 0);
  return {
    token_cached: Boolean(live),
    token_expires_at: live ? isoAt(live.expiresAt) : null,
    token_requests_24h: trailingRequests(cache.requests, nowMs).length,
    token_request_failures: cache.failed_requests,
    token_requests_paused_until: pausedUntil > nowMs ? isoAt(pausedUntil) : null,
    auth_failed_at: cache.auth_failed_at,
  };
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function withExclusiveLock<T>(lockPath: string, run: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + TOKEN_LOCK_WAIT_MS;
  for (;;) {
    try {
      const fd = openSync(
        lockPath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      writeFileSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
      closeSync(fd);
      break;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
    }
    try {
      const held = lstatSync(lockPath);
      if (Date.now() - held.mtimeMs > TOKEN_LOCK_STALE_MS) {
        // Only the stale file itself is removed, not a fresh lock another waiter just took.
        const again = lstatSync(lockPath);
        if (again.ino === held.ino && again.mtimeMs === held.mtimeMs) unlinkSync(lockPath);
        continue;
      }
    } catch (error) {
      if (errorCode(error) === "ENOENT") continue;
      throw error;
    }
    if (Date.now() > deadline) {
      throw new FlexportError("Flexport token cache lock is held by another process");
    }
    await delay(50 + Math.floor(Math.random() * 50));
  }
  try {
    return await run();
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
      // A stale-lock sweep by another process may already have removed it.
    }
  }
}

// --- HTTP ------------------------------------------------------------------------------

export function retryAfterMs(value: string | null, attempt: number, nowMs: number): number {
  const text = (value ?? "").trim();
  if (/^[0-9]+$/.test(text)) return Number(text) * 1000;
  if (text) {
    const at = Date.parse(text);
    if (Number.isFinite(at)) return Math.max(at - nowMs, 0);
  }
  return 2 ** attempt * 1000;
}

async function readCapped(response: Response, limit: number, label: string): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel();
    throw new FlexportError(`${label} is larger than ${limit} bytes`);
  }
  if (!response.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new FlexportError(`${label} is larger than ${limit} bytes`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

/** The envelope's error.code is reported only when it is a plain slug; nothing else of a body is. */
async function safeErrorCode(response: Response): Promise<string | undefined> {
  try {
    const bytes = await readCapped(response, MAX_ERROR_BODY_BYTES, "error body");
    const code = asRecord(asRecord(JSON.parse(bytes.toString("utf8"))).error).code;
    return typeof code === "string" && ERROR_CODE.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeMimeType(value: string | null | undefined): string | undefined {
  const candidate = (value ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_TYPE.test(candidate) ? candidate : undefined;
}

export function documentMimeType(contentType: string | null | undefined, fileName: string): string {
  const declared = sanitizeMimeType(contentType);
  if (declared && declared !== "application/octet-stream") return declared;
  return MIME_BY_EXTENSION[extname(fileName).toLowerCase()] ?? declared ?? "application/octet-stream";
}

export function documentFileName(document: FlexportRow): string {
  const id = textValue(document.id) ?? "unknown";
  const name = basename(textValue(document.file_name) ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 255);
  return name && name !== "." && name !== ".." ? name : `document-${id}`;
}

export function documentUploadedAt(document: FlexportRow): string {
  return textValue(asRecord(document.file_metadata).uploaded_at) ?? "";
}

export function isFinalDocument(document: FlexportRow): boolean {
  return !textValue(document.archived_at);
}

type RequestOptions = {
  params?: Record<string, string | number | undefined>;
  body?: string;
  accept?: string;
  retry: "read" | "write";
  timeoutMs?: number;
};

type DocumentIndexEntry =
  | { sha256: string; size: number; mime_type: string }
  | { skipped: "too_large"; limit: number };

type DocumentIndex = {
  version: 1;
  documents: Record<string, DocumentIndexEntry>;
};

export type CustodyResult =
  | { stored: CustodyDocument }
  | { skipped: "no_id" | "too_large" };

function parseDocumentIndex(value: unknown): DocumentIndex {
  const record = asRecord(value);
  const documents: DocumentIndex["documents"] = {};
  for (const [key, entry] of Object.entries(asRecord(record.documents))) {
    const row = asRecord(entry);
    const sha256 = textValue(row.sha256);
    const mimeType = textValue(row.mime_type);
    if (sha256 && SHA256.test(sha256) && typeof row.size === "number" && mimeType) {
      documents[key] = { sha256, size: row.size, mime_type: mimeType };
    } else if (row.skipped === "too_large" && typeof row.limit === "number") {
      documents[key] = { skipped: "too_large", limit: row.limit };
    }
  }
  return { version: 1, documents };
}

export type FlexportClient = ReturnType<typeof createFlexportClient>;

export function createFlexportClient(options: FlexportClientOptions) {
  const connectionId = requireConnectionId(options.connectionId);
  const clientId = textValue(options.clientId);
  const clientSecret = textValue(options.clientSecret);
  if (!clientId || !clientSecret) throw new FlexportError("Flexport client credentials are missing");
  const config = options.config;
  const baseUrl = normalizeBaseUrl(config.base_url);
  const origin = new URL(baseUrl).origin;
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? delay;
  const now = options.now ?? Date.now;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const fingerprint = credentialFingerprint(clientId, clientSecret);
  const client = clientFingerprint(clientId);
  let memoToken: HeldToken | undefined;

  function requireStateDir(): string {
    const stateDir = textValue(options.stateDir);
    if (!stateDir) {
      throw new FlexportError("Flexport adapter state directory is required (NEXUS_ADAPTER_STATE_DIR)");
    }
    return stateDir;
  }

  function paths() {
    return statePaths(requireStateDir(), connectionId);
  }

  function requestSignal(timeoutMs = requestTimeoutMs): AbortSignal {
    const timeout = AbortSignal.timeout(timeoutMs);
    return options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  }

  function resolveUrl(pathOrUrl: string, params?: RequestOptions["params"]): URL {
    const url = /^https?:\/\//i.test(pathOrUrl) ? new URL(pathOrUrl) : new URL(`${baseUrl}${pathOrUrl}`);
    if (url.origin !== origin) {
      throw new FlexportError("refusing to send the Flexport token to another origin");
    }
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) url.searchParams.append(key, String(value));
    }
    return url;
  }

  /**
   * A 401 retires the token it was sent with, once (not a newer one another process cached since).
   * On a token issued less than 10 min earlier it is an authentication failure, not an expiry:
   * auth_failed_at then holds back every new token request for an hour.
   */
  async function retireToken(rejected: HeldToken, authFailedAt: number | undefined): Promise<void> {
    if (memoToken?.token === rejected.token) memoToken = undefined;
    if (!textValue(options.stateDir)) return;
    try {
      const file = paths().tokenCache();
      await withExclusiveLock(`${file}.lock`, async () => {
        const cache = parseTokenCache(readPrivateJson(file));
        if (!cache || cache.credential_fingerprint !== fingerprint) return;
        const retire = cache.access_token === rejected.token;
        if (!retire && authFailedAt === undefined) return;
        writePrivateJson(file, {
          ...cache,
          ...(retire ? { access_token: null, expires_at: null, issued_at: null } : {}),
          ...(authFailedAt !== undefined ? { auth_failed_at: isoAt(authFailedAt) } : {}),
        } satisfies TokenCache);
      });
    } catch {
      // The next token read refuses an unsafe cache with its own message.
    }
  }

  async function requestToken(): Promise<HeldToken> {
    const url = resolveUrl("/oauth/token");
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          audience: TOKEN_AUDIENCE,
          grant_type: "client_credentials",
        }),
        redirect: "manual",
        signal: requestSignal(),
      });
    } catch (error) {
      throw new FlexportError(`Flexport token request failed (${error instanceof Error ? error.name : "error"})`, {
        abortsPass: true,
      });
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new FlexportError(`Flexport token request redirected (HTTP ${response.status}); not followed`, {
        status: response.status,
        abortsPass: true,
      });
    }
    if (!response.ok) {
      const code = await safeErrorCode(response);
      throw new FlexportError(`Flexport token request failed (HTTP ${response.status}${code ? `, ${code}` : ""})`, {
        status: response.status,
        abortsPass: true,
      });
    }
    let document: UnknownRecord;
    try {
      const bytes = await readCapped(response, MAX_ERROR_BODY_BYTES, "token response");
      document = asRecord(JSON.parse(bytes.toString("utf8")));
    } catch {
      throw new FlexportError("Flexport token response is not JSON", { abortsPass: true });
    }
    const token = textValue(document.access_token);
    if (!token) throw new FlexportError("Flexport token response has no access_token", { abortsPass: true });
    const issuedAt = now();
    const expiresIn =
      typeof document.expires_in === "number" && document.expires_in > 0 ? document.expires_in : undefined;
    const expiresAt = jwtExpiryMs(token) ?? (expiresIn ? issuedAt + expiresIn * 1000 : issuedAt + DAY_MS);
    return { token, expiresAt, issuedAt };
  }

  /**
   * One bearer token per credential, shared by every process through the state-dir cache. A new
   * token request is recorded before it is sent, so a crash mid-request still counts against the
   * daily budget (Flexport allows 10 token requests a day). Renewal starts with an hour left and
   * keeps the old token until a new one is in hand: while a renewal is refused (authentication
   * pause, failure backoff, budget) or fails, the old token is used until it expires.
   */
  async function bearerToken(): Promise<HeldToken> {
    if (memoToken && isFresh(memoToken, now())) return memoToken;
    const file = paths().tokenCache();
    const fast = heldToken(cacheForCredential(parseTokenCache(readPrivateJson(file)), fingerprint, client));
    if (fast && isFresh(fast, now())) {
      memoToken = fast;
      return fast;
    }
    return await withExclusiveLock(`${file}.lock`, async () => {
      const cache = cacheForCredential(parseTokenCache(readPrivateJson(file)), fingerprint, client);
      const requestedAt = now();
      const current = heldToken(cache);
      if (current && isFresh(current, requestedAt)) {
        memoToken = current;
        return current;
      }
      const live = current && isLive(current, requestedAt) ? current : undefined;
      const refusal = tokenRequestRefusal(cache, requestedAt, config.token_budget_per_day);
      if (refusal) {
        if (live) {
          memoToken = live;
          return live;
        }
        throw new FlexportError(refusal, { abortsPass: true });
      }
      const requests = [...trailingRequests(cache.requests, requestedAt), isoAt(requestedAt)];
      writePrivateJson(file, { ...cache, requests } satisfies TokenCache);
      let issued: HeldToken;
      try {
        issued = await requestToken();
      } catch (error) {
        const failures = cache.failed_requests + 1;
        const wait = TOKEN_FAILURE_BACKOFF_MS[Math.min(failures, TOKEN_FAILURE_BACKOFF_MS.length) - 1]!;
        writePrivateJson(file, {
          ...cache,
          requests,
          failed_requests: failures,
          next_request_at: isoAt(requestedAt + wait),
        } satisfies TokenCache);
        if (live && isLive(live, now())) {
          memoToken = live;
          return live;
        }
        throw error;
      }
      writePrivateJson(file, {
        ...cache,
        requests,
        access_token: issued.token,
        expires_at: isoAt(issued.expiresAt),
        issued_at: isoAt(issued.issuedAt ?? requestedAt),
        failed_requests: 0,
        next_request_at: null,
      } satisfies TokenCache);
      memoToken = issued;
      return issued;
    });
  }

  async function request(method: string, pathOrUrl: string, requestOptions: RequestOptions): Promise<Response> {
    const url = resolveUrl(pathOrUrl, requestOptions.params);
    const label = `Flexport ${method} ${url.pathname}`;
    for (let attempt = 0; ; attempt += 1) {
      const token = await bearerToken();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token.token}`,
        "Flexport-Version": API_VERSION,
        Accept: requestOptions.accept ?? "application/json",
      };
      if (requestOptions.body !== undefined) headers["Content-Type"] = "application/json";
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method,
          headers,
          ...(requestOptions.body !== undefined ? { body: requestOptions.body } : {}),
          redirect: "manual",
          signal: requestSignal(requestOptions.timeoutMs),
        });
      } catch (error) {
        throw new FlexportError(`${label} failed (${error instanceof Error ? error.name : "error"})`);
      }
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new FlexportError(`${label} redirected (HTTP ${response.status}); not followed`, {
          status: response.status,
        });
      }
      const retryable =
        requestOptions.retry === "read" ? [429, 502, 503, 504].includes(response.status) : response.status === 429;
      if (retryable && attempt < MAX_RETRIES) {
        const wait = retryAfterMs(response.headers.get("retry-after"), attempt, now());
        await response.body?.cancel();
        if (wait > MAX_RETRY_WAIT_MS) {
          throw new FlexportError(
            `${label} is ${response.status === 429 ? "rate limited" : "unavailable"} (HTTP ${response.status}); ` +
              `retry after ${Math.ceil(wait / 1000)} s`,
            { status: response.status },
          );
        }
        await sleep(wait);
        continue;
      }
      if (!response.ok) {
        const code = await safeErrorCode(response);
        const failure = `${label} failed (HTTP ${response.status}${code ? `, ${code}` : ""})`;
        if (response.status === 401) {
          // A fresh token refused is an authentication failure that a new token will not fix.
          const authFailure = token.issuedAt !== undefined && now() - token.issuedAt < AUTH_FAILURE_TOKEN_AGE_MS;
          await retireToken(token, authFailure ? now() : undefined);
          throw new FlexportError(
            authFailure ? `${failure}; Flexport refused a fresh token, token requests paused for 1 h` : failure,
            { status: 401, abortsPass: true },
          );
        }
        throw new FlexportError(failure, { status: response.status });
      }
      return response;
    }
  }

  async function dataOf(response: Response, label: string): Promise<unknown> {
    let document: unknown;
    try {
      document = JSON.parse((await readCapped(response, MAX_JSON_BODY_BYTES, label)).toString("utf8"));
    } catch (error) {
      if (error instanceof FlexportError) throw error;
      throw new FlexportError(`${label} returned invalid JSON`);
    }
    // Response text is never echoed: an error body can repeat what it was sent.
    if (!isRecord(document) || !Object.hasOwn(document, "data")) {
      throw new FlexportError(`${label} returned no data`);
    }
    return document.data;
  }

  async function getJson(pathOrUrl: string, params?: RequestOptions["params"]): Promise<unknown> {
    const label = `Flexport GET ${resolveUrl(pathOrUrl).pathname}`;
    const response = await request("GET", pathOrUrl, { params, retry: "read" });
    return await dataOf(response, label);
  }

  /**
   * Pages are requested by number with the original query every time. Flexport's `next` link is
   * only a "more pages" signal: a documented sample drops the shipment filter from it.
   */
  async function collection(
    path: string,
    params: Record<string, string | number | undefined> = {},
    limit?: number,
  ): Promise<FlexportRow[]> {
    const rows: FlexportRow[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const data = asRecord(await getJson(path, { ...params, per: PAGE_SIZE, page }));
      if (!Array.isArray(data.data)) {
        throw new FlexportError(`Flexport ${path} is not a paginated collection`);
      }
      for (const row of data.data) {
        if (isRecord(row)) rows.push(row);
        if (limit !== undefined && rows.length >= limit) return rows;
      }
      if (!data.next || data.data.length === 0) return rows;
    }
    throw new FlexportError(`Flexport ${path} has more than ${MAX_PAGES} pages`);
  }

  function shipmentPath(shipmentId: string): string {
    return `/shipments/${encodeURIComponent(shipmentId)}`;
  }

  /** Drops child rows that name a different shipment (a `next` page or a filter Flexport ignored). */
  function ownRows(rows: FlexportRow[], shipmentId: string): FlexportRow[] {
    return rows.filter((row) => {
      const owner = textValue(asRecord(row.shipment).id);
      return owner === undefined || owner === shipmentId;
    });
  }

  async function children(path: string, shipmentId: string): Promise<FlexportRow[]> {
    return ownRows(await collection(path, { "f.shipment.id": shipmentId }), shipmentId);
  }

  async function listShipments(limit?: number): Promise<FlexportRow[]> {
    return await collection("/shipments", { sort: "updated_at", direction: "desc" }, limit);
  }

  async function bundle(shipmentId: string): Promise<FlexportBundle> {
    const shipment = asRecord(await getJson(shipmentPath(shipmentId)));
    if (textValue(shipment.id) !== shipmentId) {
      throw new FlexportError(`Flexport GET ${shipmentPath(shipmentId)} returned a different shipment`);
    }
    return {
      shipment,
      containers: await children("/ocean/shipment_containers", shipmentId),
      legs: await children("/shipment_legs", shipmentId),
      customs_entries: await children("/customs_entries", shipmentId),
      invoices: await children("/invoices", shipmentId),
      documents: await children("/documents", shipmentId),
    };
  }

  async function network(): Promise<FlexportNetwork> {
    return {
      me_company: await getJson("/network/me/companies"),
      company_entities: await collection("/network/company_entities"),
      companies: await collection("/network/companies"),
      locations: await collection("/network/locations"),
    };
  }

  function custodyFile(sha256: string, size: number): string | undefined {
    const candidate = join(paths().custodyDirectory(sha256), sha256);
    if (!existsSync(candidate)) return undefined;
    const metadata = lstatSync(candidate);
    return metadata.isFile() && metadata.size === size ? realpathSync(candidate) : undefined;
  }

  function storeCustody(bytes: Buffer, sha256: string): string {
    const existing = custodyFile(sha256, bytes.length);
    if (existing) return existing;
    const destination = join(paths().custodyDirectory(sha256), sha256);
    writePrivateBytes(destination, bytes);
    const stored = realpathSync(destination);
    if (sha256Hex(readFileSync(stored)) !== sha256) {
      throw new FlexportError("Flexport document custody digest mismatch");
    }
    return stored;
  }

  /**
   * A final document's bytes, downloaded once per (document id, uploaded_at) into the state dir's
   * sha256 custody, where the runtime copies them into Record attachment custody.
   */
  async function documentIntoCustody(document: FlexportRow): Promise<CustodyResult> {
    const documentId = textValue(document.id);
    if (!documentId) return { skipped: "no_id" };
    const uploadedAt = documentUploadedAt(document);
    const key = `${documentId}@${uploadedAt}`;
    const indexFile = paths().documentIndex();
    const remember = (entry: DocumentIndexEntry) => {
      const index = parseDocumentIndex(readPrivateJson(indexFile));
      index.documents[key] = entry;
      writePrivateJson(indexFile, index);
    };
    const known = parseDocumentIndex(readPrivateJson(indexFile)).documents[key];
    if (known && "skipped" in known && known.limit >= config.max_document_bytes) {
      return { skipped: "too_large" };
    }
    if (known && "sha256" in known) {
      const localPath = custodyFile(known.sha256, known.size);
      if (localPath) {
        return { stored: { document_id: documentId, uploaded_at: uploadedAt, ...known, local_path: localPath } };
      }
    }
    const declaredSize = asRecord(document.file_metadata).size;
    if (typeof declaredSize === "number" && declaredSize > config.max_document_bytes) {
      remember({ skipped: "too_large", limit: config.max_document_bytes });
      return { skipped: "too_large" };
    }
    const path = `/documents/${encodeURIComponent(documentId)}/download`;
    // A document can be 50 MiB: its download gets five request timeouts, start to last byte.
    const response = await request("GET", path, { accept: "*/*", retry: "read", timeoutMs: requestTimeoutMs * 5 });
    let bytes: Buffer;
    try {
      bytes = await readCapped(response, config.max_document_bytes, `Flexport document ${documentId}`);
    } catch (error) {
      if (!(error instanceof FlexportError) || !/is larger than/.test(error.message)) throw error;
      remember({ skipped: "too_large", limit: config.max_document_bytes });
      return { skipped: "too_large" };
    }
    const sha256 = sha256Hex(bytes);
    const localPath = storeCustody(bytes, sha256);
    const entry = {
      sha256,
      size: bytes.length,
      mime_type: documentMimeType(response.headers.get("content-type"), documentFileName(document)),
    };
    remember(entry);
    return { stored: { document_id: documentId, uploaded_at: uploadedAt, ...entry, local_path: localPath } };
  }

  /** Sends one write: the body bytes exactly as given, retried only on 429 (Flexport did not act). */
  async function send(method: "POST" | "PATCH", path: string, bodyJson: string): Promise<unknown> {
    const response = await request(method, path, { body: bodyJson, retry: "write" });
    return await dataOf(response, `Flexport ${method} ${path}`);
  }

  return {
    connectionId,
    baseUrl,
    getJson,
    collection,
    listShipments,
    bundle,
    network,
    documentIntoCustody,
    send,
    bearerToken: async (): Promise<string> => (await bearerToken()).token,
    tokenStatus: (): TokenStatus =>
      readTokenStatus({
        stateDir: options.stateDir,
        connectionId,
        clientId,
        clientSecret,
        now: now(),
      }),
  };
}
