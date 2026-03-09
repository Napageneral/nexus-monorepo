const METHODS = {
  overviewGet: "glowbotAdmin.overview.get",
  managedProfilesList: "glowbotAdmin.managedProfiles.list",
  managedProfilesGet: "glowbotAdmin.managedProfiles.get",
  managedProfilesCreate: "glowbotAdmin.managedProfiles.create",
  managedProfilesUpdate: "glowbotAdmin.managedProfiles.update",
  managedProfilesArchive: "glowbotAdmin.managedProfiles.archive",
  clinicsList: "glowbotAdmin.clinics.list",
  clinicsGet: "glowbotAdmin.clinics.get",
  diagnosticsSummary: "glowbotAdmin.diagnostics.summary",
  benchmarksNetworkHealth: "glowbotAdmin.benchmarks.networkHealth",
  benchmarksSeedPublish: "glowbotAdmin.benchmarks.seed.publish",
  cohortsList: "glowbotAdmin.cohorts.list",
  cohortsUpdate: "glowbotAdmin.cohorts.update",
  productFlagsList: "glowbotAdmin.productFlags.list",
  productFlagsUpdate: "glowbotAdmin.productFlags.update",
  auditList: "glowbotAdmin.audit.list",
};

const state = {
  selectedManagedProfileId: null,
  selectedClinicId: null,
  managedProfiles: [],
  clinics: [],
};

function bridge() {
  if (!window.NexusRuntimeBridge || typeof window.NexusRuntimeBridge.rpcCall !== "function") {
    throw new Error("nexus runtime bridge unavailable");
  }
  return window.NexusRuntimeBridge;
}

async function rpcCall(method, params = {}) {
  return bridge().rpcCall(method, params, {
    clientVersion: "glowbot-admin-web",
  });
}

function statusEl() {
  return document.getElementById("status");
}

function setStatus(kind, message) {
  const el = statusEl();
  el.textContent = message;
  el.className = kind ? `status ${kind}` : "status hidden";
  if (!message) {
    el.className = "status hidden";
  }
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function setJson(id, value) {
  const el = document.getElementById(id);
  el.textContent = formatJson(value);
}

function parseJsonInput(id, fallback) {
  const raw = document.getElementById(id).value.trim();
  if (!raw) {
    return fallback;
  }
  return JSON.parse(raw);
}

function timestamp(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "unknown";
  }
  return new Date(value).toLocaleString();
}

function renderSummary(overview) {
  const diagnostics = overview?.diagnostics ?? {};
  const benchmarkNetwork = overview?.benchmarkNetwork ?? {};
  const hubHealth = overview?.hubHealth ?? {};
  const productFlags = Array.isArray(overview?.productFlags?.productFlags)
    ? overview.productFlags.productFlags
    : [];
  document.getElementById("summary-health").textContent = String(hubHealth.status ?? "unknown");
  document.getElementById("summary-managed-profiles").textContent = String(
    diagnostics.managedProfileCount ?? 0,
  );
  document.getElementById("summary-snapshots").textContent = String(
    diagnostics.snapshotCount ?? 0,
  );
  document.getElementById("summary-cohorts").textContent = String(
    benchmarkNetwork.cohortCount ?? diagnostics.cohortCount ?? 0,
  );
  document.getElementById("summary-flags").textContent = String(productFlags.length);
  document.getElementById("summary-failures").textContent = String(
    Array.isArray(diagnostics.recentRelayFailures) ? diagnostics.recentRelayFailures.length : 0,
  );
}

function renderManagedProfiles() {
  const list = document.getElementById("managed-profiles-list");
  if (!Array.isArray(state.managedProfiles) || state.managedProfiles.length === 0) {
    list.innerHTML = '<div class="list-item"><p class="title">No managed profiles</p><p class="meta">Create the first profile using the form on the right.</p></div>';
    return;
  }
  list.innerHTML = state.managedProfiles
    .map((profile) => {
      const active = profile.managedProfileId === state.selectedManagedProfileId ? " active" : "";
      return `
        <button class="list-item${active}" data-managed-profile-id="${profile.managedProfileId}">
          <p class="title">${profile.displayName || profile.managedProfileId}</p>
          <p class="meta">${profile.appId} · ${profile.adapterId} · ${profile.status || "unknown"}</p>
          <p class="meta">${profile.connectionProfileId} · ${profile.authMethodId}</p>
        </button>
      `;
    })
    .join("");
  list.querySelectorAll("[data-managed-profile-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedManagedProfileId = button.getAttribute("data-managed-profile-id");
      renderManagedProfiles();
      await loadManagedProfileSelection();
    });
  });
}

function renderClinics() {
  const list = document.getElementById("clinics-list");
  if (!Array.isArray(state.clinics) || state.clinics.length === 0) {
    list.innerHTML = '<div class="list-item"><p class="title">No clinic snapshots yet</p><p class="meta">Clinic benchmark publication will populate this list.</p></div>';
    return;
  }
  list.innerHTML = state.clinics
    .map((clinic) => {
      const active = clinic.clinicId === state.selectedClinicId ? " active" : "";
      return `
        <button class="list-item${active}" data-clinic-id="${clinic.clinicId}">
          <p class="title">${clinic.clinicName || clinic.clinicId}</p>
          <p class="meta">${clinic.profileKey || "unknown profile"} · updated ${timestamp(clinic.lastPublishedAtMs)}</p>
          <p class="meta">${clinic.snapshotCount || 0} snapshot(s)</p>
        </button>
      `;
    })
    .join("");
  list.querySelectorAll("[data-clinic-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedClinicId = button.getAttribute("data-clinic-id");
      renderClinics();
      await loadClinicSelection();
    });
  });
}

function sampleManagedProfile() {
  return formatJson({
    managedProfileId: "glowbot-google-oauth",
    displayName: "GlowBot Google OAuth",
    appId: "glowbot",
    adapterId: "google",
    connectionProfileId: "glowbot-managed-google-oauth",
    authMethodId: "google_oauth_managed",
    flowKind: "oauth2",
    service: "google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId: "glowbot-google-client-id",
    secretRef: "env:GLOWBOT_GOOGLE_CLIENT_SECRET",
    scopes: ["https://www.googleapis.com/auth/adwords.readonly"],
    authorizeParams: {
      access_type: "offline",
      prompt: "consent"
    }
  });
}

function sampleCohorts() {
  return formatJson([
    {
      profileKey: "medspa|unknown|unknown|unknown",
      specialty: "medspa",
      monthlyAdSpendBand: "unknown",
      patientVolumeBand: "unknown",
      locationCountBand: "unknown",
      active: true
    }
  ]);
}

function sampleSeeds() {
  return formatJson([
    {
      profileKey: "medspa|unknown|unknown|unknown",
      periodKind: "30d",
      metricName: "lead_to_booking_rate",
      peerMedian: 0.42,
      peerP25: 0.31,
      peerP75: 0.51,
      sourceLabel: "industry_seed"
    }
  ]);
}

async function loadOverview() {
  const overview = await rpcCall(METHODS.overviewGet);
  renderSummary(overview);
  setJson("overview-json", overview);
}

async function loadDiagnostics() {
  const diagnostics = await rpcCall(METHODS.diagnosticsSummary);
  setJson("diagnostics-json", diagnostics);
}

async function loadNetwork() {
  const network = await rpcCall(METHODS.benchmarksNetworkHealth);
  setJson("network-json", network);
}

async function loadManagedProfiles() {
  const includeArchived = document.getElementById("managed-include-archived").checked;
  const response = await rpcCall(METHODS.managedProfilesList, { includeArchived });
  state.managedProfiles = Array.isArray(response.managedProfiles) ? response.managedProfiles : [];
  if (!state.selectedManagedProfileId && state.managedProfiles[0]?.managedProfileId) {
    state.selectedManagedProfileId = state.managedProfiles[0].managedProfileId;
  }
  renderManagedProfiles();
  await loadManagedProfileSelection();
}

async function loadManagedProfileSelection() {
  if (!state.selectedManagedProfileId) {
    document.getElementById("managed-profile-update").value = "";
    return;
  }
  const response = await rpcCall(METHODS.managedProfilesGet, {
    managedProfileId: state.selectedManagedProfileId,
  });
  document.getElementById("managed-profile-update").value = formatJson(response.managedProfile);
}

async function loadClinics() {
  const response = await rpcCall(METHODS.clinicsList);
  state.clinics = Array.isArray(response.clinics) ? response.clinics : [];
  if (!state.selectedClinicId && state.clinics[0]?.clinicId) {
    state.selectedClinicId = state.clinics[0].clinicId;
  }
  renderClinics();
  await loadClinicSelection();
}

async function loadClinicSelection() {
  if (!state.selectedClinicId) {
    setJson("clinic-detail-json", { note: "No clinic selected." });
    return;
  }
  const response = await rpcCall(METHODS.clinicsGet, {
    clinicId: state.selectedClinicId,
  });
  setJson("clinic-detail-json", response);
}

async function loadCohorts() {
  const response = await rpcCall(METHODS.cohortsList);
  setJson("cohorts-json", response);
}

async function loadProductFlags() {
  const response = await rpcCall(METHODS.productFlagsList);
  setJson("product-flags-json", response);
}

async function loadAudit() {
  const response = await rpcCall(METHODS.auditList, { limit: 50 });
  setJson("audit-json", response);
}

async function refreshAll() {
  setStatus("", "");
  try {
    await Promise.all([
      loadOverview(),
      loadDiagnostics(),
      loadNetwork(),
      loadManagedProfiles(),
      loadClinics(),
      loadCohorts(),
      loadProductFlags(),
      loadAudit(),
    ]);
    setStatus("success", "Operator data refreshed.");
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : String(error));
  }
}

async function handleCreateManagedProfile() {
  const payload = parseJsonInput("managed-profile-create", {});
  const response = await rpcCall(METHODS.managedProfilesCreate, payload);
  state.selectedManagedProfileId = response.managedProfile?.managedProfileId || state.selectedManagedProfileId;
  await loadManagedProfiles();
  setStatus("success", `Managed profile created: ${response.managedProfile?.managedProfileId || "unknown"}`);
}

async function handleUpdateManagedProfile() {
  const payload = parseJsonInput("managed-profile-update", {});
  if (!payload.managedProfileId) {
    throw new Error("managedProfileId is required in the update payload");
  }
  await rpcCall(METHODS.managedProfilesUpdate, payload);
  state.selectedManagedProfileId = payload.managedProfileId;
  await loadManagedProfiles();
  setStatus("success", `Managed profile updated: ${payload.managedProfileId}`);
}

async function handleArchiveManagedProfile() {
  if (!state.selectedManagedProfileId) {
    throw new Error("Select a managed profile first");
  }
  await rpcCall(METHODS.managedProfilesArchive, {
    managedProfileId: state.selectedManagedProfileId,
  });
  await loadManagedProfiles();
  setStatus("success", `Managed profile archived: ${state.selectedManagedProfileId}`);
}

async function handleUpdateCohorts() {
  const cohorts = parseJsonInput("cohorts-update", []);
  await rpcCall(METHODS.cohortsUpdate, { cohorts });
  await loadCohorts();
  await loadNetwork();
  setStatus("success", "Cohorts replaced.");
}

async function handlePublishSeeds() {
  const records = parseJsonInput("seed-publish", []);
  await rpcCall(METHODS.benchmarksSeedPublish, { records });
  await loadNetwork();
  await loadAudit();
  setStatus("success", "Seed dataset published.");
}

async function handleUpdateProductFlag() {
  const key = document.getElementById("product-flag-key").value.trim();
  if (!key) {
    throw new Error("Flag key is required");
  }
  const rawValue = document.getElementById("product-flag-value").value.trim();
  const value = rawValue ? JSON.parse(rawValue) : true;
  const description = document.getElementById("product-flag-description").value.trim();
  await rpcCall(METHODS.productFlagsUpdate, {
    key,
    value,
    description,
  });
  await loadProductFlags();
  await loadOverview();
  setStatus("success", `Product flag updated: ${key}`);
}

function wireButtons() {
  document.getElementById("refresh-all").addEventListener("click", refreshAll);
  document.getElementById("managed-include-archived").addEventListener("change", () => {
    loadManagedProfiles().catch((error) => {
      setStatus("error", error instanceof Error ? error.message : String(error));
    });
  });
  document.getElementById("managed-profile-create-button").addEventListener("click", () => {
    handleCreateManagedProfile().catch((error) => {
      setStatus("error", error instanceof Error ? error.message : String(error));
    });
  });
  document.getElementById("managed-profile-update-button").addEventListener("click", () => {
    handleUpdateManagedProfile().catch((error) => {
      setStatus("error", error instanceof Error ? error.message : String(error));
    });
  });
  document.getElementById("managed-profile-load-button").addEventListener("click", () => {
    loadManagedProfileSelection().catch((error) => {
      setStatus("error", error instanceof Error ? error.message : String(error));
    });
  });
  document.getElementById("managed-profile-archive-button").addEventListener("click", () => {
    handleArchiveManagedProfile().catch((error) => {
      setStatus("error", error instanceof Error ? error.message : String(error));
    });
  });
  document.getElementById("managed-profile-fill-sample").addEventListener("click", () => {
    document.getElementById("managed-profile-create").value = sampleManagedProfile();
  });
  document.getElementById("cohorts-fill-sample").addEventListener("click", () => {
    document.getElementById("cohorts-update").value = sampleCohorts();
  });
  document.getElementById("seed-fill-sample").addEventListener("click", () => {
    document.getElementById("seed-publish").value = sampleSeeds();
  });
  document.getElementById("cohorts-update-button").addEventListener("click", () => {
    handleUpdateCohorts().catch((error) => {
      setStatus("error", error instanceof Error ? error.message : String(error));
    });
  });
  document.getElementById("seed-publish-button").addEventListener("click", () => {
    handlePublishSeeds().catch((error) => {
      setStatus("error", error instanceof Error ? error.message : String(error));
    });
  });
  document.getElementById("product-flag-update-button").addEventListener("click", () => {
    handleUpdateProductFlag().catch((error) => {
      setStatus("error", error instanceof Error ? error.message : String(error));
    });
  });
  document.querySelectorAll("[data-refresh]").forEach((button) => {
    button.addEventListener("click", async () => {
      const section = button.getAttribute("data-refresh");
      try {
        if (section === "overview") await loadOverview();
        if (section === "diagnostics") await loadDiagnostics();
        if (section === "network") await loadNetwork();
        if (section === "managed-profiles") await loadManagedProfiles();
        if (section === "clinics") await loadClinics();
        if (section === "cohorts") await loadCohorts();
        if (section === "product-flags") await loadProductFlags();
        if (section === "audit") await loadAudit();
        setStatus("success", `${section} refreshed.`);
      } catch (error) {
        setStatus("error", error instanceof Error ? error.message : String(error));
      }
    });
  });
}

document.getElementById("managed-profile-create").value = sampleManagedProfile();
document.getElementById("cohorts-update").value = sampleCohorts();
document.getElementById("seed-publish").value = sampleSeeds();
wireButtons();
refreshAll();
