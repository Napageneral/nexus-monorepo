# Borden FedEx Invoice Registration

**Last Updated:** 2026-08-14

## Closure sequence

1. Validate and install this read-only connection package from committed `origin/main`.
2. Register the existing Borden source identity through the custom setup flow without exposing FedEx credentials.
3. Register one Nex Record per provider-native invoice revision from retained CSV evidence.
4. Replay the same capture and prove no duplicate revision or registration receipt.
5. Run the persistent reconciler in proposal-only mode against bounded Nex and Dispatch read/search receipts.
6. Review the golden corpus, match dispositions, arithmetic, exceptions, and proposed Dispatch changes with Tyler.
7. Enable recurring capture and reconciliation only after explicit approval; keep projection separately gated.

## Exit criteria

The review gate requires four balanced invoice Records, immutable fragment locators, idempotent replay, complete row disposition, exact reviewed Borden account and tracking matches, and zero Dispatch writes.
