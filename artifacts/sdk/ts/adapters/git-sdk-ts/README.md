# git SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract for `git`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createGitAdapterClient } from "@nexus-project/git-sdk-ts";

const client = createGitAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

await client.adapter.info();
```
