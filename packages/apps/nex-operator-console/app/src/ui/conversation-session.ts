import type { RuntimeSessionRow, SessionsListResult } from "./types.ts";

function listSessions(result: SessionsListResult | null | undefined): RuntimeSessionRow[] {
  return Array.isArray(result?.sessions) ? result.sessions : [];
}

export function resolveConversationSession(
  result: SessionsListResult | null | undefined,
  conversationId: string | null | undefined,
): RuntimeSessionRow | null {
  const trimmedConversationId = conversationId?.trim() ?? "";
  if (!trimmedConversationId) {
    return null;
  }
  return (
    listSessions(result).find(
      (session) => session.conversationId?.trim() === trimmedConversationId,
    ) ?? null
  );
}

export function resolveConversationSessionKey(
  result: SessionsListResult | null | undefined,
  conversationId: string | null | undefined,
): string {
  return resolveConversationSession(result, conversationId)?.key ?? "";
}

export function sessionBelongsToConversation(
  result: SessionsListResult | null | undefined,
  conversationId: string | null | undefined,
  sessionKey: string | null | undefined,
): boolean {
  const trimmedSessionKey = sessionKey?.trim() ?? "";
  if (!trimmedSessionKey) {
    return false;
  }
  return resolveConversationSessionKey(result, conversationId) === trimmedSessionKey;
}
