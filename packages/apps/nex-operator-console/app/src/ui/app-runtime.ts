import type { EventLogEntry } from "./app-events.ts";
import type { NexusApp } from "./app.ts";
import type { AclPermissionRequest } from "./controllers/acl-requests.ts";
import type { IngressCredential } from "./controllers/ingress-credentials.ts";
import type { Tab } from "./navigation.ts";
import type { RuntimeEventFrame, RuntimeHelloOk } from "./runtime.ts";
import type { UiSettings } from "./storage.ts";
import type {
  AgentsListResult,
  PresenceEntry,
  HealthSnapshot,
  StatusSummary,
  SessionsListResult,
} from "./types.ts";
import { CHAT_SESSIONS_ACTIVE_MINUTES, flushChatQueueForEvent } from "./app-chat.ts";
import {
  applySettings,
  loadSchedules,
  refreshActiveTab,
  setLastActiveSessionKey,
} from "./app-settings.ts";
import { handleAgentEvent, resetToolStream, type AgentEventPayload } from "./app-tool-stream.ts";
import { loadAclRequests } from "./controllers/acl-requests.ts";
import { loadAgents } from "./controllers/agents.ts";
import { loadAssistantIdentity } from "./controllers/assistant-identity.ts";
import { loadChatHistory } from "./controllers/chat.ts";
import { handleChatEvent, type ChatEventPayload } from "./controllers/chat.ts";
import { loadNodes } from "./controllers/nodes.ts";
import { loadSessions } from "./controllers/sessions.ts";
import { sessionBelongsToConversation } from "./conversation-session.ts";
import { RuntimeBrowserClient } from "./runtime.ts";

type RuntimeHost = {
  settings: UiSettings;
  password: string;
  client: RuntimeBrowserClient | null;
  connected: boolean;
  hello: RuntimeHelloOk | null;
  lastError: string | null;
  onboarding?: boolean;
  eventLogBuffer: EventLogEntry[];
  eventLog: EventLogEntry[];
  tab: Tab;
  systemSubTab?: "overview" | "config" | "logs" | "debug" | "usage";
  presenceEntries: PresenceEntry[];
  presenceError: string | null;
  presenceStatus: StatusSummary | null;
  agentsLoading: boolean;
  agentsList: AgentsListResult | null;
  agentsError: string | null;
  debugHealth: HealthSnapshot | null;
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
  conversationId: string;
  sessionsResult: SessionsListResult | null;
  sessionKey: string;
  chatRunId: string | null;
  refreshSessionsAfterChat: Set<string>;
  aclRequestsLoading: boolean;
  aclRequestsError: string | null;
  aclRequests: AclPermissionRequest[];
  aclRequestsResolvingId: string | null;
  ingressCredentialsLoading: boolean;
  ingressCredentialsError: string | null;
  ingressCredentials: IngressCredential[];
  ingressCredentialCreating: boolean;
  ingressCredentialBusyId: string | null;
};

type SessionDefaultsSnapshot = {
  defaultAgentId?: string;
  scope?: string;
};

function applySessionDefaults(host: RuntimeHost, defaults?: SessionDefaultsSnapshot) {
  if (!defaults) {
    return;
  }
  const defaultAgentId = defaults.defaultAgentId?.trim();
  if (!defaultAgentId || host.assistantAgentId === defaultAgentId) {
    return;
  }
  host.assistantAgentId = defaultAgentId;
}

export function connectRuntime(host: RuntimeHost) {
  host.lastError = null;
  host.hello = null;
  host.connected = false;
  host.aclRequests = [];
  host.aclRequestsError = null;
  host.aclRequestsResolvingId = null;
  host.ingressCredentials = [];
  host.ingressCredentialsError = null;
  host.ingressCredentialCreating = false;
  host.ingressCredentialBusyId = null;

  host.client?.stop();
  host.client = new RuntimeBrowserClient({
    url: host.settings.runtimeUrl,
    token: host.settings.token.trim() ? host.settings.token : undefined,
    password: host.password.trim() ? host.password : undefined,
    clientName: "nexus-operator-console",
    mode: "webchat",
    onHello: (hello) => {
      host.connected = true;
      host.lastError = null;
      host.hello = hello;
      applySnapshot(host, hello);
      // Reset orphaned chat run state from before disconnect.
      // Any in-flight run's final event was lost during the disconnect window.
      host.chatRunId = null;
      (host as unknown as { chatStream: string | null }).chatStream = null;
      (host as unknown as { chatStreamStartedAt: number | null }).chatStreamStartedAt = null;
      resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
      void loadAssistantIdentity(host as unknown as NexusApp);
      void loadAgents(host as unknown as NexusApp);
      void loadNodes(host as unknown as NexusApp, { quiet: true });
      void refreshActiveTab(host as unknown as Parameters<typeof refreshActiveTab>[0]);
    },
    onClose: ({ code, reason }) => {
      host.connected = false;
      // Code 1012 = Service Restart (expected during config saves, don't show as error)
      if (code !== 1012) {
        host.lastError = `disconnected (${code}): ${reason || "no reason"}`;
      }
    },
    onEvent: (evt) => handleRuntimeEvent(host, evt),
    onGap: ({ expected, received }) => {
      host.lastError = `event gap detected (expected seq ${expected}, got ${received}); refresh recommended`;
    },
  });
  host.client.start();
}

export function handleRuntimeEvent(host: RuntimeHost, evt: RuntimeEventFrame) {
  try {
    handleRuntimeEventUnsafe(host, evt);
  } catch (err) {
    console.error("[runtime] handleRuntimeEvent error:", evt.event, err);
  }
}

function handleRuntimeEventUnsafe(host: RuntimeHost, evt: RuntimeEventFrame) {
  host.eventLogBuffer = [
    { ts: Date.now(), event: evt.event, payload: evt.payload },
    ...host.eventLogBuffer,
  ].slice(0, 250);
  if (host.tab === "system" && host.systemSubTab === "debug") {
    host.eventLog = host.eventLogBuffer;
  }

  if (evt.event === "agent") {
    if (host.onboarding) {
      return;
    }
    handleAgentEvent(
      host as unknown as Parameters<typeof handleAgentEvent>[0],
      evt.payload as AgentEventPayload | undefined,
    );
    return;
  }

  if (evt.event === "agent.run") {
    const payload = evt.payload as ChatEventPayload | undefined;
    if (payload?.sessionKey) {
      const belongsToCurrentConversation = sessionBelongsToConversation(
        host.sessionsResult,
        host.conversationId,
        payload.sessionKey,
      );
      if (belongsToCurrentConversation || payload.runId === host.chatRunId) {
        host.sessionKey = payload.sessionKey;
      }
      setLastActiveSessionKey(
        host as unknown as Parameters<typeof setLastActiveSessionKey>[0],
        payload.sessionKey,
      );
    }
    const state = handleChatEvent(host as unknown as NexusApp, payload);
    if (state === "final" || state === "error" || state === "aborted") {
      resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
      void flushChatQueueForEvent(host as unknown as Parameters<typeof flushChatQueueForEvent>[0]);
      const runId = payload?.runId;
      if (runId && host.refreshSessionsAfterChat.has(runId)) {
        host.refreshSessionsAfterChat.delete(runId);
        if (state === "final") {
          void loadSessions(host as unknown as NexusApp, {
            activeMinutes: CHAT_SESSIONS_ACTIVE_MINUTES,
          });
        }
      }
    }
    if (state === "final") {
      void loadChatHistory(host as unknown as NexusApp);
    }
    return;
  }

  if (evt.event === "presence") {
    const payload = evt.payload as { presence?: PresenceEntry[] } | undefined;
    if (payload?.presence && Array.isArray(payload.presence)) {
      host.presenceEntries = payload.presence;
      host.presenceError = null;
      host.presenceStatus = null;
    }
    return;
  }

  if (evt.event === "schedule" && host.tab === "operations") {
    void loadSchedules(host as unknown as Parameters<typeof loadSchedules>[0]);
  }

  if (evt.event === "acl.approval.requested" || evt.event === "acl.approval.resolved") {
    if (host.tab === "identity") {
      void loadAclRequests(host as unknown as Parameters<typeof loadAclRequests>[0]);
    }
  }
}

export function applySnapshot(host: RuntimeHost, hello: RuntimeHelloOk) {
  const snapshot = hello.snapshot as
    | {
        presence?: PresenceEntry[];
        health?: HealthSnapshot;
        sessionDefaults?: SessionDefaultsSnapshot;
      }
    | undefined;
  if (snapshot?.presence && Array.isArray(snapshot.presence)) {
    host.presenceEntries = snapshot.presence;
  }
  if (snapshot?.health) {
    host.debugHealth = snapshot.health;
  }
  if (snapshot?.sessionDefaults) {
    applySessionDefaults(host, snapshot.sessionDefaults);
  }
}
