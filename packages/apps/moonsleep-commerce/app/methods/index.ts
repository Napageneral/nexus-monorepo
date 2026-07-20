import type { NexAppMethodHandler } from "../../../../../nex/src/runtime/domains/apps/context.js";

const healthcheck: NexAppMethodHandler = async (ctx) => ({
  status: "ok",
  app: {
    id: ctx.app.id,
    version: ctx.app.version,
  },
  projectors: {
    shopify_customer_identity: "dormant_pending_event_handoff",
    shopify_order_commerce: "not_implemented",
  },
  provider_write_authority: false,
});

export default {
  "moonsleep-commerce.healthcheck": healthcheck,
};
