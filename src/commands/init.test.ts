import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("initCommand", () => {
  let tmpDir: string;
  let runtime: {
    log: (msg: string) => void;
    error: (msg: string) => void;
    exit: (code: number) => void;
  };
  let logs: string[];

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-init-test-"));
    logs = [];
    runtime = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
      exit: () => {},
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function loadInitCommand(root: string) {
    process.env.NEXUS_ROOT = root;
    process.env.NEXUS_STATE_DIR = path.join(root, "state");
    vi.resetModules();
    const mod = await import("./init.js");
    return mod.initCommand;
  }

  it("creates workspace directory structure", async () => {
    const root = path.join(tmpDir, "nexus");
    const initCommand = await loadInitCommand(root);
    const workspaceDir = path.join(root, "home");

    await initCommand({ workspace: workspaceDir }, runtime);

    const workspaceStat = await fs.stat(workspaceDir);
    expect(workspaceStat.isDirectory()).toBe(true);

    const agentsPath = path.join(root, "AGENTS.md");
    const cursorRulesPath = path.join(root, ".cursor", "rules");
    const cursorHooksPath = path.join(root, ".cursor", "hooks.json");
    const cursorHookScriptPath = path.join(
      root,
      ".cursor",
      "hooks",
      "nexus-session-start.js",
    );
    await expect(fs.access(agentsPath)).resolves.toBeUndefined();
    await expect(fs.access(cursorRulesPath)).resolves.toBeUndefined();
    await expect(fs.access(cursorHooksPath)).resolves.toBeUndefined();
    await expect(fs.access(cursorHookScriptPath)).resolves.toBeUndefined();

    const projectsDir = path.join(workspaceDir, "projects");
    const memoryDir = path.join(workspaceDir, "memory");
    await expect(fs.access(projectsDir)).rejects.toBeDefined();
    await expect(fs.access(memoryDir)).rejects.toBeDefined();

    const bootstrapPath = path.join(
      root,
      "state",
      "agents",
      "BOOTSTRAP.md",
    );
    await expect(fs.access(bootstrapPath)).resolves.toBeUndefined();
  });

  it("creates skills manifest in state", async () => {
    const root = path.join(tmpDir, "nexus");
    const initCommand = await loadInitCommand(root);
    const workspaceDir = path.join(root, "home");

    await initCommand({ workspace: workspaceDir }, runtime);

    const manifestPath = path.join(
      root,
      "state",
      "skills",
      "manifest.json",
    );
    await expect(fs.access(manifestPath)).resolves.toBeUndefined();
  });

  it("is idempotent", async () => {
    const root = path.join(tmpDir, "nexus");
    const initCommand = await loadInitCommand(root);
    const workspaceDir = path.join(root, "home");

    await initCommand({ workspace: workspaceDir }, runtime);
    await initCommand({ workspace: workspaceDir }, runtime);

    const workspaceStat = await fs.stat(workspaceDir);
    expect(workspaceStat.isDirectory()).toBe(true);
  });
});
