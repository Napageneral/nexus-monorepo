# TASK-02: Gateway New Features

You are working in the bulk-sync worktree at:
`/Users/tyler/nexus/home/projects/nexus/worktrees/bulk-sync`

## Objective
Port new gateway features from upstream: OpenAI HTTP API, exec-approvals, node registry.

## Context
Upstream added several new gateway capabilities. See CHUNK-07_REVIEW.md.

## Steps

1. **See what's new upstream:**
```bash
# New server methods
git diff HEAD upstream/main --stat -- src/gateway/server-methods/

# Check for new files
git ls-tree -r --name-only upstream/main -- src/gateway/ | grep -v "test"
```

2. **Key new features to port:**
   - OpenAI-compatible HTTP API endpoint
   - Exec-approval manager + methods
   - Node registry/events/subscriptions
   - Chat abort/sanitize flows

3. **For each new feature:**
   - Copy files from upstream
   - Rename legacy→nexus
   - Update imports to Nexus paths
   - Verify no legacy auth headers

4. **Verify methods are registered:**
```bash
rg "registerMethod|addMethod" src/gateway/
```

## Acceptance
- [ ] New gateway methods exist
- [ ] OpenAI endpoint functional (if applicable)
- [ ] Exec-approvals manager present
- [ ] Node registry present
- [ ] All use Nexus naming

## Reference
- [CHUNK-07_REVIEW.md](../CHUNK-07_REVIEW.md)
