import type { RuntimeBrowserClient } from "../runtime.ts";
import type {
  MemoryReviewEpisode,
  MemoryReviewEpisodeDetail,
  MemoryReviewEpisodeOutputs,
  MemoryReviewEntityDetail,
  MemoryReviewFactDetail,
  MemoryReviewObservationDetail,
  MemoryReviewQualityBucket,
  MemoryReviewQualityItemsResult,
  MemoryReviewQualitySummary,
  MemoryReviewRun,
  MemoryReviewSearchResult,
  MemoryReviewSearchType,
} from "../types.ts";

export type MemoryReviewState = {
  client: RuntimeBrowserClient | null;
  connected: boolean;
  memoryLoading: boolean;
  memoryError: string | null;
  memoryRuns: MemoryReviewRun[];
  memorySelectedRunId: string | null;
  memoryEpisodesLoading: boolean;
  memoryEpisodes: MemoryReviewEpisode[];
  memorySelectedEpisodeId: string | null;
  memoryInspectorLoading: boolean;
  memoryEpisodeDetail: MemoryReviewEpisodeDetail | null;
  memoryEpisodeOutputs: MemoryReviewEpisodeOutputs | null;
  memorySearchQuery: string;
  memorySearchType: MemoryReviewSearchType;
  memorySearchLoading: boolean;
  memorySearchResult: MemoryReviewSearchResult | null;
  memoryQualityScope: "run" | "global";
  memoryQualityLoading: boolean;
  memoryQualitySummary: MemoryReviewQualitySummary | null;
  memoryQualityBucket: MemoryReviewQualityBucket;
  memoryQualityItemsLoading: boolean;
  memoryQualityItems: MemoryReviewQualityItemsResult | null;
  memoryQualityItemsOffset: number;
  memoryDetailLoading: boolean;
  memoryDetailKind: "entity" | "fact" | "observation" | null;
  memoryDetailEntity: MemoryReviewEntityDetail | null;
  memoryDetailFact: MemoryReviewFactDetail | null;
  memoryDetailObservation: MemoryReviewObservationDetail | null;
};

type RunsListResponse = {
  runs?: MemoryReviewRun[];
};

type RunEpisodesResponse = {
  run?: MemoryReviewRun;
  episodes?: MemoryReviewEpisode[];
};

type MemoryUrlState = {
  runId: string | null;
  episodeId: string | null;
  scope: "run" | "global" | null;
  bucket: MemoryReviewQualityBucket | null;
  detailKind: "entity" | "fact" | "observation" | null;
  detailId: string | null;
};

function parseMemoryBucket(value: string | null): MemoryReviewQualityBucket | null {
  if (!value) {
    return null;
  }
  if (
    value === "unconsolidated_facts" ||
    value === "facts_missing_source_episode_id" ||
    value === "facts_without_entities" ||
    value === "entities_unknown_or_identifier_like" ||
    value === "stale_observations_recently_touched" ||
    value === "episodes_failed"
  ) {
    return value;
  }
  return null;
}

function parseMemoryDetailKind(value: string | null): "entity" | "fact" | "observation" | null {
  if (!value) {
    return null;
  }
  if (value === "entity" || value === "fact" || value === "observation") {
    return value;
  }
  return null;
}

function readMemoryUrlState(): MemoryUrlState {
  if (typeof window === "undefined") {
    return {
      runId: null,
      episodeId: null,
      scope: null,
      bucket: null,
      detailKind: null,
      detailId: null,
    };
  }
  const url = new URL(window.location.href);
  const scopeRaw = url.searchParams.get("memory_scope");
  const scope = scopeRaw === "run" || scopeRaw === "global" ? scopeRaw : null;
  return {
    runId: url.searchParams.get("memory_run"),
    episodeId: url.searchParams.get("memory_episode"),
    scope,
    bucket: parseMemoryBucket(url.searchParams.get("memory_bucket")),
    detailKind: parseMemoryDetailKind(url.searchParams.get("memory_detail_kind")),
    detailId: url.searchParams.get("memory_detail_id"),
  };
}

function writeMemoryUrlPatch(patch: Partial<MemoryUrlState>) {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  const apply = (key: string, value: string | null | undefined) => {
    if (!value) {
      url.searchParams.delete(key);
      return;
    }
    url.searchParams.set(key, value);
  };
  if ("runId" in patch) {
    apply("memory_run", patch.runId);
  }
  if ("episodeId" in patch) {
    apply("memory_episode", patch.episodeId);
  }
  if ("scope" in patch) {
    apply("memory_scope", patch.scope);
  }
  if ("bucket" in patch) {
    apply("memory_bucket", patch.bucket);
  }
  if ("detailKind" in patch) {
    apply("memory_detail_kind", patch.detailKind);
  }
  if ("detailId" in patch) {
    apply("memory_detail_id", patch.detailId);
  }
  window.history.replaceState({}, "", url.toString());
}

function resolveQualityRunId(state: MemoryReviewState): string | null {
  if (state.memoryQualityScope !== "run") {
    return null;
  }
  return state.memorySelectedRunId;
}

function normalizeRuns(response: RunsListResponse | undefined): MemoryReviewRun[] {
  return Array.isArray(response?.runs) ? response.runs : [];
}

function normalizeEpisodes(response: RunEpisodesResponse | undefined): MemoryReviewEpisode[] {
  return Array.isArray(response?.episodes) ? response.episodes : [];
}

function clearMemoryDetail(state: MemoryReviewState) {
  state.memoryDetailKind = null;
  state.memoryDetailEntity = null;
  state.memoryDetailFact = null;
  state.memoryDetailObservation = null;
  writeMemoryUrlPatch({ detailKind: null, detailId: null });
}

export async function loadMemoryRuns(
  state: MemoryReviewState,
  opts?: { keepSelection?: boolean; runId?: string | null },
) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.memoryLoading) {
    return;
  }
  state.memoryLoading = true;
  state.memoryError = null;
  try {
    const urlState = readMemoryUrlState();
    if (urlState.scope) {
      state.memoryQualityScope = urlState.scope;
    }
    if (urlState.bucket) {
      state.memoryQualityBucket = urlState.bucket;
      state.memoryQualityItemsOffset = 0;
    }
    const response = await state.client.request<RunsListResponse>("memory.review.runs.list", {
      limit: 200,
    });
    const runs = normalizeRuns(response);
    state.memoryRuns = runs;

    const requestedRunId = opts?.runId ?? state.memorySelectedRunId ?? urlState.runId;
    const nextRunId =
      requestedRunId && runs.some((run) => run.id === requestedRunId)
        ? requestedRunId
        : (runs[0]?.id ?? null);
    state.memorySelectedRunId = nextRunId;
    if (nextRunId) {
      await loadMemoryRunEpisodes(state, nextRunId, {
        keepEpisodeSelection: opts?.keepSelection === true,
        reloadQuality: false,
      });
    } else {
      state.memoryEpisodes = [];
      state.memorySelectedEpisodeId = null;
      state.memoryEpisodeDetail = null;
      state.memoryEpisodeOutputs = null;
      clearMemoryDetail(state);
    }
    writeMemoryUrlPatch({ runId: nextRunId });
    await loadMemoryQualitySummary(state, { loadItems: true });
    await runMemorySearch(state);

    if (urlState.detailKind && urlState.detailId) {
      const previousError = state.memoryError;
      if (urlState.detailKind === "entity") {
        await loadMemoryEntityDetail(state, urlState.detailId);
      } else if (urlState.detailKind === "fact") {
        await loadMemoryFactDetail(state, urlState.detailId);
      } else if (urlState.detailKind === "observation") {
        await loadMemoryObservationDetail(state, urlState.detailId);
      }
      if (state.memoryError && /not found/i.test(state.memoryError)) {
        state.memoryError = previousError;
        clearMemoryDetail(state);
      }
    }
  } catch (error) {
    state.memoryError = String(error);
  } finally {
    state.memoryLoading = false;
  }
}

export async function loadMemoryRunEpisodes(
  state: MemoryReviewState,
  runId: string,
  opts?: { keepEpisodeSelection?: boolean; episodeId?: string | null; reloadQuality?: boolean },
) {
  if (!state.client || !state.connected) {
    return;
  }
  if (!runId) {
    state.memoryEpisodes = [];
    state.memorySelectedEpisodeId = null;
    state.memoryEpisodeDetail = null;
    state.memoryEpisodeOutputs = null;
    clearMemoryDetail(state);
    writeMemoryUrlPatch({ runId: null, episodeId: null });
    return;
  }
  if (state.memoryEpisodesLoading) {
    return;
  }
  state.memoryEpisodesLoading = true;
  state.memoryError = null;
  state.memorySelectedRunId = runId;
  try {
    const response = await state.client.request<RunEpisodesResponse>(
      "memory.review.run.episodes.list",
      { run_id: runId },
    );
    const episodes = normalizeEpisodes(response);
    state.memoryEpisodes = episodes;

    const urlState = readMemoryUrlState();
    const requestedEpisodeId =
      opts?.episodeId ?? state.memorySelectedEpisodeId ?? urlState.episodeId;
    const nextEpisodeId =
      opts?.keepEpisodeSelection &&
      requestedEpisodeId &&
      episodes.some((episode) => episode.id === requestedEpisodeId)
        ? requestedEpisodeId
        : (episodes[0]?.id ?? null);
    state.memorySelectedEpisodeId = nextEpisodeId;
    if (nextEpisodeId) {
      await loadMemoryEpisodeInspector(state, nextEpisodeId);
    } else {
      state.memoryEpisodeDetail = null;
      state.memoryEpisodeOutputs = null;
    }
    if (opts?.reloadQuality !== false) {
      await loadMemoryQualitySummary(state, { loadItems: true });
    }
    writeMemoryUrlPatch({ runId, episodeId: nextEpisodeId });
  } catch (error) {
    state.memoryError = String(error);
  } finally {
    state.memoryEpisodesLoading = false;
  }
}

export async function loadMemoryEpisodeInspector(state: MemoryReviewState, episodeId: string) {
  if (!state.client || !state.connected) {
    return;
  }
  if (!episodeId) {
    state.memoryEpisodeDetail = null;
    state.memoryEpisodeOutputs = null;
    writeMemoryUrlPatch({ episodeId: null });
    return;
  }
  if (state.memoryInspectorLoading) {
    return;
  }
  state.memoryInspectorLoading = true;
  state.memoryError = null;
  state.memorySelectedEpisodeId = episodeId;
  try {
    const [detail, outputs] = await Promise.all([
      state.client.request<MemoryReviewEpisodeDetail>("memory.review.episode.get", {
        episode_id: episodeId,
      }),
      state.client.request<MemoryReviewEpisodeOutputs>("memory.review.episode.outputs.get", {
        episode_id: episodeId,
      }),
    ]);
    state.memoryEpisodeDetail = detail ?? null;
    state.memoryEpisodeOutputs = outputs ?? null;
    writeMemoryUrlPatch({ episodeId });
  } catch (error) {
    state.memoryError = String(error);
  } finally {
    state.memoryInspectorLoading = false;
  }
}

export async function loadMemoryQualitySummary(
  state: MemoryReviewState,
  opts?: { runId?: string | null; loadItems?: boolean },
) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.memoryQualityLoading) {
    return;
  }
  state.memoryQualityLoading = true;
  state.memoryError = null;
  try {
    const runId = opts?.runId ?? resolveQualityRunId(state);
    const response = await state.client.request<MemoryReviewQualitySummary>(
      "memory.review.quality.summary",
      { run_id: runId ?? undefined },
    );
    state.memoryQualitySummary = response ?? null;
    writeMemoryUrlPatch({ scope: state.memoryQualityScope });
    if (opts?.loadItems !== false) {
      await loadMemoryQualityItems(state, state.memoryQualityBucket, {
        runId,
        offset: state.memoryQualityItemsOffset,
      });
    }
  } catch (error) {
    state.memoryError = String(error);
  } finally {
    state.memoryQualityLoading = false;
  }
}

export async function loadMemoryQualityItems(
  state: MemoryReviewState,
  bucket = state.memoryQualityBucket,
  opts?: { runId?: string | null; offset?: number },
) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.memoryQualityItemsLoading) {
    return;
  }
  state.memoryQualityItemsLoading = true;
  state.memoryError = null;
  try {
    const runId = opts?.runId ?? resolveQualityRunId(state);
    const offset =
      typeof opts?.offset === "number" && Number.isFinite(opts.offset) && opts.offset >= 0
        ? Math.trunc(opts.offset)
        : 0;
    const response = await state.client.request<MemoryReviewQualityItemsResult>(
      "memory.review.quality.items.list",
      {
        bucket,
        run_id: runId ?? undefined,
        limit: 100,
        offset,
      },
    );
    state.memoryQualityBucket = bucket;
    state.memoryQualityItems = response ?? null;
    state.memoryQualityItemsOffset = response?.offset ?? offset;
    writeMemoryUrlPatch({ bucket });
  } catch (error) {
    state.memoryError = String(error);
  } finally {
    state.memoryQualityItemsLoading = false;
  }
}

export async function runMemorySearch(state: MemoryReviewState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.memorySearchLoading) {
    return;
  }
  state.memorySearchLoading = true;
  state.memoryError = null;
  try {
    const query = state.memorySearchQuery.trim();
    const response = await state.client.request<MemoryReviewSearchResult>("memory.review.search", {
      query,
      type: state.memorySearchType,
      limit: 50,
    });
    state.memorySearchResult = response ?? null;
  } catch (error) {
    state.memoryError = String(error);
  } finally {
    state.memorySearchLoading = false;
  }
}

export async function loadMemoryEntityDetail(state: MemoryReviewState, entityId: string) {
  if (!state.client || !state.connected || !entityId) {
    return;
  }
  if (state.memoryDetailLoading) {
    return;
  }
  state.memoryDetailLoading = true;
  state.memoryError = null;
  try {
    const response = await state.client.request<MemoryReviewEntityDetail>(
      "memory.review.entity.get",
      { entity_id: entityId },
    );
    state.memoryDetailKind = "entity";
    state.memoryDetailEntity = response ?? null;
    state.memoryDetailFact = null;
    state.memoryDetailObservation = null;
    writeMemoryUrlPatch({ detailKind: "entity", detailId: entityId });
  } catch (error) {
    state.memoryError = String(error);
  } finally {
    state.memoryDetailLoading = false;
  }
}

export async function loadMemoryFactDetail(state: MemoryReviewState, factId: string) {
  if (!state.client || !state.connected || !factId) {
    return;
  }
  if (state.memoryDetailLoading) {
    return;
  }
  state.memoryDetailLoading = true;
  state.memoryError = null;
  try {
    const response = await state.client.request<MemoryReviewFactDetail>("memory.review.fact.get", {
      fact_id: factId,
    });
    state.memoryDetailKind = "fact";
    state.memoryDetailFact = response ?? null;
    state.memoryDetailEntity = null;
    state.memoryDetailObservation = null;
    writeMemoryUrlPatch({ detailKind: "fact", detailId: factId });
  } catch (error) {
    state.memoryError = String(error);
  } finally {
    state.memoryDetailLoading = false;
  }
}

export async function loadMemoryObservationDetail(state: MemoryReviewState, observationId: string) {
  if (!state.client || !state.connected || !observationId) {
    return;
  }
  if (state.memoryDetailLoading) {
    return;
  }
  state.memoryDetailLoading = true;
  state.memoryError = null;
  try {
    const response = await state.client.request<MemoryReviewObservationDetail>(
      "memory.review.observation.get",
      { observation_id: observationId },
    );
    state.memoryDetailKind = "observation";
    state.memoryDetailObservation = response ?? null;
    state.memoryDetailEntity = null;
    state.memoryDetailFact = null;
    writeMemoryUrlPatch({ detailKind: "observation", detailId: observationId });
  } catch (error) {
    state.memoryError = String(error);
  } finally {
    state.memoryDetailLoading = false;
  }
}
