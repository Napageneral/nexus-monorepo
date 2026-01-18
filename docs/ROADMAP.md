# Dogfood → Launch Roadmap

This roadmap encodes the current high‑level priorities while we dogfood the
system and prepare for launch.

## Phase 1 — Max‑Power Dogfood

- Establish a dedicated agent identity + account.
- Configure broker + primary comms channel.
- Connect core services (email, calendar, files, notes).
- Verify end‑to‑end messaging and response flow.

## Phase 2 — Core Skills Quality Pass

- Audit all core skills in `nexus-cli/skills`.
- Add missing metadata (`type`, `provides`, `requires`).
- Validate install/verify instructions.
- Fix or flag broken skills.

## Phase 3 — Hub Publishing + Audits

- Upload curated skills to hub with capabilities.
- Run security audit pipeline and fix violations.
- Confirm taxonomy mappings and search filters.

## Phase 4 — Capability Taxonomy Sync

- Finalize taxonomy ownership in `nexus-website`.
- Publish snapshots and consume in CLI.
- Add validation + diff tooling.

## Phase 5 — Agent Bindings + Telemetry

- Harden Cursor hooks and bindings.
- Align `nexus status` with agent expectations.
- Improve readiness/usage insights and suggestions.
