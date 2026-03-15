# gog SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract in `packages/adapters/gog/api/openapi.yaml`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createGogAdapterClient } from "@nexus-project/gog-sdk-ts";

const client = createGogAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
