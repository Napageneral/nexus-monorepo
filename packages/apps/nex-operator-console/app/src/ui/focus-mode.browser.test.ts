import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { renderChat, type ChatProps } from "./views/chat.ts";

function createProps(overrides: Partial<ChatProps> = {}): ChatProps {
  return {
    conversationId: "",
    onConversationIdChange: () => undefined,
    thinkingLevel: null,
    showThinking: false,
    loading: false,
    sending: false,
    messages: [],
    toolMessages: [],
    stream: null,
    streamStartedAt: null,
    draft: "",
    queue: [],
    connected: true,
    canSend: true,
    disabledReason: null,
    error: null,
    conversations: null,
    sessions: null,
    focusMode: false,
    assistantName: "Nexus",
    assistantAvatar: null,
    onRefresh: () => undefined,
    onToggleFocusMode: () => undefined,
    onDraftChange: () => undefined,
    onSend: () => undefined,
    onQueueRemove: () => undefined,
    onNewSession: () => undefined,
    ...overrides,
  };
}

describe("chat focus mode", () => {
  it("renders its explicit exit control only while focus mode is active", () => {
    const container = document.createElement("div");
    const onToggleFocusMode = vi.fn();

    render(renderChat(createProps({ focusMode: false, onToggleFocusMode })), container);
    expect(container.querySelector('button[title="Exit focus mode"]')).toBeNull();

    render(renderChat(createProps({ focusMode: true, onToggleFocusMode })), container);
    const exitButton = container.querySelector<HTMLButtonElement>('button[title="Exit focus mode"]');
    expect(exitButton).not.toBeNull();

    exitButton?.click();
    expect(onToggleFocusMode).toHaveBeenCalledTimes(1);
  });
});
