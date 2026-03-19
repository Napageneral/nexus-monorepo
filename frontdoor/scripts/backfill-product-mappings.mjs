#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fail(message) {
  process.stderr.write(`backfill-product-mappings: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    apply: false,
    frontdoorDbPath: "",
    autoprovisionDbPath: "",
    configPath: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      opts.apply = true;
      continue;
    }
    if (arg === "--frontdoor-db") {
      opts.frontdoorDbPath = text(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--autoprovision-db") {
      opts.autoprovisionDbPath = text(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--config") {
      opts.configPath = text(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "Usage: node scripts/backfill-product-mappings.mjs [options]",
          "",
          "Options:",
          "  --frontdoor-db <path>      Path to frontdoor sqlite db",
          "  --autoprovision-db <path>   Path to frontdoor autoprovision sqlite db",
          "  --config <path>             Path to frontdoor config json (default: config/frontdoor.config.json)",
          "  --apply                     Apply updates (default is dry-run)",
          "  --help                      Show this help",
          "",
          "Resolution order for DB paths:",
          "  frontdoor db: --frontdoor-db, FRONTDOOR_STORE_PATH, config.frontdoor.storePath,",
          "                fallback near session store as frontdoor.db",
          "  autoprovision db: --autoprovision-db, FRONTDOOR_AUTOPROVISION_STORE_PATH, config.autoProvision.storePath",
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    fail(`unknown argument: ${arg}`);
  }
  return opts;
}

function resolveConfigPath(explicitPath) {
  const override = text(explicitPath) || text(process.env.FRONTDOOR_CONFIG_PATH);
  if (override) {
    return path.resolve(override);
  }
  return path.resolve(process.cwd(), "config", "frontdoor.config.json");
}

function readConfig(configPath) {
  if (!configPath || !fs.existsSync(configPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    fail(`failed to parse config at ${configPath}: ${String(error)}`);
  }
}

function resolveFrontdoorDbPath(options, configPath, config) {
  const fromArg = text(options.frontdoorDbPath);
  if (fromArg) {
    return path.resolve(fromArg);
  }
  const fromEnv = text(process.env.FRONTDOOR_STORE_PATH);
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  const configDir = path.dirname(configPath);
  const fromConfig = text(config?.frontdoor?.storePath);
  if (fromConfig) {
    return path.isAbsolute(fromConfig) ? fromConfig : path.resolve(configDir, fromConfig);
  }
  const sessionStorePath = text(config?.session?.storePath);
  if (sessionStorePath) {
    const resolved = path.isAbsolute(sessionStorePath)
      ? sessionStorePath
      : path.resolve(configDir, sessionStorePath);
    return path.resolve(path.dirname(resolved), "frontdoor.db");
  }
  return path.resolve(configDir, "frontdoor.db");
}

function resolveAutoprovisionDbPath(options, configPath, config) {
  const fromArg = text(options.autoprovisionDbPath);
  if (fromArg) {
    return path.resolve(fromArg);
  }
  const fromEnv = text(process.env.FRONTDOOR_AUTOPROVISION_STORE_PATH);
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  const configDir = path.dirname(configPath);
  const fromConfig = text(config?.autoProvision?.storePath);
  if (fromConfig) {
    return path.isAbsolute(fromConfig) ? fromConfig : path.resolve(configDir, fromConfig);
  }
  return "";
}

function safeRows(db, sql, values = []) {
  try {
    return db.prepare(sql).all(...values);
  } catch {
    return [];
  }
}

function inferProductFromWorkspaceId(workspaceId) {
  const normalized = text(workspaceId).toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized.startsWith("tenant-glowbot-") || normalized.includes("-glowbot-")) {
    return "glowbot";
  }
  if (normalized.startsWith("tenant-spike-") || normalized.includes("-spike-")) {
    return "spike";
  }
  return "";
}

function computeBackfillPlan(params) {
  const { workspaceRows, defaultMembershipRows, mappingRows } = params;
  const now = Date.now();
  const workspacesById = new Map(
    workspaceRows.map((row) => [
      String(row.workspace_id),
      {
        workspace_id: String(row.workspace_id),
        product_id: row.product_id == null ? null : String(row.product_id),
      },
    ]),
  );
  const defaultWorkspaceByUser = new Map();
  for (const row of defaultMembershipRows) {
    const userId = text(row.user_id);
    const workspaceId = text(row.workspace_id);
    if (!userId || !workspaceId) {
      continue;
    }
    if (!workspacesById.has(workspaceId)) {
      continue;
    }
    if (!defaultWorkspaceByUser.has(userId)) {
      defaultWorkspaceByUser.set(userId, workspaceId);
    }
  }

  const actions = [];
  const unresolved = [];
  const effectiveMappings = [];

  for (const row of mappingRows) {
    const userId = text(row.user_id);
    const productId = text(row.product_id).toLowerCase();
    const tenantId = text(row.tenant_id);
    if (!userId || !productId || !tenantId) {
      continue;
    }
    if (workspacesById.has(tenantId)) {
      effectiveMappings.push({ user_id: userId, product_id: productId, tenant_id: tenantId });
      continue;
    }
    const fallbackWorkspaceId = defaultWorkspaceByUser.get(userId) || "";
    if (!fallbackWorkspaceId || !workspacesById.has(fallbackWorkspaceId)) {
      unresolved.push({
        type: "stale_mapping_unresolved",
        user_id: userId,
        product_id: productId,
        tenant_id: tenantId,
        reason: "tenant_missing_and_no_default_workspace",
      });
      continue;
    }
    actions.push({
      type: "repair_user_product_mapping",
      user_id: userId,
      product_id: productId,
      from_tenant_id: tenantId,
      to_tenant_id: fallbackWorkspaceId,
      updated_at_ms: now,
    });
    effectiveMappings.push({ user_id: userId, product_id: productId, tenant_id: fallbackWorkspaceId });
  }

  const productsByWorkspace = new Map();
  for (const mapping of effectiveMappings) {
    const workspaceId = mapping.tenant_id;
    if (!productsByWorkspace.has(workspaceId)) {
      productsByWorkspace.set(workspaceId, new Set());
    }
    productsByWorkspace.get(workspaceId).add(mapping.product_id);
  }

  for (const workspace of workspacesById.values()) {
    const currentProduct = workspace.product_id ? workspace.product_id.toLowerCase() : null;
    const productSet = productsByWorkspace.get(workspace.workspace_id) || new Set();
    const mappedProducts = [...productSet.values()];

    if (!currentProduct) {
      if (mappedProducts.length === 1) {
        actions.push({
          type: "backfill_workspace_product_id",
          workspace_id: workspace.workspace_id,
          from_product_id: null,
          to_product_id: mappedProducts[0],
          reason: "single_mapped_product",
          updated_at_ms: now,
        });
        continue;
      }
      if (mappedProducts.length > 1) {
        unresolved.push({
          type: "workspace_product_ambiguous",
          workspace_id: workspace.workspace_id,
          mapped_products: mappedProducts,
          reason: "multiple_products_mapped_to_workspace",
        });
        continue;
      }
      const inferred = inferProductFromWorkspaceId(workspace.workspace_id);
      if (inferred) {
        actions.push({
          type: "backfill_workspace_product_id",
          workspace_id: workspace.workspace_id,
          from_product_id: null,
          to_product_id: inferred,
          reason: "workspace_id_prefix_inference",
          updated_at_ms: now,
        });
      }
      continue;
    }

    if (mappedProducts.length === 1 && mappedProducts[0] !== currentProduct) {
      actions.push({
        type: "realign_workspace_product_id",
        workspace_id: workspace.workspace_id,
        from_product_id: currentProduct,
        to_product_id: mappedProducts[0],
        reason: "single_mapped_product_mismatch",
        updated_at_ms: now,
      });
      continue;
    }
    if (mappedProducts.length > 1 && !productSet.has(currentProduct)) {
      unresolved.push({
        type: "workspace_product_mismatch_shared_workspace",
        workspace_id: workspace.workspace_id,
        current_product_id: currentProduct,
        mapped_products: mappedProducts,
        reason: "current_workspace_product_not_present_in_mappings",
      });
    }
  }

  return { actions, unresolved };
}

function applyPlan(params) {
  const { workspaceDb, autoprovisionDb, actions } = params;
  let applied = 0;
  for (const action of actions) {
    if (action.type === "repair_user_product_mapping") {
      autoprovisionDb
        .prepare(
          `
          UPDATE frontdoor_user_product_tenants
          SET tenant_id = ?, updated_at_ms = ?
          WHERE user_id = ? AND product_id = ?
        `,
        )
        .run(action.to_tenant_id, action.updated_at_ms, action.user_id, action.product_id);
      applied += 1;
      continue;
    }
    if (action.type === "backfill_workspace_product_id" || action.type === "realign_workspace_product_id") {
      workspaceDb
        .prepare(
          `
          UPDATE frontdoor_workspaces
          SET product_id = ?, updated_at_ms = ?
          WHERE workspace_id = ?
        `,
        )
        .run(action.to_product_id, action.updated_at_ms, action.workspace_id);
      workspaceDb
        .prepare(
          `
          UPDATE frontdoor_workspace_billing
          SET product_id = COALESCE(product_id, ?), updated_at_ms = ?
          WHERE workspace_id = ?
        `,
        )
        .run(action.to_product_id, action.updated_at_ms, action.workspace_id);
      applied += 1;
    }
  }
  return applied;
}

function summarizeActions(actions) {
  const counts = new Map();
  for (const action of actions) {
    const key = action.type;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const configPath = resolveConfigPath(options.configPath);
  const config = readConfig(configPath);
  const workspaceDbPath = resolveFrontdoorDbPath(options, configPath, config);
  const autoprovisionDbPath = resolveAutoprovisionDbPath(options, configPath, config);

  if (!workspaceDbPath || !fs.existsSync(workspaceDbPath)) {
    fail(`workspace db not found: ${workspaceDbPath || "<empty>"}`);
  }
  if (!autoprovisionDbPath || !fs.existsSync(autoprovisionDbPath)) {
    fail(
      `autoprovision db not found: ${autoprovisionDbPath || "<empty>"} (set --autoprovision-db or FRONTDOOR_AUTOPROVISION_STORE_PATH)`,
    );
  }

  const workspaceDb = new DatabaseSync(workspaceDbPath);
  const autoprovisionDb = new DatabaseSync(autoprovisionDbPath);
  try {
    const workspaceRows = safeRows(
      workspaceDb,
      `
      SELECT workspace_id, product_id
      FROM frontdoor_workspaces
      ORDER BY workspace_id
    `,
    );
    const defaultMembershipRows = safeRows(
      workspaceDb,
      `
      SELECT user_id, workspace_id
      FROM frontdoor_workspace_memberships
      WHERE is_default = 1
      ORDER BY user_id
    `,
    );
    const mappingRows = safeRows(
      autoprovisionDb,
      `
      SELECT user_id, product_id, tenant_id
      FROM frontdoor_user_product_tenants
      ORDER BY user_id, product_id
    `,
    );
    const { actions, unresolved } = computeBackfillPlan({
      workspaceRows,
      defaultMembershipRows,
      mappingRows,
    });

    let applied = 0;
    if (options.apply && actions.length > 0) {
      workspaceDb.exec("BEGIN IMMEDIATE");
      autoprovisionDb.exec("BEGIN IMMEDIATE");
      try {
        applied = applyPlan({ workspaceDb, autoprovisionDb, actions });
        workspaceDb.exec("COMMIT");
        autoprovisionDb.exec("COMMIT");
      } catch (error) {
        try {
          workspaceDb.exec("ROLLBACK");
        } catch {}
        try {
          autoprovisionDb.exec("ROLLBACK");
        } catch {}
        throw error;
      }
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          mode: options.apply ? "apply" : "dry-run",
          workspace_db: workspaceDbPath,
          autoprovision_db: autoprovisionDbPath,
          scanned: {
            workspace_count: workspaceRows.length,
            default_membership_count: defaultMembershipRows.length,
            user_product_mapping_count: mappingRows.length,
          },
          action_counts: summarizeActions(actions),
          actions,
          unresolved,
          applied_actions: applied,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    workspaceDb.close();
    autoprovisionDb.close();
  }
}

main();
