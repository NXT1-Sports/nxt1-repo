/**
 * @fileoverview Agent X Operations Log Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Page Object Model for the Agent X Operations Log / Sessions Rail.
 * Supports assertions and actions on session rows, pinned sections, and the options menu.
 */

import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { AGENT_X_OPERATIONS_LOG_TEST_IDS } from '@nxt1/core/testing';

export class AgentXOperationsLogPage extends BasePage {
  readonly url = '/agent-x';

  readonly scrollContainer: Locator;
  readonly pinnedGroup: Locator;
  readonly dayGroups: Locator;
  readonly entries: Locator;
  readonly menuButtons: Locator;
  readonly entryMenu: Locator;
  readonly pinButton: Locator;

  constructor(page: Page) {
    super(page);
    this.scrollContainer = page.getByTestId(AGENT_X_OPERATIONS_LOG_TEST_IDS.SCROLL_CONTAINER);
    this.pinnedGroup = page.getByTestId(AGENT_X_OPERATIONS_LOG_TEST_IDS.PINNED_GROUP);
    this.dayGroups = page.getByTestId(AGENT_X_OPERATIONS_LOG_TEST_IDS.DAY_GROUP);
    this.entries = page.getByTestId(AGENT_X_OPERATIONS_LOG_TEST_IDS.ENTRY);
    this.menuButtons = page.getByTestId(AGENT_X_OPERATIONS_LOG_TEST_IDS.ENTRY_MENU_BUTTON);
    this.entryMenu = page.getByTestId(AGENT_X_OPERATIONS_LOG_TEST_IDS.ENTRY_MENU);
    this.pinButton = page.getByTestId(AGENT_X_OPERATIONS_LOG_TEST_IDS.ENTRY_PIN_BUTTON);
  }

  override async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForHydration();
  }

  async openEntryMenu(index = 0): Promise<void> {
    await this.menuButtons.nth(index).click();
    await this.entryMenu.waitFor({ state: 'visible', timeout: 5_000 });
  }

  async openEntryMenuForTitle(title: string): Promise<void> {
    const entry = this.entries.filter({ hasText: title });
    await entry.getByTestId(AGENT_X_OPERATIONS_LOG_TEST_IDS.ENTRY_MENU_BUTTON).click();
    await this.entryMenu.waitFor({ state: 'visible', timeout: 5_000 });
  }

  async togglePin(index = 0): Promise<void> {
    await this.openEntryMenu(index);
    await this.pinButton.click();
  }
}
