# EVP-013 Live Public Manager Self-Text And Media Reply Proof

## Purpose

Close the remaining live conversational proof gap on the safe AppleScript lane.

This ticket proves that a real inbound iMessage on the operator's self-thread
can wake the Eve manager automation, that the manager can dispatch exactly one
worker with a constrained tool surface, and that the worker can send the
configured image back over the same Eve connection through `imessage.send`.

## Completed Work

1. Used the packaged Eve job script
   [imessage-manager-dispatch.ts](/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/app/jobs/imessage-manager-dispatch.ts)
   behind live job definition `jobdef_0432cf74-5a88-4c00-b467-fbb57905da95`.
2. Used live event subscription `eventsub_343ffebe-734c-4983-a2be-808d8162f921`
   on `record.ingested` for the self-thread container `+17072876731`.
3. Sent the live trigger text
   `EVE LIVE MANAGER PROOF 1775058740537: dispatch a worker and send the configured proof image back to this same iMessage thread.`
   on outbound record `imessage:F0459C94-83AC-4E24-8614-47CFC8ADE2B1`.
4. Confirmed the reflected inbound trigger record
   `imessage:39131BE9-4AD9-4061-A5DE-1623D114D6B8` woke manager session
   `session:eve-imessage-public-manager-proof-live-clean` through
   `runtime.agent.requested` event `41a79c7d-c28a-4833-95ca-16210af48032`.
5. Confirmed the live manager prompt used the constrained child dispatch shape:
   `toolAllowlist: []`,
   `toolDenylist: ["local.exec","local.pty.start","local.pty.list","local.pty.poll","local.pty.log","local.pty.write","local.pty.sendKeys","local.pty.submit","local.pty.paste","local.pty.kill","local.pty.remove","browser"]`,
   and `packageMethodNames: ["imessage.send"]`.
6. Confirmed the manager dispatched exactly one worker session,
   `session:207f4f34-78ce-4add-a78e-1485db712fe6`, and acknowledged that
   dispatch publicly before the child completed.
7. Confirmed the worker completed through `imessage.send` only and produced the
   same-thread Eve reply records:
   - outbound caption `imessage:6CDAE30E-15FF-4C3B-B923-A58809FFF024`
   - outbound attachment-bearing image record
     `imessage:AC38E31C-8277-46AF-AC1D-F34AA7ADCEF5`
   - outbound attachment id
     `imessage:attachment:F72DF158-957E-4EE8-9217-F267BB31EFB5`
   - reflected inbound caption
     `imessage:5D6C6C44-C63C-474A-84A0-2EC6DC79DDF3`
8. Confirmed the visible reply image was the configured file
   `intent-layer-frame3-map-appears.png` on the same self-thread.
9. Confirmed the worker send result reported
   `attempt-79ea427bedf2462360d8fcbae7b9d84c`, `chunks_sent=1`,
   `confirmed=false`, and `executor=applescript_send_only`.

## Validation

Passed:

```bash
pnpm exec vitest run \
  src/runtime/runtime.broker-context.dispatch.test.ts \
  src/api/server-work.eve-imessage-manager-dispatch-job.test.ts \
  src/support/infra/outbound/channel-adapters.test.ts \
  src/api/internal-jobs/public-broker-wake.test.ts \
  src/commands/agent.ledger-persistence.test.ts
nexus runtime call records.list --json --params '{"platform":"imessage","connection_id":"62630eca-0c2b-4719-82bc-716f1bb0560a","container_id":"+17072876731","limit":24}'
nexus runtime call agents.sessions.history --json --params '{"session_id":"session:eve-imessage-public-manager-proof-live-clean","limit":8}'
git diff --check -- \
  /Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/SKILL.md \
  /Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/TESTING.md \
  /Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/validation/EVE_ADAPTER_VALIDATION.md \
  /Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/docs/workplans/eve-operator-validation-board
```

## Result

1. No synthetic `record.ingest` shortcut or manual replay path was needed.
2. No second outbound iMessage surface appeared beyond `imessage.send`.
3. The live manager-worker route now has both automated Nex-side coverage and a
   real self-thread operator proof.
4. The only remaining blocked Eve operator proof on this board is the second
   real iMessage identity required for multi-connection validation.
5. This evidence is a live local-runtime proof, not a cleanroom artifact
   bundle, and the docs should stay explicit about that boundary.

## Known Local Boundary

- [pi-tools.dispatch-routing.test.ts](/Users/tyler/nexus/home/projects/nexus/nex/src/agents/pi-tools.dispatch-routing.test.ts)
  is still the ideal direct helper-routing lane for the constrained child
  policy surface, but this host cannot execute it because the local
  `isolated-vm` native binding remains broken.
