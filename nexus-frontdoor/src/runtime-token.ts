import { newJwtId, nowEpochSeconds, signHs256Jwt } from "./crypto.js";
import type { FrontdoorConfig, Principal } from "./types.js";

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
  const claims = {
    iss: params.config.runtimeTokenIssuer,
    aud: params.config.runtimeTokenAudience,
    iat: issuedAt,
    exp: expiresAt,
    jti: newJwtId(),
    tenant_id: params.principal.tenantId,
    entity_id: params.principal.entityId,
    scopes: params.principal.scopes,
    role: params.principal.roles[0] ?? "member",
    roles: params.principal.roles,
    session_id: params.sessionId,
    amr: params.principal.amr,
    client_id: params.clientId ?? "nexus-frontdoor",
    display_name: params.principal.displayName,
    email: params.principal.email,
    sub: params.principal.entityId,
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
