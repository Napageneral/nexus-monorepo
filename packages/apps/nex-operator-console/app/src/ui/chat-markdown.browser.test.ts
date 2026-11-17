import { render } from "lit";
import { describe, expect, it } from "vitest";
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

describe("chat markdown rendering", () => {
  it("renders markdown inside the tool output sidebar", () => {
    const container = document.createElement("div");
    let sidebarContent: string | null = null;

    const draw = () => {
      render(
        renderChat(
          createProps({
            showThinking: true,
            messages: [
              {
                role: "assistant",
                content: [
                  { type: "toolcall", name: "noop", arguments: {} },
                  { type: "toolresult", name: "noop", text: "Hello **world**" },
                ],
                timestamp: 1,
              },
            ],
            sidebarOpen: sidebarContent !== null,
            sidebarContent,
            onOpenSidebar: (content) => {
              sidebarContent = content;
              draw();
            },
            onCloseSidebar: () => {
              sidebarContent = null;
              draw();
            },
          }),
        ),
        container,
      );
    };

    draw();

    const toolCard = Array.from(container.querySelectorAll<HTMLElement>(".chat-tool-card")).find(
      (card) => card.querySelector(".chat-tool-card__preview, .chat-tool-card__inline"),
    );
    expect(toolCard).not.toBeUndefined();
    toolCard?.click();

    const strong = container.querySelector(".sidebar-markdown strong");
    expect(strong?.textContent).toBe("world");
  });
});
