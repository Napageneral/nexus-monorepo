import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createHubServer } from "../src/server.mjs";

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), `glowbot-hub-${randomUUID()}-`));
}

test("hub health and managed profile operations work", async () => {
  const dataDir = makeTempDir();
  const { server } = createHubServer({ dataDir });
  const origin = await listen(server);

  try {
    const health = await fetch(`${origin}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const createResponse = await fetch(`${origin}/operations/glowbotHub.managedProfiles.create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payload: {
          managedProfileId: "glowbot-google-oauth",
          displayName: "GlowBot Google OAuth",
          appId: "glowbot",
          adapterId: "google",
          connectionProfileId: "glowbot-managed-google-oauth",
          authMethodId: "google_oauth_managed",
          flowKind: "oauth2",
          service: "google",
          authorizeUrl: "https://accounts.example.com/o/oauth2/auth",
          tokenUrl: "https://accounts.example.com/o/oauth2/token",
          clientId: "google-client-id",
          secretRef: "env:GLOWBOT_GOOGLE_CLIENT_SECRET",
          scopes: ["openid", "email"],
          authorizeParams: { access_type: "offline" }
        }
      }),
    });
    const created = await createResponse.json();
    assert.equal(created.result.managedProfile.managedProfileId, "glowbot-google-oauth");

    const listResponse = await fetch(`${origin}/operations/glowbotHub.managedProfiles.list`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: {} }),
    });
    const listed = await listResponse.json();
    assert.equal(listed.result.managedProfiles.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("frontdoor relay metadata and exchange resolve through managed profiles", async () => {
  const dataDir = makeTempDir();
  process.env.GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN = "hub-test-token";
  process.env.GLOWBOT_GOOGLE_CLIENT_SECRET = "google-secret-value";

  const providerCalls = [];
  const fetchImpl = async (input, init) => {
    providerCalls.push({ input, init });
    return new Response(
      JSON.stringify({
        access_token: "provider-access-token",
        refresh_token: "provider-refresh-token",
        expires_in: 3600,
        token_type: "Bearer",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const { server } = createHubServer({ dataDir, fetchImpl });
  const origin = await listen(server);

  try {
    await fetch(`${origin}/operations/glowbotHub.managedProfiles.create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payload: {
          managedProfileId: "glowbot-google-oauth",
          displayName: "GlowBot Google OAuth",
          appId: "glowbot",
          adapterId: "google",
          connectionProfileId: "glowbot-managed-google-oauth",
          authMethodId: "google_oauth_managed",
          flowKind: "oauth2",
          service: "google",
          authorizeUrl: "https://accounts.example.com/o/oauth2/auth",
          tokenUrl: "https://accounts.example.com/o/oauth2/token",
          clientId: "google-client-id",
          secretRef: "env:GLOWBOT_GOOGLE_CLIENT_SECRET",
          scopes: ["openid", "email", "profile"],
          authorizeParams: { access_type: "offline", prompt: "consent" }
        }
      }),
    });

    const metadata = await fetch(
      `${origin}/api/internal/frontdoor/managed-connections/profile?service=google&app_id=glowbot&adapter_id=google&connection_profile_id=glowbot-managed-google-oauth&auth_method_id=google_oauth_managed&scope=app&managed_profile_id=glowbot-google-oauth`,
      {
        headers: {
          authorization: "Bearer hub-test-token",
          "x-nexus-server-id": "server-1",
          "x-nexus-tenant-id": "tenant-1",
          "x-nexus-entity-id": "entity-1",
          "x-nexus-app-id": "glowbot",
          "x-nexus-adapter-id": "google",
          "x-nexus-connection-profile-id": "glowbot-managed-google-oauth",
          "x-nexus-auth-method-id": "google_oauth_managed",
          "x-nexus-connection-scope": "app",
          "x-nexus-managed-profile-id": "glowbot-google-oauth"
        }
      },
    );
    const metadataBody = await metadata.json();
    assert.equal(metadataBody.managedProfileId, "glowbot-google-oauth");
    assert.equal(metadataBody.authUri, "https://accounts.example.com/o/oauth2/auth");

    const exchange = await fetch(`${origin}/api/internal/frontdoor/managed-connections/profile/exchange`, {
      method: "POST",
      headers: {
        authorization: "Bearer hub-test-token",
        "content-type": "application/json",
        "x-nexus-server-id": "server-1",
        "x-nexus-tenant-id": "tenant-1",
        "x-nexus-entity-id": "entity-1",
        "x-nexus-app-id": "glowbot",
        "x-nexus-adapter-id": "google",
        "x-nexus-connection-profile-id": "glowbot-managed-google-oauth",
        "x-nexus-auth-method-id": "google_oauth_managed",
        "x-nexus-connection-scope": "app",
        "x-nexus-managed-profile-id": "glowbot-google-oauth"
      },
      body: JSON.stringify({
        service: "google",
        appId: "glowbot",
        adapter: "google",
        connectionProfileId: "glowbot-managed-google-oauth",
        authMethodId: "google_oauth_managed",
        scope: "app",
        managedProfileId: "glowbot-google-oauth",
        code: "provider-auth-code",
        state: "opaque-state",
        redirectUri: "https://tenant.example.com/auth/google/callback"
      }),
    });
    const exchangeBody = await exchange.json();
    assert.equal(exchangeBody.access_token, "provider-access-token");
    assert.equal(providerCalls.length, 1);
    assert.match(String(providerCalls[0].init.body), /client_secret=google-secret-value/);
  } finally {
    delete process.env.GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN;
    delete process.env.GLOWBOT_GOOGLE_CLIENT_SECRET;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("benchmark publication, query, and network health work", async () => {
  const dataDir = makeTempDir();
  const { server } = createHubServer({ dataDir });
  const origin = await listen(server);

  try {
    const publish = async (clinicId, impressionsToClicks) =>
      fetch(`${origin}/operations/glowbotHub.benchmarks.publishSnapshot`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          payload: {
            clinicId,
            periodStart: "2026-02-01",
            periodEnd: "2026-02-28",
            clinicProfile: {
              specialty: "med-spa",
              monthlyAdSpendBand: "10k-25k",
              patientVolumeBand: "100-250",
              locationCountBand: "single"
            },
            metrics: {
              impressions_to_clicks: impressionsToClicks,
              clicks_to_leads: 0.12
            },
            source: {
              appId: "glowbot",
              generatedAtMs: Date.now(),
              dataFreshnessMs: 3600000
            }
          }
        }),
      });

    await publish("clinic-a", 0.07);
    await publish("clinic-b", 0.09);
    await publish("clinic-c", 0.11);

    const query = await fetch(`${origin}/operations/glowbotHub.benchmarks.query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payload: {
          clinicProfile: {
            specialty: "med-spa",
            monthlyAdSpendBand: "10k-25k",
            patientVolumeBand: "100-250",
            locationCountBand: "single"
          },
          periodStart: "2026-02-01",
          periodEnd: "2026-02-28"
        }
      }),
    });
    const queryBody = await query.json();
    const record = queryBody.result.records.find((entry) => entry.metricName === "impressions_to_clicks");
    assert.equal(record.sampleSize, 3);
    assert.equal(record.source, "peer_network");
    assert.equal(record.peerMedian, 0.09);

    const health = await fetch(`${origin}/operations/glowbotHub.benchmarks.networkHealth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: {} }),
    });
    const healthBody = await health.json();
    assert.equal(healthBody.result.snapshotCount, 3);
    assert.equal(healthBody.result.activeProfileCount, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("private product control plane ingress relays only allowed clinic operations", async () => {
  const dataDir = makeTempDir();
  process.env.GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN = "hub-test-token";

  const { server } = createHubServer({ dataDir });
  const origin = await listen(server);

  try {
    await fetch(`${origin}/operations/glowbotHub.productFlags.update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payload: {
          key: "benchmarks_enabled",
          value: true,
          description: "Enable benchmark publication",
        },
      }),
    });

    const relayed = await fetch(`${origin}/api/internal/frontdoor/product-control-plane/call`, {
      method: "POST",
      headers: {
        authorization: "Bearer hub-test-token",
        "content-type": "application/json",
        "x-nexus-server-id": "server-1",
        "x-nexus-tenant-id": "tenant-1",
        "x-nexus-entity-id": "entity-1",
        "x-nexus-app-id": "glowbot",
        "x-nexus-product-operation": "glowbotHub.productFlags.list",
      },
      body: JSON.stringify({
        appId: "glowbot",
        operation: "glowbotHub.productFlags.list",
        payload: {},
      }),
    });

    assert.equal(relayed.status, 200);
    const relayedBody = await relayed.json();
    assert.equal(relayedBody.result.productFlags[0].key, "benchmarks_enabled");

    const rejected = await fetch(`${origin}/api/internal/frontdoor/product-control-plane/call`, {
      method: "POST",
      headers: {
        authorization: "Bearer hub-test-token",
        "content-type": "application/json",
        "x-nexus-server-id": "server-1",
        "x-nexus-tenant-id": "tenant-1",
        "x-nexus-entity-id": "entity-1",
        "x-nexus-app-id": "glowbot",
        "x-nexus-product-operation": "glowbotHub.managedProfiles.list",
      },
      body: JSON.stringify({
        appId: "glowbot",
        operation: "glowbotHub.managedProfiles.list",
        payload: {},
      }),
    });

    assert.equal(rejected.status, 403);
    assert.deepEqual(await rejected.json(), { error: "operation_not_allowed" });
  } finally {
    delete process.env.GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN;
    await new Promise((resolve) => server.close(resolve));
  }
});
