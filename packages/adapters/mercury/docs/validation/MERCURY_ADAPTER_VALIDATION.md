# Mercury Adapter Validation

## MAP-002 gates

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
- clean build, test and package validation.

No live provider write is permitted.
