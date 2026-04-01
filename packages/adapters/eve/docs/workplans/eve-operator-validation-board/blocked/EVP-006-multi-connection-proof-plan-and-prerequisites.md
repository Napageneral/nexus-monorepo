# EVP-006 Multi-Connection Proof Plan And Prerequisites

## Goal

Define and then execute the smallest real operator proof that validates Eve's
multi-connection model beyond synthetic tests.

## Scope

- proof option analysis
- required operator prerequisites
- same-host versus multi-host proof choice
- success criteria for a real second connection

## Proof Options

Option A: same physical Mac, two logged-in macOS user sessions

- requires a second macOS user account
- requires a second iMessage-capable iCloud or Apple account
- best proof for "one physical Mac exposes multiple Eve connections"

Option B: two Macs, two distinct Eve edges

- requires a second Mac
- ideally uses a second iMessage-capable identity
- best proof for multi-host routing and operator distinction

Option C: same Apple identity on multiple Macs

- may prove multi-host routing mechanics
- does not prove distinct user-session identity surfaces
- is insufficient as the only proof for the long-term multi-connection claim

## Acceptance

- the operator prerequisite decision is explicit
- the chosen proof path is recorded before execution
- the board states clearly whether new iCloud credentials are required
- synthetic routing tests are treated only as supporting evidence

## Validation

- decision memo inside the ticket
- explicit prerequisite checklist
- operator signoff before execution
- `git diff --check`

## Current Status

Blocked on operator credential handoff for the second real iMessage-capable
identity.

Chosen path:

- start with Option A if possible:
  same physical Mac, second macOS user session, second iCloud/iMessage login
- fall back to Option B only if the same-host proof becomes impractical

Current host note:

- as of 2026-03-31, this Mac only exposes one human user home under `/Users`:
  `tyler`
- same-host proof on this machine therefore still requires provisioning a
  second macOS user session before the second iMessage identity can be paired

What remains before execution:

- provision the second macOS user session or confirm a second Mac
- sign in the second real iMessage-capable identity
- pair the second Eve edge as a distinct `connection_id`
- repeat the operator proof with both edges online and route verification from
  Nex

## Execution-Ready Checklist

### Operator Prerequisites

1. Use Option A unless it proves impractical:
   one physical Mac with two logged-in macOS user sessions.
2. Create or confirm a second macOS user account.
3. Sign that second user into Messages with the second real iMessage-capable
   Apple identity.
4. In the second user session, confirm Messages can manually send and receive
   before Eve is started.
5. Ensure the terminal or launcher used for Eve in the second session has Full
   Disk Access.
6. Keep the first Eve session available as the known-good baseline connection.
7. Use a runtime that already has the Eve adapter package available for routed
   `imessage.send` proof.
   The current local runtime is acceptable for this lane after the cleanroom
   proofs already passed.

### Required Host And Session Layout

Primary session:

- macOS user:
  `tyler`
- iMessage identity:
  current daily-driver Eve identity
- Eve connection id:
  existing live connection or explicit `eve-primary`

Secondary session:

- macOS user:
  second local macOS account
- iMessage identity:
  second Apple/iMessage login
- Eve connection id:
  explicit override preferred, for example `eve-secondary`

Runtime:

- preferred for this proof:
  the live local Nex runtime at `ws://127.0.0.1:18789`
- reason:
  routed `imessage.send` proof needs a core that already exposes Eve methods
  rather than a bare `nex/` cleanroom without Eve package registration

Before starting either edge, resolve and export the live runtime auth token
explicitly:

```bash
export NEXUS_RUNTIME_URL=ws://127.0.0.1:18789
export NEXUS_RUNTIME_TOKEN=<live-runtime-token>
```

### Edge Start Commands

Primary edge, if it is not already online:

```bash
HOME=/tmp/eve-edge-home-primary \
EVE_SOURCE_CHAT_DB=/Users/tyler/Library/Messages/chat.db \
EVE_APPLESCRIPT_ATTACHMENT_ROOT=/Users/tyler/Library/Messages/Attachments/eve \
/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/bin/eve-adapter edge.connect.start \
  --runtime-url "$NEXUS_RUNTIME_URL" \
  --runtime-token "$NEXUS_RUNTIME_TOKEN" \
  --connection eve-primary \
  --display-name "Tyler Eve Primary"
```

Secondary edge, run from the second macOS user session:

```bash
HOME=/tmp/eve-edge-home-secondary \
EVE_SOURCE_CHAT_DB="$HOME/Library/Messages/chat.db" \
EVE_APPLESCRIPT_ATTACHMENT_ROOT="$HOME/Library/Messages/Attachments/eve" \
/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/bin/eve-adapter edge.connect.start \
  --runtime-url "$NEXUS_RUNTIME_URL" \
  --runtime-token "$NEXUS_RUNTIME_TOKEN" \
  --connection eve-secondary \
  --display-name "Tyler Eve Secondary"
```

### Runtime Verification Commands

List both paired edges:

```bash
nexus runtime call adapters.edges.list --json --params '{
  "adapter_id": "eve"
}'
```

Expected operator check:

- exactly two Eve sessions are present
- each has a distinct `connectionId`
- `session_user`, `session_host`, and `account` surfaces distinguish them

List active Eve connections:

```bash
nexus adapters connections list --json | jq '.connections[] | select(.adapter_id=="eve")'
```

Route a send to the primary connection:

```bash
nexus runtime call imessage.send --json --params '{
  "connection_id": "eve-primary",
  "target": {
    "connection_id": "eve-primary",
    "channel": {
      "platform": "imessage",
      "container_id": "+17072876731"
    }
  },
  "text": "EVE MULTI PRIMARY 2026-03-31"
}'
```

Route a send to the secondary connection:

```bash
nexus runtime call imessage.send --json --params '{
  "connection_id": "eve-secondary",
  "target": {
    "connection_id": "eve-secondary",
    "channel": {
      "platform": "imessage",
      "container_id": "<second-identity-self-target>"
    }
  },
  "text": "EVE MULTI SECONDARY 2026-03-31"
}'
```

Then verify separation with:

```bash
nexus runtime call records.list --json --params '{
  "platform": "imessage",
  "connection_id": "eve-primary",
  "limit": 20
}'

nexus runtime call records.list --json --params '{
  "platform": "imessage",
  "connection_id": "eve-secondary",
  "limit": 20
}'
```

### Pass Criteria

- both Eve edges remain `paired` at the same time
- the runtime surfaces two distinct Eve `connection_id`s
- a routed send to `eve-primary` executes only on the primary identity
- a routed send to `eve-secondary` executes only on the secondary identity
- canonical records for each proof send land under the matching
  `connection_id`
- taking one edge offline degrades only that connection while the other remains
  paired and routable

### Fail Criteria

- the second Eve edge cannot pair cleanly
- both sessions collapse onto one shared `connection_id`
- routed sends cross over to the wrong identity
- canonical records from both identities are not separable by connection
- dropping one edge incorrectly degrades both connections
- the second Messages session cannot send or receive manually before Eve starts

Until that happens, the synthetic routing tests remain supporting evidence only.
