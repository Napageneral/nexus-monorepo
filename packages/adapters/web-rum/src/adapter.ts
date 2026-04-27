import {
  type AdapterContext,
  type AdapterConnectionIdentity,
  type AdapterHealth,
  type AdapterServeSession,
  defineAdapter,
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

type WebRumRuntimeConfig = {
  web_installation_id: string;
  display_name?: string;
  last_event_at?: number;
  metadata?: UnknownRecord;
};

type WebRumEventRecord = {
  web_installation_id: string;
  event_id: string;
  captured_at: number;
  received_at: number;
  event_name: string;
  page_url: string;
  page_path: string;
  host: string;
  browser_id: string | null;
  session_id: string;
  user_agent: string | null;
  viewport_width: number | null;
  viewport_height: number | null;
  navigation_type: string | null;
  effective_type: string | null;
  rtt_ms: number | null;
  downlink_mbps: number | null;
  page_load_ms: number | null;
  dom_content_loaded_ms: number | null;
  lcp_ms: number | null;
  cls: number | null;
  inp_ms: number | null;
  long_tasks_ms: number | null;
  error_count: number | null;
  metadata: UnknownRecord | null;
};

type RumRecordIngestEnvelope = {
  operation: "record.ingest";
  routing: {
    adapter: "web-rum";
    platform: "web-rum";
    connection_id: string;
    sender_id: string;
    receiver_id: string;
    container_kind: "group";
    container_id: string;
    thread_id: string;
    metadata: UnknownRecord;
  };
  payload: {
    external_record_id: string;
    timestamp: number;
    content: string;
    content_type: "text";
    metadata: {
      row: WebRumEventRecord;
      rum_event: WebRumEventRecord;
    };
  };
};

type CaptureResult = {
  ok: true;
  event: WebRumEventRecord;
};

type CaptureBatchResult = {
  ok: true;
  count: number;
  events: WebRumEventRecord[];
};

const WEB_RUM_PLATFORM = "web-rum";

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

function readRuntimeConfig(ctx: RuntimeContextLike): WebRumRuntimeConfig {
  const runtime = ctx.runtime;
  const rawConfig = asRecord(runtime?.config);
  const webInstallationId = asString(rawConfig.web_installation_id);
  if (!webInstallationId) {
    throw new Error("runtime.config.web_installation_id is required");
  }
  return {
    web_installation_id: webInstallationId,
    display_name: asString(rawConfig.display_name),
    last_event_at: normalizeNumber(rawConfig.last_event_at) ?? undefined,
    metadata: asRecord(rawConfig.metadata),
  };
}

function buildConnectionIdentity(
  ctx: RuntimeContextLike,
  config: WebRumRuntimeConfig,
): AdapterConnectionIdentity {
  const connectionId = ctx.runtime?.connection_id?.trim() ?? config.web_installation_id;
  return {
    id: connectionId,
    display_name: config.display_name ?? config.web_installation_id,
    ...(ctx.runtime?.credential?.ref ? { credential_ref: ctx.runtime.credential.ref } : {}),
    status: "ready",
  };
}

function buildHealth(ctx: RuntimeContextLike, config: WebRumRuntimeConfig): AdapterHealth {
  const connectionId = ctx.runtime?.connection_id?.trim() ?? config.web_installation_id;
  return {
    connected: true,
    connection_id: connectionId,
    ...(config.last_event_at ? { last_event_at: config.last_event_at } : {}),
    details: {
      adapter: WEB_RUM_PLATFORM,
      web_installation_id: config.web_installation_id,
      connection_id: connectionId,
      display_name: config.display_name,
      ...(config.metadata ?? {}),
    },
  };
}

function readRumEvent(value: unknown): UnknownRecord {
  const record = asRecord(value);
  const rumEvent = asRecord(record.rum_event);
  if (Object.keys(rumEvent).length === 0) {
    throw new Error("payload.rum_event is required");
  }
  return rumEvent;
}

function readRumEventBatch(value: unknown): UnknownRecord[] {
  const record = asRecord(value);
  const rumEvents = record.rum_events;
  if (!Array.isArray(rumEvents)) {
    throw new Error("payload.rum_events is required");
  }
  return rumEvents.filter((entry): entry is UnknownRecord => !!entry && typeof entry === "object" && !Array.isArray(entry));
}

function normalizeRumEvent(input: UnknownRecord, fallbackInstallationId: string): WebRumEventRecord {
  const explicitInstallationId = asString(input.web_installation_id);
  const webInstallationId = explicitInstallationId ?? fallbackInstallationId;
  if (!webInstallationId) {
    throw new Error("web_installation_id is required");
  }
  if (explicitInstallationId && explicitInstallationId !== fallbackInstallationId) {
    throw new Error("web_installation_id does not match the bound connection");
  }
  return {
    web_installation_id: webInstallationId,
    event_id: normalizeRequiredText(input.event_id, "event_id"),
    captured_at: normalizeNumber(input.captured_at) ?? Date.now(),
    received_at: normalizeNumber(input.received_at) ?? Date.now(),
    event_name: normalizeRequiredText(input.event_name, "event_name"),
    page_url: normalizeRequiredText(input.page_url, "page_url"),
    page_path: normalizeRequiredText(input.page_path, "page_path"),
    host: normalizeRequiredText(input.host, "host"),
    browser_id: normalizeText(input.browser_id),
    session_id: normalizeRequiredText(input.session_id, "session_id"),
    user_agent: normalizeText(input.user_agent),
    viewport_width: normalizeNumber(input.viewport_width),
    viewport_height: normalizeNumber(input.viewport_height),
    navigation_type: normalizeText(input.navigation_type),
    effective_type: normalizeText(input.effective_type),
    rtt_ms: normalizeNumber(input.rtt_ms),
    downlink_mbps: normalizeNumber(input.downlink_mbps),
    page_load_ms: normalizeNumber(input.page_load_ms),
    dom_content_loaded_ms: normalizeNumber(input.dom_content_loaded_ms),
    lcp_ms: normalizeNumber(input.lcp_ms),
    cls: normalizeNumber(input.cls),
    inp_ms: normalizeNumber(input.inp_ms),
    long_tasks_ms: normalizeNumber(input.long_tasks_ms),
    error_count: normalizeNumber(input.error_count),
    metadata: Object.keys(asRecord(input.metadata)).length > 0 ? asRecord(input.metadata) : null,
  };
}

function buildEnvelope(
  ctx: RuntimeContextLike,
  config: WebRumRuntimeConfig,
  row: WebRumEventRecord,
): RumRecordIngestEnvelope {
  const connectionId = ctx.runtime?.connection_id?.trim() ?? config.web_installation_id;
  return {
    operation: "record.ingest",
    routing: {
      adapter: WEB_RUM_PLATFORM,
      platform: WEB_RUM_PLATFORM,
      connection_id: connectionId,
      sender_id: row.browser_id ? `browser:${row.browser_id}` : `session:${row.session_id}`,
      receiver_id: config.web_installation_id,
      container_kind: "group",
      container_id: config.web_installation_id,
      thread_id: row.session_id,
      metadata: {
        web_installation_id: config.web_installation_id,
        event_id: row.event_id,
        event_name: row.event_name,
        page_path: row.page_path,
      },
    },
    payload: {
      external_record_id: `${config.web_installation_id}:${row.event_id}`,
      timestamp: row.captured_at,
      content: `${row.event_name} ${row.page_path}`,
      content_type: "text",
      metadata: {
        row,
        rum_event: row,
      },
    },
  };
}

async function emitCapture(
  session: AdapterServeSession,
  ctx: AdapterContext,
  config: WebRumRuntimeConfig,
  payload: UnknownRecord,
): Promise<CaptureResult> {
  const row = normalizeRumEvent(payload, config.web_installation_id);
  await session.emitRecordIngest(buildEnvelope(ctx, config, row));
  return { ok: true, event: row };
}

export const webRumAdapter = defineAdapter({
  platform: WEB_RUM_PLATFORM,
  name: "web-rum-adapter",
  version: "0.1.0",
  multi_account: true,
  credential_service: "web-rum",
  auth: {
    methods: [
      {
        id: "web_installation",
        type: "api_key",
        label: "Web installation",
        icon: "activity",
        service: "web-rum",
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
    const connectionId = ctx.runtime?.connection_id?.trim() ?? config.web_installation_id;
    const registry = session.createEndpointRegistry();

    await registry.upsert({
      endpoint_id: connectionId,
      display_name: config.display_name ?? config.web_installation_id,
      platform: WEB_RUM_PLATFORM,
      caps: ["record.ingest"],
      commands: ["capture", "capture.batch"],
      permissions: {},
    });

    await session.serve({
      onInvoke: async (frame) => {
        if (frame.endpoint_id !== connectionId) {
          return {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: "unknown endpoint id for web-rum adapter",
            },
          };
        }

        try {
          switch (frame.command) {
            case "capture": {
              const payload = asRecord(frame.payload);
              const optionalInstallationId = asString(payload.web_installation_id);
              if (optionalInstallationId && optionalInstallationId !== config.web_installation_id) {
                throw new Error("web_installation_id does not match the bound connection");
              }
              const result = await emitCapture(session, ctx, config, readRumEvent(payload));
              return { ok: true, payload: result };
            }
            case "capture.batch": {
              const payload = asRecord(frame.payload);
              const optionalInstallationId = asString(payload.web_installation_id);
              if (optionalInstallationId && optionalInstallationId !== config.web_installation_id) {
                throw new Error("web_installation_id does not match the bound connection");
              }
              const rumEvents = readRumEventBatch(payload);
              const events: WebRumEventRecord[] = [];
              for (const rumEvent of rumEvents) {
                const row = normalizeRumEvent(rumEvent, config.web_installation_id);
                await session.emitRecordIngest(buildEnvelope(ctx, config, row));
                events.push(row);
              }
              const batch: CaptureBatchResult = { ok: true, count: events.length, events };
              return { ok: true, payload: batch };
            }
            default:
              return {
                ok: false,
                error: {
                  code: "INVALID_REQUEST",
                  message: `unknown web-rum command: ${frame.command}`,
                },
              };
          }
        } catch (error) {
          return {
            ok: false,
            error: {
              code: "INVALID_REQUEST",
              message: error instanceof Error ? error.message : "failed to capture web-rum event",
            },
          };
        }
      },
    });
  },
});
