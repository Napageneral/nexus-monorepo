## AIX Remote Offboarding Import Spec

Status: Draft

Updated: 2026-03-05

## Customer Experience

The customer outcome is simple:

1. An admin prepares one remote NEX runtime for an offboarding archive.
2. The admin issues one upload credential per engineer.
3. Each engineer runs one guided AIX flow on their device.
4. AIX syncs local Cursor history into the local `aix` database.
5. AIX uploads that history to the shared remote `agents.db`.
6. The upload is resumable, idempotent, and safe over unstable networks.
7. The archive is queryable by engineer identity after upload.

The engineer should not need to know:

- WebSocket methods
- `personaId`
- `runId`
- chunk sizes
- retry knobs
- database details

The engineer should receive:

- one runtime URL
- one user-specific upload token
- one prompt or skill
- one command to run

## Problem

We want to offboard AI session history from many engineer laptops into one shared remote `agents.db` using AIX as the local extractor and uploader.

This is not safe enough today for three reasons:

1. The AIX client calls the wrong runtime methods.
2. The import schema is keyed as if imports are single-user.
3. The large-upload path is not restart-safe for multi-GB sessions.

## Goals

1. Support multi-user AIX imports into one shared remote `agents.db`.
2. Preserve canonical identity using the existing `entities` and `contacts` model.
3. Make uploader attribution non-spoofable.
4. Make large uploads resumable and idempotent across reconnects and restarts.
5. Keep the engineer UX to one guided flow.
6. Use a hard cutover with no backward compatibility.

## Non-Goals

1. Spike broker cutover or Spike storage migration.
2. Backward compatibility for old `sessions.import*` methods.
3. A hosted frontdoor routing product for this first cut.
4. Reworking the entire `sessions` read model.

## Baseline Findings

1. AIX currently sends `sessions.import` and `sessions.import.chunk`.
2. NEX runtime currently exposes `agents.sessions.import` and `agents.sessions.import.chunk`.
3. `session_imports` is keyed only by `(source, source_provider, source_session_id)`.
4. Request idempotency is global by `idempotency_key`, not uploader-scoped.
5. Chunk uploads are staged, but upload identity and idempotency in AIX include `runId`, which breaks restart-safe resume.
6. The current import service can silently move an existing imported session to a different workspace on fingerprint-unchanged re-import. That behavior is not acceptable for a shared archive.

## Chosen Architecture

This spec chooses the smallest architecture that solves the offboarding use case cleanly:

1. One dedicated remote NEX runtime per customer archive.
2. One dedicated archive persona as the runtime default persona.
3. One upload token per engineer.
4. AIX connects directly to the remote runtime.
5. AIX imports through `agents.sessions.import` and `agents.sessions.import.chunk`.
6. Imported provenance is stored in `agents.db` with canonical entity attribution.

This avoids making frontdoor a hard dependency for the first working version.

Frontdoor-based routing can be added later without changing the import schema or upload semantics defined here.

## Identity Model

### Core principle

The import path must use canonical Nexus identity, not ad hoc uploader strings.

### Required identity fields

Each imported session must carry these provenance fields in `agents.db`:

- `source_entity_id`
- `source_contact_id`
- `uploader_entity_id`
- `uploader_device_id`
- `target_workspace_id`

### Semantics

- `uploader_entity_id`: the authenticated Nexus entity that made the upload. This is derived from runtime auth only.
- `source_entity_id`: the canonical entity whose session history is represented by the import.
- `source_contact_id`: optional contact row id from `identity.db` when a provider-level account identity is known.
- `uploader_device_id`: optional stable device identity for audit and troubleshooting.
- `target_workspace_id`: the archive workspace/persona receiving the imported session.

### v1 offboarding rule

For the offboarding flow in this spec:

- `source_entity_id = uploader_entity_id`
- `source_contact_id` is optional
- the client cannot override `uploader_entity_id`
- the client cannot override `source_entity_id`

This keeps the trust boundary simple and matches the real customer flow: each engineer uploads their own local history.

### Contact integration

If AIX can provide a stable provider account reference, the runtime should resolve or create a contact mapping in `identity.db` and persist the resulting `contacts.id` into `source_contact_id`.

Example:

- `platform = "cursor"`
- `space_id = ""`
- `contact_id = <stable cursor account id or email>`
- `entity_id = source_entity_id`

If no stable provider account identity is available, `source_contact_id` remains `NULL`.

### Naming cleanup

The current import service uses the name `sourceEntityId` for turn/message/tool source ids inside helper functions. That name is now reserved for identity entities.

Hard cutover rename:

- helper param `sourceEntityId` becomes `sourceScopedId`

This rename is required before implementing the identity changes in this spec.

## Auth Model

### Chosen model

Use one runtime upload token per engineer.

Why:

1. Correct attribution
2. Per-user revocation
3. Per-user expiry
4. Auditability
5. No shared-secret blast radius

### Token requirements

Each upload token must be:

- bound to one `entity_id`
- revocable
- expiring
- labeled for the offboarding campaign
- limited to upload-specific scope

### Runtime role and scopes

Introduce a new runtime scope:

- `agents.sessions.import`

The AIX upload client must request only this scope.

The import methods must require this scope:

- `agents.sessions.import`
- `agents.sessions.import.chunk`
- `agents.sessions.import.upload_status`

`operator.admin`, `operator.approvals`, and `operator.pairing` must not be required for AIX import.

### Admin flow

For v1, the admin flow may use existing token primitives:

1. Ensure each engineer has a Nexus `entity_id`.
2. Issue one token per engineer.
3. Scope the token to `agents.sessions.import`.
4. Set expiry for the offboarding window.
5. Send the engineer:
   - runtime URL
   - upload token
   - guided prompt

Existing low-level CLI can already mint runtime tokens. A dedicated admin UX can be added later, but it is not required for this spec.

Example:

```bash
nex acl tokens create \
  --entity-id <engineer-entity-id> \
  --scopes agents.sessions.import \
  --label "aix-offboarding:<campaign>:<engineer>" \
  --expires-at <iso-or-epoch>
```

### Frontdoor

Frontdoor is not required for v1.

Hosted routing can be added later by exchanging a frontdoor enrollment token for a short-lived runtime token, but that is explicitly out of scope for this implementation.

## Remote Target Model

The remote archive target is a dedicated NEX runtime with these properties:

1. Shared `agents.db`
2. Default persona set to the archive persona
3. `agents.sessions.import*` methods enabled
4. Upload scope enforcement enabled

The engineer-facing flow must not require selecting a persona. The target runtime is preconfigured to import into the archive workspace.

## Protocol Hard Cutover

### Method names

The only valid import methods after cutover are:

- `agents.sessions.import`
- `agents.sessions.import.chunk`
- `agents.sessions.import.upload_status`

Old method names are removed:

- `sessions.import`
- `sessions.import.chunk`

### Request shape changes

`runId` is removed from request payloads.

The server may still return a server-generated `runId` in responses for tracing, but `runId` is not part of client idempotency or upload identity.

### `agents.sessions.import`

```ts
type SourceAccountRef = {
  platform: string;
  spaceId?: string;
  contactId: string;
  contactName?: string;
};

type AgentsSessionsImportRequest = {
  source: "aix";
  mode: "backfill" | "tail";
  idempotencyKey: string;
  items: Array<{
    sourceProvider: string;
    sourceSessionId: string;
    sourceSessionFingerprint: string;
    importedAtMs: number;
    sourceAccount?: SourceAccountRef;
    session: {
      labelHint?: string;
      createdAtMs?: number;
      updatedAtMs?: number;
      model?: string;
      provider?: string;
      workspacePath?: string;
      project?: string;
      isSubagent?: boolean;
      parentSourceSessionId?: string;
      parentSourceMessageId?: string;
      spawnToolCallId?: string;
      taskDescription?: string;
      taskStatus?: string;
      metadata?: Record<string, unknown>;
    };
    turns: Array<{
      sourceTurnId: string;
      parentSourceTurnId?: string;
      startedAtMs: number;
      completedAtMs?: number;
      model?: string;
      provider?: string;
      inputTokens?: number;
      outputTokens?: number;
      cachedInputTokens?: number;
      cacheWriteTokens?: number;
      reasoningTokens?: number;
      totalTokens?: number;
      responseMessageSourceId?: string;
      queryMessageSourceIds?: string[];
      metadata?: Record<string, unknown>;
    }>;
    messages: Array<{
      sourceMessageId: string;
      sourceTurnId?: string;
      role: "user" | "assistant" | "system" | "tool";
      content?: string;
      sequence: number;
      createdAtMs: number;
      thinking?: string;
      contextJson?: unknown;
      metadataJson?: unknown;
    }>;
    toolCalls?: Array<{
      sourceToolCallId: string;
      sourceTurnId?: string;
      sourceMessageId?: string;
      toolName: string;
      toolNumber?: number;
      paramsJson?: unknown;
      resultJson?: unknown;
      status?: "pending" | "running" | "completed" | "failed";
      spawnedSourceSessionId?: string;
      startedAtMs: number;
      completedAtMs?: number;
      sequence: number;
      error?: string;
    }>;
  }>;
};
```

### `agents.sessions.import.chunk`

```ts
type AgentsSessionsImportChunkRequest = {
  source: "aix";
  mode: "backfill" | "tail";
  idempotencyKey: string;
  uploadId: string;
  chunkIndex: number;
  chunkTotal: number;
  payloadSha256: string;
  encoding: "gzip+base64";
  data: string;
  sourceProvider: string;
  sourceSessionId: string;
  sourceSessionFingerprint: string;
  sourceAccount?: SourceAccountRef;
};
```

### `agents.sessions.import.upload_status`

```ts
type AgentsSessionsImportUploadStatusRequest = {
  source: "aix";
  uploadId: string;
  sourceProvider: string;
  sourceSessionId: string;
  sourceSessionFingerprint: string;
};

type AgentsSessionsImportUploadStatusResponse = {
  ok: true;
  uploadId: string;
  status: "missing" | "staging" | "completed" | "failed";
  chunkTotal: number | null;
  receivedRanges: Array<{ start: number; end: number }>;
  import?: AgentsSessionsImportResponse;
};
```

### Trust boundary

The runtime derives these values from auth and connection context, never from request payload:

- `uploader_entity_id`
- `source_entity_id` in v1
- `uploader_device_id`
- `target_workspace_id`

The client may provide `sourceAccount`, but it is advisory metadata only.

## Deterministic Identity and Idempotency

### Session identity

The imported session identity key is:

- `(source, source_provider, source_entity_id, source_session_id)`

This is the dedupe and upsert identity for shared multi-user import.

### Session label

Imported session labels must include `source_entity_id` in their deterministic hash input.

Required hash inputs:

- `source`
- `source_provider`
- `source_entity_id`
- `source_session_id`

This is required because `sessions.label` is a global primary key.

### Turn, message, and tool ids

Import-scoped ids must include:

- `source`
- `source_provider`
- `source_entity_id`
- `source_session_id`
- `sourceScopedId`

Without the entity dimension, two users with the same source session id can collide in shared tables.

### Request idempotency

`session_import_requests` must be uploader-scoped.

The request cache identity is:

- `(source, uploader_entity_id, idempotency_key)`

The AIX client must generate deterministic `idempotencyKey` values that do not include `runId`.

### Upload identity

Chunk upload identity must also be uploader-scoped.

The upload identity is:

- `(source, uploader_entity_id, upload_id)`

The AIX client must generate deterministic `uploadId` values that do not include `runId`.

## `agents.db` Schema Changes

This spec uses a hard cutover. Existing import metadata is not trustworthy enough to migrate into the new provenance model.

This feature must be rolled out against a clean archive ledger or a clean archive workspace.

### `session_imports`

Replace the current table with:

```sql
CREATE TABLE session_imports (
    source TEXT NOT NULL,
    source_provider TEXT NOT NULL,
    source_entity_id TEXT NOT NULL,
    source_contact_id TEXT,
    uploader_entity_id TEXT NOT NULL,
    uploader_device_id TEXT,
    target_workspace_id TEXT NOT NULL,
    source_session_id TEXT NOT NULL,
    source_session_fingerprint TEXT NOT NULL,
    session_key TEXT NOT NULL,
    imported_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_run_id TEXT,
    PRIMARY KEY (source, source_provider, source_entity_id, source_session_id),
    FOREIGN KEY (session_key) REFERENCES sessions(label)
);
```

Required indexes:

- `(session_key)`
- `(updated_at DESC)`
- `(source_entity_id, updated_at DESC)`
- `(uploader_entity_id, updated_at DESC)`
- `(target_workspace_id, updated_at DESC)`

### `session_import_requests`

Replace the current table with:

```sql
CREATE TABLE session_import_requests (
    source TEXT NOT NULL,
    uploader_entity_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    mode TEXT NOT NULL,
    run_id TEXT NOT NULL,
    request_hash TEXT,
    response_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (source, uploader_entity_id, idempotency_key)
);
```

### `session_import_uploads`

Add a new upload metadata table:

```sql
CREATE TABLE session_import_uploads (
    source TEXT NOT NULL,
    uploader_entity_id TEXT NOT NULL,
    upload_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    target_workspace_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    source_provider TEXT NOT NULL,
    source_entity_id TEXT NOT NULL,
    source_contact_id TEXT,
    uploader_device_id TEXT,
    source_session_id TEXT NOT NULL,
    source_session_fingerprint TEXT NOT NULL,
    payload_sha256 TEXT NOT NULL,
    encoding TEXT NOT NULL,
    chunk_total INTEGER NOT NULL,
    received_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    response_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER,
    expires_at INTEGER,
    PRIMARY KEY (source, uploader_entity_id, upload_id)
);
```

Required indexes:

- `(source, source_provider, source_entity_id, source_session_id)`
- `(status, updated_at DESC)`
- `(expires_at)`

### `session_import_chunk_parts`

Replace the current chunk table with:

```sql
CREATE TABLE session_import_chunk_parts (
    source TEXT NOT NULL,
    uploader_entity_id TEXT NOT NULL,
    upload_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (source, uploader_entity_id, upload_id, chunk_index)
);
```

Required indexes:

- `(source, uploader_entity_id, upload_id, chunk_index)`
- `(created_at DESC)`

### Cross-ledger note

`agents.db` cannot enforce SQL foreign keys into `identity.db`.

`source_entity_id`, `source_contact_id`, and `uploader_entity_id` are cross-ledger references and must be treated as application-level foreign keys.

## Import Service Rules

### Workspace safety

If an existing import row matches by `(source, source_provider, source_entity_id, source_session_id)` and the fingerprint is unchanged:

1. If `target_workspace_id` matches, return `skipped`.
2. If `target_workspace_id` differs, reject with `import_target_workspace_mismatch`.

The service must never silently rewrite `sessions.workspace_id` on a fingerprint-unchanged skip.

### Upsert behavior

If the fingerprint changes for the same import identity:

1. Reuse the deterministic session label.
2. Upsert the session contents.
3. Update `session_imports.source_session_fingerprint`.
4. Update `updated_at`.

### Contact resolution

If `sourceAccount` is present:

1. Normalize it.
2. Resolve or create a contact mapping in `identity.db`.
3. If the contact already resolves to a different entity than `source_entity_id`, reject with `source_account_entity_mismatch`.
4. Persist the resulting contact row id into `source_contact_id`.

### Device attribution

`uploader_device_id` should come from runtime connection context when available.

If the runtime cannot resolve a paired device id, it may persist `NULL` in v1.

## Upload Reliability

### Required behavior

Uploads must survive:

1. transient network loss
2. AIX process restart
3. machine sleep and resume
4. repeated retries of the same chunk

### Minimal required changes

1. Remove `runId` from request idempotency and upload identity.
2. Add local AIX upload journal state.
3. Add `agents.sessions.import.upload_status`.
4. Add chunk retry with exponential backoff.
5. Stop building the full chunk payload in memory on the client.
6. Stop reassembling the full chunk payload in memory on the server.
7. Eagerly delete staged chunk rows after successful finalize.

### Client journal

AIX must persist remote upload state locally in its own database.

Minimum tracked fields:

- remote target id
- source provider
- source session id
- source session fingerprint
- upload id
- idempotency key
- payload sha256
- chunk total
- acknowledged ranges
- completed at
- last error

The journal is the source of truth for resume after process restart.

### Resume flow

Resume algorithm:

1. Read local journal.
2. Call `agents.sessions.import.upload_status`.
3. Reconcile local acknowledged ranges with server ranges.
4. Re-send only missing chunks.
5. Finalize when all chunks are present.

### Client-side streaming

The client must serialize the single-session import payload to disk and stream gzip+base64 chunk generation from that file.

The client must not hold the full encoded payload in memory.

### Server-side streaming

The runtime must:

1. stage chunks in SQLite
2. assemble the encoded payload to a temp file
3. decode and parse from disk
4. import transactionally
5. delete staged chunks immediately on success

### Retry policy

Chunk sends and finalize calls must use bounded exponential backoff with jitter.

Do not expose retry tuning as end-user CLI flags in v1.

## AIX CLI Surface

The engineer-facing flow must be simplified. Existing low-level `--nex-*` flags are not acceptable as the primary offboarding UX.

### Required user-facing flow

1. Configure one remote archive target.
2. Sync local Cursor history into the local `aix` database.
3. Upload that history to the remote archive.
4. Resume automatically if interrupted.
5. Print a final report.

### Recommended commands

```bash
aix remote add offboarding \
  --url <runtime-ws-url> \
  --token <user-upload-token>

aix offboarding run \
  --remote offboarding \
  --source cursor
```

`aix offboarding run` performs:

1. local `aix sync --source cursor`
2. remote upload to `agents.sessions.import*`
3. retry and resume logic
4. final verification summary

`aix offboarding run` is a backfill-oriented command. It must not require the engineer to select `backfill` versus `tail`.

The engineer should not need to know `mode`, `persona`, chunk size, or transport internals.

## Engineer Prompt / Skill

The deliverable for engineers is a drop-in prompt or skill.

Expected prompt behavior:

1. Install AIX if missing.
2. Verify AIX can read local Cursor history.
3. Configure the provided remote archive target.
4. Run the offboarding upload.
5. Re-run until there are zero failed sessions.
6. Print a final report with:
   - imported count
   - upserted count
   - skipped count
   - failed count
   - failed session ids
   - total bytes uploaded

Example operator-provided prompt:

```text
Install and run AIX offboarding upload on this machine.

Use this remote target:
- URL: <runtime-ws-url>
- token: <user-upload-token>

Tasks:
1. Install AIX if it is not already installed.
2. Configure the remote target as "offboarding".
3. Sync local Cursor sessions into the local AIX database.
4. Upload all Cursor sessions to the remote target.
5. If the upload is interrupted, resume it.
6. At the end, print a report with imported, upserted, skipped, failed, failed session ids, and total uploaded bytes.

Do not upload any data except local Cursor session history.
```

## Admin Workflow

The minimal operator workflow is:

1. Create or verify an entity for each engineer.
2. Issue one upload token per engineer with scope `agents.sessions.import`.
3. Send the runtime URL, token, and prompt to the engineer.
4. Monitor import progress on the archive runtime.
5. Revoke tokens after the offboarding window closes.

## Monitoring and Verification

### AIX completion report

Every offboarding run must end with a machine-readable summary:

- remote target
- source
- imported
- upserted
- skipped
- failed
- resumed uploads
- bytes uploaded
- elapsed time

### Runtime-side verification

The runtime must support verifying archive completeness by engineer identity.

Minimum checks:

1. count imports by `source_entity_id`
2. count imports by `source_provider`
3. latest `updated_at` by `source_entity_id`
4. failed upload rows by `uploader_entity_id`

### Query requirement

`agents.sessions.list` should gain provenance filters in a follow-up change:

- `source`
- `sourceProvider`
- `sourceEntityId`
- `uploaderEntityId`

This is not required for the upload path itself, but it is required to make the shared archive operationally usable.

## Rollout

### Hard cutover plan

1. Rename AIX client methods to `agents.sessions.import*`.
2. Rename import helper `sourceEntityId` to `sourceScopedId`.
3. Replace import-related tables in `agents.db`.
4. Add uploader-scoped request cache and upload tables.
5. Add upload status RPC.
6. Add AIX local upload journal.
7. Add streaming encode/decode path.
8. Add upload scope enforcement.
9. Run against a clean archive runtime.
10. Perform a full AIX backfill from engineer devices.

### No backward compatibility

This cutover intentionally does not preserve:

1. old method names
2. old import metadata keys
3. old request idempotency semantics
4. old chunk upload identity

## Acceptance Criteria

1. Fifteen engineers can upload to one shared remote `agents.db` without cross-user import collisions.
2. Every imported session is attributable to one canonical `source_entity_id`.
3. Every upload is attributable to one canonical `uploader_entity_id`.
4. Re-running the same upload after interruption resumes without duplicating imported sessions.
5. Fingerprint-unchanged re-import never rewrites the session into a different workspace.
6. AIX upload does not require end-user tuning flags for payload size or retry behavior.
7. The engineer flow can be completed from a single prompt plus token package.

## Deferred Work

1. Frontdoor enrollment-token exchange flow
2. Dedicated admin UI for issuing AIX offboarding tokens
3. Rich archive browsing by provenance filters
4. Non-Cursor source packaging for the same offboarding UX
