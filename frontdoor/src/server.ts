import { randomUUID, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { URL } from "node:url";
import httpProxy from "http-proxy";
import { createCheckoutSession, createCreditDepositSession, verifyWebhookAndParseEvent, type BillingWebhookEvent } from "./billing.js";
import { loadConfig, resolveProjectRoot } from "./config.js";
import { randomToken, createPasswordHash } from "./crypto.js";
import {
  AwsEc2Provider,
  HetznerProvider,
  getServerPlanMonthlyCostCents,
  renderCloudInitScript,
  type CloudProvider,
} from "./cloud-provider.js";
import {
  installPackageViaRuntimeHttp,
  installPackageViaSSH,
  uninstallPackageViaRuntimeHttp,
  uninstallPackageViaSSH,
  upgradePackageViaRuntimeHttp,
  upgradePackageViaSSH,
} from "./ssh-helper.js";
import { createMcpServer, type McpContext } from "./mcp-server.js";
import { OidcFlowManager, type OidcClaims } from "./oidc-auth.js";
import { SlidingWindowRateLimiter } from "./rate-limit.js";
import { mintRuntimeAccessToken, normalizeRuntimeScopes, resolveRuntimeEntityId } from "./runtime-token.js";
import { SessionStore } from "./session-store.js";
import { TenantAutoProvisioner } from "./tenant-autoprovision.js";
import { syncProductFromManifest } from "./product-sync.js";
import {
  FrontdoorStore,
  type FrontdoorPackageKind,
  type PlatformManagedConnectionProfileRecord,
  type ProductControlPlaneRouteRecord,
  type ServerClass,
  type ServerDeploymentClass,
  type ServerRecord,
  type ServerRecoveryPointRecord,
  type ServerAppInstallRecord,
  type AccountMembershipView,
  type AccountRecord,
  type AccountMemberView,
  type AccountInvoiceSummary,
  type FrontdoorUserRecord,
  type ServerStatus,
  serverToTenantConfig,
  getServerRuntimeUrl,
  getServerRuntimeWsUrl,
  getServerPublicUrl,
} from "./frontdoor-store.js";
import type {
  FrontdoorConfig,
  Principal,
  RuntimeDescriptor,
  RuntimeTokenResponse,
  SessionRecord,
  TenantConfig,
} from "./types.js";

type CreateServerOptions = {
  config?: FrontdoorConfig;
  cloudProvider?: CloudProvider | null;
  standardCloudProvider?: CloudProvider | null;
  compliantCloudProvider?: CloudProvider | null;
};

type JsonResponse = Record<string, unknown>;

type DependencyClass = "app" | "adapter";

type ResolvedPackagePlanStep = {
  kind: FrontdoorPackageKind;
  packageId: string;
  versionConstraint: string;
  variant: {
    releaseId: string;
    version: string;
    tarballPath: string;
  };
  direct: boolean;
};

type PackageHostingPolicy = {
  requiredServerClass: ServerClass;
  deploymentClass: ServerDeploymentClass;
};

function parseSemver(version: string): { major: number; minor: number; patch: number } | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(a: string, b: string): number {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);
  if (!parsedA || !parsedB) {
    return a.localeCompare(b);
  }
  if (parsedA.major !== parsedB.major) {
    return parsedA.major - parsedB.major;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor - parsedB.minor;
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch - parsedB.patch;
  }
  return 0;
}

function satisfiesVersionConstraint(version: string, constraint: string): boolean {
  const trimmed = constraint.trim();
  if (!trimmed || trimmed === "latest" || trimmed === "*") {
    return true;
  }
  if (trimmed.startsWith("^")) {
    const minimum = parseSemver(trimmed.slice(1));
    const actual = parseSemver(version);
    if (!minimum || !actual) {
      return false;
    }
    if (actual.major !== minimum.major) {
      return false;
    }
    return compareSemver(version, `${minimum.major}.${minimum.minor}.${minimum.patch}`) >= 0;
  }
  return version.trim() === trimmed;
}

function getClientIp(req: IncomingMessage): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const forwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (typeof forwarded === "string" && forwarded.trim()) {
    const [first] = forwarded.split(",");
    if (first && first.trim()) {
      return first.trim();
    }
  }
  const remote = req.socket.remoteAddress ?? "";
  return remote.trim() || "unknown";
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const raw = req.headers.cookie ?? "";
  const out: Record<string, string> = {};
  for (const entry of raw.split(";")) {
    const [keyPart, ...valueParts] = entry.split("=");
    const key = keyPart?.trim();
    if (!key) {
      continue;
    }
    out[key] = decodeURIComponent(valueParts.join("=").trim());
  }
  return out;
}

function setCookie(params: {
  res: ServerResponse;
  name: string;
  value: string;
  domain?: string;
  maxAgeSeconds?: number;
  secure?: boolean;
}): void {
  const attrs = [
    `${params.name}=${encodeURIComponent(params.value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (params.domain) {
    attrs.push(`Domain=${params.domain}`);
  }
  if (params.secure) {
    attrs.push("Secure");
  }
  if (typeof params.maxAgeSeconds === "number") {
    attrs.push(`Max-Age=${Math.max(0, Math.floor(params.maxAgeSeconds))}`);
  }
  params.res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearCookie(params: {
  res: ServerResponse;
  name: string;
  domain?: string;
  secure?: boolean;
}): void {
  const attrs = [`${params.name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (params.domain) {
    attrs.push(`Domain=${params.domain}`);
  }
  if (params.secure) {
    attrs.push("Secure");
  }
  params.res.setHeader(
    "Set-Cookie",
    attrs.join("; "),
  );
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T | null> {
  const text = await readRawBody(req);
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: ServerResponse, status: number, payload: JsonResponse): void {
  const body = `${JSON.stringify(payload)}\n`;
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", String(Buffer.byteLength(body, "utf8")));
  res.end(body);
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.statusCode = status;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(body);
}

function generateApiToken(): string {
  return `nex_t_${randomBytes(32).toString("base64url")}`;
}

function generateTokenId(): string {
  return `tok-${randomBytes(8).toString("hex")}`;
}

function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function logFrontdoorEvent(event: string, fields: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ...fields,
  };
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

function readSession(params: {
  req: IncomingMessage;
  config: FrontdoorConfig;
  sessions: SessionStore;
  store?: FrontdoorStore;
}): SessionRecord | null {
  // 1. Try session cookie first
  const cookies = parseCookies(params.req);
  const sessionId = cookies[params.config.sessionCookieName];
  if (sessionId) {
    const session = params.sessions.getSession(sessionId);
    if (session) {
      return {
        ...session,
        principal: elevatePrincipalForGlobalOperatorAccess({
          principal: session.principal,
          config: params.config,
        }),
      };
    }
  }

  // 2. Try API token (Bearer nex_t_...)
  if (params.store) {
    const authHeader = params.req.headers["authorization"];
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer nex_t_")) {
      const tokenStr = authHeader.slice(7); // Remove "Bearer "
      const hash = createHash("sha256").update(tokenStr).digest("hex");
      const tokenRecord = params.store.getApiTokenByHash(hash);
      if (tokenRecord && !tokenRecord.revokedAtMs && (!tokenRecord.expiresAtMs || tokenRecord.expiresAtMs > Date.now())) {
        params.store.touchApiToken(tokenRecord.tokenId);
        // Synthesize a SessionRecord from the API token
        return {
          id: `api-token:${tokenRecord.tokenId}`,
          principal: elevatePrincipalForGlobalOperatorAccess({
            principal: {
              userId: tokenRecord.userId,
              tenantId: "", // API tokens are cross-tenant
              entityId: tokenRecord.userId,
              roles: ["operator"],
              scopes: tokenRecord.scopes === "*" ? ["*"] : tokenRecord.scopes.split(","),
              amr: ["api_token"],
              accountId: tokenRecord.accountId,
            },
            config: params.config,
          }),
          createdAtMs: tokenRecord.createdAtMs,
          expiresAtMs: tokenRecord.expiresAtMs ?? Date.now() + 86400000,
          refreshTokens: new Map(),
        };
      }
    }
  }

  return null;
}

function ensurePersistentSession(params: {
  session: SessionRecord;
  sessions: SessionStore;
}): SessionRecord {
  if (!params.session.id.startsWith("api-token:")) {
    return params.session;
  }
  return params.sessions.createSession(params.session.principal);
}

type ManagedConnectionRuntimeContext = {
  server: ServerRecord;
  tenantId: string;
  authVia: string;
  entityId: string;
  service: string;
  appId: string;
  adapterId: string;
  authMethodId: string;
  managedProfileId?: string;
};

type ManagedConnectionOwnerResolution =
  | {
      ownerKind: "platform_control_plane";
      profile: PlatformManagedConnectionProfileRecord;
    }
  | {
      ownerKind: "product_control_plane";
      route: ProductControlPlaneRouteRecord;
    };

type ProductControlPlaneRuntimeContext = {
  server: ServerRecord;
  tenantId: string;
  authVia: string;
  entityId: string;
  appId: string;
  operation: string;
};

function normalizeManagedIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function readBearerToken(req: IncomingMessage): string {
  const authHeader = readHeaderValue(req.headers["authorization"]);
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return authHeader.slice(7).trim();
}

function resolveManagedStringField(params: {
  requestValue: string;
  headerValue: string;
  label: string;
  required?: boolean;
  normalize?: (value: string) => string;
}): { value?: string; error?: string } {
  const normalize = params.normalize ?? ((value: string) => value.trim());
  const requestValue = normalize(params.requestValue);
  const headerValue = normalize(params.headerValue);
  if (requestValue && headerValue && requestValue !== headerValue) {
    return { error: `mismatched_${params.label}` };
  }
  const value = requestValue || headerValue;
  if (!value && params.required) {
    return { error: `missing_${params.label}` };
  }
  return value ? { value } : {};
}

function resolveManagedConnectionRuntimeContext(params: {
  req: IncomingMessage;
  store: FrontdoorStore;
  requestValues: {
    service: string;
    appId: string;
    adapterId: string;
    authMethodId: string;
    managedProfileId?: string;
  };
}):
  | { ok: true; value: ManagedConnectionRuntimeContext }
  | { ok: false; status: number; error: string } {
  const runtimeAuthToken = readBearerToken(params.req);
  if (!runtimeAuthToken) {
    return { ok: false, status: 401, error: "missing_runtime_auth_token" };
  }
  const server = params.store.getServerByRuntimeAuthToken(runtimeAuthToken);
  if (!server) {
    return { ok: false, status: 401, error: "invalid_runtime_auth_token" };
  }

  const tenantHeader = normalizeManagedIdentifier(readHeaderValue(params.req.headers["x-nexus-tenant-id"]));
  if (tenantHeader && tenantHeader !== normalizeManagedIdentifier(server.tenantId)) {
    return { ok: false, status: 403, error: "tenant_mismatch" };
  }

  const entityField = resolveManagedStringField({
    requestValue: "",
    headerValue: readHeaderValue(params.req.headers["x-nexus-entity-id"]),
    label: "entity_id",
    required: true,
  });
  if (entityField.error || !entityField.value) {
    return { ok: false, status: 400, error: entityField.error ?? "missing_entity_id" };
  }

  const authViaField = resolveManagedStringField({
    requestValue: "",
    headerValue: readHeaderValue(params.req.headers["x-nexus-auth-via"]),
    label: "auth_via",
    required: true,
  });
  if (authViaField.error || !authViaField.value) {
    return { ok: false, status: 400, error: authViaField.error ?? "missing_auth_via" };
  }

  const serviceField = resolveManagedStringField({
    requestValue: params.requestValues.service,
    headerValue: "",
    label: "service",
    required: true,
    normalize: normalizeManagedIdentifier,
  });
  if (serviceField.error || !serviceField.value) {
    return { ok: false, status: 400, error: serviceField.error ?? "missing_service" };
  }

  const appField = resolveManagedStringField({
    requestValue: params.requestValues.appId,
    headerValue: readHeaderValue(params.req.headers["x-nexus-app-id"]),
    label: "app_id",
    required: true,
    normalize: normalizeManagedIdentifier,
  });
  if (appField.error || !appField.value) {
    return { ok: false, status: 400, error: appField.error ?? "missing_app_id" };
  }

  const adapterField = resolveManagedStringField({
    requestValue: params.requestValues.adapterId,
    headerValue: readHeaderValue(params.req.headers["x-nexus-adapter-id"]),
    label: "adapter_id",
    required: true,
    normalize: normalizeManagedIdentifier,
  });
  if (adapterField.error || !adapterField.value) {
    return { ok: false, status: 400, error: adapterField.error ?? "missing_adapter_id" };
  }

  const authMethodField = resolveManagedStringField({
    requestValue: params.requestValues.authMethodId,
    headerValue: readHeaderValue(params.req.headers["x-nexus-auth-method-id"]),
    label: "auth_method_id",
    required: true,
    normalize: normalizeManagedIdentifier,
  });
  if (authMethodField.error || !authMethodField.value) {
    return { ok: false, status: 400, error: authMethodField.error ?? "missing_auth_method_id" };
  }

  const managedProfileField = resolveManagedStringField({
    requestValue: params.requestValues.managedProfileId ?? "",
    headerValue: readHeaderValue(params.req.headers["x-nexus-managed-profile-id"]),
    label: "managed_profile_id",
    normalize: normalizeManagedIdentifier,
  });
  if (managedProfileField.error) {
    return { ok: false, status: 400, error: managedProfileField.error };
  }

  return {
    ok: true,
    value: {
      server,
      tenantId: server.tenantId,
      authVia: authViaField.value,
      entityId: entityField.value,
      service: serviceField.value,
      appId: appField.value,
      adapterId: adapterField.value,
      authMethodId: authMethodField.value,
      ...(managedProfileField.value ? { managedProfileId: managedProfileField.value } : {}),
    },
  };
}

function resolveProductControlPlaneRuntimeContext(params: {
  req: IncomingMessage;
  store: FrontdoorStore;
  requestValues: {
    appId: string;
    operation: string;
  };
}):
  | { ok: true; value: ProductControlPlaneRuntimeContext }
  | { ok: false; status: number; error: string } {
  const runtimeAuthToken = readBearerToken(params.req);
  if (!runtimeAuthToken) {
    return { ok: false, status: 401, error: "missing_runtime_auth_token" };
  }
  const server = params.store.getServerByRuntimeAuthToken(runtimeAuthToken);
  if (!server) {
    return { ok: false, status: 401, error: "invalid_runtime_auth_token" };
  }

  const tenantHeader = normalizeManagedIdentifier(readHeaderValue(params.req.headers["x-nexus-tenant-id"]));
  if (tenantHeader && tenantHeader !== normalizeManagedIdentifier(server.tenantId)) {
    return { ok: false, status: 403, error: "tenant_mismatch" };
  }

  const entityField = resolveManagedStringField({
    requestValue: "",
    headerValue: readHeaderValue(params.req.headers["x-nexus-entity-id"]),
    label: "entity_id",
    required: true,
  });
  if (entityField.error || !entityField.value) {
    return { ok: false, status: 400, error: entityField.error ?? "missing_entity_id" };
  }

  const authViaField = resolveManagedStringField({
    requestValue: "",
    headerValue: readHeaderValue(params.req.headers["x-nexus-auth-via"]),
    label: "auth_via",
    required: true,
  });
  if (authViaField.error || !authViaField.value) {
    return { ok: false, status: 400, error: authViaField.error ?? "missing_auth_via" };
  }

  const appField = resolveManagedStringField({
    requestValue: params.requestValues.appId,
    headerValue: readHeaderValue(params.req.headers["x-nexus-app-id"]),
    label: "app_id",
    required: true,
    normalize: normalizeManagedIdentifier,
  });
  if (appField.error || !appField.value) {
    return { ok: false, status: 400, error: appField.error ?? "missing_app_id" };
  }

  const operationField = resolveManagedStringField({
    requestValue: params.requestValues.operation,
    headerValue: readHeaderValue(params.req.headers["x-nexus-product-operation"]),
    label: "operation",
    required: true,
  });
  if (operationField.error || !operationField.value) {
    return { ok: false, status: 400, error: operationField.error ?? "missing_operation" };
  }

  return {
    ok: true,
    value: {
      server,
      tenantId: server.tenantId,
      authVia: authViaField.value,
      entityId: entityField.value,
      appId: appField.value,
      operation: operationField.value,
    },
  };
}

function resolveSecretReference(ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed) {
    throw new Error("missing_secret_ref");
  }
  if (trimmed.startsWith("env:")) {
    const envName = trimmed.slice("env:".length).trim();
    const value = process.env[envName]?.trim();
    if (!envName || !value) {
      throw new Error(`managed_connection_secret_not_found:${envName || "unknown"}`);
    }
    return value;
  }
  throw new Error(`unsupported_client_secret_ref:${trimmed}`);
}

async function parseJsonOrFormResponse(response: Response): Promise<Record<string, unknown>> {
  const text = (await response.text()).trim();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const params = new URLSearchParams(text);
    const payload: Record<string, unknown> = {};
    for (const [key, value] of params.entries()) {
      payload[key] = value;
    }
    return payload;
  }
}

async function exchangeManagedOAuthCode(params: {
  profile: PlatformManagedConnectionProfileRecord;
  code: string;
  redirectUri: string;
}): Promise<Record<string, unknown>> {
  const tokenUrl = params.profile.tokenUrl?.trim();
  const clientId = params.profile.clientId?.trim();
  const clientSecretRef = params.profile.clientSecretRef?.trim();
  if (!tokenUrl || !clientId || !clientSecretRef) {
    throw new Error("managed_oauth_profile_incomplete");
  }
  const clientSecret = resolveSecretReference(clientSecretRef);
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("code", params.code);
  body.set("redirect_uri", params.redirectUri);
  for (const [key, value] of Object.entries(params.profile.tokenParams)) {
    if (!key.trim() || !value.trim()) {
      continue;
    }
    body.set(key, value);
  }
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const payload = await parseJsonOrFormResponse(response);
  if (!response.ok) {
    throw new Error(
      `managed_oauth_exchange_failed:${response.status}:${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

function joinUrlPath(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/g, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function resolveManagedConnectionOwner(params: {
  store: FrontdoorStore;
  context: ManagedConnectionRuntimeContext;
}):
  | { ok: true; value: ManagedConnectionOwnerResolution }
  | { ok: false; status: number; error: string } {
  const profile = params.store.findPlatformManagedConnectionProfile({
    appId: params.context.appId,
    adapterId: params.context.adapterId,
    authMethodId: params.context.authMethodId,
    managedProfileId: params.context.managedProfileId,
    status: "active",
  });
  if (profile) {
    return {
      ok: true,
      value: {
        ownerKind: "platform_control_plane",
        profile,
      },
    };
  }
  const route = params.store.getProductControlPlaneRoute(params.context.appId);
  if (!route) {
    return { ok: false, status: 503, error: "product_control_plane_not_configured" };
  }
  if (route.status !== "active") {
    return { ok: false, status: 503, error: "product_control_plane_unavailable" };
  }
  return {
    ok: true,
    value: {
      ownerKind: "product_control_plane",
      route,
    },
  };
}

function buildProductControlPlaneBaseHeaders(params: {
  route: ProductControlPlaneRouteRecord;
  context: {
    server: ServerRecord;
    tenantId: string;
    entityId: string;
    appId: string;
  };
}): Record<string, string> {
  const authToken = resolveSecretReference(params.route.authTokenRef);
  return {
    authorization: `Bearer ${authToken}`,
    accept: "application/json",
    "x-nexus-server-id": params.context.server.serverId,
    "x-nexus-tenant-id": params.context.tenantId,
    "x-nexus-entity-id": params.context.entityId,
    "x-nexus-app-id": params.context.appId,
  };
}

function buildProductControlPlaneHeaders(params: {
  route: ProductControlPlaneRouteRecord;
  context: ManagedConnectionRuntimeContext;
}): Record<string, string> {
  const headers: Record<string, string> = {
    ...buildProductControlPlaneBaseHeaders(params),
    "x-nexus-adapter-id": params.context.adapterId,
    "x-nexus-auth-method-id": params.context.authMethodId,
  };
  if (params.context.managedProfileId) {
    headers["x-nexus-managed-profile-id"] = params.context.managedProfileId;
  }
  return headers;
}

async function parseRelayJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = (await response.text()).trim();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      error: "invalid_product_control_plane_response",
      body: text,
    };
  }
}

async function relayManagedConnectionMetadata(params: {
  route: ProductControlPlaneRouteRecord;
  context: ManagedConnectionRuntimeContext;
}): Promise<{ status: number; payload: Record<string, unknown> }> {
  const query = new URLSearchParams({
    service: params.context.service,
    app_id: params.context.appId,
    adapter_id: params.context.adapterId,
    auth_method_id: params.context.authMethodId,
  });
  if (params.context.managedProfileId) {
    query.set("managed_profile_id", params.context.managedProfileId);
  }
  const response = await fetch(
    `${joinUrlPath(params.route.baseUrl, "/api/internal/frontdoor/managed-connections/profile")}?${query.toString()}`,
    {
      method: "GET",
      headers: buildProductControlPlaneHeaders(params),
    },
  );
  return {
    status: response.status,
    payload: await parseRelayJsonResponse(response),
  };
}

async function relayManagedConnectionExchange(params: {
  route: ProductControlPlaneRouteRecord;
  context: ManagedConnectionRuntimeContext;
  body: {
    service: string;
    appId: string;
    adapter: string;
    authMethodId: string;
    managedProfileId?: string;
    code: string;
    state?: string;
    redirectUri: string;
  };
}): Promise<{ status: number; payload: Record<string, unknown> }> {
  const response = await fetch(
    joinUrlPath(params.route.baseUrl, "/api/internal/frontdoor/managed-connections/profile/exchange"),
    {
      method: "POST",
      headers: {
        ...buildProductControlPlaneHeaders(params),
        "content-type": "application/json",
      },
      body: JSON.stringify(params.body),
    },
  );
  return {
    status: response.status,
    payload: await parseRelayJsonResponse(response),
  };
}

async function relayProductControlPlaneOperation(params: {
  route: ProductControlPlaneRouteRecord;
  context: ProductControlPlaneRuntimeContext;
  body: {
    appId: string;
    operation: string;
    payload: Record<string, unknown>;
  };
}): Promise<{ status: number; payload: Record<string, unknown> }> {
  const response = await fetch(
    joinUrlPath(params.route.baseUrl, "/api/internal/frontdoor/product-control-plane/call"),
    {
      method: "POST",
      headers: {
        ...buildProductControlPlaneBaseHeaders(params),
        "content-type": "application/json",
        "x-nexus-product-operation": params.body.operation,
      },
      body: JSON.stringify(params.body),
    },
  );
  return {
    status: response.status,
    payload: await parseRelayJsonResponse(response),
  };
}

function resolveRuntimeDescriptor(
  serverId: string,
  tenant: TenantConfig,
): RuntimeDescriptor {
  const runtimeBaseUrl = tenant.runtimePublicBaseUrl.replace(/\/+$/g, "");
  const runtimeHttpBaseUrl = `${runtimeBaseUrl}/runtime`;
  const runtimeWsUrl = tenant.runtimeWsUrl?.trim()
    ? tenant.runtimeWsUrl.trim()
    : (() => {
        const wsUrl = new URL("/runtime/ws", `${runtimeBaseUrl}/`);
        if (wsUrl.protocol === "http:") {
          wsUrl.protocol = "ws:";
        } else if (wsUrl.protocol === "https:") {
          wsUrl.protocol = "wss:";
        }
        return wsUrl.toString();
      })();
  const runtimeSseUrl = tenant.runtimeSseUrl?.trim()
    ? tenant.runtimeSseUrl.trim()
    : new URL("/runtime/api/events/stream", `${runtimeBaseUrl}/`).toString();
  return {
    server_id: serverId,
    tenant_id: tenant.id,
    base_url: runtimeBaseUrl,
    http_base_url: runtimeHttpBaseUrl,
    ws_url: runtimeWsUrl,
    sse_url: runtimeSseUrl,
  };
}

function resolveTargetOrigin(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).origin.toLowerCase();
  } catch {
    return null;
  }
}

function readHeaderValue(input: string | string[] | undefined): string {
  if (Array.isArray(input)) {
    return input.join(",").trim();
  }
  return typeof input === "string" ? input.trim() : "";
}

function isMutationMethod(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function parseOriginFromReferer(rawReferer: string): string | null {
  const referer = rawReferer.trim();
  if (!referer) {
    return null;
  }
  try {
    return new URL(referer).origin.toLowerCase();
  } catch {
    return null;
  }
}

function isSameOriginBrowserMutation(req: IncomingMessage, baseUrl: string): boolean {
  const originHeader = readHeaderValue(req.headers.origin);
  const refererHeader = readHeaderValue(req.headers.referer);
  if (!originHeader && !refererHeader) {
    // Non-browser clients typically omit both headers; allow these requests.
    return true;
  }
  const expected = new URL(baseUrl);
  const originMatchesExpected = (candidateOrigin: string): boolean => {
    try {
      const candidate = new URL(candidateOrigin);
      if (candidate.protocol.toLowerCase() !== expected.protocol.toLowerCase()) {
        return false;
      }
      if (candidate.hostname.toLowerCase() !== expected.hostname.toLowerCase()) {
        return false;
      }
      if (expected.port) {
        return candidate.port === expected.port;
      }
      return true;
    } catch {
      return false;
    }
  };
  if (originHeader) {
    return originMatchesExpected(originHeader);
  }
  const refererOrigin = parseOriginFromReferer(refererHeader);
  return refererOrigin ? originMatchesExpected(refererOrigin) : false;
}

function applySecurityHeaders(
  res: ServerResponse,
  params: {
    config: FrontdoorConfig;
    requestSecure: boolean;
  },
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  // Preserve same-origin document context for app subresource routing (e.g. /_next/*),
  // while still suppressing cross-origin referrer leakage.
  res.setHeader("Referrer-Policy", "same-origin");
  const hstsEnabled = params.config.hstsEnabled ?? true;
  if (!hstsEnabled || !params.requestSecure) {
    return;
  }
  const directives = [`max-age=${Math.max(0, params.config.hstsMaxAgeSeconds ?? 31536000)}`];
  if (params.config.hstsIncludeSubDomains ?? true) {
    directives.push("includeSubDomains");
  }
  if (params.config.hstsPreload ?? true) {
    directives.push("preload");
  }
  res.setHeader("Strict-Transport-Security", directives.join("; "));
}

function resolveRequestSecureContext(req: IncomingMessage, baseUrl: string): boolean {
  const forwardedProto = readHeaderValue(req.headers["x-forwarded-proto"])
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .find(Boolean);
  if (forwardedProto === "https") {
    return true;
  }
  if (forwardedProto === "http") {
    return false;
  }
  const forwardedScheme = readHeaderValue(req.headers["x-forwarded-scheme"])
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .find(Boolean);
  if (forwardedScheme === "https") {
    return true;
  }
  if (forwardedScheme === "http") {
    return false;
  }
  const forwardedSsl = readHeaderValue(req.headers["x-forwarded-ssl"]).toLowerCase();
  if (forwardedSsl === "on") {
    return true;
  }
  try {
    return new URL(baseUrl).protocol.toLowerCase() === "https:";
  } catch {
    return false;
  }
}

function resolveRequestWsProtocol(req: IncomingMessage, baseUrl: string): "ws" | "wss" {
  return resolveRequestSecureContext(req, baseUrl) ? "wss" : "ws";
}

function resolveRequestHost(req: IncomingMessage, baseUrl: string): string {
  const forwardedHost = readHeaderValue(req.headers["x-forwarded-host"])
    .split(",")
    .map((item) => item.trim())
    .find(Boolean);
  if (forwardedHost) {
    return forwardedHost;
  }
  const host = readHeaderValue(req.headers.host);
  if (host) {
    return host;
  }
  try {
    return new URL(baseUrl).host;
  } catch {
    return "localhost";
  }
}

function resolveRequestOrigin(req: IncomingMessage, baseUrl: string): string {
  const protocol = resolveRequestSecureContext(req, baseUrl) ? "https" : "http";
  return `${protocol}://${resolveRequestHost(req, baseUrl)}`;
}

function buildFrontdoorRuntimeWsUrl(params: {
  req: IncomingMessage;
  baseUrl: string;
  serverId: string;
}): string {
  const wsProtocol = resolveRequestWsProtocol(params.req, params.baseUrl);
  const host = resolveRequestHost(params.req, params.baseUrl);
  return `${wsProtocol}://${host}/app?server_id=${encodeURIComponent(params.serverId)}`;
}

function buildManagedConnectionMetadataResponse(
  profile: PlatformManagedConnectionProfileRecord,
): Record<string, unknown> {
  return {
    managedProfileId: profile.managedProfileId,
    service: profile.service,
    authUri: profile.authorizeUrl,
    clientId: profile.clientId,
    scopes: profile.scopes,
    authorizeParams: profile.authorizeParams,
  };
}

type AppFrameParams = {
  appId: string;
  appDisplayName: string;
  appAccentColor: string;
  serverId: string;
  serverDisplayName: string;
  serverClass: ServerClass;
  serverStatus: string;
  servers: Array<{ serverId: string; displayName: string; serverClass: ServerClass; status: string }>;
  installedApps: Array<{
    appId: string;
    displayName: string;
    accentColor: string;
    entryPath: string;
    status: string;
  }>;
  userDisplayName: string;
  userEmail: string;
  accountName: string;
  dashboardUrl: string;
  logoutUrl: string;
};

const APP_EMBED_QUERY_PARAM = "__nxf_embed";

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function customerFacingServerPlanName(planId: string): string {
  const normalized = (planId || "").trim().toLowerCase();
  if (normalized === "cax11") return "Small";
  if (normalized === "cax21") return "Medium";
  if (normalized === "cax31") return "Large";
  return planId || "Plan";
}

function injectAppFrame(html: string, params: AppFrameParams): string {
  const ac = params.appAccentColor || "#6366f1";

  // Build server status dot color helper
  function statusDotColor(status: string): string {
    if (status === "active") return "#22c55e";
    if (status === "degraded") return "#f59e0b";
    return "#ef4444";
  }

function serverClassLabel(serverClass: ServerClass): string {
  return serverClass === "compliant" ? "Compliant" : "Standard";
}

  function serverClassBadgeClass(serverClass: ServerClass): string {
    return serverClass === "compliant" ? "nxf-class-badge nxf-class-badge-compliant" : "nxf-class-badge nxf-class-badge-standard";
  }

  // ── CSS ───────────────────────────────────────────────────────
  const frameCSS = `<style id="nexus-app-frame-styles">
body { padding-top: 44px !important; }
#nexus-app-frame {
  position: fixed; top: 0; left: 0; right: 0; height: 44px;
  background: #0c0e14; z-index: 999999;
  display: flex; align-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px; color: #e2e8f0; box-sizing: border-box; padding: 0 12px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  user-select: none; -webkit-user-select: none;
}
#nexus-app-frame *, #nexus-app-frame *::before, #nexus-app-frame *::after { box-sizing: border-box; }
#nexus-app-frame .nxf-logo {
  display: flex; align-items: center; gap: 6px; text-decoration: none; color: #e2e8f0;
  font-weight: 600; font-size: 14px; padding: 4px 8px 4px 0; margin-right: 4px; flex-shrink: 0;
}
#nexus-app-frame .nxf-logo:hover { color: #fff; }
#nexus-app-frame .nxf-logo svg { width: 20px; height: 20px; flex-shrink: 0; }
#nexus-app-frame .nxf-sep {
  width: 1px; height: 20px; background: rgba(255,255,255,0.12); margin: 0 8px; flex-shrink: 0;
}
#nexus-app-frame .nxf-app-badge {
  display: flex; align-items: center; gap: 6px; padding: 4px 8px; flex-shrink: 0;
}
#nexus-app-frame .nxf-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
#nexus-app-frame .nxf-dropdown-wrap {
  position: relative; flex-shrink: 0;
}
#nexus-app-frame .nxf-dropdown-btn {
  display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px;
  cursor: pointer; border: none; background: transparent; color: #e2e8f0; font-size: 13px;
  font-family: inherit; line-height: 1;
}
#nexus-app-frame .nxf-dropdown-btn:hover { background: rgba(255,255,255,0.08); }
#nexus-app-frame .nxf-dropdown-btn .nxf-caret {
  border: solid rgba(255,255,255,0.5); border-width: 0 1.5px 1.5px 0;
  display: inline-block; padding: 2.5px; transform: rotate(45deg); margin-top: -2px;
}
#nexus-app-frame .nxf-dropdown-panel {
  display: none; position: absolute; top: calc(100% + 6px); left: 0;
  background: #1a1d27; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
  min-width: 220px; padding: 6px 0; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  z-index: 1000000;
}
#nexus-app-frame .nxf-dropdown-panel.nxf-right { left: auto; right: 0; }
#nexus-app-frame .nxf-dropdown-panel.nxf-open { display: block; }
#nexus-app-frame .nxf-dropdown-item {
  display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer;
  color: #cbd5e1; font-size: 13px; text-decoration: none; border: none; background: none;
  width: 100%; text-align: left; font-family: inherit;
}
#nexus-app-frame .nxf-dropdown-item:hover { background: rgba(255,255,255,0.06); color: #f1f5f9; }
#nexus-app-frame .nxf-dropdown-item.nxf-active { color: #fff; font-weight: 500; }
#nexus-app-frame .nxf-dropdown-item.nxf-disabled {
  opacity: 0.4; cursor: default; pointer-events: none;
}
#nexus-app-frame .nxf-dropdown-divider {
  height: 1px; background: rgba(255,255,255,0.08); margin: 4px 0;
}
#nexus-app-frame .nxf-dropdown-header {
  padding: 6px 14px 4px; color: #94a3b8; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.05em; font-weight: 600;
}
#nexus-app-frame .nxf-status-dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
}
#nexus-app-frame .nxf-class-badge {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 700;
  letter-spacing: 0.02em; border: 1px solid transparent; flex-shrink: 0;
}
#nexus-app-frame .nxf-class-badge-standard {
  color: #cbd5e1; background: rgba(148,163,184,0.12); border-color: rgba(148,163,184,0.24);
}
#nexus-app-frame .nxf-class-badge-compliant {
  color: #fcd34d; background: rgba(245,158,11,0.14); border-color: rgba(245,158,11,0.32);
}
#nexus-app-frame .nxf-spacer { flex: 1; }
#nexus-app-frame .nxf-avatar {
  width: 24px; height: 24px; border-radius: 50%; background: #374151;
  display: flex; align-items: center; justify-content: center; font-size: 11px;
  font-weight: 600; color: #e2e8f0; flex-shrink: 0; text-transform: uppercase;
}
#nexus-app-frame .nxf-dash-link {
  display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 6px;
  text-decoration: none; color: #94a3b8; font-size: 12px; margin-left: 4px; flex-shrink: 0;
}
#nexus-app-frame .nxf-dash-link:hover { color: #e2e8f0; background: rgba(255,255,255,0.06); }
#nexus-app-frame .nxf-apps-grid {
  display: grid; grid-template-columns: 1fr; gap: 2px; padding: 4px 0;
}
</style>`;

  // ── Server list items ─────────────────────────────────────────
  const serverItems = params.servers.map((s) => {
    const isActive = s.serverId === params.serverId;
    const dotColor = statusDotColor(s.status);
    return `<button class="nxf-dropdown-item${isActive ? " nxf-active" : ""}" data-nxf-server-id="${escAttr(s.serverId)}" data-nxf-action="switch-server"><span class="nxf-status-dot" style="background:${dotColor}"></span><span>${escHtml(s.displayName)}</span><span class="${serverClassBadgeClass(s.serverClass)}">${escHtml(serverClassLabel(s.serverClass))}</span></button>`;
  }).join("");

  // ── Installed app items ───────────────────────────────────────
  const appItems = params.installedApps.map((a) => {
    const isActive = a.appId === params.appId;
    const disabled = a.status === "installing" || a.status === "failed";
    const cls = `nxf-dropdown-item${isActive ? " nxf-active" : ""}${disabled ? " nxf-disabled" : ""}`;
    const dotColor = a.accentColor || "#6366f1";
    const statusLabel = disabled ? ` <span style="color:#94a3b8;font-size:11px">(${escHtml(a.status)})</span>` : "";
    return `<button class="${cls}" data-nxf-app-id="${escAttr(a.appId)}" data-nxf-entry-path="${escAttr(a.entryPath)}" data-nxf-action="switch-app"><span class="nxf-dot" style="background:${dotColor};width:6px;height:6px"></span>${escHtml(a.displayName)}${statusLabel}</button>`;
  }).join("");

  // ── User initial ──────────────────────────────────────────────
  const initial = (params.userDisplayName || params.userEmail || "?").charAt(0);

  // ── HTML + JS ─────────────────────────────────────────────────
  const frameHTML = `<div id="nexus-app-frame">
  <a class="nxf-logo" href="${escAttr(params.dashboardUrl)}" title="Nexus Dashboard">
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="16" height="16" rx="4" fill="#6366f1"/>
      <path d="M7 7l3 3-3 3M11 13h3" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span>Nexus</span>
  </a>
  <div class="nxf-sep"></div>
  <div class="nxf-app-badge">
    <span class="nxf-dot" style="background:${escAttr(ac)}"></span>
    <span>${escHtml(params.appDisplayName)}</span>
  </div>
  <div class="nxf-sep"></div>
  <div class="nxf-dropdown-wrap" data-nxf-dropdown="server">
    <button class="nxf-dropdown-btn" data-nxf-toggle="server">
      <span class="nxf-status-dot" style="background:${statusDotColor(params.serverStatus)}"></span>
      <span>${escHtml(params.serverDisplayName)}</span>
      <span class="${serverClassBadgeClass(params.serverClass)}">${escHtml(serverClassLabel(params.serverClass))}</span>
      <span class="nxf-caret"></span>
    </button>
    <div class="nxf-dropdown-panel" data-nxf-panel="server">
      <div class="nxf-dropdown-header">Servers</div>
      ${serverItems}
    </div>
  </div>
  <div class="nxf-sep"></div>
  <div class="nxf-dropdown-wrap" data-nxf-dropdown="apps">
    <button class="nxf-dropdown-btn" data-nxf-toggle="apps">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="flex-shrink:0">
        <rect x="1" y="1" width="5" height="5" rx="1" fill="#94a3b8"/>
        <rect x="8" y="1" width="5" height="5" rx="1" fill="#94a3b8"/>
        <rect x="1" y="8" width="5" height="5" rx="1" fill="#94a3b8"/>
        <rect x="8" y="8" width="5" height="5" rx="1" fill="#94a3b8"/>
      </svg>
      <span>Apps</span>
      <span class="nxf-caret"></span>
    </button>
    <div class="nxf-dropdown-panel" data-nxf-panel="apps">
      <div class="nxf-dropdown-header">Installed Apps</div>
      <div class="nxf-apps-grid">${appItems}</div>
    </div>
  </div>
  <div class="nxf-spacer"></div>
  <div class="nxf-dropdown-wrap" data-nxf-dropdown="account">
    <button class="nxf-dropdown-btn" data-nxf-toggle="account">
      <span class="nxf-avatar">${escHtml(initial)}</span>
      <span>${escHtml(params.userDisplayName || params.userEmail)}</span>
      <span class="nxf-caret"></span>
    </button>
    <div class="nxf-dropdown-panel nxf-right" data-nxf-panel="account">
      <div class="nxf-dropdown-header">${escHtml(params.accountName)}</div>
      <a class="nxf-dropdown-item" href="${escAttr(params.dashboardUrl)}#billing">Billing &amp; Plans</a>
      <a class="nxf-dropdown-item" href="${escAttr(params.dashboardUrl)}#members">Team &amp; Access</a>
      <a class="nxf-dropdown-item" href="${escAttr(params.dashboardUrl)}#settings">Account Settings</a>
      <div class="nxf-dropdown-divider"></div>
      <button class="nxf-dropdown-item" data-nxf-action="logout">Sign Out</button>
    </div>
  </div>
  <div class="nxf-sep"></div>
  <a class="nxf-dash-link" href="${escAttr(params.dashboardUrl)}">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="flex-shrink:0">
      <path d="M8 2L4 6l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Dashboard
  </a>
</div>
<script>(function(){
  var frame = document.getElementById("nexus-app-frame");
  if (!frame) return;
  var currentServerId = ${JSON.stringify(params.serverId)};
  var currentAppId = ${JSON.stringify(params.appId)};

  // Dropdown toggle
  frame.addEventListener("click", function(e) {
    var toggle = e.target.closest("[data-nxf-toggle]");
    if (toggle) {
      e.preventDefault();
      e.stopPropagation();
      var name = toggle.getAttribute("data-nxf-toggle");
      var panel = frame.querySelector("[data-nxf-panel='" + name + "']");
      if (!panel) return;
      var wasOpen = panel.classList.contains("nxf-open");
      closeAllDropdowns();
      if (!wasOpen) panel.classList.add("nxf-open");
      return;
    }

    // Server switch
    var serverBtn = e.target.closest("[data-nxf-action='switch-server']");
    if (serverBtn) {
      var sid = serverBtn.getAttribute("data-nxf-server-id");
      if (sid && sid !== currentServerId) {
        fetch("/api/servers/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ server_id: sid }),
          credentials: "same-origin"
        }).then(function() {
          window.location.href = "/app/" + encodeURIComponent(currentAppId) + "/?server_id=" + encodeURIComponent(sid);
        }).catch(function() {
          window.location.href = "/app/" + encodeURIComponent(currentAppId) + "/?server_id=" + encodeURIComponent(sid);
        });
      }
      closeAllDropdowns();
      return;
    }

    // App switch
    var appBtn = e.target.closest("[data-nxf-action='switch-app']");
    if (appBtn) {
      var aid = appBtn.getAttribute("data-nxf-app-id");
      var entryPath = appBtn.getAttribute("data-nxf-entry-path");
      if (aid && aid !== currentAppId && entryPath) {
        var sep = entryPath.indexOf("?") >= 0 ? "&" : "?";
        window.location.href = entryPath + sep + "server_id=" + encodeURIComponent(currentServerId);
      }
      closeAllDropdowns();
      return;
    }

    // Logout
    var logoutBtn = e.target.closest("[data-nxf-action='logout']");
    if (logoutBtn) {
      fetch(${JSON.stringify(params.logoutUrl)}, {
        method: "POST",
        credentials: "same-origin"
      }).then(function() {
        window.location.href = "/";
      }).catch(function() {
        window.location.href = "/";
      });
      closeAllDropdowns();
      return;
    }
  });

  // Close dropdowns on outside click
  document.addEventListener("click", function(e) {
    if (!frame.contains(e.target)) closeAllDropdowns();
  });

  function closeAllDropdowns() {
    var panels = frame.querySelectorAll(".nxf-dropdown-panel.nxf-open");
    for (var i = 0; i < panels.length; i++) panels[i].classList.remove("nxf-open");
  }
})();</script>`;

  // ── Inject CSS before </head> ─────────────────────────────────
  const headClose = html.indexOf("</head>");
  let result = html;
  if (headClose >= 0) {
    result = result.slice(0, headClose) + frameCSS + result.slice(headClose);
  } else {
    result = frameCSS + result;
  }

  // ── Inject HTML+JS before </body> ─────────────────────────────
  const bodyClose = result.indexOf("</body>");
  if (bodyClose >= 0) {
    result = result.slice(0, bodyClose) + frameHTML + result.slice(bodyClose);
  } else {
    result = result + frameHTML;
  }

  return result;
}

function injectScriptBeforeBody(html: string, scriptId: string, scriptBody: string): string {
  const scriptTag = `<script id="${escAttr(scriptId)}">${scriptBody}</script>`;
  const bodyClose = html.indexOf("</body>");
  if (bodyClose >= 0) {
    return html.slice(0, bodyClose) + scriptTag + html.slice(bodyClose);
  }
  return html + scriptTag;
}

function isEmbeddedAppRequest(url: URL): boolean {
  return url.searchParams.get(APP_EMBED_QUERY_PARAM) === "1";
}

function prefersHtmlResponse(req: IncomingMessage): boolean {
  const accept = readHeaderValue(req.headers.accept).toLowerCase();
  return accept.includes("text/html");
}

function isAppDocumentRequest(req: IncomingMessage, pathname: string): boolean {
  if (req.method !== "GET") return false;
  if (!prefersHtmlResponse(req)) return false;
  if (path.extname(pathname) !== "") return false;
  const appMatch = pathname.match(/^\/app\/([^/]+)/);
  return Boolean(appMatch);
}

function normalizeEmail(value: string | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function extractTenantId(host: string | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0];
  const match = hostname.match(/^(t-[a-z0-9-]+)\.nexushub\.sh$/);
  return match ? match[1] : null;
}

function hasGlobalOperatorAccess(principal: Principal): boolean {
  const operatorRoles = new Set(["operator"]);
  for (const role of principal.roles) {
    if (operatorRoles.has(role)) {
      return true;
    }
  }
  for (const scope of principal.scopes) {
    if (scope === "operator.admin" || scope.startsWith("operator.")) {
      return true;
    }
  }
  return false;
}

function elevatePrincipalForGlobalOperatorAccess(params: {
  principal: Principal;
  config: FrontdoorConfig;
}): Principal {
  if (!params.config.operatorUserIds?.has(params.principal.userId)) {
    return params.principal;
  }
  const roles = params.principal.roles.includes("operator")
    ? params.principal.roles
    : [...params.principal.roles, "operator"];
  const scopes = params.principal.scopes.includes("operator.admin")
    ? params.principal.scopes
    : [...params.principal.scopes, "operator.admin"];
  return {
    ...params.principal,
    roles,
    scopes,
  };
}

function isProductVisibleToPrincipal(
  product: { visibility?: string | null },
  principal: Principal | null,
): boolean {
  const visibility = (product.visibility ?? "customer").trim().toLowerCase();
  if (visibility === "operator") {
    return principal ? hasGlobalOperatorAccess(principal) : false;
  }
  return true;
}

type OidcIdentityRef = {
  provider: string;
  subject: string;
};

function parseOidcIdentityFromEntityId(entityId: string | undefined): OidcIdentityRef | null {
  const raw = typeof entityId === "string" ? entityId.trim() : "";
  if (!raw) {
    return null;
  }
  const parts = raw.split(":");
  if (parts.length < 3) {
    return null;
  }
  if (parts[0]?.trim().toLowerCase() !== "entity") {
    return null;
  }
  const provider = (parts[1] ?? "").trim().toLowerCase();
  const subject = parts
    .slice(2)
    .join(":")
    .trim()
    .toLowerCase();
  if (!provider || !subject) {
    return null;
  }
  return {
    provider,
    subject,
  };
}

function parseAppIdFromRefererPath(params: {
  req: IncomingMessage;
  baseUrl: string;
}): string | null {
  const refererHeader =
    typeof params.req.headers.referer === "string" ? params.req.headers.referer.trim() : "";
  if (!refererHeader) {
    return null;
  }
  let refererUrl: URL;
  let originUrl: URL;
  try {
    refererUrl = new URL(refererHeader);
    originUrl = new URL(params.baseUrl);
  } catch {
    return null;
  }
  const sameProtocol = refererUrl.protocol === originUrl.protocol;
  const sameHostname = refererUrl.hostname === originUrl.hostname;
  const baseHasExplicitPort = Boolean(originUrl.port);
  const samePort = !baseHasExplicitPort || refererUrl.port === originUrl.port;
  if (!sameProtocol || !sameHostname || !samePort) {
    return null;
  }
  const match = refererUrl.pathname.match(/^\/app\/([^/]+)/);
  if (!match) {
    return null;
  }
  const appId = decodeURIComponent(match[1] ?? "")
    .trim()
    .toLowerCase();
  if (!appId || !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(appId)) {
    return null;
  }
  return appId;
}

function normalizeAppId(input: string | undefined): string {
  return typeof input === "string" ? input.trim().toLowerCase() : "";
}

function isValidAppId(appId: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/u.test(appId);
}

function defaultEntryPathForApp(appId: string): string {
  if (appId === "console") {
    return "/app/console/chat";
  }
  if (appId === "glowbot") {
    return "/app/glowbot/";
  }
  if (appId === "spike") {
    return "/app/spike/";
  }
  return `/app/${encodeURIComponent(appId)}/`;
}

function canonicalProductAppIdForRuntimeAppId(appId: string): string {
  return appId;
}

function deterministicServerNameFromId(serverId: string): string {
  const adjectives = [
    "Amber",
    "Atlas",
    "Cinder",
    "Cobalt",
    "Crimson",
    "Echo",
    "Emerald",
    "Ivory",
    "Nova",
    "Onyx",
    "Sable",
    "Solar",
  ];
  const nouns = [
    "Beacon",
    "Bridge",
    "Cloud",
    "Forge",
    "Harbor",
    "Helix",
    "Lattice",
    "Nexus",
    "Orbit",
    "Pulse",
    "Signal",
    "Vertex",
  ];
  let hash = 0;
  for (let i = 0; i < serverId.length; i += 1) {
    hash = (hash * 31 + serverId.charCodeAt(i)) >>> 0;
  }
  const adjective = adjectives[hash % adjectives.length] ?? "Nova";
  const noun = nouns[Math.floor(hash / adjectives.length) % nouns.length] ?? "Nexus";
  return `${adjective} ${noun}`;
}

function normalizeText(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function parseBool(input: unknown, fallback = false): boolean {
  const raw = normalizeText(input).toLowerCase();
  if (!raw) {
    return fallback;
  }
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

// DELETED: normalizeRuntimeAppKind, normalizeUrlIfValid — only used by legacy config injection

type EntryResolveAction =
  | "create_server_and_install"
  | "purchase_app_then_install"
  | "install_on_selected_server"
  | "dashboard_only";

type EntryResolvePlan = {
  appId: string;
  action: EntryResolveAction;
  hasActiveEntitlement: boolean;
  serverCount: number;
  requestedServerId: string | null;
  recommendedServerId: string | null;
  installedServerIds: string[];
};

function resolveEntryActionPlan(params: {
  store: FrontdoorStore;
  userId: string;
  appId: string;
  requestedServerId?: string | null;
}):
  | {
      ok: true;
      plan: EntryResolvePlan;
    }
  | {
      ok: false;
      status: number;
      error: string;
    } {
  const appId = normalizeAppId(params.appId);
  if (!appId || !isValidAppId(appId)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_app_id",
    };
  }
  const servers = params.store.getServersForUser(params.userId);
  const serverById = new Map(servers.map((item) => [item.serverId, item]));
  const requestedServerId =
    typeof params.requestedServerId === "string" && params.requestedServerId.trim()
      ? params.requestedServerId.trim()
      : null;
  if (requestedServerId && !serverById.has(requestedServerId)) {
    return {
      ok: false,
      status: 403,
      error: "server_not_authorized",
    };
  }
  // Check entitlement at account level - find first account with an active app subscription
  const accounts = params.store.getAccountsForUser(params.userId);
  let hasActiveEntitlement = false;
  for (const account of accounts) {
    const sub = params.store.getAppSubscription(account.accountId, appId);
    if (sub && sub.status === "active") {
      hasActiveEntitlement = true;
      break;
    }
  }
  const installedServerIds: string[] = [];
  for (const server of servers) {
    const installed = params.store
      .getServerEffectiveAppInstalls(server.serverId)
      .some((item) => item.appId === appId && item.status === "installed");
    if (installed) {
      installedServerIds.push(server.serverId);
    }
  }

  let action: EntryResolveAction = "dashboard_only";
  if (servers.length === 0) {
    action = "create_server_and_install";
  } else if (!hasActiveEntitlement) {
    action = "purchase_app_then_install";
  } else if (requestedServerId) {
    action = installedServerIds.includes(requestedServerId)
      ? "dashboard_only"
      : "install_on_selected_server";
  } else {
    action = installedServerIds.length > 0 ? "dashboard_only" : "install_on_selected_server";
  }

  const defaultServer = servers[0] ?? null;
  return {
    ok: true,
    plan: {
      appId,
      action,
      hasActiveEntitlement,
      serverCount: servers.length,
      requestedServerId,
      recommendedServerId: requestedServerId || installedServerIds[0] || defaultServer?.serverId || null,
      installedServerIds,
    },
  };
}

function getLatestProvisionRequestForPrincipal(params: {
  autoProvisioner: TenantAutoProvisioner | null;
  principal: Principal;
  store: FrontdoorStore;
}) {
  const autoProvisioner = params.autoProvisioner;
  if (!autoProvisioner) {
    return null;
  }
  const byUser = autoProvisioner.getLatestProvisionRequestByUser(params.principal.userId);
  if (byUser) {
    return byUser;
  }
  const linkedIdentities = params.store.listIdentityLinksForUser(params.principal.userId);
  for (const identity of linkedIdentities) {
    const linked = autoProvisioner.getLatestProvisionRequestByOidcIdentity({
      provider: identity.provider,
      subject: identity.subject,
    });
    if (linked) {
      return linked;
    }
  }
  const oidc = parseOidcIdentityFromEntityId(params.principal.entityId);
  if (!oidc) {
    return null;
  }
  return autoProvisioner.getLatestProvisionRequestByOidcIdentity(oidc);
}

function provisionRequestOwnedByPrincipal(params: {
  record: {
    userId: string;
    provider: string;
    subject: string;
  };
  principal: Principal;
  store: FrontdoorStore;
}): boolean {
  if (params.record.userId === params.principal.userId) {
    return true;
  }
  const linkedIdentities = params.store.listIdentityLinksForUser(params.principal.userId);
  if (
    linkedIdentities.some(
      (identity) =>
        identity.provider === params.record.provider &&
        identity.subject === params.record.subject,
    )
  ) {
    return true;
  }
  const oidc = parseOidcIdentityFromEntityId(params.principal.entityId);
  if (!oidc) {
    return false;
  }
  return params.record.provider === oidc.provider && params.record.subject === oidc.subject;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

type RuntimeAppCatalogItem = {
  displayName: string;
  entryPath: string;
  kind?: string;
};

function parseRuntimeAppCatalog(body: unknown): Map<string, RuntimeAppCatalogItem> {
  const payload = asRecord(body);
  const runtimeItemsRaw = Array.isArray(payload?.items) ? payload.items : [];
  const runtimeAppsById = new Map<string, RuntimeAppCatalogItem>();
  for (const item of runtimeItemsRaw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const runtimeAppId = normalizeAppId(readOptionalString(record.app_id) || "");
    if (!runtimeAppId || !isValidAppId(runtimeAppId)) {
      continue;
    }
    const appId = canonicalProductAppIdForRuntimeAppId(runtimeAppId);
    const next: RuntimeAppCatalogItem = {
      displayName: readOptionalString(record.display_name) || appId,
      entryPath: readOptionalString(record.entry_path) || defaultEntryPathForApp(appId),
      kind: readOptionalString(record.kind),
    };
    if (!runtimeAppsById.has(appId) || runtimeAppId === appId) {
      runtimeAppsById.set(appId, next);
    }
  }
  return runtimeAppsById;
}

function parseEntitlementCountLimit(value: string | undefined): number | null {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "unlimited" || normalized === "infinite" || normalized === "infinity") {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.floor(parsed));
}

function resolveBillingPlanFromStripeObject(object: Record<string, unknown>): string {
  const metadata = asRecord(object.metadata);
  const fromMetadata = readOptionalString(metadata?.plan_id);
  if (fromMetadata) {
    return fromMetadata;
  }
  const items = asRecord(object.items);
  const data = Array.isArray(items?.data) ? items?.data : [];
  for (const entry of data) {
    const item = asRecord(entry);
    const price = asRecord(item?.price);
    const lookupKey = readOptionalString(price?.lookup_key);
    if (lookupKey) {
      return lookupKey;
    }
    const priceId = readOptionalString(price?.id);
    if (priceId) {
      return priceId;
    }
  }
  return "starter";
}

function msFromUnixSeconds(value: unknown): number | undefined {
  const maybe = readOptionalNumber(value);
  if (maybe === undefined) {
    return undefined;
  }
  return Math.floor(maybe * 1000);
}

function buildRuntimeTokenResponse(params: {
  config: FrontdoorConfig;
  req: IncomingMessage;
  session: SessionRecord;
  refreshToken: string;
  serverId: string;
  tenant: TenantConfig;
  principal?: Principal;
  clientId?: string;
}): RuntimeTokenResponse {
  const principal = params.principal ?? params.session.principal;
  const runtimeScopes = normalizeRuntimeScopes(principal);
  const runtimeEntityId = resolveRuntimeEntityId(principal);
  const access = mintRuntimeAccessToken({
    config: params.config,
    principal,
    sessionId: params.session.id,
    clientId: params.clientId,
  });
  return {
    access_token: access.token,
    token_type: "Bearer",
    expires_in: access.expiresInSeconds,
    key_id: access.keyId,
    refresh_token: params.refreshToken,
    refresh_expires_in: params.config.runtimeRefreshTtlSeconds,
    server_id: params.serverId,
    tenant_id: principal.tenantId,
    entity_id: runtimeEntityId,
    scopes: runtimeScopes,
    roles: [...principal.roles],
    runtime: resolveRuntimeDescriptor(params.serverId, params.tenant),
  };
}

function resolveRuntimeUpstreamBearerToken(params: {
  config: FrontdoorConfig;
  principal: Principal;
  session: SessionRecord;
  runtime: TenantConfig;
}): string {
  const access = mintRuntimeAccessToken({
    config: params.config,
    principal: params.principal,
    sessionId: params.session.id,
  });
  return access.token;
}

function resolvePackageOperatorRuntimePrincipal(params: {
  store: FrontdoorStore;
  session?: SessionRecord;
  server: ServerRecord;
}): { principal: Principal; sessionId: string } | null {
  if (params.session) {
    const user = params.store.getUserById(params.session.principal.userId);
    if (user && !user.disabled) {
      return {
        principal: params.store.toPrincipal({
          user,
          server: params.server,
          accountId: params.server.accountId,
          amr: params.session.principal.amr,
        }),
        sessionId: params.session.id,
      };
    }
  }

  const account = params.store.getAccount(params.server.accountId);
  if (!account) {
    return null;
  }
  const owner = params.store.getUserById(account.ownerUserId);
  if (!owner || owner.disabled) {
    return null;
  }

  return {
    principal: params.store.toPrincipal({
      user: owner,
      server: params.server,
      accountId: params.server.accountId,
      amr: ["system"],
    }),
    sessionId: `frontdoor-system:${params.server.serverId}`,
  };
}

function mintPackageOperatorRuntimeBearerToken(params: {
  config: FrontdoorConfig;
  store: FrontdoorStore;
  session?: SessionRecord;
  server: ServerRecord;
}): string | null {
  const shouldUseTrustedRuntimeToken = params.server.provider !== "none";
  if (shouldUseTrustedRuntimeToken) {
    const resolved = resolvePackageOperatorRuntimePrincipal(params);
    if (!resolved) {
      return null;
    }
    return mintRuntimeAccessToken({
      config: params.config,
      principal: resolved.principal,
      sessionId: resolved.sessionId,
      clientId: "nexus-frontdoor-package-operator",
    }).token;
  }

  const persisted =
    params.server.runtimeAuthToken?.trim() ||
    params.config.tenants.get(params.server.tenantId)?.runtimeAuthToken?.trim() ||
    null;
  if (persisted) {
    return persisted;
  }
  const resolved = resolvePackageOperatorRuntimePrincipal(params);
  if (!resolved) {
    return null;
  }
  return mintRuntimeAccessToken({
    config: params.config,
    principal: resolved.principal,
    sessionId: resolved.sessionId,
    clientId: "nexus-frontdoor-package-operator",
  }).token;
}

function serveUiShell(res: ServerResponse): void {
  const indexPath = path.join(resolveProjectRoot(), "public", "index.html");
  try {
    const html = fs.readFileSync(indexPath, "utf8");
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(html);
  } catch (error) {
    sendText(res, 500, `Failed to read UI shell: ${String(error)}`);
  }
}

function socketRateLimited(params: {
  limiter: SlidingWindowRateLimiter;
  key: string;
}): { limited: boolean; retryAfterSeconds?: number } {
  const verdict = params.limiter.consume(params.key);
  if (verdict.ok) {
    return { limited: false };
  }
  return {
    limited: true,
    retryAfterSeconds: verdict.retryAfterSeconds,
  };
}

export function createFrontdoorServer(options: CreateServerOptions = {}): {
  server: HttpServer;
  config: FrontdoorConfig;
} {
  const config = options.config ?? loadConfig();
  const rateLimits = config.rateLimits ?? {
    loginAttempts: {
      windowSeconds: 60,
      maxAttempts: 30,
      blockSeconds: 60,
    },
    loginFailures: {
      windowSeconds: 15 * 60,
      maxAttempts: 8,
      blockSeconds: 15 * 60,
    },
    tokenEndpoints: {
      windowSeconds: 60,
      maxAttempts: 120,
      blockSeconds: 60,
    },
    proxyRequests: {
      windowSeconds: 60,
      maxAttempts: 1000,
      blockSeconds: 30,
    },
  };
  const sessions = new SessionStore(config.sessionTtlSeconds, config.runtimeRefreshTtlSeconds, {
    sqlitePath: config.sessionStorePath,
  });
  const store = new FrontdoorStore(
    config.frontdoorStorePath ?? path.resolve(resolveProjectRoot(), "state", "frontdoor.db"),
  );
  const loginAttemptLimiter = new SlidingWindowRateLimiter(
    rateLimits.loginAttempts.windowSeconds * 1000,
    rateLimits.loginAttempts.maxAttempts,
    rateLimits.loginAttempts.blockSeconds * 1000,
  );
  const loginFailureLimiter = new SlidingWindowRateLimiter(
    rateLimits.loginFailures.windowSeconds * 1000,
    rateLimits.loginFailures.maxAttempts,
    rateLimits.loginFailures.blockSeconds * 1000,
  );
  const tokenEndpointLimiter = new SlidingWindowRateLimiter(
    rateLimits.tokenEndpoints.windowSeconds * 1000,
    rateLimits.tokenEndpoints.maxAttempts,
    rateLimits.tokenEndpoints.blockSeconds * 1000,
  );
  const proxyRequestLimiter = new SlidingWindowRateLimiter(
    rateLimits.proxyRequests.windowSeconds * 1000,
    rateLimits.proxyRequests.maxAttempts,
    rateLimits.proxyRequests.blockSeconds * 1000,
  );
  const oidc = new OidcFlowManager();
  const autoProvisioner = config.autoProvision.enabled
    ? new TenantAutoProvisioner(config)
    : null;
  if (autoProvisioner) {
    autoProvisioner.seedTenantsIntoConfig();
  }
  store.seedFromConfig(config);

  // ── Startup product sync: auto-sync app manifests into the product catalog ──
  const productManifestPathsRaw = (process.env.FRONTDOOR_PRODUCT_MANIFEST_PATHS ?? "").trim();
  if (productManifestPathsRaw) {
    const manifestPaths = productManifestPathsRaw.split(",").map((p) => p.trim()).filter(Boolean);
    for (const manifestPath of manifestPaths) {
      try {
        // syncProductFromManifest is async but uses sync I/O; await resolves immediately
        void syncProductFromManifest(store, manifestPath).then((result) => {
          console.log(`[startup] product sync: ${result.appId} — ${result.productsUpserted} products, ${result.plansUpserted} plans`);
        }).catch((err) => {
          console.error(`[startup] product sync failed for ${manifestPath}: ${String(err)}`);
        });
      } catch (err) {
        console.error(`[startup] product sync failed for ${manifestPath}: ${String(err)}`);
      }
    }
  }

  const proxy = httpProxy.createProxyServer({
    ws: true,
    changeOrigin: true,
    xfwd: true,
  });

  proxy.on("error", (error, req, res) => {
    const message = `frontdoor proxy error: ${String(error)}`;
    if (res && "writableEnded" in res && !res.writableEnded) {
      sendText(res as ServerResponse, 502, message);
      return;
    }
    if ("socket" in req && req.socket && !req.socket.destroyed) {
      req.socket.destroy();
    }
  });

  // ── Cloud Providers ──
  const standardCloudProvider: CloudProvider | null = options.standardCloudProvider ?? options.cloudProvider ?? (
    process.env.HETZNER_API_TOKEN ? new HetznerProvider({
      apiToken: process.env.HETZNER_API_TOKEN,
      networkId: process.env.HETZNER_NETWORK_ID || "",
      firewallId: process.env.HETZNER_FIREWALL_ID || "",
      sshKeyIds: (process.env.HETZNER_SSH_KEY_IDS || "").split(",").filter(Boolean),
      snapshotId: process.env.HETZNER_SNAPSHOT_ID || "",
      datacenter: "nbg1-dc3",
    }) : null
  );
  const compliantCloudProvider: CloudProvider | null = options.compliantCloudProvider ?? null;
  const envCompliantCloudProvider: CloudProvider | null =
    !compliantCloudProvider &&
    (process.env.AWS_FRONTDOOR_SUBNET_ID || "").trim() &&
    (process.env.AWS_FRONTDOOR_SECURITY_GROUP_IDS || "").trim() &&
    (process.env.AWS_FRONTDOOR_AMI_ID || "").trim()
      ? new AwsEc2Provider({
          region: (process.env.AWS_FRONTDOOR_REGION || process.env.AWS_REGION || "us-east-2").trim(),
          subnetId: (process.env.AWS_FRONTDOOR_SUBNET_ID || "").trim(),
          securityGroupIds: (process.env.AWS_FRONTDOOR_SECURITY_GROUP_IDS || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          amiId: (process.env.AWS_FRONTDOOR_AMI_ID || "").trim(),
          instanceProfileArn: (process.env.AWS_FRONTDOOR_INSTANCE_PROFILE_ARN || "").trim() || undefined,
          instanceProfileName: (process.env.AWS_FRONTDOOR_INSTANCE_PROFILE_NAME || "").trim() || undefined,
          sshKeyName: (process.env.AWS_FRONTDOOR_SSH_KEY_NAME || "").trim() || undefined,
          assignPublicIp:
            (process.env.AWS_FRONTDOOR_ASSIGN_PUBLIC_IP || "").trim().toLowerCase() === "true",
        })
      : null;
  const resolvedCompliantCloudProvider = compliantCloudProvider ?? envCompliantCloudProvider;
  const standardTailscaleAuthKey = (process.env.FRONTDOOR_STANDARD_TAILSCALE_AUTH_KEY || "").trim();
  const frontdoorTailscaleBaseUrl = (process.env.FRONTDOOR_TAILSCALE_BASE_URL || "").trim().replace(/\/+$/g, "");
  const cloudProviders = new Map<string, CloudProvider>();
  if (standardCloudProvider) {
    cloudProviders.set("hetzner", standardCloudProvider);
  }
  if (resolvedCompliantCloudProvider) {
    cloudProviders.set("aws", resolvedCompliantCloudProvider);
  }

  function resolveCloudProviderForServer(server: { provider: string }): CloudProvider | null {
    const providerName = server.provider.trim();
    if (!providerName) {
      return null;
    }
    return cloudProviders.get(providerName) ?? null;
  }

  function resolveProvisionProviderForServerClass(
    serverClass: ServerClass,
  ): { providerName: string; provider: CloudProvider } | null {
    if (serverClass === "compliant") {
      if (!resolvedCompliantCloudProvider) {
        return null;
      }
      return { providerName: "aws", provider: resolvedCompliantCloudProvider };
    }
    if (!standardCloudProvider) {
      return null;
    }
    return { providerName: "hetzner", provider: standardCloudProvider };
  }

  function requiresStandardOverlayTransport(): boolean {
    return resolvedCompliantCloudProvider !== null;
  }

  function resolveBootstrapTransportConfig(params: {
    serverClass: ServerClass;
    providerName: string;
    tenantId: string;
  }):
    | {
        frontdoorUrl: string;
        tailscaleAuthKey?: string;
        tailscaleHostname?: string;
      }
    | null {
    if (params.serverClass === "compliant") {
      return {
        frontdoorUrl: config.internalBaseUrl,
      };
    }
    if (params.providerName !== "hetzner" || !requiresStandardOverlayTransport()) {
      return {
        frontdoorUrl: config.internalBaseUrl,
      };
    }
    if (!frontdoorTailscaleBaseUrl || !standardTailscaleAuthKey) {
      return null;
    }
    return {
      frontdoorUrl: frontdoorTailscaleBaseUrl,
      tailscaleAuthKey: standardTailscaleAuthKey,
      tailscaleHostname: `nex-${params.tenantId}`.slice(0, 63),
    };
  }

  // ── Routing Table ──
  interface TenantRoute {
    tenantId: string;
    serverId: string;
    transportHost: string;
    runtimePort: number;
    runtimeAuthToken: string | null;
    status: "running" | "stopping";
  }

  const routingTable = new Map<string, TenantRoute>();

  function resolveConfiguredTenantRuntimeAuthToken(tenantId: string): string | null {
    const configured = config.tenants.get(tenantId)?.runtimeAuthToken?.trim();
    return configured ? configured : null;
  }

  function resolveEffectiveServerRuntimeAuthToken(server: {
    tenantId: string;
    runtimeAuthToken?: string | null;
  }): string | null {
    const persisted = server.runtimeAuthToken?.trim();
    if (persisted) {
      return persisted;
    }
    return resolveConfiguredTenantRuntimeAuthToken(server.tenantId);
  }

  function resolveServerTransportHost(server: {
    transportHost?: string | null;
    privateIp?: string | null;
  }): string | null {
    const transportHost = server.transportHost?.trim();
    if (transportHost) {
      return transportHost;
    }
    const privateIp = server.privateIp?.trim();
    return privateIp || null;
  }

  function buildEffectiveTenantConfig(server: ServerRecord): TenantConfig {
    const tenant = serverToTenantConfig(server);
    const runtimeAuthToken = resolveEffectiveServerRuntimeAuthToken(server);
    if (runtimeAuthToken) {
      tenant.runtimeAuthToken = runtimeAuthToken;
    } else {
      delete tenant.runtimeAuthToken;
    }
    return tenant;
  }

  function hydrateConfiguredTenantRuntimeAuthTokens(): void {
    for (const server of store.getRunningServers()) {
      if (server.runtimeAuthToken?.trim()) {
        continue;
      }
      const configuredRuntimeAuthToken = resolveConfiguredTenantRuntimeAuthToken(server.tenantId);
      if (!configuredRuntimeAuthToken) {
        continue;
      }
      store.updateServer(server.serverId, {
        runtimeAuthToken: configuredRuntimeAuthToken,
      });
    }
  }

  function initRoutingTable() {
    hydrateConfiguredTenantRuntimeAuthTokens();
    const servers = store.getRunningServers();
    for (const server of servers) {
      const transportHost = resolveServerTransportHost(server);
      if (transportHost && server.runtimePort) {
        routingTable.set(server.tenantId, {
          tenantId: server.tenantId,
          serverId: server.serverId,
          transportHost,
          runtimePort: server.runtimePort,
          runtimeAuthToken: resolveEffectiveServerRuntimeAuthToken(server),
          status: "running",
        });
      }
    }
    for (const tenant of config.tenants.values()) {
      if (routingTable.has(tenant.id)) {
        continue;
      }
      try {
        const runtimeUrl = new URL(tenant.runtimeUrl);
        const hostname = runtimeUrl.hostname.trim();
        if (!hostname) {
          continue;
        }
        const runtimePort =
          runtimeUrl.port.trim().length > 0
            ? Number(runtimeUrl.port)
            : runtimeUrl.protocol === "https:"
              ? 443
              : 80;
        if (!Number.isFinite(runtimePort) || runtimePort <= 0) {
          continue;
        }
        routingTable.set(tenant.id, {
          tenantId: tenant.id,
          serverId: tenant.id,
          transportHost: hostname,
          runtimePort,
          runtimeAuthToken: tenant.runtimeAuthToken ?? null,
          status: "running",
        });
      } catch {
        // Ignore invalid configured runtime URLs here; config validation owns that failure.
      }
    }
    console.log(`[routing] Initialized ${routingTable.size} tenant routes`);
  }

  initRoutingTable();

  // ── Provisioning Timeout Handler ──
  const provisioningTimeoutInterval = setInterval(() => {
    const timeoutMs = Number(process.env.PROVISION_TIMEOUT_MS) || 300000;
    const stuckServers = store.getStuckProvisioningServers(timeoutMs);
    for (const server of stuckServers) {
      console.error(`[provision-timeout] Server ${server.serverId} timed out after ${timeoutMs}ms`);
      store.updateServer(server.serverId, { status: "failed" });
      const serverCloudProvider = resolveCloudProviderForServer(server);
      if (server.providerServerId && serverCloudProvider) {
        serverCloudProvider.destroyServer(server.providerServerId).catch((err) => {
          console.error(`[provision-timeout] Failed to cleanup VPS ${server.providerServerId}:`, err);
        });
      }
    }
  }, 30000);

  // ── Hourly Billing Job ──
  function getHourlyServerRateCents(server: Pick<ServerRecord, "serverClass" | "plan">): number {
    const monthlyCostCents = getServerPlanMonthlyCostCents({
      serverClass: server.serverClass,
      planId: server.plan,
    });
    return Math.max(1, Math.ceil(monthlyCostCents / 730));
  }

  function runHourlyBilling() {
    try {
      // Use UTC hour as billing period key for idempotency
      const now = new Date();
      const billingPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}T${String(now.getUTCHours()).padStart(2, "0")}`;

      const allAccounts = store.getActiveAccountsWithServers();
      for (const account of allAccounts) {
        if (accountHasInternalCreatorBypass(account.accountId)) continue;
        const credits = store.getCreditBalance(account.accountId);
        if (!credits) continue;

        // Skip billing if free tier active
        const isFreeTier = !!(credits.freeTierExpiresAtMs && credits.freeTierExpiresAtMs > Date.now());
        if (isFreeTier) continue;

        // Check idempotency: skip if already billed this hour
        const billingRefId = `billing-${account.accountId}-${billingPeriod}`;
        const recentTransactions = store.getCreditTransactions(account.accountId, { limit: 5 });
        const alreadyBilled = recentTransactions.some((t) => t.referenceId === billingRefId);
        if (alreadyBilled) continue;

        // Calculate hourly cost for all running servers
        let totalCostCents = 0;
        const servers = store.getServersForAccount(account.accountId);
        const runningServers = servers.filter((s) => s.status === "running");
        for (const srv of runningServers) {
          const rate = getHourlyServerRateCents(srv);
          totalCostCents += rate;
        }
        if (totalCostCents === 0) continue;

        // Deduct
        const result = store.deductCredits({
          accountId: account.accountId,
          amountCents: totalCostCents,
          type: "usage",
          description: `Hourly usage: ${runningServers.length} server(s)`,
          referenceId: billingRefId,
        });

        if (!result.ok) {
          // Insufficient balance — suspend servers
          console.warn(
            `[billing] Account ${account.accountId} insufficient balance (${credits.balanceCents}¢), suspending ${runningServers.length} server(s)`,
          );
          for (const srv of runningServers) {
            store.updateServer(srv.serverId, { status: "suspended" });
            routingTable.delete(srv.tenantId);
            console.log(`[billing] Suspended server ${srv.serverId}`);
          }
        }
      }
    } catch (err) {
      console.error("[billing] Hourly billing job error:", err);
    }
  }

  // Run hourly billing every hour
  const hourlyBillingInterval = setInterval(runHourlyBilling, 60 * 60 * 1000);

  function applyRateLimit(params: {
    req: IncomingMessage;
    res: ServerResponse;
    limiter: SlidingWindowRateLimiter;
    key: string;
    error: string;
  }): boolean {
    const verdict = params.limiter.consume(params.key);
    if (verdict.ok) {
      return true;
    }
    if (typeof verdict.retryAfterSeconds === "number") {
      params.res.setHeader("Retry-After", String(verdict.retryAfterSeconds));
    }
    sendJson(params.res, 429, {
      ok: false,
      error: params.error,
      retry_after_seconds: verdict.retryAfterSeconds ?? null,
    });
    return false;
  }

  function hasInternalCreatorBypassForEmail(email: string | null | undefined): boolean {
    const normalized = normalizeEmail(email ?? undefined);
    return !!(normalized && config.devCreatorEmails?.has(normalized));
  }

  function isServerCreatorAuthorized(principal: Principal): boolean {
    if (config.operatorUserIds?.has(principal.userId)) {
      return true;
    }
    if (hasInternalCreatorBypassForEmail(principal.email)) {
      return true;
    }
    return false;
  }

  function hasInternalCreatorBypass(principal: Pick<Principal, "userId" | "email">): boolean {
    if (config.operatorUserIds?.has(principal.userId)) {
      return true;
    }
    return hasInternalCreatorBypassForEmail(principal.email);
  }

  function accountHasInternalCreatorBypass(accountId: string): boolean {
    const members = store.getAccountMembers(accountId);
    return members.some((member) => {
      if (member.role !== "owner" && member.role !== "admin") {
        return false;
      }
      return hasInternalCreatorBypassForEmail(member.email);
    });
  }

  function hasAccountAdminRole(accountId: string, userId: string): boolean {
    const membership = store.getAccountMembership(accountId, userId);
    if (!membership) {
      return false;
    }
    return membership.role === "owner" || membership.role === "admin";
  }

  function hasServerAdminAccess(params: {
    server: ServerRecord;
    userId: string;
    principal: Principal;
  }): boolean {
    if (hasGlobalOperatorAccess(params.principal)) {
      return true;
    }
    if (isServerCreatorAuthorized(params.principal)) {
      return true;
    }
    return hasAccountAdminRole(params.server.accountId, params.userId);
  }

  function hasServerReadAccess(params: {
    server: ServerRecord;
    userId: string;
    principal: Principal;
  }): boolean {
    if (hasGlobalOperatorAccess(params.principal) || isServerCreatorAuthorized(params.principal)) {
      return true;
    }
    return Boolean(store.getAccountMembership(params.server.accountId, params.userId));
  }

  function serverSupportsActiveRuntime(status: ServerStatus): boolean {
    return status === "running";
  }

  function detachServerRuntime(server: ServerRecord): void {
    routingTable.delete(server.tenantId);
    config.tenants.delete(server.tenantId);
  }

  function attachServerRuntime(server: ServerRecord): void {
    const transportHost = resolveServerTransportHost(server);
    if (!transportHost || !server.runtimePort) {
      return;
    }
    routingTable.set(server.tenantId, {
      tenantId: server.tenantId,
      serverId: server.serverId,
      transportHost,
      runtimePort: server.runtimePort,
      runtimeAuthToken: resolveEffectiveServerRuntimeAuthToken(server),
      status: "running",
    });
    config.tenants.set(server.tenantId, buildEffectiveTenantConfig(server));
  }

  function syncServerRuntimeProjection(server: ServerRecord): void {
    if (serverSupportsActiveRuntime(server.status)) {
      attachServerRuntime(server);
      return;
    }
    detachServerRuntime(server);
  }

  async function cleanupRetiredProviderServer(server: ServerRecord): Promise<void> {
    const retiredProviderServerId = server.previousProviderServerId?.trim();
    const serverCloudProvider = resolveCloudProviderForServer(server);
    if (!retiredProviderServerId || !serverCloudProvider) {
      return;
    }
    if (server.provider !== "aws") {
      try {
        await serverCloudProvider.setProtection(retiredProviderServerId, {
          delete: false,
          rebuild: false,
        });
      } catch (error) {
        console.warn(
          `[recovery-cleanup] Failed to clear protection for ${server.serverId} retired provider ${retiredProviderServerId}:`,
          error,
        );
      }
    }
    try {
      await serverCloudProvider.destroyServer(retiredProviderServerId);
    } catch (error) {
      console.error(
        `[recovery-cleanup] Failed to destroy ${server.serverId} retired provider ${retiredProviderServerId}:`,
        error,
      );
      return;
    }
    store.updateServer(server.serverId, {
      previousProviderServerId: null,
      previousPrivateIp: null,
      previousPublicIp: null,
      lastRecoveredAtMs: server.lastRecoveredAtMs ?? Date.now(),
    });
  }

  async function beginReplacementRecovery(params: {
    server: ServerRecord;
    recoveryPoint: ServerRecoveryPointRecord;
  }): Promise<
    | { ok: true; server: ServerRecord }
    | { ok: false; status: number; error: string }
  > {
    const serverCloudProvider = resolveCloudProviderForServer(params.server);
    if (!serverCloudProvider) {
      return {
        ok: false,
        status: 409,
        error: "server_restore_unavailable",
      };
    }
    const currentServer = params.server;
    const runtimeAuthToken = currentServer.runtimeAuthToken?.trim() || `rt-${randomToken(32)}`;
    const provisionToken = `prov-${randomToken(32)}`;
    const bootstrapTransport = resolveBootstrapTransportConfig({
      serverClass: currentServer.serverClass,
      providerName: currentServer.provider,
      tenantId: currentServer.tenantId,
    });
    if (!bootstrapTransport) {
      return {
        ok: false,
        status: 409,
        error: "tailscale_not_configured",
      };
    }
    const cloudInitScript = renderCloudInitScript({
      tenantId: currentServer.tenantId,
      serverId: currentServer.serverId,
      authToken: runtimeAuthToken,
      provisionToken,
      frontdoorUrl: bootstrapTransport.frontdoorUrl,
      runtimeTokenIssuer: config.runtimeTokenIssuer,
      runtimeTokenSecret: config.runtimeTokenSecret,
      runtimeTokenActiveKid: config.runtimeTokenActiveKid,
      tailscaleAuthKey: bootstrapTransport.tailscaleAuthKey,
      tailscaleHostname: bootstrapTransport.tailscaleHostname,
    });
    const providerServerName = `nex-${currentServer.tenantId}-recover-${Date.now().toString(36)}`;
    try {
      const result = await serverCloudProvider.createServer({
        tenantId: currentServer.tenantId,
        planId: currentServer.plan,
        cloudInitScript,
        imageId: params.recoveryPoint.providerArtifactId,
        serverName: providerServerName,
      });
      store.updateServer(currentServer.serverId, {
        status: "recovering",
        providerServerId: result.providerServerId,
        previousProviderServerId: currentServer.providerServerId,
        privateIp: result.privateIp || null,
        transportHost: result.privateIp || null,
        publicIp: result.publicIp || null,
        previousPrivateIp: currentServer.privateIp,
        previousPublicIp: currentServer.publicIp,
        runtimeAuthToken,
        provisionToken,
        backupEnabled: result.backupEnabled,
        deleteProtectionEnabled: result.deleteProtectionEnabled,
        rebuildProtectionEnabled: result.rebuildProtectionEnabled,
        archivedAtMs: null,
        activeRecoveryPointId: params.recoveryPoint.recoveryPointId,
      });
      const updated = store.getServer(currentServer.serverId);
      if (!updated) {
        throw new Error("replacement_recovery_server_missing");
      }
      syncServerRuntimeProjection(updated);
      return {
        ok: true,
        server: updated,
      };
    } catch (error) {
      console.error(`[restore-server] Failed replacement recovery for ${currentServer.serverId}:`, error);
      store.updateServer(currentServer.serverId, {
        status: "failed",
      });
      return {
        ok: false,
        status: 502,
        error: "server_restore_failed",
      };
    }
  }

  function buildServerApiPayload(server: ServerRecord): Record<string, unknown> {
    return {
      server_id: server.serverId,
      display_name: server.displayName,
      generated_name: server.generatedName || deterministicServerNameFromId(server.serverId),
      account_id: server.accountId,
      status: server.status,
      server_class: server.serverClass,
      deployment_class: server.deploymentClass,
      plan: server.plan,
      runtime_public_base_url: getServerPublicUrl(server),
      backup_enabled: server.backupEnabled,
      delete_protection_enabled: server.deleteProtectionEnabled,
      rebuild_protection_enabled: server.rebuildProtectionEnabled,
      archived_at: server.archivedAtMs ? new Date(server.archivedAtMs).toISOString() : null,
      destroyed_at: server.destroyedAtMs ? new Date(server.destroyedAtMs).toISOString() : null,
      last_recovered_at: server.lastRecoveredAtMs
        ? new Date(server.lastRecoveredAtMs).toISOString()
        : null,
      active_recovery_point_id: server.activeRecoveryPointId,
    };
  }

  function parseRequestedServerClass(value: unknown): ServerClass | null {
    if (value === undefined) {
      return "standard";
    }
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "standard" || normalized === "compliant") {
      return normalized;
    }
    return null;
  }

  function parseRequestedServerDeploymentClass(value: unknown): ServerDeploymentClass | null {
    if (value === undefined) {
      return "customer_server";
    }
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "customer_server" || normalized === "product_control_plane") {
      return normalized;
    }
    return null;
  }

  function parsePackageHostingPolicy(manifestJson: string): PackageHostingPolicy {
    try {
      const manifest = JSON.parse(manifestJson) as {
        hosting?: {
          required_server_class?: unknown;
          deployment_class?: unknown;
        };
      };
      const requiredServerClassRaw = manifest.hosting?.required_server_class;
      const deploymentClassRaw = manifest.hosting?.deployment_class;
      const requiredServerClass =
        requiredServerClassRaw === "compliant" ? "compliant" : "standard";
      const deploymentClass =
        deploymentClassRaw === "product_control_plane" ? "product_control_plane" : "customer_server";
      return {
        requiredServerClass,
        deploymentClass,
      };
    } catch {
      return {
        requiredServerClass: "standard",
        deploymentClass: "customer_server",
      };
    }
  }

  function getPackageHostingPolicyForRelease(releaseId: string): PackageHostingPolicy {
    const release = store.getPackageRelease(releaseId);
    if (!release) {
      return {
        requiredServerClass: "standard",
        deploymentClass: "customer_server",
      };
    }
    return parsePackageHostingPolicy(release.manifestJson);
  }

  function getTopLevelAppHostingPolicy(appId: string): PackageHostingPolicy {
    const variant = store.getLatestPackageReleaseVariant("app", appId);
    if (!variant) {
      return {
        requiredServerClass: "standard",
        deploymentClass: "customer_server",
      };
    }
    return getPackageHostingPolicyForRelease(variant.releaseId);
  }

  function getRequestedPackageHostingPolicy(
    kind: FrontdoorPackageKind,
    packageId: string,
    versionConstraint: string,
  ): PackageHostingPolicy {
    const normalizedVersion = versionConstraint.trim() || "latest";
    const variant =
      normalizedVersion === "latest"
        ? store.getLatestPackageReleaseVariant(kind, packageId)
        : store.getPackageReleaseVariant(kind, packageId, normalizedVersion);
    if (!variant) {
      return {
        requiredServerClass: "standard",
        deploymentClass: "customer_server",
      };
    }
    return getPackageHostingPolicyForRelease(variant.releaseId);
  }

  function serverSatisfiesRequiredServerClass(
    server: ServerRecord,
    requiredServerClass: ServerClass,
  ): boolean {
    return requiredServerClass === "standard" || server.serverClass === "compliant";
  }

  function serverSatisfiesDeploymentClass(
    server: ServerRecord,
    deploymentClass: ServerDeploymentClass,
  ): boolean {
    return server.deploymentClass === deploymentClass;
  }

  function validatePackageInstallPolicyForServer(params: {
    server: ServerRecord;
    packageId: string;
    releaseId: string;
  }):
    | { ok: true }
    | { ok: false; error: string; detail: string; status: number } {
    const policy = getPackageHostingPolicyForRelease(params.releaseId);
    if (!serverSatisfiesRequiredServerClass(params.server, policy.requiredServerClass)) {
      return {
        ok: false,
        error: "package_requires_compliant_server",
        detail: `${params.packageId} requires ${policy.requiredServerClass}`,
        status: 409,
      };
    }
    if (!serverSatisfiesDeploymentClass(params.server, policy.deploymentClass)) {
      return {
        ok: false,
        error: "package_deployment_class_mismatch",
        detail: `${params.packageId} requires ${policy.deploymentClass}`,
        status: 409,
      };
    }
    return { ok: true };
  }

  function validateResolvedPackagePlanForServer(params: {
    server: ServerRecord;
    steps: ResolvedPackagePlanStep[];
  }):
    | { ok: true }
    | { ok: false; error: string; detail: string; status: number } {
    for (const step of params.steps) {
      const validation = validatePackageInstallPolicyForServer({
        server: params.server,
        packageId: step.packageId,
        releaseId: step.variant.releaseId,
      });
      if (!validation.ok) {
        return validation;
      }
    }
    return { ok: true };
  }

  function resolveAccessibleAccountsForSession(session: SessionRecord): {
    accounts: AccountRecord[];
    activeAccount: AccountRecord | null;
  } {
    const accounts = store.getAccountsForUser(session.principal.userId);
    const activeAccount = session.principal.accountId
      ? accounts.find((item) => item.accountId === session.principal.accountId) ?? null
      : accounts.length === 1
        ? (accounts[0] ?? null)
        : null;
    return {
      accounts,
      activeAccount,
    };
  }

  function resolveServerRuntime(serverId: string): TenantConfig | null {
    const server = store.getServer(serverId);
    if (!server) {
      return null;
    }
    const effectiveRuntimeAuthToken = resolveEffectiveServerRuntimeAuthToken(server);
    const configTenant = config.tenants.get(server.tenantId);
    if (configTenant) {
      const nextTenant: TenantConfig =
        configTenant.runtimeAuthToken === effectiveRuntimeAuthToken
          ? configTenant
          : {
              ...configTenant,
              ...(effectiveRuntimeAuthToken ? { runtimeAuthToken: effectiveRuntimeAuthToken } : {}),
            };
      if (!effectiveRuntimeAuthToken && "runtimeAuthToken" in nextTenant) {
        delete nextTenant.runtimeAuthToken;
      }
      if (nextTenant !== configTenant) {
        config.tenants.set(server.tenantId, nextTenant);
      }
      return nextTenant;
    }
    const tenant = buildEffectiveTenantConfig(server);
    config.tenants.set(server.tenantId, tenant);
    return tenant;
  }

  function fulfillPlatformOwnedProductControlPlaneOperation(params: {
    context: ProductControlPlaneRuntimeContext;
  }): { status: number; payload: Record<string, unknown> } | null {
    if (
      params.context.appId === "aix" &&
      params.context.operation === "aix.hostedContext.get"
    ) {
      const runtime = resolveServerRuntime(params.context.server.serverId);
      const runtimePublicBaseUrl =
        runtime?.runtimePublicBaseUrl?.trim() || getServerPublicUrl(params.context.server);
      return {
        status: 200,
        payload: {
          ok: true,
          result: {
            app_id: params.context.appId,
            server_id: params.context.server.serverId,
            tenant_id: params.context.tenantId,
            runtime_public_base_url: runtimePublicBaseUrl,
          },
        },
      };
    }
    return null;
  }

  // DELETED: resolveManagedRuntimeAppConfig — legacy config injection code removed (hard cutover)

  // DELETED: waitForLoopbackPort, restartTenantRuntimeForServer, resolveServerStateDir,
  // attachRuntimeAppOnServer — legacy config injection code removed (hard cutover).
  // App installation now uses SSH/SCP tarball delivery + runtime HTTP API via installAppOnServer().

  function resolveServerAdminAccess(params: {
    session: SessionRecord;
    serverId: string;
  }):
    | {
        ok: true;
        server: ServerRecord;
      }
    | {
        ok: false;
        status: number;
        error: string;
      } {
    const server = store.getServer(params.serverId);
    if (!server) {
      return {
        ok: false,
        status: 404,
        error: "server_not_found",
      };
    }
    const canAdmin = hasServerAdminAccess({
      server,
      userId: params.session.principal.userId,
      principal: params.session.principal,
    });
    if (!canAdmin) {
      return {
        ok: false,
        status: 403,
        error: "server_admin_forbidden",
      };
    }
    return {
      ok: true,
      server,
    };
  }

  function resolveServerReadAccess(params: {
    session: SessionRecord;
    serverId: string;
  }):
    | {
        ok: true;
        server: ServerRecord;
      }
    | {
        ok: false;
        status: number;
        error: string;
      } {
    const server = store.getServer(params.serverId);
    if (!server) {
      return {
        ok: false,
        status: 404,
        error: "server_not_found",
      };
    }
    const canRead = hasServerReadAccess({
      server,
      userId: params.session.principal.userId,
      principal: params.session.principal,
    });
    if (!canRead) {
      return {
        ok: false,
        status: 403,
        error: "server_not_authorized",
      };
    }
    return {
      ok: true,
      server,
    };
  }

  async function archiveServer(params: {
    session: SessionRecord;
    serverId: string;
  }): Promise<
    | { ok: true; server: ServerRecord }
    | { ok: false; error: string; status: number }
  > {
    const access = resolveServerAdminAccess(params);
    if (!access.ok) {
      return access;
    }
    const server = access.server;
    if (server.status === "destroyed") {
      return {
        ok: false,
        status: 409,
        error: "server_destroyed",
      };
    }
    if (server.status === "archived") {
      return {
        ok: true,
        server,
      };
    }
    if (server.status === "provisioning" || server.status === "recovering") {
      return {
        ok: false,
        status: 409,
        error: "server_not_archiveable",
      };
    }
    try {
      const serverCloudProvider = resolveCloudProviderForServer(server);
      if (server.providerServerId && serverCloudProvider) {
        await serverCloudProvider.archiveServer(server.providerServerId);
      }
      store.updateServer(server.serverId, {
        status: "archived",
        archivedAtMs: Date.now(),
      });
      const updated = store.getServer(server.serverId) ?? {
        ...server,
        status: "archived" as const,
        archivedAtMs: Date.now(),
      };
      syncServerRuntimeProjection(updated);
      return {
        ok: true,
        server: updated,
      };
    } catch (error) {
      console.error(`[archive-server] Failed to archive ${server.serverId}:`, error);
      store.updateServer(server.serverId, { status: "failed" });
      return {
        ok: false,
        status: 502,
        error: "server_archive_failed",
      };
    }
  }

  async function restoreServer(params: {
    session: SessionRecord;
    serverId: string;
  }): Promise<
    | { ok: true; server: ServerRecord }
    | { ok: false; error: string; status: number }
  > {
    const access = resolveServerAdminAccess(params);
    if (!access.ok) {
      return access;
    }
    const server = access.server;
    if (server.status === "destroyed") {
      return {
        ok: false,
        status: 409,
        error: "server_destroyed",
      };
    }
    if (server.status === "running") {
      return {
        ok: true,
        server,
      };
    }
    if (server.status !== "archived" && server.status !== "suspended" && server.status !== "failed") {
      return {
        ok: false,
        status: 409,
        error: "server_not_restorable",
      };
    }
    if (server.status === "failed") {
      const recoveryPointId = server.activeRecoveryPointId?.trim();
      if (!recoveryPointId) {
        return {
          ok: false,
          status: 409,
          error: "recovery_point_required",
        };
      }
      const recoveryPoint = store.getServerRecoveryPoint(server.serverId, recoveryPointId);
      if (!recoveryPoint) {
        return {
          ok: false,
          status: 404,
          error: "recovery_point_not_found",
        };
      }
      return beginReplacementRecovery({
        server,
        recoveryPoint,
      });
    }
    store.updateServer(server.serverId, {
      status: "recovering",
    });
    try {
      const serverCloudProvider = resolveCloudProviderForServer(server);
      if (server.providerServerId && serverCloudProvider) {
        await serverCloudProvider.restoreServer(server.providerServerId);
      }
      store.updateServer(server.serverId, {
        status: "running",
        archivedAtMs: null,
        lastRecoveredAtMs: Date.now(),
      });
      const updated = store.getServer(server.serverId) ?? {
        ...server,
        status: "running" as const,
        archivedAtMs: null,
        lastRecoveredAtMs: Date.now(),
      };
      syncServerRuntimeProjection(updated);
      return {
        ok: true,
        server: updated,
      };
    } catch (error) {
      console.error(`[restore-server] Failed to restore ${server.serverId}:`, error);
      store.updateServer(server.serverId, {
        status: "failed",
      });
      return {
        ok: false,
        status: 502,
        error: "server_restore_failed",
      };
    }
  }

  async function createNamedRecoveryPoint(params: {
    session: SessionRecord;
    serverId: string;
    label: string;
    notes?: string | null;
  }): Promise<
    | { ok: true; recoveryPoint: ReturnType<FrontdoorStore["createServerRecoveryPoint"]> }
    | { ok: false; error: string; status: number }
  > {
    const access = resolveServerAdminAccess(params);
    if (!access.ok) {
      return access;
    }
    const server = access.server;
    const serverCloudProvider = resolveCloudProviderForServer(server);
    if (!server.providerServerId || !serverCloudProvider) {
      return {
        ok: false,
        status: 409,
        error: "recovery_points_unavailable",
      };
    }
    if (server.status === "destroy_pending" || server.status === "destroyed") {
      return {
        ok: false,
        status: 409,
        error: "server_not_recoverable",
      };
    }
    try {
      const created = await serverCloudProvider.createRecoveryPoint(server.providerServerId, params.label);
      const record = store.createServerRecoveryPoint({
        serverId: server.serverId,
        tenantId: server.tenantId,
        provider: server.provider,
        providerArtifactId: created.providerArtifactId,
        captureType: created.captureType,
        label: params.label,
        notes: params.notes ?? null,
      });
      store.updateServer(server.serverId, {
        activeRecoveryPointId: record.recoveryPointId,
      });
      return {
        ok: true,
        recoveryPoint: record,
      };
    } catch (error) {
      console.error(`[create-recovery-point] Failed for ${server.serverId}:`, error);
      return {
        ok: false,
        status: 502,
        error: "recovery_point_create_failed",
      };
    }
  }

  async function destroyServer(params: {
    session: SessionRecord;
    serverId: string;
  }): Promise<
    | { ok: true; server: ServerRecord }
    | { ok: false; error: string; status: number }
  > {
    const access = resolveServerAdminAccess(params);
    if (!access.ok) {
      return access;
    }
    const server = access.server;
    if (server.status === "destroyed") {
      return {
        ok: true,
        server,
      };
    }
    const archivedAtMs = server.archivedAtMs ?? Date.now();
    store.updateServer(server.serverId, {
      status: "destroy_pending",
      archivedAtMs,
    });
    detachServerRuntime(server);
    try {
      const serverCloudProvider = resolveCloudProviderForServer(server);
      if (server.providerServerId && serverCloudProvider) {
        if (server.provider !== "aws") {
          await serverCloudProvider.setProtection(server.providerServerId, {
            delete: false,
            rebuild: false,
          });
        }
        store.updateServer(server.serverId, {
          deleteProtectionEnabled: false,
          rebuildProtectionEnabled: false,
        });
        await serverCloudProvider.destroyServer(server.providerServerId);
      }
      if (server.previousProviderServerId && serverCloudProvider) {
        if (server.provider !== "aws") {
          await serverCloudProvider.setProtection(server.previousProviderServerId, {
            delete: false,
            rebuild: false,
          });
        }
        await serverCloudProvider.destroyServer(server.previousProviderServerId);
      }
      store.updateServer(server.serverId, {
        status: "destroyed",
        destroyedAtMs: Date.now(),
        previousProviderServerId: null,
        previousPrivateIp: null,
        previousPublicIp: null,
      });
      const updated = store.getServer(server.serverId) ?? {
        ...server,
        status: "destroyed" as const,
        archivedAtMs,
        deleteProtectionEnabled: false,
        rebuildProtectionEnabled: false,
        destroyedAtMs: Date.now(),
      };
      return {
        ok: true,
        server: updated,
      };
    } catch (error) {
      console.error(`[destroy-server] Failed to destroy ${server.serverId}:`, error);
      store.updateServer(server.serverId, {
        status: "archived",
        archivedAtMs,
      });
      const fallback = store.getServer(server.serverId) ?? {
        ...server,
        status: "archived" as const,
        archivedAtMs,
      };
      syncServerRuntimeProjection(fallback);
      return {
        ok: false,
        status: 502,
        error: "server_destroy_failed",
      };
    }
  }

  function resolvePreferredProvisionIdentity(userId: string): {
    provider: string;
    subject: string;
  } | null {
    const links = store.listIdentityLinksForUser(userId);
    if (links.length === 0) {
      return null;
    }
    const allowedProviders = new Set(
      config.autoProvision.providers
        .map((provider) => provider.trim().toLowerCase())
        .filter((provider) => provider.length > 0),
    );
    const candidates =
      allowedProviders.size > 0
        ? links.filter((link) => allowedProviders.has(link.provider))
        : links;
    if (candidates.length === 0) {
      return null;
    }
    const nonPassword = candidates.find((link) => link.provider !== "password") ?? candidates[0];
    if (!nonPassword) {
      return null;
    }
    return {
      provider: nonPassword.provider,
      subject: nonPassword.subject,
    };
  }

  async function provisionServerAndInstallAppForSession(params: {
    session: SessionRecord;
    appId: string;
    requestId: string;
  }): Promise<
    | {
        ok: true;
        session: SessionRecord;
        serverId: string;
      }
    | {
        ok: false;
        status: number;
        error: string;
        detail?: string;
      }
  > {
    const user = store.getUserById(params.session.principal.userId);
    const appHostingPolicy = getTopLevelAppHostingPolicy(params.appId);
    if (!user || user.disabled) {
      return {
        ok: false,
        status: 401,
        error: "user_not_found",
      };
    }

    // ── Determine provisioning strategy ──
    // Prefer autoProvisioner with a configured command (legacy path).
    // Fall back to managed cloud providers when available.
    const useAutoProvisioner =
      autoProvisioner && config.autoProvision.command;
    const provisionProvider = !useAutoProvisioner
      ? resolveProvisionProviderForServerClass(appHostingPolicy.requiredServerClass)
      : null;
    const useCloudProvider = !useAutoProvisioner && !!provisionProvider;

    if (!useAutoProvisioner && !useCloudProvider) {
      return {
        ok: false,
        status: 400,
        error: "provisioning_not_configured",
        detail: "Neither autoprovision command nor cloud provider is available",
      };
    }
    // Ensure user has an account
    const accounts = store.getAccountsForUser(user.userId);
    const account = accounts[0] ?? store.createAccount(user.displayName || user.userId, user.userId);
    store.addAccountMember(account.accountId, user.userId, "owner");

    // Credit / free-tier check
    const credits = store.getCreditBalance(account.accountId);
    const isFreeTier = !!(credits?.freeTierExpiresAtMs && credits.freeTierExpiresAtMs > Date.now());
    const hasBalance = !!(credits && credits.balanceCents > 0);
    const hasInternalBypass = hasInternalCreatorBypassForEmail(user.email);

    if (!hasInternalBypass && !isFreeTier && !hasBalance) {
      return {
        ok: false,
        status: 402,
        error: "payment_required",
        detail: "Add credits to your account before creating a server",
      };
    }

    // Free tier: 1 server max
    if (!hasInternalBypass && isFreeTier && !hasBalance) {
      const existingServers = store
        .getServersForAccount(account.accountId)
        .filter((s: { status: string }) => s.status !== "destroyed");
      if (existingServers.length >= 1) {
        return {
          ok: false,
          status: 402,
          error: "free_tier_server_limit",
          detail: "Free tier is limited to 1 server. Add credits for additional servers.",
        };
      }
    }

    // Create app subscription at account level (so auto-install picks it up)
    store.createAppSubscription({
      accountId: account.accountId,
      appId: params.appId,
      planId: "starter",
      status: "active",
      provider: "none",
    });

    // ── Cloud Provider Path ──
    if (useCloudProvider) {
      if (appHostingPolicy.deploymentClass !== "customer_server") {
        return {
          ok: false,
          status: 409,
          error: "deployment_class_not_supported",
          detail: "Product control plane server provisioning requires a dedicated provider path",
        };
      }
      const serverId = `srv-${randomUUID().slice(0, 12)}`;
      const tenantId = `t-${randomUUID().slice(0, 12)}`;
      const provisionToken = `prov-${randomToken(32)}`;
      const runtimeAuthToken = `rt-${randomToken(32)}`;
      const generatedName = `Server ${Date.now().toString(36)}`;
      const bootstrapTransport = resolveBootstrapTransportConfig({
        serverClass: appHostingPolicy.requiredServerClass,
        providerName: provisionProvider!.providerName,
        tenantId,
      });
      if (!bootstrapTransport) {
        return {
          ok: false,
          status: 409,
          error: "tailscale_not_configured",
          detail: "standard hosted provisioning requires FRONTDOOR_TAILSCALE_BASE_URL and FRONTDOOR_STANDARD_TAILSCALE_AUTH_KEY",
        };
      }

      const server = store.createServer({
        serverId,
        accountId: account.accountId,
        tenantId,
        displayName: generatedName,
        generatedName,
        serverClass: appHostingPolicy.requiredServerClass,
        deploymentClass: appHostingPolicy.deploymentClass,
        plan: "cax11",
        provider: provisionProvider!.providerName,
        provisionToken,
        runtimeAuthToken,
      });

      const cloudInitScript = renderCloudInitScript({
        tenantId,
        serverId,
        authToken: runtimeAuthToken,
        provisionToken,
        frontdoorUrl: bootstrapTransport.frontdoorUrl,
        runtimeTokenIssuer: config.runtimeTokenIssuer,
        runtimeTokenSecret: config.runtimeTokenSecret,
        runtimeTokenActiveKid: config.runtimeTokenActiveKid,
        tailscaleAuthKey: bootstrapTransport.tailscaleAuthKey,
        tailscaleHostname: bootstrapTransport.tailscaleHostname,
      });

      try {
        const result = await provisionProvider!.provider.createServer({
          tenantId,
          planId: "cax11",
          cloudInitScript,
        });
        store.updateServer(serverId, {
          providerServerId: result.providerServerId,
          privateIp: result.privateIp || undefined,
          transportHost: result.privateIp || undefined,
          publicIp: result.publicIp || undefined,
          backupEnabled: result.backupEnabled,
          deleteProtectionEnabled: result.deleteProtectionEnabled,
          rebuildProtectionEnabled: result.rebuildProtectionEnabled,
        });
        console.log(`[entry-provision] VPS created for ${serverId}: provider=${result.providerServerId}`);
      } catch (err) {
        console.error(`[entry-provision] Managed provider failed:`, err);
        store.updateServer(serverId, { status: "failed" });
        return {
          ok: false,
          status: 500,
          error: "cloud_create_failed",
          detail: String(err),
        };
      }

      // Update session to point to new server
      const nextPrincipal = store.toPrincipal({
        user,
        server,
        accountId: account.accountId,
        amr: params.session.principal.amr.length > 0 ? params.session.principal.amr : ["oidc"],
      });
      const updatedSession = sessions.updateSessionPrincipal(params.session.id, nextPrincipal) ?? {
        ...params.session,
        principal: nextPrincipal,
      };

      // Don't install app here — the phone-home callback + auto-install handles it
      // (VPS needs to boot and phone home first, which takes 30-60s)
      return {
        ok: true,
        session: updatedSession,
        serverId,
      };
    }

    // ── Auto-Provisioner Path (legacy external command) ──
    if (appHostingPolicy.requiredServerClass !== "standard") {
      return {
        ok: false,
        status: 409,
        error: "server_class_not_supported",
        detail: "Compliant server provisioning requires the AWS provider path",
      };
    }
    if (appHostingPolicy.deploymentClass !== "customer_server") {
      return {
        ok: false,
        status: 409,
        error: "deployment_class_not_supported",
        detail: "Product control plane server provisioning requires the AWS provider path",
      };
    }
    const identity = resolvePreferredProvisionIdentity(user.userId);
    if (!identity) {
      return {
        ok: false,
        status: 409,
        error: "autoprovision_identity_unavailable",
      };
    }
    const claims: OidcClaims = {
      sub: identity.subject,
      email: user.email,
      name: user.displayName,
    };
    let resolvedPrincipal: Principal | null = null;
    try {
      resolvedPrincipal = await autoProvisioner!.resolveOrProvision({
        provider: identity.provider,
        claims,
        fallbackPrincipal: params.session.principal,
        productId: params.appId,
      });
    } catch (error) {
      return {
        ok: false,
        status: 500,
        error: "autoprovision_failed",
        detail: String(error),
      };
    }
    const tenantId = readOptionalString(resolvedPrincipal?.tenantId);
    if (!tenantId) {
      return {
        ok: false,
        status: 500,
        error: "autoprovision_tenant_missing",
      };
    }
    const tenant = config.tenants.get(tenantId);
    if (!tenant) {
      return {
        ok: false,
        status: 500,
        error: "autoprovision_runtime_missing",
      };
    }

    // Upsert the server
    const server = store.upsertServer({
      serverId: tenant.id,
      accountId: account.accountId,
      tenantId: tenant.id,
      displayName: tenant.id,
      generatedName: deterministicServerNameFromId(tenant.id),
      status: "running",
      serverClass: "standard",
      deploymentClass: "customer_server",
      plan: "cax11",
      provider: "hetzner",
      providerServerId: null,
      previousProviderServerId: null,
      privateIp: null,
      transportHost: null,
      publicIp: null,
      previousPrivateIp: null,
      previousPublicIp: null,
      runtimePort: 8080,
      runtimeAuthToken: tenant.runtimeAuthToken ?? null,
      provisionToken: null,
      backupEnabled: false,
      deleteProtectionEnabled: false,
      rebuildProtectionEnabled: false,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      archivedAtMs: null,
      destroyedAtMs: null,
      lastRecoveredAtMs: null,
      activeRecoveryPointId: null,
    });

    const nextPrincipal = store.toPrincipal({
      user,
      server,
      accountId: account.accountId,
      amr: params.session.principal.amr.length > 0 ? params.session.principal.amr : ["oidc"],
    });
    const updatedSession = sessions.updateSessionPrincipal(params.session.id, nextPrincipal) ?? {
      ...params.session,
      principal: nextPrincipal,
    };
    const installed = await installAppOnServer({
      serverId: server.serverId,
      appId: params.appId,
      accountId: account.accountId,
      source: "purchase",
    });
    if (!installed.ok) {
      return {
        ok: false,
        status: installed.status ?? 500,
        error: installed.error,
        detail: installed.detail,
      };
    }
    return {
      ok: true,
      session: updatedSession,
      serverId: server.serverId,
    };
  }

  function resolveActiveServerContext(params: {
    session: SessionRecord;
    requestedServerId?: string;
  }):
    | {
        ok: true;
        session: SessionRecord;
        principal: Principal;
        server: ServerRecord;
        serverRuntime: TenantConfig;
        serverCount: number;
        accountId: string;
      }
    | {
        ok: false;
        status: number;
        error: string;
        serverCount: number;
      } {
    const user = store.getUserById(params.session.principal.userId);
    if (!user || user.disabled) {
      return {
        ok: false,
        status: 401,
        error: "user_not_found",
        serverCount: 0,
      };
    }
    const { activeAccount } = resolveAccessibleAccountsForSession(params.session);
    const allAccessibleServers = store.getServersForUser(user.userId);
    const scopedServers = activeAccount
      ? store.getServersForAccount(activeAccount.accountId)
      : allAccessibleServers;
    const serverCount = scopedServers.length;
    let selected: ServerRecord | null = params.requestedServerId
      ? allAccessibleServers.find((item) => item.serverId === params.requestedServerId) ?? null
      : null;
    if (params.requestedServerId && !selected) {
      return {
        ok: false,
        status: 403,
        error: "server_not_authorized",
        serverCount,
      };
    }

    if (!selected) {
      if (params.session.principal.serverId) {
        selected =
          scopedServers.find((item) => item.serverId === params.session.principal.serverId) ?? null;
      }
      if (!selected && serverCount === 1) {
        selected = scopedServers[0] ?? null;
      }
    }

    if (!selected) {
      if (serverCount === 0) {
        return {
          ok: false,
          status: 403,
          error: "no_server_access",
          serverCount,
        };
      }
      return {
        ok: false,
        status: 409,
        error: "server_selection_required",
        serverCount,
      };
    }

    if (!serverSupportsActiveRuntime(selected.status)) {
      return {
        ok: false,
        status: 409,
        error: "server_not_running",
        serverCount: scopedServers.length,
      };
    }

    const runtime = resolveServerRuntime(selected.serverId);
    if (!runtime) {
      return {
        ok: false,
        status: 404,
        error: "server_runtime_not_found",
        serverCount: scopedServers.length,
      };
    }

    const nextPrincipal = store.toPrincipal({
      user,
      server: selected,
      accountId: selected.accountId,
      amr: params.session.principal.amr,
    });
    const updated = sessions.updateSessionPrincipal(params.session.id, nextPrincipal) ?? {
      ...params.session,
      principal: nextPrincipal,
    };

    return {
      ok: true,
      session: updated,
      principal: nextPrincipal,
      server: selected,
      serverRuntime: runtime,
      serverCount: scopedServers.length,
      accountId: selected.accountId,
    };
  }

  function syncEntitlementsFromPlan(accountId: string, appId: string, planId: string): void {
    store.syncEntitlementsFromPlan(accountId, appId, planId);
  }

  function processBillingWebhookEvent(event: BillingWebhookEvent): {
    serverId?: string;
    status: string;
  } {
    const payload = event.payload;
    const serverIdFromEvent = event.serverId?.trim() || undefined;
    const data = asRecord(payload.data);
    const object = asRecord(data?.object);

    if (event.provider === "mock") {
      // Handle mock credit deposit
      if (readOptionalString(payload.type) === "credit_deposit") {
        const depositAccountId = readOptionalString(payload.account_id);
        const depositAmount = readOptionalNumber(payload.amount_cents);
        if (depositAccountId && depositAmount && depositAmount > 0) {
          store.addCredits({
            accountId: depositAccountId,
            amountCents: depositAmount,
            type: "deposit",
            description: `Mock deposit: $${(depositAmount / 100).toFixed(2)}`,
            referenceId: event.eventId,
          });
          const acctServers = store.getServersForAccount(depositAccountId);
          for (const s of acctServers) {
            if (s.status === "suspended") {
              store.updateServer(s.serverId, { status: "running" });
            }
          }
          return { serverId: depositAccountId, status: "credit_deposited" };
        }
      }
      const serverId = serverIdFromEvent ?? readOptionalString(payload.server_id);
      if (!serverId) {
        return { status: "ignored_server_missing" };
      }
      const server = store.getServer(serverId);
      if (!server) {
        return { status: "ignored_server_missing" };
      }
      const planId = normalizeEmail(readOptionalString(payload.plan_id) || "").replace(/[^a-z0-9_-]/g, "") || "starter";
      const subscriptionStatus = readOptionalString(payload.status) || "active";
      store.createServerSubscription({
        serverId,
        accountId: server.accountId,
        tier: planId,
        status: subscriptionStatus,
        provider: "mock",
        customerId: readOptionalString(payload.customer_id),
        subscriptionId: readOptionalString(payload.subscription_id),
        periodStartMs: readOptionalNumber(payload.period_start_ms),
        periodEndMs: readOptionalNumber(payload.period_end_ms),
      });
      const appId = readOptionalString(payload.app_id) || "console";
      syncEntitlementsFromPlan(server.accountId, appId, planId);
      const invoice = asRecord(payload.invoice);
      const invoiceId = readOptionalString(invoice?.invoice_id) || readOptionalString(payload.invoice_id);
      if (invoiceId) {
        store.upsertAccountInvoice({
          accountId: server.accountId,
          invoiceId,
          provider: "mock",
          status: readOptionalString(invoice?.status) || readOptionalString(payload.invoice_status) || "open",
          amountDue: readOptionalNumber(invoice?.amount_due) ?? readOptionalNumber(payload.amount_due) ?? 0,
          currency: readOptionalString(invoice?.currency) || readOptionalString(payload.currency) || "usd",
          hostedInvoiceUrl:
            readOptionalString(invoice?.hosted_invoice_url) ||
            readOptionalString(payload.hosted_invoice_url),
          periodStartMs: readOptionalNumber(invoice?.period_start_ms),
          periodEndMs: readOptionalNumber(invoice?.period_end_ms),
          createdAtMs: readOptionalNumber(invoice?.created_at_ms),
          paidAtMs: readOptionalNumber(invoice?.paid_at_ms),
        });
      }
      return { serverId, status: "processed" };
    }

    const metadata = asRecord(object?.metadata);
    const serverId = serverIdFromEvent ?? readOptionalString(metadata?.server_id);
    if (!serverId) {
      return { status: "ignored_server_missing" };
    }
    const server = store.getServer(serverId);
    if (!server) {
      return { status: "ignored_server_missing" };
    }

    if (event.eventType.startsWith("customer.subscription.")) {
      const resolvedPlanId = resolveBillingPlanFromStripeObject(object ?? {});
      store.createServerSubscription({
        serverId,
        accountId: server.accountId,
        tier: resolvedPlanId,
        status: readOptionalString(object?.status) || "active",
        provider: "stripe",
        customerId: readOptionalString(object?.customer),
        subscriptionId: readOptionalString(object?.id),
        periodStartMs: msFromUnixSeconds(object?.current_period_start),
        periodEndMs: msFromUnixSeconds(object?.current_period_end),
      });
      const appId = readOptionalString(metadata?.app_id) || "console";
      syncEntitlementsFromPlan(server.accountId, appId, resolvedPlanId);
      return { serverId, status: "processed" };
    }

    if (event.eventType === "checkout.session.completed") {
      // Handle credit deposit checkout
      if (readOptionalString(metadata?.type) === "credit_deposit") {
        const depositAccountId = readOptionalString(metadata?.account_id);
        const depositAmount = readOptionalNumber(metadata?.amount_cents);
        if (depositAccountId && depositAmount && depositAmount > 0) {
          store.addCredits({
            accountId: depositAccountId,
            amountCents: depositAmount,
            type: "deposit",
            description: `Stripe deposit: $${(depositAmount / 100).toFixed(2)}`,
            referenceId: readOptionalString(object?.payment_intent) || readOptionalString(object?.id),
          });
          // If account has suspended servers, unsuspend them
          const acctServers = store.getServersForAccount(depositAccountId);
          for (const s of acctServers) {
            if (s.status === "suspended") {
              store.updateServer(s.serverId, { status: "running" });
              console.log(`[billing] Unsuspended server ${s.serverId} after credit deposit`);
            }
          }
          return { serverId: depositAccountId, status: "credit_deposited" };
        }
      }

      const checkoutPlanId = readOptionalString(metadata?.plan_id) || "starter";
      store.createServerSubscription({
        serverId,
        accountId: server.accountId,
        tier: checkoutPlanId,
        status: "active",
        provider: "stripe",
        customerId: readOptionalString(object?.customer),
        subscriptionId: readOptionalString(object?.subscription),
      });
      const appId = readOptionalString(metadata?.app_id) || "console";
      syncEntitlementsFromPlan(server.accountId, appId, checkoutPlanId);
      return { serverId, status: "processed" };
    }

    if (event.eventType.startsWith("invoice.")) {
      const invoiceId = readOptionalString(object?.id);
      if (!invoiceId) {
        return { serverId, status: "ignored_invoice_missing_id" };
      }
      const status = readOptionalString(object?.status) || "open";
      const statusTransitions = asRecord(object?.status_transitions);
      store.upsertAccountInvoice({
        accountId: server.accountId,
        invoiceId,
        provider: "stripe",
        status,
        amountDue: readOptionalNumber(object?.amount_due) ?? 0,
        currency: readOptionalString(object?.currency) || "usd",
        hostedInvoiceUrl: readOptionalString(object?.hosted_invoice_url),
        periodStartMs: msFromUnixSeconds(object?.period_start),
        periodEndMs: msFromUnixSeconds(object?.period_end),
        createdAtMs: msFromUnixSeconds(object?.created),
        paidAtMs: msFromUnixSeconds(statusTransitions?.paid_at),
      });
      if (event.eventType === "invoice.payment_failed") {
        const current = store.getServerSubscription(serverId);
        if (current) {
          store.createServerSubscription({
            serverId,
            accountId: server.accountId,
            tier: current.tier,
            status: "past_due",
            provider: "stripe",
            customerId: current.customerId,
            subscriptionId: current.subscriptionId,
            periodStartMs: current.periodStartMs,
            periodEndMs: current.periodEndMs,
          });
        }
      }
      return { serverId, status: "processed" };
    }

    return { serverId, status: "ignored_event_type" };
  }

  function proxyRuntimeRequest(params: {
    req: IncomingMessage;
    res: ServerResponse;
    url: URL;
    session: SessionRecord;
    principal: Principal;
    runtime: TenantConfig;
    route: "runtime" | "app";
  }): void {
    const targetOrigin = resolveTargetOrigin(params.runtime.runtimeUrl);
    const upstreamBearer = resolveRuntimeUpstreamBearerToken({
      config,
      principal: params.principal,
      session: params.session,
      runtime: params.runtime,
    });
    params.req.headers.authorization = `Bearer ${upstreamBearer}`;
    params.req.headers["x-nexus-frontdoor-tenant"] = params.runtime.id;
    params.req.headers["x-nexus-frontdoor-session"] = params.session.id;
    params.req.headers["x-request-id"] = params.req.headers["x-request-id"] ?? randomToken(10);
    if (targetOrigin) {
      const originHeader = params.req.headers.origin;
      if (typeof originHeader === "string" && originHeader.trim()) {
        params.req.headers["x-nexus-frontdoor-origin"] = originHeader.trim();
      }
      params.req.headers.origin = targetOrigin;
    }
    const targetPath =
      params.route === "runtime"
        ? params.url.pathname.slice("/runtime".length) || "/"
        : params.url.pathname;
    const nextPath = `${targetPath}${params.url.search || ""}`;
    params.req.url = nextPath;
    proxy.web(params.req, params.res, {
      target: params.runtime.runtimeUrl,
    });
  }

  async function probeRuntimeJsonEndpoint(params: {
    runtime: TenantConfig;
    session: SessionRecord;
    principal: Principal;
    path: string;
    requestId: string;
  }): Promise<{
    ok: boolean;
    httpStatus: number;
    error?: string;
    body: unknown;
  }> {
    const target = new URL(params.path, params.runtime.runtimeUrl);
    const upstreamBearer = resolveRuntimeUpstreamBearerToken({
      config,
      principal: params.principal,
      session: params.session,
      runtime: params.runtime,
    });
    const headers = new Headers();
    headers.set("authorization", `Bearer ${upstreamBearer}`);
    headers.set("x-nexus-frontdoor-tenant", params.runtime.id);
    headers.set("x-nexus-frontdoor-session", params.session.id);
    headers.set("x-request-id", params.requestId);
    try {
      const response = await fetch(target, {
        method: "GET",
        headers,
      });
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      const text = await response.text();
      let body: unknown = null;
      if (text) {
        if (contentType.includes("application/json")) {
          try {
            body = JSON.parse(text) as unknown;
          } catch {
            body = {
              raw: text.slice(0, 1024),
            };
          }
        } else {
          body = {
            raw: text.slice(0, 1024),
          };
        }
      }
      if (!response.ok) {
        const bodyRecord = asRecord(body);
        const code = readOptionalString(bodyRecord?.error) || `runtime_http_${response.status}`;
        return {
          ok: false,
          httpStatus: response.status,
          error: code,
          body,
        };
      }
      return {
        ok: true,
        httpStatus: response.status,
        body,
      };
    } catch (error) {
      return {
        ok: false,
        httpStatus: 0,
        error: "runtime_unreachable",
        body: {
          detail: String(error),
        },
      };
    }
  }

  // -----------------------------------------------------------------------
  // installAppOnServer — SSH/SCP tarball delivery + runtime HTTP API
  // Replaces legacy config injection (attachRuntimeAppOnServer)
  // -----------------------------------------------------------------------

  function resolveServerOperatorHost(server: ServerRecord): { host: string; runtimePort: number } | null {
    const transportHost = resolveServerTransportHost(server);
    if (transportHost && server.runtimePort) {
      return {
        host: transportHost,
        runtimePort: server.runtimePort,
      };
    }
    const tenant = config.tenants.get(server.tenantId);
    const runtimeUrl = tenant?.runtimeUrl?.trim();
    if (!runtimeUrl) {
      return null;
    }
    try {
      const parsed = new URL(runtimeUrl);
      if (!parsed.hostname) {
        return null;
      }
      const runtimePort =
        parsed.port.trim().length > 0
          ? Number(parsed.port)
          : parsed.protocol === "https:"
            ? 443
            : 80;
      if (!Number.isFinite(runtimePort) || runtimePort <= 0) {
        return null;
      }
      return {
        host: parsed.hostname,
        runtimePort,
      };
    } catch {
      return null;
    }
  }

  function resolveServerOperatorRuntimeUrl(server: ServerRecord): string | null {
    const transportHost = resolveServerTransportHost(server);
    if (transportHost && server.runtimePort) {
      return `http://${transportHost}:${server.runtimePort}`;
    }
    const tenant = config.tenants.get(server.tenantId);
    const runtimeUrl = tenant?.runtimeUrl?.trim();
    if (!runtimeUrl) {
      return null;
    }
    try {
      const parsed = new URL(runtimeUrl);
      if (!parsed.protocol || !parsed.hostname) {
        return null;
      }
      return parsed.toString().replace(/\/$/, "");
    } catch {
      return null;
    }
  }

  function resolveServerOperatorSshUsername(server: ServerRecord): string {
    return server.provider === "aws" ? "ubuntu" : "root";
  }

  function isLoopbackHostname(hostname: string): boolean {
    const normalized = hostname.trim().toLowerCase();
    return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
  }

  function shouldUseDirectRuntimeInstall(server: ServerRecord, tarballPath: string): boolean {
    if (!fs.existsSync(tarballPath)) {
      return false;
    }
    return shouldUseDirectRuntimeOperatorApi(server);
  }

  function shouldUseDirectRuntimeOperatorApi(server: ServerRecord): boolean {
    const runtimeUrl = resolveServerOperatorRuntimeUrl(server);
    if (!runtimeUrl) {
      return false;
    }
    try {
      const parsed = new URL(runtimeUrl);
      return isLoopbackHostname(parsed.hostname);
    } catch {
      return false;
    }
  }

  function resolveServerProbeRuntimeUrl(server: ServerRecord): string | null {
    const direct = resolveServerOperatorRuntimeUrl(server);
    if (direct) {
      return direct;
    }
    const host = resolveServerOperatorHost(server);
    if (!host) {
      return null;
    }
    return `http://${host.host}:${host.runtimePort}`;
  }

  function resolveManagedServerPlatform(server: ServerRecord): { os: string; arch: string } | null {
    const serverCloudProvider = resolveCloudProviderForServer(server);
    if (!serverCloudProvider || !server.providerServerId) {
      return null;
    }
    const plan = serverCloudProvider.listPlans().find((item) => item.id === server.plan);
    if (!plan) {
      return null;
    }
    const platform = {
      os: "linux",
      arch: plan.architecture,
    };
    store.updateServer(server.serverId, {
      runtimeOs: platform.os,
      runtimeArch: platform.arch,
    });
    return platform;
  }

  async function resolveServerRuntimePlatform(server: ServerRecord, runtimeBearerToken?: string | null): Promise<{
    os: string;
    arch: string;
  } | null> {
    const cachedOs = readOptionalString(server.runtimeOs);
    const cachedArch = readOptionalString(server.runtimeArch);
    if (cachedOs && cachedArch) {
      return { os: cachedOs, arch: cachedArch };
    }

    if (shouldUseDirectRuntimeOperatorApi(server)) {
      return {
        os: process.platform,
        arch: process.arch,
      };
    }

    const managedPlatform = resolveManagedServerPlatform(server);
    if (managedPlatform) {
      return managedPlatform;
    }

    const runtimeUrl = resolveServerProbeRuntimeUrl(server);
    if (!runtimeUrl) {
      return null;
    }
    try {
      const response = await fetch(`${runtimeUrl.replace(/\/$/, "")}/health`, {
        headers: runtimeBearerToken
          ? {
              authorization: `Bearer ${runtimeBearerToken}`,
            }
          : undefined,
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        return null;
      }
      const body = await response.json() as { platform?: { os?: unknown; arch?: unknown } };
      const os = readOptionalString(body?.platform?.os);
      const arch = readOptionalString(body?.platform?.arch);
      if (!os || !arch) {
        return null;
      }
      store.updateServer(server.serverId, {
        runtimeOs: os,
        runtimeArch: arch,
      });
      return { os, arch };
    } catch {
      return null;
    }
  }

  function resolvePackageVariantForConstraint(params: {
    kind: FrontdoorPackageKind;
    packageId: string;
    versionConstraint: string;
    targetOs: string;
    targetArch: string;
  }): {
    ok: true;
    variant: { releaseId: string; version: string; tarballPath: string };
  } | {
    ok: false;
    error: "package_not_found" | "package_variant_not_found";
    detail: string;
    status: number;
  } {
    const versionConstraint = params.versionConstraint.trim() || "latest";
    if (versionConstraint === "latest") {
      const variant = store.getLatestPackageReleaseVariantForTarget(
        params.kind,
        params.packageId,
        params.targetOs,
        params.targetArch,
      );
      if (variant) {
        return {
          ok: true,
          variant: {
            releaseId: variant.releaseId,
            version: variant.version,
            tarballPath: variant.tarballPath,
          },
        };
      }
      const anyVariant = store.getLatestPackageReleaseVariant(params.kind, params.packageId);
      if (!anyVariant) {
        return {
          ok: false,
          error: "package_not_found",
          detail: `${params.packageId}@latest`,
          status: 404,
        };
      }
      return {
        ok: false,
        error: "package_variant_not_found",
        detail: `${params.packageId}@latest for ${params.targetOs}/${params.targetArch}`,
        status: 404,
      };
    }

    const exactVariant = store.getPackageReleaseVariantForTarget(
      params.kind,
      params.packageId,
      versionConstraint,
      params.targetOs,
      params.targetArch,
    );
    if (exactVariant) {
      return {
        ok: true,
        variant: {
          releaseId: exactVariant.releaseId,
          version: exactVariant.version,
          tarballPath: exactVariant.tarballPath,
        },
      };
    }
    const exactAnyVariant = store.getPackageReleaseVariant(params.kind, params.packageId, versionConstraint);
    if (exactAnyVariant) {
      return {
        ok: false,
        error: "package_variant_not_found",
        detail: `${params.packageId}@${versionConstraint} for ${params.targetOs}/${params.targetArch}`,
        status: 404,
      };
    }

    const candidates = store.listPackageReleaseVariantsForTarget(
      params.kind,
      params.packageId,
      params.targetOs,
      params.targetArch,
    );
    const matching = candidates
      .filter((candidate) => satisfiesVersionConstraint(candidate.version, versionConstraint))
      .sort((a, b) => compareSemver(b.version, a.version));
    const selected = matching[0];
    if (selected) {
      return {
        ok: true,
        variant: {
          releaseId: selected.releaseId,
          version: selected.version,
          tarballPath: selected.tarballPath,
        },
      };
    }
    if (candidates.length > 0) {
      return {
        ok: false,
        error: "package_variant_not_found",
        detail: `${params.packageId}@${versionConstraint} for ${params.targetOs}/${params.targetArch}`,
        status: 404,
      };
    }
    return {
      ok: false,
      error: "package_not_found",
      detail: `${params.packageId}@${versionConstraint}`,
      status: 404,
    };
  }

  function resolveAppInstallPlan(params: {
    appId: string;
    versionConstraint: string;
    targetOs: string;
    targetArch: string;
  }): {
    ok: true;
    steps: ResolvedPackagePlanStep[];
    requirements: Array<{
      requiringKind: FrontdoorPackageKind;
      requiringPackageId: string;
      requiredKind: FrontdoorPackageKind;
      requiredPackageId: string;
      versionConstraint: string;
    }>;
    topLevelVersion: string;
  } | {
    ok: false;
    error: string;
    detail?: string;
    status: number;
  } {
    const ordered: ResolvedPackagePlanStep[] = [];
    const byPackageId = new Map<string, ResolvedPackagePlanStep>();
    const visiting = new Set<string>();
    const requirements: Array<{
      requiringKind: FrontdoorPackageKind;
      requiringPackageId: string;
      requiredKind: FrontdoorPackageKind;
      requiredPackageId: string;
      versionConstraint: string;
    }> = [];

    const resolveNode = (node: {
      packageId: string;
      dependencyClass: DependencyClass | null;
      versionConstraint: string;
      direct: boolean;
      requiring?: { kind: FrontdoorPackageKind; packageId: string };
    }): { ok: true } | { ok: false; error: string; detail?: string; status: number } => {
      const packageRecord = store.getPackage(node.packageId);
      if (!packageRecord) {
        return {
          ok: false,
          error: "package_not_found",
          detail: `${node.packageId}@${node.versionConstraint}`,
          status: 404,
        };
      }
      if (packageRecord.kind !== "app" && packageRecord.kind !== "adapter") {
        return {
          ok: false,
          error: "package_kind_not_supported",
          detail: `${node.packageId}:${packageRecord.kind}`,
          status: 422,
        };
      }
      if (node.dependencyClass && packageRecord.kind !== node.dependencyClass) {
        return {
          ok: false,
          error: "package_kind_mismatch",
          detail: `${node.packageId} declared as ${node.dependencyClass} but published as ${packageRecord.kind}`,
          status: 422,
        };
      }

      const existing = byPackageId.get(node.packageId);
      if (existing) {
        if (!satisfiesVersionConstraint(existing.variant.version, node.versionConstraint)) {
          return {
            ok: false,
            error: "dependency_version_conflict",
            detail: `${node.packageId} resolved ${existing.variant.version} which does not satisfy ${node.versionConstraint}`,
            status: 422,
          };
        }
        if (node.direct) {
          existing.direct = true;
        }
        if (node.requiring) {
          requirements.push({
            requiringKind: node.requiring.kind,
            requiringPackageId: node.requiring.packageId,
            requiredKind: existing.kind,
            requiredPackageId: existing.packageId,
            versionConstraint: node.versionConstraint,
          });
        }
        return { ok: true };
      }

      if (visiting.has(node.packageId)) {
        return {
          ok: false,
          error: "dependency_cycle_detected",
          detail: node.packageId,
          status: 422,
        };
      }
      visiting.add(node.packageId);

      const resolvedVariant = resolvePackageVariantForConstraint({
        kind: packageRecord.kind,
        packageId: node.packageId,
        versionConstraint: node.versionConstraint,
        targetOs: params.targetOs,
        targetArch: params.targetArch,
      });
      if (!resolvedVariant.ok) {
        visiting.delete(node.packageId);
        return resolvedVariant;
      }

      if (packageRecord.kind === "app") {
        const dependencies = store.listPackageReleaseDependencies(resolvedVariant.variant.releaseId);
        for (const dependency of dependencies) {
          const resolved = resolveNode({
            packageId: dependency.dependencyPackageId,
            dependencyClass: dependency.dependencyClass,
            versionConstraint: dependency.versionConstraint,
            direct: false,
            requiring: {
              kind: packageRecord.kind,
              packageId: node.packageId,
            },
          });
          if (!resolved.ok) {
            visiting.delete(node.packageId);
            return resolved;
          }
        }
      }

      const step: ResolvedPackagePlanStep = {
        kind: packageRecord.kind,
        packageId: node.packageId,
        versionConstraint: node.versionConstraint,
        variant: resolvedVariant.variant,
        direct: node.direct,
      };
      byPackageId.set(node.packageId, step);
      if (node.requiring) {
        requirements.push({
          requiringKind: node.requiring.kind,
          requiringPackageId: node.requiring.packageId,
          requiredKind: step.kind,
          requiredPackageId: step.packageId,
          versionConstraint: node.versionConstraint,
        });
      }
      ordered.push(step);
      visiting.delete(node.packageId);
      return { ok: true };
    };

    const topLevel = resolveNode({
      packageId: params.appId,
      dependencyClass: "app",
      versionConstraint: params.versionConstraint,
      direct: true,
    });
    if (!topLevel.ok) {
      return topLevel;
    }
    const topLevelStep = byPackageId.get(params.appId);
    if (!topLevelStep) {
      return {
        ok: false,
        error: "package_not_found",
        detail: `${params.appId}@${params.versionConstraint}`,
        status: 404,
      };
    }
    return {
      ok: true,
      steps: ordered,
      requirements,
      topLevelVersion: topLevelStep.variant.version,
    };
  }

  async function installResolvedPackageOnServer(params: {
    server: ServerRecord;
    runtimeBearerToken: string;
    installReason: string;
    packageStep: ResolvedPackagePlanStep;
  }): Promise<
    | { ok: true }
    | { ok: false; error: string; detail?: string; status?: number }
  > {
    const entryPath = params.packageStep.kind === "app"
      ? defaultEntryPathForApp(params.packageStep.packageId)
      : undefined;
    const existing = store.getServerPackageInstall(
      params.server.serverId,
      params.packageStep.kind,
      params.packageStep.packageId,
    );
    if (
      existing?.status === "installed" &&
      existing.activeReleaseId === params.packageStep.variant.releaseId
    ) {
      return { ok: true };
    }
    if (existing?.status === "installed" && existing.activeReleaseId !== params.packageStep.variant.releaseId) {
      return {
        ok: false,
        error: "dependency_upgrade_required",
        detail: `${params.packageStep.packageId}: ${existing.activeVersion ?? "unknown"} -> ${params.packageStep.variant.version}`,
        status: 409,
      };
    }

    store.upsertServerPackageInstall({
      serverId: params.server.serverId,
      kind: params.packageStep.kind,
      packageId: params.packageStep.packageId,
      status: "installing",
      desiredReleaseId: params.packageStep.variant.releaseId,
      desiredVersion: params.packageStep.variant.version,
      entryPath,
      installReason: params.installReason,
    });

    if (!fs.existsSync(params.packageStep.variant.tarballPath)) {
      store.upsertServerPackageInstall({
        serverId: params.server.serverId,
        kind: params.packageStep.kind,
        packageId: params.packageStep.packageId,
        status: "failed",
        desiredReleaseId: params.packageStep.variant.releaseId,
        desiredVersion: params.packageStep.variant.version,
        entryPath,
        lastError: `package_not_found: ${params.packageStep.variant.tarballPath}`,
        installReason: params.installReason,
      });
      return {
        ok: false,
        error: "package_not_found",
        detail: params.packageStep.variant.tarballPath,
        status: 404,
      };
    }

    const result = shouldUseDirectRuntimeInstall(params.server, params.packageStep.variant.tarballPath)
      ? await installPackageViaRuntimeHttp({
          runtimeUrl: resolveServerOperatorRuntimeUrl(params.server) ?? "",
          localTarballPath: params.packageStep.variant.tarballPath,
          kind: params.packageStep.kind,
          packageId: params.packageStep.packageId,
          version: params.packageStep.variant.version,
          releaseId: params.packageStep.variant.releaseId,
          runtimeBearerToken: params.runtimeBearerToken,
        })
      : await (async () => {
          const operatorTarget = resolveServerOperatorHost(params.server);
          if (!operatorTarget) {
            return { ok: false as const, error: "server_no_transport_host", detail: "" };
          }
          return await installPackageViaSSH({
            host: operatorTarget.host,
            privateKeyPath: config.vpsAccess.sshKeyPath,
            username: resolveServerOperatorSshUsername(params.server),
            localTarballPath: params.packageStep.variant.tarballPath,
            kind: params.packageStep.kind,
            packageId: params.packageStep.packageId,
            version: params.packageStep.variant.version,
            releaseId: params.packageStep.variant.releaseId,
            runtimePort: operatorTarget.runtimePort,
            runtimeBearerToken: params.runtimeBearerToken,
          });
        })();

    const alreadyInstalledActive =
      !result.ok &&
      result.error === "runtime_install_failed" &&
      String(result.detail ?? "").toLowerCase().includes("already installed") &&
      String(result.detail ?? "").toLowerCase().includes("state: active");

    if (result.ok || alreadyInstalledActive) {
      store.upsertServerPackageInstall({
        serverId: params.server.serverId,
        kind: params.packageStep.kind,
        packageId: params.packageStep.packageId,
        status: "installed",
        desiredReleaseId: params.packageStep.variant.releaseId,
        desiredVersion: params.packageStep.variant.version,
        activeReleaseId: params.packageStep.variant.releaseId,
        activeVersion: params.packageStep.variant.version,
        entryPath,
        installReason: params.installReason,
        lastError: undefined,
      });
      return { ok: true };
    }

    store.upsertServerPackageInstall({
      serverId: params.server.serverId,
      kind: params.packageStep.kind,
      packageId: params.packageStep.packageId,
      status: "failed",
      desiredReleaseId: params.packageStep.variant.releaseId,
      desiredVersion: params.packageStep.variant.version,
      entryPath,
      lastError: `${result.error}: ${result.detail ?? ""}`,
      installReason: params.installReason,
    });
    return { ok: false, error: result.error, detail: result.detail, status: 502 };
  }

  async function installAppOnServer(params: {
    serverId: string;
    appId: string;
    accountId: string;
    version?: string;
    source: "purchase" | "manual" | "auto_provision" | "api";
    session?: SessionRecord;
  }): Promise<
    | { ok: true; version: string }
    | { ok: false; error: string; detail?: string; status?: number }
  > {
    const requestedVersion = params.version?.trim() || "latest";
    const topLevelPolicy = getRequestedPackageHostingPolicy("app", params.appId, requestedVersion);

    // 1. Check entitlement
    const subscription = store.getAppSubscription(params.accountId, params.appId);
    if (!subscription || subscription.status !== "active") {
      return { ok: false, error: "app_entitlement_required", status: 403 };
    }

    // 2. Check duplicate install
    const existing = store.getServerAppInstall(params.serverId, params.appId);
    if (existing?.status === "installed") {
      return { ok: false, error: "already_installed", status: 409 };
    }

    // 3. Resolve server + platform
    const server = store.getServer(params.serverId);
    if (!server) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "app",
        packageId: params.appId,
        status: "failed",
        entryPath: defaultEntryPathForApp(params.appId),
        lastError: "server_not_found",
        installReason: params.source,
      });
      return { ok: false, error: "server_not_found", status: 404 };
    }
    if (!serverSatisfiesRequiredServerClass(server, topLevelPolicy.requiredServerClass)) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "app",
        packageId: params.appId,
        status: "failed",
        desiredVersion: requestedVersion,
        entryPath: defaultEntryPathForApp(params.appId),
        lastError: `package_requires_compliant_server: ${params.appId} requires ${topLevelPolicy.requiredServerClass}`,
        installReason: params.source,
      });
      return {
        ok: false,
        error: "package_requires_compliant_server",
        detail: `${params.appId} requires ${topLevelPolicy.requiredServerClass}`,
        status: 409,
      };
    }
    if (!serverSatisfiesDeploymentClass(server, topLevelPolicy.deploymentClass)) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "app",
        packageId: params.appId,
        status: "failed",
        desiredVersion: requestedVersion,
        entryPath: defaultEntryPathForApp(params.appId),
        lastError: `package_deployment_class_mismatch: ${params.appId} requires ${topLevelPolicy.deploymentClass}`,
        installReason: params.source,
      });
      return {
        ok: false,
        error: "package_deployment_class_mismatch",
        detail: `${params.appId} requires ${topLevelPolicy.deploymentClass}`,
        status: 409,
      };
    }
    const runtimeBearerToken = mintPackageOperatorRuntimeBearerToken({
      config,
      store,
      session: params.session,
      server,
    });
    if (!runtimeBearerToken) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "app",
        packageId: params.appId,
        status: "failed",
        desiredVersion: requestedVersion,
        entryPath: defaultEntryPathForApp(params.appId),
        lastError: "runtime_operator_token_unavailable",
        installReason: params.source,
      });
      return { ok: false, error: "runtime_operator_token_unavailable", status: 502 };
    }
    if (server.status !== "running") {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "app",
        packageId: params.appId,
        status: "failed",
        entryPath: defaultEntryPathForApp(params.appId),
        lastError: "server_not_running",
        installReason: params.source,
      });
      return { ok: false, error: "server_not_running", status: 409 };
    }
    const platform = await resolveServerRuntimePlatform(server, runtimeBearerToken);
    if (!platform) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "app",
        packageId: params.appId,
        status: "failed",
        desiredVersion: requestedVersion,
        entryPath: defaultEntryPathForApp(params.appId),
        lastError: "server_runtime_platform_unavailable",
        installReason: params.source,
      });
      return { ok: false, error: "server_runtime_platform_unavailable", status: 502 };
    }

    const plan = resolveAppInstallPlan({
      appId: params.appId,
      versionConstraint: requestedVersion,
      targetOs: platform.os,
      targetArch: platform.arch,
    });
    if (!plan.ok) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "app",
        packageId: params.appId,
        status: "failed",
        desiredVersion: requestedVersion,
        entryPath: defaultEntryPathForApp(params.appId),
        lastError: `${plan.error}: ${plan.detail ?? ""}`,
        installReason: params.source,
      });
      return plan;
    }
    const policyValidation = validateResolvedPackagePlanForServer({
      server,
      steps: plan.steps,
    });
    if (!policyValidation.ok) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "app",
        packageId: params.appId,
        status: "failed",
        desiredVersion: requestedVersion,
        entryPath: defaultEntryPathForApp(params.appId),
        lastError: `${policyValidation.error}: ${policyValidation.detail}`,
        installReason: params.source,
      });
      return policyValidation;
    }

    for (const step of plan.steps) {
      const installed = await installResolvedPackageOnServer({
        server,
        runtimeBearerToken,
        installReason: step.direct ? params.source : "dependency",
        packageStep: step,
      });
      if (!installed.ok) {
        store.upsertServerPackageInstall({
          serverId: params.serverId,
          kind: "app",
          packageId: params.appId,
          status: "failed",
          desiredVersion: requestedVersion,
          entryPath: defaultEntryPathForApp(params.appId),
          lastError: `${installed.error}: ${installed.detail ?? ""}`,
          installReason: params.source,
        });
        console.error(`[app-install] Failed to install ${step.packageId} while installing ${params.appId}: ${installed.error}`);
        return installed;
      }
    }

    store.deleteServerPackageRequirementsForRequiring(params.serverId, "app", params.appId);
    for (const requirement of plan.requirements) {
      store.upsertServerPackageRequirement({
        serverId: params.serverId,
        requiringKind: requirement.requiringKind,
        requiringPackageId: requirement.requiringPackageId,
        requiredKind: requirement.requiredKind,
        requiredPackageId: requirement.requiredPackageId,
        versionConstraint: requirement.versionConstraint,
      });
    }

    console.log(`[app-install] ${params.appId}@${plan.topLevelVersion} installed on ${params.serverId} with ${plan.steps.length} package(s)`);
    return { ok: true, version: plan.topLevelVersion };
  }

  async function installAdapterOnServer(params: {
    serverId: string;
    adapterId: string;
    version?: string;
    source: "manual" | "api";
    session?: SessionRecord;
  }): Promise<
    | { ok: true; version: string }
    | { ok: false; error: string; detail?: string; status?: number }
  > {
    const version = params.version ?? "latest";
    const topLevelPolicy = getRequestedPackageHostingPolicy("adapter", params.adapterId, version);
    const existing = store.getServerPackageInstall(params.serverId, "adapter", params.adapterId);
    if (existing?.status === "installed") {
      return { ok: false, error: "already_installed", status: 409 };
    }

    const server = store.getServer(params.serverId);
    if (!server) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "adapter",
        packageId: params.adapterId,
        status: "failed",
        desiredVersion: version,
        lastError: "server_not_found",
        installReason: params.source,
      });
      return { ok: false, error: "server_not_found", status: 404 };
    }
    if (!serverSatisfiesRequiredServerClass(server, topLevelPolicy.requiredServerClass)) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "adapter",
        packageId: params.adapterId,
        status: "failed",
        desiredVersion: version,
        lastError: `package_requires_compliant_server: ${params.adapterId} requires ${topLevelPolicy.requiredServerClass}`,
        installReason: params.source,
      });
      return {
        ok: false,
        error: "package_requires_compliant_server",
        detail: `${params.adapterId} requires ${topLevelPolicy.requiredServerClass}`,
        status: 409,
      };
    }
    if (!serverSatisfiesDeploymentClass(server, topLevelPolicy.deploymentClass)) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "adapter",
        packageId: params.adapterId,
        status: "failed",
        desiredVersion: version,
        lastError: `package_deployment_class_mismatch: ${params.adapterId} requires ${topLevelPolicy.deploymentClass}`,
        installReason: params.source,
      });
      return {
        ok: false,
        error: "package_deployment_class_mismatch",
        detail: `${params.adapterId} requires ${topLevelPolicy.deploymentClass}`,
        status: 409,
      };
    }
    const runtimeBearerToken = mintPackageOperatorRuntimeBearerToken({
      config,
      store,
      session: params.session,
      server,
    });
    if (!runtimeBearerToken) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "adapter",
        packageId: params.adapterId,
        status: "failed",
        desiredVersion: version,
        lastError: "runtime_operator_token_unavailable",
        installReason: params.source,
      });
      return { ok: false, error: "runtime_operator_token_unavailable", status: 502 };
    }
    if (server.status !== "running") {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "adapter",
        packageId: params.adapterId,
        status: "failed",
        desiredVersion: version,
        lastError: "server_not_running",
        installReason: params.source,
      });
      return { ok: false, error: "server_not_running", status: 409 };
    }
    const platform = await resolveServerRuntimePlatform(server, runtimeBearerToken);
    if (!platform) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "adapter",
        packageId: params.adapterId,
        status: "failed",
        desiredVersion: version,
        lastError: "server_runtime_platform_unavailable",
        installReason: params.source,
      });
      return { ok: false, error: "server_runtime_platform_unavailable", status: 502 };
    }

    const variant = version === "latest"
      ? store.getLatestPackageReleaseVariantForTarget(
          "adapter",
          params.adapterId,
          platform.os,
          platform.arch,
        )
      : store.getPackageReleaseVariantForTarget(
          "adapter",
          params.adapterId,
          version,
          platform.os,
          platform.arch,
        );
    if (!variant) {
      const anyVariant = version === "latest"
        ? store.getLatestPackageReleaseVariant("adapter", params.adapterId)
        : store.getPackageReleaseVariant("adapter", params.adapterId, version);
      if (!anyVariant) {
        store.upsertServerPackageInstall({
          serverId: params.serverId,
          kind: "adapter",
          packageId: params.adapterId,
          status: "failed",
          desiredVersion: version,
          lastError: `package_not_found: ${params.adapterId}@${version}`,
          installReason: params.source,
        });
        return {
          ok: false,
          error: "package_not_found",
          detail: `${params.adapterId}@${version}`,
          status: 404,
        };
      }
      const detail = `${params.adapterId}@${version} for ${platform.os}/${platform.arch}`;
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "adapter",
        packageId: params.adapterId,
        status: "failed",
        desiredVersion: version,
        lastError: `package_variant_not_found: ${detail}`,
        installReason: params.source,
      });
      return {
        ok: false,
        error: "package_variant_not_found",
        detail,
        status: 404,
      };
    }
    const policyValidation = validatePackageInstallPolicyForServer({
      server,
      packageId: params.adapterId,
      releaseId: variant.releaseId,
    });
    if (!policyValidation.ok) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "adapter",
        packageId: params.adapterId,
        status: "failed",
        desiredReleaseId: variant.releaseId,
        desiredVersion: variant.version,
        lastError: `${policyValidation.error}: ${policyValidation.detail}`,
        installReason: params.source,
      });
      return policyValidation;
    }

    store.upsertServerPackageInstall({
      serverId: params.serverId,
      kind: "adapter",
      packageId: params.adapterId,
      status: "installing",
      desiredReleaseId: variant.releaseId,
      desiredVersion: variant.version,
      installReason: params.source,
    });
    if (!fs.existsSync(variant.tarballPath)) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "adapter",
        packageId: params.adapterId,
        status: "failed",
        desiredReleaseId: variant.releaseId,
        desiredVersion: variant.version,
        lastError: `package_not_found: ${variant.tarballPath}`,
        installReason: params.source,
      });
      return { ok: false, error: "package_not_found", detail: variant.tarballPath, status: 404 };
    }

    const result = shouldUseDirectRuntimeInstall(server, variant.tarballPath)
      ? await installPackageViaRuntimeHttp({
          runtimeUrl: resolveServerOperatorRuntimeUrl(server) ?? "",
          localTarballPath: variant.tarballPath,
          kind: "adapter",
          packageId: params.adapterId,
          version: variant.version,
          releaseId: variant.releaseId,
          runtimeBearerToken,
        })
      : await (async () => {
          const operatorTarget = resolveServerOperatorHost(server);
          if (!operatorTarget) {
            return { ok: false as const, error: "server_no_transport_host", detail: "" };
          }
          return await installPackageViaSSH({
            host: operatorTarget.host,
            privateKeyPath: config.vpsAccess.sshKeyPath,
            username: resolveServerOperatorSshUsername(server),
            localTarballPath: variant.tarballPath,
            kind: "adapter",
            packageId: params.adapterId,
            version: variant.version,
            releaseId: variant.releaseId,
            runtimePort: operatorTarget.runtimePort,
            runtimeBearerToken,
          });
        })();

    if (result.ok) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "adapter",
        packageId: params.adapterId,
        status: "installed",
        desiredReleaseId: variant.releaseId,
        desiredVersion: variant.version,
        activeReleaseId: variant.releaseId,
        activeVersion: variant.version,
        installReason: params.source,
      });
      return { ok: true, version: variant.version };
    }

    store.upsertServerPackageInstall({
      serverId: params.serverId,
      kind: "adapter",
      packageId: params.adapterId,
      status: "failed",
      desiredReleaseId: variant.releaseId,
      desiredVersion: variant.version,
      lastError: `${result.error}: ${result.detail ?? ""}`,
      installReason: params.source,
    });
    return { ok: false, error: result.error, detail: result.detail, status: 502 };
  }

  // -----------------------------------------------------------------------
  // uninstallAppFromServer — call runtime uninstall + cleanup via SSH
  // -----------------------------------------------------------------------

  async function uninstallAppFromServer(params: {
    serverId: string;
    appId: string;
    session?: SessionRecord;
  }): Promise<
    | { ok: true }
    | { ok: false; error: string; detail?: string; status?: number }
  > {
    const server = store.getServer(params.serverId);
    if (!server) {
      return { ok: false, error: "server_not_found", status: 404 };
    }
    const runtimeBearerToken = mintPackageOperatorRuntimeBearerToken({
      config,
      store,
      session: params.session,
      server,
    });
    if (!runtimeBearerToken) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "app",
        packageId: params.appId,
        status: "failed",
        installReason: "manual",
        lastError: "runtime_operator_token_unavailable",
      });
      return { ok: false, error: "runtime_operator_token_unavailable", status: 502 };
    }
    store.upsertServerPackageInstall({
      serverId: params.serverId,
      kind: "app",
      packageId: params.appId,
      status: "uninstalling",
      installReason: "manual",
    });

    const result = shouldUseDirectRuntimeOperatorApi(server)
      ? await uninstallPackageViaRuntimeHttp({
          runtimeUrl: resolveServerOperatorRuntimeUrl(server) ?? "",
          kind: "app",
          packageId: params.appId,
          runtimeBearerToken,
        })
      : await (async () => {
          const operatorTarget = resolveServerOperatorHost(server);
          if (!operatorTarget) {
            return { ok: false as const, error: "server_no_transport_host", detail: "" };
          }
          return await uninstallPackageViaSSH({
            host: operatorTarget.host,
            privateKeyPath: config.vpsAccess.sshKeyPath,
            kind: "app",
            packageId: params.appId,
            runtimePort: operatorTarget.runtimePort,
            runtimeBearerToken,
          });
        })();

    if (!result.ok) {
      console.error(`[app-uninstall] Failed to uninstall ${params.appId} from ${params.serverId}: ${result.error}`);
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "app",
        packageId: params.appId,
        status: "failed",
        installReason: "manual",
        lastError: `${result.error}: ${result.detail ?? ""}`,
      });
      return { ok: false, error: result.error, detail: result.detail, status: 502 };
    }

    store.upsertServerPackageInstall({
      serverId: params.serverId,
      kind: "app",
      packageId: params.appId,
      status: "not_installed",
      installReason: "manual",
      lastError: "",
    });
    return { ok: true };
  }

  async function uninstallAdapterFromServer(params: {
    serverId: string;
    adapterId: string;
    session?: SessionRecord;
  }): Promise<
    | { ok: true }
    | { ok: false; error: string; detail?: string; status?: number }
  > {
    const existing = store.getServerPackageInstall(params.serverId, "adapter", params.adapterId);
    if (!existing || existing.status !== "installed") {
      return { ok: false, error: "not_installed", status: 404 };
    }

    const server = store.getServer(params.serverId);
    if (!server) {
      return { ok: false, error: "server_not_found", status: 404 };
    }
    const runtimeBearerToken = mintPackageOperatorRuntimeBearerToken({
      config,
      store,
      session: params.session,
      server,
    });
    if (!runtimeBearerToken) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "adapter",
        packageId: params.adapterId,
        status: "failed",
        desiredReleaseId: existing.desiredReleaseId ?? undefined,
        desiredVersion: existing.desiredVersion ?? undefined,
        activeReleaseId: existing.activeReleaseId ?? undefined,
        activeVersion: existing.activeVersion ?? undefined,
        installReason: "manual",
        lastError: "runtime_operator_token_unavailable",
      });
      return { ok: false, error: "runtime_operator_token_unavailable", status: 502 };
    }
    store.upsertServerPackageInstall({
      serverId: params.serverId,
      kind: "adapter",
      packageId: params.adapterId,
      status: "uninstalling",
      desiredReleaseId: existing.desiredReleaseId ?? undefined,
      desiredVersion: existing.desiredVersion ?? undefined,
      activeReleaseId: existing.activeReleaseId ?? undefined,
      activeVersion: existing.activeVersion ?? undefined,
      installReason: "manual",
    });

    const result = shouldUseDirectRuntimeOperatorApi(server)
      ? await uninstallPackageViaRuntimeHttp({
          runtimeUrl: resolveServerOperatorRuntimeUrl(server) ?? "",
          kind: "adapter",
          packageId: params.adapterId,
          runtimeBearerToken,
        })
      : await (async () => {
          const operatorTarget = resolveServerOperatorHost(server);
          if (!operatorTarget) {
            return { ok: false as const, error: "server_no_transport_host", detail: "" };
          }
          return await uninstallPackageViaSSH({
            host: operatorTarget.host,
            privateKeyPath: config.vpsAccess.sshKeyPath,
            kind: "adapter",
            packageId: params.adapterId,
            runtimePort: operatorTarget.runtimePort,
            runtimeBearerToken,
          });
        })();

    if (!result.ok) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "adapter",
        packageId: params.adapterId,
        status: "failed",
        desiredReleaseId: existing.desiredReleaseId ?? undefined,
        desiredVersion: existing.desiredVersion ?? undefined,
        activeReleaseId: existing.activeReleaseId ?? undefined,
        activeVersion: existing.activeVersion ?? undefined,
        installReason: "manual",
        lastError: `${result.error}: ${result.detail ?? ""}`,
      });
      return { ok: false, error: result.error, detail: result.detail, status: 502 };
    }

    store.upsertServerPackageInstall({
      serverId: params.serverId,
      kind: "adapter",
      packageId: params.adapterId,
      status: "not_installed",
      installReason: "manual",
      lastError: "",
    });
    return { ok: true };
  }

  async function upgradeAppOnServer(params: {
    serverId: string;
    appId: string;
    targetVersion: string;
    source: "manual" | "api";
    session?: SessionRecord;
  }): Promise<
    | { ok: true; version: string }
    | { ok: false; error: string; detail?: string; status?: number }
  > {
    const existing = store.getServerAppInstall(params.serverId, params.appId);
    if (!existing || existing.status !== "installed") {
      return { ok: false, error: "not_installed", status: 404 };
    }

    const server = store.getServer(params.serverId);
    if (!server) {
      return { ok: false, error: "server_not_found", status: 404 };
    }
    const runtimeBearerToken = mintPackageOperatorRuntimeBearerToken({
      config,
      store,
      session: params.session,
      server,
    });
    if (!runtimeBearerToken) {
      return { ok: false, error: "runtime_operator_token_unavailable", status: 502 };
    }
    const platform = await resolveServerRuntimePlatform(server, runtimeBearerToken);
    if (!platform) {
      return { ok: false, error: "server_runtime_platform_unavailable", status: 502 };
    }
    const variant = store.getPackageReleaseVariantForTarget(
      "app",
      params.appId,
      params.targetVersion,
      platform.os,
      platform.arch,
    );
    if (!variant) {
      const anyVariant = store.getPackageReleaseVariant("app", params.appId, params.targetVersion);
      if (!anyVariant) {
        return {
          ok: false,
          error: "package_not_found",
          detail: `${params.appId}@${params.targetVersion}`,
          status: 404,
        };
      }
      return {
        ok: false,
        error: "package_variant_not_found",
        detail: `${params.appId}@${params.targetVersion} for ${platform.os}/${platform.arch}`,
        status: 404,
      };
    }
    const policyValidation = validatePackageInstallPolicyForServer({
      server,
      packageId: params.appId,
      releaseId: variant.releaseId,
    });
    if (!policyValidation.ok) {
      return policyValidation;
    }

    store.upsertServerPackageInstall({
      serverId: params.serverId,
      kind: "app",
      packageId: params.appId,
      status: "installing",
      desiredReleaseId: variant.releaseId,
      desiredVersion: variant.version,
      activeVersion: existing.version,
      entryPath: defaultEntryPathForApp(params.appId),
      installReason: params.source,
    });

    const result = shouldUseDirectRuntimeInstall(server, variant.tarballPath)
      ? await upgradePackageViaRuntimeHttp({
          runtimeUrl: resolveServerOperatorRuntimeUrl(server) ?? "",
          localTarballPath: variant.tarballPath,
          kind: "app",
          packageId: params.appId,
          targetVersion: variant.version,
          releaseId: variant.releaseId,
          runtimeBearerToken,
        })
      : await (async () => {
          const operatorTarget = resolveServerOperatorHost(server);
          if (!operatorTarget) {
            return { ok: false as const, error: "server_no_transport_host", detail: "" };
          }
          return await upgradePackageViaSSH({
            host: operatorTarget.host,
            privateKeyPath: config.vpsAccess.sshKeyPath,
            username: resolveServerOperatorSshUsername(server),
            localTarballPath: variant.tarballPath,
            kind: "app",
            packageId: params.appId,
            targetVersion: variant.version,
            releaseId: variant.releaseId,
            runtimePort: operatorTarget.runtimePort,
            runtimeBearerToken,
          });
        })();

    if (!result.ok) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "app",
        packageId: params.appId,
        status: "failed",
        desiredReleaseId: variant.releaseId,
        desiredVersion: variant.version,
        activeVersion: existing.version,
        entryPath: defaultEntryPathForApp(params.appId),
        installReason: params.source,
        lastError: `${result.error}: ${result.detail ?? ""}`,
      });
      return { ok: false, error: result.error, detail: result.detail, status: 502 };
    }

    store.upsertServerPackageInstall({
      serverId: params.serverId,
      kind: "app",
      packageId: params.appId,
      status: "installed",
      desiredReleaseId: variant.releaseId,
      desiredVersion: variant.version,
      activeReleaseId: variant.releaseId,
      activeVersion: variant.version,
      entryPath: defaultEntryPathForApp(params.appId),
      installReason: params.source,
      lastError: "",
    });
    return { ok: true, version: variant.version };
  }

  async function upgradeAdapterOnServer(params: {
    serverId: string;
    adapterId: string;
    targetVersion: string;
    source: "manual" | "api";
    session?: SessionRecord;
  }): Promise<
    | { ok: true; version: string }
    | { ok: false; error: string; detail?: string; status?: number }
  > {
    const existing = store.getServerPackageInstall(params.serverId, "adapter", params.adapterId);
    if (!existing || existing.status !== "installed") {
      return { ok: false, error: "not_installed", status: 404 };
    }

    const server = store.getServer(params.serverId);
    if (!server) {
      return { ok: false, error: "server_not_found", status: 404 };
    }
    const runtimeBearerToken = mintPackageOperatorRuntimeBearerToken({
      config,
      store,
      session: params.session,
      server,
    });
    if (!runtimeBearerToken) {
      return { ok: false, error: "runtime_operator_token_unavailable", status: 502 };
    }
    const platform = await resolveServerRuntimePlatform(server, runtimeBearerToken);
    if (!platform) {
      return { ok: false, error: "server_runtime_platform_unavailable", status: 502 };
    }
    const variant = store.getPackageReleaseVariantForTarget(
      "adapter",
      params.adapterId,
      params.targetVersion,
      platform.os,
      platform.arch,
    );
    if (!variant) {
      const anyVariant = store.getPackageReleaseVariant("adapter", params.adapterId, params.targetVersion);
      if (!anyVariant) {
        return {
          ok: false,
          error: "package_not_found",
          detail: `${params.adapterId}@${params.targetVersion}`,
          status: 404,
        };
      }
      return {
        ok: false,
        error: "package_variant_not_found",
        detail: `${params.adapterId}@${params.targetVersion} for ${platform.os}/${platform.arch}`,
        status: 404,
      };
    }
    const policyValidation = validatePackageInstallPolicyForServer({
      server,
      packageId: params.adapterId,
      releaseId: variant.releaseId,
    });
    if (!policyValidation.ok) {
      return policyValidation;
    }

    store.upsertServerPackageInstall({
      serverId: params.serverId,
      kind: "adapter",
      packageId: params.adapterId,
      status: "installing",
      desiredReleaseId: variant.releaseId,
      desiredVersion: variant.version,
      activeReleaseId: existing.activeReleaseId ?? undefined,
      activeVersion: existing.activeVersion ?? undefined,
      installReason: params.source,
    });

    const result = shouldUseDirectRuntimeInstall(server, variant.tarballPath)
      ? await upgradePackageViaRuntimeHttp({
          runtimeUrl: resolveServerOperatorRuntimeUrl(server) ?? "",
          localTarballPath: variant.tarballPath,
          kind: "adapter",
          packageId: params.adapterId,
          targetVersion: variant.version,
          releaseId: variant.releaseId,
          runtimeBearerToken,
        })
      : await (async () => {
          const operatorTarget = resolveServerOperatorHost(server);
          if (!operatorTarget) {
            return { ok: false as const, error: "server_no_transport_host", detail: "" };
          }
          return await upgradePackageViaSSH({
            host: operatorTarget.host,
            privateKeyPath: config.vpsAccess.sshKeyPath,
            username: resolveServerOperatorSshUsername(server),
            localTarballPath: variant.tarballPath,
            kind: "adapter",
            packageId: params.adapterId,
            targetVersion: variant.version,
            releaseId: variant.releaseId,
            runtimePort: operatorTarget.runtimePort,
            runtimeBearerToken,
          });
        })();

    if (!result.ok) {
      store.upsertServerPackageInstall({
        serverId: params.serverId,
        kind: "adapter",
        packageId: params.adapterId,
        status: "failed",
        desiredReleaseId: variant.releaseId,
        desiredVersion: variant.version,
        activeReleaseId: existing.activeReleaseId ?? undefined,
        activeVersion: existing.activeVersion ?? undefined,
        installReason: params.source,
        lastError: `${result.error}: ${result.detail ?? ""}`,
      });
      return { ok: false, error: result.error, detail: result.detail, status: 502 };
    }

    store.upsertServerPackageInstall({
      serverId: params.serverId,
      kind: "adapter",
      packageId: params.adapterId,
      status: "installed",
      desiredReleaseId: variant.releaseId,
      desiredVersion: variant.version,
      activeReleaseId: variant.releaseId,
      activeVersion: variant.version,
      installReason: params.source,
      lastError: "",
    });
    return { ok: true, version: variant.version };
  }

  // DELETED: ensureRuntimeAppInstalled — legacy config injection code removed (hard cutover).
  // All install flows now use installAppOnServer() above.

  function buildForwardedRuntimePath(params: {
    url: URL;
    route: "runtime" | "app";
    stripSensitiveQuery?: boolean;
  }): string {
    const targetPath =
      params.route === "runtime" ? params.url.pathname.slice("/runtime".length) || "/" : params.url.pathname;
    if (!params.stripSensitiveQuery) {
      return `${targetPath}${params.url.search || ""}`;
    }
    const nextParams = new URLSearchParams(params.url.search);
    nextParams.delete("token");
    nextParams.delete("runtimeUrl");
    nextParams.delete("launch_code");
    nextParams.delete(APP_EMBED_QUERY_PARAM);
    const nextSearch = nextParams.toString();
    return `${targetPath}${nextSearch ? `?${nextSearch}` : ""}`;
  }

  function serverStatusForUi(status: string): string {
    if (status === "running") {
      return "active";
    }
    if (status === "provisioning") {
      return "degraded";
    }
    return "down";
  }

  function buildAppFrameContext(params: {
    session: SessionRecord;
    serverId: string;
    server: ServerRecord;
    accountId: string;
    appId: string;
  }): AppFrameParams {
    const product = store.getProduct(params.appId);
    const user = store.getUserById(params.session.principal.userId);
    const account = store.getAccount(params.accountId);
    const allServers = store.getServersForUser(params.session.principal.userId);
    const appInstalls = store.getServerEffectiveAppInstalls(params.serverId);
    return {
      appId: params.appId,
      appDisplayName: product?.displayName ?? params.appId,
      appAccentColor: product?.accentColor ?? "#6366f1",
      serverId: params.serverId,
      serverDisplayName: params.server.displayName || params.server.generatedName,
      serverClass: params.server.serverClass,
      serverStatus: serverStatusForUi(params.server.status),
      servers: allServers.map((serverItem) => ({
        serverId: serverItem.serverId,
        displayName: serverItem.displayName || serverItem.generatedName,
        serverClass: serverItem.serverClass,
        status: serverStatusForUi(serverItem.status),
      })),
      installedApps: appInstalls.map((install) => {
        const installProduct = store.getProduct(install.appId);
        return {
          appId: install.appId,
          displayName: installProduct?.displayName ?? install.appId,
          accentColor: installProduct?.accentColor ?? "#6366f1",
          entryPath: install.entryPath ?? defaultEntryPathForApp(install.appId),
          status: install.status,
        };
      }),
      userDisplayName: user?.displayName ?? user?.email ?? "",
      userEmail: user?.email ?? "",
      accountName: account?.displayName ?? "",
      dashboardUrl: "/",
      logoutUrl: "/api/auth/logout",
    };
  }

  function buildEmbeddedAppPath(url: URL): string {
    const next = new URL(url.pathname + url.search, config.baseUrl);
    next.searchParams.set(APP_EMBED_QUERY_PARAM, "1");
    return `${next.pathname}${next.search}`;
  }

  function buildEmbeddedAppBridgeScript(): string {
    return `(function(){
  if (window.parent === window) return;
  var EMBED_QUERY_PARAM = ${JSON.stringify(APP_EMBED_QUERY_PARAM)};
  function toUrl(raw) {
    try { return new URL(raw, window.location.href); } catch (_) { return null; }
  }
  function toPublicHref(raw) {
    var url = toUrl(raw);
    if (!url) return window.location.pathname + window.location.search + window.location.hash;
    url.searchParams.delete(EMBED_QUERY_PARAM);
    return url.pathname + url.search + url.hash;
  }
  function toEmbedHref(raw) {
    var url = toUrl(raw);
    if (!url) return raw;
    if (url.origin === window.location.origin && url.pathname.indexOf("/app/") === 0) {
      url.searchParams.set(EMBED_QUERY_PARAM, "1");
    }
    return url.pathname + url.search + url.hash;
  }
  function post(type, extra) {
    try {
      var payload = extra && typeof extra === "object" ? extra : {};
      payload.type = type;
      window.parent.postMessage(payload, window.location.origin);
    } catch (_) {}
  }
  function postNavigation(kind) {
    post("nxf:navigation", {
      kind: kind,
      href: toPublicHref(window.location.href)
    });
  }
  function patchHistory(method, kind) {
    var original = history[method];
    if (typeof original !== "function") return;
    history[method] = function(state, title, url) {
      var nextUrl = typeof url === "undefined" ? url : toEmbedHref(url);
      var result = original.call(this, state, title, nextUrl);
      postNavigation(kind);
      return result;
    };
  }
  patchHistory("pushState", "push");
  patchHistory("replaceState", "replace");
  document.addEventListener("click", function(event) {
    var target = event.target;
    if (!target || typeof target.closest !== "function") return;
    var anchor = target.closest("a[href]");
    if (!anchor) return;
    if (anchor.target || anchor.hasAttribute("download")) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var href = anchor.getAttribute("href");
    if (!href) return;
    var url = toUrl(href);
    if (!url) return;
    if (url.origin !== window.location.origin) return;
    if (url.pathname.indexOf("/app/") !== 0) return;
    event.preventDefault();
    window.location.assign(toEmbedHref(url.toString()));
  }, true);
  window.addEventListener("message", function(event) {
    if (event.origin !== window.location.origin) return;
    var data = event.data;
    if (!data || data.type !== "nxf:navigate" || typeof data.href !== "string") return;
    var next = toEmbedHref(data.href);
    var current = window.location.pathname + window.location.search + window.location.hash;
    if (next !== current) {
      window.location.assign(next);
    }
  });
  window.addEventListener("popstate", function() {
    postNavigation("pop");
  });
  window.addEventListener("hashchange", function() {
    postNavigation("replace");
  });
  window.addEventListener("load", function() {
    post("nxf:embed-ready", { href: toPublicHref(window.location.href) });
    postNavigation("load");
  });
})();`;
  }

  function buildEmbeddedAppErrorHtml(params: {
    appName: string;
    appId: string;
    status: number;
    path: string;
    detail: string;
  }): string {
    const title =
      params.status === 404
        ? `${params.appName} is not available`
        : `${params.appName} could not be loaded`;
    const detail = params.detail.trim() || `Frontdoor received status ${params.status}.`;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(params.appName)} error</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px;
      background: #0b1220;
      color: #e5e7eb;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .card {
      max-width: 520px;
      width: 100%;
      padding: 24px;
      border-radius: 18px;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(148, 163, 184, 0.22);
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
    }
    h1 { margin: 0 0 10px; font-size: 24px; }
    p { margin: 0 0 12px; color: #cbd5e1; line-height: 1.55; }
    code {
      display: block;
      margin-top: 14px;
      padding: 12px;
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.75);
      color: #94a3b8;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escHtml(title)}</h1>
    <p>${escHtml(detail)}</p>
    <code>Status ${params.status} on ${escHtml(params.path)}</code>
  </div>
  <script>
    (function() {
      if (window.parent === window) return;
      try {
        window.parent.postMessage({
          type: "nxf:embed-error",
          title: ${JSON.stringify(title)},
          detail: ${JSON.stringify(detail)},
          status: ${String(params.status)},
          appId: ${JSON.stringify(params.appId)}
        }, window.location.origin);
      } catch (_) {}
    })();
  </script>
</body>
</html>`;
  }

  function buildAppShellDocument(params: {
    frame: AppFrameParams;
    publicPath: string;
    embedSrc?: string;
    initialTitle?: string;
    initialDetail?: string;
  }): string {
    const hasEmbed = Boolean(params.embedSrc);
    const initialTitle = params.initialTitle ?? `Loading ${params.frame.appDisplayName}`;
    const initialDetail =
      params.initialDetail ??
      `Opening ${params.frame.appDisplayName} inside the frontdoor shell.`;
    const shellHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(params.frame.appDisplayName)} | Nexus</title>
  <style>
    html, body { margin: 0; min-height: 100%; background: #020617; }
    #nxf-shell-root {
      position: fixed;
      inset: 44px 0 0 0;
      background:
        radial-gradient(circle at top left, rgba(59, 130, 246, 0.18), transparent 34%),
        radial-gradient(circle at top right, rgba(14, 165, 233, 0.14), transparent 30%),
        linear-gradient(180deg, #020617 0%, #0f172a 100%);
    }
    #nxf-shell-embed {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
      background: #fff;
    }
    .nxf-shell-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px;
      z-index: 2;
      background: linear-gradient(180deg, rgba(2, 6, 23, 0.86), rgba(15, 23, 42, 0.94));
      color: #e2e8f0;
    }
    .nxf-shell-overlay.hidden { display: none; }
    .nxf-shell-card {
      max-width: 520px;
      width: 100%;
      padding: 28px;
      border-radius: 20px;
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(15, 23, 42, 0.92);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
    }
    .nxf-shell-card h1 {
      margin: 0 0 12px;
      font-size: 26px;
      line-height: 1.1;
      color: #f8fafc;
    }
    .nxf-shell-card p {
      margin: 0;
      font-size: 15px;
      line-height: 1.6;
      color: #cbd5e1;
    }
    .nxf-shell-actions {
      display: flex;
      gap: 10px;
      margin-top: 18px;
      flex-wrap: wrap;
    }
    .nxf-shell-actions button {
      border: 0;
      border-radius: 12px;
      padding: 10px 14px;
      font: inherit;
      cursor: pointer;
      color: #e2e8f0;
      background: rgba(59, 130, 246, 0.22);
    }
    .nxf-shell-actions button:hover {
      background: rgba(59, 130, 246, 0.32);
    }
  </style>
</head>
<body>
  <div id="nxf-shell-root">
    ${
      hasEmbed
        ? `<iframe id="nxf-shell-embed" src="${escAttr(params.embedSrc || "")}" title="${escAttr(
            params.frame.appDisplayName,
          )}"></iframe>`
        : ""
    }
    <div id="nxf-shell-loading" class="nxf-shell-overlay${hasEmbed ? "" : " hidden"}">
      <div class="nxf-shell-card">
        <h1 id="nxf-shell-loading-title">${escHtml(initialTitle)}</h1>
        <p id="nxf-shell-loading-detail">${escHtml(initialDetail)}</p>
      </div>
    </div>
    <div id="nxf-shell-error" class="nxf-shell-overlay${hasEmbed ? " hidden" : ""}">
      <div class="nxf-shell-card">
        <h1 id="nxf-shell-error-title">${escHtml(initialTitle)}</h1>
        <p id="nxf-shell-error-detail">${escHtml(initialDetail)}</p>
        <div class="nxf-shell-actions">
          <button type="button" id="nxf-shell-retry">Retry</button>
        </div>
      </div>
    </div>
  </div>
  <script>
    (function() {
      var EMBED_QUERY_PARAM = ${JSON.stringify(APP_EMBED_QUERY_PARAM)};
      var iframe = document.getElementById("nxf-shell-embed");
      var loading = document.getElementById("nxf-shell-loading");
      var loadingTitle = document.getElementById("nxf-shell-loading-title");
      var loadingDetail = document.getElementById("nxf-shell-loading-detail");
      var error = document.getElementById("nxf-shell-error");
      var errorTitle = document.getElementById("nxf-shell-error-title");
      var errorDetail = document.getElementById("nxf-shell-error-detail");
      var retry = document.getElementById("nxf-shell-retry");
      var pendingNavigation = null;
      function currentPublicHref() {
        return window.location.pathname + window.location.search + window.location.hash;
      }
      function toUrl(raw) {
        try { return new URL(raw, window.location.origin); } catch (_) { return null; }
      }
      function toPublicHref(raw) {
        var url = toUrl(raw);
        if (!url) return currentPublicHref();
        url.searchParams.delete(EMBED_QUERY_PARAM);
        return url.pathname + url.search + url.hash;
      }
      function toEmbedHref(raw) {
        var url = toUrl(raw);
        if (!url) return raw;
        url.searchParams.set(EMBED_QUERY_PARAM, "1");
        return url.pathname + url.search + url.hash;
      }
      function showLoading(title, detail) {
        if (!loading) return;
        if (error) error.classList.add("hidden");
        loading.classList.remove("hidden");
        if (title && loadingTitle) loadingTitle.textContent = title;
        if (detail && loadingDetail) loadingDetail.textContent = detail;
      }
      function hideLoading() {
        if (loading) loading.classList.add("hidden");
      }
      function showError(title, detail) {
        hideLoading();
        if (errorTitle && title) errorTitle.textContent = title;
        if (errorDetail && detail) errorDetail.textContent = detail;
        if (error) error.classList.remove("hidden");
      }
      if (retry) {
        retry.addEventListener("click", function() {
          window.location.reload();
        });
      }
      if (iframe) {
        iframe.addEventListener("load", function() {
          if (error && error.classList.contains("hidden")) {
            hideLoading();
          }
        });
      }
      window.addEventListener("message", function(event) {
        if (event.origin !== window.location.origin) return;
        var data = event.data;
        if (!data || typeof data !== "object") return;
        if (data.type === "nxf:navigation" && typeof data.href === "string") {
          hideLoading();
          if (error) error.classList.add("hidden");
          var nextHref = toPublicHref(data.href);
          if (pendingNavigation && nextHref === pendingNavigation) {
            pendingNavigation = null;
            window.history.replaceState({}, "", nextHref);
            return;
          }
          if (nextHref === currentPublicHref()) return;
          if (data.kind === "replace" || data.kind === "pop") {
            window.history.replaceState({}, "", nextHref);
          } else {
            window.history.pushState({}, "", nextHref);
          }
          return;
        }
        if (data.type === "nxf:embed-ready") {
          hideLoading();
          if (error) error.classList.add("hidden");
          return;
        }
        if (data.type === "nxf:embed-error") {
          showError(
            typeof data.title === "string" ? data.title : "App could not be loaded",
            typeof data.detail === "string" ? data.detail : "The embedded app returned an error.",
          );
        }
      });
      window.addEventListener("popstate", function() {
        if (!iframe || !iframe.contentWindow) return;
        pendingNavigation = currentPublicHref();
        showLoading("Loading app", "Synchronizing the embedded app to the current browser route.");
        iframe.contentWindow.postMessage({
          type: "nxf:navigate",
          href: currentPublicHref(),
        }, window.location.origin);
      });
    })();
  </script>
</body>
</html>`;
    return injectAppFrame(shellHtml, params.frame);
  }

  function renderAppShellDocument(params: {
    req: IncomingMessage;
    res: ServerResponse;
    url: URL;
    session: SessionRecord;
    principal: Principal;
    runtime: TenantConfig;
    serverId: string;
    server: ServerRecord;
    accountId: string;
  }): void {
    const appIdMatch = params.url.pathname.match(/^\/app\/([^/]+)/);
    const appId = appIdMatch ? decodeURIComponent(appIdMatch[1]) : "console";
    const frame = buildAppFrameContext({
      session: params.session,
      serverId: params.serverId,
      server: params.server,
      accountId: params.accountId,
      appId,
    });
    const currentInstall = frame.installedApps.find((item) => item.appId === appId);
    const appAvailable = currentInstall?.status === "installed";
    let initialTitle: string | undefined;
    let initialDetail: string | undefined;
    let embedSrc: string | undefined;
    if (appAvailable) {
      embedSrc = buildEmbeddedAppPath(params.url);
      initialTitle = `Loading ${frame.appDisplayName}`;
      initialDetail = `Opening ${frame.appDisplayName} inside the frontdoor shell.`;
    } else if (currentInstall?.status === "installing") {
      initialTitle = `${frame.appDisplayName} is still installing`;
      initialDetail = `This app is not ready on ${frame.serverDisplayName} yet.`;
    } else if (currentInstall?.status === "failed") {
      initialTitle = `${frame.appDisplayName} failed to install`;
      initialDetail = `Try reinstalling the app on ${frame.serverDisplayName} before launching it again.`;
    } else {
      initialTitle = `${frame.appDisplayName} is not installed on this server`;
      initialDetail = `Install ${frame.appDisplayName} on ${frame.serverDisplayName} before launching it.`;
    }
    const shell = buildAppShellDocument({
      frame,
      publicPath: `${params.url.pathname}${params.url.search || ""}`,
      embedSrc,
      initialTitle,
      initialDetail,
    });
    const shellBuffer = Buffer.from(shell, "utf8");
    params.res.statusCode = 200;
    params.res.setHeader("content-type", "text/html; charset=utf-8");
    params.res.setHeader("content-length", String(shellBuffer.byteLength));
    params.res.setHeader("cache-control", "no-store");
    params.res.end(shellBuffer);
  }

  async function proxyRuntimeEmbeddedAppDocument(params: {
    req: IncomingMessage;
    res: ServerResponse;
    url: URL;
    session: SessionRecord;
    principal: Principal;
    runtime: TenantConfig;
    serverId: string;
    server: ServerRecord;
    accountId: string;
  }): Promise<void> {
    const appIdMatch = params.url.pathname.match(/^\/app\/([^/]+)/);
    const appId = appIdMatch ? decodeURIComponent(appIdMatch[1]) : "console";
    const frame = buildAppFrameContext({
      session: params.session,
      serverId: params.serverId,
      server: params.server,
      accountId: params.accountId,
      appId,
    });
    const upstreamBearer = resolveRuntimeUpstreamBearerToken({
      config,
      principal: params.principal,
      session: params.session,
      runtime: params.runtime,
    });
    const targetPath = buildForwardedRuntimePath({
      url: params.url,
      route: "app",
      stripSensitiveQuery: true,
    });
    const runtimeTarget = new URL(targetPath, params.runtime.runtimeUrl);
    const headers = new Headers();
    headers.set("authorization", `Bearer ${upstreamBearer}`);
    headers.set("x-nexus-frontdoor-tenant", params.runtime.id);
    headers.set("x-nexus-frontdoor-session", params.session.id);
    headers.set("x-request-id", readHeaderValue(params.req.headers["x-request-id"]) || randomToken(10));
    const accept = readHeaderValue(params.req.headers.accept);
    if (accept) {
      headers.set("accept", accept);
    }
    const userAgent = readHeaderValue(params.req.headers["user-agent"]);
    if (userAgent) {
      headers.set("user-agent", userAgent);
    }
    const targetOrigin = resolveTargetOrigin(params.runtime.runtimeUrl);
    const incomingOrigin = readHeaderValue(params.req.headers.origin);
    if (targetOrigin && incomingOrigin) {
      headers.set("x-nexus-frontdoor-origin", incomingOrigin);
      headers.set("origin", targetOrigin);
    }

    // Buffer the runtime response (wrap in try-catch for connection failures)
    let runtimeResponse: Response;
    let contentType: string;
    let bodyText: string;
    try {
      runtimeResponse = await fetch(runtimeTarget, {
        method: "GET",
        headers,
      });
      contentType = (runtimeResponse.headers.get("content-type") || "").toLowerCase();
      bodyText = await runtimeResponse.text();
    } catch (fetchError) {
      // Runtime is unreachable — synthesize a 502 so the error-page path below handles it
      runtimeResponse = new Response("Runtime unreachable", { status: 502 });
      contentType = "text/plain";
      bodyText = `Could not connect to runtime: ${String(fetchError)}`;
    }

    // Non-200: return an embedded-app error document that reports failure back
    // to the shell instead of trying to own the platform chrome itself.
    if (runtimeResponse.status !== 200) {
      const embeddedError = buildEmbeddedAppErrorHtml({
        appName: frame.appDisplayName,
        appId,
        status: runtimeResponse.status,
        path: `${params.url.pathname}${params.url.search || ""}`,
        detail: bodyText.trim().slice(0, 500),
      });
      const embeddedErrorBuffer = Buffer.from(embeddedError, "utf8");
      params.res.statusCode = runtimeResponse.status;
      params.res.setHeader("content-type", "text/html; charset=utf-8");
      params.res.setHeader("content-length", String(embeddedErrorBuffer.byteLength));
      params.res.setHeader("cache-control", "no-store");
      params.res.end(embeddedErrorBuffer);
      return;
    }

    // Non-HTML 200: pass through without shell bridge injection.
    if (!contentType.includes("text/html")) {
      params.res.statusCode = runtimeResponse.status;
      params.res.setHeader(
        "content-type",
        runtimeResponse.headers.get("content-type") || "text/html; charset=utf-8",
      );
      params.res.setHeader("cache-control", "no-store");
      params.res.end(bodyText);
      return;
    }

    const bridged = injectScriptBeforeBody(
      bodyText,
      "nxf-embedded-app-bridge",
      buildEmbeddedAppBridgeScript(),
    );
    const bridgedBuffer = Buffer.from(bridged, "utf8");
    params.res.statusCode = 200;
    params.res.setHeader("content-type", "text/html; charset=utf-8");
    params.res.setHeader("content-length", String(bridgedBuffer.byteLength));
    params.res.setHeader("cache-control", "no-store");
    params.res.end(bridgedBuffer);
  }

  // -------------------------------------------------------------------------
  // MCP Server
  // -------------------------------------------------------------------------
  const mcpServer = createMcpServer();

  /** Build MCP helpers that delegate to server.ts internal functions. */
  function buildMcpHelpers(): McpContext["helpers"] {
    return {
      installAppOnServer,
      uninstallAppFromServer,
      archiveServer: async (params: {
        session: SessionRecord;
        serverId: string;
      }) => {
        const archived = await archiveServer({
          session: params.session,
          serverId: params.serverId,
        });
        if (!archived.ok) {
          return { ok: false as const, error: archived.error, status: archived.status };
        }
        return { ok: true as const, status: archived.server.status };
      },
      restoreServer: async (params: {
        session: SessionRecord;
        serverId: string;
      }) => {
        const restored = await restoreServer({
          session: params.session,
          serverId: params.serverId,
        });
        if (!restored.ok) {
          return { ok: false as const, error: restored.error, status: restored.status };
        }
        return { ok: true as const, status: restored.server.status };
      },
      destroyServer: async (params: {
        session: SessionRecord;
        serverId: string;
      }) => {
        const destroyed = await destroyServer({
          session: params.session,
          serverId: params.serverId,
        });
        if (!destroyed.ok) {
          return { ok: false as const, error: destroyed.error, status: destroyed.status };
        }
        return { ok: true as const, status: destroyed.server.status };
      },
      createRecoveryPoint: async (params: {
        session: SessionRecord;
        serverId: string;
        label: string;
        notes?: string | null;
      }) => {
        const created = await createNamedRecoveryPoint({
          session: params.session,
          serverId: params.serverId,
          label: params.label,
          notes: params.notes ?? null,
        });
        if (!created.ok) {
          return { ok: false as const, error: created.error, status: created.status };
        }
        return {
          ok: true as const,
          recoveryPointId: created.recoveryPoint.recoveryPointId,
          providerArtifactId: created.recoveryPoint.providerArtifactId,
          captureType: created.recoveryPoint.captureType,
        };
      },
      listRecoveryPoints: async (params: {
        session: SessionRecord;
        serverId: string;
      }) => {
        const access = resolveServerReadAccess({
          session: params.session,
          serverId: params.serverId,
        });
        if (!access.ok) {
          return { ok: false as const, error: access.error, status: access.status };
        }
        const items = store.listServerRecoveryPoints(access.server.serverId);
        return {
          ok: true as const,
          items: items.map((item) => ({
            recoveryPointId: item.recoveryPointId,
            label: item.label,
            captureType: item.captureType,
            createdAtMs: item.createdAtMs,
          })),
        };
      },
      createServer: async (params: {
        session: SessionRecord;
        plan?: string;
        displayName?: string;
      }) => {
        const accountId = params.session.principal.accountId;
        if (!accountId) {
          return { ok: false as const, error: "no_account" };
        }
        if (!standardCloudProvider) {
          return { ok: false as const, error: "cloud_provider_not_configured" };
        }

        // Credit / free-tier check
        const mcpCredits = store.getCreditBalance(accountId);
        const mcpIsFreeTier = !!(mcpCredits?.freeTierExpiresAtMs && mcpCredits.freeTierExpiresAtMs > Date.now());
        const mcpHasBalance = !!(mcpCredits && mcpCredits.balanceCents > 0);
        const hasInternalBypass = hasInternalCreatorBypass(params.session.principal);
        if (!hasInternalBypass && !mcpIsFreeTier && !mcpHasBalance) {
          return { ok: false as const, error: "payment_required" };
        }

        const plan = params.plan ?? "cax11";
        if (!hasInternalBypass && mcpIsFreeTier && !mcpHasBalance) {
          if (plan !== "cax11") {
            return { ok: false as const, error: "free_tier_plan_limit" };
          }
          const existing = store.getServersForAccount(accountId).filter((s) => s.status !== "destroyed");
          if (existing.length >= 1) {
            return { ok: false as const, error: "free_tier_server_limit" };
          }
        }

        const serverId = `srv-${randomUUID().slice(0, 12)}`;
        const tenantId = `t-${randomUUID().slice(0, 12)}`;
        const provisionToken = `prov-${randomToken(32)}`;
        const runtimeAuthToken = `rt-${randomToken(32)}`;
        const generatedName = `Server ${Date.now().toString(36)}`;
        const bootstrapTransport = resolveBootstrapTransportConfig({
          serverClass: "standard",
          providerName: "hetzner",
          tenantId,
        });
        if (!bootstrapTransport) {
          return {
            ok: false as const,
            error: "tailscale_not_configured",
          };
        }

        store.createServer({
          serverId,
          accountId,
          tenantId,
          displayName: params.displayName?.trim() || generatedName,
          generatedName,
          serverClass: "standard",
          deploymentClass: "customer_server",
          plan,
          provider: "hetzner",
          provisionToken,
          runtimeAuthToken,
        });

        const cloudInitScript = renderCloudInitScript({
          tenantId,
          serverId,
          authToken: runtimeAuthToken,
          provisionToken,
          frontdoorUrl: bootstrapTransport.frontdoorUrl,
          runtimeTokenIssuer: config.runtimeTokenIssuer,
          runtimeTokenSecret: config.runtimeTokenSecret,
          runtimeTokenActiveKid: config.runtimeTokenActiveKid,
          tailscaleAuthKey: bootstrapTransport.tailscaleAuthKey,
          tailscaleHostname: bootstrapTransport.tailscaleHostname,
        });

        try {
          const result = await standardCloudProvider.createServer({
            tenantId,
            planId: plan,
            cloudInitScript,
          });
          store.updateServer(serverId, {
            providerServerId: result.providerServerId,
            privateIp: result.privateIp || undefined,
            transportHost: result.privateIp || undefined,
            publicIp: result.publicIp || undefined,
            backupEnabled: result.backupEnabled,
            deleteProtectionEnabled: result.deleteProtectionEnabled,
            rebuildProtectionEnabled: result.rebuildProtectionEnabled,
          });
        } catch (err) {
          console.error(`[mcp create-server] Hetzner API failed:`, err);
          store.updateServer(serverId, { status: "failed" });
          return { ok: false as const, error: `cloud_create_failed: ${String(err)}` };
        }

        return { ok: true as const, serverId, tenantId, status: "provisioning" };
      },
      deterministicServerNameFromId,
      getServerPublicUrl,
    };
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", config.baseUrl);
    const pathname = url.pathname;
    const method = (req.method ?? "GET").toUpperCase();
    const startedAt = Date.now();
    const requestId = readHeaderValue(req.headers["x-request-id"]) || randomToken(10);
    const clientIp = getClientIp(req);
    const cookies = parseCookies(req);
    const requestSecure = resolveRequestSecureContext(req, config.baseUrl);
    const cookieSecure = config.sessionCookieSecure === true || requestSecure;
    res.setHeader("x-request-id", requestId);
    applySecurityHeaders(res, {
      config,
      requestSecure,
    });
    res.on("finish", () => {
      logFrontdoorEvent("http_request", {
        request_id: requestId,
        method,
        path: pathname,
        status: res.statusCode,
        duration_ms: Date.now() - startedAt,
        client_ip: clientIp,
      });
    });
    try {
      // ── Tenant subdomain routing ──
      const tenantIdFromHost = extractTenantId(req.headers.host);
      if (tenantIdFromHost) {
        // Tenant subdomain request — proxy to VPS
        const route = routingTable.get(tenantIdFromHost);
        if (!route || route.status !== "running") {
          // Check if server is suspended (insufficient credits) by looking up by tenantId
          const suspendedServer = store.getServerByTenantId(tenantIdFromHost);
          if (suspendedServer?.status === "suspended") {
            sendJson(res, 402, { error: "payment_required", message: "Server suspended — add credits to your account to resume." });
            return;
          }
          sendJson(res, 503, { error: "server_not_available", message: "This server is not currently running." });
          return;
        }

        // Add proxy headers
        req.headers["x-forwarded-for"] = getClientIp(req);
        req.headers["x-forwarded-proto"] = "https";
        req.headers["x-forwarded-host"] = req.headers.host || "";
        req.headers["x-nexus-tenant-id"] = route.tenantId;
        req.headers["x-nexus-server-id"] = route.serverId;
        req.headers["x-request-id"] = req.headers["x-request-id"] ?? randomToken(10);

        // Check for platform auth (session cookie or nex_t_ token)
        const tenantCookies = parseCookies(req);
        const tenantSessionId = tenantCookies[config.sessionCookieName];
        if (tenantSessionId) {
          const tenantSession = sessions.getSession(tenantSessionId);
          if (tenantSession && tenantSession.expiresAtMs > Date.now()) {
            req.headers["x-nexus-user-id"] = tenantSession.principal.userId;
            if (tenantSession.principal.accountId) {
              req.headers["x-nexus-account-id"] = tenantSession.principal.accountId;
            }
            if (!req.headers["authorization"] && route.runtimeAuthToken) {
              req.headers["authorization"] = `Bearer ${route.runtimeAuthToken}`;
            }
          }
        }
        // If Authorization header is nex_t_*, validate as API token
        const tenantAuthHeader = req.headers["authorization"];
        if (typeof tenantAuthHeader === "string" && tenantAuthHeader.startsWith("Bearer nex_t_")) {
          const tokenStr = tenantAuthHeader.slice(7);
          const hash = createHash("sha256").update(tokenStr).digest("hex");
          const tokenRecord = store.getApiTokenByHash(hash);
          if (tokenRecord && !tokenRecord.revokedAtMs && (!tokenRecord.expiresAtMs || tokenRecord.expiresAtMs > Date.now())) {
            store.touchApiToken(tokenRecord.tokenId);
            req.headers["x-nexus-user-id"] = tokenRecord.userId;
            req.headers["x-nexus-account-id"] = tokenRecord.accountId;
            if (route.runtimeAuthToken) {
              req.headers["authorization"] = `Bearer ${route.runtimeAuthToken}`;
            }
          }
        }
        // No platform auth — pass through (Tier 2, VPS decides)

        const tenantUrl = new URL(req.url ?? "/", config.baseUrl);
        const tenantNextPath =
          tenantUrl.pathname === "/runtime" || tenantUrl.pathname.startsWith("/runtime/")
            ? `${tenantUrl.pathname.slice("/runtime".length) || "/"}${tenantUrl.search || ""}`
            : `${tenantUrl.pathname || "/"}${tenantUrl.search || ""}`;
        req.url = tenantNextPath;

        const targetUrl = `http://${route.transportHost}:${route.runtimePort}`;
        proxy.web(req, res, { target: targetUrl, changeOrigin: true });
        return;
      }

      if (isMutationMethod(method) && !isSameOriginBrowserMutation(req, config.baseUrl)) {
        sendJson(res, 403, {
          ok: false,
          error: "origin_not_allowed",
        });
        logFrontdoorEvent("origin_rejected", {
          request_id: requestId,
          method,
          path: pathname,
          origin: readHeaderValue(req.headers.origin) || null,
          referer: readHeaderValue(req.headers.referer) || null,
        });
        return;
      }

      if (method === "GET" && pathname === "/health") {
        sendJson(res, 200, {
          ok: true,
          service: "nexus-frontdoor",
          host: config.host,
          port: config.port,
          tenants: config.tenants.size,
        });
        return;
      }

      if (method === "GET" && pathname === "/") {
        serveUiShell(res);
        return;
      }

      // -------------------------------------------------------------------
      // MCP endpoint — JSON-RPC 2.0 over HTTP POST
      // -------------------------------------------------------------------
      if (method === "POST" && pathname === "/mcp") {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, { error: "unauthorized" });
          return;
        }

        const body = await readJsonBody(req);
        if (!body || typeof body !== "object") {
          sendJson(res, 400, {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          });
          return;
        }

        const mcpCtx: McpContext = {
          session,
          store,
          config,
          cloudProvider: standardCloudProvider ?? resolvedCompliantCloudProvider,
          helpers: buildMcpHelpers(),
        };

        const result = await mcpServer.handleRequest(body, mcpCtx);
        sendJson(res, 200, result as Record<string, unknown>);
        return;
      }

      if (method === "GET" && pathname === "/api/auth/session") {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 200, {
            authenticated: false,
          });
          return;
        }
        const { accounts, activeAccount } = resolveAccessibleAccountsForSession(session);
        const servers = store.getServersForUser(session.principal.userId);
        const activeServer =
          (session.principal.serverId
            ? servers.find((item) => item.serverId === session.principal.serverId) ?? null
            : null) ?? null;
        sendJson(res, 200, {
          authenticated: true,
          session_id: session.id,
          user_id: session.principal.userId,
          tenant_id: session.principal.tenantId,
          server_id: session.principal.serverId || null,
          entity_id: session.principal.entityId,
          username: session.principal.username,
          display_name: session.principal.displayName,
          email: session.principal.email,
          roles: session.principal.roles,
          scopes: session.principal.scopes,
          account_id: session.principal.accountId || null,
          account_count: accounts.length,
          active_account_id: activeAccount?.accountId ?? null,
          active_account_display_name: activeAccount?.displayName ?? null,
          server_count: servers.length,
          active_server_id: activeServer?.serverId ?? null,
          active_server_display_name: activeServer?.displayName ?? null,
          latest_provisioning: getLatestProvisionRequestForPrincipal({
            autoProvisioner,
            principal: session.principal,
            store,
          }),
        });
        return;
      }

      if (method === "GET" && pathname === "/api/accounts") {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const { accounts, activeAccount } = resolveAccessibleAccountsForSession(session);
        sendJson(res, 200, {
          ok: true,
          active_account_id: activeAccount?.accountId ?? null,
          items: accounts.map((account) => ({
            account_id: account.accountId,
            display_name: account.displayName,
            role:
              store.getAccountMembership(account.accountId, session.principal.userId)?.role ?? "member",
            status: account.status,
          })),
        });
        return;
      }

      if (method === "POST" && pathname === "/api/accounts/select") {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const body = (await readJsonBody<{ account_id?: string }>(req)) ?? {};
        const selectedAccountId =
          typeof body.account_id === "string" ? body.account_id.trim() : "";
        if (!selectedAccountId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_account_id",
          });
          return;
        }
        const user = store.getUserById(session.principal.userId);
        if (!user || user.disabled) {
          sendJson(res, 401, {
            ok: false,
            error: "user_not_found",
          });
          return;
        }
        const accounts = store.getAccountsForUser(user.userId);
        const account = accounts.find((item) => item.accountId === selectedAccountId) ?? null;
        if (!account) {
          sendJson(res, 404, {
            ok: false,
            error: "account_not_found",
          });
          return;
        }
        const selectedServer =
          session.principal.serverId
            ? (() => {
                const currentServer = store.getServer(session.principal.serverId);
                if (currentServer && currentServer.accountId === account.accountId) {
                  return currentServer;
                }
                return null;
              })()
            : null;
        const nextPrincipal = store.toPrincipal({
          user,
          server: selectedServer,
          accountId: account.accountId,
          amr: session.principal.amr,
        });
        sessions.updateSessionPrincipal(session.id, nextPrincipal);
        sendJson(res, 200, {
          ok: true,
          account_id: account.accountId,
          display_name: account.displayName,
          active_server_id: selectedServer?.serverId ?? null,
        });
        return;
      }

      if (method === "GET" && pathname === "/api/auth/me") {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "not_authenticated" });
          return;
        }
        const user = store.getUserById(session.principal.userId);
        sendJson(res, 200, {
          ok: true,
          user_id: session.principal.userId,
          username: session.principal.username,
          display_name: session.principal.displayName,
          email: session.principal.email ?? user?.email ?? null,
          roles: session.principal.roles,
          scopes: session.principal.scopes,
          account_id: session.principal.accountId || null,
          server_id: session.principal.serverId || null,
          tenant_id: session.principal.tenantId || null,
        });
        return;
      }

      if (method === "POST" && pathname === "/api/auth/login") {
        if (config.passwordAuthEnabled === false) {
          sendJson(res, 403, {
            ok: false,
            error: "password_auth_disabled",
          });
          return;
        }
        if (
          !applyRateLimit({
            req,
            res,
            limiter: loginAttemptLimiter,
            key: `login:attempt:${clientIp}`,
            error: "login_rate_limited",
          })
        ) {
          return;
        }
        const body = (await readJsonBody<{ username?: string; password?: string }>(req)) ?? {};
        const username =
          typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
        const password = typeof body.password === "string" ? body.password : "";
        const failureKey = `login:failure:${clientIp}:${username || "-"}`;
        const user = store.authenticatePassword(username, password);
        if (!user) {
          const failed = loginFailureLimiter.consume(failureKey);
          if (!failed.ok) {
            if (typeof failed.retryAfterSeconds === "number") {
              res.setHeader("Retry-After", String(failed.retryAfterSeconds));
            }
            sendJson(res, 429, {
              ok: false,
              error: "login_rate_limited",
              retry_after_seconds: failed.retryAfterSeconds ?? null,
            });
            return;
          }
          sendJson(res, 401, {
            ok: false,
            error: "invalid_credentials",
          });
          logFrontdoorEvent("auth_login_failed", {
            request_id: requestId,
            username: username || null,
            client_ip: clientIp,
          });
          return;
        }
        loginFailureLimiter.reset(failureKey);
        const userServers = store.getServersForUser(user.userId);
        const defaultServer = userServers.length > 0 ? userServers[0] : null;
        const accounts = store.getAccountsForUser(user.userId);
        const defaultAccountId = defaultServer?.accountId || accounts[0]?.accountId;
        const principal = store.toPrincipal({
          user,
          server: defaultServer,
          accountId: defaultAccountId,
          amr: ["pwd"],
        });
        const session = sessions.createSession(principal);
        const serverCount = userServers.length;
        setCookie({
          res,
          name: config.sessionCookieName,
          value: session.id,
          domain: config.sessionCookieDomain,
          maxAgeSeconds: config.sessionTtlSeconds,
          secure: cookieSecure,
        });
        sendJson(res, 200, {
          ok: true,
          authenticated: true,
          session_id: session.id,
          tenant_id: principal.tenantId,
          server_id: principal.serverId || null,
          entity_id: principal.entityId,
          user_id: principal.userId,
          roles: principal.roles,
          scopes: principal.scopes,
          account_id: principal.accountId || null,
          server_count: serverCount,
        });
        logFrontdoorEvent("auth_login_succeeded", {
          request_id: requestId,
          user_id: principal.userId,
          tenant_id: principal.tenantId || null,
          client_ip: clientIp,
        });
        return;
      }

      // ── Signup (password-based registration) ──────────────────────
      if (method === "POST" && pathname === "/api/auth/signup") {
        if (config.passwordAuthEnabled === false) {
          sendJson(res, 403, {
            ok: false,
            error: "password_auth_disabled",
          });
          return;
        }
        if (
          !applyRateLimit({
            req,
            res,
            limiter: loginAttemptLimiter,
            key: `signup:attempt:${clientIp}`,
            error: "signup_rate_limited",
          })
        ) {
          return;
        }
        const body =
          (await readJsonBody<{
            email?: string;
            username?: string;
            password?: string;
            display_name?: string;
            intent_app?: string;
          }>(req)) ?? {};
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const username =
          typeof body.username === "string"
            ? body.username.trim().toLowerCase()
            : email.split("@")[0]?.replace(/[^a-z0-9_-]/g, "") || "";
        const password = typeof body.password === "string" ? body.password : "";
        const displayName =
          typeof body.display_name === "string" ? body.display_name.trim() : username;
        const intentApp =
          typeof body.intent_app === "string" ? body.intent_app.trim().toLowerCase() : "";

        // Validate required fields
        if (!email || !email.includes("@")) {
          sendJson(res, 400, { ok: false, error: "invalid_email" });
          return;
        }
        if (!password || password.length < 6) {
          sendJson(res, 400, {
            ok: false,
            error: "password_too_short",
            detail: "Password must be at least 6 characters",
          });
          return;
        }
        if (!username || username.length < 2) {
          sendJson(res, 400, { ok: false, error: "invalid_username" });
          return;
        }

        // Check for existing user with same email or username
        const existingByEmail = store.getUserByEmail(email);
        if (existingByEmail) {
          sendJson(res, 409, { ok: false, error: "email_already_registered" });
          return;
        }
        const existingByUsername = store.getUserByUsername(username);
        if (existingByUsername) {
          sendJson(res, 409, { ok: false, error: "username_already_taken" });
          return;
        }

        // Create user
        const userId = `user-${randomUUID().slice(0, 12)}`;
        const passwordHash = createPasswordHash(password);
        const user = store.upsertUser({
          userId,
          entityId: `entity:${randomUUID()}`,
          username,
          passwordHash,
          email,
          displayName: displayName || username,
          disabled: false,
        });

        // Create account
        const account = store.createAccount(displayName || username, userId);

        let redirectTo = "/";

        if (intentApp) {
          store.createAppSubscription({
            accountId: account.accountId,
            appId: intentApp,
            planId: `${intentApp}-free`,
            status: "active",
            provider: "none",
          });
        }

        const userServers = store.getServersForUser(userId);
        const defaultServer = userServers.length > 0 ? userServers[0] : null;
        const serverId = defaultServer?.serverId ?? null;
        const principal = store.toPrincipal({
          user,
          server: defaultServer,
          accountId: account.accountId,
          amr: ["pwd"],
        });
        const session = sessions.createSession(principal);
        setCookie({
          res,
          name: config.sessionCookieName,
          value: session.id,
          domain: config.sessionCookieDomain,
          maxAgeSeconds: config.sessionTtlSeconds,
          secure: cookieSecure,
        });

        if (intentApp && defaultServer) {
          redirectTo = `/app/${intentApp}/`;
        } else if (intentApp && (autoProvisioner || standardCloudProvider || resolvedCompliantCloudProvider)) {
          redirectTo = `/?product=${encodeURIComponent(intentApp)}&provisioning=1`;
        }

        sendJson(res, 201, {
          ok: true,
          session_id: session.id,
          user_id: userId,
          account_id: account.accountId,
          server_id: serverId,
          redirect_to: redirectTo,
        });
        logFrontdoorEvent("auth_signup_succeeded", {
          request_id: requestId,
          user_id: userId,
          intent_app: intentApp || null,
          client_ip: clientIp,
        });
        return;
      }

      if (method === "POST" && pathname === "/api/auth/logout") {
        const session = readSession({ req, config, sessions, store });
        if (session) {
          sessions.deleteSession(session.id);
        }
        clearCookie({
          res,
          name: config.sessionCookieName,
          domain: config.sessionCookieDomain,
          secure: cookieSecure,
        });
        sendJson(res, 200, { ok: true });
        return;
      }

      // ── Public Product Registry ────────────────────────────────────
      if (method === "GET" && pathname === "/api/products") {
        const session = readSession({ req, config, sessions, store });
        const products = store
          .listProducts()
          .filter((product) => isProductVisibleToPrincipal(product, session?.principal ?? null));
        sendJson(res, 200, {
          ok: true,
          items: products.map((p) => ({
            product_id: p.productId,
            display_name: p.displayName,
            tagline: p.tagline ?? null,
            accent_color: p.accentColor ?? null,
            homepage_url: p.homepageUrl ?? null,
            required_server_class: getTopLevelAppHostingPolicy(p.productId).requiredServerClass,
          })),
        });
        return;
      }

      const productDetailRouteMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
      if (method === "GET" && productDetailRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        const productId = decodeURIComponent(productDetailRouteMatch[1] ?? "").trim();
        if (!productId) {
          sendJson(res, 400, { ok: false, error: "missing_product_id" });
          return;
        }
        const product = store.getProduct(productId);
        if (!product || !isProductVisibleToPrincipal(product, session?.principal ?? null)) {
          sendJson(res, 404, { ok: false, error: "product_not_found" });
          return;
        }
        const plans = store.listProductPlans(productId);
        sendJson(res, 200, {
          ok: true,
          product_id: product.productId,
          display_name: product.displayName,
          tagline: product.tagline ?? null,
          accent_color: product.accentColor ?? null,
          homepage_url: product.homepageUrl ?? null,
          required_server_class: getTopLevelAppHostingPolicy(product.productId).requiredServerClass,
          plans: plans.map((p) => ({
            plan_id: p.planId,
            display_name: p.displayName,
            description: p.description ?? null,
            price_monthly: p.priceMonthly,
            price_yearly: p.priceYearly ?? null,
            features: p.featuresJson ? JSON.parse(p.featuresJson) : [],
            is_default: p.isDefault,
            sort_order: p.sortOrder,
          })),
        });
        return;
      }

      const productPlansRouteMatch = pathname.match(/^\/api\/products\/([^/]+)\/plans$/);
      if (method === "GET" && productPlansRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        const productId = decodeURIComponent(productPlansRouteMatch[1] ?? "").trim();
        if (!productId) {
          sendJson(res, 400, { ok: false, error: "missing_product_id" });
          return;
        }
        const product = store.getProduct(productId);
        if (!product || !isProductVisibleToPrincipal(product, session?.principal ?? null)) {
          sendJson(res, 404, { ok: false, error: "product_not_found" });
          return;
        }
        const plans = store.listProductPlans(productId);
        sendJson(res, 200, {
          ok: true,
          product_id: productId,
          items: plans.map((p) => ({
            plan_id: p.planId,
            display_name: p.displayName,
            description: p.description ?? null,
            price_monthly: p.priceMonthly,
            price_yearly: p.priceYearly ?? null,
            features: p.featuresJson ? JSON.parse(p.featuresJson) : [],
            limits: p.limitsJson ? JSON.parse(p.limitsJson) : {},
            is_default: p.isDefault,
            sort_order: p.sortOrder,
          })),
        });
        return;
      }

      if (method === "GET" && pathname === "/api/apps/catalog") {
        const session = readSession({ req, config, sessions, store });
        const products = store
          .listProducts()
          .filter((product) => isProductVisibleToPrincipal(product, session?.principal ?? null));
        // If authenticated, include per-user install info
        let userServerIds: string[] = [];
        const installsByApp = new Map<string, string[]>();
        if (session) {
          const allServers = store
            .getServersForUser(session.principal.userId)
            .filter((s) => s.status !== "destroyed");
          userServerIds = allServers.map((s) => s.serverId);
          for (const srv of allServers) {
            const installs = store.getServerEffectiveAppInstalls(srv.serverId);
            for (const inst of installs) {
              if (inst.status === "installed") {
                const arr = installsByApp.get(inst.appId) ?? [];
                arr.push(srv.serverId);
                installsByApp.set(inst.appId, arr);
              }
            }
          }
        }
        sendJson(res, 200, {
          ok: true,
          items: products.map((product) => ({
            app_id: product.productId,
            display_name: product.displayName,
            tagline: product.tagline ?? null,
            accent_color: product.accentColor ?? null,
            homepage_url: product.homepageUrl ?? null,
            latest_version: product.manifestVersion ?? null,
            required_server_class: getTopLevelAppHostingPolicy(product.productId).requiredServerClass,
            installed_on: installsByApp.get(product.productId) ?? [],
          })),
        });
        return;
      }

      if (method === "GET" && pathname === "/api/apps/owned") {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const accounts = store.getAccountsForUser(session.principal.userId);
        const productsById = new Map(
          store
            .listProducts()
            .filter((product) => isProductVisibleToPrincipal(product, session.principal))
            .map((product) => [product.productId, product]),
        );
        // Collect app subscriptions across all user's accounts
        const subscriptionsByApp = new Map<string, { status: string; source: string }>();
        for (const account of accounts) {
          const subs = store.getAppSubscriptionsForAccount(account.accountId);
          for (const sub of subs) {
            if (!subscriptionsByApp.has(sub.appId)) {
              subscriptionsByApp.set(sub.appId, { status: sub.status, source: sub.provider });
            }
          }
        }
        const servers = store.getServersForUser(session.principal.userId);
        const installedByApp = new Map<string, Set<string>>();
        for (const server of servers) {
          const effectiveInstalls = store.getServerEffectiveAppInstalls(server.serverId);
          for (const install of effectiveInstalls) {
            if (install.status !== "installed") {
              continue;
            }
            const bucket = installedByApp.get(install.appId) ?? new Set<string>();
            bucket.add(server.serverId);
            installedByApp.set(install.appId, bucket);
          }
        }
        sendJson(res, 200, {
          ok: true,
          items: [...subscriptionsByApp.entries()]
            .filter(([appId]) => productsById.has(appId))
            .map(([appId, sub]) => {
              const product = productsById.get(appId) ?? null;
              const serverIds = [...(installedByApp.get(appId) ?? new Set<string>())];
              return {
                app_id: appId,
                status: sub.status,
                source: sub.source,
                display_name: product?.displayName ?? appId,
                tagline: product?.tagline ?? null,
                accent_color: product?.accentColor ?? null,
                required_server_class: getTopLevelAppHostingPolicy(appId).requiredServerClass,
                server_ids: serverIds,
                install_count: serverIds.length,
              };
            }),
        });
        return;
      }

      const appPurchaseRouteMatch = pathname.match(/^\/api\/apps\/([^/]+)\/purchase$/);
      if (method === "POST" && appPurchaseRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const appId = normalizeAppId(decodeURIComponent(appPurchaseRouteMatch[1] ?? ""));
        if (!isValidAppId(appId)) {
          sendJson(res, 400, {
            ok: false,
            error: "invalid_app_id",
          });
          return;
        }
        const product = store.getProduct(appId);
        if (!product || !isProductVisibleToPrincipal(product, session.principal)) {
          sendJson(res, 404, {
            ok: false,
            error: "app_not_found",
          });
          return;
        }
        const body =
          (await readJsonBody<{
            server_id?: string;
            install?: boolean;
          }>(req)) ?? {};
        const requestedServerId =
          typeof body.server_id === "string" ? body.server_id.trim() : "";
        const shouldInstall = body.install !== false;

        // Create app subscription at account level
        const accounts = store.getAccountsForUser(session.principal.userId);
        const targetAccountId = session.principal.accountId || accounts[0]?.accountId;
        if (!targetAccountId) {
          sendJson(res, 400, { ok: false, error: "no_account" });
          return;
        }
        store.createAppSubscription({
          accountId: targetAccountId,
          appId,
          planId: "default",
          status: "active",
          provider: "manual",
        });

        let installedServerId: string | null = null;
        if (shouldInstall && requestedServerId) {
          const access = resolveServerAdminAccess({
            session,
            serverId: requestedServerId,
          });
          if (!access.ok) {
            sendJson(res, access.status, {
              ok: false,
              error: access.error,
              app_id: appId,
              server_id: requestedServerId,
            });
            return;
          }
          const installed = await installAppOnServer({
            serverId: requestedServerId,
            appId,
            accountId: access.server.accountId,
            source: "purchase",
          });
          if (!installed.ok) {
            sendJson(res, installed.status ?? 500, {
              ok: false,
              error: installed.error,
              detail: installed.detail ?? null,
              app_id: appId,
              server_id: requestedServerId,
            });
            return;
          }
          installedServerId = requestedServerId;
        }

        sendJson(res, 200, {
          ok: true,
          app_id: appId,
          status: "active",
          installed_server_id: installedServerId,
        });
        return;
      }

      // Subscription cancel: POST /api/apps/:appId/cancel
      const appCancelRouteMatch = pathname.match(/^\/api\/apps\/([^/]+)\/cancel$/);
      if (method === "POST" && appCancelRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const appId = normalizeAppId(decodeURIComponent(appCancelRouteMatch[1] ?? ""));
        if (!isValidAppId(appId)) {
          sendJson(res, 400, { ok: false, error: "invalid_app_id" });
          return;
        }
        const accounts = store.getAccountsForUser(session.principal.userId);
        let cancelled = false;
        for (const account of accounts) {
          const sub = store.getAppSubscription(account.accountId, appId);
          if (sub && sub.status === "active") {
            store.updateAppSubscription(account.accountId, appId, {
              status: "cancelled",
              cancelledAtMs: Date.now(),
            });
            cancelled = true;
            break;
          }
        }
        if (!cancelled) {
          sendJson(res, 404, { ok: false, error: "subscription_not_found" });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          app_id: appId,
          status: "cancelled",
        });
        return;
      }

      if (method === "GET" && pathname === "/api/servers") {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const { activeAccount } = resolveAccessibleAccountsForSession(session);
        const allServers = activeAccount
          ? store.getServersForAccount(activeAccount.accountId)
          : store.getServersForUser(session.principal.userId);
        const servers = allServers.filter((s) => s.status !== "destroyed");
        sendJson(res, 200, {
          ok: true,
          active_account_id: activeAccount?.accountId ?? null,
          items: servers.map((server) => {
            const appInstalls = store.getServerEffectiveAppInstalls(server.serverId);
            return {
              server_id: server.serverId,
              display_name: server.displayName,
              generated_name: server.generatedName || deterministicServerNameFromId(server.serverId),
              account_id: server.accountId,
              status: server.status,
              server_class: server.serverClass,
              deployment_class: server.deploymentClass,
              plan: server.plan,
              app_count: appInstalls.length,
              installed_app_ids: appInstalls
                .filter((item) => item.status === "installed")
                .map((item) => item.appId),
            };
          }),
        });
        return;
      }

      if (method === "POST" && pathname === "/api/servers/select") {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const selectBody =
          (await readJsonBody<{ server_id?: string }>(req)) ?? {};
        const selectServerId =
          typeof selectBody.server_id === "string"
            ? selectBody.server_id.trim()
            : "";
        if (!selectServerId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const userServers = store.getServersForUser(
          session.principal.userId,
        );
        const targetServer = userServers.find(
          (s) => s.serverId === selectServerId,
        );
        if (!targetServer) {
          sendJson(res, 404, {
            ok: false,
            error: "server_not_found",
          });
          return;
        }
        const selectPrincipal: Principal = {
          ...session.principal,
          serverId: targetServer.serverId,
          tenantId: targetServer.tenantId,
          accountId: targetServer.accountId,
        };
        sessions.updateSessionPrincipal(session.id, selectPrincipal);
        sendJson(res, 200, {
          ok: true,
          server_id: targetServer.serverId,
          display_name: targetServer.displayName,
        });
        return;
      }

      if (method === "POST" && pathname === "/api/servers") {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        if (!isServerCreatorAuthorized(session.principal)) {
          sendJson(res, 403, {
            ok: false,
            error: "server_creation_forbidden",
          });
          return;
        }
        const body =
          (await readJsonBody<{
            server_id?: string;
            display_name?: string;
            runtime_auth_token?: string;
            app_id?: string;
            server_class?: string;
            deployment_class?: string;
          }>(req)) ?? {};
        const displayName =
          typeof body.display_name === "string" && body.display_name.trim()
            ? body.display_name.trim()
            : "Server";
        const requestedServerId =
          typeof body.server_id === "string" && body.server_id.trim()
            ? body.server_id.trim()
            : undefined;
        const requestedServerClass = parseRequestedServerClass(body.server_class);
        if (!requestedServerClass) {
          sendJson(res, 400, {
            ok: false,
            error: "invalid_server_class",
          });
          return;
        }
        const requestedDeploymentClass = parseRequestedServerDeploymentClass(body.deployment_class);
        if (!requestedDeploymentClass) {
          sendJson(res, 400, {
            ok: false,
            error: "invalid_deployment_class",
          });
          return;
        }
        try {
          // Get or create account for the user
          const accounts = store.getAccountsForUser(session.principal.userId);
          const accountId = session.principal.accountId || accounts[0]?.accountId;
          if (!accountId) {
            sendJson(res, 400, { ok: false, error: "no_account" });
            return;
          }
          const tenantId = `t-${randomUUID().slice(0, 12)}`;
          const createdServer = store.createServer({
            serverId: requestedServerId,
            accountId,
            tenantId,
            displayName,
            generatedName: deterministicServerNameFromId(requestedServerId ?? displayName),
            serverClass: requestedServerClass,
            deploymentClass: requestedDeploymentClass,
            runtimeAuthToken:
              typeof body.runtime_auth_token === "string"
                ? body.runtime_auth_token.trim()
                : undefined,
          });
          store.updateServer(createdServer.serverId, {
            status: "running",
          });
          const server = store.getServer(createdServer.serverId) ?? {
            ...createdServer,
            status: "running" as const,
          };
          syncServerRuntimeProjection(server);
          const requestedAppId = normalizeAppId(body.app_id);
          if (requestedAppId && requestedAppId !== "console") {
            const appSub = store.getAppSubscription(accountId, requestedAppId);
            store.upsertServerAppInstall({
              serverId: server.serverId,
              appId: requestedAppId,
              status: appSub?.status === "active" ? "installed" : "blocked_no_entitlement",
              entryPath: defaultEntryPathForApp(requestedAppId),
              source: "manual",
            });
          }
          sendJson(res, 200, {
            ok: true,
            server: {
              server_id: server.serverId,
              display_name: server.displayName,
              generated_name: server.generatedName || deterministicServerNameFromId(server.serverId),
              account_id: server.accountId,
              status: server.status,
              server_class: server.serverClass,
              deployment_class: server.deploymentClass,
            },
          });
        } catch (error) {
          sendJson(res, 400, {
            ok: false,
            error: String(error),
          });
        }
        return;
      }

      const serverRecoveryPointsRouteMatch = pathname.match(
        /^\/api\/servers\/([^/]+)\/recovery-points$/,
      );
      if (serverRecoveryPointsRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverRecoveryPointsRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        if (method === "GET") {
          const access = resolveServerReadAccess({ session, serverId });
          if (!access.ok) {
            sendJson(res, access.status, {
              ok: false,
              error: access.error,
            });
            return;
          }
          const items = store.listServerRecoveryPoints(access.server.serverId);
          sendJson(res, 200, {
            ok: true,
            server_id: access.server.serverId,
            items: items.map((item) => ({
              recovery_point_id: item.recoveryPointId,
              server_id: item.serverId,
              tenant_id: item.tenantId,
              provider: item.provider,
              provider_artifact_id: item.providerArtifactId,
              capture_type: item.captureType,
              label: item.label,
              notes: item.notes,
              created_at: new Date(item.createdAtMs).toISOString(),
            })),
          });
          return;
        }
        if (method === "POST") {
          const body =
            (await readJsonBody<{ label?: string; notes?: string | null }>(req)) ?? {};
          const label = typeof body.label === "string" ? body.label.trim() : "";
          if (!label) {
            sendJson(res, 400, {
              ok: false,
              error: "missing_recovery_point_label",
            });
            return;
          }
          const created = await createNamedRecoveryPoint({
            session,
            serverId,
            label,
            notes: typeof body.notes === "string" ? body.notes.trim() : null,
          });
          if (!created.ok) {
            sendJson(res, created.status, {
              ok: false,
              error: created.error,
            });
            return;
          }
          sendJson(res, 200, {
            ok: true,
            server_id: created.recoveryPoint.serverId,
            recovery_point: {
              recovery_point_id: created.recoveryPoint.recoveryPointId,
              server_id: created.recoveryPoint.serverId,
              tenant_id: created.recoveryPoint.tenantId,
              provider: created.recoveryPoint.provider,
              provider_artifact_id: created.recoveryPoint.providerArtifactId,
              capture_type: created.recoveryPoint.captureType,
              label: created.recoveryPoint.label,
              notes: created.recoveryPoint.notes,
              created_at: new Date(created.recoveryPoint.createdAtMs).toISOString(),
            },
          });
          return;
        }
        sendJson(res, 405, {
          ok: false,
          error: "method_not_allowed",
        });
        return;
      }

      const serverArchiveRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)\/archive$/);
      if (method === "POST" && serverArchiveRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverArchiveRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const archived = await archiveServer({ session, serverId });
        if (!archived.ok) {
          sendJson(res, archived.status, {
            ok: false,
            error: archived.error,
          });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          server_id: archived.server.serverId,
          status: archived.server.status,
          archived_at: archived.server.archivedAtMs
            ? new Date(archived.server.archivedAtMs).toISOString()
            : null,
        });
        return;
      }

      const serverRestoreRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)\/restore$/);
      if (method === "POST" && serverRestoreRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverRestoreRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const restored = await restoreServer({ session, serverId });
        if (!restored.ok) {
          sendJson(res, restored.status, {
            ok: false,
            error: restored.error,
          });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          server_id: restored.server.serverId,
          status: restored.server.status,
          last_recovered_at: restored.server.lastRecoveredAtMs
            ? new Date(restored.server.lastRecoveredAtMs).toISOString()
            : null,
        });
        return;
      }

      const serverDestroyRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)\/destroy$/);
      if (method === "POST" && serverDestroyRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverDestroyRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const body = (await readJsonBody<{ confirm?: boolean }>(req)) ?? {};
        if (body.confirm !== true) {
          sendJson(res, 409, {
            ok: false,
            error: "destructive_confirmation_required",
          });
          return;
        }
        const destroyed = await destroyServer({ session, serverId });
        if (!destroyed.ok) {
          sendJson(res, destroyed.status, {
            ok: false,
            error: destroyed.error,
          });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          server_id: destroyed.server.serverId,
          status: destroyed.server.status,
          destroyed_at: destroyed.server.destroyedAtMs
            ? new Date(destroyed.server.destroyedAtMs).toISOString()
            : null,
        });
        return;
      }

      const serverRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)$/);
      if (serverRouteMatch && serverRouteMatch[1] !== "create" && serverRouteMatch[1] !== "provisioning") {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        if (method === "GET") {
          const access = resolveServerReadAccess({
            session,
            serverId,
          });
          if (!access.ok) {
            sendJson(res, access.status, {
              ok: false,
              error: access.error,
            });
            return;
          }
          const installs = store.getServerEffectiveAppInstalls(serverId);
          sendJson(res, 200, {
            ok: true,
            server: {
              ...buildServerApiPayload(access.server),
              installed_app_ids: installs
                .filter((item) => item.status === "installed")
                .map((item) => item.appId),
              installed_apps: installs.map((item) => ({
                app_id: item.appId,
                status: item.status,
                version: item.version ?? null,
                installed_at: item.installedAtMs
                  ? new Date(item.installedAtMs).toISOString()
                  : null,
              })),
            },
          });
          return;
        }
        if (method === "PATCH") {
          const access = resolveServerAdminAccess({
            session,
            serverId,
          });
          if (!access.ok) {
            sendJson(res, access.status, {
              ok: false,
              error: access.error,
            });
            return;
          }
          const patchBody =
            (await readJsonBody<{ display_name?: string }>(req)) ?? {};
          const newDisplayName =
            typeof patchBody.display_name === "string" && patchBody.display_name.trim()
              ? patchBody.display_name.trim()
              : null;
          if (!newDisplayName) {
            sendJson(res, 400, {
              ok: false,
              error: "missing_display_name",
            });
            return;
          }
          store.updateServer(access.server.serverId, {
            displayName: newDisplayName,
          });
          sendJson(res, 200, {
            ok: true,
            server_id: access.server.serverId,
            display_name: newDisplayName,
          });
          return;
        }
        sendJson(res, 405, {
          ok: false,
          error: "method_not_allowed",
        });
        return;
      }

      const serverAppInstallStatusRouteMatch = pathname.match(
        /^\/api\/servers\/([^/]+)\/apps\/([^/]+)\/install-status$/,
      );
      if (method === "GET" && serverAppInstallStatusRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverAppInstallStatusRouteMatch[1] ?? "").trim();
        const appId = normalizeAppId(decodeURIComponent(serverAppInstallStatusRouteMatch[2] ?? ""));
        if (!serverId || !isValidAppId(appId)) {
          sendJson(res, 400, {
            ok: false,
            error: "invalid_install_status_request",
          });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
          });
          return;
        }
        const entitlement =
          appId === "console"
            ? { status: "active" as const }
            : (() => {
                const accountId = context.accountId;
                return accountId ? store.getAppSubscription(accountId, appId) : null;
              })();
        const install =
          store.getServerAppInstall(serverId, appId) ??
          store.getServerEffectiveAppInstalls(serverId).find((item) => item.appId === appId) ??
          null;
        sendJson(res, 200, {
          ok: true,
          server_id: serverId,
          app_id: appId,
          entitlement_status: appId === "console" ? "active" : entitlement?.status ?? "inactive",
          install_status: install?.status ?? "not_installed",
          entry_path: install?.entryPath ?? defaultEntryPathForApp(appId),
          last_error: install?.lastError ?? null,
        });
        return;
      }

      const serverAppInstallRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)\/apps\/([^/]+)\/install$/);
      if (method === "POST" && serverAppInstallRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverAppInstallRouteMatch[1] ?? "").trim();
        const appId = normalizeAppId(decodeURIComponent(serverAppInstallRouteMatch[2] ?? ""));
        if (!serverId || !isValidAppId(appId)) {
          sendJson(res, 400, {
            ok: false,
            error: "invalid_install_request",
          });
          return;
        }
        if (appId === "console") {
          sendJson(res, 400, {
            ok: false,
            error: "system_app_install_not_allowed",
          });
          return;
        }
        const product = store.getProduct(appId);
        if (!product || !isProductVisibleToPrincipal(product, session.principal)) {
          sendJson(res, 404, {
            ok: false,
            error: "app_not_found",
          });
          return;
        }
        const access = resolveServerAdminAccess({
          session,
          serverId,
        });
        if (!access.ok) {
          sendJson(res, access.status, {
            ok: false,
            error: access.error,
          });
          return;
        }
        // Use new SSH/SCP-based install pipeline
        const installed = await installAppOnServer({
          serverId,
          appId,
          accountId: access.server.accountId,
          source: "manual",
          session,
        });
        if (!installed.ok) {
          sendJson(res, installed.status ?? 500, {
            ok: false,
            error: installed.error,
            detail: installed.detail ?? null,
            app_id: appId,
            server_id: serverId,
          });
          return;
        }
        const install = store.getServerAppInstall(serverId, appId);
        sendJson(res, 200, {
          ok: true,
          server_id: serverId,
          app_id: appId,
          install_status: install?.status ?? "installed",
          entry_path: install?.entryPath ?? defaultEntryPathForApp(appId),
          version: installed.version,
        });
        return;
      }

      const serverAdaptersRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)\/adapters$/);
      if (method === "GET" && serverAdaptersRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const serverId = decodeURIComponent(serverAdaptersRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, { ok: false, error: "missing_server_id" });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, { ok: false, error: context.error });
          return;
        }
        const installs = store.getServerPackageInstalls(serverId, "adapter");
        sendJson(res, 200, {
          ok: true,
          server_id: serverId,
          items: installs.map((install) => ({
            adapter_id: install.packageId,
            install_status: install.status,
            desired_version: install.desiredVersion ?? null,
            active_version: install.activeVersion ?? null,
            last_error: install.lastError ?? null,
          })),
        });
        return;
      }

      const serverAdapterInstallStatusRouteMatch = pathname.match(
        /^\/api\/servers\/([^/]+)\/adapters\/([^/]+)\/install-status$/,
      );
      if (method === "GET" && serverAdapterInstallStatusRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const serverId = decodeURIComponent(serverAdapterInstallStatusRouteMatch[1] ?? "").trim();
        const adapterId = decodeURIComponent(serverAdapterInstallStatusRouteMatch[2] ?? "").trim();
        if (!serverId || !adapterId) {
          sendJson(res, 400, { ok: false, error: "invalid_install_status_request" });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, { ok: false, error: context.error });
          return;
        }
        const install = store.getServerPackageInstall(serverId, "adapter", adapterId);
        sendJson(res, 200, {
          ok: true,
          server_id: serverId,
          adapter_id: adapterId,
          install_status: install?.status ?? "not_installed",
          desired_version: install?.desiredVersion ?? null,
          active_version: install?.activeVersion ?? null,
          last_error: install?.lastError ?? null,
        });
        return;
      }

      const serverAdapterInstallRouteMatch = pathname.match(
        /^\/api\/servers\/([^/]+)\/adapters\/([^/]+)\/install$/,
      );
      if (method === "POST" && serverAdapterInstallRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const serverId = decodeURIComponent(serverAdapterInstallRouteMatch[1] ?? "").trim();
        const adapterId = decodeURIComponent(serverAdapterInstallRouteMatch[2] ?? "").trim();
        if (!serverId || !adapterId) {
          sendJson(res, 400, { ok: false, error: "invalid_install_request" });
          return;
        }
        const access = resolveServerAdminAccess({ session, serverId });
        if (!access.ok) {
          sendJson(res, access.status, { ok: false, error: access.error });
          return;
        }
        const body = (await readJsonBody<{ version?: string }>(req)) ?? {};
        const installed = await installAdapterOnServer({
          serverId,
          adapterId,
          version: typeof body.version === "string" ? body.version.trim() : undefined,
          source: "manual",
          session,
        });
        if (!installed.ok) {
          sendJson(res, installed.status ?? 500, {
            ok: false,
            error: installed.error,
            detail: installed.detail ?? null,
            adapter_id: adapterId,
            server_id: serverId,
          });
          return;
        }
        const install = store.getServerPackageInstall(serverId, "adapter", adapterId);
        sendJson(res, 200, {
          ok: true,
          server_id: serverId,
          adapter_id: adapterId,
          install_status: install?.status ?? "installed",
          version: installed.version,
        });
        return;
      }

      const serverAdapterUpgradeRouteMatch = pathname.match(
        /^\/api\/servers\/([^/]+)\/adapters\/([^/]+)\/upgrade$/,
      );
      if (method === "POST" && serverAdapterUpgradeRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const serverId = decodeURIComponent(serverAdapterUpgradeRouteMatch[1] ?? "").trim();
        const adapterId = decodeURIComponent(serverAdapterUpgradeRouteMatch[2] ?? "").trim();
        if (!serverId || !adapterId) {
          sendJson(res, 400, { ok: false, error: "invalid_upgrade_request" });
          return;
        }
        const access = resolveServerAdminAccess({ session, serverId });
        if (!access.ok) {
          sendJson(res, access.status, { ok: false, error: access.error });
          return;
        }
        const body = (await readJsonBody<{ target_version?: string }>(req)) ?? {};
        const targetVersion =
          typeof body.target_version === "string" ? body.target_version.trim() : "";
        if (!targetVersion) {
          sendJson(res, 400, { ok: false, error: "missing_target_version" });
          return;
        }
        const upgraded = await upgradeAdapterOnServer({
          serverId,
          adapterId,
          targetVersion,
          source: "manual",
          session,
        });
        if (!upgraded.ok) {
          sendJson(res, upgraded.status ?? 500, {
            ok: false,
            error: upgraded.error,
            detail: upgraded.detail ?? null,
            adapter_id: adapterId,
            server_id: serverId,
          });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          server_id: serverId,
          adapter_id: adapterId,
          install_status: "installed",
          version: upgraded.version,
        });
        return;
      }

      if (method === "DELETE" && serverAdapterInstallRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const serverId = decodeURIComponent(serverAdapterInstallRouteMatch[1] ?? "").trim();
        const adapterId = decodeURIComponent(serverAdapterInstallRouteMatch[2] ?? "").trim();
        if (!serverId || !adapterId) {
          sendJson(res, 400, { ok: false, error: "invalid_uninstall_request" });
          return;
        }
        const access = resolveServerAdminAccess({ session, serverId });
        if (!access.ok) {
          sendJson(res, access.status, { ok: false, error: access.error });
          return;
        }
        const uninstalled = await uninstallAdapterFromServer({
          serverId,
          adapterId,
          session,
        });
        if (!uninstalled.ok) {
          sendJson(res, uninstalled.status ?? 500, {
            ok: false,
            error: uninstalled.error,
            detail: uninstalled.detail ?? null,
            adapter_id: adapterId,
            server_id: serverId,
          });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          server_id: serverId,
          adapter_id: adapterId,
          install_status: "not_installed",
        });
        return;
      }

      const serverAppUpgradeRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)\/apps\/([^/]+)\/upgrade$/);
      if (method === "POST" && serverAppUpgradeRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const serverId = decodeURIComponent(serverAppUpgradeRouteMatch[1] ?? "").trim();
        const appId = normalizeAppId(decodeURIComponent(serverAppUpgradeRouteMatch[2] ?? ""));
        if (!serverId || !isValidAppId(appId)) {
          sendJson(res, 400, { ok: false, error: "invalid_upgrade_request" });
          return;
        }
        if (appId === "console") {
          sendJson(res, 400, { ok: false, error: "system_app_upgrade_not_allowed" });
          return;
        }
        const access = resolveServerAdminAccess({ session, serverId });
        if (!access.ok) {
          sendJson(res, access.status, { ok: false, error: access.error });
          return;
        }
        const body = (await readJsonBody<{ target_version?: string }>(req)) ?? {};
        const targetVersion =
          typeof body.target_version === "string" ? body.target_version.trim() : "";
        if (!targetVersion) {
          sendJson(res, 400, { ok: false, error: "missing_target_version" });
          return;
        }
        const upgraded = await upgradeAppOnServer({
          serverId,
          appId,
          targetVersion,
          source: "manual",
          session,
        });
        if (!upgraded.ok) {
          sendJson(res, upgraded.status ?? 500, {
            ok: false,
            error: upgraded.error,
            detail: upgraded.detail ?? null,
            app_id: appId,
            server_id: serverId,
          });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          server_id: serverId,
          app_id: appId,
          install_status: "installed",
          version: upgraded.version,
        });
        return;
      }

      // App uninstall: DELETE /api/servers/:id/apps/:appId/install
      if (method === "DELETE" && serverAppInstallRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const serverId = decodeURIComponent(serverAppInstallRouteMatch[1] ?? "").trim();
        const appId = normalizeAppId(decodeURIComponent(serverAppInstallRouteMatch[2] ?? ""));
        if (!serverId || !isValidAppId(appId)) {
          sendJson(res, 400, { ok: false, error: "invalid_uninstall_request" });
          return;
        }
        if (appId === "console") {
          sendJson(res, 400, { ok: false, error: "system_app_uninstall_not_allowed" });
          return;
        }
        const access = resolveServerAdminAccess({ session, serverId });
        if (!access.ok) {
          sendJson(res, access.status, { ok: false, error: access.error });
          return;
        }
        // Use new SSH-based uninstall
        const uninstalled = await uninstallAppFromServer({
          serverId,
          appId,
          session,
        });
        if (!uninstalled.ok) {
          sendJson(res, uninstalled.status ?? 500, {
            ok: false,
            error: uninstalled.error,
            detail: uninstalled.detail ?? null,
            app_id: appId,
            server_id: serverId,
          });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          server_id: serverId,
          app_id: appId,
          install_status: "not_installed",
        });
        return;
      }

      const serverAppsRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)\/apps$/);
      if (method === "GET" && serverAppsRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverAppsRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const access = resolveServerReadAccess({
          session,
          serverId,
        });
        if (!access.ok) {
          sendJson(res, access.status, {
            ok: false,
            error: access.error,
          });
          return;
        }
        let runtimeApps:
          | Awaited<ReturnType<typeof probeRuntimeJsonEndpoint>>
          | { ok: false; status: number; body: { ok: false; error: string } };
        if (serverSupportsActiveRuntime(access.server.status)) {
          const context = resolveActiveServerContext({
            session,
            requestedServerId: serverId,
          });
          runtimeApps = context.ok
            ? await probeRuntimeJsonEndpoint({
                runtime: context.serverRuntime,
                session: context.session,
                principal: context.principal,
                path: "/api/apps",
                requestId,
              })
            : {
                ok: false,
                status: context.status,
                body: {
                  ok: false,
                  error: context.error,
                },
              };
        } else {
          runtimeApps = {
            ok: false,
            status: 409,
            body: {
              ok: false,
              error: "server_not_running",
            },
          };
        }
        const runtimeAppsById = runtimeApps.ok ? parseRuntimeAppCatalog(runtimeApps.body) : new Map();

        // Build entitlements from account-level app subscriptions
        const entitlementsByApp = new Map<string, { status: string }>();
        if (access.server.accountId) {
          const subs = store.getAppSubscriptionsForAccount(access.server.accountId);
          for (const sub of subs) {
            entitlementsByApp.set(sub.appId, { status: sub.status });
          }
        }
        const installsByApp = new Map(
          store
            .getServerEffectiveAppInstalls(serverId)
            .map((item) => [item.appId, item] as const),
        );
        const products = store
          .listProducts()
          .filter((product) => isProductVisibleToPrincipal(product, session.principal));
        const productByAppId = new Map(products.map((item) => [item.productId, item]));

        const appIds = new Set<string>(["console"]);
        for (const product of products) {
          appIds.add(product.productId);
        }
        for (const appId of installsByApp.keys()) {
          appIds.add(appId);
        }
        for (const appId of runtimeAppsById.keys()) {
          appIds.add(appId);
        }

        const items = [...appIds]
          .sort((a, b) => a.localeCompare(b))
          .map((appId) => {
            const product = productByAppId.get(appId);
            const entitlement =
              appId === "console" ? { status: "active" as const } : entitlementsByApp.get(appId);
            const install = installsByApp.get(appId) ?? null;
            const runtimeItem = runtimeAppsById.get(appId) ?? null;
            const entitlementStatus = appId === "console" ? "active" : entitlement?.status ?? "inactive";
            const installStatus = install?.status ?? "not_installed";
            const blockedByEntitlement = appId !== "console" && entitlementStatus !== "active";
            const blockedByRuntimeUnavailable =
              installStatus === "installed" && runtimeApps.ok === false;
            const blockedByRuntimeMissing =
              installStatus === "installed" && runtimeApps.ok && !runtimeItem;
            const entryPath =
              runtimeItem?.entryPath || install?.entryPath || defaultEntryPathForApp(appId);
            const blockedReason = blockedByEntitlement
              ? "entitlement_required"
              : blockedByRuntimeUnavailable
                ? "runtime_unavailable"
                : blockedByRuntimeMissing
                  ? "runtime_app_missing"
                  : null;
            const launchable =
              !blockedReason && installStatus === "installed" && entryPath.startsWith("/app/");
            return {
              app_id: appId,
              display_name: product?.displayName ?? runtimeItem?.displayName ?? appId,
              product_id: product?.productId ?? null,
              entitlement_status: entitlementStatus,
              install_status: installStatus,
              entry_path: entryPath,
              launchable,
              blocked_reason: blockedReason,
              source: install?.source ?? null,
              kind: runtimeItem?.kind ?? null,
            };
          });
        sendJson(res, 200, {
          ok: true,
          server_id: serverId,
          items,
        });
        return;
      }

      if (method === "POST" && pathname === "/api/entry/execute") {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const body =
          (await readJsonBody<{
            app_id?: string;
            entry_source?: string;
            server_id?: string;
            create_new_server?: boolean;
          }>(req)) ?? {};
        const appId = normalizeAppId(body.app_id);
        const entrySource = readOptionalString(body.entry_source) ?? null;
        const requestedServerId = readOptionalString(body.server_id) ?? null;
        const createNewServer = body.create_new_server === true;
        if (!appId || !isValidAppId(appId)) {
          sendJson(res, 400, {
            ok: false,
            error: "invalid_app_id",
          });
          return;
        }
        const product = store.getProduct(appId);
        if (!product || !isProductVisibleToPrincipal(product, session.principal)) {
          sendJson(res, 404, {
            ok: false,
            error: "app_not_found",
          });
          return;
        }
        const planResult = resolveEntryActionPlan({
          store: store,
          userId: session.principal.userId,
          appId,
          requestedServerId,
        });
        if (!planResult.ok) {
          sendJson(res, planResult.status, {
            ok: false,
            error: planResult.error,
          });
          return;
        }
        const requestedAction: EntryResolveAction = createNewServer
          ? "create_server_and_install"
          : planResult.plan.action;
        let actionTaken: EntryResolveAction = requestedAction;
        let activeSession = session;
        let targetServerId = planResult.plan.recommendedServerId;
        const installEntryPath = defaultEntryPathForApp(appId);

        if (requestedAction === "create_server_and_install") {
          const provisioned = await provisionServerAndInstallAppForSession({
            session: activeSession,
            appId,
            requestId,
          });
          if (!provisioned.ok) {
            sendJson(res, provisioned.status, {
              ok: false,
              error: provisioned.error,
              detail: provisioned.detail ?? null,
            });
            return;
          }
          activeSession = provisioned.session;
          targetServerId = provisioned.serverId;
        } else {
          if (requestedAction === "purchase_app_then_install") {
            // Create account-level app subscription
            const accounts = store.getAccountsForUser(activeSession.principal.userId);
            const purchaseAccountId = activeSession.principal.accountId || accounts[0]?.accountId;
            if (purchaseAccountId) {
              store.createAppSubscription({
                accountId: purchaseAccountId,
                appId,
                planId: "default",
                status: "active",
                provider: "manual",
              });
            }
          }
          if (requestedAction === "purchase_app_then_install" || requestedAction === "install_on_selected_server") {
            if (!targetServerId) {
              sendJson(res, 409, {
                ok: false,
                error: "server_selection_required",
              });
              return;
            }
            // Check entitlement via account-level app subscription
            const targetServer = store.getServer(targetServerId);
            const targetAccountId = targetServer?.accountId;
            const appSub = targetAccountId ? store.getAppSubscription(targetAccountId, appId) : null;
            if (!appSub || appSub.status !== "active") {
              store.upsertServerAppInstall({
                serverId: targetServerId,
                appId,
                status: "blocked_no_entitlement",
                entryPath: installEntryPath,
                source: "manual",
              });
              sendJson(res, 403, {
                ok: false,
                error: "app_entitlement_required",
                app_id: appId,
                server_id: targetServerId,
              });
              return;
            }
            const adminAccess = resolveServerAdminAccess({
              session: activeSession,
              serverId: targetServerId,
            });
            if (!adminAccess.ok) {
              sendJson(res, adminAccess.status, {
                ok: false,
                error: adminAccess.error,
                app_id: appId,
                server_id: targetServerId,
              });
              return;
            }
            const installed = await installAppOnServer({
              serverId: targetServerId,
              appId,
              accountId: adminAccess.server.accountId,
              source: requestedAction === "purchase_app_then_install" ? "purchase" : "manual",
            });
            if (!installed.ok) {
              sendJson(res, installed.status ?? 500, {
                ok: false,
                error: installed.error,
                detail: installed.detail ?? null,
                app_id: appId,
                server_id: targetServerId,
              });
              return;
            }
          }
        }

        if (targetServerId && activeSession.principal.serverId !== targetServerId) {
          const context = resolveActiveServerContext({
            session: activeSession,
            requestedServerId: targetServerId,
          });
          if (context.ok) {
            activeSession = context.session;
          }
        }

        const finalPlanResult = resolveEntryActionPlan({
          store: store,
          userId: activeSession.principal.userId,
          appId,
          requestedServerId: targetServerId ?? requestedServerId,
        });
        const finalPlan = finalPlanResult.ok
          ? finalPlanResult.plan
          : {
              ...planResult.plan,
              action: actionTaken,
            };
        const finalServerId = targetServerId || finalPlan.recommendedServerId || null;
        const finalInstall =
          finalServerId
            ? store.getServerAppInstall(finalServerId, appId) ??
              store
                .getServerEffectiveAppInstalls(finalServerId)
                .find((item: ServerAppInstallRecord) => item.appId === appId) ??
              null
            : null;
        const finalInstallStatus = finalInstall?.status ?? "not_installed";
        let runtimeProbeOk: boolean | null = null;
        let runtimeAppPresent: boolean | null = null;
        let runtimeAppKind: string | null = null;
        if (finalServerId && finalInstallStatus === "installed") {
          const finalContext = resolveActiveServerContext({
            session: activeSession,
            requestedServerId: finalServerId,
          });
          if (finalContext.ok) {
            const runtimeApps = await probeRuntimeJsonEndpoint({
              runtime: finalContext.serverRuntime,
              session: finalContext.session,
              principal: finalContext.principal,
              path: "/api/apps",
              requestId,
            });
            runtimeProbeOk = runtimeApps.ok;
            if (runtimeApps.ok) {
              const runtimeAppsById = parseRuntimeAppCatalog(runtimeApps.body);
              const runtimeItem = runtimeAppsById.get(appId) ?? null;
              runtimeAppPresent = Boolean(runtimeItem);
              runtimeAppKind = runtimeItem?.kind ?? null;
            } else {
              runtimeAppPresent = false;
            }
          }
        }
        const runtimeBlockedReason =
          finalInstallStatus !== "installed"
            ? null
            : runtimeProbeOk === false
              ? "runtime_unavailable"
              : runtimeAppPresent === false
                ? "runtime_app_missing"
                : null;
        const launchReady =
          finalPlan.hasActiveEntitlement &&
          finalInstallStatus === "installed" &&
          installEntryPath.startsWith("/app/") &&
          !runtimeBlockedReason;
        const provisioningRecord = getLatestProvisionRequestForPrincipal({
          autoProvisioner,
          principal: activeSession.principal,
          store,
        });

        sendJson(res, 200, {
          ok: true,
          app_id: appId,
          entry_source: entrySource,
          create_new_server: createNewServer,
          action_requested: requestedAction,
          action_taken: actionTaken,
          has_active_entitlement: finalPlan.hasActiveEntitlement,
          server_count: finalPlan.serverCount,
          requested_server_id: requestedServerId,
          recommended_server_id: finalPlan.recommendedServerId,
          installed_server_ids: finalPlan.installedServerIds,
          server_id: finalServerId,
          install_status: finalInstallStatus,
          entry_path: installEntryPath,
          launch_ready: launchReady,
          blocked_reason: runtimeBlockedReason,
          runtime_probe_ok: runtimeProbeOk,
          runtime_app_present: runtimeAppPresent,
          runtime_app_kind: runtimeAppKind,
          provisioning: provisioningRecord
            ? {
                request_id: provisioningRecord.requestId,
                status: provisioningRecord.status,
                stage: provisioningRecord.stage ?? null,
                tenant_id: provisioningRecord.tenantId ?? null,
                updated_at_ms: provisioningRecord.updatedAtMs,
              }
            : null,
        });
        return;
      }

      if (method === "GET" && pathname === "/api/entry/resolve") {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const appId = normalizeAppId(url.searchParams.get("app_id") ?? "");
        const entrySource = (url.searchParams.get("entry_source") ?? "").trim() || null;
        const requestedServerId = (url.searchParams.get("server_id") ?? "").trim() || null;
        if (!appId || !isValidAppId(appId)) {
          sendJson(res, 400, {
            ok: false,
            error: "invalid_app_id",
          });
          return;
        }
        const product = store.getProduct(appId);
        if (!product || !isProductVisibleToPrincipal(product, session.principal)) {
          sendJson(res, 404, {
            ok: false,
            error: "app_not_found",
          });
          return;
        }
        const planResult = resolveEntryActionPlan({
          store: store,
          userId: session.principal.userId,
          appId,
          requestedServerId,
        });
        if (!planResult.ok) {
          sendJson(res, planResult.status, {
            ok: false,
            error: planResult.error,
          });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          app_id: appId,
          entry_source: entrySource,
          action: planResult.plan.action,
          has_active_entitlement: planResult.plan.hasActiveEntitlement,
          server_count: planResult.plan.serverCount,
          requested_server_id: planResult.plan.requestedServerId,
          recommended_server_id: planResult.plan.recommendedServerId,
          installed_server_ids: planResult.plan.installedServerIds,
        });
        return;
      }

      const serverRuntimeTokenRouteMatch = pathname.match(
        /^\/api\/servers\/([^/]+)\/runtime-auth-token$/,
      );
      if (serverRuntimeTokenRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverRuntimeTokenRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const access = resolveServerAdminAccess({
          session,
          serverId: serverId,
        });
        if (!access.ok) {
          sendJson(res, access.status, {
            ok: false,
            error: access.error,
          });
          return;
        }
        if (method === "DELETE") {
          store.updateServer(access.server.serverId, {
            runtimeAuthToken: "",
          });
          const updated = store.getServer(access.server.serverId) ?? access.server;
          syncServerRuntimeProjection(updated);
          sendJson(res, 200, {
            ok: true,
            server_id: updated.serverId,
            has_runtime_auth_token: false,
          });
          logFrontdoorEvent("server_runtime_auth_token_cleared", {
            request_id: requestId,
            user_id: session.principal.userId,
            server_id: updated.serverId,
          });
          return;
        }
        sendJson(res, 405, {
          ok: false,
          error: "method_not_allowed",
        });
        return;
      }

      const serverRuntimeTokenSetRouteMatch = pathname.match(
        /^\/api\/servers\/([^/]+)\/runtime-auth-token\/set$/,
      );
      if (method === "POST" && serverRuntimeTokenSetRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverRuntimeTokenSetRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const access2 = resolveServerAdminAccess({
          session,
          serverId: serverId,
        });
        if (!access2.ok) {
          sendJson(res, access2.status, {
            ok: false,
            error: access2.error,
          });
          return;
        }
        const body = (await readJsonBody<{ token?: string }>(req)) ?? {};
        const token = typeof body.token === "string" ? body.token.trim() : "";
        if (!token) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_runtime_auth_token",
          });
          return;
        }
        store.updateServer(access2.server.serverId, {
          runtimeAuthToken: token,
        });
        const updated2 = store.getServer(access2.server.serverId) ?? access2.server;
        syncServerRuntimeProjection(updated2);
        sendJson(res, 200, {
          ok: true,
          server_id: updated2.serverId,
          has_runtime_auth_token: true,
        });
        logFrontdoorEvent("server_runtime_auth_token_set", {
          request_id: requestId,
          user_id: session.principal.userId,
          server_id: updated2.serverId,
        });
        return;
      }

      const serverRuntimeTokenRotateRouteMatch = pathname.match(
        /^\/api\/servers\/([^/]+)\/runtime-auth-token\/rotate$/,
      );
      if (method === "POST" && serverRuntimeTokenRotateRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverRuntimeTokenRotateRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const access3 = resolveServerAdminAccess({
          session,
          serverId: serverId,
        });
        if (!access3.ok) {
          sendJson(res, access3.status, {
            ok: false,
            error: access3.error,
          });
          return;
        }
        const rotatedToken = randomToken(40);
        store.updateServer(access3.server.serverId, {
          runtimeAuthToken: rotatedToken,
        });
        const updated3 = store.getServer(access3.server.serverId) ?? access3.server;
        syncServerRuntimeProjection(updated3);
        sendJson(res, 200, {
          ok: true,
          server_id: updated3.serverId,
          runtime_auth_token: rotatedToken,
        });
        logFrontdoorEvent("server_runtime_auth_token_rotated", {
          request_id: requestId,
          user_id: session.principal.userId,
          server_id: updated3.serverId,
        });
        return;
      }

      if (method === "GET" && pathname === "/api/operator/servers") {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        if (!hasGlobalOperatorAccess(session.principal)) {
          sendJson(res, 403, {
            ok: false,
            error: "operator_forbidden",
          });
          return;
        }
        const items = store.listAllServers().map((server) => {
          const memberCount = store.countAccountMembers(server.accountId);
          const usage = store.getServerUsageSummary({
            serverId: server.serverId,
            windowDays: 30,
          });
          const subscription = store.getServerSubscription(server.serverId);
          return {
            server_id: server.serverId,
            display_name: server.displayName,
            account_id: server.accountId,
            status: server.status,
            server_class: server.serverClass,
            plan: server.plan,
            runtime_public_base_url: getServerPublicUrl(server),
            member_count: memberCount,
            usage_30d: {
              requests_total: usage.requestsTotal,
              tokens_in: usage.tokensIn,
              tokens_out: usage.tokensOut,
              active_members: usage.activeMembers,
            },
            subscription: subscription
              ? {
                  tier: subscription.tier,
                  status: subscription.status,
                  provider: subscription.provider,
                }
              : null,
          };
        });
        sendJson(res, 200, {
          ok: true,
          total_servers: items.length,
          items,
        });
        return;
      }

      const launchDiagnosticsRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)\/launch-diagnostics$/);
      if (method === "GET" && launchDiagnosticsRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(launchDiagnosticsRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
          });
          return;
        }
        const [runtimeHealthInitial, runtimeApps] = await Promise.all([
          probeRuntimeJsonEndpoint({
            runtime: context.serverRuntime,
            session: context.session,
            principal: context.principal,
            path: "/health",
            requestId,
          }),
          probeRuntimeJsonEndpoint({
            runtime: context.serverRuntime,
            session: context.session,
            principal: context.principal,
            path: "/api/apps",
            requestId,
          }),
        ]);
        let runtimeHealth = runtimeHealthInitial;
        if (!runtimeHealth.ok && runtimeHealth.httpStatus === 404) {
          const runtimeStatus = await probeRuntimeJsonEndpoint({
            runtime: context.serverRuntime,
            session: context.session,
            principal: context.principal,
            path: "/status",
            requestId,
          });
          if (runtimeStatus.ok || runtimeStatus.httpStatus !== 404) {
            runtimeHealth = runtimeStatus;
          }
        }
        const appsBody = asRecord(runtimeApps.body);
        const appsListRaw = Array.isArray(appsBody?.items) ? appsBody.items : [];
        const launchableApps = appsListRaw
          .filter((item) => item && typeof item === "object" && !Array.isArray(item))
          .map((item) => {
            const record = item as Record<string, unknown>;
            return {
              app_id: readOptionalString(record.app_id) || "",
              display_name: readOptionalString(record.display_name) || readOptionalString(record.app_id) || "",
              entry_path: readOptionalString(record.entry_path) || "",
            };
          })
          .filter((item) => item.app_id && item.entry_path.startsWith("/app/"));
        const appCatalogPayloadError =
          runtimeApps.ok && !Array.isArray(appsBody?.items) ? "invalid_apps_payload" : undefined;
        const appCatalogOk = runtimeApps.ok && !appCatalogPayloadError;
        const runtimeHealthBody = asRecord(runtimeHealth.body);
        const runtimeHealthErrorCode =
          readOptionalString(runtimeHealthBody?.error) || runtimeHealth.error || "";
        const runtimeHealthLaunchCapable =
          runtimeHealth.ok || runtimeHealthErrorCode === "nex_runtime_unavailable";
        const launchReady = runtimeHealthLaunchCapable && appCatalogOk && launchableApps.length > 0;
        const provisioningRecord = getLatestProvisionRequestForPrincipal({
          autoProvisioner,
          principal: context.principal,
          store,
        });
        sendJson(res, 200, {
          ok: true,
          server_id: context.server.serverId,
          launch_ready: launchReady,
          server: {
            server_id: context.server.serverId,
            display_name: context.server.displayName,
            status: context.server.status,
            runtime_url: getServerRuntimeUrl(context.server) || context.serverRuntime.runtimeUrl,
            runtime_public_base_url: getServerPublicUrl(context.server),
            has_runtime_auth_token: Boolean(context.serverRuntime.runtimeAuthToken?.trim()),
          },
          provisioning: provisioningRecord
            ? {
                request_id: provisioningRecord.requestId,
                status: provisioningRecord.status,
                stage: provisioningRecord.stage ?? null,
                error: provisioningRecord.errorText ?? null,
                tenant_id: provisioningRecord.tenantId ?? null,
                updated_at_ms: provisioningRecord.updatedAtMs,
              }
            : null,
          runtime_health: {
            ok: runtimeHealth.ok,
            http_status: runtimeHealth.httpStatus || null,
            error: runtimeHealth.error ?? null,
            body: runtimeHealth.body,
          },
          app_catalog: {
            ok: appCatalogOk,
            http_status: runtimeApps.httpStatus || null,
            error: appCatalogPayloadError ?? runtimeApps.error ?? null,
            app_count: launchableApps.length,
            items: launchableApps,
          },
        });
        return;
      }

      const usageRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)\/usage$/);
      if (method === "GET" && usageRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(usageRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
          });
          return;
        }
        const usage = store.getServerUsageSummary({
          serverId: context.server.serverId,
          windowDays: 30,
        });
        sendJson(res, 200, {
          ok: true,
          server_id: context.server.serverId,
          window_days: usage.windowDays,
          requests_total: usage.requestsTotal,
          tokens_in: usage.tokensIn,
          tokens_out: usage.tokensOut,
          active_members: usage.activeMembers,
          days_with_data: usage.daysWithData,
        });
        return;
      }

      const billingCheckoutRouteMatch = pathname.match(/^\/api\/billing\/([^/]+)\/checkout-session$/);
      if (method === "POST" && billingCheckoutRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(billingCheckoutRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
          });
          return;
        }
        if (!hasAccountAdminRole(context.server.accountId, context.principal.userId) && !hasGlobalOperatorAccess(context.principal)) {
          sendJson(res, 403, {
            ok: false,
            error: "billing_forbidden",
          });
          return;
        }
        const body =
          (await readJsonBody<{
            plan_id?: string;
            product_id?: string;
            price_id?: string;
            success_url?: string;
            cancel_url?: string;
          }>(req)) ?? {};
        try {
          const checkoutProductId =
            (typeof body.product_id === "string" ? body.product_id.trim() : "") ||
            undefined;
          const created = await createCheckoutSession({
            config,
            serverId: context.server.serverId,
            planId: typeof body.plan_id === "string" ? body.plan_id : undefined,
            productId: checkoutProductId,
            priceId: typeof body.price_id === "string" ? body.price_id : undefined,
            successUrl: typeof body.success_url === "string" ? body.success_url : undefined,
            cancelUrl: typeof body.cancel_url === "string" ? body.cancel_url : undefined,
            customerEmail: context.principal.email,
          });
          sendJson(res, 200, {
            ok: true,
            server_id: context.server.serverId,
            provider: created.provider,
            session_id: created.sessionId,
            checkout_url: created.checkoutUrl,
            expires_at_ms: created.expiresAtMs ?? null,
          });
          logFrontdoorEvent("billing_checkout_session_created", {
            request_id: requestId,
            user_id: context.principal.userId,
            server_id: context.server.serverId,
            provider: created.provider,
            session_id: created.sessionId,
          });
        } catch (error) {
          const message = String(error);
          const status = message.includes("billing_unconfigured") ? 503 : 400;
          sendJson(res, status, {
            ok: false,
            error: message,
          });
        }
        return;
      }

      const billingSubscriptionRouteMatch = pathname.match(/^\/api\/billing\/([^/]+)\/subscription$/);
      if (method === "GET" && billingSubscriptionRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(billingSubscriptionRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
          });
          return;
        }
        if (!hasAccountAdminRole(context.server.accountId, context.principal.userId) && !hasGlobalOperatorAccess(context.principal)) {
          sendJson(res, 403, {
            ok: false,
            error: "billing_forbidden",
          });
          return;
        }
        const subscription = store.getServerSubscription(context.server.serverId);
        const limits = store.getServerLimitsSummary(context.server.serverId);
        sendJson(res, 200, {
          ok: true,
          server_id: context.server.serverId,
          provider: subscription?.provider ?? "none",
          tier: subscription?.tier ?? "free",
          status: subscription?.status ?? "none",
          customer_id: subscription?.customerId ?? null,
          subscription_id: subscription?.subscriptionId ?? null,
          period_start_ms: subscription?.periodStartMs ?? null,
          period_end_ms: subscription?.periodEndMs ?? null,
          limits: {
            max_members: limits.maxMembers,
            max_monthly_tokens: limits.maxMonthlyTokens,
            max_adapters: limits.maxAdapters,
            max_concurrent_sessions: limits.maxConcurrentSessions,
          },
        });
        return;
      }

      const billingInvoicesRouteMatch = pathname.match(/^\/api\/billing\/([^/]+)\/invoices$/);
      if (method === "GET" && billingInvoicesRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(billingInvoicesRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
          });
          return;
        }
        if (!hasAccountAdminRole(context.server.accountId, context.principal.userId) && !hasGlobalOperatorAccess(context.principal)) {
          sendJson(res, 403, {
            ok: false,
            error: "billing_forbidden",
          });
          return;
        }
        const invoices = store.listAccountInvoices({
          accountId: context.accountId,
          limit: 50,
        });
        sendJson(res, 200, {
          ok: true,
          server_id: context.server.serverId,
          account_id: context.accountId,
          items: invoices.map((item: AccountInvoiceSummary) => ({
            invoice_id: item.invoiceId,
            provider: item.provider,
            status: item.status,
            amount_due: item.amountDue,
            currency: item.currency,
            hosted_invoice_url: item.hostedInvoiceUrl ?? null,
            period_start_ms: item.periodStartMs ?? null,
            period_end_ms: item.periodEndMs ?? null,
            created_at_ms: item.createdAtMs,
            paid_at_ms: item.paidAtMs ?? null,
          })),
        });
        return;
      }

      // ── Billing Entitlements + Plan ─────────────────────────────────
      const billingEntitlementsRouteMatch = pathname.match(/^\/api\/billing\/([^/]+)\/entitlements$/);
      if (method === "GET" && billingEntitlementsRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const serverId = decodeURIComponent(billingEntitlementsRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, { ok: false, error: "missing_server_id" });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, { ok: false, error: context.error });
          return;
        }
        // Resolve entitlements at account level using the first app subscription
        const accountId = context.accountId;
        const appSubs = store.getAppSubscriptionsForAccount(accountId);
        const firstAppSub = appSubs.length > 0 ? appSubs[0] : null;
        const resolved = firstAppSub
          ? store.resolveAccountEntitlements(accountId, firstAppSub.appId)
          : null;
        if (!resolved) {
          sendJson(res, 200, {
            ok: true,
            server_id: context.server.serverId,
            account_id: accountId,
            plan_id: null,
            entitlements: {},
            usage: {},
          });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          server_id: context.server.serverId,
          account_id: accountId,
          plan_id: resolved.planId,
          entitlements: resolved.entitlements,
          usage: resolved.usage,
        });
        return;
      }

      const billingPlanRouteMatch = pathname.match(/^\/api\/billing\/([^/]+)\/plan$/);
      if (method === "GET" && billingPlanRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const serverId = decodeURIComponent(billingPlanRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, { ok: false, error: "missing_server_id" });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, { ok: false, error: context.error });
          return;
        }
        const subscription = store.getServerSubscription(context.server.serverId);
        const planId = subscription?.tier ?? "free";
        const plan = store.getProductPlan(planId);
        // Resolve product from first app subscription
        const planAccountId = context.accountId;
        const planAppSubs = store.getAppSubscriptionsForAccount(planAccountId);
        const firstPlanAppSub = planAppSubs.length > 0 ? planAppSubs[0] : null;
        const product = firstPlanAppSub ? store.getProduct(firstPlanAppSub.appId) : null;
        sendJson(res, 200, {
          ok: true,
          server_id: context.server.serverId,
          account_id: planAccountId,
          plan_id: planId,
          plan_display_name: plan?.displayName ?? planId,
          plan_description: plan?.description ?? null,
          price_monthly: plan?.priceMonthly ?? 0,
          price_yearly: plan?.priceYearly ?? null,
          features: plan?.featuresJson ? JSON.parse(plan.featuresJson) : [],
          billing_status: subscription?.status ?? "none",
          period_start_ms: subscription?.periodStartMs ?? null,
          period_end_ms: subscription?.periodEndMs ?? null,
          product: product
            ? {
                display_name: product.displayName,
                accent_color: product.accentColor ?? null,
                tagline: product.tagline ?? null,
              }
            : null,
        });
        return;
      }

      if (method === "POST" && pathname === "/api/billing/webhook") {
        if (config.billing.provider === "none") {
          sendJson(res, 404, {
            ok: false,
            error: "billing_unconfigured",
          });
          return;
        }
        const rawBody = await readRawBody(req);
        let event: BillingWebhookEvent;
        try {
          event = verifyWebhookAndParseEvent({
            config,
            headers: req.headers,
            rawBody,
          });
        } catch (error) {
          sendJson(res, 400, {
            ok: false,
            error: String(error),
          });
          return;
        }
        const billingEventAccountId =
          event.serverId?.trim()
            ? store.getServer(event.serverId.trim())?.accountId
            : undefined;
        const inserted = store.recordBillingEvent({
          provider: event.provider,
          eventId: event.eventId,
          accountId: billingEventAccountId,
          eventType: event.eventType,
          payloadJson: JSON.stringify(event.payload),
          status: "received",
        });
        if (!inserted) {
          sendJson(res, 200, {
            ok: true,
            duplicate: true,
            event_id: event.eventId,
          });
          return;
        }
        try {
          const processed = processBillingWebhookEvent(event);
          store.markBillingEventProcessed({
            provider: event.provider,
            eventId: event.eventId,
            status: processed.status,
          });
          sendJson(res, 200, {
            ok: true,
            event_id: event.eventId,
            event_type: event.eventType,
            status: processed.status,
            server_id: processed.serverId ?? null,
          });
          logFrontdoorEvent("billing_webhook_processed", {
            request_id: requestId,
            provider: event.provider,
            event_id: event.eventId,
            event_type: event.eventType,
            status: processed.status,
            server_id: processed.serverId ?? null,
          });
        } catch (error) {
          store.markBillingEventProcessed({
            provider: event.provider,
            eventId: event.eventId,
            status: "error",
            errorText: String(error),
          });
          sendJson(res, 500, {
            ok: false,
            error: String(error),
          });
        }
        return;
      }

      // ── Cloud Provisioning Endpoints ──────────────────────────────

      if (method === "POST" && pathname === "/api/servers/create") {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const accountId = session.principal.accountId;
        if (!accountId) {
          sendJson(res, 400, { ok: false, error: "no_account" });
          return;
        }
        const body = await readJsonBody(req);
        const bodyRecord = asRecord(body);
        const plan = typeof bodyRecord?.plan === "string" ? bodyRecord.plan : "cax11";
        const displayName = typeof bodyRecord?.display_name === "string" ? (bodyRecord.display_name as string).trim() : "";
        const requestedServerClass = parseRequestedServerClass(bodyRecord?.server_class);
        if (!requestedServerClass) {
          sendJson(res, 400, { ok: false, error: "invalid_server_class" });
          return;
        }
        const requestedDeploymentClass = parseRequestedServerDeploymentClass(bodyRecord?.deployment_class);
        if (!requestedDeploymentClass) {
          sendJson(res, 400, { ok: false, error: "invalid_deployment_class" });
          return;
        }
        if (requestedDeploymentClass !== "customer_server") {
          sendJson(res, 400, {
            ok: false,
            error: "deployment_class_not_supported",
            message: "Product control plane server provisioning requires a dedicated provider path",
          });
          return;
        }
        const provisionProvider = resolveProvisionProviderForServerClass(requestedServerClass);
        if (!provisionProvider) {
          sendJson(res, 500, { ok: false, error: "cloud_provider_not_configured" });
          return;
        }

        // Credit / free-tier check
        const credits = store.getCreditBalance(accountId);
        const isFreeTier = !!(credits?.freeTierExpiresAtMs && credits.freeTierExpiresAtMs > Date.now());
        const hasBalance = !!(credits && credits.balanceCents > 0);
        const hasInternalBypass = hasInternalCreatorBypass(session.principal);

        if (!hasInternalBypass && !isFreeTier && !hasBalance) {
          sendJson(res, 402, {
            ok: false,
            error: "payment_required",
            message: "Add credits to your account before creating a server",
          });
          return;
        }

        // Free tier constraints: cax11 only, 1 server max
        if (!hasInternalBypass && isFreeTier && !hasBalance) {
          if (plan !== "cax11") {
            sendJson(res, 402, {
              ok: false,
              error: "free_tier_plan_limit",
              message: "Free tier is limited to the Starter (cax11) plan",
            });
            return;
          }
          const existingServers = store
            .getServersForAccount(accountId)
            .filter((s) => s.status !== "destroyed");
          if (existingServers.length >= 1) {
            sendJson(res, 402, {
              ok: false,
              error: "free_tier_server_limit",
              message: "Free tier is limited to 1 server. Add credits for additional servers.",
            });
            return;
          }
        }

        const serverId = `srv-${randomUUID().slice(0, 12)}`;
        const tenantId = `t-${randomUUID().slice(0, 12)}`;
        const provisionToken = `prov-${randomToken(32)}`;
        const runtimeAuthToken = `rt-${randomToken(32)}`;
        const generatedName = `Server ${Date.now().toString(36)}`;
        const bootstrapTransport = resolveBootstrapTransportConfig({
          serverClass: requestedServerClass,
          providerName: provisionProvider.providerName,
          tenantId,
        });
        if (!bootstrapTransport) {
          sendJson(res, 409, {
            ok: false,
            error: "tailscale_not_configured",
            message: "standard hosted provisioning requires FRONTDOOR_TAILSCALE_BASE_URL and FRONTDOOR_STANDARD_TAILSCALE_AUTH_KEY",
          });
          return;
        }

        const createdServer = store.createServer({
          serverId,
          accountId,
          tenantId,
          displayName: displayName || generatedName,
          generatedName,
          serverClass: requestedServerClass,
          deploymentClass: requestedDeploymentClass,
          plan,
          provider: provisionProvider.providerName,
          provisionToken,
          runtimeAuthToken,
        });

        // Render cloud-init (apps auto-install after VPS phones home, not via cloud-init)
        const cloudInitScript = renderCloudInitScript({
          tenantId,
          serverId,
          authToken: runtimeAuthToken,
          provisionToken,
          frontdoorUrl: bootstrapTransport.frontdoorUrl,
          runtimeTokenIssuer: config.runtimeTokenIssuer,
          runtimeTokenSecret: config.runtimeTokenSecret,
          runtimeTokenActiveKid: config.runtimeTokenActiveKid,
          tailscaleAuthKey: bootstrapTransport.tailscaleAuthKey,
          tailscaleHostname: bootstrapTransport.tailscaleHostname,
        });

        // Create VPS (async but we await the initial API call)
        try {
          const result = await provisionProvider.provider.createServer({
            tenantId,
            planId: plan,
            cloudInitScript,
          });
          store.updateServer(serverId, {
            providerServerId: result.providerServerId,
            privateIp: result.privateIp || undefined,
            transportHost: result.privateIp || undefined,
            publicIp: result.publicIp || undefined,
            backupEnabled: result.backupEnabled,
            deleteProtectionEnabled: result.deleteProtectionEnabled,
            rebuildProtectionEnabled: result.rebuildProtectionEnabled,
          });
        } catch (err) {
          console.error(`[create-server] Hetzner API failed:`, err);
          store.updateServer(serverId, { status: "failed" });
          sendJson(res, 500, { ok: false, error: "cloud_create_failed", message: String(err) });
          return;
        }

        sendJson(res, 200, {
          ok: true,
          server_id: serverId,
          tenant_id: tenantId,
          status: "provisioning",
          server_class: requestedServerClass,
          deployment_class: requestedDeploymentClass,
        });
        return;
      }

      if (method === "POST" && pathname === "/api/internal/provision-callback") {
        const cbAuthHeader = req.headers["authorization"];
        if (typeof cbAuthHeader !== "string" || !cbAuthHeader.startsWith("Bearer prov-")) {
          sendJson(res, 401, { ok: false, error: "invalid_provision_token" });
          return;
        }
        const provisionToken = cbAuthHeader.slice(7);
        const cbServer = store.getServerByProvisionToken(provisionToken);
        if (!cbServer) {
          sendJson(res, 401, { ok: false, error: "invalid_provision_token" });
          return;
        }
        if (cbServer.status !== "provisioning" && cbServer.status !== "recovering") {
          sendJson(res, 409, { ok: false, error: "server_not_provisioning" });
          return;
        }

        const cbBody = await readJsonBody(req);
        const cbBodyRecord = asRecord(cbBody);
        const cbPrivateIp = typeof cbBodyRecord?.private_ip === "string" ? cbBodyRecord.private_ip as string : cbServer.privateIp;
        const cbTransportHost =
          typeof cbBodyRecord?.transport_host === "string"
            ? cbBodyRecord.transport_host as string
            : cbServer.transportHost ?? cbPrivateIp;
        const cbRuntimePort = typeof cbBodyRecord?.runtime_port === "number" ? cbBodyRecord.runtime_port as number : cbServer.runtimePort;
        const completedRecovery = cbServer.status === "recovering";

        store.updateServer(cbServer.serverId, {
          status: "running",
          privateIp: cbPrivateIp || undefined,
          transportHost: cbTransportHost || cbPrivateIp || undefined,
          runtimePort: cbRuntimePort || undefined,
          provisionToken: null,
          archivedAtMs: null,
          lastRecoveredAtMs: completedRecovery ? Date.now() : undefined,
        });

        const updatedServer = store.getServer(cbServer.serverId) ?? cbServer;
        syncServerRuntimeProjection(updatedServer);
        if (cbTransportHost || cbPrivateIp) {
          console.log(
            `[provision-callback] Server ${cbServer.serverId} is running at transport=${cbTransportHost || cbPrivateIp}:${cbRuntimePort} private=${cbPrivateIp || "unknown"}`,
          );
        }

        sendJson(res, 200, { ok: true });

        if (updatedServer.previousProviderServerId) {
          setImmediate(() => {
            cleanupRetiredProviderServer(updatedServer).catch((error) => {
              console.error(
                `[recovery-cleanup] Failed async cleanup for ${updatedServer.serverId}:`,
                error,
              );
            });
          });
        }

        // ---------------------------------------------------------------
        // Auto-install entitled apps after VPS phones home
        // Runs async — doesn't block the provision callback response
        // ---------------------------------------------------------------
        setImmediate(async () => {
          try {
            const server = store.getServer(cbServer.serverId);
            if (!server?.accountId) return;

            const subs = store.getAppSubscriptionsForAccount(server.accountId);
            const appsToAutoInstall = subs
              .filter(s => s.status === "active")
              .map(s => s.appId);

            if (appsToAutoInstall.length === 0) {
              console.log(`[auto-install] No entitled apps to install on ${cbServer.serverId}`);
              return;
            }

            console.log(`[auto-install] Installing ${appsToAutoInstall.length} app(s) on ${cbServer.serverId}: ${appsToAutoInstall.join(", ")}`);

            for (const appId of appsToAutoInstall) {
              const result = await installAppOnServer({
                serverId: cbServer.serverId,
                appId,
                accountId: server.accountId,
                source: "auto_provision",
              });
              if (result.ok) {
                console.log(`[auto-install] ${appId} installed successfully on ${cbServer.serverId}`);
              } else {
                console.error(`[auto-install] Failed to install ${appId} on ${cbServer.serverId}: ${result.error}`);
              }
            }
          } catch (err) {
            console.error(`[auto-install] Error during auto-install on ${cbServer.serverId}:`, err);
          }
        });

        return;
      }

      if (method === "GET" && pathname === "/api/plans") {
        const requestedServerClass = parseRequestedServerClass(url.searchParams.get("server_class"));
        if (!requestedServerClass) {
          sendJson(res, 400, { ok: false, error: "invalid_server_class" });
          return;
        }
        const provider =
          requestedServerClass === "compliant" ? resolvedCompliantCloudProvider : standardCloudProvider;
        const plans = provider?.listPlans() ?? [];
        sendJson(res, 200, {
          plans: plans.map((plan) => ({
            id: plan.id,
            name: customerFacingServerPlanName(plan.id),
            vcpus: plan.vcpus,
            memory_mb: plan.memoryMb,
            disk_gb: plan.diskGb,
            architecture: plan.architecture,
            server_class: requestedServerClass,
            monthly_cost_cents: plan.monthlyCostCents,
            currency: "usd",
          })),
        });
        return;
      }

      if (method === "GET" && pathname === "/api/servers/provisioning/status") {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        if (!autoProvisioner) {
          sendJson(res, 200, {
            ok: true,
            status: "disabled",
            request: null,
          });
          return;
        }
        const requestId = (url.searchParams.get("request_id") ?? "").trim();
        const record = requestId
          ? autoProvisioner.getProvisionRequest(requestId)
          : getLatestProvisionRequestForPrincipal({
              autoProvisioner,
              principal: session.principal,
              store,
            });
        if (!record) {
          sendJson(res, 200, {
            ok: true,
            status: "none",
            request: null,
          });
          return;
        }
        if (
          !provisionRequestOwnedByPrincipal({
            record,
            principal: session.principal,
            store,
          })
        ) {
          sendJson(res, 404, {
            ok: false,
            error: "request_not_found",
          });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          status: record.status,
          request: {
            request_id: record.requestId,
            user_id: record.userId,
            provider: record.provider,
            subject: record.subject,
            tenant_id: record.tenantId ?? null,
            status: record.status,
            stage: record.stage ?? null,
            error: record.errorText ?? null,
            created_at_ms: record.createdAtMs,
            updated_at_ms: record.updatedAtMs,
            completed_at_ms: record.completedAtMs ?? null,
          },
        });
        return;
      }

      const inviteRevokeRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)\/invites\/([^/]+)$/);
      if (method === "DELETE" && inviteRevokeRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(inviteRevokeRouteMatch[1] ?? "").trim();
        const inviteId = decodeURIComponent(inviteRevokeRouteMatch[2] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        if (!inviteId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_invite_id",
          });
          return;
        }
        const access = resolveServerAdminAccess({
          session,
          serverId: serverId,
        });
        if (!access.ok) {
          sendJson(res, access.status, {
            ok: false,
            error: access.error,
          });
          return;
        }
        const revoked = store.revokeInvite(inviteId);
        sendJson(res, revoked ? 200 : 404, {
          ok: revoked,
          server_id: access.server.serverId,
          invite_id: inviteId,
        });
        logFrontdoorEvent("server_invite_revoked", {
          request_id: requestId,
          user_id: session.principal.userId,
          server_id: access.server.serverId,
          invite_id: inviteId,
          revoked,
        });
        return;
      }

      const inviteRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)\/invites$/);
      if (inviteRouteMatch) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(inviteRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const access = resolveServerAdminAccess({
          session,
          serverId: serverId,
        });
        if (!access.ok) {
          sendJson(res, access.status, {
            ok: false,
            error: access.error,
          });
          return;
        }
        if (method === "GET") {
          // Invites are now at account level
          sendJson(res, 200, {
            ok: true,
            items: store.listInvites(access.server.accountId).map((item) => ({
              invite_id: item.inviteId,
              account_id: item.accountId,
              server_id: access.server.serverId,
              created_by_user_id: item.createdByUserId,
              role: item.role,
              scopes: item.scopes,
              expires_at_ms: item.expiresAtMs,
              created_at_ms: item.createdAtMs,
              redeemed_by_user_id: item.redeemedByUserId ?? null,
              redeemed_at_ms: item.redeemedAtMs ?? null,
              revoked_at_ms: item.revokedAtMs ?? null,
            })),
          });
          return;
        }
        if (method === "POST") {
          const body =
            (await readJsonBody<{
              role?: string;
              scopes?: string[];
              expires_in_seconds?: number;
            }>(req)) ?? {};
          const role = typeof body.role === "string" && body.role.trim() ? body.role.trim() : "member";
          const scopes = Array.isArray(body.scopes)
            ? body.scopes.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            : [];
          const expiresInSeconds =
            typeof body.expires_in_seconds === "number" && Number.isFinite(body.expires_in_seconds)
              ? Math.max(60, Math.floor(body.expires_in_seconds))
              : config.inviteTtlSeconds ?? 604800;
          // Check member limits at account level
          const accountId = access.server.accountId;
          const appSubs = store.getAppSubscriptionsForAccount(accountId);
          const firstAppSub = appSubs.length > 0 ? appSubs[0] : null;
          const resolved = firstAppSub
            ? store.resolveAccountEntitlements(accountId, firstAppSub.appId)
            : null;
          const maxMembers = parseEntitlementCountLimit(resolved?.entitlements["members.max_count"]);
          if (maxMembers !== null) {
            const currentMembers = store.countAccountMembers(accountId);
            if (currentMembers >= maxMembers) {
              sendJson(res, 403, {
                ok: false,
                error: "members_limit_reached",
                server_id: serverId,
                account_id: accountId,
                current_members: currentMembers,
                max_members: maxMembers,
              });
              return;
            }
          }
          try {
            const invite = store.createInvite({
              accountId,
              createdByUserId: session.principal.userId,
              role,
              scopes,
              expiresInSeconds,
            });
            sendJson(res, 200, {
              ok: true,
              invite_id: invite.inviteId,
              invite_token: invite.inviteToken,
              account_id: invite.accountId,
              server_id: access.server.serverId,
              role: invite.role,
              scopes: invite.scopes,
              expires_at_ms: invite.expiresAtMs,
            });
            logFrontdoorEvent("server_invite_created", {
              request_id: requestId,
              user_id: session.principal.userId,
              server_id: serverId,
              invite_id: invite.inviteId,
            });
          } catch (error) {
            sendJson(res, 400, {
              ok: false,
              error: String(error),
            });
          }
          return;
        }
        sendJson(res, 405, {
          ok: false,
          error: "method_not_allowed",
        });
        return;
      }

      if (method === "POST" && pathname === "/api/invites/redeem") {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const body = (await readJsonBody<{ token?: string }>(req)) ?? {};
        const token = typeof body.token === "string" ? body.token.trim() : "";
        if (!token) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_invite_token",
          });
          return;
        }
        try {
          const redeemed = store.redeemInvite({
            token,
            userId: session.principal.userId,
          });
          // Get user's servers to find the first server in the redeemed account
          const accountServers = store.getServersForUser(session.principal.userId)
            .filter((s) => s.accountId === redeemed.accountId);
          const defaultServer = accountServers.length > 0 ? accountServers[0] : null;
          const user = store.getUserById(session.principal.userId);
          if (user) {
            const principal = store.toPrincipal({
              user,
              server: defaultServer,
              accountId: redeemed.accountId,
              amr: session.principal.amr,
            });
            sessions.updateSessionPrincipal(session.id, principal);
          }
          sendJson(res, 200, {
            ok: true,
            account_id: redeemed.accountId,
            role: redeemed.invite.role,
          });
          logFrontdoorEvent("server_invite_redeemed", {
            request_id: requestId,
            user_id: session.principal.userId,
            account_id: redeemed.accountId,
            invite_id: redeemed.invite.inviteId,
          });
        } catch (error) {
          const message = String(error);
          const status = message.includes("members_limit_reached") ? 403 : 400;
          sendJson(res, status, {
            ok: false,
            error: message,
          });
        }
        return;
      }

      if (method === "GET" && pathname === "/api/auth/oidc/start") {
        if (!config.oidcEnabled) {
          sendJson(res, 400, {
            ok: false,
            error: "oidc_disabled",
          });
          return;
        }
        const provider = url.searchParams.get("provider") ?? "default";
        const oidcProductId = url.searchParams.get("product") ?? url.searchParams.get("flavor") ?? undefined;
        try {
          const started = oidc.begin({
            config,
            provider,
            returnTo: url.searchParams.get("return_to") ?? undefined,
            productId: oidcProductId,
          });
          res.statusCode = 302;
          res.setHeader("location", started.redirectUrl);
          res.end();
        } catch (error) {
          sendJson(res, 400, {
            ok: false,
            error: String(error),
          });
        }
        return;
      }

      if (method === "GET" && pathname.startsWith("/api/auth/oidc/callback/")) {
        if (!config.oidcEnabled) {
          sendJson(res, 400, {
            ok: false,
            error: "oidc_disabled",
          });
          return;
        }
        const provider = pathname.slice("/api/auth/oidc/callback/".length).trim();
        const state = url.searchParams.get("state") ?? "";
        const code = url.searchParams.get("code") ?? "";
        if (!provider || !state || !code) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_oidc_callback_params",
          });
          return;
        }
        try {
          // Phase 1 — resolve identity WITHOUT blocking on provisioning.
          // For existing users with a tenant this is instant.  For brand-new
          // users we still call resolveOrProvision so account+tenant records
          // are created, BUT only if the user already has a known tenant.
          // If provisioning is required we defer it to a background task.
          const completed = await oidc.complete({
            config,
            provider,
            state,
            code,
            resolvePrincipal: async ({ provider: oidcProvider, claims, fallbackPrincipal, productId }) => {
              if (!autoProvisioner) {
                return fallbackPrincipal;
              }
              // Quick path: check if this user already has a provisioned tenant
              const existingAccount = autoProvisioner.getOidcAccount({
                provider: oidcProvider,
                subject: claims.sub ?? "",
              });
              if (existingAccount?.tenantId) {
                // Existing user — resolve instantly (no provisioning needed)
                return await autoProvisioner.resolveOrProvision({
                  provider: oidcProvider,
                  claims,
                  fallbackPrincipal,
                  productId,
                });
              }
              // New user — return a principal built from OIDC claims (no tenant yet).
              // Provisioning will run in the background after redirect.
              if (fallbackPrincipal) return fallbackPrincipal;
              const sub = (claims.sub ?? "").trim();
              return {
                userId: `oidc:${oidcProvider}:${sub}`,
                entityId: `entity:${oidcProvider}:${sub}`,
                displayName: claims.name,
                email: claims.email,
                roles: config.autoProvision?.defaultRoles?.length
                  ? [...config.autoProvision.defaultRoles]
                  : ["operator"],
                scopes: config.autoProvision?.defaultScopes?.length
                  ? [...config.autoProvision.defaultScopes]
                  : ["operator.admin"],
                amr: ["oidc"],
              } as Principal;
            },
          });

          // If the principal already has a tenant (existing user), wire up
          // server records synchronously — this is instant.
          if (completed.principal?.tenantId) {
            const tenant = config.tenants.get(completed.principal.tenantId);
            if (tenant) {
              const existingServer =
                (completed.principal.serverId
                  ? store.getServer(completed.principal.serverId)
                  : null) ?? store.getServerByTenantId(completed.principal.tenantId);
              if (!existingServer) {
                const oidcUserPre = store.resolveOrCreateOidcUser({
                  provider,
                  subject: completed.claims.sub ?? "",
                  email: completed.claims.email,
                  displayName: completed.claims.name,
                  fallbackPrincipal: completed.principal,
                });
                const accounts = store.getAccountsForUser(oidcUserPre.userId);
                const accountId = completed.principal.accountId || accounts[0]?.accountId;
                if (accountId) {
                  store.createServer({
                    serverId: tenant.id,
                    accountId,
                    tenantId: tenant.id,
                    displayName: tenant.id,
                    generatedName: deterministicServerNameFromId(tenant.id),
                    serverClass: "standard",
                    deploymentClass: "customer_server",
                    runtimeAuthToken: tenant.runtimeAuthToken,
                  });
                  store.updateServer(tenant.id, { status: "running" });
                  const intentAppId = completed.productId?.trim().toLowerCase();
                  if (intentAppId) {
                    try {
                      store.createAppSubscription({
                        accountId,
                        appId: intentAppId,
                        planId: "default",
                        status: "active",
                        provider: "oidc_auto",
                      });
                    } catch {
                      // Subscription may already exist
                    }
                  }
                }
              }
            }
          }

          // Create user + session immediately.
          const oidcUser = store.resolveOrCreateOidcUser({
            provider,
            subject: completed.claims.sub ?? "",
            email: completed.claims.email,
            displayName: completed.claims.name,
            fallbackPrincipal: completed.principal,
          });
          const oidcServers = store.getServersForUser(oidcUser.userId);
          let oidcServer: ServerRecord | null = null;
          let oidcAccountId: string | undefined;
          if (completed.principal?.serverId) {
            oidcServer = oidcServers.find((s) => s.serverId === completed.principal!.serverId) ?? null;
          }
          if (!oidcServer && completed.principal?.tenantId) {
            oidcServer =
              oidcServers.find((s) => s.tenantId === completed.principal!.tenantId) ?? null;
          }
          if (!oidcServer && oidcServers.length > 0) {
            oidcServer = oidcServers[0];
          }
          const oidcAccounts = store.getAccountsForUser(oidcUser.userId);
          oidcAccountId = oidcServer?.accountId || oidcAccounts[0]?.accountId;
          if (completed.productId && oidcAccountId) {
            try {
              store.createAppSubscription({
                accountId: oidcAccountId,
                appId: completed.productId.trim().toLowerCase(),
                planId: "default",
                status: "active",
                provider: "oidc_auto",
              });
            } catch {
              // Subscription may already exist.
            }
          }
          const principal = store.toPrincipal({
            user: oidcUser,
            server: oidcServer,
            accountId: oidcAccountId,
            amr: ["oidc"],
          });
          const session = sessions.createSession(principal);
          setCookie({
            res,
            name: config.sessionCookieName,
            value: session.id,
            domain: config.sessionCookieDomain,
            maxAgeSeconds: config.sessionTtlSeconds,
            secure: cookieSecure,
          });

          // Determine where to redirect.
          // If the user already has a server + the intent app, go straight to the app.
          // Otherwise redirect to the dashboard — provisioning will continue in background.
          const hasTenant = !!completed.principal?.tenantId;
          const needsProvision =
            !hasTenant &&
            (!!autoProvisioner || !!standardCloudProvider || !!resolvedCompliantCloudProvider) &&
            !!completed.productId;
          let oidcRedirect = completed.returnTo || "/";
          if (hasTenant && oidcRedirect === "/" && completed.productId) {
            oidcRedirect = `/app/${completed.productId}/`;
          }
          // For users that need provisioning, always land on the dashboard
          // so they can see the provisioning progress.
          if (needsProvision && completed.productId) {
            oidcRedirect = `/?product=${encodeURIComponent(completed.productId)}&provisioning=1`;
          } else if (needsProvision) {
            oidcRedirect = "/?provisioning=1";
          }
          res.statusCode = 302;
          res.setHeader("location", oidcRedirect);
          res.end();

          // Phase 2 — background provisioning for new users.
          // The user has already been redirected to the dashboard.
          // Background provisioning only for legacy autoProvisioner with a command.
          // Cloud provider path is handled by the dashboard's entry/execute call.
          if (needsProvision && autoProvisioner && config.autoProvision.command) {
            void (async () => {
              const bgRequestId = requestId ?? randomToken(10);
              try {
                const provisionedPrincipal = await autoProvisioner.resolveOrProvision({
                  provider,
                  claims: completed.claims,
                  fallbackPrincipal: completed.principal,
                  productId: completed.productId,
                });
                if (!provisionedPrincipal?.tenantId) {
                  return;
                }
                // Create server record
                const tenant = config.tenants.get(provisionedPrincipal.tenantId);
                if (tenant) {
                  const existingServer =
                    (provisionedPrincipal.serverId
                      ? store.getServer(provisionedPrincipal.serverId)
                      : null) ?? store.getServerByTenantId(provisionedPrincipal.tenantId);
                  if (!existingServer) {
                    const accounts = store.getAccountsForUser(oidcUser.userId);
                    const accountId = provisionedPrincipal.accountId || accounts[0]?.accountId;
                    if (accountId) {
                      store.createServer({
                        serverId: tenant.id,
                        accountId,
                        tenantId: tenant.id,
                        displayName: tenant.id,
                        generatedName: deterministicServerNameFromId(tenant.id),
                        serverClass: "standard",
                        deploymentClass: "customer_server",
                        runtimeAuthToken: tenant.runtimeAuthToken,
                      });
                      store.updateServer(tenant.id, { status: "running" });
                      // Auto-grant subscriptions for ALL configured apps (not just intent)
                      const configuredApps = autoProvisioner!.lastConfiguredApps;
                      const intentAppId = completed.productId?.trim().toLowerCase();
                      // Build de-duplicated list: configured apps + intent app
                      const allApps = new Set(configuredApps);
                      if (intentAppId) allApps.add(intentAppId);
                      for (const appId of allApps) {
                        try {
                          store.createAppSubscription({
                            accountId,
                            appId,
                            planId: "default",
                            status: "active",
                            provider: "oidc_auto",
                          });
                        } catch {
                          // Subscription may already exist
                        }
                      }
                    }
                  }
                }
                // Update the session principal with the new tenant
                const provisionedServer =
                  (provisionedPrincipal.serverId
                    ? store.getServer(provisionedPrincipal.serverId)
                    : null) ?? store.getServerByTenantId(provisionedPrincipal.tenantId);
                const updatedPrincipal =
                  provisionedServer
                    ? store.toPrincipal({
                        user: oidcUser,
                        server: provisionedServer,
                        accountId: provisionedPrincipal.accountId || provisionedServer.accountId,
                        amr: session.principal.amr,
                      })
                    : {
                        ...session.principal,
                        serverId: provisionedPrincipal.serverId,
                        tenantId: provisionedPrincipal.tenantId,
                        accountId: provisionedPrincipal.accountId || session.principal.accountId,
                      };
                sessions.updateSessionPrincipal(session.id, updatedPrincipal);
                // Auto-install ALL configured apps on the new server
                if (provisionedPrincipal.tenantId) {
                  const configuredApps = autoProvisioner!.lastConfiguredApps;
                  const intentAppId = completed.productId?.trim().toLowerCase();
                  const allApps = new Set(configuredApps);
                  if (intentAppId) allApps.add(intentAppId);
                  const autoServerId = provisionedServer?.serverId ?? provisionedPrincipal.serverId;
                  // Re-read session after principal update
                  const updatedSession = sessions.getSession(session.id);
                  if (updatedSession && autoServerId) {
                    const bgAccountId = updatedSession.principal.accountId ?? updatedSession.principal.userId;
                    for (const appId of allApps) {
                      try {
                        await installAppOnServer({
                          serverId: autoServerId,
                          appId,
                          accountId: bgAccountId,
                          source: "purchase",
                        });
                      } catch {
                        // Best-effort auto-install
                      }
                    }
                  }
                }
              } catch (bgError) {
                console.error(
                  `[oidc] background provisioning failed: ${String(bgError)}`,
                );
              }
            })();
          }
          // For existing users with servers, auto-install intent app synchronously
          // (already have a server, this is fast)
          if (hasTenant && completed.productId && completed.principal?.tenantId) {
            const autoAppId = completed.productId.trim().toLowerCase();
            const autoServerId =
              completed.principal.serverId ??
              store.getServerByTenantId(completed.principal.tenantId)?.serverId;
            if (autoServerId) {
              try {
                await installAppOnServer({
                  serverId: autoServerId,
                  appId: autoAppId,
                  accountId: session.principal.accountId ?? session.principal.userId,
                  source: "purchase",
                });
              } catch {
                // Best-effort auto-install
              }
            }
          }
        } catch (error) {
          sendJson(res, 401, {
            ok: false,
            error: String(error),
          });
        }
        return;
      }

      if (method === "GET" && pathname === "/api/internal/managed-connections/profile") {
        const contextResult = resolveManagedConnectionRuntimeContext({
          req,
          store,
          requestValues: {
            service: url.searchParams.get("service") ?? "",
            appId: url.searchParams.get("app_id") ?? "",
            adapterId: url.searchParams.get("adapter_id") ?? "",
            authMethodId: url.searchParams.get("auth_method_id") ?? "",
            managedProfileId: url.searchParams.get("managed_profile_id") ?? "",
          },
        });
        if (!contextResult.ok) {
          sendJson(res, contextResult.status, {
            ok: false,
            error: contextResult.error,
          });
          logFrontdoorEvent("managed_connection_profile_metadata_rejected", {
            request_id: requestId,
            error: contextResult.error,
          });
          return;
        }
        const managedContext = contextResult.value;
        const install = store.getServerAppInstall(managedContext.server.serverId, managedContext.appId);
        if (!install || install.status !== "installed") {
          sendJson(res, 403, {
            ok: false,
            error: "app_not_installed_on_server",
          });
          logFrontdoorEvent("managed_connection_profile_metadata_rejected", {
            request_id: requestId,
            server_id: managedContext.server.serverId,
            tenant_id: managedContext.tenantId,
            entity_id: managedContext.entityId,
            app_id: managedContext.appId,
            adapter_id: managedContext.adapterId,
            auth_method_id: managedContext.authMethodId,
            managed_profile_id: managedContext.managedProfileId,
            error: "app_not_installed_on_server",
          });
          return;
        }
        const ownerResult = resolveManagedConnectionOwner({
          store,
          context: managedContext,
        });
        if (!ownerResult.ok) {
          sendJson(res, ownerResult.status, {
            ok: false,
            error: ownerResult.error,
          });
          logFrontdoorEvent("managed_connection_profile_metadata_rejected", {
            request_id: requestId,
            server_id: managedContext.server.serverId,
            tenant_id: managedContext.tenantId,
            entity_id: managedContext.entityId,
            app_id: managedContext.appId,
            adapter_id: managedContext.adapterId,
            auth_method_id: managedContext.authMethodId,
            managed_profile_id: managedContext.managedProfileId,
            error: ownerResult.error,
          });
          return;
        }
        const owner = ownerResult.value;
        if (owner.ownerKind === "platform_control_plane") {
          const profile = owner.profile;
          if (profile.service !== managedContext.service) {
            sendJson(res, 400, {
              ok: false,
              error: "service_mismatch",
            });
            logFrontdoorEvent("managed_connection_profile_metadata_rejected", {
              request_id: requestId,
              server_id: managedContext.server.serverId,
              tenant_id: managedContext.tenantId,
              entity_id: managedContext.entityId,
              app_id: managedContext.appId,
              adapter_id: managedContext.adapterId,
              auth_method_id: managedContext.authMethodId,
              managed_profile_id: profile.managedProfileId,
              owner_kind: owner.ownerKind,
              error: "service_mismatch",
            });
            return;
          }
          if (profile.flowKind !== "oauth2") {
            sendJson(res, 409, {
              ok: false,
              error: "managed_profile_flow_not_supported",
            });
            logFrontdoorEvent("managed_connection_profile_metadata_rejected", {
              request_id: requestId,
              server_id: managedContext.server.serverId,
              tenant_id: managedContext.tenantId,
              entity_id: managedContext.entityId,
              app_id: managedContext.appId,
              adapter_id: managedContext.adapterId,
              auth_method_id: managedContext.authMethodId,
              managed_profile_id: profile.managedProfileId,
              owner_kind: owner.ownerKind,
              error: "managed_profile_flow_not_supported",
            });
            return;
          }
          sendJson(res, 200, buildManagedConnectionMetadataResponse(profile));
          logFrontdoorEvent("managed_connection_profile_metadata_resolved", {
            request_id: requestId,
            server_id: managedContext.server.serverId,
            tenant_id: managedContext.tenantId,
            entity_id: managedContext.entityId,
            app_id: managedContext.appId,
            adapter_id: managedContext.adapterId,
            auth_method_id: managedContext.authMethodId,
            managed_profile_id: profile.managedProfileId,
            auth_via: managedContext.authVia,
            owner_kind: owner.ownerKind,
          });
          return;
        }
        try {
          const relayed = await relayManagedConnectionMetadata({
            route: owner.route,
            context: managedContext,
          });
          sendJson(res, relayed.status, relayed.payload);
          logFrontdoorEvent("managed_connection_profile_metadata_resolved", {
            request_id: requestId,
            server_id: managedContext.server.serverId,
            tenant_id: managedContext.tenantId,
            entity_id: managedContext.entityId,
            app_id: managedContext.appId,
            adapter_id: managedContext.adapterId,
            auth_method_id: managedContext.authMethodId,
            managed_profile_id: managedContext.managedProfileId,
            auth_via: managedContext.authVia,
            owner_kind: owner.ownerKind,
            product_control_plane_base_url: owner.route.baseUrl,
            relayed_status: relayed.status,
          });
        } catch (error) {
          sendJson(res, 502, {
            ok: false,
            error: "product_control_plane_relay_failed",
          });
          logFrontdoorEvent("managed_connection_profile_metadata_rejected", {
            request_id: requestId,
            server_id: managedContext.server.serverId,
            tenant_id: managedContext.tenantId,
            entity_id: managedContext.entityId,
            app_id: managedContext.appId,
            adapter_id: managedContext.adapterId,
            auth_method_id: managedContext.authMethodId,
            managed_profile_id: managedContext.managedProfileId,
            owner_kind: owner.ownerKind,
            error: String(error),
          });
        }
        return;
      }

      if (method === "POST" && pathname === "/api/internal/managed-connections/profile/exchange") {
        const body = (await readJsonBody<{
          service?: string;
          appId?: string;
          adapter?: string;
          authMethodId?: string;
          managedProfileId?: string;
          code?: string;
          state?: string;
          redirectUri?: string;
        }>(req)) ?? {};
        const contextResult = resolveManagedConnectionRuntimeContext({
          req,
          store,
          requestValues: {
            service: typeof body.service === "string" ? body.service : "",
            appId: typeof body.appId === "string" ? body.appId : "",
            adapterId: typeof body.adapter === "string" ? body.adapter : "",
            authMethodId: typeof body.authMethodId === "string" ? body.authMethodId : "",
            managedProfileId:
              typeof body.managedProfileId === "string" ? body.managedProfileId : "",
          },
        });
        if (!contextResult.ok) {
          sendJson(res, contextResult.status, {
            ok: false,
            error: contextResult.error,
          });
          logFrontdoorEvent("managed_connection_profile_exchange_rejected", {
            request_id: requestId,
            error: contextResult.error,
          });
          return;
        }
        const managedContext = contextResult.value;
        const code = typeof body.code === "string" ? body.code.trim() : "";
        const redirectUri = typeof body.redirectUri === "string" ? body.redirectUri.trim() : "";
        if (!code || !redirectUri) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_exchange_params",
          });
          logFrontdoorEvent("managed_connection_profile_exchange_rejected", {
            request_id: requestId,
            server_id: managedContext.server.serverId,
            tenant_id: managedContext.tenantId,
            entity_id: managedContext.entityId,
            app_id: managedContext.appId,
            adapter_id: managedContext.adapterId,
            auth_method_id: managedContext.authMethodId,
            managed_profile_id: managedContext.managedProfileId,
            error: "missing_exchange_params",
          });
          return;
        }
        const install = store.getServerAppInstall(managedContext.server.serverId, managedContext.appId);
        if (!install || install.status !== "installed") {
          sendJson(res, 403, {
            ok: false,
            error: "app_not_installed_on_server",
          });
          logFrontdoorEvent("managed_connection_profile_exchange_rejected", {
            request_id: requestId,
            server_id: managedContext.server.serverId,
            tenant_id: managedContext.tenantId,
            entity_id: managedContext.entityId,
            app_id: managedContext.appId,
            adapter_id: managedContext.adapterId,
            auth_method_id: managedContext.authMethodId,
            managed_profile_id: managedContext.managedProfileId,
            error: "app_not_installed_on_server",
          });
          return;
        }
        const ownerResult = resolveManagedConnectionOwner({
          store,
          context: managedContext,
        });
        if (!ownerResult.ok) {
          sendJson(res, ownerResult.status, {
            ok: false,
            error: ownerResult.error,
          });
          logFrontdoorEvent("managed_connection_profile_exchange_rejected", {
            request_id: requestId,
            server_id: managedContext.server.serverId,
            tenant_id: managedContext.tenantId,
            entity_id: managedContext.entityId,
            app_id: managedContext.appId,
            adapter_id: managedContext.adapterId,
            auth_method_id: managedContext.authMethodId,
            managed_profile_id: managedContext.managedProfileId,
            error: ownerResult.error,
          });
          return;
        }
        const owner = ownerResult.value;
        if (owner.ownerKind === "platform_control_plane") {
          const profile = owner.profile;
          if (profile.service !== managedContext.service) {
            sendJson(res, 400, {
              ok: false,
              error: "service_mismatch",
            });
            logFrontdoorEvent("managed_connection_profile_exchange_rejected", {
              request_id: requestId,
              server_id: managedContext.server.serverId,
              tenant_id: managedContext.tenantId,
              entity_id: managedContext.entityId,
              app_id: managedContext.appId,
              adapter_id: managedContext.adapterId,
              auth_method_id: managedContext.authMethodId,
              managed_profile_id: profile.managedProfileId,
              owner_kind: owner.ownerKind,
              error: "service_mismatch",
            });
            return;
          }
          if (profile.flowKind !== "oauth2") {
            sendJson(res, 409, {
              ok: false,
              error: "managed_profile_flow_not_supported",
            });
            logFrontdoorEvent("managed_connection_profile_exchange_rejected", {
              request_id: requestId,
              server_id: managedContext.server.serverId,
              tenant_id: managedContext.tenantId,
              entity_id: managedContext.entityId,
              app_id: managedContext.appId,
              adapter_id: managedContext.adapterId,
              auth_method_id: managedContext.authMethodId,
              managed_profile_id: profile.managedProfileId,
              owner_kind: owner.ownerKind,
              error: "managed_profile_flow_not_supported",
            });
            return;
          }
          try {
            const exchanged = await exchangeManagedOAuthCode({
              profile,
              code,
              redirectUri,
            });
            sendJson(res, 200, exchanged);
            logFrontdoorEvent("managed_connection_profile_exchange_succeeded", {
              request_id: requestId,
              server_id: managedContext.server.serverId,
              tenant_id: managedContext.tenantId,
              entity_id: managedContext.entityId,
              app_id: managedContext.appId,
              adapter_id: managedContext.adapterId,
              auth_method_id: managedContext.authMethodId,
              managed_profile_id: profile.managedProfileId,
              auth_via: managedContext.authVia,
              owner_kind: owner.ownerKind,
            });
          } catch (error) {
            sendJson(res, 502, {
              ok: false,
              error: String(error),
            });
            logFrontdoorEvent("managed_connection_profile_exchange_rejected", {
              request_id: requestId,
              server_id: managedContext.server.serverId,
              tenant_id: managedContext.tenantId,
              entity_id: managedContext.entityId,
              app_id: managedContext.appId,
              adapter_id: managedContext.adapterId,
              auth_method_id: managedContext.authMethodId,
              managed_profile_id: profile.managedProfileId,
              owner_kind: owner.ownerKind,
              error: String(error),
            });
          }
          return;
        }
        try {
          const relayed = await relayManagedConnectionExchange({
            route: owner.route,
            context: managedContext,
            body: {
              service: managedContext.service,
              appId: managedContext.appId,
              adapter: managedContext.adapterId,
              authMethodId: managedContext.authMethodId,
              ...(managedContext.managedProfileId
                ? { managedProfileId: managedContext.managedProfileId }
                : {}),
              code,
              ...(typeof body.state === "string" && body.state.trim()
                ? { state: body.state.trim() }
                : {}),
              redirectUri,
            },
          });
          sendJson(res, relayed.status, relayed.payload);
          logFrontdoorEvent("managed_connection_profile_exchange_succeeded", {
            request_id: requestId,
            server_id: managedContext.server.serverId,
            tenant_id: managedContext.tenantId,
            entity_id: managedContext.entityId,
            app_id: managedContext.appId,
            adapter_id: managedContext.adapterId,
            auth_method_id: managedContext.authMethodId,
            managed_profile_id: managedContext.managedProfileId,
            auth_via: managedContext.authVia,
            owner_kind: owner.ownerKind,
            product_control_plane_base_url: owner.route.baseUrl,
            relayed_status: relayed.status,
          });
        } catch (error) {
          sendJson(res, 502, {
            ok: false,
            error: "product_control_plane_relay_failed",
          });
          logFrontdoorEvent("managed_connection_profile_exchange_rejected", {
            request_id: requestId,
            server_id: managedContext.server.serverId,
            tenant_id: managedContext.tenantId,
            entity_id: managedContext.entityId,
            app_id: managedContext.appId,
            adapter_id: managedContext.adapterId,
            auth_method_id: managedContext.authMethodId,
            managed_profile_id: managedContext.managedProfileId,
            owner_kind: owner.ownerKind,
            error: String(error),
          });
        }
        return;
      }

      if (method === "POST" && pathname === "/api/internal/product-control-plane/call") {
        const body = (await readJsonBody<{
          appId?: string;
          operation?: string;
          payload?: Record<string, unknown>;
        }>(req)) ?? {};
        const contextResult = resolveProductControlPlaneRuntimeContext({
          req,
          store,
          requestValues: {
            appId: typeof body.appId === "string" ? body.appId : "",
            operation: typeof body.operation === "string" ? body.operation : "",
          },
        });
        if (!contextResult.ok) {
          sendJson(res, contextResult.status, {
            ok: false,
            error: contextResult.error,
          });
          logFrontdoorEvent("product_control_plane_call_rejected", {
            request_id: requestId,
            error: contextResult.error,
          });
          return;
        }

        const callContext = contextResult.value;
        const install = store.getServerAppInstall(callContext.server.serverId, callContext.appId);
        if (!install || install.status !== "installed") {
          sendJson(res, 403, {
            ok: false,
            error: "app_not_installed_on_server",
          });
          logFrontdoorEvent("product_control_plane_call_rejected", {
            request_id: requestId,
            server_id: callContext.server.serverId,
            tenant_id: callContext.tenantId,
            entity_id: callContext.entityId,
            app_id: callContext.appId,
            operation: callContext.operation,
            error: "app_not_installed_on_server",
          });
          return;
        }

        const platformOwned = fulfillPlatformOwnedProductControlPlaneOperation({
          context: callContext,
        });
        if (platformOwned) {
          sendJson(res, platformOwned.status, platformOwned.payload);
          logFrontdoorEvent("product_control_plane_call_fulfilled", {
            request_id: requestId,
            server_id: callContext.server.serverId,
            tenant_id: callContext.tenantId,
            entity_id: callContext.entityId,
            app_id: callContext.appId,
            operation: callContext.operation,
            fulfillment: "frontdoor",
          });
          return;
        }

        const route = store.getProductControlPlaneRoute(callContext.appId);
        if (!route) {
          sendJson(res, 503, {
            ok: false,
            error: "product_control_plane_not_configured",
          });
          logFrontdoorEvent("product_control_plane_call_rejected", {
            request_id: requestId,
            server_id: callContext.server.serverId,
            tenant_id: callContext.tenantId,
            entity_id: callContext.entityId,
            app_id: callContext.appId,
            operation: callContext.operation,
            error: "product_control_plane_not_configured",
          });
          return;
        }
        if (route.status !== "active") {
          sendJson(res, 503, {
            ok: false,
            error: "product_control_plane_unavailable",
          });
          logFrontdoorEvent("product_control_plane_call_rejected", {
            request_id: requestId,
            server_id: callContext.server.serverId,
            tenant_id: callContext.tenantId,
            entity_id: callContext.entityId,
            app_id: callContext.appId,
            operation: callContext.operation,
            error: "product_control_plane_unavailable",
          });
          return;
        }

        try {
          const relayed = await relayProductControlPlaneOperation({
            route,
            context: callContext,
            body: {
              appId: callContext.appId,
              operation: callContext.operation,
              payload:
                body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
                  ? body.payload
                  : {},
            },
          });
          sendJson(res, relayed.status, relayed.payload);
          logFrontdoorEvent("product_control_plane_call_relayed", {
            request_id: requestId,
            server_id: callContext.server.serverId,
            tenant_id: callContext.tenantId,
            entity_id: callContext.entityId,
            app_id: callContext.appId,
            operation: callContext.operation,
            product_control_plane_base_url: route.baseUrl,
            relayed_status: relayed.status,
          });
        } catch (error) {
          sendJson(res, 502, {
            ok: false,
            error: "product_control_plane_relay_failed",
          });
          logFrontdoorEvent("product_control_plane_call_rejected", {
            request_id: requestId,
            server_id: callContext.server.serverId,
            tenant_id: callContext.tenantId,
            entity_id: callContext.entityId,
            app_id: callContext.appId,
            operation: callContext.operation,
            error: String(error),
          });
        }
        return;
      }

      if (method === "POST" && pathname === "/api/runtime/token") {
        const rawSession = readSession({ req, config, sessions, store });
        if (!rawSession) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        if (
          !applyRateLimit({
            req,
            res,
            limiter: tokenEndpointLimiter,
            key: `token:endpoint:${rawSession.id}`,
            error: "token_rate_limited",
          })
        ) {
          return;
        }
        const body = (await readJsonBody<{ client_id?: string; server_id?: string }>(req)) ?? {};
        const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
        const requestedServerId =
          (typeof body.server_id === "string" ? body.server_id.trim() : "") ||
          undefined;
        const context = resolveActiveServerContext({
          session: rawSession,
          requestedServerId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
            server_count: context.serverCount,
          });
          return;
        }
        const persistentSession = ensurePersistentSession({
          session: context.session,
          sessions,
        });
        const refreshToken = sessions.issueRefreshToken(persistentSession.id);
        const tenant = context.serverRuntime;
        sendJson(res, 200, {
          ok: true,
          ...buildRuntimeTokenResponse({
            config,
            req,
            session: persistentSession,
            refreshToken,
            serverId: context.server.serverId,
            tenant,
            principal: context.principal,
            clientId: clientId || undefined,
          }),
        });
        logFrontdoorEvent("runtime_token_issued", {
          request_id: requestId,
          user_id: context.principal.userId,
          server_id: context.server.serverId,
          audience: "runtime-api",
        });
        return;
      }

      if (method === "POST" && pathname === "/api/runtime/token/refresh") {
        if (
          !applyRateLimit({
            req,
            res,
            limiter: tokenEndpointLimiter,
            key: `token:endpoint:${getClientIp(req)}`,
            error: "token_rate_limited",
          })
        ) {
          return;
        }
        const body = (await readJsonBody<{
          refresh_token?: string;
          client_id?: string;
          server_id?: string;
        }>(req)) ?? {};
        const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
        const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
        const requestedServerId =
          (typeof body.server_id === "string" ? body.server_id.trim() : "") ||
          undefined;
        if (!refreshToken) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_refresh_token",
          });
          return;
        }
        const rotated = sessions.rotateRefreshToken(refreshToken);
        if (!rotated) {
          sendJson(res, 401, {
            ok: false,
            error: "invalid_refresh_token",
          });
          return;
        }
        const context = resolveActiveServerContext({
          session: rotated.session,
          requestedServerId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
            server_count: context.serverCount,
          });
          return;
        }
        const tenant = context.serverRuntime;
        sendJson(res, 200, {
          ok: true,
          ...buildRuntimeTokenResponse({
            config,
            req,
            session: context.session,
            refreshToken: rotated.nextRefreshToken,
            serverId: context.server.serverId,
            tenant,
            principal: context.principal,
            clientId: clientId || undefined,
          }),
        });
        logFrontdoorEvent("runtime_token_refreshed", {
          request_id: requestId,
          user_id: context.principal.userId,
          server_id: context.server.serverId,
          audience: "runtime-api",
        });
        return;
      }

      if (method === "POST" && pathname === "/api/runtime/token/revoke") {
        if (
          !applyRateLimit({
            req,
            res,
            limiter: tokenEndpointLimiter,
            key: `token:endpoint:${getClientIp(req)}`,
            error: "token_rate_limited",
          })
        ) {
          return;
        }
        const body = (await readJsonBody<{ refresh_token?: string }>(req)) ?? {};
        const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
        if (!refreshToken) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_refresh_token",
          });
          return;
        }
        const revoked = sessions.revokeRefreshToken(refreshToken);
        sendJson(res, revoked ? 200 : 404, {
          ok: revoked,
        });
        logFrontdoorEvent("runtime_token_revoked", {
          request_id: requestId,
          revoked,
        });
        return;
      }

      if (pathname === "/api/runtime/token/proxy") {
        sendJson(res, 405, {
          ok: false,
          error: "method_not_allowed",
        });
        return;
      }

      // -----------------------------------------------------------------------
      // API Token CRUD
      // -----------------------------------------------------------------------

      if (method === "POST" && pathname === "/api/tokens/create") {
        const session = readSession({ req, config, sessions, store });
        if (!session) return sendJson(res, 401, { error: "unauthorized" });
        const accountId = session.principal.accountId;
        if (!accountId) return sendJson(res, 400, { error: "no_account" });

        const body = await readJsonBody(req);
        const displayName = typeof (body as any)?.display_name === "string" ? (body as any).display_name.trim() || "Unnamed Token" : "Unnamed Token";
        const expiresInDays = typeof (body as any)?.expires_in_days === "number" ? (body as any).expires_in_days : null;

        const token = generateApiToken();
        const tokenId = generateTokenId();
        const tokenHash = hashApiToken(token);
        const expiresAtMs = expiresInDays ? Date.now() + expiresInDays * 86400000 : undefined;

        store.createApiToken({
          tokenId,
          tokenHash,
          userId: session.principal.userId,
          accountId,
          displayName,
          expiresAtMs,
        });

        return sendJson(res, 200, {
          token,
          token_id: tokenId,
          display_name: displayName,
          expires_at: expiresAtMs || null,
        });
      }

      if (method === "GET" && pathname === "/api/tokens") {
        const session = readSession({ req, config, sessions, store });
        if (!session) return sendJson(res, 401, { error: "unauthorized" });
        const tokens = store.listApiTokens(session.principal.userId);
        return sendJson(res, 200, {
          tokens: tokens.map((t) => ({
            token_id: t.tokenId,
            display_name: t.displayName,
            last_used: t.lastUsedMs,
            expires_at: t.expiresAtMs,
            created_at: t.createdAtMs,
          })),
        });
      }

      if (method === "DELETE" && pathname.startsWith("/api/tokens/") && pathname.split("/").length === 4) {
        const session = readSession({ req, config, sessions, store });
        if (!session) return sendJson(res, 401, { error: "unauthorized" });
        const tokenId = pathname.split("/")[3];
        store.revokeApiToken(tokenId);
        return sendJson(res, 200, { ok: true });
      }

      // ── Account Info Endpoint ──────────────────────────────────────

      if (method === "GET" && pathname === "/api/account") {
        const session = readSession({ req, config, sessions, store });
        if (!session) return sendJson(res, 401, { ok: false, error: "unauthorized" });
        const accountId = session.principal.accountId;
        if (!accountId) return sendJson(res, 400, { ok: false, error: "no_account" });

        const account = store.getAccount(accountId);
        if (!account) return sendJson(res, 404, { ok: false, error: "account_not_found" });

        const servers = store.getServersForAccount(accountId);
        const activeServers = servers.filter((s) => s.status !== "destroyed");
        const credits = store.getCreditBalance(accountId);
        const freeTierActive = !!(credits?.freeTierExpiresAtMs && credits.freeTierExpiresAtMs > Date.now());
        const daysRemaining = freeTierActive && credits?.freeTierExpiresAtMs
          ? Math.max(0, Math.ceil((credits.freeTierExpiresAtMs - Date.now()) / 86400000))
          : 0;

        return sendJson(res, 200, {
          ok: true,
          accountId: account.accountId,
          displayName: account.displayName,
          email: session.principal.email ?? null,
          status: account.status,
          servers: activeServers.length,
          createdAt: new Date(account.createdAtMs).toISOString(),
          freeTier: {
            active: freeTierActive,
            expiresAt: credits?.freeTierExpiresAtMs ? new Date(credits.freeTierExpiresAtMs).toISOString() : null,
            daysRemaining,
          },
          creditBalance: {
            balanceCents: credits?.balanceCents ?? 0,
            currency: credits?.currency ?? "usd",
            formattedBalance: `$${((credits?.balanceCents ?? 0) / 100).toFixed(2)}`,
          },
        });
      }

      // ── Credit System Endpoints ────────────────────────────────────

      if (method === "GET" && pathname === "/api/account/credits") {
        const session = readSession({ req, config, sessions, store });
        if (!session) return sendJson(res, 401, { ok: false, error: "unauthorized" });
        const accountId = session.principal.accountId;
        if (!accountId) return sendJson(res, 400, { ok: false, error: "no_account" });

        const credits = store.getCreditBalance(accountId);
        const transactions = store.getCreditTransactions(accountId, { limit: 10 });
        const freeTierActive = !!(credits?.freeTierExpiresAtMs && credits.freeTierExpiresAtMs > Date.now());
        const daysRemaining = freeTierActive && credits?.freeTierExpiresAtMs
          ? Math.max(0, Math.ceil((credits.freeTierExpiresAtMs - Date.now()) / 86400000))
          : 0;

        sendJson(res, 200, {
          ok: true,
          balance_cents: credits?.balanceCents ?? 0,
          currency: credits?.currency ?? "usd",
          formatted_balance: `$${((credits?.balanceCents ?? 0) / 100).toFixed(2)}`,
          free_tier: freeTierActive
            ? {
                active: true,
                expires_at: new Date(credits!.freeTierExpiresAtMs!).toISOString(),
                days_remaining: daysRemaining,
              }
            : { active: false },
          recent_transactions: transactions.map((t) => ({
            transaction_id: t.transactionId,
            type: t.type,
            amount_cents: t.amountCents,
            balance_after_cents: t.balanceAfterCents,
            description: t.description,
            created_at: new Date(t.createdAtMs).toISOString(),
          })),
        });
        return;
      }

      if (method === "GET" && pathname === "/api/account/credits/transactions") {
        const session = readSession({ req, config, sessions, store });
        if (!session) return sendJson(res, 401, { ok: false, error: "unauthorized" });
        const accountId = session.principal.accountId;
        if (!accountId) return sendJson(res, 400, { ok: false, error: "no_account" });

        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
        const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
        const transactions = store.getCreditTransactions(accountId, { limit, offset });

        sendJson(res, 200, {
          ok: true,
          transactions: transactions.map((t) => ({
            transaction_id: t.transactionId,
            type: t.type,
            amount_cents: t.amountCents,
            balance_after_cents: t.balanceAfterCents,
            description: t.description,
            reference_id: t.referenceId,
            created_at: new Date(t.createdAtMs).toISOString(),
          })),
        });
        return;
      }

      if (method === "POST" && pathname === "/api/account/credits/deposit") {
        const session = readSession({ req, config, sessions, store });
        if (!session) return sendJson(res, 401, { ok: false, error: "unauthorized" });
        const accountId = session.principal.accountId;
        if (!accountId) return sendJson(res, 400, { ok: false, error: "no_account" });

        const body = await readJsonBody(req);
        const bodyRecord = asRecord(body);
        const amountCents = typeof bodyRecord?.amount_cents === "number" ? bodyRecord.amount_cents : 0;

        if (amountCents < 500) {
          sendJson(res, 400, { ok: false, error: "minimum_deposit", message: "Minimum deposit is $5.00 (500 cents)" });
          return;
        }
        if (amountCents > 100000) {
          sendJson(res, 400, { ok: false, error: "maximum_deposit", message: "Maximum deposit is $1,000.00" });
          return;
        }

        try {
          const checkout = await createCreditDepositSession({
            config,
            accountId,
            amountCents,
            customerEmail: session.principal.email,
          });
          sendJson(res, 200, {
            ok: true,
            checkout_url: checkout.checkoutUrl,
            session_id: checkout.sessionId,
          });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err) });
        }
        return;
      }

      if (pathname.startsWith("/auth/")) {
        if (method !== "GET") {
          sendJson(res, 405, {
            ok: false,
            error: "method_not_allowed",
          });
          return;
        }
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        if (
          !applyRateLimit({
            req,
            res,
            limiter: proxyRequestLimiter,
            key: `proxy:${session.id}`,
            error: "proxy_rate_limited",
          })
        ) {
          return;
        }
        const requestedServerId =
          (url.searchParams.get("server_id") ?? "").trim() || undefined;
        const context = resolveActiveServerContext({
          session,
          requestedServerId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
            server_count: context.serverCount,
          });
          return;
        }
        proxyRuntimeRequest({
          req,
          res,
          url,
          session: context.session,
          principal: context.principal,
          runtime: context.serverRuntime,
          route: "app",
        });
        return;
      }

      if (
        pathname === "/runtime" ||
        pathname.startsWith("/runtime/") ||
        pathname === "/app" ||
        pathname.startsWith("/app/")
      ) {
        const isRuntimeRoute = pathname === "/runtime" || pathname.startsWith("/runtime/");
        const isAppRoute = !isRuntimeRoute;
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        if (
          !applyRateLimit({
            req,
            res,
            limiter: proxyRequestLimiter,
            key: `proxy:${session.id}`,
            error: "proxy_rate_limited",
          })
        ) {
          return;
        }
        const requestedServerId =
          (url.searchParams.get("server_id") ?? "").trim() || undefined;
        const context = resolveActiveServerContext({
          session,
          requestedServerId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
            server_count: context.serverCount,
          });
          return;
        }
        if (isAppRoute && isAppDocumentRequest(req, pathname)) {
          if (isEmbeddedAppRequest(url)) {
            await proxyRuntimeEmbeddedAppDocument({
              req,
              res,
              url,
              session: context.session,
              principal: context.principal,
              runtime: context.serverRuntime,
              serverId: context.server.serverId,
              server: context.server,
              accountId: context.accountId,
            });
          } else {
            renderAppShellDocument({
              req,
              res,
              url,
              session: context.session,
              principal: context.principal,
              runtime: context.serverRuntime,
              serverId: context.server.serverId,
              server: context.server,
              accountId: context.accountId,
            });
          }
          return;
        }
        proxyRuntimeRequest({
          req,
          res,
          url,
          session: context.session,
          principal: context.principal,
          runtime: context.serverRuntime,
          route: isRuntimeRoute ? "runtime" : "app",
        });
        return;
      }

      if (pathname.startsWith("/_next/")) {
        const session = readSession({ req, config, sessions, store });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        if (
          !applyRateLimit({
            req,
            res,
            limiter: proxyRequestLimiter,
            key: `proxy:${session.id}`,
            error: "proxy_rate_limited",
          })
        ) {
          return;
        }
        const requestedServerId =
          (url.searchParams.get("server_id") ?? "").trim() || undefined;
        const context = resolveActiveServerContext({
          session,
          requestedServerId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
            server_count: context.serverCount,
          });
          return;
        }
        const appIdFromReferer = parseAppIdFromRefererPath({
          req,
          baseUrl: config.baseUrl,
        });
        if (!appIdFromReferer) {
          sendJson(res, 404, {
            ok: false,
            error: "app_asset_context_missing",
          });
          return;
        }
        const appAssetUrl = new URL(url.toString());
        appAssetUrl.pathname = `/app/${encodeURIComponent(appIdFromReferer)}${pathname}`;
        proxyRuntimeRequest({
          req,
          res,
          url: appAssetUrl,
          session: context.session,
          principal: context.principal,
          runtime: context.serverRuntime,
          route: "app",
        });
        return;
      }

      sendText(res, 404, "Not Found");
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: String(error),
      });
    }
  });

  server.on("upgrade", (req, socket, head) => {
    // ── Tenant subdomain WebSocket support ──
    const wsTenanIdFromHost = extractTenantId(req.headers.host);
    if (wsTenanIdFromHost) {
      const wsRoute = routingTable.get(wsTenanIdFromHost);
      if (!wsRoute || wsRoute.status !== "running") {
        socket.destroy();
        return;
      }
      req.headers["x-nexus-tenant-id"] = wsRoute.tenantId;
      req.headers["x-nexus-server-id"] = wsRoute.serverId;
      if (!req.headers["authorization"] && wsRoute.runtimeAuthToken) {
        req.headers["authorization"] = `Bearer ${wsRoute.runtimeAuthToken}`;
      }
      const wsUrl = new URL(req.url ?? "/", config.baseUrl);
      const wsNextPath =
        wsUrl.pathname === "/runtime" || wsUrl.pathname.startsWith("/runtime/")
          ? `${wsUrl.pathname.slice("/runtime".length) || "/"}${wsUrl.search || ""}`
          : `${wsUrl.pathname || "/"}${wsUrl.search || ""}`;
      req.url = wsNextPath;
      const wsTargetUrl = `http://${wsRoute.transportHost}:${wsRoute.runtimePort}`;
      proxy.ws(req, socket, head, { target: wsTargetUrl, changeOrigin: true });
      return;
    }

    const url = new URL(req.url ?? "/", config.baseUrl);
    const isRuntimePath = url.pathname === "/runtime" || url.pathname.startsWith("/runtime/");
    const isAppPath = url.pathname === "/" || url.pathname === "/app" || url.pathname.startsWith("/app/");
    if (!isRuntimePath && !isAppPath) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const session = readSession({ req, config, sessions, store });
    if (!session) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    if (!isSameOriginBrowserMutation(req, config.baseUrl)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const rateLimit = socketRateLimited({
      limiter: proxyRequestLimiter,
      key: `proxy:${session.id}`,
    });
    if (rateLimit.limited) {
      const retryAfter = rateLimit.retryAfterSeconds ?? 1;
      socket.write(
        `HTTP/1.1 429 Too Many Requests\r\nRetry-After: ${retryAfter}\r\nConnection: close\r\n\r\n`,
      );
      socket.destroy();
      return;
    }
    try {
      const requestedServerId =
        (url.searchParams.get("server_id") ?? "").trim() || undefined;
      const context = resolveActiveServerContext({
        session,
        requestedServerId,
      });
      if (!context.ok) {
        const statusCode = context.status;
        const reason =
          statusCode === 401
            ? "Unauthorized"
            : statusCode === 403
              ? "Forbidden"
              : statusCode === 404
                ? "Not Found"
                : statusCode === 409
                  ? "Conflict"
                  : "Bad Request";
        socket.write(`HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\n\r\n`);
        socket.destroy();
        return;
      }
      const targetOrigin = resolveTargetOrigin(context.serverRuntime.runtimeUrl);
      const upstreamBearer = resolveRuntimeUpstreamBearerToken({
        config,
        principal: context.principal,
        session: context.session,
        runtime: context.serverRuntime,
      });
      req.headers.authorization = `Bearer ${upstreamBearer}`;
      req.headers["x-nexus-frontdoor-tenant"] = context.serverRuntime.id;
      req.headers["x-nexus-frontdoor-session"] = context.session.id;
      req.headers["x-request-id"] = req.headers["x-request-id"] ?? randomToken(10);
      if (targetOrigin) {
        const originHeader = req.headers.origin;
        if (typeof originHeader === "string" && originHeader.trim()) {
          req.headers["x-nexus-frontdoor-origin"] = originHeader.trim();
        }
        req.headers.origin = targetOrigin;
      }
      const nextPath = isRuntimePath
        ? `${url.pathname.slice("/runtime".length) || "/"}${url.search || ""}`
        : `${url.pathname || "/"}${url.search || ""}`;
      req.url = nextPath;
      proxy.ws(req, socket, head, {
        target: context.serverRuntime.runtimeUrl,
      });
    } catch {
      socket.write("HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n");
      socket.destroy();
    }
  });

  server.on("close", () => {
    clearInterval(provisioningTimeoutInterval);
    clearInterval(hourlyBillingInterval);
    sessions.close();
    store.close();
    autoProvisioner?.close();
  });

  return { server, config };
}
