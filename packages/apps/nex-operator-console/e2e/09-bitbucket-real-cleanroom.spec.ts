import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
import { waitForConsoleReady, navigateToTab, clickSubTab, screenshot } from './helpers';

const runtimeUrl = process.env.RUNTIME_URL?.trim() || '';
const runtimeToken = process.env.RUNTIME_TOKEN?.trim() || '';
const nexRoot = process.env.NEX_ROOT?.trim() || '';
const proofBundleDir = process.env.NEXUS_CLEANROOM_PROOF_BUNDLE_DIR?.trim() || '';
const bitbucketCredentialIdFromEnv = process.env.BITBUCKET_CREDENTIAL_ID?.trim() || '';
const bitbucketHostFromEnv = process.env.BITBUCKET_HOST?.trim() || '';
const bitbucketUsernameFromEnv = process.env.BITBUCKET_USERNAME?.trim() || '';
const bitbucketTokenFromEnv = process.env.BITBUCKET_TOKEN?.trim() || '';
const bitbucketRepositoriesSelection =
  process.env.NEXUS_PROOF_BITBUCKET_REPOSITORIES?.trim() || 'all';
const bitbucketSelectionIsAll = bitbucketRepositoriesSelection.trim().toLowerCase() === 'all';
const bitbucketMinRecords = Math.max(1, Number.parseInt(process.env.NEXUS_PROOF_BITBUCKET_MIN_RECORDS ?? '500', 10) || 500);
const bitbucketMinContacts = Math.max(1, Number.parseInt(process.env.NEXUS_PROOF_BITBUCKET_MIN_CONTACTS ?? '20', 10) || 20);
const bitbucketMinChannels = Math.max(1, Number.parseInt(process.env.NEXUS_PROOF_BITBUCKET_MIN_CHANNELS ?? '20', 10) || 20);
const bitbucketBackfillTimeoutMs = Math.max(
  60_000,
  Number.parseInt(
    process.env.NEXUS_PROOF_BITBUCKET_BACKFILL_TIMEOUT_MS ??
      `${bitbucketSelectionIsAll ? 4 * 60 * 60_000 : 60 * 60_000}`,
    10,
  ) || (bitbucketSelectionIsAll ? 4 * 60 * 60_000 : 60 * 60_000),
);
const bitbucketBackfillStallMs = Math.max(
  60_000,
  Number.parseInt(
    process.env.NEXUS_PROOF_BITBUCKET_BACKFILL_STALL_MS ??
      `${bitbucketSelectionIsAll ? 30 * 60_000 : 10 * 60_000}`,
    10,
  ) || (bitbucketSelectionIsAll ? 30 * 60_000 : 10 * 60_000),
);

type RuntimeAdapterConnectionEntry = {
  connectionId?: string;
  adapter?: string;
  service?: string;
  status?: string;
  authMethodId?: string;
  authMethod?: string;
  account?: string | null;
  lastSync?: number | null;
  error?: string | null;
  auth?: {
    methods?: Array<{
      id?: string;
      type?: string;
      label?: string;
      icon?: string;
      service?: string;
      fields?: Array<{
        name?: string;
        label?: string;
        type?: string;
        required?: boolean;
        placeholder?: string;
      }>;
    }>;
  };
  metadata?: {
    automatic_activation?: {
      backfill?: {
        status?: string;
        jobRunId?: string;
        existingRun?: boolean;
      };
    };
    adapter_config?: {
      host?: string;
      username?: string;
      token?: string;
      provider?: string;
      repositories?: Array<{ full_name?: string }>;
      backfill_since?: string;
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

type BitbucketProofSummary = {
  connection_id: string;
  account: string | null;
  backfill_job_run_id: string;
  selected_repositories: string[];
  minimum_expected_counts: {
    records: number;
    contacts: number;
    channels: number;
  };
  observed_counts: {
    records: number;
    contacts: number;
    channels: number;
  };
  backfill_status?: string | null;
  backfill_started_at?: string | null;
  backfill_completed_at?: string | null;
  backfill_metrics?: RuntimeBackfillMetrics | null;
  status: "running" | "completed" | "failed";
  error?: string;
  bitbucket_search_hits?: number;
};

function requireEnv(name: string, value: string): string {
  if (!value) {
    throw new Error(`${name} is required for the Bitbucket cleanroom proof`);
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

function listRuntimeConnections(): RuntimeAdapterConnectionEntry[] {
  const payload = runtimeCall<{ connections?: RuntimeAdapterConnectionEntry[] }>('adapters.connections.list', {}, 120_000);
  return Array.isArray(payload.connections) ? payload.connections : [];
}

function resolveRuntimeCredentialId(): string {
  const payload = runtimeCall<{ credentials?: Array<{ id?: string; service?: string; status?: string }> }>(
    'credentials.list',
    {},
    120_000,
  );
  const credential = (payload.credentials ?? []).find(
    (entry) => String(entry?.service ?? '').trim().toLowerCase() === 'bitbucket' && String(entry?.status ?? '').trim() === 'active',
  );
  const credentialId = String(credential?.id ?? '').trim();
  if (!credentialId) {
    throw new Error('No active Bitbucket credential was found in the runtime credential store');
  }
  return credentialId;
}

function resolveBitbucketCredential(): {
  credentialId: string;
  host: string;
  username: string;
  token: string;
} {
  if (bitbucketTokenFromEnv) {
    return {
      credentialId: bitbucketCredentialIdFromEnv || 'projected-bitbucket-credential',
      host: bitbucketHostFromEnv || 'https://api.bitbucket.org/2.0',
      username: bitbucketUsernameFromEnv,
      token: bitbucketTokenFromEnv,
    };
  }

  const credentialId = resolveRuntimeCredentialId();
  const resolved = runtimeCall<{ value?: string | null }>('credentials.resolve', { id: credentialId }, 120_000);
  const raw = String(resolved.value ?? '').trim();
  if (!raw) {
    throw new Error(`credentials.resolve returned an empty value for ${credentialId}`);
  }
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const host = String(parsed.host ?? 'https://api.bitbucket.org/2.0').trim() || 'https://api.bitbucket.org/2.0';
  const username = String(parsed.username ?? '').trim();
  const token = String(parsed.token ?? '').trim();
  if (!token) {
    throw new Error(`Bitbucket credential ${credentialId} is missing token`);
  }
  return {
    credentialId,
    host,
    username,
    token,
  };
}

function writeBitbucketProofSummary(summary: BitbucketProofSummary) {
  if (!proofBundleDir) {
    return;
  }
  fs.writeFileSync(
    path.join(proofBundleDir, 'bitbucket-ingest-summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
    'utf8',
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

function summarizeBackfillProgress(snapshot: {
  run: RuntimeJobRun | null;
  connection: RuntimeAdapterConnectionEntry | null;
  metrics: RuntimeBackfillMetrics | null;
}): string {
  const status = snapshot.run?.status ?? snapshot.metrics?.status ?? 'unknown';
  const records =
    snapshot.connection?.summary?.recordCount ??
    snapshot.metrics?.records_processed ??
    0;
  const contacts = snapshot.connection?.summary?.contactCount ?? 0;
  const channels = snapshot.connection?.summary?.channelCount ?? 0;
  const updatedAt = snapshot.metrics?.updated_at ?? snapshot.run?.completed_at ?? snapshot.run?.started_at ?? 'n/a';
  return `status=${status} records=${records} contacts=${contacts} channels=${channels} updated_at=${updatedAt}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForConsoleCallout(page: Page, needle: RegExp, timeout = 60_000) {
  await expect
    .poll(async () => {
      const texts = await page.locator('.callout').allTextContents();
      return texts.join(' ');
    }, { timeout })
    .toMatch(needle);
}

async function refreshCurrentSurface(page: Page) {
  const buttons = page.getByRole('button', { name: /^Refresh$/ });
  if (await buttons.count()) {
    await buttons.first().click();
    await page.waitForTimeout(800);
  }
}

async function waitForBitbucketRow(page: Page, timeout = 120_000) {
  await expect
    .poll(
      async () => {
        await refreshCurrentSurface(page);
        return await page.locator('.console-table tbody tr').filter({ hasText: /Bitbucket/i }).count();
      },
      { timeout, intervals: [1_000, 2_000, 3_000, 5_000] },
    )
    .toBeGreaterThan(0);
}

async function selectBitbucketRow(page: Page): Promise<void> {
  const row = page
    .locator('.console-table tbody tr')
    .filter({ hasText: /Bitbucket/i })
    .first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
}

async function getSelectedConnectionId(page: Page): Promise<string> {
  const input = page.locator('input[readonly]').first();
  await expect(input).toBeVisible();
  return (await input.inputValue()).trim();
}

async function waitForAssignedConnectionId(page: Page, timeout = 120_000): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeout) {
    const value = await getSelectedConnectionId(page);
    if (value && !/not yet assigned/i.test(value)) {
      return value;
    }
    await sleep(1_000);
  }
  throw new Error('selected connection did not expose an assigned connection id');
}

async function waitForVisibleTableRows(page: Page, timeout = 120_000) {
  await expect
    .poll(
      async () => {
        await refreshCurrentSurface(page);
        return await page.locator('.console-table tbody tr').count();
      },
      { timeout, intervals: [1_000, 2_000, 3_000, 5_000] },
    )
    .toBeGreaterThan(0);
}

function findBitbucketConnection(): RuntimeAdapterConnectionEntry {
  const connections = listRuntimeConnections();
  const bitbucketConnections = connections.filter((entry) => String(entry.adapter ?? '').trim().toLowerCase() === 'bitbucket');
  if (bitbucketConnections.length === 0) {
    throw new Error('Bitbucket connection not found in adapters.connections.list');
  }
  return (
    bitbucketConnections.find((entry) => String(entry.status ?? '').trim() === 'connected') ??
    bitbucketConnections[0]
  );
}

async function waitForConnectedBitbucketConnection(timeout = 120_000): Promise<RuntimeAdapterConnectionEntry> {
  const startedAt = Date.now();
  let lastStatus = '';
  let lastConnectionId = '';
  while (Date.now() - startedAt <= timeout) {
    const connection = findBitbucketConnection();
    lastStatus = String(connection.status ?? '').trim();
    lastConnectionId = String(connection.connectionId ?? '').trim();
    if (lastStatus === 'connected' && lastConnectionId) {
      return connection;
    }
    await sleep(1_000);
  }
  throw new Error(
    `Bitbucket connection did not reach connected state within ${formatDuration(timeout)} (last status=${lastStatus || 'unknown'}, connection_id=${lastConnectionId || 'none'})`,
  );
}

function readSnapshot(connectionId: string, jobRunId: string): {
  run: RuntimeJobRun | null;
  connection: RuntimeAdapterConnectionEntry | null;
  metrics: RuntimeBackfillMetrics | null;
  summary_counts: { records: number; contacts: number; channels: number };
} {
  const payload = runtimeCall<{ run?: RuntimeJobRun }>('jobs.runs.get', { id: jobRunId }, 120_000);
  const run = payload.run ?? null;
  const connections = listRuntimeConnections();
  const connection = connections.find((entry) => entry.connectionId === connectionId) ?? null;
  const metrics = parseRuntimeBackfillMetrics(run?.metrics_json);
  return {
    run,
    connection,
    metrics,
    summary_counts: {
      records: Number(connection?.summary?.recordCount ?? 0),
      contacts: Number(connection?.summary?.contactCount ?? 0),
      channels: Number(connection?.summary?.channelCount ?? 0),
    },
  };
}

async function waitForBitbucketBackfillJobRunId(connectionId: string, timeout = 60_000): Promise<string> {
  let jobRunId = '';
  await expect
    .poll(
      () => {
        const connection = listRuntimeConnections().find((entry) => entry.connectionId === connectionId) ?? null;
        const backfill = connection?.metadata?.automatic_activation?.backfill;
        jobRunId = typeof backfill?.jobRunId === 'string' ? backfill.jobRunId.trim() : '';
        return jobRunId;
      },
      { timeout, intervals: [1_000, 2_000, 3_000] },
    )
    .not.toBe('');
  return jobRunId;
}

async function waitForBitbucketBackfillCompletion(
  connectionId: string,
  jobRunId: string,
  onSnapshot?: (snapshot: ReturnType<typeof readSnapshot>) => void,
): Promise<ReturnType<typeof readSnapshot>> {
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let lastProgressMarker = '';
  let lastSnapshot: ReturnType<typeof readSnapshot> | null = null;

  while (Date.now() - startedAt <= bitbucketBackfillTimeoutMs) {
    const snapshot = readSnapshot(connectionId, jobRunId);
    lastSnapshot = snapshot;
    onSnapshot?.(snapshot);

    const runStatus = snapshot.run?.status ?? '';
    if (runStatus === 'completed') {
      return snapshot;
    }
    if (runStatus === 'failed' || runStatus === 'cancelled') {
      throw new Error(`Bitbucket backfill ${jobRunId} ended with ${runStatus}: ${snapshot.run?.error ?? 'no error message'}`);
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
      console.log(`[bitbucket-backfill-progress] ${summarizeBackfillProgress(snapshot)}`);
    }

    if (Date.now() - lastProgressAt > bitbucketBackfillStallMs) {
      throw new Error(
        `Bitbucket backfill ${jobRunId} stalled for ${formatDuration(bitbucketBackfillStallMs)}; last observed ${summarizeBackfillProgress(snapshot)}`,
      );
    }

    await sleep(Date.now() - startedAt < 60_000 ? 2_000 : 10_000);
  }

  throw new Error(
    `Bitbucket backfill ${jobRunId} did not complete within ${formatDuration(bitbucketBackfillTimeoutMs)}${
      lastSnapshot ? `; last observed ${summarizeBackfillProgress(lastSnapshot)}` : ''
    }`,
  );
}

async function setRecordsPlatformFilter(page: Page, platform: string) {
  const platformSelect = page.locator('select').first();
  await expect(platformSelect).toBeVisible();
  await platformSelect.selectOption(platform);
  await page.waitForTimeout(300);
}

test.describe('Operator Console Bitbucket cleanroom proof', () => {
  test('connects Bitbucket through the Console UI and surfaces ingested git data', async ({ page }) => {
    test.setTimeout(bitbucketBackfillTimeoutMs + 15 * 60_000);

    const bitbucketCredential = resolveBitbucketCredential();

    await waitForConsoleReady(page);
    await navigateToTab(page, 'Connectors');
    await waitForBitbucketRow(page);
    await screenshot(page, 'bitbucket-connectors-selected');

    await selectBitbucketRow(page);
    await screenshot(page, 'bitbucket-connection-selected');

    const selectedCard = page.locator('section.console-card').filter({ hasText: /Bitbucket/i }).last();
    await expect(selectedCard).toBeVisible();

    const authSelect = selectedCard.locator('select').first();
    await expect(authSelect).toBeVisible();
    await authSelect.selectOption('bitbucket_api_key');

    const advanced = selectedCard.locator('details.connect-advanced').first();
    await advanced.evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });

    const payloadEditor = selectedCard.locator('textarea').first();
    const initialSetupPayload = {
      provider: 'bitbucket',
      host: bitbucketCredential.host,
      username: bitbucketCredential.username,
      token: bitbucketCredential.token,
    };
    await payloadEditor.fill(JSON.stringify(initialSetupPayload, null, 2));

    const initialConnectionId = await getSelectedConnectionId(selectedCard);
    if (!initialConnectionId || /not yet assigned/i.test(initialConnectionId)) {
      await selectedCard.getByRole('button', { name: /^Start Setup$/ }).click();
      await waitForConsoleCallout(page, /bitbucket: requires_input/i);

      await screenshot(page, 'bitbucket-setup-requires-input');

      await payloadEditor.fill(JSON.stringify(initialSetupPayload, null, 2));
      await selectedCard.getByRole('button', { name: /^Submit$/ }).click();
      await waitForConsoleCallout(page, /found \d+ repositories|select repositories to track/i, 120_000);
      await screenshot(page, 'bitbucket-repository-selection');

      await payloadEditor.fill(
        JSON.stringify(
          {
            repositories: bitbucketRepositoriesSelection,
            backfill_since: '2001-01-01T00:00:00Z',
          },
          null,
          2,
        ),
      );
      await selectedCard.getByRole('button', { name: /^Submit$/ }).click();
      await waitForConsoleCallout(page, /bitbucket: completed|bitbucket: connected/i, 120_000);
      await screenshot(page, 'bitbucket-setup-completed');
    }

    const connectedRuntimeConnection = await waitForConnectedBitbucketConnection();
    const account = connectedRuntimeConnection.account ?? null;
    await refreshCurrentSurface(page);
    await selectBitbucketRow(page);

    const connectionId = await waitForAssignedConnectionId(selectedCard);
    expect(connectionId).toMatch(/[0-9a-f-]{8,}/i);
    expect(connectionId).toBe(String(connectedRuntimeConnection.connectionId ?? '').trim());

    await selectedCard.getByRole('button', { name: /^(Test connection|Test)$/ }).click();
    await waitForConsoleCallout(page, /connection test passed/i, 120_000);
    await screenshot(page, 'bitbucket-test-connection-passed');

    await selectedCard.getByRole('button', { name: /^(Backfill now|Backfill)$/ }).click();
    await waitForConsoleCallout(page, /backfill (queued|already running)/i, 120_000);
    await screenshot(page, 'bitbucket-backfill-triggered');

    const backfillJobRunId = await waitForBitbucketBackfillJobRunId(connectionId);
    const proofSummary: BitbucketProofSummary = {
      connection_id: connectionId,
      account,
      backfill_job_run_id: backfillJobRunId,
      selected_repositories: bitbucketRepositoriesSelection
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      minimum_expected_counts: {
        records: bitbucketMinRecords,
        contacts: bitbucketMinContacts,
        channels: bitbucketMinChannels,
      },
      observed_counts: {
        records: 0,
        contacts: 0,
        channels: 0,
      },
      status: 'running',
    };

    try {
      const backfillSnapshot = await waitForBitbucketBackfillCompletion(connectionId, backfillJobRunId, (snapshot) => {
        proofSummary.backfill_status = snapshot.run?.status ?? null;
        proofSummary.backfill_started_at = snapshot.run?.started_at ?? null;
        proofSummary.backfill_completed_at = snapshot.run?.completed_at ?? null;
        proofSummary.backfill_metrics = snapshot.metrics ?? null;
        proofSummary.observed_counts = snapshot.summary_counts;
        writeBitbucketProofSummary(proofSummary);
      });

      const observedRecordCount = backfillSnapshot.summary_counts.records;
      const observedContactCount = backfillSnapshot.summary_counts.contacts;
      const observedChannelCount = backfillSnapshot.summary_counts.channels;

      expect(observedRecordCount).toBeGreaterThanOrEqual(bitbucketMinRecords);
      expect(observedContactCount).toBeGreaterThanOrEqual(bitbucketMinContacts);
      expect(observedChannelCount).toBeGreaterThanOrEqual(bitbucketMinChannels);

      proofSummary.status = 'completed';
      proofSummary.backfill_status = backfillSnapshot.run?.status ?? null;
      proofSummary.backfill_started_at = backfillSnapshot.run?.started_at ?? null;
      proofSummary.backfill_completed_at = backfillSnapshot.run?.completed_at ?? null;
      proofSummary.backfill_metrics = backfillSnapshot.metrics ?? null;
      proofSummary.observed_counts = {
        records: observedRecordCount,
        contacts: observedContactCount,
        channels: observedChannelCount,
      };

      const searchResult = runtimeCall<{ records?: Array<{ id?: string }> }>(
        'records.search',
        {
          query: 'bitbucket',
          platform: 'git',
          limit: 20,
        },
        120_000,
      );
      proofSummary.bitbucket_search_hits = Array.isArray(searchResult.records) ? searchResult.records.length : 0;
      expect(proofSummary.bitbucket_search_hits ?? 0).toBeGreaterThan(0);

      writeBitbucketProofSummary(proofSummary);

      await navigateToTab(page, 'Records');
      await setRecordsPlatformFilter(page, 'git');
      await clickSubTab(page, 'Search');
      const searchInput = page.getByPlaceholder('Search records by keyword, phrase, or record ID…');
      await expect(searchInput).toBeVisible();
      await searchInput.fill('bitbucket');
      await page.locator('button.console-btn--primary', { hasText: /^Search$/ }).first().click();
      await expect
        .poll(async () => await page.locator('.console-card--interactive').count(), { timeout: 60_000 })
        .toBeGreaterThan(0);
      await screenshot(page, 'bitbucket-records-search');

      await clickSubTab(page, 'Browse');
      await waitForVisibleTableRows(page, 60_000);
      await screenshot(page, 'bitbucket-records-browse');

      await clickSubTab(page, 'Channels');
      await waitForVisibleTableRows(page, 60_000);
      await screenshot(page, 'bitbucket-records-channels');

      await navigateToTab(page, 'Identity');
      await clickSubTab(page, 'Contacts');
      await waitForVisibleTableRows(page, 60_000);
      await screenshot(page, 'bitbucket-identity-contacts');

      await clickSubTab(page, 'Channels');
      await waitForVisibleTableRows(page, 60_000);
      await screenshot(page, 'bitbucket-identity-channels');
    } catch (error) {
      proofSummary.status = 'failed';
      proofSummary.error = error instanceof Error ? error.message : String(error);
      writeBitbucketProofSummary(proofSummary);
      throw error;
    }
  });
});
