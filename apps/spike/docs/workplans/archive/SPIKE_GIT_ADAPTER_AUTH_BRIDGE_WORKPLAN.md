# Spike Workplan: Shared Connection Credential Retrieval Cut

## Purpose

Close the remaining hosted/private git gap for Spike automatic reconcile.

The customer-facing pass is:

1. install the git adapter through Frontdoor
2. install Spike through Frontdoor
3. ingest or observe a private git record
4. let `record.ingested` trigger Spike automatically
5. have Spike clone/fetch the private repository without a second auth setup

## Gap

Local/Vrtly validation already proved the shared-connection concept.

The hosted failure is narrower:

- Frontdoor install succeeds
- git setup succeeds
- git records ingest successfully
- `record.ingested` queues and runs Spike reconcile
- private clone still depends on app-side state-file lookup rather than a
  canonical Nex credential retrieval API
- Spike is still coupled to Nex state-file layout instead of consuming the
  trusted runtime contract

## Canonical Target

Spike must retrieve git clone credentials from Nex by `connection_id`, not from
provider guessing, state-file scraping, or a second app-local setup.

Canonical lookup:

1. exact shared `connection_id`
2. Nex returns the credential bound to that connection

## Phases

### Phase 1: Spec lock

Update the auth retrieval spec and validation docs so they lock the
single-identity `connection_id` model and generic credential retrieval.

### Phase 2: Resolver cut

Update Spike's Nex auth resolver to:

1. accept the producing or explicit shared git `connection_id`
2. call the Nex runtime credential retrieval surface for that connection
3. stop reading `adapter-connections/connections.json`
4. stop reading Nex credential files directly

### Phase 3: Regression coverage

Add unit coverage for:

1. exact shared connection lookup
2. runtime credential retrieval success
3. nil result when the connection has no credential
4. no direct Nex state-file dependency remains in the resolver

### Phase 4: Hosted proof

Rerun the Frontdoor live Git+Spike test and prove:

1. private PR/comment records ingest
2. Spike reconcile completes
3. mirror/worktree/snapshot are created
4. mirror origin remains credential-free
