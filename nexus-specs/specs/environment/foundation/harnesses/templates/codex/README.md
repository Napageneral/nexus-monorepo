# Codex Bindings

## ⚠️ Limited Support

Codex (OpenAI) does **not** have a lifecycle hook system. This means:

- ❌ No session start hook
- ❌ No post-compaction hook
- ❌ No plugin system
- ❌ Context cannot be dynamically refreshed

## What Works

Codex reads `AGENTS.md` at the workspace root for instructions.

## Limitations

1. **No dynamic identity injection**: The agent only gets static instructions from `AGENTS.md`
2. **No post-compaction refresh**: When context is compacted, Nexus identity/memory is lost
3. **Agent must manually call `nexus status`**: Unlike other harnesses, Codex agents must explicitly run the CLI to get context

## Recommendation

> **Codex is not recommended for Nexus workflows.**
>
> Use Cursor, Claude Code, or OpenCode for full Nexus integration with automatic
> identity and memory injection.

## Workaround

If you must use Codex with Nexus, include explicit instructions in `AGENTS.md`:

```markdown
## Important: Context Refresh

After any long conversation or if context seems lost, run:

\`\`\`bash
nexus status
\`\`\`

This will show your identity, capabilities, and current state.
```

## Files

The only binding file for Codex is the root `AGENTS.md`, which is shared with Cursor and OpenCode.
