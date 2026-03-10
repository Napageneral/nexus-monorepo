# Confluence Adapter Validation Ladder

**Spec**: `docs/specs/ADAPTER_SPEC_CONFLUENCE.md`
**Workplan**: `docs/workplans/CONFLUENCE_ADAPTER_WORKPLAN.md`
**Adapter location**: `adapters/nexus-adapter-confluence/`
**Date**: 2026-03-10

---

## How to Use This Ladder

Each rung is a checkpoint. Rungs are ordered by dependency -- you cannot meaningfully pass Rung N until all predecessors pass. After completing a workplan phase, run the corresponding rung's checks before starting the next phase.

A rung is **green** when every pass criterion is met and zero fail indicators are present. A rung is **red** when any fail indicator fires. Do not proceed to the next rung while any predecessor is red.

---

## Rung 1: Scaffold Compiles, adapter.info Correct

**Workplan phase**: Phase 1 (Scaffold)
**Prerequisites**: Go 1.22+ installed, `nexus-adapter-sdk-go` available via local replace directive

### Automated Checks

1. **Build succeeds**
   ```bash
   cd adapters/nexus-adapter-confluence && go build ./cmd/confluence-adapter/
   ```
   Exit code must be 0. No compilation errors or warnings.

2. **go vet passes**
   ```bash
   cd adapters/nexus-adapter-confluence && go vet ./...
   ```
   Exit code 0, zero output.

3. **adapter.info returns valid JSON**
   ```bash
   ./confluence-adapter adapter.info | jq .
   ```
   Must parse without error.

4. **adapter.info field assertions** (script or test):
   - `.platform == "confluence"`
   - `.name == "Confluence Cloud"`
   - `.version == "0.1.0"`
   - `.multi_account == true`
   - `.credential_service == "atlassian"`
   - `.operations` array contains exactly: `adapter.info`, `adapter.health`, `adapter.accounts.list`, `adapter.setup.start`, `adapter.setup.submit`, `adapter.setup.status`, `adapter.setup.cancel`, `adapter.monitor.start`, `events.backfill`, `channels.send`
   - `.operations` array does contain: `channels.send`, `channels.delete`
   - `.operations` array does NOT contain: `adapter.control.start`, `delivery.stream`, `delivery.react`, `delivery.edit`, `delivery.poll`
   - `.auth.methods[0].id == "atlassian_api_key"`
   - `.auth.methods[0].type == "api_key"`
   - `.auth.methods[0].service == "atlassian"`
   - `.auth.methods[0].fields` has exactly 3 entries: `email` (text, required), `api_token` (secret, required), `site` (text, required, placeholder "yoursite")
   - `.auth.setupGuide` contains the Atlassian API token URL
   - `.platform_capabilities.text_limit == 0`
   - `.platform_capabilities.supports_markdown == true`
   - `.platform_capabilities.markdown_flavor == "standard"`
   - `.platform_capabilities.supports_tables == true`
   - `.platform_capabilities.supports_code_blocks == true`
   - `.platform_capabilities.supports_embeds == false`
   - `.platform_capabilities.supports_threads == false`
   - `.platform_capabilities.supports_reactions == false`
   - `.platform_capabilities.supports_polls == false`
   - `.platform_capabilities.supports_buttons == false`
   - `.platform_capabilities.supports_edit == true`
   - `.platform_capabilities.supports_delete == true`
   - `.platform_capabilities.supports_media == false`
   - `.platform_capabilities.supports_voice_notes == false`
   - `.platform_capabilities.supports_streaming_edit == false`

### Manual Verification

- Visually inspect the `adapter.info` JSON output and confirm it matches the spec's "Auth manifest" and "Capabilities" sections verbatim.
- Confirm the binary is placed at the expected path and is executable.

### Pass Criteria

- `go build` exits 0.
- `go vet` exits 0.
- `adapter.info` output matches every field assertion above.
- The `go.mod` file uses the correct module path and has a local replace directive for the SDK.

### Fail Indicators

- Compilation errors (missing SDK imports, type mismatches).
- `adapter.info` returns empty output, invalid JSON, or an error.
- Any field in the info response has the wrong value, wrong type, or is missing.
- Operations list includes unsupported operations or omits supported ones.
- Capabilities do not match spec values exactly (e.g., `supports_threads: true` would be wrong).

---

## Rung 2: Auth + Setup With Space Selection

**Workplan phase**: Phase 2 (Auth + Setup)
**Prerequisites**: Rung 1 green. Atlassian HTTP client compiles. Config store compiles.

### Automated Checks

1. **setup.start returns credential fields**
   ```bash
   ./confluence-adapter adapter.setup.start | jq .
   ```
   - `.status == "requires_input"`
   - `.session_id` is a non-empty string
   - `.message` is a non-empty string
   - `.instructions` contains the Atlassian API token URL
   - `.fields` has exactly 3 entries with names `email`, `api_token`, `site`
   - `email` field: `type == "text"`, `required == true`
   - `api_token` field: `type == "secret"`, `required == true`
   - `site` field: `type == "text"`, `required == true`, `placeholder == "yoursite"`

2. **setup.submit (credentials) with invalid credentials returns failure**
   ```bash
   ./confluence-adapter adapter.setup.submit \
     --session-id "$SID" \
     --payload-json '{"email":"bad@example.com","api_token":"invalid","site":"nonexistent"}'
   ```
   - `.status == "failed"`
   - `.error` is a non-empty string mentioning authentication or authorization

3. **setup.submit (credentials) with valid credentials returns space selection** (requires live or mocked Confluence)
   ```bash
   ./confluence-adapter adapter.setup.submit \
     --session-id "$SID" \
     --payload-json '{"email":"...","api_token":"...","site":"..."}'
   ```
   - `.status == "requires_input"`
   - `.fields[0].name == "spaces"`
   - `.fields[0].type == "select"`
   - `.fields[0].options` is a non-empty array
   - Each option has `label` (non-empty string) and `value` (non-empty string, a space key)
   - `.metadata.spaces_available` is an integer > 0
   - `.metadata.site_url` matches `https://{site}.atlassian.net/wiki`

4. **setup.submit (space selection) completes setup**
   ```bash
   ./confluence-adapter adapter.setup.submit \
     --session-id "$SID" \
     --payload-json '{"spaces":["ENG","PROD"]}'
   ```
   - `.status == "completed"`
   - `.account` is a non-empty string
   - `.message` contains the selected space keys
   - `.secret_fields.email` is present
   - `.secret_fields.api_token` is present
   - `.metadata.site` matches the site provided during credentials step
   - `.metadata.spaces` is an array matching the submitted space keys

5. **setup.status reflects current session state**
   - Before any submit: returns `requires_input` with credential fields
   - After credential submit: returns `requires_input` with space selection
   - After space submit: returns `completed`

6. **setup.cancel clears session**
   ```bash
   ./confluence-adapter adapter.setup.cancel --session-id "$SID"
   ```
   - `.status == "cancelled"`
   - Subsequent `setup.status` for the same session returns an error or empty state

7. **accounts.list returns configured accounts**
   ```bash
   ./confluence-adapter adapter.accounts.list
   ```
   - After successful setup, the new account appears in the list
   - Each account entry includes the account ID and site information

### Manual Verification

- Run the full three-step setup flow against a live Confluence Cloud instance.
- Confirm the space list shown in step 2 matches the spaces visible in the Confluence UI.
- Confirm the setup completion message is accurate.
- Confirm that re-running `setup.start` produces a fresh session with a new session_id.

### Pass Criteria

- Full three-step setup flow completes without errors.
- Invalid credentials are rejected at step 2 with a clear error message.
- Space list reflects actual Confluence spaces accessible to the provided credentials.
- Setup completion stores the config such that `accounts.list` can retrieve it.
- Session lifecycle (start, submit, status, cancel) works correctly.

### Fail Indicators

- `setup.start` returns wrong fields or field types.
- Valid credentials rejected (client is not constructing Basic auth header correctly).
- Invalid credentials accepted (validation call is not being made or its error is swallowed).
- Space list is empty despite the account having access to spaces (pagination issue or wrong API endpoint).
- `setup.submit` with spaces returns `requires_input` again instead of `completed` (phase detection logic is broken).
- Config is not persisted -- `accounts.list` returns empty after successful setup.
- Session ID collision or session state leaking between concurrent setup flows.

---

## Rung 3: Confluence API v2 Client (Cursor Pagination, Rate Limiting)

**Workplan phase**: Phase 3 (Confluence API Client)
**Prerequisites**: Rung 2 green. Atlassian client has base HTTP transport with Basic auth.

### Automated Checks

1. **Unit tests for every API method pass**
   ```bash
   cd adapters/nexus-adapter-confluence && go test ./internal/atlassian/... -v
   ```
   All tests exit 0. Use `httptest` mock servers to simulate Confluence API responses.

2. **Cursor-based pagination (v2) terminates correctly**
   - Mock a multi-page response chain where page 1 includes `_links.next` and page 2 does not.
   - Assert: handler receives results from both pages.
   - Assert: no additional HTTP request is made after the page with no `_links.next`.

3. **Cursor-based pagination handles empty result set**
   - Mock a response with `results: []` and no `_links.next`.
   - Assert: handler is called with an empty slice, no errors.

4. **Offset-based pagination (v1 CQL) terminates correctly**
   - Mock a CQL search response with `totalSize: 500`, `start: 0`, `limit: 250`, `size: 250`.
   - Second page: `start: 250`, `limit: 250`, `size: 250`.
   - Assert: two requests are made, `start` values are 0 and 250.
   - Assert: no third request when `start + size >= totalSize`.

5. **Offset-based pagination handles partial last page**
   - Mock `totalSize: 300`, first page `size: 250`, second page `size: 50`.
   - Assert: exactly two requests, handler receives 300 total results.

6. **Rate limiting: 429 with Retry-After is respected**
   - Mock a 429 response with `Retry-After: 2` followed by a 200 response.
   - Assert: the client pauses for approximately 2 seconds before retrying.
   - Assert: the second request succeeds and returns the expected data.

7. **Rate limiting: 429 without Retry-After uses default backoff**
   - Mock a 429 without `Retry-After`, followed by a 200.
   - Assert: the client retries after a reasonable default delay.

8. **Error classification**
   - Mock 401 response: assert error indicates authentication failure, no retry.
   - Mock 403 response: assert error indicates permission denied, no retry.
   - Mock 404 response: assert error indicates not found, no retry.
   - Mock 500 response: assert error indicates server error, eligible for retry.

9. **API method coverage** (one test per method minimum):
   - `ListSpaces`: returns slice of Space structs with ID, Key, Name populated.
   - `ListSpacePages`: returns pages with pagination cursor.
   - `GetPage`: returns single page with body in storage format.
   - `GetPageVersions`: returns version history array.
   - `GetPageLabels`: returns label name array.
   - `GetUser`: returns user with AccountID and DisplayName.
   - `CreatePage`: sends correct POST body, returns created page.
   - `UpdatePage`: sends correct PUT body with version number, returns updated page.
   - `CreateFooterComment`: sends correct POST body, returns comment.
   - `SearchCQL`: sends correct CQL query string with expand and pagination params.

10. **Base URL construction**
    - Assert client with site `"vrtly"` sends requests to `https://vrtly.atlassian.net`.
    - Assert v2 endpoints use path prefix `/wiki/api/v2/`.
    - Assert v1 CQL endpoint uses path `/wiki/rest/api/content/search`.

### Manual Verification

- Point the client at a live Confluence Cloud instance.
- Call `ListSpaces` and verify the returned spaces match the Confluence web UI.
- Call `GetPage` for a known page ID and verify the body contains the expected content.
- Call `SearchCQL` with a known CQL query and verify results match the Confluence search UI.

### Pass Criteria

- All unit tests pass.
- Cursor-based and offset-based pagination both terminate correctly on all boundary conditions (empty, single page, multi-page, partial last page).
- Rate limiting pauses the expected duration and retries successfully.
- Error classification returns the correct error types for each HTTP status code.
- Every API method correctly constructs the request URL, headers, and body.
- Every API method correctly parses the response into typed Go structs.

### Fail Indicators

- Pagination enters an infinite loop (no termination condition on missing cursor or offset >= total).
- Rate limiting does not pause (requests fire immediately after a 429).
- Rate limiting pauses but does not retry (request fails permanently on first 429).
- `Retry-After` header is ignored (always uses default delay regardless of header value).
- API method sends request to wrong endpoint path.
- API method does not include `body-format=storage` query param when required.
- Response parsing panics on missing fields or unexpected JSON structure.
- Auth header is malformed (wrong base64 encoding, missing "Basic " prefix).

---

## Rung 4: Record Emission

**Workplan phase**: Phase 4 (Record Emission)
**Prerequisites**: Rung 3 green. API client can fetch pages, users, labels.

### Automated Checks

1. **Unit tests pass**
   ```bash
   cd adapters/nexus-adapter-confluence && go test ./internal/record/... -v
   ```

2. **BuildPageRecord produces correct envelope structure**
   - Given a sample Page (id: "123456", title: "Session Management Architecture", version: 3, authorId: "abc123", createdAt: 2026-02-06T00:00:00Z, parentId: "100000", labels: ["architecture", "sessions"], body: `"<p>This document describes...</p>"`), Space (key: "ENG", name: "Engineering"), account "vrtly-confluence", site "vrtly-cloud", senderName "Alice Smith":
   - Assert routing fields:
     - `platform == "confluence"`
     - `connection_id == "vrtly-confluence"`
     - `sender_id == "abc123"`
     - `sender_name == "Alice Smith"`
     - `space_id == "vrtly-cloud"`
     - `container_kind == "group"`
     - `container_id == "ENG"`
     - `container_name == "Engineering"`
     - `thread_id == "page/123456"`
     - `thread_name == "Session Management Architecture"`
   - Assert payload fields:
     - `external_record_id == "confluence:vrtly-cloud:page/123456:v3"`
     - `timestamp == 1707177600000` (unix millis for 2026-02-06T00:00:00Z)
     - `content` starts with `"Session Management Architecture\n\n"`
     - `content_type == "text"`
   - Assert attachment:
     - `attachments[0].id == "page-123456-v3:body"`
     - `attachments[0].filename == "session-management-architecture.html"`
     - `attachments[0].content_type == "text/html"`
     - `attachments[0].path == "/confluence/pages/123456/v3/body.html"`
   - Assert metadata:
     - `metadata.version == 3`
     - `metadata.parent_page_id == "page/100000"`
     - `metadata.labels == ["architecture", "sessions"]`

3. **external_record_id format is always `confluence:{space_id}:page/{page_id}:v{version}`**
   - Test with multiple page IDs and version numbers.
   - Assert the format holds for v1, v100, and edge-case IDs.

4. **Top-level page has null parent_page_id**
   - Build a record for a page with no parentId.
   - Assert `metadata.parent_page_id` is `null` (not `"page/"` or empty string).

5. **Excerpt extraction**
   - Input: `<p>This is a <strong>bold</strong> introduction.</p><ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[func main()]]></ac:plain-text-body></ac:structured-macro><p>Second paragraph with more text.</p>`
   - Assert: output contains "This is a bold introduction." and "Second paragraph with more text." but no HTML tags, no `<ac:*>` tags, no `<![CDATA[` fragments.
   - Assert: whitespace is collapsed (no runs of multiple spaces or newlines).

6. **Excerpt truncation at word boundary**
   - Input: a string that would be 600+ characters after tag stripping.
   - Assert: output is <= 500 characters.
   - Assert: output does not end mid-word (last char is a space, period, or end of a complete word).

7. **Excerpt with empty body**
   - Input: `""` (empty string).
   - Assert: output is `""`.

8. **Excerpt with only Atlassian macros and no text**
   - Input: `<ac:structured-macro ac:name="toc" />`
   - Assert: output is `""` or whitespace-only.

9. **Slugification**
   - `"Session Management Architecture"` -> `"session-management-architecture"`
   - `"  Leading and Trailing  "` -> `"leading-and-trailing"`
   - `"Special Ch@r$cter$ & Symbols!"` -> `"special-ch-r-cter-symbols"`
   - `"---Multiple---Hyphens---"` -> `"multiple-hyphens"`
   - `"Already-a-slug"` -> `"already-a-slug"`
   - `""` -> `""` (empty input produces empty output)
   - `"UPPERCASE ONLY"` -> `"uppercase-only"`

10. **User cache: hit, miss, error fallback**
    - First call for user "abc123" with mock returning "Alice Smith": assert returns "Alice Smith".
    - Second call for same user: assert no API call made (cache hit), returns "Alice Smith".
    - Call for user "deleted-user" with mock returning 404: assert returns `""`.
    - Subsequent call for "deleted-user": assert no API call (negative result cached), returns `""`.

### Manual Verification

- Emit a record for a real Confluence page and compare every field in the envelope against the spec's "Confluence Page Record" example.
- Verify the excerpt is readable plain text that accurately represents the page content.

### Pass Criteria

- Every routing and payload field matches the spec's field mapping tables exactly.
- `external_record_id` format is correct for all tested inputs.
- Excerpt extraction strips all HTML and Atlassian-specific tags.
- Excerpt truncation respects the 500-character limit and word boundaries.
- Slugification handles all edge cases without panic.
- User cache reduces API calls and handles lookup failures gracefully.

### Fail Indicators

- Any routing field has the wrong value (e.g., `container_kind` is not `"group"`).
- `external_record_id` uses wrong separator, wrong order, or omits the version prefix.
- Excerpt contains HTML tags, CDATA markers, or Atlassian macro fragments.
- Excerpt exceeds 500 characters.
- Excerpt truncation cuts mid-word.
- Slugified filename contains uppercase characters, spaces, or consecutive hyphens.
- User cache calls the API on every invocation (no caching).
- User cache panics or returns error instead of empty string on lookup failure.

---

## Rung 5: Page Body Storage

**Workplan phase**: Phase 5 (Page Body Storage)
**Prerequisites**: Rung 1 green. No dependency on API client -- this rung can run in parallel with Rungs 3-4.

### Automated Checks

1. **Unit tests pass**
   ```bash
   cd adapters/nexus-adapter-confluence && go test ./internal/storage/... -v
   ```

2. **WritePage creates correct directory structure**
   - Call `WritePage("123456", 3, "<p>Hello</p>")`.
   - Assert directory `{baseDir}/123456/v3/` exists.
   - Assert file `{baseDir}/123456/v3/body.html` exists.
   - Assert file contents is exactly `"<p>Hello</p>"`.

3. **WritePage returns correct relative path**
   - Assert returned path is `/confluence/pages/123456/v3/body.html`.
   - This path must match the format used in record attachment entries.

4. **WritePage handles large bodies**
   - Write a 200KB XHTML string.
   - Assert file is written completely (file size matches input length).
   - Assert no truncation or corruption.

5. **WritePage creates nested directories on first write**
   - Start with a clean base directory (no pre-existing page directories).
   - Assert `WritePage` does not fail due to missing parent directories.

6. **Multiple versions for the same page**
   - Write page "123456" version 1, then version 2, then version 5.
   - Assert all three files exist at distinct paths:
     - `{baseDir}/123456/v1/body.html`
     - `{baseDir}/123456/v2/body.html`
     - `{baseDir}/123456/v5/body.html`
   - Assert each file has the correct content (not overwritten by later versions).

7. **PagePath returns consistent path without side effects**
   - Call `PagePath("999999", 1)`.
   - Assert no directory or file is created on disk.
   - Assert the path matches what `WritePage` would return for the same inputs.

8. **Directory permissions**
   - Assert created directories have mode 0755 (or at least are readable and executable).

9. **Content preserves raw storage format**
   - Write body containing Atlassian macros: `<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[func main()]]></ac:plain-text-body></ac:structured-macro>`.
   - Read the file back and assert contents are byte-identical to input.
   - No HTML normalization, encoding changes, or macro stripping occurs during storage.

### Manual Verification

- Run a monitor or backfill cycle against a real Confluence instance.
- Open a stored `body.html` file in a browser and confirm it renders recognizable page content.
- Verify the directory tree under `data/confluence/pages/` matches the expected layout.

### Pass Criteria

- Files are written at the exact paths specified by the spec's Storage Layout section.
- Relative paths returned by `WritePage` match the paths used in record attachment entries.
- File contents are byte-identical to the input XHTML (no transformation during storage).
- Multiple versions of the same page coexist without collision.
- Large files (100KB+) are written without truncation.

### Fail Indicators

- Wrong directory structure (e.g., missing `v{version}` level, wrong base path).
- Returned relative path does not match the attachment path format in records.
- File contents differ from input (encoding change, tag stripping, whitespace normalization).
- Writing a second version overwrites the first version's file.
- `WritePage` panics or returns an error when parent directories do not exist.
- File permissions prevent downstream consumers from reading the HTML.

---

## Rung 6: Monitor (Per-Space Polling With Watermarks)

**Workplan phase**: Phase 6 (Monitor)
**Prerequisites**: Rungs 3, 4, and 5 all green.

### Automated Checks

1. **Unit tests pass**
   ```bash
   cd adapters/nexus-adapter-confluence && go test ./internal/monitor/... -v
   ```

2. **Watermark store: load/save/advance lifecycle**
   - Create a new store, advance watermark for "ENG" to T1, advance "PROD" to T2.
   - Save to disk. Create a new store instance from the same file.
   - Assert: `Get("ENG")` returns T1, `Get("PROD")` returns T2.

3. **Watermark advance is monotonic**
   - Set watermark for "ENG" to T2.
   - Call `Advance("ENG", T1)` where T1 < T2.
   - Assert: watermark is still T2 (not regressed).

4. **Watermark file is written atomically**
   - Assert the save implementation writes to a temp file and renames, not direct write.
   - Simulate a crash (kill process mid-save) and assert the previous watermark file is intact.

5. **LatestAcrossSpaces returns the maximum watermark**
   - Set "ENG" to T1, "PROD" to T3, "OPS" to T2.
   - Assert `LatestAcrossSpaces()` returns T3.

6. **First run with no watermark file uses current time**
   - Delete the watermark file. Start monitor.
   - Assert: the first poll only looks for pages modified after approximately "now" (not epoch).

7. **Poll cycle: new pages emitted**
   - Mock two spaces ("ENG", "PROD") with initial watermarks at T0.
   - Mock API: ENG has 3 pages modified after T0, PROD has 1 page modified after T0.
   - Assert: emit function receives exactly 4 events.
   - Assert: each event has correct routing (container_id matches space key).

8. **Poll cycle: no changes yields zero emissions**
   - Mock API: all pages in all spaces have `modified_at` <= current watermark.
   - Assert: emit function is called zero times.
   - Assert: watermarks are unchanged.

9. **Poll cycle: watermark advances to latest page timestamp**
   - Mock ENG with pages at T1, T2, T3 (T3 being most recent).
   - After poll: assert ENG watermark is T3.

10. **Poll cycle: watermark does NOT advance on API error**
    - Mock ENG API call returning 500.
    - Assert: ENG watermark is unchanged from before the poll.
    - Assert: error is propagated (PollMonitor will handle backoff).

11. **Poll cycle: pagination across multiple response pages**
    - Mock a space with 300 modified pages (exceeding the 250-page limit).
    - First API response has 250 pages + `_links.next`; second response has 50 pages, no `_links.next`.
    - Assert: all 300 pages are emitted.

12. **Poll cycle: stops pagination when remaining pages are older than watermark**
    - Mock a response where pages 1-10 are newer than watermark but pages 11-250 are older.
    - Assert: only 10 events are emitted.
    - Assert: no second paginated request is made (since we hit the boundary).

13. **Watermarks flushed per-space batch, not per-page**
    - Instrument the watermark save call.
    - Process a space with 5 pages.
    - Assert: watermark save is called once after all 5 pages for that space are processed, not 5 times.

14. **Body files written before record emission**
    - In the emit function, check that the attachment path referenced by the event exists on disk.
    - Assert: for every emitted event, the corresponding `body.html` file already exists.

15. **Default poll interval is 15 minutes**
    - Assert that the PollMonitor is configured with a 15-minute interval when no override is specified.

16. **Max consecutive errors is 10**
    - Assert the PollMonitor configuration sets `MaxConsecutiveErrors: 10`.

### Manual Verification

- Start the monitor against a live Confluence instance with at least two configured spaces.
- Edit a page in Confluence. Wait for the next poll cycle (or use a short poll interval for testing).
- Confirm the modified page is emitted as a record with the correct envelope.
- Confirm the page body HTML file is written to the correct path.
- Confirm the watermark advances after the poll.
- Stop the monitor, restart it, and confirm it resumes from the persisted watermark (no duplicate emissions for pages already processed).

### Pass Criteria

- Poll cycles emit records for all new and updated pages across all configured spaces.
- Zero-change cycles produce zero emissions and do not alter watermarks.
- Watermarks advance only after successful emission, never on error.
- Watermarks are persisted to disk and survive process restarts.
- Pagination handles multi-page API responses correctly.
- Poll interval and max-errors match spec defaults.
- Body files exist on disk before the corresponding record is emitted.

### Fail Indicators

- Pages modified after the watermark are missed (not emitted).
- Pages modified before the watermark are re-emitted (watermark comparison is wrong).
- Watermark advances even when API call or emit fails.
- Watermark file is corrupted after a process crash (non-atomic writes).
- Monitor enters an infinite pagination loop.
- Monitor emits duplicate events for the same page version within a single poll cycle.
- Body files are missing or empty for emitted records.
- Poll interval is not 15 minutes by default (e.g., defaulting to seconds instead of minutes).
- Monitor does not exit after 10 consecutive errors.

---

## Rung 7: Backfill (CQL-Based Historical Walk)

**Workplan phase**: Phase 7 (Backfill)
**Prerequisites**: Rungs 3, 4, and 5 all green.

### Automated Checks

1. **Unit tests pass**
   ```bash
   cd adapters/nexus-adapter-confluence && go test ./internal/backfill/... -v
   ```

2. **CQL query construction with --since date**
   - Input: space key "ENG", since date 2026-01-15.
   - Assert CQL query is: `space="ENG" AND type="page" AND lastModified >= "2026-01-15"`
   - Assert the `expand` parameter includes: `version,ancestors,metadata.labels,body.storage`
   - Assert the `limit` parameter is 250.

3. **CQL query construction without --since (zero date)**
   - Input: space key "ENG", since is zero time.
   - Assert CQL query is: `space="ENG" AND type="page"` (no `lastModified` filter).

4. **Date formatting for CQL**
   - Assert `2026-03-09T14:30:00Z` is formatted as `"2026-03-09"` (date only, no time component).
   - Assert the format is `yyyy-MM-dd` as expected by CQL.

5. **Offset-based pagination walks all results**
   - Mock a CQL search returning 500 total results across 2 pages.
   - Assert: all 500 pages are processed and emitted.
   - Assert: requests are made with `start=0` then `start=250`.

6. **Backfill emits records for all pages across all configured spaces**
   - Mock 2 spaces: ENG (100 pages), PROD (50 pages).
   - Assert: 150 total events emitted.
   - Assert: ENG pages have `container_id == "ENG"`, PROD pages have `container_id == "PROD"`.

7. **Backfill writes body files for every emitted record**
   - After backfill completes, verify every emitted event's attachment path points to an existing file.

8. **Backfill logs progress**
   - Capture log output during backfill.
   - Assert: log contains per-space counts (e.g., "Space ENG: emitted 100 pages").
   - Assert: log contains a final summary with total pages and elapsed time.

9. **Backfill exits cleanly after walking all spaces**
   - Assert: the backfill function returns nil error when all spaces are fully processed.
   - Assert: no hanging goroutines or open connections after return.

10. **Backfill with zero results**
    - Mock CQL returning 0 results for all spaces.
    - Assert: zero events emitted, function returns nil, logs indicate 0 pages.

11. **Version history backfill (optional, when sync.versions = true)**
    - Mock a page with 3 historical versions.
    - Assert: 3 separate events emitted, each with a distinct `external_record_id` (v1, v2, v3).
    - Assert: default behavior (sync.versions = false) emits only 1 event per page.

### Manual Verification

- Run backfill against a live Confluence instance: `./confluence-adapter events.backfill --connection X --since 2026-01-01`.
- Count the emitted records and compare against a manual CQL query in Confluence for the same date range.
- Verify a sample of body.html files contain the correct page content.
- Run backfill with no `--since` flag and confirm it walks all pages in all spaces.

### Pass Criteria

- CQL queries are correctly constructed for both date-bounded and unbounded cases.
- Offset-based pagination terminates correctly and processes all results.
- Every space is walked and every matching page is emitted.
- Body files are written for all emitted records.
- Progress logging includes per-space counts and a final summary.
- Backfill exits cleanly with nil error on success.
- Default behavior emits only current versions; `sync.versions = true` emits historical versions.

### Fail Indicators

- CQL query has wrong syntax (e.g., wrong quoting, wrong field names).
- Date format in CQL is wrong (should be `yyyy-MM-dd`, not ISO 8601 with time).
- Pagination stops early (some pages in a space are not processed).
- Pagination goes past the end (requests with `start > totalSize` are made).
- Missing body.html files for emitted records.
- Backfill hangs or does not exit after all spaces are processed.
- No progress logging (makes it impossible to diagnose issues in production).
- Zero-date handling includes the `lastModified` filter instead of omitting it.

---

## Rung 8: Delivery (Create, Update, Comment, Delete)

**Workplan phase**: Phase 8 (Delivery)
**Prerequisites**: Rung 3 green (API client needed for Confluence calls).

### Automated Checks

1. **Unit tests pass**
   ```bash
   cd adapters/nexus-adapter-confluence && go test ./internal/delivery/... -v
   ```

2. **Target parsing: all valid formats**
   - `"space:ENG"` -> action `create_page`, space_key `"ENG"`
   - `"space:ENG/parent:456789"` -> action `create_page`, space_key `"ENG"`, parent_page_id `"456789"`
   - `"page:123456"` -> action `update_page`, page_id `"123456"`
   - `"page:123456/comment"` -> action `add_comment`, page_id `"123456"`

3. **Target parsing: invalid formats rejected**
   - `"channel:ENG"` -> error
   - `"space:"` -> error (empty space key)
   - `"page:"` -> error (empty page id)
   - `"page:123456/thread"` -> error (unknown suffix)
   - `""` -> error

4. **Delete message ID parsing**
   - `"confluence:vrtly-cloud:page/123456:v1"` -> page delete for `123456`
   - `"confluence:vrtly-cloud:page/123456/comment/c1"` -> footer comment delete for `c1`
   - `"page/123456"` -> error

5. **Title extraction from markdown**
   - Input: `"# My New Page\n\nBody content here"` -> title `"My New Page"`, body `"Body content here"`
   - Input: `"No heading here\n\nJust content"` -> title `""`, body unchanged
   - Input: `"## Second Level\n\nContent"` -> title `""` (only `#` single heading triggers extraction, or document this behavior)

6. **Markdown to Confluence storage format conversion**
   - `"# Heading"` -> `"<h1>Heading</h1>"`
   - `"## Sub Heading"` -> `"<h2>Sub Heading</h2>"`
   - `"**bold**"` -> contains `"<strong>bold</strong>"`
   - `"*italic*"` -> contains `"<em>italic</em>"`
   - `` "`inline code`" `` -> contains `"<code>inline code</code>"`
   - `"[link text](https://example.com)"` -> contains `<a href="https://example.com">link text</a>`
   - Fenced code blocks -> `<ac:structured-macro ac:name="code">` with `<ac:plain-text-body><![CDATA[...]]></ac:plain-text-body>`
   - Unordered list (`- item`) -> `<ul><li>item</li></ul>`
   - Ordered list (`1. item`) -> `<ol><li>item</li></ol>`
   - Table -> `<table>` with `<tr>`, `<th>`, `<td>` elements
   - Paragraph text -> wrapped in `<p>...</p>`

7. **Create page: correct API request**
   - Mock `POST /wiki/api/v2/pages`.
   - Send delivery with target `"space:ENG"` and text `"# New Page\n\nContent"`.
   - Assert: request body has `spaceId` (resolved from "ENG"), `title: "New Page"`, `status: "current"`, `body.representation: "storage"`, `body.value` is XHTML.
   - Assert: delivery result has `success: true`, `message_ids` contains an ID in the format `confluence:*:page/*:v1`.

8. **Create page under parent: parentId included**
   - Send delivery with target `"space:ENG/parent:456789"`.
   - Assert: request body includes `parentId: "456789"`.

9. **Create page without title heading: error**
   - Send delivery with target `"space:ENG"` and text `"No heading, just body"`.
   - Assert: delivery returns an error indicating a title is required (unless metadata provides one).

10. **Update page: version increment**
   - Mock `GET /wiki/api/v2/pages/123456` returning version 3.
   - Mock `PUT /wiki/api/v2/pages/123456`.
   - Send delivery with target `"page:123456"`.
   - Assert: PUT body has `version.number: 4` and `version.message: "Updated by nex agent"`.
   - Assert: delivery result has `success: true`.

11. **Update page: 409 conflict auto-retry succeeds**
    - Mock first PUT returning 409, then mock GET returning version 5, then mock second PUT returning 200.
    - Assert: adapter fetches current version after 409, retries with version 6, succeeds.
    - Assert: delivery result has `success: true`.

12. **Update page: 409 conflict retry exhausted**
    - Mock both PUT attempts returning 409.
    - Assert: delivery returns `DeliveryError` with type `"content_rejected"` and `retry: true`.

13. **Add comment: correct API request**
   - Mock `POST /wiki/api/v2/footer-comments`.
    - Send delivery with target `"page:123456/comment"` and text `"Agent analysis comment"`.
    - Assert: request body has `body.representation: "storage"`, `body.value` is XHTML conversion of the input.
    - Assert: delivery result has `success: true`.

14. **Delete page/comment: correct API request**
    - Mock `DELETE /wiki/api/v2/pages/123456`.
    - Send delete with message ID `confluence:vrtly-cloud:page/123456:v1`.
    - Assert: page delete does not use `purge=true`.
    - Mock `DELETE /wiki/api/v2/footer-comments/c1`.
    - Send delete with message ID `confluence:vrtly-cloud:page/123456/comment/c1`.
    - Assert: delivery result has `success: true` and echoes the deleted `message_id`.

15. **Delivery error mapping for each HTTP status**
    - 401 -> `type: "permission_denied"`, `retry: false`
    - 403 -> `type: "permission_denied"`, `retry: false`
    - 404 -> `type: "not_found"`, `retry: false`
    - 429 -> `type: "rate_limited"`, `retry: true`
    - 500 -> `type: "network"`, `retry: true`
    - 502 -> `type: "network"`, `retry: true`
    - 503 -> `type: "network"`, `retry: true`

16. **Delivery result structure**
    - Assert `chunks_sent` is 1 for all single-page deliveries.
    - Assert `total_chars` matches the character count of the input text.
    - Assert `message_ids` is a non-empty array with correctly formatted IDs.

### Manual Verification

- Create a page in a test Confluence space via delivery. Open it in Confluence and verify:
  - Title is correct.
  - Body content renders correctly (headings, bold, code blocks, links, lists, tables all display properly).
  - Page appears under the correct parent if specified.
- Update an existing page via delivery. Refresh in Confluence and verify:
  - Content is updated.
  - Version number incremented by 1.
  - Version message says "Updated by nex agent".
- Add a comment to a page via delivery. Verify in Confluence:
  - Comment appears in the page's footer comments section.
  - Comment content renders correctly.
- Test version conflict: open a page in Confluence editor, make an edit via delivery simultaneously, and observe the retry behavior.

### Pass Criteria

- All four delivery actions (create, update, comment, delete) produce the correct Confluence API requests.
- Markdown-to-storage conversion covers all common markdown patterns.
- Target parsing handles all valid formats and rejects invalid ones.
- Version conflict retry logic works: single 409 is recovered, double 409 returns `content_rejected`.
- Error mapping matches the spec's Delivery Error Mapping table exactly.
- Delivery results contain correct `success`, `message_ids`, `chunks_sent`, `total_chars`.
- Page delete uses delete-to-trash semantics, not purge.

### Fail Indicators

- Created page has garbled or raw markdown content (conversion not applied).
- Created page has wrong title (extraction logic broken).
- Updated page has wrong version number (not current + 1).
- Updated page silently overwrites content without version check (no conflict detection).
- 409 retry does not refetch the current version (retries with same stale version).
- Comment lands as inline comment instead of footer comment (wrong API endpoint).
- Error mapping returns wrong type or wrong retry flag for any HTTP status.
- Target parsing accepts invalid formats without error.
- Markdown conversion produces invalid XHTML that Confluence rejects.

---

## Rung 9: Health

**Workplan phase**: Phase 9 (Health)
**Prerequisites**: Rung 3 green (API client needed for the health-check call).

### Automated Checks

1. **Unit tests pass**
   ```bash
   cd adapters/nexus-adapter-confluence && go test ./cmd/confluence-adapter/ -run TestHealth -v
   ```

2. **Healthy response on successful API call**
   - Mock `GET /wiki/api/v2/spaces?limit=1` returning 200 with one space.
   - Assert response:
     - `connected == true`
     - `account` matches the requested account ID
     - `details.site` is `"{site}.atlassian.net"`
     - `details.spaces_accessible` is an integer >= 0

3. **Unhealthy response on 401**
   - Mock `GET /wiki/api/v2/spaces?limit=1` returning 401.
   - Assert response:
     - `connected == false`
     - `error` contains "401" or "authentication" or "unauthorized" (case insensitive)
     - `details.site` is still populated

4. **Unhealthy response on 403**
   - Mock returning 403.
   - Assert: `connected == false`, `error` mentions permission or forbidden.

5. **Unhealthy response on network error**
   - Mock a connection refused or timeout.
   - Assert: `connected == false`, `error` describes the network failure.

6. **Health check uses correct endpoint**
   - Instrument the mock server to record requests.
   - Assert: exactly one request to `/wiki/api/v2/spaces` with `limit=1`.

7. **Health check uses stored credentials**
   - Assert: the health check reads credentials from the account configuration (RuntimeContext), not from command-line arguments.

### Manual Verification

- Run `./confluence-adapter adapter.health --connection X` with valid credentials. Confirm `connected: true`.
- Revoke or rotate the API token. Run health again. Confirm `connected: false` with a clear error message.
- Confirm the `spaces_accessible` count matches reality (compare with Confluence admin panel).

### Pass Criteria

- Health returns `connected: true` with correct details when credentials are valid and API is reachable.
- Health returns `connected: false` with a descriptive error when credentials are invalid (401/403).
- Health returns `connected: false` with a descriptive error when the API is unreachable (network error).
- The correct API endpoint is used (`/wiki/api/v2/spaces?limit=1`).

### Fail Indicators

- Health returns `connected: true` when credentials are invalid (validation call is skipped or error is swallowed).
- Health returns `connected: false` when credentials are valid (parsing the success response incorrectly).
- Error message is empty or generic (e.g., "error" with no details).
- Health check calls the wrong endpoint (e.g., `/wiki/api/v2/pages` instead of `/wiki/api/v2/spaces`).
- Health check makes more API calls than necessary (e.g., full space enumeration instead of `limit=1`).

---

## Rung 10: Integration -- Live Confluence Cloud

**Workplan phase**: Post-implementation (Smoke Test Checklist from workplan)
**Prerequisites**: All prior rungs (1-9) green.

### Environment Setup

- A Confluence Cloud test site (e.g., `testsite.atlassian.net`) with:
  - At least 2 spaces with content (5+ pages each).
  - A valid Atlassian API token with access to those spaces.
  - At least one page with multiple versions (edit history).
  - At least one page with labels.
  - At least one page with a parent page (nested hierarchy).
- The adapter binary compiled and available.
- A clean data directory (no prior watermarks or body files).

### Automated Checks (Integration Test Script)

These checks run sequentially against the live Confluence instance. They can be scripted as a shell script or Go integration test with a `// +build integration` tag.

1. **adapter.info**
   ```bash
   ./confluence-adapter adapter.info | jq -e '.platform == "confluence"'
   ```
   Assert: exits 0 (all Rung 1 checks pass against the compiled binary).

2. **Full setup flow**
   - Run `adapter.setup.start`, capture session_id.
   - Submit valid credentials.
   - Assert: space list contains the expected test spaces.
   - Submit space selection.
   - Assert: setup completes.
   - Run `adapter.accounts.list`.
   - Assert: the new account is present.

3. **Health check**
   ```bash
   ./confluence-adapter adapter.health --connection $ACCT
   ```
   - Assert: `connected: true`, `spaces_accessible` matches expected count.

4. **Backfill**
   ```bash
   ./confluence-adapter events.backfill --connection $ACCT --since 2026-01-01
   ```
   - Capture emitted records (via stdout, log, or callback).
   - Assert: at least 1 record emitted per configured space.
   - Assert: every record has valid `external_record_id` format.
   - Assert: every record's attachment path points to an existing `body.html` file.
   - Assert: at least one record has non-empty `metadata.labels`.
   - Assert: at least one record has a non-null `metadata.parent_page_id`.
   - Assert: `sender_name` is resolved to a non-empty string for at least one record.
   - Open a sample `body.html` file and assert it contains valid XHTML (starts with `<` and contains recognizable content).

5. **Monitor (short-lived test)**
   - Start monitor with a 30-second poll interval for testing.
   - Edit a page in Confluence (add a word to the body) during the first poll wait.
   - Wait for the next poll cycle.
   - Assert: the modified page is emitted as a new record with an incremented version.
   - Assert: watermarks.json is updated on disk.
   - Stop the monitor.
   - Restart the monitor.
   - Assert: the page that was just emitted is NOT re-emitted (watermark persisted correctly).

6. **Delivery: create page**
   ```bash
   ./confluence-adapter channels.send \
     --connection $ACCT \
     --to "space:$SPACE_KEY" \
     --text "# Integration Test Page\n\nThis page was created by the Confluence adapter integration test at $(date)."
   ```
   - Assert: delivery result has `success: true`.
   - Assert: `message_ids[0]` is in the format `confluence:*:page/*:v1`.
   - Open the new page in Confluence browser UI and verify title and body are correct.

7. **Delivery: update page**
   - Extract the page ID from the create result.
   ```bash
   ./confluence-adapter channels.send \
     --connection $ACCT \
     --to "page:$PAGE_ID" \
     --text "# Integration Test Page (Updated)\n\nThis page was updated at $(date)."
   ```
   - Assert: delivery result has `success: true`.
   - Assert: `message_ids[0]` contains `v2`.
   - Refresh the page in Confluence and verify:
     - Title updated to include "(Updated)".
     - Body content changed.
     - Version number is 2.
     - Version message says "Updated by nex agent".

8. **Delivery: add comment**
   ```bash
   ./confluence-adapter channels.send \
     --connection $ACCT \
     --to "page:$PAGE_ID/comment" \
     --text "Integration test comment at $(date)."
   ```
   - Assert: delivery result has `success: true`.
   - Verify in Confluence that the comment appears in the footer comments section.

9. **Rate limit resilience**
   - Issue 20 rapid sequential API calls (e.g., 20 `GetPage` requests in a tight loop).
   - If any return 429, assert the adapter pauses and retries.
   - Assert: all 20 calls eventually succeed without error.

10. **Error handling: invalid account**
    - Run health check with a non-existent account ID.
    - Assert: returns a clear error (not a panic or stack trace).

11. **Error handling: expired token**
    - Configure an account with an invalid API token.
    - Run health check.
    - Assert: `connected: false` with authentication error.
    - Run backfill.
    - Assert: fails with a clear authentication error, does not emit any records.

12. **Data directory cleanup verification**
    - After all tests, verify the data directory structure:
      ```
      data/confluence/
        pages/{page_id}/v{version}/body.html   # multiple of these
        watermarks.json                          # present and valid JSON
      ```
    - Assert: watermarks.json parses as valid JSON with entries for each configured space.

### Manual Verification

- Walk through each delivery result in the Confluence web UI and confirm content renders correctly.
- Verify that pages created by the adapter appear in Confluence search.
- Verify that the monitor does not produce duplicate records across restarts.
- Review adapter logs for any unexpected warnings or errors.
- Confirm the adapter exits cleanly (no zombie processes, no leaked file handles).

### Pass Criteria

- The entire lifecycle works end-to-end: setup -> health -> backfill -> monitor -> delivery (create, update, comment).
- Records emitted by backfill and monitor match the spec envelope exactly.
- Body files are valid XHTML that Confluence would recognize.
- Delivery creates, updates, and comments on pages successfully, with content rendering correctly in the Confluence UI.
- Watermarks persist across restarts and prevent duplicate emissions.
- Rate limiting is handled gracefully without data loss.
- Error conditions produce clear messages without panics.

### Fail Indicators

- Any step in the lifecycle fails (setup, health, backfill, monitor, or delivery).
- Records have wrong field values when compared to the Confluence API directly.
- Body files are empty, corrupted, or contain non-XHTML content.
- Created or updated pages render incorrectly in Confluence (broken formatting, missing content).
- Monitor re-emits pages that were already processed before a restart.
- Rate limiting causes permanent failures (not just delays).
- Errors produce panics, stack traces, or silent failures instead of structured error responses.
- Data directory structure does not match the spec layout.

---

## Summary Matrix

| Rung | Name | Workplan Phase | Key Gate |
|---|---|---|---|
| 1 | Scaffold Compiles | Phase 1 | `go build` exits 0, `adapter.info` JSON matches spec |
| 2 | Auth + Setup | Phase 2 | Three-step setup flow completes, invalid creds rejected |
| 3 | API Client | Phase 3 | All API methods tested, pagination terminates, 429 handled |
| 4 | Record Emission | Phase 4 | Envelope fields match spec exactly, excerpt extraction clean |
| 5 | Page Body Storage | Phase 5 | Files at correct paths, content byte-identical to input |
| 6 | Monitor | Phase 6 | Per-space polling emits new pages, watermarks persist |
| 7 | Backfill | Phase 7 | CQL walk covers all spaces, date-bounded queries correct |
| 8 | Delivery | Phase 8 | Create/update/comment all work, 409 retry, error mapping |
| 9 | Health | Phase 9 | Connected/disconnected reported accurately |
| 10 | Integration | Post-build | Full lifecycle against live Confluence Cloud passes |
