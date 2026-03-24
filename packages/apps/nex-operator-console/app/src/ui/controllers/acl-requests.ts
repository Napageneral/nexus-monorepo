import type { RuntimeBrowserClient } from "../runtime.ts";

export type AclPermissionRequestStatus = "pending" | "approved" | "denied" | "expired";

export type AclPermissionRequest = {
  id: string;
  status: AclPermissionRequestStatus;
  createdAtMs: number;
  expiresAtMs: number;
  requesterId: string | null;
  requesterChannel: string | null;
  kind: string | null;
  toolName: string | null;
  toolCallId: string | null;
  sessionKey: string | null;
  nexusRequestId: string | null;
  summary: string | null;
  reason: string | null;
  resources: string[];
  context?: unknown;
  responder: string | null;
  responseAtMs: number | null;
  responseChannel: string | null;
  grantId: string | null;
};

export type AclRequestApproveMode = "once" | "day" | "forever";

export type AclRequestsState = {
  client: RuntimeBrowserClient | null;
  connected: boolean;
  aclRequestsLoading: boolean;
  aclRequestsError: string | null;
  aclRequests: AclPermissionRequest[];
  aclRequestsResolvingId: string | null;
};

function normalizeRequests(payload: unknown): AclPermissionRequest[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const rec = payload as { requests?: unknown };
  return Array.isArray(rec.requests) ? (rec.requests as AclPermissionRequest[]) : [];
}

export async function loadAclRequests(state: AclRequestsState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.aclRequestsLoading) {
    return;
  }
  state.aclRequestsLoading = true;
  state.aclRequestsError = null;
  try {
    const res = await state.client.request<{ requests: AclPermissionRequest[] }>(
      "acl.requests.list",
      {
        status: "pending",
        limit: 200,
      },
    );
    state.aclRequests = normalizeRequests(res);
  } catch (err) {
    state.aclRequestsError = String(err);
  } finally {
    state.aclRequestsLoading = false;
  }
}

export async function approveAclRequest(
  state: AclRequestsState,
  params: { id: string; mode: AclRequestApproveMode },
) {
  if (!state.client || !state.connected) {
    return;
  }
  const id = params.id.trim();
  if (!id) {
    return;
  }
  if (state.aclRequestsResolvingId) {
    return;
  }
  state.aclRequestsResolvingId = id;
  state.aclRequestsError = null;
  try {
    await state.client.request("acl.requests.approve", {
      id,
      mode: params.mode,
    });
    state.aclRequests = state.aclRequests.filter((r) => r.id !== id);
  } catch (err) {
    state.aclRequestsError = String(err);
  } finally {
    state.aclRequestsResolvingId = null;
  }
}

export async function denyAclRequest(state: AclRequestsState, id: string) {
  if (!state.client || !state.connected) {
    return;
  }
  const trimmed = id.trim();
  if (!trimmed) {
    return;
  }
  if (state.aclRequestsResolvingId) {
    return;
  }
  state.aclRequestsResolvingId = trimmed;
  state.aclRequestsError = null;
  try {
    await state.client.request("acl.requests.deny", { id: trimmed });
    state.aclRequests = state.aclRequests.filter((r) => r.id !== trimmed);
  } catch (err) {
    state.aclRequestsError = String(err);
  } finally {
    state.aclRequestsResolvingId = null;
  }
}

