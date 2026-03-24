import type { IconName } from "./icons.js";

// ─── Primary tabs (shown in main sidebar navigation) ────────────────────
export const TAB_GROUPS = [
  {
    label: "Operator",
    tabs: ["home", "identity", "agents", "operations", "memory", "integrations", "console"],
  },
  { label: "System", tabs: ["system"] },
] as const;

// ─── Tab type ────────────────────────────────────────────────────────────
export type Tab =
  // Primary tabs
  "home" | "console" | "identity" | "agents" | "operations" | "memory" | "integrations" | "system";

// ─── Path mapping ────────────────────────────────────────────────────────
const TAB_PATHS: Record<Tab, string> = {
  home: "/home",
  console: "/console",
  identity: "/identity",
  agents: "/agents",
  operations: "/operations",
  memory: "/memory",
  integrations: "/integrations",
  system: "/system",
};

const PATH_TO_TAB = new Map(Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as Tab]));

// ─── Path utilities ──────────────────────────────────────────────────────

export function normalizeBasePath(basePath: string): string {
  if (!basePath) {
    return "";
  }
  let base = basePath.trim();
  if (!base.startsWith("/")) {
    base = `/${base}`;
  }
  if (base === "/") {
    return "";
  }
  if (base.endsWith("/")) {
    base = base.slice(0, -1);
  }
  return base;
}

export function normalizePath(path: string): string {
  if (!path) {
    return "/";
  }
  let normalized = path.trim();
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function pathForTab(tab: Tab, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  const path = TAB_PATHS[tab];
  return base ? `${base}${path}` : path;
}

export function tabFromPath(pathname: string, basePath = ""): Tab | null {
  const base = normalizeBasePath(basePath);
  let path = pathname || "/";
  if (base) {
    if (path === base) {
      path = "/";
    } else if (path.startsWith(`${base}/`)) {
      path = path.slice(base.length);
    }
  }
  let normalized = normalizePath(path).toLowerCase();
  if (normalized.endsWith("/index.html")) {
    normalized = "/";
  }
  // Root → default tab
  if (normalized === "/") {
    return "home";
  }
  // Exact match first
  const exact = PATH_TO_TAB.get(normalized);
  if (exact) {
    return exact;
  }
  // Prefix match for nested routes (e.g. /directory/entity-123 → directory)
  for (const [tabPath, tab] of PATH_TO_TAB.entries()) {
    if (normalized.startsWith(tabPath + "/")) {
      return tab;
    }
  }
  return null;
}

export function inferBasePathFromPathname(pathname: string): string {
  let normalized = normalizePath(pathname);
  if (normalized.endsWith("/index.html")) {
    normalized = normalizePath(normalized.slice(0, -"/index.html".length));
  }
  if (normalized === "/") {
    return "";
  }
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "";
  }
  // Check if any tail portion of the path matches a known tab path
  for (let i = 0; i < segments.length; i++) {
    const candidate = `/${segments.slice(i).join("/")}`.toLowerCase();
    if (PATH_TO_TAB.has(candidate)) {
      const prefix = segments.slice(0, i);
      return prefix.length ? `/${prefix.join("/")}` : "";
    }
    // Also check for prefix matches (e.g. /system/overview → known)
    for (const tabPath of PATH_TO_TAB.keys()) {
      if (candidate === tabPath || candidate.startsWith(tabPath + "/")) {
        const prefix = segments.slice(0, i);
        return prefix.length ? `/${prefix.join("/")}` : "";
      }
    }
  }
  return `/${segments.join("/")}`;
}

// ─── Tab display metadata ────────────────────────────────────────────────

export function isSystemTab(tab: Tab): boolean {
  return tab === "system";
}

export function iconForTab(tab: Tab): IconName {
  switch (tab) {
    case "home":
      return "barChart";
    case "console":
      return "terminal";
    case "identity":
      return "users";
    case "agents":
      return "bot";
    case "operations":
      return "fileText";
    case "integrations":
      return "plug";
    case "memory":
      return "brain";
    case "system":
      return "settings";
    default:
      return "folder";
  }
}

export function titleForTab(tab: Tab) {
  switch (tab) {
    case "home":
      return "Home";
    case "console":
      return "Console";
    case "identity":
      return "Identity";
    case "agents":
      return "Agents";
    case "operations":
      return "Operations";
    case "memory":
      return "Memory";
    case "integrations":
      return "Integrations";
    case "system":
      return "System";
    default:
      return "Control";
  }
}

export function subtitleForTab(tab: Tab) {
  switch (tab) {
    case "home":
      return "Operator inbox for issues, merges, failures, and review work.";
    case "console":
      return "Conversation-first operator workspace with lower-level runtime context.";
    case "identity":
      return "Entities, contacts, channels, groups, policies, and merge review.";
    case "agents":
      return "Agents, prompts, workspaces, files, config, and tool permissions.";
    case "operations":
      return "Queue, runs, jobs, DAGs, and schedules in one execution domain.";
    case "memory":
      return "Observations, facts, models, review, and source lineage.";
    case "integrations":
      return "Integrations, connections, credentials, and installed app surfaces.";
    case "system":
      return "Runtime health, sessions, logs, debug, access, and config.";
    default:
      return "";
  }
}
