#!/usr/bin/env node
import process from "node:process";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fail(message) {
  process.stderr.write(`frontdoor-launch-smoke: ${message}\n`);
  process.exit(1);
}

function requireCookie(resp) {
  const setCookie = resp.headers.get("set-cookie");
  if (!setCookie) {
    fail("login response did not include set-cookie");
  }
  const first = setCookie.split(";")[0];
  if (!first || !first.includes("=")) {
    fail(`invalid set-cookie header: ${setCookie}`);
  }
  return first.trim();
}

async function postJson(url, payload, headers = {}) {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });
  const raw = await resp.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  return { resp, body, raw };
}

async function getJson(url, headers = {}) {
  const resp = await fetch(url, {
    method: "GET",
    headers,
  });
  const raw = await resp.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  return { resp, body, raw };
}

async function main() {
  const origin = text(process.env.FRONTDOOR_SMOKE_ORIGIN) || "http://127.0.0.1:4789";
  const username = text(process.env.FRONTDOOR_SMOKE_USERNAME) || "owner";
  const password = text(process.env.FRONTDOOR_SMOKE_PASSWORD) || "changeme";
  const workspaceID = text(process.env.FRONTDOOR_SMOKE_WORKSPACE_ID) || "tenant-dev";
  const providedCookieRaw =
    text(process.env.FRONTDOOR_SMOKE_SESSION_COOKIE) || text(process.env.FRONTDOOR_SMOKE_SESSION_ID);
  const cookie = providedCookieRaw
    ? providedCookieRaw.includes("=")
      ? providedCookieRaw
      : `nexus_fd_session=${providedCookieRaw}`
    : "";

  let sessionCookie = cookie;
  if (!sessionCookie) {
    const login = await postJson(`${origin}/api/auth/login`, { username, password });
    if (!login.resp.ok || !login.body?.ok) {
      fail(`login failed: status=${login.resp.status} body=${login.raw}`);
    }
    sessionCookie = requireCookie(login.resp);
  }

  const selectWorkspace = await postJson(
    `${origin}/api/workspaces/select`,
    { workspace_id: workspaceID },
    { cookie: sessionCookie },
  );
  if (!selectWorkspace.resp.ok || !selectWorkspace.body?.ok) {
    fail(
      `workspace select failed: status=${selectWorkspace.resp.status} body=${selectWorkspace.raw}`,
    );
  }

  const diagnostics = await getJson(
    `${origin}/api/workspaces/${encodeURIComponent(workspaceID)}/launch-diagnostics`,
    { cookie: sessionCookie },
  );
  if (!diagnostics.resp.ok || !diagnostics.body?.ok) {
    fail(`launch diagnostics failed: status=${diagnostics.resp.status} body=${diagnostics.raw}`);
  }
  const launchReady = Boolean(diagnostics.body?.launch_ready);
  const appCount = Number(diagnostics.body?.app_catalog?.app_count ?? 0);
  const diagnosticsHealthError = text(diagnostics.body?.runtime_health?.error);
  const toleratedDiagnosticsHealth = diagnosticsHealthError === "nex_runtime_unavailable";
  if ((!launchReady && !toleratedDiagnosticsHealth) || appCount < 1) {
    fail(`launch diagnostics not ready: launch_ready=${String(launchReady)} app_count=${String(appCount)}`);
  }

  let health = await getJson(`${origin}/runtime/health`, { cookie: sessionCookie });
  if (health.resp.status === 404) {
    health = await getJson(`${origin}/runtime/status`, { cookie: sessionCookie });
  }
  if (!health.body) {
    fail(`/runtime health probe failed: status=${health.resp.status} body=${health.raw}`);
  }
  const runtimeError =
    typeof health.body.error === "string"
      ? String(health.body.error).trim()
      : "";
  const toleratedUnhealthy = runtimeError === "nex_runtime_unavailable";
  if (!health.resp.ok && !toleratedUnhealthy) {
    fail(`/runtime health probe failed: status=${health.resp.status} body=${health.raw}`);
  }
  const runtimeStatus =
    typeof health.body.status === "string"
      ? String(health.body.status).toLowerCase()
      : Array.isArray(health.body.trees)
        ? "healthy"
        : "";
  if (!runtimeStatus) {
    fail(`/runtime health payload is missing expected fields: ${health.raw}`);
  }
  if (runtimeStatus === "unhealthy" && !toleratedUnhealthy) {
    fail(`/runtime/health returned unhealthy: ${health.raw}`);
  }
  const runtimeStatusLabel = runtimeStatus === "unhealthy" && toleratedUnhealthy ? "degraded" : runtimeStatus;

  const appsResp = await fetch(`${origin}/runtime/api/apps`, {
    headers: { cookie: sessionCookie },
  });
  if (!appsResp.ok) {
    fail(`/runtime/api/apps failed with status ${appsResp.status}`);
  }
  const appsRaw = await appsResp.text();
  let appsBody = null;
  try {
    appsBody = appsRaw ? JSON.parse(appsRaw) : null;
  } catch {
    appsBody = null;
  }
  if (!appsBody?.ok || !Array.isArray(appsBody?.items) || appsBody.items.length < 1) {
    fail(`/runtime/api/apps did not return launchable apps: ${appsRaw}`);
  }

  const launchableApps = appsBody.items
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      app_id: text(item.app_id),
      entry_path: text(item.entry_path),
    }))
    .filter((item) => item.app_id && item.entry_path.startsWith("/app/"));
  if (launchableApps.length < 1) {
    fail(`/runtime/api/apps returned no launchable /app entries: ${appsRaw}`);
  }
  const preferredAppId = text(process.env.FRONTDOOR_SMOKE_APP_ID);
  const selectedApp =
    (preferredAppId && launchableApps.find((item) => item.app_id === preferredAppId)) ||
    launchableApps[0];

  const launchResp = await fetch(
    `${origin}${selectedApp.entry_path}?workspace_id=${encodeURIComponent(workspaceID)}`,
    {
      headers: { cookie: sessionCookie },
      redirect: "manual",
    },
  );
  if (launchResp.status === 404) {
    fail(`app launch returned 404 for ${selectedApp.entry_path}`);
  }
  if (![200, 302, 303, 307, 308].includes(launchResp.status)) {
    fail(`/app launch returned unexpected status ${launchResp.status}`);
  }

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      origin,
      workspace_id: workspaceID,
      launch_ready: launchReady,
      runtime_status: runtimeStatusLabel,
      runtime_health_error: runtimeError || null,
      app_count: appCount,
      app_id: selectedApp.app_id,
      entry_path: selectedApp.entry_path,
      launch_status: launchResp.status,
    })}\n`,
  );
}

main().catch((error) => {
  fail(String(error));
});
