# Nexus Adapter SDK (TypeScript)

This package is the TypeScript/Node SDK for Nexus external adapter binaries.

It provides:
- The adapter CLI protocol types + zod schemas (aligned with the Go SDK + adapter specs)
- A `runAdapter()` harness for implementing runtime operations (`adapter.info`, `adapter.monitor.start`, `records.backfill`, `channels.send`, etc.)
- A declarative `defineAdapter()` authoring API that derives `adapter.info` and method dispatch from one adapter declaration
- Control-session helpers for `adapter.control.start` (endpoint registry + invoke responder loop)
- Helpers for reading runtime context injected by Nex via `NEXUS_ADAPTER_CONTEXT_PATH`
- Helpers for reading the canonical writable state root injected via `NEXUS_ADAPTER_STATE_DIR`
- Common utilities: `pollMonitor()`, `pollBackfill()`, `chunkText()`, `sendWithChunking()`, `newRecord()`, `messageRecord()`, credential helpers, target helpers, and retry helpers

## Place In The Flow

This SDK sits between canonical adapter specs and concrete adapter packages.

The correct order is:

1. update canonical specs
2. update this SDK when the shared adapter contract changes
3. update actual adapter packages to consume the new behavior

Canonical references:

- [Package Author Experience](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/package-author-experience.md)
- [Hosted Package Ownership and Validation Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/hosted-package-ownership-and-validation-model.md)
- [Unified Adapter SDK and Authoring Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/unified-adapter-sdk-and-authoring-model.md)
- [Apps, Adapters, and Method Surfaces](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/apps-adapters-and-method-surfaces.md)
- [Package Method Catalog and IAM](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/package-method-catalog-and-iam.md)
- [Adapter Protocol](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/adapters/adapter-protocol.md)
- [Unified Adapter SDK API](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/docs/specs/UNIFIED_ADAPTER_SDK_API.md)

## Runtime Context

Nex injects a JSON file path via:

```bash
export NEXUS_ADAPTER_CONTEXT_PATH=/path/to/runtime-context.json
```

Runtime context shape:

```json
{"platform":"discord","connection_id":"echo-bot","config":{},"credential":{"kind":"token","value":"REDACTED"}}
```

The SDK reads it with `requireAdapterRuntimeContext()` (or `loadAdapterRuntimeContext()`).

The canonical runtime context and adapter protocol contract live in:

- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/adapters/contract/`

## Adapter CLI Skeleton

```ts
import { defineAdapter, requireCredential } from "@nexus-project/adapter-sdk-ts";

export const discordAdapter = defineAdapter({
  platform: "discord",
  name: "discord-adapter",
  version: "0.0.0",
  multi_account: true,
  credential_service: "discord",
  capabilities: {
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
  client: {
    create: ({ ctx }) => ({
      token: requireCredential(ctx, { label: "discord token", env: ["DISCORD_TOKEN"] }),
    }),
  },
  delivery: {
    send: async (_ctx, _req) => {
      return { success: true, message_ids: ["sent:1"], chunks_sent: 1 };
    },
  },
});
```

You still run the adapter through `runAdapter()` from your package entrypoint:

```ts
import { runAdapter } from "@nexus-project/adapter-sdk-ts";
import { discordAdapter } from "./adapter.js";

const exitCode = await runAdapter(discordAdapter);
process.exit(exitCode);
```
