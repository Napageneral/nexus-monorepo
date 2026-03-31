import {
  normalizeEventInput,
  type WebsiteEventRecord,
} from "./store.ts";

export const WEBSITE_INPUT_RECORD_PLATFORM = "website-input";

type RuntimeRow = Record<string, unknown>;

export type WebsiteRecordIngestEnvelope = {
  routing: {
    adapter: string;
    platform: string;
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
    metadata: Record<string, unknown>;
  };
  payload: {
    external_record_id: string;
    timestamp: number;
    content: string;
    content_type: "text";
    metadata: Record<string, unknown>;
  };
};

function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RuntimeRow) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null;
}

function eventSummary(event: Omit<WebsiteEventRecord, "id">): string {
  const parts = [
    event.eventName,
    event.pagePath,
    event.surfaceId,
    event.surfaceLabel,
    event.targetId,
    event.targetLabel,
  ].map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean);
  return parts.join(" ");
}

export function buildWebsiteExternalRecordId(
  websiteInstallationId: string,
  eventId: string,
): string {
  return `${websiteInstallationId}:${eventId}`;
}

export function buildWebsiteRecordIngestEnvelope(
  event: Omit<WebsiteEventRecord, "id">,
): WebsiteRecordIngestEnvelope {
  return {
    routing: {
      adapter: WEBSITE_INPUT_RECORD_PLATFORM,
      platform: WEBSITE_INPUT_RECORD_PLATFORM,
      connection_id: event.websiteInstallationId,
      sender_id: event.browserId ? `browser:${event.browserId}` : `session:${event.sessionId}`,
      sender_name: event.surfaceLabel ?? event.targetLabel ?? undefined,
      receiver_id: event.websiteInstallationId,
      receiver_name: event.host,
      space_id: event.host,
      space_name: event.host,
      container_kind: "group",
      container_id: event.host,
      container_name: event.host,
      thread_id: event.sessionId,
      metadata: {
        website_installation_id: event.websiteInstallationId,
        event_id: event.eventId,
        event_name: event.eventName,
        session_id: event.sessionId,
        host: event.host,
        page_path: event.pagePath,
        consent_state: event.consentState,
        bridge_surface: event.bridgeSurface,
        handoff_id: event.handoffId,
      },
    },
    payload: {
      external_record_id: buildWebsiteExternalRecordId(event.websiteInstallationId, event.eventId),
      timestamp: event.capturedAt,
      content: eventSummary(event),
      content_type: "text",
      metadata: {
        website_installation_id: event.websiteInstallationId,
        event_id: event.eventId,
        event_name: event.eventName,
        session_id: event.sessionId,
        browser_id: event.browserId,
        host: event.host,
        page_path: event.pagePath,
        website_event: event,
      },
    },
  };
}

export function websiteEventFromRuntimeRecord(value: unknown): WebsiteEventRecord | null {
  const row = asRecord(value);
  const metadata = asRecord(row.metadata);
  const embedded = asRecord(metadata.website_event);
  const websiteInstallationId =
    asString(metadata.website_installation_id) ||
    asString(embedded.websiteInstallationId) ||
    asString(embedded.website_installation_id);

  if (!websiteInstallationId) {
    return null;
  }

  const source = Object.keys(embedded).length > 0 ? embedded : metadata;

  try {
    const normalized = normalizeEventInput({
      ...source,
      websiteInstallationId,
      receivedAt: asNumber(row.received_at) ?? undefined,
      capturedAt: asNumber(row.timestamp) ?? undefined,
    });
    return {
      id:
        asString(row.id) ||
        asString(row.record_id) ||
        buildWebsiteExternalRecordId(websiteInstallationId, normalized.eventId),
      ...normalized,
    };
  } catch {
    return null;
  }
}
