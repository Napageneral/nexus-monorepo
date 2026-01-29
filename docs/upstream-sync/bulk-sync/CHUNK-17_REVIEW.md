## CHUNK-17: Android App

### Summary
Upstream upgrades the Android node app with a new Gateway session/TLS stack, device identity store, and broader protocol support. The changes are desirable but include a full package/namespace rename to Legacy that must be reverted for Nexus.

### Key Changes
- New gateway modules (discovery, protocol/session/TLS), device identity store, and updated runtime.
- Bridge artifacts removed; node runtime updated for new gateway flow.
- Package renamed to `com.legacy.android`; build config and resources updated.
- New/updated icons, app labels, and string resources.

### Nexus Conflicts
- `applicationId`/`namespace` and Java/Kotlin package paths are Legacy-branded.
- Service discovery names (`_legacy-gateway._tcp`, `legacy.internal`) and strings reference Legacy.
- Assets and app label branding are Legacy.

### Recommendation
**ADAPT (Branding/namespace/service identifiers)**

### Adaptation Notes
- Restore Nexus `applicationId`/`namespace` and package paths.
- Update discovery identifiers and user-visible strings to Nexus naming.
- Keep gateway session/TLS and runtime changes intact.

### Questions for Tyler
- None.
