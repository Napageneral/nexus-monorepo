# Extensions API Hard Cutover Workplan (2026-02-25)

**Status:** Implemented  
**Mode:** Hard cutover (no compatibility alias)  
**Scope:** `nex` runtime + extensions + packaging/docs naming surfaces

---

## 1. Customer Experience First

This cutover is successful only if users experience:

1. A single canonical extension import surface: `nexus/extensions-api`.
2. No runtime instability from legacy API naming or alias behavior.
3. Predictable build/test/release behavior after the rename.
4. Clear docs/spec wording that matches runtime reality.

---

## 2. Research Findings

At start of pass, naming was mixed across code and docs:

1. Export/build/loader/test paths still contained legacy API naming.
2. Docs/spec references were split across old and new naming.
3. Some generated and historical artifacts retained stale strings.

---

## 3. Decisions

1. Canonical API path is `nexus/extensions-api`.
2. Remove compatibility alias behavior in core runtime/build surfaces.
3. Align package exports, loader alias, build output, tests, and docs on the same naming.
4. Keep upstream snapshot docs out of scope for wording rewrites.

---

## 4. Implementation Summary

Implemented changes across runtime and tooling:

1. Package/build surface:
   - export switched to `./extensions-api`
   - d.ts pipeline switched to `tsconfig.extensions-api.dts.json`
   - entry d.ts writer switched to `write-extensions-api-entry-dts.ts`
2. Runtime/test surface:
   - loader alias/probe switched to `nexus/extensions-api`
   - build/release check expects `dist/extensions-api/*`
   - version and loader tests updated to `extensions-api` paths
3. Source/docs surface:
   - old API source dir removed and replaced with `src/extensions-api`
   - docs refactor pages renamed to `extensions-api` naming
   - zh plugin hook example switched to `nexus/extensions-api`

---

## 5. Validation Evidence

1. Typecheck: `pnpm -s tsc --noEmit` passed.
2. Targeted tests passed:
   - `src/extensions-api/index.test.ts`
   - `src/plugins/loader.test.ts`
   - `src/version.test.ts`
   - `src/memory/retain-live.test.ts`
3. Build and release-check passed:
   - `pnpm -s build`
   - `pnpm -s release:check`
4. Invariant checks:
   - zero legacy API token matches in `nex` source/docs runtime surfaces (excluding external logs/artifacts)

---

## 6. Follow-up Scope

1. Keep terminology aligned in owned specs.
2. Preserve `specs/upstream/**` wording for external snapshot fidelity.
