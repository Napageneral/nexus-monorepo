import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADAPTER_CONTEXT_ENV_VAR,
  loadAdapterRuntimeContext,
  requireAdapterRuntimeContext,
} from "./runtime-context.js";

describe("runtime context", () => {
  it("loads runtime context from NEXUS_ADAPTER_CONTEXT_PATH", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-adapter-ctx-test-"));
    const ctxPath = path.join(dir, "runtime-context.json");
    fs.writeFileSync(
      ctxPath,
      `${JSON.stringify(
        {
          version: 1,
          platform: "discord",
          connection_id: "echo-bot",
          config: { dm_policy: "allow_owner_only" },
          credential: {
            kind: "token",
            value: "token-456",
            fields: { token: "token-456" },
            auth_id: "token",
            type: "token",
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const previous = process.env[ADAPTER_CONTEXT_ENV_VAR];
    try {
      process.env[ADAPTER_CONTEXT_ENV_VAR] = ctxPath;
      const loaded = requireAdapterRuntimeContext();
      expect(loaded).toMatchObject({
        platform: "discord",
        connection_id: "echo-bot",
        config: { dm_policy: "allow_owner_only" },
        credential: {
          kind: "token",
          value: "token-456",
          fields: { token: "token-456" },
        },
      });
    } finally {
      if (previous === undefined) {
        delete process.env[ADAPTER_CONTEXT_ENV_VAR];
      } else {
        process.env[ADAPTER_CONTEXT_ENV_VAR] = previous;
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns null when the env var is unset", () => {
    const previous = process.env[ADAPTER_CONTEXT_ENV_VAR];
    try {
      delete process.env[ADAPTER_CONTEXT_ENV_VAR];
      expect(loadAdapterRuntimeContext()).toBeNull();
    } finally {
      if (previous === undefined) {
        delete process.env[ADAPTER_CONTEXT_ENV_VAR];
      } else {
        process.env[ADAPTER_CONTEXT_ENV_VAR] = previous;
      }
    }
  });
});
