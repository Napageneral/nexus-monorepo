export type ToolProfileId = "minimal" | "coding" | "messaging" | "full";

type ToolProfilePolicy = {
  allow?: string[];
  deny?: string[];
};

const TOOL_NAME_ALIASES: Record<string, string> = {
  bash: "exec",
  shell: "exec",
  "apply-patch": "apply_patch",
  read_file: "nex.local.fs.readFile",
  write_file: "nex.local.fs.writeFile",
  edit_file: "nex.local.fs.editFile",
};

export const TOOL_GROUPS: Record<string, string[]> = {
  "group:memory": ["nex.memory.recall"],
  "group:web": ["nex.web.search", "nex.web.fetch"],
  "group:fs": [
    "nex.local.fs.readFile",
    "nex.local.fs.listDir",
    "nex.local.fs.stat",
    "nex.local.fs.writeFile",
    "nex.local.fs.mkdir",
    "nex.local.fs.editFile",
    "apply_patch",
  ],
  "group:runtime": ["exec", "nex.local.exec"],
  "group:sessions": [
    "nex.sessions.list",
    "nex.sessions.history",
    "nex.session.status",
    "nex.agent.dispatch",
    "nex.agent.wait",
    "nex.agent.status",
    "nex.agent.logs",
  ],
  "group:ui": ["browser", "canvas"],
  "group:automation": ["schedule", "nex.runtime"],
  "group:messaging": ["nex.agent.dispatch", "nex.agent.wait"],
  "group:nodes": ["nex.nodes"],
  "group:nexus": [
    "exec",
    "nex.local.exec",
    "nex.local.fs.readFile",
    "nex.local.fs.listDir",
    "nex.local.fs.stat",
    "nex.local.fs.writeFile",
    "nex.local.fs.mkdir",
    "nex.local.fs.editFile",
    "nex.browser",
    "canvas",
    "nex.nodes",
    "schedule",
    "nex.runtime",
    "nex.agents.list",
    "nex.sessions.list",
    "nex.sessions.history",
    "nex.session.status",
    "nex.agent.dispatch",
    "nex.agent.wait",
    "nex.agent.status",
    "nex.agent.logs",
    "nex.memory.recall",
    "nex.web.search",
    "nex.web.fetch",
    "nex.image",
  ],
};

const TOOL_PROFILES: Record<ToolProfileId, ToolProfilePolicy> = {
  minimal: {
    allow: ["nex.session.status"],
  },
  coding: {
    allow: ["group:fs", "group:runtime", "group:sessions", "group:memory", "nex.image"],
  },
  messaging: {
    allow: ["group:messaging", "nex.sessions.list", "nex.sessions.history", "nex.session.status"],
  },
  full: {},
};

export function normalizeToolName(name: string) {
  const normalized = name.trim().toLowerCase();
  return TOOL_NAME_ALIASES[normalized] ?? normalized;
}

export function normalizeToolList(list?: string[]) {
  if (!list) {
    return [];
  }
  return list.map(normalizeToolName).filter(Boolean);
}

export function expandToolGroups(list?: string[]) {
  const normalized = normalizeToolList(list);
  const expanded: string[] = [];
  for (const value of normalized) {
    const group = TOOL_GROUPS[value];
    if (group) {
      expanded.push(...group);
      continue;
    }
    expanded.push(value);
  }
  return Array.from(new Set(expanded));
}

export function resolveToolProfilePolicy(profile?: string): ToolProfilePolicy | undefined {
  if (!profile) {
    return undefined;
  }
  const resolved = TOOL_PROFILES[profile as ToolProfileId];
  if (!resolved) {
    return undefined;
  }
  if (!resolved.allow && !resolved.deny) {
    return undefined;
  }
  return {
    allow: resolved.allow ? [...resolved.allow] : undefined,
    deny: resolved.deny ? [...resolved.deny] : undefined,
  };
}
