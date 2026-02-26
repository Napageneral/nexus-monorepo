import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

type SpawnResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

function runDiscordAdapter(args: string[], env: NodeJS.ProcessEnv = process.env): SpawnResult {
  const result = spawnSync(process.execPath, ["dist/index.js", ...args], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function readFirstOutputLine(output: string): string {
  const line = output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);
  if (!line) {
    throw new Error(`expected output line, received: ${output}`);
  }
  return line;
}

describe("discord adapter contract smoke", () => {
  it("prints adapter.info with api_key auth manifest", () => {
    const result = runDiscordAdapter(["adapter.info"]);
    expect(result.status).toBe(0);

    const payload = JSON.parse(readFirstOutputLine(result.stdout)) as Record<string, unknown>;
    expect(payload.platform).toBe("discord");

    const operations = Array.isArray(payload.operations) ? payload.operations : [];
    expect(operations).toContain("adapter.monitor.start");
    expect(operations).toContain("delivery.send");

    const auth = (payload.auth ?? {}) as Record<string, unknown>;
    const methods = Array.isArray(auth.methods) ? auth.methods : [];
    expect(methods.length).toBeGreaterThan(0);

    const firstMethod = methods[0] as Record<string, unknown>;
    expect(firstMethod.type).toBe("api_key");
    expect(firstMethod.service).toBe("discord");
  });

  it("lists accounts when runtime context is present", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "discord-adapter-test-"));
    const contextPath = path.join(tempDir, "runtime-context.json");
    fs.writeFileSync(
      contextPath,
      JSON.stringify(
        {
          version: 1,
          platform: "discord",
          account_id: "default",
          config: {},
          credential: {
            kind: "token",
            value: "bot-token-test",
            ref: "discord/default",
            service: "discord",
            account: "default",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    try {
      const result = runDiscordAdapter(["adapter.accounts.list", "--account", "default"], {
        ...process.env,
        NEXUS_ADAPTER_CONTEXT_PATH: contextPath,
      });
      expect(result.status).toBe(0);

      const payload = JSON.parse(readFirstOutputLine(result.stdout)) as unknown[];
      expect(Array.isArray(payload)).toBe(true);
      expect(payload.length).toBeGreaterThan(0);

      const first = payload[0] as Record<string, unknown>;
      expect(first.id).toBe("default");
      expect(first.credential_ref).toBe("discord/default");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
