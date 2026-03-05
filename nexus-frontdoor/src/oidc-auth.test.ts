import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OidcFlowManager } from "./oidc-auth.js";
import type { FrontdoorConfig } from "./types.js";

type TestKeyPair = {
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];
  publicJwk: Record<string, unknown>;
};

function buildKeyPair(kid: string): TestKeyPair {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = pair.publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  return {
    privateKey: pair.privateKey,
    publicJwk: {
      ...publicJwk,
      kid,
      use: "sig",
      alg: "RS256",
    },
  };
}

function signRs256Jwt(params: {
  privateKey: TestKeyPair["privateKey"];
  kid: string;
  claims: Record<string, unknown>;
}): string {
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: params.kid,
  };
  const headerPart = Buffer.from(JSON.stringify(header), "utf8").toString("base64url");
  const payloadPart = Buffer.from(JSON.stringify(params.claims), "utf8").toString("base64url");
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput, "utf8"), params.privateKey).toString(
    "base64url",
  );
  return `${signingInput}.${signature}`;
}

function baseConfig(): FrontdoorConfig {
  return {
    host: "127.0.0.1",
    port: 4789,
    baseUrl: "http://127.0.0.1:4789",
    sessionCookieName: "nexus_fd_session",
    sessionTtlSeconds: 3600,
    workspaceOwnerUserIds: new Set(),
    workspaceDevCreatorEmails: new Set(),
    workspaceInviteTtlSeconds: 7 * 24 * 60 * 60,
    runtimeTokenIssuer: "https://frontdoor.test",
    runtimeTokenAudience: "control-plane",
    runtimeTokenSecret: "frontdoor-secret",
    runtimeTokenSecretsByKid: new Map(),
    runtimeTokenTtlSeconds: 600,
    runtimeRefreshTtlSeconds: 86_400,
    rateLimits: {
      loginAttempts: { windowSeconds: 60, maxAttempts: 30, blockSeconds: 60 },
      loginFailures: { windowSeconds: 900, maxAttempts: 8, blockSeconds: 900 },
      tokenEndpoints: { windowSeconds: 60, maxAttempts: 120, blockSeconds: 60 },
      proxyRequests: { windowSeconds: 60, maxAttempts: 1000, blockSeconds: 30 },
    },
    tenants: new Map([
      [
        "tenant-dev",
        {
          id: "tenant-dev",
          runtimeUrl: "http://127.0.0.1:18789",
          runtimePublicBaseUrl: "http://127.0.0.1:18789",
        },
      ],
    ]),
    usersByUsername: new Map(),
    usersById: new Map(),
    oidcEnabled: true,
    oidcProviders: new Map(),
    oidcMappings: [
      {
        provider: "mock",
        tenantId: "tenant-dev",
        entityIdTemplate: "oidc:{sub}",
        roles: ["member"],
        scopes: ["chat.send"],
        match: {
          emailDomain: "example.com",
        },
      },
    ],
    autoProvision: {
      enabled: false,
      storePath: undefined,
      providers: [],
      tenantIdPrefix: "tenant",
      defaultRoles: ["operator"],
      defaultScopes: ["operator.admin"],
      command: undefined,
      commandTimeoutMs: 120000,
    },
    billing: {
      provider: "none",
      webhookSecret: undefined,
      checkoutSuccessUrl: undefined,
      checkoutCancelUrl: undefined,
      stripeSecretKey: undefined,
      stripeApiBaseUrl: "https://api.stripe.com",
      stripePriceIdsByPlan: new Map(),
    },
    vpsAccess: {
      sshKeyPath: "/tmp/test-ssh-key",
      sshUser: "root",
    },
    appStoragePath: "/tmp/test-app-storage",
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OIDC JWK verification", () => {
  it("verifies ID token signature + claims against provider JWKs", async () => {
    const key = buildKeyPair("kid-1");
    const config = baseConfig();
    config.oidcProviders.set("mock", {
      clientId: "client-frontdoor",
      clientSecret: "secret",
      issuer: "https://issuer.example.com",
      jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
      authorizeUrl: "https://issuer.example.com/oauth2/auth",
      tokenUrl: "https://issuer.example.com/oauth2/token",
      redirectUri: "http://127.0.0.1:4789/api/auth/oidc/callback/mock",
      scope: "openid profile email",
    });

    const oidc = new OidcFlowManager();
    const started = oidc.begin({
      config,
      provider: "mock",
      returnTo: "/",
    });
    const redirect = new URL(started.redirectUrl);
    const nonce = redirect.searchParams.get("nonce");
    expect(nonce).toBeTruthy();

    const now = Math.floor(Date.now() / 1000);
    const idToken = signRs256Jwt({
      privateKey: key.privateKey,
      kid: "kid-1",
      claims: {
        iss: "https://issuer.example.com",
        aud: "client-frontdoor",
        exp: now + 300,
        iat: now - 5,
        nonce,
        sub: "user-123",
        email: "alice@example.com",
        name: "Alice",
      },
    });

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://issuer.example.com/oauth2/token") {
        return new Response(
          JSON.stringify({
            access_token: "access-token",
            id_token: idToken,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }
      if (url === "https://issuer.example.com/.well-known/jwks.json") {
        return new Response(
          JSON.stringify({
            keys: [key.publicJwk],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }
      throw new Error(`unexpected fetch url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    const completed = await oidc.complete({
      config,
      provider: "mock",
      state: started.state,
      code: "auth-code",
    });

    expect(completed.principal.tenantId).toBe("tenant-dev");
    expect(completed.principal.entityId).toBe("oidc:user-123");
    expect(completed.principal.roles).toEqual(["member"]);
    expect(completed.principal.scopes).toEqual(["chat.send"]);
    expect(completed.principal.email).toBe("alice@example.com");
    expect(completed.returnTo).toBe("/");
  });

  it("forwards product from begin state into resolvePrincipal callback and completion payload", async () => {
    const key = buildKeyPair("kid-product");
    const config = baseConfig();
    config.oidcProviders.set("mock", {
      clientId: "client-frontdoor",
      clientSecret: "secret",
      issuer: "https://issuer.example.com",
      jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
      authorizeUrl: "https://issuer.example.com/oauth2/auth",
      tokenUrl: "https://issuer.example.com/oauth2/token",
      redirectUri: "http://127.0.0.1:4789/api/auth/oidc/callback/mock",
      scope: "openid profile email",
    });

    const oidc = new OidcFlowManager();
    const started = oidc.begin({
      config,
      provider: "mock",
      returnTo: "/",
      productId: "spike",
    });
    const nonce = new URL(started.redirectUrl).searchParams.get("nonce");
    expect(nonce).toBeTruthy();
    const now = Math.floor(Date.now() / 1000);
    const idToken = signRs256Jwt({
      privateKey: key.privateKey,
      kid: "kid-product",
      claims: {
        iss: "https://issuer.example.com",
        aud: "client-frontdoor",
        exp: now + 300,
        iat: now - 5,
        nonce,
        sub: "user-xyz",
        email: "alice@example.com",
        name: "Alice",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url === "https://issuer.example.com/oauth2/token") {
          return new Response(JSON.stringify({ id_token: idToken, access_token: "at" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url === "https://issuer.example.com/.well-known/jwks.json") {
          return new Response(JSON.stringify({ keys: [key.publicJwk] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch url: ${url}`);
      }) as typeof fetch,
    );

    let seenProductId: string | undefined;
    const completed = await oidc.complete({
      config,
      provider: "mock",
      state: started.state,
      code: "auth-code",
      resolvePrincipal: ({ fallbackPrincipal, productId }) => {
        seenProductId = productId;
        return fallbackPrincipal;
      },
    });
    expect(seenProductId).toBe("spike");
    expect(completed.productId).toBe("spike");
  });

  it("rejects ID token with invalid signature", async () => {
    const signingKey = buildKeyPair("kid-1");
    const jwkKey = buildKeyPair("kid-1");
    const config = baseConfig();
    config.oidcProviders.set("mock", {
      clientId: "client-frontdoor",
      issuer: "https://issuer.example.com",
      jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
      authorizeUrl: "https://issuer.example.com/oauth2/auth",
      tokenUrl: "https://issuer.example.com/oauth2/token",
      redirectUri: "http://127.0.0.1:4789/api/auth/oidc/callback/mock",
    });

    const oidc = new OidcFlowManager();
    const started = oidc.begin({ config, provider: "mock" });
    const nonce = new URL(started.redirectUrl).searchParams.get("nonce");
    const now = Math.floor(Date.now() / 1000);
    const idToken = signRs256Jwt({
      privateKey: signingKey.privateKey,
      kid: "kid-1",
      claims: {
        iss: "https://issuer.example.com",
        aud: "client-frontdoor",
        exp: now + 300,
        iat: now - 5,
        nonce,
        sub: "user-123",
        email: "alice@example.com",
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url === "https://issuer.example.com/oauth2/token") {
          return new Response(JSON.stringify({ id_token: idToken, access_token: "at" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url === "https://issuer.example.com/.well-known/jwks.json") {
          return new Response(JSON.stringify({ keys: [jwkKey.publicJwk] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch url: ${url}`);
      }) as typeof fetch,
    );

    await expect(
      oidc.complete({
        config,
        provider: "mock",
        state: started.state,
        code: "auth-code",
      }),
    ).rejects.toThrow("oidc_id_token_signature_invalid");
  });

  it("rejects ID token nonce mismatch", async () => {
    const key = buildKeyPair("kid-1");
    const config = baseConfig();
    config.oidcProviders.set("mock", {
      clientId: "client-frontdoor",
      issuer: "https://issuer.example.com",
      jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
      authorizeUrl: "https://issuer.example.com/oauth2/auth",
      tokenUrl: "https://issuer.example.com/oauth2/token",
      redirectUri: "http://127.0.0.1:4789/api/auth/oidc/callback/mock",
    });

    const oidc = new OidcFlowManager();
    const started = oidc.begin({ config, provider: "mock" });
    const now = Math.floor(Date.now() / 1000);
    const idToken = signRs256Jwt({
      privateKey: key.privateKey,
      kid: "kid-1",
      claims: {
        iss: "https://issuer.example.com",
        aud: "client-frontdoor",
        exp: now + 300,
        iat: now - 5,
        nonce: "wrong-nonce",
        sub: "user-123",
        email: "alice@example.com",
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url === "https://issuer.example.com/oauth2/token") {
          return new Response(JSON.stringify({ id_token: idToken, access_token: "at" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url === "https://issuer.example.com/.well-known/jwks.json") {
          return new Response(JSON.stringify({ keys: [key.publicJwk] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch url: ${url}`);
      }) as typeof fetch,
    );

    await expect(
      oidc.complete({
        config,
        provider: "mock",
        state: started.state,
        code: "auth-code",
      }),
    ).rejects.toThrow("oidc_nonce_mismatch");
  });
});
