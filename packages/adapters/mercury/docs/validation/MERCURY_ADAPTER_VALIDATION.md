# Mercury Adapter Validation

## MAP-002 and MAP-003 gates

- official operation catalog binding;
- runtime reflection parity;
- both connection roles;
- fake-provider reads;
- path and query validation;
- bounded pagination and retry;
- all public writes rejected before network;
- sensitive card read rejected before network;
- internal Books operations absent;
- secret-safe errors;
- clean build, test and package validation;
- reproducible binary and packaged-content manifest;
- deterministic immutable revision identity;
- exact page capture receipt;
- payment, scheduled-payment and attachment expansion;
- primary/AP backfill scope;
- incomplete, tampered and inconsistent envelope rejection;
- all authority flags false.

No live provider write is permitted.
