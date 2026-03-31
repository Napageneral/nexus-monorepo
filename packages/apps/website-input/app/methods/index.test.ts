import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { handlers } from "./index.ts";
import { openWebsiteInputDb, findInstallationById } from "./store.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "website-input-index-"));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

test("installation sender entity binding drives collect onto records journal", async () => {
  const dataDir = makeTempDir();
  const records = new Map<string, Record<string, unknown>>();
  const tokenCreates: Array<Record<string, unknown>> = [];
  const createdEntities: Array<Record<string, unknown>> = [];

  try {
    const baseCtx = {
      app: {
        id: "website-input",
        version: "0.1.0",
        dataDir,
        packageDir: dataDir,
        config: {},
        service: () => {
          throw new Error("no services");
        },
      },
      account: {
        accountId: "acct_1",
        displayName: "Account One",
      },
      invoke: async () => {
        throw new Error("unused");
      },
    };

    const operatorCtx = {
      ...baseCtx,
      params: {
        label: "Demo Install",
        siteOrigin: "https://example.com",
      },
      user: {
        userId: "operator_1",
        email: "",
        displayName: "Operator",
        role: "operator",
        accountId: "acct_1",
      },
      nex: {
        config: {
          get: async () => ({ runtime: { port: 18789, tls: { enabled: false } } }),
        },
        entities: {
          create: async (params: Record<string, unknown>) => {
            createdEntities.push(params);
            return { entity: { id: "entity_install_1" } };
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
    };

    const created = asRecord(
      await handlers["website-input.installations.create"](operatorCtx as never),
    );
    const installation = asRecord(created.installation);
    const installationId = String(installation.id ?? "");
    assert.equal(String(created.token ?? ""), "secret_token_1");
    assert.equal(installation.senderEntityId, "entity_install_1");
    assert.equal(createdEntities.length, 1);
    assert.equal(tokenCreates.length, 1);
    assert.equal(tokenCreates[0]?.entityId, "entity_install_1");

    const senderCtx = {
      ...baseCtx,
      params: {
        event: {
          website_installation_id: installationId,
          event_id: "evt_1",
          captured_at: 1700000001000,
          consent_state: "granted",
          event_name: "page_view",
          browser_id: "browser_1",
          session_id: "session_1",
          page_url: "https://example.com/landing",
          page_path: "/landing",
          host: "example.com",
          surface_id: "hero_primary",
        },
      },
      user: {
        userId: "entity_install_1",
        email: "",
        displayName: "Website Install",
        role: "operator",
        accountId: "acct_1",
      },
      nex: {
        record: {
          ingest: async (envelope: Record<string, unknown>) => {
            const routing = asRecord(envelope.routing);
            const payload = asRecord(envelope.payload);
            const externalRecordId = String(payload.external_record_id ?? "");
            records.set(externalRecordId, {
              id: externalRecordId,
              record_id: `${String(routing.platform ?? "")}:${externalRecordId}`,
              timestamp: Number(payload.timestamp ?? 0),
              received_at: 1700000002000,
              metadata: payload.metadata,
            });
            return { ok: true };
          },
        },
        records: {
          get: async ({ id }: { id: string }) => {
            const record = records.get(id);
            if (!record) {
              throw new Error("record not found");
            }
            return { record };
          },
          list: async () => ({ records: [...records.values()] }),
        },
      },
    };

    const collected = asRecord(await handlers["website-input.collect"](senderCtx as never));
    const collectedEvent = asRecord(collected.event);
    assert.equal(collected.deduped, false);
    assert.equal(collectedEvent.websiteInstallationId, installationId);
    assert.equal(collectedEvent.eventId, "evt_1");
    assert.equal(records.has(`${installationId}:evt_1`), true);

    const db = openWebsiteInputDb(dataDir);
    try {
      const persistedInstallation = findInstallationById(db, installationId);
      assert.equal(persistedInstallation?.senderEntityId, "entity_install_1");
      assert.ok((persistedInstallation?.lastSeenAt ?? 0) >= 1700000002000);
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("installation creation falls back to local account context for dogfood runtimes", async () => {
  const dataDir = makeTempDir();
  try {
    const created = asRecord(
      await handlers["website-input.installations.create"]({
        params: {
          label: "Local Install",
        },
        user: {
          userId: "operator_local",
          email: "",
          displayName: "Operator",
          role: "operator",
          accountId: "",
        },
        account: {
          accountId: "",
          displayName: "",
        },
        app: {
          id: "website-input",
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
          entities: {
            create: async () => ({ entity: { id: "entity_local_install" } }),
          },
          auth: {
            tokens: {
              create: async () => ({
                token: "local_token",
                credential: {
                  id: "token_local",
                  label: "Local Install",
                  createdAt: 1700000000000,
                  expiresAt: null,
                  revokedAt: null,
                  lastUsedAt: null,
                },
              }),
            },
          },
        },
        invoke: async () => {
          throw new Error("unused");
        },
      } as never),
    );

    assert.equal(asRecord(created.installation).accountId, "local");
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
