# GlowBot Documentation

This tree owns GlowBot-specific product docs.

Shared governance and platform docs live in:

- [/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md](/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md)
- [/Users/tyler/nexus/home/projects/nexus/nex/docs/index.md](/Users/tyler/nexus/home/projects/nexus/nex/docs/index.md)
- [/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/README.md](/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/README.md)

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
- [GLOWBOT_PACKAGE_PUBLISH_AND_DEPLOY_REHEARSAL.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PACKAGE_PUBLISH_AND_DEPLOY_REHEARSAL.md)
- [GLOWBOT_SYNTHETIC_DEPLOYED_REHEARSAL.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_SYNTHETIC_DEPLOYED_REHEARSAL.md)
- [GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md)
- [GLOWBOT_HUB_SERVICE_SHELL.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_HUB_SERVICE_SHELL.md)
- [GLOWBOT_CLINIC_PROFILE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_CLINIC_PROFILE.md)
- [GLOWBOT_BENCHMARK_NETWORK.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_BENCHMARK_NETWORK.md)
- [GLOWBOT_DERIVED_OUTPUT_MODEL.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_DERIVED_OUTPUT_MODEL.md)
- [GLOWBOT_DERIVED_OUTPUT_MATERIALIZATION.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_DERIVED_OUTPUT_MATERIALIZATION.md)
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
- [NON_EMR_ADAPTER_PARITY_WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/workplans/NON_EMR_ADAPTER_PARITY_WORKPLAN.md)
- [IDENTITY_DB_SQLCIPHER_CUTOVER.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/workplans/IDENTITY_DB_SQLCIPHER_CUTOVER.md)

Dependency/supporting note:

- [IDENTITY_DB_SQLCIPHER_CUTOVER.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/workplans/IDENTITY_DB_SQLCIPHER_CUTOVER.md) is a cross-cutting runtime dependency plan, not the main GlowBot product workstream

Archived note:

- the earlier focused hub implementation note has been superseded by the active
  [WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/workplans/WORKPLAN.md) and now belongs in
  [docs/archive/workplans](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/archive/workplans)
- the focused Nex runtime realignment note also now belongs in
  [docs/archive/workplans](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/archive/workplans)
- the focused package publish/deploy rehearsal note is complete and now belongs
  in [docs/archive/workplans](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/archive/workplans)
- the focused synthetic deployed rehearsal note is complete and now belongs in
  [docs/archive/workplans](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/archive/workplans)
- the focused derived-output materialization note is complete and now belongs
  in [docs/archive/workplans](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/archive/workplans)
- the adapter-package install cutovers are complete and archived inside each
  adapter package; the active non-EMR workplan now tracks only live credential
  validation for first-clinic readiness

### Validation

- [VALIDATION_LADDER.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/validation/VALIDATION_LADDER.md)
- [LIVE_CREDENTIAL_CUTOVER_RUNBOOK.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/validation/LIVE_CREDENTIAL_CUTOVER_RUNBOOK.md)

### Proposals

- [GOG_ADS_EXTENSION.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/proposals/GOG_ADS_EXTENSION.md)

## External Canon

- [spec-driven-development-workflow.md](/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md)
- [Nex Docs Index](/Users/tyler/nexus/home/projects/nexus/nex/docs/index.md)
- [App Manifest and Package Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/apps/app-manifest-and-package-model.md)
- [Platform Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/platform-model.md)
- [Platform Runtime Access and Routing](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/runtime-access-and-routing.md)
- [Platform Packages and Control Planes](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/packages-and-control-planes.md)
- [Managed Connection Gateway](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/managed-connection-gateway.md)
- [Adapter Connections](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/adapters/adapter-connections.md)
- [Jobs, Schedules, and DAGs](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/work/jobs-schedules-and-dags.md)
- [Daemon and Runtime Dispatch](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/work/daemon-and-runtime-dispatch.md)
- [FRONTDOOR_SHELL_AND_EMBEDDED_APP_MODEL.md](/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/specs/FRONTDOOR_SHELL_AND_EMBEDDED_APP_MODEL.md)
