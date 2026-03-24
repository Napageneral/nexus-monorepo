export type InstalledApp = {
  id: string;
  version?: string | null;
  display_name?: string | null;
  description?: string | null;
  package_dir?: string | null;
  status?: string | null;
};

export type InstalledAppMethod = {
  name: string;
  action?: string | null;
  description?: string | null;
  service?: string | null;
};

type AppsListResult = {
  apps?: InstalledApp[];
};

type AppsMethodsResult = {
  methods?: InstalledAppMethod[];
};

export type AppsState = {
  client: {
    request<T = unknown>(method: string, params?: unknown): Promise<T>;
  } | null;
  connected: boolean;
  appsLoading: boolean;
  appsError: string | null;
  installedApps: InstalledApp[];
  selectedAppId: string;
  appMethodsLoading: boolean;
  appMethodsError: string | null;
  appMethods: InstalledAppMethod[];
};

function normalizeApps(result: AppsListResult | undefined): InstalledApp[] {
  if (!Array.isArray(result?.apps)) {
    return [];
  }
  return result.apps;
}

function normalizeMethods(result: AppsMethodsResult | undefined): InstalledAppMethod[] {
  if (!Array.isArray(result?.methods)) {
    return [];
  }
  return result.methods;
}

function syncSelectedApp(state: AppsState) {
  const selected = state.selectedAppId.trim();
  if (selected && state.installedApps.some((app) => app.id === selected)) {
    return;
  }
  state.selectedAppId = state.installedApps[0]?.id ?? "";
}

export async function loadInstalledApps(state: AppsState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.appsLoading) {
    return;
  }
  state.appsLoading = true;
  state.appsError = null;
  try {
    const result = await state.client.request<AppsListResult>("apps.list", {});
    state.installedApps = normalizeApps(result);
    syncSelectedApp(state);
    if (state.selectedAppId) {
      await loadInstalledAppMethods(state, state.selectedAppId);
    } else {
      state.appMethods = [];
      state.appMethodsError = null;
    }
  } catch (error) {
    state.appsError = error instanceof Error ? error.message : String(error);
  } finally {
    state.appsLoading = false;
  }
}

export async function loadInstalledAppMethods(state: AppsState, id: string) {
  if (!state.client || !state.connected) {
    return;
  }
  const trimmed = id.trim();
  if (!trimmed) {
    state.appMethods = [];
    state.selectedAppId = "";
    return;
  }
  state.selectedAppId = trimmed;
  state.appMethodsLoading = true;
  state.appMethodsError = null;
  try {
    const result = await state.client.request<AppsMethodsResult>("apps.methods", { id: trimmed });
    state.appMethods = normalizeMethods(result);
  } catch (error) {
    state.appMethodsError = error instanceof Error ? error.message : String(error);
  } finally {
    state.appMethodsLoading = false;
  }
}
