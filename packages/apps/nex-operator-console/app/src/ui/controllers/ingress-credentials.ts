import type { RuntimeBrowserClient } from "../runtime.ts";

export type IngressCredential = {
  id: string;
  audience: "ingress";
  entityId: string;
  role: string;
  scopes: string[];
  label: string | null;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
};

type IngressCredentialsListPayload = {
  credentials?: unknown;
};

type IngressCredentialsCreatePayload = {
  ok?: boolean;
  token?: string;
};

type IngressCredentialsRotatePayload = {
  ok?: boolean;
  token?: string;
};

export type IngressCredentialsState = {
  client: RuntimeBrowserClient | null;
  connected: boolean;
  ingressCredentialsLoading: boolean;
  ingressCredentialsError: string | null;
  ingressCredentials: IngressCredential[];
  ingressCredentialsEntityIdFilter: string;
  ingressCredentialCreateEntityId: string;
  ingressCredentialCreateRole: string;
  ingressCredentialCreateScopes: string;
  ingressCredentialCreateLabel: string;
  ingressCredentialCreateExpiresAt: string;
  ingressCredentialCreating: boolean;
  ingressCredentialBusyId: string | null;
};

function normalizeScopes(value: string): string[] {
  const seen = new Set<string>();
  const scopes = value
    .split(/[\s,]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      if (seen.has(entry)) {
        return false;
      }
      seen.add(entry);
      return true;
    });
  return scopes;
}

function parseExpiresAt(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.floor(parsed);
}

function normalizeCredentials(payload: unknown): IngressCredential[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const rec = payload as IngressCredentialsListPayload;
  if (!Array.isArray(rec.credentials)) {
    return [];
  }
  return rec.credentials
    .filter((entry): entry is IngressCredential => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return false;
      }
      const candidate = entry as { id?: unknown; entityId?: unknown; role?: unknown };
      return (
        typeof candidate.id === "string" &&
        candidate.id.trim().length > 0 &&
        typeof candidate.entityId === "string" &&
        candidate.entityId.trim().length > 0 &&
        typeof candidate.role === "string" &&
        candidate.role.trim().length > 0
      );
    })
    .toSorted((a, b) => b.createdAt - a.createdAt);
}

function revealToken(label: string, token: string) {
  if (!token.trim()) {
    return;
  }
  window.prompt(`${label} (copy and store securely):`, token);
}

export async function loadIngressCredentials(
  state: IngressCredentialsState,
  opts?: { quiet?: boolean },
) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.ingressCredentialsLoading) {
    return;
  }
  state.ingressCredentialsLoading = true;
  if (!opts?.quiet) {
    state.ingressCredentialsError = null;
  }
  try {
    const entityId = state.ingressCredentialsEntityIdFilter.trim();
    const res = await state.client.request<IngressCredentialsListPayload>("auth.tokens.list", {
      entityId: entityId || undefined,
      includeRevoked: false,
      includeExpired: false,
      limit: 500,
      offset: 0,
    });
    state.ingressCredentials = normalizeCredentials(res);
  } catch (err) {
    if (!opts?.quiet) {
      state.ingressCredentialsError = String(err);
    }
  } finally {
    state.ingressCredentialsLoading = false;
  }
}

export async function createIngressCredential(state: IngressCredentialsState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.ingressCredentialCreating) {
    return;
  }
  const entityId = state.ingressCredentialCreateEntityId.trim();
  if (!entityId) {
    state.ingressCredentialsError = "Entity ID is required.";
    return;
  }
  const role = state.ingressCredentialCreateRole.trim();
  const label = state.ingressCredentialCreateLabel.trim();
  const scopes = normalizeScopes(state.ingressCredentialCreateScopes);
  const expiresAt = parseExpiresAt(state.ingressCredentialCreateExpiresAt);
  if (expiresAt === null) {
    state.ingressCredentialsError = "Expires at must be a valid date/time.";
    return;
  }
  state.ingressCredentialCreating = true;
  state.ingressCredentialsError = null;
  try {
    const res = await state.client.request<IngressCredentialsCreatePayload>("auth.tokens.create", {
      entityId,
      role: role || undefined,
      scopes: scopes.length > 0 ? scopes : undefined,
      label: label || undefined,
      expiresAt,
    });
    if (res?.ok === true && typeof res.token === "string" && res.token.trim()) {
      revealToken("New ingress token", res.token);
    }
    state.ingressCredentialCreateLabel = "";
    state.ingressCredentialCreateScopes = "";
    state.ingressCredentialCreateExpiresAt = "";
    await loadIngressCredentials(state, { quiet: true });
  } catch (err) {
    state.ingressCredentialsError = String(err);
  } finally {
    state.ingressCredentialCreating = false;
  }
}

export async function revokeIngressCredential(state: IngressCredentialsState, id: string) {
  if (!state.client || !state.connected) {
    return;
  }
  const tokenId = id.trim();
  if (!tokenId) {
    return;
  }
  if (state.ingressCredentialBusyId) {
    return;
  }
  if (!window.confirm(`Revoke ingress credential ${tokenId}?`)) {
    return;
  }
  state.ingressCredentialBusyId = tokenId;
  state.ingressCredentialsError = null;
  try {
    await state.client.request("auth.tokens.revoke", { id: tokenId });
    await loadIngressCredentials(state, { quiet: true });
  } catch (err) {
    state.ingressCredentialsError = String(err);
  } finally {
    state.ingressCredentialBusyId = null;
  }
}

export async function rotateIngressCredential(state: IngressCredentialsState, id: string) {
  if (!state.client || !state.connected) {
    return;
  }
  const tokenId = id.trim();
  if (!tokenId) {
    return;
  }
  if (state.ingressCredentialBusyId) {
    return;
  }
  if (!window.confirm(`Rotate ingress credential ${tokenId}?`)) {
    return;
  }
  state.ingressCredentialBusyId = tokenId;
  state.ingressCredentialsError = null;
  try {
    const res = await state.client.request<IngressCredentialsRotatePayload>("auth.tokens.rotate", {
      id: tokenId,
    });
    if (res?.ok === true && typeof res.token === "string" && res.token.trim()) {
      revealToken("Rotated ingress token", res.token);
    }
    await loadIngressCredentials(state, { quiet: true });
  } catch (err) {
    state.ingressCredentialsError = String(err);
  } finally {
    state.ingressCredentialBusyId = null;
  }
}
