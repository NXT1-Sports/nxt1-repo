/**
 * @fileoverview OnboardingStepCardComponent - Cross-Platform Step Container
 * @module @nxt1/ui/onboarding
 *
 * Reusable card container for onboarding step content with professional
 * 2026 best-practice animations matching apps like Instagram, TikTok, and Duolingo.
 *
 * Features:
 * - Glass morphism styling matching auth shell
 * - Error message display
 * - Content projection for step-specific content
 * - Accessible error announcements
 * - Variant support for seamless (no card styling) mode
 * - Professional step transition animations:
 *   - GPU-accelerated transform3d for 60fps
 *   - Spring physics easing (cubic-bezier)
 *   - Crossfade with scale for depth
 *   - Staggered content fade-in
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

import {
  Component,
  Input,
  ChangeDetectionStrategy,
  signal,
  input,
  effect,
  ElementRef,
  inject,
  PLATFORM_ID,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';

/** Step card visual variants */
export type StepCardVariant = 'card' | 'seamless';

/** Animation direction for step transitions */
export type AnimationDirection = 'forward' | 'backward' | 'none';

/** Animation timing configuration - 2026 best practices */
const ANIMATION_CONFIG = {
  /** Main transition duration (ms) - fast enough to feel snappy, slow enough to be perceived */
  duration: 350,
  /** Spring physics easing - natural bounce feel like iOS/Android native */
  easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
  /** Slight scale reduction during transition for depth */
  scaleOut: 0.96,
  /** Translation distance as percentage of container width */
  translatePercent: 8,
  /** Stagger delay for child elements (ms) */
  staggerDelay: 50,
} as const;

@Component({
  selector: 'nxt1-onboarding-step-card',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <div
      class="nxt1-step-wrapper"
      [class.nxt1-step-wrapper--card]="variant === 'card'"
      [class.nxt1-step-wrapper--seamless]="variant === 'seamless'"
      [class.nxt1-step-wrapper--animate-forward]="
        isAnimating() && animationDirection() === 'forward'
      "
      [class.nxt1-step-wrapper--animate-backward]="
        isAnimating() && animationDirection() === 'backward'
      "
      [attr.data-animation-key]="animationKey()"
    >
      <!-- Step Content (projected) -->
      <div class="nxt1-step-content">
        <ng-content></ng-content>
      </div>

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
         CSS CUSTOM PROPERTIES FOR ANIMATION
         ============================================ */
      :host {
        --step-duration: ${ANIMATION_CONFIG.duration}ms;
        --step-easing: ${ANIMATION_CONFIG.easing};
        --step-scale-out: ${ANIMATION_CONFIG.scaleOut};
        --step-translate: ${ANIMATION_CONFIG.translatePercent}%;
        --step-stagger: ${ANIMATION_CONFIG.staggerDelay}ms;
        --step-opacity-from: 0;

        display: block;
        width: 100%;
        position: relative;

        /* Contain animations for performance */
        contain: layout style;
      }

      /* ============================================
         ANIMATION KEYFRAMES - GPU Accelerated
         ============================================ */

      /* Forward: Slide in from right with scale */
      @keyframes stepSlideInForward {
        0% {
          opacity: var(--step-opacity-from);
          transform: translate3d(var(--step-translate), 0, 0) scale(var(--step-scale-out));
        }
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }
      }

      /* Backward: Slide in from left with scale */
      @keyframes stepSlideInBackward {
        0% {
          opacity: var(--step-opacity-from);
          transform: translate3d(calc(var(--step-translate) * -1), 0, 0)
            scale(var(--step-scale-out));
        }
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }
      }

      /* Content stagger fade in */
      @keyframes contentFadeIn {
        0% {
          opacity: 0;
          transform: translate3d(0, 8px, 0);
        }
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0);
        }
      }

      /* Error shake animation */
      @keyframes errorShake {
        0%,
        100% {
          transform: translate3d(0, 0, 0);
        }
        10%,
        30%,
        50%,
        70%,
        90% {
          transform: translate3d(-4px, 0, 0);
        }
        20%,
        40%,
        60%,
        80% {
          transform: translate3d(4px, 0, 0);
        }
      }

      /* Simple fade for reduced motion */
      @keyframes simpleFade {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      /* ============================================
         STEP WRAPPER - Container
         ============================================ */
      .nxt1-step-wrapper {
        width: 100%;

        /* GPU acceleration - always use transform3d */
        transform: translate3d(0, 0, 0);
        will-change: transform, opacity;

        /* Prevent content jump during animation */
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        perspective: 1000px;
      }

      /* Card variant - white base to match footer design */
      .nxt1-step-wrapper--card {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-2xl);
        padding: var(--nxt1-spacing-6);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      /* Seamless variant - no card styling */
      .nxt1-step-wrapper--seamless {
        background: transparent;
        border: none;
        border-radius: 0;
        padding: 0;
        backdrop-filter: none;
      }

      /* ============================================
         ANIMATION STATES
         ============================================ */

      /* Forward animation - slide from right */
      .nxt1-step-wrapper--animate-forward {
        animation: stepSlideInForward var(--step-duration) var(--step-easing) both;
      }

      /* Backward animation - slide from left */
      .nxt1-step-wrapper--animate-backward {
        animation: stepSlideInBackward var(--step-duration) var(--step-easing) both;
      }

      /* Staggered content animation */
      .nxt1-step-wrapper--animate-forward .nxt1-step-content,
      .nxt1-step-wrapper--animate-backward .nxt1-step-content {
        animation: contentFadeIn calc(var(--step-duration) * 0.8) var(--step-easing) both;
        animation-delay: calc(var(--step-duration) * 0.15);
      }

      /* ============================================
         REDUCED MOTION - Accessibility
         ============================================ */
      @media (prefers-reduced-motion: reduce) {
        .nxt1-step-wrapper {
          will-change: auto;
        }

        .nxt1-step-wrapper--animate-forward,
        .nxt1-step-wrapper--animate-backward {
          animation: simpleFade 150ms ease-out both;
        }

        .nxt1-step-wrapper--animate-forward .nxt1-step-content,
        .nxt1-step-wrapper--animate-backward .nxt1-step-content {
          animation: none;
        }
      }

      /* ============================================
         STEP CONTENT
         ============================================ */
      .nxt1-step-content {
        /* Ensure smooth animation inheritance */
        transform: translate3d(0, 0, 0);
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

        /* Attention-grabbing shake animation */
        animation:
          errorShake 0.5s ease-in-out,
          simpleFade 200ms ease-out;
      }

      .nxt1-error-message nxt1-icon {
        flex-shrink: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingStepCardComponent implements AfterViewInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly elementRef = inject(ElementRef);

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
  readonly animationDirection = input<AnimationDirection>('none');

  /**
   * Unique key for the current step to trigger animation on change.
   * When this value changes, the effect triggers and animations play.
   */
  readonly animationKey = input<string>('');

  /** Track if animation is currently playing */
  readonly isAnimating = signal(false);

  /** Previous animation key for change detection */
  private previousKey = '';

  /** Animation end listener cleanup */
  private animationEndHandler: (() => void) | null = null;

  constructor() {
    // Watch for animation key changes to trigger animation state
    effect(() => {
      const currentKey = this.animationKey();
      const direction = this.animationDirection();
      if (currentKey && currentKey !== this.previousKey && direction !== 'none') {
        this.isAnimating.set(true);
        this.previousKey = currentKey;
      }
    });
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Listen for animation end to reset state
    const wrapper = this.elementRef.nativeElement.querySelector('.nxt1-step-wrapper');
    if (wrapper) {
      this.animationEndHandler = () => {
        this.isAnimating.set(false);
      };
      wrapper.addEventListener('animationend', this.animationEndHandler);
    }
  }

  ngOnDestroy(): void {
    // Cleanup animation listener
    if (this.animationEndHandler && isPlatformBrowser(this.platformId)) {
      const wrapper = this.elementRef.nativeElement.querySelector('.nxt1-step-wrapper');
      if (wrapper) {
        wrapper.removeEventListener('animationend', this.animationEndHandler);
      }
    }
  }
}
