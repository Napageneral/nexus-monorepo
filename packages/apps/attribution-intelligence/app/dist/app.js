const state = {
  loading: false,
  scopes: [],
  scopeId: "",
  bindings: [],
  summary: null,
  adFacts: [],
  funnel: null,
  ledgerSummary: null,
  ledgerRows: [],
  ledgerFilter: "all",
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

function formatPercent(value, digits = 1) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(numeric);
}

function formatMetricValue(value, formatter = "count") {
  if (formatter === "money") return formatCurrency(value);
  if (formatter === "percent" || formatter === "ratio") return formatPercent(value);
  return formatNumber(value);
}

function formatDelta(value, formatter = "percent") {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }
  const prefix = numeric > 0 ? "+" : "";
  return `${prefix}${formatMetricValue(numeric, formatter)}`;
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

function formatDateOnly(value) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
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
  const summary = asObject(state.summary);
  const totals = asObject(summary?.totals) || {};
  const kpis = asObject(summary?.kpis) || {};
  const cards = [
    { label: "Revenue", key: "gross_revenue", fallback: totals.gross_revenue, formatter: "money" },
    { label: "Spend", key: "spend", fallback: totals.spend, formatter: "money" },
    { label: "Clicks", key: "clicks", fallback: totals.clicks, formatter: "count" },
    { label: "Landing Page Views", key: "landing_page_views", fallback: totals.landing_page_views, formatter: "count" },
    { label: "Purchases", key: "purchases", fallback: totals.purchases, formatter: "count" },
    { label: "Purchase Value", key: "purchase_value", fallback: totals.purchase_value, formatter: "money" },
    { label: "Outcomes", key: "outcomes", fallback: totals.outcomes, formatter: "count" },
    {
      label: "Coverage",
      key: "match_rate",
      fallback: asObject(summary?.attribution_strip)?.coverage_rate,
      formatter: "percent",
    },
  ];
  host.innerHTML = cards
    .map(
      ({ label, key, fallback, formatter }) => {
        const metric = asObject(kpis[key]);
        const value = metric ? formatMetricValue(metric.value, metric.formatter || formatter) : formatMetricValue(fallback, formatter);
        const previous = metric ? formatMetricValue(metric.previous, metric.formatter || formatter) : "—";
        const delta = metric ? formatPercent(metric.delta, 1) : "—";
        return `
        <article class="card">
          <div class="label">${label}</div>
          <div class="value">${value}</div>
          <div class="muted" style="margin-top:0.45rem;">Prev ${previous} · Δ ${delta}</div>
        </article>
      `;
      },
    )
    .join("");
}

function renderCoverageStrip() {
  const host = qs("coverageStripPanel");
  if (!host) return;
  const strip = asObject(asObject(state.summary)?.attribution_strip);
  if (!strip) {
    host.innerHTML = `<div class="empty">No attribution coverage slice is materialized for this scope yet.</div>`;
    return;
  }
  const cards = [
    ["Primary Outcomes", formatNumber(strip.total_primary_outcomes)],
    ["Resolved", formatNumber(strip.resolved_primary_outcomes)],
    ["Needs Review", formatNumber(strip.review_primary_outcomes)],
    ["Direct Or Unknown", formatNumber(strip.direct_or_unknown_primary_outcomes)],
    ["Coverage Rate", formatPercent(strip.coverage_rate)],
  ];
  host.innerHTML = `
    <div class="metric-grid">
      ${cards
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

function ledgerFilterParams() {
  switch (state.ledgerFilter) {
    case "needs_review":
      return { review_only: true };
    case "missing_row":
      return { unresolved_only: true };
    case "weak_match":
      return { weak_match_only: true };
    case "paid_only":
      return { paid_only: true };
    case "utm_only":
      return { utm_only: true };
    default:
      return {};
  }
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
      const identity = binding.connectionId || "unbound";
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
  const freshness = asObject(pipeline?.freshness) || {};
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
    ["Latest ad fact", formatDateTime(freshness.latest_ad_fact_at)],
    ["Latest web event", formatDateTime(freshness.latest_web_event_at)],
    ["Latest backend outcome", formatDateTime(freshness.latest_backend_outcome_at)],
    ["Latest decision", formatDateTime(freshness.latest_attribution_decision_at)],
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
  const summary = asObject(state.summary) || {};
  const channels = asArray(summary.top_channels);
  const channelGroups = asArray(summary.channel_groups);
  const sourceBreakdown = asArray(summary.source_breakdown).slice(0, 8);
  const channelTrajectory = asArray(summary.channel_trajectory).slice(-18);
  if (channels.length === 0 && channelGroups.length === 0 && sourceBreakdown.length === 0) {
    host.innerHTML = `<div class="empty">No paid rows are materialized for this scope yet.</div>`;
    return;
  }
  const familyCards = channelGroups
    .map((group) => {
      const totals = asObject(group.totals) || {};
      const kpis = asObject(group.kpis) || {};
      const revenueDelta = asObject(kpis.gross_revenue)?.delta;
      return `
        <div class="card" style="padding: 0.9rem 1rem;">
          <div style="display:flex;justify-content:space-between;gap:1rem;">
            <div>
              <div class="label">${text(group.channel_family)}</div>
              <div class="value" style="font-size: 1rem;">${formatCurrency(totals.gross_revenue)}</div>
              <div class="muted">${formatNumber(totals.outcomes)} outcomes · ${formatCurrency(totals.spend)} spend</div>
            </div>
            <div class="muted" style="text-align:right;">
              <div>Revenue Δ ${formatDelta(revenueDelta)}</div>
              <div>ROAS ${formatMetricValue(asObject(kpis.roas)?.value, "ratio")}</div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
  const sourceTable = sourceBreakdown.length
    ? `
      <div style="margin-top: 1rem;">
        <div class="label" style="margin-bottom: 0.5rem;">Source Comparison</div>
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Family</th>
              <th>Revenue</th>
              <th>Outcomes</th>
              <th>Spend</th>
              <th>Revenue Δ</th>
            </tr>
          </thead>
          <tbody>
            ${sourceBreakdown
              .map((row) => {
                const totals = asObject(row.totals) || {};
                const kpis = asObject(row.kpis) || {};
                return `
                  <tr>
                    <td>${text(row.source_channel)}</td>
                    <td>${text(row.channel_family)}</td>
                    <td>${formatCurrency(totals.gross_revenue)}</td>
                    <td>${formatNumber(totals.outcomes)}</td>
                    <td>${formatCurrency(totals.spend)}</td>
                    <td>${formatDelta(asObject(kpis.gross_revenue)?.delta)}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `
    : "";
  const trajectoryTable = channelTrajectory.length
    ? `
      <div style="margin-top: 1rem;">
        <div class="label" style="margin-bottom: 0.5rem;">Recent Trajectory</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Family</th>
              <th>Revenue</th>
              <th>Outcomes</th>
              <th>Spend</th>
            </tr>
          </thead>
          <tbody>
            ${channelTrajectory
              .map(
                (row) => `
                  <tr>
                    <td>${text(row.date)}</td>
                    <td>${text(row.channel_family)}</td>
                    <td>${formatCurrency(row.gross_revenue)}</td>
                    <td>${formatNumber(row.outcomes)}</td>
                    <td>${formatCurrency(row.spend)}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
    : "";
  const topCards = channels
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
  host.innerHTML = `
    <div class="metric-grid">${familyCards || topCards}</div>
    ${sourceTable}
    ${trajectoryTable}
  `;
}

function renderLiveFunnel() {
  const host = qs("liveFunnelPanel");
  if (!host) return;
  const live = asObject(asObject(state.funnel)?.live_funnel);
  if (!live) {
    host.innerHTML = `<div class="empty">No live funnel windows are materialized for this scope yet.</div>`;
    return;
  }
  const windows = asArray(live.windows);
  const alerts = asArray(live.alerts);
  const latest = asObject(live.latest) || {};
  host.innerHTML = `
    <div class="pill">${text(live.status)}</div>
    <div class="metric-grid">
      <div class="card" style="padding: 0.9rem 1rem;">
        <div class="label">Last Event</div>
        <div class="value" style="font-size: 1rem;">${formatDateTime(latest.last_event_at)}</div>
      </div>
      <div class="card" style="padding: 0.9rem 1rem;">
        <div class="label">Last CTA Click</div>
        <div class="value" style="font-size: 1rem;">${formatDateTime(latest.last_cta_click_at)}</div>
      </div>
      <div class="card" style="padding: 0.9rem 1rem;">
        <div class="label">Last Handoff Confirmed</div>
        <div class="value" style="font-size: 1rem;">${formatDateTime(latest.last_handoff_confirmed_at)}</div>
      </div>
      <div class="card" style="padding: 0.9rem 1rem;">
        <div class="label">Last Outcome</div>
        <div class="value" style="font-size: 1rem;">${formatDateTime(latest.last_outcome_at)}</div>
      </div>
    </div>
    <div class="stack">
      ${alerts
        .map(
          (alert) => `
            <div class="card" style="padding: 0.9rem 1rem;">
              <div class="label">${text(alert.level)}</div>
              <div class="value" style="font-size: 1rem;">${text(alert.title)}</div>
              <div class="muted">${text(alert.detail)}</div>
            </div>
          `,
        )
        .join("")}
    </div>
    ${
      windows.length === 0
        ? `<div class="empty">No recent funnel windows are available.</div>`
        : `
          <table>
            <thead>
              <tr>
                <th>Window</th>
                <th>Product Views</th>
                <th>CTA Clicks</th>
                <th>Handoffs</th>
                <th>Confirmed</th>
                <th>Outcomes</th>
              </tr>
            </thead>
            <tbody>
              ${windows
                .map(
                  (row) => `
                    <tr>
                      <td>${text(row.window)}</td>
                      <td>${formatNumber(row.product_views)}</td>
                      <td>${formatNumber(row.cta_clicks)}</td>
                      <td>${formatNumber(row.handoff_starts)}</td>
                      <td>${formatNumber(row.handoff_confirmed)}</td>
                      <td>${formatNumber(row.outcomes)}</td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
        `
    }
  `;
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
  const rows = asArray(state.ledgerRows);
  const summary = asObject(state.ledgerSummary) || {};
  if (rows.length === 0) {
    host.innerHTML = `<div class="empty">No primary business outcomes match the current review filter.</div>`;
    return;
  }
  const summaryCards = [
    ["Primary Outcomes", formatNumber(summary.totalPrimaryOutcomes)],
    ["Needs Review", formatNumber(summary.reviewPrimaryOutcomes)],
    ["Missing Row", formatNumber(summary.unresolvedPrimaryOutcomes)],
    ["Weak Match", formatNumber(summary.weakMatchPrimaryOutcomes)],
  ];
  host.innerHTML = `
    <div class="metric-grid" style="margin-bottom: 0.85rem;">
      ${summaryCards
        .map(
          ([label, value]) => `
            <div class="card" style="padding: 0.85rem 1rem;">
              <div class="label">${label}</div>
              <div class="value" style="font-size: 1rem;">${value}</div>
            </div>
          `,
        )
        .join("")}
    </div>
    <div class="stack">
      ${rows
        .map((outcome) => {
          const active = state.selectedOutcomeId === outcome.backendEntityId ? "active" : "";
          const attribution = asObject(outcome.attribution) || {};
          const reviewState = outcome.unresolved
            ? "missing_row"
            : outcome.utmOnly
              ? "utm_only"
              : outcome.weakMatch
                ? "weak_match"
                : outcome.needsReview
                  ? "needs_review"
                  : "clean";
          const statusBadges = [
            reviewState,
            outcome.paid ? "paid" : "organic",
            text(attribution.sourceChannel, "direct_or_unknown"),
          ];
          const decisionLabel = attribution.sourceChannel
            ? `${text(attribution.sourceChannel)}${outcome.paid ? " · paid" : ""}`
            : "Unresolved";
          const matchLabel = attribution.matchMethod
            ? `${text(attribution.matchMethod)} · ${text(attribution.sourceConfidence)}`
            : "No attribution row";
          return `
            <button class="outcome-button ${active}" type="button" data-outcome-id="${text(outcome.backendEntityId, "")}">
              <div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;">
                <div>
                  <div class="label">${formatDateOnly(outcome.occurredAt)}</div>
                  <div class="value" style="font-size:1rem;">${text(outcome.displayTitle, outcome.backendEntityId)}</div>
                  <div class="muted">${text(outcome.backendEntityId)}</div>
                </div>
                <div class="muted" style="text-align:right;">
                  <div>${formatCurrency(outcome.grossValue)}</div>
                  <div>${decisionLabel}</div>
                  <div>${matchLabel}</div>
                </div>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.7rem;">
                ${statusBadges.map((label) => `<span class="pill">${text(label)}</span>`).join("")}
              </div>
            </button>
          `;
        })
        .join("")}
    </div>
  `;

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
    host.innerHTML = `<div class="empty">Choose a ledger row to inspect the winning decision, bridge attributes, and evidence.</div>`;
    return;
  }
  const attribution = asObject(outcome.attribution) || {};
  const badges = [
    outcome.unresolved ? "missing_row" : outcome.weakMatch ? "weak_match" : outcome.utmOnly ? "utm_only" : "clean",
    outcome.paid ? "paid" : "organic",
    text(attribution.sourceChannel, "direct_or_unknown"),
  ];
  host.innerHTML = `
    <div class="card" style="padding: 0.9rem 1rem;">
      <div class="label">Winning Decision</div>
      <div class="value" style="font-size: 1rem;">${text(attribution.sourceChannel, "Unresolved")}</div>
      <div class="muted">${text(attribution.matchMethod)} · ${text(attribution.sourceConfidence)} · ${text(attribution.unresolvedReason)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.7rem;">
        ${badges.map((label) => `<span class="pill">${text(label)}</span>`).join("")}
      </div>
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
  renderCoverageStrip();
  renderBindings();
  renderFreshness();
  renderChannels();
  renderAdFacts();
  renderLiveFunnel();
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
  const payload = await callRuntime("attribution.ledger.get", {
    scope_id: state.scopeId,
    outcome_id: outcomeId,
  });
  state.selectedOutcome = asObject(payload)?.outcome || null;
  renderInspector();
}

async function loadLedger() {
  if (!state.scopeId) {
    state.ledgerSummary = null;
    state.ledgerRows = [];
    state.selectedOutcome = null;
    renderOutcomes();
    renderInspector();
    return;
  }
  const payload = await callRuntime("attribution.ledger.list", {
    scope_id: state.scopeId,
    days: 30,
    limit: 25,
    ...ledgerFilterParams(),
  });
  state.ledgerSummary = asObject(payload)?.summary || null;
  state.ledgerRows = asArray(asObject(payload)?.rows);
  const currentExists = state.ledgerRows.some((entry) => entry.backendEntityId === state.selectedOutcomeId);
  state.selectedOutcomeId = currentExists
    ? state.selectedOutcomeId
    : text(state.ledgerRows[0]?.backendEntityId, "");
  renderOutcomes();
  if (state.selectedOutcomeId) {
    await loadOutcome(state.selectedOutcomeId);
  } else {
    state.selectedOutcome = null;
    renderInspector();
  }
}

async function loadScope(scopeId) {
  if (!scopeId) {
    state.scopeId = "";
    state.bindings = [];
    state.summary = null;
    state.adFacts = [];
    state.funnel = null;
    state.ledgerSummary = null;
    state.ledgerRows = [];
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
    const [bindingsPayload, pipelinePayload, summaryPayload, adFactsPayload, funnelPayload, ledgerPayload] = await Promise.all([
      callRuntime("attribution.bindings.list", { scope_id: scopeId }),
      callRuntime("attribution.pipeline.status", { scope_id: scopeId }),
      callRuntime("attribution.summary", { scope_id: scopeId, days: 30 }),
      callRuntime("attribution.ad-facts.list", { scope_id: scopeId, limit: 25 }),
      callRuntime("attribution.funnel", { scope_id: scopeId, days: 30 }),
      callRuntime("attribution.ledger.list", {
        scope_id: scopeId,
        days: 30,
        limit: 25,
        ...ledgerFilterParams(),
      }),
    ]);
    state.scopeId = scopeId;
    state.bindings = asArray(asObject(bindingsPayload)?.bindings);
    state.pipeline = asObject(pipelinePayload)?.pipeline || null;
    state.summary = summaryPayload;
    state.adFacts = asArray(asObject(adFactsPayload)?.rows);
    state.funnel = funnelPayload;
    state.ledgerSummary = asObject(ledgerPayload)?.summary || null;
    state.ledgerRows = asArray(asObject(ledgerPayload)?.rows);
    const currentExists = state.ledgerRows.some((entry) => entry.backendEntityId === state.selectedOutcomeId);
    state.selectedOutcomeId = currentExists
      ? state.selectedOutcomeId
      : text(state.ledgerRows[0]?.backendEntityId, "");
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
  setStatus(`Starting replay for ${state.scopeId}…`);
  try {
    const payload = await callRuntime("attribution.pipeline.trigger", {
      scope_id: state.scopeId,
      limit_per_platform: 50,
    });
    await loadScope(state.scopeId);
    if (asObject(payload)?.status === "already_running") {
      setStatus(`Replay already running for ${state.scopeId}.`);
      return;
    }
    const jobRunId = asObject(payload)?.job_run?.id || asObject(payload)?.job_run?.run_id || "";
    setStatus(
      jobRunId
        ? `Replay started for ${state.scopeId} (${jobRunId}).`
        : `Replay started for ${state.scopeId}.`,
    );
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
  const ledgerFilter = qs("ledgerFilterSelect");

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
  if (ledgerFilter) {
    ledgerFilter.addEventListener("change", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      state.ledgerFilter = target.value;
      await loadLedger();
      setStatus(`Loaded ${state.scopeId} ledger (${target.value}).`);
    });
  }
}

wireUi();
void loadScopes();
