# telegram SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract for `telegram`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createTelegramAdapterClient } from "@nexus-project/telegram-sdk-ts";

const client = createTelegramAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
