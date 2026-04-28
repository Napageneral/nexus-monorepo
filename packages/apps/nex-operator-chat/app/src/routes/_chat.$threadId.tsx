import { ThreadId } from "@t3tools/contracts";
import { createFileRoute, retainSearchParams, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, type ReactNode, useCallback, useEffect, useState } from "react";

import ChatView from "../components/ChatView";
import { useComposerDraftStore } from "../composerDraftStore";
import {
  type DiffRouteSearch,
  parseDiffRouteSearch,
  stripDiffSearchParams,
} from "../diffRouteSearch";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { isNexEmbedded } from "../nex/embed-config";
import { isNexFeatureEnabled } from "../nex/feature-policy";
import { requestOrchestrationReadModelForLane } from "../nex/chat-adapter";
import { useStore } from "../store";
import { Sheet, SheetPopup } from "../components/ui/sheet";
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail } from "~/components/ui/sidebar";

type DiffPanelMode = "inline" | "sheet" | "sidebar";

const DiffPanelContent = lazy(() => import("../components/DiffPanelContent"));
const DIFF_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 1180px)";
const DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_diff_sidebar_width";
const DIFF_INLINE_DEFAULT_WIDTH = "clamp(28rem,48vw,44rem)";
const DIFF_INLINE_SIDEBAR_MIN_WIDTH = 26 * 16;
const COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX = 208;
const NEX_EMPTY_THREAD_HYDRATION_MAX_ATTEMPTS = 20;
const NEX_EMPTY_THREAD_HYDRATION_RETRY_DELAY_MS = 250;

const DiffPanelSheet = (props: {
  children: ReactNode;
  diffOpen: boolean;
  onCloseDiff: () => void;
}) => {
  return (
    <Sheet
      open={props.diffOpen}
      onOpenChange={(open) => {
        if (!open) {
          props.onCloseDiff();
        }
      }}
    >
      <SheetPopup
        side="right"
        showCloseButton={false}
        keepMounted
        className="w-[min(88vw,820px)] max-w-[820px] p-0"
      >
        {props.children}
      </SheetPopup>
    </Sheet>
  );
};

const LazyDiffPanel = (props: { mode: DiffPanelMode }) => {
  return (
    <Suspense fallback={null}>
      <DiffPanelContent mode={props.mode} />
    </Suspense>
  );
};

const DiffPanelInlineSidebar = (props: {
  diffOpen: boolean;
  onCloseDiff: () => void;
  onOpenDiff: () => void;
  renderDiffContent: boolean;
}) => {
  const { diffOpen, onCloseDiff, onOpenDiff, renderDiffContent } = props;
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        onOpenDiff();
        return;
      }
      onCloseDiff();
    },
    [onCloseDiff, onOpenDiff],
  );
  const shouldAcceptInlineSidebarWidth = useCallback(
    ({ nextWidth, wrapper }: { nextWidth: number; wrapper: HTMLElement }) => {
      const composerForm = document.querySelector<HTMLElement>("[data-chat-composer-form='true']");
      if (!composerForm) return true;
      const composerViewport = composerForm.parentElement;
      if (!composerViewport) return true;
      const previousSidebarWidth = wrapper.style.getPropertyValue("--sidebar-width");
      wrapper.style.setProperty("--sidebar-width", `${nextWidth}px`);

      const viewportStyle = window.getComputedStyle(composerViewport);
      const viewportPaddingLeft = Number.parseFloat(viewportStyle.paddingLeft) || 0;
      const viewportPaddingRight = Number.parseFloat(viewportStyle.paddingRight) || 0;
      const viewportContentWidth = Math.max(
        0,
        composerViewport.clientWidth - viewportPaddingLeft - viewportPaddingRight,
      );
      const formRect = composerForm.getBoundingClientRect();
      const composerFooter = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-footer='true']",
      );
      const composerRightActions = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-actions='right']",
      );
      const composerRightActionsWidth = composerRightActions?.getBoundingClientRect().width ?? 0;
      const composerFooterGap = composerFooter
        ? Number.parseFloat(window.getComputedStyle(composerFooter).columnGap) ||
          Number.parseFloat(window.getComputedStyle(composerFooter).gap) ||
          0
        : 0;
      const minimumComposerWidth =
        COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX + composerRightActionsWidth + composerFooterGap;
      const hasComposerOverflow = composerForm.scrollWidth > composerForm.clientWidth + 0.5;
      const overflowsViewport = formRect.width > viewportContentWidth + 0.5;
      const violatesMinimumComposerWidth = composerForm.clientWidth + 0.5 < minimumComposerWidth;

      if (previousSidebarWidth.length > 0) {
        wrapper.style.setProperty("--sidebar-width", previousSidebarWidth);
      } else {
        wrapper.style.removeProperty("--sidebar-width");
      }

      return !hasComposerOverflow && !overflowsViewport && !violatesMinimumComposerWidth;
    },
    [],
  );

  return (
    <SidebarProvider
      defaultOpen={false}
      open={diffOpen}
      onOpenChange={onOpenChange}
      className="w-auto min-h-0 flex-none bg-transparent"
      style={{ "--sidebar-width": DIFF_INLINE_DEFAULT_WIDTH } as React.CSSProperties}
    >
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="border-l border-border bg-card text-foreground"
        resizable={{
          minWidth: DIFF_INLINE_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: shouldAcceptInlineSidebarWidth,
          storageKey: DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        {renderDiffContent ? <LazyDiffPanel mode="sidebar" /> : null}
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
};

function ChatThreadRouteView() {
  const bootstrapComplete = useStore((store) => store.bootstrapComplete);
  const syncServerReadModel = useStore((store) => store.syncServerReadModel);
  const navigate = useNavigate();
  const threadId = Route.useParams({
    select: (params) => ThreadId.makeUnsafe(params.threadId),
  });
  const search = Route.useSearch();
  const threadExists = useStore((store) => store.threads.some((thread) => thread.id === threadId));
  const serverThreadMessageCount = useStore(
    (store) => store.threads.find((thread) => thread.id === threadId)?.messages.length ?? null,
  );
  const draftThreadExists = useComposerDraftStore((store) =>
    Object.hasOwn(store.draftThreadsByThreadId, threadId),
  );
  const routeThreadExists = threadExists || draftThreadExists;
  const nexEmbedded = isNexEmbedded();
  const diffFeatureEnabled = isNexFeatureEnabled("diff");
  const diffOpen = diffFeatureEnabled && search.diff === "1";
  const shouldUseDiffSheet = diffFeatureEnabled && useMediaQuery(DIFF_INLINE_LAYOUT_MEDIA_QUERY);
  const [routeRecoveryState, setRouteRecoveryState] = useState<"idle" | "pending" | "failed">(
    "idle",
  );
  const [emptyThreadHydrationAttempt, setEmptyThreadHydrationAttempt] = useState(0);
  // TanStack Router keeps active route components mounted across param-only navigations
  // unless remountDeps are configured, so this stays warm across thread switches.
  const [hasOpenedDiff, setHasOpenedDiff] = useState(diffOpen);
  const closeDiff = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: { diff: undefined },
    });
  }, [navigate, threadId]);
  const openDiff = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, diff: "1" };
      },
    });
  }, [navigate, threadId]);

  useEffect(() => {
    if (diffOpen) {
      setHasOpenedDiff(true);
    }
  }, [diffOpen]);

  useEffect(() => {
    if (
      diffFeatureEnabled ||
      (search.diff !== "1" && search.diffTurnId == null && search.diffFilePath == null)
    ) {
      return;
    }

    void navigate({
      to: "/$threadId",
      params: { threadId },
      replace: true,
      search: (previous) => stripDiffSearchParams(previous),
    });
  }, [
    diffFeatureEnabled,
    navigate,
    search.diff,
    search.diffFilePath,
    search.diffTurnId,
    threadId,
  ]);

  useEffect(() => {
    setRouteRecoveryState("idle");
    setEmptyThreadHydrationAttempt(0);
  }, [threadId]);

  useEffect(() => {
    if (!bootstrapComplete || routeThreadExists || routeRecoveryState !== "idle") {
      return;
    }

    let cancelled = false;
    setRouteRecoveryState("pending");
    void requestOrchestrationReadModelForLane(threadId)
      .then((readModel) => {
        if (cancelled) {
          return;
        }
        syncServerReadModel(readModel);
        setRouteRecoveryState("failed");
      })
      .catch(() => {
        if (!cancelled) {
          setRouteRecoveryState("failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    bootstrapComplete,
    routeRecoveryState,
    routeThreadExists,
    syncServerReadModel,
    threadId,
  ]);

  useEffect(() => {
    if (
      !nexEmbedded ||
      !bootstrapComplete ||
      !routeThreadExists ||
      draftThreadExists ||
      serverThreadMessageCount !== 0
    ) {
      return;
    }

    let cancelled = false;
    let retryTimer: number | null = null;
    const scheduleRetry = () => {
      if (
        cancelled ||
        emptyThreadHydrationAttempt >= NEX_EMPTY_THREAD_HYDRATION_MAX_ATTEMPTS
      ) {
        return;
      }
      retryTimer = window.setTimeout(() => {
        setEmptyThreadHydrationAttempt((attempt) => attempt + 1);
      }, NEX_EMPTY_THREAD_HYDRATION_RETRY_DELAY_MS);
    };

    void requestOrchestrationReadModelForLane(threadId)
      .then((readModel) => {
        if (cancelled) {
          return;
        }
        const hydratedMessageCount =
          readModel.threads.find((thread) => thread.id === threadId)?.messages.length ?? 0;
        syncServerReadModel(readModel);
        if (hydratedMessageCount === 0) {
          scheduleRetry();
        }
      })
      .catch(() => {
        if (!cancelled) {
          scheduleRetry();
        }
      });

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [
    bootstrapComplete,
    draftThreadExists,
    emptyThreadHydrationAttempt,
    nexEmbedded,
    routeThreadExists,
    serverThreadMessageCount,
    syncServerReadModel,
    threadId,
  ]);

  useEffect(() => {
    if (!bootstrapComplete) {
      return;
    }

    if (!routeThreadExists && routeRecoveryState === "failed") {
      void navigate({ to: "/", replace: true });
      return;
    }
  }, [bootstrapComplete, navigate, routeRecoveryState, routeThreadExists, threadId]);

  if (!bootstrapComplete || !routeThreadExists) {
    return null;
  }

  const embeddedInsetHeightClass = nexEmbedded ? "h-full" : "h-dvh";
  const sidebarInsetClassName = `${embeddedInsetHeightClass} min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground`;

  if (!diffFeatureEnabled) {
    return (
      <SidebarInset className={sidebarInsetClassName}>
        <ChatView threadId={threadId} />
      </SidebarInset>
    );
  }

  const shouldRenderDiffContent = diffOpen || hasOpenedDiff;

  if (!shouldUseDiffSheet) {
    return (
      <>
        <SidebarInset className={sidebarInsetClassName}>
          <ChatView threadId={threadId} />
        </SidebarInset>
        <DiffPanelInlineSidebar
          diffOpen={diffOpen}
          onCloseDiff={closeDiff}
          onOpenDiff={openDiff}
          renderDiffContent={shouldRenderDiffContent}
        />
      </>
    );
  }

  return (
    <>
      <SidebarInset className={sidebarInsetClassName}>
        <ChatView threadId={threadId} />
      </SidebarInset>
      <DiffPanelSheet diffOpen={diffOpen} onCloseDiff={closeDiff}>
        {shouldRenderDiffContent ? <LazyDiffPanel mode="sheet" /> : null}
      </DiffPanelSheet>
    </>
  );
}

export const Route = createFileRoute("/_chat/$threadId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  search: {
    middlewares: [retainSearchParams<DiffRouteSearch>(["diff"])],
  },
  component: ChatThreadRouteView,
});
