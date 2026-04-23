/**
 * @fileoverview AddSportShellComponent - Shell for Add Sport Wizard
 * @module @nxt1/mobile/features/add-sport
 *
 * Mirrors OnboardingShellComponent pattern:
 * - IonRouterOutlet renders step pages with native slide transitions.
 * - Persistent footer (Continue / Skip / Back) stays fixed.
 *
 * Route: /add-sport (parent of sport + link-sources child routes)
 * Provided: AddSportService (scoped to this shell + children)
 */

import { Component, ChangeDetectionStrategy, OnInit, OnDestroy, inject } from '@angular/core';
import { IonRouterOutlet } from '@ionic/angular/standalone';
import { OnboardingButtonMobileComponent } from '@nxt1/ui';
import { TEST_IDS } from '@nxt1/core/testing';
import { AddSportService } from './add-sport.service';

@Component({
  selector: 'app-add-sport-shell',
  standalone: true,
  imports: [IonRouterOutlet, OnboardingButtonMobileComponent],
  providers: [AddSportService],
  template: `
    <!-- Step pages slide in/out here via native Ionic transitions -->
    <ion-router-outlet></ion-router-outlet>

    <!-- Persistent footer — stays fixed, does not slide with pages -->
    <div
      class="nxt1-add-sport-footer"
      [class.nxt1-add-sport-footer--visible]="addSport.footerVisible()"
      [attr.data-testid]="testIds.MOBILE_FOOTER"
    >
      @if (addSport.isLinkSourcesStep()) {
        <form
          class="nxt1-link-quick-add"
          [attr.data-testid]="testIds.QUICK_ADD_FORM"
          (submit)="addSport.onQuickLinkSubmit($event)"
        >
          <input
            class="nxt1-link-quick-add__input"
            type="url"
            inputmode="url"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            [value]="addSport.quickAddLinkValue()"
            placeholder="Add any link here"
            [attr.data-testid]="testIds.QUICK_ADD_INPUT"
            (input)="addSport.onQuickLinkInput($event)"
          />
          <button
            type="submit"
            class="nxt1-link-quick-add__btn"
            [disabled]="!addSport.canSubmitQuickLink()"
            [attr.data-testid]="testIds.QUICK_ADD_SUBMIT"
            aria-label="Add link"
          >
            +
          </button>
        </form>
      }

      <nxt1-onboarding-button-mobile
        [totalSteps]="addSport.totalSteps()"
        [currentStepIndex]="addSport.currentStepIndex()"
        [completedStepIndices]="[]"
        [showSkip]="addSport.isLastStep() || addSport.isOrganizationStep()"
        [isLastStep]="addSport.isLastStep()"
        [loading]="addSport.isLoading()"
        [disabled]="!addSport.isCurrentStepValid() || !addSport.contentReady()"
        [showSignOut]="false"
        (skipClick)="addSport.onSkip()"
        (continueClick)="addSport.onContinue()"
      />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        position: relative;
      }

      .nxt1-add-sport-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 100;
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
        padding-bottom: calc(var(--nxt1-spacing-3, 12px) + env(safe-area-inset-bottom, 0px));
        background: var(--nxt1-color-bg-primary, #ffffff);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
      }

      .nxt1-add-sport-footer--visible {
        opacity: 1;
        pointer-events: auto;
      }

      .nxt1-link-quick-add {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-3, 12px);
        margin-bottom: var(--nxt1-spacing-2, 8px);
        background: var(--nxt1-color-surface-200, #f1f5f9);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
      }

      .nxt1-link-quick-add__input {
        flex: 1;
        min-width: 0;
        border: none;
        background: transparent;
        padding: var(--nxt1-spacing-1, 4px) 0;
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-primary, #0f172a);
        outline: none;
      }

      .nxt1-link-quick-add__input::placeholder {
        color: var(--nxt1-color-text-tertiary, #94a3b8);
      }

      .nxt1-link-quick-add__btn {
        appearance: none;
        -webkit-appearance: none;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        border: none;
        border-radius: 50%;
        background: var(--nxt1-color-text-primary, #0f172a);
        color: var(--nxt1-color-surface-100, #ffffff);
        font-size: 1.25rem;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
        transition: opacity var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out);
      }

      .nxt1-link-quick-add__btn:active:not(:disabled) {
        opacity: 0.7;
      }

      .nxt1-link-quick-add__btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddSportShellComponent implements OnInit, OnDestroy {
  protected readonly addSport = inject(AddSportService);
  protected readonly testIds = TEST_IDS.ADD_SPORT;

  ngOnInit(): void {
    this.addSport.initialize();
  }

  ngOnDestroy(): void {
    this.addSport.destroy();
  }
}
