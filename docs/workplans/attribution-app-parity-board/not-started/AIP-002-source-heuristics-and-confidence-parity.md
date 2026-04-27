# AIP-002 Source Heuristics And Confidence Parity

## Goal

Refine the attribution app's session-source resolution and confidence semantics
to match the proven MoonSleep attribution heuristics without reintroducing
brand-specific assumptions.

## Acceptance

1. paid click ids, UTMs, referrer, and bridge evidence are ranked coherently
2. source-confidence states are explicit and inspectable
3. the heuristics are app-owned and reusable across MoonSleep, Devenir, and
   future clients
4. focused validation proves the upgraded heuristics on retained MoonSleep data
