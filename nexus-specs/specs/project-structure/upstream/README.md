# Upstream Reference — Project Structure

This folder captures how OpenClaw organizes its codebase.

---

## Upstream Location

```
~/nexus/home/projects/openclaw/
```

---

## Key Areas to Document

| Area | Upstream Location | Notes |
|------|-------------------|-------|
| **Monorepo structure** | Root `packages/` | How packages are organized |
| **Package boundaries** | `packages/*/package.json` | What each package does |
| **Build system** | `turbo.json`, `tsconfig.json` | Build configuration |
| **Shared code patterns** | `packages/core/src/` | Internal module organization |

---

## Documents to Create

- `UPSTREAM_MONOREPO.md` — Package layout and dependencies
- `UPSTREAM_BUILD.md` — Build system and tooling

---

*This folder provides upstream context for project structure decisions.*
