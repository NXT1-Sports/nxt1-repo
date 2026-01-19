/**
 * @fileoverview OnboardingStepCardComponent - Cross-Platform Step Container
 * @module @nxt1/ui/onboarding
 *
 * Reusable card container for onboarding step content.
 * Provides consistent styling and error message display.
 *
 * Features:
 * - Glass morphism styling matching auth shell
 * - Error message display
 * - Content projection for step-specific content
 * - Accessible error announcements
 * - Variant support for seamless (no card styling) mode
 * - Step transition animations (fade + slide)
 *
 * Usage:
 * ```html
 * <!-- Default card styling -->
 * <nxt1-onboarding-step-card [error]="error()">
 *   <nxt1-onboarding-role-selection ... />
 * </nxt1-onboarding-step-card>
 *
 * <!-- Seamless mode (no card container) -->
 * <nxt1-onboarding-step-card variant="seamless" [error]="error()">
 *   <nxt1-onboarding-role-selection ... />
 * </nxt1-onboarding-step-card>
 *
 * <!-- With animation direction -->
 * <nxt1-onboarding-step-card [animationDirection]="'forward'" [animationKey]="stepId">
 *   <nxt1-onboarding-profile-step ... />
 * </nxt1-onboarding-step-card>
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../shared/icon';

/** Step card visual variants */
export type StepCardVariant = 'card' | 'seamless';

/** Animation direction for step transitions */
export type AnimationDirection = 'forward' | 'backward' | 'none';

@Component({
  selector: 'nxt1-onboarding-step-card',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <div
      class="nxt1-onboarding-card"
      [class.nxt1-onboarding-card--seamless]="variant === 'seamless'"
      [class.nxt1-onboarding-card--animate-forward]="animationDirection === 'forward'"
      [class.nxt1-onboarding-card--animate-backward]="animationDirection === 'backward'"
      [attr.data-animation-key]="animationKey"
    >
      <!-- Step Content (projected) -->
      <ng-content></ng-content>

      <!-- Error Message -->
      @if (error) {
        <div class="nxt1-error-message" role="alert" data-testid="onboarding-error">
          <nxt1-icon name="alertCircle" [size]="20" />
          <span>{{ error }}</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       ANIMATION KEYFRAMES
       ============================================ */
      @keyframes slideInFromRight {
        from {
          opacity: 0;
          transform: translateX(var(--nxt1-spacing-8));
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      @keyframes slideInFromLeft {
        from {
          opacity: 0;
          transform: translateX(calc(var(--nxt1-spacing-8) * -1));
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      /* ============================================
       ONBOARDING CARD
       ============================================ */
      .nxt1-onboarding-card {
        width: 100%;
        background: var(--nxt1-color-state-hover);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-2xl);
        padding: var(--nxt1-spacing-6);
        backdrop-filter: blur(20px);

        /* Smooth transitions for property changes */
        transition:
          opacity var(--nxt1-transition-normal) var(--nxt1-easing-default),
          transform var(--nxt1-transition-normal) var(--nxt1-easing-default);
      }

      /* Animation: Forward (next step) - slide in from right */
      .nxt1-onboarding-card--animate-forward {
        animation: slideInFromRight var(--nxt1-transition-normal) var(--nxt1-easing-default);
      }

      /* Animation: Backward (previous step) - slide in from left */
      .nxt1-onboarding-card--animate-backward {
        animation: slideInFromLeft var(--nxt1-transition-normal) var(--nxt1-easing-default);
      }

      /* Reduced motion preference - use simple fade */
      @media (prefers-reduced-motion: reduce) {
        .nxt1-onboarding-card--animate-forward,
        .nxt1-onboarding-card--animate-backward {
          animation: fadeIn var(--nxt1-transition-fast) var(--nxt1-easing-default);
        }
      }

      /* Seamless variant - removes card styling for full-width content */
      .nxt1-onboarding-card--seamless {
        background: transparent;
        border: none;
        border-radius: 0;
        padding: 0;
        backdrop-filter: none;
      }

      /* ============================================
       ERROR MESSAGE
       ============================================ */
      .nxt1-error-message {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        margin-top: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-md);
        background: var(--nxt1-color-errorBg);
        color: var(--nxt1-color-error);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);

        /* Animate error message appearance */
        animation: fadeIn var(--nxt1-transition-fast) var(--nxt1-easing-default);
      }

      .nxt1-error-message nxt1-icon {
        flex-shrink: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingStepCardComponent {
  /** Visual variant - 'card' shows container styling, 'seamless' removes it */
  @Input() variant: StepCardVariant = 'card';

  /** Error message to display */
  @Input() error: string | null = null;

  /**
   * Animation direction for step transitions.
   * - 'forward': Slide in from right (navigating to next step)
   * - 'backward': Slide in from left (navigating to previous step)
   * - 'none': No animation (initial render or instant navigation)
   */
  @Input() animationDirection: AnimationDirection = 'none';

  /**
   * Unique key for the current step to trigger animation on change.
   * When this value changes, Angular re-renders the component and
   * the animation plays again.
   */
  @Input() animationKey: string = '';
}
