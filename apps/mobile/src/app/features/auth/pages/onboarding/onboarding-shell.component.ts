/**
 * @fileoverview OnboardingShellComponent - IonRouterOutlet Shell for Onboarding Steps
 * @module @nxt1/mobile/features/auth
 *
 * Provides native Ionic page transitions between onboarding steps.
 * Each step is a separate page component rendered inside the IonRouterOutlet.
 *
 * Architecture (mirrors MobileShellComponent pattern):
 * ┌────────────────────────────────────────────────────────────┐
 * │              OnboardingShellComponent (THIS FILE)           │
 * │   ┌──────────────────────────────────────────────────────┐ │
 * │   │         <ion-router-outlet>                          │ │
 * │   │   RoleStepPage → ProfileStepPage → SportStepPage ... │ │
 * │   └──────────────────────────────────────────────────────┘ │
 * │   ┌──────────────────────────────────────────────────────┐ │
 * │   │         Persistent Footer (outside outlet)           │ │
 * │   │   Quick-add link bar + Continue/Skip/SignOut buttons │ │
 * │   └──────────────────────────────────────────────────────┘ │
 * └────────────────────────────────────────────────────────────┘
 *
 * Route: /auth/onboarding (parent of step child routes)
 */

import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy } from '@angular/core';
import { IonRouterOutlet } from '@ionic/angular/standalone';
import { OnboardingButtonMobileComponent } from '@nxt1/ui';
import { OnboardingService } from '../../../../core/services/auth/onboarding.service';

@Component({
  selector: 'app-onboarding-shell',
  standalone: true,
  imports: [IonRouterOutlet, OnboardingButtonMobileComponent],
  template: `
    <!-- Step pages slide in/out here via native Ionic transitions -->
    <ion-router-outlet></ion-router-outlet>

    <!-- Persistent footer — stays fixed, doesn't slide with pages -->
    <div
      class="nxt1-onboarding-footer"
      [class.nxt1-onboarding-footer--visible]="onboarding.footerVisible()"
    >
      @if (onboarding.isLinkSourcesStep()) {
        <form
          class="nxt1-link-quick-add"
          [attr.data-testid]="onboarding.linkSourceTestIds.QUICK_ADD_CONTAINER"
          (submit)="onboarding.onQuickLinkSubmit($event)"
        >
          <input
            [id]="quickAddInputId"
            class="nxt1-link-quick-add__input"
            type="url"
            inputmode="url"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            [attr.data-testid]="onboarding.linkSourceTestIds.QUICK_ADD_INPUT"
            [value]="onboarding.quickAddLinkValue()"
            placeholder="Add any link here"
            (input)="onboarding.onQuickLinkInput($event)"
          />
          <button
            type="submit"
            class="nxt1-link-quick-add__btn"
            [attr.data-testid]="onboarding.linkSourceTestIds.QUICK_ADD_SUBMIT"
            [disabled]="!onboarding.canSubmitQuickLink()"
            aria-label="Add link"
          >
            +
          </button>
        </form>
      }
      <nxt1-onboarding-button-mobile
        [totalSteps]="onboarding.totalSteps()"
        [currentStepIndex]="onboarding.currentStepIndex()"
        [completedStepIndices]="onboarding.completedStepIndices()"
        [showSkip]="onboarding.isCurrentStepOptional()"
        [isLastStep]="onboarding.isLastStep()"
        [loading]="onboarding.isLoading()"
        [disabled]="
          (!onboarding.isCurrentStepValid() && !onboarding.isCurrentStepOptional()) ||
          !onboarding.contentReady()
        "
        [showSignOut]="true"
        (skipClick)="onboarding.onSkip()"
        (continueClick)="onboarding.onContinue()"
        (signOutClick)="onboarding.onSignOut()"
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

      .nxt1-onboarding-footer {
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

      .nxt1-onboarding-footer--visible {
        opacity: 1;
        pointer-events: auto;
      }

      /* Quick-add link bar */
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
export class OnboardingShellComponent implements OnInit, OnDestroy {
  protected readonly onboarding = inject(OnboardingService);
  protected readonly quickAddInputId = 'onboarding-link-quick-add-input';

  ngOnInit(): void {
    this.onboarding.initialize();
  }

  ngOnDestroy(): void {
    this.onboarding.destroy();
  }
}
