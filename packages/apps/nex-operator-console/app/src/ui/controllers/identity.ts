export type IdentityContact = {
  id: string;
  entity_id?: string | null;
  platform?: string | null;
  contact_id?: string | null;
  contact_name?: string | null;
  origin?: string | null;
  created_at?: number | null;
};

export type IdentityChannel = {
  id: string;
  platform?: string | null;
  connection_id?: string | null;
  space_name?: string | null;
  container_id?: string | null;
  container_kind?: string | null;
  container_name?: string | null;
  thread_name?: string | null;
  created_at?: number | null;
};

export type IdentityGroup = {
  id: string;
  name?: string | null;
  description?: string | null;
  parent_group_id?: string | null;
  member_count?: number | null;
};

export type IdentityPolicy = {
  id: string;
  name?: string | null;
  description?: string | null;
  effect?: string | null;
  priority?: number | null;
  is_builtin?: boolean;
  enabled?: boolean;
};

export type IdentityMergeCandidate = {
  id: string;
  source_entity_id?: string | null;
  target_entity_id?: string | null;
  confidence?: number | null;
  reason?: string | null;
  status?: string | null;
  created_at?: number | null;
};

type IdentityState = {
  client: { request: <T>(method: string, params?: unknown) => Promise<T> } | null;
  identityLoading: boolean;
  identityError: string | null;
  identityMergeBusyId: string | null;
  identityContacts: IdentityContact[];
  identityChannels: IdentityChannel[];
  identityGroups: IdentityGroup[];
  identityPolicies: IdentityPolicy[];
  identityMergeCandidates: IdentityMergeCandidate[];
};

export async function loadIdentitySurface(state: IdentityState) {
  if (!state.client) {
    state.identityError = "Runtime not connected.";
    return;
  }

  state.identityLoading = true;
  state.identityError = null;

  try {
    const [contactsRes, channelsRes, groupsRes, policiesRes, mergeRes] = await Promise.all([
      state.client.request<{ contacts?: IdentityContact[] }>("contacts.list", { limit: 100 }),
      state.client.request<{ channels?: IdentityChannel[] }>("channels.list", { limit: 100 }),
      state.client.request<{ groups?: IdentityGroup[] }>("groups.list", { limit: 100 }),
      state.client.request<{ policies?: IdentityPolicy[] }>("acl.policies.list", {}),
      state.client.request<{ candidates?: IdentityMergeCandidate[] }>("entities.merge.candidates", {
        limit: 100,
      }),
    ]);

    state.identityContacts = contactsRes?.contacts ?? [];
    state.identityChannels = channelsRes?.channels ?? [];
    state.identityGroups = groupsRes?.groups ?? [];
    state.identityPolicies = policiesRes?.policies ?? [];
    state.identityMergeCandidates = mergeRes?.candidates ?? [];
  } catch (error) {
    state.identityError = error instanceof Error ? error.message : String(error);
  } finally {
    state.identityLoading = false;
  }
}

export async function resolveIdentityMergeCandidate(
  state: IdentityState,
  id: string,
  status: "approved" | "rejected",
) {
  if (!state.client) {
    state.identityError = "Runtime not connected.";
    return;
  }

  const trimmed = id.trim();
  if (!trimmed) {
    return;
  }

  state.identityMergeBusyId = trimmed;
  state.identityError = null;
  try {
    await state.client.request("entities.merge.resolve", { id: trimmed, status });
    await loadIdentitySurface(state);
  } catch (error) {
    state.identityError = error instanceof Error ? error.message : String(error);
  } finally {
    state.identityMergeBusyId = null;
  }
}
