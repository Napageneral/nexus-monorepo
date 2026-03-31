# AIL-004 Website Input Package And Install Contract

## Goal

Define and implement the shared website input package family that captures
first-party attribution and funnel events for the attribution intelligence
layer.

## Required Capabilities

- installable tracking surface for customer websites
- session identity model
- canonical event contract
- capture of referrer, landing parameters, and paid click ids
- bridge fields that survive into backend outcomes where possible
- clean installation and QA guidance for operators

## Current Gap

- MoonSleep proves the shape for one site, but Nexus does not yet have a
  generic website package and installation contract for this domain
- customer implementation requirements are not yet written as one crisp
  operator-facing contract

## Acceptance

1. the website package contract is generic across common website environments
2. the required setup work on customer websites is explicitly documented
3. emitted records satisfy the attribution canon
4. cleanroom or equivalent proof demonstrates event capture and handoff into
   Nexus
