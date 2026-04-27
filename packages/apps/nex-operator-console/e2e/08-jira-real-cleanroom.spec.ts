import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
import { waitForConsoleReady, navigateToTab, clickSubTab, screenshot } from './helpers';

const runtimeUrl = process.env.RUNTIME_URL?.trim() || '';
const runtimeToken = process.env.RUNTIME_TOKEN?.trim() || '';
const nexRoot = process.env.NEX_ROOT?.trim() || '';
const proofBundleDir = process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR?.trim() || '';
const proofAdapterId = process.env.NEXUS_PROOF_ADAPTER_ID?.trim() || '';
const proofAdapterPackageSourceDir = process.env.NEXUS_PROOF_ADAPTER_PACKAGE_SOURCE_DIR?.trim() || '';
const proofAdapterPackageVersion = process.env.NEXUS_PROOF_ADAPTER_PACKAGE_VERSION?.trim() || '';

const jiraMinRecords = Math.max(1, Number.parseInt(process.env.NEXUS_PROOF_JIRA_MIN_RECORDS ?? '5000', 10) || 5000);
const jiraMinContacts = Math.max(1, Number.parseInt(process.env.NEXUS_PROOF_JIRA_MIN_CONTACTS ?? '20', 10) || 20);
const jiraMinChannels = Math.max(1, Number.parseInt(process.env.NEXUS_PROOF_JIRA_MIN_CHANNELS ?? '100', 10) || 100);
const jiraBackfillTimeoutMs = Math.max(
  60_000,
  Number.parseInt(process.env.NEXUS_PROOF_JIRA_BACKFILL_TIMEOUT_MS ?? `${45 * 60_000}`, 10) || 45 * 60_000,
);
const jiraBackfillStallMs = Math.max(
  60_000,
  Number.parseInt(process.env.NEXUS_PROOF_JIRA_BACKFILL_STALL_MS ?? `${10 * 60_000}`, 10) || 10 * 60_000,
);

type RuntimeAdapterConnectionEntry = {
  connectionId?: string;
  adapter?: string;
  service?: string;
  status?: string;
  metadata?: {
    automatic_activation?: {
      backfill?: {
        status?: string;
        jobRunId?: string;
        existingRun?: boolean;
      };
    };
  };
  summary?: {
    recordCount?: number;
    channelCount?: number;
    contactCount?: number;
  };
  auth?: {
    methods?: Array<{
      id?: string;
      type?: string;
      label?: string;
      fields?: Array<{
        name?: string;
        label?: string;
        type?: string;
        required?: boolean;
      }>;
    }>;
  };
};

type RuntimeJobRun = {
  id?: string;
  status?: string;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  metrics_json?: string | null;
};

type RuntimeBackfillMetrics = {
  records_processed?: number;
  updated_at?: string | null;
  completed_at?: string | null;
  status?: string | null;
  last_error?: string | null;
};

type JiraBackfillSnapshot = {
  run: RuntimeJobRun | null;
  connection: RuntimeAdapterConnectionEntry | null;
  metrics: RuntimeBackfillMetrics | null;
  summary_counts: {
    records: number;
    contacts: number;
    channels: number;
  };
};

type JiraCredentials = {
  credentialId: string;
  email: string;
  apiToken: string;
  site: string;
};

type JiraProofAdapterRuntime = {
  adapterId: string;
  packageSourceDir: string;
  packageVersion: string;
};

function requireEnv(name: string, value: string): string {
  if (!value) {
    throw new Error(`${name} is required for the Jira cleanroom proof`);
  }
  return value;
}

function resolveProofAdapterRuntime(): JiraProofAdapterRuntime {
  const adapterId = requireEnv('NEXUS_PROOF_ADAPTER_ID', proofAdapterId);
  if (adapterId !== 'jira') {
    throw new Error(`expected NEXUS_PROOF_ADAPTER_ID=jira, got ${adapterId}`);
  }
  return {
    adapterId,
    packageSourceDir: requireEnv('NEXUS_PROOF_ADAPTER_PACKAGE_SOURCE_DIR', proofAdapterPackageSourceDir),
    packageVersion: requireEnv('NEXUS_PROOF_ADAPTER_PACKAGE_VERSION', proofAdapterPackageVersion),
  };
}

function runtimeCall<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 120_000): T {
  const root = requireEnv('NEX_ROOT', nexRoot);
  const url = requireEnv('RUNTIME_URL', runtimeUrl);
  const token = requireEnv('RUNTIME_TOKEN', runtimeToken);
  const raw = execFileSync(
    process.execPath,
    [
      path.join(root, 'nexus.mjs'),
      'runtime',
      'call',
      method,
      '--url',
      url,
      '--token',
      token,
      '--timeout',
      String(timeoutMs),
      '--json',
      '--params',
      JSON.stringify(params),
    ],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return JSON.parse(raw) as T;
}

function runNexusCli(args: string[]): string {
  const root = requireEnv('NEX_ROOT', nexRoot);
  return execFileSync(process.execPath, [path.join(root, 'nexus.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function parseJsonPayload(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('expected a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function resolveJiraCredentials(): JiraCredentials {
  const overrideEmail = process.env.JIRA_EMAIL?.trim() || '';
  const overrideToken = process.env.JIRA_API_TOKEN?.trim() || '';
  const overrideSite = process.env.JIRA_SITE?.trim() || '';
  if (overrideEmail && overrideToken && overrideSite) {
    return {
      credentialId: process.env.JIRA_CREDENTIAL_ID?.trim() || '',
      email: overrideEmail,
      apiToken: overrideToken,
      site: overrideSite,
    };
  }

  const listRaw = runNexusCli(['credentials', 'list', '--json']);
  const listPayload = parseJsonPayload(listRaw);
  const credentials = Array.isArray(listPayload.credentials) ? listPayload.credentials : [];
  const preferred = credentials.find((entry) => {
    const metadata = (entry as { metadata?: { adapter?: string } }).metadata;
    return metadata?.adapter === 'jira';
  });
  const candidate = preferred ?? credentials.find((entry) => {
    const service = (entry as { service?: string }).service;
    return service === 'atlassian';
  });
  const credentialId =
    (candidate as { id?: string })?.id?.trim() ||
    process.env.JIRA_CREDENTIAL_ID?.trim() ||
    '';
  if (!credentialId) {
    throw new Error('could not resolve a tracked Jira credential');
  }

  const resolvedRaw = runNexusCli([
    'credentials',
    'resolve',
    '--json',
    '--params',
    JSON.stringify({ id: credentialId }),
  ]);
  const resolvedPayload = parseJsonPayload(resolvedRaw);
  const valueRaw = typeof resolvedPayload.value === 'string' ? resolvedPayload.value : '{}';
  const value = parseJsonPayload(valueRaw);
  const email = typeof value.email === 'string' ? value.email.trim() : '';
  const apiToken = typeof value.api_token === 'string' ? value.api_token.trim() : '';
  const site = typeof value.site === 'string' ? value.site.trim() : '';
  if (!email || !apiToken || !site) {
    throw new Error('resolved Jira credential is missing email, api_token, or site');
  }

  return { credentialId, email, apiToken, site };
}

function getJiraConnection(connectionId: string): RuntimeAdapterConnectionEntry {
  const payload = runtimeCall<{ connections?: RuntimeAdapterConnectionEntry[] }>('adapters.connections.list', {}, 120_000);
  const connection = (payload.connections ?? []).find((entry) => entry.connectionId === connectionId);
  if (!connection) {
    throw new Error(`Jira connection ${connectionId} not found in adapters.connections.list`);
  }
  return connection;
}

async function waitForBackfillJobRunId(connectionId: string, timeout = 60_000): Promise<string> {
  let jobRunId = '';
  await expect
    .poll(
      () => {
        const connection = getJiraConnection(connectionId);
        const backfill = connection.metadata?.automatic_activation?.backfill;
        jobRunId = typeof backfill?.jobRunId === 'string' ? backfill.jobRunId.trim() : '';
        return jobRunId;
      },
      { timeout, intervals: [1_000, 2_000, 3_000] },
    )
    .not.toBe('');
  return jobRunId;
}

function parseRuntimeBackfillMetrics(raw: string | null | undefined): RuntimeBackfillMetrics | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as RuntimeBackfillMetrics;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function summarizeBackfillProgress(snapshot: JiraBackfillSnapshot): string {
  const status = snapshot.run?.status ?? snapshot.metrics?.status ?? 'unknown';
  const records =
    snapshot.connection?.summary?.recordCount ??
    snapshot.metrics?.records_processed ??
    snapshot.summary_counts.records;
  const contacts = snapshot.connection?.summary?.contactCount ?? snapshot.summary_counts.contacts;
  const channels = snapshot.connection?.summary?.channelCount ?? snapshot.summary_counts.channels;
  const updatedAt = snapshot.metrics?.updated_at ?? snapshot.run?.completed_at ?? snapshot.run?.started_at ?? 'n/a';
  return `status=${status} records=${records} contacts=${contacts} channels=${channels} updated_at=${updatedAt}`;
}

function readJiraBackfillSnapshot(connectionId: string, jobRunId: string): JiraBackfillSnapshot {
  const payload = runtimeCall<{ run?: RuntimeJobRun }>('jobs.runs.get', { id: jobRunId }, 120_000);
  const run = payload.run ?? null;
  const connection = getJiraConnection(connectionId);
  const metrics = parseRuntimeBackfillMetrics(run?.metrics_json);
  return {
    run,
    connection,
    metrics,
    summary_counts: {
      records: Number(connection.summary?.recordCount ?? 0),
      contacts: Number(connection.summary?.contactCount ?? 0),
      channels: Number(connection.summary?.channelCount ?? 0),
    },
  };
}

async function waitForBackfillCompletion(
  connectionId: string,
  jobRunId: string,
  onSnapshot?: (snapshot: JiraBackfillSnapshot) => void,
): Promise<JiraBackfillSnapshot> {
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let lastProgressMarker = '';
  let lastSnapshot: JiraBackfillSnapshot | null = null;

  while (Date.now() - startedAt <= jiraBackfillTimeoutMs) {
    const snapshot = readJiraBackfillSnapshot(connectionId, jobRunId);
    lastSnapshot = snapshot;
    onSnapshot?.(snapshot);

    const runStatus = snapshot.run?.status ?? '';
    if (runStatus === 'completed') {
      return snapshot;
    }
    if (runStatus === 'failed' || runStatus === 'cancelled') {
      throw new Error(`Jira backfill ${jobRunId} ended with ${runStatus}: ${snapshot.run?.error ?? 'no error message'}`);
    }

    const progressMarker = JSON.stringify({
      run_status: runStatus,
      records_processed: snapshot.metrics?.records_processed ?? null,
      metrics_updated_at: snapshot.metrics?.updated_at ?? null,
      summary_records: snapshot.summary_counts.records,
      summary_contacts: snapshot.summary_counts.contacts,
      summary_channels: snapshot.summary_counts.channels,
    });
    if (progressMarker !== lastProgressMarker) {
      lastProgressMarker = progressMarker;
      lastProgressAt = Date.now();
      console.log(`[jira-backfill-progress] ${summarizeBackfillProgress(snapshot)}`);
    }

    if (Date.now() - lastProgressAt > jiraBackfillStallMs) {
      throw new Error(
        `Jira backfill ${jobRunId} stalled for ${formatDuration(jiraBackfillStallMs)}; last observed ${summarizeBackfillProgress(snapshot)}`,
      );
    }

    await sleep(Date.now() - startedAt < 60_000 ? 2_000 : 10_000);
  }

  throw new Error(
    `Jira backfill ${jobRunId} did not complete within ${formatDuration(jiraBackfillTimeoutMs)}${
      lastSnapshot ? `; last observed ${summarizeBackfillProgress(lastSnapshot)}` : ''
    }`,
  );
}

function countRuntimeCollection(method: string, resultKey: string, params: Record<string, unknown>): number {
  let total = 0;
  const limit = 1000;
  for (let offset = 0; ; offset += limit) {
    const payload = runtimeCall<Record<string, unknown>>(method, { ...params, limit, offset }, 120_000);
    const items = Array.isArray(payload[resultKey]) ? (payload[resultKey] as unknown[]) : [];
    total += items.length;
    if (items.length < limit) {
      return total;
    }
  }
}

function writeJiraProofSummary(summary: Record<string, unknown>) {
  if (!proofBundleDir) {
    return;
  }
  fs.writeFileSync(
    path.join(proofBundleDir, 'jira-ingest-summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
    'utf8',
  );
}

function formatDuration(ms: number): string {
  if (ms < 60_000) {
    return `${Math.round(ms / 1_000)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1_000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForIntegrationMessage(page: Page, needle: RegExp) {
  await expect
    .poll(async () => {
      const texts = await page.locator('.callout').allTextContents();
      return texts.join(' ');
    }, { timeout: 60_000 })
    .toMatch(needle);
}

async function refreshCurrentSurface(page: Page) {
  const buttons = page.getByRole('button', { name: /^Refresh$/ });
  if (await buttons.count()) {
    await buttons.first().click();
    await page.waitForTimeout(800);
  }
}

async function waitForJiraTableRowWithRefresh(page: Page, timeout = 180_000) {
  await expect
    .poll(
      async () => {
        await refreshCurrentSurface(page);
        return await page.locator('.console-table tbody tr').filter({ hasText: /jira/i }).count();
      },
      { timeout, intervals: [1_000, 2_000, 3_000, 5_000] },
  )
    .toBeGreaterThan(0);
}

test.describe('Operator Console Jira cleanroom proof', () => {
  test('connects Jira through the Console UI, waits for backfill completion, and surfaces ingested data', async ({ page }) => {
    test.setTimeout(jiraBackfillTimeoutMs + 15 * 60_000);

    const proofAdapter = resolveProofAdapterRuntime();
    const jira = resolveJiraCredentials();

    await waitForConsoleReady(page);

    await navigateToTab(page, 'Connectors');
    await expect(page.getByRole('heading', { name: 'Connectors' })).toBeVisible();

    const jiraRow = page
      .locator('.console-table tbody tr')
      .filter({ hasText: /Jira/i })
      .first();
    await expect(jiraRow).toBeVisible({ timeout: 60_000 });
    await jiraRow.click();
    await screenshot(page, 'jira-connectors-selected');

    const selectedCard = page.locator('section.console-card').filter({ hasText: /Jira/i }).last();
    await expect(selectedCard).toBeVisible();

    const authSelect = selectedCard.locator('select').first();
    if (await authSelect.count()) {
      await authSelect.selectOption('atlassian_api_key');
    }

    const advanced = selectedCard.locator('details.connect-advanced').first();
    await advanced.evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });

    const payloadEditor = selectedCard.locator('textarea').first();
    await payloadEditor.fill(
      JSON.stringify(
        {
          fields: {
            site: jira.site,
            email: jira.email,
            api_token: jira.apiToken,
          },
          config: {
            backfill_since: '2026-01-01T00:00:00Z',
            poll_interval: '5s',
            projects: ['VT'],
          },
        },
        null,
        2,
      ),
    );

    const connectButton = selectedCard.getByRole('button', { name: /Connect|Update Connection/ }).first();
    await connectButton.click();
    await waitForIntegrationMessage(page, /jira: (connected|updated)/i);
    await screenshot(page, 'jira-connected');

    const connectionId = await selectedCard.locator('input[readonly]').first().inputValue();
    expect(connectionId).toMatch(/[0-9a-f-]{8,}/i);

    const proofSummary: Record<string, unknown> = {
      proof_mode: 'adapter-real',
      adapter_id: proofAdapter.adapterId,
      package_source_dir: proofAdapter.packageSourceDir,
      package_version: proofAdapter.packageVersion,
      connection_id: connectionId,
      minimum_expected_counts: {
        records: jiraMinRecords,
        contacts: jiraMinContacts,
        channels: jiraMinChannels,
      },
      status: 'running',
      credential_id: jira.credentialId,
    };

    await selectedCard.getByRole('button', { name: /^(Test connection|Test)$/ }).click();
    await waitForIntegrationMessage(page, /jira: connection test passed/i);
    await screenshot(page, 'jira-test-connection-passed');

    await selectedCard.getByRole('button', { name: /^(Backfill now|Backfill)$/ }).click();
    await waitForIntegrationMessage(page, /jira: backfill (queued|already running)/i);
    await screenshot(page, 'jira-backfill-triggered');

    const backfillJobRunId = await waitForBackfillJobRunId(connectionId);
    try {
      const backfillSnapshot = await waitForBackfillCompletion(connectionId, backfillJobRunId, (snapshot) => {
        proofSummary.backfill_status = snapshot.run?.status ?? null;
        proofSummary.backfill_started_at = snapshot.run?.started_at ?? null;
        proofSummary.backfill_completed_at = snapshot.run?.completed_at ?? null;
        proofSummary.backfill_metrics = snapshot.metrics ?? null;
        proofSummary.adapter_summary = snapshot.connection?.summary ?? null;
        proofSummary.observed_counts = snapshot.summary_counts;
        writeJiraProofSummary(proofSummary);
      });

      const observedRecordCount = countRuntimeCollection('records.list', 'records', { platform: 'jira' });
      const observedContactCount = countRuntimeCollection('contacts.list', 'contacts', { platform: 'jira' });
      const observedChannelCount = countRuntimeCollection('channels.list', 'channels', { platform: 'jira' });

      expect(observedRecordCount).toBeGreaterThanOrEqual(jiraMinRecords);
      expect(observedContactCount).toBeGreaterThanOrEqual(jiraMinContacts);
      expect(observedChannelCount).toBeGreaterThanOrEqual(jiraMinChannels);

      proofSummary.status = 'completed';
      proofSummary.backfill_status = backfillSnapshot.run?.status ?? null;
      proofSummary.backfill_started_at = backfillSnapshot.run?.started_at ?? null;
      proofSummary.backfill_completed_at = backfillSnapshot.run?.completed_at ?? null;
      proofSummary.backfill_metrics = backfillSnapshot.metrics ?? null;
      proofSummary.adapter_summary = backfillSnapshot.connection?.summary ?? null;
      proofSummary.observed_counts = {
        records: observedRecordCount,
        contacts: observedContactCount,
        channels: observedChannelCount,
      };
      writeJiraProofSummary(proofSummary);

      await navigateToTab(page, 'Records');
      await waitForJiraTableRowWithRefresh(page);
      await screenshot(page, 'jira-records-browse');

      await clickSubTab(page, 'Channels');
      await waitForJiraTableRowWithRefresh(page);
      await screenshot(page, 'jira-records-channels');

      await navigateToTab(page, 'Identity');
      await clickSubTab(page, 'Contacts');
      await waitForJiraTableRowWithRefresh(page);
      await screenshot(page, 'jira-identity-contacts');

      await clickSubTab(page, 'Channels');
      await waitForJiraTableRowWithRefresh(page);
      await screenshot(page, 'jira-identity-channels');
    } catch (error) {
      proofSummary.status = 'failed';
      proofSummary.error = error instanceof Error ? error.message : String(error);
      writeJiraProofSummary(proofSummary);
      throw error;
    }
  });
});
