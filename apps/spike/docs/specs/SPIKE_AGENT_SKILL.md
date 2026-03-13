---
summary: "Canonical agent-facing Spike skill scope and behavior."
title: "Spike Agent Skill"
---

# Spike Agent Skill

## Purpose

This document defines the canonical agent-facing skill for Spike.

The skill exists to help agents use Spike as the code intelligence layer on top
of Nex records, git adapter connections, mirrors, worktrees, and snapshots
without regressing into ad hoc Git or filesystem behavior.

## Customer Experience

The intended operator and agent experience is:

1. connect git once in Nex
2. let the git adapter ingest records
3. let Spike automatically reconcile mirrors, worktrees, and snapshots
4. let agents query code through Spike instead of reconstructing repo state by
   hand

When an agent needs to work with code that is already known to Nex, the agent
should reach for Spike first.

## Non-Negotiable Rules

The skill must enforce these rules:

1. apps and agents use `connection_id`, not raw provider secrets
2. Nex remains the gatekeeper for credentials and connection state
3. Spike is preferred over local Git surgery when the repo is already known
4. PR replay precedence is:
   - `source_archive`
   - exact immutable `head_commit_sha`
   - best-effort `source_branch`
5. PR comment records are intentionally skipped by automatic reconcile
6. repeated replay of the same snapshot must be treated as safe and idempotent

## Required Skill Sections

The skill must include:

1. when to use Spike
2. what not to do
3. the main Spike method groups
4. direct usage recipes
5. private repo guidance
6. automatic record-driven behavior
7. replay and idempotency semantics
8. failure interpretation guidance

## Canonical Workflows

The skill must teach these workflows:

1. inspect an already-built snapshot
2. create a mirror for a private repo using `connection_id`
3. create a worktree from:
   - a source archive
   - an immutable commit
   - a best-effort branch
4. build or reuse code intelligence for a worktree root
5. search and navigate code through Spike methods
6. understand when automatic reconcile should already have done the work

## Out Of Scope

The skill must not:

1. tell agents to scrape adapter state files
2. teach provider-specific credential hacks
3. duplicate the full Spike product spec
4. replace the canonical product docs with a large tutorial

The skill is an agent operating guide, not a second product specification.
