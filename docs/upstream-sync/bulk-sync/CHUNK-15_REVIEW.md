## CHUNK-15: macOS App

### Summary
Upstream adds substantial macOS app functionality (CLI install prompts, channel config UI, config schema support, audio device observer) and simultaneously rebrands the app and modules to Legacy. We should keep the features but adapt branding, identifiers, and service names.

### Key Changes
- New CLI installer + prompt flows, config schema support, channel config screens, and connection mode updates.
- Expanded app infrastructure (audio input device observer, logs/usage UI changes).
- Package/module renames to `Legacy`, new icons/assets, and updated README.

### Nexus Conflicts
- Package/module names, bundle IDs, schemes, and user defaults keys use `Legacy` and `com.legacy`.
- Paths and env vars point to `~/.legacy` and `LEGACY_*`.
- Icons/assets and app display name are Legacy-branded.

### Recommendation
**ADAPT (Branding/namespace/service identifiers)**

### Adaptation Notes
- Restore Nexus app/module names, bundle IDs, schemes, and UserDefaults keys.
- Rename paths/env vars back to `NEXUS_*` and `~/nexus/state/` conventions.
- Swap icon assets and app display strings to Nexus branding.
- Keep new feature modules (CLI installer, channel config UI, config schema support).

### Questions for Tyler
- None.
