import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarProvider } from "./ui/sidebar";
import { ChatView } from "./ChatView";
import type { ChatSnapshotResult } from "../types";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    useLocation: () => ({
      search: {
        lane: "lane:agent:manager",
      },
    }),
  };
});

const SNAPSHOT: ChatSnapshotResult = {
  sequence: 12,
  default_lane_id: "lane:agent:manager",
  lanes: [
    {
      lane_id: "lane:agent:manager",
      lane_mode: "agent",
      agent_id: "entity-manager",
      session_id: "session:manager",
      parent_lane_id: null,
      conversation_scope_id: "scope:direct:entity-manager:entity-casey",
      title: "Manager",
      subtitle: "Casey lane",
      preview_text: "Ready for review",
      run_state: "waiting_approval",
      updated_at: 12,
      unread_count: 0,
      can_send: true,
      can_abort: true,
    },
  ],
  expanded_lane: {
    lane: {
      lane_id: "lane:agent:manager",
      lane_mode: "agent",
      agent_id: "entity-manager",
      session_id: "session:manager",
      parent_lane_id: null,
      conversation_scope_id: "scope:direct:entity-manager:entity-casey",
      title: "Manager",
      subtitle: "Casey lane",
      preview_text: "Ready for review",
      run_state: "waiting_approval",
      updated_at: 12,
      unread_count: 0,
      can_send: true,
      can_abort: true,
    },
    messages: [
      {
        id: "message-1",
        lane_id: "lane:agent:manager",
        session_id: "session:manager",
        turn_id: "turn-1",
        record_id: "record-1",
        role: "user",
        text: "Send the update.",
        created_at: 10,
      },
    ],
    activities: [],
    approvals: [
      {
        id: "approval-1",
        lane_id: "lane:agent:manager",
        request_type: "filesystem.write",
        status: "pending",
        summary: "Approve the update before sending.",
        created_at: 11,
        expires_at: null,
        resolved_at: null,
      },
    ],
    actions: [],
    conversation_context: {
      conversation_scope_id: "scope:direct:entity-manager:entity-casey",
      conversation_ids: ["conversation:imessage:casey"],
      records: [
        {
          id: "record-1",
          channel: "imessage",
          sender_entity_id: "entity-casey",
          receiver_entity_id: "entity-manager",
          text: "Any update on my order?",
          timestamp: 9,
        },
      ],
      delivery_targets: [
        {
          target_id: "conversation:imessage:casey",
          channel: "imessage",
          label: "Casey (imessage)",
          selected: true,
        },
      ],
    },
  },
};

vi.mock("../chat-runtime", () => ({
  useNexChatState: () => ({
    status: "ready",
    sequence: SNAPSHOT.sequence,
    defaultLaneId: SNAPSHOT.default_lane_id,
    selectedLaneId: SNAPSHOT.expanded_lane?.lane.lane_id ?? null,
    lanes: SNAPSHOT.lanes,
    laneDetailsById: {
      "lane:agent:manager": SNAPSHOT.expanded_lane,
    },
    lastError: null,
  }),
  useNexChatActions: () => ({
    selectLane() {},
    loadLane: async () => {},
    sendMessage: async () => {},
    abortLane: async () => {},
    selectDeliveryTarget: async () => {},
    respondToApproval: async () => {},
    createLaneAction: async () => {},
    updateLaneAction: async () => {},
    deleteLaneAction: async () => {},
    invokeLaneAction: async () => {},
  }),
}));

describe("ChatView", () => {
  it("renders approval actions and keeps the context rail hidden by default", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <ChatView />
      </SidebarProvider>,
    );

    expect(markup).toContain("Pending Approval");
    expect(markup).toContain("Approve the update before sending.");
    expect(markup).toContain("chat-context-toggle");
    expect(markup).not.toContain("Linked public context");
    expect(markup).not.toContain("Any update on my order?");
  });
});
