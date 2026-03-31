const state = {
  loading: false,
  scopes: [],
  scopeId: "",
  bindings: [],
  summary: null,
  adFacts: [],
  funnel: null,
  outcomes: [],
  selectedOutcomeId: "",
  selectedOutcome: null,
  pipeline: null,
};

function qs(id) {
  return document.getElementById(id);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function text(value, fallback = "—") {
  if (value == null) return fallback;
  const str = String(value).trim();
  return str ? str : fallback;
}

function formatNumber(value, options = {}) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }
  return new Intl.NumberFormat(undefined, options).format(numeric);
}

function formatCurrency(value) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatDateTime(value) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(numeric));
}

function setStatus(message, isError = false) {
  const el = qs("statusLine");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", Boolean(isError));
}

async function callRuntime(method, params = {}) {
  if (window.NexusRuntimeBridge && typeof window.NexusRuntimeBridge.rpcCall === "function") {
    return window.NexusRuntimeBridge.rpcCall(method, params);
  }

  const response = await fetch(`/runtime/operations/${encodeURIComponent(method)}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.ok !== true) {
    const errorBody = asObject(payload);
    const message =
      errorBody && asObject(errorBody.error) && typeof errorBody.error.message === "string"
        ? errorBody.error.message
        : `${method} failed`;
    throw new Error(message);
  }
  return payload.payload;
}

function syncScopeSelect() {
  const select = qs("scopeSelect");
  if (!select) return;
  const current = state.scopeId;
  select.innerHTML = "";
  for (const scope of state.scopes) {
    const option = document.createElement("option");
    option.value = scope.scopeId;
    option.textContent = scope.label;
    option.selected = scope.scopeId === current;
    select.appendChild(option);
  }
  select.disabled = state.loading || state.scopes.length === 0;
}

function renderTotals() {
  const host = qs("totalsGrid");
  if (!host) return;
  const totals = asObject(state.summary)?.totals || {};
  const cards = [
    ["Spend", formatCurrency(totals.spend)],
    ["Impressions", formatNumber(totals.impressions)],
    ["Clicks", formatNumber(totals.clicks)],
    ["Landing Page Views", formatNumber(totals.landing_page_views)],
    ["Purchases", formatNumber(totals.purchases)],
    ["Purchase Value", formatCurrency(totals.purchase_value)],
    ["Outcomes", formatNumber(totals.outcomes)],
    ["Revenue", formatCurrency(totals.gross_revenue)],
  ];
  host.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="card">
          <div class="label">${label}</div>
          <div class="value">${value}</div>
        </article>
      `,
    )
    .join("");
}

function renderBindings() {
  const host = qs("bindingsPanel");
  const count = qs("bindingCount");
  if (!host || !count) return;
  const bindings = asArray(state.bindings);
  count.textContent = `${bindings.length} binding${bindings.length === 1 ? "" : "s"}`;
  if (bindings.length === 0) {
    host.innerHTML = `<div class="empty">No bindings are configured for this scope yet.</div>`;
    return;
  }
  host.innerHTML = bindings
    .map((binding) => {
      const label = text(binding.label, binding.platform || binding.role);
      const identity = binding.websiteInstallationId || binding.connectionId || "unbound";
      return `
        <div class="binding-item">
          <div>
            <div class="label">${text(binding.role)}</div>
            <div class="value" style="font-size: 1.05rem;">${label}</div>
          </div>
          <div class="muted" style="text-align: right;">
            <div>${text(binding.platform)}</div>
            <div>${text(identity)}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderFreshness() {
  const host = qs("freshnessPanel");
  const pill = qs("latestRunPill");
  if (!host || !pill) return;
  const pipeline = asObject(state.pipeline);
  const latestRun = asObject(pipeline?.latest_run);
  const counts = asObject(pipeline?.counts) || {};
  pill.textContent = latestRun
    ? `${text(latestRun.status)} · ${formatDateTime(latestRun.completedAt || latestRun.startedAt)}`
    : "No runs yet";
  const metrics = [
    ["Latest run", latestRun ? text(latestRun.status) : "No runs yet"],
    ["Started", latestRun ? formatDateTime(latestRun.startedAt) : "—"],
    ["Completed", latestRun ? formatDateTime(latestRun.completedAt) : "—"],
    ["Ad facts", formatNumber(counts.ad_facts)],
    ["Web events", formatNumber(counts.web_events)],
    ["Outcomes", formatNumber(counts.business_outcomes)],
    ["Attributions", formatNumber(counts.outcome_attributions)],
  ];
  host.innerHTML = `
    <div class="metric-grid">
      ${metrics
        .map(
          ([label, value]) => `
            <div class="card" style="padding: 0.9rem 1rem;">
              <div class="label">${label}</div>
              <div class="value" style="font-size: 1rem;">${value}</div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderChannels() {
  const host = qs("channelsPanel");
  if (!host) return;
  const channels = asArray(asObject(state.summary)?.top_channels);
  if (channels.length === 0) {
    host.innerHTML = `<div class="empty">No paid rows are materialized for this scope yet.</div>`;
    return;
  }
  host.innerHTML = channels
    .map(
      (channel) => `
        <div class="card" style="padding: 0.9rem 1rem;">
          <div style="display:flex;justify-content:space-between;gap:1rem;">
            <div>
              <div class="label">${text(channel.source_channel)}</div>
              <div class="value" style="font-size: 1rem;">${formatCurrency(channel.spend)}</div>
            </div>
            <div class="muted" style="text-align:right;">
              <div>${formatNumber(channel.clicks)} clicks</div>
              <div>${formatNumber(channel.outcomes)} outcomes</div>
              <div>${formatCurrency(channel.gross_revenue)} revenue</div>
            </div>
          </div>
        </div>
      `,
    )
    .join("");
}

function renderAdFacts() {
  const host = qs("adFactsPanel");
  if (!host) return;
  const rows = asArray(state.adFacts).slice(0, 12);
  if (rows.length === 0) {
    host.innerHTML = `<div class="empty">No paid fact rows are available for this scope yet.</div>`;
    return;
  }
  host.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Platform</th>
          <th>Campaign</th>
          <th>Spend</th>
          <th>Clicks</th>
          <th>Purchases</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                <td>${text(row.date)}</td>
                <td>${text(row.platform)}</td>
                <td>${text(row.campaignName, row.campaignId)}</td>
                <td>${formatCurrency(row.spend)}</td>
                <td>${formatNumber(row.clicks)}</td>
                <td>${formatNumber(row.purchases)}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderFunnel() {
  const host = qs("funnelPanel");
  if (!host) return;
  const rows = asArray(asObject(state.funnel)?.rows).slice(0, 12);
  if (rows.length === 0) {
    host.innerHTML = `<div class="empty">No website funnel rows are materialized for this scope yet.</div>`;
    return;
  }
  host.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Channel</th>
          <th>Sessions</th>
          <th>Handoffs</th>
          <th>Outcomes</th>
          <th>Revenue</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                <td>${text(row.date)}</td>
                <td>${text(row.source_channel)}</td>
                <td>${formatNumber(row.sessions)}</td>
                <td>${formatNumber((Number(row.handoff_starts) || 0) + (Number(row.handoff_confirmed) || 0))}</td>
                <td>${formatNumber(row.outcomes)}</td>
                <td>${formatCurrency(row.gross_revenue)}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderOutcomes() {
  const host = qs("outcomesPanel");
  if (!host) return;
  const outcomes = asArray(state.outcomes);
  if (outcomes.length === 0) {
    host.innerHTML = `<div class="empty">No backend outcomes are available for this scope yet.</div>`;
    return;
  }
  host.innerHTML = outcomes
    .map((outcome) => {
      const active = state.selectedOutcomeId === outcome.backendEntityId ? "active" : "";
      const attribution = asObject(outcome.attribution) || {};
      return `
        <button class="outcome-button ${active}" type="button" data-outcome-id="${text(outcome.backendEntityId, "")}">
          <div style="display:flex;justify-content:space-between;gap:1rem;">
            <div>
              <div class="label">${text(outcome.outcomeType)}</div>
              <div class="value" style="font-size:1rem;">${text(outcome.backendEntityId)}</div>
            </div>
            <div class="muted" style="text-align:right;">
              <div>${formatCurrency(outcome.grossValue)}</div>
              <div>${text(attribution.sourceChannel)}</div>
              <div>${text(outcome.outcomeStatus)}</div>
            </div>
          </div>
        </button>
      `;
    })
    .join("");

  host.querySelectorAll("[data-outcome-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const outcomeId = button.getAttribute("data-outcome-id") || "";
      if (!outcomeId) return;
      state.selectedOutcomeId = outcomeId;
      renderOutcomes();
      await loadOutcome(outcomeId);
    });
  });
}

function renderInspector() {
  const host = qs("inspectorPanel");
  if (!host) return;
  const outcome = asObject(state.selectedOutcome);
  if (!outcome) {
    host.innerHTML = `<div class="empty">Choose an outcome row to inspect bridge and attribution evidence.</div>`;
    return;
  }
  const attribution = asObject(outcome.attribution) || {};
  host.innerHTML = `
    <div class="card" style="padding: 0.9rem 1rem;">
      <div class="label">Winning Decision</div>
      <div class="value" style="font-size: 1rem;">${text(attribution.sourceChannel)}</div>
      <div class="muted">${text(attribution.matchMethod)} · ${text(attribution.sourceConfidence)}</div>
    </div>
    <div class="card" style="padding: 0.9rem 1rem;">
      <div class="label">Outcome Row</div>
      <pre>${JSON.stringify(outcome.row || {}, null, 2)}</pre>
    </div>
    <div class="card" style="padding: 0.9rem 1rem;">
      <div class="label">Bridge Attributes</div>
      <pre>${JSON.stringify(outcome.bridgeAttributes || {}, null, 2)}</pre>
    </div>
    <div class="card" style="padding: 0.9rem 1rem;">
      <div class="label">Evidence</div>
      <pre>${JSON.stringify(attribution.evidence || {}, null, 2)}</pre>
    </div>
  `;
}

function renderAll() {
  syncScopeSelect();
  renderTotals();
  renderBindings();
  renderFreshness();
  renderChannels();
  renderAdFacts();
  renderFunnel();
  renderOutcomes();
  renderInspector();
}

async function loadOutcome(outcomeId) {
  if (!outcomeId) {
    state.selectedOutcome = null;
    renderInspector();
    return;
  }
  const payload = await callRuntime("attribution.outcomes.get", { outcome_id: outcomeId });
  state.selectedOutcome = asObject(payload)?.outcome || null;
  renderInspector();
}

async function loadScope(scopeId) {
  if (!scopeId) {
    state.scopeId = "";
    state.bindings = [];
    state.summary = null;
    state.adFacts = [];
    state.funnel = null;
    state.outcomes = [];
    state.pipeline = null;
    state.selectedOutcome = null;
    renderAll();
    setStatus("Create a scope and bindings to start materializing attribution data.");
    return;
  }

  state.loading = true;
  syncScopeSelect();
  setStatus(`Loading scope ${scopeId}…`);
  try {
    const [bindingsPayload, pipelinePayload, summaryPayload, adFactsPayload, funnelPayload, outcomesPayload] = await Promise.all([
      callRuntime("attribution.bindings.list", { scope_id: scopeId }),
      callRuntime("attribution.pipeline.status", { scope_id: scopeId }),
      callRuntime("attribution.summary", { scope_id: scopeId, days: 30 }),
      callRuntime("attribution.ad-facts.list", { scope_id: scopeId, limit: 25 }),
      callRuntime("attribution.funnel", { scope_id: scopeId, days: 30 }),
      callRuntime("attribution.outcomes.list", { scope_id: scopeId, limit: 20 }),
    ]);
    state.scopeId = scopeId;
    state.bindings = asArray(asObject(bindingsPayload)?.bindings);
    state.pipeline = asObject(pipelinePayload)?.pipeline || null;
    state.summary = summaryPayload;
    state.adFacts = asArray(asObject(adFactsPayload)?.rows);
    state.funnel = funnelPayload;
    state.outcomes = asArray(asObject(outcomesPayload)?.outcomes);
    const currentExists = state.outcomes.some((entry) => entry.backendEntityId === state.selectedOutcomeId);
    state.selectedOutcomeId = currentExists
      ? state.selectedOutcomeId
      : text(state.outcomes[0]?.backendEntityId, "");
    renderAll();
    if (state.selectedOutcomeId) {
      await loadOutcome(state.selectedOutcomeId);
    } else {
      state.selectedOutcome = null;
      renderInspector();
    }
    const url = new URL(window.location.href);
    url.searchParams.set("scope_id", scopeId);
    window.history.replaceState({}, "", url);
    setStatus(`Loaded ${scopeId}.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    state.loading = false;
    syncScopeSelect();
  }
}

async function loadScopes() {
  state.loading = true;
  syncScopeSelect();
  try {
    const payload = await callRuntime("attribution.scopes.list", { limit: 50 });
    state.scopes = asArray(asObject(payload)?.scopes);
    const hintedScopeId = new URL(window.location.href).searchParams.get("scope_id") || "";
    const preferredScopeId =
      state.scopes.find((scope) => scope.scopeId === hintedScopeId)?.scopeId ||
      state.scopes[0]?.scopeId ||
      "";
    renderAll();
    await loadScope(preferredScopeId);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    state.loading = false;
    syncScopeSelect();
  }
}

async function triggerReplay() {
  if (!state.scopeId) return;
  state.loading = true;
  const replay = qs("replayButton");
  const refresh = qs("refreshButton");
  if (replay) replay.disabled = true;
  if (refresh) refresh.disabled = true;
  setStatus(`Replaying bound records for ${state.scopeId}…`);
  try {
    await callRuntime("attribution.pipeline.trigger", {
      scope_id: state.scopeId,
      limit_per_platform: 250,
    });
    await loadScope(state.scopeId);
    setStatus(`Replay completed for ${state.scopeId}.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    state.loading = false;
    if (replay) replay.disabled = false;
    if (refresh) refresh.disabled = false;
  }
}

function wireUi() {
  const scopeSelect = qs("scopeSelect");
  const refresh = qs("refreshButton");
  const replay = qs("replayButton");

  if (scopeSelect) {
    scopeSelect.addEventListener("change", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      await loadScope(target.value);
    });
  }
  if (refresh) {
    refresh.addEventListener("click", async () => {
      await loadScope(state.scopeId);
    });
  }
  if (replay) {
    replay.addEventListener("click", async () => {
      await triggerReplay();
    });
  }
}

wireUi();
void loadScopes();
    state.adFacts = asArray(asObject(summaryPayload) && null);
    state.adFacts = asArray(asObject(arguments[0]) && null);
