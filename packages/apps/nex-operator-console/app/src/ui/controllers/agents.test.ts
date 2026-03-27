import { describe, expect, it, vi } from "vitest";
import {
  createAgent,
  deleteAgent,
  loadAgents,
  updateAgent,
  type AgentsState,
} from "./agents.ts";

type ClientRequestMock = ReturnType<typeof vi.fn>;

function makeState(requestMock: ClientRequestMock): AgentsState {
  return {
    client: {
      request: requestMock as NonNullable<AgentsState["client"]>["request"],
    },
    connected: true,
    agentsLoading: false,
    agentsError: null,
    agentsList: null,
    agentsSelectedId: null,
  };
}

describe("agents controller", () => {
  // ---------------------------------------------------------------------------
  // loadAgents
  // ---------------------------------------------------------------------------
  describe("loadAgents", () => {
    it("loads agents and selects the default agent", async () => {
      const request = vi.fn().mockResolvedValueOnce({
        defaultId: "agent-2",
        agents: [
          { id: "agent-1", name: "Alpha" },
          { id: "agent-2", name: "Beta" },
        ],
      });
      const state = makeState(request);

      await loadAgents(state);

      expect(request).toHaveBeenCalledWith("agents.list", {});
      expect(state.agentsList).toEqual({
        defaultId: "agent-2",
        agents: [
          { id: "agent-1", name: "Alpha" },
          { id: "agent-2", name: "Beta" },
        ],
      });
      expect(state.agentsSelectedId).toBe("agent-2");
      expect(state.agentsError).toBeNull();
      expect(state.agentsLoading).toBe(false);
    });

    it("selects the first agent when no defaultId is present", async () => {
      const request = vi.fn().mockResolvedValueOnce({
        agents: [{ id: "agent-1", name: "Alpha" }],
      });
      const state = makeState(request);

      await loadAgents(state);

      expect(state.agentsSelectedId).toBe("agent-1");
    });

    it("sets agentsError on request failure", async () => {
      const request = vi.fn().mockRejectedValueOnce(new Error("network down"));
      const state = makeState(request);

      await loadAgents(state);

      expect(state.agentsError).toContain("network down");
      expect(state.agentsLoading).toBe(false);
    });

    it("does nothing when disconnected", async () => {
      const request = vi.fn();
      const state = makeState(request);
      state.connected = false;

      await loadAgents(state);

      expect(request).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // createAgent
  // ---------------------------------------------------------------------------
  describe("createAgent", () => {
    it("creates an agent and refreshes the list", async () => {
      const request = vi
        .fn()
        .mockResolvedValueOnce({ agentId: "new-1" })
        .mockResolvedValueOnce({
          defaultId: "new-1",
          agents: [{ id: "new-1", name: "New Agent" }],
        });
      const state = makeState(request);

      const id = await createAgent(state, { name: "New Agent" });

      expect(id).toBe("new-1");
      expect(request).toHaveBeenNthCalledWith(1, "agents.create", { name: "New Agent" });
      expect(request).toHaveBeenNthCalledWith(2, "agents.list", {});
      expect(state.agentsLoading).toBe(false);
    });

    it("returns id field when agentId is absent", async () => {
      const request = vi
        .fn()
        .mockResolvedValueOnce({ id: "fallback-1" })
        .mockResolvedValueOnce({ agents: [{ id: "fallback-1", name: "F" }] });
      const state = makeState(request);

      const id = await createAgent(state, { name: "F" });

      expect(id).toBe("fallback-1");
    });

    it("returns null and sets error on failure", async () => {
      const request = vi.fn().mockRejectedValueOnce(new Error("bad request"));
      const state = makeState(request);

      const id = await createAgent(state, { name: "Fail" });

      expect(id).toBeNull();
      expect(state.agentsError).toContain("bad request");
      expect(state.agentsLoading).toBe(false);
    });

    it("returns null when disconnected", async () => {
      const request = vi.fn();
      const state = makeState(request);
      state.connected = false;

      const id = await createAgent(state, { name: "Nope" });

      expect(id).toBeNull();
      expect(request).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // updateAgent
  // ---------------------------------------------------------------------------
  describe("updateAgent", () => {
    it("updates an agent and refreshes the list", async () => {
      const request = vi
        .fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          agents: [{ id: "agent-1", name: "Renamed" }],
        });
      const state = makeState(request);

      const ok = await updateAgent(state, "agent-1", { name: "Renamed" });

      expect(ok).toBe(true);
      expect(request).toHaveBeenNthCalledWith(1, "agents.update", {
        agentId: "agent-1",
        name: "Renamed",
      });
      expect(request).toHaveBeenNthCalledWith(2, "agents.list", {});
    });

    it("returns false and sets error on failure", async () => {
      const request = vi.fn().mockRejectedValueOnce(new Error("not found"));
      const state = makeState(request);

      const ok = await updateAgent(state, "agent-1", { name: "X" });

      expect(ok).toBe(false);
      expect(state.agentsError).toContain("not found");
    });
  });

  // ---------------------------------------------------------------------------
  // deleteAgent
  // ---------------------------------------------------------------------------
  describe("deleteAgent", () => {
    it("deletes an agent and refreshes the list", async () => {
      const request = vi
        .fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          agents: [],
        });
      const state = makeState(request);

      const ok = await deleteAgent(state, "agent-1");

      expect(ok).toBe(true);
      expect(request).toHaveBeenNthCalledWith(1, "agents.delete", { agentId: "agent-1" });
      expect(request).toHaveBeenNthCalledWith(2, "agents.list", {});
    });

    it("returns false and sets error on failure", async () => {
      const request = vi.fn().mockRejectedValueOnce(new Error("forbidden"));
      const state = makeState(request);

      const ok = await deleteAgent(state, "agent-1");

      expect(ok).toBe(false);
      expect(state.agentsError).toContain("forbidden");
    });
  });
});
