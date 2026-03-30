import { html, nothing } from "lit";
import { icons } from "../../ui/icons.ts";
import type {
  MemoryReviewSearchType,
  MemoryReviewQualityBucket,
  MemoryReviewQualityItemsResult,
  MemoryReviewQualitySummary,
} from "../../ui/types.ts";

// ─── Types ────────────────────────────────────────────────────────────

export type MemoryPageProps = {
  subTab: "library" | "search" | "quality";
  onSubTabChange: (sub: MemoryPageProps["subTab"]) => void;
  loading: boolean;
  error: string | null;

  // Library - runs and episodes
  runs: Array<{
    id: string;
    agent_id?: string;
    started_at?: number;
    ended_at?: number;
    episode_count?: number;
    status?: string;
  }>;
  selectedRunId: string | null;
  onRunSelect: (runId: string) => void;
  episodes: Array<{
    id: string;
    run_id?: string;
    summary?: string;
    observation_count?: number;
    fact_count?: number;
    started_at?: number;
  }>;
  episodesLoading: boolean;
  selectedEpisodeId: string | null;
  onEpisodeSelect: (episodeId: string) => void;

  // Episode detail
  inspectorLoading: boolean;
  episodeDetail: {
    id: string;
    summary?: string;
    observations?: Array<{ id: string; text: string; confidence?: number }>;
    facts?: Array<{
      id: string;
      subject?: string;
      predicate?: string;
      object?: string;
      confidence?: number;
    }>;
  } | null;

  // Search
  searchQuery: string;
  searchType: MemoryReviewSearchType;
  searchLoading: boolean;
  searchResults: Array<{
    id: string;
    kind: string;
    text: string;
    score?: number;
    entity_id?: string;
  }>;
  onSearchQueryChange: (q: string) => void;
  onSearchTypeChange: (t: MemoryPageProps["searchType"]) => void;
  onSearch: () => void;

  // Quality
  qualityScope: "run" | "global";
  qualityLoading: boolean;
  qualitySummary: MemoryReviewQualitySummary | null;
  qualityItemsLoading: boolean;
  qualityBucket: MemoryReviewQualityBucket;
  qualityItems: MemoryReviewQualityItemsResult | null;
  onQualityScopeChange: (scope: MemoryPageProps["qualityScope"]) => void;
  onQualityBucketSelect: (bucket: MemoryPageProps["qualityBucket"]) => void;
  onQualityPage: (offset: number) => void;

  // Detail panel
  detailKind: "entity" | "fact" | "observation" | null;
  detailLoading: boolean;
  detailEntity: {
    id: string;
    name?: string;
    facts?: Array<{ id: string; text: string }>;
    observations?: Array<{ id: string; text: string }>;
  } | null;
  detailFact: {
    id: string;
    subject?: string;
    predicate?: string;
    object?: string;
    confidence?: number;
    source_episode_id?: string;
  } | null;
  detailObservation: {
    id: string;
    text: string;
    confidence?: number;
    source_episode_id?: string;
    entity_id?: string;
  } | null;
  onEntitySelect: (id: string) => void;
  onFactSelect: (id: string) => void;
  onObservationSelect: (id: string) => void;

  onRefresh: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────

function fmtTs(ts: number | undefined): string {
  if (ts == null) return "—";
  const ms = ts < 1_000_000_000_000 ? ts * 1000 : ts;
  return new Date(ms).toLocaleString();
}

function confidenceBadge(confidence: number | undefined) {
  if (confidence == null) return nothing;
  const pct = Math.round(confidence * 100);
  const cls =
    pct >= 80
      ? "v2-badge--success"
      : pct >= 50
        ? "v2-badge--warning"
        : "v2-badge--danger";
  return html`<span class="v2-badge ${cls}">${pct}%</span>`;
}

function kindBadge(kind: string) {
  const map: Record<string, string> = {
    entity: "v2-badge--neutral",
    fact: "v2-badge--success",
    observation: "v2-badge--warning",
    semantic: "v2-badge--neutral",
  };
  const cls = map[kind] ?? "v2-badge--neutral";
  return html`<span class="v2-badge ${cls}">${kind}</span>`;
}

function statusBadge(status: string | undefined) {
  if (!status) return nothing;
  const cls =
    status === "completed" || status === "done"
      ? "v2-badge--success"
      : status === "running" || status === "active"
        ? "v2-badge--warning"
        : status === "failed" || status === "error"
          ? "v2-badge--danger"
          : "v2-badge--neutral";
  return html`<span class="v2-badge ${cls}">${status}</span>`;
}

function renderSpinner() {
  return html`
    <div style="display: flex; align-items: center; justify-content: center; padding: var(--v2-space-8);">
      <span class="v2-muted" style="display: flex; align-items: center; gap: var(--v2-space-2); font-size: var(--v2-text-sm);">
        <span style="width: 16px; height: 16px; animation: v2-spin 1s linear infinite;">${icons.loader}</span>
        Loading…
      </span>
    </div>
  `;
}

// ─── Sub-tab bar ──────────────────────────────────────────────────────

function renderSubTabs(
  active: MemoryPageProps["subTab"],
  onChange: MemoryPageProps["onSubTabChange"],
) {
  const tabs: { key: MemoryPageProps["subTab"]; label: string }[] = [
    { key: "library", label: "Library" },
    { key: "search", label: "Search" },
    { key: "quality", label: "Quality" },
  ];
  return html`
    <div class="v2-detail-tabs" style="margin-bottom: var(--v2-space-5);">
      ${tabs.map(
        (t) => html`
          <button
            class="v2-detail-tab ${active === t.key ? "v2-detail-tab--active" : ""}"
            @click=${() => onChange(t.key)}
          >
            ${t.label}
          </button>
        `,
      )}
    </div>
  `;
}

// ─── Library sub-tab ──────────────────────────────────────────────────

function renderRunCard(
  run: MemoryPageProps["runs"][number],
  selected: boolean,
  onClick: () => void,
) {
  return html`
    <div
      class="v2-card v2-card--interactive"
      style="
        padding: var(--v2-space-3); margin-bottom: var(--v2-space-2); cursor: pointer;
        ${selected ? "border-color: var(--v2-accent); box-shadow: 0 0 0 1px var(--v2-accent);" : ""}
      "
      @click=${onClick}
    >
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--v2-space-1);">
        <span class="v2-strong" style="font-size: var(--v2-text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px;">
          ${run.agent_id || run.id}
        </span>
        ${statusBadge(run.status)}
      </div>
      <div class="v2-muted" style="font-size: var(--v2-text-2xs);">${fmtTs(run.started_at)}</div>
      ${run.episode_count != null
        ? html`<div class="v2-faint" style="font-size: var(--v2-text-2xs); margin-top: var(--v2-space-1);">${run.episode_count} episode${run.episode_count === 1 ? "" : "s"}</div>`
        : nothing}
    </div>
  `;
}

function renderEpisodeRow(
  ep: MemoryPageProps["episodes"][number],
  selected: boolean,
  onClick: () => void,
) {
  return html`
    <div
      class="v2-card v2-card--interactive"
      style="
        padding: var(--v2-space-2) var(--v2-space-3); margin-bottom: var(--v2-space-1); cursor: pointer;
        ${selected ? "border-color: var(--v2-accent); box-shadow: 0 0 0 1px var(--v2-accent);" : ""}
      "
      @click=${onClick}
    >
      <div class="v2-strong" style="font-size: var(--v2-text-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        ${ep.summary || ep.id}
      </div>
      <div style="display: flex; gap: var(--v2-space-3); margin-top: var(--v2-space-1);">
        ${ep.observation_count != null
          ? html`<span class="v2-faint" style="font-size: var(--v2-text-2xs);">${ep.observation_count} obs</span>`
          : nothing}
        ${ep.fact_count != null
          ? html`<span class="v2-faint" style="font-size: var(--v2-text-2xs);">${ep.fact_count} facts</span>`
          : nothing}
        ${ep.started_at != null
          ? html`<span class="v2-faint" style="font-size: var(--v2-text-2xs);">${fmtTs(ep.started_at)}</span>`
          : nothing}
      </div>
    </div>
  `;
}

function renderObservationCard(
  obs: { id: string; text: string; confidence?: number },
  onSelect: (id: string) => void,
) {
  return html`
    <div
      class="v2-card v2-card--interactive"
      style="padding: var(--v2-space-3); margin-bottom: var(--v2-space-2); cursor: pointer;"
      @click=${() => onSelect(obs.id)}
    >
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--v2-space-2);">
        <div class="v2-muted" style="font-size: var(--v2-text-sm); flex: 1;">${obs.text}</div>
        ${confidenceBadge(obs.confidence)}
      </div>
    </div>
  `;
}

function renderFactCard(
  fact: {
    id: string;
    subject?: string;
    predicate?: string;
    object?: string;
    confidence?: number;
  },
  onSelect: (id: string) => void,
) {
  return html`
    <div
      class="v2-card v2-card--interactive"
      style="padding: var(--v2-space-3); margin-bottom: var(--v2-space-2); cursor: pointer;"
      @click=${() => onSelect(fact.id)}
    >
      <div style="display: flex; justify-content: space-between; align-items: center; gap: var(--v2-space-2);">
        <div style="flex: 1; font-size: var(--v2-text-sm);">
          <span class="v2-strong">${fact.subject ?? "?"}</span>
          <span class="v2-muted" style="margin: 0 var(--v2-space-1);">\u2192</span>
          <span class="v2-mono" style="font-size: var(--v2-text-xs);">${fact.predicate ?? "?"}</span>
          <span class="v2-muted" style="margin: 0 var(--v2-space-1);">\u2192</span>
          <span class="v2-strong">${fact.object ?? "?"}</span>
        </div>
        ${confidenceBadge(fact.confidence)}
      </div>
    </div>
  `;
}

function renderEpisodeInspector(props: MemoryPageProps) {
  if (props.inspectorLoading) return renderSpinner();

  if (!props.selectedEpisodeId || !props.episodeDetail) {
    return html`
      <div class="v2-card">
        <div class="v2-empty">
          <div class="v2-empty-icon">${icons.brain}</div>
          <div class="v2-empty-title">Select an episode to inspect</div>
          <div class="v2-empty-description">
            Choose a run and episode from the left panel to view its extracted observations and facts.
          </div>
        </div>
      </div>
    `;
  }

  const detail = props.episodeDetail;
  const observations = detail.observations ?? [];
  const facts = detail.facts ?? [];

  return html`
    <div>
      ${detail.summary
        ? html`
            <div class="v2-card" style="margin-bottom: var(--v2-space-4);">
              <div class="v2-section-label" style="margin-bottom: var(--v2-space-2);">Summary</div>
              <div class="v2-muted" style="font-size: var(--v2-text-sm);">${detail.summary}</div>
            </div>
          `
        : nothing}

      <div class="v2-section-label" style="margin-bottom: var(--v2-space-2);">
        Observations
        <span class="v2-faint" style="font-weight: 400; margin-left: var(--v2-space-1);">(${observations.length})</span>
      </div>
      ${observations.length === 0
        ? html`<div class="v2-muted" style="font-size: var(--v2-text-xs); padding: var(--v2-space-3);">No observations extracted.</div>`
        : observations.map((o) => renderObservationCard(o, props.onObservationSelect))}

      <div class="v2-section-label" style="margin-bottom: var(--v2-space-2); margin-top: var(--v2-space-4);">
        Facts
        <span class="v2-faint" style="font-weight: 400; margin-left: var(--v2-space-1);">(${facts.length})</span>
      </div>
      ${facts.length === 0
        ? html`<div class="v2-muted" style="font-size: var(--v2-text-xs); padding: var(--v2-space-3);">No facts extracted.</div>`
        : facts.map((f) => renderFactCard(f, props.onFactSelect))}
    </div>
  `;
}

function renderLibraryTab(props: MemoryPageProps) {
  return html`
    <div style="display: grid; grid-template-columns: 280px 1fr; gap: 16px; min-height: 400px;">
      <!-- Left panel: runs + episodes -->
      <div style="overflow-y: auto; max-height: 70vh;">
        <div class="v2-section-label" style="margin-bottom: var(--v2-space-2);">
          Runs
          <span class="v2-faint" style="font-weight: 400; margin-left: var(--v2-space-1);">(${props.runs.length})</span>
        </div>
        ${props.runs.length === 0
          ? html`<div class="v2-muted" style="font-size: var(--v2-text-xs); padding: var(--v2-space-3);">No memory runs found.</div>`
          : props.runs.map((r) =>
              renderRunCard(r, r.id === props.selectedRunId, () => props.onRunSelect(r.id)),
            )}

        ${props.selectedRunId != null
          ? html`
              <div class="v2-section-label" style="margin-top: var(--v2-space-4); margin-bottom: var(--v2-space-2);">
                Episodes
                ${props.episodesLoading
                  ? html`<span class="v2-faint" style="font-weight: 400; margin-left: var(--v2-space-1);">loading…</span>`
                  : html`<span class="v2-faint" style="font-weight: 400; margin-left: var(--v2-space-1);">(${props.episodes.length})</span>`}
              </div>
              ${props.episodesLoading
                ? renderSpinner()
                : props.episodes.length === 0
                  ? html`<div class="v2-muted" style="font-size: var(--v2-text-xs); padding: var(--v2-space-3);">No episodes in this run.</div>`
                  : props.episodes.map((ep) =>
                      renderEpisodeRow(
                        ep,
                        ep.id === props.selectedEpisodeId,
                        () => props.onEpisodeSelect(ep.id),
                      ),
                    )}
            `
          : nothing}
      </div>

      <!-- Right panel: episode inspector -->
      <div style="overflow-y: auto; max-height: 70vh;">
        ${renderEpisodeInspector(props)}
      </div>
    </div>
  `;
}

// ─── Search sub-tab ───────────────────────────────────────────────────

function renderSearchTab(props: MemoryPageProps) {
  const types: { key: MemoryPageProps["searchType"]; label: string }[] = [
    { key: "all", label: "All" },
    { key: "entities", label: "Entities" },
    { key: "facts", label: "Facts" },
    { key: "observations", label: "Observations" },
  ];

  return html`
    <div>
      <!-- Search bar -->
      <div style="display: flex; gap: var(--v2-space-2); margin-bottom: var(--v2-space-4);">
        <select
          class="v2-search-input"
          style="width: 150px; flex-shrink: 0;"
          .value=${props.searchType}
          @change=${(e: Event) =>
            props.onSearchTypeChange(
              (e.target as HTMLSelectElement).value as MemoryPageProps["searchType"],
            )}
        >
          ${types.map(
            (t) => html`<option value=${t.key} ?selected=${props.searchType === t.key}>${t.label}</option>`,
          )}
        </select>
        <div class="v2-search-wrap" style="flex: 1;">
          ${icons.search}
          <input
            class="v2-search-input"
            type="text"
            placeholder="Search across the memory graph…"
            .value=${props.searchQuery}
            @input=${(e: Event) =>
              props.onSearchQueryChange((e.target as HTMLInputElement).value)}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") props.onSearch();
            }}
          />
        </div>
        <button class="v2-btn v2-btn--primary" @click=${props.onSearch}>Search</button>
      </div>

      <!-- Results -->
      ${props.searchLoading
        ? renderSpinner()
        : props.searchResults.length === 0
          ? html`
              <div class="v2-card">
                <div class="v2-empty">
                  <div class="v2-empty-icon">${icons.search}</div>
                  <div class="v2-empty-title">Search the memory graph</div>
                  <div class="v2-empty-description">
                    Search across entities, facts, observations, and semantic content.
                  </div>
                </div>
              </div>
            `
          : html`
              <div style="display: flex; flex-direction: column; gap: var(--v2-space-2);">
                ${props.searchResults.map((r) => renderSearchResult(r, props))}
              </div>
            `}
    </div>
  `;
}

function renderSearchResult(
  result: MemoryPageProps["searchResults"][number],
  props: MemoryPageProps,
) {
  const handleClick = () => {
    if (result.kind === "entity" || result.entity_id) {
      props.onEntitySelect(result.entity_id ?? result.id);
    } else if (result.kind === "fact") {
      props.onFactSelect(result.id);
    } else if (result.kind === "observation") {
      props.onObservationSelect(result.id);
    }
  };

  return html`
    <div
      class="v2-card v2-card--interactive"
      style="padding: var(--v2-space-3); cursor: pointer;"
      @click=${handleClick}
    >
      <div style="display: flex; align-items: center; gap: var(--v2-space-2); margin-bottom: var(--v2-space-1);">
        ${kindBadge(result.kind)}
        ${result.score != null
          ? html`<span class="v2-faint" style="font-size: var(--v2-text-2xs); margin-left: auto;">score: ${result.score.toFixed(3)}</span>`
          : nothing}
      </div>
      <div class="v2-muted" style="font-size: var(--v2-text-sm);">${result.text}</div>
      ${result.entity_id
        ? html`<div class="v2-faint" style="font-size: var(--v2-text-2xs); margin-top: var(--v2-space-1);">entity: ${result.entity_id}</div>`
        : nothing}
    </div>
  `;
}

// ─── Quality sub-tab ──────────────────────────────────────────────────

function renderQualityTab(props: MemoryPageProps) {
  const summary = props.qualitySummary;
  const buckets: {
    key: MemoryPageProps["qualityBucket"];
    label: string;
    description: string;
    count: number;
  }[] = summary
    ? Object.values(summary.buckets)
    : [];
  const qualityItems = props.qualityItems?.items ?? [];
  const qualityTotal = props.qualityItems?.total ?? 0;
  const qualityLimit = props.qualityItems?.limit ?? 100;
  const qualityOffset = props.qualityItems?.offset ?? 0;
  const hasPrev = qualityOffset > 0;
  const nextOffset = qualityOffset + qualityLimit;
  const hasNext = nextOffset < qualityTotal;

  return html`
    <div>
      <!-- Summary cards -->
      ${props.qualityLoading && !summary
        ? renderSpinner()
        : !summary
          ? html`
              <div class="v2-card" style="margin-bottom: var(--v2-space-5);">
                <div class="v2-empty">
                  <div class="v2-empty-icon">${icons.barChart}</div>
                  <div class="v2-empty-title">No quality data</div>
                  <div class="v2-empty-description">
                    Quality triage data will appear here once memory review has completed.
                  </div>
                </div>
              </div>
            `
          : html`
              <div class="v2-card" style="padding: var(--v2-space-4); margin-bottom: var(--v2-space-4);">
                <div style="display: flex; align-items: end; justify-content: space-between; gap: var(--v2-space-4); flex-wrap: wrap;">
                  <div>
                    <div class="v2-label">Scope</div>
                    <div class="v2-muted" style="font-size: var(--v2-text-xs);">
                      ${summary.scope.mode === "run"
                        ? summary.scope.run_id
                          ? `run ${summary.scope.run_id}`
                          : "run"
                        : "global"}
                    </div>
                  </div>
                  <label class="v2-field" style="min-width: 160px;">
                    <span class="v2-label">View</span>
                    <select
                      class="v2-select"
                      .value=${props.qualityScope}
                      @change=${(event: Event) =>
                        props.onQualityScopeChange(
                          (event.target as HTMLSelectElement).value as MemoryPageProps["qualityScope"],
                        )}
                    >
                      <option value="run">Run</option>
                      <option value="global">Global</option>
                    </select>
                  </label>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--v2-space-3); margin-bottom: var(--v2-space-5);">
                ${buckets.map(
                  (bucket) => html`
                    <div
                      class="v2-card v2-card--interactive"
                      style="
                        padding: var(--v2-space-4); cursor: pointer;
                        ${props.qualityBucket === bucket.key ? `border-color: var(--v2-accent); box-shadow: 0 0 0 1px var(--v2-accent);` : ""}
                      "
                      title=${bucket.description}
                      @click=${() => props.onQualityBucketSelect(bucket.key)}
                    >
                      <div style="display: flex; align-items: center; justify-content: space-between; gap: var(--v2-space-3);">
                        <div class="v2-strong" style="font-size: var(--v2-text-sm);">${bucket.label}</div>
                        <span class="v2-badge v2-badge--neutral">${bucket.count}</span>
                      </div>
                      <div class="v2-muted" style="font-size: var(--v2-text-xs); margin-top: var(--v2-space-2); line-height: 1.4;">
                        ${bucket.description}
                      </div>
                    </div>
                  `,
                )}
              </div>
            `}

      <!-- Quality items table -->
      ${props.qualityItemsLoading
        ? renderSpinner()
        : qualityItems.length === 0
          ? html`
              <div class="v2-card">
                <div class="v2-empty">
                  <div class="v2-empty-icon">${icons.barChart}</div>
                  <div class="v2-empty-title">No quality items found</div>
                  <div class="v2-empty-description">
                    This bucket is currently clear for the selected scope.
                  </div>
                </div>
              </div>
            `
          : html`
              <div style="display: flex; align-items: center; justify-content: space-between; gap: var(--v2-space-3); margin-bottom: var(--v2-space-3);">
                <div class="v2-muted" style="font-size: var(--v2-text-xs);">
                  ${qualityTotal} total item${qualityTotal === 1 ? "" : "s"}
                </div>
                <div style="display: flex; gap: var(--v2-space-2);">
                  <button
                    class="v2-btn v2-btn--secondary"
                    ?disabled=${!hasPrev}
                    @click=${() => props.onQualityPage(Math.max(0, qualityOffset - qualityLimit))}
                  >
                    Prev
                  </button>
                  <button
                    class="v2-btn v2-btn--secondary"
                    ?disabled=${!hasNext}
                    @click=${() => props.onQualityPage(nextOffset)}
                  >
                    Next
                  </button>
                </div>
              </div>
              <div class="v2-card" style="padding: 0; overflow: hidden;">
                <table class="v2-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Content</th>
                      <th>Status</th>
                      <th>Provenance</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${qualityItems.map(
                      (item) => html`
                        <tr
                          style="${item.record_type !== "episode" ? "cursor: pointer;" : ""}"
                          @click=${() => {
                            if (item.record_type === "entity" && item.entity_id) props.onEntitySelect(item.entity_id);
                            else if (item.record_type === "fact" && item.fact_id) props.onFactSelect(item.fact_id);
                            else if (item.record_type === "observation" && item.observation_id) props.onObservationSelect(item.observation_id);
                          }}
                        >
                          <td>${kindBadge(item.record_type)}</td>
                          <td>
                            <span class="v2-strong" style="display: block; font-size: var(--v2-text-sm);">
                              ${item.primary_text}
                            </span>
                            ${item.secondary_text
                              ? html`
                                  <span class="v2-faint" style="display: block; margin-top: var(--v2-space-1); font-size: var(--v2-text-xs);">
                                    ${item.secondary_text}
                                  </span>
                                `
                              : nothing}
                          </td>
                          <td>
                            <span class="v2-faint" style="font-size: var(--v2-text-xs);">
                              ${item.status || "n/a"}
                            </span>
                          </td>
                          <td>
                            <div class="v2-mono" style="font-size: var(--v2-text-2xs); line-height: 1.5;">
                              ${item.record_type === "entity" && item.entity_id
                                ? item.entity_id
                                : item.record_type === "fact" && item.fact_id
                                  ? item.fact_id
                                  : item.record_type === "observation" && item.observation_id
                                    ? item.observation_id
                                    : item.episode_id || item.record_id}
                            </div>
                          </td>
                          <td>
                            <span class="v2-faint" style="font-size: var(--v2-text-xs);">
                              ${item.timestamp_iso || item.ingested_at_iso || "—"}
                            </span>
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            `}
    </div>
  `;
}

// ─── Detail panel ─────────────────────────────────────────────────────

function renderDetailPanel(props: MemoryPageProps) {
  if (!props.detailKind) return nothing;

  if (props.detailLoading) {
    return html`
      <div class="v2-card" style="margin-top: var(--v2-space-4);">
        ${renderSpinner()}
      </div>
    `;
  }

  if (props.detailKind === "entity" && props.detailEntity) {
    return renderEntityDetail(props.detailEntity, props);
  }
  if (props.detailKind === "fact" && props.detailFact) {
    return renderFactDetail(props.detailFact, props);
  }
  if (props.detailKind === "observation" && props.detailObservation) {
    return renderObservationDetail(props.detailObservation, props);
  }
  return nothing;
}

function renderEntityDetail(
  entity: NonNullable<MemoryPageProps["detailEntity"]>,
  props: MemoryPageProps,
) {
  const facts = entity.facts ?? [];
  const observations = entity.observations ?? [];

  return html`
    <div class="v2-card" style="margin-top: var(--v2-space-4); position: relative;">
      <button
        class="v2-icon-btn"
        style="position: absolute; top: var(--v2-space-2); right: var(--v2-space-2);"
        @click=${() => props.onEntitySelect("")}
        title="Close"
      >
        ${icons.x}
      </button>

      <div style="display: flex; align-items: center; gap: var(--v2-space-2); margin-bottom: var(--v2-space-3);">
        <span class="v2-badge v2-badge--neutral">Entity</span>
        <span class="v2-strong" style="font-size: var(--v2-text-md);">${entity.name || entity.id}</span>
      </div>

      ${facts.length > 0
        ? html`
            <div class="v2-section-label" style="margin-bottom: var(--v2-space-2);">
              Linked Facts
              <span class="v2-faint" style="font-weight: 400;">(${facts.length})</span>
            </div>
            ${facts.map(
              (f) => html`
                <div
                  class="v2-card v2-card--interactive"
                  style="padding: var(--v2-space-2) var(--v2-space-3); margin-bottom: var(--v2-space-1); cursor: pointer;"
                  @click=${() => props.onFactSelect(f.id)}
                >
                  <span class="v2-muted" style="font-size: var(--v2-text-sm);">${f.text}</span>
                </div>
              `,
            )}
          `
        : html`<div class="v2-faint" style="font-size: var(--v2-text-xs); margin-bottom: var(--v2-space-3);">No linked facts.</div>`}

      ${observations.length > 0
        ? html`
            <div class="v2-section-label" style="margin-top: var(--v2-space-3); margin-bottom: var(--v2-space-2);">
              Linked Observations
              <span class="v2-faint" style="font-weight: 400;">(${observations.length})</span>
            </div>
            ${observations.map(
              (o) => html`
                <div
                  class="v2-card v2-card--interactive"
                  style="padding: var(--v2-space-2) var(--v2-space-3); margin-bottom: var(--v2-space-1); cursor: pointer;"
                  @click=${() => props.onObservationSelect(o.id)}
                >
                  <span class="v2-muted" style="font-size: var(--v2-text-sm);">${o.text}</span>
                </div>
              `,
            )}
          `
        : html`<div class="v2-faint" style="font-size: var(--v2-text-xs);">No linked observations.</div>`}
    </div>
  `;
}

function renderFactDetail(
  fact: NonNullable<MemoryPageProps["detailFact"]>,
  props: MemoryPageProps,
) {
  return html`
    <div class="v2-card" style="margin-top: var(--v2-space-4); position: relative;">
      <button
        class="v2-icon-btn"
        style="position: absolute; top: var(--v2-space-2); right: var(--v2-space-2);"
        @click=${() => props.onFactSelect("")}
        title="Close"
      >
        ${icons.x}
      </button>

      <div style="display: flex; align-items: center; gap: var(--v2-space-2); margin-bottom: var(--v2-space-3);">
        <span class="v2-badge v2-badge--success">Fact</span>
        <span class="v2-mono" style="font-size: var(--v2-text-xs);">${fact.id}</span>
      </div>

      <div style="display: grid; grid-template-columns: auto 1fr; gap: var(--v2-space-2) var(--v2-space-4); font-size: var(--v2-text-sm);">
        <span class="v2-faint">Subject</span>
        <span class="v2-strong">${fact.subject ?? "—"}</span>
        <span class="v2-faint">Predicate</span>
        <span class="v2-mono">${fact.predicate ?? "—"}</span>
        <span class="v2-faint">Object</span>
        <span class="v2-strong">${fact.object ?? "—"}</span>
        <span class="v2-faint">Confidence</span>
        <span>${confidenceBadge(fact.confidence)}</span>
        <span class="v2-faint">Source Episode</span>
        <span class="v2-mono" style="font-size: var(--v2-text-xs);">${fact.source_episode_id ?? "—"}</span>
      </div>
    </div>
  `;
}

function renderObservationDetail(
  obs: NonNullable<MemoryPageProps["detailObservation"]>,
  props: MemoryPageProps,
) {
  return html`
    <div class="v2-card" style="margin-top: var(--v2-space-4); position: relative;">
      <button
        class="v2-icon-btn"
        style="position: absolute; top: var(--v2-space-2); right: var(--v2-space-2);"
        @click=${() => props.onObservationSelect("")}
        title="Close"
      >
        ${icons.x}
      </button>

      <div style="display: flex; align-items: center; gap: var(--v2-space-2); margin-bottom: var(--v2-space-3);">
        <span class="v2-badge v2-badge--warning">Observation</span>
        <span class="v2-mono" style="font-size: var(--v2-text-xs);">${obs.id}</span>
      </div>

      <div class="v2-muted" style="font-size: var(--v2-text-sm); margin-bottom: var(--v2-space-3);">
        ${obs.text}
      </div>

      <div style="display: grid; grid-template-columns: auto 1fr; gap: var(--v2-space-2) var(--v2-space-4); font-size: var(--v2-text-sm);">
        <span class="v2-faint">Confidence</span>
        <span>${confidenceBadge(obs.confidence)}</span>
        <span class="v2-faint">Source Episode</span>
        <span class="v2-mono" style="font-size: var(--v2-text-xs);">${obs.source_episode_id ?? "—"}</span>
        ${obs.entity_id
          ? html`
              <span class="v2-faint">Entity</span>
              <span
                class="v2-mono"
                style="font-size: var(--v2-text-xs); cursor: pointer; color: var(--v2-accent); text-decoration: underline;"
                @click=${() => props.onEntitySelect(obs.entity_id!)}
              >
                ${obs.entity_id}
              </span>
            `
          : nothing}
      </div>
    </div>
  `;
}

// ─── Main render ──────────────────────────────────────────────────────

export function renderMemoryPage(props: MemoryPageProps) {
  const content =
    props.subTab === "library"
      ? (props.loading ? renderSpinner() : renderLibraryTab(props))
      : props.subTab === "search"
        ? renderSearchTab(props)
        : props.subTab === "quality"
          ? renderQualityTab(props)
          : nothing;
  return html`
    <div class="v2-page-header">
      <div class="v2-page-header-row">
        <div>
          <h1 class="v2-page-title">Memory</h1>
          <p class="v2-page-subtitle">
            Inspect extracted observations, facts, entities, and quality across runs and episodes.
          </p>
        </div>
        <div class="v2-row">
          <button class="v2-btn v2-btn--secondary" @click=${props.onRefresh}>
            ${icons.loader}
            Refresh
          </button>
        </div>
      </div>
    </div>

    ${renderSubTabs(props.subTab, props.onSubTabChange)}

    ${props.error
      ? html`
          <div class="v2-card" style="border-color: var(--v2-red, #ef4444); margin-bottom: var(--v2-space-4);">
            <div style="display: flex; align-items: center; gap: var(--v2-space-2);">
              <span class="v2-badge v2-badge--danger">Error</span>
              <span class="v2-muted" style="font-size: var(--v2-text-sm);">${props.error}</span>
            </div>
          </div>
        `
      : nothing}

    ${content}

    ${renderDetailPanel(props)}
  `;
}
