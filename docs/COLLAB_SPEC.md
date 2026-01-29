# Nexus Collab Spec (v0)

This spec captures the desired UX and system behavior for Nexus Collab: always-on realtime collaboration for text files with durable sync for everything else.

## Principles

- Zero friction: users never start/stop collab manually.
- Single mental model: a collab space includes realtime + durable sync.
- End-to-end encryption: keys stay local, server never sees plaintext.
- Human-first: spaces have readable names, not UUIDs.

## Terms

- Workspace: personal `~/nexus/home`, always syncing in background.
- Space: shared collab workspace with a human name and internal `spaceId`.
- Realtime collab: `.md` and `.txt` files, character-level diffs.
- Durable sync: all other file types (chunked, background).

## CLI Surface (Top-Level)

`nexus collab` lives at the top level inside `nexus-cli`.

Core commands:

- `nexus collab create "<name>" --invite <email|phone>`
- `nexus collab invite <space> --email <email>`
- `nexus collab invite-link <space>`
- `nexus collab list`
- `nexus collab open <space>`
- `nexus collab leave <space>`
- `nexus collab status`

Spaces are referenced by name or slug, never raw UUIDs.

## Login Flow

Single entrypoint:

- `nexus login`
  - OAuth browser flow
  - prompt for encryption password (once per device)
  - workspace sync enabled
  - collab keys provisioned
  - collab daemon started

Result: skills hub + workspace sync + collab available immediately.

## Default Mounting

- Collab spaces auto-mount under:
  - `~/nexus/home/spaces/<space-slug>`
- Creator’s space mounts immediately on creation.
- Invitees auto-mount after accepting invites.
- If invite accepted on phone, collab daemon mounts when machine is online.

## Invite Flow

Two paths:

A) Email invite
- `nexus collab create "<name>" --invite alice@...`
- CLI creates space and sends invite via website
- Space auto-mounts for creator

B) Invite link
- `nexus collab create "<name>"`
- `nexus collab invite-link <space>`
- Invitee accepts in browser
- Collab daemon auto-mounts on next sync/wake

## Always-On Collab Daemon

A background service manages collab with no user action:

- Poll for new spaces and accepted invites
- Auto-mount new spaces
- Start realtime sessions for all mounted spaces
- Restart sessions after sleep/wake or network drops

## Realtime Sync (Text)

Scope:
- `.md` and `.txt` only

Mechanism:
- Yjs CRDT per file
- Character-level diffs (diff-match-patch or equivalent)
- Y.Text represents file contents

Behavior:
- Local edit -> diff -> apply to Yjs -> encrypted update -> PartyKit
- Remote update -> decrypt -> apply to Yjs -> write to disk

## Durable Sync (Non-Text)

- All other file types use durable sync only
- No realtime CRDT for binary or non-text files
- Durable sync runs via background jobs

## Offline Behavior

Text files (.md/.txt):
- CRDT merges offline edits
- On reconnect, client sends full state to converge

Non-text files:
- Durable sync conflict policy
- Keep both versions on conflict:
  - `file.conflict.<device>.<timestamp>`

## Multi-Session Support

- One collab session per space
- Sessions managed concurrently by daemon
- Session metadata stored per space:
  - `~/.nexus-rs/state/cloud/collab-sessions/<spaceId>.json`

Commands:
- `nexus collab stop <space>`
- `nexus collab stop --all`

## Security and Keys

- Encryption password never leaves device
- Collab identity keys generated on login
- Space keys decrypted locally
- Server stores encrypted blobs only

## UX Output Patterns

Examples:

```
✅ Created collab space “Project X”
📁 Mounted at ~/nexus/home/spaces/project-x
✉️ Invite sent to alice@example.com
```

```
Project X   (mounted)   ~/nexus/home/spaces/project-x   ✅ realtime
Idea Lab    (mounted)   ~/nexus/home/spaces/idea-lab    ✅ realtime
```

## Testing (High-Level)

- Realtime E2E: two clients, `.md` edits, convergence
- Invite flow: create -> accept -> auto-mount on daemon wake
- Offline: `.md` edits offline -> reconnect -> merge
- Binary: add image -> sync via durable channel

---

This spec is the implementation target for Nexus Collab v0.
