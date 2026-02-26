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

  it("send handler errors are returned as a structured DeliveryResult (exit 0)", async () => {
    const stdout = captureStream();
    const stderr = captureStream();

    const code = await runAdapter(
      {
        operations: {
          "adapter.info": () => ({
            platform: "test",
            name: "test-adapter",
            version: "0.0.0",
            operations: ["adapter.info", "delivery.send"],
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
          "delivery.send": async () => {
            throw new Error("boom");
          },
        },
      },
      {
        argv: [
          "node",
          "adapter",
          "delivery.send",
          "--account",
          "default",
          "--to",
          "channel:1",
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
          "--account",
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
            account: req.account ?? "default",
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
});
