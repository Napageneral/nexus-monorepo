# IAM Tool Approvals (Exec Approval Manager Replacement)

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-13  
**Related:** GRANTS.md, POLICIES.md, AUDIT.md, ../nex/CONTROL_PLANE.md

---

## Purpose

Replace the legacy exec approval system (in-memory queue + file allowlist + WS RPC) with the IAM approval primitives:

- `acl_permission_requests` = canonical pending approval queue
- `acl_grants` = canonical standing approvals (time-bounded or permanent)
- audit log = canonical history of approvals and resulting access

This makes approvals uniform across *all* sensitive actions, not just `exec`.

---

## Implementation Status

**As of 2026-02-13 (in `nex`):**

- **Parity implemented:** `exec.approval.request` / `exec.approval.resolve` persist to `acl_permission_requests` and “allow always” creates `acl_grants`.
- **Exec tool integrated:** the `exec` tool consults IAM grants (`exec:<path>`) to satisfy allowlist checks and suppress future prompts.
- **Strictly-better implemented:**
  - Structured fields on `acl_permission_requests` (kind, tool/tool call/session/request IDs, summary, context JSON).
  - Generic approvals RPC: `acl.approval.request` and `acl.requests.*` (list/show/approve/deny).
  - Control-plane UI inbox for pending approvals (approve once/day/forever, deny).
  - Control-plane broadcast events: `acl.approval.requested` / `acl.approval.resolved`.

**Remaining to be strictly better than legacy:**

- Optional: provide a one-time import of any existing `exec-approvals.json` allowlist entries into IAM grants (or delete/ignore the legacy file).

---

## Current (Legacy) Exec Approval System

In `nex`, exec approvals are currently implemented as:

- In-memory pending approval queue:
  - `src/gateway/exec-approval-manager.ts`
- WS RPC methods:
  - `exec.approval.request` (blocks until resolved or timeout)
  - `exec.approval.resolve` (allow-once | allow-always | deny)
- File-backed allowlist for "allow always":
  - `~/nexus/state/exec-approvals.json`
  - per-agent allowlist entries keyed by `agentId`

Strengths:

- Fast request/resolve loop
- "Allow once / allow always / deny"
- Supports per-agent allowlist
- Optional forwarding to messaging surfaces

Weaknesses:

- Not IAM (separate authz plane)
- Not uniformly audited with other ACL decisions
- File-based allowlist is hard to manage, sync, and expose in UI
- Only covers `exec` (other tools need their own bespoke approval systems)

---

## Target: IAM-Native Tool Approvals

### Core Rules

1. **No tool execution bypasses IAM**
   - Tool invocation must either be authorized by policy/grant *or* blocked pending explicit approval.

2. **Approvals are stored and auditable**
   - Every approval request and resolution is persisted.

3. **Standing approvals are grants**
   - "Allow always" creates a grant.
   - "Allow for 24h" creates a grant with `expires_at`.
   - "Allow once" approves the request with **no grant**.

4. **Exec allowlists become grants**
   - The old file allowlist is replaced by grants (no `exec-approvals.json` in the production path).

---

## Resource Model (Exec)

Exec has two layers:

1. Tool permission (coarse):
   - resource: `exec` (existing policy/tool name)
   - controls whether the agent can *attempt* exec at all

2. Command approval (fine, optional):
   - resources represent command/binary allowlist entries
   - recommended resource form:
     - `exec:<absolute_path_or_glob>`
     - examples:
       - `exec:/usr/bin/git`
       - `exec:/opt/homebrew/bin/*`
       - `exec:~/bin/**`

Behavior:

- If a matching exec grant exists for the agent (or session scope), exec runs without prompting.
- Otherwise, an approval request is created and must be approved/denied.

---

## Runtime Flow

### 1) Request

When the agent wants to execute a command and approval is required:

- Create (or reuse idempotently) an `acl_permission_requests` row:
  - `id` is stable per tool call/attempt
  - `requester_id` = `agentId` (or derived from `sessionKey`)
  - `resources` = derived from resolved executable paths (e.g. `exec:/usr/bin/git`)
  - `expires_at` = short (e.g. 120s) for interactive exec approvals
  - include a structured JSON blob in `original_message` describing:
    - tool name (`exec`)
    - command, cwd, host (gateway/node), sessionKey
    - resolved paths used for allowlist resources

- Notify owner:
  - Control-plane UI via WS push
  - Optional forwarding to a configured messaging surface

### 2) Resolve

Owner resolves a request:

- `allow once`:
  - mark request `approved`, no grant created
- `allow always`:
  - mark request `approved`
  - create an `acl_grants` row for the requester agent with `resources` copied from the request
- `deny`:
  - mark request `denied`

### 3) Wait/Resume

The tool caller waits for resolution:

- if approved: proceed with tool execution
- if denied/expired: fail closed and surface an explicit denial

---

## Why This Is Strictly Better Than Legacy

- Unified approvals for *all* tools/actions (not bespoke systems per tool)
- Durable approvals and standing grants in one DB (easy to query/export/UI)
- Full audit trail
- Works for local and remote nodes (all approvals happen in the control-plane)
- Allows richer scoping (time-bound grants, session/channel scoping, future constraints)

---

## Implementation Checklist

### Parity (Must-Have)

- Implement `exec.approval.request` / `exec.approval.resolve` on top of IAM:
  - request creates `acl_permission_requests`
  - resolve updates request + optionally creates `acl_grants`
  - request blocks waiting for request resolution (timeout -> null decision)
- Add grant-based allowlist short-circuit:
  - if `exec:<path>` grant matches requested command, `exec.approval.request` returns immediately (no new request)
- Ensure audit captures:
  - request created
  - request resolved
  - grant created/used (where applicable)

### Strictly Better (Near-Term Enhancements)

- Add structured fields to permission requests (optional, but recommended):
  - `tool_name`, `tool_call_id`, `context_json`
  - avoid stuffing JSON into `original_message`
- First-class UI surface:
  - list pending approvals
  - approve once/day/forever
  - show diff for tool execution context (cwd, resolved binaries, host)
- Event bus coverage:
  - publish `permission.requested` and `permission.resolved`
  - publish `acl.grant.requested` / `acl.grant.resolved` when grants are created from approvals
- Generic "tool approvals" API:
  - not `exec`-specific; can be used by email send, credential access, etc.
- Safe default policies:
  - owner-only exec on host
  - unknown/known principals denied exec by default

---

## Acceptance Criteria

This spec is implemented when:

- Exec approvals no longer depend on an in-memory approval queue.
- "Allow always" results in an IAM grant (not a file allowlist entry) and suppresses future prompts.
- Approvals are queryable via `nexus acl requests ...` and grants via `nexus acl grants ...`.
- Audit logs exist for approvals and grant usage.
