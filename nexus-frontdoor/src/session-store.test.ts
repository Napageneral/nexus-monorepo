import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { SessionStore } from "./session-store.js";
import type { Principal } from "./types.js";

const pathsToCleanup = new Set<string>();

const principal: Principal = {
  userId: "user-owner",
  tenantId: "tenant-dev",
  entityId: "entity-owner",
  username: "owner",
  roles: ["operator"],
  scopes: ["*"],
  amr: ["pwd"],
};

afterEach(async () => {
  for (const cleanupPath of pathsToCleanup) {
    await rm(cleanupPath, { force: true, recursive: true });
    pathsToCleanup.delete(cleanupPath);
  }
});

describe("session store", () => {
  it("persists sessions and refresh tokens in sqlite across restarts", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nexus-frontdoor-session-store-"));
    pathsToCleanup.add(tempDir);
    const sqlitePath = path.join(tempDir, "sessions.db");

    const firstStore = new SessionStore(3_600, 86_400, { sqlitePath });
    const session = firstStore.createSession(principal);
    const refresh = firstStore.issueRefreshToken(session.id);
    firstStore.close();

    const secondStore = new SessionStore(3_600, 86_400, { sqlitePath });
    const loadedSession = secondStore.getSession(session.id);
    expect(loadedSession).not.toBeNull();
    expect(loadedSession?.principal.entityId).toBe("entity-owner");

    const rotated = secondStore.rotateRefreshToken(refresh);
    expect(rotated).not.toBeNull();
    expect(rotated?.nextRefreshToken).toBeTruthy();
    expect(rotated?.nextRefreshToken).not.toBe(refresh);

    const revoked = secondStore.revokeRefreshToken(String(rotated?.nextRefreshToken));
    expect(revoked).toBe(true);
    const refreshAfterRevoke = secondStore.rotateRefreshToken(String(rotated?.nextRefreshToken));
    expect(refreshAfterRevoke).toBeNull();
    secondStore.close();
  });
});
