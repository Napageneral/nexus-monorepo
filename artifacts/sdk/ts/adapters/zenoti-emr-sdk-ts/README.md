# zenoti-emr SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract in `packages/adapters/zenoti-emr/api/openapi.yaml`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createZenotiEmrAdapterClient } from "@nexus-project/zenoti-emr-sdk-ts";

const client = createZenotiEmrAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
