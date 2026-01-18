# Nexus Flows

This doc captures the most important flows across the four repos. Each flow
links the local CLI, the hub, and (where relevant) cloud sync and collab.

## End‑User Flows

### 1) Workspace Bootstrap + Agent Binding
1. User opens the workspace in Cursor.
2. sessionStart hook runs `nexus status --json` and injects identity + memory.
3. If identity is missing, CLI returns bootstrap prompt and next steps.
4. Agent is ready to help with consistent context.

### 2) Skill Discovery → Usage
1. Agent runs `nexus status` or `nexus skill list`.
2. Agent picks a skill and runs `nexus skill use <name>`.
3. Agent reads SKILL.md and runs the tool directly.
4. CLI records usage metadata and capability readiness.

### 3) Credentials → Verification
1. Agent or user stores credentials using `nexus credential add`.
2. Verify with `nexus credential verify <service>`.
3. CLI reports readiness status in `nexus status`.

### 4) Cloud Sync (Personal)
1. User logs in to cloud, CLI provisions local keys.
2. Daemon runs continuously and syncs encrypted data.
3. User can push/pull explicitly for large changes.

### 5) Shared Spaces (Collab)
1. User creates a space in the hub.
2. Members accept invite and mount locally.
3. Realtime presence is handled by collab, data encrypted by cloud engine.

## Internal / Launch Flows

### A) Max‑Power Dogfood Setup
1. Create a dedicated agent identity and account.
2. Configure broker + primary comms channel (WhatsApp/Telegram/Email).
3. Connect critical services (Gmail, Calendar, Drive, Notion, GitHub, etc).
4. Validate agent can receive and respond across channels.

### B) Core Skills QA Pass
1. Review each core skill: metadata, accuracy, setup steps, examples.
2. Verify required bins/env/config, add `metadata.nexus.type`.
3. Add tests or quick verification commands where possible.
4. Mark broken skills and capture fix tasks.

### C) Publish to Hub + Audit
1. Tag skills with capabilities and dependencies.
2. Upload skill bundles to the hub.
3. Run security/audit pipeline and fix violations.
4. Confirm taxonomy mapping + search filters.

### D) Capability Taxonomy Sync
1. Define taxonomy versioning in `nexus-website`.
2. Publish snapshots for CLI consumption.
3. CLI validates snapshot and exposes it via `nexus capabilities`.

### E) Agent Bindings + Telemetry
1. Ensure Cursor hooks are stable and deterministic.
2. Align `nexus status` output with agent expectations.
3. Improve usage tracking and “ready/needs‑setup” logic.
