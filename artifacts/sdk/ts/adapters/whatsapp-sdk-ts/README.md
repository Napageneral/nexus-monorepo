# whatsapp SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract for `whatsapp`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createWhatsappAdapterClient } from "@nexus-project/whatsapp-sdk-ts";

const client = createWhatsappAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
