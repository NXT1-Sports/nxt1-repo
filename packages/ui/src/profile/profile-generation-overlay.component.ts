/**
 * @fileoverview Profile Generation Overlay Component
 * @module @nxt1/ui/profile
 *
 * Full-screen overlay shown on the profile page while Agent X scrapes
 * linked accounts and enriches the athlete profile after onboarding.
 *
 * Features:
 * - Animated Agent X logo with pulse
 * - Phase-based progress messaging (connecting → scraping → analyzing → building → done)
 * - Smooth progress bar with glow effect
 * - Platform badges showing which accounts are being scraped
 * - Auto-dismisses on completion with a reveal transition
 * - Skip button after 10s for impatient users
 *
 * Design language:
 * - Dark backdrop using NXT1 design tokens (#0a0a0a)
 * - Volt Green (#ccff00) primary accent
 * - Rajdhani brand font
 * - Glass card using design token glass values
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
  output,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  ProfileGenerationStateService,
  type GenerationPhase,
} from './profile-generation-state.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtTrackClickDirective } from '../services/breadcrumb/breadcrumb.service';
import { PROFILE_GENERATION_TEST_IDS } from '@nxt1/core/testing';

/** Phase icon mapping */
const PHASE_ICONS: Record<GenerationPhase, string> = {
  connecting: '🔗',
  scraping: '📡',
  analyzing: '🧠',
  building: '⚡',
  finalizing: '✨',
  complete: '🚀',
  error: '⚠️',
};

@Component({
  selector: 'nxt1-profile-generation-overlay',
  standalone: true,
  imports: [NxtTrackClickDirective],
  template: `
    <div
      class="generation-overlay"
      [class.generation-overlay--dismissed]="isDismissing()"
      [attr.data-testid]="testIds.OVERLAY"
      role="status"
      aria-live="polite"
      aria-label="Agent X is building your profile"
    >
      <!-- Background -->
      <div class="overlay-bg" aria-hidden="true">
        <div class="bg-gradient"></div>
      </div>

      <!-- Main content card -->
      <div class="overlay-card">
        <!-- Agent X Logo -->
        <div class="agent-logo-container">
          <div class="agent-logo">
            <span class="agent-logo-text">X</span>
          </div>
          <div class="pulse-ring" aria-hidden="true"></div>
        </div>

        <!-- Title -->
        <h2 class="overlay-title">Agent X is Building Your Profile</h2>
        <p class="overlay-subtitle">
          Scraping &amp; analyzing your linked accounts to create a professional athlete profile
        </p>

        <!-- Progress bar -->
        <div class="progress-container" [attr.data-testid]="testIds.PROGRESS">
          <div class="progress-track">
            <div class="progress-fill" [style.width.%]="generation.progress()">
              <div class="progress-glow"></div>
            </div>
          </div>
          <div class="progress-meta">
            <span class="progress-phase" [attr.data-testid]="testIds.PHASE_MESSAGE">
              {{ phaseIcon() }} {{ generation.message() }}
            </span>
            <span class="progress-percent">{{ generation.progress() }}%</span>
          </div>
        </div>

        <!-- Platform badges -->
        @if (platformList().length > 0) {
          <div class="platforms-section">
            <span class="platforms-label">Analyzing:</span>
            <div class="platform-badges" [attr.data-testid]="testIds.PLATFORM_BADGES">
              @for (platform of platformList(); track platform) {
                <span class="platform-badge">{{ platform }}</span>
              }
            </div>
          </div>
        }

        <!-- Skip button (appears after 10s) -->
        @if (showSkip()) {
          <button
            class="skip-btn"
            type="button"
            [attr.data-testid]="testIds.SKIP_BUTTON"
            nxtTrackClick="Profile generation skip clicked"
            (click)="onSkip()"
          >
            Continue to profile — we'll finish in the background
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      /* ═══ OVERLAY CONTAINER ═══ */
      :host {
        display: contents;
      }

      .generation-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-6, 1.5rem);
        animation: overlayFadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }

      .generation-overlay--dismissed {
        animation: overlayFadeOut 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        pointer-events: none;
      }

      @keyframes overlayFadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes overlayFadeOut {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }

      /* ═══ BACKGROUND ═══ */
      .overlay-bg {
        position: absolute;
        inset: 0;
        overflow: hidden;
      }

      .bg-gradient {
        position: absolute;
        inset: 0;
        background: radial-gradient(
          ellipse at 50% 30%,
          rgba(204, 255, 0, 0.04) 0%,
          var(--nxt1-color-bg-primary, #0a0a0a) 60%
        );
      }

      /* ═══ CONTENT CARD ═══ */
      .overlay-card {
        position: relative;
        max-width: 420px;
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: var(--nxt1-spacing-8, 2rem) var(--nxt1-spacing-6, 1.5rem);
        border-radius: var(--nxt1-radius-xl, 1rem);
        background: var(--nxt1-glass-bg, rgba(22, 22, 22, 0.88));
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        border: 1px solid var(--nxt1-glass-border, rgba(255, 255, 255, 0.12));
        box-shadow: var(--nxt1-shadow-xl, 0 20px 40px rgba(0, 0, 0, 0.4));
        animation: cardSlideUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) 0.15s both;
      }

      @keyframes cardSlideUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ═══ AGENT X LOGO ═══ */
      .agent-logo-container {
        position: relative;
        width: 80px;
        height: 80px;
        margin-bottom: var(--nxt1-spacing-5, 1.25rem);
      }

      .agent-logo {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: var(--nxt1-color-primary, #ccff00);
        box-shadow: var(--nxt1-glow-md, 0 0 16px rgba(204, 255, 0, 0.4));
        z-index: 2;
      }

      .agent-logo-text {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 2rem;
        font-weight: 700;
        color: var(--nxt1-color-bg-primary, #0a0a0a);
        letter-spacing: -0.02em;
      }

      .pulse-ring {
        position: absolute;
        inset: -6px;
        border-radius: 50%;
        border: 2px solid rgba(204, 255, 0, 0.2);
        animation: pulseRing 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        z-index: 1;
      }

      @keyframes pulseRing {
        0% {
          transform: scale(1);
          opacity: 0.4;
        }
        100% {
          transform: scale(1.5);
          opacity: 0;
        }
      }

      /* ═══ TYPOGRAPHY ═══ */
      .overlay-title {
        margin: 0 0 var(--nxt1-spacing-2, 0.5rem);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #f5f5f7);
        letter-spacing: -0.01em;
        line-height: 1.3;
      }

      .overlay-subtitle {
        margin: 0 0 var(--nxt1-spacing-6, 1.5rem);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 0.875rem;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.5));
        line-height: 1.5;
        max-width: 320px;
      }

      /* ═══ PROGRESS BAR ═══ */
      .progress-container {
        width: 100%;
        margin-bottom: var(--nxt1-spacing-5, 1.25rem);
      }

      .progress-track {
        width: 100%;
        height: 4px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-surface-2, rgba(255, 255, 255, 0.06));
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-primary, #ccff00);
        transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
      }

      .progress-glow {
        position: absolute;
        right: 0;
        top: -3px;
        width: 24px;
        height: 10px;
        background: radial-gradient(ellipse, rgba(204, 255, 0, 0.5), transparent);
        filter: blur(4px);
      }

      .progress-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: var(--nxt1-spacing-2, 0.5rem);
      }

      .progress-phase {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 0.8125rem;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.5));
      }

      .progress-percent {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--nxt1-color-primary, #ccff00);
        font-variant-numeric: tabular-nums;
      }

      /* ═══ PLATFORM BADGES ═══ */
      .platforms-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2, 0.5rem);
        margin-bottom: var(--nxt1-spacing-4, 1rem);
      }

      .platforms-label {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 0.75rem;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.35));
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 500;
      }

      .platform-badges {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: var(--nxt1-spacing-1, 0.25rem);
      }

      .platform-badge {
        display: inline-flex;
        align-items: center;
        padding: var(--nxt1-spacing-1, 0.25rem) var(--nxt1-spacing-3, 0.75rem);
        border-radius: var(--nxt1-radius-full, 9999px);
        background: rgba(204, 255, 0, 0.08);
        border: 1px solid rgba(204, 255, 0, 0.15);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--nxt1-color-primary, #ccff00);
        text-transform: capitalize;
      }

      /* ═══ SKIP BUTTON ═══ */
      .skip-btn {
        margin-top: var(--nxt1-spacing-2, 0.5rem);
        padding: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-5, 1.25rem);
        border: 1px solid var(--nxt1-glass-border, rgba(255, 255, 255, 0.12));
        border-radius: var(--nxt1-radius-md, 0.5rem);
        background: var(--nxt1-color-surface-1, rgba(255, 255, 255, 0.04));
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.5));
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 0.8125rem;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        animation: skipFadeIn 0.3s ease;
      }

      .skip-btn:hover {
        background: rgba(204, 255, 0, 0.06);
        border-color: rgba(204, 255, 0, 0.2);
        color: var(--nxt1-color-text-primary, #f5f5f7);
      }

      @keyframes skipFadeIn {
        from {
          opacity: 0;
          transform: translateY(6px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ═══ RESPONSIVE ═══ */
      @media (max-width: 480px) {
        .overlay-card {
          padding: var(--nxt1-spacing-6, 1.5rem) var(--nxt1-spacing-4, 1rem);
        }
        .overlay-title {
          font-size: 1.125rem;
        }
        .agent-logo-container {
          width: 64px;
          height: 64px;
        }
        .agent-logo-text {
          font-size: 1.5rem;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileGenerationOverlayComponent implements OnInit, OnDestroy {
  protected readonly generation = inject(ProfileGenerationStateService);
  private readonly logger = inject(NxtLoggingService).child('ProfileGenerationOverlay');
  private readonly platformId = inject(PLATFORM_ID);

  /** Test IDs from shared constants */
  protected readonly testIds = PROFILE_GENERATION_TEST_IDS;

  /** Emitted when user skips or overlay completes — parent should refresh profile */
  readonly dismissed = output<'completed' | 'skipped'>();

  protected readonly isDismissing = signal(false);
  protected readonly showSkip = signal(false);
  private skipTimer: ReturnType<typeof setTimeout> | null = null;

  /** Phase icon for current phase */
  protected readonly phaseIcon = computed(() => PHASE_ICONS[this.generation.phase()]);

  /** Split platforms string into array for badges */
  protected readonly platformList = computed<string[]>(() => {
    const raw = this.generation.platforms();
    if (!raw) return [];
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  });

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.logger.info('Profile generation overlay shown');

    // Show skip button after 10 seconds
    this.skipTimer = setTimeout(() => this.showSkip.set(true), 10_000);

    // Start polling
    void this.generation.pollUntilDone().then((result) => {
      this.logger.info('Generation polling finished', { result });
      this.dismiss(result === 'completed' ? 'completed' : 'skipped');
    });
  }

  ngOnDestroy(): void {
    if (this.skipTimer) {
      clearTimeout(this.skipTimer);
      this.skipTimer = null;
    }
  }

  protected onSkip(): void {
    this.logger.info('User skipped profile generation overlay');
    this.dismiss('skipped');
  }

  private dismiss(reason: 'completed' | 'skipped'): void {
    this.isDismissing.set(true);
    // Wait for fade-out animation (800ms) before emitting
    setTimeout(() => {
      // Emit first so the parent handles the event while this component is still alive,
      // then reset() sets isGenerating to false which removes this component from the DOM.
      this.dismissed.emit(reason);
      this.generation.reset();
    }, 800);
  }
}
