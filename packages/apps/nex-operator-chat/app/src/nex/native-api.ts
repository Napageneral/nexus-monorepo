import type { NativeApi } from "@t3tools/contracts";
import { showContextMenu } from "./chat-adapter";
import {
  createSafeGitApi,
  dispatchNexOrchestrationCommand,
  refreshProviders,
  requestOrchestrationReadModel,
  requestOrchestrationReplay,
  requestServerConfig,
  subscribeToOrchestrationEvents,
  updateServerSettings,
  upsertKeybinding,
} from "./chat-adapter";

let sharedNativeApi: NativeApi | null = null;

export function resetNexEmbeddedNativeApi(): void {
  sharedNativeApi = null;
}

export function createNexEmbeddedNativeApi(): NativeApi {
  if (sharedNativeApi) {
    return sharedNativeApi;
  }

  sharedNativeApi = {
    dialogs: {
      pickFolder: async () => null,
      confirm: async (message) => window.confirm(message),
    },
    terminal: {
      open: async () => {
        throw new Error("Terminal controls are disabled in the Nex chat fork.");
      },
      write: async () => {
        throw new Error("Terminal controls are disabled in the Nex chat fork.");
      },
      resize: async () => undefined,
      clear: async () => undefined,
      restart: async () => {
        throw new Error("Terminal controls are disabled in the Nex chat fork.");
      },
      close: async () => undefined,
      onEvent: () => () => undefined,
    },
    projects: {
      searchEntries: async () => ({
        entries: [],
        truncated: false,
      }),
      writeFile: async (_input) => {
        throw new Error("Project file writes are disabled in the Nex chat fork.");
      },
    },
    shell: {
      openInEditor: async () => {
        throw new Error("Open in editor is disabled in the Nex chat fork.");
      },
      openExternal: async (url) => {
        window.open(url, "_blank", "noopener,noreferrer");
      },
    },
    git: createSafeGitApi(),
    contextMenu: {
      show: showContextMenu,
    },
    server: {
      getConfig: requestServerConfig,
      refreshProviders,
      upsertKeybinding,
      getSettings: async () => (await requestServerConfig()).settings,
      updateSettings: updateServerSettings,
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
      replayEvents: requestOrchestrationReplay,
      onDomainEvent: (callback, options) => subscribeToOrchestrationEvents(callback, options),
    },
  };

  return sharedNativeApi;
}
