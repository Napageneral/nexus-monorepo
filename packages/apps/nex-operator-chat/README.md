# Nex Operator Chat

This package owns the React microfrontend for the Nex operator console `Chat`
tab.

Current truth:

- the package contains useful vendored upstream `t3code` primitives
- it is not yet a true upstream fork of `apps/web`
- the active reset path is the upstream-fork reset described in
  `/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-t3code-true-fork-reset-board/README.md`
- a clean upstream package copy now exists at
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/upstream-apps-web`

Upstream provenance for the active reset:

- source reference: `/Users/tyler/nexus/home/projects/t3code`
- pinned reset commit: `28e481eb`

The intended long-term seams are:

- upstream app/package structure
- thin Nex runtime bridge
- thin Nex read-model adapter
- thin feature-policy layer for unsupported surfaces

The desired local changes are limited to:

- Nex-native `chat.*` bridge ownership
- lane and agent-group presentation remap
- removal or gating of unsupported IDE/git/terminal/diff/worktree surfaces
