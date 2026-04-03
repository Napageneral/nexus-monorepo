export type IdentityEntity = {
  id: string;
  name?: string | null;
  type?: string | null;
  origin?: string | null;
  is_user?: boolean;
  is_agent?: boolean;
  created_at?: number | null;
  updated_at?: number | null;
};

export type IdentityContact = {
  id: string;
  observed_entity_id?: string | null;
  canonical_entity_id?: string | null;
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
  thread_id?: string | null;
  thread_name?: string | null;
  created_at?: number | null;
};

export type IdentityGroup = {
  id: string;
  name?: string | null;
  description?: string | null;
  parent_group_id?: string | null;
  member_count?: number | null;
  created_at?: number | null;
  updated_at?: number | null;
};

export type IdentityGroupMember = {
  id: string;
  group_id?: string | null;
  entity_id?: string | null;
  role?: string | null;
  entity_name?: string | null;
  entity_type?: string | null;
  created_at?: number | null;
  updated_at?: number | null;
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
  identityEntities: IdentityEntity[];
  identityContacts: IdentityContact[];
  identityChannels: IdentityChannel[];
  identityGroups: IdentityGroup[];
  identityPolicies: IdentityPolicy[];
  identityMergeCandidates: IdentityMergeCandidate[];
  identitySelectedEntityId?: string | null;
  identitySelectedEntity?: IdentityEntity | null;
  identitySelectedEntityContacts?: IdentityContact[];
  identityEntityDetailLoading?: boolean;
  identitySelectedGroupId?: string | null;
  identitySelectedGroup?: IdentityGroup | null;
  identityGroupMembers?: IdentityGroupMember[];
  identityGroupDetailLoading?: boolean;
  requestUpdate?: () => void;
};

export async function loadIdentitySurface(state: IdentityState) {
  if (!state.client) {
    state.identityError = "Runtime not connected.";
    return;
  }

  state.identityLoading = true;
  state.identityError = null;

  try {
    const [entitiesRes, contactsRes, channelsRes, groupsRes, policiesRes, mergeRes] = await Promise.all([
      state.client.request<{ entities?: IdentityEntity[] }>("entities.list", { limit: 100 }),
      state.client.request<{ contacts?: IdentityContact[] }>("contacts.list", { limit: 100 }),
      state.client.request<{ channels?: IdentityChannel[] }>("channels.list", { limit: 100 }),
      state.client.request<{ groups?: IdentityGroup[] }>("groups.list", { limit: 100 }),
      state.client.request<{ policies?: IdentityPolicy[] }>("acl.policies.list", {}),
      state.client.request<{ candidates?: IdentityMergeCandidate[] }>("entities.merge.candidates", {
        limit: 100,
      }),
    ]);

    state.identityEntities = entitiesRes?.entities ?? [];
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

export function clearIdentityEntityDetail(state: IdentityState) {
  state.identitySelectedEntityId = null;
  state.identitySelectedEntity = null;
  state.identitySelectedEntityContacts = [];
  state.identityEntityDetailLoading = false;
  state.requestUpdate?.();
}

export async function loadIdentityEntityDetail(state: IdentityState, id: string) {
  if (!state.client) {
    state.identityError = "Runtime not connected.";
    return;
  }

  const trimmed = id.trim();
  if (!trimmed) {
    clearIdentityEntityDetail(state);
    return;
  }

  state.identitySelectedEntityId = trimmed;
  state.identityEntityDetailLoading = true;
  state.identityError = null;
  state.requestUpdate?.();

  try {
    const [entityRes, contactsRes] = await Promise.all([
      state.client.request<{ entity?: IdentityEntity }>("entities.get", { id: trimmed }),
      state.client.request<{ contacts?: IdentityContact[] }>("contacts.list", {
        entity_id: trimmed,
        limit: 200,
      }),
    ]);
    state.identitySelectedEntity = entityRes?.entity ?? null;
    state.identitySelectedEntityContacts = contactsRes?.contacts ?? [];
  } catch (error) {
    state.identityError = error instanceof Error ? error.message : String(error);
  } finally {
    state.identityEntityDetailLoading = false;
    state.requestUpdate?.();
  }
}

export function clearIdentityGroupDetail(state: IdentityState) {
  state.identitySelectedGroupId = null;
  state.identitySelectedGroup = null;
  state.identityGroupMembers = [];
  state.identityGroupDetailLoading = false;
  state.requestUpdate?.();
}

export async function loadIdentityGroupDetail(state: IdentityState, id: string) {
  if (!state.client) {
    state.identityError = "Runtime not connected.";
    return;
  }

  const trimmed = id.trim();
  if (!trimmed) {
    clearIdentityGroupDetail(state);
    return;
  }

  state.identitySelectedGroupId = trimmed;
  state.identityGroupDetailLoading = true;
  state.identityError = null;
  state.requestUpdate?.();

  try {
    const [groupRes, membersRes] = await Promise.all([
      state.client.request<{ group?: IdentityGroup }>("groups.get", { id: trimmed }),
      state.client.request<{ members?: IdentityGroupMember[] }>("groups.members.list", {
        group_id: trimmed,
      }),
    ]);
    state.identitySelectedGroup = groupRes?.group ?? null;
    state.identityGroupMembers = membersRes?.members ?? [];
  } catch (error) {
    state.identityError = error instanceof Error ? error.message : String(error);
  } finally {
    state.identityGroupDetailLoading = false;
    state.requestUpdate?.();
  }
}
