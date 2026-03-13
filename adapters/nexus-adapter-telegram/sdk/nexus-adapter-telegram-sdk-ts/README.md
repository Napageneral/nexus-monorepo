# nexus-adapter-telegram SDK (TypeScript)

Generated consumer SDK for the published adapter package contract in `contracts/adapters/nexus-adapter-telegram/openapi.yaml`.

This package covers the adapter's ordinary JSON request/response operations.
Long-lived stream and session operations remain part of the shared adapter protocol and are intentionally out of scope for this first wave.

## Usage

```ts
import { createTelegramAdapterClient } from "@nexus-project/nexus-adapter-telegram-sdk-ts";

const client = createTelegramAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```

## Scope

Included:

1. `adapter.info`
2. `adapter.accounts.list`
3. `adapter.health`
4. `channels.send`
5. `adapter.setup.*` when published by the adapter contract
6. adapter-specific declared methods when published by the adapter contract

Excluded:

1. `adapter.monitor.start`
2. `records.backfill`
3. `adapter.control.start`
4. `channels.stream`

Consumers should use this SDK.
Adapter authors should use the shared authoring SDK in `adapters/nexus-adapter-sdks/`.
