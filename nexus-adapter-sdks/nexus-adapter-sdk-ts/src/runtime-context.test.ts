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
  it("loads runtime context (legacy Nex v1 injection) from NEXUS_ADAPTER_CONTEXT_PATH", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-adapter-ctx-test-"));
    const ctxPath = path.join(dir, "runtime-context.json");
    fs.writeFileSync(
      ctxPath,
      `${JSON.stringify(
        {
          version: 1,
          channel: "discord",
          account_id: "default",
          config: { webhook_id: "abc123" },
          credential: {
            ref: "discord/default",
            service: "discord",
            account: "default",
            value: "token-123",
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
        channel: "discord",
        account_id: "default",
        config: { webhook_id: "abc123" },
        credential: { kind: "token", ref: "discord/default", value: "token-123" },
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

  it("loads runtime context (spec shape) from NEXUS_ADAPTER_CONTEXT_PATH", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-adapter-ctx-test-"));
    const ctxPath = path.join(dir, "runtime-context.json");
    fs.writeFileSync(
      ctxPath,
      `${JSON.stringify(
        {
          channel: "discord",
          account_id: "echo-bot",
          config: { dm_policy: "allow_owner_only" },
          credential: {
            kind: "token",
            value: "token-456",
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
        channel: "discord",
        account_id: "echo-bot",
        config: { dm_policy: "allow_owner_only" },
        credential: { kind: "token", value: "token-456" },
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
