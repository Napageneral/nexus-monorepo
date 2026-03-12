import { fileURLToPath } from "node:url";
import {
  GLOWBOT_DERIVED_OUTPUT_DAG_NAME,
  GLOWBOT_METRIC_EXTRACT_JOB_NAME,
  GLOWBOT_METRIC_EXTRACT_SCHEDULE_EXPRESSION,
  GLOWBOT_METRIC_EXTRACT_SCHEDULE_NAME,
  GLOWBOT_METRIC_EXTRACT_SCHEDULE_TIMEZONE,
} from "./constants.js";

export type RuntimeMethodCaller = {
  callMethod: (method: string, params: unknown) => Promise<unknown>;
};

type RuntimeRow = Record<string, unknown>;

type EnsuredJob = {
  id: string;
  name: string;
};

export type EnsuredGlowbotPipelineResources = {
  jobs: {
    metricExtract: EnsuredJob;
    funnelCompute: EnsuredJob;
    trendCompute: EnsuredJob;
    dropoffDetect: EnsuredJob;
    recommend: EnsuredJob;
  };
  dag: {
    id: string;
    name: string;
  };
  schedule: {
    id: string;
    name: string;
    jobDefinitionId: string;
    enabled: boolean;
  };
};

type JobSeed = {
  key: keyof EnsuredGlowbotPipelineResources["jobs"];
  name: string;
  description: string;
  scriptPath: string;
};

export const GLOWBOT_DAG_NAME = GLOWBOT_DERIVED_OUTPUT_DAG_NAME;
const GLOWBOT_DAG_DESCRIPTION = "GlowBot derived-output materialization DAG";
export const GLOWBOT_METRIC_RECORD_PLATFORMS = [
  "google-ads",
  "google-business-profile",
  "meta-ads",
  "patient-now-emr",
  "zenoti-emr",
  "callrail",
  "twilio",
  "apple-maps",
] as const;

const JOBS: JobSeed[] = [
  {
    key: "metricExtract",
    name: GLOWBOT_METRIC_EXTRACT_JOB_NAME,
    description: "Normalize adapter metric events into GlowBot metric elements",
    scriptPath: fileURLToPath(new URL("./jobs/metric-extract.ts", import.meta.url)),
  },
  {
    key: "funnelCompute",
    name: "funnel_compute",
    description: "Compute GlowBot funnel snapshots from metric elements",
    scriptPath: fileURLToPath(new URL("./jobs/funnel-compute.ts", import.meta.url)),
  },
  {
    key: "trendCompute",
    name: "trend_compute",
    description: "Compute GlowBot trend deltas from metric elements",
    scriptPath: fileURLToPath(new URL("./jobs/trend-compute.ts", import.meta.url)),
  },
  {
    key: "dropoffDetect",
    name: "dropoff_detect",
    description: "Detect GlowBot funnel drop-offs from computed observations",
    scriptPath: fileURLToPath(new URL("./jobs/dropoff-detect.ts", import.meta.url)),
  },
  {
    key: "recommend",
    name: "recommend",
    description: "Produce GlowBot recommendations from computed observations",
    scriptPath: fileURLToPath(new URL("./jobs/recommend.ts", import.meta.url)),
  },
];
const GLOWBOT_PIPELINE_JOB_NAMES = new Set(JOBS.map((job) => job.name));

const METRIC_METADATA_SCHEMA = {
  type: "object",
  required: ["connection_id", "adapter_id", "metric_name", "metric_value", "date"],
  properties: {
    connection_id: { type: "string" },
    adapter_id: { type: "string" },
    connection_profile_id: { type: "string" },
    auth_method_id: { type: "string" },
    connection_scope: { type: "string", enum: ["server", "app"] },
    source_app_id: { type: "string" },
    metric_name: { type: "string" },
    metric_value: { type: "number" },
    date: { type: "string", format: "date" },
    clinic_id: { type: "string" },
    metadata_key: { type: "string" },
  },
};

const FUNNEL_SNAPSHOT_METADATA_SCHEMA = {
  type: "object",
  required: ["window", "period_start", "period_end", "scope_key", "step_name", "step_order"],
  properties: {
    window: { type: "string", enum: ["7d", "30d", "90d"] },
    scope_key: { type: "string" },
    clinic_id: { type: "string" },
    step_name: { type: "string" },
    step_order: { type: "number" },
    period_start: { type: "string", format: "date" },
    period_end: { type: "string", format: "date" },
    step_value: { type: "number" },
    prev_step_value: { type: "number" },
    conversion_rate: { type: "number" },
    peer_median: { type: "number" },
    delta_vs_peer: { type: "number" },
    source_breakdown: { type: "object" },
    computed_at_ms: { type: "number" },
  },
};

const TREND_DELTA_METADATA_SCHEMA = {
  type: "object",
  required: [
    "window",
    "period_start",
    "period_end",
    "baseline_start",
    "baseline_end",
    "scope_key",
    "metric_name",
    "adapter_id",
  ],
  properties: {
    window: { type: "string", enum: ["7d", "30d", "90d"] },
    scope_key: { type: "string" },
    clinic_id: { type: "string" },
    metric_name: { type: "string" },
    adapter_id: { type: "string" },
    period_start: { type: "string", format: "date" },
    period_end: { type: "string", format: "date" },
    baseline_start: { type: "string", format: "date" },
    baseline_end: { type: "string", format: "date" },
    current_total: { type: "number" },
    previous_total: { type: "number" },
    delta: { type: "number" },
    delta_percent: { type: "number" },
    computed_at_ms: { type: "number" },
  },
};

const DROPOFF_ANALYSIS_METADATA_SCHEMA = {
  type: "object",
  required: ["analysis_key", "window", "period_start", "period_end", "scope_key"],
  properties: {
    analysis_key: { type: "string" },
    window: { type: "string", enum: ["7d", "30d", "90d"] },
    scope_key: { type: "string" },
    clinic_id: { type: "string" },
    period_start: { type: "string", format: "date" },
    period_end: { type: "string", format: "date" },
    baseline_start: { type: "string", format: "date" },
    baseline_end: { type: "string", format: "date" },
    weakest_step: { type: "object" },
    flagged_gaps: { type: "array" },
    computed_at_ms: { type: "number" },
  },
};

const RECOMMENDATION_METADATA_SCHEMA = {
  type: "object",
  required: [
    "recommendation_key",
    "window",
    "period_start",
    "period_end",
    "scope_key",
    "category",
    "status",
  ],
  properties: {
    recommendation_key: { type: "string" },
    window: { type: "string", enum: ["7d", "30d", "90d"] },
    scope_key: { type: "string" },
    clinic_id: { type: "string" },
    period_start: { type: "string", format: "date" },
    period_end: { type: "string", format: "date" },
    category: { type: "string" },
    status: { type: "string", enum: ["active", "superseded"] },
    rank: { type: "number" },
    delta_value: { type: "number" },
    delta_unit: { type: "string" },
    confidence: { type: "string" },
    action_data: { type: "object" },
    reasoning: { type: "string" },
    created_at_ms: { type: "number" },
    superseded_at_ms: { type: "number" },
  },
};

const ELEMENT_DEFINITIONS = [
  {
    id: "metric",
    description: "Daily metric data point from an adapter connection",
    metadataSchema: METRIC_METADATA_SCHEMA,
  },
  {
    id: "funnel_snapshot",
    description: "Persisted GlowBot funnel snapshot for a windowed clinic scope",
    metadataSchema: FUNNEL_SNAPSHOT_METADATA_SCHEMA,
  },
  {
    id: "trend_delta",
    description: "Persisted GlowBot trend delta for a windowed clinic scope",
    metadataSchema: TREND_DELTA_METADATA_SCHEMA,
  },
  {
    id: "dropoff_analysis",
    description: "Persisted GlowBot drop-off analysis for a windowed clinic scope",
    metadataSchema: DROPOFF_ANALYSIS_METADATA_SCHEMA,
  },
  {
    id: "recommendation",
    description: "Versioned GlowBot recommendation for a windowed clinic scope",
    metadataSchema: RECOMMENDATION_METADATA_SCHEMA,
  },
] as const;

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

async function listJobs(runtime: RuntimeMethodCaller): Promise<RuntimeRow[]> {
  const result = asRecord(await runtime.callMethod("jobs.list", {}));
  return asArray(result.jobs);
}

async function listDags(runtime: RuntimeMethodCaller): Promise<RuntimeRow[]> {
  const result = asRecord(await runtime.callMethod("dags.list", {}));
  return asArray(result.dags);
}

async function listSchedules(runtime: RuntimeMethodCaller): Promise<RuntimeRow[]> {
  const result = asRecord(await runtime.callMethod("schedules.list", {}));
  return asArray(result.schedules);
}

async function listElementDefinitions(runtime: RuntimeMethodCaller): Promise<RuntimeRow[]> {
  const result = asRecord(await runtime.callMethod("memory.elements.definitions.list", {}));
  return asArray(result.definitions);
}

async function ensureMetricElementDefinition(params: {
  runtime: RuntimeMethodCaller;
  appId: string;
}): Promise<void> {
  const definitions = await listElementDefinitions(params.runtime);
  for (const seed of ELEMENT_DEFINITIONS) {
    const existing = definitions.find((definition) => asString(definition.id) === seed.id);
    if (existing) {
      continue;
    }

    await params.runtime.callMethod("memory.elements.definitions.create", {
      id: seed.id,
      name: seed.id,
      description: seed.description,
      config: {
        ownerAppId: params.appId,
        metadataSchema: seed.metadataSchema,
      },
    });
  }
}

async function ensureJob(runtime: RuntimeMethodCaller, appId: string, seed: JobSeed): Promise<EnsuredJob> {
  const jobs = await listJobs(runtime);
  const existing = jobs.find((job) => asString(job.name) === seed.name);

  if (existing) {
    const id = asString(existing.id);
    const needsUpdate =
      asString(existing.script_path) !== seed.scriptPath ||
      asString(existing.description) !== seed.description ||
      asString(existing.status) !== "active";

    if (needsUpdate) {
      const updated = asRecord(
        await runtime.callMethod("jobs.update", {
          id,
          description: seed.description,
          script_path: seed.scriptPath,
          status: "active",
          created_by: appId,
        }),
      );
      return {
        id: asString(asRecord(updated.job).id) || id,
        name: seed.name,
      };
    }

    return { id, name: seed.name };
  }

  const created = asRecord(
    await runtime.callMethod("jobs.create", {
      name: seed.name,
      description: seed.description,
      script_path: seed.scriptPath,
      status: "active",
      created_by: appId,
    }),
  );
  return {
    id: asString(asRecord(created.job).id),
    name: seed.name,
  };
}

async function ensureDag(runtime: RuntimeMethodCaller, jobs: EnsuredGlowbotPipelineResources["jobs"]): Promise<{
  id: string;
  name: string;
}> {
  const dags = await listDags(runtime);
  for (const dag of dags) {
    if (asString(dag.name) === "glowbot_pipeline" && asString(dag.name) !== GLOWBOT_DAG_NAME) {
      await runtime.callMethod("dags.delete", {
        id: asString(dag.id),
      });
    }
  }

  const refreshedDags = await listDags(runtime);
  const existing = refreshedDags.find((dag) => asString(dag.name) === GLOWBOT_DAG_NAME);
  if (existing) {
    return {
      id: asString(existing.id),
      name: GLOWBOT_DAG_NAME,
    };
  }

  const created = asRecord(
    await runtime.callMethod("dags.create", {
      name: GLOWBOT_DAG_NAME,
      description: GLOWBOT_DAG_DESCRIPTION,
      nodes: [
        {
          id: "funnel_compute_node",
          job_definition_id: jobs.funnelCompute.id,
          depends_on: [],
          position: 1,
        },
        {
          id: "trend_compute_node",
          job_definition_id: jobs.trendCompute.id,
          depends_on: [],
          position: 2,
        },
        {
          id: "dropoff_detect_node",
          job_definition_id: jobs.dropoffDetect.id,
          depends_on: ["funnel_compute_node", "trend_compute_node"],
          position: 3,
        },
        {
          id: "recommend_node",
          job_definition_id: jobs.recommend.id,
          depends_on: ["dropoff_detect_node"],
          position: 4,
        },
      ],
    }),
  );

  return {
    id: asString(asRecord(created.dag).id),
    name: GLOWBOT_DAG_NAME,
  };
}

async function ensureMetricExtractSchedule(
  runtime: RuntimeMethodCaller,
  jobDefinitionId: string,
  enabled: boolean,
): Promise<{
  id: string;
  name: string;
  jobDefinitionId: string;
  enabled: boolean;
}> {
  const schedules = await listSchedules(runtime);
  const existing = schedules.find((schedule) => {
    return (
      asString(schedule.name) === GLOWBOT_METRIC_EXTRACT_SCHEDULE_NAME ||
      asString(schedule.job_definition_id) === jobDefinitionId
    );
  });

  if (existing) {
    const id = asString(existing.id);
    const needsUpdate =
      asString(existing.name) !== GLOWBOT_METRIC_EXTRACT_SCHEDULE_NAME ||
      asString(existing.expression) !== GLOWBOT_METRIC_EXTRACT_SCHEDULE_EXPRESSION ||
      asString(existing.timezone) !== GLOWBOT_METRIC_EXTRACT_SCHEDULE_TIMEZONE ||
      existing.enabled !== (enabled ? 1 : 0);

    if (needsUpdate) {
      const updated = asRecord(
        await runtime.callMethod("schedules.update", {
          id,
          name: GLOWBOT_METRIC_EXTRACT_SCHEDULE_NAME,
          expression: GLOWBOT_METRIC_EXTRACT_SCHEDULE_EXPRESSION,
          timezone: GLOWBOT_METRIC_EXTRACT_SCHEDULE_TIMEZONE,
          enabled,
        }),
      );
      return {
        id: asString(asRecord(updated.schedule).id) || id,
        name: GLOWBOT_METRIC_EXTRACT_SCHEDULE_NAME,
        jobDefinitionId,
        enabled,
      };
    }

    return {
      id,
      name: GLOWBOT_METRIC_EXTRACT_SCHEDULE_NAME,
      jobDefinitionId,
      enabled: existing.enabled === 1,
    };
  }

  const created = asRecord(
    await runtime.callMethod("schedules.create", {
      job_definition_id: jobDefinitionId,
      name: GLOWBOT_METRIC_EXTRACT_SCHEDULE_NAME,
      expression: GLOWBOT_METRIC_EXTRACT_SCHEDULE_EXPRESSION,
      timezone: GLOWBOT_METRIC_EXTRACT_SCHEDULE_TIMEZONE,
      enabled,
    }),
  );

  return {
    id: asString(asRecord(created.schedule).id),
    name: GLOWBOT_METRIC_EXTRACT_SCHEDULE_NAME,
    jobDefinitionId,
    enabled,
  };
}

export async function ensureGlowbotPipelineResources(params: {
  runtime: RuntimeMethodCaller;
  appId: string;
  scheduleEnabled?: boolean;
}): Promise<EnsuredGlowbotPipelineResources> {
  await ensureMetricElementDefinition(params);

  const jobs = {} as EnsuredGlowbotPipelineResources["jobs"];
  for (const seed of JOBS) {
    jobs[seed.key] = await ensureJob(params.runtime, params.appId, seed);
  }

  const dag = await ensureDag(params.runtime, jobs);
  const schedule = await ensureMetricExtractSchedule(
    params.runtime,
    jobs.metricExtract.id,
    params.scheduleEnabled ?? false,
  );

  return { jobs, dag, schedule };
}

export async function setGlowbotMetricExtractScheduleEnabled(params: {
  runtime: RuntimeMethodCaller;
  enabled: boolean;
}): Promise<void> {
  const schedules = await listSchedules(params.runtime);
  const schedule =
    schedules.find((entry) => asString(entry.name) === GLOWBOT_METRIC_EXTRACT_SCHEDULE_NAME) ?? null;
  if (!schedule) {
    return;
  }
  if ((schedule.enabled === 1) === params.enabled) {
    return;
  }
  await params.runtime.callMethod("schedules.update", {
    id: asString(schedule.id),
    enabled: params.enabled,
  });
}

export async function removeGlowbotPipelineResources(params: {
  runtime: RuntimeMethodCaller;
}): Promise<void> {
  const schedules = await listSchedules(params.runtime);
  for (const schedule of schedules) {
    if (asString(schedule.name) === GLOWBOT_METRIC_EXTRACT_SCHEDULE_NAME) {
      await params.runtime.callMethod("schedules.delete", {
        id: asString(schedule.id),
      });
    }
  }

  const dags = await listDags(params.runtime);
  for (const dag of dags) {
    if (asString(dag.name) === GLOWBOT_DAG_NAME || asString(dag.name) === "glowbot_pipeline") {
      await params.runtime.callMethod("dags.delete", {
        id: asString(dag.id),
      });
    }
  }

  const jobs = await listJobs(params.runtime);
  for (const job of jobs) {
    if (GLOWBOT_PIPELINE_JOB_NAMES.has(asString(job.name))) {
      await params.runtime.callMethod("jobs.delete", {
        id: asString(job.id),
      });
    }
  }
}
