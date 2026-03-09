import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import type { GlowbotIntegrationsResponse } from "../../shared/types.js";
import { loadManifestAdapters, mapAdapterEntry } from "./helpers.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const manifestAdapters = loadManifestAdapters(ctx.app.packageDir);
  const runtimeEntries = new Map<string, Record<string, unknown>[]>();

  try {
    const connections = await ctx.nex.adapters.list();
    for (const conn of connections) {
      const entry = conn as unknown as Record<string, unknown>;
      const adapterId = typeof entry.adapter === "string" && entry.adapter ? entry.adapter : null;
      if (adapterId) {
        const existing = runtimeEntries.get(adapterId) ?? [];
        existing.push(entry);
        runtimeEntries.set(adapterId, existing);
      }
    }
  } catch {
    // Return manifest-derived integration metadata even when runtime state
    // cannot be queried.
  }

  const adapters = manifestAdapters.map((adapter) =>
    mapAdapterEntry({
      manifestAdapter: adapter,
      runtimeEntries: runtimeEntries.get(adapter.id),
    }),
  );

  return { adapters } satisfies GlowbotIntegrationsResponse;
};
