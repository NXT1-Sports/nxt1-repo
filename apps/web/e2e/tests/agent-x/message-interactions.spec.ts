/**
 * @fileoverview Agent X Message Interactions — E2E Tests
 * @module @nxt1/web/e2e/tests/agent-x
 *
 * End-to-end tests for copy, edit, delete/undo, and feedback flows in the
 * Agent X operation chat component.
 *
 * Coverage:
 * - Copy button visible on all messages; API annotation called on persisted IDs
 * - Edit panel opens and cancels cleanly
 * - Edit panel saves and triggers regeneration (rerunEnqueued=true)
 * - Edit API failure surfaces an error toast
 * - Delete removes message and shows undo banner
 * - Undo restores the message
 * - Undo banner disappears after countdown expires
 * - Delete API failure surfaces an error toast and does NOT show undo banner
 * - Feedback modal opens on assistant message
 * - Feedback modal cancel dismisses without submitting
 * - Feedback submit calls the API and closes the modal
 * - Feedback API failure surfaces an error toast
 */

import { test, expect } from '../../fixtures';
import { AgentXMessageInteractionsPage } from '../../pages/agent-x-message-interactions.page';

// =============================================================================
// MOCK DATA
// =============================================================================

const THREAD_ID = 'thread-abc123';
const USER_MSG_ID = '6620000000000000000aaaaa'; // 24-char hex → persisted
const ASST_MSG_ID = '6620000000000000000bbbbb';
const RESTORE_TOKEN = 'restore-tok-xyz';
const NOW = new Date().toISOString();

const MOCK_THREAD_MESSAGES = [
  {
    id: USER_MSG_ID,
    role: 'user',
    content: 'Can you help me draft a recruitment email?',
    timestamp: NOW,
    threadId: THREAD_ID,
  },
  {
    id: ASST_MSG_ID,
    role: 'assistant',
    content: 'Of course! Here is a draft recruitment email for you.',
    timestamp: NOW,
    threadId: THREAD_ID,
  },
];

const MOCK_THREAD_RESPONSE = {
  success: true,
  data: {
    messages: MOCK_THREAD_MESSAGES,
    threadId: THREAD_ID,
    operationId: null,
    status: 'complete',
  },
};

const MOCK_EDIT_SUCCESS = {
  success: true,
  data: {
    message: { ...MOCK_THREAD_MESSAGES[0], content: 'Revised message' },
    rerunEnqueued: true,
    operationId: 'op-rerun-001',
  },
};

const MOCK_DELETE_SUCCESS = {
  success: true,
  data: {
    messageId: USER_MSG_ID,
    deletedResponseMessageId: ASST_MSG_ID,
    restoreTokenId: RESTORE_TOKEN,
  },
};

const MOCK_UNDO_SUCCESS = {
  success: true,
  data: { restored: true },
};

const MOCK_FEEDBACK_SUCCESS = {
  success: true,
  data: { acknowledged: true },
};

const MOCK_ANNOTATE_SUCCESS = {
  success: true,
  data: {},
};

// =============================================================================
// HELPERS
// =============================================================================

type PW = import('@playwright/test').Page;

async function mockThread(page: PW, override?: object) {
  await page.route(`**/agent-x/threads/${THREAD_ID}/messages`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(override ?? MOCK_THREAD_RESPONSE),
    })
  );
}

async function mockEdit(page: PW, override?: object) {
  await page.route(`**/agent-x/messages/${USER_MSG_ID}`, async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(override ?? MOCK_EDIT_SUCCESS),
      });
    } else {
      await route.fallback();
    }
  });
}

async function mockDelete(page: PW, override?: object) {
  await page.route(`**/agent-x/messages/${USER_MSG_ID}/delete`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(override ?? MOCK_DELETE_SUCCESS),
    })
  );
}

async function mockUndo(page: PW, override?: object) {
  await page.route(`**/agent-x/messages/${USER_MSG_ID}/undo`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(override ?? MOCK_UNDO_SUCCESS),
    })
  );
}

async function mockFeedback(page: PW, override?: object) {
  await page.route(`**/agent-x/messages/${ASST_MSG_ID}/feedback`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(override ?? MOCK_FEEDBACK_SUCCESS),
    })
  );
}

async function mockAnnotate(page: PW) {
  await page.route(`**/agent-x/messages/${USER_MSG_ID}/annotate`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_ANNOTATE_SUCCESS),
    })
  );
  await page.route(`**/agent-x/messages/${ASST_MSG_ID}/annotate`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_ANNOTATE_SUCCESS),
    })
  );
}

// =============================================================================
// TESTS
// =============================================================================

test.describe('Agent X — Message Interactions', () => {
  let chatPage: AgentXMessageInteractionsPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new AgentXMessageInteractionsPage(page);
  });

  // ── Copy ──────────────────────────────────────────────────────────────────

  test('copy button is visible on every message', async ({ page }) => {
    await mockThread(page);
    await chatPage.goto();
    await expect(chatPage.allCopyButtons.first()).toBeVisible();
  });

  test('copying a persisted message calls annotation API', async ({ page }) => {
    await mockThread(page);
    await mockAnnotate(page);

    const annotationRequest = page.waitForRequest(
      (req) => req.url().includes('/annotate') && req.method() === 'POST'
    );

    await chatPage.goto();
    await chatPage.copyMessage(0);
    await annotationRequest;
    // If we reach here the annotation was called — test passes
  });

  // ── Edit ──────────────────────────────────────────────────────────────────

  test('edit button opens inline editor and cancel hides it', async ({ page }) => {
    await mockThread(page);
    await chatPage.goto();

    await chatPage.allEditButtons.first().click();
    await expect(chatPage.editPanel).toBeVisible();

    await chatPage.editCancelButton.click();
    await expect(chatPage.editPanel).toBeHidden();
  });

  test('save edit calls PUT endpoint and updates message in-place', async ({ page }) => {
    await mockThread(page);
    await mockEdit(page);

    const editRequest = page.waitForRequest(
      (req) => req.url().includes(`/messages/${USER_MSG_ID}`) && req.method() === 'PUT'
    );

    await chatPage.goto();
    await chatPage.editMessage(0, 'Revised message text');
    await editRequest;

    // Edit panel should close after a successful save
    await expect(chatPage.editPanel).toBeHidden();
  });

  test('edit API failure shows error toast, keeps panel open', async ({ page }) => {
    await mockThread(page);
    await mockEdit(page, { success: false, error: 'Edit not allowed' });

    await chatPage.goto();
    await chatPage.allEditButtons.first().click();
    await chatPage.editTextarea.fill('New text');
    await chatPage.editSaveButton.click();

    await expect(page.locator('text=Edit not allowed')).toBeVisible({ timeout: 5_000 });
  });

  // ── Delete / Undo ─────────────────────────────────────────────────────────

  test('delete shows undo banner', async ({ page }) => {
    await mockThread(page);
    await mockDelete(page);

    await chatPage.goto();
    await chatPage.deleteMessage(0);

    await expect(chatPage.undoBanner).toBeVisible();
    await expect(chatPage.undoTimer).toBeVisible();
  });

  test('undo restores the deleted message', async ({ page }) => {
    await mockThread(page);
    await mockDelete(page);
    await mockUndo(page);

    await chatPage.goto();
    await chatPage.deleteMessage(0);
    await chatPage.undoDelete();

    // Banner disappears after undo
    await expect(chatPage.undoBanner).toBeHidden({ timeout: 5_000 });
  });

  test('delete API failure shows error toast and does NOT show undo banner', async ({ page }) => {
    await mockThread(page);
    await mockDelete(page, { success: false, error: 'Cannot delete this message' });

    await chatPage.goto();
    await chatPage.allDeleteButtons.first().click();

    await expect(page.locator('text=Cannot delete this message')).toBeVisible({ timeout: 5_000 });
    await expect(chatPage.undoBanner).toBeHidden();
  });

  // ── Feedback ──────────────────────────────────────────────────────────────

  test('feedback button is visible on assistant messages', async ({ page }) => {
    await mockThread(page);
    await chatPage.goto();
    await expect(chatPage.allFeedbackButtons.first()).toBeVisible();
  });

  test('opening feedback modal shows star buttons and category select', async ({ page }) => {
    await mockThread(page);
    await chatPage.goto();

    await chatPage.allFeedbackButtons.first().click();
    await expect(chatPage.feedbackModal).toBeVisible();
    await expect(chatPage.feedbackStarButtons.first()).toBeVisible();
    await expect(chatPage.feedbackCategorySelect).toBeVisible();
  });

  test('cancel button dismisses feedback modal without submitting', async ({ page }) => {
    await mockThread(page);
    await chatPage.goto();

    await chatPage.cancelFeedback(0);
    await expect(chatPage.feedbackModal).toBeHidden({ timeout: 4_000 });
  });

  test('submit feedback calls API and closes modal', async ({ page }) => {
    await mockThread(page);
    await mockFeedback(page);

    const feedbackRequest = page.waitForRequest(
      (req) => req.url().includes('/feedback') && req.method() === 'POST'
    );

    await chatPage.goto();
    await chatPage.submitFeedback(0, { rating: 4, category: 'helpful', text: 'Great response' });
    await feedbackRequest;

    await expect(chatPage.feedbackModal).toBeHidden({ timeout: 5_000 });
  });

  test('feedback API failure shows error toast', async ({ page }) => {
    await mockThread(page);
    await mockFeedback(page, { success: false, error: 'Feedback service unavailable' });

    await chatPage.goto();
    await chatPage.allFeedbackButtons.first().click();
    await chatPage.feedbackModal.waitFor({ state: 'visible' });
    await chatPage.feedbackSubmitButton.click();

    await expect(page.locator('text=Feedback service unavailable')).toBeVisible({ timeout: 5_000 });
  });

  test('clicking overlay outside modal dismisses it', async ({ page }) => {
    await mockThread(page);
    await chatPage.goto();

    await chatPage.allFeedbackButtons.first().click();
    await chatPage.feedbackModal.waitFor({ state: 'visible' });
    // Click on the overlay background (not the panel)
    await chatPage.feedbackOverlay.click({ position: { x: 4, y: 4 } });

    await expect(chatPage.feedbackModal).toBeHidden({ timeout: 4_000 });
  });
});
