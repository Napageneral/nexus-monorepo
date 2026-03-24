import { html, nothing } from "lit";
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

export type MemoryViewProps = {
  loading: boolean;
  error: string | null;
  runs: MemoryReviewRun[];
  selectedRunId: string | null;
  episodesLoading: boolean;
  episodes: MemoryReviewEpisode[];
  selectedEpisodeId: string | null;
  inspectorLoading: boolean;
  episodeDetail: MemoryReviewEpisodeDetail | null;
  episodeOutputs: MemoryReviewEpisodeOutputs | null;
  searchQuery: string;
  searchType: MemoryReviewSearchType;
  searchLoading: boolean;
  searchResult: MemoryReviewSearchResult | null;
  subTab: "library" | "search" | "operations";
  qualityScope: "run" | "global";
  qualityLoading: boolean;
  qualitySummary: MemoryReviewQualitySummary | null;
  qualityBucket: MemoryReviewQualityBucket;
  qualityItemsLoading: boolean;
  qualityItems: MemoryReviewQualityItemsResult | null;
  detailLoading: boolean;
  detailKind: "entity" | "fact" | "observation" | null;
  detailEntity: MemoryReviewEntityDetail | null;
  detailFact: MemoryReviewFactDetail | null;
  detailObservation: MemoryReviewObservationDetail | null;
  onRefresh: () => void;
  onRunSelect: (runId: string) => void;
  onEpisodeSelect: (episodeId: string) => void;
  onEntitySelect: (entityId: string) => void;
  onFactSelect: (factId: string) => void;
  onObservationSelect: (observationId: string) => void;
  onSearchQueryChange: (value: string) => void;
  onSearchTypeChange: (value: MemoryReviewSearchType) => void;
  onSubTabChange: (value: "library" | "search" | "operations") => void;
  onSearch: () => void;
  onQualityScopeChange: (scope: "run" | "global") => void;
  onQualityBucketSelect: (bucket: MemoryReviewQualityBucket) => void;
  onQualityPage: (offset: number) => void;
};

function formatDateTime(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "n/a";
  }
  const normalized = value < 1_000_000_000_000 ? value * 1000 : value;
  return new Date(normalized).toLocaleString();
}

function truncate(value: string, max = 120): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}...`;
}

function downloadTextFile(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function makeExportStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function buildQualityMarkdown(props: MemoryViewProps): string {
  const items = props.qualityItems?.items ?? [];
  const lines = [
    `# Memory Quality Export`,
    ``,
    `- scope: ${props.qualityScope}`,
    `- bucket: ${props.qualityBucket}`,
    `- total: ${props.qualityItems?.total ?? 0}`,
    ``,
    `## Items`,
    ``,
  ];
  for (const item of items) {
    lines.push(`- [${item.record_type}] ${item.primary_text}`);
    lines.push(`  - id: ${item.record_id}`);
    if (item.secondary_text) {
      lines.push(`  - secondary: ${item.secondary_text}`);
    }
    if (item.status) {
      lines.push(`  - status: ${item.status}`);
    }
    if (item.timestamp_iso) {
      lines.push(`  - timestamp: ${item.timestamp_iso}`);
    }
  }
  return lines.join("\n");
}

function formatDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

function findSelectedRun(
  runs: MemoryReviewRun[],
  selectedRunId: string | null,
): MemoryReviewRun | null {
  if (runs.length === 0) {
    return null;
  }
  if (selectedRunId) {
    const selected = runs.find((run) => run.id === selectedRunId);
    if (selected) {
      return selected;
    }
  }
  return runs[0] ?? null;
}

function findPreviousComparableRun(
  runs: MemoryReviewRun[],
  selectedRun: MemoryReviewRun | null,
): MemoryReviewRun | null {
  if (!selectedRun) {
    return null;
  }
  const selectedIndex = runs.findIndex((run) => run.id === selectedRun.id);
  if (selectedIndex < 0) {
    return null;
  }
  const samePlatform = runs
    .slice(selectedIndex + 1)
    .find((run) => run.platform === selectedRun.platform);
  if (samePlatform) {
    return samePlatform;
  }
  return runs[selectedIndex + 1] ?? null;
}

export function renderMemory(props: MemoryViewProps) {
  const selectedRun = findSelectedRun(props.runs, props.selectedRunId);
  const previousRun = findPreviousComparableRun(props.runs, selectedRun);
  const rawLibraryEvents = props.episodeDetail?.timeline ?? [];
  const eventFilter = props.searchQuery.trim().toLowerCase();
  const libraryEvents = eventFilter
    ? rawLibraryEvents.filter((event) => {
        const haystack =
          `${event.sender_id} ${event.content} ${event.thread_id ?? ""}`.toLowerCase();
        return haystack.includes(eventFilter);
      })
    : rawLibraryEvents;

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Memory Review</div>
          <div class="card-sub">Inspect backfill runs, episode outputs, and provenance.</div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Loading..." : "Refresh"}
        </button>
      </div>
      ${props.error ? html`<div class="callout danger" style="margin-top:12px;">${props.error}</div>` : nothing}
    </section>

    <div class="sub-tabs" style="margin-top: 12px;">
      <button class="sub-tab ${props.subTab === "library" ? "active" : ""}" @click=${() => props.onSubTabChange("library")}>
        <span class="sub-tab__text">Library</span>
        <span class="sub-tab__desc">Mental models, observations, facts, episodes, and source records</span>
      </button>
      <button class="sub-tab ${props.subTab === "search" ? "active" : ""}" @click=${() => props.onSubTabChange("search")}>
        <span class="sub-tab__text">Search</span>
        <span class="sub-tab__desc">Facts, entities, and observations</span>
      </button>
      <button class="sub-tab ${props.subTab === "operations" ? "active" : ""}" @click=${() => props.onSubTabChange("operations")}>
        <span class="sub-tab__text">Operations</span>
        <span class="sub-tab__desc">Runs, quality triage, and deep inspectors</span>
      </button>
    </div>

    <section class="card" style="margin-top:12px; display:${props.subTab === "library" ? "block" : "none"};">
      <div class="card-title">Knowledge Library</div>
      <div class="card-sub" style="margin-top: 6px;">
        Mental models and core memory records surfaced first.
      </div>
      <div class="filters" style="margin-top:12px;">
        <label class="field">
          <span>Search Library</span>
          <input
            .value=${props.searchQuery}
            @input=${(event: Event) =>
              props.onSearchQueryChange((event.target as HTMLInputElement).value)}
            @keydown=${(event: KeyboardEvent) => {
              if (event.key === "Enter") {
                event.preventDefault();
                props.onSearch();
              }
            }}
          />
        </label>
        <label class="field">
          <span>Type</span>
          <select
            .value=${props.searchType}
            @change=${(event: Event) =>
              props.onSearchTypeChange(
                (event.target as HTMLSelectElement).value as MemoryReviewSearchType,
              )}
          >
            <option value="all">all</option>
            <option value="observations">observations</option>
            <option value="facts">facts</option>
            <option value="entities">entities</option>
          </select>
        </label>
        <div class="field" style="align-self:end;">
          <button class="btn" ?disabled=${props.searchLoading} @click=${props.onSearch}>
            ${props.searchLoading ? "Searching..." : "Search"}
          </button>
        </div>
      </div>
      ${renderSearchResult(props.searchResult, props)}
    </section>

    <section class="card" style="margin-top:12px; display:${props.subTab === "library" ? "block" : "none"};">
      <div class="row" style="justify-content: space-between; align-items: baseline;">
        <div class="card-title">Episodes</div>
        <div class="muted">${props.selectedRunId ? `run_id=${props.selectedRunId}` : "No run selected."}</div>
      </div>
      <div class="table" style="margin-top: 12px;">
        <div class="table-head">
          <div>Episode</div>
          <div>Status</div>
          <div>Thread</div>
          <div>Events</div>
          <div>Facts</div>
          <div>Entities</div>
        </div>
        ${
          props.episodes.length === 0
            ? html`
                <div class="muted">No episodes found for the selected run.</div>
              `
            : props.episodes.map((episode) =>
                renderEpisodeRow(
                  episode,
                  props.selectedEpisodeId === episode.id,
                  props.onEpisodeSelect,
                ),
              )
        }
      </div>
    </section>

    <section class="card" style="margin-top:12px; display:${props.subTab === "library" ? "block" : "none"};">
      <div class="row" style="justify-content: space-between; align-items: baseline;">
        <div class="card-title">Source Records</div>
        <div class="muted">
          ${
            props.selectedEpisodeId
              ? `episode_id=${props.selectedEpisodeId} · filter="${props.searchQuery.trim() || "none"}"`
              : "Select an episode to inspect source records."
          }
        </div>
      </div>
      <div class="table" style="margin-top: 12px;">
        <div class="table-head">
          <div>Time</div>
          <div>Sender</div>
          <div>Thread</div>
          <div>Content</div>
        </div>
        ${
          libraryEvents.length === 0
            ? html`
                <div class="muted">
                  ${
                    rawLibraryEvents.length === 0
                      ? "No source records loaded. Select an episode in this run."
                      : "No source records match the current filter query."
                  }
                </div>
              `
            : libraryEvents.map(
                (event) => html`
                  <div class="table-row">
                    <div class="mono">${formatDateTime(event.timestamp)}</div>
                    <div class="mono">${event.sender_id}</div>
                    <div class="mono">${event.thread_id ?? "n/a"}</div>
                    <div>${truncate(event.content, 220)}</div>
                  </div>
                `,
              )
        }
      </div>
    </section>

    <section class="card" style="margin-top:12px; display:${props.subTab === "operations" ? "block" : "none"};">
      <div class="card-title">Runs</div>
      <div class="table" style="margin-top: 12px;">
        <div class="table-head">
          <div>Run</div>
          <div>Status</div>
          <div>Platform</div>
          <div>Episodes</div>
          <div>Facts</div>
          <div>Entities</div>
          <div>Started</div>
        </div>
        ${
          props.runs.length === 0
            ? html`
                <div class="muted">No backfill runs found.</div>
              `
            : props.runs.map((run) =>
                renderRunRow(run, props.selectedRunId === run.id, props.onRunSelect),
              )
        }
      </div>
    </section>

    <section class="card" style="margin-top:12px; display:${props.subTab === "operations" ? "block" : "none"};">
      <details>
        <summary class="row" style="justify-content: space-between; align-items: baseline; cursor: pointer;">
          <span class="card-title">Run Compare</span>
          <span class="muted">
            ${selectedRun ? `current=${selectedRun.id}` : "Select a run to compare."}
          </span>
        </summary>
        ${
          !selectedRun
            ? html`
                <div class="muted" style="margin-top: 12px">No run selected.</div>
              `
            : !previousRun
              ? html`
                  <div class="muted" style="margin-top: 12px">No previous comparable run found.</div>
                `
              : html`
                  <div class="row" style="gap:12px; margin-top:12px; flex-wrap:wrap;">
                    <div class="pill">
                      completed episodes:
                      ${selectedRun.counts.completed}
                      (${formatDelta(selectedRun.counts.completed - previousRun.counts.completed)})
                    </div>
                    <div class="pill">
                      failed episodes:
                      ${selectedRun.counts.failed}
                      (${formatDelta(selectedRun.counts.failed - previousRun.counts.failed)})
                    </div>
                    <div class="pill">
                      facts:
                      ${selectedRun.facts_created}
                      (${formatDelta(selectedRun.facts_created - previousRun.facts_created)})
                    </div>
                    <div class="pill">
                      entities:
                      ${selectedRun.entities_created}
                      (${formatDelta(selectedRun.entities_created - previousRun.entities_created)})
                    </div>
                  </div>
                  <div class="muted" style="margin-top:8px;">
                    previous=${previousRun.id} platform=${previousRun.platform ?? "n/a"}
                  </div>
                `
        }
      </details>
    </section>

    <section class="card" style="margin-top:12px; display:${props.subTab === "operations" ? "block" : "none"};">
      <details>
        <summary class="card-title" style="cursor: pointer;">Quality Triage</summary>
        <div class="row" style="justify-content: space-between; align-items: baseline; margin-top: 12px;">
          <div class="muted">Issue buckets and export tools.</div>
          <div class="row" style="gap:8px;">
            <button
              class="btn"
              ?disabled=${!props.qualityItems || props.qualityItems.items.length === 0}
              @click=${() => {
                const stamp = makeExportStamp();
                downloadTextFile(
                  `memory-quality-${props.qualityBucket}-${stamp}.json`,
                  JSON.stringify(props.qualityItems, null, 2),
                  "application/json",
                );
              }}
            >
              Export JSON
            </button>
            <button
              class="btn"
              ?disabled=${!props.qualityItems || props.qualityItems.items.length === 0}
              @click=${() => {
                const stamp = makeExportStamp();
                downloadTextFile(
                  `memory-quality-${props.qualityBucket}-${stamp}.md`,
                  buildQualityMarkdown(props),
                  "text/markdown",
                );
              }}
            >
              Export MD
            </button>
            <label class="field" style="margin:0;">
              <span>Scope</span>
              <select
                .value=${props.qualityScope}
                @change=${(event: Event) =>
                  props.onQualityScopeChange(
                    (event.target as HTMLSelectElement).value as "run" | "global",
                  )}
              >
                <option value="run">run</option>
                <option value="global">global</option>
              </select>
            </label>
          </div>
        </div>
        ${
          props.qualityLoading
            ? html`
                <div class="muted" style="margin-top: 12px">Loading quality summary...</div>
              `
            : !props.qualitySummary
              ? html`
                  <div class="muted" style="margin-top: 12px">No quality summary available.</div>
                `
              : html`
                  <div class="row" style="gap:10px; flex-wrap:wrap; margin-top:12px;">
                    ${Object.values(props.qualitySummary.buckets).map((bucket) => {
                      const active = props.qualityBucket === bucket.key;
                      return html`
                        <button
                          class="btn ${active ? "btn-primary" : ""}"
                          @click=${() => props.onQualityBucketSelect(bucket.key)}
                          title=${bucket.description}
                        >
                          ${bucket.label}: ${bucket.count}
                        </button>
                      `;
                    })}
                  </div>
                `
        }
        ${renderQualityItems(props)}
      </details>
    </section>

    <section class="card" style="margin-top:12px; display:${props.subTab === "operations" ? "block" : "none"};">
      <div class="row" style="justify-content: space-between; align-items: baseline;">
        <div class="card-title">Run Episodes</div>
        <div class="muted">
          ${props.selectedRunId ? `run_id=${props.selectedRunId}` : "Select a run to inspect episodes."}
        </div>
      </div>
      ${
        props.episodesLoading
          ? html`
              <div class="muted" style="margin-top: 12px">Loading episodes...</div>
            `
          : html`
              <div
                class="table"
                style="margin-top: 12px;"
                tabindex="0"
                @keydown=${(event: KeyboardEvent) => {
                  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
                    return;
                  }
                  if (props.runs.length === 0) {
                    return;
                  }
                  event.preventDefault();
                  const currentIndex = props.selectedRunId
                    ? props.runs.findIndex((run) => run.id === props.selectedRunId)
                    : -1;
                  const baseIndex = currentIndex >= 0 ? currentIndex : 0;
                  const nextIndex =
                    event.key === "ArrowDown"
                      ? Math.min(props.runs.length - 1, baseIndex + 1)
                      : Math.max(0, baseIndex - 1);
                  const nextRun = props.runs[nextIndex];
                  if (nextRun) {
                    props.onRunSelect(nextRun.id);
                  }
                }}
              >
                <div class="table-head">
                  <div>Episode</div>
                  <div>Status</div>
                  <div>Thread</div>
                  <div>Source Records</div>
                  <div>Facts</div>
                  <div>Entities</div>
                </div>
                ${
                  props.episodes.length === 0
                    ? html`
                        <div class="muted">No episodes for this run.</div>
                      `
                    : props.episodes.map((episode) =>
                        renderEpisodeRow(
                          episode,
                          props.selectedEpisodeId === episode.id,
                          props.onEpisodeSelect,
                        ),
                      )
                }
              </div>
            `
      }
    </section>

    <section class="card" style="margin-top:12px; display:${props.subTab === "operations" ? "block" : "none"};">
      <div class="card-title">Episode Inspector</div>
      ${
        props.inspectorLoading
          ? html`
              <div class="muted" style="margin-top: 12px">Loading episode inspector...</div>
            `
          : renderEpisodeInspector(props.episodeDetail, props.episodeOutputs, props)
      }
    </section>

    <section class="card" style="margin-top:12px; display:${props.subTab === "search" ? "block" : "none"};">
      <div class="card-title">Global Search</div>
      <div class="muted" style="margin-top:6px;">
        Leave query empty to browse latest records.
      </div>
      <div class="filters" style="margin-top:12px;">
        <label class="field">
          <span>Query</span>
          <input
            .value=${props.searchQuery}
            @input=${(event: Event) =>
              props.onSearchQueryChange((event.target as HTMLInputElement).value)}
            @keydown=${(event: KeyboardEvent) => {
              if (event.key === "Enter") {
                event.preventDefault();
                props.onSearch();
              }
            }}
          />
        </label>
        <label class="field">
          <span>Type</span>
          <select
            .value=${props.searchType}
            @change=${(event: Event) =>
              props.onSearchTypeChange(
                (event.target as HTMLSelectElement).value as MemoryReviewSearchType,
              )}
          >
            <option value="all">all</option>
            <option value="facts">facts</option>
            <option value="entities">entities</option>
            <option value="observations">observations</option>
          </select>
        </label>
        <div class="field" style="align-self:end;">
          <button class="btn" ?disabled=${props.searchLoading} @click=${props.onSearch}>
            ${props.searchLoading ? "Searching..." : "Search"}
          </button>
        </div>
      </div>
      ${renderSearchResult(props.searchResult, props)}
    </section>

    <section class="card" style="margin-top:12px; display:${props.subTab === "operations" ? "block" : "none"};">
      <div class="card-title">Deep Inspector</div>
      ${renderDeepInspector(props)}
    </section>
  `;
}

function renderRunRow(run: MemoryReviewRun, selected: boolean, onSelect: (runId: string) => void) {
  const observedTotal =
    run.counts.pending + run.counts.in_progress + run.counts.completed + run.counts.failed;
  const displayTotal = Math.max(run.total_episodes, observedTotal);
  const hasPlanDrift = run.total_episodes !== observedTotal && observedTotal > 0;
  const episodesSummary = `${run.counts.completed}/${displayTotal}`;
  return html`
    <div class="table-row ${selected ? "table-row--active" : ""}">
      <div class="mono">
        <button class="btn" @click=${() => onSelect(run.id)}>${run.id}</button>
      </div>
      <div>${run.status}</div>
      <div>${run.platform ?? "n/a"}</div>
      <div>
        ${episodesSummary}
        ${hasPlanDrift ? html`<div class="muted">planned=${run.total_episodes}</div>` : nothing}
      </div>
      <div>${run.facts_created}</div>
      <div>${run.entities_created}</div>
      <div>${formatDateTime(run.started_at)}</div>
    </div>
  `;
}

function renderEpisodeRow(
  episode: MemoryReviewEpisode,
  selected: boolean,
  onSelect: (episodeId: string) => void,
) {
  return html`
    <div class="table-row ${selected ? "table-row--active" : ""}">
      <div class="mono">
        <button class="btn" @click=${() => onSelect(episode.id)}>${episode.id}</button>
      </div>
      <div>${episode.status}</div>
      <div class="mono">${episode.thread_id ?? "n/a"}</div>
      <div>${episode.event_count}</div>
      <div>${episode.facts_created}</div>
      <div>${episode.entities_created}</div>
    </div>
  `;
}

function renderEpisodeInspector(
  detail: MemoryReviewEpisodeDetail | null,
  outputs: MemoryReviewEpisodeOutputs | null,
  props: MemoryViewProps,
) {
  if (!detail) {
    return html`
      <div class="muted" style="margin-top: 12px">Select an episode to inspect timeline and outputs.</div>
    `;
  }
  return html`
    <div class="row" style="gap:16px; margin-top: 12px; align-items: baseline;">
      <div><span class="muted">episode_id:</span> <span class="mono">${detail.episode.id}</span></div>
      <div><span class="muted">status:</span> ${detail.episode.status}</div>
      <div><span class="muted">thread:</span> <span class="mono">${detail.episode.thread_id ?? "n/a"}</span></div>
    </div>

    <div style="margin-top: 16px;">
      <div class="card-title" style="font-size: 13px;">Timeline (${detail.timeline.length})</div>
      ${
        detail.timeline.length === 0
          ? html`
              <div class="muted" style="margin-top: 8px">No source records resolved for this episode.</div>
            `
          : html`
              <div class="table" style="margin-top:8px;">
                <div class="table-head">
                  <div>Time</div>
                  <div>Sender</div>
                  <div>Content</div>
                  <div>Attachments</div>
                </div>
                ${detail.timeline.map(
                  (event) => html`
                    <div class="table-row">
                      <div class="mono">${formatDateTime(event.timestamp)}</div>
                      <div class="mono">${event.sender_id}</div>
                      <div>${truncate(event.content)}</div>
                      <div>
                        ${
                          event.attachments.length === 0
                            ? "0"
                            : event.attachments
                                .map(
                                  (attachment) =>
                                    attachment.filename ??
                                    attachment.url ??
                                    attachment.local_path ??
                                    attachment.id,
                                )
                                .map((label) => truncate(label, 48))
                                .join(", ")
                        }
                      </div>
                    </div>
                  `,
                )}
              </div>
            `
      }
    </div>

    <div class="row" style="gap:12px; margin-top:16px;">
      <div class="pill">Facts: ${outputs?.facts.length ?? 0}</div>
      <div class="pill">Entities: ${outputs?.entities.length ?? 0}</div>
      <div class="pill">Observations: ${outputs?.observations.length ?? 0}</div>
      <div class="pill">Causal links: ${outputs?.causal_links.length ?? 0}</div>
    </div>

    ${
      outputs
        ? html`
            <div style="margin-top:16px;">
              <div class="card-title" style="font-size: 13px;">Facts</div>
              <div class="table" style="margin-top:8px;">
                <div class="table-head">
                  <div>Fact</div>
                  <div>As Of</div>
                  <div>Event</div>
                </div>
                ${
                  outputs.facts.length === 0
                    ? html`
                        <div class="muted">No facts for this episode.</div>
                      `
                    : outputs.facts.map(
                        (fact) => html`
                          <div class="table-row">
                            <div>
                              <button class="btn" @click=${() => props.onFactSelect(fact.id)}>
                                ${truncate(fact.text, 180)}
                              </button>
                            </div>
                            <div class="mono">${formatDateTime(fact.as_of)}</div>
                            <div class="mono">${fact.source_event_id ?? "n/a"}</div>
                          </div>
                        `,
                      )
                }
              </div>
            </div>

            <div style="margin-top:16px;">
              <div class="card-title" style="font-size: 13px;">Entities</div>
              <div class="table" style="margin-top:8px;">
                <div class="table-head">
                  <div>Name</div>
                  <div>Type</div>
                  <div>Mention Count</div>
                </div>
                ${
                  outputs.entities.length === 0
                    ? html`
                        <div class="muted">No linked entities for this episode.</div>
                      `
                    : outputs.entities.map(
                        (entity) => html`
                          <div class="table-row">
                            <div>
                              <button class="btn" @click=${() => props.onEntitySelect(entity.id)}>
                                ${entity.name}
                              </button>
                            </div>
                            <div>${entity.type ?? "n/a"}</div>
                            <div>${entity.mention_count}</div>
                          </div>
                        `,
                      )
                }
              </div>
            </div>

            <div style="margin-top:16px;">
              <div class="card-title" style="font-size: 13px;">Observations</div>
              <div class="table" style="margin-top:8px;">
                <div class="table-head">
                  <div>Observation</div>
                  <div>Status</div>
                  <div>Created</div>
                </div>
                ${
                  outputs.observations.length === 0
                    ? html`
                        <div class="muted">No observations linked to this episode's facts.</div>
                      `
                    : outputs.observations.map(
                        (observation) => html`
                          <div class="table-row">
                            <div>
                              <button
                                class="btn"
                                @click=${() => props.onObservationSelect(observation.id)}
                              >
                                ${truncate(observation.output_text ?? "", 180)}
                              </button>
                            </div>
                            <div>${observation.status}</div>
                            <div class="mono">${formatDateTime(observation.created_at)}</div>
                          </div>
                        `,
                      )
                }
              </div>
            </div>

            <div style="margin-top:16px;">
              <div class="card-title" style="font-size: 13px;">Fact-Entity Links</div>
              <div class="table" style="margin-top:8px;">
                <div class="table-head">
                  <div>Fact</div>
                  <div>Entity</div>
                </div>
                ${
                  outputs.fact_entities.length === 0
                    ? html`
                        <div class="muted">No fact-entity links.</div>
                      `
                    : outputs.fact_entities.map(
                        (link) => html`
                          <div class="table-row">
                            <div>
                              <button class="btn" @click=${() => props.onFactSelect(link.fact_id)}>
                                ${link.fact_id}
                              </button>
                            </div>
                            <div>
                              <button class="btn" @click=${() => props.onEntitySelect(link.entity_id)}>
                                ${link.entity_id}
                              </button>
                            </div>
                          </div>
                        `,
                      )
                }
              </div>
            </div>

            <div style="margin-top:16px;">
              <div class="card-title" style="font-size: 13px;">Observation-Fact Links</div>
              <div class="table" style="margin-top:8px;">
                <div class="table-head">
                  <div>Observation</div>
                  <div>Fact</div>
                  <div>Linked At</div>
                </div>
                ${
                  outputs.observation_facts.length === 0
                    ? html`
                        <div class="muted">No observation-fact links.</div>
                      `
                    : outputs.observation_facts.map(
                        (link) => html`
                          <div class="table-row">
                            <div>
                              <button
                                class="btn"
                                @click=${() => props.onObservationSelect(link.analysis_run_id)}
                              >
                                ${link.analysis_run_id}
                              </button>
                            </div>
                            <div>
                              <button class="btn" @click=${() => props.onFactSelect(link.fact_id)}>
                                ${link.fact_id}
                              </button>
                            </div>
                            <div class="mono">${formatDateTime(link.linked_at)}</div>
                          </div>
                        `,
                      )
                }
              </div>
            </div>

            <div style="margin-top:16px;">
              <div class="card-title" style="font-size: 13px;">Causal Links</div>
              <div class="table" style="margin-top:8px;">
                <div class="table-head">
                  <div>From Fact</div>
                  <div>To Fact</div>
                  <div>Strength</div>
                  <div>Created</div>
                </div>
                ${
                  outputs.causal_links.length === 0
                    ? html`
                        <div class="muted">No causal links.</div>
                      `
                    : outputs.causal_links.map(
                        (link) => html`
                          <div class="table-row">
                            <div>
                              <button class="btn" @click=${() => props.onFactSelect(link.from_fact_id)}>
                                ${link.from_fact_id}
                              </button>
                            </div>
                            <div>
                              <button class="btn" @click=${() => props.onFactSelect(link.to_fact_id)}>
                                ${link.to_fact_id}
                              </button>
                            </div>
                            <div>${link.strength.toFixed(2)}</div>
                            <div class="mono">${formatDateTime(link.created_at)}</div>
                          </div>
                        `,
                      )
                }
              </div>
            </div>
          `
        : nothing
    }
  `;
}

function renderQualityItems(props: MemoryViewProps) {
  if (props.qualityItemsLoading) {
    return html`
      <div class="muted" style="margin-top: 12px">Loading quality items...</div>
    `;
  }
  if (!props.qualityItems) {
    return html`
      <div class="muted" style="margin-top: 12px">No quality items available.</div>
    `;
  }
  const { items, total, limit, offset } = props.qualityItems;
  const hasPrev = offset > 0;
  const nextOffset = offset + limit;
  const hasNext = nextOffset < total;
  return html`
    <div class="row" style="justify-content: space-between; align-items: baseline; margin-top:12px;">
      <div class="muted">bucket=${props.qualityBucket} total=${total}</div>
      <div class="row" style="gap:8px;">
        <button class="btn" ?disabled=${!hasPrev} @click=${() => props.onQualityPage(Math.max(0, offset - limit))}>
          Prev
        </button>
        <button class="btn" ?disabled=${!hasNext} @click=${() => props.onQualityPage(nextOffset)}>
          Next
        </button>
      </div>
    </div>
    <div class="table" style="margin-top: 8px;">
      <div class="table-head">
        <div>Type</div>
        <div>Value</div>
        <div>Status</div>
        <div>Provenance</div>
        <div>Time</div>
      </div>
      ${
        items.length === 0
          ? html`
              <div class="muted">No items in this bucket.</div>
            `
          : items.map(
              (item) => html`
                <div class="table-row">
                  <div>${item.record_type}</div>
                  <div>
                    <div>${truncate(item.primary_text ?? "", 160)}</div>
                    ${item.secondary_text ? html`<div class="muted">${truncate(item.secondary_text, 100)}</div>` : nothing}
                  </div>
                  <div>${item.status ?? "n/a"}</div>
                  <div class="mono">
                    ${
                      item.record_type === "entity" && item.entity_id
                        ? html`<button class="btn" @click=${() => props.onEntitySelect(item.entity_id as string)}>
                            ${item.entity_id}
                          </button>`
                        : item.record_type === "fact" && item.fact_id
                          ? html`<button class="btn" @click=${() => props.onFactSelect(item.fact_id as string)}>
                              ${item.fact_id}
                            </button>`
                          : item.record_type === "observation" && item.observation_id
                            ? html`<button
                                class="btn"
                                @click=${() =>
                                  props.onObservationSelect(item.observation_id as string)}
                              >
                                ${item.observation_id}
                              </button>`
                            : item.record_type === "episode" && item.episode_id
                              ? html`<button class="btn" @click=${() => props.onEpisodeSelect(item.episode_id as string)}>
                                  ${item.episode_id}
                                </button>`
                              : (item.episode_id ??
                                item.fact_id ??
                                item.entity_id ??
                                item.observation_id ??
                                item.record_id)
                    }
                  </div>
                  <div class="mono">${formatDateTime(item.timestamp ?? null)}</div>
                </div>
              `,
            )
      }
    </div>
  `;
}

function renderSearchResult(result: MemoryReviewSearchResult | null, props: MemoryViewProps) {
  if (!result) {
    return html`
      <div class="muted" style="margin-top: 12px">
        Search mental models, observations, facts, and entities. Empty query returns latest items.
      </div>
    `;
  }
  const observations = result.observations ?? [];
  const mentalModels = observations.filter((entry) => !entry.is_stale);
  const prioritizedMentalModels = mentalModels.length > 0 ? mentalModels : observations;
  return html`
    <div class="row" style="gap:12px; margin-top:12px;">
      <div class="pill">mental models: ${prioritizedMentalModels.length}</div>
      <div class="pill">observations: ${observations.length}</div>
      <div class="pill">facts: ${result.facts.length}</div>
      <div class="pill">entities: ${result.entities.length}</div>
    </div>
    <div style="margin-top:12px;">
      <div class="card-title" style="font-size:13px;">Mental Models</div>
      <div class="table" style="margin-top:8px;">
        <div class="table-head">
          <div>Model</div>
          <div>Status</div>
          <div>Episode</div>
        </div>
        ${
          prioritizedMentalModels.length === 0
            ? html`
                <div class="muted">No mental models found.</div>
              `
            : prioritizedMentalModels.map(
                (observation) => html`
                  <div class="table-row">
                    <div>
                      <button class="btn" @click=${() => props.onObservationSelect(observation.id)}>
                        ${truncate(observation.output_text ?? "", 220)}
                      </button>
                    </div>
                    <div>${observation.status}</div>
                    <div class="mono">${observation.episode_id ?? "n/a"}</div>
                  </div>
                `,
              )
        }
      </div>
    </div>
    <div style="margin-top:12px;">
      <div class="card-title" style="font-size:13px;">Observations</div>
      <div class="table" style="margin-top:8px;">
        <div class="table-head">
          <div>Observation</div>
          <div>Status</div>
          <div>Episode</div>
        </div>
        ${
          observations.length === 0
            ? html`
                <div class="muted">No observations found.</div>
              `
            : observations.map(
                (observation) => html`
                  <div class="table-row">
                    <div>
                      <button class="btn" @click=${() => props.onObservationSelect(observation.id)}>
                        ${truncate(observation.output_text ?? "", 220)}
                      </button>
                    </div>
                    <div>${observation.status}</div>
                    <div class="mono">${observation.episode_id ?? "n/a"}</div>
                  </div>
                `,
              )
        }
      </div>
    </div>
    <div style="margin-top:12px;">
      <div class="card-title" style="font-size:13px;">Facts</div>
      <div class="table" style="margin-top:8px;">
        <div class="table-head">
          <div>Fact</div>
          <div>As Of</div>
          <div>Episode</div>
        </div>
        ${
          result.facts.length === 0
            ? html`
                <div class="muted">No facts found.</div>
              `
            : result.facts.map(
                (fact) => html`
                  <div class="table-row">
                    <div>
                      <button class="btn" @click=${() => props.onFactSelect(fact.id)}>
                        ${truncate(fact.text, 220)}
                      </button>
                    </div>
                    <div class="mono">${formatDateTime(fact.as_of)}</div>
                    <div class="mono">${fact.source_episode_id ?? "n/a"}</div>
                  </div>
                `,
              )
        }
      </div>
    </div>
    <div style="margin-top:12px;">
      <div class="card-title" style="font-size:13px;">Entities</div>
      <div class="table" style="margin-top:8px;">
        <div class="table-head">
          <div>Name</div>
          <div>Type</div>
          <div>Last Seen</div>
        </div>
        ${
          result.entities.length === 0
            ? html`
                <div class="muted">No entities found.</div>
              `
            : result.entities.map(
                (entity) => html`
                  <div class="table-row">
                    <div>
                      <button class="btn" @click=${() => props.onEntitySelect(entity.id)}>
                        ${entity.name}
                      </button>
                    </div>
                    <div>${entity.type ?? "n/a"}</div>
                    <div class="mono">${formatDateTime(entity.last_seen)}</div>
                  </div>
                `,
              )
        }
      </div>
    </div>
  `;
}

function renderDeepInspector(props: MemoryViewProps) {
  if (props.detailLoading) {
    return html`
      <div class="muted" style="margin-top: 12px">Loading deep detail...</div>
    `;
  }
  if (props.detailKind === "entity" && props.detailEntity) {
    const detail = props.detailEntity;
    return html`
      <div class="row" style="gap:12px; margin-top:12px;">
        <div><span class="muted">Entity:</span> <span class="mono">${detail.entity.id}</span></div>
        <div><span class="muted">Name:</span> ${detail.entity.name}</div>
        <div><span class="muted">Type:</span> ${detail.entity.type ?? "n/a"}</div>
      </div>
      <div class="row" style="gap:12px; margin-top:12px;">
        <div class="pill">linked facts: ${detail.linked_facts.length}</div>
        <div class="pill">linked observations: ${detail.linked_observations.length}</div>
      </div>
      <div style="margin-top:12px;">
        <div class="card-title" style="font-size:13px;">Linked Facts</div>
        <div class="table" style="margin-top:8px;">
          <div class="table-head">
            <div>Fact</div>
            <div>As Of</div>
          </div>
          ${
            detail.linked_facts.length === 0
              ? html`
                  <div class="muted">No linked facts.</div>
                `
              : detail.linked_facts.map(
                  (fact) => html`
                    <div class="table-row">
                      <div>
                        <button class="btn" @click=${() => props.onFactSelect(fact.id)}>
                          ${truncate(fact.text, 220)}
                        </button>
                      </div>
                      <div class="mono">${formatDateTime(fact.as_of)}</div>
                    </div>
                  `,
                )
          }
        </div>
      </div>
      <div style="margin-top:12px;">
        <div class="card-title" style="font-size:13px;">Linked Observations</div>
        <div class="table" style="margin-top:8px;">
          <div class="table-head">
            <div>Observation</div>
            <div>Status</div>
          </div>
          ${
            detail.linked_observations.length === 0
              ? html`
                  <div class="muted">No linked observations.</div>
                `
              : detail.linked_observations.map(
                  (observation) => html`
                    <div class="table-row">
                      <div>
                        <button class="btn" @click=${() => props.onObservationSelect(observation.id)}>
                          ${truncate(observation.output_text ?? "", 220)}
                        </button>
                      </div>
                      <div>${observation.status}</div>
                    </div>
                  `,
                )
          }
        </div>
      </div>
    `;
  }
  if (props.detailKind === "fact" && props.detailFact) {
    const detail = props.detailFact;
    return html`
      <div style="margin-top:12px;">
        <div><span class="muted">Fact:</span> <span class="mono">${detail.fact.id}</span></div>
        <div style="margin-top:6px;">${detail.fact.text}</div>
      </div>
      <div class="row" style="gap:12px; margin-top:12px;">
        <div class="pill">entities: ${detail.entities.length}</div>
        <div class="pill">observations: ${detail.observations.length}</div>
        <div class="pill">causal in: ${detail.causal_in.length}</div>
        <div class="pill">causal out: ${detail.causal_out.length}</div>
      </div>
      <div class="muted" style="margin-top:8px;">
        source_episode=${detail.source_episode?.id ?? "n/a"} source_record=${detail.fact.source_event_id ?? "n/a"}
      </div>
      ${
        detail.source_event
          ? html`
              <div style="margin-top:12px;">
                <div class="card-title" style="font-size:13px;">Source Record</div>
                <div class="table" style="margin-top:8px;">
                  <div class="table-head">
                    <div>Time</div>
                    <div>Sender</div>
                    <div>Content</div>
                  </div>
                  <div class="table-row">
                    <div class="mono">${formatDateTime(detail.source_event.timestamp)}</div>
                    <div class="mono">${detail.source_event.sender_id}</div>
                    <div>${truncate(detail.source_event.content, 260)}</div>
                  </div>
                </div>
              </div>
            `
          : nothing
      }
      <div style="margin-top:12px;">
        <div class="card-title" style="font-size:13px;">Entities</div>
        <div class="table" style="margin-top:8px;">
          <div class="table-head">
            <div>Name</div>
            <div>Type</div>
          </div>
          ${
            detail.entities.length === 0
              ? html`
                  <div class="muted">No linked entities.</div>
                `
              : detail.entities.map(
                  (entity) => html`
                    <div class="table-row">
                      <div>
                        <button class="btn" @click=${() => props.onEntitySelect(entity.id)}>
                          ${entity.name}
                        </button>
                      </div>
                      <div>${entity.type ?? "n/a"}</div>
                    </div>
                  `,
                )
          }
        </div>
      </div>
      <div style="margin-top:12px;">
        <div class="card-title" style="font-size:13px;">Observations</div>
        <div class="table" style="margin-top:8px;">
          <div class="table-head">
            <div>Observation</div>
            <div>Status</div>
          </div>
          ${
            detail.observations.length === 0
              ? html`
                  <div class="muted">No linked observations.</div>
                `
              : detail.observations.map(
                  (observation) => html`
                    <div class="table-row">
                      <div>
                        <button class="btn" @click=${() => props.onObservationSelect(observation.id)}>
                          ${truncate(observation.output_text ?? "", 220)}
                        </button>
                      </div>
                      <div>${observation.status}</div>
                    </div>
                  `,
                )
          }
        </div>
      </div>
      <div style="margin-top:12px;">
        <div class="card-title" style="font-size:13px;">Causal Links</div>
        <div class="table" style="margin-top:8px;">
          <div class="table-head">
            <div>Direction</div>
            <div>Related Fact</div>
            <div>Strength</div>
          </div>
          ${[
            ...detail.causal_in.map((link) => ({ direction: "in", link })),
            ...detail.causal_out.map((link) => ({ direction: "out", link })),
          ].map(
            (entry) => html`
              <div class="table-row">
                <div>${entry.direction}</div>
                <div>
                  <button
                    class="btn"
                    @click=${() =>
                      props.onFactSelect(
                        entry.direction === "in" ? entry.link.from_fact_id : entry.link.to_fact_id,
                      )}
                  >
                    ${truncate(entry.link.related_fact_text, 220)}
                  </button>
                </div>
                <div>${entry.link.strength.toFixed(2)}</div>
              </div>
            `,
          )}
          ${
            detail.causal_in.length + detail.causal_out.length === 0
              ? html`
                  <div class="muted">No causal links.</div>
                `
              : nothing
          }
        </div>
      </div>
    `;
  }
  if (props.detailKind === "observation" && props.detailObservation) {
    const detail = props.detailObservation;
    return html`
      <div style="margin-top:12px;">
        <div><span class="muted">Observation:</span> <span class="mono">${detail.observation.id}</span></div>
        <div class="muted" style="margin-top:6px;">
          head=${detail.head_observation_id} versions=${detail.version_chain.length}
        </div>
      </div>
      <div class="row" style="gap:12px; margin-top:12px;">
        <div class="pill">supporting facts: ${detail.supporting_facts.length}</div>
        <div class="pill">supporting entities: ${detail.supporting_entities.length}</div>
      </div>
      <div style="margin-top:8px; white-space: pre-wrap;">${detail.observation.output_text ?? ""}</div>
      <div style="margin-top:12px;">
        <div class="card-title" style="font-size:13px;">Supporting Facts</div>
        <div class="table" style="margin-top:8px;">
          <div class="table-head">
            <div>Fact</div>
            <div>As Of</div>
          </div>
          ${
            detail.supporting_facts.length === 0
              ? html`
                  <div class="muted">No supporting facts.</div>
                `
              : detail.supporting_facts.map(
                  (fact) => html`
                    <div class="table-row">
                      <div>
                        <button class="btn" @click=${() => props.onFactSelect(fact.id)}>
                          ${truncate(fact.text, 220)}
                        </button>
                      </div>
                      <div class="mono">${formatDateTime(fact.as_of)}</div>
                    </div>
                  `,
                )
          }
        </div>
      </div>
      <div style="margin-top:12px;">
        <div class="card-title" style="font-size:13px;">Supporting Entities</div>
        <div class="table" style="margin-top:8px;">
          <div class="table-head">
            <div>Name</div>
            <div>Type</div>
          </div>
          ${
            detail.supporting_entities.length === 0
              ? html`
                  <div class="muted">No supporting entities.</div>
                `
              : detail.supporting_entities.map(
                  (entity) => html`
                    <div class="table-row">
                      <div>
                        <button class="btn" @click=${() => props.onEntitySelect(entity.id)}>
                          ${entity.name}
                        </button>
                      </div>
                      <div>${entity.type ?? "n/a"}</div>
                    </div>
                  `,
                )
          }
        </div>
      </div>
    `;
  }
  return html`
    <div class="muted" style="margin-top: 12px">Select an entity, fact, or observation to inspect.</div>
  `;
}
