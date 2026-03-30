import type { NexusApp } from "./app.ts";
import { loadDebug } from "./controllers/debug.ts";
import { loadLogs } from "./controllers/logs.ts";

type PollingHost = {
  logsPollInterval: number | null;
  debugPollInterval: number | null;
  tab: string;
  systemSubTab?: "overview" | "config" | "logs" | "debug" | "usage";
};

export function startLogsPolling(host: PollingHost) {
  if (host.logsPollInterval != null) {
    return;
  }
  host.logsPollInterval = window.setInterval(() => {
    if (host.tab !== "system" || host.systemSubTab !== "logs") {
      return;
    }
    void loadLogs(host as unknown as NexusApp, { quiet: true });
  }, 2000);
}

export function stopLogsPolling(host: PollingHost) {
  if (host.logsPollInterval == null) {
    return;
  }
  clearInterval(host.logsPollInterval);
  host.logsPollInterval = null;
}

export function startDebugPolling(host: PollingHost) {
  if (host.debugPollInterval != null) {
    return;
  }
  host.debugPollInterval = window.setInterval(() => {
    if (host.tab !== "system" || host.systemSubTab !== "debug") {
      return;
    }
    void loadDebug(host as unknown as NexusApp);
  }, 3000);
}

export function stopDebugPolling(host: PollingHost) {
  if (host.debugPollInterval == null) {
    return;
  }
  clearInterval(host.debugPollInterval);
  host.debugPollInterval = null;
}
