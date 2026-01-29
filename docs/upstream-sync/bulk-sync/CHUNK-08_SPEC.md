# CHUNK-08 Implementation Spec (Browser Automation)

This spec turns the CHUNK-08 decision into an execution plan.

## Scope
- `src/browser/` (all modules, routes, tests)
- Browser config keys and env var wiring
- Integration touchpoints (CLI and gateway routes that call browser APIs)

## Decisions
- **TAKE_UPSTREAM + Rename** (no compatibility shims)
- Rename all `legacy`/`legacy` identifiers to Nexus equivalents
- Default profile name is `nexus` (replace upstream `legacy`)
- Keep upstream `extension` driver and built-in `chrome` profile logic

## Upstream additions to keep
- CDP helper module (auth headers, URL normalization, fetch helpers, websocket send/receive)
- Cross-platform Chrome executable discovery + default browser detection
- Chrome extension relay server and `extension` driver
- Playwright tooling refactor + new role snapshots
- Agent browser routes split by capability (`act`, `snapshot`, `storage`, `debug`)
- Profile service updates, new timeouts, and control token support

## Implementation plan
1. **Adopt upstream browser module layout**
   - Replace `src/browser/*` with upstream versions.
   - Keep new files: `cdp.helpers.ts`, `chrome.executables.ts`, `chrome.profile-decoration.ts`,
     `extension-relay.ts`, `pw-role-snapshot.ts`, `pw-tools-core.*`, `routes/*`.
2. **Rename sweep (branding only)**
   - Rename `legacy` and `legacy` in logs, errors, tests, CLI hints, data attributes,
     and temp paths (`/tmp/legacy` -> `/tmp/nexus`).
   - Rename config types and defaults:
     - `LegacyConfig` -> `NexusConfig`
     - `DEFAULT_LEGACY_*` -> `DEFAULT_NEXUS_*`
     - `resolveLegacyUserDataDir` -> `resolveNexusUserDataDir`
     - `driver: "legacy"` -> `driver: "nexus"`
   - Env vars: `LEGACY_*` -> `NEXUS_*`
3. **Config alignment**
   - Ensure new keys exist in Nexus config schema:
     - `browser.controlToken`
     - `browser.remoteCdpTimeoutMs`
     - `browser.remoteCdpHandshakeTimeoutMs`
     - `browser.profiles.<name>.driver`
   - Keep built-in `chrome` extension profile and default profile selection
     (prefer `chrome` if present, otherwise `nexus`).
4. **Extension relay integration**
   - Keep loopback-only relay requirement.
   - Ensure relay endpoints use Nexus branding in errors and hints.
5. **Update tests**
   - Replace any `legacy`/`legacy` strings in browser tests.
   - Update expected default profile names, temp paths, and labels.
6. **Validation**
   - Ensure browser server boots with new routes and passes contract tests.
   - Verify `driver: "extension"` profiles work with relay and fallback logic.

## Acceptance criteria
- Browser automation builds with new modules and routes.
- Extension relay works with `driver: "extension"` profiles.
- Default profile is `nexus` (or `chrome` when extension relay profile exists).
- No `legacy`/`legacy` strings remain in `src/browser` or browser tests.
