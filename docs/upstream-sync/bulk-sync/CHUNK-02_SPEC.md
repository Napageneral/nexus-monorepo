# CHUNK-02 Implementation Spec (Agents Core)

This spec turns the CHUNK‑02 decisions into a concrete execution plan.

## Scope
- Auth profiles + CLI credential flows + credential storage
- Tool registry consolidation + plugin tool allowlist + A2A gating
- Skills metadata + hub/manifest preservation
- Nexus renames for all `legacy` identifiers in this area

---

## A) Auth Profiles + Credentials (compat, best‑of‑both)

### Goals
- Keep Nexus credential store + policy/broker as canonical.
- Add **plaintext** credential storage for compatibility with upstream.
- Support **side‑by‑side** auth‑profiles.json view for comparison.
- Preserve CLI sync (Claude/Codex/Qwen) and usage stats.

### Files to touch
**Keep/extend (Nexus):**
- `src/credentials/store.ts`
- `src/credentials/policy.ts`
- `src/credentials/broker.ts`

**Import from upstream (Legacy):**
- `src/agents/auth-profiles/*` (modular split)
- `src/agents/cli-credentials.ts`
- `src/agents/cli-backends.ts`
- `src/agents/cli-runner.ts` + helpers

### Steps
1. **Add plaintext storage to credential store**
   - Extend `CredentialStorage` with `provider: "plaintext"` or allow `record.key/token/accessToken` without pointer.
   - Ensure `resolveCredentialValue()` supports plaintext directly.
2. **Add auth‑profiles.json compatibility**
   - Import upstream `auth-profiles/*` modules (types, store, usage, external‑cli‑sync).
   - Modify `auth-profiles/store.ts` to *read* `auth-profiles.json` but **not** treat it as canonical:
     - If `auth-profiles.json` exists, ingest it into the credential store as plaintext records.
     - Optionally mirror credential store → auth‑profiles.json for side‑by‑side comparison.
3. **CLI credential sync**
   - Use upstream `cli-credentials.ts` to read CLI tokens.
   - On sync, upsert into credential store as:
     - `storage.provider: "external"` or `"keychain"` if found in keychain
     - fallback to `plaintext` if no pointer mechanism is possible
4. **Usage stats parity**
   - Add upstream usage stats fields to the credential index:
     - `disabledUntil`, `disabledReason`, `failureCounts`, `lastFailureAt`
   - Keep round‑robin + cooldown logic compatible with upstream.
5. **Policy/broker**
   - Keep credential policy checks for gateway access (no regression).
6. **Config + naming**
   - Replace `LEGACY_*` → `NEXUS_*` in imported files.
   - Ensure `auth-profiles.json` lives under `agentDir` in Nexus state.

### Acceptance criteria
- Credential store supports pointer backends *and* plaintext.
- `auth-profiles.json` can be read and compared without losing pointers.
- CLI credential sync works without overwriting pointer sources.
- Usage stats and cooldown logic preserved.

---

## B) Tool Registry + Plugin Tool Allowlist + A2A Gating

### Goals
- Adopt upstream consolidated registry + plugin tools.
- Preserve Nexus tool policy behavior.
- Canonicalize A2A gating to `tools.agentToAgent` with alias support.

### Files to touch
- Replace `src/agents/nexus-tools.ts` with upstream `src/agents/legacy-tools.ts` (rename to `nexus-tools.ts`).
- Update `src/agents/pi-tools.ts` with upstream changes + Nexus policy chain.
- Import upstream `src/plugins/tools.ts`.
- Update `src/agents/tool-policy.ts` with new groups/profile logic.
- Update session tools gating: `src/agents/tools/sessions-*.ts`.

### Steps
1. **Adopt upstream tool registry**
   - Use `createLegacyTools` logic but rename to `createNexusTools`.
   - Integrate plugin tool resolution as upstream does.
2. **Policy chain**
   - Ensure plugin tools flow through global → sandbox → subagent policies.
   - Add `group:plugins` expansion.
3. **A2A gating**
   - Move canonical config to `tools.agentToAgent`.
   - Support alias from `routing.agentToAgent` for compatibility.
4. **Rename**
   - Replace `legacy` in tool descriptions and messages.

### Acceptance criteria
- Plugin tools show up only when allowlisted (optional tools).
- A2A gating behaves consistently with upstream (with alias support).
- Tool policy groups include web + session_status + message tool.

---

## C) Skills Metadata + Hub/Manifest (Keep Nexus)

### Goals
- Preserve Nexus metadata schema and hub/manifest tooling.
- Add compatibility for `metadata.legacy.*`.

### Files to touch
- `src/agents/skills.ts`
- `src/commands/skills-manifest.ts`
- `src/cli/skills-hub-cli.ts`
- `docs/skills.md`

### Steps
1. Keep Nexus implementations intact.
2. Add compatibility parsing:
   - If `metadata.nexus` missing but `metadata.legacy` exists, map fields.
3. Update docs to clarify dual namespace support.

### Acceptance criteria
- `type`, `provides`, `requires.credentials`, `hubSlug/hub`, `version` still work.
- Manifest + hub commands unchanged in Nexus.

---

## D) Rename Sweep (Nexus branding)

### Targets
- `legacy` strings, service names, docs URLs, paths, User‑Agent.
- `LEGACY_*` env vars → `NEXUS_*`.
- DNS service names: `_legacy-*` → `_nexus-*` and `legacy.internal` → `nexus.internal`.

### Suggested approach
1. Run structured replace passes in each touched area.
2. Re‑audit for “legacy” residuals with search.

---

## Open Decisions (if needed later)
- Whether to permanently deprecate `auth-profiles.json` or keep it long term.
- Whether to default allow `group:plugins` or require explicit allowlists.
