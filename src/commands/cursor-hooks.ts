import fsp from "node:fs/promises";
import path from "node:path";

import { resolveUserPath } from "../utils.js";

export type CursorHooksOptions = {
  workspaceDir?: string;
  hooksPath?: string;
  scriptPath?: string;
};

export type CursorHooksWriteResult = {
  hooksPath: string;
  scriptPath: string;
  hooksCreated: boolean;
  scriptCreated: boolean;
};

const DEFAULT_SCRIPT_NAME = "nexus-session-start.js";

const HOOK_SCRIPT = `#!/usr/bin/env node
const { execFile } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const MAX_IDENTITY_CHARS = 120000;
const MAX_MEMORY_CHARS = 120000;
const MAX_DAILY_CHARS = 40000;
const MAX_BOOTSTRAP_CHARS = 80000;

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
  return \`\${year}-\${month}-\${day}\`;
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
    return \`\${slice}\\n\\n[truncated]\`;
  } catch {
    return null;
  }
}

function addSection(sections, title, body) {
  if (!body) return;
  sections.push(\`## \${title}\\n\${body}\`);
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
  const status = await runStatus(env, workspaceRoot);
  const identity = status?.identity || null;
  const agentId = identity?.agentId || process.env.NEXUS_AGENT_ID || "default";
  const agentIdentityPath =
    identity?.agentIdentityPath ||
    path.join(stateDir, "agents", agentId, "IDENTITY.md");
  const agentSoulPath =
    identity?.agentSoulPath || path.join(stateDir, "agents", agentId, "SOUL.md");
  const agentMemoryPath =
    identity?.agentMemoryPath ||
    path.join(stateDir, "agents", agentId, "MEMORY.md");
  const userIdentityPath =
    identity?.userIdentityPath || path.join(stateDir, "user", "IDENTITY.md");
  const userProfilePath = path.join(stateDir, "user", "PROFILE.md");
  const resolvedUserPath = fs.existsSync(userIdentityPath)
    ? userIdentityPath
    : fs.existsSync(userProfilePath)
      ? userProfilePath
      : userIdentityPath;

  const sections = ["# Nexus Session Bootstrap"];
  if (identity) {
    const summary = [
      \`Agent: \${identity.agentName || "(unknown)"} (\${identity.agentId})\`,
      \`User: \${identity.userName || "(unknown)"}\`,
      \`Agent ID: \${identity.agentId}\`,
    ];
    addSection(sections, "Status", summary.join("\\n"));
  }

  const bootstrapPath =
    status?.identity?.bootstrapPath ||
    path.join(stateDir, "agents", "BOOTSTRAP.md");
  const hasIdentity =
    typeof identity?.hasIdentity === "boolean"
      ? identity.hasIdentity
      : fs.existsSync(agentIdentityPath) && fs.existsSync(resolvedUserPath);
  let bootstrapPrompt = status?.bootstrap?.prompt || null;
  if (!bootstrapPrompt && !hasIdentity) {
    bootstrapPrompt = await readFileSnippet(
      bootstrapPath,
      MAX_BOOTSTRAP_CHARS,
    );
  }
  if (bootstrapPrompt) {
    addSection(sections, "Bootstrap Prompt", bootstrapPrompt.trim());
  }

  const agentIdentity = await readFileSnippet(
    agentIdentityPath,
    MAX_IDENTITY_CHARS,
  );
  const agentSoul = await readFileSnippet(agentSoulPath, MAX_IDENTITY_CHARS);
  const agentMemory = await readFileSnippet(agentMemoryPath, MAX_MEMORY_CHARS);
  const userIdentity = await readFileSnippet(
    resolvedUserPath,
    MAX_IDENTITY_CHARS,
  );

  addSection(sections, "Agent Identity", agentIdentity);
  addSection(sections, "Agent Soul", agentSoul);
  addSection(sections, "Agent Memory", agentMemory);
  addSection(sections, "User Identity", userIdentity);

  const memoryDir = path.join(workspaceRoot, "home", "memory");
  const today = formatDate(new Date());
  const yesterday = formatDate(new Date(Date.now() - 86400000));
  const todayLog = await readFileSnippet(
    path.join(memoryDir, \`\${today}.md\`),
    MAX_DAILY_CHARS,
  );
  const yesterdayLog = await readFileSnippet(
    path.join(memoryDir, \`\${yesterday}.md\`),
    MAX_DAILY_CHARS,
  );

  addSection(sections, \`Daily Memory (\${today})\`, todayLog);
  addSection(sections, \`Daily Memory (\${yesterday})\`, yesterdayLog);

  const additional = sections.join("\\n\\n").trim();
  const output = { continue: true, additional_context: additional };
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
  process.stdout.write(JSON.stringify(output) + "\\n");
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ continue: true }) + "\\n");
});
`;

async function writeFileIfMissing(filePath: string, content: string) {
  try {
    await fsp.writeFile(filePath, content, { encoding: "utf-8", flag: "wx" });
    return true;
  } catch (err) {
    const anyErr = err as { code?: string };
    if (anyErr.code === "EEXIST") return false;
    throw err;
  }
}

export async function writeCursorHooks(
  options: CursorHooksOptions = {},
): Promise<CursorHooksWriteResult> {
  const workspaceDir = resolveUserPath(options.workspaceDir ?? process.cwd());
  const hooksPath =
    options.hooksPath ?? path.join(workspaceDir, ".cursor", "hooks.json");
  const scriptPath =
    options.scriptPath ??
    path.join(workspaceDir, ".cursor", "hooks", DEFAULT_SCRIPT_NAME);

  await fsp.mkdir(path.dirname(hooksPath), { recursive: true });
  await fsp.mkdir(path.dirname(scriptPath), { recursive: true });

  const hooksConfig = JSON.stringify(
    {
      version: 1,
      hooks: {
        sessionStart: [
          { command: `node .cursor/hooks/${DEFAULT_SCRIPT_NAME}` },
        ],
      },
    },
    null,
    2,
  );

  const hooksCreated = await writeFileIfMissing(
    hooksPath,
    `${hooksConfig}\n`,
  );
  const scriptCreated = await writeFileIfMissing(scriptPath, HOOK_SCRIPT);

  return { hooksPath, scriptPath, hooksCreated, scriptCreated };
}
