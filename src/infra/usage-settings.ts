const SETTINGS_URL_ENV = "NEXUS_USAGE_SETTINGS_URL";
const UPLOAD_URL_ENV = "NEXUS_USAGE_UPLOAD_URL";
const UPLOAD_TOKEN_ENV = "NEXUS_USAGE_UPLOAD_TOKEN";

export type UsageTrackingSettings = {
  ok: boolean;
  canOptOut: boolean;
  optOut: boolean;
  planName?: string;
  error?: string;
};

export function resolveUsageSettingsUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const override = env[SETTINGS_URL_ENV]?.trim();
  if (override) return override;
  const uploadUrl = env[UPLOAD_URL_ENV]?.trim();
  if (!uploadUrl) return null;
  return uploadUrl.replace(/\/api\/usage\/upload\/?$/, "/api/usage/settings");
}

function resolveAuthHeaders(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const token = env[UPLOAD_TOKEN_ENV]?.trim();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function parseSettingsResponse(payload: unknown): UsageTrackingSettings | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  if (typeof data.canOptOut !== "boolean" || typeof data.optOut !== "boolean") {
    return null;
  }
  return {
    ok: typeof data.ok === "boolean" ? data.ok : true,
    canOptOut: data.canOptOut,
    optOut: data.optOut,
    planName: typeof data.planName === "string" ? data.planName : undefined,
    error: typeof data.error === "string" ? data.error : undefined,
  };
}

export async function fetchUsageTrackingSettings(
  env: NodeJS.ProcessEnv = process.env,
): Promise<UsageTrackingSettings | null> {
  const url = resolveUsageSettingsUrl(env);
  if (!url) return null;
  const headers = resolveAuthHeaders(env);
  if (!headers.Authorization) return null;

  try {
    const res = await fetch(url, { headers });
    const payload = await res.json().catch(() => null);
    const parsed = parseSettingsResponse(payload);
    if (!parsed) return null;
    return { ...parsed, ok: res.ok && parsed.ok };
  } catch {
    return null;
  }
}

export async function updateUsageTrackingSettings(
  optOut: boolean,
  env: NodeJS.ProcessEnv = process.env,
): Promise<UsageTrackingSettings | null> {
  const url = resolveUsageSettingsUrl(env);
  if (!url) return null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...resolveAuthHeaders(env),
  };
  if (!headers.Authorization) return null;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ optOut }),
    });
    const payload = await res.json().catch(() => null);
    const parsed = parseSettingsResponse(payload);
    if (!parsed) return null;
    return { ...parsed, ok: res.ok && parsed.ok };
  } catch {
    return null;
  }
}
