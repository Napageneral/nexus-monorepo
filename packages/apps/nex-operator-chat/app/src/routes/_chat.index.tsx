import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";

import { isElectron } from "../env";
import { isNexEmbedded, readNexChatEmbedConfig } from "../nex/embed-config";
import { requestOrchestrationBootstrapReadModel } from "../nex/chat-adapter";
import { useStore } from "../store";
import { SidebarTrigger } from "../components/ui/sidebar";

function ChatIndexRouteView() {
  const nexEmbedded = isNexEmbedded();
  const navigate = useNavigate();
  const syncServerReadModel = useStore((store) => store.syncServerReadModel);
  const firstThreadId = useStore((store) => store.threads[0]?.id ?? null);
  const attemptedEmbeddedSelectionRef = useRef(false);

  useEffect(() => {
    if (!nexEmbedded) {
      return;
    }
    if (firstThreadId) {
      void navigate({
        to: "/$threadId",
        params: { threadId: firstThreadId },
        replace: true,
      });
      return;
    }
    if (attemptedEmbeddedSelectionRef.current) {
      return;
    }
    attemptedEmbeddedSelectionRef.current = true;
    let disposed = false;
    void requestOrchestrationBootstrapReadModel(readNexChatEmbedConfig()?.initialLaneId)
      .then((result) => {
        if (disposed) {
          return;
        }
        syncServerReadModel(result.readModel);
        const selectedLaneId = result.selectedLaneId ?? result.readModel.threads[0]?.id ?? null;
        if (!selectedLaneId) {
          return;
        }
        void navigate({
          to: "/$threadId",
          params: { threadId: selectedLaneId },
          replace: true,
        });
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [firstThreadId, navigate, nexEmbedded, syncServerReadModel]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-muted-foreground/40">
      {!isElectron && (
        <header className="border-b border-border px-3 py-2 md:hidden">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="size-7 shrink-0" />
            <span className="text-sm font-medium text-foreground">
              {nexEmbedded ? "Agents" : "Threads"}
            </span>
          </div>
        </header>
      )}

      {isElectron && (
        <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5">
          <span className="text-xs text-muted-foreground/50">
            {nexEmbedded ? "No active agent thread" : "No active thread"}
          </span>
        </div>
      )}

      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-sm">
            {nexEmbedded
              ? "Select a manager or worker thread to get started."
              : "Select a thread or create a new one to get started."}
          </p>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
