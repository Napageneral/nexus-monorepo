import type { WsRpcClient } from "../wsRpcClient";
import { recordWsConnectionOpened, setBrowserOnlineStatus } from "../rpc/wsConnectionState";
import {
  createSafeGitApi,
  dispatchNexOrchestrationCommand,
  refreshProviders,
  requestOrchestrationReadModel,
  requestOrchestrationReplay,
  requestServerConfig,
  subscribeToServerConfig,
  subscribeToServerLifecycle,
  subscribeToOrchestrationEvents,
  updateServerSettings,
  upsertKeybinding,
} from "./chat-adapter";

let sharedEmbeddedClient: WsRpcClient | null = null;

export function resetNexEmbeddedWsRpcClient(): void {
  sharedEmbeddedClient = null;
}

export function createNexEmbeddedWsRpcClient(): WsRpcClient {
  if (sharedEmbeddedClient) {
    return sharedEmbeddedClient;
  }

  const git = createSafeGitApi();
  setBrowserOnlineStatus(typeof navigator === "undefined" ? true : navigator.onLine !== false);
  recordWsConnectionOpened();

  sharedEmbeddedClient = {
    dispose: async () => undefined,
    reconnect: async () => {
      setBrowserOnlineStatus(typeof navigator === "undefined" ? true : navigator.onLine !== false);
      recordWsConnectionOpened();
    },
    terminal: {
      open: async () => {
        throw new Error("Terminal controls are disabled in the Nex chat fork.");
      },
      write: async () => undefined,
      resize: async () => undefined,
      clear: async () => undefined,
      restart: async () => {
        throw new Error("Terminal controls are disabled in the Nex chat fork.");
      },
      close: async () => undefined,
      onEvent: () => () => undefined,
    },
    projects: {
      searchEntries: async () => ({ entries: [], truncated: false }),
      writeFile: async () => {
        throw new Error("Project file writes are disabled in the Nex chat fork.");
      },
    },
    shell: {
      openInEditor: async () => {
        throw new Error("Open in editor is disabled in the Nex chat fork.");
      },
    },
    git: {
      pull: git.pull,
      refreshStatus: git.refreshStatus,
      onStatus: git.onStatus,
      runStackedAction: async () => {
        throw new Error("Git action stacks are disabled in the Nex chat fork.");
      },
      listBranches: git.listBranches,
      createWorktree: git.createWorktree,
      removeWorktree: git.removeWorktree,
      createBranch: git.createBranch,
      checkout: git.checkout,
      init: git.init,
      resolvePullRequest: git.resolvePullRequest,
      preparePullRequestThread: git.preparePullRequestThread,
    },
    server: {
      getConfig: requestServerConfig,
      refreshProviders,
      upsertKeybinding,
      getSettings: async () => (await requestServerConfig()).settings,
      updateSettings: updateServerSettings,
      subscribeConfig: (listener, options) => subscribeToServerConfig(listener, options),
      subscribeLifecycle: (listener, options) => subscribeToServerLifecycle(listener, options),
    },
    orchestration: {
      getSnapshot: requestOrchestrationReadModel,
      dispatchCommand: dispatchNexOrchestrationCommand,
      getTurnDiff: async () => {
        throw new Error("Diff views are disabled in the Nex chat fork.");
      },
      getFullThreadDiff: async () => {
        throw new Error("Diff views are disabled in the Nex chat fork.");
      },
      replayEvents: async (input) => requestOrchestrationReplay(input.fromSequenceExclusive),
      onDomainEvent: (listener, options) => subscribeToOrchestrationEvents(listener, options),
    },
  };

  return sharedEmbeddedClient;
}
