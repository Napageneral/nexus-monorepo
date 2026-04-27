import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
import { waitForConsoleReady, navigateToTab, clickSubTab, screenshot } from './helpers';

const runtimeUrl = process.env.RUNTIME_URL?.trim() || '';
const runtimeToken = process.env.RUNTIME_TOKEN?.trim() || '';
const nexRoot = process.env.NEX_ROOT?.trim() || '';
const proofBundleDir = process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR?.trim() || '';
const confluenceEmail = process.env.CONFLUENCE_EMAIL?.trim() || '';
const confluenceApiToken = process.env.CONFLUENCE_API_TOKEN?.trim() || '';
const confluenceSite = process.env.CONFLUENCE_SITE?.trim() || '';
const confluencePreferredSpace = process.env.CONFLUENCE_PREFERRED_SPACE?.trim() || 'AutoQA';
const confluenceMinRecords = Math.max(1, Number.parseInt(process.env.NEXUS_PROOF_CONFLUENCE_MIN_RECORDS ?? '40', 10) || 40);
const confluenceMinContacts = Math.max(1, Number.parseInt(process.env.NEXUS_PROOF_CONFLUENCE_MIN_CONTACTS ?? '4', 10) || 4);
const confluenceMinChannels = Math.max(1, Number.parseInt(process.env.NEXUS_PROOF_CONFLUENCE_MIN_CHANNELS ?? '1', 10) || 1);
const confluenceBackfillTimeoutMs = Math.max(
  60_000,
  Number.parseInt(process.env.NEXUS_PROOF_CONFLUENCE_BACKFILL_TIMEOUT_MS ?? `${30 * 60_000}`, 10) || 30 * 60_000,
);
const confluenceBackfillStallMs = Math.max(
  60_000,
  Number.parseInt(process.env.NEXUS_PROOF_CONFLUENCE_BACKFILL_STALL_MS ?? `${5 * 60_000}`, 10) || 5 * 60_000,
);

type RuntimeAdapterConnectionEntry = {
  connectionId?: string;
  adapter?: string;
  service?: string;
  name?: string;
  status?: string;
  account?: string | null;
  authMethodId?: string | null;
  authMethod?: string | null;
  auth?: {
    methods?: Array<{
      id?: string;
      type?: string;
      label?: string;
      service?: string;
      fields?: Array<{
        name?: string;
        label?: string;
        type?: string;
        required?: boolean;
      }>;
    }>;
    setupGuide?: string;
  };
  lastSync?: number | null;
  error?: string | null;
  summary?: {
    recordCount?: number;
    channelCount?: number;
    contactCount?: number;
  };
  metadata?: {
    automatic_activation?: {
      backfill?: {
        status?: string;
        jobRunId?: string;
      };
    };
    adapter_config?: {
      spaces?: Array<{ id?: string; key?: string; name?: string; label?: string }>;
    };
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

type ConfluenceBackfillSnapshot = {
  run: RuntimeJobRun | null;
  connection: RuntimeAdapterConnectionEntry | null;
  summary_counts: {
    records: number;
    contacts: number;
    channels: number;
  };
};

function requireEnv(name: string, value: string): string {
  if (!value) {
    throw new Error(`${name} is required for the Confluence cleanroom proof`);
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

function getConfluenceConnection(connectionId: string): RuntimeAdapterConnectionEntry {
  const payload = runtimeCall<{ connections?: RuntimeAdapterConnectionEntry[] }>('adapters.connections.list', {}, 120_000);
  const connection = (payload.connections ?? []).find((entry) => entry.connectionId === connectionId);
  if (!connection) {
    throw new Error(`Confluence connection ${connectionId} not found in adapters.connections.list`);
  }
  return connection;
}

function getConfluenceConnectionByAdapter(): RuntimeAdapterConnectionEntry {
  const payload = runtimeCall<{ connections?: RuntimeAdapterConnectionEntry[] }>('adapters.connections.list', {}, 120_000);
  const connection = (payload.connections ?? []).find((entry) => (entry.adapter ?? '').toLowerCase() === 'confluence');
  if (!connection) {
    throw new Error('Confluence connection not found in adapters.connections.list');
  }
  return connection;
}

async function waitForConfluenceConnection(timeout = 120_000): Promise<RuntimeAdapterConnectionEntry> {
  let connection: RuntimeAdapterConnectionEntry | null = null;
  await expect
    .poll(
      () => {
        connection = getConfluenceConnectionByAdapter();
        return connection?.connectionId?.trim() || connection?.account?.trim() || '';
      },
      { timeout, intervals: [1_000, 2_000, 3_000] },
    )
    .not.toBe('');
  return connection!;
}

async function waitForBackfillJobRunId(connectionId: string, timeout = 120_000): Promise<string> {
  let jobRunId = '';
  await expect
    .poll(
      () => {
        const connection = getConfluenceConnection(connectionId);
        const backfill = connection.metadata?.automatic_activation?.backfill;
        jobRunId = typeof backfill?.jobRunId === 'string' ? backfill.jobRunId.trim() : '';
        return jobRunId;
      },
      { timeout, intervals: [1_000, 2_000, 3_000] },
    )
    .not.toBe('');
  return jobRunId;
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

function parseRuntimeMetrics(raw: string | null | undefined): Record<string, unknown> | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeConfluenceProofSummary(summary: Record<string, unknown>) {
  if (!proofBundleDir) {
    return;
  }
  fs.writeFileSync(
    path.join(proofBundleDir, 'confluence-ingest-summary.json'),
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

function summarizeBackfillProgress(snapshot: ConfluenceBackfillSnapshot): string {
  const status = snapshot.run?.status ?? 'unknown';
  const records = snapshot.connection?.summary?.recordCount ?? snapshot.summary_counts.records;
  const contacts = snapshot.connection?.summary?.contactCount ?? snapshot.summary_counts.contacts;
  const channels = snapshot.connection?.summary?.channelCount ?? snapshot.summary_counts.channels;
  const updatedAt = snapshot.run?.completed_at ?? snapshot.run?.started_at ?? 'n/a';
  return `status=${status} records=${records} contacts=${contacts} channels=${channels} updated_at=${updatedAt}`;
}

function readConfluenceBackfillSnapshot(connectionId: string, jobRunId: string): ConfluenceBackfillSnapshot {
  const payload = runtimeCall<{ run?: RuntimeJobRun }>('jobs.runs.get', { id: jobRunId }, 120_000);
  const run = payload.run ?? null;
  const connection = getConfluenceConnection(connectionId);
  return {
    run,
    connection,
    summary_counts: {
      records: Number(connection.summary?.recordCount ?? 0),
      contacts: Number(connection.summary?.contactCount ?? 0),
      channels: Number(connection.summary?.channelCount ?? 0),
    },
  };
}

async function waitForConfluenceBackfillCompletion(
  connectionId: string,
  jobRunId: string,
  onSnapshot?: (snapshot: ConfluenceBackfillSnapshot) => void,
): Promise<ConfluenceBackfillSnapshot> {
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let lastProgressMarker = '';
  let lastSnapshot: ConfluenceBackfillSnapshot | null = null;

  while (Date.now() - startedAt <= confluenceBackfillTimeoutMs) {
    const snapshot = readConfluenceBackfillSnapshot(connectionId, jobRunId);
    lastSnapshot = snapshot;
    onSnapshot?.(snapshot);

    const runStatus = snapshot.run?.status ?? '';
    if (runStatus === 'completed') {
      return snapshot;
    }
    if (runStatus === 'failed' || runStatus === 'cancelled') {
      throw new Error(`Confluence backfill ${jobRunId} ended with ${runStatus}: ${snapshot.run?.error ?? 'no error message'}`);
    }

    const progressMarker = JSON.stringify({
      run_status: runStatus,
      summary_records: snapshot.summary_counts.records,
      summary_contacts: snapshot.summary_counts.contacts,
      summary_channels: snapshot.summary_counts.channels,
      connection_status: snapshot.connection?.status ?? null,
    });
    if (progressMarker !== lastProgressMarker) {
      lastProgressMarker = progressMarker;
      lastProgressAt = Date.now();
      console.log(`[confluence-backfill-progress] ${summarizeBackfillProgress(snapshot)}`);
    }

    if (Date.now() - lastProgressAt > confluenceBackfillStallMs) {
      throw new Error(
        `Confluence backfill ${jobRunId} stalled for ${formatDuration(confluenceBackfillStallMs)}; last observed ${summarizeBackfillProgress(snapshot)}`,
      );
    }

    await sleep(Date.now() - startedAt < 60_000 ? 2_000 : 10_000);
  }

  throw new Error(
    `Confluence backfill ${jobRunId} did not complete within ${formatDuration(confluenceBackfillTimeoutMs)}${
      lastSnapshot ? `; last observed ${summarizeBackfillProgress(lastSnapshot)}` : ''
    }`,
  );
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForIntegrationMessage(page: Page, needle: RegExp) {
  await expect
    .poll(async () => {
      const texts = await page.locator('.callout').allTextContents();
      return texts.join(' ');
    }, { timeout: 90_000 })
    .toMatch(needle);
}

async function setPlatformFilter(page: Page, platform: string) {
  const platformSelect = page.locator('select').first();
  await expect(platformSelect).toBeVisible();
  await platformSelect.selectOption(platform);
  await page.waitForTimeout(300);
}

async function waitForTableRowWithRefresh(page: Page, selector: string, timeout = 180_000) {
  await expect
    .poll(
      async () => {
        await page.getByRole('button', { name: /^Refresh$/ }).click();
        await page.waitForTimeout(800);
        return await page.locator(selector).count();
      },
      { timeout, intervals: [1_000, 2_000, 3_000, 5_000] },
    )
    .toBeGreaterThan(0);
}

function confluencePayload(values: Record<string, unknown>): string {
  return JSON.stringify(values, null, 2);
}

test.describe('Operator Console Confluence cleanroom proof', () => {
  test.skip(
    !runtimeUrl || !runtimeToken || !nexRoot || !confluenceEmail || !confluenceApiToken || !confluenceSite,
    'runtime token and Confluence credentials are required for the Confluence cleanroom proof',
  );

  test('connects Confluence through the Console UI and surfaces ingested data', async ({ page }) => {
    test.setTimeout(confluenceBackfillTimeoutMs + 15 * 60_000);

    await waitForConfluenceConnection();

    await waitForConsoleReady(page);
    await navigateToTab(page, 'Connectors');
    await expect(page.getByText('Select Adapter')).toBeVisible({ timeout: 30_000 });

    const confluenceRow = page
      .locator('tbody tr')
      .filter({ hasText: /Confluence Cloud|confluence/i })
      .first();
    await expect(confluenceRow).toBeVisible({ timeout: 30_000 });
    await confluenceRow.click();
    await screenshot(page, 'confluence-connectors-selected');

    const authSelect = page
      .locator('label.field')
      .filter({ hasText: /^Auth Method$/ })
      .locator('select')
      .first();
    await expect(authSelect).toBeVisible();
    await authSelect.selectOption('atlassian_api_key');

    const payloadEditor = page.locator('details.connect-advanced textarea').first();
    await expect(payloadEditor).toBeVisible();
    await payloadEditor.fill(
      confluencePayload({
        email: confluenceEmail,
        api_token: confluenceApiToken,
        site: confluenceSite,
      }),
    );

    await page.getByRole('button', { name: /^Start Setup$/ }).click();
    await waitForIntegrationMessage(page, /confluence: requires_input/i);
    await screenshot(page, 'confluence-setup-credentials-submitted');

    await expect(page.locator('input[readonly]').first()).toBeVisible();
    await expect(page.getByText(/Atlassian API Token/i)).toBeVisible();
    await expect(page.getByText(/Select at least one Confluence space to sync/i)).toBeVisible({ timeout: 30_000 });

    await payloadEditor.fill(
      confluencePayload({
        spaces: [confluencePreferredSpace],
      }),
    );
    await page.getByRole('button', { name: /^Submit$/ }).click();
    await waitForIntegrationMessage(page, /confluence: completed/i);
    await screenshot(page, 'confluence-connected');

    const connectionId = await page.locator('input[readonly]').first().inputValue();
    expect(connectionId).toMatch(/[0-9a-f-]{8,}/i);

    await page.getByRole('button', { name: /^Test$/ }).click();
    await waitForIntegrationMessage(page, /connection test passed/i);
    await screenshot(page, 'confluence-test-passed');

    await page.getByRole('button', { name: /^Backfill$/ }).click();
    await waitForIntegrationMessage(page, /backfill (queued|already running)/i);
    await screenshot(page, 'confluence-backfill-triggered');

    const backfillJobRunId = await waitForBackfillJobRunId(connectionId);
    const proofSummary: Record<string, unknown> = {
      connection_id: connectionId,
      preferred_space: confluencePreferredSpace,
      backfill_job_run_id: backfillJobRunId,
      minimum_expected_counts: {
        records: confluenceMinRecords,
        contacts: confluenceMinContacts,
        channels: confluenceMinChannels,
      },
      status: 'running',
    };

    try {
      const backfillSnapshot = await waitForConfluenceBackfillCompletion(connectionId, backfillJobRunId, (snapshot) => {
        proofSummary.backfill_status = snapshot.run?.status ?? null;
        proofSummary.backfill_started_at = snapshot.run?.started_at ?? null;
        proofSummary.backfill_completed_at = snapshot.run?.completed_at ?? null;
        proofSummary.adapter_summary = snapshot.connection?.summary ?? null;
        proofSummary.observed_counts = snapshot.summary_counts;
        writeConfluenceProofSummary(proofSummary);
      });

      const observedRecordCount = countRuntimeCollection('records.list', 'records', { platform: 'confluence' });
      const observedContactCount = countRuntimeCollection('contacts.list', 'contacts', { platform: 'confluence' });
      const observedChannelCount = countRuntimeCollection('channels.list', 'channels', { platform: 'confluence' });

      expect(observedRecordCount).toBeGreaterThanOrEqual(confluenceMinRecords);
      expect(observedContactCount).toBeGreaterThanOrEqual(confluenceMinContacts);
      expect(observedChannelCount).toBeGreaterThanOrEqual(confluenceMinChannels);

      proofSummary.status = 'completed';
      proofSummary.backfill_status = backfillSnapshot.run?.status ?? null;
      proofSummary.backfill_started_at = backfillSnapshot.run?.started_at ?? null;
      proofSummary.backfill_completed_at = backfillSnapshot.run?.completed_at ?? null;
      proofSummary.adapter_summary = backfillSnapshot.connection?.summary ?? null;
      proofSummary.observed_counts = {
        records: observedRecordCount,
        contacts: observedContactCount,
        channels: observedChannelCount,
      };
      writeConfluenceProofSummary(proofSummary);

      await navigateToTab(page, 'Records');
      await setPlatformFilter(page, 'confluence');
      await waitForTableRowWithRefresh(page, '.console-table tbody tr');
      await screenshot(page, 'confluence-records-browse');

      await clickSubTab(page, 'Channels');
      await waitForTableRowWithRefresh(page, '.console-table tbody tr');
      await screenshot(page, 'confluence-records-channels');

      await navigateToTab(page, 'Identity');
      await clickSubTab(page, 'Contacts');
      await waitForTableRowWithRefresh(page, '.console-table tbody tr');
      await screenshot(page, 'confluence-identity-contacts');

      await clickSubTab(page, 'Channels');
      await waitForTableRowWithRefresh(page, '.console-table tbody tr');
      await screenshot(page, 'confluence-identity-channels');
    } catch (error) {
      proofSummary.status = 'failed';
      proofSummary.error = error instanceof Error ? error.message : String(error);
      writeConfluenceProofSummary(proofSummary);
      throw error;
    }
  });
});
