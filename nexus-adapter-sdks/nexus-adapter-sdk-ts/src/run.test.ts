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
        info: () => ({
          channel: "test",
          name: "test-adapter",
          version: "0.0.0",
          supports: ["monitor"],
          multi_account: false,
          channel_capabilities: {
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
      {
        argv: ["node", "adapter", "info"],
        stdout: stdout.stream,
        stderr: stderr.stream,
        patchConsole: false,
        installSignalHandlers: false,
      },
    );

    expect(code).toBe(0);
    expect(stderr.read()).toBe("");
    expect(JSON.parse(stdout.read().trim())).toMatchObject({ channel: "test", name: "test-adapter" });
  });

  it("send handler errors are returned as a structured DeliveryResult (exit 0)", async () => {
    const stdout = captureStream();
    const stderr = captureStream();

    const code = await runAdapter(
      {
        info: () => ({
          channel: "test",
          name: "test-adapter",
          version: "0.0.0",
          supports: ["send"],
          multi_account: false,
          channel_capabilities: {
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
        send: async () => {
          throw new Error("boom");
        },
      },
      {
        argv: ["node", "adapter", "send", "--account", "default", "--to", "channel:1", "--text", "hi"],
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
        info: () => ({
          channel: "test",
          name: "test-adapter",
          version: "0.0.0",
          supports: ["monitor"],
          multi_account: false,
          channel_capabilities: {
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
        monitor: async () => {},
      },
      {
        argv: ["node", "adapter", "monitor", "--account", "default", "--format", "jsonl"],
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
});

