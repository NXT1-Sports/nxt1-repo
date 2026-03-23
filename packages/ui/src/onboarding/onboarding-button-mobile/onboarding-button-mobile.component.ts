/**
 * @fileoverview OnboardingButtonMobileComponent - Professional Mobile Sticky Footer
 * @module @nxt1/ui/onboarding
 *
 * Enterprise-grade sticky bottom footer for mobile onboarding flows.
 * Provides a seamless, professional UI pattern used by top apps (Instagram, TikTok, MaxPreps, etc.)
 *
 * Features:
 * - Fixed position at bottom with safe area handling
 * - Compact progress pills indicator (native app style)
 * - Gradient background for seamless blend with content
 * - Native haptic feedback integration
 * - Loading state with spinner
 * - Accessible with ARIA labels
 * - Skip button option for optional steps
 * - Sign out link for account recovery
 * - Safe area padding for notched devices
 *
 * Design Pattern:
 * - Detached from main scrollable content
 * - Always visible regardless of scroll position
 * - Progress pills above continue button (MaxPreps-style)
 * - Gradient fade at top for seamless content transition
 * - Full-width button for easy thumb access
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-button-mobile
 *   [totalSteps]="4"
 *   [currentStepIndex]="1"
 *   [completedStepIndices]="[0]"
 *   [showSkip]="isCurrentStepOptional()"
 *   [isLastStep]="isLastStep()"
 *   [loading]="isLoading()"
 *   [disabled]="!isCurrentStepValid()"
 *   (skipClick)="onSkip()"
 *   (continueClick)="onContinue()"
 * />
 * ```
 *
 * ⭐ MOBILE-ONLY COMPONENT ⭐
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import { HapticButtonDirective } from '../../services/haptics';
import { OnboardingProgressPillsComponent } from '../onboarding-progress-pills';

@Component({
  selector: 'nxt1-onboarding-button-mobile',
  standalone: true,
  imports: [
    CommonModule,
    NxtIconComponent,
    HapticButtonDirective,
    OnboardingProgressPillsComponent,
  ],
  template: `
    <!-- Mobile Footer - Fixed position handled by CSS (complex positioning) -->
    <div class="nxt1-mobile-footer">
      <!-- Gradient Fade Overlay -->
      <div class="nxt1-footer-gradient" aria-hidden="true"></div>

      <!-- Footer Content - Tailwind for layout -->
      <div class="bg-bg-primary pb-safe pointer-events-auto px-5 pt-3">
        <!-- Progress Pills - Native MaxPreps-style indicator -->
        @if (totalSteps > 0) {
          <nxt1-onboarding-progress-pills
            [totalSteps]="totalSteps"
            [currentStepIndex]="currentStepIndex"
            [completedStepIndices]="completedStepIndices"
          />
        }

        <!-- Button Row -->
        <div class="flex w-full gap-3">
          <!-- Skip Button (optional steps only) - never disabled by validity, only by loading -->
          @if (showSkip && !isLastStep) {
            <button
              type="button"
              class="nxt1-skip-btn min-w-[80px] flex-none px-5 py-4"
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
            class="nxt1-continue-btn flex min-h-[56px] flex-1 items-center justify-center gap-2 px-6 py-4"
            [disabled]="disabled || loading"
            (click)="continueClick.emit()"
            [attr.data-testid]="isLastStep ? 'onboarding-complete' : 'onboarding-continue'"
            [attr.aria-busy]="loading"
            [nxtHaptic]="isLastStep ? 'success' : 'medium'"
          >
            @if (loading) {
              <div class="nxt1-spinner" aria-label="Loading"></div>
            }
            <span class="tracking-wide">{{ isLastStep ? 'Complete' : 'Continue' }}</span>
            @if (!isLastStep && !loading) {
              <nxt1-icon name="arrowRight" [size]="20" />
            }
          </button>
        </div>

        <!-- TODO: Re-enable sign out link when ready
        @if (showSignOut) {
          <button
            type="button"
            class="nxt1-signout-link"
            (click)="signOutClick.emit()"
            data-testid="onboarding-signout"
          >
            Sign out and start over
          </button>
        }
        -->
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       MOBILE FOOTER - Fixed positioning (complex, not simple layout)
       ============================================ */
      .nxt1-mobile-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: var(--nxt1-zIndex-fixed);
        pointer-events: none;
      }

      /* ============================================
       GRADIENT FADE - Complex gradient effect
       ============================================ */
      .nxt1-footer-gradient {
        position: absolute;
        top: -40px;
        left: 0;
        right: 0;
        height: 40px;
        background: linear-gradient(to bottom, transparent 0%, var(--nxt1-color-bg-primary) 100%);
        pointer-events: none;
      }

      /* Safe area bottom padding */
      .pb-safe {
        padding-bottom: max(1rem, env(safe-area-inset-bottom));
      }

      /* ============================================
       SKIP BUTTON - Theme colors & states
       ============================================ */
      .nxt1-skip-btn {
        background: transparent;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        transition: all var(--nxt1-duration-normal) var(--nxt1-easing-inOut);
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-skip-btn:hover:not(:disabled) {
        border-color: var(--nxt1-color-border-strong);
        background: var(--nxt1-color-surface-200);
      }

      .nxt1-skip-btn:active:not(:disabled) {
        transform: scale(0.98);
        background: var(--nxt1-color-state-pressed);
      }

      .nxt1-skip-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      /* ============================================
       CONTINUE BUTTON - Theme colors & states
       ============================================ */
      .nxt1-continue-btn {
        background: var(--nxt1-color-primary);
        border: none;
        border-radius: var(--nxt1-borderRadius-xl);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-md);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-onPrimary);
        cursor: pointer;
        transition: all var(--nxt1-duration-normal) var(--nxt1-easing-inOut);
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-continue-btn:hover:not(:disabled) {
        background: var(--nxt1-color-primaryDark);
      }

      .nxt1-continue-btn:active:not(:disabled) {
        transform: scale(0.98);
        background: var(--nxt1-color-primaryDark);
      }

      .nxt1-continue-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      /* ============================================
       SPINNER - Keyframe animation (must be CSS)
       ============================================ */
      .nxt1-spinner {
        width: 18px;
        height: 18px;
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

      /* ============================================
       SIGN OUT LINK - Subtle recovery option
       ============================================ */
      .nxt1-signout-link {
        display: block;
        width: 100%;
        margin-top: 12px;
        padding: 8px;
        background: transparent;
        border: none;
        color: var(--nxt1-color-text-tertiary, #888);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 12px;
        text-align: center;
        text-decoration: underline;
        cursor: pointer;
        opacity: 0.8;
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-signout-link:active {
        opacity: 1;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingButtonMobileComponent {
  // ============================================
  // PROGRESS INDICATOR INPUTS
  // ============================================

  /** Total number of steps in the onboarding flow */
  @Input() totalSteps = 0;

  /** Current step index (0-based) */
  @Input() currentStepIndex = 0;

  /** Array of completed step indices (0-based) */
  @Input() completedStepIndices: number[] = [];

  // ============================================
  // BUTTON STATE INPUTS
  // ============================================

  /** Whether to show the skip button (for optional steps) */
  @Input() showSkip = false;

  /** Whether this is the last step (shows "Complete" instead of "Continue") */
  @Input() isLastStep = false;

  /** Whether the continue button is disabled */
  @Input() disabled = false;

  /** Whether the form is in loading state */
  @Input() loading = false;

  /** Whether to show the sign out link */
  @Input() showSignOut = false;

  /** Emits when skip is clicked */
  @Output() skipClick = new EventEmitter<void>();

  /** Emits when continue/complete is clicked */
  @Output() continueClick = new EventEmitter<void>();

  /** Emits when sign out is clicked */
  @Output() signOutClick = new EventEmitter<void>();
}
