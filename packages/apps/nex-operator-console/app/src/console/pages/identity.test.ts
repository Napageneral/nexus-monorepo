import { render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderIdentityPage, type IdentityPageProps } from "./identity.ts";

function createProps(overrides: Partial<IdentityPageProps> = {}): IdentityPageProps {
  return {
    subTab: "entities",
    onSubTabChange: vi.fn(),
    loading: false,
    error: null,
    entityRouteMode: false,
    groupRouteMode: false,
    onBackToEntities: vi.fn(),
    onBackToGroups: vi.fn(),
    entities: [],
    selectedEntityId: null,
    selectedEntity: null,
    selectedEntityContacts: [],
    entityDetailLoading: false,
    onEntitySelect: vi.fn(),
    onEntityClear: vi.fn(),
    contacts: [],
    channels: [],
    groups: [],
    selectedGroupId: null,
    selectedGroup: null,
    groupMembers: [],
    groupDetailLoading: false,
    onGroupSelect: vi.fn(),
    onGroupClear: vi.fn(),
    policies: [],
    mergeCandidates: [],
    mergeBusyId: null,
    onResolveMerge: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("renderIdentityPage", () => {
  it("renders a dedicated entity route view with matching channels", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderIdentityPage(
        createProps({
          entityRouteMode: true,
          selectedEntityId: "entity-casey",
          selectedEntity: {
            id: "entity-casey",
            name: "Casey Adams",
            type: "person",
            origin: "adapter",
          },
          selectedEntityContacts: [
            {
              id: "contact-1",
              contact_name: "Casey Adams",
              contact_id: "+16319056994",
              platform: "imessage",
              canonical_entity_id: "entity-casey",
            },
          ],
          channels: [
            {
              id: "channel-1",
              platform: "imessage",
              connection_id: "conn-eve",
              container_id: "+16319056994",
              thread_name: "Casey Adams",
            },
          ],
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Back to entities");
    expect(container.textContent).toContain("Casey Adams");
    expect(container.textContent).toContain("Matching channels");
    expect(container.textContent).toContain("1 linked contacts");
    expect(container.textContent).toContain("1 matching channels");
  });

  it("renders contacts identifier-first and normalizes phone-like platforms", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderIdentityPage(
        createProps({
          subTab: "contacts",
          entities: [{ id: "entity-casey", name: "Casey Adams", type: "person", origin: "adapter" }],
          contacts: [
            {
              id: "contact-1",
              contact_name: "Casey Adams",
              contact_id: "+16319056994",
              platform: "sms",
              canonical_entity_id: "entity-casey",
              origin: "adapter",
            },
          ],
        }),
      ),
      container,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("Identifier");
    expect(text).toContain("+16319056994");
    expect(text).toContain("phone");
    expect(text).toContain("Casey Adams");
  });

  it("renders channels with address-first readability and connection metadata", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderIdentityPage(
        createProps({
          subTab: "channels",
          channels: [
            {
              id: "channel-1",
              platform: "imessage",
              connection_id: "conn-eve-123456",
              container_id: "+16319056994",
              container_kind: "direct",
              thread_name: "Casey Adams",
              space_name: "Messages",
            },
          ],
        }),
      ),
      container,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("Address");
    expect(text).toContain("Connection · Channel ID");
    expect(text).toContain("+16319056994");
    expect(text).toContain("Casey Adams");
    expect(text).toContain("direct");
  });

  it("renders owner-group explanation copy when the Owner group is selected", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderIdentityPage(
        createProps({
          subTab: "groups",
          groupRouteMode: true,
          selectedGroupId: "group-owner",
          selectedGroup: {
            id: "group-owner",
            name: "Owner",
            member_count: 16,
            description: "Role group for the current owner of this runtime.",
          },
          groupMembers: [
            {
              id: "member-1",
              group_id: "group-owner",
              entity_id: "entity-1",
              entity_name: "Tyler Brandt",
              entity_type: "person",
              role: "owner",
            },
          ],
        }),
      ),
      container,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("Why does Owner have 16 members?");
    expect(text).toContain("owner-level access");
  });

  it("renders a dedicated group route view with back navigation", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderIdentityPage(
        createProps({
          subTab: "groups",
          groupRouteMode: true,
          selectedGroupId: "group-owner",
          selectedGroup: {
            id: "group-owner",
            name: "Owner",
            member_count: 2,
            description: "Role group for the current owner of this runtime.",
          },
          groupMembers: [
            {
              id: "member-1",
              entity_id: "entity-1",
              entity_name: "Tyler Brandt",
              entity_type: "person",
              role: "owner",
            },
            {
              id: "member-2",
              entity_id: "entity-2",
              entity_name: "Synthetic Proof",
              entity_type: "person",
              role: "owner",
            },
          ],
        }),
      ),
      container,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("Back to groups");
    expect(text).toContain("Dedicated group detail view");
    expect(text).toContain("2 person");
  });
});
