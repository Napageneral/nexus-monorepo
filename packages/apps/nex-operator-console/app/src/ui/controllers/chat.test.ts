import { describe, expect, it } from "vitest";
import type { SessionsListResult } from "../types.ts";
import { handleChatEvent, type ChatEventPayload, type ChatState } from "./chat.ts";

function createSessionsResult(
  entries: Array<{ key: string; conversationId?: string }> = [
    { key: "main", conversationId: "conversation:1" },
  ],
): SessionsListResult {
  return {
    ts: 0,
    path: "",
    count: entries.length,
    defaults: { model: null, contextTokens: null },
    sessions: entries.map((entry) => ({
      key: entry.key,
      kind: "direct",
      conversationId: entry.conversationId,
      updatedAt: null,
    })),
  };
}

function createState(overrides: Partial<ChatState> = {}): ChatState {
  return {
    chatAttachments: [],
    chatLoading: false,
    chatMessage: "",
    chatMessages: [],
    chatRunId: null,
    chatSending: false,
    chatThinkingLevel: null,
    client: null,
    connected: true,
    conversationId: "conversation:1",
    lastError: null,
    sessionKey: "main",
    sessionsResult: createSessionsResult(),
    ...overrides,
  };
}

describe("handleChatEvent", () => {
  it("returns null when payload is missing", () => {
    const state = createState();
    expect(handleChatEvent(state, undefined)).toBe(null);
  });

  it("returns null when sessionKey does not match", () => {
    const state = createState({
      conversationId: "conversation:1",
      sessionKey: "main",
      sessionsResult: createSessionsResult([{ key: "main", conversationId: "conversation:1" }]),
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "other",
      state: "final",
    };
    expect(handleChatEvent(state, payload)).toBe(null);
  });

  it("returns 'final' for final from another run when the conversation still owns it", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-user",
    });
    const payload: ChatEventPayload = {
      runId: "run-announce",
      sessionKey: "main",
      state: "final",
      message: { role: "assistant", content: [{ type: "text", text: "Done" }] },
    };
    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatRunId).toBe("run-user");
  });

  it("returns 'final' for final from another run (e.g. sub-agent announce) without clearing state", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-user",
    });
    const payload: ChatEventPayload = {
      runId: "run-announce",
      sessionKey: "main",
      state: "final",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Sub-agent findings" }],
      },
    };
    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatRunId).toBe("run-user");
  });

  it("processes final from own run and clears state", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "final",
    };
    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatRunId).toBe(null);
  });

  it("accepts events for the active run even when the session key rotated", () => {
    const state = createState({
      sessionKey: "old-session",
      chatRunId: "run-1",
      sessionsResult: createSessionsResult([
        { key: "old-session", conversationId: "conversation:1" },
      ]),
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "new-session",
      state: "final",
    };
    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatRunId).toBe(null);
  });
});
