# MoonSleep Partner Communications

This package defines the deterministic projection used by MoonSleep's future
vendor and partner workspace. It consumes immutable communications plus
reviewed Nex identity and classification assertions. It does not ingest Gmail
or Alibaba itself and it owns no provider, purchasing, payment, inventory,
shipment, or identity-merge authority.

The first executable brick is a pure projection contract. It proves that:

- Gmail and Alibaba messages may share one reviewed partner entity timeline;
- provider-native threads remain separate and retain their source records;
- only confirmed workspace classifications enter the operational queue;
- exact provider anchors or operator review may bind canonical identity;
- model-only identity or classification proposals remain in review;
- awaiting-response state and queue order are deterministic.

Run the focused proof with:

```bash
npm test
```

The runtime app, PostgreSQL read model, and UI will be added only after the
shared communications lane freezes its public read and assertion contracts.
