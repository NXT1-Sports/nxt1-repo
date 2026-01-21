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
import { NxtIconComponent } from '../../shared/icon';
import { HapticButtonDirective } from '../../services/haptics';
import { NxtPlatformService } from '../../services/platform';

@Component({
  selector: 'nxt1-onboarding-navigation-buttons',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, HapticButtonDirective],
  template: `
    <!-- Navigation Container - Tailwind for layout -->
    <div
      class="flex w-full"
      [class]="isMobile() ? 'mt-0 flex-col gap-0 p-0' : 'mt-6 items-center justify-end gap-3'"
    >
      <!-- Skip Button (optional steps) -->
      @if (showSkip && !isLastStep) {
        <button
          type="button"
          class="nxt1-skip-btn px-6 py-3"
          [disabled]="loading"
          (click)="skipClick.emit()"
          data-testid="onboarding-skip"
          nxtHaptic="light"
        >
          Skip
        </button>
      }

      <!-- Continue/Complete Button -->
      <button
        type="button"
        class="nxt1-continue-btn flex w-full items-center justify-center gap-2 whitespace-nowrap"
        [class]="isMobile() ? 'rounded-xl px-6 py-4' : 'rounded-lg px-7 py-4'"
        [class.completing]="isLastStep"
        [disabled]="disabled || loading"
        (click)="continueClick.emit()"
        [attr.data-testid]="isLastStep ? 'onboarding-complete' : 'onboarding-continue'"
        [attr.aria-busy]="loading"
        [nxtHaptic]="isLastStep ? 'success' : 'medium'"
      >
        @if (loading) {
          <div class="nxt1-spinner"></div>
        }
        <span>{{ isLastStep ? 'Complete' : 'Continue' }}</span>
        @if (!isLastStep && !loading) {
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

      .nxt1-skip-btn:hover:not(:disabled) {
        border-color: var(--nxt1-color-border-strong);
        background: var(--nxt1-color-state-hover);
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
        width: 16px;
        height: 16px;
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
