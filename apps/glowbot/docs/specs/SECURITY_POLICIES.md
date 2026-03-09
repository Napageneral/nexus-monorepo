# GlowBot Security Policies

Date: 2026-02-26  
Applies to: frontdoor, clinic runtimes, hub runtime, adapters, operator workflows

## 1) Access Control Policy

1. All operator access is authenticated and role-scoped.
2. Privileged routes require operator/admin role checks.
3. Runtime tokens are short-lived and refreshable; revocation is supported.
4. Shared credentials and anonymous privileged access are prohibited.

## 2) Session and Transport Policy

1. Browser sessions use `HttpOnly`, `SameSite=Lax`, and `Secure` cookie attributes in secure contexts.
2. HSTS is enabled for secure traffic.
3. Public ingress must terminate TLS; plain HTTP exposure is not permitted for production.

## 3) Data Minimization Policy

1. GlowBot stores aggregate metrics and derived analytics only.
2. Persistent storage of direct patient identifiers is prohibited.
3. EMR adapters must transform to canonical aggregate metrics before persistence.
4. Any new adapter field that could identify a patient requires explicit security review before merge.

## 4) Secret Management Policy

1. Tokens and keys are stored via the credential system/pointers, not in plaintext docs.
2. Credential rotation must be supported per provider.
3. Logs and error payloads must not include raw secret values.

## 5) Logging and Audit Policy

1. Auth, token, and critical admin actions are logged with request IDs.
2. Security-relevant events are retained for incident investigation.
3. Changes affecting auth, credential handling, or EMR ingestion require traceable review notes.

## 6) Change Management Policy

1. All production-impacting changes require tests for the affected auth/data paths.
2. HIPAA/compliance-affecting changes require spec update and validation evidence.
3. Hard cutover is allowed; compatibility shims are not required for this program.

## 7) Incident Policy

1. Suspected incidents are handled under `BREACH_NOTIFICATION_PROCEDURE.md`.
2. Containment and evidence capture start immediately once a credible signal is identified.
3. External notifications follow legal and contractual timelines.

