import {
  type AdapterBackfillWindow,
  type AdapterContext,
  type AdapterHealth,
  type AdapterInboundRecord,
  type DefinedAdapterContext,
  defineAdapter,
  emitAdapterCheckpoint,
  hasManagedCheckpoints,
  loadAdapterStateDir,
  method,
  readAdapterCheckpoint,
  readCredential,
} from "@nexus-project/adapter-sdk-ts";
import {
  type CustodyDocument,
  type CustodyResult,
  type FlexportClient,
  type FlexportConfig,
  FlexportError,
  createFlexportClient,
  isFinalDocument,
  readFlexportConfig,
  readPrivateJson,
  readStateFileIfPresent,
  requireConnectionId,
  sha256Hex,
  statePaths,
  writePrivateJson,
} from "./client.ts";
import {
  PLATFORM,
  bundleAttachments,
  bundleSnapshot,
  bundleTimestamp,
  buildNetworkRecord,
  buildShipmentRecord,
  networkSnapshot,
  stableJson,
} from "./records.ts";

type UnknownRecord = Record<string, unknown>;

type FlexportAdapterClient = {
  connectionId: string;
  account?: string;
  config: FlexportConfig;
  stateDir: string | null;
  api: FlexportClient;
};

type FlexportContext = DefinedAdapterContext<FlexportAdapterClient>;

/**
 * What was last emitted per Record: its digests, when the line was written, and its timestamp
 * (null in a state file written before timestamps were kept).
 */
type EmittedShipment = {
  bundle_sha256: string;
  attachments_sha256: string;
  emitted_at: string;
  timestamp: number | null;
};

type EmittedState = {
  version: 1;
  shipments: Record<string, EmittedShipment>;
  network: { sha256: string; emitted_at: string; timestamp: number | null } | null;
  first_seen: Record<string, number>;
};

type PassSummary = {
  last_success_at: string;
  shipments_listed: number;
  bundles_read: number;
  records_emitted: number;
  network_at: string | null;
};

type PassOptions = {
  select: (shipment: UnknownRecord) => boolean;
  includeNetwork: boolean;
  emitUnchanged: boolean;
  networkAt: string | null;
};

const SERVICE = "flexport";
const AUTH_METHOD_ID = "flexport_client_credentials";
const WRITE_CONFIRMATION = "SEND_TO_FLEXPORT";
const ERROR_DELAY_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// An unchanged Record is written again at least this often (same bytes, a cheap replay in the
// runtime): a line is not an acknowledgement, so a version the runtime dropped is sent again.
const REEMIT_AFTER_MS = DAY_MS;
const MAX_FIRST_SEEN = 512;
const SHA256 = /^[0-9a-f]{64}$/;
const PROVIDER_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const REMOTE_WRITE_METHODS = [
  "flexport.products.create",
  "flexport.products.update",
  "flexport.bookings.create",
  "flexport.documents.create",
] as const;

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** True when nothing was emitted yet or the last emission is older than REEMIT_AFTER_MS. */
function replayDue(emittedAt: string | undefined, nowMs: number): boolean {
  const at = Date.parse(emittedAt ?? "");
  return !Number.isFinite(at) || nowMs - at >= REEMIT_AFTER_MS;
}

/** No usable token, or Flexport refused the token: the rest of the pass would fail the same way. */
function abortsPass(error: unknown): boolean {
  return error instanceof FlexportError && error.abortsPass;
}

function buildClient(ctx: AdapterContext, connectionIdValue?: string): FlexportAdapterClient {
  const connectionId = requireConnectionId(connectionIdValue ?? ctx.runtime?.connection_id);
  // credential.value can be the client id on the worker path, so only the named fields count.
  const clientId = readCredential(ctx, { fields: ["client_id"], allowValue: false });
  const clientSecret = readCredential(ctx, { fields: ["client_secret"], allowValue: false });
  if (!clientId || !clientSecret) {
    throw new Error("Flexport credential fields client_id and client_secret are required");
  }
  const config = readFlexportConfig(ctx.runtime?.config);
  const stateDir = loadAdapterStateDir(process.env);
  const account = textValue(ctx.runtime?.credential?.fields?.account);
  return {
    connectionId,
    ...(account ? { account } : {}),
    config,
    stateDir,
    api: createFlexportClient({
      connectionId,
      clientId,
      clientSecret,
      config,
      stateDir,
      signal: ctx.signal,
    }),
  };
}

function requireClient(ctx: FlexportContext): FlexportAdapterClient {
  if (!ctx.client) throw new Error("Flexport client unavailable");
  return ctx.client;
}

function requireStateDir(client: FlexportAdapterClient): string {
  if (!client.stateDir) {
    throw new Error("Flexport adapter state directory is required (NEXUS_ADAPTER_STATE_DIR)");
  }
  return client.stateDir;
}

// --- state: emitted bundles and poll status ----------------------------------------------

function readEmitted(client: FlexportAdapterClient): EmittedState {
  const record = asRecord(readPrivateJson(statePaths(requireStateDir(client), client.connectionId).emitted()));
  const shipments: EmittedState["shipments"] = {};
  for (const [id, entry] of Object.entries(asRecord(record.shipments))) {
    const row = asRecord(entry);
    const bundle = textValue(row.bundle_sha256);
    const attachments = textValue(row.attachments_sha256);
    if (bundle && attachments) {
      shipments[id] = {
        bundle_sha256: bundle,
        attachments_sha256: attachments,
        emitted_at: textValue(row.emitted_at) ?? "",
        timestamp: nonNegativeInteger(row.timestamp),
      };
    }
  }
  const network = asRecord(record.network);
  const firstSeen: Record<string, number> = {};
  for (const [key, value] of Object.entries(asRecord(record.first_seen))) {
    const at = nonNegativeInteger(value);
    if (at !== null) firstSeen[key] = at;
  }
  return {
    version: 1,
    shipments,
    network: textValue(network.sha256)
      ? {
          sha256: String(network.sha256),
          emitted_at: textValue(network.emitted_at) ?? "",
          timestamp: nonNegativeInteger(network.timestamp),
        }
      : null,
    first_seen: firstSeen,
  };
}

function writeEmitted(client: FlexportAdapterClient, state: EmittedState): void {
  const entries = Object.entries(state.first_seen).sort((left, right) => right[1] - left[1]);
  const pruned = { ...state, first_seen: Object.fromEntries(entries.slice(0, MAX_FIRST_SEEN)) };
  writePrivateJson(statePaths(requireStateDir(client), client.connectionId).emitted(), pruned);
}

function firstSeen(state: EmittedState, key: string, nowMs: number): number {
  const known = state.first_seen[key];
  if (known !== undefined) return known;
  state.first_seen[key] = nowMs;
  return nowMs;
}

function readStatus(client: FlexportAdapterClient): UnknownRecord {
  if (!client.stateDir) return {};
  return asRecord(readStateFileIfPresent(client.stateDir, "status", client.connectionId));
}

function writeStatus(client: FlexportAdapterClient, value: UnknownRecord): void {
  writePrivateJson(statePaths(requireStateDir(client), client.connectionId).status(), value);
}

function statusDetails(client: FlexportAdapterClient): UnknownRecord {
  const details: UnknownRecord = {
    adapter: PLATFORM,
    base_url: client.config.base_url,
    token_cached: false,
    token_expires_at: null,
    token_requests_24h: 0,
    token_request_failures: 0,
    token_requests_paused_until: null,
    auth_failed_at: null,
    token_budget_per_day: client.config.token_budget_per_day,
    last_success_at: null,
    last_error_at: null,
    document_failures: null,
    remote_write_methods: [...REMOTE_WRITE_METHODS],
    automatic_writes: false,
  };
  try {
    Object.assign(details, client.api.tokenStatus());
  } catch (error) {
    details.token_cache_error = errorMessage(error);
  }
  try {
    const status = readStatus(client);
    details.last_success_at = textValue(status.last_success_at) ?? null;
    details.last_error_at = textValue(status.last_error_at) ?? null;
    details.document_failures = nonNegativeInteger(status.document_failures);
    if (textValue(status.last_error)) details.last_error = textValue(status.last_error);
  } catch (error) {
    details.status_error = errorMessage(error);
  }
  return details;
}

/** Health never touches the network: credentials present means connected, poll state is detail. */
function health(ctx: FlexportContext): Omit<AdapterHealth, "connection_id"> {
  const client = requireClient(ctx);
  return {
    connected: true,
    account_contact: { platform: PLATFORM, space_id: "", contact_id: client.connectionId },
    details: statusDetails(client),
  };
}

// --- one pass: list, bundle, custody, emit ------------------------------------------------

/**
 * A final document's bytes into custody. A download that fails (a non-2xx answer, a refused
 * redirect, a timeout) leaves that attachment off for this pass only: the bundle still goes out
 * and the download is tried again on the next pass. A refused token still stops the pass.
 */
async function documentCustody(
  ctx: FlexportContext,
  client: FlexportAdapterClient,
  shipmentId: string,
  document: UnknownRecord,
): Promise<CustodyResult | "failed"> {
  try {
    return await client.api.documentIntoCustody(document);
  } catch (error) {
    if (ctx.signal.aborted || abortsPass(error) || !(error instanceof FlexportError)) throw error;
    ctx.log.error(
      "Flexport document %s on shipment %s not attached this pass (tried again next pass): %s",
      textValue(document.id) ?? "unknown",
      shipmentId,
      error.message,
    );
    return "failed";
  }
}

async function readShipmentRecord(
  ctx: FlexportContext,
  client: FlexportAdapterClient,
  shipmentId: string,
  state: EmittedState,
  emitUnchanged: boolean,
): Promise<{ read?: { record: AdapterInboundRecord; emitted: EmittedShipment }; documentFailures: number }> {
  const bundle = await client.api.bundle(shipmentId);
  const custody = new Map<string, CustodyDocument>();
  let documentFailures = 0;
  for (const document of bundle.documents) {
    if (!isFinalDocument(document)) continue;
    const result = await documentCustody(ctx, client, shipmentId, document);
    if (result === "failed") {
      documentFailures += 1;
    } else if ("stored" in result) {
      custody.set(result.stored.document_id, result.stored);
    } else if (result.skipped === "too_large") {
      ctx.log.error(
        "Flexport document %s on shipment %s exceeds max_document_bytes; not attached",
        textValue(document.id) ?? "unknown",
        shipmentId,
      );
    }
  }
  const snapshot = bundleSnapshot(bundle);
  const attachments = bundleAttachments(bundle, custody);
  const attachmentsSha256 = sha256Hex(stableJson(attachments.map((entry) => [entry.id, entry.content_hash])));
  const previous = state.shipments[shipmentId];
  const unchanged =
    previous?.bundle_sha256 === snapshot.sha256 && previous.attachments_sha256 === attachmentsSha256;
  const nowMs = Date.now();
  if (unchanged && !emitUnchanged && !replayDue(previous.emitted_at, nowMs)) {
    return { documentFailures };
  }
  const needsFirstSeen = bundleTimestamp(bundle, -1) === -1;
  const observed = bundleTimestamp(
    bundle,
    needsFirstSeen ? firstSeen(state, `bundle:${snapshot.sha256}`, nowMs) : nowMs,
  );
  // An unchanged Record is re-sent byte for byte (same timestamp). A changed one is strictly newer
  // than the last one emitted, so a return to an earlier exact state is a new Record, not a replay.
  const lastTimestamp = previous?.timestamp ?? null;
  const timestamp =
    lastTimestamp === null ? observed : unchanged ? lastTimestamp : Math.max(observed, lastTimestamp + 1);
  const record = buildShipmentRecord({
    connectionId: client.connectionId,
    bundle,
    snapshot,
    attachments,
    firstSeenMs: observed,
    timestamp,
  });
  return {
    read: {
      record,
      emitted: {
        bundle_sha256: snapshot.sha256,
        attachments_sha256: attachmentsSha256,
        emitted_at: new Date(nowMs).toISOString(),
        timestamp,
      },
    },
    documentFailures,
  };
}

/**
 * One pass. A shipment's failure is collected, not thrown, so the rest of the pass still runs;
 * a missing or refused token ends the pass at once instead of costing a token request per shipment.
 */
async function runPass(
  ctx: FlexportContext,
  emit: (record: AdapterInboundRecord) => void,
  options: PassOptions,
): Promise<{ summary: PassSummary; failures: string[]; documentFailures: number }> {
  const client = requireClient(ctx);
  const shipments = await client.api.listShipments();
  const state = readEmitted(client);
  const failures: string[] = [];
  let bundlesRead = 0;
  let recordsEmitted = 0;
  let documentFailures = 0;
  for (const shipment of shipments.filter(options.select)) {
    if (ctx.signal.aborted) throw new Error("Flexport pass aborted");
    const shipmentId = textValue(shipment.id);
    if (!shipmentId || !PROVIDER_ID.test(shipmentId)) continue;
    try {
      const outcome = await readShipmentRecord(ctx, client, shipmentId, state, options.emitUnchanged);
      bundlesRead += 1;
      documentFailures += outcome.documentFailures;
      if (outcome.read) {
        emit(outcome.read.record);
        // A written line is not an acknowledgement: an unchanged bundle is written again once a day.
        state.shipments[shipmentId] = outcome.read.emitted;
        recordsEmitted += 1;
        writeEmitted(client, state);
      }
    } catch (error) {
      if (ctx.signal.aborted || abortsPass(error)) throw error;
      failures.push(`shipment ${shipmentId}: ${errorMessage(error)}`);
      ctx.log.error("Flexport shipment %s bundle failed: %s", shipmentId, errorMessage(error));
    }
  }
  let networkAt = options.networkAt;
  if (options.includeNetwork) {
    const network = await client.api.network();
    const snapshot = networkSnapshot(network);
    const nowMs = Date.now();
    const previous = state.network;
    const unchanged = previous?.sha256 === snapshot.sha256;
    if (!unchanged || options.emitUnchanged || replayDue(previous?.emitted_at, nowMs)) {
      // The network has no updated_at: a change is stamped with its emission time, kept strictly
      // after the last one; an unchanged re-emission keeps the timestamp it was first sent with.
      // (A state file from before timestamps were kept has it as the content's first-seen time.)
      const keptTimestamp = unchanged
        ? (previous?.timestamp ?? state.first_seen[`network:${snapshot.sha256}`])
        : undefined;
      const timestamp = keptTimestamp ?? Math.max(nowMs, (previous?.timestamp ?? -1) + 1);
      emit(buildNetworkRecord({ connectionId: client.connectionId, network, snapshot, timestamp }));
      recordsEmitted += 1;
      state.network = { sha256: snapshot.sha256, emitted_at: new Date(nowMs).toISOString(), timestamp };
      writeEmitted(client, state);
    }
    networkAt = new Date(nowMs).toISOString();
  }
  return {
    summary: {
      last_success_at: new Date().toISOString(),
      shipments_listed: shipments.length,
      bundles_read: bundlesRead,
      records_emitted: recordsEmitted,
      network_at: networkAt,
    },
    failures,
    documentFailures,
  };
}

function failedPass(failures: string[]): Error {
  return new Error(`${failures.length} Flexport shipment bundle(s) failed; first: ${failures[0]}`);
}

function updatedAtMs(shipment: UnknownRecord): number {
  return Date.parse(textValue(shipment.updated_at) ?? "");
}

async function waitForAbort(signal: AbortSignal, milliseconds: number): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolvePromise) => {
    const timer = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolvePromise();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

function initialNetworkAt(ctx: FlexportContext, client: FlexportAdapterClient): string | null {
  const checkpoint = asRecord(readAdapterCheckpoint(ctx.runtime, "monitor", "poll"));
  const fromCheckpoint = textValue(checkpoint.network_at);
  if (fromCheckpoint) return fromCheckpoint;
  try {
    return textValue(readStatus(client).network_at) ?? null;
  } catch {
    return null;
  }
}

async function monitor(ctx: FlexportContext, emit: (record: AdapterInboundRecord) => void): Promise<void> {
  const client = requireClient(ctx);
  requireStateDir(client);
  let networkAt = initialNetworkAt(ctx, client);
  while (!ctx.signal.aborted) {
    let waitMs = client.config.poll_interval_ms;
    const nowMs = Date.now();
    const networkAtMs = Date.parse(networkAt ?? "");
    try {
      const { summary, failures, documentFailures } = await runPass(ctx, emit, {
        select: (shipment) => {
          const updated = updatedAtMs(shipment);
          return (
            !Number.isFinite(updated) ||
            updated >= nowMs - client.config.lookback_days * DAY_MS ||
            !textValue(shipment.actual_delivered_in_full_date)
          );
        },
        includeNetwork:
          !Number.isFinite(networkAtMs) || nowMs - networkAtMs >= client.config.network_interval_ms,
        emitUnchanged: false,
        networkAt,
      });
      networkAt = summary.network_at;
      // Documents that did not download are a detail of a successful pass, not a failure of it.
      if (failures.length > 0) throw failedPass(failures);
      if (hasManagedCheckpoints(ctx.runtime)) {
        emitAdapterCheckpoint({ scope: "monitor", key: "poll", value: summary }, ctx.stdout);
      }
      const previous = readStatus(client);
      writeStatus(client, {
        ...summary,
        document_failures: documentFailures,
        last_error_at: textValue(previous.last_error_at) ?? null,
        last_error: textValue(previous.last_error) ?? null,
      });
    } catch (error) {
      if (ctx.signal.aborted) break;
      const message = errorMessage(error);
      ctx.log.error("Flexport monitor pass failed: %s", message);
      try {
        writeStatus(client, { ...readStatus(client), last_error_at: new Date().toISOString(), last_error: message });
      } catch (statusError) {
        ctx.log.error("Flexport monitor status write failed: %s", errorMessage(statusError));
      }
      waitMs = ERROR_DELAY_MS;
    }
    await waitForAbort(ctx.signal, waitMs);
  }
}

async function backfill(
  ctx: FlexportContext,
  args: Omit<AdapterBackfillWindow, "connection_id">,
  emit: (record: AdapterInboundRecord) => void,
): Promise<void> {
  const client = requireClient(ctx);
  requireStateDir(client);
  const sinceMs = args.since.getTime();
  const toMs = args.to?.getTime();
  // A backfill is an explicit re-read: every bundle in the window is emitted (the runtime
  // deduplicates identical Records), and the emitted state is brought up to date for the monitor.
  const { failures } = await runPass(ctx, emit, {
    select: (shipment) => {
      const updated = updatedAtMs(shipment);
      if (!Number.isFinite(updated)) return true;
      return (!Number.isFinite(sinceMs) || updated >= sinceMs) && (toMs === undefined || updated <= toMs);
    },
    includeNetwork: true,
    emitUnchanged: true,
    networkAt: null,
  });
  if (failures.length > 0) throw failedPass(failures);
}

// --- methods ------------------------------------------------------------------------------

function refuseUnexpected(payload: UnknownRecord, allowed: string[], label: string): void {
  const unexpected = Object.keys(payload).filter((name) => !allowed.includes(name));
  if (unexpected.length > 0) {
    throw new Error(`${label} refused: unexpected fields ${unexpected.join(",")}`);
  }
}

function requireProviderId(payload: UnknownRecord, name: string, label: string): string {
  const value = textValue(payload[name]);
  if (!value || !PROVIDER_ID.test(value)) throw new Error(`${label} refused: ${name} is invalid`);
  return value;
}

/**
 * Every write is checked before any network call: the exact body, its sha256, Tyler's words, and
 * the explicit confirmation. The body is sent as given, byte for byte, and never logged or echoed.
 */
function guardWrite(payloadValue: unknown, extraFields: string[] = []): { bodyJson: string; payload: UnknownRecord } {
  const payload = asRecord(payloadValue);
  const label = "Flexport write";
  refuseUnexpected(payload, ["body_json", "body_sha256", "go", "confirm", ...extraFields], label);
  if (payload.confirm !== WRITE_CONFIRMATION) {
    throw new Error(`${label} refused: confirm must be ${WRITE_CONFIRMATION}`);
  }
  if (!textValue(payload.go)) throw new Error(`${label} refused: go (Tyler's words) is required`);
  const bodyJson = payload.body_json;
  if (typeof bodyJson !== "string" || bodyJson.length === 0) {
    throw new Error(`${label} refused: body_json must be the exact JSON text to send`);
  }
  if (typeof payload.body_sha256 !== "string" || !SHA256.test(payload.body_sha256)) {
    throw new Error(`${label} refused: body_sha256 must be a lowercase sha256 hex digest`);
  }
  if (sha256Hex(bodyJson) !== payload.body_sha256) {
    throw new Error(`${label} refused: body_sha256 does not match body_json`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyJson);
  } catch {
    throw new Error(`${label} refused: body_json is not valid JSON`);
  }
  if (!isRecord(parsed)) throw new Error(`${label} refused: body_json must be a JSON object`);
  return { bodyJson, payload };
}

async function sendWrite(
  ctx: FlexportContext,
  httpMethod: "POST" | "PATCH",
  path: string,
  bodyJson: string,
  firstOfList: boolean,
) {
  const client = requireClient(ctx);
  const data = await client.api.send(httpMethod, path, bodyJson);
  const candidate = firstOfList && Array.isArray(data) ? data[0] : data;
  const object = isRecord(candidate) ? candidate : null;
  ctx.log.info("Flexport %s %s sent", httpMethod, path);
  return {
    status: "sent",
    path,
    flexport_id: object ? (textValue(object.id) ?? null) : null,
    object,
  };
}

const EMPTY_PARAMS = { type: "object", properties: {}, additionalProperties: false };

const WRITE_PROPERTIES = {
  body_json: { type: "string", minLength: 1, description: "The exact JSON text sent to Flexport." },
  body_sha256: { type: "string", pattern: "^[0-9a-f]{64}$", description: "sha256 hex of body_json." },
  go: { type: "string", minLength: 1, description: "Tyler's words approving this exact write." },
  confirm: { type: "string", enum: [WRITE_CONFIRMATION] },
};

const WRITE_PARAMS = {
  type: "object",
  properties: WRITE_PROPERTIES,
  required: ["body_json", "body_sha256", "go", "confirm"],
  additionalProperties: false,
};

const WRITE_RESPONSE = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["sent"] },
    path: { type: "string" },
    flexport_id: { type: ["string", "null"] },
    object: { type: ["object", "null"], additionalProperties: true },
  },
  required: ["status", "path", "flexport_id", "object"],
  additionalProperties: false,
};

function writeMethod(
  description: string,
  httpMethod: "POST" | "PATCH",
  pathFor: (payload: UnknownRecord) => string,
  options: { extraFields?: string[]; params?: UnknownRecord; firstOfList?: boolean } = {},
) {
  return method<FlexportAdapterClient>({
    description,
    action: "write",
    connection_required: true,
    mutates_remote: true,
    params: options.params ?? WRITE_PARAMS,
    response: WRITE_RESPONSE,
    handler: async (ctx, req) => {
      const { bodyJson, payload } = guardWrite(req.payload, options.extraFields);
      return await sendWrite(ctx, httpMethod, pathFor(payload), bodyJson, options.firstOfList === true);
    },
  });
}

const methods = {
  "flexport.status": method<FlexportAdapterClient>({
    description: "Read the adapter's token, poll, and write-authority status without calling Flexport.",
    action: "read",
    connection_required: true,
    mutates_remote: false,
    params: EMPTY_PARAMS,
    response: { type: "object", additionalProperties: true },
    handler: async (ctx, req) => {
      refuseUnexpected(asRecord(req.payload), [], "flexport.status");
      return statusDetails(requireClient(ctx));
    },
  }),
  "flexport.shipments.list": method<FlexportAdapterClient>({
    description: "List Flexport shipments, most recently updated first (default and maximum 100).",
    action: "read",
    connection_required: true,
    mutates_remote: false,
    params: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 100 } },
      additionalProperties: false,
    },
    response: {
      type: "object",
      properties: {
        shipments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: ["string", "null"] },
              name: { type: ["string", "null"] },
              status: { type: ["string", "null"] },
              updated_at: { type: ["string", "null"] },
              transportation_mode: { type: ["string", "null"] },
            },
            required: ["id", "name", "status", "updated_at", "transportation_mode"],
            additionalProperties: false,
          },
        },
      },
      required: ["shipments"],
      additionalProperties: false,
    },
    handler: async (ctx, req) => {
      const payload = asRecord(req.payload);
      refuseUnexpected(payload, ["limit"], "flexport.shipments.list");
      const limit = payload.limit === undefined ? 100 : payload.limit;
      if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("flexport.shipments.list refused: limit must be an integer from 1 to 100");
      }
      const rows = await requireClient(ctx).api.listShipments(limit);
      return {
        shipments: rows.slice(0, limit).map((row) => ({
          id: textValue(row.id) ?? null,
          name: textValue(row.name) ?? null,
          status: textValue(row.status) ?? null,
          updated_at: textValue(row.updated_at) ?? null,
          transportation_mode: textValue(row.transportation_mode) ?? null,
        })),
      };
    },
  }),
  "flexport.shipments.bundle": method<FlexportAdapterClient>({
    description: "Read one shipment's bundle (shipment, containers, legs, customs entries, invoices, documents).",
    action: "read",
    connection_required: true,
    mutates_remote: false,
    params: {
      type: "object",
      properties: { shipment_id: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" } },
      required: ["shipment_id"],
      additionalProperties: false,
    },
    response: {
      type: "object",
      properties: {
        bundle: { type: "object", additionalProperties: true },
        bundle_sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
      },
      required: ["bundle", "bundle_sha256"],
      additionalProperties: false,
    },
    handler: async (ctx, req) => {
      const payload = asRecord(req.payload);
      refuseUnexpected(payload, ["shipment_id"], "flexport.shipments.bundle");
      const shipmentId = requireProviderId(payload, "shipment_id", "flexport.shipments.bundle");
      const snapshot = bundleSnapshot(await requireClient(ctx).api.bundle(shipmentId));
      return { bundle: JSON.parse(snapshot.json) as unknown, bundle_sha256: snapshot.sha256 };
    },
  }),
  "flexport.network.get": method<FlexportAdapterClient>({
    description: "Read MoonSleep's Flexport network: own company, company entities, companies, and locations.",
    action: "read",
    connection_required: true,
    mutates_remote: false,
    params: EMPTY_PARAMS,
    response: {
      type: "object",
      properties: {
        network: { type: "object", additionalProperties: true },
        network_sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
      },
      required: ["network", "network_sha256"],
      additionalProperties: false,
    },
    handler: async (ctx, req) => {
      refuseUnexpected(asRecord(req.payload), [], "flexport.network.get");
      const snapshot = networkSnapshot(await requireClient(ctx).api.network());
      return { network: JSON.parse(snapshot.json) as unknown, network_sha256: snapshot.sha256 };
    },
  }),
  "flexport.products.create": writeMethod(
    "Create one Flexport product from the exact approved body (POST /products).",
    "POST",
    () => "/products",
  ),
  "flexport.products.update": writeMethod(
    "Update one Flexport product from the exact approved body (PATCH /products/{product_id}).",
    "PATCH",
    (payload) => `/products/${encodeURIComponent(requireProviderId(payload, "product_id", "Flexport write"))}`,
    {
      extraFields: ["product_id"],
      params: {
        ...WRITE_PARAMS,
        properties: { product_id: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" }, ...WRITE_PROPERTIES },
        required: ["product_id", "body_json", "body_sha256", "go", "confirm"],
      },
    },
  ),
  "flexport.bookings.create": writeMethod(
    "Create one Flexport booking from the exact approved body (POST /bookings).",
    "POST",
    () => "/bookings",
  ),
  "flexport.documents.create": writeMethod(
    "Upload one Flexport shipment document from the exact approved body (POST /documents).",
    "POST",
    () => "/documents",
    { firstOfList: true },
  ),
};

export const __test__ = {
  backfill,
  buildClient,
  guardWrite,
  health,
  monitor,
  readEmitted,
  runPass,
  statusDetails,
};

export const flexportAdapter = defineAdapter<FlexportAdapterClient>({
  platform: PLATFORM,
  name: "flexport-adapter",
  version: "0.1.0",
  multi_account: true,
  credential_service: SERVICE,
  // Document bodies are base64 inside body_json and pass 128 KiB, the Linux limit of the one argv
  // string the runtime would otherwise put them in: over 64 KiB they arrive as a 0600 payload file.
  supportsPayloadFile: true,
  auth: {
    methods: [
      {
        id: AUTH_METHOD_ID,
        type: "api_key",
        label: "Connect Flexport API client",
        icon: "key",
        service: SERVICE,
        fields: [
          { name: "client_id", label: "Client ID", type: "text", required: true },
          { name: "client_secret", label: "Client secret", type: "secret", required: true },
          { name: "account", label: "Account", type: "text", required: false },
        ],
      },
    ],
    setupGuide:
      "Store a Flexport API client (client id and secret from Flexport's API settings) on the connection. The adapter exchanges it for one cached bearer token, reads shipments, documents and the network, and writes to Flexport only through the four write methods, each with an exact approved body, its sha256, Tyler's words and SEND_TO_FLEXPORT.",
  },
  capabilities: {
    text_limit: 0,
    supports_markdown: false,
    supports_tables: false,
    supports_code_blocks: false,
    supports_embeds: false,
    supports_threads: false,
    supports_reactions: false,
    supports_polls: false,
    supports_buttons: false,
    supports_edit: false,
    supports_delete: false,
    supports_media: true,
    supports_voice_notes: false,
  },
  client: { create: ({ ctx, connectionId }) => buildClient(ctx, connectionId) },
  connection: {
    connections: async (ctx) => {
      const client = requireClient(ctx);
      return [
        {
          id: client.connectionId,
          display_name: `Flexport${client.account ? ` (${client.account})` : ""}`,
          ...(client.account ? { account: client.account } : {}),
          ...(ctx.runtime?.credential?.ref ? { credential_ref: ctx.runtime.credential.ref } : {}),
          status: "ready",
        },
      ];
    },
    health: async (ctx) => health(ctx),
  },
  ingest: { backfill, monitor },
  methods,
});
