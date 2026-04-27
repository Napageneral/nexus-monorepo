# WIS-005 Sandbox Materialization From Immutable Warm Substrates

## Goal

Create implementation sandboxes from immutable warm substrates without letting
live workers share one mutable dependency tree.

## Scope

- let sandbox creation reference a prepared substrate
- materialize a fresh writable workspace from that substrate
- keep worker artifacts and runtime homes isolated per attempt
- prevent mutation of the shared prepared substrate by live workers

## Acceptance

- an implementation sandbox can start from a prepared substrate
- each worker still gets a fresh writable execution surface
- shared warm state is treated as immutable once published
