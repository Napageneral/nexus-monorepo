import { describe, expect, it } from "vitest";
import { applyChatEvent, createInitialNexChatState, hydrateChatSnapshot } from "./chat-state";
import type { ChatSnapshotResult } from "./types";

const SNAPSHOT: ChatSnapshotResult = {
  sequence: 7,
  default_lane_id: "lane:agent:manager",
  lanes: [
    {
      lane_id: "lane:agent:manager",
      lane_mode: "agent",
      agent_id: "entity-manager",
      session_id: "session:manager",
      parent_lane_id: null,
      conversation_scope_id: null,
      title: "Manager",
      subtitle: null,
      preview_text: "preview",
      run_state: "idle",
      updated_at: 7,
      unread_count: 0,
      can_send: true,
      can_abort: false,
    },
  ],
  expanded_lane: {
    lane: {
      lane_id: "lane:agent:manager",
      lane_mode: "agent",
      agent_id: "entity-manager",
      session_id: "session:manager",
      parent_lane_id: null,
      conversation_scope_id: null,
      title: "Manager",
      subtitle: null,
      preview_text: "preview",
      run_state: "idle",
      updated_at: 7,
      unread_count: 0,
      can_send: true,
      can_abort: false,
    },
    messages: [],
    activities: [],
    approvals: [],
    actions: [],
  },
};

describe("chat-state", () => {
  it("hydrates the selected lane from snapshot", () => {
    const state = hydrateChatSnapshot(createInitialNexChatState(), SNAPSHOT);

    expect(state.sequence).toBe(7);
    expect(state.defaultLaneId).toBe("lane:agent:manager");
    expect(state.selectedLaneId).toBe("lane:agent:manager");
    expect(state.laneDetailsById["lane:agent:manager"]?.lane.title).toBe("Manager");
  });

  it("applies lane and message events", () => {
    let state = hydrateChatSnapshot(createInitialNexChatState(), SNAPSHOT);
    state = applyChatEvent(state, {
      sequence: 8,
      event_name: "lane.state-changed",
      lane_id: "lane:agent:manager",
      occurred_at: 8,
      data: {
        lane_id: "lane:agent:manager",
        title: "Manager",
        run_state: "running",
      },
    });
    state = applyChatEvent(state, {
      sequence: 9,
      event_name: "message.appended",
      lane_id: "lane:agent:manager",
      occurred_at: 9,
      data: {
        id: "m-1",
        lane_id: "lane:agent:manager",
        session_id: "session:manager",
        turn_id: "turn:1",
        record_id: "record:1",
        role: "assistant",
        text: "hello",
        created_at: 9,
      },
    });

    expect(state.lanes[0]?.run_state).toBe("running");
    expect(state.laneDetailsById["lane:agent:manager"]?.messages[0]?.text).toBe("hello");
  });
});
