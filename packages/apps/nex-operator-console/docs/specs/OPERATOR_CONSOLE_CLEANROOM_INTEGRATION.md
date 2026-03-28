# Operator Console Cleanroom Integration Testing

**Status:** CANONICAL
**Domain:** Operator Console — Integration Validation
**Depends on:** nex Docker cleanroom boot, operator console controller layer, WebSocket RPC surface

---

## Customer Experience

An operator or developer can run a single command that:

1. Boots a disposable nex runtime in Docker
2. Exercises every operator console data path against that runtime via WebSocket RPC
3. Reports pass/fail results for each domain
4. Captures a durable proof bundle

The test suite proves that the operator console's controller layer correctly calls the nex runtime and handles real responses — not mocked data. It validates the full chain: controller function → WebSocket RPC → runtime handler → response → type parsing.

This is the primary proof that the v2 console works. Browser rendering tests and unit tests are complementary but secondary.

---

## Conceptual Model

### Integration Test

An integration test connects to a live nex runtime via WebSocket and exercises a specific controller function or RPC method. It validates:

- The RPC call succeeds (no protocol or auth errors)
- The response shape matches the expected TypeScript type
- The data makes sense (e.g., listing agents after creating one returns at least one agent)
- Error paths behave correctly (e.g., deleting a nonexistent agent returns an error, not a crash)

### Test Suite

The full suite covers every domain the operator console touches:

| Domain | Controller Functions | RPC Methods |
|--------|---------------------|-------------|
| **System** | loadPresence, loadSessions, loadConfig, loadLogs, loadDebug, loadUsage | runtime.hello, status, health, presence.list, sessions.list, config.get, logs.recent, debug.snapshot, usage.* |
| **Agents** | loadAgents, createAgent, updateAgent, deleteAgent | agents.list, agents.create, agents.update, agents.delete |
| **Agent Identity** | loadAgentIdentity, loadAgentIdentities | agents.identity.get |
| **Agent Files** | loadAgentFiles, loadAgentFileContent, saveAgentFile | agents.files.list, agents.files.read, agents.files.write |
| **Agent Skills** | loadAgentSkills | agents.skills.status |
| **Chat** | loadChatHistory, sendChat, abortChat | agents.conversations.list, agents.conversations.history, agents.sessions.send |
| **Integrations** | loadIntegrations, startIntegrationOAuth, testIntegrationAdapter, disconnectIntegrationAdapter | adapters.connections.list, adapters.connections.test |
| **Channels** | configureChannel, enableChannel, disableChannel | channels.configure, channels.enable, channels.disable |
| **Apps** | loadInstalledApps, loadInstalledAppMethods, installApp | apps.list, apps.methods |
| **Identity** | loadIdentitySurface, resolveIdentityMergeCandidate | identity.surface, identity.merge.resolve |
| **Memory** | loadMemoryRuns, loadMemoryRunEpisodes, runMemorySearch, loadMemoryQualitySummary | memory.review.runs, memory.review.episodes, memory.search |
| **Schedules** | loadScheduleRuns, toggleScheduleJob, runScheduleJob, addScheduleJob, removeScheduleJob | schedule.jobs.list, schedule.jobs.add, schedule.jobs.toggle, schedule.jobs.run, schedule.jobs.remove |
| **Config** | loadConfig, saveConfig, applyConfig | config.get, config.set, config.apply |
| **Ingress Credentials** | loadIngressCredentials, createIngressCredential, revokeIngressCredential, rotateIngressCredential | auth.tokens.list, auth.tokens.create, auth.tokens.revoke, auth.tokens.rotate |
| **Monitor** | loadMonitorHistory, loadMonitorStats | monitor.operations.list, monitor.operations.stats |
| **ACL** | loadAclRequests, approveAclRequest, denyAclRequest | acl.requests.list, acl.requests.resolve |

### Proof Bundle

Each test run produces a proof bundle:

```
operator-console-cleanroom-proof/
  <timestamp>/
    metadata.json       # runtime version, test count, duration
    results.json        # per-domain pass/fail/skip with details
    stdout.log          # full test output
    stderr.log          # errors
```

---

## Test Harness Architecture

### Boot Pattern

Follow the existing nex Docker cleanroom pattern from `nex/scripts/e2e/`:

1. Build the nex Docker image (reuse existing `scripts/e2e/Dockerfile`)
2. Start a disposable container with:
   - Isolated home and workspace
   - Skip optional subsystems (channels, gmail watcher, schedules, canvas, browser control)
   - Token auth enabled with a known test token
   - Loopback binding on a known port
3. Wait for runtime readiness (TCP poll)
4. Run the test suite via `callRuntime()` WebSocket JSON-RPC

### Test Runner

A single Node.js script that:

1. Connects to the runtime via WebSocket (reusing the `callRuntime()` pattern from existing cleanroom scripts)
2. Authenticates with the known test token
3. Runs each domain's tests sequentially
4. Reports results as structured JSON
5. Exits with code 0 (all pass) or 1 (any fail)

### Domain Test Pattern

Each domain test follows a standard pattern:

```typescript
async function testAgentsCRUD(call: CallRuntime): Promise<DomainResult> {
  const results: TestResult[] = [];

  // 1. List (should work even when empty)
  const list = await call("agents.list", {});
  results.push(assert("agents.list returns array", Array.isArray(list?.agents)));

  // 2. Create
  const created = await call("agents.create", { name: "test-agent" });
  results.push(assert("agents.create returns id", Boolean(created?.agentId || created?.id)));

  // 3. List again (should include new agent)
  const list2 = await call("agents.list", {});
  results.push(assert("agents.list includes created agent", list2?.agents?.length > list?.agents?.length));

  // 4. Update
  const updated = await call("agents.update", { agentId: created.agentId, description: "updated" });
  results.push(assert("agents.update succeeds", updated !== undefined));

  // 5. Delete
  const deleted = await call("agents.delete", { agentId: created.agentId });
  results.push(assert("agents.delete succeeds", deleted !== undefined));

  return { domain: "agents", results };
}
```

### What This Does NOT Test

- Browser rendering (covered by existing `*.browser.test.ts` component tests)
- CSS styling (covered by visual review against reference designs)
- User interaction flows (would need Playwright page-level tests, future work)
- Adapter OAuth flows (require real external credentials)
- Chat streaming (requires model provider credentials)

### What This DOES Test

- Every RPC method the console calls actually exists and responds
- Response shapes match what the console's TypeScript types expect
- CRUD lifecycles work end-to-end (create → list → update → delete)
- Error handling paths work (e.g., invalid params, missing resources)
- The runtime boots and serves the full API surface

---

## Integration with Existing Infrastructure

### Reuse

| Component | Source | How We Use It |
|-----------|--------|--------------|
| Docker image | `nex/scripts/e2e/Dockerfile` | Same image, same build |
| Boot pattern | `owner-first-agent-cleanroom-docker.sh` | Same env vars, same readiness poll |
| `callRuntime()` | Inline in existing scripts | Extract to shared module or inline |
| Proof capture | `capture-cleanroom-proof.sh` | Wrap our script with it |
| CI workflow | `.github/workflows/` | Add manual dispatch trigger |

### New

| Component | Location | Purpose |
|-----------|----------|---------|
| Test runner script | `nex/scripts/e2e/operator-console-integration-docker.sh` | Docker wrapper |
| Test suite | `nex/scripts/e2e/operator-console-integration.mts` | Node.js test runner |
| Capture wrapper | `nex/scripts/e2e/operator-console-integration-capture.sh` | Proof bundle |

---

## Validation Requirements

The work is complete when:

1. A single command boots nex in Docker and runs the operator console integration suite
2. Every domain listed in the test suite table has at least one passing test
3. CRUD lifecycles (agents, schedules, credentials, config) are proven end-to-end
4. The proof bundle captures structured pass/fail results
5. The test can be wrapped with `capture-cleanroom-proof.sh` for durable proof
6. The test is runnable from CI via manual dispatch
