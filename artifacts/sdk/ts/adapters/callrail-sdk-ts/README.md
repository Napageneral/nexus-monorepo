# callrail SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract in `packages/adapters/callrail/api/openapi.yaml`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createCallrailAdapterClient } from "@nexus-project/callrail-sdk-ts";

const client = createCallrailAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
