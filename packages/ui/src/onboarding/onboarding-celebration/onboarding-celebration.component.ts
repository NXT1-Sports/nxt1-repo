/**
 * @fileoverview OnboardingCelebrationComponent - Step Completion Celebration
 * @module @nxt1/ui/onboarding
 *
 * Professional celebration overlay for onboarding step completions.
 * Creates a satisfying moment when users complete important steps.
 *
 * Features:
 * - Confetti particle animation
 * - Checkmark success animation
 * - Haptic feedback integration
 * - Auto-dismiss with configurable duration
 * - Accessibility: respects prefers-reduced-motion
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-celebration
 *   [show]="showCelebration()"
 *   [message]="'Great job!'"
 *   (complete)="onCelebrationComplete()"
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
  effect,
  signal,
  PLATFORM_ID,
  OnDestroy,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HapticsService } from '../../services/haptics';

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

/** Celebration configuration */
const CELEBRATION_CONFIG = {
  /** Duration before auto-dismiss (ms) */
  duration: 1500,
  /** Number of confetti particles */
  particleCount: 24,
  /** Confetti colors (primary brand colors) */
  colors: [
    'var(--nxt1-color-primary)',
    'var(--nxt1-color-primaryLight)',
    '#FFD700', // Gold
    '#FF6B6B', // Coral
    '#4ECDC4', // Teal
    '#A855F7', // Purple
  ],
} as const;

@Component({
  selector: 'nxt1-onboarding-celebration',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isVisible()) {
      <div class="nxt1-celebration-overlay" [class.nxt1-celebration--active]="isAnimating()">
        <!-- Confetti Particles -->
        <div class="nxt1-confetti-container">
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

        <!-- Success Checkmark -->
        <div class="nxt1-success-container">
          <div class="nxt1-success-circle">
            <svg class="nxt1-success-check" viewBox="0 0 52 52">
              <circle class="nxt1-success-circle-bg" cx="26" cy="26" r="25" fill="none" />
              <path class="nxt1-success-check-path" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
            </svg>
          </div>

          <!-- Optional Message -->
          @if (message) {
            <p class="nxt1-success-message">{{ message }}</p>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      /* ============================================
         CELEBRATION OVERLAY
         ============================================ */
      .nxt1-celebration-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        opacity: 0;
        pointer-events: none;
        transition: opacity 200ms ease-out;
      }

      .nxt1-celebration-overlay.nxt1-celebration--active {
        opacity: 1;
        pointer-events: auto;
      }

      /* ============================================
         CONFETTI CONTAINER
         ============================================ */
      .nxt1-confetti-container {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
      }

      /* ============================================
         CONFETTI PARTICLE
         ============================================ */
      @keyframes confettiFall {
        0% {
          transform: translateY(-100vh) rotate(0deg);
          opacity: 1;
        }
        100% {
          transform: translateY(100vh) rotate(var(--confetti-rotation, 720deg));
          opacity: 0;
        }
      }

      .nxt1-confetti {
        position: absolute;
        top: -20px;
        width: var(--confetti-size, 10px);
        height: var(--confetti-size, 10px);
        background: var(--confetti-color, var(--nxt1-color-primary));
        border-radius: 2px;
        animation: confettiFall 2s ease-out forwards;
      }

      /* Reduced motion: just fade */
      @media (prefers-reduced-motion: reduce) {
        .nxt1-confetti {
          animation: none;
          opacity: 0;
        }
      }

      /* ============================================
         SUCCESS CONTAINER
         ============================================ */
      .nxt1-success-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-4);
        animation: scaleIn 400ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }

      @keyframes scaleIn {
        0% {
          transform: scale(0);
          opacity: 0;
        }
        50% {
          transform: scale(1.1);
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }

      /* ============================================
         SUCCESS CIRCLE & CHECKMARK
         ============================================ */
      .nxt1-success-circle {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--nxt1-color-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }

      .nxt1-success-check {
        width: 52px;
        height: 52px;
      }

      .nxt1-success-circle-bg {
        stroke: var(--nxt1-color-text-onPrimary);
        stroke-width: 2;
        opacity: 0.3;
      }

      .nxt1-success-check-path {
        stroke: var(--nxt1-color-text-onPrimary);
        stroke-width: 3;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-dasharray: 48;
        stroke-dashoffset: 48;
        animation: checkDraw 400ms ease-out 200ms forwards;
      }

      @keyframes checkDraw {
        to {
          stroke-dashoffset: 0;
        }
      }

      /* Reduced motion: instant check */
      @media (prefers-reduced-motion: reduce) {
        .nxt1-success-check-path {
          animation: none;
          stroke-dashoffset: 0;
        }

        .nxt1-success-container {
          animation: none;
          transform: scale(1);
          opacity: 1;
        }
      }

      /* ============================================
         SUCCESS MESSAGE
         ============================================ */
      .nxt1-success-message {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: 600;
        color: white;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        margin: 0;
        animation: fadeInUp 300ms ease-out 300ms both;
      }

      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .nxt1-success-message {
          animation: none;
          opacity: 1;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingCelebrationComponent implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly haptics = inject(HapticsService);

  /** Whether to show the celebration */
  @Input() show = false;

  /** Optional success message */
  @Input() message: string | null = null;

  /** Duration before auto-dismiss (ms) */
  @Input() duration = CELEBRATION_CONFIG.duration;

  /** Emits when celebration animation completes */
  @Output() complete = new EventEmitter<void>();

  /** Internal visibility state */
  readonly isVisible = signal(false);

  /** Animation active state */
  readonly isAnimating = signal(false);

  /** Generated confetti particles */
  readonly particles = signal<ConfettiParticle[]>([]);

  /** Auto-dismiss timeout */
  private dismissTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // React to show input changes
    effect(() => {
      if (this.show && !this.isVisible()) {
        this.startCelebration();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.dismissTimeout) {
      clearTimeout(this.dismissTimeout);
    }
  }

  /**
   * Start the celebration sequence
   */
  private startCelebration(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Generate confetti particles
    this.particles.set(this.generateConfetti());

    // Show overlay
    this.isVisible.set(true);

    // Small delay then activate animation
    requestAnimationFrame(() => {
      this.isAnimating.set(true);

      // Trigger haptic feedback
      this.haptics.notification('success');
    });

    // Auto-dismiss after duration
    this.dismissTimeout = setTimeout(() => {
      this.dismiss();
    }, this.duration);
  }

  /**
   * Dismiss the celebration
   */
  private dismiss(): void {
    this.isAnimating.set(false);

    // Wait for fade out animation
    setTimeout(() => {
      this.isVisible.set(false);
      this.particles.set([]);
      this.complete.emit();
    }, 200);
  }

  /**
   * Generate random confetti particles
   */
  private generateConfetti(): ConfettiParticle[] {
    const particles: ConfettiParticle[] = [];
    const { particleCount, colors } = CELEBRATION_CONFIG;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 300,
        duration: 1.5 + Math.random() * 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 6 + Math.random() * 8,
        rotation: 360 + Math.random() * 720,
      });
    }

    return particles;
  }
}
