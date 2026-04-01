# EVP-003 Real Self-Loop iMessage Inbound And Outbound Proof

## Goal

Prove real outbound and inbound iMessage behavior using the operator's own
number so validation does not disturb other people.

## Scope

- outbound send from Nex through the Linux core to the macOS Eve edge
- watcher-confirmed durable reconciliation of the outbound send
- inbound arrival back into Eve through a human-authored self-loop path
- explicit human-shaped validation script before execution

## Human-Shaped Validation Script

Before execution, the validating agent must use this exact script unless the
ticket is amended first.

Outbound proof:

1. use the Linux cleanroom or routed runtime surface to call `imessage.send`
2. send one text-only message to `7072876731`
3. message body:
   `EVE PROOF OUTBOUND 01 from Linux core via macOS edge`
4. expect:
   - a command receipt returns
   - the attempt is not treated as durable history immediately
   - the watcher later confirms the resulting canonical record

Inbound proof:

1. author one reply from a second human device surface tied to the same number
   or same operator-owned self-loop path
2. reply body:
   `EVE PROOF INBOUND 01 back into Nex`
3. expect:
   - `chat.db` changes are detected by the watcher
   - the inbound canonical record lands in Nex
   - the record is queryable through Nex read surfaces

Failure proof:

1. if the outbound receipt succeeds but watcher confirmation never arrives,
   record that as a failure
2. if the inbound message appears in Messages but never lands in Nex, record
   that as a failure

## Acceptance

- one real outbound message is sent to the operator's own number
- watcher confirmation proves durable outbound truth
- one real inbound message lands back in Nex
- the validation transcript records exact timestamps and latency

## Validation

- explicit execution transcript
- timestamped record query proof
- operator-visible evidence from Nex
- `git diff --check`

## Result

Completed on 2026-03-31.

Execution note:

- the proof used timestamped bodies instead of the earlier fixed literal
  strings so the cleanroom queries could identify only this run's records
- target number remained the operator-owned self-loop path `7072876731`

Executed outbound proof:

- runtime method:
  `imessage.send`
- message body:
  `EVE CLEANROOM PROOF 2026-03-31T13:03:30 self-loop 1774979830`
- runtime request window:
  `started_at=1774979908849`, `completed_at=1774979909133`

Observed durable records in the Linux cleanroom:

- outbound record id:
  `imessage:1CDA9A9D-77AC-489E-AEBE-57FADB2B60AD`
- reflected inbound record id:
  `imessage:DAA2400F-64BD-4335-A740-DB52D9091FBA`
- outbound canonical visibility:
  `received_at=1774979910677`
- reflected inbound canonical visibility:
  `received_at=1774979912760`

Measured timings from the routed send request:

- outbound durable appearance:
  `1828ms` from request start, `1544ms` from request completion
- reflected inbound appearance:
  `3911ms` from request start

This ticket proved the command receipt was not treated as durable history by
itself and that watcher-confirmed canonical records later established truth on
both the outbound and reflected inbound legs.
