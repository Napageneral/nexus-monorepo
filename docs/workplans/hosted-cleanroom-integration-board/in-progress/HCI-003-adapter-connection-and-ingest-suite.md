# HCI-003 Adapter Connection And Ingest Suite

## Goal

Prove adapter install, connection setup, health, and ingest on disposable
hosted servers using the real hosted seams.

## Initial Targets

- Jira
- Git
- Eve
- Slack

## Current Status

The reusable hosted adapter harness is now landed:

- fresh-server provisioning, install, runtime health, and cleanup are shared
  by the fresh-server adapter cleanroom wrapper
- the wrapper now mints one runtime token for the fresh server and passes the
  runtime bearer token plus runtime base URLs into operator-supplied proof
  commands
- durable proof capture is available through the adapter capture wrapper
- the first concrete proof lane is now Jira, using a reusable hosted proof
  command on top of the same fresh server
- the remaining work is live credentialed execution of that Jira lane, then
  adapter-by-adapter expansion for Git, Eve, and Slack

## Jira-First Direction

Jira is the best first hosted automation lane because it can prove the whole
adapter lifecycle through explicit runtime operations:

- `adapters.connections.custom.start`
- `adapters.connections.custom.submit`
- `adapters.connections.status`
- `adapters.connections.test`
- `jira.issues.create`
- `adapters.connections.backfill`
- `records.list`

The reusable proof command now lives at:

- `frontdoor/scripts/frontdoor-jira-adapter-proof.mjs`

Jira-specific setup quirk:

- one `adapters.connections.custom.submit` should complete the setup
- do not treat `adapters.connections.custom.status` as the readiness gate for
  this lane
- gate on `custom.submit.status == "completed"` plus
  `adapters.connections.status`

Use it through the fresh-server wrapper like this:

```bash
cd /Users/tyler/nexus/home/projects/nexus/frontdoor

FRONTDOOR_SMOKE_API_TOKEN='<frontdoor api token>' \
FRONTDOOR_SMOKE_ADAPTERS='jira' \
FRONTDOOR_SMOKE_ADAPTER_PROOF_COMMAND='pnpm smoke:proof:jira-adapter' \
JIRA_SITE='<jira site slug>' \
JIRA_EMAIL='<jira email>' \
JIRA_API_TOKEN='<jira api token>' \
JIRA_PROJECT_KEY='VT' \
FRONTDOOR_SMOKE_CLEANUP_MODE='destroy' \
pnpm smoke:capture:fresh-server-adapter-cleanroom
```

## Slack-Specific Direction

For the current Slack lane, this hosted proof should own the real
adapter/account seam that the standalone `nex/` cleanroom cannot prove by
itself.

That means the Slack slice of this ticket should cover:

- fresh hosted install of the Slack adapter on a disposable server
- real Slack connection setup and health
- monitor bring-up and canonical `record.ingest`
- deliberate non-streaming final reply behavior
- manager-turn-scoped runtime-owned status as observed through the real adapter
  seam

The runtime-facing local proof is now green on the synthetic no-human capture:

- `/Users/tyler/nexus/state/artifacts/validation/cleanroom/synthetic-slack-nohuman-e2e/20260328T060005Z`

That capture proves:

- canonical Slack-shaped public ingress through `record.ingest`
- public manager activation and downstream worker dispatch
- truthful worker delivery through real `slack.send` on the connected local
  Slack account
- clean manager reactivation after worker completion

It does not prove:

- real inbound Slack Socket Mode or webhook ingress on a disposable hosted
  server
- durable direct transport-status start/stop evidence in a ledger

This ticket is therefore no longer blocked on uncertainty about the local
runtime behavior. It now owns the remaining real hosted adapter/account seam.
The immediate runtime-facing cleanroom blocker previously lived on:

- [CLRPF-003 Manager-Worker And Code-Mode Cleanroom Proof Backfill](/Users/tyler/nexus/home/projects/nexus/nex/docs/workplans/cleanroom-proof-capture-backfill-board/completed/CLRPF-003-manager-worker-and-code-mode-cleanroom-proof-backfill.md)

Now that the standalone runtime proof is green again, the Slack hosted slice
here is the truthful place to prove the real adapter/account seam on
disposable infrastructure after the Jira lane is live.

## Best Starting Seam

Build on the existing fresh-server hosted package lifecycle path first:

- `frontdoor/scripts/frontdoor-fresh-server-package-lifecycle-smoke.mjs`
- `frontdoor/scripts/frontdoor-package-lifecycle-smoke.mjs`
- `frontdoor/scripts/frontdoor-fresh-server-adapter-cleanroom-smoke.mjs`
- `packages/scripts/hosted-cleanroom-package-smoke.py`

Then layer adapter-specific connection create, health, and ingest checks on top
of the same freshly provisioned server rather than inventing a separate
provisioning path.

The shared helpers for operator-supplied proof commands are now:

- `frontdoor/scripts/frontdoor-runtime-rpc.mjs`
- `frontdoor/scripts/frontdoor-jira-adapter-proof.mjs`

## Expected Blockers

- provider credentials and OAuth/session setup are adapter-specific
- some adapters can prove install and health immediately, while ingest or
  monitor proof may require seeded accounts or upstream data
- Jira is the bounded first case because it does not require a second human
  actor to create inbound data
- live proof should default to disposable cleanup even when credential setup is
  more expensive
- `FRONTDOOR_SMOKE_ADAPTER_PROOF_COMMAND` remains operator-supplied for the
  reusable capture pass, but it now inherits the fresh-server runtime token and
  runtime descriptor env vars directly from the wrapper

## Acceptance

1. adapters install on a fresh hosted server
2. connections can be created and checked for health
3. ingest or monitor proof runs through the real runtime and adapter seams
4. cleanup remains disposable by default
5. the command and proof-capture path are documented in the hosted validation
   ladder
