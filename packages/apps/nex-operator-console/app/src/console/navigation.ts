import type { IconName } from "../ui/icons.js";

// ─── Console tab definitions ─────────────────────────────────────────

export type ConsoleTab =
  | "connectors"
  | "agents"
  | "monitor"
  | "jobs"
  | "records"
  | "identity"
  | "memory";

export type ConsoleSubRoute =
  | { kind: "tab"; tab: ConsoleTab }
  | { kind: "agent-detail"; agentId: string }
  | { kind: "agent-create" }
;

export const CONSOLE_TABS: ConsoleTab[] = ["connectors", "agents", "monitor", "jobs", "records", "identity", "memory"];

export const CONSOLE_PRIMARY_TABS: ConsoleTab[] = ["connectors", "agents", "monitor", "jobs", "records"];
export const CONSOLE_SECONDARY_TABS: ConsoleTab[] = ["identity", "memory"];

export function consoleIconForTab(tab: ConsoleTab): IconName {
  switch (tab) {
    case "connectors":
      return "plug";
    case "agents":
      return "bot";
    case "monitor":
      return "scrollText";
    case "jobs":
      return "fileText";
    case "records":
      return "database";
    case "identity":
      return "users";
    case "memory":
      return "brain";
    default:
      return "folder";
  }
}

export function consoleTitleForTab(tab: ConsoleTab): string {
  switch (tab) {
    case "connectors":
      return "Connectors";
    case "agents":
      return "Agents";
    case "monitor":
      return "Monitor";
    case "jobs":
      return "Jobs";
    case "records":
      return "Records";
    case "identity":
      return "Identity";
    case "memory":
      return "Memory";
    default:
      return tab;
  }
}

// Map legacy tabs into the canonical console tabs
export function consoleTabFromLegacy(legacyTab: string): ConsoleTab {
  switch (legacyTab) {
    case "home":
    case "integrations":
    case "apps":
      return "connectors";
    case "agents":
      return "agents";
    case "operations":
      return "jobs";
    case "system":
    case "console":
      return "monitor";
    case "identity":
      return "identity";
    case "memory":
      return "memory";
    default:
      return "connectors";
  }
}
