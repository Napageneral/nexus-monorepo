import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import { handle as auditListHandler } from "./audit-list.js";
import { handle as benchmarksNetworkHealthHandler } from "./benchmarks-network-health.js";
import { handle as benchmarksSeedPublishHandler } from "./benchmarks-seed-publish.js";
import { handle as clinicsGetHandler } from "./clinics-detail.js";
import { handle as clinicsListHandler } from "./clinics-list.js";
import { handle as cohortsListHandler } from "./cohorts-list.js";
import { handle as cohortsUpdateHandler } from "./cohorts-update.js";
import { handle as diagnosticsSummaryHandler } from "./diagnostics-summary.js";
import { handle as managedProfilesArchiveHandler } from "./managed-profiles-archive.js";
import { handle as managedProfilesCreateHandler } from "./managed-profiles-create.js";
import { handle as managedProfilesGetHandler } from "./managed-profiles-get.js";
import { handle as managedProfilesListHandler } from "./managed-profiles-list.js";
import { handle as managedProfilesUpdateHandler } from "./managed-profiles-update.js";
import { handle as overviewGetHandler } from "./overview-get.js";
import { handle as productFlagsListHandler } from "./product-flags-list.js";
import { handle as productFlagsUpdateHandler } from "./product-flags-update.js";

export const handlers: Record<string, NexAppMethodHandler> = {
  "glowbotAdmin.overview.get": overviewGetHandler,
  "glowbotAdmin.managedProfiles.list": managedProfilesListHandler,
  "glowbotAdmin.managedProfiles.get": managedProfilesGetHandler,
  "glowbotAdmin.managedProfiles.create": managedProfilesCreateHandler,
  "glowbotAdmin.managedProfiles.update": managedProfilesUpdateHandler,
  "glowbotAdmin.managedProfiles.archive": managedProfilesArchiveHandler,
  "glowbotAdmin.clinics.list": clinicsListHandler,
  "glowbotAdmin.clinics.get": clinicsGetHandler,
  "glowbotAdmin.diagnostics.summary": diagnosticsSummaryHandler,
  "glowbotAdmin.benchmarks.networkHealth": benchmarksNetworkHealthHandler,
  "glowbotAdmin.benchmarks.seed.publish": benchmarksSeedPublishHandler,
  "glowbotAdmin.cohorts.list": cohortsListHandler,
  "glowbotAdmin.cohorts.update": cohortsUpdateHandler,
  "glowbotAdmin.productFlags.list": productFlagsListHandler,
  "glowbotAdmin.productFlags.update": productFlagsUpdateHandler,
  "glowbotAdmin.audit.list": auditListHandler,
};
