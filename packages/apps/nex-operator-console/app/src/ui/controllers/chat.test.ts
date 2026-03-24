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
    chatStream: null,
    chatStreamStartedAt: null,
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

  it("returns null for delta from another run", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-user",
      chatStream: "Hello",
    });
    const payload: ChatEventPayload = {
      runId: "run-announce",
      sessionKey: "main",
      state: "delta",
      message: { role: "assistant", content: [{ type: "text", text: "Done" }] },
    };
    expect(handleChatEvent(state, payload)).toBe(null);
    expect(state.chatRunId).toBe("run-user");
    expect(state.chatStream).toBe("Hello");
  });

  it("returns 'final' for final from another run (e.g. sub-agent announce) without clearing state", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-user",
      chatStream: "Working...",
      chatStreamStartedAt: 123,
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
    expect(state.chatStream).toBe("Working...");
    expect(state.chatStreamStartedAt).toBe(123);
  });

  it("processes final from own run and clears state", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "Reply",
      chatStreamStartedAt: 100,
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "final",
    };
    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatRunId).toBe(null);
    expect(state.chatStream).toBe(null);
    expect(state.chatStreamStartedAt).toBe(null);
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
      state: "delta",
      message: { role: "assistant", content: [{ type: "text", text: "Reply" }] },
    };
    expect(handleChatEvent(state, payload)).toBe("delta");
    expect(state.chatStream).toBe("Reply");
  });
});
