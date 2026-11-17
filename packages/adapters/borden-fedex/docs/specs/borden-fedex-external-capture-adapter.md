# Borden FedEx External Capture Adapter

**Status:** CANONICAL
**Last Updated:** 2026-08-14

## Purpose

This adapter registers MoonSleep's separately operated, root-owned Borden FedEx Billing Online collector as one reviewed, read-only Nex source connection. It supplies source identity and health only. It does not authenticate to FedEx, receive provider credentials, download invoices, register Records, interpret charges, or write Dispatch.

## Connection identity

- adapter: `borden-fedex`
- platform: `fedex_billing_online`
- service: `fedex-billing-online`
- account and connection: `borden-production`
- custody prefix: `private://borden-fedex/`

The setup flow accepts only this stable, non-secret identity metadata and an exact read-only confirmation. FedEx credentials remain in Nex vault and collector custody.

## Authority boundary

Source capture, invoice Record registration, reconciliation proposals, and Dispatch projection are four independently terminalized authorities. This adapter has none of those mutation authorities. Its backfill operation is intentionally empty because invoice registration is performed by the separately governed, receipt-producing source registration job.
