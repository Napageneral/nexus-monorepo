# MoonSleep Partner Communications Validation

**Status:** VALIDATION
**Last Updated:** 2026-07-21

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
9. the projection exposes no provider or operational mutation method.

Run:

```bash
cd packages/apps/moonsleep-partner-communications/app
npm test
```

Runtime and production validation remain blocked until the shared
communications lane publishes stable public record, assertion, and coverage
read contracts.
