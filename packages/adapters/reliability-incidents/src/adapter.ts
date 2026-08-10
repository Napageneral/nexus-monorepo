import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  type AdapterConnectionIdentity,
  type AdapterContext,
  type AdapterHealth,
  type AdapterInboundRecord,
  defineAdapter,
  requireAdapterStateDir,
} from "@nexus-project/adapter-sdk-ts";

type UnknownRecord = Record<string, unknown>;

export const RELIABILITY_INCIDENTS_PLATFORM = "reliability-incidents";
export const INCIDENT_CAPTURE_COMMAND = "incident.capture";
export const INCIDENT_CAPTURE_BATCH_COMMAND = "incident.capture.batch";
export const INCIDENT_SCHEMA_VERSION = 1;

const MAX_BATCH_SIZE = 500;
const MAX_PAYLOAD_BYTES = 256 * 1024;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const INCIDENT_TRANSITIONS = new Set([
  "detected",
  "updated",
  "acknowledged",
  "mitigation_started",
  "mitigated",
  "recovered",
  "closed",
  "reopened",
  "blocked",
  "escalated",
]);
const INCIDENT_STATUSES = new Set([
  "open",
  "investigating",
  "mitigating",
  "monitoring",
  "recovered",
  "closed",
  "blocked",
]);
const SEVERITIES = new Set(["info", "warning", "critical"]);
const IMPACT_STATUSES = new Set(["none", "possible", "confirmed", "unknown"]);
const SENSITIVE_METADATA_KEYS = /(^|[_-])(authorization|cookie|credential|password|secret|session|token)([_-]|$)/iu;

const DEDUPE_SCHEMA = `
CREATE TABLE IF NOT EXISTS reliability_incident_events (
  connection_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  external_record_id TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  accepted_revisions INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (connection_id, event_id)
);
CREATE INDEX IF NOT EXISTS reliability_incident_events_last_seen_idx
  ON reliability_incident_events (connection_id, last_seen_at DESC);
`;

export type ReliabilityRuntimeConfig = {
  source_id: string;
  display_name: string;
  environment?: string;
  metadata?: UnknownRecord;
};

export type EvidenceReference = {
  ref_type: string;
  uri?: string;
  digest?: string;
  summary?: string;
};

export type CustomerImpact = {
  status: "none" | "possible" | "confirmed" | "unknown";
  summary?: string;
};

export type IncidentTransition = {
  schema_version: 1;
  event_id: string;
  incident_id: string;
  source_id: string;
  detector_id: string;
  occurred_at: string;
  observed_at: string;
  transition:
    | "detected"
    | "updated"
    | "acknowledged"
    | "mitigation_started"
    | "mitigated"
    | "recovered"
    | "closed"
    | "reopened"
    | "blocked"
    | "escalated";
  status:
    | "open"
    | "investigating"
    | "mitigating"
    | "monitoring"
    | "recovered"
    | "closed"
    | "blocked";
  incident_class: string;
  severity: "info" | "warning" | "critical";
  title: string;
  summary: string;
  affected_components: string[];
  customer_impact: CustomerImpact;
  correlation_key?: string;
  owner?: string;
  evidence_refs: EvidenceReference[];
  change_refs: string[];
  remediation?: string;
  validation?: string;
  metadata?: UnknownRecord;
};

type DedupeDecision = {
  deduped: boolean;
  revision: boolean;
  previous?: {
    incident_id: string;
    source_id: string;
    content_sha256: string;
  };
};

export type CaptureResult = {
  ok: true;
  event_id: string;
  incident_id: string;
  external_record_id: string;
  deduped: boolean;
  revision: boolean;
};

export type CaptureBatchResult = {
  ok: true;
  count: number;
  emitted: number;
  deduped: number;
  revised: number;
  results: CaptureResult[];
};

type RuntimeContextLike = {
  runtime: {
    connection_id: string;
    credential?: { ref?: string };
    config?: unknown;
  } | null;
};

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as UnknownRecord;
}

function setupFields() {
  return [
    {
      name: "source_id",
      label: "Source ID",
      type: "text" as const,
      required: true,
      placeholder: "moonsleep-production",
    },
    {
      name: "display_name",
      label: "Display name",
      type: "text" as const,
      required: true,
      placeholder: "MoonSleep Production",
    },
    {
      name: "environment",
      label: "Environment",
      type: "text" as const,
      required: false,
      placeholder: "production",
    },
    {
      name: "confirm_source_boundary",
      label: "Read-only source confirmation",
      type: "text" as const,
      required: true,
      placeholder: "REGISTER_RELIABILITY_SOURCE_READ_ONLY",
    },
  ];
}

function setupConfig(payload: unknown): ReliabilityRuntimeConfig {
  const row = asRecord(payload);
  const confirmation = asRequiredString(
    row.confirm_source_boundary,
    "confirm_source_boundary",
    128,
  );
  if (confirmation !== "REGISTER_RELIABILITY_SOURCE_READ_ONLY") {
    throw new Error("read-only source confirmation is invalid");
  }
  const sourceId = asSlug(row.source_id, "source_id");
  const displayName = asRequiredString(row.display_name, "display_name", 256);
  const environment = asOptionalString(row.environment, "environment", 128);
  return {
    source_id: sourceId,
    display_name: displayName,
    ...(environment ? { environment } : {}),
  };
}

function asRequiredString(value: unknown, field: string, maxLength = 4_096): string {
  if (typeof value !== "string") {
    throw new Error(`${field} is required`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`${field} exceeds ${maxLength} characters`);
  }
  return normalized;
}

function asOptionalString(value: unknown, field: string, maxLength = 4_096): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return asRequiredString(value, field, maxLength);
}

function asSlug(value: unknown, field: string): string {
  const slug = asRequiredString(value, field, 128).toLowerCase();
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`${field} must be a stable lowercase identifier`);
  }
  return slug;
}

function asEnum<T extends string>(value: unknown, field: string, allowed: Set<string>): T {
  const normalized = asRequiredString(value, field, 64).toLowerCase();
  if (!allowed.has(normalized)) {
    throw new Error(`${field} is not supported: ${normalized}`);
  }
  return normalized as T;
}

function asTimestamp(value: unknown, field: string): { iso: string; epoch_ms: number } {
  let epochMs: number;
  if (typeof value === "number" && Number.isFinite(value)) {
    epochMs = value < 10_000_000_000 ? value * 1_000 : value;
  } else if (typeof value === "string" && value.trim()) {
    epochMs = Date.parse(value);
  } else {
    throw new Error(`${field} is required`);
  }
  if (!Number.isFinite(epochMs) || epochMs < 0) {
    throw new Error(`${field} must be a valid timestamp`);
  }
  const date = new Date(epochMs);
  return { iso: date.toISOString(), epoch_ms: date.getTime() };
}

function asStringArray(value: unknown, field: string, maxItems = 100): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  if (value.length > maxItems) {
    throw new Error(`${field} exceeds ${maxItems} entries`);
  }
  return [...new Set(value.map((entry, index) => asRequiredString(entry, `${field}[${index}]`, 256)))];
}

function assertSafeMetadata(value: unknown, location = "metadata", depth = 0): void {
  if (depth > 12) {
    throw new Error(`${location} is nested too deeply`);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertSafeMetadata(value[index], `${location}[${index}]`, depth + 1);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value as UnknownRecord)) {
    if (SENSITIVE_METADATA_KEYS.test(key)) {
      throw new Error(`${location}.${key} is not allowed in reliability incident metadata`);
    }
    assertSafeMetadata(child, `${location}.${key}`, depth + 1);
  }
}

function normalizeEvidenceReferences(value: unknown): EvidenceReference[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > 100) {
    throw new Error("evidence_refs must be an array with at most 100 entries");
  }
  return value.map((entry, index) => {
    const row = asRecord(entry);
    const normalized: EvidenceReference = {
      ref_type: asSlug(row.ref_type, `evidence_refs[${index}].ref_type`),
    };
    const uri = asOptionalString(row.uri, `evidence_refs[${index}].uri`, 2_048);
    const digest = asOptionalString(row.digest, `evidence_refs[${index}].digest`, 256);
    const summary = asOptionalString(row.summary, `evidence_refs[${index}].summary`, 1_024);
    if (uri) normalized.uri = uri;
    if (digest) normalized.digest = digest;
    if (summary) normalized.summary = summary;
    return normalized;
  });
}

function normalizeCustomerImpact(value: unknown): CustomerImpact {
  const row = asRecord(value);
  const status = asEnum<CustomerImpact["status"]>(row.status ?? "unknown", "customer_impact.status", IMPACT_STATUSES);
  const summary = asOptionalString(row.summary, "customer_impact.summary", 2_048);
  return { status, ...(summary ? { summary } : {}) };
}

export function normalizeIncidentTransition(value: unknown, expectedSourceId: string): IncidentTransition {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) {
    throw new Error(`incident payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
  }
  const row = asRecord(value);
  const schemaVersion = Number(row.schema_version ?? INCIDENT_SCHEMA_VERSION);
  if (schemaVersion !== INCIDENT_SCHEMA_VERSION) {
    throw new Error(`unsupported schema_version: ${schemaVersion}`);
  }
  const sourceId = asSlug(row.source_id ?? expectedSourceId, "source_id");
  if (sourceId !== expectedSourceId) {
    throw new Error(`source_id does not match the bound connection: ${sourceId}`);
  }
  const occurredAt = asTimestamp(row.occurred_at, "occurred_at");
  const observedAt = asTimestamp(row.observed_at ?? row.occurred_at, "observed_at");
  if (observedAt.epoch_ms < occurredAt.epoch_ms - 86_400_000) {
    throw new Error("observed_at cannot materially precede occurred_at");
  }
  const metadata = row.metadata === undefined ? undefined : asRecord(row.metadata);
  if (metadata) {
    assertSafeMetadata(metadata);
  }
  const incident: IncidentTransition = {
    schema_version: INCIDENT_SCHEMA_VERSION,
    event_id: asRequiredString(row.event_id, "event_id", 256),
    incident_id: asRequiredString(row.incident_id, "incident_id", 256),
    source_id: sourceId,
    detector_id: asSlug(row.detector_id, "detector_id"),
    occurred_at: occurredAt.iso,
    observed_at: observedAt.iso,
    transition: asEnum<IncidentTransition["transition"]>(row.transition, "transition", INCIDENT_TRANSITIONS),
    status: asEnum<IncidentTransition["status"]>(row.status, "status", INCIDENT_STATUSES),
    incident_class: asSlug(row.incident_class, "incident_class"),
    severity: asEnum<IncidentTransition["severity"]>(row.severity, "severity", SEVERITIES),
    title: asRequiredString(row.title, "title", 256),
    summary: asRequiredString(row.summary, "summary", 8_192),
    affected_components: asStringArray(row.affected_components, "affected_components"),
    customer_impact: normalizeCustomerImpact(row.customer_impact),
    evidence_refs: normalizeEvidenceReferences(row.evidence_refs),
    change_refs: asStringArray(row.change_refs, "change_refs"),
  };
  const correlationKey = asOptionalString(row.correlation_key, "correlation_key", 512);
  const owner = asOptionalString(row.owner, "owner", 256);
  const remediation = asOptionalString(row.remediation, "remediation", 8_192);
  const validation = asOptionalString(row.validation, "validation", 8_192);
  if (correlationKey) incident.correlation_key = correlationKey;
  if (owner) incident.owner = owner;
  if (remediation) incident.remediation = remediation;
  if (validation) incident.validation = validation;
  if (metadata && Object.keys(metadata).length > 0) incident.metadata = metadata;
  return incident;
}

export function readRuntimeConfig(ctx: RuntimeContextLike): ReliabilityRuntimeConfig {
  const config = asRecord(ctx.runtime?.config);
  const sourceId = asSlug(config.source_id, "runtime.config.source_id");
  const displayName = asOptionalString(config.display_name, "runtime.config.display_name", 256) ?? sourceId;
  const environment = asOptionalString(config.environment, "runtime.config.environment", 128);
  const metadata = config.metadata === undefined ? undefined : asRecord(config.metadata);
  if (metadata) assertSafeMetadata(metadata, "runtime.config.metadata");
  return {
    source_id: sourceId,
    display_name: displayName,
    ...(environment ? { environment } : {}),
    ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

function buildConnectionIdentity(
  ctx: RuntimeContextLike,
  config: ReliabilityRuntimeConfig,
): AdapterConnectionIdentity {
  const connectionId = ctx.runtime?.connection_id?.trim() ?? config.source_id;
  return {
    id: connectionId,
    display_name: config.display_name,
    ...(ctx.runtime?.credential?.ref ? { credential_ref: ctx.runtime.credential.ref } : {}),
    status: "ready",
  };
}

function stateDatabasePath(): string {
  const stateDir = requireAdapterStateDir();
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const dbPath = path.join(stateDir, "reliability-incidents.sqlite");
  return dbPath;
}

function openStateDatabase(): DatabaseSync {
  const dbPath = stateDatabasePath();
  const db = new DatabaseSync(dbPath);
  db.exec(DEDUPE_SCHEMA);
  try {
    fs.chmodSync(dbPath, 0o600);
  } catch {
    // The runtime-owned state directory may enforce permissions externally.
  }
  return db;
}

function contentDigest(event: IncidentTransition): string {
  return createHash("sha256").update(stableStringify(event)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const row = value as UnknownRecord;
    return `{${Object.keys(row)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(row[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function readDedupeDecision(
  db: DatabaseSync,
  connectionId: string,
  event: IncidentTransition,
): DedupeDecision {
  const row = db
    .prepare(
      `SELECT incident_id, source_id, content_sha256
       FROM reliability_incident_events
       WHERE connection_id = ? AND event_id = ?`,
    )
    .get(connectionId, event.event_id) as
    | { incident_id: string; source_id: string; content_sha256: string }
    | undefined;
  if (!row) return { deduped: false, revision: false };
  if (row.incident_id !== event.incident_id || row.source_id !== event.source_id) {
    throw new Error(`event_id identity drift detected: ${event.event_id}`);
  }
  const digest = contentDigest(event);
  return {
    deduped: row.content_sha256 === digest,
    revision: row.content_sha256 !== digest,
    previous: row,
  };
}

function markAccepted(
  db: DatabaseSync,
  connectionId: string,
  event: IncidentTransition,
  externalRecordId: string,
): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO reliability_incident_events (
       connection_id, event_id, incident_id, source_id, external_record_id,
       content_sha256, first_seen_at, last_seen_at, accepted_revisions
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT (connection_id, event_id) DO UPDATE SET
       content_sha256 = excluded.content_sha256,
       external_record_id = excluded.external_record_id,
       last_seen_at = excluded.last_seen_at,
       accepted_revisions = reliability_incident_events.accepted_revisions + 1`,
  ).run(
    connectionId,
    event.event_id,
    event.incident_id,
    event.source_id,
    externalRecordId,
    contentDigest(event),
    now,
    now,
  );
}

function readLatestEventAt(connectionId: string): number | undefined {
  try {
    const db = openStateDatabase();
    try {
      const row = db
        .prepare(
          `SELECT max(last_seen_at) AS last_seen_at
           FROM reliability_incident_events
           WHERE connection_id = ?`,
        )
        .get(connectionId) as { last_seen_at: number | null } | undefined;
      return row?.last_seen_at ?? undefined;
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
}

function buildHealth(ctx: RuntimeContextLike, config: ReliabilityRuntimeConfig): AdapterHealth {
  const connectionId = ctx.runtime?.connection_id?.trim() ?? config.source_id;
  const lastEventAt = readLatestEventAt(connectionId);
  return {
    connected: true,
    connection_id: connectionId,
    ...(lastEventAt ? { last_event_at: lastEventAt } : {}),
    details: {
      adapter: RELIABILITY_INCIDENTS_PLATFORM,
      source_id: config.source_id,
      display_name: config.display_name,
      environment: config.environment,
      ...(config.metadata ?? {}),
    },
  };
}

function formatContent(event: IncidentTransition): string {
  const lines = [
    `[${event.severity.toUpperCase()}] ${event.title}`,
    `${event.transition.toUpperCase()} · ${event.status.toUpperCase()} · ${event.occurred_at}`,
    event.summary,
  ];
  if (event.affected_components.length > 0) {
    lines.push(`Affected: ${event.affected_components.join(", ")}`);
  }
  lines.push(
    `Customer impact: ${event.customer_impact.status}${event.customer_impact.summary ? ` — ${event.customer_impact.summary}` : ""}`,
  );
  if (event.remediation) lines.push(`Remediation: ${event.remediation}`);
  if (event.validation) lines.push(`Validation: ${event.validation}`);
  return lines.join("\n");
}

export function buildRecordIngestEnvelope(
  ctx: RuntimeContextLike,
  config: ReliabilityRuntimeConfig,
  event: IncidentTransition,
): AdapterInboundRecord {
  const connectionId = ctx.runtime?.connection_id?.trim() ?? config.source_id;
  return {
    operation: "record.ingest",
    routing: {
      adapter: RELIABILITY_INCIDENTS_PLATFORM,
      platform: RELIABILITY_INCIDENTS_PLATFORM,
      connection_id: connectionId,
      sender_id: `detector:${event.detector_id}`,
      sender_name: event.detector_id,
      // Nex binds adapter-originated records to the configured connection by
      // receiver id. Keep source identity in the receiver name and metadata;
      // prefixing this value would fail inbound integrity.
      receiver_id: connectionId,
      receiver_name: config.display_name,
      space_id: config.source_id,
      space_name: config.display_name,
      container_kind: "group",
      container_id: `incidents:${config.source_id}`,
      container_name: `${config.display_name} reliability incidents`,
      thread_id: event.incident_id,
      thread_name: event.title,
      metadata: {
        schema_version: event.schema_version,
        source_id: event.source_id,
        incident_id: event.incident_id,
        event_id: event.event_id,
        detector_id: event.detector_id,
        transition: event.transition,
        status: event.status,
        incident_class: event.incident_class,
        severity: event.severity,
        customer_impact_status: event.customer_impact.status,
        ...(event.correlation_key ? { correlation_key: event.correlation_key } : {}),
      },
    },
    payload: {
      external_record_id: `${event.source_id}:${event.event_id}`,
      timestamp: Date.parse(event.occurred_at),
      content: formatContent(event),
      content_type: "text",
      metadata: {
        incident_event: event,
        incident_id: event.incident_id,
        event_id: event.event_id,
      },
    },
  };
}

function readIncidentInput(payload: UnknownRecord): unknown {
  const event = payload.incident_event;
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error("payload.incident_event is required");
  }
  return event;
}

function readIncidentBatch(payload: UnknownRecord): unknown[] {
  if (!Array.isArray(payload.incident_events)) {
    throw new Error("payload.incident_events is required");
  }
  if (payload.incident_events.length > MAX_BATCH_SIZE) {
    throw new Error(`payload.incident_events exceeds ${MAX_BATCH_SIZE} entries`);
  }
  return payload.incident_events;
}

export async function captureNormalizedEvent(
  ctx: AdapterContext,
  config: ReliabilityRuntimeConfig,
  event: IncidentTransition,
  emit: (record: AdapterInboundRecord) => Promise<void>,
): Promise<CaptureResult> {
  const connectionId = ctx.runtime?.connection_id?.trim() ?? config.source_id;
  const envelope = buildRecordIngestEnvelope(ctx, config, event);
  const db = openStateDatabase();
  try {
    const decision = readDedupeDecision(db, connectionId, event);
    if (decision.deduped) {
      return {
        ok: true,
        event_id: event.event_id,
        incident_id: event.incident_id,
        external_record_id: envelope.payload.external_record_id,
        deduped: true,
        revision: false,
      };
    }
    await emit(envelope);
    markAccepted(db, connectionId, event, envelope.payload.external_record_id);
    return {
      ok: true,
      event_id: event.event_id,
      incident_id: event.incident_id,
      external_record_id: envelope.payload.external_record_id,
      deduped: false,
      revision: decision.revision,
    };
  } finally {
    db.close();
  }
}

export async function captureBatch(
  ctx: AdapterContext,
  config: ReliabilityRuntimeConfig,
  values: unknown[],
  emit: (record: AdapterInboundRecord) => Promise<void>,
): Promise<CaptureBatchResult> {
  const events = values.map((value) => normalizeIncidentTransition(value, config.source_id));
  const results: CaptureResult[] = [];
  for (const event of events) {
    results.push(await captureNormalizedEvent(ctx, config, event, emit));
  }
  return {
    ok: true,
    count: results.length,
    emitted: results.filter((result) => !result.deduped).length,
    deduped: results.filter((result) => result.deduped).length,
    revised: results.filter((result) => result.revision).length,
    results,
  };
}

export const reliabilityIncidentsAdapter = defineAdapter({
  platform: RELIABILITY_INCIDENTS_PLATFORM,
  name: "reliability-incidents-adapter",
  version: "0.1.0",
  multi_account: true,
  auth: {
    methods: [
      {
        id: "reliability_source",
        type: "custom_flow",
        label: "Register reliability source",
        icon: "activity",
        service: RELIABILITY_INCIDENTS_PLATFORM,
        fields: setupFields(),
      },
    ],
    setupGuide:
      "Register a source-owned append-only incident feed. The adapter receives no provider credential and exposes no remediation authority.",
  },
  capabilities: {
    text_limit: 0,
    supports_markdown: false,
    supports_tables: false,
    supports_code_blocks: false,
    supports_embeds: false,
    supports_threads: true,
    supports_reactions: false,
    supports_polls: false,
    supports_buttons: false,
    supports_edit: false,
    supports_delete: false,
    supports_media: false,
    supports_voice_notes: false,
  },
  connection: {
    connections: async (ctx) => {
      const config = readRuntimeConfig(ctx);
      return [buildConnectionIdentity(ctx, config)];
    },
    health: async (ctx) => buildHealth(ctx, readRuntimeConfig(ctx)),
  },
  setup: {
    start: async (_ctx, request) => ({
      status: "requires_input",
      ...(request.session_id ? { session_id: request.session_id } : {}),
      ...(request.connection_id ? { connection_id: request.connection_id } : {}),
      service: RELIABILITY_INCIDENTS_PLATFORM,
      message: "Register a source-owned reliability incident feed.",
      instructions:
        "Choose a stable source id. Incident transitions must be persisted by the source before delivery to Nex.",
      fields: setupFields(),
    }),
    submit: async (_ctx, request) => {
      const config = setupConfig(request.payload);
      return {
        status: "completed",
        ...(request.session_id ? { session_id: request.session_id } : {}),
        connection_id: config.source_id,
        service: RELIABILITY_INCIDENTS_PLATFORM,
        account: config.display_name,
        account_contact: {
          platform: RELIABILITY_INCIDENTS_PLATFORM,
          space_id: config.source_id,
          contact_id: `source:${config.source_id}`,
        },
        message: "Reliability incident source registered without remediation authority.",
        metadata: {
          adapter_config: config,
          source_persistence_required: true,
          remote_write_authority: false,
          remediation_authority: false,
        },
      };
    },
  },
  serve: async (ctx, _request, session) => {
    const config = readRuntimeConfig(ctx);
    const connectionId = ctx.runtime?.connection_id?.trim() ?? config.source_id;
    const registry = session.createEndpointRegistry();
    await registry.upsert({
      endpoint_id: connectionId,
      display_name: config.display_name,
      platform: RELIABILITY_INCIDENTS_PLATFORM,
      caps: ["record.ingest"],
      commands: [INCIDENT_CAPTURE_COMMAND, INCIDENT_CAPTURE_BATCH_COMMAND],
      permissions: {},
    });
    await session.serve({
      onInvoke: async (frame) => {
        if (frame.endpoint_id !== connectionId) {
          return {
            ok: false,
            error: { code: "INVALID_REQUEST", message: "unknown reliability incident endpoint" },
          };
        }
        try {
          const payload = asRecord(frame.payload);
          if (frame.command === INCIDENT_CAPTURE_COMMAND) {
            const event = normalizeIncidentTransition(readIncidentInput(payload), config.source_id);
            const result = await captureNormalizedEvent(
              ctx,
              config,
              event,
              async (record) => session.emitRecordIngest(record),
            );
            return { ok: true, payload: result };
          }
          if (frame.command === INCIDENT_CAPTURE_BATCH_COMMAND) {
            const result = await captureBatch(
              ctx,
              config,
              readIncidentBatch(payload),
              async (record) => session.emitRecordIngest(record),
            );
            return { ok: true, payload: result };
          }
          return {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: `unknown reliability incident command: ${frame.command}`,
            },
          };
        } catch (error) {
          return {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: error instanceof Error ? error.message : "invalid reliability incident payload",
            },
          };
        }
      },
    });
  },
});
