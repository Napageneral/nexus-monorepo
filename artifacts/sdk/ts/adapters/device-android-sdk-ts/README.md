# device-android SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract for `device-android`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createDeviceAndroidAdapterClient } from "@nexus-project/device-android-sdk-ts";

const client = createDeviceAndroidAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
