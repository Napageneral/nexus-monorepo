# Spike Old Repo Retirement Audit

**Status:** COMPLETED
**Last Updated:** 2026-03-06

---

## Purpose

This workplan determines whether the old Spike repository at:

- `home/projects/spike/`

can be safely retired as a live workspace while preserving anything not already
faithfully captured in the active Spike app tree at:

- `home/projects/nexus/apps/spike/`

The target operator experience is:

1. one active Spike source root
2. no misleading duplicate repo in `home/projects/`
3. historical Spike material preserved in an explicit archive snapshot, not as a
   second live development root

---

## Research Summary

### Active Spike app status

The active Spike app now lives under:

- `home/projects/nexus/apps/spike/`

This tree contains the active app package, service, docs, workplans, and
validation ladder.

### Old Spike repo status

The old repo at `home/projects/spike/` is not purely redundant.

Key findings:

1. `go.mod` and `go.sum` match the active service module
2. old `internal/` and active `service/internal/` share 74 file paths, but 21
   of those shared files differ in content
3. old `cmd/` is structurally different from the active `service/cmd/` layout
4. old docs contain 30 files not present in `apps/spike/docs/`
5. old root-level files such as `README.md`, `SKILL.md`, `Makefile`, and
   `scripts/oracle-server-setup.sh` are not reproduced in the active app tree

Unique old-doc material includes:

- PRLM theory docs such as `docs/PRLM.md`, `docs/PRLM-runtime.md`,
  `docs/PRLM-oracle-kernel.md`, and related companions
- older Spike architecture/spec docs such as `docs/specs/SPEC-broker-port.md`,
  `docs/specs/SPEC-github-adapter-ontology.md`, and
  `docs/specs/SPEC-nexus-convergence.md`

This means `home/projects/spike/` is not safe to delete without first
preserving it as an archive snapshot.

---

## Decision

The correct hard-cutover path is:

1. do not keep `home/projects/spike/` as a live development root
2. do not pretend `apps/spike/` is already a byte-faithful replacement for
   every historical artifact in the old repo
3. create a sealed archive snapshot of the old repo
4. retire the live `home/projects/spike/` folder via Trash after the snapshot
   exists

---

## Execution Plan

### Phase 1: Create Archive Snapshot

Archive the entire old repo as a retirement snapshot.

Requirements:

1. snapshot contains the full old `home/projects/spike/` tree as it exists at
   retirement time
2. snapshot lives outside the active Spike app tree
3. snapshot path is recorded in this workplan

Status:

- completed on 2026-03-06
- snapshot: `home/archive/2026/spike-legacy-repo-2026-03-06.tar.gz`
- checksum: `home/archive/2026/spike-legacy-repo-2026-03-06.tar.gz.sha256`

### Phase 2: Retire Live Old Repo

After the archive snapshot is created:

1. move `home/projects/spike/` to Trash
2. do not leave a second live Spike root in `home/projects/`

Status:

- completed on 2026-03-06
- live `home/projects/spike/` moved to Trash

### Phase 3: Resume Active Spike Work

After retirement:

1. treat `home/projects/nexus/apps/spike/` as the only live Spike source root
2. return to Spike code/spec gap closure from the active workplans

Status:

- active next step is Spike code/spec gap closure from `apps/spike`

---

## Validation

This workplan is complete only when:

1. a retirement snapshot of `home/projects/spike/` exists
2. the live `home/projects/spike/` path is gone from the workspace
3. the active Spike doc tree records the retirement decision
4. future Spike work proceeds only from `home/projects/nexus/apps/spike/`
