# GlowBot - HIPAA Compliance and Data Boundary

> Canonical HIPAA posture, PHI boundary, subcontractor posture, and data
> minimization rules for GlowBot deployments that touch clinic EMR data.

---

## 1. Purpose

This document defines the canonical HIPAA operating model for GlowBot.

It exists to make six things explicit:

1. which GlowBot surfaces may touch PHI
2. which GlowBot surfaces must remain PHI-poor
3. what EMR data is allowed inside the clinic runtime
4. what data may leave the clinic boundary
5. how clinic-local attribution with patient email works
6. where HIPAA marketing and authorization risk begins

This document is the active GlowBot canon for HIPAA-sensitive deployments.

---

## 2. Customer Experience

The intended customer experience is:

1. a clinic uses GlowBot on its own durable clinic server
2. that clinic server may access a limited set of EMR data needed for local
   analytics and clinic-local attribution
3. the clinic never has to reason about raw EMR payloads leaving its runtime
4. GlowBot hub and GlowBot admin never need patient-level PHI
5. frontdoor remains a secure hosted gateway and launch shell, not a PHI data
   store
6. the model layer receives benchmark-safe, clinic-safe intelligence inputs,
   not raw PHI

From the clinic's perspective, GlowBot should feel useful without turning into
a PHI-heavy marketing system.

---

## 3. What HIPAA Requires Here

A clinic is a covered entity.
When GlowBot creates, receives, maintains, or transmits PHI on the clinic's
behalf, GlowBot is a business associate.

That means GlowBot needs:

1. a BAA with each clinic
2. HIPAA-appropriate safeguards across the PHI-bearing parts of the platform
3. subcontractor coverage for any vendor that actually hosts or processes PHI
4. a minimum-necessary data posture rather than defaulting to "pull everything"
5. a clear line between clinic-local analytics and patient-facing marketing

No certification is required by HIPAA itself.
The requirement is reasonable and appropriate safeguards plus enforceable
policies and operating discipline.

---

## 4. Canonical PHI Boundary

GlowBot uses a strict PHI boundary.

### 4.1 PHI-bearing surface

The clinic runtime is the PHI-bearing surface.

That includes:

- EMR adapter fetch/transformation logic
- clinic-local data needed for clinic-local attribution
- clinic-local persistence that holds PHI or PHI-derived join artifacts
- clinic-local background jobs operating on those artifacts

### 4.2 PHI-poor surfaces

These surfaces must remain PHI-poor by design:

- `glowbot-hub`
- `glowbot-admin`
- frontdoor
- browser-delivered GlowBot shell
- model prompts and model responses

Meaning:

1. they must not persist raw patient identifiers
2. they must not persist appointment-level EMR rows
3. they must not publish or retain raw EMR payloads
4. they must not receive patient email as a normal contract field

### 4.3 Frontdoor boundary rule

Frontdoor is a secure blind relay boundary for hosted routing and auth.

Canonical rule:

1. frontdoor must not become a semantic PHI processor
2. frontdoor must not store PHI-bearing request bodies
3. frontdoor must not log PHI-bearing payloads
4. frontdoor must not hold product secrets that would let it meaningfully use
   routed PHI payloads
5. if future implementation requires frontdoor to inspect or persist PHI, this
   document's PHI-poor assumption is broken and the hosting / BAA posture must
   be reevaluated immediately

---

## 5. Canonical Data Posture

GlowBot does not use "all EMR data."
GlowBot uses the minimum EMR data necessary for clinic analytics and
clinic-local attribution.

### 5.1 Allowed inside the clinic runtime

The clinic runtime may access and process:

- aggregate appointment and revenue metrics
- procedure or service category such as `botox`, `filler`, `microneedling`
- patient cohorts and coarse demographics when needed for clinic analytics
- patient email for clinic-local attribution only

GlowBot does not need appointment-level persistence as part of the canonical
product contract.

### 5.2 Explicit cohort-data rule

When GlowBot uses cohort data, it must keep it coarse.

Canonical rules:

- age bands, not birth dates
- coarse geography, not full address
- procedure category, not narrative notes
- minimum cohort-size rules before anything leaves the clinic boundary

This is the required posture for cross-clinic benchmark publication and hub
aggregation.

### 5.3 What may leave the clinic runtime

Only benchmark-safe and clinic-safe outputs may leave the clinic runtime.

Examples:

- aggregate performance metrics
- attribution totals
- conversion rates
- benchmark-safe cohort bands
- clinic profile bands used for cohorting
- recommendations and derived analytics that do not expose patient identity

### 5.4 What must not leave the clinic runtime

These must never leave the clinic runtime as normal GlowBot product data:

- raw patient email
- patient name
- birth date
- full address
- appointment-level EMR rows
- narrative notes
- raw EMR record payloads
- patient-level attribution join tables

---

## 6. Clinic-Local Attribution With Email

GlowBot is allowed to use patient email for clinic-local attribution only.
GlowBot is not using patient email to run patient-facing marketing.
GlowBot treats clinic-local attribution and marketing-performance analysis as a
clinic operations / data-analysis function, not as a patient-facing marketing
workflow.

Canonical attribution pattern:

1. ingest email only inside the clinic runtime
2. normalize and match it against lead-funnel identities there
3. immediately tokenize it with a clinic-scoped HMAC
4. treat even that tokenized join table as PHI-scoped
5. encrypt it at rest
6. keep short retention
7. never publish it to hub, frontdoor, or the model layer
8. persist only aggregate attribution outputs long-term

Implications:

1. raw email is never part of the hub benchmark network contract
2. raw email is never part of a frontdoor contract
3. raw email is never part of a browser-visible API
4. attribution value is captured without turning GlowBot into a PHI-heavy
   marketing engine

---

## 7. Marketing Boundary

GlowBot's canonical HIPAA posture is:

1. clinic-local analytics and attribution are in scope
2. patient-facing marketing workflows based on EMR-derived PHI are out of scope
   for the current product boundary

Canonical non-goals:

- using EMR-derived patient emails to send targeted promotional emails
- disclosing EMR-derived identifiers to ad platforms, ESPs, or other marketing
  vendors for promotional use
- persisting patient-level marketing audiences in GlowBot hub or frontdoor

GlowBot may help a clinic understand marketing performance.
GlowBot is not the system that uses EMR-derived PHI to run outbound patient
marketing campaigns.

If GlowBot ever expands into HIPAA-regulated patient-facing marketing, that
requires a new explicit spec, a new authorization model review, and legal sign
off.

---

## 8. Hosting and Subcontractor Posture

### 8.1 AWS

HIPAA-sensitive clinic runtimes run on AWS under the AWS BAA path.

Why AWS is the canonical PHI-bearing target:

1. AWS provides the standard BAA path
2. AWS supports the backup, recovery, encryption, and access-control posture
   required for durable clinic servers
3. AWS also provides the Bedrock path for model access inside the same broader
   compliance story

### 8.2 Bedrock

The model path for HIPAA-sensitive clinic deployments is Amazon Bedrock.

Canonical rule:

1. no PHI is sent to the model layer by default
2. Bedrock is the approved model boundary when a HIPAA-sensitive deployment
   needs hosted model access
3. direct provider API usage outside the approved hosted boundary is not the
   target-state HIPAA posture

### 8.3 Hub and admin

`glowbot-hub` and `glowbot-admin` are designed to remain PHI-poor.

They may hold:

- product-managed secrets
- benchmark-safe summaries
- cohort definitions
- operator diagnostics

They must not hold:

- raw patient identifiers
- appointment-level PHI
- raw EMR exports

### 8.4 Frontdoor and UI

The frontdoor boundary is:

- secure
- security-critical
- PHI-poor by contract

The GlowBot browser shell or static UI host may remain outside the PHI-bearing
AWS boundary only if the no-PHI boundary is actually preserved in practice.

That means:

1. no PHI in request or response bodies handled there as stored application
   data
2. no PHI in logs
3. no PHI-bearing browser contracts
4. no product design that depends on those surfaces storing clinic PHI

If that boundary cannot be proven, those surfaces must move into the AWS BAA
boundary.

---

## 9. Encryption and Storage Requirements

### 9.1 Clinic runtime

The PHI-bearing clinic runtime requires:

- encryption in transit
- encryption at rest for PHI-bearing runtime stores
- strong access control
- auditability
- log hygiene
- backup and recovery
- patching
- prompt redaction

This is the primary HIPAA engineering boundary for GlowBot.

### 9.2 PHI-bearing persistence rule

Any clinic-local store that can hold:

- raw patient email
- PHI-derived attribution join artifacts
- patient-level cohort membership
- raw EMR transform artifacts before minimization

must be treated as PHI-bearing and encrypted at rest.

This means the old posture of treating all `memory.db`-class product data as
non-PHI is no longer sufficient once clinic-local attribution exists.

### 9.3 Long-term persistence rule

GlowBot's long-term persistence target is still minimized:

- aggregate metrics
- aggregate attribution outputs
- benchmark-safe cohort bands
- derived analytics

Raw identifier-bearing data should be short-lived and local only.

---

## 10. Current Technical Safeguard Status

Audit of the current Nex runtime and hosted surfaces:

| # | Safeguard | Status | Details |
|---|-----------|--------|---------|
| 1 | Encryption in transit (TLS) | PARTIAL | Public ingress has TLS posture, but the active HIPAA question is end-to-end enforcement across all PHI-bearing deployment paths. |
| 2 | Encryption at rest | PARTIAL | Credential pointers and token hashing exist. PHI-bearing runtime stores still need full at-rest coverage. |
| 3 | Access controls (Auth/RBAC) | IMPLEMENTED | Hosted auth, role checks, session TTLs, and runtime token minting exist. |
| 4 | Audit logging | PARTIAL | Structured logs exist, but HIPAA-grade PHI access audit and redaction posture still needs explicit audit review. |
| 5 | Unique user identification | IMPLEMENTED | Unique identities and session tracking exist. |
| 6 | Automatic session timeout | IMPLEMENTED | Runtime/session TTL controls exist. |
| 7 | Emergency access procedures | PARTIAL | Break-glass concepts exist, but formal audited emergency procedure still needs full closure. |
| 8 | Activity logging and monitoring | PARTIAL | Centralized monitoring, alerting, and PHI-safe log posture still need explicit runtime review. |

This document does not claim HIPAA signoff for the runtime.
It defines the target boundary that the runtime audit must measure against.

---

## 11. BAA Posture

### 11.1 GlowBot with clinics

GlowBot needs a BAA with each clinic whose PHI-bearing EMR data is used by the
product.

### 11.2 Required permitted-use framing

The BAA and related product materials should frame GlowBot's use as:

- clinic-local analytics
- clinic-local attribution
- clinic-local marketing-performance analysis
- aggregate reporting
- benchmark-safe summary publication

The BAA should not frame GlowBot as a patient-facing marketing engine using
EMR-derived identifiers.

### 11.3 Subcontractors

Subcontractor posture follows the actual PHI boundary:

- AWS: required for PHI-bearing clinic deployments
- Bedrock through AWS: approved hosted model path
- frontdoor/UI hosts: only require HIPAA subcontractor treatment if the PHI
  boundary is not actually maintained there

---

## 12. Model Boundary

The model layer receives:

- aggregate metric values
- attribution totals
- conversion rates
- benchmark-safe cohort summaries
- peer benchmark data
- derived product analytics

The model layer does not receive:

- raw patient email
- patient names
- patient-level EMR rows
- appointment-level records
- narrative notes

No PHI is sent to the LLM as part of the canonical GlowBot HIPAA posture.

---

## 13. Remediation Priorities

### Priority 1: Required before HIPAA-sensitive EMR deployments

- formal runtime HIPAA audit against this boundary
- encryption at rest for PHI-bearing runtime stores
- clinic-local attribution implementation with HMAC tokenization and short
  retention
- log redaction review for PHI-bearing code paths
- Bedrock-only hosted model posture for HIPAA-sensitive deployments
- AWS-backed PHI-bearing clinic deployment path

### Priority 2: Strongly recommended

- immutable or otherwise well-governed audit trail for PHI access and admin
  actions
- centralized alerting and monitoring for security-relevant events
- tested backup and restore drills for PHI-bearing clinic runtimes
- explicit frontdoor/UI boundary verification proving no PHI persistence there

### Priority 3: Follow-on maturity

- formal legal review of any future patient-facing marketing feature
- external security assessment for the PHI-bearing runtime path

---

## 14. Compliance Checklist

Before a HIPAA-sensitive EMR deployment is considered ready:

- [ ] BAA signed with each clinic
- [ ] AWS BAA path accepted and active
- [ ] runtime HIPAA audit completed against this spec
- [ ] PHI-bearing runtime stores encrypted at rest
- [ ] clinic-local attribution tokenization and retention behavior implemented
- [ ] hub/admin validated as PHI-poor
- [ ] frontdoor validated as PHI-poor
- [ ] no PHI in model prompts or model outputs
- [ ] benchmark publication emits only benchmark-safe summaries and coarse
      cohort bands
- [ ] minimum cohort-size rule enforced before any data leaves the clinic
      runtime
- [ ] breach and incident procedures documented

Related documents:

- [SECURITY_POLICIES.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/SECURITY_POLICIES.md)
- [RISK_ASSESSMENT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/RISK_ASSESSMENT.md)
- [SECURITY_OFFICER.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/SECURITY_OFFICER.md)
- [BREACH_NOTIFICATION_PROCEDURE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/BREACH_NOTIFICATION_PROCEDURE.md)
- [GLOWBOT_HUB_AND_ADMIN_CONTRACT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_HUB_AND_ADMIN_CONTRACT.md)
- [GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md)
- [GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md)
