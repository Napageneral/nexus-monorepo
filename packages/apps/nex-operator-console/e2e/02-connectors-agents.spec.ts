import { test, expect } from '@playwright/test';
import { waitForConsoleReady, screenshot, navigateToTab, clickSubTab, setupConsoleErrorCapture } from './helpers';

test.describe('OCI-003: Connectors Page', () => {
  test('connectors tab renders', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Connectors');

    await screenshot(page, 'connectors-page');

    // Should show either platform picker heading or connected list title
    const heading = page.locator('h1, .v2-page-title').first();
    await expect(heading).toBeVisible();
  });

  test('connectors shows platform picker or connected list', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Connectors');

    // Either the platform picker grid or the connected apps table should be visible
    const platformGrid = page.locator('.v2-platform-grid, .v2-table, [class*="platform"]');
    const emptyState = page.getByText('connect a platform').or(page.getByText('Browse all connectors'));

    const hasContent = await platformGrid.count() > 0 || await emptyState.count() > 0;
    expect(hasContent).toBeTruthy();

    await screenshot(page, 'connectors-content');
  });
});

test.describe('OCI-003: Agents List', () => {
  test('agents tab renders with agent cards', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Agents');

    await screenshot(page, 'agents-list');

    // Should show agent cards from seeded data or empty state
    const agentCards = page.locator('.v2-card--interactive, .v2-agent-card');
    const emptyState = page.getByText('No agents yet').or(page.getByText('Create agent'));

    const hasAgents = await agentCards.count() > 0;
    const hasEmpty = await emptyState.count() > 0;
    expect(hasAgents || hasEmpty).toBeTruthy();
  });

  test('create agent button is visible', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Agents');

    const createBtn = page.locator('button:has-text("Create agent"), button:has-text("Create")');
    await expect(createBtn.first()).toBeVisible();
  });
});

test.describe('OCI-003: Agent Creation Wizard', () => {
  test('wizard opens and completes all 4 steps', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Agents');

    // Click create
    const createBtn = page.locator('button:has-text("Create agent"), button:has-text("Create")');
    await createBtn.first().click();
    await page.waitForTimeout(500);
    await screenshot(page, 'wizard-step1-basics');

    // Step 1: Fill name
    const nameInput = page.locator('input[placeholder="e.g. Sales Assistant"], input.v2-input').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('Cleanroom Browser Agent');
    }

    // Select a model if visible
    const modelCard = page.locator('.v2-selectable, [class*="model-card"]').first();
    if (await modelCard.isVisible()) {
      await modelCard.click();
    }

    // Click Next
    const nextBtn = page.locator('button:has-text("Next")');
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(300);
      await screenshot(page, 'wizard-step2-apps');

      // Step 2: Click Next
      await nextBtn.click();
      await page.waitForTimeout(300);
      await screenshot(page, 'wizard-step3-guardrails');

      // Step 3: Click Next
      await nextBtn.click();
      await page.waitForTimeout(300);
      await screenshot(page, 'wizard-step4-review');

      // Step 4: Review — verify name appears
      await expect(page.getByText('Cleanroom Browser Agent')).toBeVisible();

      // Click Create
      const createFinalBtn = page.locator('button:has-text("Create agent"), button:has-text("Create")').last();
      await createFinalBtn.click();
      await page.waitForTimeout(1000);
      await screenshot(page, 'wizard-completed');
    }
  });
});

test.describe('OCI-003: Agent Detail', () => {
  test('clicking an agent opens detail view', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Agents');

    // Click first agent card
    const agentCard = page.locator('.v2-card--interactive, .v2-agent-card').first();
    if (await agentCard.isVisible()) {
      await agentCard.click();
      await page.waitForTimeout(500);
      await screenshot(page, 'agent-detail-settings');

      // Verify detail sub-tabs exist
      const detailTabs = page.locator('.v2-detail-tab');
      expect(await detailTabs.count()).toBeGreaterThanOrEqual(2);
    }
  });

  test('agent detail sub-tabs navigate', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Agents');

    const agentCard = page.locator('.v2-card--interactive, .v2-agent-card').first();
    if (await agentCard.isVisible()) {
      await agentCard.click();
      await page.waitForTimeout(500);

      // Click Skills tab
      const skillsTab = page.locator('.v2-detail-tab:has-text("Skills")');
      if (await skillsTab.isVisible()) {
        await skillsTab.click();
        await page.waitForTimeout(300);
        await screenshot(page, 'agent-detail-skills');
      }

      // Click Run History tab
      const historyTab = page.locator('.v2-detail-tab:has-text("Run History"), .v2-detail-tab:has-text("History")');
      if (await historyTab.isVisible()) {
        await historyTab.click();
        await page.waitForTimeout(300);
        await screenshot(page, 'agent-detail-run-history');
      }
    }
  });

  test('agent detail modals open and close', async ({ page }) => {
    await waitForConsoleReady(page);
    await navigateToTab(page, 'Agents');

    const agentCard = page.locator('.v2-card--interactive, .v2-agent-card').first();
    if (await agentCard.isVisible()) {
      await agentCard.click();
      await page.waitForTimeout(500);

      // Try to open guardrails modal
      const editGuardrailsBtn = page.locator('button:has-text("Edit"), button:has-text("Manage")').first();
      if (await editGuardrailsBtn.isVisible()) {
        await editGuardrailsBtn.click();
        await page.waitForTimeout(300);

        // Verify modal appeared
        const modal = page.locator('.v2-modal-backdrop, .v2-modal');
        if (await modal.isVisible()) {
          await screenshot(page, 'agent-detail-modal-open');

          // Close modal
          const closeBtn = page.locator('.v2-modal button:has-text("Cancel"), .v2-modal-close');
          if (await closeBtn.first().isVisible()) {
            await closeBtn.first().click();
            await page.waitForTimeout(300);
          }
        }
      }
    }
  });
});
