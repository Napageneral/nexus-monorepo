# GlowBot Breach Notification Procedure

Date: 2026-02-26  
Owner: Security Officer

## 1) Trigger Conditions

This procedure is triggered when there is a credible indication of:

1. Unauthorized access to restricted/sensitive data.
2. Unauthorized disclosure of clinic data.
3. Loss or compromise of secrets that could enable unauthorized access.

## 2) First-Hour Actions

1. Open incident record with timestamp, reporter, and summary.
2. Assign incident commander (Security Officer or delegate).
3. Contain affected surface:
   - rotate/revoke tokens,
   - disable affected integration paths,
   - isolate compromised hosts/services if needed.
4. Preserve evidence:
   - logs,
   - request IDs,
   - relevant config/state snapshots.

## 3) Triage and Classification (Within 24 Hours)

1. Determine affected systems and time window.
2. Determine whether PHI or restricted data was involved.
3. Estimate impacted clinics/servers and data categories.
4. Document confidence level and unresolved unknowns.

## 4) Notification Timeline

1. Internal executive/security notification: immediate.
2. Clinic notification target: within 30 days of confirmed breach discovery.
3. Legal/regulatory reporting: per HIPAA and contractual obligations.
4. If facts are incomplete, send an initial notice with known impact and follow-up commitment.

## 5) Notification Contents

1. What happened (plain language + dates).
2. Data categories potentially impacted.
3. Containment and remediation already executed.
4. Required actions for the clinic (credential rotation, monitoring, etc.).
5. Point of contact for follow-up.

## 6) Post-Incident Requirements

1. Root cause analysis and corrective action list.
2. Security control updates and regression tests.
3. Risk assessment update.
4. Leadership sign-off on closure.
