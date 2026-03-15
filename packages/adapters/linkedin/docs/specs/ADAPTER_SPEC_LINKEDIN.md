# Adapter Spec: LinkedIn

## Customer Experience

The LinkedIn adapter gives Nex one shared provider integration for LinkedIn
organization publishing and read access.

For the operator, the target experience is:

1. create one LinkedIn connection through Nex
2. complete the shared LinkedIn OAuth flow with a LinkedIn app that has
   Community Management access
3. list the organizations the authenticated member can act for
4. bind one organization to the connection or provide an organization at call
   time
5. publish organization posts and read organization posts, comments, and social
   metadata through one stable Nex connection

The operator should not need to understand:

- LinkedIn REST headers and versioning details
- raw OAuth token plumbing
- organization ACL pagination or lookup joins
- image upload initialization versus post creation
- stale LinkedIn permission names from older docs

## Adapter Identity

| Field | Value |
|---|---|
| Adapter ID | `linkedin` |
| Package | `packages/adapters/linkedin/` |
| Command | `dist/index.js` |
| Provider Scope | LinkedIn organization feed publishing and read access |

## Official Provider Constraints

The adapter is built around the current official LinkedIn Community Management
surface.

Provider facts that shape the design:

1. LinkedIn organization posting is a 3-legged OAuth flow, not a generic page
   token flow.
2. Acting on behalf of an organization requires the member to have admin access
   to that organization.
3. Post creation uses `POST /rest/posts`.
4. Image publishing requires the separate Images API initialization/upload
   flow before the post is created.
5. Comment and social metadata reads are a different permission surface from
   post reads/writes.
6. Development tier limits are low and push notifications are disabled, so the
   v1 adapter should prioritize explicit reads and writes over webhook-heavy
   ingest.

## Target-State Rules

1. Nex `connection_id` is the canonical runtime identity.
2. LinkedIn member ids and organization ids are provider metadata, not runtime
   connection identity.
3. OAuth is the only supported auth method in v1.
4. The adapter is organization-feed scoped, not member-feed scoped.
5. The adapter does not implement LinkedIn messaging or inbox behavior.
6. The adapter exposes publishing through `channels.send` and provider-native
   reads through typed adapter methods.
7. The adapter uses one explicit configured or call-scoped organization URN.
8. The adapter does not invent backwards-compat scope aliases; it declares the
   current scope set explicitly.

## Connection Model

One Nex LinkedIn connection represents one durable LinkedIn OAuth credential
binding owned by the runtime.

That connection may operate against one or more organizations that the member
can administer, but the adapter needs one concrete organization context for
publishing and most read flows.

The canonical runtime-owned connection config for v1 is:

- `organizationUrn` optional default organization URN, for example
  `urn:li:organization:2414183`

If `organizationUrn` is absent, read and write methods may still accept an
organization URN in their payload, but `channels.send` should fail with a clear
error unless the target or config resolves the organization.

## Auth Model

V1 exposes one auth method:

- `linkedin_oauth`

The declared scope set is:

- `r_organization_admin`
- `rw_organization_admin`
- `r_organization_social`
- `w_organization_social`
- `r_organization_social_feed`
- `w_organization_social_feed`

Reasoning:

- organization admin scopes are needed for organization discovery and admin
  verification
- organization social scopes cover post reads/writes
- organization social feed scopes cover comment and social action reads/writes

## Operations

The target-state runtime surface for v1 is:

- `adapter.info`
- `adapter.accounts.list`
- `adapter.health`
- `channels.send`
- `linkedin.organizations.list`
- `linkedin.posts.list`
- `linkedin.posts.get`
- `linkedin.posts.create`
- `linkedin.comments.list`
- `linkedin.socialMetadata.get`

V1 intentionally does not include:

- `adapter.monitor.start`
- `records.backfill`
- `channels.stream`
- `channels.edit`
- `channels.delete`
- `linkedin.messages.*`

## Delivery Model

`channels.send` is the communication-shaped publish surface for organization
posts.

Target resolution rules:

1. if `target.channel.container_id` is present, it is treated as the
   destination organization identifier
2. if the target omits `container_id`, the adapter uses
   `runtime.config.organizationUrn`
3. numeric organization ids are normalized into `urn:li:organization:<id>`
4. the resolved author is always the organization URN for v1

Send behavior:

1. `text` publishes a text-only post
2. `media` plus optional `caption` publishes an image post
3. image upload happens through the LinkedIn Images API before post creation
4. the delivery result returns the created LinkedIn post URN

## Typed Method Model

### `linkedin.organizations.list`

Returns the organizations the current OAuth member can administer, including:

- `organizationUrn`
- `organizationId`
- `localizedName`
- `vanityName`
- `role`
- `state`

### `linkedin.posts.list`

Lists posts for an organization author.

Inputs:

- `organizationUrn` optional, defaults from connection config
- `count` optional
- `start` optional

### `linkedin.posts.get`

Fetches one post by post URN.

Inputs:

- `postUrn`

### `linkedin.posts.create`

Creates an organization-authored post.

Inputs:

- `organizationUrn` optional, defaults from connection config
- `commentary` required for text/image posts
- `imagePath` optional local filesystem path
- `imageAltText` optional
- `visibility` optional, defaults to `PUBLIC`

### `linkedin.comments.list`

Lists comments for a LinkedIn post.

Inputs:

- `postUrn`
- `count` optional
- `start` optional

### `linkedin.socialMetadata.get`

Fetches aggregate social metadata for a post or comment entity.

Inputs:

- `entityUrn`

## Response Model

The adapter should preserve LinkedIn-native identifiers in method responses:

- organization URNs
- post URNs
- image URNs
- comment URNs

The adapter may include a normalized summary shape, but it must also preserve
the raw provider payload so future Nex callers do not lose LinkedIn-specific
fields.

## Health Model

`adapter.health` should answer:

1. whether the OAuth token can call LinkedIn successfully
2. how many organizations are currently discoverable
3. whether the configured default `organizationUrn` is actually accessible to
   the authenticated member

If the token works but no default organization is configured, health may still
be connected with a details warning rather than a hard failure.

## Non-Goals

V1 does not include:

- LinkedIn direct messaging
- employee/member posting
- webhook or push notification ingest
- long-running monitor processes
- video or document upload
- post editing or delete flows
- product-specific managed-profile behavior

## Done Definition

The LinkedIn adapter is at parity for v1 only when:

1. Nex can create a LinkedIn OAuth-backed connection
2. the adapter can enumerate administered organizations
3. `channels.send` can publish an organization post
4. typed methods can read posts, comments, and social metadata
5. image post publishing works through the Images API path
6. the package builds, tests, and packages cleanly as a standard Nex adapter
