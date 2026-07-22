import "./styles.css";
import { compactDate, lifecycleLabel, queueSections, type LoopRow } from "./view-model.js";

type Row = Record<string, unknown>;
type RuntimeBridge = {
  rpcCall(method: string, params: Row, options?: Row): Promise<unknown>;
};

declare global {
  interface Window {
    NexusRuntimeBridge?: RuntimeBridge;
  }
}

type WorkspaceSummary = {
  workspace_key: string;
  state: string;
  history_count: number;
  canonical_entity_id?: string;
  revision_sha256?: string;
  reviewed_at?: string;
  open_loop_count?: number;
  source_record_count?: number;
};

type NativeMessage = {
  source_record_id: string;
  provider: string;
  direction: "inbound" | "outbound";
  observed_at: string;
  summary: string;
  attachment_count: number;
};

type NativeThread = {
  native_thread_key: string;
  provider: string;
  provider_thread_id: string;
  latest_message_at: string;
  unclassified_record_count: number;
  messages: NativeMessage[];
};

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Partner Desk root is missing");

let workspaces: WorkspaceSummary[] = [];
let selectedWorkspace = "";
let selectedLoop = "";
let selectedThread = "";
let current: Row | null = null;
let busy = false;
let notice = "";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function asRow(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function array<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

async function bridge(): Promise<RuntimeBridge> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (window.NexusRuntimeBridge?.rpcCall) return window.NexusRuntimeBridge;
    await new Promise((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error("Nex runtime bridge is unavailable");
}

async function call(method: string, params: Row): Promise<Row> {
  const runtime = await bridge();
  return asRow(await runtime.rpcCall(method, params, { clientVersion: "partner-desk-0.1.0" }));
}

function workspaceTitle(value: string): string {
  return value.split(/[-_:]+/u).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function statusTone(lifecycle: string): string {
  if (lifecycle === "waiting_on_moonsleep" || lifecycle === "blocked") return "urgent";
  if (lifecycle === "waiting_on_partner") return "waiting";
  if (lifecycle === "resolved" || lifecycle === "dismissed") return "quiet";
  return "open";
}

function renderShell(content: string): void {
  root.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand-lockup">
          <div class="eyebrow">MoonSleep operations</div>
          <div class="brand-row"><span class="brand-mark" aria-hidden="true">M</span><h1>Partner Desk</h1></div>
        </div>
        <div class="source-status" aria-label="Source status">
          <span><i class="dot healthy"></i> Alibaba evidence</span>
          <span><i class="dot healthy"></i> Gmail substrate</span>
          <span><i class="dot locked"></i> Replies locked</span>
        </div>
      </header>
      ${notice ? `<div class="notice" role="status">${escapeHtml(notice)}</div>` : ""}
      ${content}
    </div>`;
}

function renderLoading(message: string): void {
  renderShell(`<main class="center-state"><div class="spinner" aria-hidden="true"></div><h2>${escapeHtml(message)}</h2><p>Reading immutable Nex records and review receipts.</p></main>`);
}

function renderError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  renderShell(`<main class="center-state error-state"><div class="error-glyph">!</div><h2>Partner Desk could not load</h2><p>${escapeHtml(message)}</p><button class="primary" data-action="retry">Try again</button></main>`);
}

function renderEmpty(): void {
  renderShell(`
    <main class="empty-layout">
      <section class="empty-copy">
        <div class="eyebrow">Evidence is ready</div>
        <h2>No reviewed partner workspace yet.</h2>
        <p>Alibaba conversations can be ingested without creating operational tasks. A workspace appears here only after an operator confirms identity, relationship, coverage, and at least one independent open loop.</p>
        <div class="empty-rules">
          <span>Provider threads remain native</span>
          <span>Model suggestions stay proposed</span>
          <span>Closure requires exact evidence</span>
        </div>
      </section>
    </main>`);
}

function loopCard(loop: LoopRow, active: boolean): string {
  return `
    <button class="loop-card ${active ? "active" : ""}" data-loop-id="${escapeHtml(loop.open_loop_id)}">
      <span class="status-pill ${statusTone(loop.lifecycle)}">${escapeHtml(lifecycleLabel(loop.lifecycle))}</span>
      <strong>${escapeHtml(loop.title)}</strong>
      <span class="loop-summary">${escapeHtml(loop.summary)}</span>
      <span class="loop-meta">${escapeHtml(loop.owner || "Unassigned")} · ${escapeHtml(compactDate(loop.follow_up_at))}</span>
    </button>`;
}

function messageRow(message: NativeMessage): string {
  const initials = message.direction === "outbound" ? "MS" : "P";
  return `
    <article class="message ${message.direction}">
      <div class="avatar" aria-hidden="true">${initials}</div>
      <div class="message-body">
        <div class="message-heading"><strong>${message.direction === "outbound" ? "MoonSleep" : "Partner"}</strong><time>${escapeHtml(compactDate(message.observed_at))}</time></div>
        <p>${escapeHtml(message.summary)}</p>
        <div class="message-foot"><code>${escapeHtml(message.source_record_id)}</code>${message.attachment_count ? `<span>${message.attachment_count} attachment${message.attachment_count === 1 ? "" : "s"}</span>` : ""}</div>
      </div>
    </article>`;
}

function renderWorkspace(): void {
  if (!current) return renderEmpty();
  if (current.state === "review_conflict") {
    const heads = array<string>(current.head_revisions);
    return renderShell(`<main class="center-state error-state"><div class="error-glyph">!</div><h2>Review conflict requires reconciliation</h2><p>${heads.length} immutable heads exist for ${escapeHtml(selectedWorkspace)}. Partner Desk will not choose one automatically.</p></main>`);
  }
  const projection = asRow(current.projection);
  const review = asRow(current.review);
  const assertions = asRow(current.assertions);
  const sections = queueSections(projection);
  const loops = array<LoopRow>(projection.reviewed_loops);
  const threads = array<NativeThread>(projection.native_threads);
  if (!selectedLoop || !loops.some((loop) => loop.open_loop_id === selectedLoop)) selectedLoop = loops[0]?.open_loop_id ?? "";
  if (!selectedThread || !threads.some((thread) => thread.native_thread_key === selectedThread)) selectedThread = threads[0]?.native_thread_key ?? "";
  const loop = loops.find((candidate) => candidate.open_loop_id === selectedLoop);
  const thread = threads.find((candidate) => candidate.native_thread_key === selectedThread);
  const activeSummary = workspaces.find((entry) => entry.workspace_key === selectedWorkspace);

  const partnerRail = workspaces.map((workspace) => `
    <button class="partner-row ${workspace.workspace_key === selectedWorkspace ? "active" : ""}" data-workspace="${escapeHtml(workspace.workspace_key)}">
      <span class="partner-monogram">${escapeHtml(workspaceTitle(workspace.workspace_key).slice(0, 2).toUpperCase())}</span>
      <span><strong>${escapeHtml(workspaceTitle(workspace.workspace_key))}</strong><small>${workspace.open_loop_count ?? 0} loops · ${workspace.source_record_count ?? 0} evidence</small></span>
    </button>`).join("");

  const queue = sections.slice(0, 2).map((section) => `
    <section class="queue-group">
      <div class="section-heading"><h3>${escapeHtml(section.label)}</h3><span>${section.loops.length}</span></div>
      ${section.loops.length ? section.loops.map((entry) => loopCard(entry, entry.open_loop_id === selectedLoop)).join("") : `<p class="quiet-copy">Nothing here.</p>`}
    </section>`).join("");

  const threadTabs = threads.map((entry) => `
    <button class="thread-tab ${entry.native_thread_key === selectedThread ? "active" : ""}" data-thread="${escapeHtml(entry.native_thread_key)}">
      <span class="provider-badge">${escapeHtml(entry.provider.slice(0, 1).toUpperCase())}</span>
      <span>${escapeHtml(entry.provider)}<small>${entry.messages.length} messages</small></span>
    </button>`).join("");

  const lifecycleOptions = ["open", "waiting_on_partner", "waiting_on_moonsleep", "blocked", "resolved", "dismissed"]
    .map((value) => `<option value="${value}" ${loop?.lifecycle === value ? "selected" : ""}>${escapeHtml(lifecycleLabel(value))}</option>`).join("");

  renderShell(`
    <main class="desk-grid">
      <aside class="partner-panel" aria-label="Partner workspaces">
        <div class="panel-heading"><span>Partners</span><strong>${workspaces.length}</strong></div>
        <div class="partner-list">${partnerRail}</div>
      </aside>
      <aside class="queue-panel" aria-label="Open loop queues">
        <div class="workspace-title"><div class="eyebrow">Current workspace</div><h2>${escapeHtml(workspaceTitle(selectedWorkspace))}</h2><p>${escapeHtml(activeSummary?.canonical_entity_id ?? "")}</p></div>
        ${queue}
      </aside>
      <section class="conversation-panel">
        <div class="conversation-head">
          <div><div class="eyebrow">Native evidence</div><h2>Conversation history</h2></div>
          <span class="receipt">Revision ${escapeHtml(String(review.revision_sha256 ?? "").slice(0, 12))}</span>
        </div>
        <div class="thread-tabs">${threadTabs || `<span class="quiet-copy">No native threads in this review.</span>`}</div>
        <div class="message-stream">${thread?.messages.map(messageRow).join("") || `<div class="quiet-copy padded">No messages in this thread.</div>`}</div>
      </section>
      <aside class="detail-panel" aria-label="Selected open loop">
        ${loop ? `
          <div class="detail-head"><span class="status-pill ${statusTone(loop.lifecycle)}">${escapeHtml(lifecycleLabel(loop.lifecycle))}</span><h2>${escapeHtml(loop.title)}</h2><p>${escapeHtml(loop.summary)}</p></div>
          <dl class="fact-list">
            <div><dt>Owner</dt><dd>${escapeHtml(loop.owner || "Unassigned")}</dd></div>
            <div><dt>Follow-up</dt><dd>${escapeHtml(compactDate(loop.follow_up_at))}</dd></div>
            <div><dt>Evidence</dt><dd>${loop.evidence_source_record_ids.length} exact records</dd></div>
            <div><dt>Labels</dt><dd>${loop.labels.map((label) => `<span class="label">${escapeHtml(label)}</span>`).join(" ") || "None"}</dd></div>
          </dl>
          <form class="review-form" data-review-form>
            <label for="lifecycle">Reviewed lifecycle</label>
            <select id="lifecycle" name="lifecycle">${lifecycleOptions}</select>
            <label for="closure">Closure evidence record IDs</label>
            <textarea id="closure" name="closure" rows="3" placeholder="Required only when resolved">${escapeHtml(loop.closure_source_record_ids.join("\n"))}</textarea>
            <label for="note">Review note</label>
            <textarea id="note" name="note" rows="3" placeholder="Why this changed"></textarea>
            <button class="primary" type="submit" ${busy ? "disabled" : ""}>${busy ? "Saving…" : "Commit reviewed revision"}</button>
            <p class="authority-note">This changes Partner Desk state only. It cannot message Alibaba or Gmail.</p>
          </form>
        ` : `<div class="quiet-copy padded">Select an open loop.</div>`}
      </aside>
    </main>`);
}

async function loadCurrent(): Promise<void> {
  if (!selectedWorkspace) return renderEmpty();
  renderLoading("Loading partner workspace");
  current = await call("moonsleep-partner-desk.review.current", { workspace_key: selectedWorkspace });
  renderWorkspace();
}

async function loadAll(): Promise<void> {
  renderLoading("Opening Partner Desk");
  const index = await call("moonsleep-partner-desk.review.workspaces", {});
  workspaces = array<WorkspaceSummary>(index.workspaces);
  if (!selectedWorkspace || !workspaces.some((entry) => entry.workspace_key === selectedWorkspace)) {
    selectedWorkspace = new URL(location.href).searchParams.get("workspace") || workspaces[0]?.workspace_key || "";
  }
  await loadCurrent();
}

async function commitLifecycle(form: HTMLFormElement): Promise<void> {
  if (!current || !selectedLoop || busy) return;
  const projection = asRow(current.projection);
  const review = asRow(current.review);
  const assertions = asRow(current.assertions);
  const loops = structuredClone(array<Row>(assertions.open_loop_assertions));
  const selected = loops.find((entry) => entry.open_loop_id === selectedLoop);
  if (!selected) throw new Error("selected loop is not present in the current review");
  const data = new FormData(form);
  const lifecycle = String(data.get("lifecycle") ?? "");
  const closure = String(data.get("closure") ?? "").split(/[\n,]+/u).map((value) => value.trim()).filter(Boolean);
  if (lifecycle === "resolved" && closure.length === 0) throw new Error("Resolved loops require at least one exact closure evidence record ID");
  if (lifecycle !== "resolved" && closure.length > 0) throw new Error("Closure evidence is allowed only for a resolved loop");
  selected.lifecycle = lifecycle;
  selected.closure_source_record_ids = closure;
  busy = true;
  notice = "";
  renderWorkspace();
  try {
    await call("moonsleep-partner-desk.review.commit", {
      workspace_key: review.workspace_key,
      canonical_entity_id: review.canonical_entity_id,
      record_ids: review.record_ids,
      identity_resolutions: assertions.identity_resolutions,
      workspace_assertions: assertions.workspace_assertions,
      open_loop_assertions: loops,
      source_coverage_assertions: assertions.source_coverage_assertions,
      review_note: String(data.get("note") ?? "").trim() || `Lifecycle updated to ${lifecycle}`,
      review_idempotency_key: `partner-desk-ui-${crypto.randomUUID()}`,
      previous_revision_sha256: review.revision_sha256,
    });
    notice = "Reviewed revision committed to Nex.";
    current = await call("moonsleep-partner-desk.review.current", { workspace_key: selectedWorkspace });
  } finally {
    busy = false;
    renderWorkspace();
  }
  void projection;
}

root.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const retry = target.closest<HTMLElement>("[data-action='retry']");
  if (retry) void loadAll().catch(renderError);
  const workspace = target.closest<HTMLElement>("[data-workspace]")?.dataset.workspace;
  if (workspace && workspace !== selectedWorkspace) {
    selectedWorkspace = workspace;
    selectedLoop = "";
    selectedThread = "";
    const url = new URL(location.href);
    url.searchParams.set("workspace", workspace);
    history.replaceState(null, "", url);
    void loadCurrent().catch(renderError);
  }
  const loop = target.closest<HTMLElement>("[data-loop-id]")?.dataset.loopId;
  if (loop) {
    selectedLoop = loop;
    renderWorkspace();
  }
  const thread = target.closest<HTMLElement>("[data-thread]")?.dataset.thread;
  if (thread) {
    selectedThread = thread;
    renderWorkspace();
  }
});

root.addEventListener("submit", (event) => {
  const form = event.target as HTMLFormElement;
  if (!form.matches("[data-review-form]")) return;
  event.preventDefault();
  void commitLifecycle(form).catch((error) => {
    busy = false;
    notice = error instanceof Error ? error.message : String(error);
    renderWorkspace();
  });
});

void loadAll().catch(renderError);
