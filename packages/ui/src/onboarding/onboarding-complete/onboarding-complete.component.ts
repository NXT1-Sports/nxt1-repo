/**
 * @fileoverview OnboardingCompleteComponent - Welcome Success Page
 * @module @nxt1/ui/onboarding
 *
 * Professional welcome page shown after onboarding completion.
 * Follows 2026 best practices used by Notion, Slack, Stripe, LinkedIn.
 *
 * Architecture:
 * - Dedicated route (not an overlay) for reliability and analytics
 * - URL: /auth/onboarding/complete
 * - Auto-redirect to home after configurable duration
 * - Can be deep-linked and reloaded safely
 *
 * Features:
 * - 🎉 Confetti celebration animation
 * - Feature highlight cards (what you can do next)
 * - Native haptic feedback
 * - Accessibility: Screen reader announces page
 * - Auto-navigate to home with countdown
 * - "Get Started" CTA button
 *
 * Design:
 * - Full-screen celebration moment
 * - Brand-consistent styling
 * - Responsive for mobile and web
 * - Dark mode compatible
 *
 * Usage:
 * ```typescript
 * // In your routes
 * {
 *   path: 'onboarding/complete',
 *   loadComponent: () => import('@nxt1/ui').then(m => m.OnboardingCompleteComponent),
 * }
 *
 * // Navigate after completing onboarding
 * await this.router.navigate(['/auth/onboarding/complete']);
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { HapticsService } from '../../services/haptics';

/** Feature highlight for "what's next" section */
interface FeatureHighlight {
  id: string;
  icon: string;
  title: string;
  description: string;
}

/** Default feature highlights */
const DEFAULT_FEATURES: FeatureHighlight[] = [
  {
    id: 'profile',
    icon: '👤',
    title: 'Complete Your Profile',
    description: 'Add highlights, stats, and achievements',
  },
  {
    id: 'discover',
    icon: '🔍',
    title: 'Get Discovered',
    description: 'Connect with coaches and scouts',
  },
  {
    id: 'network',
    icon: '🤝',
    title: 'Build Your Network',
    description: 'Follow teams and athletes',
  },
];

/** Confetti particle configuration */
interface ConfettiParticle {
  id: number;
  x: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
  rotation: number;
}

/** Configuration */
const CONFIG = {
  /** Countdown before auto-redirect (seconds) */
  autoRedirectSeconds: 5,
  /** Whether to show countdown */
  showCountdown: true,
  /** Confetti particle count */
  particleCount: 30,
  /** Confetti colors */
  colors: [
    '#10B981', // Emerald
    '#3B82F6', // Blue
    '#8B5CF6', // Violet
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#EC4899', // Pink
  ],
} as const;

@Component({
  selector: 'nxt1-onboarding-complete',
  standalone: true,
  imports: [CommonModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nxt1-complete-page">
      <!-- Confetti Background -->
      <div class="nxt1-confetti-container" aria-hidden="true">
        @for (particle of particles(); track particle.id) {
          <div
            class="nxt1-confetti"
            [style.left.%]="particle.x"
            [style.animation-delay.ms]="particle.delay"
            [style.animation-duration.s]="particle.duration"
            [style.--confetti-color]="particle.color"
            [style.--confetti-size.px]="particle.size"
            [style.--confetti-rotation.deg]="particle.rotation"
          ></div>
        }
      </div>

      <!-- Content Container -->
      <div class="nxt1-complete-content">
        <!-- Success Icon -->
        <div class="nxt1-success-icon" role="img" aria-label="Success checkmark">
          <div class="nxt1-success-circle">
            <svg class="nxt1-success-check" viewBox="0 0 52 52">
              <circle class="nxt1-success-circle-bg" cx="26" cy="26" r="25" fill="none" />
              <path class="nxt1-success-check-path" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
            </svg>
          </div>
        </div>

        <!-- Welcome Message -->
        <h1 class="nxt1-complete-title">{{ title }}</h1>
        <p class="nxt1-complete-subtitle">{{ subtitle }}</p>

        <!-- Feature Highlights -->
        <div class="nxt1-features-grid">
          @for (feature of features; track feature.id) {
            <div class="nxt1-feature-card">
              <span class="nxt1-feature-icon">{{ feature.icon }}</span>
              <h3 class="nxt1-feature-title">{{ feature.title }}</h3>
              <p class="nxt1-feature-description">{{ feature.description }}</p>
            </div>
          }
        </div>

        <!-- CTA Button -->
        <button
          type="button"
          class="nxt1-cta-button"
          (click)="onGetStarted()"
          [attr.aria-label]="
            'Get started' +
            (showCountdown && countdown() > 0
              ? ', auto-redirect in ' + countdown() + ' seconds'
              : '')
          "
        >
          <span>Get Started</span>
          @if (showCountdown && countdown() > 0) {
            <span class="nxt1-countdown">({{ countdown() }}s)</span>
          }
        </button>

        <!-- Skip link for accessibility -->
        <button type="button" class="nxt1-skip-link" (click)="onGetStarted()">Skip to home</button>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         PAGE CONTAINER
         ============================================ */
      .nxt1-complete-page {
        position: relative;
        min-height: 100vh;
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        padding-bottom: max(24px, env(safe-area-inset-bottom));
        background: linear-gradient(
          180deg,
          var(--nxt1-color-bg-primary, #0a0a0a) 0%,
          var(--nxt1-color-bg-secondary, #111111) 100%
        );
        overflow: hidden;
      }

      /* ============================================
         CONFETTI
         ============================================ */
      .nxt1-confetti-container {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
      }

      .nxt1-confetti {
        position: absolute;
        top: -20px;
        width: var(--confetti-size, 10px);
        height: var(--confetti-size, 10px);
        background: var(--confetti-color, #10b981);
        border-radius: 2px;
        animation: confetti-fall 3s ease-in-out forwards;
      }

      @keyframes confetti-fall {
        0% {
          transform: translateY(0) rotate(0deg);
          opacity: 1;
        }
        100% {
          transform: translateY(100vh) rotate(var(--confetti-rotation, 720deg));
          opacity: 0;
        }
      }

      /* Respect reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .nxt1-confetti {
          animation: none;
          opacity: 0;
        }
      }

      /* ============================================
         CONTENT
         ============================================ */
      .nxt1-complete-content {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        max-width: 480px;
        width: 100%;
      }

      /* ============================================
         SUCCESS ICON
         ============================================ */
      .nxt1-success-icon {
        margin-bottom: 24px;
      }

      .nxt1-success-circle {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-primary, #a3e635) 0%,
          var(--nxt1-color-primaryDark, #84cc16) 100%
        );
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 8px 32px rgba(163, 230, 53, 0.3);
        animation: success-pulse 2s ease-in-out infinite;
      }

      @keyframes success-pulse {
        0%,
        100% {
          transform: scale(1);
          box-shadow: 0 8px 32px rgba(163, 230, 53, 0.3);
        }
        50% {
          transform: scale(1.05);
          box-shadow: 0 12px 40px rgba(163, 230, 53, 0.4);
        }
      }

      .nxt1-success-check {
        width: 40px;
        height: 40px;
      }

      .nxt1-success-circle-bg {
        stroke: rgba(255, 255, 255, 0.2);
        stroke-width: 2;
      }

      .nxt1-success-check-path {
        stroke: white;
        stroke-width: 4;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-dasharray: 48;
        stroke-dashoffset: 48;
        animation: checkmark-draw 0.6s ease-out 0.3s forwards;
      }

      @keyframes checkmark-draw {
        to {
          stroke-dashoffset: 0;
        }
      }

      /* ============================================
         TYPOGRAPHY
         ============================================ */
      .nxt1-complete-title {
        font-size: 28px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 0 0 8px 0;
        letter-spacing: -0.02em;
      }

      .nxt1-complete-subtitle {
        font-size: 16px;
        color: var(--nxt1-color-text-secondary, #a1a1aa);
        margin: 0 0 32px 0;
        line-height: 1.5;
      }

      /* ============================================
         FEATURES GRID
         ============================================ */
      .nxt1-features-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
        width: 100%;
        margin-bottom: 32px;
      }

      @media (min-width: 400px) {
        .nxt1-features-grid {
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
      }

      .nxt1-feature-card {
        background: var(--nxt1-color-bg-secondary, #1a1a1a);
        border: 1px solid var(--nxt1-color-border, #27272a);
        border-radius: 12px;
        padding: 16px;
        transition:
          transform 0.2s ease,
          border-color 0.2s ease;
      }

      .nxt1-feature-card:hover {
        transform: translateY(-2px);
        border-color: var(--nxt1-color-primary, #a3e635);
      }

      .nxt1-feature-icon {
        font-size: 24px;
        display: block;
        margin-bottom: 8px;
      }

      .nxt1-feature-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 0 0 4px 0;
      }

      .nxt1-feature-description {
        font-size: 12px;
        color: var(--nxt1-color-text-secondary, #a1a1aa);
        margin: 0;
        line-height: 1.4;
      }

      /* ============================================
         CTA BUTTON
         ============================================ */
      .nxt1-cta-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        max-width: 320px;
        padding: 16px 32px;
        font-size: 16px;
        font-weight: 600;
        color: var(--nxt1-color-bg-primary, #0a0a0a);
        background: linear-gradient(
          135deg,
          var(--nxt1-color-primary, #a3e635) 0%,
          var(--nxt1-color-primaryLight, #bef264) 100%
        );
        border: none;
        border-radius: 12px;
        cursor: pointer;
        transition:
          transform 0.2s ease,
          box-shadow 0.2s ease;
        box-shadow: 0 4px 16px rgba(163, 230, 53, 0.3);
      }

      .nxt1-cta-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(163, 230, 53, 0.4);
      }

      .nxt1-cta-button:active {
        transform: translateY(0);
      }

      .nxt1-countdown {
        font-size: 14px;
        opacity: 0.7;
      }

      /* ============================================
         SKIP LINK
         ============================================ */
      .nxt1-skip-link {
        margin-top: 16px;
        padding: 8px 16px;
        font-size: 14px;
        color: var(--nxt1-color-text-secondary, #a1a1aa);
        background: transparent;
        border: none;
        cursor: pointer;
        text-decoration: underline;
        opacity: 0.7;
        transition: opacity 0.2s ease;
      }

      .nxt1-skip-link:hover {
        opacity: 1;
      }

      /* ============================================
         RESPONSIVE
         ============================================ */
      @media (max-width: 400px) {
        .nxt1-complete-title {
          font-size: 24px;
        }

        .nxt1-feature-card {
          display: flex;
          align-items: center;
          gap: 12px;
          text-align: left;
        }

        .nxt1-feature-icon {
          margin-bottom: 0;
          flex-shrink: 0;
        }

        .nxt1-feature-card > div {
          flex: 1;
        }
      }
    `,
  ],
})
export class OnboardingCompleteComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly haptics = inject(HapticsService);
  private readonly platformId = inject(PLATFORM_ID);

  // ============================================
  // INPUTS
  // ============================================

  /** Page title */
  @Input() title = '🎉 Welcome to NXT1!';

  /** Page subtitle */
  @Input() subtitle = "You're all set! Let's get started.";

  /** Feature highlights to display */
  @Input() features: FeatureHighlight[] = DEFAULT_FEATURES;

  /** Route to navigate to on completion */
  @Input() redirectRoute = '/home';

  /** Auto-redirect countdown (seconds, 0 to disable) */
  @Input() autoRedirectSeconds = CONFIG.autoRedirectSeconds;

  /** Whether to show countdown on button */
  @Input() showCountdown = CONFIG.showCountdown;

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when user clicks Get Started or auto-redirect fires */
  @Output() complete = new EventEmitter<void>();

  // ============================================
  // STATE
  // ============================================

  /** Countdown timer value */
  readonly countdown = signal<number>(this.autoRedirectSeconds);

  /** Confetti particles */
  readonly particles = signal<ConfettiParticle[]>([]);

  /** Timer reference for cleanup */
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  // ============================================
  // COMPUTED
  // ============================================

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    if (!this.isBrowser) return;

    // Generate confetti
    this.particles.set(this.generateConfetti());

    // Trigger haptic feedback
    this.haptics.notification('success');

    // Start countdown if enabled
    if (this.autoRedirectSeconds > 0) {
      this.countdown.set(this.autoRedirectSeconds);
      this.startCountdown();
    }
  }

  ngOnDestroy(): void {
    this.clearCountdown();
  }

  // ============================================
  // ACTIONS
  // ============================================

  /**
   * Handle Get Started button click
   */
  async onGetStarted(): Promise<void> {
    this.clearCountdown();
    await this.haptics.impact('medium');
    this.complete.emit();

    // Navigate to home
    try {
      const result = await this.router.navigate([this.redirectRoute]);
      if (!result) {
        console.error('[OnboardingComplete] Navigation failed, trying navigateByUrl');
        await this.router.navigateByUrl(this.redirectRoute);
      }
    } catch (err) {
      console.error('[OnboardingComplete] Navigation error:', err);
      // Fallback to direct location change
      if (this.isBrowser) {
        window.location.href = this.redirectRoute;
      }
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Start countdown timer
   */
  private startCountdown(): void {
    this.countdownInterval = setInterval(() => {
      const current = this.countdown();
      if (current <= 1) {
        this.clearCountdown();
        void this.onGetStarted();
      } else {
        this.countdown.set(current - 1);
      }
    }, 1000);
  }

  /**
   * Clear countdown timer
   */
  private clearCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  /**
   * Generate confetti particles
   */
  private generateConfetti(): ConfettiParticle[] {
    const particles: ConfettiParticle[] = [];
    const { particleCount, colors } = CONFIG;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 500,
        duration: 2 + Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 8 + Math.random() * 8,
        rotation: 360 + Math.random() * 720,
      });
    }

    return particles;
  }
}
