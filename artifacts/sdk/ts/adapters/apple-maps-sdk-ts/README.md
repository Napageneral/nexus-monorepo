# apple-maps SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract for `apple-maps`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createAppleMapsAdapterClient } from "@nexus-project/apple-maps-sdk-ts";

const client = createAppleMapsAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
