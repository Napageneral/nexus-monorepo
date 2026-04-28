import { afterEach, describe, expect, it, vi } from "vitest";
import { setNexChatEmbedConfig } from "./embed-config";
import { requestOrchestrationReadModelForLane, requestOrchestrationReplay } from "./chat-adapter";
import type { ChatLaneSummary, ChatReplayResult, ChatSnapshotResult, NexChatRuntimeBridge } from "./chat-types";

const echoLane: ChatLaneSummary = {
  lane_id: "lane:agent:entity-assistant",
  lane_mode: "agent",
  agent_id: "entity-assistant",
  session_id: "session:operator-chat:entity-assistant",
  parent_lane_id: null,
  conversation_scope_id: null,
  title: "Echo",
  subtitle: null,
  preview_text: null,
  run_state: "idle",
  updated_at: 1_777_326_053_814,
  unread_count: 0,
  can_send: true,
  can_abort: false,
};

describe("Nex chat adapter", () => {
  afterEach(() => {
    setNexChatEmbedConfig(null);
    vi.restoreAllMocks();
  });

  it("preserves every orchestration event derived from replayed chat events", async () => {
    const replay: ChatReplayResult = {
      latest_sequence: 42,
      reset_required: false,
      events: [
        {
          sequence: 42,
          event_name: "lane.state-changed",
          lane_id: echoLane.lane_id,
          occurred_at: 1_777_326_053_814,
          data: {
            lane_id: echoLane.lane_id,
            run_state: "idle",
            title: "Echo",
          },
        },
      ],
    };
    const requests: Array<{ method: string; params?: unknown }> = [];
    const bridge: NexChatRuntimeBridge = {
      request: async <T = unknown>(method: string, params?: unknown) => {
        requests.push({ method, params });
        return replay as T;
      },
      subscribe: vi.fn(() => () => {}),
    };
    setNexChatEmbedConfig({ bridge });

    const events = await requestOrchestrationReplay(41);

    expect(requests).toEqual([{ method: "chat.replay", params: { after_sequence: 41 } }]);
    expect(events.map((event) => event.type)).toEqual(["thread.session-set", "thread.meta-updated"]);
    expect(events.map((event) => event.sequence)).toEqual([42, 42]);
  });

  it("projects tool ledger messages as visible activities in snapshots", async () => {
    const snapshot: ChatSnapshotResult = {
      sequence: 44,
      default_lane_id: echoLane.lane_id,
      lanes: [echoLane],
      expanded_lane: {
        lane: echoLane,
        messages: [
          {
            id: "runtime-msg:user",
            lane_id: echoLane.lane_id,
            session_id: echoLane.session_id,
            turn_id: "turn:user",
            record_id: "record:user",
            role: "user",
            text: "please investigate this",
            created_at: 1_777_326_053_814,
          },
          {
            id: "msg:tool",
            lane_id: echoLane.lane_id,
            session_id: echoLane.session_id,
            turn_id: "turn:assistant",
            record_id: null,
            role: "tool",
            text: JSON.stringify(
              {
                status: "accepted",
                session_id: "session:worker",
                run_id: "run:worker",
                text: "Investigate the reported issue.",
              },
              null,
              2,
            ),
            created_at: 1_777_326_053_900,
          },
        ],
        activities: [],
        approvals: [],
        actions: [],
      },
    };
    const bridge: NexChatRuntimeBridge = {
      request: async <T = unknown>(method: string) => {
        expect(method).toBe("chat.snapshot");
        return snapshot as T;
      },
      subscribe: vi.fn(() => () => {}),
    };
    setNexChatEmbedConfig({ bridge });

    const model = await requestOrchestrationReadModelForLane(echoLane.lane_id);
    const thread = model.threads.find((candidate) => candidate.id === echoLane.lane_id);

    expect(thread?.messages.map((message) => message.role)).toEqual(["user"]);
    expect(thread?.activities).toHaveLength(1);
    expect(thread?.activities[0]?.summary).toBe("Worker dispatched");
    expect(thread?.activities[0]?.tone).toBe("tool");
    expect(thread?.activities[0]?.payload).toMatchObject({
      detail: "Investigate the reported issue.",
      sessionId: "session:worker",
      runId: "run:worker",
      toolTitle: "agents.dispatch",
    });
    expect(thread?.latestTurn?.turnId).toBe("turn:assistant");
  });

  it("does not render internal user control messages from snapshots", async () => {
    const snapshot: ChatSnapshotResult = {
      sequence: 44,
      default_lane_id: echoLane.lane_id,
      lanes: [echoLane],
      expanded_lane: {
        lane: echoLane,
        messages: [
          {
            id: "runtime-msg:human",
            lane_id: echoLane.lane_id,
            session_id: echoLane.session_id,
            turn_id: "turn:human",
            record_id: "record:human",
            client_message_id: "client:human",
            role: "user",
            text: "visible operator input",
            created_at: 1_777_326_053_814,
          },
          {
            id: "runtime-msg:control",
            lane_id: echoLane.lane_id,
            session_id: echoLane.session_id,
            turn_id: "turn:control",
            record_id: null,
            role: "user",
            text: "Child completion\nInternal handoff only: do not show this as operator chat.",
            created_at: 1_777_326_053_900,
          },
        ],
        activities: [],
        approvals: [],
        actions: [],
      },
    };
    const bridge: NexChatRuntimeBridge = {
      request: async <T = unknown>() => snapshot as T,
      subscribe: vi.fn(() => () => {}),
    };
    setNexChatEmbedConfig({ bridge });

    const model = await requestOrchestrationReadModelForLane(echoLane.lane_id);
    const thread = model.threads.find((candidate) => candidate.id === echoLane.lane_id);

    expect(thread?.messages.map((message) => message.text)).toEqual(["visible operator input"]);
  });

  it("uses the newest lane message for fallback latest turn state", async () => {
    const snapshot: ChatSnapshotResult = {
      sequence: 44,
      default_lane_id: echoLane.lane_id,
      lanes: [echoLane],
      expanded_lane: {
        lane: echoLane,
        messages: [
          {
            id: "msg:assistant",
            lane_id: echoLane.lane_id,
            session_id: echoLane.session_id,
            turn_id: "turn:old-assistant",
            record_id: "record:assistant",
            role: "assistant",
            text: "Test received.",
            created_at: 1_777_326_053_814,
          },
          {
            id: "runtime-msg:user",
            lane_id: echoLane.lane_id,
            session_id: echoLane.session_id,
            turn_id: "turn:latest-user",
            record_id: "record:user",
            role: "user",
            text: "please investigate this",
            created_at: 1_777_326_053_900,
          },
          {
            id: "msg:tool",
            lane_id: echoLane.lane_id,
            session_id: echoLane.session_id,
            turn_id: "turn:latest-tool",
            record_id: null,
            role: "tool",
            text: JSON.stringify({ status: "ok", silent_completion: true }),
            created_at: 1_777_326_054_000,
          },
        ],
        activities: [],
        approvals: [],
        actions: [],
      },
    };
    const bridge: NexChatRuntimeBridge = {
      request: async <T = unknown>() => snapshot as T,
      subscribe: vi.fn(() => () => {}),
    };
    setNexChatEmbedConfig({ bridge });

    const model = await requestOrchestrationReadModelForLane(echoLane.lane_id);
    const thread = model.threads.find((candidate) => candidate.id === echoLane.lane_id);

    expect(thread?.latestTurn?.turnId).toBe("turn:latest-tool");
  });

  it("projects replayed tool messages as activity events instead of hidden system messages", async () => {
    const replay: ChatReplayResult = {
      latest_sequence: 45,
      reset_required: false,
      events: [
        {
          sequence: 45,
          event_name: "message.appended",
          lane_id: echoLane.lane_id,
          occurred_at: 1_777_326_053_900,
          data: {
            id: "msg:wait",
            lane_id: echoLane.lane_id,
            turn_id: "turn:assistant",
            role: "tool",
            text: JSON.stringify(
              {
                status: "ok",
                silent_completion: true,
                reason: "Waiting for investigation worker findings before replying.",
              },
              null,
              2,
            ),
            created_at: 1_777_326_053_900,
          },
        },
      ],
    };
    const bridge: NexChatRuntimeBridge = {
      request: async <T = unknown>() => replay as T,
      subscribe: vi.fn(() => () => {}),
    };
    setNexChatEmbedConfig({ bridge });

    const events = await requestOrchestrationReplay(44);

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("thread.activity-appended");
    const [event] = events;
    if (event?.type !== "thread.activity-appended") {
      throw new Error("expected activity event");
    }
    expect(event.payload.activity.summary).toBe("Waiting for worker findings");
    expect(event.payload.activity.payload).toMatchObject({
      detail: "Waiting for investigation worker findings before replying.",
      status: "ok",
    });
  });

  it("does not replay internal user control messages as visible chat messages", async () => {
    const replay: ChatReplayResult = {
      latest_sequence: 46,
      reset_required: false,
      events: [
        {
          sequence: 46,
          event_name: "message.appended",
          lane_id: echoLane.lane_id,
          occurred_at: 1_777_326_053_900,
          data: {
            id: "runtime-msg:control",
            lane_id: echoLane.lane_id,
            turn_id: "turn:control",
            role: "user",
            text: "Child completion\nInternal handoff only: do not show this as operator chat.",
            created_at: 1_777_326_053_900,
          },
        },
      ],
    };
    const bridge: NexChatRuntimeBridge = {
      request: async <T = unknown>() => replay as T,
      subscribe: vi.fn(() => () => {}),
    };
    setNexChatEmbedConfig({ bridge });

    await expect(requestOrchestrationReplay(45)).resolves.toEqual([]);
  });
});
