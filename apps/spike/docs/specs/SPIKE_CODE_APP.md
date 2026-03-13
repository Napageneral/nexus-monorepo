# Spike Code App

## Overview

Spike is a Nex app that provides git mirror management, code intelligence, and worktree lifecycle management. When installed, it gives nex agents deep code understanding capabilities by automatically managing local mirrors of connected repositories and building rich code intelligence indexes over them.

Spike is infrastructure, not an autonomous agent. It has no agent, no broker, and no oracle of its own. It makes the nex runtime's own agents smarter by providing operations they can call as tools and by maintaining a continuously-updated local code intelligence database.

## Design Principles

**Spike reacts to records, not platform APIs.** When the git adapter emits `record.ingest` for commits or pull requests, the nex runtime persists them and emits `record.ingested`. Spike reacts through a daemon-owned event subscription bound to a Spike job definition. That job reads the canonical record, prefers a durable PR source archive when one exists, otherwise uses immutable Git commit replay, otherwise falls back to truthful source-branch replay, materializes a pinned worktree, and rebuilds code intelligence. Spike never calls the git adapter's API. The adapter and Spike are independent: the adapter talks to hosting platforms and emits records; Spike watches records and manages local infrastructure.

**Spike reuses Nex-managed connections and credentials.** For private
repositories, Spike does not own provider secrets and does not scrape
adapter-local or Nex state files. It reuses the shared git adapter
`connection_id` that produced the record, retrieves the credential bound to
that connection from Nex core, and uses that returned credential for
clone/fetch.

**Spike exposes nex operations as tools.** Any nex agent can call Spike's operations during normal conversation. An agent answering a question about code calls `code.search` and `code.symbols` without the user knowing Spike exists.

**No PRLM oracle, no broker.** Code understanding comes from the code intelligence service -- AST parsing, symbol extraction, full-text search, call graph edges -- exposed as agent tools. There is no hierarchical LLM oracle inside Spike.

**Single process, single database.** The engine binary serves HTTP, manages mirrors, runs code intelligence builds, and answers tool calls. All state lives in one SQLite database (WAL mode) plus the filesystem for mirrors and worktrees.

---

## Customer Experience

### Installation

A tenant installs Spike from the app marketplace. On activation, the engine service starts and creates its data directory. The database is initialized with default configuration. No repositories are connected yet.

### Connecting Repositories

Repositories enter Spike through two paths:

1. **Record-driven (automatic).** The tenant has a git adapter connected. When the adapter ingests commits or PRs, the runtime emits `record.ingested`. A daemon-owned event subscription queues the Spike reconcile job, which loads the canonical record, ensures a mirror for the repository, fetches latest, creates or reuses a pinned worktree, and triggers a code intelligence build. No user action required.

2. **Direct index creation (manual).** A user or agent calls `spike.indexes.create` with a git remote URL and optional ref. For private repositories, the caller also supplies the shared git `connection_id`. Spike clones the mirror, creates a pinned worktree, and builds the code intelligence index.

### Agent Interactions

Nex agents see Spike's operations as tools in their tool list. A typical conversation:

> **User:** What does the `ProcessOrder` function do and what calls it?
>
> **Agent (internal):** Calls `code.search` with query "ProcessOrder", gets hits. Calls `code.symbols` to find the definition. Calls `code.callers` to find call sites.
>
> **Agent:** The `ProcessOrder` function in `internal/orders/service.go` validates the cart, applies discounts, and creates a payment intent. It is called from `HandleCheckout` in `api/handlers/checkout.go` and from `ReplayOrder` in `internal/orders/replay.go`.

The user never mentions Spike. The agent transparently uses its tools to answer code questions.

### Software Factory

Spike's worktree management combined with nex agents and the job system enables autonomous development workflows. An agent creates a worktree at a specific commit, makes changes, runs tests, and creates a pull request via the git adapter's delivery mechanism. The full development loop is composed from independent pieces: Spike provides the worktree, the agent provides the intelligence, and the git adapter provides the platform interaction.

---

## App Manifest

```typescript
interface AppManifest {
  id: "spike";
  version: "1.0.0";
  displayName: "Spike";
  description: "AI-powered code intelligence and repository analysis";
  icon: "./assets/icon.svg";

  services: [
    {
      id: "engine";
      command: "./bin/spike-engine";
      args: ["serve", "--port", "{{port}}"];
      healthCheck: "/health";
    }
  ];

  hooks: {
    onInstall: "./hooks/install.ts";
    onActivate: "./hooks/activate.ts";
    onDeactivate: "./hooks/deactivate.ts";
    onUpgrade: "./hooks/upgrade.ts";
    onUninstall: "./hooks/uninstall.ts";
  };

  requires: {
    nex: ">=0.10.0";
    adapters: [{ id: "nexus-adapter-git", version: "^1.0.0" }];
  };
}
```

Spike does not need to own app-facing git connection setup choices unless it
chooses to surface that UI itself. The canonical requirement is that Spike
declares dependency on the shared git package when private connection-backed
reconcile behavior is part of the product.

## Durable Work Runtime Integration

Spike does not declare event reactions in `app.nexus.json`.

The canonical automatic rebuild path is:

1. Spike lifecycle code ensures a job definition named `spike.record_ingested_reconcile`.
2. Spike lifecycle code ensures a durable event subscription on `record.ingested`.
3. The daemon matches `record.ingested` against active `events.subscriptions.*` bindings.
4. The daemon enqueues a `job_run` and `job_queue` entry for the Spike reconcile job.
5. The Spike job reads the canonical record via `records.get`.
6. The Spike job resolves the producing git `connection_id` from the canonical
   record and retrieves the credential bound to that connection from Nex when
   needed.
7. The Spike job composes existing Spike operations:
   - `spike.mirrors.ensure`
   - `spike.worktrees.create`
   - `spike.code.build`

The subscription match envelope is minimal:

```json
{
  "platform": "git"
}
```

The job itself is responsible for filtering out record types that do not require
rebuild work, such as PR comments.

### Git Record Contract Required By Spike

For the record-driven path to remain platform-independent, Spike requires the
canonical git record to include a clone locator in record metadata:

```typescript
type GitRecordMetadata = {
  entity_type: "commit" | "pull_request" | "pr_comment";
  remote_url: string;
  refs?: string[];
  head_commit_sha?: string;
  source_branch?: string;
  target_branch?: string;
};
```

Spike resolves the worktree target from record metadata:

- commit records prefer `refs[0]`, then `thread_id`
- pull request records prefer durable `source_archive` attachments, then `head_commit_sha`, then `source_branch`
- pull request records do not use `target_branch` as a rebuild fallback
- PR comment records do not trigger code rebuilds

Spike resolves private clone/fetch authority from the record's producing shared
git `connection_id`. The record remains secret-free.

### Operations Summary

Spike registers operations under the `spike.*` namespace. Every operation is callable as a nex tool by any agent.

| Namespace | Operations |
|-----------|-----------|
| `mirrors` | `ensure`, `refresh`, `list`, `status` |
| `worktrees` | `create`, `list`, `destroy` |
| `code` | `build`, `status`, `search`, `symbols`, `references`, `callers`, `callees`, `imports`, `importers`, `context`, `tests.impact`, `source.file`, `source.chunk` |
| `repositories` | `list`, `get` |
| `repo-refs` | `list`, `get` |
| `indexes` | `create`, `list`, `get`, `delete`, `status` |
| `jobs` | `list`, `get` |
| `github.installations` | `list`, `get` |
| `config` | `defaults`, `get`, `update` |
| `connectors.github` | `bind`, `get`, `install.start`, `install.callback`, `repos`, `branches`, `commits`, `remove`, `setup` |

---

## Mirror Management

Spike maintains bare git mirrors on the local filesystem. Mirrors are the single source of truth for repository content; all worktrees and code intelligence indexes derive from them.

### Mirror Layout

```
{dataDir}/git/mirrors/
  {host}/{owner}/{repo}.git/
```

Example:

```
git/mirrors/
  github.com/acme/api.git/
  github.com/acme/frontend.git/
  bitbucket.org/fmcom/player-api.git/
```

For remote URLs that cannot be decomposed into host/owner/repo (local paths, unusual schemes), Spike falls back to a SHA1-based path:

```
git/mirrors/local/{sha1-of-normalized-url}.git/
```

### Mirror Identity

Each mirror has a deterministic ID derived from its remote URL:

```typescript
function mirrorId(remoteUrl: string): string {
  return sha256(remoteUrl).slice(0, 16); // first 8 bytes, hex-encoded
}
```

### Mirror Lifecycle

**Ensure.** `mirrors.ensure` accepts a remote URL. If no mirror exists, it runs `git clone --mirror`. If a mirror already exists, it runs `git fetch --prune --tags origin`. The operation is idempotent.

**Refresh.** `mirrors.refresh` fetches an existing mirror to latest. Equivalent to the fetch step of ensure.

**Automatic refresh.** When the daemon queues Spike's `record.ingested` reconcile job for a git record, that job reads `record.metadata.remote_url` and calls ensure on the repository remote URL. This keeps mirrors current without polling.

### Mirror Database Record

```typescript
interface Mirror {
  mirror_id: string;       // deterministic from remote_url
  remote_url: string;
  mirror_path: string;     // absolute filesystem path
  status: "pending" | "cloning" | "ready" | "error";
  last_fetched: number | null; // unix timestamp
  last_error: string;
  size_bytes: number;
  ref_count: number;       // worktrees referencing this mirror
  created_at: number;
  updated_at: number;
}
```

### Operations

#### `spike.mirrors.list`

Returns all mirrors.

```json
{
  "ok": true,
  "items": [
    {
      "mirror_id": "a1b2c3d4e5f6a7b8",
      "remote_url": "https://github.com/acme/api.git",
      "mirror_path": "/data/git/mirrors/github.com/acme/api.git",
      "status": "ready",
      "last_fetched": 1710000000,
      "size_bytes": 52428800,
      "ref_count": 2
    }
  ]
}
```

#### `spike.mirrors.ensure`

```typescript
interface MirrorsEnsureParams {
  remote_url: string;
  connection_id?: string; // required for manual private remote access
}

interface MirrorsEnsureResult {
  mirror_id: string;
  mirror_path: string;
  created: boolean; // true if this was a fresh clone
}
```

#### `spike.mirrors.refresh`

```typescript
interface MirrorsRefreshParams {
  mirror_id: string;
  connection_id?: string; // optional explicit auth source for private remotes
}
```

#### `spike.mirrors.status`

```typescript
interface MirrorsStatusParams {
  mirror_id: string;
}

interface MirrorsStatusResult {
  mirror_id: string;
  status: string;
  last_fetched: number | null;
  last_error: string;
  size_bytes: number;
  ref_count: number;
}
```

---

## Worktree Management

Spike manages pinned, detached worktrees materialized from mirrors at specific commits. Worktrees give agents and code intelligence a concrete filesystem tree to operate on.

### Worktree Layout

```
{dataDir}/git/worktrees/
  {repo_id}/{commit_sha}/
```

Each worktree is checked out at exactly one commit in detached HEAD state. The same commit for the same repository always produces the same worktree path, making the operation idempotent.

### Reference Counting

Mirrors track how many worktrees reference them via `ref_count`. When a worktree is created, the mirror's ref_count increments. When destroyed, it decrements. This prevents premature mirror cleanup.

### Worktree Database Record

```typescript
interface Worktree {
  worktree_id: string;
  repo_id: string;
  ref_name: string;
  commit_sha: string;
  worktree_path: string;   // absolute filesystem path
  status: "pending" | "ready" | "error";
  size_bytes: number;
  last_accessed: number;   // unix timestamp
  created_at: number;
}
```

### Operations

#### `spike.worktrees.create`

Creates a pinned worktree at a specific commit. If a worktree for that repo+commit already exists, returns the existing one.

```typescript
interface WorktreesCreateParams {
  repo_id: string;
  mirror_path: string;
  commit_sha: string;
}

interface WorktreesCreateResult {
  worktree_id: string;
  worktree_path: string;
  created: boolean;
}
```

Under the hood, this calls `git worktree add --detach {path} {commit}` against the bare mirror.

#### `spike.worktrees.list`

Returns all worktrees, ordered by last accessed time descending.

```json
{
  "ok": true,
  "items": [
    {
      "worktree_id": "wt-abc123",
      "repo_id": "acme-api",
      "commit_sha": "a1b2c3d4e5f6...",
      "worktree_path": "/data/git/worktrees/acme-api/a1b2c3d4e5f6...",
      "status": "ready",
      "last_accessed": 1710000000
    }
  ]
}
```

#### `spike.worktrees.destroy`

Removes a worktree from disk and decrements the mirror's ref_count.

```typescript
interface WorktreesDestroyParams {
  worktree_id: string;
}
```

---

## Code Intelligence

The code intelligence service parses source files, extracts semantic structure, and builds a queryable index. It operates on worktrees (concrete filesystem trees at a specific commit) and stores all results in the shared SQLite database.

### Build Pipeline

When `code.build` is called on a worktree:

1. Resolve a deterministic `snapshot_id`.
2. Reuse the existing ready snapshot when one already exists.
3. Otherwise one durable builder acquires the snapshot lease and marks the snapshot `building`.
4. Walk the file tree, respecting `.gitignore` and `.spikeignore` patterns.
5. Classify each file by language and type (source, test, config, binary, etc.).
6. For parse-eligible files, run the language-specific AST parser.
7. Extract semantic chunks (functions, methods, classes, type declarations).
8. Extract symbols with qualified names.
9. Extract imports and build the import graph.
10. Extract call graph edges (caller/callee relationships).
11. Resolve symbol references across files.
12. Publish all snapshot rows atomically into the database.
13. Build the FTS5 full-text search index (maintained automatically via triggers).

### Language Support

Go is fully implemented with AST parsing via `go/parser`. The architecture is extensible -- each language implements the same analysis pipeline:

- **Semantic chunking:** Split files into meaningful chunks (functions, methods, type declarations).
- **Symbol extraction:** Extract named symbols with qualified names (e.g., `pkg.TypeName.MethodName`).
- **Import tracking:** Record all imports with their paths and kinds.
- **Reference detection:** Find where symbols are used (identifier references, type assertions, etc.).
- **Call graph edges:** Record which functions call which other functions, with line numbers.

### Snapshot Model

A code intelligence snapshot represents one complete analysis of a repository at a specific commit.

```typescript
interface CodeSnapshot {
  snapshot_id: string;     // deterministic from root_path + repo + commit
  repo_id: string;
  commit_sha: string;
  root_path: string;       // worktree filesystem path
  status: "pending" | "building" | "ready" | "failed";
  index_version: number;   // schema version for index compatibility
  file_count: number;
  chunk_count: number;
  symbol_count: number;
  last_error: string;
  created_at: number;
  updated_at: number;
}
```

### File Record

```typescript
interface CodeFile {
  snapshot_id: string;
  file_path: string;       // repo-relative, forward-slash separated
  language: string;        // "go", "typescript", "python", etc.
  classification: string;  // "source", "test", "config", "docs", "binary", "unknown"
  size_bytes: number;
  tokens: number;          // Anthropic tokenizer count
  hash: string;            // SHA-256 of file content
  parse_status: "skipped" | "partial" | "parsed";
  chunk_count: number;
  symbol_count: number;
}
```

### Chunk Record

Chunks are the fundamental unit of semantic code understanding. Each chunk represents a contiguous, meaningful piece of code -- a function, a method, a type declaration, or a file-level section.

```typescript
interface CodeChunk {
  snapshot_id: string;
  chunk_id: string;        // deterministic from snapshot + file + kind + name + line
  file_path: string;
  language: string;
  kind: string;            // "function", "method", "type", "interface", "file", "const", "var"
  name: string;            // e.g., "ProcessOrder", "UserService.Create"
  start_line: number;
  end_line: number;
  content: string;         // full source text of the chunk
  context_json: string;    // JSON metadata (enclosing type, receiver, etc.)
}
```

Chunks are indexed with FTS5 for full-text search across `content`, `name`, and `file_path` columns.

### Symbol Record

```typescript
interface CodeSymbol {
  snapshot_id: string;
  symbol_id: string;       // deterministic from snapshot + qualified_name
  name: string;            // short name, e.g., "ProcessOrder"
  qualified_name: string;  // fully qualified, e.g., "orders.ProcessOrder"
  kind: string;            // "function", "method", "type", "interface", "const", "var"
  language: string;
  file_path: string;
  start_line: number;
  end_line: number;
  chunk_id: string;        // the chunk containing this symbol's definition
}
```

### Import Record

```typescript
interface CodeImport {
  snapshot_id: string;
  file_path: string;       // the file doing the importing
  language: string;
  import_path: string;     // what is imported, e.g., "net/http" or "./utils"
  import_kind: string;     // "import", "side_effect", "type_only"
}
```

### Reference Record

```typescript
interface CodeReference {
  snapshot_id: string;
  symbol_id: string;       // resolved symbol ID (if resolvable)
  symbol_name: string;     // the referenced name
  qualified_name: string;  // resolved qualified name (if resolvable)
  language: string;
  file_path: string;
  chunk_id: string;
  start_line: number;
  end_line: number;
  reference_kind: string;  // "identifier", "type_assertion", "composite_lit", "selector"
}
```

### Call Record

```typescript
interface CodeCall {
  snapshot_id: string;
  language: string;
  caller_symbol_id: string;
  caller_name: string;
  caller_qualified_name: string;
  caller_file_path: string;
  caller_chunk_id: string;
  callee_symbol_id: string;
  callee_name: string;
  callee_qualified_name: string;
  line: number;
  call_kind: string;       // "call", "defer", "go"
}
```

### Capability Record

Each snapshot advertises which code intelligence capabilities are available per language.

```typescript
interface CodeCapability {
  snapshot_id: string;
  language: string;
  capability: string;      // "ast_parsing", "semantic_chunks", "symbol_extraction",
                           // "import_tracking", "reference_resolution", "call_graph", "fts_search"
  status: string;          // "supported", "partial", "unsupported"
  backend: string;         // e.g., "go/parser", "tree-sitter"
  details_json: string;
}
```

### Context Pack

A context pack is an assembled bundle of related code intelligence data, designed to give an agent everything it needs to understand a piece of code in one request.

```typescript
interface ContextPack {
  query: string;
  anchor_chunks: CodeChunk[];      // primary chunks matching the query
  anchor_symbols: CodeSymbol[];    // primary symbols matching the query
  supporting_chunks: CodeChunk[];  // chunks referenced by or calling into anchors
  supporting_files: string[];      // file paths for broader context
  imports: CodeImport[];           // imports of anchor files
  references: CodeReference[];     // references to anchor symbols
  callers: CodeCall[];             // functions calling anchor symbols
  callees: CodeCall[];             // functions called by anchor symbols
  tests: TestImpactRecord[];       // test files affected by anchor changes
  search_hits: SearchHit[];        // FTS search results
  limitations: string[];           // what the pack could not resolve
}
```

### Test Impact Analysis

Given a set of changed symbols or files, Spike identifies test files that are likely affected.

```typescript
interface TestImpactRecord {
  file_path: string;
  language: string;
  match_kind: string;      // "direct_import", "transitive_import", "symbol_reference", "file_proximity"
  match_terms: string[];
  rationale: string;
}
```

### Operations

#### `spike.code.build`

Builds a code intelligence snapshot from a worktree.

```typescript
interface CodeBuildParams {
  snapshot_id?: string;  // optional; derived if not provided
  root_path: string;     // worktree filesystem path
}

interface CodeBuildResult {
  snapshot: CodeSnapshot;
  languages: Record<string, number>;  // language -> file count
  capabilities: CodeCapability[];
}
```

#### `spike.code.status`

Returns the status of a code intelligence snapshot.

```typescript
interface CodeStatusParams {
  snapshot_id: string;
}
```

#### `spike.code.search`

Full-text search across code chunks. Uses FTS5 for ranked results.

```typescript
interface CodeSearchParams {
  snapshot_id: string;
  query: string;
  limit?: number;  // default 20
}

interface CodeSearchResult {
  query: string;
  hits: SearchHit[];
}

interface SearchHit {
  chunk_id: string;
  file_path: string;
  language: string;
  classification: string;
  kind: string;
  name: string;
  start_line: number;
  end_line: number;
  score: number;
  snippet: string;
}
```

#### `spike.code.symbols`

Resolve symbols by name or qualified name.

```typescript
interface CodeSymbolsParams {
  snapshot_id: string;
  query: string;       // symbol name or qualified name
  language?: string;
  limit?: number;
}
```

Returns matching `CodeSymbol[]`.

#### `spike.code.references`

Find all references to a symbol.

```typescript
interface CodeReferencesParams {
  snapshot_id: string;
  symbol_name: string;
  language?: string;
  limit?: number;
}
```

Returns matching `CodeReference[]`.

#### `spike.code.callers`

Find all call sites that invoke a given function or method.

```typescript
interface CodeCallersParams {
  snapshot_id: string;
  callee_name: string;
  language?: string;
  limit?: number;
}
```

Returns matching `CodeCall[]`.

#### `spike.code.callees`

Find all functions called from within a given function or chunk.

```typescript
interface CodeCalleesParams {
  snapshot_id: string;
  caller_symbol_id?: string;
  caller_chunk_id?: string;
  limit?: number;
}
```

Returns matching `CodeCall[]`.

#### `spike.code.imports`

List imports for a given file.

```typescript
interface CodeImportsParams {
  snapshot_id: string;
  file_path: string;
}
```

Returns matching `CodeImport[]`.

#### `spike.code.importers`

Find all files that import a given path.

```typescript
interface CodeImportersParams {
  snapshot_id: string;
  import_path: string;
}
```

Returns matching `CodeImport[]`.

#### `spike.code.context`

Assemble a context pack -- a comprehensive bundle of code intelligence around a query, symbol, path, or line.

```typescript
interface CodeContextParams {
  snapshot_id: string;
  query?: string;
  symbol_query?: string;
  target_id?: string;      // chunk_id or symbol_id
  path?: string;
  line?: number;
  limit?: number;
}
```

Returns a `ContextPack`.

#### `spike.code.tests.impact`

Given a snapshot and a set of changes, return test files likely affected.

```typescript
interface CodeTestsImpactParams {
  snapshot_id: string;
  changed_files?: string[];
  changed_symbols?: string[];
}
```

Returns `TestImpactRecord[]`.

#### `spike.code.source.file`

Read a file's metadata and optionally its full source content.

```typescript
interface CodeSourceFileParams {
  snapshot_id: string;
  file_path: string;
  include_source?: boolean;
}
```

Returns a `FileView` (file metadata plus optional source text).

#### `spike.code.source.chunk`

Read a specific chunk's full content with surrounding context.

```typescript
interface CodeSourceChunkParams {
  snapshot_id: string;
  chunk_id?: string;
  file_path?: string;
  line?: number;
}
```

Returns a `ChunkContext` with the anchor chunk and its previous/next neighbors.

---

## Repository and Ref Tracking

Spike maintains a registry of repositories and their refs (branches, tags). This is the control plane's view of what repositories exist and what their latest known state is.

### Repository Record

```typescript
interface Repository {
  repo_id: string;        // typically derived from remote URL
  remote_url: string;
  created_at: number;     // unix milliseconds
  updated_at: number;
}
```

### Ref Record

```typescript
interface RepoRef {
  repo_id: string;
  ref_name: string;       // e.g., "refs/heads/main", "refs/tags/v1.0.0"
  commit_sha: string;
  updated_at: number;
}
```

### Operations

#### `spike.repositories.list`

```typescript
interface RepositoriesListParams {
  repo_id?: string;
  limit?: number;  // default 50
}
```

#### `spike.repositories.get`

```typescript
interface RepositoriesGetParams {
  repo_id: string;
}
```

#### `spike.repo-refs.list`

```typescript
interface RepoRefsListParams {
  repo_id?: string;
  ref_name?: string;
  commit_sha?: string;
  limit?: number;  // default 50
}
```

#### `spike.repo-refs.get`

```typescript
interface RepoRefsGetParams {
  repo_id: string;
  ref_name: string;
}
```

---

## Storage Model

### Database

A single SQLite file at `{dataDir}/spike.db` stores all Spike state. Pragmas applied at open:

- `journal_mode=WAL` -- write-ahead logging for concurrent read access
- `busy_timeout=5000` -- wait up to 5 seconds on lock contention
- `foreign_keys=ON` -- enforce referential integrity
- `max_open_conns=1` -- single writer to avoid SQLITE_BUSY under load

### Tables

| Table | Purpose |
|-------|---------|
| `schema_version` | Tracks applied schema version |
| `agent_configs` | Tuning parameters for indexing and queries |
| `github_installations` | GitHub App installation records |
| `git_mirrors` | Mirror metadata and status |
| `repositories` | Repository registry (remote URLs, provider detection) |
| `repo_refs` | Ref tracking (branches, tags with commit SHAs) |
| `tree_versions` | Immutable tree snapshots at specific commits |
| `github_connector_bindings` | GitHub connector bindings per tree |
| `worktrees` | Worktree metadata and status |
| `jobs` | Control plane job queue |
| `webhook_deliveries` | Webhook delivery deduplication |
| `code_snapshots` | Code intelligence snapshot metadata |
| `code_files` | File-level metadata per snapshot |
| `code_chunks` | Semantic chunks with full source |
| `code_chunks_fts` | FTS5 virtual table for chunk search |
| `code_symbols` | Symbol definitions with qualified names |
| `code_imports` | Import graph edges |
| `code_capabilities` | Per-language capability declarations |
| `code_references` | Symbol reference locations |
| `code_calls` | Call graph edges |

### Filesystem

```
{dataDir}/
  spike.db                          # all state
  git/
    mirrors/                        # bare git mirrors
      {host}/{owner}/{repo}.git/
    worktrees/                      # pinned detached worktrees
      {repo_id}/{commit_sha}/
  scratch/                          # temporary working space
```

---

## GitHub Integration

### GitHub App Installation

Spike supports GitHub App installations for automated repository discovery and webhook delivery. Installations are managed through the connector system.

```typescript
interface GitHubInstallation {
  installation_id: number;
  account_login: string;
  account_type: string;       // "Organization" | "User"
  app_slug: string;
  permissions_json: string;   // JSON of granted permissions
  suspended: boolean;
  metadata_json: string;
  created_at: number;
  updated_at: number;
}
```

### Connector Bindings

A connector binding links a tree (index) to a GitHub account and installation. This enables Spike to discover repos accessible to the installation and use installation tokens for authenticated cloning.

```typescript
interface GitHubConnectorBinding {
  tree_id: string;
  service: string;            // "github"
  account: string;            // GitHub account login
  auth_id: string;            // "custom" or installation-based
  metadata_json: string;
  updated_at: number;
}
```

### Installation Flow

1. User calls `spike.connectors.github.install.start` with a tree ID.
2. Spike returns a GitHub App installation URL.
3. User completes the GitHub App installation flow in their browser.
4. GitHub redirects back with an installation ID and code.
5. `spike.connectors.github.install.callback` processes the callback, stores the installation, and binds it to the tree.
6. `spike.connectors.github.repos` lists repositories accessible through the installation.

### Operations

#### `spike.github.installations.list`

Returns all stored GitHub App installations.

#### `spike.github.installations.get`

```typescript
interface GitHubInstallationsGetParams {
  installation_id: number;
}
```

#### `spike.connectors.github.bind`

```typescript
interface ConnectorsGitHubBindParams {
  tree_id: string;
  service: string;
  account: string;
  auth_id?: string;
  metadata?: Record<string, unknown>;
}
```

#### `spike.connectors.github.repos`

Lists repositories accessible to the bound connector.

```typescript
interface ConnectorsGitHubReposParams {
  tree_id: string;
}
```

#### `spike.connectors.github.branches`

Lists branches for a specific repository via the connector.

```typescript
interface ConnectorsGitHubBranchesParams {
  tree_id: string;
  repo_id: string;
}
```

---

## Webhook Handling

### Routing

Webhooks are routed to Spike via tenant subdomain:

```
https://t-{tenantId}.nexushub.sh/app/spike/webhooks/github
```

The nex runtime proxies this to the engine service's `/webhooks/github` endpoint.

### Signature Verification

GitHub webhooks are verified using HMAC-SHA256. The engine checks the `X-Hub-Signature-256` header against the configured webhook secret (`SPIKE_GITHUB_WEBHOOK_SECRET`). Requests with invalid or missing signatures are rejected with 401.

### Delivery Deduplication

Every GitHub webhook includes an `X-GitHub-Delivery` header with a unique delivery ID. Spike records deliveries in the `webhook_deliveries` table:

```typescript
interface WebhookDelivery {
  delivery_id: string;     // GitHub's X-GitHub-Delivery header
  event: string;           // e.g., "push", "pull_request"
  tree_id: string;
  payload_hash: string;    // SHA-256 of the payload body
  status: "received" | "processing" | "completed" | "failed";
  job_ids_json: string;    // JSON array of job IDs spawned
  error: string;
  created_at: number;
  updated_at: number;
}
```

If a delivery ID has already been processed, Spike returns the existing result without re-processing. This handles GitHub's retry behavior gracefully.

### Push Event Handling

When a `push` event arrives:

1. Verify signature.
2. Check delivery deduplication.
3. Identify the repository and ref from the payload.
4. Ensure the mirror exists and is up to date.
5. Update the repo ref to the new head commit.
6. Create a job to rebuild code intelligence if an index exists for this repo.
7. Record the delivery as completed.

---

## Code Snapshots

Code snapshots combine mirrors, worktrees, and code intelligence into one coherent unit. A snapshot represents a fully-analyzed state of a repository at a specific ref.

### Snapshot Lifecycle

1. Mirror is refreshed (triggered by `record.ingested` or manual `mirrors.refresh`)
2. A worktree is materialized at the target commit
3. The code intelligence service scans and indexes the worktree
4. The snapshot is marked ready and agents can query it

Snapshots are rebuilt incrementally when new commits arrive. The code intelligence service detects changed files and updates only the affected chunks, symbols, and graph edges.

```typescript
interface IndexesStatusParams {
  index_id: string;
}
```

---

## Job System

Spike's control plane uses a job queue for long-running operations (mirror sync, index builds, hydration).

### Job Record

```typescript
interface Job {
  id: string;                  // "job-{uuid}"
  tree_id: string;
  job_type: string;            // "sync", "hydrate", "build", "webhook_push"
  status: "queued" | "running" | "completed" | "failed";
  request_json: string;
  result_json: string;
  error: string;
  created_at: number;          // unix milliseconds
  started_at: number | null;
  completed_at: number | null;
}
```

### Operations

#### `spike.jobs.list`

```typescript
interface JobsListParams {
  tree_id?: string;
  status?: string;
  limit?: number;  // default 50
}
```

#### `spike.jobs.get`

```typescript
interface JobsGetParams {
  job_id: string;
}
```

---

## Configuration

### Agent Configuration

Agent configs control indexing behavior. A `default` config is seeded on first run.

```typescript
interface AgentConfig {
  config_id: string;
  display_name: string;
  capacity: number;        // root node token capacity threshold (default: 120000)
  max_children: number;    // max children per tree split (default: 12)
  max_parallel: number;    // max parallel child operations (default: 4)
  hydrate_model: string;   // LLM model for hydration (empty = system default)
  ask_model: string;       // LLM model for ask operations (empty = system default)
  created_at: number;
  updated_at: number;
}
```

### Engine Configuration

The engine service accepts configuration through environment variables and CLI flags:

| Variable | Flag | Default | Purpose |
|----------|------|---------|---------|
| `NEX_APP_DATA_DIR` | `--storage-root` | `./data/` | Root directory for all Spike data |
| `NEX_SERVICE_PORT` | `--port` | `7422` | HTTP listen port |
| `SPIKE_AUTH_TOKEN` | `--auth-token` | empty | Bearer token for API access |
| `SPIKE_GITHUB_WEBHOOK_SECRET` | `--github-webhook-secret` | empty | GitHub webhook HMAC secret |
| `SPIKE_GITHUB_APP_SLUG` | `--github-app-slug` | empty | GitHub App slug for install flow |
| `SPIKE_GITHUB_APP_ID` | `--github-app-id` | empty | GitHub App numeric ID |
| `SPIKE_GITHUB_APP_PRIVATE_KEY` | `--github-app-private-key` | empty | GitHub App private key PEM |
| `SPIKE_GITHUB_API_BASE_URL` | `--github-api-base-url` | `https://api.github.com` | GitHub API base URL |
| `SPIKE_RATE_LIMIT_RPS` | `--rate-limit-rps` | `30` | Per-client rate limit |
| `SPIKE_RATE_LIMIT_BURST` | `--rate-limit-burst` | `60` | Per-client burst capacity |
| `SPIKE_ALLOW_UNAUTH_STATUS` | `--allow-unauth-status` | `true` | Allow unauthenticated health checks |

### Operations

#### `spike.config.defaults`

Returns the default agent configuration.

#### `spike.config.get`

```typescript
interface ConfigGetParams {
  config_id?: string;  // default: "default"
}
```

#### `spike.config.update`

```typescript
interface ConfigUpdateParams {
  config_id: string;
  capacity?: number;
  max_children?: number;
  max_parallel?: number;
  display_name?: string;
}
```

---

## Software Factory Vision

The combination of Spike's capabilities with the nex runtime's agent system creates a software factory: a set of composable primitives that enable autonomous development workflows.

### The Loop

1. **Trigger.** A `record.ingested` event arrives for a new PR or a scheduled job fires.
2. **Mirror.** Spike ensures the repository mirror is current.
3. **Worktree.** An agent calls `worktrees.create` to get a writable checkout at the target commit.
4. **Understand.** The agent calls `code.search`, `code.symbols`, `code.callers` to understand the relevant code.
5. **Modify.** The agent makes changes in the worktree.
6. **Test.** The agent runs the test suite. `code.tests.impact` identifies which tests are relevant.
7. **Deliver.** The agent creates a PR via the git adapter's `delivery.send` operation.
8. **Clean up.** The agent calls `worktrees.destroy` when done.

Each step uses independent infrastructure. Spike provides steps 2-4 and 6. The nex agent provides steps 1, 5, 7, and 8. The git adapter provides the platform integration for step 7. No single system owns the entire loop.

### Job DAGs

The job system supports dependent job chains. A webhook push event can spawn a mirror refresh job, which on completion spawns a code intelligence build job, which on completion spawns a test impact analysis job. Each job is independent and restartable. Failures in one job do not corrupt the others.

### Multi-Repository

Spike manages mirrors and indexes for multiple repositories simultaneously. An agent working on a monorepo issue that touches a shared library can query code intelligence across both the application repo and the library repo in the same conversation.
