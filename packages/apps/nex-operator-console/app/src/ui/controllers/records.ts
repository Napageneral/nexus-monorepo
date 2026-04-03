export type RecordsAttachment = {
  id: string;
  filename?: string | null;
  mime_type?: string | null;
  size?: number | null;
  media_type?: string | null;
};

export type RecordsEntry = {
  id: string;
  record_id?: string | null;
  content?: string | null;
  content_type?: string | null;
  attachments?: RecordsAttachment[] | null;
  timestamp?: number | null;
  received_at?: number | null;
  platform?: string | null;
  sender_entity_id?: string | null;
  receiver_entity_id?: string | null;
  sender_contact_id?: string | null;
  receiver_contact_id?: string | null;
  container_kind?: string | null;
  container_id?: string | null;
  thread_id?: string | null;
  reply_to_id?: string | null;
  request_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type RecordsSearchEntry = RecordsEntry;

export type RecordsChannelEntry = {
  id: string;
  platform?: string | null;
  connection_id?: string | null;
  container_id?: string | null;
  container_kind?: string | null;
  container_name?: string | null;
  thread_id?: string | null;
  thread_name?: string | null;
  created_at?: number | null;
  deleted_at?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type RecordsState = {
  client: { request: <T>(method: string, params?: unknown) => Promise<T> } | null;
  connected: boolean;
  recordsLoading: boolean;
  recordsError: string | null;
  recordsItems: RecordsEntry[];
  recordsOffset: number;
  recordsLimit: number;
  recordsHasMore: boolean;
  recordsPlatformFilter: string;
  recordsChannelsLoading: boolean;
  recordsChannels: RecordsChannelEntry[];
  recordsSearchQuery: string;
  recordsSearchPlatform: string;
  recordsSearchLoading: boolean;
  recordsSearchResults: RecordsSearchEntry[] | null;
};

type RecordsListResult = {
  records?: RecordsEntry[];
  limit?: number;
  offset?: number;
};

type RecordsSearchResult = {
  records?: RecordsSearchEntry[];
};

type RecordsChannelsResult = {
  channels?: RecordsChannelEntry[];
};

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

export async function loadRecords(state: RecordsState, offset = state.recordsOffset): Promise<void> {
  if (!state.client || !state.connected || state.recordsLoading) {
    return;
  }

  state.recordsLoading = true;
  state.recordsError = null;
  try {
    const limit = Math.max(1, state.recordsLimit);
    const response = await state.client.request<RecordsListResult>("records.list", {
      limit: limit + 1,
      offset,
      platform: trimmedOrNull(state.recordsPlatformFilter) ?? undefined,
    });
    const records = Array.isArray(response.records) ? response.records : [];
    state.recordsHasMore = records.length > limit;
    state.recordsItems = records.slice(0, limit);
    state.recordsOffset = offset;
  } catch (error) {
    state.recordsError = error instanceof Error ? error.message : String(error);
  } finally {
    state.recordsLoading = false;
  }
}

export async function loadRecordChannels(state: RecordsState): Promise<void> {
  if (!state.client || !state.connected || state.recordsChannelsLoading) {
    return;
  }

  state.recordsChannelsLoading = true;
  state.recordsError = null;
  try {
    const response = await state.client.request<RecordsChannelsResult>("channels.list", {
      limit: 200,
      platform: trimmedOrNull(state.recordsPlatformFilter) ?? undefined,
    });
    state.recordsChannels = Array.isArray(response.channels) ? response.channels : [];
  } catch (error) {
    state.recordsError = error instanceof Error ? error.message : String(error);
  } finally {
    state.recordsChannelsLoading = false;
  }
}

export async function searchRecords(state: RecordsState): Promise<void> {
  if (!state.client || !state.connected || state.recordsSearchLoading) {
    return;
  }

  const query = state.recordsSearchQuery.trim();
  if (!query) {
    state.recordsSearchResults = null;
    return;
  }

  state.recordsSearchLoading = true;
  state.recordsError = null;
  try {
    const response = await state.client.request<RecordsSearchResult>("records.search", {
      query,
      limit: 50,
      platform: trimmedOrNull(state.recordsSearchPlatform) ?? undefined,
    });
    state.recordsSearchResults = Array.isArray(response.records) ? response.records : [];
  } catch (error) {
    state.recordsError = error instanceof Error ? error.message : String(error);
  } finally {
    state.recordsSearchLoading = false;
  }
}

export async function refreshRecordsSurface(state: RecordsState): Promise<void> {
  await Promise.all([loadRecords(state, 0), loadRecordChannels(state)]);
}
