# qase SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract for `qase`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createQaseAdapterClient } from "@nexus-project/qase-sdk-ts";

const client = createQaseAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
