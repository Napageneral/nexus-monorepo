import { describe, expect, it, vi } from "vitest";
import {
  loadIdentitySurface,
  resolveIdentityMergeCandidate,
  type IdentityChannel,
  type IdentityContact,
  type IdentityGroup,
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
    identityContacts: [] as IdentityContact[],
    identityChannels: [] as IdentityChannel[],
    identityGroups: [] as IdentityGroup[],
    identityPolicies: [] as IdentityPolicy[],
    identityMergeCandidates: [] as IdentityMergeCandidate[],
  };
}

describe("identity controller", () => {
  it("loads canonical identity surfaces together", async () => {
    const request = vi.fn(async (method: string) => {
      switch (method) {
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
      "contacts.list",
      "channels.list",
      "groups.list",
      "acl.policies.list",
      "entities.merge.candidates",
    ]);
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
});
