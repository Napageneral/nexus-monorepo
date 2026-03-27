import type { IconName } from "../ui/icons.js";

// ─── v2 tab definitions ──────────────────────────────────────────────

export type V2Tab =
  | "connectors"
  | "agents"
  | "monitor"
  | "identity"
  | "memory";

export type V2SubRoute =
  | { kind: "tab"; tab: V2Tab }
  | { kind: "agent-detail"; agentId: string }
  | { kind: "agent-create" }
;

export const V2_TABS: V2Tab[] = ["connectors", "agents", "monitor", "identity", "memory"];

export const V2_PRIMARY_TABS: V2Tab[] = ["connectors", "agents", "monitor"];
export const V2_SECONDARY_TABS: V2Tab[] = ["identity", "memory"];

export function v2IconForTab(tab: V2Tab): IconName {
  switch (tab) {
    case "connectors":
      return "plug";
    case "agents":
      return "bot";
    case "monitor":
      return "scrollText";
    case "identity":
      return "users";
    case "memory":
      return "brain";
    default:
      return "folder";
  }
}

export function v2TitleForTab(tab: V2Tab): string {
  switch (tab) {
    case "connectors":
      return "Connectors";
    case "agents":
      return "Agents";
    case "monitor":
      return "Monitor";
    case "identity":
      return "Identity";
    case "memory":
      return "Memory";
    default:
      return tab;
  }
}

// Map old tabs → v2 tabs for backwards compatibility
export function v2TabFromLegacy(legacyTab: string): V2Tab {
  switch (legacyTab) {
    case "home":
    case "integrations":
    case "apps":
      return "connectors";
    case "agents":
      return "agents";
    case "operations":
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
