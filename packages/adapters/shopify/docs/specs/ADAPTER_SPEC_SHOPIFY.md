# Adapter Spec: Shopify

This package owns the Shopify order and fulfillment ingest surface for Nex.

The target contract is row-shaped and preserves provider-native Shopify order,
line-item, fulfillment, and transaction ids plus checkout-surviving bridge
evidence for downstream consumers.
