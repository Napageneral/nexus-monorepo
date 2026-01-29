#!/usr/bin/env node
/**
 * Nexus Session Start Hook for Cursor
 * 
 * This script runs at the start of each Cursor agent session.
 * It injects identity, soul, memory, and daily logs into the session context.
 * 
 * Input: JSON payload from Cursor on stdin (includes workspace_roots)
 * Output: JSON with { continue: true, additional_context: "..." }
 */

const { execFile } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

// Character limits to prevent context overflow
const MAX_IDENTITY_CHARS = 120000;
const MAX_MEMORY_CHARS = 120000;
const MAX_DAILY_CHARS = 40000;

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
  });
}

function safeJsonParse(raw) {
  if (!raw || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveWorkspaceRoot(payload) {
  const roots = payload?.workspace_roots;
  if (Array.isArray(roots) && roots.length > 0 && roots[0]) {
    return roots[0];
  }
  if (process.env.NEXUS_ROOT?.trim()) return process.env.NEXUS_ROOT.trim();
  const home = os.homedir();
  if (home) return path.join(home, "nexus");
  return process.cwd();
}

function resolveStateDir(workspaceRoot) {
  if (process.env.NEXUS_STATE_DIR?.trim()) {
    return process.env.NEXUS_STATE_DIR.trim();
  }
  return path.join(workspaceRoot, "state");
}

function execFileAsync(command, args, options) {
  return new Promise((resolve) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

async function runStatus(env, cwd) {
  const result = await execFileAsync("nexus", ["status", "--json"], {
    env,
    cwd,
  });
  const parsed = safeJsonParse(result.stdout);
  if (parsed) return parsed;
  if (result.error && result.error.stdout) {
    const fallback = safeJsonParse(result.error.stdout.toString());
    if (fallback) return fallback;
  }
  return null;
}

async function readFileSnippet(filePath, limit) {
  if (!filePath) return null;
  try {
    const content = await fsp.readFile(filePath, "utf8");
    if (!content.trim()) return null;
    if (content.length <= limit) return content.trim();
    const slice = content.slice(-limit).trimStart();
    return `${slice}\n\n[truncated]`;
  } catch {
    return null;
  }
}

function addSection(sections, title, body) {
  if (!body) return;
  sections.push(`## ${title}\n${body}`);
}

async function main() {
  const input = await readStdin();
  const payload = safeJsonParse(input) || {};
  const workspaceRoot = resolveWorkspaceRoot(payload);
  const stateDir = resolveStateDir(workspaceRoot);
  
  const env = {
    ...process.env,
    NEXUS_ROOT: workspaceRoot,
    NEXUS_STATE_DIR: stateDir,
  };
  
  // Run nexus status to get identity info
  const status = await runStatus(env, workspaceRoot);
  const identity = status?.identity || null;
  const agentId = identity?.agentId || process.env.NEXUS_AGENT_ID || "default";
  
  // Resolve paths
  const agentIdentityPath =
    identity?.agentIdentityPath ||
    path.join(stateDir, "agents", agentId, "IDENTITY.md");
  const agentSoulPath =
    identity?.agentSoulPath || 
    path.join(stateDir, "agents", agentId, "SOUL.md");
  const agentMemoryPath =
    identity?.agentMemoryPath ||
    path.join(stateDir, "agents", agentId, "MEMORY.md");
  const userIdentityPath =
    identity?.userIdentityPath || 
    path.join(stateDir, "user", "IDENTITY.md");
  const userProfilePath = path.join(stateDir, "user", "PROFILE.md");
  const resolvedUserPath = fs.existsSync(userIdentityPath)
    ? userIdentityPath
    : fs.existsSync(userProfilePath)
      ? userProfilePath
      : userIdentityPath;

  // Build sections
  const sections = ["# Nexus Session Bootstrap"];
  
  if (identity) {
    const summary = [
      `Agent: ${identity.agentName || "(unknown)"} (${identity.agentId})`,
      `User: ${identity.userName || "(unknown)"}`,
      `Agent ID: ${identity.agentId}`,
    ];
    addSection(sections, "Status", summary.join("\n"));
  }

  if (status?.bootstrap?.prompt) {
    addSection(sections, "Bootstrap Prompt", status.bootstrap.prompt.trim());
  }

  // Read identity files
  const agentIdentity = await readFileSnippet(agentIdentityPath, MAX_IDENTITY_CHARS);
  const agentSoul = await readFileSnippet(agentSoulPath, MAX_IDENTITY_CHARS);
  const agentMemory = await readFileSnippet(agentMemoryPath, MAX_MEMORY_CHARS);
  const userIdentity = await readFileSnippet(resolvedUserPath, MAX_IDENTITY_CHARS);

  addSection(sections, "Agent Identity", agentIdentity);
  addSection(sections, "Agent Soul", agentSoul);
  addSection(sections, "Agent Memory", agentMemory);
  addSection(sections, "User Identity", userIdentity);

  // Read daily memory logs
  const memoryDir = path.join(workspaceRoot, "home", "memory");
  const today = formatDate(new Date());
  const yesterday = formatDate(new Date(Date.now() - 86400000));
  const todayLog = await readFileSnippet(path.join(memoryDir, `${today}.md`), MAX_DAILY_CHARS);
  const yesterdayLog = await readFileSnippet(path.join(memoryDir, `${yesterday}.md`), MAX_DAILY_CHARS);

  addSection(sections, `Daily Memory (${today})`, todayLog);
  addSection(sections, `Daily Memory (${yesterday})`, yesterdayLog);

  // Build output
  const additional = sections.join("\n\n").trim();
  const output = { continue: true, additional_context: additional };
  
  // Set environment variables if not already set
  const envOut = {};
  if (!process.env.NEXUS_ROOT?.trim() && workspaceRoot) {
    envOut.NEXUS_ROOT = workspaceRoot;
  }
  if (!process.env.NEXUS_STATE_DIR?.trim() && stateDir) {
    envOut.NEXUS_STATE_DIR = stateDir;
  }
  if (Object.keys(envOut).length > 0) {
    output.env = envOut;
  }
  
  process.stdout.write(JSON.stringify(output) + "\n");
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ continue: true }) + "\n");
});
