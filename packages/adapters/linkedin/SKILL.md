---
name: linkedin
description: Use the LinkedIn adapter for OAuth-backed organization publishing and LinkedIn organization/feed reads through Nex-managed connections.
---

# Nexus LinkedIn Adapter

## What This Package Is

`linkedin` is the shared Nex adapter for LinkedIn organization publishing and read workflows.

Use it when Nex should:

- hold one LinkedIn OAuth connection with Community Management scopes
- list administered organizations for the connected member
- publish organization-authored posts
- read posts, comments, and social metadata for an organization feed

This package is organization-feed scoped. It is not a LinkedIn messaging adapter.

## When To Use It

Use `linkedin` when you need:

- organization post publishing through Nex
- one adapter that can discover which organizations the member can administer
- structured reads of posts, comments, and social metadata
- a canonical place to resolve organization URNs for publishing

## Main Operations

- `adapter.info`
- `adapter.connections.list`
- `adapter.health`
- `linkedin.organizations.list`
- `linkedin.posts.list`
- `linkedin.posts.get`
- `linkedin.posts.create`
- `linkedin.comments.list`
- `linkedin.socialMetadata.get`

## CLI Examples

Validate the package locally:

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/linkedin
pnpm test
pnpm build
```

Inspect adapter info:

```bash
node ./dist/index.js adapter.info
```

Check health for a configured LinkedIn organization connection:

```bash
node ./dist/index.js adapter.health --connection <connection-id>
```

List administered organizations:

```bash
node ./dist/index.js linkedin.organizations.list \
  --connection <connection-id> \
  --payload-json '{}'
```

Create an organization-authored post:

```bash
node ./dist/index.js linkedin.posts.create \
  --connection <connection-id> \
  --payload-json '{"organizationUrn":"urn:li:organization:2414183","commentary":"hello from nex"}'
```

## Key Data Models

- `connection_id`
  - Nex connection identity for the LinkedIn OAuth binding
- organization identity
  - organization identifiers normalize to `urn:li:organization:{id}`
  - organization input resolves in payload-target-config order
- connection health
  - health checks whether the configured organization is accessible to the connected member
- typed LinkedIn methods
  - organization list
  - post list/get/create
  - comment list
  - social metadata get
- outbound publishing
  - `linkedin.posts.create` publishes in provider-native LinkedIn terms

## End-To-End Example

1. Create a LinkedIn OAuth connection with the required organization scopes.
2. Run `linkedin.organizations.list` to see which organizations the member can administer.
3. Configure or select the organization URN you want to publish to.
4. Run `adapter.health` to verify the configured organization is accessible.
5. Publish an organization-authored post through `linkedin.posts.create`.
6. Read posts, comments, and social metadata back through the typed `linkedin.*` methods.

This package’s contract is currently defined by [src/adapter.ts](/Users/tyler/nexus/home/projects/nexus/packages/adapters/linkedin/src/adapter.ts), [api/openapi.yaml](/Users/tyler/nexus/home/projects/nexus/packages/adapters/linkedin/api/openapi.yaml), and [test/adapter.test.ts](/Users/tyler/nexus/home/projects/nexus/packages/adapters/linkedin/test/adapter.test.ts).

## Constraints And Failure Modes

- This package is not LinkedIn messaging.
- Publishing requires the correct organization-admin and social scopes.
- The organization URN must resolve to an administered organization or health should fail.
- Treat `linkedin.posts.create` as an organization-feed publishing surface, not a general-purpose social action.

## Related Docs

- [README.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/linkedin/README.md)
- [TESTING.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/linkedin/TESTING.md)
- [src/adapter.ts](/Users/tyler/nexus/home/projects/nexus/packages/adapters/linkedin/src/adapter.ts)
- [test/adapter.test.ts](/Users/tyler/nexus/home/projects/nexus/packages/adapters/linkedin/test/adapter.test.ts)
