import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const scriptPath = path.resolve(process.cwd(), "scripts", "backfill-product-mappings.mjs");

function createFixtureDbs() {
  const dir = path.join(tmpdir(), `frontdoor-backfill-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  const workspaceDbPath = path.join(dir, "frontdoor.db");
  const autoprovisionDbPath = path.join(dir, "autoprovision.db");

  const workspaceDb = new DatabaseSync(workspaceDbPath);
  workspaceDb.exec(`
    CREATE TABLE frontdoor_workspaces (
      workspace_id TEXT PRIMARY KEY,
      product_id TEXT,
      updated_at_ms INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE frontdoor_workspace_memberships (
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE frontdoor_workspace_billing (
      workspace_id TEXT PRIMARY KEY,
      product_id TEXT,
      updated_at_ms INTEGER NOT NULL DEFAULT 0
    );
  `);
  workspaceDb
    .prepare("INSERT INTO frontdoor_workspaces(workspace_id, product_id, updated_at_ms) VALUES (?, ?, ?)")
    .run("tenant-shared", null, 1);
  workspaceDb
    .prepare("INSERT INTO frontdoor_workspaces(workspace_id, product_id, updated_at_ms) VALUES (?, ?, ?)")
    .run("tenant-glow", "glowbot", 1);
  workspaceDb
    .prepare("INSERT INTO frontdoor_workspace_memberships(user_id, workspace_id, is_default) VALUES (?, ?, 1)")
    .run("user-1", "tenant-shared");
  workspaceDb
    .prepare("INSERT INTO frontdoor_workspace_billing(workspace_id, product_id, updated_at_ms) VALUES (?, ?, ?)")
    .run("tenant-shared", null, 1);
  workspaceDb.close();

  const autoprovisionDb = new DatabaseSync(autoprovisionDbPath);
  autoprovisionDb.exec(`
    CREATE TABLE frontdoor_user_product_tenants (
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL DEFAULT 0,
      updated_at_ms INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(user_id, product_id)
    );
  `);
  autoprovisionDb
    .prepare(
      "INSERT INTO frontdoor_user_product_tenants(user_id, product_id, tenant_id, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?)",
    )
    .run("user-1", "spike", "tenant-missing", 1, 1);
  autoprovisionDb
    .prepare(
      "INSERT INTO frontdoor_user_product_tenants(user_id, product_id, tenant_id, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?)",
    )
    .run("user-2", "glowbot", "tenant-glow", 1, 1);
  autoprovisionDb.close();

  return { dir, workspaceDbPath, autoprovisionDbPath };
}

function runScript(args: string[]) {
  const proc = spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      FRONTDOOR_CONFIG_PATH: "",
      FRONTDOOR_STORE_PATH: "",
      FRONTDOOR_AUTOPROVISION_STORE_PATH: "",
    },
  });
  if (proc.status !== 0) {
    throw new Error(`script failed (${proc.status}): ${proc.stderr || proc.stdout}`);
  }
  return JSON.parse(proc.stdout);
}

describe("backfill-product-mappings script", () => {
  it("proposes stale mapping repair + workspace product backfill in dry-run mode", () => {
    const fixture = createFixtureDbs();
    const output = runScript([
      "--frontdoor-db",
      fixture.workspaceDbPath,
      "--autoprovision-db",
      fixture.autoprovisionDbPath,
    ]);

    expect(output.ok).toBe(true);
    expect(output.mode).toBe("dry-run");
    expect(output.applied_actions).toBe(0);
    expect(output.action_counts).toMatchObject({
      repair_user_product_mapping: 1,
      backfill_workspace_product_id: 1,
    });
  });

  it("applies stale mapping repair + workspace product backfill", () => {
    const fixture = createFixtureDbs();
    const output = runScript([
      "--frontdoor-db",
      fixture.workspaceDbPath,
      "--autoprovision-db",
      fixture.autoprovisionDbPath,
      "--apply",
    ]);

    expect(output.ok).toBe(true);
    expect(output.mode).toBe("apply");
    expect(output.applied_actions).toBe(2);

    const workspaceDb = new DatabaseSync(fixture.workspaceDbPath);
    const sharedWorkspace = workspaceDb
      .prepare("SELECT product_id FROM frontdoor_workspaces WHERE workspace_id = ?")
      .get("tenant-shared") as { product_id: string | null } | undefined;
    const sharedBilling = workspaceDb
      .prepare("SELECT product_id FROM frontdoor_workspace_billing WHERE workspace_id = ?")
      .get("tenant-shared") as { product_id: string | null } | undefined;
    workspaceDb.close();

    const autoprovisionDb = new DatabaseSync(fixture.autoprovisionDbPath);
    const repairedMapping = autoprovisionDb
      .prepare("SELECT tenant_id FROM frontdoor_user_product_tenants WHERE user_id = ? AND product_id = ?")
      .get("user-1", "spike") as { tenant_id: string } | undefined;
    autoprovisionDb.close();

    expect(sharedWorkspace?.product_id).toBe("spike");
    expect(sharedBilling?.product_id).toBe("spike");
    expect(repairedMapping?.tenant_id).toBe("tenant-shared");
  });
});
