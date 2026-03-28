import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { defineAdapter, method } from "./define.js";
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

describe("defineAdapter", () => {
  it("derives adapter.info and methods from one package declaration", async () => {
    const adapter = defineAdapter({
      platform: "test",
      name: "test-adapter",
      version: "1.2.3",
      capabilities: {
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
      },
      methods: {
        "test.echo": method({
          description: "Echo input",
          action: "read",
          connection_required: false,
          params: {
            type: "object",
            properties: {
              value: { type: "string" },
            },
          },
          response: {
            type: "object",
            properties: {
              echoed: { type: "string" },
            },
          },
          handler: async (_ctx, req) => ({
            echoed: String(req.payload?.value ?? ""),
          }),
        }),
      },
    });

    const stdout = captureStream();
    const stderr = captureStream();
    const code = await runAdapter(adapter, {
      argv: ["node", "adapter", "adapter.info"],
      stdout: stdout.stream,
      stderr: stderr.stream,
      patchConsole: false,
      installSignalHandlers: false,
      requireRuntimeContext: false,
    });

    expect(code).toBe(0);
    expect(stderr.read()).toBe("");
    const info = JSON.parse(stdout.read().trim());
    expect(info.operations).toEqual(["adapter.info", "adapter.connections.list", "adapter.health"]);
    expect(info.methods).toHaveLength(1);
    expect(info.methods[0]).toMatchObject({
      name: "test.echo",
      action: "read",
      connection_required: false,
      origin: {
        package_kind: "adapter",
        declaration_mode: "manifest",
        declaration_source: "package declaration",
      },
    });
    expect(info.methodCatalog).toMatchObject({
      source: "manifest",
      namespace: "test",
    });
  });

  it("invokes declared methods without a second handler registry", async () => {
    const adapter = defineAdapter({
      platform: "test",
      name: "test-adapter",
      version: "1.0.0",
      capabilities: {
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
      },
      methods: {
        "test.sum": method({
          description: "Sum values",
          action: "write",
          params: { type: "object" },
          response: { type: "object" },
          handler: async (_ctx, req) => ({
            total: Number(req.payload?.a ?? 0) + Number(req.payload?.b ?? 0),
          }),
        }),
      },
    });

    const stdout = captureStream();
    const stderr = captureStream();
    const code = await runAdapter(adapter, {
      argv: [
        "node",
        "adapter",
        "test.sum",
        "--payload-json",
        "{\"a\":2,\"b\":5}",
      ],
      stdout: stdout.stream,
      stderr: stderr.stream,
      patchConsole: false,
      installSignalHandlers: false,
      requireRuntimeContext: false,
    });

    expect(code).toBe(0);
    expect(stderr.read()).toBe("");
    expect(JSON.parse(stdout.read().trim())).toEqual({ total: 7 });
  });
});
