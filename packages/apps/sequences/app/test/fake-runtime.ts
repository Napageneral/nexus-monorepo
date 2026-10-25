// A fake of the Nex jobs surface the tick uses, with the kernel behaviours acceptance depends on
// (operational-store.ts, jobs.ts): idempotency keys are permanent and fingerprinted with the
// caller's per-attempt token, so the same key from another tick Run is a payload mismatch; a batch
// in 'partial' mode reports per-item outcomes; invokeMany refuses serialization_key; runs carry the
// job revision they were admitted under.
type Row = Record<string, unknown>;

export type FakeRun = {
  id: string;
  job_definition_id: string;
  job_revision_id: string;
  status: string;
  started_at: string | null;
  created_at: string;
  trigger_source: string;
  input: Row;
  available_at: string;
  max_attempts: number;
  serialization_key: string | null;
  idempotency_key: string | null;
  caller: string;
  material: string;
};

export function fakeRuntime(jobNames: readonly string[] = ["sequences.tick", "sequences.step", "sequences.draw", "sequences.send", "sequences.notify", "sequences.agent"]) {
  const jobs = jobNames.map((name, index) => ({ id: `jobdef_${index + 1}`, name, default_revision_id: `rev_${index + 1}_a`, status: name === "sequences.agent" ? "inactive" : "active" }));
  const runs: FakeRun[] = [];
  const calls: Array<{ method: string; params: Row; caller: string }> = [];
  const failNext: Record<string, string | undefined> = {};
  let serial = 0;
  const revisionOf = (jobId: string) => jobs.find((job) => job.id === jobId)!.default_revision_id;

  function admit(caller: string, params: Row): { run: FakeRun; replayed: boolean } | { error: string } {
    const key = typeof params.idempotency_key === "string" ? params.idempotency_key : null;
    const material = JSON.stringify([params.job_id, params.input, params.trigger_source, params.available_at, params.max_attempts, params.serialization_key ?? null]);
    if (key) {
      const held = runs.find((run) => run.idempotency_key === key && run.job_definition_id === params.job_id);
      if (held) {
        if (held.caller !== caller || held.material !== material) return { error: "idempotency_key_payload_mismatch" };
        return { run: held, replayed: true };
      }
    }
    serial += 1;
    const run: FakeRun = {
      id: `jobrun_${String(serial).padStart(4, "0")}`,
      job_definition_id: String(params.job_id),
      job_revision_id: revisionOf(String(params.job_id)),
      status: "pending",
      started_at: null,
      created_at: new Date().toISOString(),
      trigger_source: String(params.trigger_source ?? "manual"),
      input: (params.input as Row) ?? {},
      available_at: String(params.available_at ?? ""),
      max_attempts: Number(params.max_attempts ?? 1),
      serialization_key: (params.serialization_key as string | undefined) ?? null,
      idempotency_key: key,
      caller,
      material,
    };
    runs.push(run);
    return { run, replayed: false };
  }

  /** ctx.nex for a job: every call resolves { payload } (createJobNexClient). */
  function nexFor(caller: string, wrap = true) {
    const answer = (value: unknown) => (wrap ? { payload: value } : value);
    const record = (method: string, params: Row) => {
      calls.push({ method, params, caller });
      const failure = failNext[method];
      if (failure) {
        delete failNext[method];
        throw new Error(failure);
      }
    };
    return {
      jobs: {
        invoke: async (params: Row) => {
          record("jobs.invoke", params);
          const result = admit(caller, params);
          if ("error" in result) throw new Error(`jobs.invoke failed: ${result.error}`);
          return answer({ run: result.run, replayed: result.replayed });
        },
        invokeMany: async (params: Row) => {
          record("jobs.invokeMany", params);
          const items = params.items as Row[];
          if (items.some((item) => item.serialization_key !== undefined)) throw new Error("jobs.invokeMany item carries serialization_key; serialized runs go through jobs.invoke");
          if (params.atomicity !== "partial") throw new Error("this fake models partial batches only");
          const outcomes = items.map((item, position) => {
            const result = admit(caller, item);
            return "error" in result
              ? { item_position: position, outcome: "rejected", job_run_id: null, error_code: result.error }
              : { item_position: position, outcome: result.replayed ? "replayed" : "accepted", job_run_id: result.run.id, error_code: null };
          });
          return answer({ batch_receipt: { id: `batch_${calls.length}` }, outcomes, replayed: false });
        },
        runs: {
          list: async (params: Row) => {
            record("jobs.runs.list", params);
            const found = runs.filter(
              (run) =>
                (!params.idempotency_key || run.idempotency_key === params.idempotency_key) &&
                (!params.job_definition_id || run.job_definition_id === params.job_definition_id) &&
                (!params.status || run.status === params.status),
            );
            return answer({ runs: found.map(({ caller: _caller, material: _material, ...run }) => run) });
          },
          get: async (params: Row) => {
            record("jobs.runs.get", params);
            const run = runs.find((entry) => entry.id === params.id);
            if (!run) throw new Error("job run not found");
            const { caller: _caller, material: _material, ...rest } = run;
            return answer({ run: rest });
          },
        },
        cancel: async (params: Row) => {
          record("jobs.cancel", params);
          const run = runs.find((entry) => entry.id === params.run_id)!;
          run.status = "cancelled";
          return answer({ run });
        },
        list: async (params: Row) => {
          record("jobs.list", params);
          return answer({ jobs: Number(params.offset ?? 0) === 0 ? jobs : [] });
        },
      },
      schedules: {
        list: async (params: Row) => answer({ schedules: Number(params.offset ?? 0) === 0 ? [{ id: "schedule_1", name: "sequences.tick", job_definition_id: "jobdef_1", expression: "0 * * * * *", timezone: "UTC", enabled: 1 }] : [] }),
      },
      credentials: {
        resolve: async (params: Row) => {
          record("credentials.resolve", params);
          return answer({ value: `test-${String(params.account)}`, credentialId: `cred_${String(params.account)}`, type: "token" });
        },
      },
    };
  }

  return { jobs, runs, calls, failNext, nexFor, revisionOf, bumpRevision: (name: string) => {
    const job = jobs.find((entry) => entry.name === name)!;
    job.default_revision_id = `${job.default_revision_id}x`;
    return job.default_revision_id;
  } };
}

/** A fetch that answers the ops sources routes from a table of handlers, recording each path. */
export function fakeFetch(routes: Record<string, (url: URL) => { status: number; body?: unknown; headers?: Record<string, string> }>) {
  const seen: string[] = [];
  const fetch = async (url: string, init: { headers: Record<string, string> }) => {
    const parsed = new URL(url);
    seen.push(`${parsed.pathname}${parsed.search}`);
    if (!init.headers["CF-Access-Client-Id"] && parsed.hostname === "ops.moonsleep.co") return { status: 403, headers: { get: () => null }, text: async () => "{}" };
    const name = parsed.hostname === "api.drand.sh" ? (parsed.pathname.endsWith("/info") ? "drand:info" : "drand:round") : parsed.pathname.split("/").pop()!;
    const handler = routes[name];
    const answer = handler ? handler(parsed) : { status: 404, body: { error: "not found" } };
    return { status: answer.status, headers: { get: (header: string) => answer.headers?.[header.toLowerCase()] ?? null }, text: async () => JSON.stringify(answer.body ?? {}) };
  };
  return { fetch, seen };
}
