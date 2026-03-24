---
name: console
description: Use the Operator Console app package for the browser-based operator control panel over a live Nex runtime. Treat it as an app-owned UI surface, not kernel-owned UI.
---

# Operator Console

Use the Operator Console package when the task is about the browser UI used to operate a live Nex runtime.

## Use Operator Console For

- browser-based operator workflows
- runtime status and control panel UX
- operator-facing chat, sessions, schedules, and usage views
- validating the packaged browser app surface for `console`

## Do Not Use Operator Console For

- changing core runtime APIs or auth semantics in `nex`
- treating the browser UI as a built-in kernel surface
- bypassing the runtime and talking directly to package internals

## Core Rules

1. The operator console is an app package, not a kernel-owned UI subtree.
2. The runtime owns hosting, auth, routing, install, and discovery.
3. The app owns browser assets and operator-facing UI behavior.
4. `/app/console/...` is app land, not a built-in transport noun.
