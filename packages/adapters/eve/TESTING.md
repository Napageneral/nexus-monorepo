# Eve Adapter Testing

## Automated

```bash
go test ./...
go build ./cmd/eve-adapter
./scripts/package-release.sh
```

Focused proof lanes:

```bash
go test ./cmd/eve-adapter ./internal/etl ./internal/livewatch
pnpm exec vitest run \
  src/runtime/runtime.broker-context.dispatch.test.ts \
  src/api/server-work.eve-imessage-manager-dispatch-job.test.ts \
  src/support/infra/outbound/channel-adapters.test.ts \
  src/api/internal-jobs/public-broker-wake.test.ts \
  src/commands/agent.ledger-persistence.test.ts
node --import tsx ./scripts/e2e/eve-cleanroom-method-routing-live.ts
```

Those cover:

1. watcher, warehouse, and edge transport correctness inside the Eve package
2. constrained manager-to-worker dispatch policy and Eve job prompt generation
3. truthful `imessage.send` exposure to workers and manager delivery surfaces
4. public-manager wake behavior for eligible Eve iMessage traffic
5. installed-package method projection and routed-send proof in a Linux cleanroom

Known local boundary:

```bash
pnpm exec vitest run src/agents/pi-tools.dispatch-routing.test.ts
```

That is the ideal direct helper-routing lane for the constrained child
dispatch surface, but this host still fails it because the local
`isolated-vm` native binding is broken.

## Manual Runtime Sanity

1. run `adapter.info`
2. confirm `nexus runtime call adapters.methods --json --params '{"id":"eve"}'` exposes `imessage.send`
3. run `adapter.connections.list`
4. run `adapter.health`
5. exercise `adapter.setup.start` / `adapter.setup.submit`
6. if local permissions allow, exercise `records.backfill`
7. if local permissions allow, exercise `adapter.monitor.start`
8. exercise `imessage.send` against a safe iMessage target
9. exercise `imessage.send` with `media` and `caption` against a safe iMessage target
10. inspect the returned `delivery.stage`, `messages_error_code`, and `attachment_transfer_state`
11. verify media sends prefer attachment-leg truth over text-leg truth
12. if you are testing inline media, confirm the current binary was rebuilt after staged-media changes
13. if validating the public-manager lane, confirm the Eve job and event subscription are active
14. send a self-thread proof text and confirm the reflected inbound record wakes the manager session
15. confirm the manager dispatches one worker and that the worker returns the image through `imessage.send`

Consumer SDKs are generated centrally from `api/openapi.yaml`; there is no package-local SDK generation step.
