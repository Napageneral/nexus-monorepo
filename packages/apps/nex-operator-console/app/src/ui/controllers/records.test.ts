import { describe, expect, it, vi } from "vitest";
import {
  loadRecords,
  loadRecordChannels,
  refreshRecordsSurface,
  searchRecords,
  type RecordsChannelEntry,
  type RecordsEntry,
  type RecordsSearchEntry,
} from "./records.ts";

function createState(request: (method: string, params?: unknown) => Promise<unknown>) {
  return {
    client: {
      request: request as <T>(method: string, params?: unknown) => Promise<T>,
    },
    connected: true,
    recordsLoading: false,
    recordsError: null as string | null,
    recordsItems: [] as RecordsEntry[],
    recordsOffset: 0,
    recordsLimit: 2,
    recordsHasMore: false,
    recordsPlatformFilter: "",
    recordsChannelsLoading: false,
    recordsChannels: [] as RecordsChannelEntry[],
    recordsSearchQuery: "",
    recordsSearchPlatform: "",
    recordsSearchLoading: false,
    recordsSearchResults: null as RecordsSearchEntry[] | null,
  };
}

describe("records controller", () => {
  it("loads paged records and computes hasMore", async () => {
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === "records.list") {
        expect(params).toEqual({ limit: 3, offset: 0, platform: undefined });
        return {
          records: [
            { id: "record-1", record_id: "r1", platform: "imessage" },
            { id: "record-2", record_id: "r2", platform: "imessage" },
            { id: "record-3", record_id: "r3", platform: "imessage" },
          ],
        };
      }
      throw new Error(`unexpected method: ${method}`);
    });

    const state = createState(request);
    await loadRecords(state);

    expect(state.recordsItems.map((record) => record.id)).toEqual(["record-1", "record-2"]);
    expect(state.recordsHasMore).toBe(true);
    expect(state.recordsOffset).toBe(0);
    expect(state.recordsLoading).toBe(false);
    expect(state.recordsError).toBeNull();
  });

  it("loads record channels through channels.list", async () => {
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === "channels.list") {
        expect(params).toEqual({ limit: 200, platform: undefined });
        return {
          channels: [{ id: "channel-1", platform: "imessage", thread_name: "Tyler" }],
        };
      }
      throw new Error(`unexpected method: ${method}`);
    });

    const state = createState(request);
    await loadRecordChannels(state);

    expect(state.recordsChannels).toEqual([
      { id: "channel-1", platform: "imessage", thread_name: "Tyler" },
    ]);
    expect(state.recordsChannelsLoading).toBe(false);
    expect(state.recordsError).toBeNull();
  });

  it("searches records only when a query is present", async () => {
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === "records.search") {
        expect(params).toEqual({ query: "casey", limit: 50, platform: undefined });
        return {
          records: [{ id: "record-1", record_id: "r1", platform: "imessage", content: "casey" }],
        };
      }
      throw new Error(`unexpected method: ${method}`);
    });

    const state = createState(request);
    state.recordsSearchQuery = "casey";
    await searchRecords(state);

    expect(state.recordsSearchResults).toEqual([
      { id: "record-1", record_id: "r1", platform: "imessage", content: "casey" },
    ]);
    expect(state.recordsSearchLoading).toBe(false);
    expect(state.recordsError).toBeNull();
  });

  it("refreshes records and channels together", async () => {
    const request = vi.fn(async (method: string) => {
      switch (method) {
        case "records.list":
          return { records: [{ id: "record-1", platform: "imessage" }] };
        case "channels.list":
          return { channels: [{ id: "channel-1", platform: "imessage" }] };
        default:
          throw new Error(`unexpected method: ${method}`);
      }
    });

    const state = createState(request);
    await refreshRecordsSurface(state);

    expect(request.mock.calls.map(([method]) => method)).toEqual(["records.list", "channels.list"]);
    expect(state.recordsItems).toHaveLength(1);
    expect(state.recordsChannels).toHaveLength(1);
  });
});
