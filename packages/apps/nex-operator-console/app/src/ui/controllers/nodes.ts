import type { RuntimeBrowserClient } from "../runtime.ts";

export type NodesState = {
  client: RuntimeBrowserClient | null;
  connected: boolean;
  nodesLoading: boolean;
  nodes: Array<Record<string, unknown>>;
  lastError: string | null;
};

export async function loadNodes(state: NodesState, opts?: { quiet?: boolean }) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.nodesLoading) {
    return;
  }
  state.nodesLoading = true;
  if (!opts?.quiet) {
    state.lastError = null;
  }
  try {
    const res = await state.client.request<{ hosts?: Record<string, unknown>[] }>(
      "device.host.list",
      {},
    );
    const hosts = Array.isArray(res.hosts) ? res.hosts : [];
    state.nodes = hosts.map((host) => {
      const endpointId = typeof host.endpointId === "string" ? host.endpointId.trim() : "";
      return {
        ...host,
        nodeId: endpointId || (typeof host.nodeId === "string" ? host.nodeId : ""),
      };
    });
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    state.nodesLoading = false;
  }
}
