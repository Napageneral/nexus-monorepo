#!/usr/bin/env node
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import {
  fail,
  getJson,
  mintRuntimeToken,
  postJson,
  responseSummary,
  resolveFrontdoorHeaders,
  runtimeGetJson,
  runtimePostJson,
  sleep,
  text,
  waitForServerRunning,
} from "./frontdoor-smoke-lib.mjs";

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_POLL_MS = 5_000;
const REQUIRED_PACKAGE_METHODS = [
  "gmail.attachment.download",
  "gmail.drafts.create",
  "gmail.drafts.get",
  "gmail.drafts.list",
  "gmail.drafts.send",
  "gmail.drafts.update",
  "gmail.forward",
  "gmail.labels.list",
  "gmail.native.read",
  "gmail.native.write",
  "gmail.send",
  "gmail.thread.attachments",
  "gmail.thread.get",
];
const REQUIRED_ADAPTER_OPERATIONS = [
  "adapter.connections.list",
  "adapter.health",
  "adapter.monitor.start",
  "records.backfill",
];

function numberEnv(name, fallback) {
  const raw = text(process.env[name]);
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function requiredEnv(name) {
  const value = text(process.env[name]);
  if (!value) {
    fail("missing required environment variable", { env: name });
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function writeProofBundle(payload) {
  const root = text(process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR);
  if (!root) {
    return;
  }
  const proofDir = path.join(root, "proof");
  fs.mkdirSync(proofDir, { recursive: true });
  fs.writeFileSync(
    path.join(proofDir, "gog-hosted-install-restart-proof.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
}

async function callRuntimeOperation(runtimeHttpBaseUrl, accessToken, method, params) {
  const url = `${runtimeHttpBaseUrl.replace(/\/+$/g, "")}/runtime/operations/${encodeURIComponent(method)}`;
  const result = await runtimePostJson(url, params, accessToken);
  if (!result.response.ok || result.body?.ok !== true) {
    fail("runtime operation failed", {
      method,
      response: responseSummary(result.response, result.body, result.raw),
    });
  }
  return result.body?.payload ?? null;
}

async function verifyRuntimeHealth(runtimeBaseUrl, accessToken, phase, timeoutMs, pollMs) {
  const deadline = Date.now() + timeoutMs;
  let lastHealth = null;
  while (Date.now() <= deadline) {
    const health = await runtimeGetJson(
      `${runtimeBaseUrl.replace(/\/+$/g, "")}/health`,
      accessToken,
    );
    lastHealth = health;
    const healthy =
      health.response.ok &&
      (health.body?.ok === true || text(health.body?.status) === "healthy");
    if (healthy) {
      return {
        phase,
        status: text(health.body?.status) || (health.body?.ok === true ? "ok" : ""),
        ok: true,
      };
    }
    await sleep(pollMs);
  }

  fail("runtime health probe failed", {
    phase,
    runtime_health: lastHealth
      ? responseSummary(lastHealth.response, lastHealth.body, lastHealth.raw)
      : null,
    timeout_ms: timeoutMs,
  });
}

async function verifyInstallStatus(origin, headers, serverId, adapterId, phase) {
  const installStatus = await getJson(
    `${origin}/api/servers/${encodeURIComponent(serverId)}/adapters/${encodeURIComponent(adapterId)}/install-status`,
    headers,
  );
  if (!installStatus.response.ok || installStatus.body?.ok !== true) {
    fail("adapter install-status probe failed", {
      phase,
      adapter_id: adapterId,
      install_status: responseSummary(installStatus.response, installStatus.body, installStatus.raw),
    });
  }
  if (text(installStatus.body?.install_status) !== "installed") {
    fail("adapter install-status is not installed", {
      phase,
      adapter_id: adapterId,
      install_status: installStatus.body,
    });
  }
  return {
    phase,
    adapter_id: adapterId,
    install_status: text(installStatus.body?.install_status),
    active_version:
      text(installStatus.body?.active_version) ||
      text(installStatus.body?.version) ||
      null,
  };
}

async function ensureAdapterInstalled(origin, headers, serverId, adapterId) {
  const install = await postJson(
    `${origin}/api/servers/${encodeURIComponent(serverId)}/adapters/${encodeURIComponent(adapterId)}/install`,
    {},
    headers,
  );
  const alreadyInstalled =
    install.response.status === 409 && text(install.body?.error) === "already_installed";
  if ((!install.response.ok || install.body?.ok !== true) && !alreadyInstalled) {
    fail("adapter install failed", {
      adapter_id: adapterId,
      install: responseSummary(install.response, install.body, install.raw),
    });
  }
  const installStatus = await verifyInstallStatus(
    origin,
    headers,
    serverId,
    adapterId,
    "install",
  );
  return {
    install_request:
      alreadyInstalled
        ? { status: "already_installed" }
        : { status: text(install.body?.status) || "installed" },
    install_status: installStatus,
  };
}

async function resolveInitialRuntime(origin, headers, serverId) {
  const accessToken = text(process.env.FRONTDOOR_SMOKE_RUNTIME_ACCESS_TOKEN);
  const baseUrl = text(process.env.FRONTDOOR_SMOKE_RUNTIME_BASE_URL);
  const httpBaseUrl = text(process.env.FRONTDOOR_SMOKE_RUNTIME_HTTP_BASE_URL);
  if (accessToken && baseUrl && httpBaseUrl) {
    return {
      accessToken,
      runtime: {
        baseUrl,
        httpBaseUrl,
        wsUrl: text(process.env.FRONTDOOR_SMOKE_RUNTIME_WS_URL) || null,
        sseUrl: text(process.env.FRONTDOOR_SMOKE_RUNTIME_SSE_URL) || null,
      },
      serverId,
      tenantId: text(process.env.FRONTDOOR_SMOKE_RUNTIME_TENANT_ID) || null,
      entityId: text(process.env.FRONTDOOR_SMOKE_RUNTIME_ENTITY_ID) || null,
    };
  }
  return await mintRuntimeToken({
    origin,
    headers,
    serverId,
  });
}

async function verifyAdapterSurface(runtimeHttpBaseUrl, accessToken, adapterId, phase, connectionAdapterRoot) {
  const catalog = await callRuntimeOperation(
    runtimeHttpBaseUrl,
    accessToken,
    "adapters.methods",
    { id: adapterId },
  );
  const methodNames = Array.isArray(catalog?.methods)
    ? catalog.methods.map((entry) => text(entry?.name)).filter(Boolean).sort()
    : [];
  const missing = REQUIRED_PACKAGE_METHODS.filter((name) => !methodNames.includes(name));
  if (missing.length > 0) {
    fail("hosted GOG adapter method catalog is missing required methods", {
      phase,
      adapter_id: adapterId,
      missing_methods: missing,
      method_names: methodNames,
    });
  }

  const info = await callRuntimeOperation(
    runtimeHttpBaseUrl,
    accessToken,
    "adapter.info",
    { adapter: adapterId },
  );
  const operations = Array.isArray(info?.operations)
    ? info.operations.map((entry) => text(entry)).filter(Boolean).sort()
    : [];
  const missingOperations = REQUIRED_ADAPTER_OPERATIONS.filter(
    (name) => !operations.includes(name),
  );
  if (missingOperations.length > 0) {
    fail("hosted GOG adapter info is missing required operations", {
      phase,
      adapter_id: adapterId,
      missing_operations: missingOperations,
      operations,
    });
  }

  const legacyConnections = await callRuntimeOperation(
    runtimeHttpBaseUrl,
    accessToken,
    "adapter.connections.list",
    { adapter: adapterId },
  );
  const legacyConnectionCount = Array.isArray(legacyConnections?.connections)
    ? legacyConnections.connections.length
    : 0;

  const canonicalConnections = await callRuntimeOperation(
    runtimeHttpBaseUrl,
    accessToken,
    "adapters.connections.list",
    {},
  );
  const canonicalConnectionList = Array.isArray(canonicalConnections?.connections)
    ? canonicalConnections.connections.filter((entry) => {
        const root =
          text(entry?.adapter) ||
          text(entry?.adapter_id) ||
          text(entry?.adapterRoot);
        return root === connectionAdapterRoot;
      })
    : [];
  const connectionCount = canonicalConnectionList.length;
  const connectionHashes = canonicalConnectionList
        .map((entry) => text(entry?.connectionId) || text(entry?.connection_id) || text(entry?.id))
        .filter(Boolean)
        .map((value) => sha256(value))
        .sort();
  return {
    phase,
    adapter_id: adapterId,
    method_count: methodNames.length,
    required_methods_present: REQUIRED_PACKAGE_METHODS,
    required_operations_present: REQUIRED_ADAPTER_OPERATIONS,
    legacy_connection_count: legacyConnectionCount,
    connection_adapter_root: connectionAdapterRoot,
    connection_count: connectionCount,
    connection_id_hashes: connectionHashes,
    stable_connection_ids_available:
      connectionCount > 0 && connectionHashes.length === connectionCount,
  };
}

async function archiveServer(origin, headers, serverId) {
  const archived = await postJson(
    `${origin}/api/servers/${encodeURIComponent(serverId)}/archive`,
    {},
    headers,
  );
  if (!archived.response.ok || archived.body?.ok !== true) {
    fail("server archive failed during hosted restart proof", {
      server_id: serverId,
      archive: responseSummary(archived.response, archived.body, archived.raw),
    });
  }
  return {
    server_id: text(archived.body?.server_id) || serverId,
    status: text(archived.body?.status),
    archived_at: archived.body?.archived_at ?? null,
  };
}

async function restoreServer(origin, headers, serverId) {
  const restored = await postJson(
    `${origin}/api/servers/${encodeURIComponent(serverId)}/restore`,
    {},
    headers,
  );
  if (!restored.response.ok || restored.body?.ok !== true) {
    fail("server restore failed during hosted restart proof", {
      server_id: serverId,
      restore: responseSummary(restored.response, restored.body, restored.raw),
    });
  }
  return {
    server_id: text(restored.body?.server_id) || serverId,
    status: text(restored.body?.status),
    last_recovered_at: restored.body?.last_recovered_at ?? null,
  };
}

async function main() {
  const origin = text(process.env.FRONTDOOR_SMOKE_ORIGIN) || "https://frontdoor.nexushub.sh";
  const serverId = requiredEnv("FRONTDOOR_SMOKE_SERVER_ID");
  const adapterId = text(process.env.FRONTDOOR_SMOKE_ADAPTER_ID) || "gog";
  if (adapterId !== "gog") {
    fail("frontdoor-gog-hosted-install-restart-proof.mjs requires FRONTDOOR_SMOKE_ADAPTER_ID=gog", {
      adapter_id: adapterId,
    });
  }
  const timeoutMs = numberEnv("FRONTDOOR_SMOKE_RESTORE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const pollMs = numberEnv("FRONTDOOR_SMOKE_RESTORE_POLL_MS", DEFAULT_POLL_MS);
  const connectionAdapterRoot =
    text(process.env.FRONTDOOR_SMOKE_CONNECTION_ADAPTER_ROOT) || "gmail";
  const headers = await resolveFrontdoorHeaders(origin);
  const install = await ensureAdapterInstalled(origin, headers, serverId, adapterId);
  const initialRuntimeToken = await resolveInitialRuntime(origin, headers, serverId);

  const beforeInstall = await verifyInstallStatus(origin, headers, serverId, adapterId, "before_restart");
  const beforeHealth = await verifyRuntimeHealth(
    initialRuntimeToken.runtime.baseUrl,
    initialRuntimeToken.accessToken,
    "before_restart",
    30_000,
    pollMs,
  );
  const beforeSurface = await verifyAdapterSurface(
    initialRuntimeToken.runtime.httpBaseUrl,
    initialRuntimeToken.accessToken,
    adapterId,
    "before_restart",
    connectionAdapterRoot,
  );

  const archived = await archiveServer(origin, headers, serverId);
  await sleep(pollMs);
  const restored = await restoreServer(origin, headers, serverId);
  const running = await waitForServerRunning({
    origin,
    headers,
    serverId,
    timeoutMs,
    pollMs,
  });
  const restartedRuntimeToken = await mintRuntimeToken({
    origin,
    headers,
    serverId,
  });

  const afterInstall = await verifyInstallStatus(origin, headers, serverId, adapterId, "after_restart");
  const afterHealth = await verifyRuntimeHealth(
    restartedRuntimeToken.runtime.baseUrl,
    restartedRuntimeToken.accessToken,
    "after_restart",
    timeoutMs,
    pollMs,
  );
  const afterSurface = await verifyAdapterSurface(
    restartedRuntimeToken.runtime.httpBaseUrl,
    restartedRuntimeToken.accessToken,
    adapterId,
    "after_restart",
    connectionAdapterRoot,
  );
  const beforeConnectionHashes = beforeSurface.connection_id_hashes;
  const afterConnectionHashes = afterSurface.connection_id_hashes;
  const stableConnectionIdsAvailable =
    beforeSurface.stable_connection_ids_available === true &&
    afterSurface.stable_connection_ids_available === true;
  const connectionIdentityPreserved = stableConnectionIdsAvailable &&
    beforeConnectionHashes.length === afterConnectionHashes.length &&
    beforeConnectionHashes.every((value, index) => value === afterConnectionHashes[index]);
  const connectionCountPreserved =
    beforeSurface.connection_count === afterSurface.connection_count;
  if (stableConnectionIdsAvailable && !connectionIdentityPreserved) {
    fail("hosted GOG connection identities changed across restart", {
      adapter_id: adapterId,
      before_connection_id_hashes: beforeConnectionHashes,
      after_connection_id_hashes: afterConnectionHashes,
    });
  }
  if (!connectionCountPreserved) {
    fail("hosted GOG connection count changed across restart", {
      adapter_id: adapterId,
      before_connection_count: beforeSurface.connection_count,
      after_connection_count: afterSurface.connection_count,
    });
  }

  const payload = {
    ok: true,
    adapter_id: adapterId,
    server_id: serverId,
    install,
    before_restart: {
      install_status: beforeInstall,
      runtime_health: beforeHealth,
      adapter_surface: beforeSurface,
    },
    restart: {
      archive: archived,
      restore: restored,
      running: {
        status: running.status,
        waited_ms: running.waitedMs,
      },
      stable_connection_ids_available: stableConnectionIdsAvailable,
      connection_identity_preserved: stableConnectionIdsAvailable
        ? connectionIdentityPreserved
        : null,
      connection_count_preserved: connectionCountPreserved,
    },
    after_restart: {
      install_status: afterInstall,
      runtime_health: afterHealth,
      adapter_surface: afterSurface,
      runtime_token: {
        server_id: restartedRuntimeToken.serverId,
        tenant_id: restartedRuntimeToken.tenantId,
        entity_id: restartedRuntimeToken.entityId,
        runtime: {
          base_url: restartedRuntimeToken.runtime.baseUrl,
          http_base_url: restartedRuntimeToken.runtime.httpBaseUrl,
          ws_url: restartedRuntimeToken.runtime.wsUrl,
          sse_url: restartedRuntimeToken.runtime.sseUrl,
        },
      },
    },
    limitations: [
      "hosted proof verifies install durability and runtime method registration without importing a Gmail account credential",
      "hosted public runtime inventory currently exposes the Gmail-root connection count but not a stable public connection id for that legacy row",
      "live Gmail backfill, monitor soak, and agent-use proofs are covered by the host-native cleanroom Gmail proof",
    ],
  };
  writeProofBundle(payload);
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  fail("unexpected_failure", {
    detail: error instanceof Error ? error.message : String(error),
  });
});
