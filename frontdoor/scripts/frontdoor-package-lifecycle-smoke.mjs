#!/usr/bin/env node
import {
  boolEnv,
  deleteJson,
  fail,
  getJson,
  mintRuntimeToken,
  postJson,
  resolveFrontdoorHeaders,
  responseSummary,
  runtimeGetJson,
  text,
} from "./frontdoor-smoke-lib.mjs";

function pickServer(params) {
  const explicitServerId = text(process.env.FRONTDOOR_SMOKE_SERVER_ID);
  if (explicitServerId) {
    return explicitServerId;
  }
  const preferred = text(params.session?.active_server_id) || text(params.session?.server_id);
  if (preferred) {
    const found = params.servers.find((item) => text(item?.server_id) === preferred);
    if (found) {
      return preferred;
    }
  }
  const first = params.servers[0];
  return text(first?.server_id);
}

async function ensureInstalled({ origin, headers, serverId, appId }) {
  const install = await postJson(
    `${origin}/api/servers/${encodeURIComponent(serverId)}/apps/${encodeURIComponent(appId)}/install`,
    {},
    headers,
  );
  const alreadyInstalled = install.response.status === 409 && text(install.body?.error) === "already_installed";
  if ((!install.response.ok || install.body?.ok !== true) && !alreadyInstalled) {
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
  return installStatus.body;
}

async function ensureAdapterInstalled({ origin, headers, serverId, adapterId, version }) {
  const install = await postJson(
    `${origin}/api/servers/${encodeURIComponent(serverId)}/adapters/${encodeURIComponent(adapterId)}/install`,
    version ? { version } : {},
    headers,
  );
  const alreadyInstalled = install.response.status === 409 && text(install.body?.error) === "already_installed";
  if ((!install.response.ok || install.body?.ok !== true) && !alreadyInstalled) {
    fail("adapter install failed", {
      adapter_id: adapterId,
      install: responseSummary(install.response, install.body, install.raw),
    });
  }
  const installStatus = await getJson(
    `${origin}/api/servers/${encodeURIComponent(serverId)}/adapters/${encodeURIComponent(adapterId)}/install-status`,
    headers,
  );
  if (!installStatus.response.ok || installStatus.body?.ok !== true) {
    fail("adapter install-status probe failed", {
      adapter_id: adapterId,
      install_status: responseSummary(installStatus.response, installStatus.body, installStatus.raw),
    });
  }
  if (text(installStatus.body?.install_status) !== "installed") {
    fail("adapter install-status is not installed", {
      adapter_id: adapterId,
      install_status: installStatus.body,
    });
  }
  return installStatus.body;
}

async function ensureUpgrade({ origin, headers, serverId, appId, targetVersion }) {
  const upgrade = await postJson(
    `${origin}/api/servers/${encodeURIComponent(serverId)}/apps/${encodeURIComponent(appId)}/upgrade`,
    { target_version: targetVersion },
    headers,
  );
  if (!upgrade.response.ok || upgrade.body?.ok !== true) {
    fail("app upgrade failed", {
      app_id: appId,
      target_version: targetVersion,
      upgrade: responseSummary(upgrade.response, upgrade.body, upgrade.raw),
    });
  }
  if (text(upgrade.body?.version) !== targetVersion) {
    fail("upgrade response reported unexpected version", {
      app_id: appId,
      target_version: targetVersion,
      response_version: upgrade.body?.version ?? null,
    });
  }
  const installStatus = await getJson(
    `${origin}/api/servers/${encodeURIComponent(serverId)}/apps/${encodeURIComponent(appId)}/install-status`,
    headers,
  );
  if (!installStatus.response.ok || installStatus.body?.ok !== true) {
    fail("post-upgrade install-status probe failed", {
      app_id: appId,
      upgrade_status: responseSummary(installStatus.response, installStatus.body, installStatus.raw),
    });
  }
  if (text(installStatus.body?.version) !== targetVersion) {
    fail("install-status did not converge to upgraded version", {
      app_id: appId,
      target_version: targetVersion,
      install_status: installStatus.body,
    });
  }
  return installStatus.body;
}

async function ensureAdapterUpgrade({ origin, headers, serverId, adapterId, targetVersion }) {
  const upgrade = await postJson(
    `${origin}/api/servers/${encodeURIComponent(serverId)}/adapters/${encodeURIComponent(adapterId)}/upgrade`,
    { target_version: targetVersion },
    headers,
  );
  if (!upgrade.response.ok || upgrade.body?.ok !== true) {
    fail("adapter upgrade failed", {
      adapter_id: adapterId,
      target_version: targetVersion,
      upgrade: responseSummary(upgrade.response, upgrade.body, upgrade.raw),
    });
  }
  if (text(upgrade.body?.version) !== targetVersion) {
    fail("adapter upgrade response reported unexpected version", {
      adapter_id: adapterId,
      target_version: targetVersion,
      response_version: upgrade.body?.version ?? null,
    });
  }
  const installStatus = await getJson(
    `${origin}/api/servers/${encodeURIComponent(serverId)}/adapters/${encodeURIComponent(adapterId)}/install-status`,
    headers,
  );
  if (!installStatus.response.ok || installStatus.body?.ok !== true) {
    fail("post-upgrade adapter install-status probe failed", {
      adapter_id: adapterId,
      upgrade_status: responseSummary(installStatus.response, installStatus.body, installStatus.raw),
    });
  }
  if (text(installStatus.body?.active_version) !== targetVersion) {
    fail("adapter install-status did not converge to upgraded version", {
      adapter_id: adapterId,
      target_version: targetVersion,
      install_status: installStatus.body,
    });
  }
  return installStatus.body;
}

async function ensureUninstall({ origin, headers, serverId, appId }) {
  const uninstall = await deleteJson(
    `${origin}/api/servers/${encodeURIComponent(serverId)}/apps/${encodeURIComponent(appId)}/install`,
    headers,
  );
  if (!uninstall.response.ok || uninstall.body?.ok !== true) {
    fail("app uninstall failed", {
      app_id: appId,
      uninstall: responseSummary(uninstall.response, uninstall.body, uninstall.raw),
    });
  }
  const installStatus = await getJson(
    `${origin}/api/servers/${encodeURIComponent(serverId)}/apps/${encodeURIComponent(appId)}/install-status`,
    headers,
  );
  if (!installStatus.response.ok || installStatus.body?.ok !== true) {
    fail("post-uninstall install-status probe failed", {
      app_id: appId,
      install_status: responseSummary(installStatus.response, installStatus.body, installStatus.raw),
    });
  }
  if (text(installStatus.body?.install_status) !== "not_installed") {
    fail("app install-status is not not_installed after uninstall", {
      app_id: appId,
      install_status: installStatus.body,
    });
  }
  return installStatus.body;
}

async function ensureAdapterUninstall({ origin, headers, serverId, adapterId }) {
  const uninstall = await deleteJson(
    `${origin}/api/servers/${encodeURIComponent(serverId)}/adapters/${encodeURIComponent(adapterId)}/install`,
    headers,
  );
  if (!uninstall.response.ok || uninstall.body?.ok !== true) {
    fail("adapter uninstall failed", {
      adapter_id: adapterId,
      uninstall: responseSummary(uninstall.response, uninstall.body, uninstall.raw),
    });
  }
  const installStatus = await getJson(
    `${origin}/api/servers/${encodeURIComponent(serverId)}/adapters/${encodeURIComponent(adapterId)}/install-status`,
    headers,
  );
  if (!installStatus.response.ok || installStatus.body?.ok !== true) {
    fail("post-uninstall adapter install-status probe failed", {
      adapter_id: adapterId,
      install_status: responseSummary(installStatus.response, installStatus.body, installStatus.raw),
    });
  }
  if (text(installStatus.body?.install_status) !== "not_installed") {
    fail("adapter install-status is not not_installed after uninstall", {
      adapter_id: adapterId,
      install_status: installStatus.body,
    });
  }
  return installStatus.body;
}

async function main() {
  const origin = text(process.env.FRONTDOOR_SMOKE_ORIGIN) || "https://frontdoor.nexushub.sh";
  const kind = text(process.env.FRONTDOOR_SMOKE_KIND).toLowerCase() || "app";
  if (kind !== "app" && kind !== "adapter") {
    fail("invalid package kind", {
      kind,
      allowed: ["app", "adapter"],
    });
  }
  const appId = text(process.env.FRONTDOOR_SMOKE_APP_ID) || "glowbot";
  const adapterId = text(process.env.FRONTDOOR_SMOKE_ADAPTER_ID) || "confluence";
  const purchaseFirst = boolEnv("FRONTDOOR_SMOKE_PURCHASE", false);
  const uninstallAfter = boolEnv("FRONTDOOR_SMOKE_UNINSTALL", false);
  const targetVersion = text(process.env.FRONTDOOR_SMOKE_TARGET_VERSION);
  const installVersion = text(process.env.FRONTDOOR_SMOKE_INSTALL_VERSION);

  const headers = await resolveFrontdoorHeaders(origin);

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
  if (serversResp.body.items.length < 1) {
    fail("no servers available for authenticated user");
  }

  const serverId = pickServer({
    session: session.body,
    servers: serversResp.body.items,
  });
  if (!serverId) {
    fail("failed to select target server");
  }

  if (kind === "app" && purchaseFirst) {
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
  }

  const installStatus =
    kind === "app"
      ? await ensureInstalled({
          origin,
          headers,
          serverId,
          appId,
        })
      : await ensureAdapterInstalled({
          origin,
          headers,
          serverId,
          adapterId,
          version: installVersion || undefined,
        });

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
      runtime_health: responseSummary(runtimeHealth.response, runtimeHealth.body, runtimeHealth.raw),
    });
  }

  let runtimeApps = null;
  if (kind === "app") {
    runtimeApps = await runtimeGetJson(
      `${runtimeToken.runtime.httpBaseUrl}/api/apps`,
      runtimeToken.accessToken,
    );
    if (!runtimeApps.response.ok || runtimeApps.body?.ok !== true || !Array.isArray(runtimeApps.body?.items)) {
      fail("runtime apps catalog probe failed", {
        runtime_apps: responseSummary(runtimeApps.response, runtimeApps.body, runtimeApps.raw),
      });
    }
    if (
      !runtimeApps.body.items.some(
        (item) => text(item?.id) === appId || text(item?.app_id) === appId,
      )
    ) {
      fail("runtime apps catalog missing installed app", {
        app_id: appId,
        runtime_apps: runtimeApps.body,
      });
    }
  }

  let entryPath = null;
  let launchStatus = null;
  if (kind === "app") {
    const serverApps = await getJson(
      `${origin}/api/servers/${encodeURIComponent(serverId)}/apps`,
      headers,
    );
    if (!serverApps.response.ok || serverApps.body?.ok !== true || !Array.isArray(serverApps.body?.items)) {
      fail("failed to list server apps", {
        server_apps: responseSummary(serverApps.response, serverApps.body, serverApps.raw),
      });
    }
    const serverApp = serverApps.body.items.find((item) => text(item?.app_id) === appId);
    if (!serverApp) {
      fail("app missing from server app inventory", {
        app_id: appId,
        server_id: serverId,
      });
    }

    entryPath = text(serverApp.entry_path) || text(installStatus.entry_path);
    if (!entryPath.startsWith("/app/")) {
      fail("invalid launch entry_path", {
        app_id: appId,
        entry_path: entryPath,
      });
    }

    const launch = await fetch(`${origin}${entryPath}?server_id=${encodeURIComponent(serverId)}`, {
      method: "GET",
      headers,
      redirect: "manual",
    });
    launchStatus = launch.status;
    if (![200, 302, 303, 307, 308].includes(launch.status)) {
      fail("app launch probe failed", {
        app_id: appId,
        status: launch.status,
        entry_path: entryPath,
      });
    }
  }

  let upgradeStatus = null;
  if (targetVersion) {
    upgradeStatus =
      kind === "app"
        ? await ensureUpgrade({
            origin,
            headers,
            serverId,
            appId,
            targetVersion,
          })
        : await ensureAdapterUpgrade({
            origin,
            headers,
            serverId,
            adapterId,
            targetVersion,
          });
  }

  let uninstallStatus = null;
  if (uninstallAfter) {
    uninstallStatus =
      kind === "app"
        ? await ensureUninstall({
            origin,
            headers,
            serverId,
            appId,
          })
        : await ensureAdapterUninstall({
            origin,
            headers,
            serverId,
            adapterId,
          });
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        origin,
        kind,
        server_id: serverId,
        app_id: kind === "app" ? appId : null,
        adapter_id: kind === "adapter" ? adapterId : null,
        purchased: kind === "app" ? purchaseFirst : false,
        installed_version:
          kind === "app" ? installStatus.version ?? null : installStatus.active_version ?? installVersion ?? null,
        upgraded_version:
          kind === "app" ? upgradeStatus?.version ?? null : upgradeStatus?.active_version ?? targetVersion ?? null,
        uninstalled: uninstallAfter,
        install_status: installStatus.install_status ?? null,
        uninstall_status: uninstallStatus?.install_status ?? null,
        entry_path: entryPath,
        launch_status: launchStatus,
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
        runtime_apps_count:
          kind === "app" && runtimeApps?.body && Array.isArray(runtimeApps.body.items)
            ? runtimeApps.body.items.length
            : null,
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
