# Adapter Spec: Confluence

## Customer Experience

The Confluence adapter keeps the nex record stream in sync with a team's Confluence Cloud pages. Engineers, PMs, and agents query page content through the nex context layer without needing Confluence open. Agents surface relevant design docs, architecture pages, and PRDs alongside Jira issues and code -- the full intent layer is always current.

Inbound, the adapter polls Confluence for new and updated pages, emits each page version as a canonical `record.ingest` envelope, and stores the full HTML body as a local attachment file. Downstream consumers (agents, search, recall) get lightweight content in the record and can read the full HTML when they need it.

Outbound, agents create new pages, update existing page content, leave comments on pages, and clean up temporary Confluence artifacts through `channels.send` and `channels.delete`. An agent that analyzes a Jira epic can write an initiative dossier back to Confluence; an agent that detects a stale architecture doc can leave a review comment; and a smoke test can move its temporary page to trash when it finishes.

Setup takes under a minute: provide Atlassian credentials (the same email + API token used for Jira), pick which spaces to track, and the adapter starts syncing.

## Adapter Info

### Identity

| Field | Value |
|---|---|
| Platform | `confluence` |
| Name | Confluence Cloud |
| Version | `0.1.0` |
| Language | Go (`nexus-adapter-sdk-go`) |
| Location | `adapters/nexus-adapter-confluence/` |
| Multi-account | `true` |

### Auth

**Method**: `api_key` -- Atlassian API token (shared credentials with Jira adapter)

**Fields**:

| Name | Label | Type | Required | Placeholder |
|---|---|---|---|---|
| `email` | Atlassian Email | `text` | yes | `you@company.com` |
| `api_token` | API Token | `secret` | yes | -- |
| `site` | Site Name | `text` | yes | `yoursite` (for yoursite.atlassian.net) |

**Auth header**: `Authorization: Basic base64(email:api_token)`

**API base**: `https://{site}.atlassian.net`

Confluence Cloud exposes two REST API versions. The adapter uses v2 (`/wiki/api/v2/`) for all page and space operations. CQL-based search uses the v1 endpoint (`/wiki/rest/api/content/search`).

### Auth manifest (returned by `adapter.info`):

```json
{
  "auth": {
    "methods": [
      {
        "id": "atlassian_api_key",
        "type": "api_key",
        "label": "Atlassian API Token",
        "icon": "confluence",
        "service": "atlassian",
        "fields": [
          {
            "name": "email",
            "label": "Atlassian Email",
            "type": "text",
            "required": true,
            "placeholder": "you@company.com"
          },
          {
            "name": "api_token",
            "label": "API Token",
            "type": "secret",
            "required": true
          },
          {
            "name": "site",
            "label": "Site Name",
            "type": "text",
            "required": true,
            "placeholder": "yoursite"
          }
        ]
      }
    ],
    "setupGuide": "Generate an API token at https://id.atlassian.com/manage-profile/security/api-tokens"
  }
}
```

### Operations

The adapter registers these operations:

| Operation | Supported |
|---|---|
| `adapter.info` | yes |
| `adapter.health` | yes |
| `adapter.accounts.list` | yes |
| `adapter.setup.start` | yes |
| `adapter.setup.submit` | yes |
| `adapter.setup.status` | yes |
| `adapter.setup.cancel` | yes |
| `adapter.monitor.start` | yes |
| `events.backfill` | yes |
| `channels.send` | yes |
| `channels.delete` | yes |
| `adapter.control.start` | no |
| `delivery.stream` | no |
| `delivery.react` | no |
| `delivery.edit` | no |
| `delivery.poll` | no |

### Capabilities

```json
{
  "platform_capabilities": {
    "text_limit": 0,
    "supports_markdown": true,
    "markdown_flavor": "standard",
    "supports_tables": true,
    "supports_code_blocks": true,
    "supports_embeds": false,
    "supports_threads": false,
    "supports_reactions": false,
    "supports_polls": false,
    "supports_buttons": false,
    "supports_edit": true,
    "supports_delete": true,
    "supports_media": false,
    "supports_voice_notes": false,
    "supports_streaming_edit": false
  }
}
```

Confluence pages have no practical text limit (`text_limit: 0` means unlimited). The platform supports markdown-style formatting because the adapter converts markdown to Confluence storage format (XHTML) on outbound delivery. Threading does not apply -- pages are not threaded conversations.

## Monitor

### Command

```
nexus-adapter-confluence adapter.monitor.start --connection <id>
```

### Behavior

The monitor runs as a long-lived polling loop using the SDK's `PollMonitor` helper. Default poll interval is 15 minutes -- Confluence content changes less frequently than chat or issue trackers.

Each poll cycle iterates over every configured space and queries for pages modified since the last watermark for that space. The adapter maintains per-space watermarks (see Watermark Strategy below).

### Poll Algorithm

For each configured space:

1. Read the current watermark for this space (a `modified_at` timestamp).
2. Query the Confluence v2 API for pages ordered by modified date, descending:
   ```
   GET /wiki/api/v2/spaces/{space_id}/pages?sort=-modified-date&limit=250&body-format=storage
   ```
3. Walk pages from the response. For each page whose `version.modified_at` is newer than the watermark:
   a. Fetch the full page if the list response did not include the body (depends on pagination).
   b. Write the page body HTML to a local file (see Page Body Storage).
   c. Build a `record.ingest` envelope and emit it via the SDK `EmitFunc`.
4. Advance the watermark for this space to the most recent `version.modified_at` seen.
5. If the response includes a cursor (`_links.next`), continue paginating until all modified pages are processed or all remaining pages are older than the watermark.

When no pages have changed since the last poll, the cycle completes with zero emissions.

### Error Handling

The SDK `PollMonitor` manages error backoff. If a fetch fails, the adapter backs off for one poll interval and retries. After 10 consecutive errors, the monitor exits with an error. The watermark is only advanced on successful emission, so no pages are missed after transient failures.

### Rate Limiting

Confluence Cloud allows approximately 10 requests per second. The adapter respects `Retry-After` headers on 429 responses. Between page fetches within a single poll cycle, the adapter does not add artificial delays unless rate-limited.

## Backfill

### Command

```
nexus-adapter-confluence events.backfill --connection <id> --since <date>
```

### Behavior

Backfill walks all pages in all configured spaces, emitting `record.ingest` envelopes for every page modified on or after the `--since` date. If `--since` is omitted or set to the zero date, the adapter backfills all pages.

### Algorithm

1. List all configured spaces for the account.
2. For each space, query pages using CQL for date-bounded results:
   ```
   GET /wiki/rest/api/content/search?cql=space="{space_key}" AND type="page" AND lastModified >= "{since_date}"&limit=250&expand=version,ancestors,metadata.labels,body.storage
   ```
   The v1 CQL search endpoint is used here because v2 does not support CQL filtering.
3. Paginate through all results (v1 uses `start` + `limit` offset-based pagination, max 250 per page).
4. For each page:
   a. Write the page body HTML to a local file.
   b. Emit a `record.ingest` envelope.
5. Log progress: total pages emitted, pages per space, elapsed time.
6. Exit when all spaces are fully walked.

### Version History

By default, backfill emits only the current version of each page. The current version captures the latest content, which is the primary use case for the context layer.

If a deployment requires historical versions (for change tracking or audit), the adapter can optionally walk version history:

```
GET /wiki/api/v2/pages/{page_id}/versions?limit=250
```

For each historical version, the adapter fetches the page at that version and emits a separate record with the version number embedded in the `external_record_id`. This is disabled by default because it significantly increases backfill volume.

## Delivery

### Send Command

```
nexus-adapter-confluence channels.send --connection <id> --target-json <json> --text "..."
```

The adapter dispatches to one of three delivery actions based on `target.channel.container_id`.

### Create Page

**Target format**: `space:{space_key}` or `space:{space_key}/parent:{parent_page_id}`

Creates a new Confluence page in the specified space, optionally under a parent page.

**API**: `POST /wiki/api/v2/pages`

**Request body sent to Confluence**:

```json
{
  "spaceId": "65538",
  "status": "current",
  "title": "Initiative Dossier: Social Content Integration",
  "parentId": "123456",
  "body": {
    "representation": "storage",
    "value": "<p>This document describes the social content integration initiative...</p>"
  }
}
```

The adapter converts the inbound `--text` content from markdown to Confluence storage format (XHTML) before sending. Title is extracted from the first line of the text content if it starts with a markdown heading (`# Title`). Media uploads are not supported by the current adapter implementation.

**Delivery result**:

```json
{
  "success": true,
  "message_ids": ["confluence:vrtly-cloud:page/789012:v1"],
  "chunks_sent": 1,
  "total_chars": 1234
}
```

### Update Page

**Target format**: `page:{page_id}`

Updates an existing Confluence page. The adapter fetches the current version number, increments it by 1, and sends the update.

**API**: `PUT /wiki/api/v2/pages/{page_id}`

**Request body sent to Confluence**:

```json
{
  "id": "789012",
  "status": "current",
  "title": "Initiative Dossier: Social Content Integration (Revised)",
  "version": {
    "number": 4,
    "message": "Updated by nex agent"
  },
  "body": {
    "representation": "storage",
    "value": "<p>Revised content...</p>"
  }
}
```

Version conflict handling: if the PUT returns 409 (version conflict), the adapter refetches the current version and retries once. If the second attempt also conflicts, the delivery fails with a `content_rejected` error.

### Add Page Comment

**Target format**: `page:{page_id}/comment`

Adds a footer comment to a Confluence page.

**API**: `POST /wiki/api/v2/footer-comments`

**Request body sent to Confluence**:

```json
{
  "pageId": "789012",
  "body": {
    "representation": "storage",
    "value": "<p>Agent analysis: this architecture doc covers VT-4500 through VT-4520. Consider updating the sequence diagram.</p>"
  }
}
```

Comments are always footer comments (inline comments require cursor position context that adapters do not have).

### Delete Page Or Comment

**Command**:

```
nexus-adapter-confluence channels.delete --connection <id> --target-json <json> --message-id <id>
```

The delete path uses the delivered `message_id` as the source of truth for what to clean up.

- Page message IDs like `confluence:vrtly-cloud:page/789012:v1` map to `DELETE /wiki/api/v2/pages/{page_id}` and move the page to trash.
- Footer comment message IDs like `confluence:vrtly-cloud:page/789012/comment/555` map to `DELETE /wiki/api/v2/footer-comments/{comment_id}`.

The adapter does not use `purge=true`, so page deletion remains reversible through Confluence trash.

### Delivery Error Mapping

| Confluence HTTP Status | DeliveryError type | retry |
|---|---|---|
| 401, 403 | `permission_denied` | `false` |
| 404 | `not_found` | `false` |
| 409 (version conflict) | `content_rejected` | `true` (auto-retry once) |
| 429 | `rate_limited` | `true` |
| 5xx | `network` | `true` |

## Health

### Command

```
nexus-adapter-confluence adapter.health --connection <id>
```

### Behavior

The health check validates that the stored credentials are valid and the Confluence API is reachable.

**API call**: `GET /wiki/api/v2/spaces?limit=1`

If this call succeeds, the adapter reports `connected: true`. If it fails with a 401 or 403, the adapter reports `connected: false` with an appropriate error message.

**Response**:

```json
{
  "connected": true,
  "account": "vrtly-confluence",
  "last_event_at": 1710086400000,
  "details": {
    "site": "vrtly.atlassian.net",
    "spaces_accessible": 12
  }
}
```

On failure:

```json
{
  "connected": false,
  "account": "vrtly-confluence",
  "error": "authentication failed: 401 Unauthorized",
  "details": {
    "site": "vrtly.atlassian.net"
  }
}
```

## Setup

### Flow

The setup flow collects credentials, validates them, and lets the user select which Confluence spaces to track.

**Step 1 -- `adapter.setup.start`**

Returns the credential input fields:

```json
{
  "status": "requires_input",
  "session_id": "setup-abc123",
  "message": "Enter your Atlassian credentials for Confluence Cloud.",
  "instructions": "Generate an API token at https://id.atlassian.com/manage-profile/security/api-tokens",
  "fields": [
    { "name": "email", "label": "Atlassian Email", "type": "text", "required": true },
    { "name": "api_token", "label": "API Token", "type": "secret", "required": true },
    { "name": "site", "label": "Site Name", "type": "text", "required": true, "placeholder": "yoursite" }
  ]
}
```

**Step 2 -- `adapter.setup.submit` (credentials)**

User submits email, api_token, and site. The adapter validates by calling `GET /wiki/api/v2/spaces?limit=250`. If credentials are invalid, the adapter returns `status: "failed"` with an error message.

On success, the adapter returns the list of accessible spaces for selection:

```json
{
  "status": "requires_input",
  "session_id": "setup-abc123",
  "message": "Select the Confluence spaces to sync.",
  "fields": [
    {
      "name": "spaces",
      "label": "Spaces",
      "type": "select",
      "required": true,
      "options": [
        { "label": "Engineering (ENG)", "value": "ENG" },
        { "label": "Product (PROD)", "value": "PROD" },
        { "label": "Operations (OPS)", "value": "OPS" }
      ]
    }
  ],
  "metadata": {
    "spaces_available": 12,
    "site_url": "https://vrtly.atlassian.net/wiki"
  }
}
```

**Step 3 -- `adapter.setup.submit` (space selection)**

User submits selected space keys. The adapter stores the configuration and reports completion:

```json
{
  "status": "completed",
  "session_id": "setup-abc123",
  "account": "vrtly-confluence",
  "message": "Confluence adapter configured. Tracking 3 spaces: ENG, PROD, OPS.",
  "secret_fields": {
    "email": "tyler@vrtly.com",
    "api_token": "ATATT3xF..."
  },
  "metadata": {
    "site": "vrtly",
    "spaces": ["ENG", "PROD", "OPS"]
  }
}
```

## Record Emission Details

### Confluence Page Record

Every page version emitted by the adapter uses this `record.ingest` envelope:

```json
{
  "operation": "record.ingest",
  "routing": {
    "platform": "confluence",
    "connection_id": "vrtly-confluence",
    "sender_id": "alice.smith",
    "sender_name": "Alice Smith",
    "space_id": "vrtly-cloud",
    "space_name": "Vrtly Cloud",
    "container_kind": "group",
    "container_id": "ENG",
    "container_name": "Engineering",
    "thread_id": "page/123456",
    "thread_name": "Session Management Architecture"
  },
  "payload": {
    "external_record_id": "confluence:vrtly-cloud:page/123456:v3",
    "timestamp": 1707235200000,
    "content": "Session Management Architecture\n\nThis document describes...",
    "content_type": "text",
    "attachments": [
      {
        "id": "page-123456-v3:body",
        "filename": "session-management-architecture.html",
        "content_type": "text/html",
        "path": "/confluence/pages/123456/v3/body.html"
      }
    ],
    "metadata": {
      "version": 3,
      "parent_page_id": "page/100000",
      "labels": ["architecture", "sessions"]
    }
  }
}
```

### Field Mapping

**Routing fields**:

| record.ingest field | Confluence source | Notes |
|---|---|---|
| `platform` | constant | `"confluence"` |
| `connection_id` | adapter config | Account ID from adapter configuration |
| `sender_id` | `page.version.authorId` | Atlassian account ID of the user who authored this version |
| `sender_name` | user lookup | Display name resolved via `GET /wiki/api/v2/users/{authorId}` (cached) |
| `space_id` | adapter config `site` | The Atlassian cloud site identifier (e.g., `"vrtly-cloud"`) |
| `space_name` | adapter config `site` display | Human-readable site name (e.g., `"Vrtly Cloud"`) |
| `container_kind` | constant | `"group"` -- spaces are group containers |
| `container_id` | `space.key` | Confluence space key (e.g., `"ENG"`) |
| `container_name` | `space.name` | Confluence space name (e.g., `"Engineering"`) |
| `thread_id` | `"page/" + page.id` | Page ID prefixed with `page/` for disambiguation |
| `thread_name` | `page.title` | Page title |

**Payload fields**:

| record.ingest field | Confluence source | Notes |
|---|---|---|
| `external_record_id` | composite | `"confluence:{space_id}:page/{page_id}:v{version}"` -- unique per page version |
| `timestamp` | `page.version.createdAt` | Unix milliseconds of this version's creation time |
| `content` | `page.title + "\n\n" + excerpt` | Title plus a plain-text excerpt (first ~500 chars of body, stripped of HTML tags) |
| `content_type` | constant | `"text"` |
| `attachments[0].id` | composite | `"page-{page_id}-v{version}:body"` |
| `attachments[0].filename` | derived | Slugified page title + `.html` |
| `attachments[0].content_type` | constant | `"text/html"` |
| `attachments[0].path` | local path | Relative path under the adapter's storage directory |
| `metadata.version` | `page.version.number` | Integer version number |
| `metadata.parent_page_id` | `page.parentId` | `"page/{parentId}"` or `null` if top-level |
| `metadata.labels` | `page.labels` | Array of label strings from the page's label set |

### External Record ID Structure

```
confluence:{space_id}:page/{page_id}:v{version}
```

Each page version is a distinct record. This means:
- When a page is created, the adapter emits a record with `v1`.
- When a page is edited (creating version 3), the adapter emits a record with `v3`.
- Downstream consumers can distinguish between page versions and track content evolution.

The `space_id` component ensures uniqueness across Confluence sites when multiple accounts are configured.

### Confluence REST API v2 Endpoints Used

**Spaces**:
- `GET /wiki/api/v2/spaces` -- list spaces (paginated, cursor-based)
- `GET /wiki/api/v2/spaces/{space_id}` -- single space details

**Pages**:
- `GET /wiki/api/v2/spaces/{space_id}/pages` -- pages in a space (paginated, cursor-based)
- `GET /wiki/api/v2/pages/{page_id}?body-format=storage` -- single page with body in storage (XHTML) format
- `GET /wiki/api/v2/pages?sort=-modified-date&body-format=storage` -- pages sorted by modified date (for monitor)

**Page versions**:
- `GET /wiki/api/v2/pages/{page_id}/versions` -- version history

**Labels**:
- `GET /wiki/api/v2/pages/{page_id}/labels` -- labels on a page

**Comments**:
- `POST /wiki/api/v2/pages/{page_id}/footer-comments` -- create footer comment

**Users**:
- `POST /wiki/api/v2/users-bulk` -- user display name lookup by `accountIds` (cached per session)

**CQL search (v1 endpoint)**:
- `GET /wiki/rest/api/content/search?cql=...` -- CQL-based content search (used for date-bounded backfill)

### Pagination

The v2 API uses cursor-based pagination. Responses include `_links.next` with a full URL to the next page of results. The adapter follows `_links.next` until it is absent, indicating the last page.

The v1 CQL search endpoint uses offset-based pagination (`start` + `limit`, max 250 per page). The adapter increments `start` by `limit` on each page until the total result count is reached.

### User Display Name Resolution

The adapter resolves Atlassian account IDs to display names for the `sender_name` field. User lookups are cached in memory for the lifetime of the adapter process. A single backfill or monitor cycle typically encounters a small number of distinct authors, so the cache stays small.

If a user lookup fails (deleted account, permission issue), the adapter falls back to `sender_name: ""` and sets `sender_id` to the raw Atlassian account ID.

## Page Body Storage

Confluence page bodies are stored in XHTML "storage format" -- the native representation that Confluence uses internally. This format includes Atlassian-specific macros (`<ac:structured-macro>`, `<ac:image>`, `<ri:attachment>`, etc.) alongside standard HTML.

### Storage Layout

```
{adapter_data_dir}/confluence/pages/{page_id}/v{version}/body.html
```

Example:
```
data/confluence/pages/123456/v3/body.html
```

The adapter writes the raw storage-format body to this path before emitting the record. The record's attachment references this path so downstream consumers can read the full page content.

### Why Local Storage

Page bodies can be large (tens of kilobytes of XHTML is common; some pages exceed 100KB). Embedding the full body in the `content` field of the record envelope would bloat the record stream and make it inefficient for indexing and search. Instead:

- The `content` field carries a lightweight excerpt: the page title plus the first ~500 characters of plain text extracted from the body.
- The full XHTML body is stored locally as an attachment file.
- The attachment entry in the record provides the local path for consumers that need the complete content.

### Content Extraction

The adapter extracts a plain-text excerpt from the storage-format body by:

1. Stripping all HTML and Atlassian macro tags.
2. Collapsing whitespace.
3. Truncating to 500 characters at a word boundary.

This excerpt, concatenated with the page title, forms the `content` field. It is sufficient for full-text search, relevance ranking, and agent summarization. Agents that need the full page content read the HTML attachment.

### Filename Generation

The attachment filename is the page title converted to a URL-safe slug plus `.html`:

```
"Session Management Architecture" -> "session-management-architecture.html"
```

Slugification lowercases, replaces spaces and non-alphanumeric characters with hyphens, and strips leading/trailing hyphens.

## Watermark Strategy

The adapter maintains per-space watermarks to track incremental sync progress.

### Watermark Structure

```go
type Watermark struct {
    SpaceKey   string    `json:"space_key"`
    ModifiedAt time.Time `json:"modified_at"`
}
```

Each configured space has its own watermark. The watermark stores the `version.createdAt` timestamp of the most recently processed page in that space.

### Storage

Watermarks are persisted to a JSON file in the adapter's data directory:

```
{adapter_data_dir}/confluence/watermarks.json
```

```json
{
  "ENG": { "space_key": "ENG", "modified_at": "2026-03-09T14:30:00Z" },
  "PROD": { "space_key": "PROD", "modified_at": "2026-03-09T12:00:00Z" },
  "OPS": { "space_key": "OPS", "modified_at": "2026-03-08T09:15:00Z" }
}
```

### Advancement Rules

1. The watermark for a space advances only after the record for the corresponding page version has been successfully emitted.
2. If the adapter crashes mid-poll, the watermark stays at its last persisted value. The next poll cycle re-processes any pages that were fetched but not emitted. This may cause duplicate emissions, which the runtime deduplicates by `external_record_id`.
3. On first run (no watermark file exists), the adapter uses the `--since` date from the backfill command or the current time for monitor mode.
4. Watermarks are flushed to disk after each space's page batch completes, not after each individual page. This balances durability with I/O efficiency.

### Monitor Integration

The `PollMonitor` SDK helper manages the poll loop, but the cursor it tracks is a single global timestamp. The Confluence adapter wraps this by maintaining per-space watermarks internally and returning the overall most-recent timestamp as the SDK-level cursor. The per-space watermarks provide finer-grained progress tracking.

## Capabilities

Full `ChannelCapabilities` returned by `adapter.info`:

```go
PlatformCapabilities: nexadapter.ChannelCapabilities{
    TextLimit:            0,     // no practical limit on page content
    SupportsMarkdown:     true,  // adapter converts markdown -> storage format
    MarkdownFlavor:       "standard",
    SupportsTables:       true,
    SupportsCodeBlocks:   true,
    SupportsEmbeds:       false,
    SupportsThreads:      false, // pages are not threaded
    SupportsReactions:    false,
    SupportsPolls:        false,
    SupportsButtons:      false,
    SupportsEdit:         true,  // pages can be updated
    SupportsDelete:       false, // adapter does not support page deletion
    SupportsMedia:        true,  // page attachments exist but not used for delivery
    SupportsVoiceNotes:   false,
    SupportsStreamingEdit: false,
}
```

Key implications for agents:

- **No threading**: pages are standalone documents, not conversations. The adapter does not model page comments as threads -- comments are a separate delivery action.
- **No streaming**: page content is delivered as a complete document, never streamed incrementally.
- **Markdown accepted**: agents can author in standard markdown. The adapter converts markdown to Confluence storage format (XHTML) before creating or updating pages.
- **Edit supported**: agents can update existing pages. The adapter handles version conflict resolution automatically.

## Configuration Example

```json
{
  "accounts": {
    "vrtly-confluence": {
      "credentials": {
        "email": "tyler@vrtly.com",
        "api_token": "ATATT3xF...",
        "site": "vrtly"
      },
      "spaces": ["ENG", "PROD", "OPS"],
      "sync": {
        "pages": true,
        "page_content": true,
        "labels": true,
        "versions": false,
        "poll_interval": "15m"
      }
    }
  }
}
```

| Config Field | Default | Notes |
|---|---|---|
| `spaces` | (required) | List of space keys to track, or `["*"]` for all accessible spaces |
| `sync.pages` | `true` | Sync page metadata and content |
| `sync.page_content` | `true` | Store full HTML bodies as local attachments |
| `sync.labels` | `true` | Include page labels in record metadata |
| `sync.versions` | `false` | Backfill historical versions (not just current) |
| `sync.poll_interval` | `"15m"` | Monitor poll interval |

## Confluence API Notes

- **Rate limits**: Confluence Cloud allows approximately 10 requests per second. The adapter respects `Retry-After` headers on 429 responses and pauses until the indicated time.
- **Pagination**: v2 uses cursor-based (`_links.next`), v1 uses `start` + `limit` (offset-based, max 250).
- **Content format**: storage format is XHTML with Atlassian-specific macros (`<ac:structured-macro>`, `<ac:image>`, `<ri:attachment>`). The adapter stores this raw and extracts plain text for the record `content` field.
- **Large pages**: body content can exceed 100KB. The adapter never puts the full body in the `content` field -- it always goes to a local attachment file.
- **CQL**: Confluence Query Language for search, similar in concept to Jira's JQL. Supports space, type, label, and date filters. Only available through the v1 search endpoint.
- **Space IDs vs keys**: the v2 API uses numeric space IDs internally, but accepts space keys in some endpoints. The adapter resolves space keys to IDs during setup and caches the mapping.

## Dependencies

- Go 1.22+
- `nexus-adapter-sdk-go` (local module reference)
- No external Go dependencies (stdlib `net/http` + `encoding/json` + `encoding/base64`)
