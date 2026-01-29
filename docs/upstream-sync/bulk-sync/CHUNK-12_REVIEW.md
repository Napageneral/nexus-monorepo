## CHUNK-12: Slack

### Summary
Upstream overhauls Slack monitoring into a dedicated module tree with event routing, allow-list enforcement, and improved slash-command UX. The changes are extensive but localized and should be safe to take directly.

### Key Changes
- `monitor/*` subsystem added with event dispatch, channel config, auth, and message handling.
- New slash-command helpers (arg menus, command registry, threading rules).
- Format/resolve helpers expanded; channel migrations and directory live data added.
- Broad test coverage added for message handling, tool summaries, and reply-to behavior.

### Nexus Conflicts
- Some Slack action IDs and test fixtures use `legacy` naming (`legacy_cmdarg`).
- Any user-facing strings in prompts/examples should be Nexus-branded.

### Recommendation
**TAKE_UPSTREAM**

### Adaptation Notes
- Decide whether to rename `legacy_cmdarg` and related action IDs to Nexus equivalents.
- Update any remaining `legacy` strings in fixtures/prompts to `nexus`.

### Questions for Tyler
- None.
