# WIB-007 Companion Pixels And Tag Ownership Policy

## Purpose

Define how companion pixels and tags are installed alongside the first-party
`website-input` sender without becoming part of the source-of-truth contract.

Companion pixels are adjacent instrumentation. They are not the canonical
attribution layer.

## Policy

1. The first-party sender installs first.
2. Each companion pixel or tag has exactly one owner path.
3. The owner path is chosen explicitly: native platform integration, GTM, or
   custom code.
4. Duplicate ownership is a failure, not a warning.
5. The companion pixel decision must not change the canonical first-party
   event contract.

## Ownership Rules

Use the most stable single path available for each platform signal.

- Meta: prefer the site-native path when the platform supports it cleanly,
  otherwise GTM, otherwise custom code.
- Google: prefer the existing Google tag or GTM path already in the site.
- TikTok: prefer one owner path only, with no duplicate firing from multiple
  installs.

If a site already has a live pixel path, the install must decide whether to
adopt it, replace it, or remove it. It should not stack on top of it.

## Detection Rules

The operator should treat these as failures:

- the same pixel fires from both native and GTM paths
- conversions are duplicated because the same event is emitted twice
- one site reports two ownership sources for the same tag
- a consent restriction causes the pixel path to silently diverge from the
  documented install state

## Wix Notes

Wix often makes the ownership decision more explicit because the site may rely
on Wix-native integrations, custom code, or GTM depending on the page type.

For Wix installs:

- confirm which path already owns Meta, Google, and TikTok before adding a new
  one
- do not assume GTM can observe every Wix business-solution surface
- treat the companion-pixel review as part of the same install proof

## Operator Checklist

Before closing the install:

- confirm the first-party sender is healthy
- confirm the selected companion owner path is documented
- confirm no duplicate tag paths remain active
- confirm conversion events are not double-counted
- record the ownership decision in the install notes

## Exit Criteria

This policy is complete when the operator can answer, for every companion
signal, one question:

- who owns it
- where it fires
- how duplicate ownership is prevented
