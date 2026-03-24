/**
 * Entities view — Entity list with search/filter.
 *
 * Entry point for graph navigation. Lists all non-merged entities
 * from identity.db with search, type filters, and click-through
 * to entity detail views.
 *
 * For the initial implementation, this uses the existing memory.review.search
 * RPC with type="entities" to get entity listings. A dedicated entity.list
 * RPC endpoint will replace this once available.
 */
import { html, nothing, type TemplateResult } from "lit";
import type {
  MemoryReviewSearchResult,
  MemoryReviewEntityDetail,
  MemoryReviewEntity,
  MemoryReviewFact,
  MemoryReviewObservation,
} from "../types.ts";

export type DirectoryProps = {
  loading: boolean;
  error: string | null;
  searchQuery: string;
  searchResult: MemoryReviewSearchResult | null;
  detailLoading: boolean;
  detailEntity: MemoryReviewEntityDetail | null;
  selectedEntityId: string | null;
  onSearchQueryChange: (value: string) => void;
  onSearch: () => void;
  onEntitySelect: (entityId: string) => void;
  onBack: () => void;
};

export function renderDirectory(props: DirectoryProps): TemplateResult {
  // If an entity is selected, show detail view
  if (props.selectedEntityId && props.detailEntity) {
    return renderEntityDetail(props);
  }

  const entities: MemoryReviewEntity[] = props.searchResult?.entities ?? [];
  const rankedEntities = rankEntities(entities);
  const groups = rankedEntities.filter(isGroupEntity);
  const contacts = rankedEntities.filter(isContactEntity);
  const hasResults = rankedEntities.length > 0;

  return html`
    <div class="directory-view">
      <div class="directory-search">
        <div class="field directory-search__input">
          <span class="directory-search__icon">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search entities by name, tag, or platform..."
            .value=${props.searchQuery}
            @input=${(e: Event) => props.onSearchQueryChange((e.target as HTMLInputElement).value)}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                props.onSearch();
              }
            }}
          />
          <button
            class="btn btn-sm"
            ?disabled=${props.loading}
            @click=${() => props.onSearch()}
          >
            Search
          </button>
        </div>
      </div>

      ${props.error ? html`<div class="callout callout--danger">${props.error}</div>` : nothing}

      ${
        props.loading
          ? html`
              <div class="directory-loading"><span class="spinner"></span> Loading entities...</div>
            `
          : nothing
      }

      ${
        !props.loading && !hasResults && props.searchQuery
          ? html`<div class="directory-empty">
            <p>No entities found matching "<strong>${props.searchQuery}</strong>"</p>
            <p class="muted">Try a different search term or browse all entities.</p>
          </div>`
          : nothing
      }

      ${
        !props.loading && !hasResults && !props.searchQuery
          ? html`
              <div class="directory-empty">
                <div class="directory-empty__icon">
                  <svg viewBox="0 0 24 24" width="48" height="48">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <h3>Entities</h3>
                <p class="muted">No entity rows were returned yet.</p>
                <p class="muted">Press Search to browse people, organizations, groups, and contacts.</p>
              </div>
            `
          : nothing
      }

      ${
        hasResults
          ? html`
          <div class="directory-results">
            <div class="directory-results__header">
              <span class="muted">${rankedEntities.length} entities found</span>
            </div>
            <div class="card" style="margin-top: 12px;">
              <div class="row" style="justify-content: space-between;">
                <div class="card-title">Entities</div>
                <div class="muted">Most relevant first</div>
              </div>
              <div class="table">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Mentions</th>
                      <th>First Seen</th>
                      <th>Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rankedEntities.map((entity) => renderEntityRow(entity, props.onEntitySelect))}
                  </tbody>
                </table>
              </div>
            </div>
            <div class="grid grid-cols-2" style="margin-top: 12px;">
              <section class="card">
                <div class="row" style="justify-content: space-between;">
                  <div class="card-title">Groups</div>
                  <div class="muted">${groups.length}</div>
                </div>
                ${
                  groups.length === 0
                    ? html`
                        <div class="muted" style="margin-top: 12px">No group entities found.</div>
                      `
                    : html`
                        <div class="table" style="margin-top: 10px;">
                          <table>
                            <thead>
                              <tr>
                                <th>Name</th>
                                <th>Mentions</th>
                                <th>Last Seen</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${groups.map(
                                (entity) => html`
                                <tr
                                  class="directory-row clickable"
                                  @click=${() => props.onEntitySelect(entity.id)}
                                >
                                  <td><strong>${entity.name ?? entity.id}</strong></td>
                                  <td class="mono">${entity.mention_count ?? 0}</td>
                                  <td class="muted">${entity.last_seen ? formatDate(entity.last_seen) : "—"}</td>
                                </tr>
                              `,
                              )}
                            </tbody>
                          </table>
                        </div>
                      `
                }
              </section>
              <section class="card">
                <div class="row" style="justify-content: space-between;">
                  <div class="card-title">Contacts</div>
                  <div class="muted">${contacts.length}</div>
                </div>
                ${
                  contacts.length === 0
                    ? html`
                        <div class="muted" style="margin-top: 12px">No contact-like entities found.</div>
                      `
                    : html`
                        <div class="table" style="margin-top: 10px;">
                          <table>
                            <thead>
                              <tr>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Mentions</th>
                                <th>Last Seen</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${contacts.map(
                                (entity) => html`
                                <tr
                                  class="directory-row clickable"
                                  @click=${() => props.onEntitySelect(entity.id)}
                                >
                                  <td><strong>${entity.name ?? entity.id}</strong></td>
                                  <td><span class="pill pill--sm">${entity.type ?? "unknown"}</span></td>
                                  <td class="mono">${entity.mention_count ?? 0}</td>
                                  <td class="muted">${entity.last_seen ? formatDate(entity.last_seen) : "—"}</td>
                                </tr>
                              `,
                              )}
                            </tbody>
                          </table>
                        </div>
                      `
                }
              </section>
            </div>
          </div>`
          : nothing
      }
    </div>
  `;
}

function renderEntityRow(
  entity: MemoryReviewEntity,
  onEntitySelect: (entityId: string) => void,
): TemplateResult {
  return html`
    <tr class="directory-row clickable" @click=${() => onEntitySelect(entity.id)}>
      <td class="directory-row__name">
        <strong>${entity.name ?? entity.id}</strong>
      </td>
      <td>
        <span class="pill pill--sm">${entity.type ?? "unknown"}</span>
      </td>
      <td class="mono">${entity.mention_count ?? 0}</td>
      <td class="muted">${entity.first_seen ? formatDate(entity.first_seen) : "—"}</td>
      <td class="muted">${entity.last_seen ? formatDate(entity.last_seen) : "—"}</td>
    </tr>
  `;
}

function rankEntities(entities: MemoryReviewEntity[]): MemoryReviewEntity[] {
  return [...entities].toSorted((a, b) => {
    const aMentions = a.mention_count ?? 0;
    const bMentions = b.mention_count ?? 0;
    if (aMentions !== bMentions) {
      return bMentions - aMentions;
    }
    const aLastSeen = a.last_seen ?? 0;
    const bLastSeen = b.last_seen ?? 0;
    if (aLastSeen !== bLastSeen) {
      return bLastSeen - aLastSeen;
    }
    return (a.name ?? a.id).localeCompare(b.name ?? b.id);
  });
}

function isGroupEntity(entity: MemoryReviewEntity): boolean {
  return (entity.type ?? "").trim().toLowerCase() === "group";
}

function isContactEntity(entity: MemoryReviewEntity): boolean {
  const type = (entity.type ?? "").trim().toLowerCase();
  return type === "person" || type === "user" || type === "contact";
}

function renderEntityDetail(props: DirectoryProps): TemplateResult {
  const detail = props.detailEntity;
  if (!detail) {
    return html`
      <div class="directory-loading"><span class="spinner"></span> Loading entity...</div>
    `;
  }

  const entity: MemoryReviewEntity = detail.entity;
  const linkedFacts: MemoryReviewFact[] = detail.linked_facts ?? [];
  const linkedObservations: MemoryReviewObservation[] = detail.linked_observations ?? [];

  return html`
    <div class="entity-detail">
      <div class="entity-detail__nav">
        <button class="btn btn-sm btn-outline" @click=${() => props.onBack()}>
          ← Back to Entities
        </button>
      </div>

      <div class="entity-detail__header">
        <h2>${entity.name ?? entity.id}</h2>
        <div class="entity-detail__meta">
          ${entity.type ? html`<span class="pill">${entity.type}</span>` : nothing}
          ${
            entity.is_user
              ? html`
                  <span class="pill pill--sm">User</span>
                `
              : nothing
          }
          <span class="muted">ID: ${entity.id}</span>
          ${entity.mention_count ? html`<span class="muted">${entity.mention_count} mentions</span>` : nothing}
        </div>
      </div>

      ${
        linkedFacts.length
          ? html`
          <div class="card">
            <h3>Facts <span class="muted">(${linkedFacts.length})</span></h3>
            <div class="table">
              <table>
                <thead>
                  <tr>
                    <th>Fact</th>
                    <th>As Of</th>
                  </tr>
                </thead>
                <tbody>
                  ${linkedFacts.map(
                    (fact) => html`
                    <tr>
                      <td>${fact.text}</td>
                      <td class="muted">${fact.as_of ? formatDate(fact.as_of) : "—"}</td>
                    </tr>
                  `,
                  )}
                </tbody>
              </table>
            </div>
          </div>`
          : nothing
      }

      ${
        linkedObservations.length
          ? html`
          <div class="card">
            <h3>Observations <span class="muted">(${linkedObservations.length})</span></h3>
            <div class="table">
              <table>
                <thead>
                  <tr>
                    <th>Observation</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${linkedObservations.map(
                    (obs) => html`
                    <tr>
                      <td>${obs.output_text ?? "(no output)"}</td>
                      <td><span class="pill pill--sm">${obs.status ?? "—"}</span></td>
                    </tr>
                  `,
                  )}
                </tbody>
              </table>
            </div>
          </div>`
          : nothing
      }
    </div>
  `;
}

function formatDate(ms: number): string {
  if (!ms) {
    return "—";
  }
  const d = new Date(ms);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
