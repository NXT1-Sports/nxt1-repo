import { test, expect } from '../../fixtures';
import { TEST_IDS } from '@nxt1/core/testing';

const MOCK_DIAGRAM_LAYOUT = {
  sport: 'football',
  title: 'Trips Mesh Formation',
  fieldWidth: 320,
  fieldHeight: 420,
  losY: 120,
  fieldStyle: 'classic',
  players: [
    { id: 'player-qb', label: 'QB', x: 160, y: 150, team: 'offense', shape: 'circle' },
    { id: 'player-x', label: 'X', x: 92, y: 102, team: 'offense', shape: 'circle' },
    { id: 'player-z', label: 'Z', x: 228, y: 102, team: 'offense', shape: 'circle' },
  ],
  routes: [
    {
      id: 'route-1',
      from: 'player-x',
      label: 'Mesh',
      type: 'drag',
      curve: true,
      points: [
        [92, 102],
        [130, 154],
        [188, 164],
      ],
    },
  ],
  zones: [],
} as const;

const MOCK_DASHBOARD_RESPONSE = {
  success: true,
  data: {
    briefing: { title: 'Agent X', insights: [], generatedAt: new Date().toISOString() },
    playbook: { title: 'Weekly Plan', items: [] },
    goals: [],
    operations: [],
    coordinators: [],
  },
};

const MOCK_DIAGRAMS_RESPONSE = {
  success: true,
  data: {
    diagrams: [
      {
        id: 'diagram-1',
        kind: 'sport_play',
        sport: 'football',
        title: 'Trips Mesh Formation',
        description: 'Trips mesh route concept from 11 personnel.',
        imageUrl: 'https://cdn.example.com/trips-mesh.png',
        editUrl: 'https://app.diagrams.net/?title=Trips%20Mesh',
        threadId: 'thread-1',
        createdAt: Date.now() - 1000,
        updatedAt: Date.now(),
      },
    ],
    count: 1,
  },
};

const MOCK_DIAGRAM_DETAIL_RESPONSE = {
  success: true,
  data: {
    diagram: {
      ...MOCK_DIAGRAMS_RESPONSE.data.diagrams[0],
      sourceLayout: MOCK_DIAGRAM_LAYOUT,
    },
  },
};

async function mockAgentX(
  page: import('@playwright/test').Page,
  diagramsResponse = MOCK_DIAGRAMS_RESPONSE,
  diagramDetailResponse = MOCK_DIAGRAM_DETAIL_RESPONSE
) {
  await page.route('**/agent-x/dashboard', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_DASHBOARD_RESPONSE),
    })
  );

  await page.route('**/agent-x/diagram-assets**', (route) =>
    route.fulfill(
      /\/diagram-assets\/[^/?]+$/.test(route.request().url())
        ? {
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(diagramDetailResponse),
          }
        : {
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(diagramsResponse),
          }
    )
  );
}

test.describe('Agent X Diagrams Lab', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
    await mockAgentX(page);
  });

  test('opens the diagrams lab panel and previews the selected diagram', async ({ page }) => {
    await page.goto('/agent-x');
    await page.getByRole('button', { name: /panel options/i }).click();
    await page.getByRole('menuitemradio', { name: /diagrams lab/i }).click();

    await expect(page.getByTestId(TEST_IDS.DIAGRAMS_LAB.PANEL_CONTAINER)).toBeVisible();
    await expect(page.getByTestId(TEST_IDS.DIAGRAMS_LAB.LIST_ITEM).first()).toContainText(
      'Trips Mesh Formation'
    );
    await expect(page.getByTestId(TEST_IDS.DIAGRAMS_LAB.VIEWER_IMAGE)).toBeVisible();
  });

  test('shows an empty state when no diagrams exist', async ({ page }) => {
    await mockAgentX(page, { success: true, data: { diagrams: [], count: 0 } });
    await page.goto('/agent-x');
    await page.getByRole('button', { name: /panel options/i }).click();
    await page.getByRole('menuitemradio', { name: /diagrams lab/i }).click();

    await expect(page.getByTestId(TEST_IDS.DIAGRAMS_LAB.EMPTY_STATE)).toBeVisible();
  });

  test('shows an error state when diagrams fail to load', async ({ page }) => {
    await mockAgentX(page, { success: false, error: 'Failed to load diagrams' });
    await page.goto('/agent-x');
    await page.getByRole('button', { name: /panel options/i }).click();
    await page.getByRole('menuitemradio', { name: /diagrams lab/i }).click();

    await expect(page.getByTestId(TEST_IDS.DIAGRAMS_LAB.ERROR_STATE)).toBeVisible();
  });

  test('supports undo and redo in the builder toolbar', async ({ page }) => {
    await page.goto('/agent-x');
    await page.getByRole('button', { name: /panel options/i }).click();
    await page.getByRole('menuitemradio', { name: /diagrams lab/i }).click();

    await page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().includes('/agent-x/diagram-assets/diagram-1')
    );

    await page.getByTestId(TEST_IDS.DIAGRAMS_LAB.BUILDER_EDIT_BUTTON).click();

    const undoButton = page.getByTestId(TEST_IDS.DIAGRAMS_LAB.BUILDER_UNDO_BUTTON);
    const redoButton = page.getByTestId(TEST_IDS.DIAGRAMS_LAB.BUILDER_REDO_BUTTON);

    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();

    await page.getByTestId(TEST_IDS.DIAGRAMS_LAB.BUILDER_ADD_TEXT_BUTTON).click();
    await page.getByTestId(TEST_IDS.DIAGRAMS_LAB.BUILDER_CANVAS).click({
      position: { x: 220, y: 180 },
    });

    await expect(undoButton).toBeEnabled();
    await expect(redoButton).toBeDisabled();

    await undoButton.click();

    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeEnabled();

    await redoButton.click();

    await expect(undoButton).toBeEnabled();
    await expect(redoButton).toBeDisabled();
  });
});
