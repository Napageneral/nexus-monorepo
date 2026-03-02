#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on("error", reject);
    process.stdin.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseCsv(input) {
  return String(input || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBool(value, fallback = false) {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) {
    return fallback;
  }
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

async function runCommand(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "pipe",
    env: process.env,
    ...options,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const exited = await new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  return {
    code: exited.code,
    signal: exited.signal,
    stdout,
    stderr,
  };
}

async function resolveControlUiRoot(repoRoot) {
  const explicit = normalizeText(process.env.FRONTDOOR_TENANT_CONTROL_UI_ROOT);
  const requireControlUi =
    normalizeText(process.env.FRONTDOOR_TENANT_REQUIRE_CONTROL_UI || "0") === "1";
  if (explicit) {
    const explicitIndex = path.join(explicit, "index.html");
    if (fs.existsSync(explicitIndex)) {
      return explicit;
    }
    if (requireControlUi) {
      throw new Error(
        `control_ui_root_missing_index:${explicitIndex}`,
      );
    }
  }

  const nexRoot = path.resolve(
    normalizeText(process.env.FRONTDOOR_TENANT_NEX_ROOT) || path.join(repoRoot, "..", "nex"),
  );
  const distRoot = path.join(nexRoot, "dist", "control-ui");
  const distIndex = path.join(distRoot, "index.html");
  if (fs.existsSync(distIndex)) {
    return distRoot;
  }

  const buildUiIfMissing =
    normalizeText(process.env.FRONTDOOR_TENANT_BUILD_UI_IF_MISSING || "1") !== "0";
  if (!buildUiIfMissing) {
    if (requireControlUi) {
      throw new Error(
        `control_ui_assets_missing:${distIndex}`,
      );
    }
    return "";
  }

  const build = await runCommand("pnpm", ["--dir", nexRoot, "ui:build"]);
  if (build.code !== 0) {
    if (requireControlUi) {
      throw new Error(
        `control_ui_build_failed:${normalizeText(build.stderr) || normalizeText(build.stdout) || "unknown"}`,
      );
    }
    return "";
  }
  if (fs.existsSync(distIndex)) {
    return distRoot;
  }
  if (requireControlUi) {
    throw new Error(
      `control_ui_build_missing_output:${distIndex}`,
    );
  }
  return "";
}

async function waitForPort(port, host = "127.0.0.1", timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const socket = net.createConnection({ port, host });
      const onDone = (value) => {
        socket.removeAllListeners();
        try {
          socket.destroy();
        } catch {
          // noop
        }
        resolve(value);
      };
      socket.once("connect", () => onDone(true));
      socket.once("error", () => onDone(false));
      socket.setTimeout(1_000, () => onDone(false));
    });
    if (ok) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function isPortFree(port, host = "127.0.0.1") {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findFreePort(start, used = new Set()) {
  const base = Math.max(1024, start);
  for (let port = base; port < base + 2000; port += 1) {
    if (used.has(port)) {
      continue;
    }
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error("no_free_port_found_for_tenant_runtime");
}

function listUsedPorts(tenantsRoot) {
  const used = new Set();
  if (!fs.existsSync(tenantsRoot)) {
    return used;
  }
  for (const entry of fs.readdirSync(tenantsRoot)) {
    const portPath = path.join(tenantsRoot, entry, "runtime.port");
    if (!fs.existsSync(portPath)) {
      continue;
    }
    const raw = fs.readFileSync(portPath, "utf8").trim();
    const port = Number(raw);
    if (Number.isFinite(port) && port > 0) {
      used.add(port);
    }
  }
  return used;
}

function renderTemplate(template, params) {
  return template
    .replaceAll("{tenant_id}", params.tenantId)
    .replaceAll("{port}", String(params.port))
    .trim();
}

function adapterBinarySpecs() {
  return [
    { id: "google-ads", platform: "google-ads", binary: "gog-ads-adapter" },
    { id: "gog-places", platform: "google-business-profile", binary: "gog-places-adapter" },
    { id: "meta-ads", platform: "meta-ads", binary: "meta-ads-adapter" },
    { id: "patient-now-emr", platform: "patient-now-emr", binary: "patient-now-emr-adapter" },
    { id: "zenoti-emr", platform: "zenoti-emr", binary: "zenoti-emr-adapter" },
    { id: "apple-maps", platform: "apple-maps", binary: "apple-maps-adapter" },
    { id: "github", platform: "github", binary: "github-adapter" },
  ];
}

function resolveAdapterBinDir(repoRoot) {
  const explicit = normalizeText(process.env.FRONTDOOR_TENANT_ADAPTER_BIN_DIR);
  if (explicit) {
    return path.resolve(explicit);
  }
  return path.join(repoRoot, "adapters");
}

function buildNexAdapterConfigYaml(entries) {
  const lines = ["adapters:"];
  for (const entry of entries) {
    lines.push(`  ${entry.id}:`);
    lines.push(`    command: ${JSON.stringify(entry.command)}`);
    lines.push(`    platform: ${JSON.stringify(entry.platform)}`);
    lines.push("    accounts: {}");
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function writeTenantAdapterConfig(params) {
  const enableAdapters = parseBool(process.env.FRONTDOOR_TENANT_ENABLE_ADAPTERS, true);
  if (!enableAdapters) {
    return {
      configPath: null,
      registered: 0,
      missing: [],
    };
  }

  const binDir = resolveAdapterBinDir(params.repoRoot);
  const entries = [];
  const missing = [];
  for (const spec of adapterBinarySpecs()) {
    const commandPath = path.join(binDir, spec.binary);
    if (!fs.existsSync(commandPath)) {
      missing.push(commandPath);
      continue;
    }
    entries.push({
      id: spec.id,
      platform: spec.platform,
      command: commandPath,
    });
  }

  if (entries.length === 0) {
    return {
      configPath: null,
      registered: 0,
      missing,
    };
  }

  fs.writeFileSync(params.configPath, buildNexAdapterConfigYaml(entries), "utf8");
  return {
    configPath: params.configPath,
    registered: entries.length,
    missing,
  };
}

async function seedIdentity({
  stateDir,
  entityId,
  displayName,
  email,
  provider,
  subject,
  roles,
}) {
  const identityDbPath = path.join(stateDir, "data", "identity.db");
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (fs.existsSync(identityDbPath)) {
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!fs.existsSync(identityDbPath)) {
    return;
  }
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    return;
  }
  const now = Date.now();
  const display = displayName || email || entityId;
  const platformId = `${provider}:${subject}`;
  const db = new DatabaseSync(identityDbPath);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    try {
      db.prepare(
        `
        INSERT INTO entities (
          id, name, type, merged_into, normalized, is_user, source,
          mention_count, first_seen, last_seen, created_at, updated_at
        ) VALUES (?, ?, 'person', NULL, ?, 1, 'imported', 0, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          normalized = excluded.normalized,
          is_user = 1,
          source = 'imported',
          last_seen = excluded.last_seen,
          updated_at = excluded.updated_at
      `,
      ).run(entityId, display, display.toLowerCase(), now, now, now, now);
    } catch {
      // Older identity schemas may not have `source`; fall back to the minimal column set.
      try {
        db.prepare(
          `
          INSERT INTO entities (
            id, name, type, merged_into, normalized, is_user,
            mention_count, first_seen, last_seen, created_at, updated_at
          ) VALUES (?, ?, 'person', NULL, ?, 1, 0, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            normalized = excluded.normalized,
            is_user = 1,
            last_seen = excluded.last_seen,
            updated_at = excluded.updated_at
        `,
        ).run(entityId, display, display.toLowerCase(), now, now, now, now);
      } catch {
        // Best-effort identity seeding only.
      }
    }

    try {
      db.prepare(
        `
        INSERT INTO contacts (
          platform, space_id, sender_id, entity_id,
          first_seen, last_seen, message_count, sender_name, avatar_url
        ) VALUES ('frontdoor_oidc', '', ?, ?, ?, ?, 0, ?, NULL)
        ON CONFLICT(platform, space_id, sender_id) DO UPDATE SET
          entity_id = excluded.entity_id,
          last_seen = excluded.last_seen,
          sender_name = COALESCE(excluded.sender_name, contacts.sender_name)
      `,
      ).run(platformId, entityId, now, now, display);
    } catch {
      // Best-effort identity seeding only.
    }

    const tags = new Set(
      Array.isArray(roles)
        ? roles
            .filter((item) => typeof item === "string" && item.trim())
            .map((item) => item.trim().toLowerCase())
        : [],
    );
    if (tags.size === 0) {
      tags.add("customer");
    }
    try {
      const insertTag = db.prepare(
        `INSERT INTO entity_tags (entity_id, tag, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(entity_id, tag) DO NOTHING`,
      );
      for (const tag of tags) {
        insertTag.run(entityId, tag, now);
      }
    } catch {
      // Best-effort identity seeding only.
    }
  } finally {
    db.close();
  }
}

async function main() {
  const raw = await readStdin();
  const payload = raw.trim() ? JSON.parse(raw) : {};
  const tenantId = normalizeText(payload.tenant_id);
  const productId = normalizeText(payload.product_id).toLowerCase();
  const provider = normalizeText(payload.provider) || "google";
  const subject = normalizeText(payload.sub);
  const entityId = normalizeText(payload.entity_id);
  const displayName = normalizeText(payload.display_name);
  const email = normalizeText(payload.email);
  const roles = Array.isArray(payload.roles)
    ? payload.roles.filter((item) => typeof item === "string" && item.trim())
    : [];
  const tokenIssuer = normalizeText(payload.runtime_token?.issuer);
  const tokenAudience = normalizeText(payload.runtime_token?.audience);
  const tokenSecret = normalizeText(payload.runtime_token?.secret);
  const dryRun = parseBool(process.env.FRONTDOOR_PROVISIONER_DRY_RUN, false);

  if (!tenantId || !subject || !entityId || !tokenSecret) {
    throw new Error("missing_required_fields");
  }

  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const tenantsRoot = path.resolve(
    normalizeText(process.env.FRONTDOOR_TENANT_ROOT) || path.join(repoRoot, ".tenants"),
  );
  const tenantRoot = path.join(tenantsRoot, tenantId);
  const stateDir = path.join(tenantRoot, "state");
  const logPath = path.join(tenantRoot, "runtime.log");
  const pidPath = path.join(tenantRoot, "runtime.pid");
  const portPath = path.join(tenantRoot, "runtime.port");
  const configPath = path.join(stateDir, "config.json");
  const nexAdapterConfigPath = path.join(stateDir, "nex.adapters.yaml");
  const nexusBin = normalizeText(process.env.FRONTDOOR_TENANT_NEXUS_BIN) || "nexus";

  const controlUiRoot = await resolveControlUiRoot(repoRoot);
  const controlUiAllowedOrigins = parseCsv(
    normalizeText(process.env.FRONTDOOR_TENANT_CONTROL_UI_ALLOWED_ORIGINS),
  );
  const basePort = Number(process.env.FRONTDOOR_TENANT_BASE_PORT || "32000");
  const controlUiConfig =
    controlUiRoot || controlUiAllowedOrigins.length > 0
      ? {
          root: controlUiRoot || undefined,
          allowedOrigins: controlUiAllowedOrigins.length > 0 ? controlUiAllowedOrigins : undefined,
        }
      : undefined;
  const enableGlowbotApp =
    normalizeText(process.env.FRONTDOOR_TENANT_ENABLE_GLOWBOT_APP || "0") === "1" ||
    normalizeText(process.env.FRONTDOOR_TENANT_ENABLE_GLOWBOT_APP || "").toLowerCase() === "true";
  const glowbotAppKindRaw = normalizeText(
    process.env.FRONTDOOR_TENANT_GLOWBOT_APP_KIND || "static",
  ).toLowerCase();
  const glowbotAppKind =
    glowbotAppKindRaw === "static" || glowbotAppKindRaw === "proxy" ? glowbotAppKindRaw : null;
  const glowbotAppRoot = normalizeText(process.env.FRONTDOOR_TENANT_GLOWBOT_APP_ROOT);
  const glowbotProxyBaseUrl = normalizeText(process.env.FRONTDOOR_TENANT_GLOWBOT_PROXY_BASE_URL);
  const allowGlowbotControlUiRootReuse = parseBool(
    process.env.FRONTDOOR_TENANT_ALLOW_GLOWBOT_CONTROL_UI_ROOT,
    false,
  );
  if (
    enableGlowbotApp &&
    !glowbotAppKind
  ) {
    throw new Error(
      "invalid_glowbot_app_kind:set FRONTDOOR_TENANT_GLOWBOT_APP_KIND to static or proxy",
    );
  }
  if (enableGlowbotApp && glowbotAppKind === "static" && !glowbotAppRoot) {
    throw new Error(
      "glowbot_static_root_missing:set FRONTDOOR_TENANT_GLOWBOT_APP_ROOT when FRONTDOOR_TENANT_GLOWBOT_APP_KIND=static",
    );
  }
  if (enableGlowbotApp && glowbotAppKind === "proxy" && !glowbotProxyBaseUrl) {
    throw new Error(
      "glowbot_proxy_base_url_missing:set FRONTDOOR_TENANT_GLOWBOT_PROXY_BASE_URL when FRONTDOOR_TENANT_GLOWBOT_APP_KIND=proxy",
    );
  }
  if (enableGlowbotApp && glowbotAppKind === "proxy" && glowbotAppRoot) {
    throw new Error(
      "glowbot_proxy_static_conflict:unset FRONTDOOR_TENANT_GLOWBOT_APP_ROOT when FRONTDOOR_TENANT_GLOWBOT_APP_KIND=proxy",
    );
  }
  if (
    enableGlowbotApp &&
    glowbotAppKind === "static" &&
    glowbotAppRoot &&
    controlUiRoot &&
    path.resolve(glowbotAppRoot) === path.resolve(controlUiRoot) &&
    !allowGlowbotControlUiRootReuse
  ) {
    throw new Error(
      "glowbot_app_root_conflicts_with_control_ui_root:set FRONTDOOR_TENANT_GLOWBOT_APP_ROOT to GlowBot app assets (not control UI) or set FRONTDOOR_TENANT_ALLOW_GLOWBOT_CONTROL_UI_ROOT=1 to override",
    );
  }
  const glowbotAppConfig = enableGlowbotApp
    ? {
        enabled: true,
        displayName: "GlowBot",
        entryPath: "/app/glowbot/",
        apiBase: "/api/glowbot",
        kind: glowbotAppKind,
        ...(glowbotAppKind === "static"
          ? { root: glowbotAppRoot }
          : {
              proxy: {
                baseUrl: glowbotProxyBaseUrl,
              },
            }),
      }
    : undefined;
  const enableSpikeApp = parseBool(
    process.env.FRONTDOOR_TENANT_ENABLE_SPIKE_APP,
    productId === "spike",
  );
  const spikeAppKindRaw = normalizeText(
    process.env.FRONTDOOR_TENANT_SPIKE_APP_KIND || "proxy",
  ).toLowerCase();
  const spikeAppKind = spikeAppKindRaw === "static" || spikeAppKindRaw === "proxy" ? spikeAppKindRaw : null;
  const spikeAppRoot = normalizeText(process.env.FRONTDOOR_TENANT_SPIKE_APP_ROOT);
  const spikeProxyBaseUrl =
    normalizeText(process.env.FRONTDOOR_TENANT_SPIKE_PROXY_BASE_URL) ||
    normalizeText(process.env.FRONTDOOR_SPIKE_RUNTIME_PUBLIC_BASE_URL);
  const allowSpikeControlUiRootReuse = parseBool(
    process.env.FRONTDOOR_TENANT_ALLOW_SPIKE_CONTROL_UI_ROOT,
    false,
  );
  if (enableSpikeApp && !spikeAppKind) {
    throw new Error(
      "invalid_spike_app_kind:set FRONTDOOR_TENANT_SPIKE_APP_KIND to static or proxy",
    );
  }
  if (enableSpikeApp && spikeAppKind === "static" && !spikeAppRoot) {
    throw new Error(
      "spike_static_root_missing:set FRONTDOOR_TENANT_SPIKE_APP_ROOT when FRONTDOOR_TENANT_SPIKE_APP_KIND=static",
    );
  }
  if (enableSpikeApp && spikeAppKind === "proxy" && !spikeProxyBaseUrl) {
    throw new Error(
      "spike_proxy_base_url_missing:set FRONTDOOR_TENANT_SPIKE_PROXY_BASE_URL (or FRONTDOOR_SPIKE_RUNTIME_PUBLIC_BASE_URL) when FRONTDOOR_TENANT_SPIKE_APP_KIND=proxy",
    );
  }
  if (enableSpikeApp && spikeAppKind === "proxy" && spikeAppRoot) {
    throw new Error(
      "spike_proxy_static_conflict:unset FRONTDOOR_TENANT_SPIKE_APP_ROOT when FRONTDOOR_TENANT_SPIKE_APP_KIND=proxy",
    );
  }
  if (
    enableSpikeApp &&
    spikeAppKind === "static" &&
    spikeAppRoot &&
    controlUiRoot &&
    path.resolve(spikeAppRoot) === path.resolve(controlUiRoot) &&
    !allowSpikeControlUiRootReuse
  ) {
    throw new Error(
      "spike_app_root_conflicts_with_control_ui_root:set FRONTDOOR_TENANT_SPIKE_APP_ROOT to Spike app assets (not control UI) or set FRONTDOOR_TENANT_ALLOW_SPIKE_CONTROL_UI_ROOT=1 to override",
    );
  }
  const spikeAppConfig = enableSpikeApp
    ? {
        enabled: true,
        displayName: "Spike",
        entryPath: "/app/spike",
        apiBase: "/api/spike",
        kind: spikeAppKind,
        ...(spikeAppKind === "static"
          ? { root: spikeAppRoot }
          : {
              proxy: {
                baseUrl: spikeProxyBaseUrl,
              },
            }),
      }
    : undefined;
  const appsConfig = {};
  if (glowbotAppConfig) {
    appsConfig.glowbot = glowbotAppConfig;
  }
  if (spikeAppConfig) {
    appsConfig.spike = spikeAppConfig;
  }

  if (dryRun) {
    const runtimeUrl =
      normalizeText(process.env.FRONTDOOR_PROVISIONER_DRY_RUN_RUNTIME_URL) ||
      "http://127.0.0.1:7422";
    const publicTemplate = normalizeText(process.env.FRONTDOOR_TENANT_RUNTIME_PUBLIC_BASE_TEMPLATE);
    const runtimePublicBaseUrl = publicTemplate
      ? renderTemplate(publicTemplate, { tenantId, port: 7422 })
      : normalizeText(process.env.FRONTDOOR_PROVISIONER_DRY_RUN_RUNTIME_PUBLIC_BASE_URL) || runtimeUrl;
    const trimmedBase = runtimePublicBaseUrl.replace(/\/+$/, "");
    process.stdout.write(
      `${JSON.stringify({
        tenant_id: tenantId,
        runtime_url: runtimeUrl,
        runtime_public_base_url: runtimePublicBaseUrl,
        runtime_ws_url: trimmedBase.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:") + "/",
        runtime_sse_url: `${trimmedBase}/api/events/stream`,
        state_dir: stateDir,
      })}\n`,
    );
    return;
  }

  fs.mkdirSync(tenantRoot, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  const adapterBootstrap = writeTenantAdapterConfig({
    repoRoot,
    configPath: nexAdapterConfigPath,
  });
  if (adapterBootstrap.missing.length > 0) {
    process.stderr.write(
      `provision-tenant-local warning: missing adapter binaries (${adapterBootstrap.missing.length}) in ${resolveAdapterBinDir(repoRoot)}\n`,
    );
  }

  let port = 0;
  if (fs.existsSync(portPath)) {
    const existing = Number(fs.readFileSync(portPath, "utf8").trim());
    if (Number.isFinite(existing) && existing > 0) {
      port = existing;
    }
  }
  if (!port) {
    const used = listUsedPorts(tenantsRoot);
    port = await findFreePort(Number.isFinite(basePort) ? basePort : 32000, used);
    fs.writeFileSync(portPath, `${port}\n`, "utf8");
  }

  const config = {
    runtime: {
      hostedMode: true,
      tenantId,
      bind: "loopback",
      auth: {
        mode: "trusted_token",
        allowTailscale: false,
        trustedToken: {
          issuer: tokenIssuer || "https://frontdoor.local",
          audience: tokenAudience || "control-plane",
          hmacSecret: tokenSecret,
          requireJti: true,
          clockSkewSeconds: 60,
        },
      },
      controlUi: controlUiConfig,
      ...(Object.keys(appsConfig).length > 0
        ? {
            apps: appsConfig,
          }
        : {}),
    },
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const existingPid =
    fs.existsSync(pidPath) && normalizeText(fs.readFileSync(pidPath, "utf8"))
      ? Number(fs.readFileSync(pidPath, "utf8").trim())
      : 0;
  let runtimeHealthy = false;
  if (Number.isFinite(existingPid) && existingPid > 0) {
    try {
      process.kill(existingPid, 0);
      runtimeHealthy = await waitForPort(port, "127.0.0.1", 2_000);
    } catch {
      runtimeHealthy = false;
    }
  }

  const disableNexAdapters = parseBool(process.env.FRONTDOOR_TENANT_DISABLE_NEX_ADAPTERS, false);
  const allowDisabledNexAdapters = parseBool(
    process.env.FRONTDOOR_TENANT_ALLOW_DISABLED_NEX_ADAPTERS,
    false,
  );
  if (disableNexAdapters && !allowDisabledNexAdapters) {
    throw new Error(
      "nex_adapters_disabled_not_allowed (set FRONTDOOR_TENANT_ALLOW_DISABLED_NEX_ADAPTERS=1 to override intentionally)",
    );
  }

  if (!runtimeHealthy) {
    const runtimeEnv = {
      ...process.env,
      NEXUS_STATE_DIR: stateDir,
      NEXUS_CONFIG_PATH: configPath,
    };
    if (adapterBootstrap.configPath) {
      runtimeEnv.NEXUS_NEX_CONFIG_PATH = adapterBootstrap.configPath;
    } else {
      delete runtimeEnv.NEXUS_NEX_CONFIG_PATH;
    }
    if (disableNexAdapters) {
      runtimeEnv.NEXUS_DISABLE_NEX_ADAPTERS = "1";
    } else {
      delete runtimeEnv.NEXUS_DISABLE_NEX_ADAPTERS;
    }
    const logFd = fs.openSync(logPath, "a");
    const child = spawn(
      nexusBin,
      ["runtime", "run", "--port", String(port), "--bind", "loopback", "--auth", "trusted_token", "--force"],
      {
        env: runtimeEnv,
        detached: true,
        stdio: ["ignore", logFd, logFd],
      },
    );
    fs.closeSync(logFd);
    child.unref();
    fs.writeFileSync(pidPath, `${child.pid}\n`, "utf8");
    const ok = await waitForPort(port, "127.0.0.1", 90_000);
    if (!ok) {
      throw new Error("tenant_runtime_start_timeout");
    }
  }

  await seedIdentity({
    stateDir,
    entityId,
    displayName,
    email,
    provider,
    subject,
    roles,
  });

  const runtimeUrl = `http://127.0.0.1:${port}`;
  const publicTemplate = normalizeText(process.env.FRONTDOOR_TENANT_RUNTIME_PUBLIC_BASE_TEMPLATE);
  const runtimePublicBaseUrl = publicTemplate
    ? renderTemplate(publicTemplate, { tenantId, port })
    : runtimeUrl;

  const out = {
    tenant_id: tenantId,
    runtime_url: runtimeUrl,
    runtime_public_base_url: runtimePublicBaseUrl,
    runtime_ws_url: runtimePublicBaseUrl.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:") + "/",
    runtime_sse_url: `${runtimePublicBaseUrl.replace(/\/+$/, "")}/api/events/stream`,
    state_dir: stateDir,
    adapter_count: adapterBootstrap.registered,
  };
  process.stdout.write(`${JSON.stringify(out)}\n`);
}

main().catch((error) => {
  process.stderr.write(`provision-tenant-local failed: ${String(error)}\n`);
  process.exit(1);
});
