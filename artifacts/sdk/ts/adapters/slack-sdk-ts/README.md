# slack SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract in `packages/adapters/slack/api/openapi.yaml`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createSlackAdapterClient } from "@nexus-project/slack-sdk-ts";

const client = createSlackAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
