import { describe, expect, it, vi } from "vitest";
import {
  configureChannel,
  enableChannel,
  disableChannel,
} from "./channels.ts";
import type { ChannelsState } from "./channels.types.ts";

type ClientRequestMock = ReturnType<typeof vi.fn>;

function makeState(requestMock: ClientRequestMock): ChannelsState {
  return {
    client: {
      request: requestMock as NonNullable<ChannelsState["client"]>["request"],
    },
    connected: true,
    channelsLoading: false,
    channelsSnapshot: null,
    channelsError: null,
    channelsLastSuccess: null,
    whatsappLoginMessage: null,
    whatsappLoginQrDataUrl: null,
    whatsappLoginConnected: null,
    whatsappBusy: false,
  };
}

describe("channels CRUD controller", () => {
  // ---------------------------------------------------------------------------
  // configureChannel
  // ---------------------------------------------------------------------------
  describe("configureChannel", () => {
    it("sends configure request and returns true", async () => {
      const request = vi.fn().mockResolvedValueOnce({ ok: true });
      const state = makeState(request);

      const ok = await configureChannel(state, "slack", { webhookUrl: "https://example.com" });

      expect(ok).toBe(true);
      expect(request).toHaveBeenCalledWith("channels.configure", {
        channel: "slack",
        webhookUrl: "https://example.com",
      });
      expect(state.channelsError).toBeNull();
    });

    it("returns false and sets error on failure", async () => {
      const request = vi.fn().mockRejectedValueOnce(new Error("invalid config"));
      const state = makeState(request);

      const ok = await configureChannel(state, "slack", {});

      expect(ok).toBe(false);
      expect(state.channelsError).toContain("invalid config");
    });

    it("returns false when disconnected", async () => {
      const request = vi.fn();
      const state = makeState(request);
      state.connected = false;

      const ok = await configureChannel(state, "slack", {});

      expect(ok).toBe(false);
      expect(request).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // enableChannel
  // ---------------------------------------------------------------------------
  describe("enableChannel", () => {
    it("sends enable request and returns true", async () => {
      const request = vi.fn().mockResolvedValueOnce({ ok: true });
      const state = makeState(request);

      const ok = await enableChannel(state, "whatsapp");

      expect(ok).toBe(true);
      expect(request).toHaveBeenCalledWith("channels.enable", { channel: "whatsapp" });
      expect(state.channelsError).toBeNull();
    });

    it("returns false and sets error on failure", async () => {
      const request = vi.fn().mockRejectedValueOnce(new Error("not configured"));
      const state = makeState(request);

      const ok = await enableChannel(state, "whatsapp");

      expect(ok).toBe(false);
      expect(state.channelsError).toContain("not configured");
    });
  });

  // ---------------------------------------------------------------------------
  // disableChannel
  // ---------------------------------------------------------------------------
  describe("disableChannel", () => {
    it("sends disable request and returns true", async () => {
      const request = vi.fn().mockResolvedValueOnce({ ok: true });
      const state = makeState(request);

      const ok = await disableChannel(state, "telegram");

      expect(ok).toBe(true);
      expect(request).toHaveBeenCalledWith("channels.disable", { channel: "telegram" });
      expect(state.channelsError).toBeNull();
    });

    it("returns false and sets error on failure", async () => {
      const request = vi.fn().mockRejectedValueOnce(new Error("channel busy"));
      const state = makeState(request);

      const ok = await disableChannel(state, "telegram");

      expect(ok).toBe(false);
      expect(state.channelsError).toContain("channel busy");
    });
  });
});
