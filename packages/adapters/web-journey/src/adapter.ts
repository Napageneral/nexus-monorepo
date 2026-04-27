import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  type AdapterContext,
  defineAdapter,
  type AdapterConnectionIdentity,
  type AdapterHealth,
  type AdapterServeSession,
  requireAdapterStateDir,
} from "@nexus-project/adapter-sdk-ts";

type UnknownRecord = Record<string, unknown>;

type RuntimeContextLike = {
  runtime: {
    connection_id: string;
    credential?: {
      ref?: string;
    };
    config?: unknown;
  } | null;
};

type WebJourneyRuntimeConfig = {
  web_installation_id: string;
  collector_base_url?: string;
  site_origin?: string;
  display_name?: string;
  last_event_at?: number;
  metadata?: UnknownRecord;
};

type WebJourneyEventRecord = {
  web_installation_id: string;
  event_id: string;
  captured_at: number;
  received_at: number;
  consent_state: "granted" | "denied" | "unknown";
  event_name: string;
  browser_id: string | null;
  session_id: string;
  page_url: string;
  page_path: string;
  host: string;
  referrer: string | null;
  event_source_url: string | null;
  page_title: string | null;
  user_agent: string | null;
  viewport_width: number | null;
  viewport_height: number | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  fbc: string | null;
  fbp: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  ttclid: string | null;
  ttp: string | null;
  msclkid: string | null;
  surface_id: string | null;
  surface_label: string | null;
  surface_category: string | null;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  bridge_surface: string | null;
  handoff_id: string | null;
  checkout_token: string | null;
  checkout_key: string | null;
  checkout_id: string | null;
  cart_token: string | null;
  form_id: string | null;
  form_submission_id: string | null;
  booking_id: string | null;
  booking_slot_id: string | null;
  lead_external_id: string | null;
  metadata: UnknownRecord | null;
};

type WebJourneyRecordIngestEnvelope = {
  operation: "record.ingest";
  routing: {
    adapter: "web-journey";
    platform: "web-journey";
    connection_id: string;
    sender_id: string;
    sender_name?: string;
    receiver_id: string;
    receiver_name?: string;
    space_id?: string;
    space_name?: string;
    container_kind: "group";
    container_id: string;
    container_name?: string;
    thread_id: string;
    metadata: UnknownRecord;
  };
  payload: {
    external_record_id: string;
    timestamp: number;
    content: string;
    content_type: "text";
    metadata: {
      row: WebJourneyEventRecord;
      web_event: WebJourneyEventRecord;
    };
  };
};

type CollectResult = {
  ok: true;
  event: WebJourneyEventRecord;
  deduped: boolean;
};

type CollectBatchResult = {
  ok: true;
  count: number;
  events: WebJourneyEventRecord[];
};

const DEDUPE_SCHEMA = `
CREATE TABLE IF NOT EXISTS web_journey_seen_events (
  connection_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  external_record_id TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  PRIMARY KEY (connection_id, event_id)
);
`;

const WEB_JOURNEY_PLATFORM = "web-journey";

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as UnknownRecord;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeText(value: unknown): string | null {
  const text = asString(value);
  return text ?? null;
}

function normalizeNumber(value: unknown): number | null {
  const numberValue = asNumber(value);
  return numberValue === undefined ? null : Math.floor(numberValue);
}

function normalizeRequiredText(value: unknown, field: string): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function normalizeConsentState(value: unknown): "granted" | "denied" | "unknown" {
  if (value === "granted" || value === "denied" || value === "unknown") {
    return value;
  }
  return "unknown";
}

function eventSummary(event: WebJourneyEventRecord): string {
  const parts = [
    event.event_name,
    event.page_path,
    event.surface_id,
    event.surface_label,
    event.target_id,
    event.target_label,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return parts.join(" ");
}

function readRuntimeConfig(ctx: RuntimeContextLike): WebJourneyRuntimeConfig {
  const runtime = ctx.runtime;
  const rawConfig = asRecord(runtime?.config);
  const webInstallationId = asString(rawConfig.web_installation_id);
  if (!webInstallationId) {
    throw new Error("runtime.config.web_installation_id is required");
  }
  return {
    web_installation_id: webInstallationId,
    collector_base_url: asString(rawConfig.collector_base_url),
    site_origin: asString(rawConfig.site_origin),
    display_name: asString(rawConfig.display_name),
    last_event_at: normalizeNumber(rawConfig.last_event_at) ?? undefined,
    metadata: asRecord(rawConfig.metadata),
  };
}

function buildConnectionIdentity(
  ctx: RuntimeContextLike,
  config: WebJourneyRuntimeConfig,
): AdapterConnectionIdentity {
  const connectionId = ctx.runtime?.connection_id?.trim() ?? config.web_installation_id;
  return {
    id: connectionId,
    display_name: config.display_name ?? config.web_installation_id,
    ...(ctx.runtime?.credential?.ref ? { credential_ref: ctx.runtime.credential.ref } : {}),
    status: "ready",
  };
}

function buildHealth(ctx: RuntimeContextLike, config: WebJourneyRuntimeConfig): AdapterHealth {
  const connectionId = ctx.runtime?.connection_id?.trim() ?? config.web_installation_id;
  return {
    connected: true,
    connection_id: connectionId,
    ...(config.last_event_at ? { last_event_at: config.last_event_at } : {}),
    details: {
      adapter: WEB_JOURNEY_PLATFORM,
      web_installation_id: config.web_installation_id,
      collector_base_url: config.collector_base_url,
      site_origin: config.site_origin,
      display_name: config.display_name,
      connection_id: connectionId,
      ...(config.metadata ?? {}),
    },
  };
}

function buildBinding(ctx: RuntimeContextLike, config: WebJourneyRuntimeConfig): {
  connection_id: string;
  web_installation_id: string;
} {
  return {
    connection_id: ctx.runtime?.connection_id?.trim() ?? config.web_installation_id,
    web_installation_id: config.web_installation_id,
  };
}

function readWebEventInput(value: unknown): UnknownRecord {
  const record = asRecord(value);
  const webEvent = asRecord(record.web_event);
  if (Object.keys(webEvent).length === 0) {
    throw new Error("payload.web_event is required");
  }
  return webEvent;
}

function readWebEventBatchInput(value: unknown): UnknownRecord[] {
  const record = asRecord(value);
  const webEvents = record.web_events;
  if (!Array.isArray(webEvents)) {
    throw new Error("payload.web_events is required");
  }
  return webEvents.filter(
    (entry): entry is UnknownRecord => !!entry && typeof entry === "object" && !Array.isArray(entry),
  );
}

function normalizeWebEventInput(
  input: UnknownRecord,
  fallbackInstallationId: string,
): WebJourneyEventRecord {
  const explicitInstallationId = asString(input.web_installation_id);
  const webInstallationId = explicitInstallationId ?? fallbackInstallationId;
  if (!webInstallationId) {
    throw new Error("web_installation_id is required");
  }
  if (explicitInstallationId && explicitInstallationId !== fallbackInstallationId) {
    throw new Error("web_installation_id does not match the bound connection");
  }

  const bridge = asRecord(input.bridge);
  const metadata = asRecord(input.metadata);

  return {
    web_installation_id: webInstallationId,
    event_id: normalizeRequiredText(input.event_id, "event_id"),
    captured_at: normalizeNumber(input.captured_at) ?? Date.now(),
    received_at: normalizeNumber(input.received_at) ?? Date.now(),
    consent_state: normalizeConsentState(input.consent_state),
    event_name: normalizeRequiredText(input.event_name, "event_name"),
    browser_id: normalizeText(input.browser_id),
    session_id: normalizeRequiredText(input.session_id, "session_id"),
    page_url: normalizeRequiredText(input.page_url, "page_url"),
    page_path: normalizeRequiredText(input.page_path, "page_path"),
    host: normalizeRequiredText(input.host, "host"),
    referrer: normalizeText(input.referrer),
    event_source_url: normalizeText(input.event_source_url),
    page_title: normalizeText(input.page_title),
    user_agent: normalizeText(input.user_agent),
    viewport_width: normalizeNumber(input.viewport_width),
    viewport_height: normalizeNumber(input.viewport_height),
    utm_source: normalizeText(input.utm_source),
    utm_medium: normalizeText(input.utm_medium),
    utm_campaign: normalizeText(input.utm_campaign),
    utm_content: normalizeText(input.utm_content),
    utm_term: normalizeText(input.utm_term),
    fbclid: normalizeText(input.fbclid),
    fbc: normalizeText(input.fbc),
    fbp: normalizeText(input.fbp),
    gclid: normalizeText(input.gclid),
    gbraid: normalizeText(input.gbraid),
    wbraid: normalizeText(input.wbraid),
    ttclid: normalizeText(input.ttclid),
    ttp: normalizeText(input.ttp),
    msclkid: normalizeText(input.msclkid),
    surface_id: normalizeText(input.surface_id),
    surface_label: normalizeText(input.surface_label),
    surface_category: normalizeText(input.surface_category),
    target_type: normalizeText(input.target_type),
    target_id: normalizeText(input.target_id),
    target_label: normalizeText(input.target_label),
    bridge_surface: normalizeText(
      input.bridge_surface ?? input.bridgeSurface ?? bridge.bridge_surface ?? bridge.bridgeSurface,
    ),
    handoff_id: normalizeText(
      input.handoff_id ?? input.handoffId ?? bridge.handoff_id ?? bridge.handoffId,
    ),
    checkout_token: normalizeText(
      input.checkout_token ?? input.checkoutToken ?? bridge.checkout_token ?? bridge.checkoutToken,
    ),
    checkout_key: normalizeText(
      input.checkout_key ?? input.checkoutKey ?? bridge.checkout_key ?? bridge.checkoutKey,
    ),
    checkout_id: normalizeText(
      input.checkout_id ?? input.checkoutId ?? bridge.checkout_id ?? bridge.checkoutId,
    ),
    cart_token: normalizeText(
      input.cart_token ?? input.cartToken ?? bridge.cart_token ?? bridge.cartToken,
    ),
    form_id: normalizeText(input.form_id ?? input.formId ?? bridge.form_id ?? bridge.formId),
    form_submission_id: normalizeText(
      input.form_submission_id ??
        input.formSubmissionId ??
        bridge.form_submission_id ??
        bridge.formSubmissionId,
    ),
    booking_id: normalizeText(
      input.booking_id ?? input.bookingId ?? bridge.booking_id ?? bridge.bookingId,
    ),
    booking_slot_id: normalizeText(
      input.booking_slot_id ??
        input.bookingSlotId ??
        bridge.booking_slot_id ??
        bridge.bookingSlotId,
    ),
    lead_external_id: normalizeText(
      input.lead_external_id ??
        input.leadExternalId ??
        bridge.lead_external_id ??
        bridge.leadExternalId,
    ),
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
  };
}

function buildRecordIngestEnvelope(
  ctx: RuntimeContextLike,
  config: WebJourneyRuntimeConfig,
  row: WebJourneyEventRecord,
): WebJourneyRecordIngestEnvelope {
  const binding = buildBinding(ctx, config);
  const senderId = row.browser_id ? `browser:${row.browser_id}` : `session:${row.session_id}`;
  const webEvent = { ...row };

  return {
    operation: "record.ingest",
    routing: {
      adapter: WEB_JOURNEY_PLATFORM,
      platform: WEB_JOURNEY_PLATFORM,
      connection_id: binding.connection_id,
      sender_id: senderId,
      ...(row.surface_label ?? row.target_label ? { sender_name: row.surface_label ?? row.target_label ?? undefined } : {}),
      receiver_id: binding.connection_id,
      receiver_name: config.site_origin,
      space_id: binding.web_installation_id,
      space_name: config.site_origin,
      container_kind: "group",
      container_id: binding.web_installation_id,
      container_name: config.site_origin,
      thread_id: row.session_id,
      metadata: {
        web_installation_id: binding.web_installation_id,
        event_id: row.event_id,
        event_name: row.event_name,
        session_id: row.session_id,
        host: row.host,
        page_path: row.page_path,
        consent_state: row.consent_state,
        bridge_surface: row.bridge_surface,
        handoff_id: row.handoff_id,
      },
    },
    payload: {
      external_record_id: `${binding.web_installation_id}:${row.event_id}`,
      timestamp: row.captured_at,
      content: eventSummary(row),
      content_type: "text",
      metadata: {
        row,
        web_event: webEvent,
      },
    },
  };
}

export const __test__ = {
  buildRecordIngestEnvelope,
  normalizeWebEventInput,
};

function readOptionalWebInstallationId(value: unknown): string | undefined {
  return asString(value);
}

function openDedupeDb(): DatabaseSync {
  const stateDir = requireAdapterStateDir();
  fs.mkdirSync(stateDir, { recursive: true });
  const dbPath = path.join(stateDir, "web-journey-dedupe.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec(DEDUPE_SCHEMA);
  return db;
}

function markEventSeen(
  ctx: AdapterContext,
  config: WebJourneyRuntimeConfig,
  row: WebJourneyEventRecord,
): boolean {
  const binding = buildBinding(ctx, config);
  const db = openDedupeDb();
  try {
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO web_journey_seen_events (
          connection_id,
          event_id,
          external_record_id,
          first_seen_at
        ) VALUES (?, ?, ?, ?)`,
      )
      .run(
        binding.connection_id,
        row.event_id,
        `${binding.web_installation_id}:${row.event_id}`,
        Date.now(),
      );
    return Number(result.changes ?? 0) === 0;
  } finally {
    db.close();
  }
}

async function emitCollectRecord(
  session: AdapterServeSession,
  ctx: AdapterContext,
  config: WebJourneyRuntimeConfig,
  payload: UnknownRecord,
): Promise<CollectResult> {
  const row = normalizeWebEventInput(payload, config.web_installation_id);
  const deduped = markEventSeen(ctx, config, row);
  if (deduped) {
    return { ok: true, event: row, deduped: true };
  }
  const envelope = buildRecordIngestEnvelope(ctx, config, row);
  await session.emitRecordIngest(envelope);
  return { ok: true, event: row, deduped: false };
}

export const webJourneyAdapter = defineAdapter({
  platform: WEB_JOURNEY_PLATFORM,
  name: "web-journey-adapter",
  version: "0.1.0",
  multi_account: true,
  credential_service: "web-journey",
  auth: {
    methods: [
      {
        id: "web_installation",
        type: "api_key",
        label: "Web installation",
        icon: "globe",
        service: "web-journey",
        fields: [
          {
            name: "web_installation_id",
            label: "Web installation ID",
            type: "text",
            required: true,
            placeholder: "web_installation_id",
          },
        ],
      },
    ],
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
    supports_media: false,
    supports_voice_notes: false,
  },
  connection: {
    connections: async (ctx) => [buildConnectionIdentity(ctx, readRuntimeConfig(ctx))],
    health: async (ctx) => buildHealth(ctx, readRuntimeConfig(ctx)),
  },
  serve: async (ctx, _req, session) => {
    const config = readRuntimeConfig(ctx);
    const binding = buildBinding(ctx, config);
    const registry = session.createEndpointRegistry();

    await registry.upsert({
      endpoint_id: binding.connection_id,
      display_name: config.display_name ?? config.web_installation_id,
      platform: WEB_JOURNEY_PLATFORM,
      caps: ["record.ingest"],
      commands: ["collect", "collect.batch"],
      permissions: {},
    });

    await session.serve({
      onInvoke: async (frame) => {
        if (frame.endpoint_id !== binding.connection_id) {
          return {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "unknown endpoint id for web-journey adapter",
            },
          };
        }

        try {
          switch (frame.command) {
            case "collect": {
              const payload = asRecord(frame.payload);
              const optionalInstallationId = readOptionalWebInstallationId(payload.web_installation_id);
              if (optionalInstallationId && optionalInstallationId !== config.web_installation_id) {
                throw new Error("web_installation_id does not match the bound connection");
              }
              const result = await emitCollectRecord(
                session,
                ctx,
                config,
                readWebEventInput(payload),
              );
              return { ok: true, payload: result };
            }
            case "collect.batch": {
              const payload = asRecord(frame.payload);
              const optionalInstallationId = readOptionalWebInstallationId(payload.web_installation_id);
              if (optionalInstallationId && optionalInstallationId !== config.web_installation_id) {
                throw new Error("web_installation_id does not match the bound connection");
              }
              const webEvents = readWebEventBatchInput(payload);
              const events: WebJourneyEventRecord[] = [];
              for (const webEvent of webEvents) {
                const row = normalizeWebEventInput(webEvent, config.web_installation_id);
                const deduped = markEventSeen(ctx, config, row);
                if (!deduped) {
                  const envelope = buildRecordIngestEnvelope(ctx, config, row);
                  await session.emitRecordIngest(envelope);
                }
                events.push(row);
              }
              const batch: CollectBatchResult = { ok: true, count: events.length, events };
              return { ok: true, payload: batch };
            }
            default:
              return {
                ok: false,
                error: {
                  code: "INVALID_REQUEST",
                  message: `unknown web-journey command: ${frame.command}`,
                },
              };
          }
        } catch (error) {
          return {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }
      },
    });
  },
});
