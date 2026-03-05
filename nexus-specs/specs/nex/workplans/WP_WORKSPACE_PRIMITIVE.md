# Workplan: Workspace Primitive Implementation

**Status:** READY FOR EXECUTION
**Created:** 2026-03-04
**Spec References:**
- [WORKSPACE_PRIMITIVE.md](../WORKSPACE_PRIMITIVE.md)
- [API_DESIGN_BATCH_4.md](../API_DESIGN_BATCH_4.md)

**Dependencies:** None (foundational, but WP4 depends on this for workspace_id column)

---

## Goal

Implement the unified Workspace primitive: a registered, managed directory on disk with a manifest that maps files to context injection behavior. Workspaces replace agent config roots, automation workspaces, and the persona concept. The manifest determines what files get loaded into agent context and how (system_prompt vs turn_message injection).

**Hard cutover. No backwards compatibility.**

---

## Current State

### Three Separate Concepts

1. **Agent config root:** `state/agents/{name}/` contains SOUL.md, IDENTITY.md, etc. Files loaded into context, but no formal manifest
2. **Automation workspace:** `state/workspace/{name}/` for meeseeks with ROLE.md, SKILLS.md, PATTERNS.md, ERRORS.md
3. **Persona:** Logical identity binding via `persona_id` on sessions/threads — resolves through multiple layers to get to files

### Current Schema Limitations

- No `workspaces` table — workspaces are just directories
- `agents` table has no workspace binding
- `automations` table has `workspace_dir` (raw path string, not FK)
- `sessions` table has `persona_id` (conceptually will become `workspace_id`)
- `threads` table has `persona_id` (conceptually will become `workspace_id`)
- `turns` table has `workspace_path` (this is the CWD for tool execution, different from Workspace primitive)

### File Operations

Currently `agents.files.*` operations exist but are agent-scoped. Need to generalize to workspace-scoped.

---

## Target State

### New Database Table

```sql
CREATE TABLE workspaces (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    path          TEXT NOT NULL,
    manifest_json TEXT,
    created_at    INTEGER NOT NULL
);

CREATE INDEX idx_workspaces_name ON workspaces(name);
```

Deliberately minimal:
- No `kind` field — manifest determines behavior
- No `owner_type`/`owner_id` — relationships point TO workspaces
- No `updated_at` — workspace registration is stable, file changes are filesystem state

### Manifest System

JSON mapping filenames to injection behavior:

```json
{
  "SOUL.md": { "inject": "system_prompt", "required": true },
  "IDENTITY.md": { "inject": "system_prompt", "required": true },
  "ROLE.md": { "inject": "turn_message", "required": false },
  "SKILLS.md": { "inject": "turn_message", "required": false },
  "PATTERNS.md": { "inject": "turn_message", "required": false },
  "ERRORS.md": { "inject": "turn_message", "required": false }
}
```

**Injection levels:**
- `system_prompt` — Concatenated into system prompt once, cached across turns (stable identity)
- `turn_message` — Loaded fresh each turn (evolving knowledge, meeseeks self-improvement)

**Common templates** (sugar for creation, not stored):
- `agent_default`: SOUL.md + IDENTITY.md at system_prompt
- `automation_default`: ROLE.md + SKILLS.md + PATTERNS.md + ERRORS.md at turn_message

### Foreign Key Relationships

**agents table:** Add `workspace_id TEXT REFERENCES workspaces(id)`

**automations table:** Change `workspace_dir TEXT` to `workspace_id TEXT REFERENCES workspaces(id)`

**sessions table:** `persona_id` becomes `workspace_id TEXT REFERENCES workspaces(id)` (done in WP4)

**threads table:** `persona_id` becomes `workspace_id TEXT REFERENCES workspaces(id)` (done in WP4)

### 10 Operations

Domain: `workspaces.*`

| Operation | Verb | Description |
|-----------|------|-------------|
| `workspaces.list` | read | List workspaces (filter by name pattern) |
| `workspaces.get` | read | Get workspace metadata + manifest |
| `workspaces.create` | write | Create workspace (path, optional template name) |
| `workspaces.delete` | write | Delete workspace registration (does not delete files on disk) |
| `workspaces.manifest.get` | read | Get the manifest for a workspace |
| `workspaces.manifest.update` | write | Update the manifest (add/remove/modify file entries) |
| `workspaces.files.list` | read | List files in the workspace directory |
| `workspaces.files.get` | read | Read a file from the workspace |
| `workspaces.files.set` | write | Write/update a file in the workspace |
| `workspaces.files.delete` | write | Delete a file from the workspace |

---

## Changes Required

### Database Schema

**File:** `src/db/nexus.ts`

Add to `NEXUS_SCHEMA_SQL` constant:

```sql
CREATE TABLE IF NOT EXISTS workspaces (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    path          TEXT NOT NULL,
    manifest_json TEXT,
    created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspaces_name ON workspaces(name);
```

Add TypeScript interfaces:

```typescript
export interface WorkspaceRow {
  id: string;
  name: string;
  path: string;
  manifest_json: string | null;
  created_at: number;
}

export interface CreateWorkspaceInput {
  id: string;
  name: string;
  path: string;
  manifest_json?: string | null;
  created_at: number;
}

export interface UpdateWorkspaceInput {
  name?: string;
  path?: string;
  manifest_json?: string | null;
}

export interface WorkspaceManifest {
  [filename: string]: {
    inject: 'system_prompt' | 'turn_message';
    required: boolean;
  };
}
```

**File:** `src/db/agents.ts` (or wherever agents table schema lives)

Add `workspace_id` column to agents table:

```sql
ALTER TABLE agents ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
```

Update `AgentRow` interface to include `workspace_id?: string | null`.

**File:** `src/db/hooks.ts` (or wherever automations table schema lives)

Change `workspace_dir` to `workspace_id`:

```sql
-- Migration:
-- 1. Add new column
ALTER TABLE automations ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
-- 2. Migrate data (resolve workspace_dir paths to workspace IDs)
-- 3. Drop old column
ALTER TABLE automations DROP COLUMN workspace_dir;
```

Update `HookRow` interface: remove `workspace_dir`, add `workspace_id?: string | null`.

### New Code

**File:** `src/db/workspaces.ts` (new file)

Create workspace database operations:

```typescript
import type { DatabaseSync } from "./ledgers.js";
import type { WorkspaceRow, CreateWorkspaceInput, UpdateWorkspaceInput } from "./nexus.js";

export function listWorkspaces(
  db: DatabaseSync,
  filters?: { namePattern?: string }
): WorkspaceRow[] {
  // SELECT with optional LIKE filter on name
}

export function getWorkspace(
  db: DatabaseSync,
  id: string
): WorkspaceRow | null {
  // SELECT by id
}

export function createWorkspace(
  db: DatabaseSync,
  input: CreateWorkspaceInput
): void {
  // INSERT INTO workspaces
}

export function updateWorkspace(
  db: DatabaseSync,
  id: string,
  updates: UpdateWorkspaceInput
): void {
  // UPDATE workspaces SET ... WHERE id = ?
}

export function deleteWorkspace(
  db: DatabaseSync,
  id: string
): void {
  // DELETE FROM workspaces WHERE id = ?
}

export function getWorkspaceManifest(
  db: DatabaseSync,
  id: string
): WorkspaceManifest | null {
  // Parse manifest_json from workspace row
}

export function updateWorkspaceManifest(
  db: DatabaseSync,
  id: string,
  manifest: WorkspaceManifest
): void {
  // UPDATE workspaces SET manifest_json = ? WHERE id = ?
}
```

**File:** `src/workspaces/manifest-templates.ts` (new file)

Define common manifest templates:

```typescript
import type { WorkspaceManifest } from "../db/nexus.js";

export const MANIFEST_TEMPLATES: Record<string, WorkspaceManifest> = {
  agent_default: {
    "SOUL.md": { inject: "system_prompt", required: true },
    "IDENTITY.md": { inject: "system_prompt", required: true },
  },
  automation_default: {
    "ROLE.md": { inject: "turn_message", required: true },
    "SKILLS.md": { inject: "turn_message", required: false },
    "PATTERNS.md": { inject: "turn_message", required: false },
    "ERRORS.md": { inject: "turn_message", required: false },
  },
};

export function getManifestTemplate(name: string): WorkspaceManifest | null {
  return MANIFEST_TEMPLATES[name] ?? null;
}
```

**File:** `src/workspaces/file-operations.ts` (new file)

Workspace file system operations:

```typescript
import fs from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "../db/ledgers.js";
import { getWorkspace } from "../db/workspaces.js";

export async function listWorkspaceFiles(
  db: DatabaseSync,
  workspaceId: string
): Promise<string[]> {
  const workspace = getWorkspace(db, workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const entries = await fs.readdir(workspace.path, { withFileTypes: true });
  return entries
    .filter(e => e.isFile())
    .map(e => e.name)
    .sort();
}

export async function getWorkspaceFile(
  db: DatabaseSync,
  workspaceId: string,
  filename: string
): Promise<string> {
  const workspace = getWorkspace(db, workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const filePath = path.join(workspace.path, filename);
  return await fs.readFile(filePath, "utf-8");
}

export async function setWorkspaceFile(
  db: DatabaseSync,
  workspaceId: string,
  filename: string,
  content: string
): Promise<void> {
  const workspace = getWorkspace(db, workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const filePath = path.join(workspace.path, filename);
  await fs.mkdir(workspace.path, { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

export async function deleteWorkspaceFile(
  db: DatabaseSync,
  workspaceId: string,
  filename: string
): Promise<void> {
  const workspace = getWorkspace(db, workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const filePath = path.join(workspace.path, filename);
  await fs.unlink(filePath);
}
```

**File:** `src/workspaces/context-loader.ts` (new file)

Manifest-driven context injection runtime:

```typescript
import type { DatabaseSync } from "../db/ledgers.js";
import { getWorkspace, getWorkspaceManifest } from "../db/workspaces.js";
import { getWorkspaceFile } from "./file-operations.js";

export interface LoadedWorkspaceContext {
  systemPromptFiles: Array<{ filename: string; content: string }>;
  turnMessageFiles: Array<{ filename: string; content: string }>;
}

export async function loadWorkspaceContext(
  db: DatabaseSync,
  workspaceId: string
): Promise<LoadedWorkspaceContext> {
  const workspace = getWorkspace(db, workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const manifest = getWorkspaceManifest(db, workspaceId);
  if (!manifest) {
    return { systemPromptFiles: [], turnMessageFiles: [] };
  }

  const systemPromptFiles: Array<{ filename: string; content: string }> = [];
  const turnMessageFiles: Array<{ filename: string; content: string }> = [];

  for (const [filename, config] of Object.entries(manifest)) {
    try {
      const content = await getWorkspaceFile(db, workspaceId, filename);

      if (config.inject === "system_prompt") {
        systemPromptFiles.push({ filename, content });
      } else if (config.inject === "turn_message") {
        turnMessageFiles.push({ filename, content });
      }
    } catch (err) {
      if (config.required) {
        throw new Error(`Required file ${filename} missing from workspace ${workspace.name}`);
      }
      // Optional file missing — skip silently
    }
  }

  return { systemPromptFiles, turnMessageFiles };
}

export function assembleSystemPrompt(
  systemPromptFiles: Array<{ filename: string; content: string }>
): string {
  return systemPromptFiles
    .map(f => `# ${f.filename}\n\n${f.content}`)
    .join("\n\n---\n\n");
}

export function assembleTurnMessage(
  turnMessageFiles: Array<{ filename: string; content: string }>
): string {
  return turnMessageFiles
    .map(f => `# ${f.filename}\n\n${f.content}`)
    .join("\n\n---\n\n");
}
```

**File:** `src/nex/control-plane/server-methods/workspaces.ts` (new file)

RPC operation handlers for workspace domain:

```typescript
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "../../../db/ledgers.js";
import {
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getWorkspaceManifest,
  updateWorkspaceManifest,
} from "../../../db/workspaces.js";
import {
  listWorkspaceFiles,
  getWorkspaceFile,
  setWorkspaceFile,
  deleteWorkspaceFile,
} from "../../../workspaces/file-operations.js";
import { getManifestTemplate } from "../../../workspaces/manifest-templates.js";

export async function handleWorkspacesList(
  db: DatabaseSync,
  params: { namePattern?: string }
) {
  const workspaces = listWorkspaces(db, params);
  return { workspaces };
}

export async function handleWorkspacesGet(
  db: DatabaseSync,
  params: { id: string }
) {
  const workspace = getWorkspace(db, params.id);
  if (!workspace) throw new Error(`Workspace ${params.id} not found`);

  const manifest = getWorkspaceManifest(db, params.id);
  return { workspace, manifest };
}

export async function handleWorkspacesCreate(
  db: DatabaseSync,
  params: {
    name: string;
    path: string;
    template?: string;
  }
) {
  const id = `workspace-${randomUUID()}`;
  const now = Date.now();

  let manifestJson: string | null = null;
  if (params.template) {
    const template = getManifestTemplate(params.template);
    if (template) {
      manifestJson = JSON.stringify(template);
    }
  }

  createWorkspace(db, {
    id,
    name: params.name,
    path: params.path,
    manifest_json: manifestJson,
    created_at: now,
  });

  return { workspace_id: id };
}

export async function handleWorkspacesDelete(
  db: DatabaseSync,
  params: { id: string }
) {
  deleteWorkspace(db, params.id);
  return { deleted: true };
}

export async function handleWorkspacesManifestGet(
  db: DatabaseSync,
  params: { id: string }
) {
  const manifest = getWorkspaceManifest(db, params.id);
  return { manifest };
}

export async function handleWorkspacesManifestUpdate(
  db: DatabaseSync,
  params: {
    id: string;
    manifest: Record<string, { inject: string; required: boolean }>;
  }
) {
  updateWorkspaceManifest(db, params.id, params.manifest);
  return { updated: true };
}

export async function handleWorkspacesFilesList(
  db: DatabaseSync,
  params: { id: string }
) {
  const files = await listWorkspaceFiles(db, params.id);
  return { files };
}

export async function handleWorkspacesFilesGet(
  db: DatabaseSync,
  params: { id: string; filename: string }
) {
  const content = await getWorkspaceFile(db, params.id, params.filename);
  return { filename: params.filename, content };
}

export async function handleWorkspacesFilesSet(
  db: DatabaseSync,
  params: { id: string; filename: string; content: string }
) {
  await setWorkspaceFile(db, params.id, params.filename, params.content);
  return { written: true };
}

export async function handleWorkspacesFilesDelete(
  db: DatabaseSync,
  params: { id: string; filename: string }
) {
  await deleteWorkspaceFile(db, params.id, params.filename);
  return { deleted: true };
}
```

### Modified Files

**File:** `src/nex/control-plane/server-methods/agents.ts`

1. **Remove `agents.files.*` operations** — these move to `workspaces.files.*`
2. **Update `agents.create`** to create a workspace and set `workspace_id` on the agent
3. **Update `agents.update`** to support changing `workspace_id` binding
4. **Update `agents.delete`** to optionally delete the bound workspace

**File:** `src/agents/broker.ts` (or wherever agent context assembly happens)

1. **Replace persona resolution** with workspace context loading
2. **Call `loadWorkspaceContext()`** when building agent context
3. **Inject system_prompt files** into cached system prompt (concatenated)
4. **Inject turn_message files** into turn-level context (fresh each turn)

Example:

```typescript
import { loadWorkspaceContext, assembleSystemPrompt, assembleTurnMessage } from "../workspaces/context-loader.js";

// During context assembly:
const session = getSession(db, sessionKey);
if (session.workspace_id) {
  const context = await loadWorkspaceContext(db, session.workspace_id);

  // System prompt injection (cached)
  const workspaceSystemPrompt = assembleSystemPrompt(context.systemPromptFiles);
  systemPrompt = `${baseSystemPrompt}\n\n${workspaceSystemPrompt}`;

  // Turn message injection (fresh each turn)
  const workspaceTurnContext = assembleTurnMessage(context.turnMessageFiles);
  if (workspaceTurnContext) {
    messages.push({
      role: "system",
      content: workspaceTurnContext,
    });
  }
}
```

**File:** `src/nex/automations/seeder.ts`

1. **Update bundled automation seeding** to create workspaces for memory-reader, memory-writer, memory-consolidator
2. **Set `workspace_id` instead of `workspace_dir`** on automation rows
3. **Create workspace directories** with appropriate manifest templates

Example changes:

```typescript
// Old:
insertHook(db, {
  workspace_dir: path.join(stateDir, "workspace", "memory-reader"),
  // ...
});

// New:
const workspaceId = `workspace-memory-reader`;
createWorkspace(nexusDb, {
  id: workspaceId,
  name: "memory-reader",
  path: path.join(stateDir, "workspace", "memory-reader"),
  manifest_json: JSON.stringify(MANIFEST_TEMPLATES.automation_default),
  created_at: Date.now(),
});
insertHook(db, {
  workspace_id: workspaceId,
  // ...
});
```

**File:** `src/nex/automations/hooks-runtime.ts`

1. **Replace `workspace_dir` path resolution** with `workspace_id` lookup
2. **Load workspace context** via `loadWorkspaceContext()` when building automation context
3. **Inject files per manifest** into meeseeks prompt

**File:** `src/nex/control-plane/server.ts` (or operation registry)

1. **Register 10 new `workspaces.*` operations**
2. **Wire handlers** from `src/nex/control-plane/server-methods/workspaces.ts`

**File:** `src/config/paths.ts` (or wherever workspace paths are resolved)

1. **Add `resolveWorkspacePath(workspaceId: string)`** helper that looks up workspace row and returns `path` field
2. **Remove hardcoded workspace path logic** — paths come from DB now

### Deleted Files/Code

**File:** `src/nex/control-plane/server-methods/agents.ts`

Remove:
- `agents.files.list`
- `agents.files.get`
- `agents.files.set`
- `agents.files.delete`

These operations move to `workspaces.files.*` domain.

**Code patterns to remove:**
- Any code that resolves `persona_id` → `persona_ref` → `persona_path` chains (collapsed to `workspace_id` → `workspaces.path`)
- Hardcoded workspace directory paths like `state/agents/{name}` or `state/workspace/{name}` — paths now come from DB

### Operations to Register

Domain: `workspaces.*`

1. `workspaces.list`
2. `workspaces.get`
3. `workspaces.create`
4. `workspaces.delete`
5. `workspaces.manifest.get`
6. `workspaces.manifest.update`
7. `workspaces.files.list`
8. `workspaces.files.get`
9. `workspaces.files.set`
10. `workspaces.files.delete`

---

## Execution Order

### Phase 1: Schema and Core Infrastructure

**Atomic — must be done together:**

1. **Add `workspaces` table to nexus.db schema** — Update `src/db/nexus.ts` with CREATE TABLE
2. **Add `workspace_id` to agents table** — Add column (nullable initially for migration)
3. **Migrate automations table** — Add `workspace_id` column, migrate data from `workspace_dir`, drop old column
4. **Create workspace DB operations** — New file `src/db/workspaces.ts` with CRUD functions
5. **Create manifest templates** — New file `src/workspaces/manifest-templates.ts`
6. **Create file operations** — New file `src/workspaces/file-operations.ts`
7. **Create context loader** — New file `src/workspaces/context-loader.ts`

At this point, workspaces exist as a primitive but aren't yet used by the runtime.

### Phase 2: Bootstrap and Seeding

**Create workspaces for existing agents/automations:**

8. **Update automation seeder** — Modify `src/nex/automations/seeder.ts` to create workspaces for bundled automations
9. **Create migration script** — One-time script to:
   - Scan existing agent directories in `state/agents/{name}`
   - Create workspace rows for each
   - Update agents table to set `workspace_id`
   - Scan existing automation workspace directories in `state/workspace/{name}`
   - Create workspace rows and update automations table
10. **Run migration** — Populate workspaces table from existing filesystem state

### Phase 3: Context Assembly Integration

**Wire workspace context loading into agent/automation runtime:**

11. **Update agent broker** — Modify `src/agents/broker.ts` to call `loadWorkspaceContext()` and inject files per manifest
12. **Update automation runtime** — Modify `src/nex/automations/hooks-runtime.ts` to load workspace context for meeseeks
13. **Update meeseeks self-improvement** — Ensure SKILLS.md writes go to workspace files and reload correctly

### Phase 4: API Operations

**Expose workspace operations to external callers:**

14. **Create workspace operation handlers** — New file `src/nex/control-plane/server-methods/workspaces.ts`
15. **Register operations** — Wire handlers into control plane operation registry
16. **Remove `agents.files.*` operations** — Delete from `src/nex/control-plane/server-methods/agents.ts`
17. **Update `agents.create`** — Create workspace when creating agent, set `workspace_id`
18. **Update `agents.delete`** — Optionally delete workspace when deleting agent

### Phase 5: Path Resolution Cleanup

**Remove hardcoded paths and persona chains:**

19. **Add `resolveWorkspacePath()` helper** — Update `src/config/paths.ts`
20. **Remove persona resolution chains** — Delete code that does `persona_id` → `persona_ref` → `persona_path`
21. **Update workspace path references** — Replace hardcoded paths with DB lookups

### Phase 6: Tests

**Verify workspace system end-to-end:**

22. **Unit tests for DB operations** — `src/db/workspaces.test.ts`
23. **Unit tests for context loader** — `src/workspaces/context-loader.test.ts`
24. **Integration test for workspace creation** — Verify create → load → inject flow
25. **Integration test for meeseeks self-improvement** — Verify SKILLS.md update → reload
26. **Operation handler tests** — Verify all 10 `workspaces.*` operations work correctly
27. **Migration verification** — Test that existing agents/automations work with new workspace system

---

## Critical Path Notes

- **Phase 1 is foundational** — schema and core operations must exist before anything else
- **Phase 2 (migration) is data integrity critical** — must correctly map existing filesystem state to DB rows
- **Phase 3 is the behavioral change** — this is where agents/automations start using workspaces
- **Phase 4 exposes the API** — external callers can now manage workspaces
- **Phase 5 is cleanup** — removes legacy patterns
- **Sessions/threads persona_id → workspace_id migration happens in WP4** (Session Routing Unification)

---

## Risk Mitigation

1. **Data migration safety:** Run migration on staging first, verify all existing agents/automations have correct workspace mappings
2. **Manifest validation:** Schema-validate manifests on write to prevent invalid injection configs
3. **Required file enforcement:** Warn or error if required=true file is missing when loading context
4. **Backward compatibility:** Keep old `agents.files.*` operations working temporarily during transition (deprecated, proxied to `workspaces.files.*`)
5. **Workspace deletion safety:** Don't auto-delete workspace when last agent/automation is removed — require explicit delete operation
6. **Path security:** Validate workspace paths to prevent directory traversal attacks in file operations
