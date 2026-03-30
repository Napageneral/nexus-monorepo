#!/usr/bin/env node
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  fail,
  getJson,
  mintRuntimeToken,
  postJson,
  parseJsonOrNull,
  resolveFrontdoorHeaders,
  responseSummary,
  runtimeGetJson,
  smokeError,
  text,
} from "./frontdoor-smoke-lib.mjs";

const execFileAsync = promisify(execFile);

function appIdsFromEnv() {
  const raw = text(process.env.FRONTDOOR_SMOKE_APPS) || "glowbot,spike,aix,dispatch";
  const ids = [...new Set(raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0))];
  if (ids.length < 2) {
    fail("FRONTDOOR_SMOKE_APPS must include at least two app ids", { value: raw });
  }
  return ids;
}

function pickServer(params) {
  const explicitServerId = text(process.env.FRONTDOOR_SMOKE_SERVER_ID);
  if (explicitServerId) {
    return explicitServerId;
  }
  const preferred = text(params.session?.active_server_id) || text(params.session?.server_id);
  if (preferred) {
    const found = params.servers.find((item) => text(item.server_id) === preferred);
    if (found) {
      return preferred;
    }
  }
  const first = params.servers[0];
  return text(first?.server_id);
}

function responseBody(resp, body, raw) {
  return responseSummary(resp, body, raw);
}

async function runPerAppProof({
  appId,
  origin,
  serverId,
  runtimeToken,
}) {
  const proofCommand = text(process.env.FRONTDOOR_SMOKE_APP_PROOF_COMMAND);
  if (!proofCommand) {
    return {
      ok: true,
      status: "pending_operator_supplied_proof",
      app_id: appId,
      server_id: serverId,
    };
  }
  try {
    const child = await execFileAsync("/bin/bash", ["-lc", proofCommand], {
      env: {
        ...process.env,
        FRONTDOOR_SMOKE_ORIGIN: origin,
        FRONTDOOR_SMOKE_SERVER_ID: serverId,
        FRONTDOOR_SMOKE_APP_ID: appId,
        FRONTDOOR_SMOKE_RUNTIME_ACCESS_TOKEN: runtimeToken.accessToken,
        FRONTDOOR_SMOKE_RUNTIME_BASE_URL: runtimeToken.runtime.baseUrl,
        FRONTDOOR_SMOKE_RUNTIME_HTTP_BASE_URL: runtimeToken.runtime.httpBaseUrl,
        FRONTDOOR_SMOKE_RUNTIME_WS_URL: runtimeToken.runtime.wsUrl || "",
        FRONTDOOR_SMOKE_RUNTIME_SSE_URL: runtimeToken.runtime.sseUrl || "",
        FRONTDOOR_SMOKE_RUNTIME_ENTITY_ID: runtimeToken.entityId || "",
        FRONTDOOR_SMOKE_RUNTIME_TENANT_ID: runtimeToken.tenantId || "",
      },
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    const payload = parseJsonOrNull(child.stdout);
    return {
      ok: true,
      status: "captured",
      app_id: appId,
      server_id: serverId,
      command: proofCommand,
      stdout: payload ?? (child.stdout || null),
      stderr: child.stderr || null,
    };
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    const parsedStdout = parseJsonOrNull(stdout);
    const parsedStderr = parseJsonOrNull(stderr);
    throw smokeError("multi-app per-app proof failed", {
      app_id: appId,
      server_id: serverId,
      command: proofCommand,
      stdout: parsedStdout ?? (stdout || null),
      stderr: parsedStderr ?? (stderr || null),
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function main() {
  const origin = text(process.env.FRONTDOOR_SMOKE_ORIGIN) || "https://frontdoor.nexushub.sh";
  const appIds = appIdsFromEnv();
  const headers = await resolveFrontdoorHeaders(origin);

  const session = await getJson(`${origin}/api/auth/session`, headers);
  if (!session.response.ok || session.body?.authenticated !== true) {
    fail("session is not authenticated", {
      session: responseBody(session.response, session.body, session.raw),
    });
  }

  const serversResp = await getJson(`${origin}/api/servers`, headers);
  if (!serversResp.response.ok || serversResp.body?.ok !== true || !Array.isArray(serversResp.body?.items)) {
    fail("failed to list servers", {
      servers: responseBody(serversResp.response, serversResp.body, serversResp.raw),
    });
  }
  const servers = serversResp.body.items;
  if (servers.length < 1) {
    fail("no servers available for authenticated user");
  }
  const serverId = pickServer({
    session: session.body,
    servers,
  });
  if (!serverId) {
    fail("failed to select target server");
  }

  const appResults = [];
  for (const appId of appIds) {
    const purchase = await postJson(
      `${origin}/api/apps/${encodeURIComponent(appId)}/purchase`,
      { install: false, server_id: serverId },
      headers,
    );
    if (!purchase.response.ok || purchase.body?.ok !== true) {
      fail("app purchase/entitlement failed", {
        app_id: appId,
        purchase: responseBody(purchase.response, purchase.body, purchase.raw),
      });
    }

    const install = await postJson(
      `${origin}/api/servers/${encodeURIComponent(serverId)}/apps/${encodeURIComponent(appId)}/install`,
      {},
      headers,
    );
    if (!install.response.ok || install.body?.ok !== true) {
      fail("app install failed", {
        app_id: appId,
        install: responseBody(install.response, install.body, install.raw),
      });
    }

    const installStatus = await getJson(
      `${origin}/api/servers/${encodeURIComponent(serverId)}/apps/${encodeURIComponent(appId)}/install-status`,
      headers,
    );
    if (!installStatus.response.ok || installStatus.body?.ok !== true) {
      fail("install-status probe failed", {
        app_id: appId,
        install_status: responseBody(installStatus.response, installStatus.body, installStatus.raw),
      });
    }
    if (text(installStatus.body?.install_status) !== "installed") {
      fail("app install-status is not installed", {
        app_id: appId,
        install_status: installStatus.body,
      });
    }

    appResults.push({
      app_id: appId,
      purchase_status: purchase.response.status,
      install_status: installStatus.body?.install_status,
      last_error: installStatus.body?.last_error ?? null,
      entry_path: text(installStatus.body?.entry_path),
    });
  }

  const serverApps = await getJson(
    `${origin}/api/servers/${encodeURIComponent(serverId)}/apps`,
    headers,
  );
  if (!serverApps.response.ok || serverApps.body?.ok !== true || !Array.isArray(serverApps.body?.items)) {
    fail("failed to list server apps", {
      server_apps: responseBody(serverApps.response, serverApps.body, serverApps.raw),
    });
  }

  const runtimeToken = await mintRuntimeToken({
    origin,
    headers,
    serverId,
  });

  const runtimeHealth = await runtimeGetJson(
    `${runtimeToken.runtime.baseUrl}/health`,
    runtimeToken.accessToken,
  );
  const runtimeHealthy =
    runtimeHealth.response.ok &&
    (runtimeHealth.body?.ok === true || text(runtimeHealth.body?.status) === "healthy");
  if (!runtimeHealthy) {
    fail("runtime health probe failed", {
      runtime_health: responseBody(runtimeHealth.response, runtimeHealth.body, runtimeHealth.raw),
    });
  }

  const runtimeApps = await runtimeGetJson(
    `${runtimeToken.runtime.httpBaseUrl}/api/apps`,
    runtimeToken.accessToken,
  );
  if (!runtimeApps.response.ok || runtimeApps.body?.ok !== true || !Array.isArray(runtimeApps.body?.items)) {
    fail("failed to list runtime apps", {
      runtime_apps: responseBody(runtimeApps.response, runtimeApps.body, runtimeApps.raw),
    });
  }
  const matchedRuntimeApps = appIds.map((appId) => {
    const match =
      runtimeApps.body.items.find(
        (item) => text(item?.id) === appId || text(item?.app_id) === appId,
      ) ?? null;
    if (!match) {
      fail("requested app missing from runtime apps inventory", {
        app_id: appId,
        runtime_apps: runtimeApps.body,
      });
    }
    return match;
  });

  const launchProof = [];
  const appProof = [];
  for (const app of appResults) {
    const serverItem =
      serverApps.body.items.find((item) => text(item?.app_id) === app.app_id) || null;
    if (!serverItem) {
      fail("app missing from server apps inventory", {
        app_id: app.app_id,
      });
    }
    const entryPath = text(serverItem.entry_path) || app.entry_path;
    if (!entryPath.startsWith("/app/")) {
      fail("invalid launch entry_path", {
        app_id: app.app_id,
        entry_path: entryPath,
      });
    }
    const launch = await fetch(
      `${origin}${entryPath}?server_id=${encodeURIComponent(serverId)}`,
      {
        method: "GET",
        headers,
        redirect: "manual",
      },
    );
    if (![200, 302, 303, 307, 308].includes(launch.status)) {
      fail("app launch probe failed", {
        app_id: app.app_id,
        status: launch.status,
        entry_path: entryPath,
      });
    }
    const location = text(launch.headers.get("location"));
    const contentType = text(launch.headers.get("content-type")).toLowerCase();
    let runtimeBridgePresent = null;
    if (launch.status === 200) {
      const html = await launch.text();
      runtimeBridgePresent = html.includes("window.NexusRuntimeBridge");
      if (!contentType.includes("html") || runtimeBridgePresent !== true) {
        fail("app launch did not return runtime-bridged html", {
          app_id: app.app_id,
          entry_path: entryPath,
          content_type: contentType || null,
          runtime_bridge_present: runtimeBridgePresent,
        });
      }
    } else if (!location || !location.includes("/app/")) {
      fail("app launch redirect did not stay within app routes", {
        app_id: app.app_id,
        entry_path: entryPath,
        status: launch.status,
        location: location || null,
      });
    }
    launchProof.push({
      app_id: app.app_id,
      entry_path: entryPath,
      launch_status: launch.status,
      location: location || null,
      runtime_bridge_present: runtimeBridgePresent,
    });
    appProof.push(
      await runPerAppProof({
        appId: app.app_id,
        origin,
        serverId,
        runtimeToken,
      }),
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        origin,
        server_id: serverId,
        app_results: appResults,
        server_apps_count: serverApps.body.items.length,
        runtime_apps_count: runtimeApps.body.items.length,
        runtime_apps: matchedRuntimeApps,
        runtime_token: {
          server_id: runtimeToken.serverId,
          tenant_id: runtimeToken.tenantId,
          entity_id: runtimeToken.entityId,
          runtime: {
            base_url: runtimeToken.runtime.baseUrl,
            http_base_url: runtimeToken.runtime.httpBaseUrl,
            ws_url: runtimeToken.runtime.wsUrl,
            sse_url: runtimeToken.runtime.sseUrl,
          },
        },
        runtime_health: runtimeHealth.body,
        launch_proof: launchProof,
        app_proof: appProof,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  fail("unexpected_failure", {
    detail: error instanceof Error ? error.message : String(error),
  });
});
