/**
 * @fileoverview Agent X Message Interactions Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Page Object Model for the Agent X operation chat message interaction layer:
 * copy, edit, delete, undo, and feedback actions.
 *
 * Selects elements via TEST_IDS constants from @nxt1/core/testing
 * so selectors stay in sync with production templates.
 */

import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';
import {
  AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS,
  AGENT_X_MESSAGE_EDIT_TEST_IDS,
  AGENT_X_FEEDBACK_MODAL_TEST_IDS,
  AGENT_X_MESSAGE_UNDO_TEST_IDS,
} from '@nxt1/core/testing';

export class AgentXMessageInteractionsPage extends BasePage {
  /** Operation chat is reached via the Agent X shell. */
  readonly url = '/agent-x';

  // ── Action chip rows (one per message) ─────────────────────────────────────
  /** All action-chip root elements in the page. */
  readonly allActionRows: Locator;
  /** Copy button instances across all messages. */
  readonly allCopyButtons: Locator;
  /** Feedback button instances (assistant messages only). */
  readonly allFeedbackButtons: Locator;
  /** Edit button instances (user messages only). */
  readonly allEditButtons: Locator;
  /** Delete button instances (user messages only). */
  readonly allDeleteButtons: Locator;

  // ── Inline edit ────────────────────────────────────────────────────────────
  /** Inline edit root panel. */
  readonly editPanel: Locator;
  /** Inline edit textarea. */
  readonly editTextarea: Locator;
  /** Cancel inline edit button. */
  readonly editCancelButton: Locator;
  /** Save / resend inline edit button. */
  readonly editSaveButton: Locator;

  // ── Feedback modal ─────────────────────────────────────────────────────────
  /** Feedback modal overlay (clicking outside this dismisses). */
  readonly feedbackOverlay: Locator;
  /** Feedback modal panel. */
  readonly feedbackModal: Locator;
  /** All 5 star buttons inside the feedback modal. */
  readonly feedbackStarButtons: Locator;
  /** Category <select> in the feedback modal. */
  readonly feedbackCategorySelect: Locator;
  /** Free-text <textarea> in the feedback modal. */
  readonly feedbackTextarea: Locator;
  /** Submit button in the feedback modal. */
  readonly feedbackSubmitButton: Locator;
  /** Cancel button in the feedback modal. */
  readonly feedbackCancelButton: Locator;

  // ── Undo banner ────────────────────────────────────────────────────────────
  /** Undo countdown banner element. */
  readonly undoBanner: Locator;
  /** "Undo" CTA button inside the banner. */
  readonly undoButton: Locator;
  /** Countdown timer label inside the banner. */
  readonly undoTimer: Locator;

  constructor(page: Page) {
    super(page);

    // Action row
    this.allActionRows = page.getByTestId(AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.ROOT);
    this.allCopyButtons = page.getByTestId(AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.BTN_COPY);
    this.allFeedbackButtons = page.getByTestId(AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.BTN_FEEDBACK);
    this.allEditButtons = page.getByTestId(AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.BTN_EDIT);
    this.allDeleteButtons = page.getByTestId(AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS.BTN_DELETE);

    // Edit panel
    this.editPanel = page.getByTestId(AGENT_X_MESSAGE_EDIT_TEST_IDS.ROOT);
    this.editTextarea = page.getByTestId(AGENT_X_MESSAGE_EDIT_TEST_IDS.TEXTAREA);
    this.editCancelButton = page.getByTestId(AGENT_X_MESSAGE_EDIT_TEST_IDS.BTN_CANCEL);
    this.editSaveButton = page.getByTestId(AGENT_X_MESSAGE_EDIT_TEST_IDS.BTN_SAVE);

    // Feedback modal
    this.feedbackOverlay = page.getByTestId(AGENT_X_FEEDBACK_MODAL_TEST_IDS.OVERLAY);
    this.feedbackModal = page.getByTestId(AGENT_X_FEEDBACK_MODAL_TEST_IDS.MODAL);
    this.feedbackStarButtons = page.getByTestId(AGENT_X_FEEDBACK_MODAL_TEST_IDS.STAR_BUTTON);
    this.feedbackCategorySelect = page.getByTestId(AGENT_X_FEEDBACK_MODAL_TEST_IDS.CATEGORY_SELECT);
    this.feedbackTextarea = page.getByTestId(AGENT_X_FEEDBACK_MODAL_TEST_IDS.TEXTAREA);
    this.feedbackSubmitButton = page.getByTestId(AGENT_X_FEEDBACK_MODAL_TEST_IDS.BTN_SUBMIT);
    this.feedbackCancelButton = page.getByTestId(AGENT_X_FEEDBACK_MODAL_TEST_IDS.BTN_CANCEL);

    // Undo banner
    this.undoBanner = page.getByTestId(AGENT_X_MESSAGE_UNDO_TEST_IDS.BANNER);
    this.undoButton = page.getByTestId(AGENT_X_MESSAGE_UNDO_TEST_IDS.BTN_UNDO);
    this.undoTimer = page.getByTestId(AGENT_X_MESSAGE_UNDO_TEST_IDS.TIMER);
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  override async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForHydration();
  }

  // ── Copy ────────────────────────────────────────────────────────────────────

  /** Click the copy button on the message at `index`. */
  async copyMessage(index = 0): Promise<void> {
    await this.allCopyButtons.nth(index).click();
  }

  // ── Edit ────────────────────────────────────────────────────────────────────

  /**
   * Open the inline edit panel for the user message at `index`,
   * replace the text, and click Save.
   */
  async editMessage(index: number, newText: string): Promise<void> {
    await this.allEditButtons.nth(index).click();
    await this.editTextarea.waitFor({ state: 'visible' });
    await this.editTextarea.fill(newText);
    await this.editSaveButton.click();
  }

  /**
   * Open the inline edit panel and cancel without saving.
   */
  async startAndCancelEdit(index = 0): Promise<void> {
    await this.allEditButtons.nth(index).click();
    await this.editTextarea.waitFor({ state: 'visible' });
    await this.editCancelButton.click();
  }

  // ── Delete / Undo ──────────────────────────────────────────────────────────

  /**
   * Click the delete button on the message at `index`.
   * Waits for the undo banner to appear.
   */
  async deleteMessage(index = 0): Promise<void> {
    await this.allDeleteButtons.nth(index).click();
    await this.undoBanner.waitFor({ state: 'visible', timeout: 5_000 });
  }

  /**
   * Click Undo from the countdown banner.
   */
  async undoDelete(): Promise<void> {
    await this.undoButton.click();
  }

  // ── Feedback ────────────────────────────────────────────────────────────────

  /**
   * Open the feedback modal for the assistant message at `index`,
   * optionally set a star rating, and submit.
   */
  async submitFeedback(
    index: number,
    opts: { rating?: number; category?: string; text?: string } = {}
  ): Promise<void> {
    await this.allFeedbackButtons.nth(index).click();
    await this.feedbackModal.waitFor({ state: 'visible' });

    if (opts.rating !== undefined) {
      // Stars are 1-indexed — click star at (rating - 1) zero-based index
      await this.feedbackStarButtons.nth(opts.rating - 1).click();
    }
    if (opts.category) {
      await this.feedbackCategorySelect.selectOption(opts.category);
    }
    if (opts.text) {
      await this.feedbackTextarea.fill(opts.text);
    }

    await this.feedbackSubmitButton.click();
  }

  /**
   * Dismiss the feedback modal via the cancel button.
   */
  async cancelFeedback(index: number): Promise<void> {
    await this.allFeedbackButtons.nth(index).click();
    await this.feedbackModal.waitFor({ state: 'visible' });
    await this.feedbackCancelButton.click();
  }
}
