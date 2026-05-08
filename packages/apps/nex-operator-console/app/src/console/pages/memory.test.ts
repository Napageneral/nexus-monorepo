import { render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderMemoryPage, type MemoryPageProps } from "./memory.ts";

function createProps(overrides: Partial<MemoryPageProps> = {}): MemoryPageProps {
  return {
    subTab: "observations",
    onSubTabChange: vi.fn(),
    loading: false,
    error: null,
    runs: [],
    selectedRunId: null,
    onRunSelect: vi.fn(),
    episodes: [],
    episodesLoading: false,
    selectedEpisodeId: null,
    onEpisodeSelect: vi.fn(),
    inspectorLoading: false,
    episodeDetail: null,
    episodeOutputs: null,
    searchQuery: "",
    searchType: "all",
    searchLoading: false,
    observations: [],
    facts: [],
    searchResults: [],
    onSearchQueryChange: vi.fn(),
    onSearchTypeChange: vi.fn(),
    onSearch: vi.fn(),
    qualityScope: "run",
    qualityLoading: false,
    qualitySummary: null,
    qualityItemsLoading: false,
    qualityBucket: "unconsolidated_facts",
    qualityItems: null,
    onQualityScopeChange: vi.fn(),
    onQualityBucketSelect: vi.fn(),
    onQualityPage: vi.fn(),
    detailKind: null,
    detailLoading: false,
    detailEntity: null,
    detailFact: null,
    detailObservation: null,
    onDetailClear: vi.fn(),
    onEntitySelect: vi.fn(),
    onFactSelect: vi.fn(),
    onObservationSelect: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("renderMemoryPage", () => {
  it("renders retained facts, consolidations, linked entities, and source records for an episode", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderMemoryPage(
        createProps({
          subTab: "episodes",
          selectedRunId: "run-1",
          runs: [
            {
              id: "run-1",
              platform: "imessage",
              status: "completed",
              total_episodes: 1,
              facts_created: 1,
              started_at: 1_765_000_000_000,
            },
          ],
          selectedEpisodeId: "live-imessage-top-direct:episode:002",
          episodes: [
            {
              id: "live-imessage-top-direct:episode:002",
              run_id: "run-1",
              platform: "imessage",
              thread_id: "+16319056994",
              event_count: 8,
              status: "completed",
              started_at: 1_765_000_000_000,
            },
          ],
          episodeDetail: {
            episode: {
              id: "live-imessage-top-direct:episode:002",
              run_id: "run-1",
              platform: "imessage",
              thread_id: "+16319056994",
              event_count: 8,
              token_estimate: 100,
              status: "completed",
              facts_created: 1,
              entities_created: 1,
              started_at: 1_765_000_000_000,
              started_at_iso: "2025-12-05T00:00:00.000Z",
              completed_at: 1_765_000_010_000,
              completed_at_iso: "2025-12-05T00:00:10.000Z",
              error_message: null,
            },
            timeline: [
              {
                event_id: "record-1",
                platform: "imessage",
                thread_id: "+16319056994",
                reply_to_event_id: null,
                sender_id: "Casey Adams",
                timestamp: 1_765_000_000_000,
                timestamp_iso: "2025-12-05T00:00:00.000Z",
                content_type: "text",
                content: "Going back east for pillows. https://example.com/pillows",
                attachments: [
                  {
                    id: "att-1",
                    source_attachment_id: null,
                    filename: "receipt.png",
                    mime_type: "image/png",
                    media_type: "image",
                    size_bytes: 1204,
                    local_path: null,
                    url: null,
                    metadata: null,
                    interpretation_status: "success",
                    interpretation_text: "Receipt image shows two pillows and a delivery estimate.",
                    interpretation_model: "nex-contextual-attachment-interpreter-v1",
                    interpretation_updated_at: 1_765_000_005_000,
                    interpretation_updated_at_iso: "2025-12-05T00:00:05.000Z",
                  },
                ],
                links: [
                  {
                    id: "link-1",
                    raw_url: "https://example.com/pillows",
                    normalized_url: "https://example.com/pillows",
                    source_field: "content",
                    text_start: 29,
                    text_end: 56,
                    preview_attachment_ids: [],
                    extraction_confidence: 1,
                    extraction_notes: null,
                    enrichment_status: "success",
                    enrichment_title: "Pillow trip notes",
                    enrichment_description: "Shared page about a pillow trip.",
                    enrichment_summary_text:
                      "The shared link describes a pillow trip plan for Casey and Tyler.",
                    enrichment_extracted_text: "Pillow trip plan.",
                    enrichment_final_url: "https://example.com/pillows",
                    enrichment_canonical_url: null,
                    enrichment_site_name: "Example",
                    enrichment_content_type: "text/html",
                    enrichment_http_status: 200,
                    enrichment_access_status: "fetched",
                    enrichment_evidence_basis: { method: "safe_fetch" },
                    enrichment_model: "nex-link-enricher-v1:safe-fetch",
                    enrichment_updated_at: 1_765_000_006_000,
                    enrichment_updated_at_iso: "2025-12-05T00:00:06.000Z",
                  },
                ],
              },
            ],
          },
          episodeOutputs: {
            episode_id: "live-imessage-top-direct:episode:002",
            facts: [
              {
                id: "fact-1",
                text: "Tyler and Casey planned to go back east for pillows.",
                context: null,
                as_of: 1_765_000_000_000,
                as_of_iso: "2025-12-05T00:00:00.000Z",
                ingested_at: 1_765_000_010_000,
                ingested_at_iso: "2025-12-05T00:00:10.000Z",
                source_episode_id: "live-imessage-top-direct:episode:002:retain-gate-006",
                source_event_id: "record-1",
                is_consolidated: false,
              },
            ],
            entities: [
              {
                id: "entity-casey",
                name: "Casey Adams",
                type: "person",
                normalized: "casey adams",
                is_user: false,
                mention_count: 1,
                first_seen: null,
                first_seen_iso: null,
                last_seen: null,
                last_seen_iso: null,
                created_at: 1_765_000_000_000,
                created_at_iso: "2025-12-05T00:00:00.000Z",
                updated_at: 1_765_000_000_000,
                updated_at_iso: "2025-12-05T00:00:00.000Z",
              },
            ],
            fact_entities: [{ fact_id: "fact-1", entity_id: "entity-casey" }],
            observations: [
              {
                id: "obs-1",
                episode_id: "live-imessage-top-direct:episode:002:retain-gate-006",
                status: "completed",
                output_text: "Tyler and Casey had an east-coast pillows plan.",
                created_at: 1_765_000_020_000,
                created_at_iso: "2025-12-05T00:00:20.000Z",
                started_at: 1_765_000_020_000,
                started_at_iso: "2025-12-05T00:00:20.000Z",
                completed_at: 1_765_000_030_000,
                completed_at_iso: "2025-12-05T00:00:30.000Z",
                is_stale: false,
              },
            ],
            observation_facts: [
              {
                analysis_run_id: "obs-1",
                fact_id: "fact-1",
                linked_at: 1_765_000_030_000,
                linked_at_iso: "2025-12-05T00:00:30.000Z",
              },
            ],
            causal_links: [],
          },
        }),
      ),
      container,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("Retained Facts");
    expect(text).toContain("Tyler and Casey planned to go back east for pillows.");
    expect(text).toContain("Consolidated Observations");
    expect(text).toContain("Tyler and Casey had an east-coast pillows plan.");
    expect(text).toContain("Linked Entities");
    expect(text).toContain("Casey Adams");
    expect(text).toContain("Episode Timeline");
    expect(text).toContain("Going back east for pillows.");
    expect(text).toContain("Shared Link");
    expect(text).toContain("Pillow trip notes");
    expect(text).toContain("The shared link describes a pillow trip plan");
    expect(text).toContain("method safe_fetch");
    expect(text).toContain("receipt.png");
    expect(text).toContain("interpreted");
    expect(text).toContain("Receipt image shows two pillows and a delivery estimate.");
  });

  it("renders facts by content instead of raw fact ids", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderMemoryPage(
        createProps({
          subTab: "facts",
          facts: [
            {
              id: "fact-uuid-123",
              text: "Tyler and Casey planned to go back east for pillows.",
              context: null,
              as_of: 1_765_000_000_000,
              as_of_iso: "2025-12-05T00:00:00.000Z",
              ingested_at: 1_765_000_010_000,
              ingested_at_iso: "2025-12-05T00:00:10.000Z",
              source_episode_id: "live-imessage-top-direct:episode:002",
              source_event_id: "imessage:F47B5BE9-2B9C-4BB1-8596-00AB626ADE9C",
              is_consolidated: false,
            },
          ],
        }),
      ),
      container,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("Tyler and Casey planned to go back east for pillows.");
    expect(text).toContain("Episode");
    expect(text).toContain("Record");
    expect(text).not.toContain("fact-uuid-123");
  });

  it("does not carry observation detail into the facts tab", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      renderMemoryPage(
        createProps({
          subTab: "facts",
          detailKind: "observation",
          detailObservation: {
            observation: {
              id: "obs-1",
              episode_id: "episode-1",
              parent_id: null,
              status: "completed",
              output_text: "This observation belongs on the observations tab.",
              created_at: 1_765_000_020_000,
              created_at_iso: "2025-12-05T00:00:20.000Z",
              started_at: 1_765_000_020_000,
              started_at_iso: "2025-12-05T00:00:20.000Z",
              completed_at: 1_765_000_030_000,
              completed_at_iso: "2025-12-05T00:00:30.000Z",
              is_stale: false,
            },
            supporting_facts: [],
            supporting_entities: [],
            versions: [],
          },
        }),
      ),
      container,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("Select a row");
    expect(text).not.toContain("This observation belongs on the observations tab.");
  });
});
