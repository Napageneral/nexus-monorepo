import type { ChannelsState } from "./channels.types.ts";
import type { ChannelsStatusSnapshot } from "../types.ts";

export type { ChannelsState };

type AdapterConnectionEntry = {
  adapter: string;
  name: string;
  status: "connected" | "disconnected" | "error" | "expired";
  account: string | null;
  lastSync: number | null;
  error: string | null;
};

function summarizeAdapterConnections(entries: AdapterConnectionEntry[]): AdapterConnectionEntry[] {
  const grouped = new Map<string, AdapterConnectionEntry[]>();
  for (const entry of entries) {
    const adapter = typeof entry.adapter === "string" ? entry.adapter.trim() : "";
    if (!adapter) {
      continue;
    }
    const existing = grouped.get(adapter) ?? [];
    existing.push({ ...entry, adapter });
    grouped.set(adapter, existing);
  }
  return [...grouped.values()]
    .map((group) => {
      const first = group[0]!;
      const connected = group.find((entry) => entry.status === "connected");
      const error = group.find((entry) => entry.status === "error");
      const expired = group.find((entry) => entry.status === "expired");
      const chosen = connected ?? error ?? expired ?? first;
      const lastSyncValues = group
        .map((entry) => entry.lastSync)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return {
        ...first,
        status: chosen.status,
        account: chosen.account ?? group.find((entry) => entry.account)?.account ?? null,
        lastSync: lastSyncValues.length > 0 ? Math.max(...lastSyncValues) : null,
        error: chosen.error ?? group.find((entry) => entry.error)?.error ?? null,
      };
    })
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

export async function loadChannels(state: ChannelsState, probe: boolean) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.channelsLoading) {
    return;
  }
  state.channelsLoading = true;
  state.channelsError = null;
  try {
    const res = await state.client.request<{ connections?: AdapterConnectionEntry[] }>(
      "adapters.connections.list",
      {},
    );
    const adapters = summarizeAdapterConnections(
      Array.isArray(res.connections) ? res.connections : [],
    );
    const snapshot: ChannelsStatusSnapshot = {
      ts: Date.now(),
      channelOrder: adapters.map((entry) => entry.adapter),
      channelLabels: Object.fromEntries(adapters.map((entry) => [entry.adapter, entry.name])),
      channelMeta: adapters.map((entry) => ({
        id: entry.adapter,
        label: entry.name,
        detailLabel: entry.name,
      })),
      channels: Object.fromEntries(
        adapters.map((entry) => [
          entry.adapter,
          {
            configured: Boolean(entry.account),
            running: entry.status === "connected",
            connected: entry.status === "connected",
            lastError: entry.error ?? null,
          },
        ]),
      ),
      channelAccounts: Object.fromEntries(
        adapters.map((entry) => [
          entry.adapter,
          [
            {
              accountId: entry.account ?? "default",
              name: entry.account,
              configured: Boolean(entry.account),
              running: entry.status === "connected",
              connected: entry.status === "connected",
              lastError: entry.error,
              lastInboundAt: entry.lastSync ?? undefined,
            },
          ],
        ]),
      ),
      channelDefaultAccountId: Object.fromEntries(
        adapters.map((entry) => [entry.adapter, entry.account ?? "default"]),
      ),
    };
    state.channelsSnapshot = snapshot;
    state.channelsLastSuccess = Date.now();
  } catch (err) {
    state.channelsError = String(err);
  } finally {
    state.channelsLoading = false;
  }
}

export async function startWhatsAppLogin(state: ChannelsState, force: boolean) {
  void force;
  state.whatsappLoginMessage = "Use Integrations to configure WhatsApp.";
  state.whatsappLoginQrDataUrl = null;
  state.whatsappLoginConnected = null;
}

export async function waitWhatsAppLogin(state: ChannelsState) {
  state.whatsappLoginMessage = "Use Integrations to configure WhatsApp.";
  state.whatsappLoginQrDataUrl = null;
  state.whatsappLoginConnected = null;
}

export async function logoutWhatsApp(state: ChannelsState) {
  state.whatsappLoginMessage = "Use Integrations to manage account sessions.";
  state.whatsappLoginQrDataUrl = null;
  state.whatsappLoginConnected = null;
}

export async function configureChannel(
  state: ChannelsState,
  channel: string,
  config: Record<string, unknown>,
): Promise<boolean> {
  if (!state.client || !state.connected) return false;
  try {
    await state.client.request("channels.configure", { channel, ...config });
    return true;
  } catch (err) {
    state.channelsError = err instanceof Error ? err.message : String(err);
    return false;
  }
}

export async function enableChannel(
  state: ChannelsState,
  channel: string,
): Promise<boolean> {
  if (!state.client || !state.connected) return false;
  try {
    await state.client.request("channels.enable", { channel });
    return true;
  } catch (err) {
    state.channelsError = err instanceof Error ? err.message : String(err);
    return false;
  }
}

export async function disableChannel(
  state: ChannelsState,
  channel: string,
): Promise<boolean> {
  if (!state.client || !state.connected) return false;
  try {
    await state.client.request("channels.disable", { channel });
    return true;
  } catch (err) {
    state.channelsError = err instanceof Error ? err.message : String(err);
    return false;
  }
}
