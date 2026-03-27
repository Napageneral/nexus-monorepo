import { html, nothing } from "lit";
import { icons } from "../../ui/icons.ts";

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
  searchType: "semantic" | "entity" | "fact" | "observation";
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
  qualityLoading: boolean;
  qualitySummary: {
    total?: number;
    high?: number;
    medium?: number;
    low?: number;
    unscored?: number;
  } | null;
  qualityBucket: "high" | "medium" | "low" | "unscored";
  qualityItems: Array<{
    id: string;
    kind: string;
    text: string;
    score?: number;
    reason?: string;
  }>;
  onQualityBucketSelect: (bucket: MemoryPageProps["qualityBucket"]) => void;

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
    { key: "semantic", label: "Semantic" },
    { key: "entity", label: "Entity" },
    { key: "fact", label: "Fact" },
    { key: "observation", label: "Observation" },
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
    color: string;
    badgeCls: string;
    count: number;
  }[] = [
    {
      key: "high",
      label: "High",
      color: "var(--v2-green, #22c55e)",
      badgeCls: "v2-badge--success",
      count: summary?.high ?? 0,
    },
    {
      key: "medium",
      label: "Medium",
      color: "var(--v2-yellow, #eab308)",
      badgeCls: "v2-badge--warning",
      count: summary?.medium ?? 0,
    },
    {
      key: "low",
      label: "Low",
      color: "var(--v2-red, #ef4444)",
      badgeCls: "v2-badge--danger",
      count: summary?.low ?? 0,
    },
    {
      key: "unscored",
      label: "Unscored",
      color: "var(--v2-text-muted, #888)",
      badgeCls: "v2-badge--neutral",
      count: summary?.unscored ?? 0,
    },
  ];

  return html`
    <div>
      <!-- Summary cards -->
      ${props.qualityLoading && !summary
        ? renderSpinner()
        : html`
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--v2-space-3); margin-bottom: var(--v2-space-5);">
              ${buckets.map(
                (b) => html`
                  <div
                    class="v2-card v2-card--interactive"
                    style="
                      padding: var(--v2-space-4); text-align: center; cursor: pointer;
                      ${props.qualityBucket === b.key ? `border-color: var(--v2-accent); box-shadow: 0 0 0 1px var(--v2-accent);` : ""}
                    "
                    @click=${() => props.onQualityBucketSelect(b.key)}
                  >
                    <div style="font-size: var(--v2-text-2xl, 28px); font-weight: 700; color: ${b.color};">
                      ${b.count}
                    </div>
                    <div class="v2-muted" style="font-size: var(--v2-text-xs); margin-top: var(--v2-space-1);">
                      ${b.label}
                    </div>
                  </div>
                `,
              )}
            </div>
          `}

      <!-- Quality items table -->
      ${props.qualityLoading
        ? renderSpinner()
        : props.qualityItems.length === 0
          ? html`
              <div class="v2-card">
                <div class="v2-empty">
                  <div class="v2-empty-icon">${icons.barChart}</div>
                  <div class="v2-empty-title">No ${props.qualityBucket} quality items found</div>
                  <div class="v2-empty-description">
                    Items scored as "${props.qualityBucket}" will appear here.
                  </div>
                </div>
              </div>
            `
          : html`
              <div class="v2-card" style="padding: 0; overflow: hidden;">
                <table class="v2-table">
                  <thead>
                    <tr>
                      <th>Kind</th>
                      <th>Content</th>
                      <th>Score</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${props.qualityItems.map(
                      (item) => html`
                        <tr
                          style="cursor: pointer;"
                          @click=${() => {
                            if (item.kind === "entity") props.onEntitySelect(item.id);
                            else if (item.kind === "fact") props.onFactSelect(item.id);
                            else props.onObservationSelect(item.id);
                          }}
                        >
                          <td>${kindBadge(item.kind)}</td>
                          <td>
                            <span style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: var(--v2-text-sm);">
                              ${item.text}
                            </span>
                          </td>
                          <td>
                            ${item.score != null
                              ? html`
                                  <div style="display: flex; align-items: center; gap: var(--v2-space-2); min-width: 80px;">
                                    <div style="
                                      flex: 1; height: 6px; border-radius: 3px;
                                      background: var(--v2-bg-nav-pill, rgba(255,255,255,0.06));
                                    ">
                                      <div style="
                                        width: ${Math.round((item.score ?? 0) * 100)}%;
                                        height: 100%; border-radius: 3px;
                                        background: ${(item.score ?? 0) >= 0.8 ? "var(--v2-green, #22c55e)" : (item.score ?? 0) >= 0.5 ? "var(--v2-yellow, #eab308)" : "var(--v2-red, #ef4444)"};
                                      "></div>
                                    </div>
                                    <span class="v2-mono" style="font-size: var(--v2-text-2xs); min-width: 32px;">
                                      ${Math.round((item.score ?? 0) * 100)}%
                                    </span>
                                  </div>
                                `
                              : html`<span class="v2-faint" style="font-size: var(--v2-text-xs);">—</span>`}
                          </td>
                          <td>
                            <span class="v2-faint" style="font-size: var(--v2-text-xs);">
                              ${item.reason || "—"}
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

    ${props.loading
      ? renderSpinner()
      : props.subTab === "library"
        ? renderLibraryTab(props)
        : props.subTab === "search"
          ? renderSearchTab(props)
          : props.subTab === "quality"
            ? renderQualityTab(props)
            : nothing}

    ${renderDetailPanel(props)}
  `;
}
