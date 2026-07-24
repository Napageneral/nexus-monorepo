# Mercury Adapter Validation

## MAP-002 through MAP-004 gates

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
- persisted record metadata contains the full hash-bound provider evidence;
- atomic fact ids recompute exactly from typed value and evidence identity;
- money has exact integer minor units and never float-derived rounding;
- equal-time contradiction and missing requirement resolution fails closed;
- normal Nex runtime calls create, reuse and version observation heads;
- repeated projection creates no duplicate facts or observation rows;
- changed evidence creates immutable successor observations;
- tampered stored-record metadata is rejected before any memory write.

No live provider write is permitted.
