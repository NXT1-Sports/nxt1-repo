/**
 * @fileoverview Agent X Operations Log Pinning E2E Tests
 * @module @nxt1/web/e2e/tests/agent-x
 *
 * End-to-end tests for pinning and unpinning sessions in the Agent X operations log.
 *
 * Coverage:
 * - Renders pinned section without a redundant per-row badge
 * - Pin and Unpin actions persist through the API and move rows between sections
 */

import { test, expect } from '../../fixtures';
import { AgentXOperationsLogPage } from '../../pages/agent-x-operations-log.page';

const PINNED_THREAD_ID = '507f1f77bcf86cd799439011';
const HISTORY_THREAD_ID = '507f1f77bcf86cd799439022';

const MOCK_OPERATIONS_RESPONSE = {
  success: true,
  data: [
    {
      id: 'op-history',
      threadId: HISTORY_THREAD_ID,
      title: 'Summer Outreach Plan',
      summary: '3 messages · outreach',
      icon: 'mail',
      status: 'complete',
      category: 'outreach',
      timestamp: '2026-06-25T10:00:00.000Z',
      isScheduled: false,
    },
  ],
  pinned: [
    {
      id: 'op-pinned',
      threadId: PINNED_THREAD_ID,
      title: 'State Championship Film Breakdown',
      summary: '5 messages · film',
      icon: 'videocam',
      status: 'complete',
      category: 'film',
      timestamp: '2026-06-25T11:00:00.000Z',
      pinnedAt: '2026-06-25T12:00:00.000Z',
      isScheduled: false,
    },
  ],
  scheduled: [],
  pageInfo: { hasMore: false },
};

const PINNED_TITLE = 'State Championship Film Breakdown';
const HISTORY_TITLE = 'Summer Outreach Plan';

test.describe('Agent X Operations Log - Pinning', () => {
  let opsPage: AgentXOperationsLogPage;
  let pinnedThreadIds: Set<string>;

  test.beforeEach(async ({ page }) => {
    opsPage = new AgentXOperationsLogPage(page);
    pinnedThreadIds = new Set([PINNED_THREAD_ID]);
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.route('**/api/v1/agent-x/operations-log*', async (route) => {
      const allEntries = [...MOCK_OPERATIONS_RESPONSE.data, ...MOCK_OPERATIONS_RESPONSE.pinned];
      const response = {
        ...MOCK_OPERATIONS_RESPONSE,
        data: allEntries.filter((entry) => !pinnedThreadIds.has(entry.threadId)),
        pinned: allEntries
          .filter((entry) => pinnedThreadIds.has(entry.threadId))
          .map((entry) => ({ ...entry, pinnedAt: '2026-06-25T12:30:00.000Z' })),
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    });

    await page.route('**/api/v1/agent-x/threads/*/pin', async (route) => {
      const isPin = route.request().postDataJSON()?.pinned === true;
      const threadId = route.request().url().split('/').slice(-2)[0] ?? '';
      if (isPin) {
        pinnedThreadIds.add(threadId);
      } else {
        pinnedThreadIds.delete(threadId);
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            threadId,
            pinned: isPin,
            pinnedAt: isPin ? '2026-06-25T12:30:00.000Z' : null,
          },
        }),
      });
    });
  });

  test('should display pinned session in the pinned section without a row badge', async ({
    page,
  }) => {
    await opsPage.goto();

    await expect(page.locator('.agent-rail-column')).toBeVisible();
    await expect(opsPage.pinnedGroup).toBeVisible();
    await expect(opsPage.pinnedGroup).toContainText(PINNED_TITLE);
    await expect(page.locator('.log-entry-pinned')).toHaveCount(0);
  });

  test('should unpin and pin sessions through the options menu', async ({ page }) => {
    await opsPage.goto();

    await opsPage.openEntryMenuForTitle(PINNED_TITLE);
    await expect(opsPage.pinButton).toContainText('Unpin');
    const unpinRequest = page.waitForRequest(
      (request) =>
        request.method() === 'PUT' &&
        request.url().endsWith(`/threads/${PINNED_THREAD_ID}/pin`) &&
        request.postDataJSON()?.pinned === false
    );
    await opsPage.pinButton.click();
    await unpinRequest;
    await expect(opsPage.pinnedGroup).toHaveCount(0);
    await expect(opsPage.entries.filter({ hasText: PINNED_TITLE })).toHaveCount(1);

    await opsPage.openEntryMenuForTitle(HISTORY_TITLE);
    await expect(opsPage.pinButton).toContainText('Pin');
    const pinRequest = page.waitForRequest(
      (request) =>
        request.method() === 'PUT' &&
        request.url().endsWith(`/threads/${HISTORY_THREAD_ID}/pin`) &&
        request.postDataJSON()?.pinned === true
    );
    await opsPage.pinButton.click();
    await pinRequest;
    await expect(opsPage.pinnedGroup).toContainText(HISTORY_TITLE);
    await expect(opsPage.entries.filter({ hasText: HISTORY_TITLE })).toHaveCount(1);
  });
});
