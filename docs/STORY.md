# Nexus Story

Nexus is a personal AI workspace OS. It anchors an agent to your identity and
memory, gives it a reliable local control plane, and connects it to your tools
and accounts without leaking secrets. The experience is local-first, with
encrypted sync and optional collaboration.

## What Nexus Is

- **A local control plane**: the CLI runs on your machine and owns state,
  identity, memory, and skill discovery.
- **A skills system**: skills are guides. `nexus skill use` returns a guide,
  and tools are executed directly by the agent.
- **A secure credential layer**: credentials are stored as pointers (env,
  keychain, 1password) and verified per service.
- **A cloud sync engine**: encrypted backup + shared spaces without plaintext
  leaving the device.
- **A hub + taxonomy**: skills and capability taxonomy live in the website,
  with snapshots consumed by the CLI.

## How the Pieces Fit

- **`nexus-cli`** (local): workspace bootstrap, skill discovery, hooks/bindings,
  credential management, usage logging, and local services.
- **`nexus-cloud`** (sync): encrypted backup + shared spaces, daemon + CLI.
- **`nexus-website`** (hub): skills registry, taxonomy, audits, publishing.
- **`nexus-collab`** (realtime): shared presence + realtime space sync.

## The Core Loop

1. **Bind the agent**: Cursor sessionStart hook injects identity and memory.
2. **Discover capabilities**: `nexus status` and `nexus capabilities`.
3. **Read the guide**: `nexus skill use <name>` returns SKILL.md.
4. **Run the tool**: agent executes the tool directly.
5. **Track outcomes**: usage + verification state drive recommendations.

## Experience Goals

- **Local-first**: the agent can help even if cloud services are offline.
- **Secure by default**: secrets never leak into logs or docs.
- **Honest observability**: track guidance usage, not pretend to own execution.
- **Composable**: the same skill can be used by different agents or surfaces.
