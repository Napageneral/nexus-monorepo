# Validation ladder

- Typecheck, unit tests, and bundled build pass.
- Adapter info lists ten methods, all read-only and non-mutating, and `records.backfill.stage` among them (the runtime's worker path requires it).
- Explicit backfill windows are proven against the recorded-fixture provider stub: search inside the horizon, export beyond it or at the cap, identity reuse for rows the search saw, checkpoint reuse on replay, and a closed failure when the export cannot cover the window.
- Records leave in non-decreasing timestamp order whatever order the provider lists campaigns.
- `records.backfill.stage` over a recorded fixture of two campaigns and the Transactional export: chunk files and manifest match the streamed records exactly, the same window stages twice identically with one export, the manifest stays truthful when a window fails part way, and a non-empty `stage_dir` is refused before any read.
- Health proves both Marketing and Transactional credentials independently.
- A bounded canary emits stable records twice without duplicate logical ids.
- Ingested records contain recipient hashes but no raw recipient email.
- No method name or operation can send or mutate provider state.
