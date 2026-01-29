## CHUNK-16: iOS App

### Summary
Upstream replaces the legacy bridge with a Gateway connection stack, updates discovery/settings flows, and refactors core app structure. The feature changes look strong, but branding, service IDs, and schemes need Nexus adaptation.

### Key Changes
- Bridge stack removed; Gateway connection controller/settings store added.
- New chat transport and session key handling for gateway-driven chat.
- Discovery and Bonjour wiring refactored; settings/voice UI changes.
- Info.plist and app entrypoint renamed to Legacy.

### Nexus Conflicts
- Bundle IDs, app name, and scheme `legacy://` are Legacy-branded.
- Bonjour service IDs and gateway identifiers use `legacy` naming.
- User-facing strings in Info.plist reference Legacy.

### Recommendation
**ADAPT (Branding/service identifiers)**

### Adaptation Notes
- Restore Nexus bundle IDs, scheme (`nexus://`), and app name.
- Update Bonjour service types/identifiers to Nexus equivalents.
- Replace user-facing strings and file paths to Nexus branding.
- Keep Gateway refactor and new transport flows.

### Questions for Tyler
- None.
