import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  findInstallationById,
  insertInstallation,
  listInstallations,
  openWebSignalsDb,
  updateInstallation,
} from "./store.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "web-signals-store-"));
}

test("openWebSignalsDb initializes the schema and stores installations", () => {
  const dataDir = makeTempDir();
  try {
    const db = openWebSignalsDb(dataDir);
    try {
      const now = Date.now();
      const webInstallationId = randomUUID();
      insertInstallation(db, {
        webInstallationId,
        accountId: "acct_1",
        label: "Alpha",
        siteOrigin: "https://example.com",
        webJourneyConnectionId: "web_install_1",
        webJourneyEndpointId: "web_install_1",
        status: "active",
        senderEntityId: "ent_sender_1",
        createdByEntityId: "ent_1",
        createdAt: now,
        updatedAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
        runtimeBaseUrl: "http://127.0.0.1:18789",
        metadata: { source: "test" },
      });

      const installation = findInstallationById(db, webInstallationId);
      assert.ok(installation);
      assert.equal(installation?.label, "Alpha");
      assert.equal(installation?.senderEntityId, "ent_sender_1");
      assert.equal(installation?.webJourneyConnectionId, "web_install_1");
      assert.equal(listInstallations(db, { accountId: "acct_1" }).length, 1);
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("updateInstallation persists runtime base url and adapter binding changes", () => {
  const dataDir = makeTempDir();
  try {
    const db = openWebSignalsDb(dataDir);
    try {
      const now = Date.now();
      const webInstallationId = randomUUID();
      insertInstallation(db, {
        webInstallationId,
        accountId: "acct_1",
        label: "Alpha",
        siteOrigin: "https://example.com",
        webJourneyConnectionId: "web_install_1",
        webJourneyEndpointId: "web_install_1",
        status: "active",
        senderEntityId: "ent_sender_1",
        createdByEntityId: "ent_1",
        createdAt: now,
        updatedAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
        runtimeBaseUrl: "http://127.0.0.1:18789",
      });

      updateInstallation(db, webInstallationId, {
        runtimeBaseUrl: "https://runtime.example.com",
        webJourneyConnectionId: "web_install_2",
        webJourneyEndpointId: "web_install_2",
      });

      const installation = findInstallationById(db, webInstallationId);
      assert.equal(installation?.runtimeBaseUrl, "https://runtime.example.com");
      assert.equal(installation?.webJourneyConnectionId, "web_install_2");
      assert.equal(installation?.webJourneyEndpointId, "web_install_2");
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
