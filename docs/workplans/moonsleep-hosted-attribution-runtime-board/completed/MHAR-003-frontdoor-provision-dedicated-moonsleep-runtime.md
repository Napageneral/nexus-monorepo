# MHAR-003 Frontdoor Provision Dedicated MoonSleep Runtime

## Goal

Provision one dedicated MoonSleep runtime through Frontdoor on Hetzner for the
hosted shadow-validation lane.

## Scope

- one named MoonSleep server/tenant
- Frontdoor provisioning path
- runtime token mint
- hosted runtime health
- operator record of the hosted base URL, runtime token path, and cleanup or
  retention policy

## Acceptance

1. Frontdoor provisions one dedicated MoonSleep runtime successfully
2. hosted runtime health is green through the normal runtime access path
3. the resulting server is retained as the canonical environment for the
   MoonSleep hosted shadow lane rather than treated as a disposable one-shot
   smoke target

## Findings

Provisioned hosted MoonSleep runtime:

- server id: `srv-1c4b077a-1f2`
- tenant id: `t-e86786c3-537`
- runtime base URL: `https://t-e86786c3-537.nexushub.sh`

This server is the retained canonical environment for the hosted MoonSleep
shadow-validation lane.
