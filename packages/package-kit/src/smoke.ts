import {
  detectPackage,
  packageInstallPath,
  packageInstallStatusPath,
  packageUpgradePath,
} from "./shared.js";

type FetchLike = typeof fetch;

type SmokeOptions = {
  targetPath: string;
  frontdoorOrigin: string;
  apiToken: string;
  serverId: string;
  version?: string;
};

type JsonRecord = Record<string, unknown>;

async function fetchJson(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
): Promise<JsonRecord> {
  const response = await fetchImpl(url, init);
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${raw}`);
  }
  return raw ? (JSON.parse(raw) as JsonRecord) : {};
}

export async function smokePackage(
  opts: SmokeOptions,
  fetchImpl: FetchLike = fetch,
): Promise<{
  kind: "app" | "adapter";
  packageId: string;
  version: string;
  installStatus: JsonRecord;
  runtimeToken: JsonRecord;
  runtimePackageHealth: JsonRecord;
}> {
  const detected = detectPackage(opts.targetPath);
  const version = opts.version ?? detected.version;
  const frontdoorOrigin = opts.frontdoorOrigin.replace(/\/$/, "");
  const headers = {
    authorization: `Bearer ${opts.apiToken}`,
    "content-type": "application/json",
  };

  const statusBefore = await fetchJson(
    fetchImpl,
    `${frontdoorOrigin}${packageInstallStatusPath(detected.kind, opts.serverId, detected.id)}`,
    { method: "GET", headers },
  );

  const currentInstallStatus = String(statusBefore.install_status ?? "not_installed");
  const currentActiveVersion = String(statusBefore.active_version ?? "");

  if (
    currentInstallStatus === "installed" &&
    detected.kind === "adapter" &&
    currentActiveVersion === version
  ) {
    // already on target version
  } else if (
    currentInstallStatus === "installed" &&
    detected.kind === "adapter" &&
    currentActiveVersion
  ) {
    await fetchJson(
      fetchImpl,
      `${frontdoorOrigin}${packageUpgradePath(detected.kind, opts.serverId, detected.id)}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ target_version: version }),
      },
    );
  } else if (currentInstallStatus === "installed") {
    // Frontdoor app install-status does not currently expose active_version.
    // Treat installed as converged for the first smoke cut and rely on runtime health.
  } else {
    const body = detected.kind === "adapter" ? JSON.stringify({ version }) : JSON.stringify({});
    await fetchJson(
      fetchImpl,
      `${frontdoorOrigin}${packageInstallPath(detected.kind, opts.serverId, detected.id)}`,
      {
        method: "POST",
        headers,
        body,
      },
    );
  }

  const installStatus = await fetchJson(
    fetchImpl,
    `${frontdoorOrigin}${packageInstallStatusPath(detected.kind, opts.serverId, detected.id)}`,
    { method: "GET", headers },
  );
  if (String(installStatus.install_status ?? "") !== "installed") {
    throw new Error(
      `package ${detected.id} install did not converge: install_status=${String(installStatus.install_status ?? "unknown")}`,
    );
  }
  if (detected.kind === "adapter") {
    const activeVersion = String(installStatus.active_version ?? "");
    if (activeVersion && activeVersion !== version) {
      throw new Error(
        `adapter ${detected.id} active_version mismatch: expected ${version}, got ${activeVersion}`,
      );
    }
  }

  const runtimeToken = await fetchJson(fetchImpl, `${frontdoorOrigin}/api/runtime/token`, {
    method: "POST",
    headers,
    body: JSON.stringify({ server_id: opts.serverId }),
  });

  const runtimeBaseUrl = String(
    (runtimeToken.runtime as JsonRecord | undefined)?.http_base_url ?? "",
  ).replace(/\/$/, "");
  const accessToken = String(runtimeToken.access_token ?? "");
  if (!runtimeBaseUrl || !accessToken) {
    throw new Error(
      "frontdoor runtime token response missing runtime.http_base_url or access_token",
    );
  }

  const runtimePackageHealth = await fetchJson(
    fetchImpl,
    `${runtimeBaseUrl}/api/operator/packages/${detected.kind}/${encodeURIComponent(detected.id)}/health`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (runtimePackageHealth.healthy !== true) {
    throw new Error(
      `runtime package health is not healthy for ${detected.kind} ${detected.id}: ${JSON.stringify(runtimePackageHealth)}`,
    );
  }

  return {
    kind: detected.kind,
    packageId: detected.id,
    version,
    installStatus,
    runtimeToken,
    runtimePackageHealth,
  };
}
