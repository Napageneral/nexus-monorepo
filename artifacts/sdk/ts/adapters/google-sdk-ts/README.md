# google SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract for `google`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createGoogleAdapterClient } from "@nexus-project/google-sdk-ts";

const client = createGoogleAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
