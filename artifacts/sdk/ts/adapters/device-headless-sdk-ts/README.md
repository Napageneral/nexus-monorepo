# device-headless SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract in `packages/adapters/device-headless/api/openapi.yaml`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createDeviceHeadlessAdapterClient } from "@nexus-project/device-headless-sdk-ts";

const client = createDeviceHeadlessAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
