import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import type {
  GlowbotClinicProfileUpdateParams,
  GlowbotClinicProfileUpdateResponse,
} from "../../shared/types.js";
import { saveClinicProfile } from "../clinic-profile/store.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const params = ctx.params as GlowbotClinicProfileUpdateParams;

  return {
    clinicProfile: saveClinicProfile({
      dataDir: ctx.app.dataDir,
      clinicId: ctx.account.accountId,
      updates: params,
    }),
  } satisfies GlowbotClinicProfileUpdateResponse;
};
