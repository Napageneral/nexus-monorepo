import type { RuntimeBrowserClient } from "../runtime.ts";
import type {
  JobDefinition,
  ScheduleJob,
  ScheduleRunLogEntry,
  ScheduleStatus,
  SessionsListResult,
} from "../types.ts";
import type { ScheduleFormState } from "../ui-types.ts";

export type AutomationMeeseeksEntry = {
  id: string;
  agentId: string;
  automationId: string;
  sessionCount: number;
  lastSeenAt: number | null;
  platforms: string[];
  sampleSessionKey: string;
};

export type ScheduleState = {
  client: RuntimeBrowserClient | null;
  connected: boolean;
  scheduleLoading: boolean;
  scheduleJobDefinitions: JobDefinition[];
  scheduleJobs: ScheduleJob[];
  scheduleStatus: ScheduleStatus | null;
  scheduleError: string | null;
  scheduleForm: ScheduleFormState;
  scheduleRunsJobId: string | null;
  scheduleRuns: ScheduleRunLogEntry[];
  scheduleBusy: boolean;
  automationMeeseeksLoading: boolean;
  automationMeeseeksError: string | null;
  automationMeeseeks: AutomationMeeseeksEntry[];
};

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function joinSchedulesWithJobs(
  schedules: ScheduleJob[],
  jobDefinitions: JobDefinition[],
): ScheduleJob[] {
  const jobById = new Map(jobDefinitions.map((job) => [job.id, job]));
  return schedules.map((schedule) => {
    const job = jobById.get(schedule.job_definition_id);
    return {
      ...schedule,
      job_name: job?.name ?? null,
      job_description: job?.description ?? null,
      enabled: Boolean(schedule.enabled),
    };
  });
}

function computeScheduleStatus(schedules: ScheduleJob[]): ScheduleStatus {
  const nextWakeAtMs =
    schedules
      .map((schedule) => parseTimestamp(schedule.next_run_at))
      .filter((value): value is number => typeof value === "number")
      .toSorted((a, b) => a - b)[0] ?? null;
  return {
    enabled: schedules.some((schedule) => schedule.enabled),
    jobs: schedules.length,
    nextWakeAtMs,
  };
}

async function loadJobDefinitions(state: ScheduleState) {
  const response = await state.client!.request<{ jobs?: JobDefinition[] }>("jobs.list", {
    limit: 500,
  });
  state.scheduleJobDefinitions = Array.isArray(response.jobs) ? response.jobs : [];
}

export async function loadScheduleJobs(state: ScheduleState) {
  if (!state.client || !state.connected || state.scheduleLoading) {
    return;
  }
  state.scheduleLoading = true;
  state.scheduleError = null;
  try {
    const [schedulesResponse] = await Promise.all([
      state.client.request<{
        schedules?: Array<Omit<ScheduleJob, "enabled"> & { enabled: number | boolean }>;
      }>("schedules.list", { limit: 500 }),
      loadJobDefinitions(state),
    ]);
    const schedulesRaw = Array.isArray(schedulesResponse.schedules)
      ? schedulesResponse.schedules
      : [];
    const schedules = schedulesRaw.map((schedule) => ({
      ...schedule,
      enabled: Boolean(schedule.enabled),
    })) as ScheduleJob[];
    state.scheduleJobs = joinSchedulesWithJobs(schedules, state.scheduleJobDefinitions);
    state.scheduleStatus = computeScheduleStatus(state.scheduleJobs);
  } catch (err) {
    state.scheduleError = String(err);
  } finally {
    state.scheduleLoading = false;
  }
}

function parseMeeseeksSessionKey(
  sessionKey: string | null | undefined,
): { agentId: string; automationId: string; platform: string | null } | null {
  if (typeof sessionKey !== "string" || !sessionKey.startsWith("meeseeks:")) {
    return null;
  }
  const parts = sessionKey.split(":");
  const agentId = parts[1]?.trim() ?? "";
  const automationId = parts[2]?.trim() ?? "";
  if (!agentId || !automationId) {
    return null;
  }
  const platform = parts[4]?.trim() || null;
  return { agentId, automationId, platform };
}

export async function loadAutomationMeeseeks(state: ScheduleState) {
  if (!state.client || !state.connected || state.automationMeeseeksLoading) {
    return;
  }
  state.automationMeeseeksLoading = true;
  state.automationMeeseeksError = null;
  try {
    const response = await state.client.request<SessionsListResult>("agents.sessions.list", {
      search: "meeseeks:",
      includeGlobal: true,
      includeUnknown: true,
      activeMinutes: 60 * 24 * 14,
      limit: 500,
    });
    const sessions = Array.isArray(response.sessions) ? response.sessions : [];
    const grouped = new Map<string, AutomationMeeseeksEntry & { platformSet: Set<string> }>();

    for (const session of sessions) {
      const parsed = parseMeeseeksSessionKey(session.key);
      if (!parsed) {
        continue;
      }
      const id = `${parsed.agentId}:${parsed.automationId}`;
      const existing = grouped.get(id);
      const updatedAt =
        typeof session.updatedAt === "number" && Number.isFinite(session.updatedAt)
          ? session.updatedAt
          : null;
      if (existing) {
        existing.sessionCount += 1;
        if (
          updatedAt !== null &&
          (existing.lastSeenAt === null || updatedAt > existing.lastSeenAt)
        ) {
          existing.lastSeenAt = updatedAt;
        }
        if (parsed.platform) {
          existing.platformSet.add(parsed.platform);
        }
        continue;
      }
      grouped.set(id, {
        id,
        agentId: parsed.agentId,
        automationId: parsed.automationId,
        sessionCount: 1,
        lastSeenAt: updatedAt,
        platforms: [],
        platformSet: new Set(parsed.platform ? [parsed.platform] : []),
        sampleSessionKey: session.key,
      });
    }

    state.automationMeeseeks = [...grouped.values()]
      .map((entry) => ({
        id: entry.id,
        agentId: entry.agentId,
        automationId: entry.automationId,
        sessionCount: entry.sessionCount,
        lastSeenAt: entry.lastSeenAt,
        platforms: [...entry.platformSet].toSorted((a, b) => a.localeCompare(b)),
        sampleSessionKey: entry.sampleSessionKey,
      }))
      .toSorted((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0));
  } catch (err) {
    state.automationMeeseeksError = String(err);
  } finally {
    state.automationMeeseeksLoading = false;
  }
}

export async function addScheduleJob(state: ScheduleState) {
  if (!state.client || !state.connected || state.scheduleBusy) {
    return;
  }
  state.scheduleBusy = true;
  state.scheduleError = null;
  try {
    const jobDefinitionId = state.scheduleForm.jobDefinitionId.trim();
    const expression = state.scheduleForm.expression.trim();
    if (!jobDefinitionId) {
      throw new Error("Job definition is required.");
    }
    if (!expression) {
      throw new Error("Schedule expression is required.");
    }
    await state.client.request("schedules.create", {
      job_definition_id: jobDefinitionId,
      expression,
      name: state.scheduleForm.name.trim() || undefined,
      timezone: state.scheduleForm.timezone.trim() || undefined,
      active_from: state.scheduleForm.activeFrom.trim() || undefined,
      active_until: state.scheduleForm.activeUntil.trim() || undefined,
      enabled: state.scheduleForm.enabled,
    });
    state.scheduleForm = {
      ...state.scheduleForm,
      name: "",
      activeFrom: "",
      activeUntil: "",
    };
    await loadScheduleJobs(state);
  } catch (err) {
    state.scheduleError = String(err);
  } finally {
    state.scheduleBusy = false;
  }
}

export async function toggleScheduleJob(state: ScheduleState, job: ScheduleJob, enabled: boolean) {
  if (!state.client || !state.connected || state.scheduleBusy) {
    return;
  }
  state.scheduleBusy = true;
  state.scheduleError = null;
  try {
    await state.client.request("schedules.update", { id: job.id, enabled });
    await loadScheduleJobs(state);
  } catch (err) {
    state.scheduleError = String(err);
  } finally {
    state.scheduleBusy = false;
  }
}

export async function runScheduleJob(state: ScheduleState, job: ScheduleJob) {
  if (!state.client || !state.connected || state.scheduleBusy) {
    return;
  }
  state.scheduleBusy = true;
  state.scheduleError = null;
  try {
    await state.client.request("schedules.trigger", { id: job.id, mode: "force" });
    await loadScheduleRuns(state, job.id);
    await loadScheduleJobs(state);
  } catch (err) {
    state.scheduleError = String(err);
  } finally {
    state.scheduleBusy = false;
  }
}

export async function removeScheduleJob(state: ScheduleState, job: ScheduleJob) {
  if (!state.client || !state.connected || state.scheduleBusy) {
    return;
  }
  state.scheduleBusy = true;
  state.scheduleError = null;
  try {
    await state.client.request("schedules.delete", { id: job.id });
    if (state.scheduleRunsJobId === job.id) {
      state.scheduleRunsJobId = null;
      state.scheduleRuns = [];
    }
    await loadScheduleJobs(state);
  } catch (err) {
    state.scheduleError = String(err);
  } finally {
    state.scheduleBusy = false;
  }
}

export async function loadScheduleRuns(state: ScheduleState, jobId: string) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    const response = await state.client.request<{ runs?: ScheduleRunLogEntry[] }>(
      "jobs.runs.list",
      {
        job_schedule_id: jobId,
        limit: 50,
      },
    );
    state.scheduleRunsJobId = jobId;
    state.scheduleRuns = Array.isArray(response.runs) ? response.runs : [];
  } catch (err) {
    state.scheduleError = String(err);
  }
}
