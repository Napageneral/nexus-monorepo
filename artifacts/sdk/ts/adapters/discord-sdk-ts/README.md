# discord SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract for `discord`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createDiscordAdapterClient } from "@nexus-project/discord-sdk-ts";

const client = createDiscordAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
