# Confluence Adapter Workplan

**Spec**: `docs/specs/ADAPTER_SPEC_CONFLUENCE.md`
**Target location**: `adapters/nexus-adapter-confluence/`
**Language**: Go (using `nexus-adapter-sdk-go`)
**Date**: 2026-03-10

---

## Gap Analysis Summary

This is a **greenfield build**. No Confluence adapter code exists anywhere in the repository. No Jira adapter exists either, so there is no shared Atlassian auth package to reuse yet.

### What exists

- **Adapter SDK** (`nexus-adapter-sdks/nexus-adapter-sdk-go/`): Provides `nexadapter.Run()`, `AdapterOperations` dispatch, `PollMonitor` helper, `EmitFunc`/`NexusEvent`, `EventBuilder`, `SendWithChunking`, `RuntimeContext`/`RuntimeCredential`, setup request/result types, and all type definitions for health, delivery, auth manifests, and capabilities.
- **GitHub adapter** (`nexus-adapter-github/`): Reference implementation showing adapter.info, health, accounts.list, and full setup flow (start/submit/status/cancel). Does NOT implement monitor, backfill, or delivery -- those patterns are not demonstrated in any existing adapter.
- **15 other adapters** in the `adapters/` directory, none of which are Atlassian-based.

### What must be built (every gap)

| Gap | Spec section | Notes |
|---|---|---|
| Go module + binary scaffold | Identity | New `go.mod`, `main.go`, directory structure |
| `adapter.info` handler | Identity, Auth, Operations, Capabilities | Return full AdapterInfo with auth manifest, operations list, capabilities |
| Atlassian HTTP client | Auth, API Notes | Basic auth (email:api_token), base URL construction, rate limit handling (429 + Retry-After), error classification |
| `adapter.setup.start` | Setup Step 1 | Return credential input fields |
| `adapter.setup.submit` (credentials) | Setup Step 2 | Validate credentials via `GET /wiki/api/v2/spaces?limit=250`, return space selection |
| `adapter.setup.submit` (space selection) | Setup Step 3 | Store config, return completed status |
| `adapter.setup.status` | Setup | Return current session state |
| `adapter.setup.cancel` | Setup | Cancel session |
| `adapter.accounts.list` | Operations | List configured accounts |
| Confluence REST API v2 client | API Endpoints | Spaces, pages, page versions, labels, users, comments |
| CQL search client (v1) | Backfill, API Notes | `GET /wiki/rest/api/content/search?cql=...` with offset-based pagination |
| Cursor-based pagination | Pagination | Follow `_links.next` for v2 endpoints |
| Offset-based pagination | Pagination | `start` + `limit` for v1 CQL search |
| User display name cache | User Resolution | In-memory cache, fallback on lookup failure |
| HTML tag stripping + excerpt extraction | Content Extraction | Strip HTML/Atlassian macros, collapse whitespace, truncate to 500 chars at word boundary |
| Page title slugification | Filename Generation | Lowercase, replace non-alnum with hyphens, strip leading/trailing hyphens |
| Page body local storage | Page Body Storage | Write raw XHTML to `{data_dir}/confluence/pages/{page_id}/v{version}/body.html` |
| `record.ingest` envelope construction | Record Emission | Full routing + payload field mapping per spec |
| Per-space watermark management | Watermark Strategy | JSON file persistence, advancement rules, flush-per-batch |
| `adapter.monitor.start` | Monitor | PollMonitor wrapper with per-space watermarks, 15-min default interval |
| `events.backfill` | Backfill | CQL-based historical walk, date-bounded, progress logging |
| `channels.send` -- create page | Delivery | Target `space:{key}`, markdown-to-storage conversion, title extraction |
| `channels.send` -- update page | Delivery | Target `page:{id}`, version fetch + increment, 409 retry |
| `channels.send` -- add comment | Delivery | Target `page:{id}/comment`, footer comment creation |
| `channels.delete` -- delete page/comment | Delivery | Parse Confluence `message_id`, delete page to trash or delete footer comment |
| Markdown to Confluence storage format converter | Delivery | Convert standard markdown to XHTML storage format |
| Delivery error mapping | Delivery Error Mapping | HTTP status -> DeliveryError type mapping |
| `adapter.health` | Health | Validate credentials via `GET /wiki/api/v2/spaces?limit=1` |
| Space key -> ID resolution cache | API Notes | Resolve during setup, cache for monitor/backfill |
| Configuration model | Configuration | Account config with spaces, sync options, poll interval |

---

## Phase 1: Scaffold

**Goal**: Bare Go module that compiles and responds to `adapter.info`.

### Files to create

```
adapters/nexus-adapter-confluence/
  go.mod
  go.sum
  cmd/confluence-adapter/
    main.go
```

### Details

**`go.mod`**
- Module: `github.com/nexus-project/nexus-adapter-confluence`
- Go 1.22+
- Local replace directive for `nexus-adapter-sdk-go` (match pattern from GitHub adapter)

**`cmd/confluence-adapter/main.go`**
- `package main`
- Import `nexadapter`
- Call `nexadapter.Run()` with only `AdapterInfo` handler wired initially
- Define constants: `platformID = "confluence"`, `adapterName = "Confluence Cloud"`, `adapterVersion = "0.1.0"`

**`adapter.info` handler**
- Return `AdapterInfo` with:
  - Platform: `"confluence"`
  - Name: `"Confluence Cloud"`
  - Version: `"0.1.0"`
  - MultiAccount: `true`
  - CredentialService: `"atlassian"`
  - Operations: full list from spec (adapter.info, adapter.health, adapter.accounts.list, adapter.setup.*, adapter.monitor.start, events.backfill, channels.send)
  - Auth manifest: `atlassian_api_key` method with email, api_token, site fields per spec
  - PlatformCapabilities: exact values from spec (TextLimit: 0, SupportsMarkdown: true, MarkdownFlavor: "standard", etc.)

### Validation
- `go build ./cmd/confluence-adapter/`
- `./confluence-adapter adapter.info` outputs correct JSON

---

## Phase 2: Auth + Setup

**Goal**: Full setup flow -- credential collection, validation, space selection, completion.

### Files to create/modify

```
adapters/nexus-adapter-confluence/
  internal/
    atlassian/
      client.go        # HTTP client with Basic auth
      types.go         # Confluence API response types
    config/
      config.go        # Account configuration model
      store.go         # Config persistence (load/save JSON)
  cmd/confluence-adapter/
    main.go            # Wire setup handlers
    setup.go           # Setup flow handlers
```

### Details

**`internal/atlassian/client.go`**
- `type Client struct` with `baseURL`, `email`, `apiToken`, `httpClient`
- `func NewClient(site, email, apiToken string) *Client`
  - `baseURL = "https://{site}.atlassian.net"`
  - Set `Authorization: Basic base64(email:api_token)` on every request
- `func (c *Client) do(ctx, method, path, body) (*http.Response, error)` -- central request method
  - Handle 429: read `Retry-After` header, sleep, retry
  - Set `Content-Type: application/json`, `Accept: application/json`
- `func (c *Client) ListSpaces(ctx, limit int) ([]Space, error)` -- `GET /wiki/api/v2/spaces?limit={limit}`
  - Paginate with cursor if needed

**`internal/atlassian/types.go`**
- `type Space struct { ID string; Key string; Name string; ... }`
- `type V2PagedResponse[T any] struct { Results []T; Links struct { Next string } }`
- Other Confluence API types added here as needed in later phases

**`internal/config/config.go`**
- `type AccountConfig struct` with credentials (email, api_token, site), spaces []string, sync options, poll_interval
- `type AdapterConfig struct` with `Accounts map[string]AccountConfig`

**`internal/config/store.go`**
- Load/save config from `RuntimeContext.Config` or a JSON file
- Implement space key -> space ID mapping cache

**`cmd/confluence-adapter/setup.go`**
- `setupStart`: Return `requires_input` with credential fields (email, api_token, site)
- `setupSubmit`: Two-phase submit:
  - Phase 1 (credentials): Validate by calling `ListSpaces(ctx, 250)`. On success, return `requires_input` with space selection field. Store validated credentials in session state.
  - Phase 2 (space selection): Store selected spaces, return `completed` with account ID, secret_fields, metadata.
  - Distinguish phases by checking session state (has credentials been submitted yet?)
- `setupStatus`: Return current session state
- `setupCancel`: Clear session, return `cancelled`
- Session state: in-memory map keyed by session_id (sufficient for single-process setup)

**`cmd/confluence-adapter/main.go`**
- Wire `AdapterSetupStart`, `AdapterSetupSubmit`, `AdapterSetupStatus`, `AdapterSetupCancel`
- Wire `AdapterAccountsList` (reads from config store)

### Validation
- `./confluence-adapter adapter.setup.start` returns credential fields
- `./confluence-adapter adapter.setup.submit --session-id X --payload-json '{"email":"...","api_token":"...","site":"..."}'` validates and returns space selection
- `./confluence-adapter adapter.setup.submit --session-id X --payload-json '{"spaces":["ENG","PROD"]}'` completes setup
- `./confluence-adapter adapter.accounts.list` returns configured accounts

---

## Phase 3: Confluence API Client

**Goal**: Complete REST API v2 wrapper with pagination, plus v1 CQL search endpoint.

### Files to create/modify

```
adapters/nexus-adapter-confluence/
  internal/atlassian/
    client.go          # Extend with page, version, label, user, comment methods
    types.go           # Add Page, PageVersion, Label, User, Comment types
    pagination.go      # Cursor-based (v2) and offset-based (v1) pagination helpers
    ratelimit.go       # Rate limit handling (429 + Retry-After)
```

### Details

**`internal/atlassian/types.go`** -- add:
- `type Page struct { ID, SpaceID, Status, Title string; ParentID string; Version PageVersion; Body *PageBody; Labels []Label }`
- `type PageVersion struct { Number int; AuthorID string; CreatedAt time.Time }`
- `type PageBody struct { Storage struct { Value string; Representation string } }`
- `type Label struct { Name string }`
- `type User struct { AccountID string; DisplayName string }`
- `type Comment struct { ID string; Body PageBody }`
- `type CQLSearchResult struct { Results []Page; Start int; Limit int; Size int; TotalSize int }`

**`internal/atlassian/client.go`** -- add methods:
- `ListSpacePages(ctx, spaceID string, sortBy string, limit int, cursor string) ([]Page, nextCursor string, error)` -- `GET /wiki/api/v2/spaces/{space_id}/pages?sort={sort}&limit={limit}&body-format=storage`
- `GetPage(ctx, pageID string) (*Page, error)` -- `GET /wiki/api/v2/pages/{page_id}?body-format=storage`
- `GetPageVersions(ctx, pageID string) ([]PageVersion, error)` -- `GET /wiki/api/v2/pages/{page_id}/versions`
- `GetPageLabels(ctx, pageID string) ([]Label, error)` -- `GET /wiki/api/v2/pages/{page_id}/labels`
- `GetUser(ctx, userID string) (*User, error)` -- implemented via `POST /wiki/api/v2/users-bulk`
- `CreatePage(ctx, req CreatePageRequest) (*Page, error)` -- `POST /wiki/api/v2/pages`
- `UpdatePage(ctx, pageID string, req UpdatePageRequest) (*Page, error)` -- `PUT /wiki/api/v2/pages/{page_id}`
- `CreateFooterComment(ctx, pageID string, bodyHTML string) (*Comment, error)` -- `POST /wiki/api/v2/footer-comments` with `pageId` in the request body
- `SearchCQL(ctx, cql string, expand string, start int, limit int) (*CQLSearchResult, error)` -- `GET /wiki/rest/api/content/search?cql={cql}&expand={expand}&start={start}&limit={limit}`

**`internal/atlassian/pagination.go`**
- `func PaginateV2[T any](ctx, client, initialURL string, handler func([]T) error) error` -- follow `_links.next`
- `func PaginateV1CQL(ctx, client, cql string, expand string, limit int, handler func([]Page) error) error` -- increment `start` by `limit`

**`internal/atlassian/ratelimit.go`**
- Extract 429 handling into a reusable helper
- Parse `Retry-After` header (seconds), sleep, retry
- Log rate-limit events at info level

### Validation
- Unit tests with httptest mock server for each API method
- Verify pagination logic terminates correctly (no cursor = stop, offset >= total = stop)
- Verify 429 handling pauses and retries

---

## Phase 4: Record Emission

**Goal**: Convert Confluence pages to `record.ingest` NexusEvent envelopes.

### Files to create

```
adapters/nexus-adapter-confluence/
  internal/
    record/
      builder.go       # Page -> NexusEvent conversion
      excerpt.go       # HTML stripping + excerpt extraction
      slug.go          # Title slugification
      usercache.go     # User display name cache
```

### Details

**`internal/record/builder.go`**
- `func BuildPageRecord(page Page, space Space, account string, site string, bodyPath string, senderName string) NexusEvent`
- Construct `NexusEvent` using `nexadapter.NewEvent()`:
  - `EventID`: `"confluence:{space_id}:page/{page_id}:v{version}"` (this is the external_record_id)
  - `Timestamp`: `page.Version.CreatedAt.UnixMilli()`
  - `Content`: `"{title}\n\n{excerpt}"` -- title + plain-text excerpt (first ~500 chars)
  - `ContentType`: `"text"`
  - `Platform`: `"confluence"`
  - `AccountID`: connection_id from config
  - `SenderID`: `page.Version.AuthorID`
  - `SenderName`: resolved display name (from user cache)
  - `SpaceID`: site identifier (e.g., `"vrtly-cloud"`)
  - `SpaceName`: site display name
  - `ContainerKind`: `"group"`
  - `ContainerID`: `space.Key`
  - `ContainerName`: `space.Name`
  - `ThreadID`: `"page/{page.ID}"`
  - `ThreadName`: `page.Title`
  - Attachment: `{ ID: "page-{id}-v{ver}:body", Filename: slugified-title.html, ContentType: "text/html", Path: bodyPath }`
  - Metadata: `{ "version": number, "parent_page_id": "page/{parentId}" or null, "labels": [...] }`

**`internal/record/excerpt.go`**
- `func ExtractExcerpt(storageFormatHTML string, maxChars int) string`
  - Strip all HTML tags (including Atlassian `<ac:*>` and `<ri:*>` macros)
  - Collapse whitespace (multiple spaces/newlines -> single space)
  - Truncate to `maxChars` (default 500) at a word boundary
- Use stdlib `strings` and simple regex or state-machine parser -- no external dependencies per spec

**`internal/record/slug.go`**
- `func Slugify(title string) string`
  - Lowercase
  - Replace spaces and non-alphanumeric characters with hyphens
  - Collapse consecutive hyphens
  - Strip leading/trailing hyphens

**`internal/record/usercache.go`**
- `type UserCache struct` with `sync.Mutex` and `map[string]string`
- `func (c *UserCache) Resolve(ctx, client *atlassian.Client, userID string) string`
  - Check cache first
  - On miss, call `client.GetUser(ctx, userID)`
  - On error, return `""` (fallback per spec)
  - Cache result (including empty string for failed lookups to avoid repeated failures)

### Validation
- Unit test `BuildPageRecord` with a sample page, verify all field mappings match spec
- Unit test `ExtractExcerpt` with sample XHTML including `<ac:structured-macro>` tags
- Unit test `Slugify` with edge cases (special chars, leading/trailing spaces, consecutive hyphens)
- Unit test `UserCache` with mock client (hit, miss, error fallback)

---

## Phase 5: Page Body Storage

**Goal**: Write page HTML bodies to local files, manage directory structure.

### Files to create

```
adapters/nexus-adapter-confluence/
  internal/
    storage/
      pages.go         # Page body file management
```

### Details

**`internal/storage/pages.go`**
- `type PageStore struct` with `baseDir string` (defaults to `{adapter_data_dir}/confluence/pages`)
- `func NewPageStore(dataDir string) *PageStore`
- `func (s *PageStore) WritePage(pageID string, version int, bodyHTML string) (relativePath string, err error)`
  - Create directory: `{baseDir}/{pageID}/v{version}/`
  - Write file: `body.html` with raw storage-format XHTML content
  - Return relative path: `/confluence/pages/{pageID}/v{version}/body.html`
- `func (s *PageStore) PagePath(pageID string, version int) string` -- compute path without writing
- Ensure directories are created with `os.MkdirAll(dir, 0755)`

### Validation
- Unit test: write a page body, verify file exists and contents match
- Unit test: verify directory structure matches spec layout
- Unit test: verify relative path format matches spec attachment path format

---

## Phase 6: Monitor

**Goal**: Long-lived polling loop that syncs new/updated pages from configured spaces.

### Files to create/modify

```
adapters/nexus-adapter-confluence/
  internal/
    monitor/
      monitor.go       # Monitor implementation wrapping PollMonitor
      watermark.go     # Per-space watermark management
  cmd/confluence-adapter/
    main.go            # Wire AdapterMonitorStart
```

### Details

**`internal/monitor/watermark.go`**
- `type Watermark struct { SpaceKey string; ModifiedAt time.Time }`
- `type WatermarkStore struct` with `filePath string`, `watermarks map[string]Watermark`, `mu sync.Mutex`
- `func NewWatermarkStore(dataDir string) *WatermarkStore` -- path: `{dataDir}/confluence/watermarks.json`
- `func (s *WatermarkStore) Load() error` -- read JSON file, populate map
- `func (s *WatermarkStore) Save() error` -- write JSON file atomically (write to temp, rename)
- `func (s *WatermarkStore) Get(spaceKey string) time.Time` -- return watermark time or zero
- `func (s *WatermarkStore) Advance(spaceKey string, modifiedAt time.Time) ` -- only advance if newer
- `func (s *WatermarkStore) LatestAcrossSpaces() time.Time` -- return the most recent watermark

**`internal/monitor/monitor.go`**
- `func NewMonitorFunc(client *atlassian.Client, config *config.AccountConfig, store *PageStore, wmStore *WatermarkStore, userCache *UserCache) func(ctx, account string, emit EmitFunc) error`
- Implementation wraps `nexadapter.PollMonitor`:
  - `Interval`: parsed from `config.PollInterval` (default 15m)
  - `MaxConsecutiveErrors`: 10
  - `Fetch` function:
    1. For each configured space:
       - Read watermark for this space
       - Query `ListSpacePages(ctx, spaceID, "-modified-date", 250, "")` with body-format=storage
       - Walk pages; for each page where `version.createdAt > watermark`:
         - Fetch full page if body not included
         - Fetch labels via `GetPageLabels`
         - Resolve sender name via `UserCache`
         - Write body to local file via `PageStore`
         - Build `NexusEvent` via `record.BuildPageRecord`
         - Collect into events list
       - Paginate if `_links.next` exists and remaining pages are still newer than watermark
       - Advance watermark for this space
       - Flush watermarks to disk (per-batch)
    2. Return collected events + latest timestamp across all spaces

**`cmd/confluence-adapter/main.go`**
- Load config from `RuntimeContext`
- Initialize `atlassian.Client`, `PageStore`, `WatermarkStore`, `UserCache`
- Wire `AdapterMonitorStart` to `monitor.NewMonitorFunc(...)`

### Validation
- Unit test watermark store: load, save, advance, latest-across-spaces
- Integration-style test with httptest mock: simulate pages changing, verify events emitted, watermarks advanced
- Verify zero-emission cycle when no pages changed
- Verify watermark not advanced on error
- Manual smoke test: `./confluence-adapter adapter.monitor.start --connection test` with mock credentials

---

## Phase 7: Backfill

**Goal**: Walk all pages in configured spaces historically, emit records for all pages since a given date.

### Files to create/modify

```
adapters/nexus-adapter-confluence/
  internal/
    backfill/
      backfill.go      # Backfill implementation
  cmd/confluence-adapter/
    main.go            # Wire EventBackfill
```

### Details

**`internal/backfill/backfill.go`**
- `func NewBackfillFunc(client *atlassian.Client, config *config.AccountConfig, store *PageStore, userCache *UserCache) func(ctx, account string, since time.Time, emit EmitFunc) error`
- Implementation:
  1. List all configured spaces
  2. For each space:
     - Build CQL query: `space="{space_key}" AND type="page" AND lastModified >= "{since_date}"` (format: `yyyy-MM-dd`)
     - If `since` is zero time, omit the `lastModified` filter
     - Call `SearchCQL(ctx, cql, "version,ancestors,metadata.labels,body.storage", 0, 250)`
     - Paginate with offset-based pagination (increment `start` by `limit`)
     - For each page:
       - Write body HTML to local file
       - Resolve sender name
       - Build and emit `NexusEvent`
     - Log progress: "Space {key}: emitted {n} pages"
  3. Log final summary: total pages emitted, per-space counts, elapsed time
  4. Exit when all spaces fully walked

**Optional version history backfill** (disabled by default):
- If `config.Sync.Versions == true`:
  - For each page, call `GetPageVersions(ctx, pageID)`
  - For each historical version, fetch page at that version and emit separate record
  - `external_record_id` includes version number, so each is distinct
- Default behavior: emit only current version

### Validation
- Unit test with mock CQL responses: verify correct CQL query construction
- Unit test pagination: verify offset increments, termination when `start >= totalSize`
- Verify date formatting for CQL (`yyyy-MM-dd`)
- Verify zero-date handling (omit lastModified filter)
- Manual smoke test: `./confluence-adapter events.backfill --connection test --since 2026-01-01`

---

## Phase 8: Delivery

**Goal**: Create pages, update pages, and add comments to pages via `channels.send`.

### Files to create/modify

```
adapters/nexus-adapter-confluence/
  internal/
    delivery/
      delivery.go      # Delivery dispatch (route by target format)
      markdown.go      # Markdown -> Confluence storage format converter
      targets.go       # Target string parsing
  cmd/confluence-adapter/
    main.go            # Wire DeliverySend
```

### Details

**`internal/delivery/targets.go`**
- `func ParseTarget(to string) (action string, params map[string]string, error)`
- Parse target formats:
  - `space:{space_key}` -> action: `create_page`, params: `{space_key: "..."}`
  - `space:{space_key}/parent:{parent_page_id}` -> action: `create_page`, params: `{space_key: "...", parent_page_id: "..."}`
  - `page:{page_id}` -> action: `update_page`, params: `{page_id: "..."}`
  - `page:{page_id}/comment` -> action: `add_comment`, params: `{page_id: "..."}`
  - Anything else -> error

**`internal/delivery/markdown.go`**
- `func MarkdownToStorageFormat(md string) string`
- Convert standard markdown to Confluence storage format (XHTML):
  - `# Heading` -> `<h1>Heading</h1>`
  - `**bold**` -> `<strong>bold</strong>`
  - `*italic*` -> `<em>italic</em>`
  - `` `code` `` -> `<code>code</code>`
  - Code blocks -> `<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[...]]></ac:plain-text-body></ac:structured-macro>`
  - `[text](url)` -> `<a href="url">text</a>`
  - Lists (`-`, `1.`) -> `<ul><li>`, `<ol><li>`
  - Tables -> `<table><tr><th>/<td>`
  - Paragraphs -> `<p>...</p>`
  - Horizontal rules -> `<hr />`
- Use stdlib only (no external markdown library per spec's dependency constraint)
- Does not need to be perfect -- cover the common markdown patterns agents use

**`func ExtractTitle(text string) (title string, body string)`**
- If text starts with `# Title\n`, extract title and return remaining body
- Otherwise return `("", text)` -- caller must provide title via metadata

**`internal/delivery/delivery.go`**
- `func NewDeliveryFunc(client *atlassian.Client, config *config.AccountConfig) func(ctx, req SendRequest) (*DeliveryResult, error)`
- Dispatch based on `ParseTarget(req.To)`:
  - **create_page**:
    1. Extract title from `req.Text` (first `# heading` line) or fail if no title
    2. Convert remaining markdown to storage format
    3. Resolve space key -> space ID (from config cache)
    4. Call `client.CreatePage(ctx, CreatePageRequest{SpaceID, Title, ParentID (optional), Body})`
    5. Return `DeliveryResult{Success: true, MessageIDs: ["confluence:{space_id}:page/{id}:v1"], ChunksSent: 1, TotalChars: len(text)}`
  - **update_page**:
    1. Fetch current page to get current version number and title
    2. Convert markdown to storage format
    3. Extract title from text if present, otherwise keep existing title
    4. Call `client.UpdatePage(ctx, pageID, UpdatePageRequest{Title, Version: current+1, Body, Message: "Updated by nex agent"})`
    5. On 409 (version conflict): refetch current version, retry once. On second 409, return `content_rejected` error.
    6. Return `DeliveryResult` with updated page record ID
  - **add_comment**:
    1. Convert markdown to storage format
    2. Call `client.CreateFooterComment(ctx, pageID, bodyHTML)`
    3. Return `DeliveryResult` with comment record ID
- **Error mapping** (per spec table):
  - 401, 403 -> `DeliveryError{Type: "permission_denied", Retry: false}`
  - 404 -> `DeliveryError{Type: "not_found", Retry: false}`
  - 409 -> `DeliveryError{Type: "content_rejected", Retry: true}` (after auto-retry exhausted)
  - 429 -> `DeliveryError{Type: "rate_limited", Retry: true, RetryAfterMs: parsed}`
  - 5xx -> `DeliveryError{Type: "network", Retry: true}`

### Validation
- Unit test target parsing: all valid formats, invalid formats
- Unit test markdown conversion: headings, bold, italic, code, links, lists, tables, code blocks
- Unit test title extraction: with heading, without heading
- Unit test delivery dispatch: mock API, verify correct API calls for each action
- Unit test 409 retry logic: first attempt fails, second succeeds; both fail -> error
- Unit test error mapping: each HTTP status -> correct DeliveryError

---

## Phase 9: Health

**Goal**: Validate credentials and API reachability.

### Files to create/modify

```
adapters/nexus-adapter-confluence/
  cmd/confluence-adapter/
    main.go            # Wire AdapterHealth
    health.go          # Health check implementation
```

### Details

**`cmd/confluence-adapter/health.go`**
- `func healthCheck(ctx context.Context, account string) (*nexadapter.AdapterHealth, error)`
- Load runtime context from env
- Extract credentials (email, api_token, site) from `RuntimeContext.Credential.Fields`
- Build `atlassian.Client`
- Call `client.ListSpaces(ctx, 1)` -- `GET /wiki/api/v2/spaces?limit=1`
- On success:
  - Count accessible spaces (make a second call with `limit=250` to get count, or use first response metadata)
  - Return `AdapterHealth{Connected: true, Account: account, LastEventAt: ..., Details: {site: "...", spaces_accessible: N}}`
- On 401/403:
  - Return `AdapterHealth{Connected: false, Account: account, Error: "authentication failed: {status}", Details: {site: "..."}}`
- On other error:
  - Return `AdapterHealth{Connected: false, Account: account, Error: err.Error()}`

### Validation
- Unit test with mock server: successful health check, 401 failure, network error
- Manual smoke test: `./confluence-adapter adapter.health --connection test`

---

## Cross-Cutting Concerns

### Shared Atlassian Auth Package (Future Consideration)

The spec notes that Confluence shares the Atlassian auth pattern (email + API token + site URL) with the Jira adapter. Currently no Jira adapter exists in the repository, so there is nothing to share.

**Recommendation**: Build the Atlassian HTTP client (`internal/atlassian/client.go`) within the Confluence adapter first. When the Jira adapter is built, extract the shared auth/HTTP client into a common package:

```
adapters/nexus-adapter-sdks/nexus-atlassian-common/
  client.go         # Base HTTP client with Basic auth + rate limiting
  auth.go           # Credential extraction from RuntimeContext
  types.go          # Shared Atlassian types (user, etc.)
```

The Confluence adapter's `internal/atlassian/` package should be structured so this extraction is straightforward -- keep auth and HTTP transport logic separate from Confluence-specific API methods.

### Rate Limiting

- All API calls go through the central `client.do()` method
- 429 responses: parse `Retry-After` header, sleep, retry
- Log rate-limit events at info level
- No artificial delays between requests within a poll cycle (per spec)
- Confluence Cloud limit: ~10 requests/second

### Error Handling

- Transient errors (5xx, network) -> retry with backoff
- Auth errors (401/403) -> fail immediately, do not retry
- In monitor: SDK PollMonitor handles backoff/retry at the cycle level
- In backfill: retry individual page fetches, but do not restart the entire walk
- Watermarks only advance after successful emission

### Data Directory

- Default: `data/` relative to adapter working directory
- Configurable via `RuntimeContext.Config["data_dir"]` or environment variable
- Structure:
  ```
  data/confluence/
    pages/{page_id}/v{version}/body.html
    watermarks.json
  ```

---

## Implementation Sequence

| Order | Phase | Depends On | Estimated Effort |
|---|---|---|---|
| 1 | Phase 1: Scaffold | -- | Small |
| 2 | Phase 2: Auth + Setup | Phase 1 | Medium |
| 3 | Phase 3: API Client | Phase 2 | Medium |
| 4 | Phase 4: Record Emission | Phase 3 | Medium |
| 5 | Phase 5: Page Body Storage | -- (parallel with 4) | Small |
| 6 | Phase 9: Health | Phase 3 | Small |
| 7 | Phase 6: Monitor | Phases 3, 4, 5 | Large |
| 8 | Phase 7: Backfill | Phases 3, 4, 5 | Medium |
| 9 | Phase 8: Delivery | Phase 3 | Large |

Phase 5 (storage) and Phase 9 (health) can be done in parallel with Phase 4 since they have no interdependency. Phase 6 (monitor) is the largest single phase because it integrates all prior components. Phase 8 (delivery) is large due to the markdown converter and three distinct delivery actions.

---

## Smoke Test Checklist

After all phases are complete, validate end-to-end:

- [ ] `go build ./cmd/confluence-adapter/` -- compiles without errors
- [ ] `go test ./...` -- all unit tests pass
- [ ] `./confluence-adapter adapter.info` -- outputs correct JSON matching spec
- [ ] `./confluence-adapter adapter.setup.start` -- returns credential fields
- [ ] `./confluence-adapter adapter.setup.submit` (credentials) -- validates against live Confluence instance, returns space selection
- [ ] `./confluence-adapter adapter.setup.submit` (spaces) -- completes setup
- [ ] `./confluence-adapter adapter.accounts.list` -- returns configured account
- [ ] `./confluence-adapter adapter.health --connection X` -- reports connected/disconnected correctly
- [ ] `./confluence-adapter adapter.monitor.start --connection X` -- polls, emits records for changed pages, writes HTML bodies, advances watermarks
- [ ] `./confluence-adapter events.backfill --connection X --since 2026-01-01` -- walks all pages since date, emits records, exits cleanly
- [ ] `./confluence-adapter channels.send --connection X --target-json '{"connection_id":"X","channel":{"platform":"confluence","container_id":"space:ENG"}}' --text "# New Page\n\nContent"` -- creates page in Confluence
- [ ] `./confluence-adapter channels.send --connection X --target-json '{"connection_id":"X","channel":{"platform":"confluence","container_id":"page:123456"}}' --text "Updated content"` -- updates existing page
- [ ] `./confluence-adapter channels.send --connection X --target-json '{"connection_id":"X","channel":{"platform":"confluence","container_id":"page:123456/comment"}}' --text "Agent comment"` -- adds footer comment
- [ ] `./confluence-adapter channels.delete --connection X --target-json '{"connection_id":"X","channel":{"platform":"confluence","container_id":"page:123456"}}' --message-id "confluence:vrtly-cloud:page/123456:v1"` -- moves page to trash
- [ ] Verify local HTML files at `data/confluence/pages/{id}/v{ver}/body.html`
- [ ] Verify `data/confluence/watermarks.json` persisted and correct
- [ ] Verify record.ingest envelope fields match spec exactly (external_record_id format, routing fields, payload fields, attachment paths)
- [ ] Verify 429 rate-limit handling (mock or force via rapid requests)
- [ ] Verify delivery 409 retry logic (update a page with stale version)
