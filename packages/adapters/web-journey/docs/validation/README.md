# Validation

`web-journey` validation should prove the source-adapter contract end to end.

The canonical proof ladder is:

1. package validates, builds, and releases
2. the adapter installs and connects in a cleanroom
3. authenticated routing through `web-signals` reaches `web-journey`
4. canonical journey rows materialize through `record.ingest`
5. freshness updates when a real browser event lands
6. downstream consuming-app binding reads the adapter truth

Local proof notes:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/docs/validation/web-journey-source-adapter-validation.md`
