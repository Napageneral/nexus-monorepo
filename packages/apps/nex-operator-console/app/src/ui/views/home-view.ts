import { html, nothing, type TemplateResult } from "lit";
import type { IdentityMergeCandidate } from "../controllers/identity.ts";

export type HomeViewProps = {
  connected: boolean;
  lastError: string | null;
  overdueItems: number;
  dueNowItems: number;
  aclPendingCount: number;
  integrationWarnings: number;
  scheduleCount: number;
  memoryReviewCount: number;
  mergeCandidates: IdentityMergeCandidate[];
  mergeBusyId: string | null;
  onOpenIdentity: () => void;
  onOpenIdentityMerges: () => void;
  onOpenOperations: () => void;
  onOpenIntegrations: () => void;
  onOpenMemory: () => void;
  onOpenConsole: () => void;
  onOpenSystem: () => void;
  onResolveMerge: (id: string, status: "approved" | "rejected") => void;
};

function renderActionCard(
  title: string,
  value: string | number,
  description: string,
  actionLabel: string,
  onClick: () => void,
  tone: "default" | "warn" | "danger" = "default",
): TemplateResult {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <div class="card-title">${title}</div>
          <div class="muted" style="margin-top: 6px;">${description}</div>
        </div>
        <div class="mono ${tone === "danger" ? "danger" : tone === "warn" ? "warn" : ""}" style="font-size: 24px;">
          ${value}
        </div>
      </div>
      <div class="row" style="margin-top: 14px;">
        <button class="btn btn--sm" @click=${onClick}>${actionLabel}</button>
      </div>
    </section>
  `;
}

type WorklistItem = {
  title: string;
  value: number;
  description: string;
  actionLabel: string;
  onClick: () => void;
  tone: "default" | "warn" | "danger";
};

function worklistItem(item: WorklistItem): WorklistItem {
  return item;
}

export function renderHomeView(props: HomeViewProps): TemplateResult {
  const hasRuntimeIssue = !props.connected || Boolean(props.lastError);
  const topMerges = props.mergeCandidates.slice(0, 3);
  const worklistItems: WorklistItem[] = [
    worklistItem({
      title: "Merge queue needs review",
      value: props.mergeCandidates.length,
      description:
        props.mergeCandidates.length > 0
          ? "Identity merge proposals are waiting for operator approval."
          : "No merge proposals are waiting right now.",
      actionLabel: "Open Merge Queue",
      onClick: props.onOpenIdentityMerges,
      tone: props.mergeCandidates.length > 0 ? "warn" : "default",
    }),
    worklistItem({
      title: "Pending access requests",
      value: props.aclPendingCount,
      description:
        props.aclPendingCount > 0
          ? "Permission requests are blocked on operator action."
          : "No pending permission requests.",
      actionLabel: "Open Identity",
      onClick: props.onOpenIdentity,
      tone: props.aclPendingCount > 0 ? "warn" : "default",
    }),
    worklistItem({
      title: "Execution pressure",
      value: props.overdueItems + props.dueNowItems,
      description:
        props.overdueItems > 0
          ? "Overdue work exists and should be triaged."
          : props.dueNowItems > 0
            ? "Due-now work should be reviewed."
            : "No immediate work pressure.",
      actionLabel: "Open Operations",
      onClick: props.onOpenOperations,
      tone: props.overdueItems > 0 ? "danger" : props.dueNowItems > 0 ? "warn" : "default",
    }),
    worklistItem({
      title: "Integration warnings",
      value: props.integrationWarnings,
      description:
        props.integrationWarnings > 0
          ? "Adapters or connections need attention."
          : "Integrations look healthy.",
      actionLabel: "Open Integrations",
      onClick: props.onOpenIntegrations,
      tone: props.integrationWarnings > 0 ? "warn" : "default",
    }),
    worklistItem({
      title: "Memory review",
      value: props.memoryReviewCount,
      description:
        props.memoryReviewCount > 0
          ? "Recent memory extraction runs are available for review."
          : "No recent memory review workload.",
      actionLabel: "Open Memory",
      onClick: props.onOpenMemory,
      tone: props.memoryReviewCount > 0 ? "default" : "default",
    }),
  ].toSorted((a, b) => {
    const rank = { danger: 2, warn: 1, default: 0 } as const;
    const toneDelta = rank[b.tone] - rank[a.tone];
    if (toneDelta !== 0) {
      return toneDelta;
    }
    return Number(b.value) - Number(a.value);
  });

  return html`
    <section class="card">
      <div class="card-title">Operator Inbox</div>
      <div class="card-sub">
        Focus the operator on identity issues, execution failures, integration warnings, and review work.
      </div>
      ${
        hasRuntimeIssue
          ? html`
              <div class="callout danger" style="margin-top: 14px;">
                ${props.lastError ?? "Runtime is not connected."}
                <div style="margin-top: 8px;">
                  <button class="btn btn--sm" @click=${props.onOpenSystem}>Open System</button>
                </div>
              </div>
            `
          : html`
              <div class="callout" style="margin-top: 14px">
                Runtime is connected. Use this page as the operator worklist, not as a passive dashboard.
              </div>
            `
      }
    </section>

    <section class="card" style="margin-top: 16px;">
      <div class="card-title">Ranked Worklist</div>
      <div class="card-sub">
        Triage the highest-value operator actions first, then drill into the owning domain.
      </div>
      <div class="stack" style="margin-top: 14px; gap: 12px;">
        ${worklistItems.map((item) =>
          renderActionCard(
            item.title,
            item.value,
            item.description,
            item.actionLabel,
            item.onClick,
            item.tone,
          ),
        )}
      </div>
    </section>

    <section class="card" style="margin-top: 16px;">
      <div class="row" style="justify-content: space-between; align-items: flex-start; gap: 16px;">
        <div>
          <div class="card-title">Merge Queue Preview</div>
          <div class="card-sub">
            Proposed cross-adapter identity links should be reviewed here before they accumulate.
          </div>
        </div>
        <button class="btn btn--sm" @click=${props.onOpenIdentityMerges}>Open Merge Queue</button>
      </div>
      ${
        topMerges.length === 0
          ? html`
              <div class="muted" style="margin-top: 12px">No pending merge candidates.</div>
            `
          : html`
              <div class="stack" style="margin-top: 14px; gap: 12px;">
                ${topMerges.map((candidate) => {
                  const busy = props.mergeBusyId === candidate.id;
                  const confidence = candidate.confidence ?? 0;
                  return html`
                    <div class="card" style="border-style: solid;">
                      <div class="row" style="justify-content: space-between; gap: 16px; align-items: flex-start;">
                        <div style="flex: 1 1 auto;">
                          <div class="row" style="align-items: center; gap: 8px; flex-wrap: wrap;">
                            <div class="card-title" style="margin: 0;">${candidate.source_entity_id || "Unknown source"}</div>
                            <span class="muted">→</span>
                            <div class="card-title" style="margin: 0;">${candidate.target_entity_id || "Unknown target"}</div>
                            <span class="pill ${confidence >= 90 ? "ok" : confidence >= 70 ? "warn" : "danger"}">
                              ${confidence}% confidence
                            </span>
                          </div>
                          <div class="muted" style="margin-top: 8px;">
                            ${candidate.reason || "No merge rationale provided."}
                          </div>
                        </div>
                        <div class="row" style="gap: 8px; flex-wrap: wrap; justify-content: flex-end;">
                          <button
                            class="btn btn--sm"
                            ?disabled=${busy}
                            @click=${() => props.onResolveMerge(candidate.id, "approved")}
                          >
                            ${busy ? "Working…" : "Approve"}
                          </button>
                          <button
                            class="btn btn--sm btn--ghost"
                            ?disabled=${busy}
                            @click=${() => props.onResolveMerge(candidate.id, "rejected")}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  `;
                })}
              </div>
            `
      }
    </section>

    <section class="grid grid-cols-3" style="margin-top: 12px;">
      ${renderActionCard(
        "Schedules",
        props.scheduleCount,
        "Review scheduled work and recent run evidence.",
        "Inspect Schedules",
        props.onOpenOperations,
      )}
      ${renderActionCard(
        "Console",
        "Live",
        "Talk to Nex when needed, but keep the operator model conversation-secondary.",
        "Open Console",
        props.onOpenConsole,
      )}
      ${renderActionCard(
        "System",
        hasRuntimeIssue ? "Attention" : "Healthy",
        "Inspect runtime health, sessions, logs, and lower-level controls.",
        "Open System",
        props.onOpenSystem,
        hasRuntimeIssue ? "danger" : "default",
      )}
    </section>
  `;
}
