import type { RuntimeBrowserClient } from "../runtime.ts";
import type { AgentsListResult } from "../types.ts";

export type AgentsState = {
  client: RuntimeBrowserClient | null;
  connected: boolean;
  agentsLoading: boolean;
  agentsError: string | null;
  agentsList: AgentsListResult | null;
  agentsSelectedId: string | null;
};

export async function loadAgents(state: AgentsState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.agentsLoading) {
    return;
  }
  state.agentsLoading = true;
  state.agentsError = null;
  try {
    const res = await state.client.request<AgentsListResult>("agents.list", {});
    if (res) {
      state.agentsList = res;
      const selected = state.agentsSelectedId;
      const known = res.agents.some((entry) => entry.id === selected);
      if (!selected || !known) {
        state.agentsSelectedId = res.defaultId ?? res.agents[0]?.id ?? null;
      }
    }
  } catch (err) {
    state.agentsError = String(err);
  } finally {
    state.agentsLoading = false;
  }
}

export async function createAgent(
  state: AgentsState & { agentsLoading: boolean },
  params: { name: string; model?: string; description?: string; memory?: string }
): Promise<string | null> {
  if (!state.client || !state.connected) return null;
  try {
    state.agentsLoading = true;
    const result = await state.client.request<{ agentId?: string; id?: string }>("agents.create", params);
    await loadAgents(state);
    return result?.agentId ?? result?.id ?? null;
  } catch (err) {
    state.agentsError = err instanceof Error ? err.message : String(err);
    return null;
  } finally {
    state.agentsLoading = false;
  }
}

export async function updateAgent(
  state: AgentsState,
  agentId: string,
  params: Record<string, unknown>
): Promise<boolean> {
  if (!state.client || !state.connected) return false;
  try {
    await state.client.request("agents.update", { agentId, ...params });
    await loadAgents(state);
    return true;
  } catch (err) {
    state.agentsError = err instanceof Error ? err.message : String(err);
    return false;
  }
}

export async function deleteAgent(
  state: AgentsState,
  agentId: string
): Promise<boolean> {
  if (!state.client || !state.connected) return false;
  try {
    await state.client.request("agents.delete", { agentId });
    await loadAgents(state);
    return true;
  } catch (err) {
    state.agentsError = err instanceof Error ? err.message : String(err);
    return false;
  }
}
