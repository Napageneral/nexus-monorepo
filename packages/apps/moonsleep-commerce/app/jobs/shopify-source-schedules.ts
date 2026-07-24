export const SHOPIFY_SOURCE_SCHEDULES = Object.freeze({
  "orders.delta": "0 * * * * *",
  "customers.delta": "20 * * * * *",
  "inventory.hot": "40 * * * * *",
  "inventory.reconcile": "5 1-59/5 * * * *",
  "fulfillment.delta": "15 2-59/5 * * * *",
  "discounts.delta": "25 3-59/5 * * * *",
  "finance.transactions": "35 4-59/5 * * * *",
  "disputes.delta": "45 0-59/5 * * * *",
  "products.delta": "10 2-59/15 * * * *",
  "catalog.delta": "50 7-59/15 * * * *",
  "marketing.delta": "13 13 * * * *",
  "payouts.delta": "17 17 */6 * * *",
} as const);

export type ShopifySourceFamily = keyof typeof SHOPIFY_SOURCE_SCHEDULES;
