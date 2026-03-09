import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import type { GlowbotClinicProfileGetResponse } from "../../shared/types.js";
import { loadClinicProfile } from "../clinic-profile/store.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  return {
    clinicProfile: loadClinicProfile(ctx.app.dataDir),
  } satisfies GlowbotClinicProfileGetResponse;
};
