export const RUNTIME_CLIENT_IDS = {
  WEBCHAT_UI: "webchat-ui",
  OPERATOR_CONSOLE: "nexus-operator-console",
  WEBCHAT: "webchat",
  CLI: "cli",
  RUNTIME_CLIENT: "runtime-client",
  IOS_APP: "nexus-ios",
  ANDROID_APP: "nexus-android",
  NODE_HOST: "node-host",
  TEST: "test",
  FINGERPRINT: "fingerprint",
  PROBE: "nexus-probe",
} as const;

export type RuntimeClientId = (typeof RUNTIME_CLIENT_IDS)[keyof typeof RUNTIME_CLIENT_IDS];

// Back-compat naming (internal): these values are IDs, not display names.
export const RUNTIME_CLIENT_NAMES = RUNTIME_CLIENT_IDS;
export type RuntimeClientName = RuntimeClientId;

export const RUNTIME_CLIENT_MODES = {
  WEBCHAT: "webchat",
  CLI: "cli",
  UI: "ui",
  BACKEND: "backend",
  NODE: "node",
  PROBE: "probe",
  TEST: "test",
} as const;

export type RuntimeClientMode = (typeof RUNTIME_CLIENT_MODES)[keyof typeof RUNTIME_CLIENT_MODES];

export type RuntimeClientInfo = {
  id: RuntimeClientId;
  displayName?: string;
  version: string;
  platform: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  mode: RuntimeClientMode;
  instanceId?: string;
};

export const RUNTIME_CLIENT_CAPS = {
  TOOL_EVENTS: "tool-events",
} as const;

export type RuntimeClientCap = (typeof RUNTIME_CLIENT_CAPS)[keyof typeof RUNTIME_CLIENT_CAPS];

const RUNTIME_CLIENT_ID_SET = new Set<RuntimeClientId>(Object.values(RUNTIME_CLIENT_IDS));
const RUNTIME_CLIENT_MODE_SET = new Set<RuntimeClientMode>(Object.values(RUNTIME_CLIENT_MODES));

export function normalizeRuntimeClientId(raw?: string | null): RuntimeClientId | undefined {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return RUNTIME_CLIENT_ID_SET.has(normalized as RuntimeClientId)
    ? (normalized as RuntimeClientId)
    : undefined;
}

export function normalizeRuntimeClientName(raw?: string | null): RuntimeClientName | undefined {
  return normalizeRuntimeClientId(raw);
}

export function normalizeRuntimeClientMode(raw?: string | null): RuntimeClientMode | undefined {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return RUNTIME_CLIENT_MODE_SET.has(normalized as RuntimeClientMode)
    ? (normalized as RuntimeClientMode)
    : undefined;
}

export function hasRuntimeClientCap(
  caps: string[] | null | undefined,
  cap: RuntimeClientCap,
): boolean {
  if (!Array.isArray(caps)) {
    return false;
  }
  return caps.includes(cap);
}
