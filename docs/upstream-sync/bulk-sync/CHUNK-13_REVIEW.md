## CHUNK-13: Signal + iMessage

### Summary
Upstream restructures Signal and iMessage monitoring into provider-style pipelines with new event handlers, account resolution, and delivery helpers. These are clean refactors with feature additions that should be safe to adopt.

### Key Changes
- New provider-style monitor modules for both Signal and iMessage.
- Signal gains identity helpers, format utilities, and SSE reconnect handling.
- iMessage monitor refactor with explicit deliver/runtime helpers and updated probe/targets logic.
- Expanded tests for message routing, mention handling, and tool summary behavior.

### Nexus Conflicts
- Minor `legacy` references in comments/examples (e.g., SSH wrapper detection).
- Any user-facing strings in pairing/allow-list flows should keep Nexus branding.

### Recommendation
**TAKE_UPSTREAM**

### Adaptation Notes
- Replace any lingering `legacy` strings with Nexus branding.
- Confirm any CLI/example snippets remain Nexus-specific.

### Questions for Tyler
- None.
