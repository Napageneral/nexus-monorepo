# device-ios SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract for `device-ios`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createDeviceIosAdapterClient } from "@nexus-project/device-ios-sdk-ts";

const client = createDeviceIosAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
