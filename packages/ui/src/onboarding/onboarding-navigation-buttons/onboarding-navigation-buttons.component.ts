/**
 * @fileoverview OnboardingNavigationButtonsComponent - Cross-Platform Nav Buttons
 * @module @nxt1/ui/onboarding
 *
 * Reusable navigation buttons for onboarding wizard (Skip, Continue).
 * Matches the same pattern as auth components for consistency.
 *
 * Features:
 * - Platform-adaptive with Ionic integration
 * - Loading state with spinner
 * - Accessible with ARIA labels
 * - Test IDs for E2E testing
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-navigation-buttons
 *   [showSkip]="isCurrentStepOptional()"
 *   [showBack]="canGoBack()"
 *   [isLastStep]="isLastStep()"
 *   [loading]="isLoading()"
 *   [disabled]="!isCurrentStepValid()"
 *   (skipClick)="onSkip()"
 *   (backClick)="onBack()"
 *   (continueClick)="onContinue()"
 * />
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import { HapticButtonDirective } from '../../services/haptics';
import { NxtPlatformService } from '../../services/platform';

@Component({
  selector: 'nxt1-onboarding-navigation-buttons',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, HapticButtonDirective],
  template: `
    <!-- Navigation Container - Tailwind for layout -->
    <div
      [class]="
        isMobile()
          ? mobileLayout === 'row'
            ? 'mt-0 flex w-full items-center justify-end gap-2 p-0'
            : 'mt-0 flex w-full flex-col gap-0 p-0'
          : compact
            ? 'mt-0 flex w-full items-center justify-end gap-3'
            : 'mt-6 flex w-full items-center justify-end gap-3'
      "
    >
      <!-- Back Button (optional) -->
      @if (showBack) {
        <button
          type="button"
          [class]="
            'nxt1-back-btn ' + (compact ? 'rounded-full px-5 py-2.5' : 'rounded-lg px-6 py-3')
          "
          [disabled]="loading"
          (click)="backClick.emit()"
          [attr.data-testid]="backTestId"
          nxtHaptic="light"
        >
          <nxt1-icon name="chevronLeft" [size]="18" />
          Back
        </button>
      }

      <!-- Skip Button (optional steps) -->
      @if (showSkip && !isLastStep) {
        <button
          type="button"
          [class]="
            'nxt1-skip-btn ' + (compact ? 'rounded-full px-5 py-2.5' : 'rounded-lg px-6 py-3')
          "
          [disabled]="loading"
          (click)="skipClick.emit()"
          [attr.data-testid]="skipTestId"
          nxtHaptic="light"
        >
          Skip
        </button>
      }

      <!-- Continue/Complete Button -->
      <button
        type="button"
        [class]="
          'nxt1-continue-btn flex w-full items-center justify-center gap-2 whitespace-nowrap ' +
          (compact
            ? 'rounded-full px-6 py-3'
            : isMobile()
              ? 'rounded-xl px-6 py-4'
              : 'rounded-lg px-7 py-4')
        "
        [class.completing]="isLastStep"
        [disabled]="disabled || loading"
        (click)="continueClick.emit()"
        [attr.data-testid]="
          continueTestId || (isLastStep ? 'onboarding-complete' : 'onboarding-continue')
        "
        [attr.aria-busy]="loading"
        [nxtHaptic]="isLastStep ? 'success' : 'medium'"
      >
        @if (loading) {
          <div class="nxt1-spinner"></div>
        }
        <span>{{ continueText || (isLastStep ? 'Complete' : 'Continue') }}</span>
        @if (!isLastStep && !loading && showContinueIcon) {
          <nxt1-icon name="arrowRight" [size]="20" />
        }
      </button>
    </div>
  `,
  styles: [
    `
      /* ============================================
       SKIP BUTTON - Theme colors & states (not layout)
       ============================================ */
      .nxt1-skip-btn {
        background: transparent;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-lg);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        transition: all var(--nxt1-duration-normal) var(--nxt1-easing-inOut);
      }

      .nxt1-back-btn {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        background: transparent;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-lg);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        transition: all var(--nxt1-duration-normal) var(--nxt1-easing-inOut);
      }

      .nxt1-back-btn:hover:not(:disabled) {
        border-color: var(--nxt1-color-border-strong);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
      }

      .nxt1-back-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .nxt1-skip-btn:hover:not(:disabled) {
        border-color: var(--nxt1-color-border-strong);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
      }

      .nxt1-skip-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* ============================================
       CONTINUE BUTTON - Theme colors & states
       ============================================ */
      .nxt1-continue-btn {
        background: var(--nxt1-color-primary);
        border: none;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-onPrimary);
        cursor: pointer;
        transition: all var(--nxt1-duration-normal) var(--nxt1-easing-inOut);
      }

      .nxt1-continue-btn:hover:not(:disabled) {
        background: var(--nxt1-color-primaryDark);
        transform: translateY(-1px);
      }

      .nxt1-continue-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      .nxt1-continue-btn:active:not(:disabled) {
        transform: scale(0.98);
      }

      /* Complete state - same style, text changes via template */
      .nxt1-continue-btn.completing:hover:not(:disabled) {
        background: var(--nxt1-color-primaryDark);
        transform: translateY(-2px);
      }

      /* ============================================
       SPINNER - Keyframe animation (must be CSS)
       ============================================ */
      .nxt1-spinner {
        width: var(--nxt1-spacing-4);
        height: var(--nxt1-spacing-4);
        border: 2px solid transparent;
        border-top-color: currentColor;
        border-radius: var(--nxt1-borderRadius-full);
        animation: nxt1-spin var(--nxt1-duration-slowest) linear infinite;
      }

      @keyframes nxt1-spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingNavigationButtonsComponent {
  private readonly platform = inject(NxtPlatformService);

  /** Whether to show the skip button */
  @Input() showSkip = false;

  /** Whether to show the back button */
  @Input() showBack = false;

  /** Whether this is the last step (shows "Complete" instead of "Continue") */
  @Input() isLastStep = false;

  /** Override continue/complete label per step */
  @Input() continueText = '';

  /** Show/hide icon on continue button */
  @Input() showContinueIcon = true;

  /** Remove default desktop top margin when embedded in custom containers */
  @Input() compact = false;

  /** Mobile layout mode for button row */
  @Input() mobileLayout: 'stack' | 'row' = 'stack';

  /** Test id override for continue button */
  @Input() continueTestId = '';

  /** Test id override for skip button */
  @Input() skipTestId = 'onboarding-skip';

  /** Test id override for back button */
  @Input() backTestId = 'onboarding-back';

  /** Whether the continue button is disabled */
  @Input() disabled = false;

  /** Whether the form is loading */
  @Input() loading = false;

  /** Emits when skip is clicked */
  @Output() skipClick = new EventEmitter<void>();

  /** Emits when back is clicked */
  @Output() backClick = new EventEmitter<void>();

  /** Emits when continue/complete is clicked */
  @Output() continueClick = new EventEmitter<void>();

  /**
   * Check if running on mobile platform
   */
  isMobile = () => this.platform.isMobile();
}
