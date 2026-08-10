# Testing

Run from the package root after building the shared TypeScript adapter SDK:

```bash
npm install
npm test
npm run lint
npm run build
```

The required cleanroom proof additionally installs the package into a disposable Nex runtime, creates a source-bound connection, captures an open and recovered transition, replays both, and proves:

- one reliability channel
- one incident thread
- two records
- zero duplicate records after replay
- a corrected event creates a record revision with stable external identity
- title, summary, component, impact, remediation, and validation text are searchable
- no remote mutation method is exposed
