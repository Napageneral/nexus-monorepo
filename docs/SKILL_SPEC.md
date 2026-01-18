# Skill Spec (Local + Hub Alignment)

This doc defines how skills describe themselves so the CLI and hub can
discover, classify, and track them consistently.

## Frontmatter (SKILL.md)

Every `SKILL.md` should include YAML frontmatter:

```
---
name: vercel
description: Deploy and manage web applications on Vercel.
homepage: https://vercel.com/docs/cli
metadata: {"nexus":{"type":"tool","provides":["vercel"],"requires":{"bins":["vercel"],"credentials":["vercel"]}}}
---
```

### Required fields
- `name` — canonical skill name
- `description` — one-sentence summary
- `metadata.nexus.type` — `tool` | `connector` | `guide`

### Recommended fields
- `homepage` — primary docs URL
- `metadata.nexus.provides` — list of capability IDs
- `metadata.nexus.requires` — dependencies (see below)
- `metadata.nexus.install` — install options (brew, npm, etc.)

### Requires Schema
```
metadata.nexus.requires:
  bins: [string]
  anyBins: [string]
  env: [string]
  config: [string]
  credentials: [string]
  os: [string]
```

## Local Index (Skill Scan)

`nexus skill scan` builds a JSON index from skill frontmatter. This is the
source for local tracking and is used by capabilities detection.

## Source Semantics

- **Managed**: shipped with Nexus or installed from hub
- **Local**: created by the user in their workspace
- **Managed + modified**: managed skill with local edits (needs a distinct tag)

We treat bundled skills as managed so users still receive updates.

## Hub Alignment

The hub remains the canonical registry for capability taxonomy. Local skills
should declare `provides` so they can be mapped to taxonomy or proposed for
review if unknown.
