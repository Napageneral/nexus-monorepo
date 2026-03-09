import type { NexAppMethodContext } from "../../../../nex/src/apps/context.js";
import type { GlowbotClinicProfile } from "../../shared/types.js";
import { loadClinicProfile } from "../clinic-profile/store.js";
import { callGlowbotProductControlPlane } from "../product-control-plane/client.js";

export type GlowbotBenchmarkContext = {
  clinicId: string;
  clinicProfile: GlowbotClinicProfile;
  callProductControlPlane: <T>(
    operation: string,
    payload: Record<string, unknown>,
  ) => Promise<T>;
};

export function resolveGlowbotBenchmarkContext(
  ctx: NexAppMethodContext,
): GlowbotBenchmarkContext | null {
  const clinicProfile = loadClinicProfile(ctx.app.dataDir);
  if (!clinicProfile?.specialty) {
    return null;
  }

  return {
    clinicId: clinicProfile.clinicId || ctx.account.accountId,
    clinicProfile,
    callProductControlPlane: <T>(operation: string, payload: Record<string, unknown>) =>
      callGlowbotProductControlPlane<T>(ctx.nex.runtime, operation, payload),
  };
}
