import { describe, expect, it } from "vitest";
import { buildLaneGroups, getVisibleLaneIds } from "./Sidebar.logic";
import type { ChatLaneSummary } from "../types";

const LANES: ChatLaneSummary[] = [
  {
    lane_id: "lane:agent:manager",
    lane_mode: "agent",
    agent_id: "entity-manager",
    session_id: "session:manager",
    parent_lane_id: null,
    conversation_scope_id: null,
    title: "Manager",
    subtitle: "Direct lane",
    preview_text: "Recent manager update",
    run_state: "idle",
    updated_at: 50,
    unread_count: 0,
    can_send: true,
    can_abort: false,
  },
  {
    lane_id: "lane:worker:one",
    lane_mode: "worker_session",
    agent_id: "entity-worker-one",
    session_id: "session:worker-one",
    parent_lane_id: "lane:agent:manager",
    conversation_scope_id: null,
    title: "Worker One",
    subtitle: null,
    preview_text: "Recent worker update",
    run_state: "running",
    updated_at: 40,
    unread_count: 0,
    can_send: true,
    can_abort: true,
  },
  {
    lane_id: "lane:worker:two",
    lane_mode: "worker_session",
    agent_id: "entity-worker-two",
    session_id: "session:worker-two",
    parent_lane_id: "lane:agent:manager",
    conversation_scope_id: null,
    title: "Worker Two",
    subtitle: null,
    preview_text: "Another worker update",
    run_state: "idle",
    updated_at: 30,
    unread_count: 0,
    can_send: true,
    can_abort: false,
  },
];

describe("Sidebar.logic", () => {
  it("keeps the direct manager lane as the group row and nests only workers beneath it", () => {
    const groups = buildLaneGroups(LANES);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.group_lane_id).toBe("lane:agent:manager");
    expect(groups[0]?.header_title).toBe("Manager");
    expect(groups[0]?.worker_lanes.map((lane) => lane.lane_id)).toEqual([
      "lane:worker:one",
      "lane:worker:two",
    ]);
  });

  it("only exposes worker lanes to keyboard navigation when their parent agent is expanded", () => {
    const groups = buildLaneGroups(LANES);

    expect(getVisibleLaneIds(groups, {})).toEqual(["lane:agent:manager"]);
    expect(getVisibleLaneIds(groups, { "lane:agent:manager": true })).toEqual([
      "lane:agent:manager",
      "lane:worker:one",
      "lane:worker:two",
    ]);
  });
});
