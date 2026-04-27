import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessagesTimeline } from "./MessagesTimeline";
import type { ChatLaneDetail } from "../../types";

function createLaneDetail(messageCount: number): ChatLaneDetail {
  return {
    lane: {
      lane_id: "lane:agent:manager",
      lane_mode: "agent",
      agent_id: "entity-manager",
      session_id: "session:manager",
      parent_lane_id: null,
      conversation_scope_id: null,
      title: "Manager",
      subtitle: null,
      preview_text: "Recent manager update",
      run_state: "idle",
      updated_at: messageCount,
      unread_count: 0,
      can_send: true,
      can_abort: false,
    },
    messages: Array.from({ length: messageCount }, (_, index) => ({
      id: `message-${index + 1}`,
      lane_id: "lane:agent:manager",
      session_id: "session:manager",
      turn_id: null,
      record_id: null,
      role: index % 2 === 0 ? "user" : "assistant",
      text: `Message ${index + 1}`,
      created_at: index + 1,
    })),
    activities: [],
    approvals: [],
    actions: [],
  };
}

describe("MessagesTimeline", () => {
  it("renders the recent transcript slice first and exposes an affordance to load older entries", () => {
    const markup = renderToStaticMarkup(
      <MessagesTimeline laneDetail={createLaneDetail(100)} />,
    );

    expect(markup).toContain("Showing the most recent 80 of 100 timeline items.");
    expect(markup).toContain("Show older");
    expect(markup).toContain("Show all");
    expect(markup).toContain("Message 100");
    expect(markup).not.toContain("Message 12");
  });
});
