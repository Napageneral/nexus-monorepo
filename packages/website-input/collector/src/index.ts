import { isCanonicalEventName, type CollectorBatchRequest, type WebsiteEvent } from "@nexus-project/website-input-core";

export interface RecordIngestEnvelope {
  routing: {
    adapter: string;
    platform: string;
    connection_id: string;
    sender_id: string;
    sender_name?: string;
    receiver_id: string;
    receiver_name?: string;
    container_kind: "direct" | "group";
    container_id: string;
    container_name?: string;
    thread_id?: string;
    metadata?: Record<string, unknown>;
  };
  payload: {
    external_record_id: string;
    timestamp: number;
    content: string;
    content_type: "text";
    metadata: Record<string, unknown>;
  };
}

export interface AcceptedWebsiteEvent {
  website_installation_id: string;
  received_at: string;
  dedupe_key: string;
  event: WebsiteEvent;
  record: RecordIngestEnvelope;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function eventSummary(event: WebsiteEvent): string {
  return (
    event.surface_label ||
    event.target_label ||
    event.target_id ||
    event.target_type ||
    event.event_name
  );
}

export function validateWebsiteEvent(input: unknown): { ok: true; event: WebsiteEvent } | { ok: false; errors: string[] } {
  const record = asRecord(input);
  if (!record) {
    return { ok: false, errors: ["event must be an object"] };
  }

  const errors: string[] = [];
  const eventName = asString(record.event_name);
  if (!eventName || !isCanonicalEventName(eventName)) {
    errors.push("event_name must be one canonical website event");
  }
  if (!asString(record.event_id)) {
    errors.push("event_id is required");
  }
  if (!asString(record.captured_at)) {
    errors.push("captured_at is required");
  }
  if (!asString(record.session_id)) {
    errors.push("session_id is required");
  }
  if (!asString(record.page_url)) {
    errors.push("page_url is required");
  }
  if (!asString(record.page_path)) {
    errors.push("page_path is required");
  }
  if (!asString(record.host)) {
    errors.push("host is required");
  }
  if (!["granted", "denied", "unknown"].includes(asString(record.consent_state) ?? "")) {
    errors.push("consent_state must be granted, denied, or unknown");
  }
  if ("viewport_width" in record && record.viewport_width !== undefined && asNumber(record.viewport_width) === undefined) {
    errors.push("viewport_width must be a number when present");
  }
  if ("viewport_height" in record && record.viewport_height !== undefined && asNumber(record.viewport_height) === undefined) {
    errors.push("viewport_height must be a number when present");
  }
  if ("quantity" in record && record.quantity !== undefined && asNumber(record.quantity) === undefined) {
    errors.push("quantity must be a number when present");
  }
  if (errors.length) {
    return { ok: false, errors };
  }

  return { ok: true, event: record as unknown as WebsiteEvent };
}

export function validateCollectorBatch(
  input: unknown,
): { ok: true; batch: CollectorBatchRequest } | { ok: false; errors: string[] } {
  const record = asRecord(input);
  if (!record) {
    return { ok: false, errors: ["request body must be an object"] };
  }
  const websiteInstallationId = asString(record.website_installation_id);
  if (!websiteInstallationId) {
    return { ok: false, errors: ["website_installation_id is required"] };
  }
  const events = Array.isArray(record.events) ? record.events : [];
  if (!events.length) {
    return { ok: false, errors: ["events must contain at least one event"] };
  }
  const errors: string[] = [];
  const normalized: WebsiteEvent[] = [];
  for (const candidate of events) {
    const validated = validateWebsiteEvent(candidate);
    if (!validated.ok) {
      errors.push(...validated.errors);
      continue;
    }
    normalized.push(validated.event);
  }
  if (errors.length) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    batch: {
      website_installation_id: websiteInstallationId,
      events: normalized,
    },
  };
}

export function buildWebsiteRecordIngestEnvelope(
  event: WebsiteEvent,
  websiteInstallationId: string,
): RecordIngestEnvelope {
  const timestamp = Number.isFinite(Date.parse(event.captured_at))
    ? Date.parse(event.captured_at)
    : Date.now();

  return {
    routing: {
      adapter: "website-input",
      platform: "website-input",
      connection_id: websiteInstallationId,
      sender_id: event.browser_id || event.session_id,
      sender_name: event.surface_label || event.target_label,
      receiver_id: websiteInstallationId,
      receiver_name: event.host,
      container_kind: "group",
      container_id: event.host,
      container_name: event.host,
      thread_id: event.session_id,
      metadata: {
        website_installation_id: websiteInstallationId,
        event_name: event.event_name,
        page_path: event.page_path,
        host: event.host,
        consent_state: event.consent_state,
        bridge_surface: event.bridge_surface,
      },
    },
    payload: {
      external_record_id: `${websiteInstallationId}:${event.event_id}`,
      timestamp,
      content: eventSummary(event),
      content_type: "text",
      metadata: {
        website_event: event,
      },
    },
  };
}

export async function acceptWebsiteEventBatch(
  input: unknown,
  options?: {
    now?: () => Date;
    ingest?: (record: RecordIngestEnvelope) => Promise<void> | void;
  },
): Promise<AcceptedWebsiteEvent[]> {
  const validated = validateCollectorBatch(input);
  if (!validated.ok) {
    throw new Error(validated.errors.join("; "));
  }
  const now = (options?.now ?? (() => new Date()))().toISOString();
  const accepted = validated.batch.events.map((event) => {
    const dedupeKey = `${validated.batch.website_installation_id}:${event.event_id}`;
    const record = buildWebsiteRecordIngestEnvelope(
      event,
      validated.batch.website_installation_id,
    );
    return {
      website_installation_id: validated.batch.website_installation_id,
      received_at: now,
      dedupe_key: dedupeKey,
      event,
      record,
    };
  });

  if (options?.ingest) {
    for (const item of accepted) {
      await options.ingest(item.record);
    }
  }
  return accepted;
}
