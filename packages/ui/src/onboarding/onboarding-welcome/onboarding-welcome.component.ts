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
        <!-- Slide Content -->
        <div class="nxt1-slide-container" [attr.data-direction]="animationDirection()">
          <!-- Feature Hero -->
          <div
            class="nxt1-slide-hero"
            [class.nxt1-slide-hero--brain]="isStepTwoSlide()"
            [class.nxt1-slide-hero--feature-panel]="isStepTwoSlide() || isStepThreeSlide()"
            [style.--accent-color]="currentSlide()?.accentColor"
            [style.--slide-gradient-start]="currentSlide()?.gradient?.[0]"
            [style.--slide-gradient-end]="currentSlide()?.gradient?.[1]"
          >
            @if (isStepTwoSlide()) {
              <div class="nxt1-brain-panel" aria-label="Agent X Brain capabilities" role="img">
                <div class="nxt1-brain-header">
                  <span class="nxt1-brain-badge" aria-hidden="true">
                    <svg
                      class="nxt1-brain-badge-logo"
                      viewBox="0 0 612 792"
                      width="14"
                      height="14"
                      fill="currentColor"
                      stroke="currentColor"
                      stroke-width="12"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
                      />
                      <polygon
                        points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
                      />
                    </svg>
                  </span>
                  <span class="nxt1-brain-title">Agent X Brain</span>
                </div>

                <div class="nxt1-brain-grid">
                  <article class="nxt1-brain-card">
                    <span class="nxt1-brain-card-icon">▶</span>
                    <h3>Video & Content</h3>
                    <p>Creates assets and edits that are ready to post.</p>
                  </article>

                  <article class="nxt1-brain-card nxt1-brain-card--active">
                    <span class="nxt1-brain-card-icon">◎</span>
                    <h3>Sport Strategy</h3>
                    <p>Game-aware guidance tuned to your role and goals.</p>
                  </article>

                  <article class="nxt1-brain-card">
                    <span class="nxt1-brain-card-icon">✦</span>
                    <h3>Design Direction</h3>
                    <p>Builds polished concepts for any sports workflow.</p>
                  </article>

                  <article class="nxt1-brain-card">
                    <span class="nxt1-brain-card-icon">▮▮</span>
                    <h3>Smart Analysis</h3>
                    <p>Turns your data into clear, useful next actions.</p>
                  </article>
                </div>
              </div>
            } @else if (isStepThreeSlide()) {
              <div class="nxt1-actions-panel" aria-label="Agent X action setup menu" role="img">
                <div class="nxt1-actions-header">
                  <span class="nxt1-actions-badge" aria-hidden="true">
                    <svg
                      class="nxt1-actions-badge-logo"
                      viewBox="0 0 612 792"
                      width="14"
                      height="14"
                      fill="currentColor"
                      stroke="currentColor"
                      stroke-width="12"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
                      />
                      <polygon
                        points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
                      />
                    </svg>
                  </span>
                  <span class="nxt1-actions-title">Action Menu</span>
                </div>

                <div class="nxt1-actions-marquee" aria-hidden="true">
                  <div class="nxt1-actions-row nxt1-actions-row--left">
                    <div class="nxt1-actions-track">
                      @for (item of actionRowOne(); track item + '-' + $index) {
                        <span class="nxt1-action-chip">{{ item }}</span>
                      }
                      @for (item of actionRowOne(); track item + '-clone-' + $index) {
                        <span class="nxt1-action-chip">{{ item }}</span>
                      }
                    </div>
                  </div>

                  <div class="nxt1-actions-row nxt1-actions-row--right">
                    <div class="nxt1-actions-track">
                      @for (item of actionRowTwo(); track item + '-' + $index) {
                        <span class="nxt1-action-chip">{{ item }}</span>
                      }
                      @for (item of actionRowTwo(); track item + '-clone-' + $index) {
                        <span class="nxt1-action-chip">{{ item }}</span>
                      }
                    </div>
                  </div>

                  <div class="nxt1-actions-row nxt1-actions-row--left-slow">
                    <div class="nxt1-actions-track">
                      @for (item of actionRowThree(); track item + '-' + $index) {
                        <span class="nxt1-action-chip">{{ item }}</span>
                      }
                      @for (item of actionRowThree(); track item + '-clone-' + $index) {
                        <span class="nxt1-action-chip">{{ item }}</span>
                      }
                    </div>
                  </div>
                </div>
              </div>
            } @else if (isAgentXIcon(currentSlide()?.icon)) {
              <svg
                class="nxt1-agent-x-logo"
                viewBox="0 0 612 792"
                width="128"
                height="128"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="12"
                stroke-linejoin="round"
                [attr.aria-label]="currentSlide()?.headline"
                role="img"
              >
                <path
                  d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
                />
                <polygon
                  points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
                />
              </svg>
            } @else {
              <span class="nxt1-icon-emoji" role="img" [attr.aria-label]="currentSlide()?.headline">
                {{ currentSlide()?.icon || '🎉' }}
              </span>
            }
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
        @if (showDotNavigation) {
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
        }

        <!-- Navigation Buttons -->
        @if (showNavigationButtons) {
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
        }
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
        transform: translateY(-20px);
      }

      /* ============================================
         SLIDE CONTENT
         ============================================ */
      .nxt1-slide-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 8px 0 20px;
      }

      .nxt1-slide-hero {
        width: 100%;
        max-width: 360px;
        min-height: 205px;
        max-height: 205px;
        padding: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(
          135deg,
          var(--slide-gradient-start, var(--nxt1-color-surface-200, #1a1a1a)) 0%,
          var(--slide-gradient-end, var(--nxt1-color-surface-100, #111111)) 100%
        );
        border: 1px solid var(--nxt1-color-border-default, #333);
        border-radius: 24px;
        margin-bottom: 24px;
        box-shadow:
          0 16px 40px rgba(0, 0, 0, 0.35),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
        position: relative;
        overflow: hidden;
      }

      .nxt1-slide-hero--feature-panel {
        align-items: stretch;
        justify-content: stretch;
      }

      .nxt1-slide-hero::after {
        content: '';
        position: absolute;
        inset: 0;
        background: radial-gradient(
          circle at 50% 30%,
          var(--accent-color, transparent) 0%,
          transparent 65%
        );
        opacity: 0.2;
        pointer-events: none;
      }

      .nxt1-icon-emoji {
        font-size: 68px;
        line-height: 1;
        filter: drop-shadow(0 8px 20px rgba(0, 0, 0, 0.35));
        position: relative;
        z-index: 1;
      }

      .nxt1-agent-x-logo {
        color: var(--nxt1-color-primary, #a3e635);
        filter: drop-shadow(0 10px 24px rgba(0, 0, 0, 0.4));
        position: relative;
        z-index: 1;
      }

      .nxt1-brain-panel {
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        min-height: 0;
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .nxt1-brain-header {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        min-height: 30px;
        border-radius: 12px;
        border: 1px solid rgba(163, 230, 53, 0.45);
        background: linear-gradient(
          135deg,
          rgba(163, 230, 53, 0.2) 0%,
          rgba(163, 230, 53, 0.12) 100%
        );
      }

      .nxt1-brain-badge {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-primary, #a3e635);
        color: #0a0a0a;
      }

      .nxt1-brain-badge-logo {
        display: block;
      }

      .nxt1-brain-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
      }

      .nxt1-brain-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
      }

      .nxt1-brain-card {
        min-height: 70px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(15, 23, 42, 0.35);
        padding: 7px;
        text-align: left;
      }

      .nxt1-brain-card--active {
        border-color: rgba(163, 230, 53, 0.85);
        box-shadow: inset 0 0 0 1px rgba(163, 230, 53, 0.18);
      }

      .nxt1-brain-card-icon {
        width: 18px;
        height: 18px;
        border-radius: 7px;
        border: 1px solid rgba(163, 230, 53, 0.45);
        color: var(--nxt1-color-primary, #a3e635);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        margin-bottom: 4px;
      }

      .nxt1-brain-card h3 {
        margin: 0 0 2px;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.2;
        color: var(--nxt1-color-text-primary, #fff);
      }

      .nxt1-brain-card p {
        margin: 0;
        font-size: 9px;
        line-height: 1.2;
        color: var(--nxt1-color-text-secondary, #a1a1aa);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .nxt1-actions-panel {
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        min-height: 0;
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
        overflow: hidden;
        padding-top: 2px;
      }

      .nxt1-actions-header {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 30px;
        border-radius: 12px;
        border: 1px solid rgba(163, 230, 53, 0.45);
        background: linear-gradient(
          135deg,
          rgba(163, 230, 53, 0.2) 0%,
          rgba(163, 230, 53, 0.1) 100%
        );
      }

      .nxt1-actions-badge {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-primary, #a3e635);
        color: #0a0a0a;
      }

      .nxt1-actions-badge-logo {
        display: block;
      }

      .nxt1-actions-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
      }

      .nxt1-actions-marquee {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-rows: repeat(3, minmax(0, 1fr));
        align-items: center;
        gap: 8px;
        padding: 0;
        margin-top: 10px;
        overflow: hidden;
      }

      .nxt1-actions-row {
        position: relative;
        overflow: hidden;
        min-height: 0;
      }

      .nxt1-actions-track {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        white-space: nowrap;
        min-width: max-content;
        padding-right: 10px;
      }

      .nxt1-actions-row--left .nxt1-actions-track {
        animation: nxt1-actions-marquee-left 28s linear infinite;
      }

      .nxt1-actions-row--right .nxt1-actions-track {
        animation: nxt1-actions-marquee-right 24s linear infinite;
      }

      .nxt1-actions-row--left-slow .nxt1-actions-track {
        animation: nxt1-actions-marquee-left 32s linear infinite;
      }

      .nxt1-action-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 30px;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid rgba(163, 230, 53, 0.4);
        background: rgba(163, 230, 53, 0.12);
        color: var(--nxt1-color-text-primary, #ffffff);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.01em;
      }

      @keyframes nxt1-actions-marquee-left {
        0% {
          transform: translateX(0);
        }
        100% {
          transform: translateX(-50%);
        }
      }

      @keyframes nxt1-actions-marquee-right {
        0% {
          transform: translateX(-50%);
        }
        100% {
          transform: translateX(0);
        }
      }

      @media (max-width: 380px) {
        .nxt1-welcome-content {
          transform: translateY(-14px);
        }

        .nxt1-slide-hero {
          min-height: 195px;
          max-height: 195px;
          padding: 8px;
        }

        .nxt1-brain-card {
          min-height: 64px;
          padding: 6px;
        }

        .nxt1-brain-card h3 {
          font-size: 9px;
        }

        .nxt1-brain-card p {
          font-size: 8px;
        }

        .nxt1-actions-marquee {
          gap: 7px;
          padding: 6px 0;
          margin-top: 8px;
        }

        .nxt1-action-chip {
          height: 26px;
          padding: 0 12px;
          font-size: 10px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .nxt1-actions-row--left .nxt1-actions-track,
        .nxt1-actions-row--right .nxt1-actions-track,
        .nxt1-actions-row--left-slow .nxt1-actions-track {
          animation: none;
        }
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

  protected readonly actionRowOne = signal<string[]>([
    'Generate Content',
    'Film Breakdown',
    'Build Outreach',
    'Draft Messages',
    'Create Graphics',
    'Plan Weekly Tasks',
  ]);

  protected readonly actionRowTwo = signal<string[]>([
    'Analyze Performance',
    'Schedule Follow-ups',
    'Compare Prospects',
    'Prepare Reports',
    'Organize Workflow',
    'Track Progress',
  ]);

  protected readonly actionRowThree = signal<string[]>([
    'Role-Based Guidance',
    'Smart Recommendations',
    'Daily Priorities',
    'Auto Summaries',
    'Action Templates',
    'Next Best Move',
  ]);

  // ============================================
  // INPUTS
  // ============================================

  /** User's role for role-specific slides */
  @Input() userRole: OnboardingUserType | null = 'athlete';

  /** User's first name for personalized greeting */
  @Input() firstName: string | null = null;

  /** Show internal Skip/Next/CTA buttons (set false when external footer controls are used) */
  @Input() showNavigationButtons = true;

  /** Show in-card dot navigation (set false when footer progress is used) */
  @Input() showDotNavigation = true;

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

  protected isAgentXIcon(icon: string | null | undefined): boolean {
    if (!icon) return false;
    return icon.trim().toLowerCase() === 'agent-x';
  }

  protected isStepTwoSlide(): boolean {
    return this.currentSlideIndex() === 1;
  }

  protected isStepThreeSlide(): boolean {
    return this.currentSlideIndex() === 2;
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
