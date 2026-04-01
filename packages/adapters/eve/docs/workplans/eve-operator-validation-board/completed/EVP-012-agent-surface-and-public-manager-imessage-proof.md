# EVP-012 Agent Surface And Public Manager iMessage Proof

## Purpose

Close the gap between Eve's installed package-method surface and the broader
runtime behavior above it.

This ticket proves three things:

1. the packaged Eve method catalog is explicit and truthful
2. Nex manager and worker delivery surfaces can target Eve through
   `imessage.send`
3. eligible iMessage public-manager traffic wakes the same queued manager path
   already used by other deliverable channels

## Completed Work

1. Added the explicit OpenAPI `methodCatalog` to
   [adapter.nexus.json](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/adapter.nexus.json)
   with the `imessage` namespace.
2. Rewrote
   [SKILL.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/SKILL.md)
   so it explains runtime discovery, manager and worker usage, inline media on
   the AppleScript lane, and the private-API-only action boundary.
3. Updated
   [TESTING.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/TESTING.md)
   with the focused proof commands and the cleanroom discovery path.
4. Added Eve-specific outbound delivery assertions in
   [channel-adapters.test.ts](/Users/tyler/nexus/home/projects/nexus/nex/src/support/infra/outbound/channel-adapters.test.ts)
   for text and media routing through `imessage.send`.
5. Added an Eve worker type-surface proof in
   [agent.ledger-persistence.test.ts](/Users/tyler/nexus/home/projects/nexus/nex/src/commands/agent.ledger-persistence.test.ts)
   to verify `package_method_names=["imessage.send"]` yields the expected
   `imessage` namespace and media fields.
6. Added an Eve-specific public-manager wake proof in
   [public-broker-wake.test.ts](/Users/tyler/nexus/home/projects/nexus/nex/src/api/internal-jobs/public-broker-wake.test.ts)
   so eligible iMessage traffic publishes `runtime.agent.requested` with
   truthful iMessage routing and reply metadata.

## Validation

Passed:

```bash
python -m json.tool /Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/adapter.nexus.json >/dev/null
pnpm exec vitest run \
  src/support/infra/outbound/channel-adapters.test.ts \
  src/api/internal-jobs/public-broker-wake.test.ts \
  src/commands/agent.ledger-persistence.test.ts
git diff --check -- \
  /Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/adapter.nexus.json \
  /Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/SKILL.md \
  /Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/TESTING.md \
  /Users/tyler/nexus/home/projects/nexus/nex/src/support/infra/outbound/channel-adapters.test.ts \
  /Users/tyler/nexus/home/projects/nexus/nex/src/api/internal-jobs/public-broker-wake.test.ts \
  /Users/tyler/nexus/home/projects/nexus/nex/src/commands/agent.ledger-persistence.test.ts \
  /Users/tyler/nexus/home/projects/nexus/nex/src/agents/code-mode-exec.test.ts
```

Known local boundary:

- [code-mode-exec.test.ts](/Users/tyler/nexus/home/projects/nexus/nex/src/agents/code-mode-exec.test.ts)
  now includes an Eve-specific `imessage.send` assertion, but this host still
  cannot execute that suite because the local `isolated-vm` native binding is
  broken. The worker-surface proof therefore uses the generated-type-surface
  lane until that environment issue is repaired.
