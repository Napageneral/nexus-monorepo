#!/usr/bin/env node
/**
 * Nexus Session Start Hook for Cursor
 * 
 * Runs on:
 * - Session startup (fresh session)
 * - After compaction (context refresh)
 * 
 * Outputs:
 * - additional_context: Nexus identity, soul, memory
 * - env: NEXUS_ROOT, NEXUS_STATE_DIR, NEXUS_AGENT_ID
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// Limits
const MAX_IDENTITY_CHARS = 120000;
const MAX_MEMORY_CHARS = 40000;

// Read stdin as promise
function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    setTimeout(() => resolve(data), 1000); // Timeout fallback
  });
}

// Safe JSON parse
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// Safe file read with limit
function readFileSafe(filePath, limit) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, "utf8").trim();
    if (!content) return null;
    if (content.length <= limit) return content;
    return content.slice(-limit) + "\n\n[truncated]";
  } catch {
    return null;
  }
}

// Format date as YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split("T")[0];
}

// Resolve workspace root
function resolveWorkspaceRoot(payload) {
  if (payload?.projectRoot) return payload.projectRoot;
  if (process.env.NEXUS_ROOT) return process.env.NEXUS_ROOT;
  
  // Walk up from cwd looking for AGENTS.md or nexus markers
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "AGENTS.md"))) return dir;
    if (fs.existsSync(path.join(dir, "state", "agents"))) return dir;
    dir = path.dirname(dir);
  }
  
  // Fallback to home nexus
  const homeNexus = path.join(process.env.HOME || "", "nexus");
  if (fs.existsSync(homeNexus)) return homeNexus;
  
  return process.cwd();
}

// Resolve state directory
function resolveStateDir(workspaceRoot) {
  const stateDir = path.join(workspaceRoot, "state");
  if (fs.existsSync(stateDir)) return stateDir;
  return stateDir; // Return even if doesn't exist
}

// Run nexus status --json
async function runStatus(env, cwd) {
  return new Promise((resolve) => {
    try {
      const result = execSync("nexus status --json", {
        cwd,
        encoding: "utf8",
        timeout: 5000,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      resolve(safeJsonParse(result));
    } catch {
      resolve(null);
    }
  });
}

// Add section if content exists
function addSection(sections, title, content) {
  if (content) {
    sections.push(`## ${title}\n${content}`);
  }
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
  
  // Run nexus status
  const status = await runStatus(env, workspaceRoot);
  const identity = status?.identity || null;
  const agentId = identity?.agentId || process.env.NEXUS_AGENT_ID || "default";
  
  // Paths
  const agentDir = path.join(stateDir, "agents", agentId);
  const userDir = path.join(stateDir, "user");
  const memoryDir = path.join(workspaceRoot, "home", "memory");
  
  const agentIdentityPath = path.join(agentDir, "IDENTITY.md");
  const agentSoulPath = path.join(agentDir, "SOUL.md");
  const userIdentityPath = path.join(userDir, "IDENTITY.md");
  
  // Read files
  const agentIdentity = readFileSafe(agentIdentityPath, MAX_IDENTITY_CHARS);
  const agentSoul = readFileSafe(agentSoulPath, MAX_IDENTITY_CHARS);
  const userIdentity = readFileSafe(userIdentityPath, MAX_IDENTITY_CHARS);
  
  // Build context sections
  const sections = ["# Nexus Session Bootstrap"];
  
  if (identity) {
    sections.push(`## Status\nAgent: ${identity.agentName || agentId} (${agentId})`);
  }
  
  if (status?.bootstrap?.prompt) {
    sections.push(`## Bootstrap\n${status.bootstrap.prompt}`);
  }
  
  addSection(sections, "Agent Identity", agentIdentity);
  addSection(sections, "Agent Soul", agentSoul);
  addSection(sections, "User Identity", userIdentity);
  
  // Read daily memories (today and yesterday)
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const todayStr = formatDate(today);
  const yesterdayStr = formatDate(yesterday);
  
  const todayLog = readFileSafe(path.join(memoryDir, `${todayStr}.md`), MAX_MEMORY_CHARS);
  const yesterdayLog = readFileSafe(path.join(memoryDir, `${yesterdayStr}.md`), MAX_MEMORY_CHARS / 2);
  
  if (todayLog) addSection(sections, `Daily Memory (${todayStr})`, todayLog);
  if (yesterdayLog) addSection(sections, `Yesterday (${yesterdayStr})`, yesterdayLog);
  
  // Build output
  const additional = sections.join("\n\n").trim();
  
  const output = {
    continue: true,
    additional_context: additional,
    env: {
      NEXUS_ROOT: workspaceRoot,
      NEXUS_STATE_DIR: stateDir,
      NEXUS_AGENT_ID: agentId,
    },
  };
  
  process.stdout.write(JSON.stringify(output) + "\n");
}

main().catch((err) => {
  // On error, still allow session to continue
  process.stdout.write(JSON.stringify({ continue: true }) + "\n");
});
