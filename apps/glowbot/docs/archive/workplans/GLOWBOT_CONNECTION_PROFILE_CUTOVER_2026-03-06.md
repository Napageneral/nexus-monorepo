# GlowBot Connection Profile Cutover

**Status:** ACTIVE
**Last Updated:** 2026-03-06

---

## Goal

Cut GlowBot over from the old app-local adapter auth model to the canonical
shared-adapter connection-profile model.

This is a hard cutover:

- no `authMethods` in the app contract
- no repo-relative adapter binary paths in the app package
- no adapter connect flows keyed only by `adapterId` plus generic auth type

---

## Canonical Target

GlowBot should:

1. declare shared adapter dependencies under `requires.adapters`
2. expose app-facing `connectionProfiles` under `adapters[]`
3. start connection flows using explicit profile selection
4. consume shared adapter connections rather than embedding provider auth UI contracts in the app package

---

## Current Gaps

### Gap 1: Live manifest still uses old adapter shape

Evidence:

- `apps/glowbot/consumer/app.nexus.json`

Problems:

- `authMethods` still present
- repo-relative `command` paths escape the package root
- app manifest still describes provider auth UI details directly

### Gap 2: Shared types still encode `authMethods`

Evidence:

- `apps/glowbot/shared/types.ts`

Problems:

- integrations response shape still returns `authMethods`
- connect request params are still keyed only by `adapterId`

### Gap 3: Methods still start OAuth by generic auth type

Evidence:

- `apps/glowbot/consumer/methods/integrations-connect-oauth-start.ts`
- `apps/glowbot/consumer/methods/integrations-connect-apikey.ts`

Problems:

- OAuth starts with `config: { authMethod: "oauth2" }`
- app does not pass `connectionProfileId`

### Gap 4: UI still chooses the first auth method

Evidence:

- `apps/glowbot/consumer-ui/src/app/integrations/page.tsx`

Problems:

- UI picks `adapter.authMethods[0]`
- rendering and prompts are based on old auth-type branches

---

## Workstreams

## WS1: Manifest Contract Cutover

Update:

- `apps/glowbot/consumer/app.nexus.json`

Required changes:

1. replace `authMethods` with `connectionProfiles`
2. remove repo-relative adapter binary paths from the app package contract
3. declare shared adapters as dependencies rather than embedded binaries

## WS2: Shared Types Cutover

Update:

- `apps/glowbot/shared/types.ts`

Required changes:

1. integrations response returns `connectionProfiles`
2. connect params include:
   - `adapterId`
   - `connectionProfileId`
3. remove old UI field schema assumptions from app-owned types where those belong to shared adapter auth methods

## WS3: Method Handler Cutover

Update:

- `apps/glowbot/consumer/methods/integrations-connect-oauth-start.ts`
- `apps/glowbot/consumer/methods/integrations-connect-apikey.ts`
- related integration handlers

Required changes:

1. call shared adapter connection APIs with explicit profile selection
2. stop hard-coding generic `oauth2` auth-method dispatch
3. support app-managed profiles and BYO profiles cleanly

## WS4: Integrations UI Cutover

Update:

- `apps/glowbot/consumer-ui/src/app/integrations/page.tsx`

Required changes:

1. render connection profiles, not raw auth methods
2. let the user choose a profile when more than one exists
3. display app-branded managed profiles distinctly from BYO profiles
4. remove "pick first auth method" behavior

## WS5: Validation

Update:

- `apps/glowbot/docs/validation/VALIDATION_LADDER.md`

Required checks:

1. managed OAuth profile launches correctly
2. BYO credential profile launches correctly
3. integration list renders declared connection profiles
4. package contract no longer references adapter binaries outside the package root
