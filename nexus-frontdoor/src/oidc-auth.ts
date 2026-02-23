import { constants, createHash, createPublicKey, randomUUID, verify } from "node:crypto";
import { base64UrlDecode, randomToken } from "./crypto.js";
import type {
  FrontdoorConfig,
  OidcMapping,
  OidcTransientState,
  OidcProviderConfig,
  Principal,
} from "./types.js";

type OidcTokenResponse = {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
};

export type OidcClaims = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nbf?: number;
  nonce?: string;
  azp?: string;
};

type OidcJwtHeader = {
  alg?: string;
  typ?: string;
  kid?: string;
};

type OidcJwk = {
  kty?: string;
  kid?: string;
  alg?: string;
  use?: string;
  [key: string]: unknown;
};

type OidcJwksResponse = {
  keys?: OidcJwk[];
};

type ParsedJwt = {
  header: OidcJwtHeader;
  claims: OidcClaims;
  signingInput: string;
  signature: Buffer;
};

function parseJwt(idToken: string): ParsedJwt {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("oidc_id_token_invalid_format");
  }
  let header: OidcJwtHeader;
  let claims: OidcClaims;
  try {
    header = JSON.parse(base64UrlDecode(parts[0]).toString("utf8")) as OidcJwtHeader;
    claims = JSON.parse(base64UrlDecode(parts[1]).toString("utf8")) as OidcClaims;
  } catch {
    throw new Error("oidc_id_token_invalid_json");
  }
  if (!header || typeof header !== "object" || !claims || typeof claims !== "object") {
    throw new Error("oidc_id_token_invalid_json");
  }
  return {
    header,
    claims,
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: base64UrlDecode(parts[2]),
  };
}

function readAudience(aud: string | string[] | undefined): string[] {
  if (typeof aud === "string" && aud.trim()) {
    return [aud];
  }
  if (Array.isArray(aud)) {
    return aud.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  }
  return [];
}

function resolveVerifyAlgorithm(alg: string):
  | {
      algorithm: string;
      options?: {
        padding: number;
        saltLength: number;
      };
    }
  | null {
  switch (alg) {
    case "RS256":
      return { algorithm: "RSA-SHA256" };
    case "RS384":
      return { algorithm: "RSA-SHA384" };
    case "RS512":
      return { algorithm: "RSA-SHA512" };
    case "PS256":
      return {
        algorithm: "RSA-SHA256",
        options: {
          padding: constants.RSA_PKCS1_PSS_PADDING,
          saltLength: 32,
        },
      };
    case "PS384":
      return {
        algorithm: "RSA-SHA384",
        options: {
          padding: constants.RSA_PKCS1_PSS_PADDING,
          saltLength: 48,
        },
      };
    case "PS512":
      return {
        algorithm: "RSA-SHA512",
        options: {
          padding: constants.RSA_PKCS1_PSS_PADDING,
          saltLength: 64,
        },
      };
    default:
      return null;
  }
}

function validateStandardClaims(params: {
  claims: OidcClaims;
  provider: OidcProviderConfig;
  expectedNonce: string;
  nowMs: number;
}): void {
  const { claims, provider, expectedNonce, nowMs } = params;
  const nowSec = Math.floor(nowMs / 1000);
  const skewSec = 60;
  if (!provider.issuer?.trim()) {
    throw new Error("oidc_provider_missing_issuer");
  }
  if (claims.iss !== provider.issuer) {
    throw new Error("oidc_issuer_mismatch");
  }
  const audiences = readAudience(claims.aud);
  if (!audiences.includes(provider.clientId)) {
    throw new Error("oidc_audience_mismatch");
  }
  if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) {
    throw new Error("oidc_exp_missing");
  }
  if (claims.exp <= nowSec - skewSec) {
    throw new Error("oidc_token_expired");
  }
  if (typeof claims.iat === "number" && claims.iat > nowSec + skewSec) {
    throw new Error("oidc_iat_invalid");
  }
  if (typeof claims.nbf === "number" && claims.nbf > nowSec + skewSec) {
    throw new Error("oidc_nbf_not_yet_valid");
  }
  if (claims.nonce !== expectedNonce) {
    throw new Error("oidc_nonce_mismatch");
  }
  if (!claims.sub || typeof claims.sub !== "string") {
    throw new Error("oidc_missing_subject");
  }
  if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp && claims.azp !== provider.clientId) {
    throw new Error("oidc_azp_mismatch");
  }
}

function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

function fillTemplate(template: string, claims: OidcClaims): string {
  return template
    .replaceAll("{sub}", claims.sub ?? "")
    .replaceAll("{email}", claims.email ?? "")
    .trim();
}

function mappingMatches(mapping: OidcMapping, claims: OidcClaims): boolean {
  const match = mapping.match;
  if (!match) {
    return true;
  }
  if (match.email && claims.email?.toLowerCase() !== match.email.toLowerCase()) {
    return false;
  }
  if (match.emailDomain) {
    const email = (claims.email ?? "").toLowerCase();
    const domain = match.emailDomain.toLowerCase();
    if (!email.endsWith(`@${domain}`)) {
      return false;
    }
  }
  if (match.subPrefix) {
    if (!(claims.sub ?? "").startsWith(match.subPrefix)) {
      return false;
    }
  }
  return true;
}

export function resolvePrincipalFromMappings(params: {
  config: FrontdoorConfig;
  provider: string;
  claims: OidcClaims;
}): Principal | null {
  for (const mapping of params.config.oidcMappings) {
    if (mapping.provider !== params.provider) {
      continue;
    }
    if (!mappingMatches(mapping, params.claims)) {
      continue;
    }
    const entityTemplate = mapping.entityIdTemplate || "oidc:{sub}";
    const entityId = fillTemplate(entityTemplate, params.claims);
    if (!entityId) {
      continue;
    }
    return {
      userId: `oidc:${params.provider}:${params.claims.sub ?? randomUUID()}`,
      tenantId: mapping.tenantId,
      entityId,
      displayName: params.claims.name,
      email: params.claims.email,
      roles: [...mapping.roles],
      scopes: [...mapping.scopes],
      amr: ["oidc"],
    };
  }

  if (params.claims.email) {
    const emailLower = params.claims.email.toLowerCase();
    for (const user of params.config.usersById.values()) {
      if ((user.email ?? "").toLowerCase() !== emailLower || user.disabled) {
        continue;
      }
      return {
        userId: user.id,
        tenantId: user.tenantId,
        entityId: user.entityId,
        username: user.username,
        displayName: user.displayName ?? params.claims.name,
        email: user.email,
        roles: [...user.roles],
        scopes: [...user.scopes],
        amr: ["oidc"],
      };
    }
  }
  return null;
}

export class OidcFlowManager {
  private readonly states = new Map<string, OidcTransientState>();
  private readonly ttlMs = 10 * 60 * 1000;
  private readonly jwksCache = new Map<string, { expiresAtMs: number; keys: OidcJwk[] }>();
  private readonly jwksTtlMs = 5 * 60 * 1000;

  private async loadJwks(jwksUrl: string): Promise<OidcJwk[]> {
    const cached = this.jwksCache.get(jwksUrl);
    const now = Date.now();
    if (cached && cached.expiresAtMs > now) {
      return cached.keys;
    }
    const response = await fetch(jwksUrl);
    if (!response.ok) {
      throw new Error(`oidc_jwks_fetch_failed:${response.status}`);
    }
    const payload = (await response.json()) as OidcJwksResponse;
    const keys = Array.isArray(payload.keys) ? payload.keys : [];
    if (keys.length === 0) {
      throw new Error("oidc_jwks_empty");
    }
    this.jwksCache.set(jwksUrl, {
      expiresAtMs: now + this.jwksTtlMs,
      keys,
    });
    return keys;
  }

  private async verifyIdToken(params: {
    idToken: string;
    provider: OidcProviderConfig;
    expectedNonce: string;
  }): Promise<OidcClaims> {
    const { idToken, provider, expectedNonce } = params;
    if (!provider.jwksUrl?.trim()) {
      throw new Error("oidc_provider_missing_jwks_url");
    }
    const parsed = parseJwt(idToken);
    const alg = parsed.header.alg;
    if (!alg || typeof alg !== "string") {
      throw new Error("oidc_id_token_missing_alg");
    }
    const verifyParams = resolveVerifyAlgorithm(alg);
    if (!verifyParams) {
      throw new Error("oidc_id_token_unsupported_alg");
    }

    const jwks = await this.loadJwks(provider.jwksUrl);
    const candidates = jwks.filter((key) => {
      if (key.use && key.use !== "sig") {
        return false;
      }
      if (parsed.header.kid && key.kid !== parsed.header.kid) {
        return false;
      }
      if (key.alg && key.alg !== alg) {
        return false;
      }
      return key.kty === "RSA";
    });
    if (candidates.length === 0) {
      throw new Error("oidc_jwks_no_matching_key");
    }

    let signatureOk = false;
    for (const jwk of candidates) {
      try {
        const publicKey = createPublicKey({ key: jwk, format: "jwk" });
        signatureOk = verify(
          verifyParams.algorithm,
          Buffer.from(parsed.signingInput, "utf8"),
          verifyParams.options ? { key: publicKey, ...verifyParams.options } : publicKey,
          parsed.signature,
        );
      } catch {
        signatureOk = false;
      }
      if (signatureOk) {
        break;
      }
    }
    if (!signatureOk) {
      throw new Error("oidc_id_token_signature_invalid");
    }

    validateStandardClaims({
      claims: parsed.claims,
      provider,
      expectedNonce,
      nowMs: Date.now(),
    });
    return parsed.claims;
  }

  begin(params: {
    config: FrontdoorConfig;
    provider: string;
    returnTo?: string;
  }): { state: string; redirectUrl: string } {
    const provider = params.config.oidcProviders.get(params.provider);
    if (!provider) {
      throw new Error(`unknown oidc provider: ${params.provider}`);
    }
    const state = randomToken(24);
    const nonce = randomToken(16);
    const codeVerifier = randomToken(32);
    const codeChallenge = codeChallengeS256(codeVerifier);
    const record: OidcTransientState = {
      state,
      nonce,
      codeVerifier,
      provider: params.provider,
      createdAtMs: Date.now(),
      returnTo: params.returnTo,
    };
    this.states.set(state, record);

    const authUrl = new URL(provider.authorizeUrl);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", provider.clientId);
    authUrl.searchParams.set("redirect_uri", provider.redirectUri);
    authUrl.searchParams.set("scope", provider.scope ?? "openid profile email");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("nonce", nonce);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    return {
      state,
      redirectUrl: authUrl.toString(),
    };
  }

  async complete(params: {
    config: FrontdoorConfig;
    provider: string;
    state: string;
    code: string;
    resolvePrincipal?: (input: {
      config: FrontdoorConfig;
      provider: string;
      claims: OidcClaims;
      fallbackPrincipal: Principal | null;
    }) => Promise<Principal | null> | Principal | null;
  }): Promise<{ principal: Principal; returnTo?: string }> {
    const provider = params.config.oidcProviders.get(params.provider);
    if (!provider) {
      throw new Error(`unknown oidc provider: ${params.provider}`);
    }
    const stateRecord = this.states.get(params.state);
    if (!stateRecord || stateRecord.provider !== params.provider) {
      throw new Error("invalid_oidc_state");
    }
    if (Date.now() - stateRecord.createdAtMs > this.ttlMs) {
      this.states.delete(params.state);
      throw new Error("expired_oidc_state");
    }

    const form = new URLSearchParams();
    form.set("grant_type", "authorization_code");
    form.set("code", params.code);
    form.set("redirect_uri", provider.redirectUri);
    form.set("client_id", provider.clientId);
    if (provider.clientSecret) {
      form.set("client_secret", provider.clientSecret);
    }
    form.set("code_verifier", stateRecord.codeVerifier);

    const tokenResp = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!tokenResp.ok) {
      this.states.delete(params.state);
      throw new Error(`oidc_token_exchange_failed:${tokenResp.status}`);
    }
    const tokenJson = (await tokenResp.json()) as OidcTokenResponse;
    if (!tokenJson.id_token || typeof tokenJson.id_token !== "string") {
      this.states.delete(params.state);
      throw new Error("oidc_missing_id_token");
    }
    let claims = await this.verifyIdToken({
      idToken: tokenJson.id_token,
      provider,
      expectedNonce: stateRecord.nonce,
    });

    if (provider.userInfoUrl && tokenJson.access_token) {
      const userInfoResp = await fetch(provider.userInfoUrl, {
        headers: {
          authorization: `Bearer ${tokenJson.access_token}`,
          "content-type": "application/json",
        },
      });
      if (userInfoResp.ok) {
        const profile = (await userInfoResp.json()) as OidcClaims;
        claims = {
          ...claims,
          email: claims.email ?? profile.email,
          email_verified: claims.email_verified ?? profile.email_verified,
          name: claims.name ?? profile.name,
        };
      }
    }

    this.states.delete(params.state);

    const fallbackPrincipal = resolvePrincipalFromMappings({
      config: params.config,
      provider: params.provider,
      claims,
    });
    const principal = params.resolvePrincipal
      ? await params.resolvePrincipal({
          config: params.config,
          provider: params.provider,
          claims,
          fallbackPrincipal,
        })
      : fallbackPrincipal;
    if (!principal) {
      throw new Error("oidc_no_mapping");
    }
    return {
      principal,
      returnTo: stateRecord.returnTo,
    };
  }
}
