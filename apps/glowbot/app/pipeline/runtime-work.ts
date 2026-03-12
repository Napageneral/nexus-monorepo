import {
  GLOWBOT_METRIC_EXTRACT_JOB_NAME,
  GLOWBOT_METRIC_RECORD_PLATFORMS,
  type RuntimeMethodCaller,
} from "./registry.js";

type RuntimeRow = Record<string, unknown>;

const GLOWBOT_RECORD_INGESTED_EVENT_TYPE = "record.ingested";
const GLOWBOT_RECORD_MATCHES = new Set(
  GLOWBOT_METRIC_RECORD_PLATFORMS.map((platform) => desiredMatchJson(platform)),
);

function asRecord(value: unknown): RuntimeRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RuntimeRow)
    : {};
}

function asArray(value: unknown): RuntimeRow[] {
  return Array.isArray(value)
    ? value.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)) as RuntimeRow[]
    : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

function buildPlatformMatch(platform: string): { platform: string } {
  return { platform };
}

function desiredMatchJson(platform: string): string {
  return JSON.stringify(buildPlatformMatch(platform));
}

async function listJobs(runtime: RuntimeMethodCaller): Promise<RuntimeRow[]> {
  const result = asRecord(await runtime.callMethod("jobs.list", {}));
  return asArray(result.jobs);
}

async function listSubscriptions(
  runtime: RuntimeMethodCaller,
  jobDefinitionId?: string,
): Promise<RuntimeRow[]> {
  const result = asRecord(
    await runtime.callMethod("events.subscriptions.list", {
      event_type: GLOWBOT_RECORD_INGESTED_EVENT_TYPE,
      ...(jobDefinitionId ? { job_definition_id: jobDefinitionId } : {}),
    }),
  );
  return asArray(result.subscriptions);
}

async function findMetricExtractJobDefinitionId(runtime: RuntimeMethodCaller): Promise<string | null> {
  const jobs = await listJobs(runtime);
  const job = jobs.find((entry) => asString(entry.name) === GLOWBOT_METRIC_EXTRACT_JOB_NAME);
  return job ? asString(job.id) || null : null;
}

export async function ensureGlowbotRuntimeWork(params: {
  runtime: RuntimeMethodCaller;
  metricExtractJobDefinitionId?: string;
}): Promise<{ jobDefinitionId: string; subscriptionIds: string[] }> {
  const jobDefinitionId =
    params.metricExtractJobDefinitionId ?? (await findMetricExtractJobDefinitionId(params.runtime));
  if (!jobDefinitionId) {
    throw new Error("GlowBot metric_extract job is not registered");
  }

  const subscriptions = await listSubscriptions(params.runtime, jobDefinitionId);
  const desiredMatches = new Map(
    GLOWBOT_METRIC_RECORD_PLATFORMS.map((platform) => [desiredMatchJson(platform), platform]),
  );
  const subscriptionIds: string[] = [];

  for (const subscription of subscriptions) {
    const matchJson = asString(subscription.match_json);
    if (!desiredMatches.has(matchJson)) {
      await params.runtime.callMethod("events.subscriptions.delete", {
        id: asString(subscription.id),
      });
    }
  }

  for (const platform of GLOWBOT_METRIC_RECORD_PLATFORMS) {
    const match = buildPlatformMatch(platform);
    const matchJson = desiredMatchJson(platform);
    const existing = subscriptions.find(
      (subscription) =>
        asString(subscription.job_definition_id) === jobDefinitionId &&
        asString(subscription.event_type) === GLOWBOT_RECORD_INGESTED_EVENT_TYPE &&
        asString(subscription.match_json) === matchJson,
    );

    if (existing) {
      const id = asString(existing.id);
      if (asInt(existing.enabled) !== 1) {
        const updated = asRecord(
          await params.runtime.callMethod("events.subscriptions.update", {
            id,
            match,
            enabled: true,
          }),
        );
        subscriptionIds.push(asString(asRecord(updated.subscription).id) || id);
      } else {
        subscriptionIds.push(id);
      }
      continue;
    }

    const created = asRecord(
      await params.runtime.callMethod("events.subscriptions.create", {
        job_definition_id: jobDefinitionId,
        event_type: GLOWBOT_RECORD_INGESTED_EVENT_TYPE,
        match,
        enabled: true,
      }),
    );
    subscriptionIds.push(asString(asRecord(created.subscription).id));
  }

  return {
    jobDefinitionId,
    subscriptionIds,
  };
}

export async function disableGlowbotRuntimeWork(params: {
  runtime: RuntimeMethodCaller;
}): Promise<void> {
  const subscriptions = await listSubscriptions(params.runtime);
  for (const subscription of subscriptions) {
    const matchJson = asString(subscription.match_json);
    if (!GLOWBOT_RECORD_MATCHES.has(matchJson)) {
      continue;
    }
    if (asInt(subscription.enabled) !== 0) {
      await params.runtime.callMethod("events.subscriptions.update", {
        id: asString(subscription.id),
        enabled: false,
      });
    }
  }
}

export async function removeGlowbotRuntimeWork(params: {
  runtime: RuntimeMethodCaller;
}): Promise<void> {
  const subscriptions = await listSubscriptions(params.runtime);
  for (const subscription of subscriptions) {
    const matchJson = asString(subscription.match_json);
    if (!GLOWBOT_RECORD_MATCHES.has(matchJson)) {
      continue;
    }
    await params.runtime.callMethod("events.subscriptions.delete", {
      id: asString(subscription.id),
    });
  }
}
