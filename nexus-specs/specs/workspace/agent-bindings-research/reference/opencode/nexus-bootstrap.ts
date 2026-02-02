/**
 * Nexus Bootstrap Plugin for OpenCode
 * 
 * Uses experimental hooks to inject Nexus context:
 * - experimental.chat.system.transform: Injects on EVERY LLM call
 * - experimental.session.compacting: Injects during compaction
 * 
 * Note: These hooks are experimental and may change in future OpenCode versions.
 */

import type { Plugin } from "@opencode-ai/plugin";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const MAX_IDENTITY_CHARS = 120000;
const MAX_MEMORY_CHARS = 40000;

/**
 * Safely read a file with character limit
 */
function readFileSafe(filePath: string, limit: number): string | null {
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, "utf8").trim();
    if (!content) return null;
    if (content.length <= limit) return content;
    return content.slice(-limit) + "\n\n[truncated]";
  } catch {
    return null;
  }
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Build Nexus context string
 */
function buildContext(workspaceRoot: string): string {
  const stateDir = process.env.NEXUS_STATE_DIR || join(workspaceRoot, "state");
  const sections: string[] = [];

  // Run nexus status
  try {
    const result = execSync("nexus status --json", {
      cwd: workspaceRoot,
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, NEXUS_ROOT: workspaceRoot, NEXUS_STATE_DIR: stateDir },
    });
    const status = JSON.parse(result);
    if (status?.identity) {
      sections.push(`## Nexus Status\nAgent: ${status.identity.agentName} (${status.identity.agentId})`);
    }
  } catch {
    // Continue without status
  }

  // Determine agent ID
  const agentId = process.env.NEXUS_AGENT_ID || "default";
  const agentDir = join(stateDir, "agents", agentId);
  const userDir = join(stateDir, "user");
  const memoryDir = join(workspaceRoot, "home", "memory");

  // Read identity files
  const agentIdentity = readFileSafe(join(agentDir, "IDENTITY.md"), MAX_IDENTITY_CHARS);
  const agentSoul = readFileSafe(join(agentDir, "SOUL.md"), MAX_IDENTITY_CHARS);
  const userIdentity = readFileSafe(join(userDir, "IDENTITY.md"), MAX_IDENTITY_CHARS);

  if (agentIdentity) sections.push(`## Agent Identity\n${agentIdentity}`);
  if (agentSoul) sections.push(`## Agent Soul\n${agentSoul}`);
  if (userIdentity) sections.push(`## User Identity\n${userIdentity}`);

  // Read daily memory
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayLog = readFileSafe(join(memoryDir, `${formatDate(today)}.md`), MAX_MEMORY_CHARS);
  const yesterdayLog = readFileSafe(join(memoryDir, `${formatDate(yesterday)}.md`), MAX_MEMORY_CHARS / 2);

  if (todayLog) sections.push(`## Daily Memory (${formatDate(today)})\n${todayLog}`);
  if (yesterdayLog) sections.push(`## Yesterday (${formatDate(yesterday)})\n${yesterdayLog}`);

  if (sections.length === 0) return "";
  return `# Nexus Session Context\n\n${sections.join("\n\n")}`;
}

/**
 * Resolve workspace root from environment or directory
 */
function resolveWorkspaceRoot(directory?: string): string {
  if (process.env.NEXUS_ROOT) return process.env.NEXUS_ROOT;
  if (directory) return directory;
  
  // Walk up looking for nexus markers
  let dir = process.cwd();
  const { dirname, join: pathJoin } = require("path");
  
  while (dir !== dirname(dir)) {
    if (existsSync(pathJoin(dir, "AGENTS.md"))) return dir;
    if (existsSync(pathJoin(dir, "state", "agents"))) return dir;
    dir = dirname(dir);
  }
  
  // Fallback to home nexus
  const homeNexus = join(process.env.HOME || "", "nexus");
  if (existsSync(homeNexus)) return homeNexus;
  
  return process.cwd();
}

export const NexusBootstrap: Plugin = async ({ directory }) => {
  const workspaceRoot = resolveWorkspaceRoot(directory);

  return {
    /**
     * Inject context into system prompt BEFORE EACH LLM call
     * This is the primary injection point - ensures context is always fresh
     */
    "experimental.chat.system.transform": async (input, output) => {
      const context = buildContext(workspaceRoot);
      if (context) {
        output.system.push(context);
      }
    },

    /**
     * Inject context during compaction
     * Ensures important context survives the compaction process
     */
    "experimental.session.compacting": async (input, output) => {
      const context = buildContext(workspaceRoot);
      if (context) {
        output.context.push(context);
      }
    },
  };
};

export default NexusBootstrap;
