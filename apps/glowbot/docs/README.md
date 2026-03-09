# GlowBot Documentation

This repository follows the canonical Nexus spec-driven workflow:

- `specs/` contains active target-state product and operating specs
- `workplans/` contains active gap-closure and cutover plans
- `validation/` contains active validation ladders and runbooks
- `proposals/` contains exploratory or upstream proposal material
- `archive/` contains superseded or historical material

Status note:

- `specs/` is the active target-state canon for GlowBot inside the authoritative
  app package
- `workplans/` and `validation/` have been refreshed against the current
  app-tree implementation state
- one-off cutover and gap-analysis artifacts that no longer describe active
  execution should live in `archive/`, not in the active lists below

## Active Documents

### Specs

- [ADAPTERS.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/ADAPTERS.md)
- [GLOWBOT_PACKAGE_TOPOLOGY.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PACKAGE_TOPOLOGY.md)
- [GLOWBOT_OBJECT_TAXONOMY.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_OBJECT_TAXONOMY.md)
- [GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md)
- [GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md)
- [GLOWBOT_HUB_SERVICE_SHELL.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_HUB_SERVICE_SHELL.md)
- [GLOWBOT_CLINIC_PROFILE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_CLINIC_PROFILE.md)
- [GLOWBOT_BENCHMARK_NETWORK.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_BENCHMARK_NETWORK.md)
- [GLOWBOT_DERIVED_OUTPUT_MODEL.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_DERIVED_OUTPUT_MODEL.md)
- [GLOWBOT_ADMIN_SURFACE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_ADMIN_SURFACE.md)
- [DATA_PIPELINE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/DATA_PIPELINE.md)
- [CENTRAL_HUB.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/CENTRAL_HUB.md)
- [GLOWBOT_HUB_AND_ADMIN_CONTRACT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_HUB_AND_ADMIN_CONTRACT.md)
- [LLM_SKILL.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/LLM_SKILL.md)
- [HIPAA_COMPLIANCE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/HIPAA_COMPLIANCE.md)
- [SECURITY_POLICIES.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/SECURITY_POLICIES.md)
- [RISK_ASSESSMENT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/RISK_ASSESSMENT.md)
- [SECURITY_OFFICER.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/SECURITY_OFFICER.md)
- [BREACH_NOTIFICATION_PROCEDURE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/BREACH_NOTIFICATION_PROCEDURE.md)

### Workplans

- [WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/workplans/WORKPLAN.md)
- [IDENTITY_DB_SQLCIPHER_CUTOVER.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/workplans/IDENTITY_DB_SQLCIPHER_CUTOVER.md)

Dependency/supporting note:

- [IDENTITY_DB_SQLCIPHER_CUTOVER.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/workplans/IDENTITY_DB_SQLCIPHER_CUTOVER.md) is a cross-cutting runtime dependency plan, not the main GlowBot product workstream

Archived note:

- the earlier focused hub implementation note has been superseded by the active
  [WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/workplans/WORKPLAN.md) and now belongs in
  [docs/archive/workplans](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/archive/workplans)

### Validation

- [VALIDATION_LADDER.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/validation/VALIDATION_LADDER.md)
- [LIVE_CREDENTIAL_CUTOVER_RUNBOOK.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/validation/LIVE_CREDENTIAL_CUTOVER_RUNBOOK.md)

### Proposals

- [GOG_ADS_EXTENSION.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/proposals/GOG_ADS_EXTENSION.md)

## External Canon

- [SPEC_DRIVEN_DEVELOPMENT_WORKFLOW.md](/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/SPEC_DRIVEN_DEVELOPMENT_WORKFLOW.md)
- [NEX_APP_MANIFEST_AND_PACKAGE_MODEL.md](/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/NEX_APP_MANIFEST_AND_PACKAGE_MODEL.md)
- [HOSTED_APP_PLATFORM_CONTRACT.md](/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/hosted/HOSTED_APP_PLATFORM_CONTRACT.md)
- [HOSTED_PLATFORM_ACCESS_AND_ROUTING.md](/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/hosted/HOSTED_PLATFORM_ACCESS_AND_ROUTING.md)
- [FRONTDOOR_SHELL_AND_EMBEDDED_APP_MODEL.md](/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/specs/FRONTDOOR_SHELL_AND_EMBEDDED_APP_MODEL.md)
