# GlowBot HIPAA Risk Assessment

Date: 2026-02-26  
Owner: Security Officer (see `SECURITY_OFFICER.md`)

## 1) Scope

This assessment covers:

1. Frontdoor authentication/session handling.
2. GlowBot clinic runtime data pipeline and storage.
3. EMR and ad-platform adapters used for ingestion.
4. Hub/admin provisioning and credential exchange flows.

Goal: protect clinic trust and prevent patient-identifiable data leakage while delivering daily growth analytics.

## 2) Data Classification

1. Restricted:
   - OAuth tokens, API keys, runtime auth tokens, refresh tokens.
2. Sensitive:
   - Clinic business metrics (revenue, conversion, appointment counts).
3. Prohibited for persistence in GlowBot:
   - Patient names, contact info, DOB, insurance identifiers, raw chart notes.

## 3) Threat Register

| ID | Threat | Likelihood | Impact | Current Controls | Residual Risk |
|---|---|---|---|---|---|
| R1 | Session theft via insecure cookie transport | Medium | High | Secure cookie support + SameSite + HttpOnly + TLS requirement | Low |
| R2 | MITM or downgrade on browser-facing traffic | Medium | High | HSTS + TLS reverse proxy requirement | Low |
| R3 | Over-collection of PHI by EMR adapters | Medium | High | Aggregate-only mapping + adapter tests guarding metadata surface | Medium |
| R4 | Compromise of stored credentials | Medium | High | Credential pointer model + token hashing + least-privileged secrets | Medium |
| R5 | Unauthorized operator/admin actions | Low | High | AuthN + RBAC + scoped runtime tokens + audit events | Low |
| R6 | Data loss from runtime or host failure | Medium | Medium | Deterministic recomputation pipeline + recoverable adapter backfills | Medium |
| R7 | Slow incident response or under-reporting | Low | High | Documented breach process with explicit owner and deadlines | Low |
| R8 | Plaintext identity ledger exfiltration | Medium | High | File permissions + host boundaries (SQLCipher pending) | Medium |

## 4) Current Top Risks

1. `R3` adapter drift: future adapter changes could accidentally include identifying fields.
2. `R4` credential concentration: multiple provider tokens remain high-value targets.
3. `R8` identity ledger encryption gap: SQLCipher cutover not yet complete.

## 5) Mitigation Plan

1. Keep aggregate-only test gates mandatory in EMR adapter CI.
2. Require security review for any adapter field/model changes.
3. Complete SQLCipher design + rollout for `identity.db` before broad EMR production rollout.
4. Maintain breach-notification runbook drills quarterly.

## 6) Acceptance

Residual risk is accepted for current development/limited rollout with the documented controls above.  
Full EMR production scale is gated on SQLCipher completion and completed external legal/BAA milestones.

