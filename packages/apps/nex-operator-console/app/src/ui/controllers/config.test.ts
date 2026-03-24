import { describe, expect, it, vi } from "vitest";
import {
  applyConfigSnapshot,
  applyConfig,
  runUpdate,
  updateConfigFormValue,
  type ConfigState,
} from "./config.ts";

function createState(): ConfigState {
  return {
    applySessionKey: "main",
    client: null,
    configActiveSection: null,
    configActiveSubsection: null,
    configApplying: false,
    configForm: null,
    configFormDirty: false,
    configFormMode: "form",
    configFormOriginal: null,
    configIssues: [],
    configLoading: false,
    configRaw: "",
    configRawOriginal: "",
    configSaving: false,
    configSchema: null,
    configSchemaLoading: false,
    configSchemaVersion: null,
    configSearchQuery: "",
    configSnapshot: null,
    configUiHints: {},
    configValid: null,
    connected: false,
    lastError: null,
    updateRunning: false,
  };
}

describe("applyConfigSnapshot", () => {
  it("does not clobber form edits while dirty", () => {
    const state = createState();
    state.configFormMode = "form";
    state.configFormDirty = true;
    state.configForm = { runtime: { mode: "local", port: 18789 } };
    state.configRaw = "{\n}\n";

    applyConfigSnapshot(state, {
      config: { runtime: { mode: "remote", port: 9999 } },
      valid: true,
      issues: [],
      raw: '{\n  "runtime": { "mode": "remote", "port": 9999 }\n}\n',
    });

    expect(state.configRaw).toBe(
      '{\n  "runtime": {\n    "mode": "local",\n    "port": 18789\n  }\n}\n',
    );
  });

  it("updates config form when clean", () => {
    const state = createState();
    applyConfigSnapshot(state, {
      config: { runtime: { mode: "local" } },
      valid: true,
      issues: [],
      raw: "{}",
    });

    expect(state.configForm).toEqual({ runtime: { mode: "local" } });
  });

  it("sets configRawOriginal when clean for change detection", () => {
    const state = createState();
    applyConfigSnapshot(state, {
      config: { runtime: { mode: "local" } },
      valid: true,
      issues: [],
      raw: '{ "runtime": { "mode": "local" } }',
    });

    expect(state.configRawOriginal).toBe('{ "runtime": { "mode": "local" } }');
    expect(state.configFormOriginal).toEqual({ runtime: { mode: "local" } });
  });

  it("preserves configRawOriginal when dirty", () => {
    const state = createState();
    state.configFormDirty = true;
    state.configRawOriginal = '{ "original": true }';
    state.configFormOriginal = { original: true };

    applyConfigSnapshot(state, {
      config: { runtime: { mode: "local" } },
      valid: true,
      issues: [],
      raw: '{ "runtime": { "mode": "local" } }',
    });

    // Original values should be preserved when dirty
    expect(state.configRawOriginal).toBe('{ "original": true }');
    expect(state.configFormOriginal).toEqual({ original: true });
  });
});

describe("updateConfigFormValue", () => {
  it("seeds from snapshot when form is null", () => {
    const state = createState();
    state.configSnapshot = {
      config: { channels: { telegram: { botToken: "t" } }, runtime: { mode: "local" } },
      valid: true,
      issues: [],
      raw: "{}",
    };

    updateConfigFormValue(state, ["runtime", "port"], 18789);

    expect(state.configFormDirty).toBe(true);
    expect(state.configForm).toEqual({
      channels: { telegram: { botToken: "t" } },
      runtime: { mode: "local", port: 18789 },
    });
  });

  it("keeps raw in sync while editing the form", () => {
    const state = createState();
    state.configSnapshot = {
      config: { runtime: { mode: "local" } },
      valid: true,
      issues: [],
      raw: "{\n}\n",
    };

    updateConfigFormValue(state, ["runtime", "port"], 18789);

    expect(state.configRaw).toBe(
      '{\n  "runtime": {\n    "mode": "local",\n    "port": 18789\n  }\n}\n',
    );
  });
});

describe("applyConfig", () => {
  it("sends config.apply with raw and session id", async () => {
    const request = vi.fn().mockResolvedValue({});
    const state = createState();
    state.connected = true;
    state.client = { request } as unknown as ConfigState["client"];
    state.applySessionKey = "agent:main:whatsapp:dm:+15555550123";
    state.configFormMode = "raw";
    state.configRaw = '{\n  agent: { workspace: "~/nexus" }\n}\n';
    state.configSnapshot = {
      hash: "hash-123",
    };

    await applyConfig(state);

    expect(request).toHaveBeenCalledWith("config.apply", {
      raw: '{\n  agent: { workspace: "~/nexus" }\n}\n',
      baseHash: "hash-123",
      sessionId: "agent:main:whatsapp:dm:+15555550123",
    });
  });
});

describe("runUpdate", () => {
  it("sends update.run with session id", async () => {
    const request = vi.fn().mockResolvedValue({});
    const state = createState();
    state.connected = true;
    state.client = { request } as unknown as ConfigState["client"];
    state.applySessionKey = "agent:main:whatsapp:dm:+15555550123";

    await runUpdate(state);

    expect(request).toHaveBeenCalledWith("update.run", {
      sessionId: "agent:main:whatsapp:dm:+15555550123",
    });
  });
});
