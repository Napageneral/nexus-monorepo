import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
import { waitForConsoleReady, navigateToTab, clickSubTab, screenshot } from './helpers';

const githubCredentialId = process.env.GITHUB_CREDENTIAL_ID?.trim() || 'a322b354-6e39-49e0-99a7-eeaadca62d59';
const githubHost = process.env.NEXUS_PROOF_GITHUB_HOST?.trim() || 'https://api.github.com';
const githubUsername = process.env.NEXUS_PROOF_GITHUB_USERNAME?.trim() || 'Napageneral';
const githubWorkspace = process.env.NEXUS_PROOF_GITHUB_WORKSPACE?.trim() || 'caseychuping1';
const runtimeUrl = process.env.RUNTIME_URL?.trim() || '';
const runtimeToken = process.env.RUNTIME_TOKEN?.trim() || '';
const nexRoot = process.env.NEX_ROOT?.trim() || '';
const proofBundleDir = process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR?.trim() || '';
const githubMinRecords = Math.max(1, Number.parseInt(process.env.NEXUS_PROOF_GITHUB_MIN_RECORDS ?? '5000', 10) || 5000);
const githubMinContacts = Math.max(1, Number.parseInt(process.env.NEXUS_PROOF_GITHUB_MIN_CONTACTS ?? '2', 10) || 2);
const githubMinChannels = Math.max(1, Number.parseInt(process.env.NEXUS_PROOF_GITHUB_MIN_CHANNELS ?? '10', 10) || 10);
const githubBackfillTimeoutMs = Math.max(
  60_000,
  Number.parseInt(process.env.NEXUS_PROOF_GITHUB_BACKFILL_TIMEOUT_MS ?? `${45 * 60_000}`, 10) || 45 * 60_000,
);
const githubBackfillStallMs = Math.max(
  60_000,
  Number.parseInt(process.env.NEXUS_PROOF_GITHUB_BACKFILL_STALL_MS ?? `${10 * 60_000}`, 10) || 10 * 60_000,
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
      monitor?: {
        started?: boolean;
        running?: boolean;
      };
    };
    adapter_config?: {
      host?: string;
      username?: string;
      workspace?: string;
      repositories?: Array<{
        full_name?: string;
        name?: string;
      }>;
    };
  };
  summary?: {
    recordCount?: number;
    channelCount?: number;
    contactCount?: number;
    participantCount?: number;
    spaces?: string[];
    containers?: string[];
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

type GitHubBackfillSnapshot = {
  run: RuntimeJobRun | null;
  connection: RuntimeAdapterConnectionEntry | null;
  metrics: RuntimeBackfillMetrics | null;
  summary_counts: {
    records: number;
    contacts: number;
    channels: number;
  };
};

function requireEnv(name: string, value: string): string {
  if (!value) {
    throw new Error(`${name} is required for the GitHub cleanroom proof`);
  }
  return value;
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

function resolveGitHubToken(): { token: string; username: string } {
  const resolved = runtimeCall<{ value?: string }>('credentials.resolve', { id: githubCredentialId }, 120_000);
  const rawValue = typeof resolved.value === 'string' ? resolved.value.trim() : '';
  if (!rawValue) {
    throw new Error(`credentials.resolve returned an empty value for GitHub credential ${githubCredentialId}`);
  }
  let parsed: { token?: string; username?: string } | null = null;
  try {
    parsed = JSON.parse(rawValue) as { token?: string; username?: string };
  } catch (error) {
    throw new Error(
      `credentials.resolve for GitHub credential ${githubCredentialId} returned non-JSON value: ${String(error)}`,
    );
  }
  const token = typeof parsed?.token === 'string' ? parsed.token.trim() : '';
  if (!token) {
    throw new Error(`credentials.resolve for GitHub credential ${githubCredentialId} did not include a token`);
  }
  const username = typeof parsed?.username === 'string' && parsed.username.trim() ? parsed.username.trim() : githubUsername;
  return { token, username };
}

function getGitHubConnection(connectionId: string): RuntimeAdapterConnectionEntry {
  const payload = runtimeCall<{ connections?: RuntimeAdapterConnectionEntry[] }>('adapters.connections.list', {}, 120_000);
  const connection = (payload.connections ?? []).find((entry) => entry.connectionId === connectionId);
  if (!connection) {
    throw new Error(`GitHub connection ${connectionId} not found in adapters.connections.list`);
  }
  return connection;
}

async function waitForBackfillJobRunId(connectionId: string, timeout = 60_000): Promise<string> {
  let jobRunId = '';
  await expect
    .poll(
      () => {
        const connection = getGitHubConnection(connectionId);
        const backfill = connection.metadata?.automatic_activation?.backfill;
        jobRunId = typeof backfill?.jobRunId === 'string' ? backfill.jobRunId.trim() : '';
        return jobRunId;
      },
      { timeout, intervals: [1_000, 2_000, 3_000] },
    )
    .not.toBe('');
  return jobRunId;
}

async function waitForBackfillCompletion(
  connectionId: string,
  jobRunId: string,
  onSnapshot?: (snapshot: GitHubBackfillSnapshot) => void,
): Promise<GitHubBackfillSnapshot> {
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let lastProgressMarker = '';
  let lastSnapshot: GitHubBackfillSnapshot | null = null;

  while (Date.now() - startedAt <= githubBackfillTimeoutMs) {
    const snapshot = readGitHubBackfillSnapshot(connectionId, jobRunId);
    lastSnapshot = snapshot;
    onSnapshot?.(snapshot);

    const runStatus = snapshot.run?.status ?? '';
    if (runStatus === 'completed') {
      return snapshot;
    }
    if (runStatus === 'failed' || runStatus === 'cancelled') {
      throw new Error(`GitHub backfill ${jobRunId} ended with ${runStatus}: ${snapshot.run?.error ?? 'no error message'}`);
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
      console.log(`[github-backfill-progress] ${summarizeBackfillProgress(snapshot)}`);
    }

    if (Date.now() - lastProgressAt > githubBackfillStallMs) {
      throw new Error(
        `GitHub backfill ${jobRunId} stalled for ${formatDuration(githubBackfillStallMs)}; last observed ${summarizeBackfillProgress(snapshot)}`,
      );
    }

    await sleep(Date.now() - startedAt < 60_000 ? 2_000 : 10_000);
  }

  throw new Error(
    `GitHub backfill ${jobRunId} did not complete within ${formatDuration(githubBackfillTimeoutMs)}${
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

function writeGitHubProofSummary(summary: Record<string, unknown>) {
  if (!proofBundleDir) {
    return;
  }
  fs.writeFileSync(
    path.join(proofBundleDir, 'github-ingest-summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
    'utf8',
  );
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

function formatDuration(ms: number): string {
  if (ms < 60_000) {
    return `${Math.round(ms / 1_000)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1_000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function summarizeBackfillProgress(snapshot: GitHubBackfillSnapshot): string {
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

function readGitHubBackfillSnapshot(connectionId: string, jobRunId: string): GitHubBackfillSnapshot {
  const payload = runtimeCall<{ run?: RuntimeJobRun }>('jobs.runs.get', { id: jobRunId }, 120_000);
  const run = payload.run ?? null;
  const connection = getGitHubConnection(connectionId);
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
  await page.getByRole('button', { name: /^Refresh$/ }).click();
  await page.waitForTimeout(800);
}

async function setGitHubPlatformFilter(page: Page) {
  const platformSelect = page.getByRole('combobox').first();
  await expect(platformSelect).toBeVisible();
  await platformSelect.selectOption('git');
  await page.waitForTimeout(300);
}

async function waitForTableRowWithRefresh(page: Page, needle: RegExp, timeout = 180_000) {
  await expect
    .poll(
      async () => {
        await refreshCurrentSurface(page);
        return await page.locator('.console-table tbody tr, .table tbody tr').filter({ hasText: needle }).count();
      },
      { timeout, intervals: [1_000, 2_000, 3_000, 5_000] },
    )
    .toBeGreaterThan(0);
}

test.describe('Operator Console GitHub cleanroom proof', () => {
  test.skip(!githubCredentialId, 'GITHUB_CREDENTIAL_ID is required for the GitHub cleanroom proof');

  test('connects GitHub through the Console UI and surfaces ingested data', async ({ page }) => {
    test.setTimeout(githubBackfillTimeoutMs + 10 * 60_000);

    const { token: githubToken, username: resolvedUsername } = resolveGitHubToken();
    const githubConnection = {
      host: githubHost,
      username: resolvedUsername || githubUsername,
      workspace: githubWorkspace,
      token: githubToken,
    };

    await waitForConsoleReady(page);

    await navigateToTab(page, 'Connectors');
    await expect(page.getByText('Select Adapter')).toBeVisible();

    const githubCard = page
      .locator('.connect-adapter-card')
      .filter({ hasText: /GitHub Adapter/i })
      .first();
    await expect(githubCard).toBeVisible({ timeout: 30_000 });
    await githubCard.click();
    await screenshot(page, 'github-connectors-selected');

    const authSelect = page.locator('select').first();
    await expect(authSelect).toBeVisible();
    await authSelect.selectOption('github_api_key');

    const advanced = page.locator('details.connect-advanced').first();
    await advanced.evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });

    const payloadEditor = page.locator('textarea').first();
    await payloadEditor.fill(JSON.stringify(githubConnection, null, 2));

    await page.getByRole('button', { name: /^Start Setup$/ }).click();
    await waitForIntegrationMessage(page, /github: (requires_input|completed|pending|connected)/i);
    await screenshot(page, 'github-setup-started');

    const submitButton = page.getByRole('button', { name: /^Submit$/ });
    if (await submitButton.isVisible()) {
      await submitButton.click();
      await waitForIntegrationMessage(page, /github: (completed|connected)/i);
      await screenshot(page, 'github-setup-submitted');
    }

    const connectionId = await page.locator('input[readonly]').first().inputValue();
    expect(connectionId).toMatch(/[0-9a-f-]{8,}/i);

    await page.getByRole('button', { name: /^Test$/ }).click();
    await waitForIntegrationMessage(page, /connection test passed/i);
    await screenshot(page, 'github-test-connection-passed');

    await page.getByRole('button', { name: /^Backfill$/ }).click();
    await waitForIntegrationMessage(page, /backfill (queued|already running)/i);
    await screenshot(page, 'github-backfill-triggered');

    const backfillJobRunId = await waitForBackfillJobRunId(connectionId);
    const proofSummary: Record<string, unknown> = {
      connection_id: connectionId,
      connection_summary: null,
      backfill_job_run_id: backfillJobRunId,
      minimum_expected_counts: {
        records: githubMinRecords,
        contacts: githubMinContacts,
        channels: githubMinChannels,
      },
      status: 'running',
    };

    try {
      const backfillSnapshot = await waitForBackfillCompletion(connectionId, backfillJobRunId, (snapshot) => {
        proofSummary.backfill_status = snapshot.run?.status ?? null;
        proofSummary.backfill_started_at = snapshot.run?.started_at ?? null;
        proofSummary.backfill_completed_at = snapshot.run?.completed_at ?? null;
        proofSummary.backfill_metrics = snapshot.metrics ?? null;
        proofSummary.connection_summary = snapshot.connection?.summary ?? null;
        proofSummary.observed_counts = snapshot.summary_counts;
        writeGitHubProofSummary(proofSummary);
      });

      const observedRecordCount = countRuntimeCollection('records.list', 'records', { platform: 'git' });
      const observedContactCount = countRuntimeCollection('contacts.list', 'contacts', { platform: 'github' });
      const observedChannelCount = countRuntimeCollection('channels.list', 'channels', { platform: 'git' });

      expect(observedRecordCount).toBeGreaterThanOrEqual(githubMinRecords);
      expect(observedContactCount).toBeGreaterThanOrEqual(githubMinContacts);
      expect(observedChannelCount).toBeGreaterThanOrEqual(githubMinChannels);

      proofSummary.status = 'completed';
      proofSummary.backfill_status = backfillSnapshot.run?.status ?? null;
      proofSummary.backfill_started_at = backfillSnapshot.run?.started_at ?? null;
      proofSummary.backfill_completed_at = backfillSnapshot.run?.completed_at ?? null;
      proofSummary.backfill_metrics = backfillSnapshot.metrics ?? null;
      proofSummary.connection_summary = backfillSnapshot.connection?.summary ?? null;
      proofSummary.observed_counts = {
        records: observedRecordCount,
        contacts: observedContactCount,
        channels: observedChannelCount,
      };
      writeGitHubProofSummary(proofSummary);

      await navigateToTab(page, 'Records');
      await setGitHubPlatformFilter(page);
      await waitForTableRowWithRefresh(page, /git/i);
      await screenshot(page, 'github-records-browse');

      await clickSubTab(page, 'Channels');
      await waitForTableRowWithRefresh(page, /git|github/i);
      await screenshot(page, 'github-records-channels');

      await navigateToTab(page, 'Identity');
      await clickSubTab(page, 'Contacts');
      await waitForTableRowWithRefresh(page, /github/i);
      await screenshot(page, 'github-identity-contacts');

      await clickSubTab(page, 'Channels');
      await waitForTableRowWithRefresh(page, /git|github/i);
      await screenshot(page, 'github-identity-channels');
    } catch (error) {
      proofSummary.status = 'failed';
      proofSummary.error = error instanceof Error ? error.message : String(error);
      writeGitHubProofSummary(proofSummary);
      throw error;
    }
  });
});
