# Validation ladder

- Typecheck, unit tests, and bundled build pass.
- Adapter info lists nine methods, all read-only and non-mutating.
- Explicit backfill windows are proven against the recorded-fixture provider stub: search inside the horizon, export beyond it or at the cap, identity reuse for rows the search saw, checkpoint reuse on replay, and a closed failure when the export cannot cover the window.
- Health proves both Marketing and Transactional credentials independently.
- A bounded canary emits stable records twice without duplicate logical ids.
- Ingested records contain recipient hashes but no raw recipient email.
- No method name or operation can send or mutate provider state.
