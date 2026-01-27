/**
 * @fileoverview OnboardingWelcomeComponent - Role-Specific Welcome Slides
 * @module @nxt1/ui/onboarding
 *
 * Professional welcome page with swipeable role-specific slides.
 * Shown after onboarding completion to educate users about key features.
 *
 * Route: /auth/onboarding/congratulations (or /auth/onboarding/welcome)
 *
 * Features:
 * - Role-specific welcome messaging from @nxt1/core config
 * - Three swipeable feature highlight slides
 * - Confetti celebration on first load
 * - Dot navigation indicators
 * - Native haptic feedback
 * - Personalized greeting with user's name
 *
 * Design Pattern (2026 Best Practices):
 * - Maximum 3 slides (respects user time)
 * - Minimal text per slide (headline + description)
 * - Feature-focused messaging
 * - Celebration integrated into first slide
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-welcome
 *   [userRole]="'athlete'"
 *   [firstName]="'John'"
 *   (complete)="onComplete()"
 *   (skip)="onSkip()"
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
  signal,
  computed,
  OnInit,
  OnDestroy,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HapticsService } from '../../services/haptics';

// Core API - Welcome slides configuration
import {
  getWelcomeSlidesForRole,
  getPersonalizedGreeting,
  type WelcomeSlide,
  type WelcomeSlidesConfig,
  type OnboardingUserType,
} from '@nxt1/core/api';

// ============================================
// TYPES
// ============================================

/** Confetti particle configuration */
interface ConfettiParticle {
  id: number;
  x: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
}

/** Animation direction for slide transitions */
type AnimationDirection = 'forward' | 'backward' | 'none';

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  /** Confetti particle count */
  particleCount: 30,
  /** Confetti display duration (ms) */
  confettiDuration: 4000,
  /** Confetti colors */
  colors: [
    'var(--nxt1-color-primary)',
    'var(--nxt1-color-primaryLight)',
    'var(--nxt1-color-semantic-success-500)',
    'var(--nxt1-color-semantic-info-500)',
    'var(--nxt1-color-semantic-warning-500)',
  ],
} as const;

@Component({
  selector: 'nxt1-onboarding-welcome',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nxt1-welcome-page">
      <!-- Confetti Background -->
      @if (showConfetti()) {
        <div class="nxt1-confetti-container" aria-hidden="true">
          @for (particle of confettiParticles(); track particle.id) {
            <div
              class="nxt1-confetti"
              [style.left.%]="particle.x"
              [style.animation-delay.ms]="particle.delay"
              [style.animation-duration.s]="particle.duration"
              [style.width.px]="particle.size"
              [style.height.px]="particle.size"
              [style.background]="particle.color"
            ></div>
          }
        </div>
      }

      <!-- Content Container -->
      <div class="nxt1-welcome-content">
        <!-- Personalized Greeting (first slide only) -->
        @if (currentSlideIndex() === 0 && greeting()) {
          <p class="nxt1-greeting">{{ greeting() }}</p>
        }

        <!-- Slide Content -->
        <div class="nxt1-slide-container" [attr.data-direction]="animationDirection()">
          <!-- Icon -->
          <div class="nxt1-slide-icon" [style.--accent-color]="currentSlide()?.accentColor">
            <span class="nxt1-icon-emoji" role="img" [attr.aria-label]="currentSlide()?.headline">
              {{ currentSlide()?.icon || '🎉' }}
            </span>
          </div>

          <!-- Text -->
          <h1 class="nxt1-slide-headline">
            {{ currentSlide()?.headline || "You're In!" }}
          </h1>
          <p class="nxt1-slide-description">
            {{ currentSlide()?.description || 'Your profile is ready.' }}
          </p>
        </div>

        <!-- Dot Navigation -->
        <div class="nxt1-dots" role="tablist" aria-label="Feature slides">
          @for (slide of slides(); track slide.id; let i = $index) {
            <button
              type="button"
              class="nxt1-dot"
              [class.nxt1-dot--active]="i === currentSlideIndex()"
              (click)="goToSlide(i)"
              [attr.aria-label]="'Go to slide ' + (i + 1)"
              [attr.aria-selected]="i === currentSlideIndex()"
              role="tab"
            ></button>
          }
        </div>

        <!-- Navigation Buttons -->
        <div class="nxt1-buttons">
          @if (!isLastSlide()) {
            <button type="button" class="nxt1-btn nxt1-btn--secondary" (click)="onSkipClick()">
              Skip
            </button>
            <button type="button" class="nxt1-btn nxt1-btn--primary" (click)="nextSlide()">
              Next
            </button>
          } @else {
            <button type="button" class="nxt1-btn nxt1-btn--cta" (click)="onCompleteClick()">
              {{ ctaText() }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         PAGE CONTAINER
         ============================================ */
      .nxt1-welcome-page {
        position: relative;
        min-height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        padding-bottom: max(24px, env(safe-area-inset-bottom));
      }

      /* ============================================
         CONFETTI
         ============================================ */
      .nxt1-confetti-container {
        position: fixed;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        z-index: 50;
      }

      .nxt1-confetti {
        position: absolute;
        top: -20px;
        border-radius: 2px;
        animation: confetti-fall 3s ease-in-out forwards;
      }

      @keyframes confetti-fall {
        0% {
          transform: translateY(-20px) rotate(0deg);
          opacity: 1;
        }
        100% {
          transform: translateY(100vh) rotate(720deg);
          opacity: 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .nxt1-confetti {
          animation: none;
          opacity: 0;
        }
      }

      /* ============================================
         CONTENT
         ============================================ */
      .nxt1-welcome-content {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        max-width: 400px;
        width: 100%;
      }

      /* ============================================
         GREETING
         ============================================ */
      .nxt1-greeting {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--nxt1-color-text-secondary, #a1a1aa);
        margin: 0 0 16px 0;
      }

      /* ============================================
         SLIDE CONTENT
         ============================================ */
      .nxt1-slide-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 32px 0;
      }

      .nxt1-slide-icon {
        width: 96px;
        height: 96px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-200, #1a1a1a);
        border: 1px solid var(--nxt1-color-border-default, #333);
        border-radius: 20px;
        margin-bottom: 24px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }

      .nxt1-icon-emoji {
        font-size: 48px;
        line-height: 1;
      }

      .nxt1-slide-headline {
        font-size: 28px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 0 0 12px 0;
        letter-spacing: -0.02em;
      }

      .nxt1-slide-description {
        font-size: 16px;
        color: var(--nxt1-color-text-secondary, #a1a1aa);
        margin: 0;
        line-height: 1.5;
        max-width: 320px;
      }

      /* ============================================
         DOT NAVIGATION
         ============================================ */
      .nxt1-dots {
        display: flex;
        gap: 8px;
        margin: 24px 0 32px 0;
      }

      .nxt1-dot {
        width: 8px;
        height: 8px;
        border-radius: 9999px;
        border: none;
        background: var(--nxt1-color-border-strong, #444);
        cursor: pointer;
        transition: all 0.3s ease;
        padding: 0;
      }

      .nxt1-dot:hover {
        background: var(--nxt1-color-border-default, #666);
      }

      .nxt1-dot--active {
        width: 24px;
        background: var(--nxt1-color-primary, #a3e635);
      }

      /* ============================================
         BUTTONS
         ============================================ */
      .nxt1-buttons {
        display: flex;
        gap: 12px;
        width: 100%;
        max-width: 320px;
      }

      .nxt1-btn {
        flex: 1;
        padding: 14px 24px;
        border-radius: 12px;
        font-size: 16px;
        font-weight: 600;
        border: none;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .nxt1-btn--secondary {
        background: transparent;
        color: var(--nxt1-color-text-secondary, #a1a1aa);
      }

      .nxt1-btn--secondary:hover {
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .nxt1-btn--primary {
        background: var(--nxt1-color-primary, #a3e635);
        color: var(--nxt1-color-text-onPrimary, #000000);
        box-shadow: 0 4px 16px rgba(163, 230, 53, 0.3);
      }

      .nxt1-btn--primary:hover {
        background: var(--nxt1-color-primaryLight, #bef264);
        box-shadow: 0 6px 20px rgba(163, 230, 53, 0.4);
      }

      .nxt1-btn--cta {
        flex: 1;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-primary, #a3e635) 0%,
          var(--nxt1-color-primaryLight, #bef264) 100%
        );
        color: var(--nxt1-color-text-onPrimary, #000000);
        padding: 16px 24px;
        font-size: 18px;
        box-shadow: 0 8px 32px rgba(163, 230, 53, 0.3);
      }

      .nxt1-btn--cta:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 40px rgba(163, 230, 53, 0.4);
      }

      /* ============================================
         SAFE AREA (Mobile)
         ============================================ */
      @supports (padding-bottom: env(safe-area-inset-bottom)) {
        .nxt1-welcome-page {
          padding-bottom: max(24px, env(safe-area-inset-bottom));
        }
      }
    `,
  ],
})
export class OnboardingWelcomeComponent implements OnInit, OnDestroy {
  private readonly haptics = inject(HapticsService);
  private readonly platformId = inject(PLATFORM_ID);

  // ============================================
  // INPUTS
  // ============================================

  /** User's role for role-specific slides */
  @Input() userRole: OnboardingUserType | null = 'athlete';

  /** User's first name for personalized greeting */
  @Input() firstName: string | null = null;

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when user completes (clicks CTA on last slide) */
  @Output() complete = new EventEmitter<void>();

  /** Emitted when user skips */
  @Output() skip = new EventEmitter<void>();

  /** Emitted when user views a slide (for analytics) */
  @Output() slideViewed = new EventEmitter<{ index: number; slideId: string }>();

  // ============================================
  // STATE
  // ============================================

  /** Current slide index */
  readonly currentSlideIndex = signal(0);

  /** Animation direction for transitions */
  readonly animationDirection = signal<AnimationDirection>('none');

  /** Show confetti animation */
  readonly showConfetti = signal(false);

  /** Confetti particles */
  readonly confettiParticles = signal<ConfettiParticle[]>([]);

  /** Confetti timeout */
  private confettiTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Browser check */
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // ============================================
  // COMPUTED
  // ============================================

  /** Slides config for current role */
  readonly slidesConfig = computed<WelcomeSlidesConfig>(() => {
    return getWelcomeSlidesForRole(this.userRole);
  });

  /** Slides for current role */
  readonly slides = computed<WelcomeSlide[]>(() => {
    return this.slidesConfig().slides;
  });

  /** CTA text from config */
  readonly ctaText = computed(() => {
    return this.slidesConfig().ctaText || 'Get Started';
  });

  /** Current slide */
  readonly currentSlide = computed<WelcomeSlide | null>(() => {
    const slidesList = this.slides();
    const index = this.currentSlideIndex();
    return slidesList[index] ?? null;
  });

  /** Personalized greeting */
  readonly greeting = computed<string | null>(() => {
    const config = this.slidesConfig();
    return getPersonalizedGreeting(config, this.firstName ?? undefined);
  });

  /** Is last slide */
  readonly isLastSlide = computed(() => this.currentSlideIndex() >= this.slides().length - 1);

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    // Trigger confetti on first load
    if (this.isBrowser) {
      this.triggerConfetti();
    }

    // Emit initial slide viewed
    const slide = this.currentSlide();
    if (slide) {
      this.slideViewed.emit({ index: 0, slideId: slide.id });
    }
  }

  ngOnDestroy(): void {
    if (this.confettiTimeout) {
      clearTimeout(this.confettiTimeout);
    }
  }

  // ============================================
  // NAVIGATION
  // ============================================

  /** Go to specific slide */
  goToSlide(index: number): void {
    if (index === this.currentSlideIndex()) return;

    const direction = index > this.currentSlideIndex() ? 'forward' : 'backward';
    this.animationDirection.set(direction);
    this.currentSlideIndex.set(index);
    this.haptics.impact('light');

    // Emit slide viewed
    const slide = this.slides()[index];
    if (slide) {
      this.slideViewed.emit({ index, slideId: slide.id });
    }
  }

  /** Go to next slide */
  nextSlide(): void {
    if (this.isLastSlide()) return;

    this.animationDirection.set('forward');
    const newIndex = this.currentSlideIndex() + 1;
    this.currentSlideIndex.set(newIndex);
    this.haptics.impact('light');

    // Emit slide viewed
    const slide = this.slides()[newIndex];
    if (slide) {
      this.slideViewed.emit({ index: newIndex, slideId: slide.id });
    }
  }

  /** Handle skip button click */
  onSkipClick(): void {
    this.haptics.impact('light');
    this.skip.emit();
  }

  /** Handle complete button click */
  onCompleteClick(): void {
    this.haptics.notification('success');
    this.complete.emit();
  }

  // ============================================
  // CONFETTI
  // ============================================

  private triggerConfetti(): void {
    // Generate particles
    const particles: ConfettiParticle[] = [];

    for (let i = 0; i < CONFIG.particleCount; i++) {
      particles.push({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 500,
        duration: 2 + Math.random() * 1.5,
        color: CONFIG.colors[Math.floor(Math.random() * CONFIG.colors.length)],
        size: 8 + Math.random() * 8,
      });
    }

    this.confettiParticles.set(particles);
    this.showConfetti.set(true);
    this.haptics.notification('success');

    // Hide confetti after animation
    this.confettiTimeout = setTimeout(() => {
      this.showConfetti.set(false);
    }, CONFIG.confettiDuration);
  }
}
