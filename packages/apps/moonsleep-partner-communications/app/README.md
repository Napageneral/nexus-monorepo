# MoonSleep Partner Desk contract

This package defines the deterministic projection for MoonSleep's supplier and
partner communications workspace. Its primary work object is an independently
tracked **partner open loop**. A long Alibaba or Gmail conversation can contain
many open loops, and one source message can update several loops.

The projection proves that:

- provider-native conversations remain immutable evidence boundaries;
- reviewed open loops can span several native conversations or channels without
  inventing a cross-provider thread;
- categories and labels describe loops but never determine their lifecycle;
- only operator-reviewed identity, partner classification, coverage, and loop
  assertions enter the operational queue;
- every source record receives an explicit coverage disposition;
- resolved loops cite exact closure evidence;
- model proposals remain in review;
- no partner, purchasing, payment, inventory, shipment, or identity mutation is
  implied by the read projection.

Run the focused proof with:

```bash
npm test
```

The canonical product and delivery plan is
[`docs/workplans/moonsleep-partner-desk.html`](../../../../docs/workplans/moonsleep-partner-desk.html).
