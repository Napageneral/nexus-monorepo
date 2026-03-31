# AIL-004 Website Input Package And Install Contract

## Status

Completed.

## Outcome

The shared website input package and install contract is now defined through:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-website-input-package-and-install-contract.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/validation/attribution-website-input-install-and-proof-workflow.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/website-input-package-board/README.md`

## Resolution

The target-state website input package family is now locked around:

- `website-input-core`
- `website-input-collector`
- `website-input-gtm`
- `website-input-qa`
- environment wrappers such as `website-input-wix`
- backend bridge extensions such as Shopify today and EMR-style bridges later

The operator workflow is now explicit for:

- custom-code hosted websites
- Wix installs
- bridge-capable versus baseline-only installs
- companion pixel ownership during one-shot website instrumentation

Execution has been decomposed into the dedicated Website Input Package Board.
