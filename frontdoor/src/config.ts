import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  FrontdoorConfig,
  OidcMapping,
  OidcProviderConfig,
  TenantConfig,
  UserConfig,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_CONFIG_PATH = path.join(PROJECT_ROOT, "config", "frontdoor.config.json");

type RawFrontdoorConfig = {
  host?: unknown;
  port?: unknown;
  baseUrl?: unknown;
  internalBaseUrl?: unknown;
  session?: {
    cookieName?: unknown;
    cookieDomain?: unknown;
    ttlSeconds?: unknown;
    storePath?: unknown;
  };
  runtimeToken?: {
    issuer?: unknown;
    audience?: unknown;
    secret?: unknown;
    activeKid?: unknown;
    keys?: unknown;
    ttlSeconds?: unknown;
    refreshTtlSeconds?: unknown;
  };
  security?: {
    passwordAuthEnabled?: unknown;
    sessionCookieSecure?: unknown;
    hsts?: {
      enabled?: unknown;
      maxAgeSeconds?: unknown;
      includeSubDomains?: unknown;
      preload?: unknown;
    };
    rateLimits?: {
      loginAttempts?: unknown;
      loginFailures?: unknown;
      tokenEndpoints?: unknown;
      proxyRequests?: unknown;
    };
  };
  tenants?: unknown;
  users?: unknown;
  oidc?: {
    enabled?: unknown;
    providers?: unknown;
    mappings?: unknown;
  };
  autoProvision?: {
    enabled?: unknown;
    storePath?: unknown;
    providers?: unknown;
    tenantIdPrefix?: unknown;
    defaultRoles?: unknown;
    defaultScopes?: unknown;
    command?: unknown;
    commandTimeoutMs?: unknown;
  };
  frontdoor?: {
    storePath?: unknown;
    operatorUserIds?: unknown;
    devCreatorEmails?: unknown;
    inviteTtlSeconds?: unknown;
  };
  billing?: {
    provider?: unknown;
    webhookSecret?: unknown;
    checkoutSuccessUrl?: unknown;
    checkoutCancelUrl?: unknown;
    stripeSecretKey?: unknown;
    stripeApiBaseUrl?: unknown;
    stripePriceIdsByPlan?: unknown;
  };
};

function readNumber(input: unknown, fallback: number): number {
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.floor(input);
  }
  if (typeof input === "string" && input.trim()) {
    const parsed = Number(input.trim());
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed);
    }
  }
  return fallback;
}

function readString(input: unknown, fallback: string): string {
  if (typeof input === "string" && input.trim()) {
    return input.trim();
  }
  return fallback;
}

function readBoolean(input: unknown, fallback: boolean): boolean {
  if (typeof input === "boolean") {
    return input;
  }
  if (typeof input === "string") {
    const normalized = input.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
      return false;
    }
  }
  if (typeof input === "number" && Number.isFinite(input)) {
    return input !== 0;
  }
  return fallback;
}

function assertNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`frontdoor config missing required ${label}`);
  }
  return trimmed;
}

function parseTenants(raw: unknown): Map<string, TenantConfig> {
  const tenants = new Map<string, TenantConfig>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return tenants;
  }
  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const record = value as Record<string, unknown>;
    const runtimeUrl =
      readString(record.runtimeUrl, "") || readString(record.runtime_url, "");
    if (!runtimeUrl) {
      continue;
    }
    const runtimePublicBaseUrl =
      readString(record.runtimePublicBaseUrl, "") ||
      readString(record.runtime_public_base_url, "") ||
      runtimeUrl;
    const runtimeWsUrl =
      readString(record.runtimeWsUrl, "") || readString(record.runtime_ws_url, "") || undefined;
    const runtimeSseUrl =
      readString(record.runtimeSseUrl, "") || readString(record.runtime_sse_url, "") || undefined;
    const runtimeAuthToken =
      readString(record.runtimeAuthToken, "") ||
      readString(record.runtime_auth_token, "") ||
      undefined;
    tenants.set(id, {
      id,
      runtimeUrl,
      runtimePublicBaseUrl,
      runtimeWsUrl,
      runtimeSseUrl,
      runtimeAuthToken,
    });
  }
  return tenants;
}

function parseUsers(raw: unknown): {
  usersByUsername: Map<string, UserConfig>;
  usersById: Map<string, UserConfig>;
} {
  const usersByUsername = new Map<string, UserConfig>();
  const usersById = new Map<string, UserConfig>();
  if (!Array.isArray(raw)) {
    return { usersByUsername, usersById };
  }
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const id = readString(record.id, "");
    const username = readString(record.username, "").toLowerCase();
    const passwordHash = readString(record.passwordHash, "");
    const tenantId = readString(record.tenantId, "");
    const entityId = readString(record.entityId, "");
    if (!id || !username || !passwordHash || !tenantId || !entityId) {
      continue;
    }
    const roles = Array.isArray(record.roles)
      ? record.roles
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim())
      : [];
    const scopes = Array.isArray(record.scopes)
      ? record.scopes
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim())
      : [];
    const disabled = record.disabled === true;
    const user: UserConfig = {
      id,
      username,
      passwordHash,
      tenantId,
      entityId,
      displayName: readString(record.displayName, "") || undefined,
      email: readString(record.email, "") || undefined,
      roles,
      scopes,
      disabled,
    };
    usersByUsername.set(username, user);
    usersById.set(id, user);
  }
  return { usersByUsername, usersById };
}

function parseOidcProviders(raw: unknown): Map<string, OidcProviderConfig> {
  const providers = new Map<string, OidcProviderConfig>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return providers;
  }
  for (const [providerId, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const record = value as Record<string, unknown>;
    const clientId = readString(record.clientId, "");
    const authorizeUrl = readString(record.authorizeUrl, "");
    const tokenUrl = readString(record.tokenUrl, "");
    const redirectUri = readString(record.redirectUri, "");
    if (!clientId || !authorizeUrl || !tokenUrl || !redirectUri) {
      continue;
    }
    providers.set(providerId, {
      clientId,
      clientSecret: readString(record.clientSecret, "") || undefined,
      issuer: readString(record.issuer, "") || undefined,
      jwksUrl: readString(record.jwksUrl, "") || undefined,
      authorizeUrl,
      tokenUrl,
      userInfoUrl: readString(record.userInfoUrl, "") || undefined,
      scope: readString(record.scope, "") || undefined,
      redirectUri,
    });
  }
  return providers;
}

function parseOidcMappings(raw: unknown): OidcMapping[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const mappings: OidcMapping[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const provider = readString(record.provider, "");
    const tenantId = readString(record.tenantId, "");
    if (!provider || !tenantId) {
      continue;
    }
    const roles = Array.isArray(record.roles)
      ? record.roles
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim())
      : [];
    const scopes = Array.isArray(record.scopes)
      ? record.scopes
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim())
      : [];
    const matchRecord =
      record.match && typeof record.match === "object" && !Array.isArray(record.match)
        ? (record.match as Record<string, unknown>)
        : undefined;
    const mapping: OidcMapping = {
      provider,
      tenantId,
      entityIdTemplate: readString(record.entityIdTemplate, "") || undefined,
      roles,
      scopes,
      match: matchRecord
        ? {
            emailDomain: readString(matchRecord.emailDomain, "") || undefined,
            email: readString(matchRecord.email, "") || undefined,
            subPrefix: readString(matchRecord.subPrefix, "") || undefined,
          }
        : undefined,
    };
    mappings.push(mapping);
  }
  return mappings;
}

function parseSecretMap(raw: unknown): Map<string, string> {
  const parsed = new Map<string, string>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return parsed;
  }
  for (const [key, value] of Object.entries(raw)) {
    const kid = key.trim();
    if (!kid) {
      continue;
    }
    const secret = readString(value, "");
    if (!secret) {
      continue;
    }
    parsed.set(kid, secret);
  }
  return parsed;
}

function parseSecretMapEnv(raw: string | undefined): Map<string, string> {
  const parsed = new Map<string, string>();
  if (!raw || !raw.trim()) {
    return parsed;
  }
  const input = raw.trim();
  if (input.startsWith("{")) {
    try {
      const json = JSON.parse(input) as unknown;
      return parseSecretMap(json);
    } catch {
      return parsed;
    }
  }
  for (const entry of input.split(",")) {
    const [kidPart, ...secretParts] = entry.split(":");
    const kid = kidPart?.trim();
    const secret = secretParts.join(":").trim();
    if (!kid || !secret) {
      continue;
    }
    parsed.set(kid, secret);
  }
  return parsed;
}

type ParsedRateLimit = {
  windowSeconds: number;
  maxAttempts: number;
  blockSeconds: number;
};

function parseRateLimit(raw: unknown, defaults: ParsedRateLimit): ParsedRateLimit {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaults;
  }
  const record = raw as Record<string, unknown>;
  return {
    windowSeconds: Math.max(1, readNumber(record.windowSeconds, defaults.windowSeconds)),
    maxAttempts: Math.max(1, readNumber(record.maxAttempts, defaults.maxAttempts)),
    blockSeconds: Math.max(1, readNumber(record.blockSeconds, defaults.blockSeconds)),
  };
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function parseStringMap(raw: unknown): Map<string, string> {
  const parsed = new Map<string, string>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return parsed;
  }
  for (const [key, value] of Object.entries(raw)) {
    const mapKey = key.trim();
    const mapValue = readString(value, "");
    if (!mapKey || !mapValue) {
      continue;
    }
    parsed.set(mapKey, mapValue);
  }
  return parsed;
}

function readCookieDomain(input: unknown, fallback: unknown): string | undefined {
  const raw = readString(input, readString(fallback, ""));
  if (!raw) {
    return undefined;
  }
  const value = raw.trim().toLowerCase();
  if (!value) {
    return undefined;
  }
  if (/[;\s,]/u.test(value)) {
    throw new Error("frontdoor config session cookie domain contains illegal characters");
  }
  const normalized = value.startsWith(".") ? value.slice(1) : value;
  if (!normalized || !/^[a-z0-9.-]+$/u.test(normalized) || !normalized.includes(".")) {
    throw new Error("frontdoor config session cookie domain must be a valid DNS domain");
  }
  return normalized;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): FrontdoorConfig {
  const configPath = env.FRONTDOOR_CONFIG_PATH?.trim() || DEFAULT_CONFIG_PATH;
  const rawText = fs.readFileSync(configPath, "utf8");
  const raw = JSON.parse(rawText) as RawFrontdoorConfig;
  const configDir = path.dirname(configPath);

  const host = readString(env.FRONTDOOR_HOST, readString(raw.host, "127.0.0.1"));
  const port = readNumber(env.FRONTDOOR_PORT, readNumber(raw.port, 4789));
  const baseUrl = readString(env.FRONTDOOR_BASE_URL, readString(raw.baseUrl, `http://${host}:${port}`));
  const internalBaseUrl = readString(
    env.FRONTDOOR_INTERNAL_BASE_URL,
    readString(raw.internalBaseUrl, baseUrl),
  );
  const baseIsHttps = /^https:\/\//i.test(baseUrl);
  const sessionCookieName = readString(
    env.FRONTDOOR_SESSION_COOKIE,
    readString(raw.session?.cookieName, "nexus_fd_session"),
  );
  const passwordAuthEnabled = readBoolean(
    env.FRONTDOOR_PASSWORD_AUTH_ENABLED,
    readBoolean(raw.security?.passwordAuthEnabled, true),
  );
  const sessionCookieDomain = readCookieDomain(
    env.FRONTDOOR_SESSION_COOKIE_DOMAIN,
    raw.session?.cookieDomain,
  );
  const sessionCookieSecure = readBoolean(
    env.FRONTDOOR_SESSION_COOKIE_SECURE,
    readBoolean(raw.security?.sessionCookieSecure, baseIsHttps),
  );
  const sessionTtlSeconds = readNumber(
    env.FRONTDOOR_SESSION_TTL_SECONDS,
    readNumber(raw.session?.ttlSeconds, 7 * 24 * 60 * 60),
  );
  const hstsEnabled = readBoolean(
    env.FRONTDOOR_SECURITY_HSTS_ENABLED,
    readBoolean(raw.security?.hsts?.enabled, true),
  );
  const hstsMaxAgeSeconds = Math.max(
    0,
    readNumber(
      env.FRONTDOOR_SECURITY_HSTS_MAX_AGE_SECONDS,
      readNumber(raw.security?.hsts?.maxAgeSeconds, 31536000),
    ),
  );
  const hstsIncludeSubDomains = readBoolean(
    env.FRONTDOOR_SECURITY_HSTS_INCLUDE_SUBDOMAINS,
    readBoolean(raw.security?.hsts?.includeSubDomains, true),
  );
  const hstsPreload = readBoolean(
    env.FRONTDOOR_SECURITY_HSTS_PRELOAD,
    readBoolean(raw.security?.hsts?.preload, true),
  );
  const sessionStorePathRaw = readString(
    env.FRONTDOOR_SESSION_STORE_PATH,
    readString(raw.session?.storePath, ""),
  );
  const sessionStorePath = sessionStorePathRaw
    ? path.isAbsolute(sessionStorePathRaw)
      ? sessionStorePathRaw
      : path.resolve(configDir, sessionStorePathRaw)
    : undefined;
  const frontdoorStorePathRaw = readString(
    env.FRONTDOOR_STORE_PATH,
    readString(raw.frontdoor?.storePath, ""),
  );
  const frontdoorStorePath = frontdoorStorePathRaw
    ? path.isAbsolute(frontdoorStorePathRaw)
      ? frontdoorStorePathRaw
      : path.resolve(configDir, frontdoorStorePathRaw)
    : sessionStorePath
      ? path.resolve(path.dirname(sessionStorePath), "frontdoor.db")
      : path.resolve(configDir, "frontdoor.db");
  const runtimeTokenIssuer = readString(
    env.FRONTDOOR_RUNTIME_TOKEN_ISSUER,
    readString(raw.runtimeToken?.issuer, baseUrl),
  );
  const runtimeTokenAudience = readString(
    env.FRONTDOOR_RUNTIME_TOKEN_AUDIENCE,
    readString(raw.runtimeToken?.audience, "runtime-api"),
  );
  const runtimeTokenKeysFromEnv = parseSecretMapEnv(env.FRONTDOOR_RUNTIME_TOKEN_SECRETS_JSON);
  const runtimeTokenKeysFromConfig = parseSecretMap(raw.runtimeToken?.keys);
  const runtimeTokenKeys =
    runtimeTokenKeysFromEnv.size > 0 ? runtimeTokenKeysFromEnv : runtimeTokenKeysFromConfig;
  const runtimeTokenActiveKid =
    readString(env.FRONTDOOR_RUNTIME_TOKEN_ACTIVE_KID, readString(raw.runtimeToken?.activeKid, "")) ||
    undefined;
  let runtimeTokenSecret = readString(
    env.FRONTDOOR_RUNTIME_TOKEN_SECRET,
    readString(raw.runtimeToken?.secret, ""),
  );
  if (runtimeTokenKeys.size > 0) {
    if (!runtimeTokenActiveKid) {
      throw new Error("frontdoor config missing runtimeToken.activeKid (required when runtimeToken.keys is set)");
    }
    const activeSecret = runtimeTokenKeys.get(runtimeTokenActiveKid);
    if (!activeSecret) {
      throw new Error(`frontdoor config missing runtimeToken.keys entry for activeKid="${runtimeTokenActiveKid}"`);
    }
    runtimeTokenSecret = activeSecret;
  }
  runtimeTokenSecret = assertNonEmpty(runtimeTokenSecret, "runtimeToken.secret");
  const runtimeTokenTtlSeconds = readNumber(
    env.FRONTDOOR_RUNTIME_TOKEN_TTL_SECONDS,
    readNumber(raw.runtimeToken?.ttlSeconds, 10 * 60),
  );
  const runtimeRefreshTtlSeconds = readNumber(
    env.FRONTDOOR_RUNTIME_REFRESH_TTL_SECONDS,
    readNumber(raw.runtimeToken?.refreshTtlSeconds, 30 * 24 * 60 * 60),
  );
  const rateLimits = {
    loginAttempts: parseRateLimit(raw.security?.rateLimits?.loginAttempts, {
      windowSeconds: 60,
      maxAttempts: 30,
      blockSeconds: 60,
    }),
    loginFailures: parseRateLimit(raw.security?.rateLimits?.loginFailures, {
      windowSeconds: 15 * 60,
      maxAttempts: 8,
      blockSeconds: 15 * 60,
    }),
    tokenEndpoints: parseRateLimit(raw.security?.rateLimits?.tokenEndpoints, {
      windowSeconds: 60,
      maxAttempts: 120,
      blockSeconds: 60,
    }),
    proxyRequests: parseRateLimit(raw.security?.rateLimits?.proxyRequests, {
      windowSeconds: 60,
      maxAttempts: 1000,
      blockSeconds: 30,
    }),
  };

  const tenants = parseTenants(raw.tenants);
  const { usersByUsername, usersById } = parseUsers(raw.users);
  const operatorUserIds = new Set(parseStringArray(raw.frontdoor?.operatorUserIds));
  if (operatorUserIds.size === 0) {
    const ownerUser = usersByUsername.get("owner");
    if (ownerUser?.id) {
      operatorUserIds.add(ownerUser.id);
    }
  }
  const devCreatorEmails = new Set(
    parseStringArray(raw.frontdoor?.devCreatorEmails).map((item) => item.toLowerCase()),
  );
  const inviteTtlSeconds = Math.max(
    60,
    readNumber(
      env.FRONTDOOR_INVITE_TTL_SECONDS,
      readNumber(raw.frontdoor?.inviteTtlSeconds, 7 * 24 * 60 * 60),
    ),
  );

  const oidcEnabled =
    String(env.FRONTDOOR_OIDC_ENABLED ?? String(raw.oidc?.enabled ?? "false")).toLowerCase() ===
    "true";
  const oidcProviders = parseOidcProviders(raw.oidc?.providers);
  const oidcMappings = parseOidcMappings(raw.oidc?.mappings);

  const autoProvisionEnabled =
    String(env.FRONTDOOR_AUTOPROVISION_ENABLED ?? String(raw.autoProvision?.enabled ?? "false"))
      .toLowerCase()
      .trim() === "true";
  const autoProvisionStorePathRaw = readString(
    env.FRONTDOOR_AUTOPROVISION_STORE_PATH,
    readString(raw.autoProvision?.storePath, ""),
  );
  const autoProvisionStorePath = autoProvisionStorePathRaw
    ? path.isAbsolute(autoProvisionStorePathRaw)
      ? autoProvisionStorePathRaw
      : path.resolve(configDir, autoProvisionStorePathRaw)
    : sessionStorePath
      ? path.resolve(path.dirname(sessionStorePath), "frontdoor-autoprovision.db")
      : path.resolve(configDir, "frontdoor-autoprovision.db");
  const autoProvisionProviders = parseStringArray(raw.autoProvision?.providers).map((item) =>
    item.toLowerCase(),
  );
  const autoProvisionTenantPrefix =
    readString(env.FRONTDOOR_AUTOPROVISION_TENANT_PREFIX, readString(raw.autoProvision?.tenantIdPrefix, "")) ||
    "tenant";
  const autoProvisionDefaultRoles = parseStringArray(raw.autoProvision?.defaultRoles);
  const autoProvisionDefaultScopes = parseStringArray(raw.autoProvision?.defaultScopes);
  const autoProvisionCommand =
    readString(env.FRONTDOOR_AUTOPROVISION_COMMAND, readString(raw.autoProvision?.command, "")) ||
    undefined;
  const autoProvisionCommandTimeoutMs = Math.max(
    5_000,
    readNumber(
      env.FRONTDOOR_AUTOPROVISION_COMMAND_TIMEOUT_MS,
      readNumber(raw.autoProvision?.commandTimeoutMs, 120_000),
    ),
  );

  const billingProviderRaw = readString(
    env.FRONTDOOR_BILLING_PROVIDER,
    readString(raw.billing?.provider, "none"),
  ).toLowerCase();
  const billingProvider =
    billingProviderRaw === "stripe" || billingProviderRaw === "mock" ? billingProviderRaw : "none";
  const checkoutSuccessUrl =
    readString(env.FRONTDOOR_BILLING_CHECKOUT_SUCCESS_URL, readString(raw.billing?.checkoutSuccessUrl, "")) ||
    undefined;
  const checkoutCancelUrl =
    readString(env.FRONTDOOR_BILLING_CHECKOUT_CANCEL_URL, readString(raw.billing?.checkoutCancelUrl, "")) ||
    undefined;
  const webhookSecret =
    readString(env.FRONTDOOR_BILLING_WEBHOOK_SECRET, readString(raw.billing?.webhookSecret, "")) ||
    undefined;
  const stripeSecretKey =
    readString(env.FRONTDOOR_STRIPE_SECRET_KEY, readString(raw.billing?.stripeSecretKey, "")) || undefined;
  const stripeApiBaseUrl = readString(
    env.FRONTDOOR_STRIPE_API_BASE_URL,
    readString(raw.billing?.stripeApiBaseUrl, "https://api.stripe.com"),
  );
  const stripePriceIdsByPlan = parseStringMap(raw.billing?.stripePriceIdsByPlan);
  if (billingProvider === "stripe" && !stripeSecretKey) {
    throw new Error("frontdoor config billing.provider=stripe requires FRONTDOOR_STRIPE_SECRET_KEY");
  }
  if (billingProvider !== "none" && !checkoutSuccessUrl) {
    throw new Error("frontdoor config billing checkoutSuccessUrl is required when billing is enabled");
  }
  if (billingProvider !== "none" && !checkoutCancelUrl) {
    throw new Error("frontdoor config billing checkoutCancelUrl is required when billing is enabled");
  }
  if (billingProvider !== "none" && !webhookSecret) {
    throw new Error("frontdoor config billing webhookSecret is required when billing is enabled");
  }

  // VPS access (SSH) — for app installation pipeline
  const vpsAccessSshKeyPath = readString(
    env.FRONTDOOR_VPS_SSH_KEY_PATH,
    "/root/.ssh/nexus-operator",
  );
  const vpsAccessSshUser = readString(env.FRONTDOOR_VPS_SSH_USER, "root");

  // App storage path — where app tarballs are stored on frontdoor
  const appStoragePath = readString(
    env.FRONTDOOR_APP_STORAGE_PATH,
    "/opt/nexus/frontdoor/apps",
  );

  if (tenants.size === 0 && !autoProvisionEnabled) {
    throw new Error("frontdoor config has no tenants");
  }
  if (usersByUsername.size === 0 && !oidcEnabled && !autoProvisionEnabled) {
    throw new Error("frontdoor config has no users");
  }

  return {
    host,
    port,
    baseUrl,
    internalBaseUrl,
    passwordAuthEnabled,
    sessionCookieName,
    sessionCookieDomain,
    sessionCookieSecure,
    sessionTtlSeconds,
    hstsEnabled,
    hstsMaxAgeSeconds,
    hstsIncludeSubDomains,
    hstsPreload,
    sessionStorePath,
    frontdoorStorePath,
    operatorUserIds,
    devCreatorEmails,
    inviteTtlSeconds,
    runtimeTokenIssuer,
    runtimeTokenAudience,
    runtimeTokenSecret,
    runtimeTokenActiveKid,
    runtimeTokenSecretsByKid: runtimeTokenKeys,
    runtimeTokenTtlSeconds,
    runtimeRefreshTtlSeconds,
    rateLimits,
    tenants,
    usersByUsername,
    usersById,
    oidcEnabled,
    oidcProviders,
    oidcMappings,
    autoProvision: {
      enabled: autoProvisionEnabled,
      storePath: autoProvisionStorePath,
      providers: autoProvisionProviders,
      tenantIdPrefix: autoProvisionTenantPrefix,
      defaultRoles: autoProvisionDefaultRoles,
      defaultScopes: autoProvisionDefaultScopes,
      command: autoProvisionCommand,
      commandTimeoutMs: autoProvisionCommandTimeoutMs,
    },
    billing: {
      provider: billingProvider,
      webhookSecret,
      checkoutSuccessUrl,
      checkoutCancelUrl,
      stripeSecretKey,
      stripeApiBaseUrl,
      stripePriceIdsByPlan,
    },
    vpsAccess: {
      sshKeyPath: vpsAccessSshKeyPath,
      sshUser: vpsAccessSshUser,
    },
    appStoragePath,
  };
}

export function resolveProjectRoot(): string {
  return PROJECT_ROOT;
}
