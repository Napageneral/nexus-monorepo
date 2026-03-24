import type { RuntimeBrowserClient } from "../runtime.ts";
import type { UiSettings } from "../storage.ts";
import type { SessionsListResult } from "../types.ts";
import { resolveConversationSessionKey } from "../conversation-session.ts";
import { toNumber } from "../format.ts";

export type SessionsState = {
  client: RuntimeBrowserClient | null;
  connected: boolean;
  sessionsLoading: boolean;
  sessionsResult: SessionsListResult | null;
  sessionsError: string | null;
  sessionsFilterActive: string;
  sessionsFilterLimit: string;
  sessionsIncludeGlobal: boolean;
  sessionsIncludeUnknown: boolean;
  conversationId?: string;
  sessionKey?: string;
  settings?: UiSettings;
  applySettings?: (next: UiSettings) => void;
};

export async function loadSessions(
  state: SessionsState,
  overrides?: {
    activeMinutes?: number;
    limit?: number;
    includeGlobal?: boolean;
    includeUnknown?: boolean;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.sessionsLoading) {
    return;
  }
  state.sessionsLoading = true;
  state.sessionsError = null;
  try {
    const includeGlobal = overrides?.includeGlobal ?? state.sessionsIncludeGlobal;
    const includeUnknown = overrides?.includeUnknown ?? state.sessionsIncludeUnknown;
    const activeMinutes = overrides?.activeMinutes ?? toNumber(state.sessionsFilterActive, 0);
    const limit = overrides?.limit ?? toNumber(state.sessionsFilterLimit, 0);
    const params: Record<string, unknown> = {
      includeGlobal,
      includeUnknown,
    };
    if (activeMinutes > 0) {
      params.activeMinutes = activeMinutes;
    }
    if (limit > 0) {
      params.limit = limit;
    }
    const res = await state.client.request<SessionsListResult | undefined>(
      "agents.sessions.list",
      params,
    );
    if (res) {
      state.sessionsResult = res;
      const sessions = Array.isArray(res.sessions) ? res.sessions : [];
      if (sessions.length > 0) {
        const currentConversationId = state.conversationId?.trim() ?? "";
        const matchingConversationSession = currentConversationId
          ? sessions.find((session) => session.conversationId === currentConversationId)
          : undefined;
        const currentSessionKey = state.sessionKey?.trim() ?? "";
        const expectedConversationSessionKey = resolveConversationSessionKey(
          res,
          currentConversationId,
        );
        const hasCurrent = currentSessionKey
          ? sessions.some((session) => session.key === currentSessionKey)
          : false;
        if (matchingConversationSession) {
          const nextSessionKey = matchingConversationSession.key;
          state.sessionKey = nextSessionKey;
          if (state.settings && state.settings.lastActiveSessionKey !== nextSessionKey) {
            if (typeof state.applySettings === "function") {
              state.applySettings({
                ...state.settings,
                lastActiveSessionKey: nextSessionKey,
              });
            } else {
              state.settings.lastActiveSessionKey = nextSessionKey;
            }
          }
        } else if (currentConversationId) {
          state.sessionKey = "";
        } else if (
          !hasCurrent ||
          (expectedConversationSessionKey && currentSessionKey !== expectedConversationSessionKey)
        ) {
          const firstConversationSession = sessions.find((session) =>
            session.conversationId?.trim(),
          );
          const nextSession = firstConversationSession ?? sessions[0];
          const nextSessionKey = nextSession.key;
          state.sessionKey = nextSessionKey;
          if (nextSession.conversationId) {
            state.conversationId = nextSession.conversationId;
          }
          if (state.settings && typeof state.applySettings === "function") {
            state.applySettings({
              ...state.settings,
              conversationId: nextSession.conversationId?.trim() || state.settings.conversationId,
              lastActiveSessionKey: nextSessionKey,
            });
          } else if (state.settings) {
            if (nextSession.conversationId) {
              state.settings.conversationId = nextSession.conversationId;
            }
            state.settings.lastActiveSessionKey = nextSessionKey;
          }
        }
      }
    }
  } catch (err) {
    state.sessionsError = String(err);
  } finally {
    state.sessionsLoading = false;
  }
}

export async function patchSession(
  state: SessionsState,
  key: string,
  patch: {
    label?: string | null;
    thinkingLevel?: string | null;
    verboseLevel?: string | null;
    reasoningLevel?: string | null;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }
  const params: Record<string, unknown> = { key };
  if ("label" in patch) {
    params.label = patch.label;
  }
  if ("thinkingLevel" in patch) {
    params.thinkingLevel = patch.thinkingLevel;
  }
  if ("verboseLevel" in patch) {
    params.verboseLevel = patch.verboseLevel;
  }
  if ("reasoningLevel" in patch) {
    params.reasoningLevel = patch.reasoningLevel;
  }
  try {
    await state.client.request("agents.sessions.patch", params);
    await loadSessions(state);
  } catch (err) {
    state.sessionsError = String(err);
  }
}

export async function deleteSession(state: SessionsState, key: string) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.sessionsLoading) {
    return;
  }
  const confirmed = window.confirm(
    `Delete session "${key}"?\n\nDeletes the session entry and archives its transcript.`,
  );
  if (!confirmed) {
    return;
  }
  state.sessionsLoading = true;
  state.sessionsError = null;
  try {
    await state.client.request("agents.sessions.archive", { key, deleteTranscript: true });
    await loadSessions(state);
  } catch (err) {
    state.sessionsError = String(err);
  } finally {
    state.sessionsLoading = false;
  }
}
