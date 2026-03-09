import type { AdapterEvent, NexAppHookContext } from "../../../../nex/src/apps/context.js";

let stopAdapterEvents: (() => void) | null = null;

export function stopGlowbotAdapterSubscriptions(): void {
  if (!stopAdapterEvents) {
    return;
  }
  stopAdapterEvents();
  stopAdapterEvents = null;
}

export function startGlowbotAdapterSubscriptions(params: {
  ctx: NexAppHookContext;
  metricExtractJobId: string;
}): void {
  stopGlowbotAdapterSubscriptions();
  stopAdapterEvents = params.ctx.nex.adapters.onEvent((event: AdapterEvent) => {
    void params.ctx.nex.runtime
      .callMethod("jobs.invoke", {
        job_id: params.metricExtractJobId,
        trigger_source: "adapter_event",
        input: {
          event: {
            type: event.type,
            connectionId: event.connectionId,
            data: event.data,
          },
        },
      })
      .catch((error) => {
        console.error("[GlowBot] Failed to enqueue metric_extract job:", error);
      });
  });
}
