import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { runAdapter } from "./run.js";

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

  it("channels.send handler errors are returned as a structured DeliveryResult (exit 0)", async () => {
    const stdout = captureStream();
    const stderr = captureStream();

    const code = await runAdapter(
      {
        operations: {
          "adapter.info": () => ({
            platform: "test",
            name: "test-adapter",
            version: "0.0.0",
            operations: ["adapter.info", "channels.send"],
            methods: [],
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
          "channels.send": async () => {
            throw new Error("boom");
          },
        },
      },
      {
        argv: [
          "node",
          "adapter",
          "channels.send",
          "--connection",
          "default",
          "--target-json",
          "{\"connection_id\":\"default\",\"channel\":{\"platform\":\"test\",\"container_kind\":\"group\",\"container_id\":\"channel:1\"}}",
          "--text",
          "hi",
        ],
        stdout: stdout.stream,
        stderr: stderr.stream,
        requireRuntimeContext: false,
        patchConsole: false,
        installSignalHandlers: false,
      },
    );

    expect(code).toBe(0);
    expect(JSON.parse(stdout.read().trim())).toMatchObject({
      success: false,
      message_ids: [],
      chunks_sent: 0,
      error: { type: "unknown", message: "boom", retry: false },
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

  it("adapter.control.start serves invoke requests with control-session helpers", async () => {
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
            operations: ["adapter.info", "adapter.control.start"],
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
          "adapter.control.start": async (_ctx, { connection_id }, session) => {
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
        argv: ["node", "adapter", "adapter.control.start", "--connection", "acct-1"],
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
                surfaces: ["ws.control", "http.control"],
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
