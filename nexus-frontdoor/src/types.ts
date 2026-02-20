export type RuntimeRole = "operator" | "member" | "customer" | "anonymous";

export type TenantConfig = {
  id: string;
  runtimeUrl: string;
};

export type UserConfig = {
  id: string;
  username: string;
  passwordHash: string;
  tenantId: string;
  entityId: string;
  displayName?: string;
  email?: string;
  roles: string[];
  scopes: string[];
  disabled?: boolean;
};

export type OidcProviderConfig = {
  clientId: string;
  clientSecret?: string;
  issuer?: string;
  jwksUrl?: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
  scope?: string;
  redirectUri: string;
};

export type OidcMapping = {
  provider: string;
  tenantId: string;
  entityIdTemplate?: string;
  roles: string[];
  scopes: string[];
  match?: {
    emailDomain?: string;
    email?: string;
    subPrefix?: string;
  };
};

export type FrontdoorConfig = {
  host: string;
  port: number;
  baseUrl: string;
  sessionCookieName: string;
  sessionTtlSeconds: number;
  sessionStorePath?: string;
  runtimeTokenIssuer: string;
  runtimeTokenAudience: string;
  runtimeTokenSecret: string;
  runtimeTokenActiveKid?: string;
  runtimeTokenSecretsByKid: Map<string, string>;
  runtimeTokenTtlSeconds: number;
  runtimeRefreshTtlSeconds: number;
  rateLimits: {
    loginAttempts: {
      windowSeconds: number;
      maxAttempts: number;
      blockSeconds: number;
    };
    loginFailures: {
      windowSeconds: number;
      maxAttempts: number;
      blockSeconds: number;
    };
    tokenEndpoints: {
      windowSeconds: number;
      maxAttempts: number;
      blockSeconds: number;
    };
    proxyRequests: {
      windowSeconds: number;
      maxAttempts: number;
      blockSeconds: number;
    };
  };
  tenants: Map<string, TenantConfig>;
  usersByUsername: Map<string, UserConfig>;
  usersById: Map<string, UserConfig>;
  oidcEnabled: boolean;
  oidcProviders: Map<string, OidcProviderConfig>;
  oidcMappings: OidcMapping[];
};

export type Principal = {
  userId: string;
  tenantId: string;
  entityId: string;
  username?: string;
  displayName?: string;
  email?: string;
  roles: string[];
  scopes: string[];
  amr: string[];
};

export type RefreshTokenRecord = {
  id: string;
  hash: string;
  createdAtMs: number;
  expiresAtMs: number;
  revokedAtMs?: number;
};

export type SessionRecord = {
  id: string;
  principal: Principal;
  createdAtMs: number;
  expiresAtMs: number;
  refreshTokens: Map<string, RefreshTokenRecord>;
};

export type RuntimeTokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  key_id?: string;
  refresh_token: string;
  refresh_expires_in: number;
  tenant_id: string;
  entity_id: string;
  scopes: string[];
  roles: string[];
};

export type OidcTransientState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  provider: string;
  createdAtMs: number;
  returnTo?: string;
};
