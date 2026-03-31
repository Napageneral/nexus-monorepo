# website-input Validation

This folder holds the package-local validation guidance for the shared
website-input package family.

Validation is expected to prove three things:

1. the browser-side sender emits the canonical event contract
2. the collector accepts and preserves those events durably
3. bridge and pixel decisions are explicit rather than accidental

The two main validation lanes are:

- `wib-006-operator-proof-and-validation-lane.md`
- `wib-007-companion-pixels-and-tag-ownership-policy.md`

The docs here are operator-facing. They are not a replacement for the runtime
contract or the umbrella-level spec.
