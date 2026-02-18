# Onboarding Specification

**Canonical lifecycle spec:** `specs/environment/foundation/WORKSPACE_LIFECYCLE.md`

**Status:** ALIGNED WITH `WORKSPACE_LIFECYCLE.md`
**Last Updated:** 2026-02-17

---

## Overview

Onboarding is an agent conversation flow, not a CLI wizard.

After `nexus init` + `nexus start`, the user opens their workspace in an agent harness. The system is **always in MWP mode** (Manager-Worker Pattern) from the very first message. There is no unified mode fallback. The MA reads `AGENTS.md`, detects first-run state via bootstrap detection, and executes onboarding using the content of `state/agents/BOOTSTRAP.md`.

---

## Onboarding Flow

### 1. Bootstrap detection

The MA checks whether `state/agents/` contains any subdirectories.

```typescript
function needsBootstrap(stateDir: string): boolean {
  const agentsDir = path.join(stateDir, 'agents');
  const entries = fs.readdirSync(agentsDir);
  const agentDirs = entries.filter(e =>
    fs.statSync(path.join(agentsDir, e)).isDirectory()
  );
  return agentDirs.length === 0;
}
```

If `state/agents/` contains only the `BOOTSTRAP.md` file (no agent persona directories), bootstrap is needed.

`BOOTSTRAP.md` is **permanent**. It is never deleted. It is a reusable template for creating new agent personas at any time.

### 2. Context injection

When `assembleContext` detects `needsBootstrap() === true`, it reads `state/agents/BOOTSTRAP.md` and injects its content into the MA's system prompt as an `## Onboarding` section.

```typescript
const needsBootstrap = !hasAgentPersonaDirs(stateDir);
if (needsBootstrap) {
  const bootstrapContent = fs.readFileSync(
    path.join(stateDir, 'agents/BOOTSTRAP.md'), 'utf8'
  );
  systemPromptSections.push(`## Onboarding\n${bootstrapContent}`);
}
```

The MA operates without a persona during onboarding. It still receives `AGENTS.md` (workspace rules), broker role instructions, and its MWP toolset (`agent_send`, `wait`, `read`, `write`, `edit`, etc.). Identity/soul sections are simply empty until the persona is created.

### 3. Parallel worker dispatch

The MA dispatches workers in parallel during onboarding:

| Worker | Task | Notes |
|--------|------|-------|
| Worker A | Run `nexus credential scan` and report findings | Agent-driven env var scan; results presented to user for confirmation before import |
| Worker B | Run filesystem scan skill (if available) | Discovers workspace structure and project context |
| Worker C | Write identity files to canonical paths | Dispatched when enough information has been gathered from the user |

The MA also conducts an identity-first conversation with the user to establish agent identity, tone, and user preferences. This conversation provides the input for Worker C.

### 4. Write identity files

Worker C writes identity files to canonical paths:

| File | Path | Purpose |
|------|------|---------|
| Agent IDENTITY | `state/agents/{name}/IDENTITY.md` | Agent identity markers |
| Agent SOUL | `state/agents/{name}/SOUL.md` | Agent persona, boundaries, values |
| User IDENTITY | `state/user/IDENTITY.md` | User profile and preferences |

### 5. Credential scan results

Worker A returns credential scan findings to the MA. The MA presents them to the user for confirmation before import:

> "I found ANTHROPIC_API_KEY and GITHUB_TOKEN in your environment. Want me to import them?"

On confirmation, the MA dispatches a worker to run `nexus credential scan --import`.

**Note:** External CLI auto-sync (Claude CLI, Codex CLI, Qwen CLI) happens at **runtime startup** (Phase 2 of the lifecycle), not during onboarding. The onboarding credential scan covers the broader environment variable scan.

### 6. Cortex entity seeding

The runtime seeds a placeholder owner entity at startup. During onboarding, the **memory-writer meeseeks** observes the identity conversation and enriches the owner entity with real details. The agent persona entity is also created by the memory-writer when it observes identity data.

No special seeding logic is needed beyond the initial owner placeholder.

---

## Completion Signal

Onboarding is complete when at least one directory exists in `state/agents/` containing an `IDENTITY.md` file.

```typescript
function isOnboarded(stateDir: string): boolean {
  const agentsDir = path.join(stateDir, 'agents');
  const entries = fs.readdirSync(agentsDir);
  return entries.some(e => {
    const dir = path.join(agentsDir, e);
    return fs.statSync(dir).isDirectory()
      && fs.existsSync(path.join(dir, 'IDENTITY.md'));
  });
}
```

On the next `chat.send`, `assembleContext` sees that a persona exists, does NOT inject onboarding instructions, and loads the persona's `IDENTITY.md` and `SOUL.md` into the MA's system prompt. Normal MWP operation begins.

---

## What Is Deferred

Bootstrap does not require full infrastructure configuration.

Common deferred controls:
- `runtime.port`
- `runtime.bind`
- model defaults
- provider-specific credentials

These are adjusted later via `nexus config` and domain-specific commands.

---

## Additional Agents

Additional agents are created by repeating the bootstrap identity flow. The `BOOTSTRAP.md` template is always available for this purpose. The MA reads the template, conducts an identity conversation, and writes another `state/agents/{name}/` identity pair.

---

## Directory Concepts

Two directory structures serve different purposes. They are hierarchical, not interchangeable.

### Agent Personas (`state/agents/{name}/`)

Define **who the agent is** -- identity, personality, values, boundaries.

- Created during onboarding conversation
- One directory per named agent persona
- Applied as the "who am I" layer during context assembly

### Automation Workspaces (`state/workspace/{name}/`)

**Accumulated knowledge stores** for a specific function/role (memory-reader, memory-writer, etc.).

- Created by the automation seeder at runtime startup
- One directory per automation that has `workspace_dir` set
- Personas are applied ON TOP of workspaces during execution

---

## Notes

- There is no TOOLS.md in the nexus system.
- There is no unified mode. The system is always MWP from the first message.
- Use runtime/control-plane terminology; gateway naming is non-canonical.
- Keep onboarding focused on identity and readiness, not exhaustive configuration.

---

## Related Specifications

- `WORKSPACE_LIFECYCLE.md` -- Canonical lifecycle spec (authoritative)
- `WORKSPACE_SYSTEM.md`
- `BOOTSTRAP_FILES_REFERENCE.md`
- `INIT_REFERENCE.md`
- `WORKSPACE_LAYOUT_REFERENCE.md`
