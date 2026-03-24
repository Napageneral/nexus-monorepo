# twilio SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract for `twilio`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createTwilioAdapterClient } from "@nexus-project/twilio-sdk-ts";

const client = createTwilioAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
