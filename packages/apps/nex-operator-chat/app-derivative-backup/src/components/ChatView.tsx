import {
  Link2Icon,
  MessageSquareQuoteIcon,
  RouteIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useLocation } from "@tanstack/react-router";
import { useNexChatActions, useNexChatState } from "../chat-runtime";
import { resolveTopLevelLane } from "./ChatView.logic";
import { ChatHeader } from "./chat/ChatHeader";
import { MessagesTimeline } from "./chat/MessagesTimeline";
import { ProviderModelPicker, type ProviderKind } from "./chat/ProviderModelPicker";
import { ComposerPrimaryActions } from "./chat/ComposerPrimaryActions";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Separator } from "./ui/separator";
import { SidebarTrigger } from "./ui/sidebar";
import { Textarea } from "./ui/textarea";
import type { ChatApprovalDecision, ChatLaneAction } from "../types";

const MODEL_OPTIONS: Record<ProviderKind, ReadonlyArray<{ slug: string; name: string }>> = {
  codex: [
    { slug: "gpt-5-codex", name: "gpt-5-codex" },
    { slug: "gpt-5.4", name: "gpt-5.4" },
  ],
  claudeAgent: [{ slug: "claude-sonnet-4.5", name: "claude-sonnet-4.5" }],
  cursor: [{ slug: "cursor-agent", name: "cursor-agent" }],
};

export function ChatView() {
  const location = useLocation();
  const search = location.search as Record<string, unknown>;
  const routeLaneId =
    typeof search.lane === "string" && search.lane.trim().length > 0 ? search.lane.trim() : null;
  const state = useNexChatState();
  const actions = useNexChatActions();
  const selectedLaneId = routeLaneId ?? state.selectedLaneId;
  const laneDetail = selectedLaneId ? state.laneDetailsById[selectedLaneId] ?? null : null;
  const [draft, setDraft] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderKind>("codex");
  const [selectedModel, setSelectedModel] = useState("gpt-5-codex");
  const [sending, setSending] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [updatingDelivery, setUpdatingDelivery] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<{
    approvalId: string;
    decision: ChatApprovalDecision;
  } | null>(null);

  const lanesById = useMemo(
    () => Object.fromEntries(state.lanes.map((lane) => [lane.lane_id, lane])),
    [state.lanes],
  );

  const topLevelLane = useMemo(
    () => resolveTopLevelLane(laneDetail?.lane ?? null, lanesById),
    [laneDetail?.lane, lanesById],
  );

  const deliveryTargets = laneDetail?.conversation_context?.delivery_targets ?? [];
  const deliverySummary = deliveryTargets.find((target) => target.selected) ?? null;
  const pendingApprovals =
    laneDetail?.approvals.filter((approval) => approval.status === "pending") ?? [];
  const laneActions = laneDetail?.actions ?? [];

  if (!laneDetail) {
    return (
      <section className="flex h-full min-h-0 flex-col bg-background text-foreground" data-testid="chat-view-empty">
        <header className="drag-region flex h-[52px] shrink-0 items-center justify-between border-b border-border px-3 sm:px-5">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="size-7 shrink-0 md:hidden" />
            <span className="text-sm font-medium text-foreground">Global chat workspace</span>
          </div>
          <Badge variant={state.status === "ready" ? "success" : "warning"}>{state.status}</Badge>
        </header>
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
          <div className="w-full max-w-xl rounded-2xl border border-border/70 bg-card/90 p-6 shadow-sm">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              Nex Chat
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">Select a lane</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Pick a manager lane or worker lane from the preserved left rail to open the chat workspace.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const handleSend = async () => {
    if (!laneDetail.lane.can_send || !draft.trim()) {
      return;
    }
    setSending(true);
    setActionError(null);
    try {
      await actions.sendMessage(laneDetail.lane.lane_id, draft);
      setDraft("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };

  const handleAbort = async () => {
    if (!laneDetail.lane.can_abort) {
      return;
    }
    setAborting(true);
    setActionError(null);
    try {
      await actions.abortLane(laneDetail.lane.lane_id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setAborting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleSend();
  };

  const handleDeliveryChange = async (targetId: string) => {
    if (!targetId) {
      return;
    }
    setUpdatingDelivery(true);
    setActionError(null);
    try {
      await actions.selectDeliveryTarget(laneDetail.lane.lane_id, targetId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingDelivery(false);
    }
  };

  const handleApprovalResponse = async (
    approvalId: string,
    decision: ChatApprovalDecision,
  ) => {
    setApprovalAction({ approvalId, decision });
    setActionError(null);
    try {
      await actions.respondToApproval(laneDetail.lane.lane_id, approvalId, decision);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setApprovalAction(null);
    }
  };

  const handleRunLaneAction = async (action: ChatLaneAction) => {
    const defaultPrompt = action.default_prompt?.trim() ?? "";
    if (action.invocation_mode === "prefill" || action.requires_input) {
      setDraft(defaultPrompt);
      return;
    }
    try {
      await actions.invokeLaneAction(laneDetail.lane.lane_id, action.action_id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const laneProviderOptions = [
    { provider: "codex" as const, status: "ready" as const },
    { provider: "claudeAgent" as const, status: "ready" as const },
    { provider: "cursor" as const, status: "ready" as const },
  ];

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-background text-foreground"
      data-lane-id={laneDetail.lane.lane_id}
      data-testid="chat-view"
    >
      <header className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-3 sm:px-5">
        <ChatHeader
          groupTitle={
            topLevelLane && topLevelLane.lane_id !== laneDetail.lane.lane_id
              ? topLevelLane.title
              : null
          }
          laneActions={laneActions}
          laneSubtitle={laneDetail.lane.subtitle}
          laneTitle={laneDetail.lane.title}
          onAddLaneAction={(input) => actions.createLaneAction(laneDetail.lane.lane_id, input)}
          onDeleteLaneAction={(actionId) => actions.deleteLaneAction(laneDetail.lane.lane_id, actionId)}
          onRunLaneAction={(action) => void handleRunLaneAction(action)}
          onToggleContextPanel={() => setContextPanelOpen((current) => !current)}
          onUpdateLaneAction={(actionId, input) =>
            actions.updateLaneAction(laneDetail.lane.lane_id, actionId, input)
          }
          contextPanelOpen={contextPanelOpen}
          preferredActionId={laneActions[0]?.action_id ?? null}
          runState={laneDetail.lane.run_state}
        />
      </header>

      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-5 sm:py-4">
              <MessagesTimeline laneDetail={laneDetail} />
            </div>
          </div>

          <div className="px-3 pt-1.5 pb-3 sm:px-5 sm:pt-2 sm:pb-4">
            <form
              className="mx-auto w-full min-w-0 max-w-208"
              data-chat-composer-form="true"
              onSubmit={handleSubmit}
            >
              <div className="group rounded-[22px] bg-gradient-to-r from-primary/35 via-primary/12 to-primary/35 p-px transition-colors duration-200">
                <div className="rounded-[20px] border border-border bg-card transition-colors duration-200 has-focus-visible:border-ring/45">
                  {pendingApprovals.length > 0 ? (
                    <div className="rounded-t-[19px] border-b border-border/65 bg-muted/20 px-4 py-3.5 sm:px-5 sm:py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="uppercase text-sm tracking-[0.2em]">Pending Approval</span>
                        <span className="text-sm font-medium">
                          {pendingApprovals[0]?.summary ??
                            pendingApprovals[0]?.request_type ??
                            pendingApprovals[0]?.id}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  <div
                    className={`relative px-3 pb-2 sm:px-4 ${
                      pendingApprovals.length > 0 ? "pt-2.5 sm:pt-3" : "pt-3.5 sm:pt-4"
                    }`}
                  >
                    <Textarea
                      className="min-h-28 resize-none border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
                      data-testid="chat-composer-input"
                      disabled={!laneDetail.lane.can_send || sending}
                      onChange={(event) => setDraft(event.currentTarget.value)}
                      placeholder={`Ask ${laneDetail.lane.title} anything`}
                      rows={4}
                      value={draft}
                    />
                  </div>

                  <div
                    className="flex min-w-0 flex-nowrap items-center justify-between gap-2 overflow-hidden px-2.5 pb-2.5 sm:px-3 sm:pb-3"
                    data-chat-composer-footer="true"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:min-w-max sm:overflow-visible">
                      <ProviderModelPicker
                        compact={false}
                        disabled
                        lockedProvider={null}
                        model={selectedModel}
                        modelOptionsByProvider={MODEL_OPTIONS}
                        onProviderModelChange={(provider, model) => {
                          setSelectedProvider(provider);
                          setSelectedModel(model);
                        }}
                        provider={selectedProvider}
                        providers={laneProviderOptions}
                      />
                      {deliverySummary ? (
                        <>
                          <Separator
                            orientation="vertical"
                            className="mx-0.5 hidden h-4 sm:block"
                          />
                          <Badge size="sm" variant="outline">
                            {deliverySummary.channel}
                          </Badge>
                        </>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2" data-chat-composer-actions="right">
                      {laneDetail.lane.can_abort ? (
                        <Button
                          data-testid="chat-abort-button"
                          disabled={aborting}
                          onClick={() => void handleAbort()}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {aborting ? "Stopping..." : "Stop"}
                        </Button>
                      ) : null}
                      <div data-testid="chat-send-button">
                        <ComposerPrimaryActions
                          compact={false}
                          hasSendableContent={Boolean(draft.trim())}
                          isConnecting={state.status === "loading" || state.status === "recovering"}
                          isRunning={
                            laneDetail.lane.run_state === "running" ||
                            laneDetail.lane.run_state === "queued"
                          }
                          isSendBusy={sending}
                          onInterrupt={() => void handleAbort()}
                          onPreviousPendingQuestion={() => undefined}
                          pendingAction={null}
                          promptHasText={Boolean(draft.trim())}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {actionError || state.lastError ? (
                <p className="mt-3 text-destructive text-sm">{actionError ?? state.lastError}</p>
              ) : null}
            </form>
          </div>
        </div>

        {contextPanelOpen ? (
          <aside className="hidden min-h-0 w-[320px] shrink-0 flex-col border-l border-border bg-card/35 xl:flex">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-4">
              <Card data-testid="chat-runtime-panel">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Lane workspace</CardTitle>
                  <CardDescription>
                    This lane reads directly from the Nex session ledger and linked conversation
                    projection.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="flex items-start gap-2 rounded-xl border bg-muted/20 px-3 py-3">
                    <RouteIcon className="mt-0.5 size-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">Session continuity</p>
                      <p className="text-muted-foreground text-xs">
                        {laneDetail.lane.session_id ?? "No session bound yet"}
                      </p>
                    </div>
                  </div>
                  <div
                    className="flex items-start gap-2 rounded-xl border bg-muted/20 px-3 py-3"
                    data-testid="chat-delivery-panel"
                  >
                    <MessageSquareQuoteIcon className="mt-0.5 size-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">Selected delivery</p>
                      <p className="text-muted-foreground text-xs">
                        {deliverySummary ? deliverySummary.label : "No delivery target selected yet."}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-xl border bg-muted/20 px-3 py-3">
                    <ShieldCheckIcon className="mt-0.5 size-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">Runtime state</p>
                      <p className="text-muted-foreground text-xs">
                        {laneDetail.lane.run_state.replace("_", " ")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="chat-approvals-panel">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Approvals</CardTitle>
                  <CardDescription>
                    Pending and resolved ACL decisions attached to this lane.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {laneDetail.approvals.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No approvals for this lane.</p>
                  ) : (
                    laneDetail.approvals.map((approval) => (
                      <article
                        className="rounded-2xl border px-4 py-3"
                        data-approval-id={approval.id}
                        data-testid="chat-approval"
                        key={approval.id}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm">
                            {approval.summary ?? approval.request_type ?? approval.id}
                          </p>
                          <Badge
                            size="sm"
                            variant={
                              approval.status === "pending"
                                ? "warning"
                                : approval.status === "approved"
                                  ? "success"
                                  : approval.status === "denied"
                                    ? "error"
                                    : "outline"
                            }
                          >
                            {approval.status}
                          </Badge>
                        </div>
                        {approval.request_type ? (
                          <p className="mt-1 text-muted-foreground text-xs">
                            {approval.request_type}
                          </p>
                        ) : null}
                        {approval.status === "pending" ? (
                          <div className="mt-3 flex gap-2">
                            <Button
                              data-testid="chat-approval-approve"
                              disabled={approvalAction?.approvalId === approval.id}
                              onClick={() => void handleApprovalResponse(approval.id, "approve")}
                              size="sm"
                              type="button"
                            >
                              {approvalAction?.approvalId === approval.id &&
                              approvalAction.decision === "approve"
                                ? "Approving..."
                                : "Approve"}
                            </Button>
                            <Button
                              data-testid="chat-approval-deny"
                              disabled={approvalAction?.approvalId === approval.id}
                              onClick={() => void handleApprovalResponse(approval.id, "deny")}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              {approvalAction?.approvalId === approval.id &&
                              approvalAction.decision === "deny"
                                ? "Denying..."
                                : "Deny"}
                            </Button>
                          </div>
                        ) : null}
                      </article>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card data-testid="chat-conversation-panel">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Linked public context</CardTitle>
                  <CardDescription>
                    Canonical records from linked external conversations.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {deliveryTargets.length > 0 ? (
                    <label
                      className="flex flex-col gap-2 text-sm"
                      data-testid="chat-delivery-panel"
                    >
                      <span className="font-medium">Selected delivery target</span>
                      <select
                        className="rounded-xl border bg-background px-3 py-2 text-sm"
                        data-testid="chat-delivery-select"
                        disabled={updatingDelivery}
                        onChange={(event) => void handleDeliveryChange(event.currentTarget.value)}
                        value={deliverySummary?.target_id ?? ""}
                      >
                        {deliveryTargets.map((target) => (
                          <option key={target.target_id} value={target.target_id}>
                            {target.label} via {target.channel}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p className="text-muted-foreground text-sm">No linked delivery targets.</p>
                  )}
                  {laneDetail.conversation_context?.records.length ? (
                    laneDetail.conversation_context.records.map((record) => (
                      <article
                        className="rounded-2xl border border-border/70 bg-card/60 px-3 py-3"
                        data-testid="chat-conversation-record"
                        key={record.id}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <Badge size="sm" variant="outline">
                            {record.channel}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(record.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6">{record.text}</p>
                        <p className="mt-1 text-muted-foreground text-xs">
                          {record.sender_entity_id ?? "unknown"} to{" "}
                          {record.receiver_entity_id ?? "unknown"}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      No linked public conversation records for this lane.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
