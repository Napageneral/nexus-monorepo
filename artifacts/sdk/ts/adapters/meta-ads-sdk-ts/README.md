# meta-ads SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract for `meta-ads`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createMetaAdsAdapterClient } from "@nexus-project/meta-ads-sdk-ts";

const client = createMetaAdsAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
