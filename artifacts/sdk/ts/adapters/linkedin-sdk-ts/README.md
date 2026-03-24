# linkedin SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract for `linkedin`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createLinkedinAdapterClient } from "@nexus-project/linkedin-sdk-ts";

const client = createLinkedinAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
