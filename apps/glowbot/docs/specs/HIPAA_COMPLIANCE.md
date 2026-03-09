# GlowBot — HIPAA Compliance & Data Privacy

> BAA requirements, technical safeguards, PHI minimization, and the required operating model for GlowBot deployments handling clinic data.

---

## 1. What HIPAA Requires

A clinic is a **Covered Entity**. When they share patient health information (PHI) with GlowBot, we become a **Business Associate**. HIPAA requires:

1. **BAA (Business Associate Agreement)** signed between GlowBot and each clinic
2. **Technical safeguards** — encryption, access controls, audit logging
3. **Administrative safeguards** — policies, risk assessment, security officer
4. **Physical safeguards** — facility security (handled by hosting provider)
5. **Breach notification procedures** — notify within 60 days

**No certification is legally required.** SOC 2 Type II is nice-to-have for enterprise sales but not a HIPAA requirement. HIPAA requires "reasonable and appropriate safeguards."

---

## 2. PHI Minimization Strategy

**Key insight**: If we only pull aggregate counts from EMR systems, our HIPAA surface shrinks dramatically.

### What We Store

| Data | Contains PHI? | Example |
|------|--------------|---------|
| Metric elements (type: `metric`) | **No** | "15 new patients today", "8 no-shows" |
| Campaign data (metric elements) | No | "Google Ads spent $500, got 200 clicks" |
| Review data (metric elements) | No | Public reviews on Google Maps |
| Funnel snapshots (observation elements) | No | "Clicks: 500, Bookings: 30" |
| Recommendations (mental_model elements) | No | "Reduce no-show rate" |

### What We Do NOT Store

- Patient names, DOBs, contact info
- Individual appointment details with patient identity
- Treatment records tied to patients
- Insurance or billing info tied to patients

### How EMR Adapters Work

The Patient Now and Zenoti adapters query aggregate endpoints:
```
// Good: aggregate counts
GET /api/appointments/count?status=completed&date=2026-02-25
→ { count: 15 }

// We do NOT do this:
GET /api/appointments?date=2026-02-25
→ [{ patient: "John Smith", treatment: "Botox", ... }]
```

If we need finer granularity (e.g., treatment type breakdown), we aggregate on the adapter side before emitting NexusEvents:
```typescript
// In Go adapter transform logic (NexusEvent emission)
// Adapter fetches appointments, strips PII, emits aggregate-only events:
// Event: { metric_name: "appointments_completed", metric_value: 15, date: "2026-03-04" }
// Event: { metric_name: "treatments_botox", metric_value: 8, date: "2026-03-04" }
// Event: { metric_name: "revenue", metric_value: 45000, date: "2026-03-04" }
// Only aggregate NexusEvents are emitted — the metric_extract job stores these
// as metric elements in memory.db via the SDK. No patient data persists anywhere.
```

### BAA Still Required

Even though we minimize PHI, the adapter code transiently accesses PHI (it reads appointment records to count them). This makes us a Business Associate. The BAA must cover:
- What PHI we can access (appointments, patient counts, revenue)
- That we only store aggregates
- Our security practices
- Breach notification procedures

---

## 3. Current Technical Safeguard Status

Audit of the nex runtime and frontdoor infrastructure:

| # | Safeguard | Status | Details |
|---|-----------|--------|---------|
| 1 | Encryption in transit (TLS) | ⚠️ PARTIAL | Vercel provides TLS for the GlowBot shell domain. Frontdoor server itself uses plain HTTP behind reverse proxy/TLS termination. `Secure` cookie flag and HSTS are implemented. |
| 2 | Encryption at rest | ⚠️ PARTIAL | Strong credential pointer model (secrets never stored in plaintext). Password/token hashing (scrypt + SHA-256). File permissions (0o600). No database-level encryption (SQLite files are plaintext). |
| 3 | Access controls (Auth/RBAC) | ✅ IMPLEMENTED | Password + OIDC/PKCE auth. RBAC with operator/admin/member roles. JWT tokens with 10-min TTL. Rate limiting. CSRF protection. |
| 4 | Audit logging | ⚠️ PARTIAL | Structured JSON logging for HTTP requests, auth events, token lifecycle. ACL audit system is design spec only (not yet implemented). No centralized log aggregation. |
| 5 | Unique user identification | ✅ IMPLEMENTED | Unique userId, entityId, sessionId per user. No shared accounts. Cross-platform identity resolution. |
| 6 | Automatic session timeout | ✅ IMPLEMENTED | 7-day session TTL, 10-min runtime token TTL, 30-day refresh TTL. Auto-pruning every 60s. |
| 7 | Emergency access procedures | ⚠️ PARTIAL | Break-glass `dangerouslyDisableDeviceAuth` flag exists. No formal procedure, no emergency audit trail. |
| 8 | Activity logging/monitoring | ⚠️ PARTIAL | Structured event logging to stdout. No centralized aggregation, alerting, or dashboards. |

**Score: 3/8 fully implemented, 5/8 partial, 0/8 missing**

---

## 4. Remediation Plan

### Priority 1: Must-Have for HIPAA (before EMR adapter goes live)

| Item | Effort | What |
|------|--------|------|
| **Add `Secure` cookie flag** | 30 min | One-line fix per cookie in `frontdoor/src/server.ts` |
| **Add HSTS header** | 30 min | `Strict-Transport-Security: max-age=31536000; includeSubDomains` |
| **Document reverse proxy requirement** | 1 hour | Formalize that TLS termination via Caddy/nginx/Cloudflare is mandatory |
| **Database encryption for identity.db** | 1-2 days | Integrate SQLCipher for identity.db (auth tokens, sessions) |
| **BAA template** | 2-3 hours | Use HHS sample BAA, customize for GlowBot. Have a lawyer review ($500-1000). |
| **Risk assessment document** | 1 day | List threats, mitigations, likelihood, impact. Required by HIPAA. |
| **Security policies document** | 1 day | Written policies: access control, encryption, breach notification, data handling |
| **Designate security officer** | 0 min | That's you. Document it. |

### Priority 2: Should-Have (strengthen posture)

| Item | Effort | What |
|------|--------|------|
| **Implement ACL audit logging** | 1-2 weeks | Build `access_log` and `grant_log` tables from AUDIT.md spec |
| **Idle session timeout** | 1 day | Add 30-min idle timeout (not just absolute TTL) for HIPAA environments |
| **Log forwarding** | 1-2 days | Ship structured logs to centralized system (e.g., Grafana Loki, Datadog) |
| **Emergency access procedure** | 1 day | Document: who, when, how, approvals, time-boxing, audit trail |
| **Alerting on auth failures** | 1 day | Alert on repeated failed logins, anomalous access patterns |

### Priority 3: Nice-to-Have (enterprise readiness)

| Item | Effort | What |
|------|--------|------|
| SOC 2 Type II certification | Months + $$$  | Only if enterprise sales require it |
| Penetration testing | 1-2 weeks | External pentest of frontdoor + runtime |
| HIPAA compliance officer training | 1 day | Formal training for anyone handling PHI |

---

## 5. Hosting & HIPAA

### AWS

Hosted GlowBot deployments that handle EMR-derived intelligence run on HIPAA-eligible infrastructure under a signed BAA. The canonical hosting target is AWS.

Why AWS is the target state:

1. AWS supports the standard hosted BAA path
2. GlowBot needs one clean compliance story for EMR-capable deployments
3. the target-state docs should describe the post-cutover operating model, not a host-by-host transition strategy

The PHI minimization strategy still matters:

- adapters minimize what is persisted
- clinic-local product data is stored as aggregate elements, observations, and recommendations
- no patient-level data is sent to the LLM

But PHI minimization is not used as a substitute for the hosted compliance boundary.

---

## 6. Encryption Requirements

### What's Already Encrypted

- **Credentials**: Pointer-based storage (macOS Keychain, 1Password, encrypted file backend for Linux VPS)
- **Passwords**: scrypt-hashed (16-byte salt, 32-byte key)
- **Refresh tokens**: SHA-256 hashed
- **File permissions**: 0o600 on sensitive files
- **In transit**: TLS via reverse proxy (Caddy/Cloudflare)

### What Needs Encryption

| What | How | When |
|------|-----|------|
| **identity.db** (auth tokens, sessions) | SQLCipher | Before EMR adapter launch |
| **memory.db** (metric elements, observations) | Optional — no PHI in these elements | Nice-to-have |
| **Adapter credentials** (API keys, OAuth tokens) | Already encrypted via credential system | ✅ Done |
| **Data in transit between clinic ↔ hub** | TLS (already required) | ✅ Done |
| **Backups** (if implemented) | Encrypt backup files at rest | When backups are implemented |

### SQLCipher Integration

```typescript
// For identity.db
import Database from 'better-sqlite3'

const db = new Database('identity.db')
db.pragma(`key = '${encryptionKey}'`)  // SQLCipher transparent encryption
```

The encryption key should come from the credential system (not hardcoded).

---

## 7. BAA Template

Key sections for our BAA:

1. **Permitted uses**: GlowBot accesses clinic appointment/patient/revenue data solely to compute aggregate growth metrics
2. **PHI scope**: Appointment records, patient counts, treatment types, revenue totals. NOT patient names, contact info, medical records, insurance info.
3. **Safeguards**: Encryption in transit (TLS), encryption at rest (SQLCipher), access controls (RBAC), audit logging, session timeouts
4. **Subcontractors**: List hosting provider (AWS), Anthropic (LLM provider — note: we do NOT send PHI to the LLM, only aggregate metrics)
5. **Breach notification**: GlowBot will notify clinic within 30 days of discovering a breach (HIPAA requires 60 days; being faster builds trust)
6. **Data return/destruction**: On termination, GlowBot will delete all clinic data within 30 days and provide confirmation
7. **Term**: Effective on signing, terminates when the clinic stops using GlowBot

**Action**: Get the HHS sample BAA (https://www.hhs.gov/hipaa/for-professionals/covered-entities/sample-business-associate-agreement-provisions/), customize it, have a lawyer review once (~$500-1000), then use for all clinics.

---

## 8. What We Tell the LLM

The LLM (Claude) receives the **analysis package** which contains only:
- Aggregate metric values (e.g., "15 new patients this month")
- Conversion rates (e.g., "booking-to-consult rate: 85%")
- Peer benchmarks (e.g., "peer median no-show rate: 15%")
- Campaign-level ad metrics (e.g., "Google Ads Campaign 'Botox Spring': $500 spend, 200 clicks")

**No PHI is sent to the LLM.** No patient names, no appointment details, no treatment records. This is an important compliance point — even though Anthropic would sign a BAA if asked, we avoid the complexity by simply not sending PHI.

---

## 9. Compliance Checklist

Before going live with EMR adapters:

- [ ] BAA signed with each clinic
- [ ] BAA signed with hosting provider (if required — see §5)
- [x] `Secure` cookie flag added
- [x] HSTS header added
- [x] TLS reverse proxy documented as mandatory
- [ ] identity.db encrypted with SQLCipher (cutover plan: `../workplans/IDENTITY_DB_SQLCIPHER_CUTOVER.md`)
- [x] Risk assessment document written
- [x] Security policies document written
- [x] Security officer designated (documented)
- [x] EMR adapters confirmed to only store aggregates (code review)
- [x] Breach notification procedure documented

Implemented in `nexus-frontdoor` on 2026-02-26:
- `src/server.ts` (secure session cookie + HSTS behavior)
- `src/config.ts` and `config/frontdoor.config.json` (security config surface)
- `README.md` (TLS reverse proxy requirement and security env/config keys)

EMR aggregate-only guardrails validated on 2026-02-26:
- `nexus-adapter-patient-now-emr/cmd/patient-now-emr-adapter/main_test.go`
- `nexus-adapter-zenoti-emr/cmd/zenoti-emr-adapter/main_test.go`

Compliance documents written on 2026-02-26:
- [RISK_ASSESSMENT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/RISK_ASSESSMENT.md)
- [SECURITY_POLICIES.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/SECURITY_POLICIES.md)
- [SECURITY_OFFICER.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/SECURITY_OFFICER.md)
- [BREACH_NOTIFICATION_PROCEDURE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/BREACH_NOTIFICATION_PROCEDURE.md)
