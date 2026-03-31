import { randomUUID } from "node:crypto";
import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";
import {
  buildWebsiteExternalRecordId,
  buildWebsiteRecordIngestEnvelope,
  websiteEventFromRuntimeRecord,
  WEBSITE_INPUT_RECORD_PLATFORM,
} from "./journal.ts";
import {
  findInstallationById,
  findInstallationBySenderEntityId,
  insertInstallation,
  insertToken,
  listInstallations,
  listTokens,
  normalizeEventInput,
  openWebsiteInputDb,
  type WebsiteEventRecord,
  updateInstallation,
  updateTokenRevocation,
} from "./store.ts";

const WEBSITE_INPUT_SENDER_SCOPES = [
  "core.apps.website-input.collect.write",
  "core.apps.website-input.collect.batch.write",
  "core.records.write",
  "core.records.read",
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  return trimmed;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
}

function asLimit(value: unknown, fallback = 100): number {
  const normalized = asOptionalNumber(value);
  return normalized ? Math.min(500, Math.max(1, normalized)) : fallback;
}

function unwrapPayload(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  const payload = asRecord(record.payload);
  return Object.keys(payload).length > 0 ? payload : record;
}

function asEvents(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is Record<string, unknown> => {
    return !!entry && typeof entry === "object" && !Array.isArray(entry);
  });
}

function requireCurrentEntityId(ctx: Parameters<NexAppMethodHandler>[0]): string {
  const entityId = String(ctx.user.userId ?? "").trim();
  if (!entityId) {
    throw new Error("authenticated entity id is required");
  }
  return entityId;
}

async function resolveRuntimeBaseUrl(
  ctx: Parameters<NexAppMethodHandler>[0],
  override: unknown,
): Promise<string> {
  const explicit = asOptionalString(override);
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const config = unwrapPayload(await ctx.nex.config.get({}));
  const runtime = asRecord(config.runtime);
  const port = typeof runtime.port === "number" && Number.isFinite(runtime.port) ? runtime.port : 18789;
  const tls = asRecord(runtime.tls);
  const protocol = tls.enabled === true ? "https" : "http";
  return `${protocol}://127.0.0.1:${port}`;
}

function buildCollectorEndpoints(baseUrl: string): {
  collect: string;
  collectBatch: string;
} {
  return {
    collect: `${baseUrl}/runtime/operations/website-input.collect`,
    collectBatch: `${baseUrl}/runtime/operations/website-input.collect.batch`,
  };
}

function buildInstallationLabel(params: {
  accountId: string;
  label: string | null;
}): string {
  if (params.label) {
    return params.label;
  }
  return `website-input:${params.accountId}:${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

function buildSenderEntityName(params: {
  installationId: string;
  label: string | null;
  siteOrigin: string | null;
}): string {
  const parts = [
    "website-input",
    params.label,
    params.siteOrigin,
    params.installationId,
  ].map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean);
  return parts.join(":");
}

async function createSenderEntity(
  ctx: Parameters<NexAppMethodHandler>[0],
  params: {
    installationId: string;
    label: string | null;
    siteOrigin: string | null;
  },
): Promise<string> {
  const created = unwrapPayload(
    await ctx.nex.entities.create({
      name: buildSenderEntityName(params),
      type: "website_installation",
      origin: "website-input",
      normalized: params.installationId,
    }),
  );
  const entity = asRecord(created.entity);
  const senderEntityId = asNonEmptyString(entity.id, "senderEntityId");
  return senderEntityId;
}

type InstallationRecord = NonNullable<ReturnType<typeof findInstallationById>>;
type TokenRecord = ReturnType<typeof listTokens>[number];

function installationView(record: InstallationRecord): Record<string, unknown> {
  return {
    id: record.id,
    accountId: record.accountId,
    label: record.label,
    siteOrigin: record.siteOrigin,
    status: record.status,
    senderEntityId: record.senderEntityId,
    createdByEntityId: record.createdByEntityId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    firstSeenAt: record.firstSeenAt,
    lastSeenAt: record.lastSeenAt,
    collectorBaseUrl: record.collectorBaseUrl,
    currentTokenId: record.currentTokenId,
    currentTokenCreatedAt: record.currentTokenCreatedAt,
    currentTokenExpiresAt: record.currentTokenExpiresAt,
    currentTokenRevokedAt: record.currentTokenRevokedAt,
    currentTokenLabel: record.currentTokenLabel,
    metadata: record.metadata,
    collectorEndpoints: buildCollectorEndpoints(record.collectorBaseUrl),
  };
}

function tokenView(record: TokenRecord): Record<string, unknown> {
  return {
    id: record.id,
    installationId: record.installationId,
    tokenId: record.tokenId,
    label: record.label,
    createdByEntityId: record.createdByEntityId,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    metadata: record.metadata,
  };
}

function eventView(record: WebsiteEventRecord): Record<string, unknown> {
  return {
    id: record.id,
    websiteInstallationId: record.websiteInstallationId,
    eventId: record.eventId,
    capturedAt: record.capturedAt,
    receivedAt: record.receivedAt,
    consentState: record.consentState,
    eventName: record.eventName,
    browserId: record.browserId,
    sessionId: record.sessionId,
    pageUrl: record.pageUrl,
    pagePath: record.pagePath,
    host: record.host,
    referrer: record.referrer,
    eventSourceUrl: record.eventSourceUrl,
    pageTitle: record.pageTitle,
    userAgent: record.userAgent,
    viewportWidth: record.viewportWidth,
    viewportHeight: record.viewportHeight,
    utmSource: record.utmSource,
    utmMedium: record.utmMedium,
    utmCampaign: record.utmCampaign,
    utmContent: record.utmContent,
    utmTerm: record.utmTerm,
    fbclid: record.fbclid,
    fbc: record.fbc,
    fbp: record.fbp,
    gclid: record.gclid,
    gbraid: record.gbraid,
    wbraid: record.wbraid,
    ttclid: record.ttclid,
    ttp: record.ttp,
    msclkid: record.msclkid,
    surfaceId: record.surfaceId,
    surfaceLabel: record.surfaceLabel,
    surfaceCategory: record.surfaceCategory,
    targetType: record.targetType,
    targetId: record.targetId,
    targetLabel: record.targetLabel,
    bridgeSurface: record.bridgeSurface,
    handoffId: record.handoffId,
    checkoutToken: record.checkoutToken,
    checkoutKey: record.checkoutKey,
    checkoutId: record.checkoutId,
    cartToken: record.cartToken,
    formId: record.formId,
    formSubmissionId: record.formSubmissionId,
    bookingId: record.bookingId,
    bookingSlotId: record.bookingSlotId,
    leadExternalId: record.leadExternalId,
    metadata: record.metadata,
  };
}

const createInstallation: NexAppMethodHandler = async (ctx) => {
  const params = asRecord(ctx.params);
  const accountId =
    String(ctx.account.accountId ?? ctx.user.accountId ?? "").trim() || "local";
  const createdByEntityId = requireCurrentEntityId(ctx);
  const label = asOptionalString(params.label);
  const siteOrigin = asOptionalString(params.siteOrigin);
  const collectorBaseUrl = await resolveRuntimeBaseUrl(ctx, params.collectorBaseUrl);
  const expiresAt = asOptionalNumber(params.expiresAt);
  const metadata = params.metadata && typeof params.metadata === "object" && !Array.isArray(params.metadata)
    ? (params.metadata as Record<string, unknown>)
    : null;
  const installationId = randomUUID();
  const now = Date.now();
  const db = openWebsiteInputDb(ctx.app.dataDir);
  try {
    const senderEntityId = await createSenderEntity(ctx, {
      installationId,
      label,
      siteOrigin,
    });
    const credential = await ctx.nex.auth.tokens.create({
      entityId: senderEntityId,
      role: "operator",
      scopes: [...WEBSITE_INPUT_SENDER_SCOPES],
      label: buildInstallationLabel({ accountId, label }),
      expiresAt: expiresAt ?? undefined,
    });
    const credentialPayload = unwrapPayload(credential);
    const credentialRecord = asRecord(credentialPayload.credential);
    const token = String(credentialPayload.token ?? "");
    const tokenId = String(credentialRecord.id ?? "");
    const installation = insertInstallation(db, {
      id: installationId,
      accountId,
      label,
      siteOrigin,
      status: "active",
      senderEntityId,
      createdByEntityId,
      createdAt: now,
      updatedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      collectorBaseUrl,
      currentTokenId: tokenId,
      currentTokenCreatedAt: typeof credentialRecord.createdAt === "number" ? credentialRecord.createdAt : now,
      currentTokenExpiresAt:
        typeof credentialRecord.expiresAt === "number" ? credentialRecord.expiresAt : expiresAt,
      currentTokenRevokedAt:
        typeof credentialRecord.revokedAt === "number" ? credentialRecord.revokedAt : null,
      currentTokenLabel: typeof credentialRecord.label === "string" ? credentialRecord.label : null,
      metadata: {
        ...(metadata ?? {}),
        senderEntityId,
      },
    });
    insertToken(db, {
      id: randomUUID(),
      installationId: installation.id,
      tokenId,
      label: typeof credentialRecord.label === "string" ? credentialRecord.label : null,
      createdByEntityId,
      createdAt: typeof credentialRecord.createdAt === "number" ? credentialRecord.createdAt : now,
      lastUsedAt: typeof credentialRecord.lastUsedAt === "number" ? credentialRecord.lastUsedAt : null,
      expiresAt: typeof credentialRecord.expiresAt === "number" ? credentialRecord.expiresAt : expiresAt,
      revokedAt: typeof credentialRecord.revokedAt === "number" ? credentialRecord.revokedAt : null,
      metadata: {
        collectorBaseUrl,
        siteOrigin,
        senderEntityId,
        ...(metadata ?? {}),
      },
    });
    return {
      ok: true,
      installation: installationView(installation),
      token,
      collector: {
        baseUrl: collectorBaseUrl,
        ...buildCollectorEndpoints(collectorBaseUrl),
      },
    };
  } finally {
    db.close();
  }
};

const getInstallation: NexAppMethodHandler = async (ctx) => {
  const params = asRecord(ctx.params);
  const websiteInstallationId = asNonEmptyString(params.websiteInstallationId, "websiteInstallationId");
  const db = openWebsiteInputDb(ctx.app.dataDir);
  try {
    const installation = findInstallationById(db, websiteInstallationId);
    if (!installation) {
      throw new Error(`unknown website installation id: ${websiteInstallationId}`);
    }
    return {
      ok: true,
      installation: installationView(installation),
      tokens: listTokens(db, { installationId: installation.id, includeRevoked: true, limit: 50 }).map(tokenView),
    };
  } finally {
    db.close();
  }
};

const listInstallationsHandler: NexAppMethodHandler = async (ctx) => {
  const params = asRecord(ctx.params);
  const db = openWebsiteInputDb(ctx.app.dataDir);
  try {
    return {
      ok: true,
      installations: listInstallations(db, {
        accountId: ctx.account.accountId,
        status:
          params.status === "active" ||
          params.status === "paused" ||
          params.status === "revoked" ||
          params.status === "error"
            ? params.status
            : undefined,
        limit: asLimit(params.limit, 100),
      }).map(installationView),
    };
  } finally {
    db.close();
  }
};

const rotateInstallation: NexAppMethodHandler = async (ctx) => {
  const params = asRecord(ctx.params);
  const websiteInstallationId = asNonEmptyString(params.websiteInstallationId, "websiteInstallationId");
  const label = asOptionalString(params.label);
  const expiresAt = asOptionalNumber(params.expiresAt);
  const collectorBaseUrlOverride = params.collectorBaseUrl;
  const db = openWebsiteInputDb(ctx.app.dataDir);
  try {
    const installation = findInstallationById(db, websiteInstallationId);
    if (!installation) {
      throw new Error(`unknown website installation id: ${websiteInstallationId}`);
    }
    const senderEntityId = installation.senderEntityId ?? await createSenderEntity(ctx, {
      installationId: installation.id,
      label: installation.label,
      siteOrigin: installation.siteOrigin,
    });
    const collectorBaseUrl = await resolveRuntimeBaseUrl(ctx, collectorBaseUrlOverride ?? installation.collectorBaseUrl);
    const oldTokenId = installation.currentTokenId;
    if (oldTokenId) {
      await ctx.nex.auth.tokens.revoke({ id: oldTokenId });
      updateTokenRevocation(db, oldTokenId, Date.now());
    }
    const credential = await ctx.nex.auth.tokens.create({
      entityId: senderEntityId,
      role: "operator",
      scopes: [...WEBSITE_INPUT_SENDER_SCOPES],
      label: label ?? installation.label ?? `website-input:${installation.id}`,
      expiresAt: expiresAt ?? undefined,
    });
    const credentialPayload = unwrapPayload(credential);
    const credentialRecord = asRecord(credentialPayload.credential);
    const token = String(credentialPayload.token ?? "");
    const tokenId = String(credentialRecord.id ?? "");
    const tokenRow = insertToken(db, {
      id: randomUUID(),
      installationId: installation.id,
      tokenId,
      label: typeof credentialRecord.label === "string" ? credentialRecord.label : null,
      createdByEntityId: requireCurrentEntityId(ctx),
      createdAt: typeof credentialRecord.createdAt === "number" ? credentialRecord.createdAt : Date.now(),
      lastUsedAt: typeof credentialRecord.lastUsedAt === "number" ? credentialRecord.lastUsedAt : null,
      expiresAt: typeof credentialRecord.expiresAt === "number" ? credentialRecord.expiresAt : expiresAt,
      revokedAt: typeof credentialRecord.revokedAt === "number" ? credentialRecord.revokedAt : null,
      metadata: {
        collectorBaseUrl,
        senderEntityId,
      },
    });
    updateInstallation(db, installation.id, {
      senderEntityId,
      collectorBaseUrl,
      currentTokenId: tokenId,
      currentTokenCreatedAt: tokenRow.createdAt,
      currentTokenExpiresAt: tokenRow.expiresAt,
      currentTokenRevokedAt: tokenRow.revokedAt,
      currentTokenLabel: tokenRow.label,
      lastSeenAt: Date.now(),
      metadata: {
        ...(installation.metadata ?? {}),
        collectorBaseUrl,
        senderEntityId,
      },
    });
    const refreshed = findInstallationById(db, installation.id);
    if (!refreshed) {
      throw new Error("installation refresh failed");
    }
    return {
      ok: true,
      installation: installationView(refreshed),
      token,
      collector: {
        baseUrl: collectorBaseUrl,
        ...buildCollectorEndpoints(collectorBaseUrl),
      },
    };
  } finally {
    db.close();
  }
};

function resolveInstallationFromCollectContext(
  db: ReturnType<typeof openWebsiteInputDb>,
  ctx: Parameters<NexAppMethodHandler>[0],
  params: Record<string, unknown>,
  eventInput?: Record<string, unknown>,
): InstallationRecord {
  const explicitInstallationId =
    asOptionalString(params.websiteInstallationId) ??
    asOptionalString(eventInput?.websiteInstallationId) ??
    asOptionalString(eventInput?.website_installation_id);
  const callerEntityId = String(ctx.user.userId ?? "").trim();
  const boundInstallation = callerEntityId ? findInstallationBySenderEntityId(db, callerEntityId) : null;

  if (boundInstallation) {
    if (explicitInstallationId && explicitInstallationId !== boundInstallation.id) {
      throw new Error("website installation does not match sender token binding");
    }
    return boundInstallation;
  }

  throw new Error(
    explicitInstallationId
      ? "sender token is not bound to the requested website installation; rotate the installation to issue a bound sender token"
      : "sender token is not bound to any website installation; rotate the installation to issue a bound sender token",
  );
}

function assertEventInstallationMatch(
  eventInput: Record<string, unknown>,
  websiteInstallationId: string,
): void {
  const suppliedInstallationId =
    asOptionalString(eventInput.websiteInstallationId) ??
    asOptionalString(eventInput.website_installation_id);
  if (suppliedInstallationId && suppliedInstallationId !== websiteInstallationId) {
    throw new Error("event website installation id does not match collector installation");
  }
}

async function lookupRuntimeWebsiteEvent(
  ctx: Parameters<NexAppMethodHandler>[0],
  websiteInstallationId: string,
  eventId: string,
): Promise<WebsiteEventRecord | null> {
  try {
    const response = unwrapPayload(
      await ctx.nex.records.get({
        id: buildWebsiteExternalRecordId(websiteInstallationId, eventId),
      }),
    );
    return websiteEventFromRuntimeRecord(response.record);
  } catch {
    return null;
  }
}

async function collectOneResolved(
  ctx: Parameters<NexAppMethodHandler>[0],
  installation: InstallationRecord,
  eventInput: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  assertEventInstallationMatch(eventInput, installation.id);
  const event = normalizeEventInput({
    ...eventInput,
    websiteInstallationId: installation.id,
  });
  const existing = await lookupRuntimeWebsiteEvent(ctx, installation.id, event.eventId);
  await ctx.nex.record.ingest(buildWebsiteRecordIngestEnvelope(event));
  const saved = await lookupRuntimeWebsiteEvent(ctx, installation.id, event.eventId);
  if (!saved) {
    throw new Error("ingested website event could not be reloaded");
  }

  const db = openWebsiteInputDb(ctx.app.dataDir);
  try {
    updateInstallation(db, installation.id, {
      lastSeenAt: Math.max(installation.lastSeenAt, saved.receivedAt),
      metadata: installation.metadata,
    });
  } finally {
    db.close();
  }

  return {
    ok: true,
    event: eventView(saved),
    deduped: existing !== null,
  };
}

const collect: NexAppMethodHandler = async (ctx) => {
  const params = asRecord(ctx.params);
  const event = asRecord(params.event);
  const db = openWebsiteInputDb(ctx.app.dataDir);
  try {
    const installation = resolveInstallationFromCollectContext(db, ctx, params, event);
    return await collectOneResolved(ctx, installation, event);
  } finally {
    db.close();
  }
};

const collectBatch: NexAppMethodHandler = async (ctx) => {
  const params = asRecord(ctx.params);
  const events = asEvents(params.events);
  if (events.length === 0) {
    return { ok: true, count: 0, events: [] };
  }
  const db = openWebsiteInputDb(ctx.app.dataDir);
  try {
    const installation = resolveInstallationFromCollectContext(db, ctx, params, events[0]);
    const savedEvents: Record<string, unknown>[] = [];
    for (const event of events) {
      const saved = await collectOneResolved(ctx, installation, event);
      savedEvents.push(asRecord(saved.event));
    }
    return {
      ok: true,
      count: savedEvents.length,
      events: savedEvents,
    };
  } finally {
    db.close();
  }
};

const listEventsHandler: NexAppMethodHandler = async (ctx) => {
  const params = asRecord(ctx.params);
  const websiteInstallationId = asNonEmptyString(params.websiteInstallationId, "websiteInstallationId");
  const sessionId = asOptionalString(params.sessionId) ?? undefined;
  const eventName = asOptionalString(params.eventName);
  const db = openWebsiteInputDb(ctx.app.dataDir);
  try {
    const installation = findInstallationById(db, websiteInstallationId);
    if (!installation) {
      throw new Error(`unknown website installation id: ${websiteInstallationId}`);
    }
    const payload = unwrapPayload(
      await ctx.nex.records.list({
        platform: WEBSITE_INPUT_RECORD_PLATFORM,
        connection_id: installation.id,
        ...(sessionId ? { thread_id: sessionId } : {}),
        limit: asLimit(params.limit, 100),
      }),
    );
    const records = Array.isArray(payload.records)
      ? payload.records.filter((entry): entry is Record<string, unknown> => {
          return !!entry && typeof entry === "object" && !Array.isArray(entry);
        })
      : [];
    const events = records
      .map((record) => websiteEventFromRuntimeRecord(record))
      .filter((entry): entry is WebsiteEventRecord => {
        return (
          entry !== null &&
          entry.websiteInstallationId === installation.id &&
          (!eventName || entry.eventName === eventName)
        );
      })
      .map(eventView);
    return {
      ok: true,
      events,
    };
  } finally {
    db.close();
  }
};

const getEventHandler: NexAppMethodHandler = async (ctx) => {
  const params = asRecord(ctx.params);
  const websiteInstallationId = asNonEmptyString(params.websiteInstallationId, "websiteInstallationId");
  const eventId = asNonEmptyString(params.eventId, "eventId");
  const db = openWebsiteInputDb(ctx.app.dataDir);
  try {
    const installation = findInstallationById(db, websiteInstallationId);
    if (!installation) {
      throw new Error(`unknown website installation id: ${websiteInstallationId}`);
    }
    const event = await lookupRuntimeWebsiteEvent(ctx, installation.id, eventId);
    if (!event || event.websiteInstallationId !== installation.id) {
      throw new Error(`unknown event id for installation: ${eventId}`);
    }
    return {
      ok: true,
      event: eventView(event),
    };
  } finally {
    db.close();
  }
};

export const handlers: Record<string, NexAppMethodHandler> = {
  "website-input.installations.create": createInstallation,
  "website-input.installations.get": getInstallation,
  "website-input.installations.list": listInstallationsHandler,
  "website-input.installations.rotate": rotateInstallation,
  "website-input.collect": collect,
  "website-input.collect.batch": collectBatch,
  "website-input.events.list": listEventsHandler,
  "website-input.events.get": getEventHandler,
};
