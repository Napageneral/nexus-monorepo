import type { RuntimeBrowserClient } from "../runtime.ts";
import type { UiSettings } from "../storage.ts";
import type { ConversationsListResult } from "../types.ts";

export type ConversationsState = {
  client: RuntimeBrowserClient | null;
  connected: boolean;
  conversationsLoading: boolean;
  conversationsResult: ConversationsListResult | null;
  conversationsError: string | null;
  conversationId: string;
  sessionKey?: string;
  settings?: UiSettings;
  applySettings?: (next: UiSettings) => void;
};

function applyConversationSelection(
  state: ConversationsState,
  conversationId: string,
  updateSettings: boolean,
) {
  state.conversationId = conversationId;
  if ("sessionKey" in state) {
    state.sessionKey = "";
  }
  if (updateSettings && state.settings && typeof state.applySettings === "function") {
    state.applySettings({
      ...state.settings,
      conversationId,
    });
  } else if (updateSettings && state.settings) {
    state.settings.conversationId = conversationId;
  }
}

export async function loadConversations(state: ConversationsState, limit = 200) {
  if (!state.client || !state.connected || state.conversationsLoading) {
    return;
  }
  state.conversationsLoading = true;
  state.conversationsError = null;
  try {
    const result = await state.client.request<ConversationsListResult>(
      "agents.conversations.list",
      {
        limit,
      },
    );
    const conversations = Array.isArray(result.conversations) ? result.conversations : [];
    state.conversationsResult = { conversations };
    if (conversations.length === 0) {
      applyConversationSelection(state, "", true);
      return;
    }
    const currentConversationId = state.conversationId.trim();
    const hasCurrentConversation = currentConversationId
      ? conversations.some((conversation) => conversation.id === currentConversationId)
      : false;
    if (!hasCurrentConversation) {
      applyConversationSelection(state, conversations[0].id, true);
    }
  } catch (error) {
    state.conversationsError = String(error);
  } finally {
    state.conversationsLoading = false;
  }
}
