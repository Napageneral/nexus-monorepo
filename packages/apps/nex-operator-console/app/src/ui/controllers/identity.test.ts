import { describe, expect, it, vi } from "vitest";
import {
  clearIdentityEntityDetail,
  clearIdentityGroupDetail,
  loadIdentitySurface,
  loadIdentityEntityDetail,
  loadIdentityGroupDetail,
  resolveIdentityMergeCandidate,
  type IdentityEntity,
  type IdentityChannel,
  type IdentityContact,
  type IdentityGroup,
  type IdentityGroupMember,
  type IdentityMergeCandidate,
  type IdentityPolicy,
} from "./identity.ts";

function createState(request: (method: string, params?: unknown) => Promise<unknown>) {
  return {
    client: {
      request: request as <T>(method: string, params?: unknown) => Promise<T>,
    },
    identityLoading: false,
    identityError: null as string | null,
    identityMergeBusyId: null as string | null,
    identityEntities: [] as IdentityEntity[],
    identityContacts: [] as IdentityContact[],
    identityChannels: [] as IdentityChannel[],
    identityGroups: [] as IdentityGroup[],
    identityPolicies: [] as IdentityPolicy[],
    identityMergeCandidates: [] as IdentityMergeCandidate[],
    identitySelectedEntityId: null as string | null,
    identitySelectedEntity: null as IdentityEntity | null,
    identitySelectedEntityContacts: [] as IdentityContact[],
    identityEntityDetailLoading: false,
    identitySelectedGroupId: null as string | null,
    identitySelectedGroup: null as IdentityGroup | null,
    identityGroupMembers: [] as IdentityGroupMember[],
    identityGroupDetailLoading: false,
    requestUpdate: vi.fn(),
  };
}

describe("identity controller", () => {
  it("loads canonical identity surfaces together", async () => {
    const request = vi.fn(async (method: string) => {
      switch (method) {
        case "entities.list":
          return { entities: [{ id: "entity-1", name: "Tyler", type: "person" }] };
        case "contacts.list":
          return { contacts: [{ id: "contact-1", contact_name: "Tyler" }] };
        case "channels.list":
          return { channels: [{ id: "channel-1", platform: "slack" }] };
        case "groups.list":
          return { groups: [{ id: "group-1", name: "Operators", member_count: 2 }] };
        case "acl.policies.list":
          return { policies: [{ id: "policy-1", name: "Allow Ops", enabled: true }] };
        case "entities.merge.candidates":
          return { candidates: [{ id: "merge-1", source_entity_id: "a", target_entity_id: "b" }] };
        default:
          throw new Error(`unexpected method: ${method}`);
      }
    });

    const state = createState(request);
    await loadIdentitySurface(state);

    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "entities.list",
      "contacts.list",
      "channels.list",
      "groups.list",
      "acl.policies.list",
      "entities.merge.candidates",
    ]);
    expect(state.identityEntities).toHaveLength(1);
    expect(state.identityContacts).toHaveLength(1);
    expect(state.identityChannels).toHaveLength(1);
    expect(state.identityGroups).toHaveLength(1);
    expect(state.identityPolicies).toHaveLength(1);
    expect(state.identityMergeCandidates).toHaveLength(1);
    expect(state.identityError).toBeNull();
    expect(state.identityLoading).toBe(false);
  });

  it("resolves a merge candidate and refreshes the identity surface", async () => {
    const request = vi.fn(async (method: string) => {
      switch (method) {
        case "entities.merge.resolve":
          return { candidate: { id: "merge-1", status: "approved" }, merged: true };
        case "entities.list":
          return { entities: [{ id: "entity-1", name: "Tyler", type: "person" }] };
        case "contacts.list":
          return { contacts: [{ id: "contact-1", contact_name: "Tyler" }] };
        case "channels.list":
          return { channels: [{ id: "channel-1", platform: "slack" }] };
        case "groups.list":
          return { groups: [{ id: "group-1", name: "Operators", member_count: 2 }] };
        case "acl.policies.list":
          return { policies: [{ id: "policy-1", name: "Allow Ops", enabled: true }] };
        case "entities.merge.candidates":
          return { candidates: [] };
        default:
          throw new Error(`unexpected method: ${method}`);
      }
    });

    const state = createState(request);
    await resolveIdentityMergeCandidate(state, "merge-1", "approved");

    expect(request.mock.calls).toEqual([
      ["entities.merge.resolve", { id: "merge-1", status: "approved" }],
      ["entities.list", { limit: 100 }],
      ["contacts.list", { limit: 100 }],
      ["channels.list", { limit: 100 }],
      ["groups.list", { limit: 100 }],
      ["acl.policies.list", {}],
      ["entities.merge.candidates", { limit: 100 }],
    ]);
    expect(state.identityMergeBusyId).toBeNull();
    expect(state.identityMergeCandidates).toEqual([]);
    expect(state.identityError).toBeNull();
  });

  it("loads entity detail with canonical contacts", async () => {
    const request = vi.fn(async (method: string, params?: unknown) => {
      switch (method) {
        case "entities.get":
          return { entity: { id: "entity-1", name: "Tyler", type: "person" } };
        case "contacts.list":
          expect(params).toEqual({ entity_id: "entity-1", limit: 200 });
          return {
            contacts: [
              {
                id: "contact-1",
                canonical_entity_id: "entity-1",
                observed_entity_id: "entity-1",
                platform: "imessage",
                contact_id: "+17072876731",
              },
            ],
          };
        default:
          throw new Error(`unexpected method: ${method}`);
      }
    });

    const state = createState(request);
    await loadIdentityEntityDetail(state, "entity-1");

    expect(state.identitySelectedEntityId).toBe("entity-1");
    expect(state.identitySelectedEntity?.name).toBe("Tyler");
    expect(state.identitySelectedEntityContacts).toHaveLength(1);
    expect(state.identityEntityDetailLoading).toBe(false);
  });

  it("loads group detail with members", async () => {
    const request = vi.fn(async (method: string, params?: unknown) => {
      switch (method) {
        case "groups.get":
          expect(params).toEqual({ id: "group-owner" });
          return { group: { id: "group-owner", name: "Owner", member_count: 2 } };
        case "groups.members.list":
          expect(params).toEqual({ group_id: "group-owner" });
          return {
            members: [
              {
                id: "member-1",
                group_id: "group-owner",
                entity_id: "entity-1",
                entity_name: "Tyler Brandt",
                entity_type: "person",
                role: "owner",
              },
            ],
          };
        default:
          throw new Error(`unexpected method: ${method}`);
      }
    });

    const state = createState(request);
    await loadIdentityGroupDetail(state, "group-owner");

    expect(state.identitySelectedGroupId).toBe("group-owner");
    expect(state.identitySelectedGroup?.name).toBe("Owner");
    expect(state.identityGroupMembers).toHaveLength(1);
    expect(state.identityGroupDetailLoading).toBe(false);
  });

  it("clears selected identity detail", () => {
    const state = createState(vi.fn());
    state.identitySelectedEntityId = "entity-1";
    state.identitySelectedEntity = { id: "entity-1", name: "Tyler" };
    state.identitySelectedEntityContacts = [{ id: "contact-1" }];
    state.identitySelectedGroupId = "group-owner";
    state.identitySelectedGroup = { id: "group-owner", name: "Owner" };
    state.identityGroupMembers = [{ id: "member-1" }];

    clearIdentityEntityDetail(state);
    clearIdentityGroupDetail(state);

    expect(state.identitySelectedEntityId).toBeNull();
    expect(state.identitySelectedEntity).toBeNull();
    expect(state.identitySelectedEntityContacts).toEqual([]);
    expect(state.identitySelectedGroupId).toBeNull();
    expect(state.identitySelectedGroup).toBeNull();
    expect(state.identityGroupMembers).toEqual([]);
  });
});
