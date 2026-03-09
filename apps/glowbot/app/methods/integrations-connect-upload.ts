import type { NexAppMethodHandler } from "../../../../nex/src/apps/context.js";
import type { GlowbotIntegrationsConnectUploadResponse } from "../../shared/types.js";
import { asNonEmptyString, asNumber, getConnectMethodKind } from "./helpers.js";

export const handle: NexAppMethodHandler = async (ctx) => {
  const params = ctx.params as {
    adapterId: string;
    connectionProfileId: string;
    file: string;
    filename: string;
  };
  const kind = getConnectMethodKind(ctx.app.packageDir, params.adapterId, params.connectionProfileId);
  if (kind !== "file-upload") {
    throw new Error(`Connection profile ${params.connectionProfileId} is not an upload profile`);
  }

  try {
    const result = await ctx.nex.adapters.connect({
      adapter: params.adapterId,
      config: {
        connectionProfileId: params.connectionProfileId,
        fileName: params.filename,
        fileBase64: params.file,
      },
    });

    // The runtime will include upload preview info in the result for file upload flows.
    const raw = result as unknown as Record<string, unknown>;
    const preview = raw.preview as Record<string, unknown> | undefined;

    const dateRangeRaw = preview?.dateRange;
    const dateRange =
      typeof dateRangeRaw === "string"
        ? dateRangeRaw
        : dateRangeRaw &&
            typeof dateRangeRaw === "object" &&
            !Array.isArray(dateRangeRaw)
          ? `${asNonEmptyString((dateRangeRaw as Record<string, unknown>).from) ?? "unknown"} to ${asNonEmptyString((dateRangeRaw as Record<string, unknown>).to) ?? "unknown"}`
          : "unknown";

    return {
      status: "success",
      preview: {
        rowCount: Math.max(0, Math.floor(asNumber(preview?.rows) ?? 0)),
        dateRange,
      },
    } satisfies GlowbotIntegrationsConnectUploadResponse;
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "File upload failed",
    } satisfies GlowbotIntegrationsConnectUploadResponse;
  }
};
