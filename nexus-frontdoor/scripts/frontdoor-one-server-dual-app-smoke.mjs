#!/usr/bin/env node
import process from "node:process";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fail(message, details = {}) {
  const payload = {
    ok: false,
    error: message,
    ...details,
  };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(1);
}

function sessionCookieFromEnv() {
  const raw =
    text(process.env.FRONTDOOR_SMOKE_SESSION_COOKIE) || text(process.env.FRONTDOOR_SMOKE_SESSION_ID);
  if (!raw) {
    fail("missing FRONTDOOR_SMOKE_SESSION_COOKIE or FRONTDOOR_SMOKE_SESSION_ID");
  }
  if (raw.includes("=")) {
    return raw;
  }
  return `nexus_fd_session=${raw}`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  return { response, raw, body };
}

async function getJson(url, headers) {
  return await requestJson(url, {
    method: "GET",
    headers,
  });
}

async function postJson(url, payload, headers) {
  return await requestJson(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

function appIdsFromEnv() {
  const raw = text(process.env.FRONTDOOR_SMOKE_APPS) || "glowbot,spike";
  const ids = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
  if (ids.length < 1) {
    fail("FRONTDOOR_SMOKE_APPS produced no app ids", { value: raw });
  }
  return ids;
}

function pickServer(params) {
  const explicitServerId = text(process.env.FRONTDOOR_SMOKE_SERVER_ID);
  if (explicitServerId) {
    return explicitServerId;
  }
  const preferred = text(params.session?.active_workspace_id) || text(params.session?.tenant_id);
  if (preferred) {
    const found = params.servers.find((item) => text(item.server_id) === preferred);
    if (found) {
      return preferred;
    }
  }
  const first = params.servers[0];
  return text(first?.server_id);
}

function responseSummary(resp, body, raw) {
  return {
    status: resp.status,
    ok: resp.ok,
    body: body ?? raw,
  };
}

async function main() {
  const origin = text(process.env.FRONTDOOR_SMOKE_ORIGIN) || "https://frontdoor.nexushub.sh";
  const cookie = sessionCookieFromEnv();
  const appIds = appIdsFromEnv();
  const headers = { cookie };

  const session = await getJson(`${origin}/api/auth/session`, headers);
  if (!session.response.ok || session.body?.authenticated !== true) {
    fail("session is not authenticated", {
      session: responseSummary(session.response, session.body, session.raw),
    });
  }

  const serversResp = await getJson(`${origin}/api/servers`, headers);
  if (!serversResp.response.ok || serversResp.body?.ok !== true || !Array.isArray(serversResp.body?.items)) {
    fail("failed to list servers", {
      servers: responseSummary(serversResp.response, serversResp.body, serversResp.raw),
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
        purchase: responseSummary(purchase.response, purchase.body, purchase.raw),
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
        install: responseSummary(install.response, install.body, install.raw),
      });
    }

    const installStatus = await getJson(
      `${origin}/api/servers/${encodeURIComponent(serverId)}/apps/${encodeURIComponent(appId)}/install-status`,
      headers,
    );
    if (!installStatus.response.ok || installStatus.body?.ok !== true) {
      fail("install-status probe failed", {
        app_id: appId,
        install_status: responseSummary(installStatus.response, installStatus.body, installStatus.raw),
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
      server_apps: responseSummary(serverApps.response, serverApps.body, serverApps.raw),
    });
  }

  const runtimeApps = await getJson(
    `${origin}/runtime/api/apps?workspace_id=${encodeURIComponent(serverId)}`,
    headers,
  );
  if (!runtimeApps.response.ok || runtimeApps.body?.ok !== true || !Array.isArray(runtimeApps.body?.items)) {
    fail("failed to list runtime apps", {
      runtime_apps: responseSummary(runtimeApps.response, runtimeApps.body, runtimeApps.raw),
    });
  }

  const launchProof = [];
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
      `${origin}${entryPath}?workspace_id=${encodeURIComponent(serverId)}`,
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
    launchProof.push({
      app_id: app.app_id,
      entry_path: entryPath,
      launch_status: launch.status,
    });
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
        launch_proof: launchProof,
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
