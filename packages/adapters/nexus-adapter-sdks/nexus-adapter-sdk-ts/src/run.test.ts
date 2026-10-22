import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { runAdapter, type AdapterDefinition, type AdapterMethodInvokeRequest } from "./run.js";

function captureStream() {
  const stream = new PassThrough();
  let data = "";
  stream.on("data", (chunk) => {
    data += chunk.toString("utf8");
  });
  return {
    stream: stream as unknown as NodeJS.WriteStream,
    read: () => data,
  };
}

describe("runAdapter", () => {
  it("info outputs AdapterInfo JSON", async () => {
    const stdout = captureStream();
    const stderr = captureStream();

    const code = await runAdapter(
      {
        operations: {
          "adapter.info": () => ({
            platform: "test",
            name: "test-adapter",
            version: "0.0.0",
            operations: ["adapter.info"],
            methods: [],
            multi_account: false,
            platform_capabilities: {
              text_limit: 1,
              supports_markdown: false,
              supports_tables: false,
              supports_code_blocks: false,
              supports_embeds: false,
              supports_threads: false,
              supports_reactions: false,
              supports_polls: false,
              supports_buttons: false,
              supports_edit: false,
              supports_delete: false,
              supports_media: false,
              supports_voice_notes: false,
              supports_streaming_edit: false,
            },
          }),
        },
      },
      {
        argv: ["node", "adapter", "adapter.info"],
        stdout: stdout.stream,
        stderr: stderr.stream,
        patchConsole: false,
        installSignalHandlers: false,
      },
    );

    expect(code).toBe(0);
    expect(stderr.read()).toBe("");
    expect(JSON.parse(stdout.read().trim())).toMatchObject({
      platform: "test",
      name: "test-adapter",
    });
  });

  it("namespaced method invocation passes payload-json through the method dispatch path", async () => {
    const stdout = captureStream();
    const stderr = captureStream();

    const code = await runAdapter(
      {
        operations: {
          "adapter.info": () => ({
            platform: "test",
            name: "test-adapter",
            version: "0.0.0",
            operations: ["adapter.info"],
            methods: [
              {
                name: "test.send",
                action: "write",
                connection_required: true,
                mutates_remote: true,
                context_hints: { params: {} },
                origin: {
                  package_kind: "adapter",
                  package_id: "test",
                  package_version: "0.0.0",
                  declaration_mode: "manifest",
                  declaration_source: "adapter.info",
                  namespace: "test",
                },
              },
            ],
            multi_account: false,
            platform_capabilities: {
              text_limit: 2000,
              supports_markdown: false,
              supports_tables: false,
              supports_code_blocks: false,
              supports_embeds: false,
              supports_threads: false,
              supports_reactions: false,
              supports_polls: false,
              supports_buttons: false,
              supports_edit: false,
              supports_delete: false,
              supports_media: false,
              supports_voice_notes: false,
              supports_streaming_edit: false,
            },
          }),
          methods: {
            "test.send": async (_ctx, req) => ({
              ok: true,
              connection_id: req.connection_id,
              payload: req.payload,
            }),
          },
        },
      },
      {
        argv: [
          "node",
          "adapter",
          "test.send",
          "--connection",
          "default",
          "--payload-json",
          "{\"target\":{\"connection_id\":\"default\",\"channel\":{\"platform\":\"test\",\"container_kind\":\"group\",\"container_id\":\"channel:1\"}},\"text\":\"hi\"}",
        ],
        stdout: stdout.stream,
        stderr: stderr.stream,
        requireRuntimeContext: false,
        patchConsole: false,
        installSignalHandlers: false,
      },
    );

    expect(code).toBe(0);
    expect(stderr.read()).toBe("");
    expect(JSON.parse(stdout.read().trim())).toMatchObject({
      ok: true,
      connection_id: "default",
      payload: {
        target: {
          connection_id: "default",
          channel: {
            platform: "test",
            container_kind: "group",
            container_id: "channel:1",
          },
        },
        text: "hi",
      },
    });
  });

  it("records.backfill passes an exact optional upper bound to the adapter", async () => {
    const stdout = captureStream();
    const stderr = captureStream();
    let received: { connection_id: string; since: Date; to?: Date } | undefined;

    const code = await runAdapter(
      {
        operations: {
          "adapter.info": () => ({
            platform: "test",
            name: "test-adapter",
            version: "0.0.0",
            operations: ["adapter.info", "records.backfill"],
            methods: [],
            multi_account: false,
            platform_capabilities: {},
          }),
          "records.backfill": async (_ctx, args) => {
            received = args;
          },
        },
      },
      {
        argv: [
          "node",
          "adapter",
          "records.backfill",
          "--connection",
          "acct-1",
          "--since",
          "2026-07-01T00:00:00.000Z",
          "--to",
          "2026-07-17T23:59:59.000Z",
        ],
        stdout: stdout.stream,
        stderr: stderr.stream,
        requireRuntimeContext: false,
        validateOutput: false,
        patchConsole: false,
        installSignalHandlers: false,
      },
    );

    expect(code).toBe(0);
    expect(stderr.read()).toContain("backfill completed");
    expect(stdout.read()).toBe("");
    expect(received).toEqual({
      connection_id: "acct-1",
      since: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-07-17T23:59:59.000Z"),
    });
  });

  it("monitor requires runtime context by default (non-info command)", async () => {
    const stdout = captureStream();
    const stderr = captureStream();

    const code = await runAdapter(
      {
        operations: {
          "adapter.info": () => ({
            platform: "test",
            name: "test-adapter",
            version: "0.0.0",
            operations: ["adapter.info", "adapter.monitor.start"],
            methods: [],
            multi_account: false,
            platform_capabilities: {
              text_limit: 1,
              supports_markdown: false,
              supports_tables: false,
              supports_code_blocks: false,
              supports_embeds: false,
              supports_threads: false,
              supports_reactions: false,
              supports_polls: false,
              supports_buttons: false,
              supports_edit: false,
              supports_delete: false,
              supports_media: false,
              supports_voice_notes: false,
              supports_streaming_edit: false,
            },
          }),
          "adapter.monitor.start": async () => {},
        },
      },
      {
        argv: [
          "node",
          "adapter",
          "adapter.monitor.start",
          "--connection",
          "default",
          "--format",
          "jsonl",
        ],
        stdout: stdout.stream,
        stderr: stderr.stream,
        patchConsole: false,
        installSignalHandlers: false,
        env: {},
      },
    );

    expect(code).toBe(1);
    expect(stdout.read()).toBe("");
    expect(stderr.read()).toContain("Missing adapter runtime context");
  });

  it("custom setup start accepts payload JSON without runtime context", async () => {
    const stdout = captureStream();
    const stderr = captureStream();

    const code = await runAdapter(
      {
        operations: {
          "adapter.info": () => ({
            platform: "test",
            name: "test-adapter",
            version: "0.0.0",
            operations: ["adapter.info", "adapter.setup.start"],
            methods: [],
            multi_account: false,
            platform_capabilities: {
              text_limit: 1,
              supports_markdown: false,
              supports_tables: false,
              supports_code_blocks: false,
              supports_embeds: false,
              supports_threads: false,
              supports_reactions: false,
              supports_polls: false,
              supports_buttons: false,
              supports_edit: false,
              supports_delete: false,
              supports_media: false,
              supports_voice_notes: false,
              supports_streaming_edit: false,
            },
          }),
          "adapter.setup.start": async (_ctx, req) => ({
            status: "pending",
            session_id: req.session_id ?? "setup-1",
            connection_id: req.connection_id ?? "default",
            service: "test",
            message: "ok",
          }),
        },
      },
      {
        argv: [
          "node",
          "adapter",
          "adapter.setup.start",
          "--session-id",
          "setup-1",
          "--payload-json",
          "{\"confirm\":\"yes\"}",
        ],
        stdout: stdout.stream,
        stderr: stderr.stream,
        patchConsole: false,
        installSignalHandlers: false,
        env: {},
      },
    );

    expect(code).toBe(0);
    expect(stderr.read()).toBe("");
    expect(JSON.parse(stdout.read().trim())).toMatchObject({
      status: "pending",
      session_id: "setup-1",
      service: "test",
    });
  });

  it("adapter.serve.start serves invoke requests with serve-session helpers", async () => {
    const stdout = captureStream();
    const stderr = captureStream();
    const stdin = new PassThrough();

    const runPromise = runAdapter(
      {
        operations: {
          "adapter.info": () => ({
            platform: "test",
            name: "test-adapter",
            version: "0.0.0",
            operations: ["adapter.info", "adapter.serve.start"],
            methods: [],
            multi_account: false,
            platform_capabilities: {
              text_limit: 1,
              supports_markdown: false,
              supports_tables: false,
              supports_code_blocks: false,
              supports_embeds: false,
              supports_threads: false,
              supports_reactions: false,
              supports_polls: false,
              supports_buttons: false,
              supports_edit: false,
              supports_delete: false,
              supports_media: false,
              supports_voice_notes: false,
              supports_streaming_edit: false,
            },
          }),
          "adapter.serve.start": async (_ctx, { connection_id }, session) => {
            const registry = session.createEndpointRegistry();
            await registry.upsert({
              endpoint_id: "device-host-1",
              display_name: "Device Host",
              platform: "ios",
              caps: ["camera"],
              commands: ["camera.snap"],
            });
            await session.serve({
              onInvoke: async (frame) => ({
                ok: true,
                payload: {
                  connection_id,
                  endpoint_id: frame.endpoint_id,
                  command: frame.command,
                },
              }),
            });
          },
        },
      },
      {
        argv: ["node", "adapter", "adapter.serve.start", "--connection", "acct-1"],
        stdin: stdin as unknown as NodeJS.ReadableStream,
        stdout: stdout.stream,
        stderr: stderr.stream,
        requireRuntimeContext: false,
        patchConsole: false,
        installSignalHandlers: false,
      },
    );

    stdin.write(
      `${JSON.stringify({
        type: "invoke.request",
        request_id: "req-1",
        endpoint_id: "device-host-1",
        command: "camera.snap",
        payload: { quality: "high" },
      })}\n`,
    );
    stdin.end();

    const code = await runPromise;
    expect(code).toBe(0);
    const lines = stdout
      .read()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      type: "endpoint.upsert",
      endpoint_id: "device-host-1",
      commands: ["camera.snap"],
    });
    expect(lines[1]).toMatchObject({
      type: "invoke.result",
      request_id: "req-1",
      ok: true,
      payload: {
        connection_id: "acct-1",
        endpoint_id: "device-host-1",
        command: "camera.snap",
      },
    });
    expect(stderr.read()).toBe("");
  });

  it("invokes generic namespaced adapter methods with connection and payload", async () => {
    const stdout = captureStream();
    const stderr = captureStream();

    const code = await runAdapter(
      {
        operations: {
          "adapter.info": () => ({
            platform: "test",
            name: "test-adapter",
            version: "0.0.0",
            operations: ["adapter.info"],
            methods: [
              {
                name: "test.echo",
                description: "Echo a payload",
                action: "read",
                params: { type: "object" },
                response: { type: "object" },
                connection_required: true,
                mutates_remote: false,
              },
            ],
            methodCatalog: {
              source: "manifest",
              namespace: "test",
            },
            multi_account: false,
            platform_capabilities: {},
          }),
          methods: {
            "test.echo": async (_ctx, req) => ({
              ok: true,
              connection_id: req.connection_id,
              payload: req.payload ?? null,
            }),
          },
        },
      },
      {
        argv: [
          "node",
          "adapter",
          "test.echo",
          "--connection",
          "default",
          "--payload-json",
          "{\"value\":\"hello\"}",
        ],
        stdout: stdout.stream,
        stderr: stderr.stream,
        patchConsole: false,
        installSignalHandlers: false,
        requireRuntimeContext: false,
      },
    );

    expect(code).toBe(0);
    expect(stderr.read()).toBe("");
    expect(JSON.parse(stdout.read().trim())).toEqual({
      ok: true,
      connection_id: "default",
      payload: {
        value: "hello",
      },
    });
  });
});

describe("runAdapter --payload-file", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function payloadDir(): string {
    const root = mkdtempSync(join(tmpdir(), "nexus-sdk-payload-"));
    roots.push(root);
    return root;
  }

  function echoAdapter(seen: AdapterMethodInvokeRequest[]): AdapterDefinition {
    return {
      operations: {
        "adapter.setup.submit": async (_ctx, req) => ({
          status: "completed",
          session_id: req.session_id ?? "setup-1",
          service: "test",
          message: `fields ${Object.keys(req.payload ?? {}).sort().join(",")}`,
        }),
        methods: {
          "test.upload": async (_ctx, req) => {
            seen.push(req);
            return { ok: true, bytes: String(req.payload?.body ?? "").length };
          },
        },
      },
    };
  }

  async function invoke(adapter: AdapterDefinition, args: string[]) {
    const stdout = captureStream();
    const stderr = captureStream();
    const code = await runAdapter(adapter, {
      argv: ["node", "adapter", ...args],
      stdout: stdout.stream,
      stderr: stderr.stream,
      requireRuntimeContext: false,
      patchConsole: false,
      installSignalHandlers: false,
    });
    return { code, stdout: stdout.read(), stderr: stderr.read() };
  }

  it("reads a method payload over 200 KiB from a private file, exactly once", async () => {
    const dir = payloadDir();
    const body = "x".repeat(210 * 1024);
    const payloadPath = join(dir, "payload.json");
    writeFileSync(payloadPath, JSON.stringify({ body, note: "é" }), { mode: 0o600 });
    const seen: AdapterMethodInvokeRequest[] = [];

    const result = await invoke(echoAdapter(seen), [
      "test.upload",
      "--connection",
      "acct-1",
      "--payload-file",
      payloadPath,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout.trim())).toEqual({ ok: true, bytes: body.length });
    expect(seen).toEqual([{ connection_id: "acct-1", payload: { body, note: "é" } }]);
  });

  it("reads a setup payload from --payload-file too", async () => {
    const dir = payloadDir();
    const payloadPath = join(dir, "payload.json");
    writeFileSync(payloadPath, JSON.stringify({ confirm: "yes", code: "123" }), { mode: 0o600 });

    const result = await invoke(echoAdapter([]), [
      "adapter.setup.submit",
      "--session-id",
      "setup-1",
      "--payload-file",
      payloadPath,
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({ status: "completed", message: "fields code,confirm" });
  });

  it("refuses --payload-json together with --payload-file before the handler runs", async () => {
    const dir = payloadDir();
    const payloadPath = join(dir, "payload.json");
    writeFileSync(payloadPath, "{}", { mode: 0o600 });
    const seen: AdapterMethodInvokeRequest[] = [];

    const result = await invoke(echoAdapter(seen), [
      "test.upload",
      "--payload-json",
      "{}",
      "--payload-file",
      payloadPath,
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--payload-json and --payload-file are mutually exclusive");
    expect(seen).toEqual([]);
  });

  it("refuses a link, a directory and a missing path", async () => {
    const dir = payloadDir();
    const target = join(dir, "target.json");
    writeFileSync(target, '{"a":1}', { mode: 0o600 });
    const link = join(dir, "link.json");
    symlinkSync(target, link);
    const folder = join(dir, "folder");
    mkdirSync(folder);
    const seen: AdapterMethodInvokeRequest[] = [];

    const linked = await invoke(echoAdapter(seen), ["test.upload", "--payload-file", link]);
    expect(linked.code).toBe(1);
    expect(linked.stderr).toContain("--payload-file must be a regular file, not a link");

    const directory = await invoke(echoAdapter(seen), ["test.upload", "--payload-file", folder]);
    expect(directory.code).toBe(1);
    expect(directory.stderr).toContain("--payload-file must be a regular file");

    const missing = await invoke(echoAdapter(seen), ["test.upload", "--payload-file", join(dir, "absent.json")]);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("--payload-file could not be read");
    expect(seen).toEqual([]);
  });

  it("refuses malformed or non-object JSON without quoting the file", async () => {
    const dir = payloadDir();
    const broken = join(dir, "broken.json");
    writeFileSync(broken, '{"body":"SECRET-DOCUMENT-TEXT"', { mode: 0o600 });
    const list = join(dir, "list.json");
    writeFileSync(list, '["SECRET-DOCUMENT-TEXT"]', { mode: 0o600 });
    const seen: AdapterMethodInvokeRequest[] = [];

    const malformed = await invoke(echoAdapter(seen), ["test.upload", "--payload-file", broken]);
    expect(malformed.code).toBe(1);
    expect(malformed.stderr).toContain("--payload-file must contain valid JSON");
    expect(malformed.stderr).not.toContain("SECRET-DOCUMENT-TEXT");

    const array = await invoke(echoAdapter(seen), ["test.upload", "--payload-file", list]);
    expect(array.code).toBe(1);
    expect(array.stderr).toContain("--payload-file must decode to a JSON object");
    expect(array.stderr).not.toContain("SECRET-DOCUMENT-TEXT");
    expect(seen).toEqual([]);
  });
});
