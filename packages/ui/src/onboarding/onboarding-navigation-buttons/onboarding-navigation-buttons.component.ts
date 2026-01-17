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
    <div class="nxt1-onboarding-nav" [class.mobile-layout]="isMobile()">
      <!-- Skip Button (optional steps) -->
      @if (showSkip && !isLastStep) {
        <button
          type="button"
          class="nxt1-skip-btn"
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
        class="nxt1-continue-btn"
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
       NAVIGATION CONTAINER - DESKTOP
       ============================================ */
      .nxt1-onboarding-nav {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 24px;
        width: 100%;
      }

      /* ============================================
       NAVIGATION CONTAINER - MOBILE LAYOUT
       ============================================ */
      .nxt1-onboarding-nav.mobile-layout {
        flex-direction: column;
        justify-content: flex-end;
        gap: 0;
        margin-top: 0;
        padding: 0;
        width: 100%;
        z-index: auto;
      }

      /* ============================================
       SKIP BUTTON
       ============================================ */
      .nxt1-skip-btn {
        padding: 12px 24px;
        background: transparent;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.1));
        border-radius: 10px;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 15px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .nxt1-skip-btn:hover:not(:disabled) {
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.15));
        background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.05));
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .nxt1-skip-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* ============================================
       CONTINUE BUTTON - DESKTOP
       ============================================ */
      .nxt1-continue-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 28px;
        background: var(--nxt1-color-primary, #ccff00);
        border: none;
        border-radius: 10px;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 15px;
        font-weight: 700;
        color: var(--nxt1-color-text-onPrimary, #000000);
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
      }

      .nxt1-continue-btn:hover:not(:disabled) {
        background: var(--nxt1-color-primaryDark, #b8e600);
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

      /* ============================================
       COMPLETE BUTTON - DESKTOP: FULL WIDTH
       ============================================ */
      .nxt1-continue-btn.completing {
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #000000);
        width: 100%;
        padding: 16px 28px;
      }

      .nxt1-continue-btn.completing:hover:not(:disabled) {
        background: var(--nxt1-color-primaryDark, #b8e600);
        transform: translateY(-2px);
      }

      /* ============================================
       CONTINUE BUTTON - MOBILE LAYOUT
       ============================================ */
      .mobile-layout .nxt1-continue-btn {
        width: 100%;
        padding: 16px 24px;
        font-size: 16px;
        border-radius: 14px;
      }

      .mobile-layout .nxt1-continue-btn:hover:not(:disabled) {
        transform: none;
      }

      .mobile-layout .nxt1-continue-btn:active:not(:disabled) {
        transform: scale(0.98);
      }

      /* ============================================
       SPINNER
       ============================================ */
      .nxt1-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid transparent;
        border-top-color: currentColor;
        border-radius: 50%;
        animation: nxt1-spin 0.8s linear infinite;
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
