import fs from "node:fs";
import path from "node:path";

import { resolveStateDir } from "../config/paths.js";

export type AgentIdResolution =
  | {
      ok: true;
      agentId: string;
      source: "env" | "auto" | "default";
      available: string[];
    }
  | { ok: false; reason: "multiple"; available: string[] };

function listAgentIds(stateDir: string): string[] {
  const agentsDir = path.join(stateDir, "agents");
  try {
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function resolveAgentId(
  env: NodeJS.ProcessEnv = process.env,
): AgentIdResolution {
  const override = env.NEXUS_AGENT_ID?.trim();
  const stateDir = resolveStateDir(env);
  const available = listAgentIds(stateDir);
  if (override) {
    return {
      ok: true,
      agentId: override,
      source: "env",
      available,
    };
  }
  if (available.length === 1) {
    return {
      ok: true,
      agentId: available[0],
      source: "auto",
      available,
    };
  }
  if (available.length > 1) {
    return { ok: false, reason: "multiple", available };
  }
  return { ok: true, agentId: "default", source: "default", available };
}
