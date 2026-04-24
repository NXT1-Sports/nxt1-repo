/**
 * @fileoverview Agent X Goals Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Page Object Model for the Agent X Goals control panel and goal history.
 * Covers goal pills (active goals), the complete button, and the history section.
 *
 * Uses TEST_IDS.AGENT_X_GOALS from @nxt1/core/testing for all selectors.
 */

import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { AGENT_X_GOALS_TEST_IDS } from '@nxt1/core/testing';

/**
 * Page Object for the Agent X goals control panel panel (`panel === 'goals'`).
 *
 * The goals panel is opened from the Agent X shell (web) via the "Goals" badge.
 * It renders as a modal or bottom sheet depending on viewport.
 */
export class AgentXGoalsPage extends BasePage {
  readonly url = '/agent-x';

  // ── Active goals list ─────────────────────────────────────────────────────
  /** Wrapper div around all active goal pills. */
  readonly activeList: Locator;
  /** Individual active goal pill (all instances). */
  readonly activeItems: Locator;
  /** "✓ Done" complete button inside a pill (all instances). */
  readonly completeButtons: Locator;

  // ── Goal history section ──────────────────────────────────────────────────
  /** Outer container of the deferred history component. */
  readonly historyContainer: Locator;
  /** Individual history record rows (all instances). */
  readonly historyItems: Locator;
  /** Empty-state element shown when no goals are completed yet. */
  readonly historyEmpty: Locator;
  /** Error-state element shown when the history API call fails. */
  readonly historyError: Locator;
  /** "Xd" days-to-complete badge inside a history row. */
  readonly historyItemDays: Locator;

  constructor(page: Page) {
    super(page);
    this.activeList = page.getByTestId(AGENT_X_GOALS_TEST_IDS.ACTIVE_LIST);
    this.activeItems = page.getByTestId(AGENT_X_GOALS_TEST_IDS.ACTIVE_ITEM);
    this.completeButtons = page.getByTestId(AGENT_X_GOALS_TEST_IDS.COMPLETE_BTN);
    this.historyContainer = page.getByTestId(AGENT_X_GOALS_TEST_IDS.HISTORY_CONTAINER);
    this.historyItems = page.getByTestId(AGENT_X_GOALS_TEST_IDS.HISTORY_ITEM);
    this.historyEmpty = page.getByTestId(AGENT_X_GOALS_TEST_IDS.HISTORY_EMPTY);
    this.historyError = page.getByTestId(AGENT_X_GOALS_TEST_IDS.HISTORY_ERROR);
    this.historyItemDays = page.getByTestId(AGENT_X_GOALS_TEST_IDS.HISTORY_ITEM_DAYS);
  }

  /** Navigate to the Agent X shell and wait for hydration. */
  override async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForHydration();
  }

  /**
   * Open the goals control panel by clicking the "Goals" badge
   * in the Agent X shell header.
   */
  async openGoalsPanel(): Promise<void> {
    // The badge label contains the word "Goals" — find it by accessible text
    await this.page.getByRole('button', { name: /goals/i }).first().click();
    // Wait for the panel body to appear
    await this.activeList
      .or(this.page.locator('.goals-shell'))
      .waitFor({ state: 'visible', timeout: 8_000 })
      .catch(() => {
        // Panel may render without active goals (no activeList), that's fine
      });
  }

  /**
   * Click the complete button on the first active goal pill.
   * Waits for the pill to disappear (optimistic removal).
   */
  async completeFirstGoal(): Promise<void> {
    await this.completeButtons.first().click();
    // Optimistic update removes the pill — wait for count to drop
    await this.activeItems
      .first()
      .waitFor({ state: 'hidden', timeout: 5_000 })
      .catch(() => {});
  }

  /**
   * Click the complete button on the goal pill at `index`.
   */
  async completeGoalAt(index: number): Promise<void> {
    await this.completeButtons.nth(index).click();
  }

  /**
   * Trigger the deferred history section by clicking the placeholder trigger.
   * Waits for the history container to appear.
   */
  async openHistorySection(): Promise<void> {
    const trigger = this.page.getByRole('button', { name: /view completed goals/i });
    await trigger.click();
    await this.historyContainer.waitFor({ state: 'visible', timeout: 8_000 });
  }

  /**
   * Return the count of currently displayed active goal pills.
   */
  async getActivePillCount(): Promise<number> {
    return this.activeItems.count();
  }

  /**
   * Return the count of completed goal history rows.
   */
  async getHistoryItemCount(): Promise<number> {
    return this.historyItems.count();
  }
}
