import type { RuntimeBrowserClient } from "../runtime.ts";
import type { SessionsListResult } from "../types.ts";
import type { ChatAttachment } from "../ui-types.ts";
import { sessionBelongsToConversation } from "../conversation-session.ts";
import { generateUUID } from "../uuid.ts";

export type ChatState = {
  client: RuntimeBrowserClient | null;
  connected: boolean;
  conversationId: string;
  sessionKey: string;
  sessionsResult?: SessionsListResult | null;
  chatLoading: boolean;
  chatMessages: unknown[];
  chatThinkingLevel: string | null;
  chatSending: boolean;
  chatMessage: string;
  chatAttachments: ChatAttachment[];
  chatRunId: string | null;
  lastError: string | null;
};

export type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

function resolveConversationId(state: ChatState): string | null {
  const conversationId = state.conversationId.trim();
  return conversationId || null;
}

function shouldAcceptChatEvent(state: ChatState, payload: ChatEventPayload): boolean {
  if (state.chatRunId && payload.runId === state.chatRunId) {
    return true;
  }
  return sessionBelongsToConversation(
    state.sessionsResult,
    state.conversationId,
    payload.sessionKey,
  );
}

export async function loadChatHistory(state: ChatState) {
  if (!state.client || !state.connected) {
    return;
  }
  const conversationId = resolveConversationId(state);
  if (!conversationId) {
    state.chatMessages = [];
    state.chatThinkingLevel = null;
    state.lastError = "No active conversation selected.";
    return;
  }
  state.chatLoading = true;
  state.lastError = null;
  try {
    const res = await state.client.request<{
      records?: Array<unknown>;
      messages?: Array<unknown>;
      thinkingLevel?: string;
    }>("agents.conversations.history", {
      conversation_id: conversationId,
      limit: 200,
    });
    state.chatMessages = Array.isArray(res.records)
      ? res.records
      : Array.isArray(res.messages)
        ? res.messages
        : [];
    state.chatThinkingLevel = res.thinkingLevel ?? null;
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.chatLoading = false;
  }
}

function dataUrlToBase64(dataUrl: string): { content: string; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return null;
  }
  return { mimeType: match[1], content: match[2] };
}

export async function sendChatMessage(
  state: ChatState,
  message: string,
  attachments?: ChatAttachment[],
): Promise<string | null> {
  if (!state.client || !state.connected) {
    return null;
  }
  const msg = message.trim();
  const hasAttachments = attachments && attachments.length > 0;
  if (!msg && !hasAttachments) {
    return null;
  }
  const conversationId = resolveConversationId(state);
  if (!conversationId) {
    state.lastError = "No active conversation selected.";
    return null;
  }

  const now = Date.now();

  // Build user message content blocks
  const contentBlocks: Array<{ type: string; text?: string; source?: unknown }> = [];
  if (msg) {
    contentBlocks.push({ type: "text", text: msg });
  }
  // Add image previews to the message for display
  if (hasAttachments) {
    for (const att of attachments) {
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: att.mimeType, data: att.dataUrl },
      });
    }
  }

  state.chatMessages = [
    ...state.chatMessages,
    {
      role: "user",
      content: contentBlocks,
      timestamp: now,
    },
  ];

  state.chatSending = true;
  state.lastError = null;
  const runId = generateUUID();
  state.chatRunId = runId;

  // Convert attachments to API format
  const apiAttachments = hasAttachments
    ? attachments
        .map((att) => {
          const parsed = dataUrlToBase64(att.dataUrl);
          if (!parsed) {
            return null;
          }
          return {
            type: "image",
            mimeType: parsed.mimeType,
            content: parsed.content,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null)
    : undefined;

  try {
    await state.client.request("agents.conversations.send", {
      conversation_id: conversationId,
      message: msg,
      deliver: false,
      idempotencyKey: runId,
      attachments: apiAttachments,
    });
    return runId;
  } catch (err) {
    const error = String(err);
    state.chatRunId = null;
    state.lastError = error;
    state.chatMessages = [
      ...state.chatMessages,
      {
        role: "assistant",
        content: [{ type: "text", text: "Error: " + error }],
        timestamp: Date.now(),
      },
    ];
    return null;
  } finally {
    state.chatSending = false;
  }
}

export async function abortChatRun(state: ChatState): Promise<boolean> {
  if (!state.client || !state.connected) {
    return false;
  }
  const runId = state.chatRunId;
  const conversationId = resolveConversationId(state);
  if (!conversationId) {
    state.lastError = "No active conversation selected.";
    return false;
  }
  try {
    await state.client.request(
      "agents.conversations.abort",
      runId ? { conversation_id: conversationId, runId } : { conversation_id: conversationId },
    );
    return true;
  } catch (err) {
    state.lastError = String(err);
    return false;
  }
}

export function handleChatEvent(state: ChatState, payload?: ChatEventPayload) {
  if (!payload) {
    return null;
  }
  if (!shouldAcceptChatEvent(state, payload)) {
    return null;
  }

  // Final from another run (e.g. sub-agent announce): refresh history to show new message.
  // See https://github.com/nexus/nexus/issues/1909
  if (payload.runId && state.chatRunId && payload.runId !== state.chatRunId) {
    if (payload.state === "final") {
      return "final";
    }
    return null;
  }

  if (payload.state === "final") {
    state.chatRunId = null;
  } else if (payload.state === "aborted") {
    state.chatRunId = null;
  } else if (payload.state === "error") {
    state.chatRunId = null;
    state.lastError = payload.errorMessage ?? "chat error";
  }
  return payload.state;
}
