# AGJV-006 Browser-Led Website And Handoff Proof

## Goal

Drive the real first-party website journey inside the same proof run.

## Scope

- open the tagged landing URL
- verify website-input install state
- generate first-party events through the browser seam
- cross the CTA and handoff surfaces
- prove bridge evidence survives into the attribution app

## Acceptance

1. the browser run creates canonical website events under one
   `website_installation_id`
2. identity, UTMs, referrer, and click-id evidence are preserved
3. the handoff creates the expected bridge data for downstream attribution
4. the proof retains browser trace and screenshots as part of the same bundle
