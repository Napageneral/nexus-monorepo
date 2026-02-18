# Nexus CLI Commands Specification

**Status:** CANONICAL (Environment Contract)  
**Last Updated:** 2026-02-12  
**Source of Truth:** `nex` project CLI surfaces

---

## Overview

This document defines canonical CLI grammar and ownership boundaries.

Key rules:
- CLI ownership is in `nex`.
- Orientation commands stay at root (`nexus status`, capability discovery).
- Runtime/control-plane operations live under explicit runtime namespaces (`nexus runtime ...`, domain subcommands).
- `gateway` naming is non-canonical.

---

## Canonical Command Tree

```bash
nexus
├── status
├── capabilities
├── identity [target]
├── skills
│   ├── list
│   ├── use <name>
│   ├── info <name>
│   ├── scan
│   ├── verify <name>
│   └── stats [name]
├── credential
│   ├── list
│   ├── add
│   ├── import <source>
│   ├── get <service/account>
│   ├── verify <service>
│   ├── scan [--deep]
│   ├── flag <service/account>
│   ├── expose
│   ├── revoke
│   └── remove <service/account>
├── config
│   ├── list
│   ├── get <key>
│   └── set <key> <value>
├── init [--workspace <path>]
├── runtime
│   ├── health
│   ├── status
│   ├── call <method>
│   ├── wake
│   ├── send
│   ├── agent
│   ├── stop
│   ├── restart
│   └── uninstall
├── runtime-daemon
├── hooks
├── automation
├── acl
└── nex
```

The tree above is canonical grammar intent. Additional domain subcommands can exist, but must preserve boundary semantics described below.

---

## Grammar Boundary

### Orientation plane (root)

Root commands answer:
- who am I?
- what can I do?
- what should I do next?

Canonical examples:
- `nexus status`
- `nexus capabilities`
- `nexus identity`
- `nexus skills ...`
- `nexus credential ...`
- `nexus config ...`

### Runtime/control-plane

Runtime commands answer:
- is the runtime healthy?
- what is the process/service state?
- execute runtime method/event/message operations

Canonical examples:
- `nexus runtime health`
- `nexus runtime status`
- `nexus runtime call ...`
- `nexus runtime wake`

Domain control-plane command groups (`hooks`, `automation`, `acl`, `nex`) are part of this plane.

---

## Command Groups

### `nexus status`

Orientation summary: identity, readiness, capabilities, and suggested next actions.

### `nexus capabilities`

Capability map and filtered readiness states.

### `nexus skills ...`

Skill discovery and usage metadata. Skills remain documentation-first; tool execution happens directly in shell/tooling.

### `nexus credential ...`

Credential indexing, verification, import, and exposure controls.

### `nexus config ...`

Read/write operations for canonical config in `state/nexus/config.json`.

### `nexus runtime ...`

Runtime control-plane operations and operational status.

### `nexus hooks ...`

Hook lifecycle and invocation controls.

### `nexus automation ...`

Automation lifecycle and trigger management.

### `nexus acl ...`

ACL policy/grant/audit management operations.

### `nexus nex ...`

NEX runtime pipeline-specific controls and diagnostics.

---

## Configuration Contract

### Canonical config path

`~/nexus/state/nexus/config.json`

### Config key namespaces

Representative namespaces:
- `agent.*`
- `credentials.*`
- `runtime.*`
- `hooks.*`
- `automation.*`
- `acl.*`
- `channels.*`
- `cortex.*`

### Non-canonical forms

The following are non-canonical in this contract:
- split config files by subsystem (`state/agents/config.json`, `state/credentials/config.json`, `state/gateway/config.json`)
- legacy single-file state-root config names

---

## Terminology

Use these terms in CLI help/docs:
- **Runtime**
- **Control-plane**

Avoid canonical use of:
- **Gateway**

---

## Implementation Alignment Notes

- If legacy `gateway` symbols still exist in code paths, they should be treated as implementation debt, not spec terminology.
- Command surfaces should converge to runtime/control-plane naming for help text, docs, and tests.

---

## Source Reference

- `nex/src/cli/`
- `nex/src/commands/`
- `nex/src/nex/`
- `specs/environment/foundation/RUNTIME_REALIGNMENT_DECISIONS.md`

