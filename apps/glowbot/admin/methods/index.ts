import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import { handle as clinicsListHandler } from "./clinics-list.js";
import { handle as clinicsDetailHandler } from "./clinics-detail.js";
import { handle as credentialsHandler } from "./credentials.js";
import { handle as benchmarksHandler } from "./benchmarks.js";

export const handlers: Record<string, NexAppMethodHandler> = {
  "glowbot-admin.clinics.list": clinicsListHandler,
  "glowbot-admin.clinics.detail": clinicsDetailHandler,
  "glowbot-admin.credentials": credentialsHandler,
  "glowbot-admin.benchmarks": benchmarksHandler,
};
