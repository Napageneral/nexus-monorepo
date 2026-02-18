# Nexus Adapter SDK (TypeScript)

This package is the TypeScript/Node SDK for Nexus external adapter binaries.

It provides:
- The adapter CLI protocol types + zod schemas (aligned with the Go SDK + adapter specs)
- A `runAdapter()` harness for implementing `info|monitor|send|stream|backfill|health|accounts`
- Helpers for reading runtime context injected by Nex via `NEXUS_ADAPTER_CONTEXT_PATH`
- Common utilities: `pollMonitor()`, `chunkText()`, `sendWithChunking()`, `newEvent()`

## Runtime Context

Nex injects a JSON file path via:

```bash
export NEXUS_ADAPTER_CONTEXT_PATH=/path/to/runtime-context.json
```

This SDK accepts both:

1. Spec shape:

```json
{"channel":"discord","account_id":"echo-bot","config":{},"credential":{"kind":"token","value":"REDACTED"}}
```

2. Legacy Nex v1 injection (back-compat):

```json
{"version":1,"channel":"discord","account_id":"default","config":{},"credential":{"ref":"discord/default","service":"discord","account":"default","value":"REDACTED"}}
```

The SDK reads it with `requireAdapterRuntimeContext()` (or `loadAdapterRuntimeContext()`).

## Adapter CLI Skeleton

```ts
import { runAdapter } from "@nexus-project/adapter-sdk-ts";

await runAdapter({
  info: async () => ({
    channel: "discord",
    name: "discord-adapter",
    version: "0.0.0",
    supports: ["monitor", "send", "stream", "health"],
    credential_service: "discord",
    multi_account: true,
    channel_capabilities: {
      text_limit: 2000,
      supports_markdown: true,
      markdown_flavor: "discord",
      supports_tables: false,
      supports_code_blocks: true,
      supports_embeds: true,
      supports_threads: true,
      supports_reactions: true,
      supports_polls: false,
      supports_buttons: false,
      supports_edit: true,
      supports_delete: true,
      supports_media: true,
      supports_voice_notes: false,
      supports_streaming_edit: true,
    },
  }),
  send: async (ctx, req) => {
    // ctx.runtime?.credential?.value contains the injected credential, if configured.
    // req.to is the adapter-defined target string (from `--to`).
    // Implement platform send here...
    return { success: true, message_ids: ["sent:1"], chunks_sent: 1 };
  },
  monitor: async (ctx, { account }, emit) => {
    // Connect to the platform and call emit(NexusEvent) for each inbound message.
    // This function should run until ctx.signal is aborted.
    void account;
    void emit;
    await new Promise<void>((resolve) => {
      ctx.signal.addEventListener("abort", () => resolve(), { once: true });
    });
  },
});
```
