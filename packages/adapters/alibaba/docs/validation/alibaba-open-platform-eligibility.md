# Alibaba Open Platform Read Eligibility

**Status:** VALIDATION
**Last Updated:** 2026-07-21

---

## Question

Can the MoonSleep Alibaba buyer account read its Messenger conversations and
messages through Alibaba's official signed API instead of browser capture?

The documented operations are:

- `alibaba.interaction.im.conversation.list.query`;
- `alibaba.interaction.im.message.list.query`.

They do not require a user session parameter, but they do require a registered
application key and signed request. The request also requires seller/self
account identifiers. Public documentation does not prove that a MoonSleep buyer
account is eligible for this seller-oriented API family.

## Safe probe

The local assessment prints presence booleans only and performs zero provider
calls:

```bash
node --experimental-strip-types scripts/check-open-platform-eligibility.ts
```

The live probe is read-only and must be explicitly requested:

```bash
ALIBABA_OPEN_PLATFORM_APP_KEY=... \
ALIBABA_OPEN_PLATFORM_APP_SECRET=... \
ALIBABA_OPEN_PLATFORM_SELLER_ACCOUNT_ID=... \
ALIBABA_OPEN_PLATFORM_SELF_ACCOUNT_ID=... \
node --experimental-strip-types \
  scripts/check-open-platform-eligibility.ts --live-read-probe
```

The result contains only accessibility booleans, bounded row counts, and a
sanitized provider error code. It never prints the app key, app secret,
conversation identifier, message identifier, or message content.

## Decision gate

- `eligible`: implement the Alibaba source adapter against the official API.
- `api_refused`: retain the completed-snapshot adapter and pursue a dedicated,
  isolated VPS browser capture profile with supervised reauthentication.
- missing app credentials or account identifiers: do not guess or reuse browser
  authentication material. Complete Alibaba developer application enrollment
  or obtain the official identifiers through the provider console.

Email notifications may wake the capture process but are not canonical message
evidence.

## 2026-07-21 readback

The zero-call local assessment returned
`blocked_missing_app_credentials`: no Alibaba Open Platform app key, app secret,
seller account identifier, or self account identifier was available to the
adapter environment.

The visible, signed-in Alibaba Open Platform account redirected to the developer
profile enrollment page. The page requires company name, enterprise
registration number, registered address, a company registration certificate,
acceptance of the platform agreements, and submission for review. Those fields
were incomplete and no form was submitted.

Therefore official API access is not currently eligible for a live read probe.
The next provider-side step is a deliberate business decision to enroll
MoonSleep as an Alibaba Open Platform developer and submit company information
for review. That is not an adapter implementation detail and must not be
performed implicitly.
