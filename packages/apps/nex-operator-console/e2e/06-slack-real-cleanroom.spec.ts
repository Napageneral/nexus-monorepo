import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
import { waitForConsoleReady, navigateToTab, clickSubTab, screenshot } from './helpers';

const slackUserToken = process.env.SLACK_USER_TOKEN?.trim() || '';
const runtimeUrl = process.env.RUNTIME_URL?.trim() || '';
const runtimeToken = process.env.RUNTIME_TOKEN?.trim() || '';
const nexRoot = process.env.NEX_ROOT?.trim() || '';
const proofBundleDir = process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR?.trim() || '';
const slackMinRecords = Math.max(1, Number.parseInt(process.env.NEXUS_PROOF_SLACK_MIN_RECORDS ?? '100', 10) || 100);
const slackMinContacts = Math.max(1, Number.parseInt(process.env.NEXUS_PROOF_SLACK_MIN_CONTACTS ?? '5', 10) || 5);
const slackMinChannels = Math.max(1, Number.parseInt(process.env.NEXUS_PROOF_SLACK_MIN_CHANNELS ?? '1', 10) || 1);
const slackBackfillTimeoutMs = Math.max(
  60_000,
  Number.parseInt(process.env.NEXUS_PROOF_SLACK_BACKFILL_TIMEOUT_MS ?? `${45 * 60_000}`, 10) || 45 * 60_000,
);
const slackBackfillStallMs = Math.max(
  60_000,
  Number.parseInt(process.env.NEXUS_PROOF_SLACK_BACKFILL_STALL_MS ?? `${10 * 60_000}`, 10) || 10 * 60_000,
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

type SlackBackfillSnapshot = {
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
    throw new Error(`${name} is required for the Slack cleanroom proof`);
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

function getSlackConnection(connectionId: string): RuntimeAdapterConnectionEntry {
  const payload = runtimeCall<{ connections?: RuntimeAdapterConnectionEntry[] }>('adapters.connections.list', {}, 120_000);
  const connection = (payload.connections ?? []).find((entry) => entry.connectionId === connectionId);
  if (!connection) {
    throw new Error(`Slack connection ${connectionId} not found in adapters.connections.list`);
  }
  return connection;
}

async function waitForBackfillJobRunId(connectionId: string, timeout = 60_000): Promise<string> {
  let jobRunId = '';
  await expect
    .poll(
      () => {
        const connection = getSlackConnection(connectionId);
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
  onSnapshot?: (snapshot: SlackBackfillSnapshot) => void,
): Promise<SlackBackfillSnapshot> {
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let lastProgressMarker = '';
  let lastSnapshot: SlackBackfillSnapshot | null = null;

  while (Date.now() - startedAt <= slackBackfillTimeoutMs) {
    const snapshot = readSlackBackfillSnapshot(connectionId, jobRunId);
    lastSnapshot = snapshot;
    onSnapshot?.(snapshot);

    const runStatus = snapshot.run?.status ?? '';
    if (runStatus === 'completed') {
      return snapshot;
    }
    if (runStatus === 'failed' || runStatus === 'cancelled') {
      throw new Error(`Slack backfill ${jobRunId} ended with ${runStatus}: ${snapshot.run?.error ?? 'no error message'}`);
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
      console.log(`[slack-backfill-progress] ${summarizeBackfillProgress(snapshot)}`);
    }

    if (Date.now() - lastProgressAt > slackBackfillStallMs) {
      throw new Error(
        `Slack backfill ${jobRunId} stalled for ${formatDuration(slackBackfillStallMs)}; last observed ${summarizeBackfillProgress(snapshot)}`,
      );
    }

    await sleep(Date.now() - startedAt < 60_000 ? 2_000 : 10_000);
  }

  throw new Error(
    `Slack backfill ${jobRunId} did not complete within ${formatDuration(slackBackfillTimeoutMs)}${
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

function writeSlackProofSummary(summary: Record<string, unknown>) {
  if (!proofBundleDir) {
    return;
  }
  fs.writeFileSync(
    path.join(proofBundleDir, 'slack-ingest-summary.json'),
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

function summarizeBackfillProgress(snapshot: SlackBackfillSnapshot): string {
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

function readSlackBackfillSnapshot(connectionId: string, jobRunId: string): SlackBackfillSnapshot {
  const payload = runtimeCall<{ run?: RuntimeJobRun }>('jobs.runs.get', { id: jobRunId }, 120_000);
  const run = payload.run ?? null;
  const connection = getSlackConnection(connectionId);
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

async function setSlackPlatformFilter(page: Page) {
  const platformSelect = page.getByRole('combobox').first();
  await expect(platformSelect).toBeVisible();
  await platformSelect.selectOption('slack');
  await page.waitForTimeout(300);
}

async function waitForSlackTableRowWithRefresh(page: Page, timeout = 180_000) {
  await expect
    .poll(
      async () => {
        await refreshCurrentSurface(page);
        return await page.locator('.console-table tbody tr').filter({ hasText: /slack/i }).count();
      },
      { timeout, intervals: [1_000, 2_000, 3_000, 5_000] },
    )
    .toBeGreaterThan(0);
}

test.describe('Operator Console Slack cleanroom proof', () => {
  test.skip(!slackUserToken, 'SLACK_USER_TOKEN is required for the Slack cleanroom proof');

  test('connects Slack through the Console UI and surfaces ingested data', async ({ page }) => {
    test.setTimeout(slackBackfillTimeoutMs + 10 * 60_000);

    await waitForConsoleReady(page);

    await navigateToTab(page, 'Connectors');
    await expect(page.getByText('Select Adapter')).toBeVisible();

    const slackCard = page
      .locator('.connect-adapter-card')
      .filter({ hasText: /Slack Adapter/i })
      .first();
    await expect(slackCard).toBeVisible({ timeout: 30_000 });
    await slackCard.click();
    await screenshot(page, 'slack-connectors-selected');

    const authSelect = page.locator('select').first();
    await expect(authSelect).toBeVisible();
    await authSelect.selectOption('slack_user_token');

    const advanced = page.locator('details.connect-advanced').first();
    await advanced.evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });

    const payloadEditor = page.locator('textarea').first();
    await payloadEditor.fill(
      JSON.stringify(
        {
          user_token: slackUserToken,
        },
        null,
        2,
      ),
    );

    await page.getByRole('button', { name: /^Connect$/ }).click();
    await waitForIntegrationMessage(page, /slack: connected/i);
    await screenshot(page, 'slack-connected');

    const connectionId = await page.locator('input[readonly]').first().inputValue();
    expect(connectionId).toMatch(/[0-9a-f-]{8,}/i);

    await page.getByRole('button', { name: 'Test connection' }).click();
    await waitForIntegrationMessage(page, /connection test passed/i);
    await screenshot(page, 'slack-test-connection-passed');

    await page.getByRole('button', { name: 'Backfill now' }).click();
    await waitForIntegrationMessage(page, /backfill (queued|already running)/i);
    await screenshot(page, 'slack-backfill-triggered');

    const backfillJobRunId = await waitForBackfillJobRunId(connectionId);
    const proofSummary: Record<string, unknown> = {
      connection_id: connectionId,
      backfill_job_run_id: backfillJobRunId,
      minimum_expected_counts: {
        records: slackMinRecords,
        contacts: slackMinContacts,
        channels: slackMinChannels,
      },
      status: 'running',
    };

    try {
      const backfillSnapshot = await waitForBackfillCompletion(connectionId, backfillJobRunId, (snapshot) => {
        proofSummary.backfill_status = snapshot.run?.status ?? null;
        proofSummary.backfill_started_at = snapshot.run?.started_at ?? null;
        proofSummary.backfill_completed_at = snapshot.run?.completed_at ?? null;
        proofSummary.backfill_metrics = snapshot.metrics ?? null;
        proofSummary.adapter_summary = snapshot.connection?.summary ?? null;
        proofSummary.observed_counts = snapshot.summary_counts;
        writeSlackProofSummary(proofSummary);
      });
      const observedRecordCount = countRuntimeCollection('records.list', 'records', { platform: 'slack' });
      const observedContactCount = countRuntimeCollection('contacts.list', 'contacts', { platform: 'slack' });
      const observedChannelCount = countRuntimeCollection('channels.list', 'channels', { platform: 'slack' });

      expect(observedRecordCount).toBeGreaterThanOrEqual(slackMinRecords);
      expect(observedContactCount).toBeGreaterThanOrEqual(slackMinContacts);
      expect(observedChannelCount).toBeGreaterThanOrEqual(slackMinChannels);

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
      writeSlackProofSummary(proofSummary);

      await navigateToTab(page, 'Records');
      await setSlackPlatformFilter(page);
      await waitForSlackTableRowWithRefresh(page);
      await screenshot(page, 'slack-records-browse');

      await clickSubTab(page, 'Channels');
      await waitForSlackTableRowWithRefresh(page);
      await screenshot(page, 'slack-records-channels');

      await navigateToTab(page, 'Identity');
      await clickSubTab(page, 'Contacts');
      await waitForSlackTableRowWithRefresh(page);
      await screenshot(page, 'slack-identity-contacts');

      await clickSubTab(page, 'Channels');
      await waitForSlackTableRowWithRefresh(page);
      await screenshot(page, 'slack-identity-channels');
    } catch (error) {
      proofSummary.status = 'failed';
      proofSummary.error = error instanceof Error ? error.message : String(error);
      writeSlackProofSummary(proofSummary);
      throw error;
    }
  });
});
