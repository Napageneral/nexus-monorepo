import { fileURLToPath } from "node:url";

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
  cron: {
    id: string;
    name: string;
    jobDefinitionId: string;
  };
};

type JobSeed = {
  key: keyof EnsuredGlowbotPipelineResources["jobs"];
  name: string;
  description: string;
  scriptPath: string;
};

const GLOWBOT_DAG_NAME = "glowbot_pipeline";
const GLOWBOT_DAG_DESCRIPTION = "GlowBot write-path-first pipeline DAG";
const GLOWBOT_METRIC_EXTRACT_CRON_NAME = "glowbot.metric_extract";
const GLOWBOT_METRIC_EXTRACT_CRON_EXPRESSION = "0 */6 * * *";
const GLOWBOT_METRIC_EXTRACT_CRON_TIMEZONE = "UTC";

const JOBS: JobSeed[] = [
  {
    key: "metricExtract",
    name: "metric_extract",
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

async function listCronSchedules(runtime: RuntimeMethodCaller): Promise<RuntimeRow[]> {
  const result = asRecord(await runtime.callMethod("cron.list", {}));
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
  const existing = definitions.find((definition) => asString(definition.id) === "metric");
  if (existing) {
    return;
  }

  await params.runtime.callMethod("memory.elements.definitions.create", {
    id: "metric",
    name: "metric",
    description: "Daily metric data point from an adapter connection",
    config: {
      ownerAppId: params.appId,
      metadataSchema: METRIC_METADATA_SCHEMA,
    },
  });
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
  const existing = dags.find((dag) => asString(dag.name) === GLOWBOT_DAG_NAME);
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
          job_definition_id: jobs.metricExtract.id,
          depends_on: [],
          position: 1,
        },
        {
          job_definition_id: jobs.funnelCompute.id,
          depends_on: [jobs.metricExtract.id],
          position: 2,
        },
        {
          job_definition_id: jobs.trendCompute.id,
          depends_on: [jobs.metricExtract.id],
          position: 3,
        },
        {
          job_definition_id: jobs.dropoffDetect.id,
          depends_on: [jobs.funnelCompute.id],
          position: 4,
        },
        {
          job_definition_id: jobs.recommend.id,
          depends_on: [jobs.funnelCompute.id, jobs.trendCompute.id, jobs.dropoffDetect.id],
          position: 5,
        },
      ],
    }),
  );

  return {
    id: asString(asRecord(created.dag).id),
    name: GLOWBOT_DAG_NAME,
  };
}

async function ensureMetricExtractCron(runtime: RuntimeMethodCaller, jobDefinitionId: string): Promise<{
  id: string;
  name: string;
  jobDefinitionId: string;
}> {
  const schedules = await listCronSchedules(runtime);
  const existing = schedules.find((schedule) => {
    return (
      asString(schedule.name) === GLOWBOT_METRIC_EXTRACT_CRON_NAME ||
      asString(schedule.job_definition_id) === jobDefinitionId
    );
  });

  if (existing) {
    const id = asString(existing.id);
    const needsUpdate =
      asString(existing.name) !== GLOWBOT_METRIC_EXTRACT_CRON_NAME ||
      asString(existing.expression) !== GLOWBOT_METRIC_EXTRACT_CRON_EXPRESSION ||
      asString(existing.timezone) !== GLOWBOT_METRIC_EXTRACT_CRON_TIMEZONE ||
      existing.enabled !== 1;

    if (needsUpdate) {
      const updated = asRecord(
        await runtime.callMethod("cron.update", {
          id,
          name: GLOWBOT_METRIC_EXTRACT_CRON_NAME,
          expression: GLOWBOT_METRIC_EXTRACT_CRON_EXPRESSION,
          timezone: GLOWBOT_METRIC_EXTRACT_CRON_TIMEZONE,
          enabled: true,
        }),
      );
      return {
        id: asString(asRecord(updated.schedule).id) || id,
        name: GLOWBOT_METRIC_EXTRACT_CRON_NAME,
        jobDefinitionId,
      };
    }

    return {
      id,
      name: GLOWBOT_METRIC_EXTRACT_CRON_NAME,
      jobDefinitionId,
    };
  }

  const created = asRecord(
    await runtime.callMethod("cron.create", {
      job_definition_id: jobDefinitionId,
      name: GLOWBOT_METRIC_EXTRACT_CRON_NAME,
      expression: GLOWBOT_METRIC_EXTRACT_CRON_EXPRESSION,
      timezone: GLOWBOT_METRIC_EXTRACT_CRON_TIMEZONE,
      enabled: true,
    }),
  );

  return {
    id: asString(asRecord(created.schedule).id),
    name: GLOWBOT_METRIC_EXTRACT_CRON_NAME,
    jobDefinitionId,
  };
}

export async function ensureGlowbotPipelineResources(params: {
  runtime: RuntimeMethodCaller;
  appId: string;
}): Promise<EnsuredGlowbotPipelineResources> {
  await ensureMetricElementDefinition(params);

  const jobs = {} as EnsuredGlowbotPipelineResources["jobs"];
  for (const seed of JOBS) {
    jobs[seed.key] = await ensureJob(params.runtime, params.appId, seed);
  }

  const dag = await ensureDag(params.runtime, jobs);
  const cron = await ensureMetricExtractCron(params.runtime, jobs.metricExtract.id);

  return { jobs, dag, cron };
}
