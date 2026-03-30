# jira SDK (TypeScript)

Generated TypeScript SDK for the adapter package contract for `jira`.

This SDK is generated centrally under `artifacts/sdk/ts/adapters/`.
Package repos do not own SDK publication logic.

## Usage

```ts
import { createJiraAdapterClient } from "@nexus-project/jira-sdk-ts";

const client = createJiraAdapterClient({
  baseUrl: "https://adapter-runtime.example.com",
  headers: {
    authorization: "Bearer <token>",
  },
});

// Call a canonical package method from this adapter's generated surface.
await client.jira.comments.create({} as JiraCommentsCreateRequest);
```
