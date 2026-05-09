/**
 * @fileoverview Agent X Goal Completion E2E Tests
 * @module @nxt1/web/e2e/tests/agent-x
 *
 * End-to-end tests for the Agent X goals editor and history flow.
 *
 * Coverage:
 * - Goals panel renders saved goals without duplicate completion controls
 * - Goal history section shows completed records
 * - Goal history shows empty state when no goals completed
 * - History API failure shows error state
 *
 * NOTE: Authenticated flows require E2E_REAL_AUTH=true and a valid test user.
 */

import { test, expect } from '../../fixtures';
import { AgentXGoalsPage } from '../../pages/agent-x-goals.page';

// =============================================================================
// MOCK DATA
// =============================================================================

const MOCK_GOAL_ID = 'goal-uuid-001';
const MOCK_GOAL_TEXT = 'Send smarter coach outreach';
const NOW = new Date().toISOString();
const CREATED_AT = new Date(Date.now() - 14 * 86_400_000).toISOString(); // 14 days ago

const MOCK_ACTIVE_GOALS = [
  {
    id: MOCK_GOAL_ID,
    text: MOCK_GOAL_TEXT,
    category: 'recruiting',
    icon: '🔍',
    createdAt: CREATED_AT,
    isCompleted: false,
  },
  {
    id: 'goal-uuid-002',
    text: 'Create weekly highlight graphics',
    category: 'content',
    icon: '🎨',
    createdAt: CREATED_AT,
    isCompleted: false,
  },
];

const MOCK_COMPLETED_GOAL = {
  id: 'completed-record-001',
  goalId: MOCK_GOAL_ID,
  text: MOCK_GOAL_TEXT,
  category: 'recruiting',
  icon: '🔍',
  createdAt: CREATED_AT,
  completedAt: NOW,
  role: 'athlete',
  daysToComplete: 14,
};

const MOCK_DASHBOARD_RESPONSE = {
  success: true,
  data: {
    goals: MOCK_ACTIVE_GOALS,
    playbook: null,
    briefing: null,
    operations: [],
    lastUpdated: NOW,
  },
};

const MOCK_HISTORY_RESPONSE = {
  success: true,
  data: {
    history: [MOCK_COMPLETED_GOAL],
    totalCompleted: 1,
  },
};

const MOCK_HISTORY_EMPTY = {
  success: true,
  data: { history: [], totalCompleted: 0 },
};

// =============================================================================
// HELPER — mock API routes via page.route()
// =============================================================================

/**
 * Mock the Agent X dashboard endpoint to return active goals.
 */
async function mockDashboard(page: import('@playwright/test').Page, override?: object) {
  await page.route('**/agent-x/dashboard', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(override ?? MOCK_DASHBOARD_RESPONSE),
    })
  );
}

/**
 * Mock the goal history endpoint.
 */
async function mockGoalHistory(page: import('@playwright/test').Page, override?: object) {
  await page.route('**/agent-x/goal-history', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(override ?? MOCK_HISTORY_RESPONSE),
    })
  );
}

/**
 * Mock the goal history endpoint to return a server error.
 */
async function mockGoalHistoryFailure(page: import('@playwright/test').Page) {
  await page.route('**/agent-x/goal-history', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'Failed to load history' }),
    })
  );
}

// =============================================================================
// TESTS
// =============================================================================

test.describe('Agent X Goals Editor', () => {
  // -------------------------------------------------------------------------
  // UNAUTHENTICATED
  // -------------------------------------------------------------------------

  test.describe('Unauthenticated Access', () => {
    test('should not render goals panel when user is not signed in', async ({ page }) => {
      await page.goto('/agent-x');
      // The goals panel is behind auth — should not see active goals list
      const activeList = page.getByTestId('agent-x-goals-active-list');
      const isVisible = await activeList.isVisible().catch(() => false);
      expect(isVisible).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // AUTHENTICATED
  // -------------------------------------------------------------------------

  test.describe('Authenticated — Athlete', () => {
    let goalsPage: AgentXGoalsPage;

    test.beforeEach(async ({ page, testUser: _testUser }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      await mockDashboard(page);
      goalsPage = new AgentXGoalsPage(page);
      await goalsPage.goto();
      await goalsPage.openGoalsPanel();
    });

    // ----- Happy path -----

    test('should display saved goal pills without duplicate complete buttons', async () => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');

      await expect(goalsPage.activeList).toBeVisible();
      await expect(goalsPage.activeItems).toHaveCount(2);
      await expect(goalsPage.completeButtons).toHaveCount(0);
    });
  });

  test.describe('Authenticated — Coach', () => {
    let goalsPage: AgentXGoalsPage;

    test.beforeEach(async ({ page, testUser: _testUser }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');

      // Override dashboard with coach-role goals
      const coachDashboard = {
        ...MOCK_DASHBOARD_RESPONSE,
        data: {
          ...MOCK_DASHBOARD_RESPONSE.data,
          goals: [
            {
              id: 'coach-goal-001',
              text: 'Track warm recruiting leads',
              category: 'recruiting',
              icon: '🔍',
              createdAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
              isCompleted: false,
            },
          ],
        },
      };

      await mockDashboard(page, coachDashboard);
      goalsPage = new AgentXGoalsPage(page);
      await goalsPage.goto();
      await goalsPage.openGoalsPanel();
    });

    test('[coach] should display active goals panel without duplicate complete buttons', async () => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      await expect(goalsPage.activeItems).toHaveCount(1);
      await expect(goalsPage.completeButtons).toHaveCount(0);
    });
  });

  // -------------------------------------------------------------------------
  // HISTORY SECTION STATES
  // -------------------------------------------------------------------------

  test.describe('Goal History Section', () => {
    let goalsPage: AgentXGoalsPage;

    test.beforeEach(async ({ page, testUser: _testUser }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      await mockDashboard(page);
      goalsPage = new AgentXGoalsPage(page);
      await goalsPage.goto();
      await goalsPage.openGoalsPanel();
    });

    test('should show empty state in history when no goals completed', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');

      await mockGoalHistory(page, MOCK_HISTORY_EMPTY);
      await goalsPage.openHistorySection();

      await expect(goalsPage.historyContainer).toBeVisible();
      await expect(goalsPage.historyEmpty).toBeVisible({ timeout: 5_000 });
      await expect(goalsPage.historyItems).toHaveCount(0);
    });

    test('should show error state when history API fails', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');

      await mockGoalHistoryFailure(page);
      await goalsPage.openHistorySection();

      await expect(goalsPage.historyContainer).toBeVisible();
      await expect(goalsPage.historyError).toBeVisible({ timeout: 5_000 });
    });

    test('should display history records with category icon and days badge', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');

      await mockGoalHistory(page);
      await goalsPage.openHistorySection();

      await expect(goalsPage.historyItems).toHaveCount(1, { timeout: 5_000 });
      // Goal text visible
      await expect(goalsPage.historyItems.first()).toContainText(MOCK_GOAL_TEXT);
      // Days badge
      await expect(goalsPage.historyItemDays.first()).toContainText('14d');
    });
  });
});
