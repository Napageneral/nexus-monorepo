# eve SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract in `packages/adapters/eve/api/openapi.yaml`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createEveAdapterClient } from "@nexus-project/eve-sdk-ts";

const client = createEveAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
