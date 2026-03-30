# FSHC-007 Dispatch Validation Job Packets And Evidence Runner

## Archive Status

This ticket is preserved as historical intent only.
Generic Dispatch-run evidence work now belongs on the Nex-side fresh-boot
sandbox board, while any hosted reference suite work belongs on the hosted
cleanroom integration board.

## Goal

Make hosted cleanroom proof lanes runnable as Dispatch-managed validation jobs
with structured evidence return.

This ticket originally aimed to prove a hosted reference implementation. That
follow-on should now be handled in the active hosted or Nex-side boards rather
than reactivating this archived substrate board.

## Acceptance

1. one hosted cleanroom lane is expressible as a Dispatch job packet
2. Dispatch launches it in a sandboxed executor
3. evidence comes back as structured artifacts rather than ad hoc logs
4. the hosted packet shape is clear enough to hand off the generic contract
   extraction to the Nex-side orchestration board
