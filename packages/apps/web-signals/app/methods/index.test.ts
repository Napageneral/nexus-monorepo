import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { handlers } from "./index.ts";
import { findInstallationById, insertInstallation, insertToken, openWebSignalsDb } from "./store.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "web-signals-index-"));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

test("installation creation creates a web-journey connection and sender token", async () => {
  const dataDir = makeTempDir();
  const connectionCreates: Array<Record<string, unknown>> = [];
  const tokenCreates: Array<Record<string, unknown>> = [];

  try {
    const result = asRecord(
      await handlers["web-signals.installations.create"]({
        params: {
          label: "Demo Install",
          site_origin: "https://example.com",
          runtime_base_url: "http://127.0.0.1:18789",
        },
        user: {
          userId: "operator_1",
          email: "",
          displayName: "Operator",
          role: "operator",
          accountId: "acct_1",
        },
        account: {
          accountId: "acct_1",
          displayName: "Account One",
        },
        app: {
          id: "web-signals",
          version: "0.1.0",
          dataDir,
          packageDir: dataDir,
          config: {},
          service: () => {
            throw new Error("unused");
          },
        },
        nex: {
          config: {
            get: async () => ({ runtime: { port: 18789, tls: { enabled: false } } }),
          },
          adapter: {
            serve: {
              start: async () => ({ ok: true }),
            },
          },
          entities: {
            create: async () => ({ entity: { id: "entity_web_install_1" } }),
          },
          adapters: {
            connections: {
              create: async (params: Record<string, unknown>) => {
                connectionCreates.push(params);
                return { connectionId: "web_install_1" };
              },
              update: async () => ({ connectionId: "web_install_1" }),
            },
          },
          auth: {
            tokens: {
              create: async (params: Record<string, unknown>) => {
                tokenCreates.push(params);
                return {
                  token: "secret_token_1",
                  credential: {
                    id: "token_1",
                    label: "Demo Install",
                    createdAt: 1700000000000,
                    expiresAt: null,
                    revokedAt: null,
                    lastUsedAt: null,
                  },
                };
              },
              revoke: async () => ({ ok: true }),
            },
          },
        },
        invoke: async () => {
          throw new Error("unused");
        },
      } as never),
    );

    assert.equal(String(result.token ?? ""), "secret_token_1");
    assert.equal(String(result.token_id ?? ""), "token_1");
    assert.equal(connectionCreates[0]?.adapter, "web-journey");
    assert.equal(connectionCreates[0]?.authMethodId, "web_installation");
    assert.equal(connectionCreates[0]?.fields?.web_installation_id, result.installation?.web_installation_id);
    assert.equal(tokenCreates[0]?.entityId, "entity_web_install_1");
    assert.deepEqual(tokenCreates[0]?.scopes, [
      "core.apps.web-signals.web-journey.collect.write",
      "core.apps.web-signals.web-journey.collect.batch.write",
      "core.adapter.serve.admin",
    ]);

    const db = openWebSignalsDb(dataDir);
    try {
      const installation = findInstallationById(db, String(result.installation?.web_installation_id ?? ""));
      assert.equal(installation?.webJourneyConnectionId, "web_install_1");
      assert.equal(installation?.webJourneyEndpointId, "web_install_1");
      assert.equal(installation?.senderEntityId, "entity_web_install_1");
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("collector routing starts the adapter serve session and invokes web-journey", async () => {
  const dataDir = makeTempDir();
  const started: Array<Record<string, unknown>> = [];
  const invoked: Array<Record<string, unknown>> = [];

  try {
    const db = openWebSignalsDb(dataDir);
    try {
      const now = Date.now();
      db.prepare(
        `INSERT INTO web_signals_installations (
          web_installation_id, account_id, label, site_origin, status, sender_entity_id,
          created_by_entity_id, created_at, updated_at, first_seen_at, last_seen_at,
          runtime_base_url, current_token_id, current_token_created_at, current_token_expires_at,
          current_token_revoked_at, current_token_label, metadata_json, web_journey_connection_id, web_journey_endpoint_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "web_install_1",
        "acct_1",
        "Demo",
        "https://example.com",
        "active",
        "entity_web_install_1",
        "operator_1",
        now,
        now,
        now,
        now,
        "http://127.0.0.1:18789",
        "token_1",
        now,
        null,
        null,
        "Demo",
        null,
        "web_install_1",
        "web_install_1",
      );
    } finally {
      db.close();
    }

    const result = asRecord(
      await handlers["web-signals.web-journey.collect"]({
        params: {
          web_installation_id: "web_install_1",
          event: {
            eventId: "evt_1",
            capturedAt: 1700000001000,
            consentState: "granted",
            eventName: "page_view",
            browserId: "browser_1",
            sessionId: "session_1",
            pageUrl: "https://example.com/landing",
            pagePath: "/landing",
            host: "example.com",
          },
        },
        user: {
          userId: "entity_web_install_1",
          email: "",
          displayName: "Web Install",
          role: "operator",
          accountId: "acct_1",
        },
        account: {
          accountId: "acct_1",
          displayName: "Account One",
        },
        app: {
          id: "web-signals",
          version: "0.1.0",
          dataDir,
          packageDir: dataDir,
          config: {},
          service: () => {
            throw new Error("unused");
          },
        },
        nex: {
          adapter: {
            serve: {
              start: async (params: Record<string, unknown>) => {
                started.push(params);
                return { ok: true };
              },
              invoke: async (params: Record<string, unknown>) => {
                invoked.push(params);
                return {
                  ok: true,
                  payload: {
                    ok: true,
                    event: {
                      web_installation_id: "web_install_1",
                      event_id: "evt_1",
                      captured_at: 1700000001000,
                      received_at: 1700000001000,
                      consent_state: "granted",
                      event_name: "page_view",
                      browser_id: "browser_1",
                      session_id: "session_1",
                      page_url: "https://example.com/landing",
                      page_path: "/landing",
                      host: "example.com",
                    },
                    deduped: false,
                  },
                };
              },
            },
          },
        },
        invoke: async () => {
          throw new Error("unused");
        },
      } as never),
    );

    assert.equal(started[0]?.adapter, "web-journey");
    assert.equal(started[0]?.connection_id, "web_install_1");
    assert.equal(invoked[0]?.endpoint_id, "web_install_1");
    assert.equal(invoked[0]?.command, "collect");
    assert.equal(asRecord(invoked[0]?.payload).web_event ? true : false, true);
    assert.equal(asRecord(asRecord(invoked[0]?.payload).web_event).web_installation_id, "web_install_1");
    assert.equal(asRecord(asRecord(invoked[0]?.payload).web_event).event_id, "evt_1");
    assert.equal(asRecord(asRecord(invoked[0]?.payload).web_event).event_name, "page_view");
    assert.equal(asRecord(asRecord(invoked[0]?.payload).web_event).captured_at, 1700000001000);
    assert.equal(asRecord(result.event).event_id, "evt_1");
    assert.equal(result.deduped, false);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("installation delete revokes active tokens and removes the installation", async () => {
  const dataDir = makeTempDir();
  const revoked: string[] = [];

  try {
    const db = openWebSignalsDb(dataDir);
    try {
      const now = Date.now();
      insertInstallation(db, {
        webInstallationId: "web_install_delete",
        accountId: "acct_1",
        label: "Delete Me",
        siteOrigin: "https://www.moonsleep.co",
        webJourneyConnectionId: "journey_1",
        webJourneyEndpointId: "journey_1",
        status: "active",
        senderEntityId: "entity_delete_1",
        createdByEntityId: "operator_1",
        createdAt: now,
        updatedAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
        runtimeBaseUrl: "https://t-e86786c3-537.nexushub.sh",
        currentTokenId: "token_current",
        currentTokenCreatedAt: now,
        currentTokenExpiresAt: null,
        currentTokenRevokedAt: null,
        currentTokenLabel: "Delete Me",
        metadata: null,
      });
      insertToken(db, {
        id: "row_1",
        webInstallationId: "web_install_delete",
        tokenId: "token_current",
        label: "Delete Me",
        createdByEntityId: "operator_1",
        createdAt: now,
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        metadata: null,
      });
      insertToken(db, {
        id: "row_2",
        webInstallationId: "web_install_delete",
        tokenId: "token_old",
        label: "Old",
        createdByEntityId: "operator_1",
        createdAt: now - 1000,
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        metadata: null,
      });
    } finally {
      db.close();
    }

    const result = asRecord(
      await handlers["web-signals.installations.delete"]({
        params: {
          web_installation_id: "web_install_delete",
        },
        user: {
          userId: "operator_1",
          email: "",
          displayName: "Operator",
          role: "operator",
          accountId: "acct_1",
        },
        account: {
          accountId: "acct_1",
          displayName: "Account One",
        },
        app: {
          id: "web-signals",
          version: "0.1.2",
          dataDir,
          packageDir: dataDir,
          config: {},
          service: () => {
            throw new Error("unused");
          },
        },
        nex: {
          auth: {
            tokens: {
              revoke: async ({ id }: { id: string }) => {
                revoked.push(id);
                return { ok: true };
              },
            },
          },
        },
        invoke: async () => {
          throw new Error("unused");
        },
      } as never),
    );

    assert.deepEqual(revoked.sort(), ["token_current", "token_old"]);
    assert.equal(Array.isArray(result.revoked_token_ids), true);

    const verificationDb = openWebSignalsDb(dataDir);
    try {
      assert.equal(findInstallationById(verificationDb, "web_install_delete"), null);
      const tokenCount = verificationDb
        .prepare("SELECT COUNT(*) AS count FROM web_signals_tokens WHERE web_installation_id = ?")
        .get("web_install_delete") as { count: number };
      assert.equal(tokenCount.count, 0);
    } finally {
      verificationDb.close();
    }
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("event inspection reads records instead of local event cache", async () => {
  const dataDir = makeTempDir();

  try {
    const db = openWebSignalsDb(dataDir);
    try {
      const now = Date.now();
      db.prepare(
        `INSERT INTO web_signals_installations (
          web_installation_id, account_id, label, site_origin, status, sender_entity_id,
          created_by_entity_id, created_at, updated_at, first_seen_at, last_seen_at,
          runtime_base_url, current_token_id, current_token_created_at, current_token_expires_at,
          current_token_revoked_at, current_token_label, metadata_json, web_journey_connection_id, web_journey_endpoint_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "web_install_1",
        "acct_1",
        "Demo",
        "https://example.com",
        "active",
        "entity_web_install_1",
        "operator_1",
        now,
        now,
        now,
        now,
        "http://127.0.0.1:18789",
        "token_1",
        now,
        null,
        null,
        "Demo",
        null,
        "web_install_1",
        "web_install_1",
      );
    } finally {
      db.close();
    }

    const record = {
      id: "web_install_1:evt_1",
      record_id: "web-journey:web_install_1:evt_1",
      timestamp: 1700000001000,
      received_at: 1700000002000,
        metadata: {
          web_installation_id: "web_install_1",
          web_event: {
            web_installation_id: "web_install_1",
            event_id: "evt_1",
            captured_at: 1700000001000,
            received_at: 1700000002000,
            consent_state: "granted",
            event_name: "handoff_start",
            browser_id: "browser_1",
            session_id: "session_1",
            page_url: "https://example.com/contact",
            page_path: "/contact",
            host: "example.com",
            bridge_surface: "form",
            handoff_id: "handoff_1",
            form_id: "form_1",
          },
        },
      };

    const listResult = asRecord(
      await handlers["web-signals.events.list"]({
        params: {
          web_installation_id: "web_install_1",
          session_id: "session_1",
        },
        user: {
          userId: "operator_1",
          email: "",
          displayName: "Operator",
          role: "operator",
          accountId: "acct_1",
        },
        account: {
          accountId: "acct_1",
          displayName: "Account One",
        },
        app: {
          id: "web-signals",
          version: "0.1.0",
          dataDir,
          packageDir: dataDir,
          config: {},
          service: () => {
            throw new Error("unused");
          },
        },
        nex: {
          records: {
            list: async () => ({ payload: { records: [record] } }),
          },
        },
        invoke: async () => {
          throw new Error("unused");
        },
      } as never),
    );

    assert.equal(asRecord(listResult.events[0]).event_id, "evt_1");
    assert.equal(asRecord(listResult.events[0]).event_name, "handoff_start");

    const getResult = asRecord(
      await handlers["web-signals.events.get"]({
        params: {
          web_installation_id: "web_install_1",
          event_id: "evt_1",
        },
        user: {
          userId: "operator_1",
          email: "",
          displayName: "Operator",
          role: "operator",
          accountId: "acct_1",
        },
        account: {
          accountId: "acct_1",
          displayName: "Account One",
        },
        app: {
          id: "web-signals",
          version: "0.1.0",
          dataDir,
          packageDir: dataDir,
          config: {},
          service: () => {
            throw new Error("unused");
          },
        },
        nex: {
          records: {
            get: async () => ({ payload: { record } }),
          },
        },
        invoke: async () => {
          throw new Error("unused");
        },
      } as never),
    );

    assert.equal(asRecord(getResult.event).event_id, "evt_1");
    assert.equal(asRecord(getResult.event).event_name, "handoff_start");
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
