import { newJwtId, nowEpochSeconds, signHs256Jwt } from "./crypto.js";
import type { FrontdoorConfig, Principal } from "./types.js";

function normalizeRuntimeScopes(principal: Principal): string[] {
  const normalized = new Set<string>();
  for (const scope of principal.scopes) {
    const trimmed = scope.trim();
    if (trimmed) {
      normalized.add(trimmed);
    }
  }

  const roles = new Set(
    principal.roles.map((role) => role.trim().toLowerCase()).filter((role) => role.length > 0),
  );
  const hasOperatorLikeRole =
    roles.has("operator") || roles.has("owner") || roles.has("admin");
  const hasWildcardScope = normalized.has("*");
  const hasConcreteOperatorScope = [...normalized].some(
    (scope) => scope === "operator.admin" || scope.startsWith("operator."),
  );

  if (hasWildcardScope && hasOperatorLikeRole) {
    normalized.add("operator.admin");
  }

  if (hasWildcardScope && (hasOperatorLikeRole || hasConcreteOperatorScope)) {
    normalized.delete("*");
  }

  return [...normalized];
}

export function mintRuntimeAccessToken(params: {
  config: FrontdoorConfig;
  principal: Principal;
  sessionId: string;
  nowMs?: number;
  ttlSeconds?: number;
  clientId?: string;
}): { token: string; expiresInSeconds: number; keyId?: string } {
  const nowMs = params.nowMs ?? Date.now();
  const issuedAt = nowEpochSeconds(nowMs);
  const ttlSeconds = Math.max(30, params.ttlSeconds ?? params.config.runtimeTokenTtlSeconds);
  const expiresAt = issuedAt + ttlSeconds;
  const keyId = params.config.runtimeTokenActiveKid;
  const signingSecret =
    (keyId ? params.config.runtimeTokenSecretsByKid.get(keyId) : undefined) ??
    params.config.runtimeTokenSecret;
  const runtimeEntityId = resolveRuntimeEntityId(params.principal);
  // Map frontdoor roles to runtime roles. The runtime IAM treats "operator"
  // as the owner-level role that grants full runtime API access.
  const frontdoorRole = params.principal.roles[0] ?? "member";
  const runtimeRole = frontdoorRole === "owner" ? "operator" : frontdoorRole;
  const runtimeScopes = normalizeRuntimeScopes(params.principal);
  const claims = {
    iss: params.config.runtimeTokenIssuer,
    aud: params.config.runtimeTokenAudience,
    iat: issuedAt,
    exp: expiresAt,
    jti: newJwtId(),
    tenant_id: params.principal.tenantId,
    entity_id: runtimeEntityId,
    scopes: runtimeScopes,
    role: runtimeRole,
    roles: params.principal.roles,
    session_id: params.sessionId,
    amr: params.principal.amr,
    client_id: params.clientId ?? "nexus-frontdoor",
    display_name: params.principal.displayName,
    email: params.principal.email,
    sub: runtimeEntityId,
  };
  const token = signHs256Jwt({
    claims,
    secret: signingSecret,
    kid: keyId,
  });
  return {
    token,
    expiresInSeconds: ttlSeconds,
    keyId,
  };
}

export function resolveRuntimeEntityId(principal: Principal): string {
  const userId = principal.userId.trim();
  if (!userId) {
    return "system:frontdoor";
  }
  return `system:frontdoor:${userId}`;
}

export { normalizeRuntimeScopes };
