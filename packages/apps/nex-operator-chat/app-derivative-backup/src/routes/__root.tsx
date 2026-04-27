import { Outlet, createRootRouteWithContext, useLocation, useNavigate } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNexChatAppConfig } from "../app-config";
import { AppSidebarLayout } from "../components/AppSidebarLayout";
import Sidebar from "../components/Sidebar";
import { AnchoredToastProvider, ToastProvider } from "../components/ui/toast";
import { NexChatRuntimeProvider, useNexChatState } from "../chat-runtime";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootRouteView,
  errorComponent: RootRouteErrorView,
});

function RootRouteView() {
  const { bridge, initialLaneId } = useNexChatAppConfig();
  const location = useLocation();
  const search = location.search as Record<string, unknown>;
  const routeLaneId =
    typeof search.lane === "string" && search.lane.trim().length > 0 ? search.lane.trim() : null;

  return (
    <ToastProvider>
      <AnchoredToastProvider>
        <NexChatRuntimeProvider
          bridge={bridge}
          initialLaneId={initialLaneId}
          requestedLaneId={routeLaneId ?? undefined}
        >
          <RouteSelectionCoordinator />
          <AppSidebarLayout sidebar={<Sidebar />}>
            <Outlet />
          </AppSidebarLayout>
        </NexChatRuntimeProvider>
      </AnchoredToastProvider>
    </ToastProvider>
  );
}

function RouteSelectionCoordinator() {
  const navigate = useNavigate();
  const location = useLocation();
  const search = location.search as Record<string, unknown>;
  const routeLaneId =
    typeof search.lane === "string" && search.lane.trim().length > 0 ? search.lane.trim() : null;
  const state = useNexChatState();

  useEffect(() => {
    if (!state.selectedLaneId || state.selectedLaneId === routeLaneId) {
      return;
    }
    void navigate({
      to: "/",
      search: (previous: Record<string, unknown>) => ({
        ...previous,
        lane: state.selectedLaneId,
      }),
      replace: true,
    });
  }, [navigate, routeLaneId, state.selectedLaneId]);

  return null;
}

function RootRouteErrorView(props: { error: unknown; reset: () => void }) {
  const message =
    props.error instanceof Error
      ? props.error.message
      : typeof props.error === "string"
        ? props.error
        : "Unexpected chat shell error.";
  const details =
    props.error instanceof Error
      ? props.error.stack ?? props.error.message
      : typeof props.error === "string"
        ? props.error
        : JSON.stringify(props.error, null, 2);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6">
      <section className="relative w-full max-w-xl rounded-2xl border border-border/80 bg-card/90 p-6 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-8">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Nex Operator Chat
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Something went wrong.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-primary-foreground"
            onClick={() => props.reset()}
            type="button"
          >
            Try again
          </button>
          <button
            className="inline-flex h-9 items-center rounded-md border border-border px-3"
            onClick={() => window.location.reload()}
            type="button"
          >
            Reload app
          </button>
        </div>
        <details className="group mt-5 overflow-hidden rounded-lg border border-border/70 bg-background/55">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted-foreground">
            <span className="group-open:hidden">Show error details</span>
            <span className="hidden group-open:inline">Hide error details</span>
          </summary>
          <pre className="max-h-56 overflow-auto border-t border-border/70 bg-background/80 px-3 py-2 text-xs text-foreground/85">
            {details}
          </pre>
        </details>
      </section>
    </div>
  );
}
