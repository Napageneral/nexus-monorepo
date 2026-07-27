# MoonSleep Partner Communications Validation

**Status:** VALIDATION
**Last Updated:** 2026-07-27

---

The first contract proof must establish:

1. one reviewed entity may contain Gmail and Alibaba records;
2. provider-native threads remain separate;
3. response state is determined only from timestamp and direction;
4. the queue is oldest-unanswered-first;
5. unresolved or ambiguous identity is review-only;
6. model-only identity or classification is review-only;
7. one provider-native thread cannot silently resolve to multiple entities;
8. every projected message retains source record and revision identity;
9. the projection exposes no provider or operational mutation method;
10. a paginated inbox covers the complete 7,992-message Alibaba production
    shape without snapshot duplication;
11. proposal batches bind exact source revisions and replay idempotently;
12. model output remains outside reviewed operational state;
13. overlapping proposal batches remain explicit conflicts;
14. immutable revisions collapse to one current logical inbox record,
    superseded revisions cannot cover the current head, and ambiguous or
    cross-thread revision lineage fails closed.

Run:

```bash
cd packages/apps/moonsleep-partner-communications/app
npm test
```

Runtime and production validation require the app to remain installed with its
projection job inactive and both Alibaba and Gmail subscriptions disabled.
Production proposal cohorts may be committed because they mutate only the
append-only Nex proposal ledger. They do not grant provider, reply, identity,
purchase-order, inventory, payment, or shipment authority.
