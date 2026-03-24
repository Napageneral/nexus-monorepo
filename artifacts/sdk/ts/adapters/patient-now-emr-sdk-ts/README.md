# patient-now-emr SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract for `patient-now-emr`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createPatientNowEmrAdapterClient } from "@nexus-project/patient-now-emr-sdk-ts";

const client = createPatientNowEmrAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
