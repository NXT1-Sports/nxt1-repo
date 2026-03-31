/**
 * @fileoverview Add Sport Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Page Object Model for the Add Sport / Add Team wizard (web).
 * Covers the multi-step wizard flow: sport selection → link sources → save.
 *
 * Uses TEST_IDS from @nxt1/core/testing for all selectors.
 */

import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { ADD_SPORT_TEST_IDS } from '@nxt1/core/testing';

/**
 * Page Object for the Add Sport page (/add-sport).
 */
export class AddSportPage extends BasePage {
  readonly url = '/add-sport';

  // Shell
  readonly shell: Locator;
  readonly title: Locator;
  readonly stepContent: Locator;

  // Steps
  readonly sportStep: Locator;
  readonly linkSourcesStep: Locator;

  // Footer
  readonly desktopFooter: Locator;
  readonly mobileFooter: Locator;

  // Quick Add
  readonly quickAddForm: Locator;
  readonly quickAddInput: Locator;
  readonly quickAddSubmit: Locator;

  // States
  readonly loading: Locator;
  readonly errorState: Locator;

  constructor(page: Page) {
    super(page);
    this.shell = page.getByTestId(ADD_SPORT_TEST_IDS.SHELL);
    this.title = page.getByTestId(ADD_SPORT_TEST_IDS.TITLE);
    this.stepContent = page.getByTestId(ADD_SPORT_TEST_IDS.STEP_CONTENT);
    this.sportStep = page.getByTestId(ADD_SPORT_TEST_IDS.STEP_SPORT);
    this.linkSourcesStep = page.getByTestId(ADD_SPORT_TEST_IDS.STEP_LINK_SOURCES);
    this.desktopFooter = page.getByTestId(ADD_SPORT_TEST_IDS.DESKTOP_FOOTER);
    this.mobileFooter = page.getByTestId(ADD_SPORT_TEST_IDS.MOBILE_FOOTER);
    this.quickAddForm = page.getByTestId(ADD_SPORT_TEST_IDS.QUICK_ADD_FORM);
    this.quickAddInput = page.getByTestId(ADD_SPORT_TEST_IDS.QUICK_ADD_INPUT);
    this.quickAddSubmit = page.getByTestId(ADD_SPORT_TEST_IDS.QUICK_ADD_SUBMIT);
    this.loading = page.getByTestId(ADD_SPORT_TEST_IDS.LOADING);
    this.errorState = page.getByTestId(ADD_SPORT_TEST_IDS.ERROR_STATE);
  }

  /**
   * Navigate to add-sport page and wait for the shell to be visible.
   * Requires the user to be authenticated.
   */
  override async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForElement(this.shell);
  }

  /**
   * Assert the wizard shell is visible and fully rendered.
   */
  async assertPageVisible(): Promise<void> {
    await this.assertVisible(this.shell);
  }

  /**
   * Assert the sport selection step is displayed.
   */
  async assertSportStepVisible(): Promise<void> {
    await this.assertVisible(this.sportStep);
  }

  /**
   * Assert the link-sources step is displayed.
   */
  async assertLinkSourcesStepVisible(): Promise<void> {
    await this.assertVisible(this.linkSourcesStep);
  }

  /**
   * Assert the empty/error state is displayed.
   */
  async assertErrorState(): Promise<void> {
    await this.assertVisible(this.errorState);
  }

  /**
   * Assert loading state is displayed.
   */
  async assertLoading(): Promise<void> {
    await this.assertVisible(this.loading);
  }

  /**
   * Click Continue / Next button in the footer.
   * Works for both desktop and mobile viewports.
   */
  async clickContinue(): Promise<void> {
    const continueBtn = this.page.getByRole('button', { name: /continue/i });
    await continueBtn.click();
  }

  /**
   * Click Skip button in the footer.
   */
  async clickSkip(): Promise<void> {
    const skipBtn = this.page.getByRole('button', { name: /skip/i });
    await skipBtn.click();
  }

  /**
   * Click Back button in the footer.
   */
  async clickBack(): Promise<void> {
    const backBtn = this.page.getByRole('button', { name: /back/i });
    await backBtn.click();
  }
}
