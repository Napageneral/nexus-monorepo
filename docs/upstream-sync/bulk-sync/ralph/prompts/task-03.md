# TASK-03: Agents Auth Profiles

You are working in the bulk-sync worktree at:
`/Users/tyler/nexus/home/projects/nexus/worktrees/bulk-sync`

## Objective
Merge upstream auth-profiles with Nexus credential handling. This is a CAREFUL MERGE, not a blind copy.

## Context
Upstream has a modular auth-profiles system with CLI credential sync. Nexus has its own credential store with pointer backends (keychain, env, 1password). We need BOTH capabilities.

See: CHUNK-02_SPEC.md Section A and DEEPDIVE_AUTH_PROFILES_AND_CREDENTIALS.md

## Key Decisions (from spec)
1. Keep Nexus credential store as canonical
2. Add plaintext credential support for compatibility
3. Support side-by-side auth-profiles.json view
4. Preserve CLI sync (Claude/Codex/Qwen)

## Steps

1. **Review what exists:**
```bash
# Nexus credential store
ls src/credentials/

# Upstream auth-profiles  
git ls-tree -r --name-only upstream/main -- src/agents/auth-profiles/
```

2. **Port upstream auth-profiles modules:**
   - `src/agents/auth-profiles/types.ts`
   - `src/agents/auth-profiles/store.ts`
   - `src/agents/auth-profiles/usage.ts`
   - `src/agents/auth-profiles/external-cli-sync.ts`
   - `src/agents/cli-credentials.ts`
   - `src/agents/cli-backends.ts`

3. **Adapt store.ts:**
   - Don't treat auth-profiles.json as canonical
   - Ingest into Nexus credential store as plaintext records
   - Keep Nexus pointer mechanism (keychain, env, etc.)

4. **Add plaintext support to credential store:**
   - Extend `CredentialStorage` with `provider: "plaintext"`
   - Ensure `resolveCredentialValue()` handles plaintext

5. **Preserve Nexus credential policy:**
   - Keep policy checks for gateway access
   - Don't break existing credential flows

6. **Rename legacy→nexus:**
```bash
rg "LEGACY_" src/agents/auth-profiles/ src/agents/cli-*.ts
```

## DO NOT
- Replace Nexus credential store wholesale
- Remove pointer backend support
- Break existing credential verification

## Acceptance
- [ ] Auth-profiles modules exist with Nexus naming
- [ ] Credential store supports both pointers and plaintext
- [ ] CLI sync works for Claude/Codex
- [ ] `nexus credential verify` still works

## Reference
- [CHUNK-02_SPEC.md](../CHUNK-02_SPEC.md) Section A
- [DEEPDIVE_AUTH_PROFILES_AND_CREDENTIALS.md](../DEEPDIVE_AUTH_PROFILES_AND_CREDENTIALS.md)
