import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import type { GlowbotProductFlagsListResponse } from "../../shared/types.js";
import { callGlowbotProductControlPlane } from "../product-control-plane/client.js";

type GlowbotHubFlag = {
  key?: string;
  value?: unknown;
  description?: string;
  updatedAtMs?: number;
};

export const handle: NexAppMethodHandler = async (ctx) => {
  const result = await callGlowbotProductControlPlane<{
    productFlags?: GlowbotHubFlag[];
  }>(ctx.nex.runtime, "glowbotHub.productFlags.list", {});

  return {
    productFlags: Array.isArray(result.productFlags)
      ? result.productFlags.map((flag) => ({
          key: typeof flag.key === "string" ? flag.key : "",
          value: flag.value,
          description: typeof flag.description === "string" ? flag.description : undefined,
          updatedAtMs:
            typeof flag.updatedAtMs === "number" && Number.isFinite(flag.updatedAtMs)
              ? flag.updatedAtMs
              : 0,
        }))
      : [],
  } satisfies GlowbotProductFlagsListResponse;
};
