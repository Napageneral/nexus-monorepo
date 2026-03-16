# device-macos SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract for `device-macos`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createDeviceMacosAdapterClient } from "@nexus-project/device-macos-sdk-ts";

const client = createDeviceMacosAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
