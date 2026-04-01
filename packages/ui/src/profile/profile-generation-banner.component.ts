/**
 * @fileoverview Profile Generation Banner Component
 * @module @nxt1/ui/profile
 *
 * Inline banner shown inside the profile tab content area while Agent X
 * scrapes linked accounts and enriches the athlete profile after onboarding.
 *
 * Unlike the full-screen overlay, this banner does NOT block the UI.
 * Users can still navigate tabs, view the profile header, and access
 * other parts of their profile while generation runs in the background.
 *
 * Features:
 * - Compact inline card with Agent X branding
 * - Phase-based progress messaging (connecting → scraping → analyzing → building → done)
 * - Smooth progress bar with glow effect
 * - Platform badges showing which accounts are being scraped
 * - Auto-dismisses on completion
 * - Skip button after 10s for impatient users
 *
 * Design language:
 * - Glass card using NXT1 design tokens
 * - Volt Green (#ccff00) primary accent
 * - Rajdhani brand font
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

/** Delay before showing the skip button (ms) */
const SKIP_BUTTON_DELAY_MS = 10_000;

/** Duration of the dismiss fade-out animation (ms) — must match CSS transition */
const DISMISS_ANIMATION_MS = 500;

@Component({
  selector: 'nxt1-profile-generation-banner',
  standalone: true,
  imports: [NxtTrackClickDirective],
  template: `
    <div
      class="gen-banner"
      [class.gen-banner--dismissed]="isDismissing()"
      [attr.data-testid]="testIds.OVERLAY"
      role="status"
      aria-live="polite"
      aria-label="Agent X is building your profile"
    >
      <!-- Left: Agent X badge -->
      <div class="gen-banner__icon">
        <div class="gen-banner__badge">
          <span class="gen-banner__badge-text">X</span>
        </div>
        <div class="gen-banner__pulse" aria-hidden="true"></div>
      </div>

      <!-- Center: Content -->
      <div class="gen-banner__content">
        <div class="gen-banner__header">
          <span class="gen-banner__title">Agent X is building your profile</span>
          <span class="gen-banner__percent" [attr.data-testid]="testIds.PROGRESS">
            {{ generation.progress() }}%
          </span>
        </div>

        <!-- Progress bar -->
        <div class="gen-banner__track">
          <div class="gen-banner__fill" [style.width.%]="generation.progress()">
            <div class="gen-banner__glow"></div>
          </div>
        </div>

        <!-- Phase message -->
        <div class="gen-banner__meta">
          <span class="gen-banner__phase" [attr.data-testid]="testIds.PHASE_MESSAGE">
            {{ phaseIcon() }} {{ generation.message() }}
          </span>
        </div>

        <!-- Platform badges -->
        @if (platformList().length > 0) {
          <div class="gen-banner__platforms" [attr.data-testid]="testIds.PLATFORM_BADGES">
            <span class="gen-banner__platforms-label">Analyzing:</span>
            @for (platform of platformList(); track platform) {
              <span class="gen-banner__platform-tag">{{ platform }}</span>
            }
          </div>
        }
      </div>

      <!-- Right: Skip button -->
      @if (showSkip()) {
        <button
          class="gen-banner__skip"
          type="button"
          [attr.data-testid]="testIds.SKIP_BUTTON"
          nxtTrackClick="Profile generation skip clicked"
          (click)="onSkip()"
          aria-label="Continue to profile, building will finish in the background"
        >
          Skip
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 0 var(--nxt1-spacing-3, 0.75rem);
        animation: bannerSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }

      @keyframes bannerSlideIn {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .gen-banner {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-3, 0.75rem);
        padding: var(--nxt1-spacing-4, 1rem);
        border-radius: var(--nxt1-radius-lg, 0.75rem);
        background: var(--nxt1-glass-bg, rgba(22, 22, 22, 0.88));
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        border: 1px solid var(--nxt1-glass-border, rgba(255, 255, 255, 0.12));
        margin-bottom: var(--nxt1-spacing-4, 1rem);
        transition:
          opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1),
          transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .gen-banner--dismissed {
        opacity: 0;
        transform: translateY(-8px);
        pointer-events: none;
      }

      /* ═══ AGENT X BADGE ═══ */
      .gen-banner__icon {
        position: relative;
        flex-shrink: 0;
        width: 36px;
        height: 36px;
        margin-top: 2px;
      }

      .gen-banner__badge {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: var(--nxt1-color-primary, #ccff00);
        box-shadow: 0 0 10px rgba(204, 255, 0, 0.3);
        z-index: 2;
      }

      .gen-banner__badge-text {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 0.9375rem;
        font-weight: 700;
        color: var(--nxt1-color-bg-primary, #0a0a0a);
        letter-spacing: -0.02em;
        line-height: 1;
      }

      .gen-banner__pulse {
        position: absolute;
        inset: -4px;
        border-radius: 50%;
        border: 1.5px solid rgba(204, 255, 0, 0.2);
        animation: bannerPulse 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        z-index: 1;
      }

      @keyframes bannerPulse {
        0% {
          transform: scale(1);
          opacity: 0.4;
        }
        100% {
          transform: scale(1.4);
          opacity: 0;
        }
      }

      /* ═══ CONTENT ═══ */
      .gen-banner__content {
        flex: 1;
        min-width: 0;
      }

      .gen-banner__header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2, 0.5rem);
        margin-bottom: var(--nxt1-spacing-2, 0.5rem);
      }

      .gen-banner__title {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #f5f5f7);
        letter-spacing: -0.01em;
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .gen-banner__percent {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--nxt1-color-primary, #ccff00);
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
      }

      /* ═══ PROGRESS BAR ═══ */
      .gen-banner__track {
        width: 100%;
        height: 3px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-surface-2, rgba(255, 255, 255, 0.06));
        overflow: hidden;
        margin-bottom: var(--nxt1-spacing-1, 0.25rem);
      }

      .gen-banner__fill {
        height: 100%;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-primary, #ccff00);
        transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
      }

      .gen-banner__glow {
        position: absolute;
        right: 0;
        top: -2px;
        width: 16px;
        height: 7px;
        background: radial-gradient(ellipse, rgba(204, 255, 0, 0.5), transparent);
        filter: blur(3px);
      }

      /* ═══ META ═══ */
      .gen-banner__meta {
        margin-bottom: var(--nxt1-spacing-1, 0.25rem);
      }

      .gen-banner__phase {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 0.75rem;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.5));
        line-height: 1.4;
      }

      /* ═══ PLATFORM BADGES ═══ */
      .gen-banner__platforms {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--nxt1-spacing-1, 0.25rem);
        margin-top: var(--nxt1-spacing-1, 0.25rem);
      }

      .gen-banner__platforms-label {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 0.6875rem;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.35));
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-weight: 500;
      }

      .gen-banner__platform-tag {
        display: inline-flex;
        align-items: center;
        padding: 1px var(--nxt1-spacing-2, 0.5rem);
        border-radius: var(--nxt1-radius-full, 9999px);
        background: rgba(204, 255, 0, 0.08);
        border: 1px solid rgba(204, 255, 0, 0.12);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 0.6875rem;
        font-weight: 500;
        color: var(--nxt1-color-primary, #ccff00);
        text-transform: capitalize;
      }

      /* ═══ SKIP BUTTON ═══ */
      .gen-banner__skip {
        flex-shrink: 0;
        padding: var(--nxt1-spacing-1, 0.25rem) var(--nxt1-spacing-3, 0.75rem);
        border: 1px solid var(--nxt1-glass-border, rgba(255, 255, 255, 0.12));
        border-radius: var(--nxt1-radius-md, 0.5rem);
        background: var(--nxt1-color-surface-1, rgba(255, 255, 255, 0.04));
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.5));
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 0.75rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        animation: skipFadeIn 0.3s ease;
        margin-top: 2px;
      }

      .gen-banner__skip:hover {
        background: rgba(204, 255, 0, 0.06);
        border-color: rgba(204, 255, 0, 0.2);
        color: var(--nxt1-color-text-primary, #f5f5f7);
      }

      @keyframes skipFadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      /* ═══ RESPONSIVE ═══ */
      @media (max-width: 480px) {
        .gen-banner {
          padding: var(--nxt1-spacing-3, 0.75rem);
          gap: var(--nxt1-spacing-2, 0.5rem);
        }

        .gen-banner__title {
          font-size: 0.8125rem;
        }

        .gen-banner__icon {
          width: 30px;
          height: 30px;
        }

        .gen-banner__badge-text {
          font-size: 0.8125rem;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileGenerationBannerComponent implements OnInit, OnDestroy {
  protected readonly generation = inject(ProfileGenerationStateService);
  private readonly logger = inject(NxtLoggingService).child('ProfileGenerationBanner');
  private readonly platformId = inject(PLATFORM_ID);

  /** Test IDs from shared constants */
  protected readonly testIds = PROFILE_GENERATION_TEST_IDS;

  /** Emitted when user skips or generation completes — parent should refresh profile */
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

  /** Whether this component initiated the dismiss (vs being destroyed by navigation) */
  private isDismissedByUser = false;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.logger.info('Profile generation banner shown');

    // Show skip button after delay
    this.skipTimer = setTimeout(() => this.showSkip.set(true), SKIP_BUTTON_DELAY_MS);

    // Start polling (idempotent — safe to call multiple times)
    void this.generation.pollUntilDone().then((result) => {
      if (this.isDismissing()) return; // Already dismissing
      this.logger.info('Generation polling finished', { result });
      this.dismiss(result === 'completed' ? 'completed' : 'skipped');
    });
  }

  ngOnDestroy(): void {
    if (this.skipTimer) {
      clearTimeout(this.skipTimer);
      this.skipTimer = null;
    }
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }

    // If the banner is destroyed by navigation (not by user action),
    // stop polling but keep isGenerating true so the banner re-appears
    // when the user returns.
    if (!this.isDismissedByUser) {
      this.generation.stopPolling();
    }
  }

  protected onSkip(): void {
    this.logger.info('User skipped profile generation banner');
    this.dismiss('skipped');
  }

  private dismiss(reason: 'completed' | 'skipped'): void {
    if (this.isDismissing()) return; // Prevent double-dismiss
    this.isDismissedByUser = true;
    this.isDismissing.set(true);
    // Wait for fade-out animation before emitting
    this.dismissTimer = setTimeout(() => {
      this.dismissed.emit(reason);
      this.generation.reset();
    }, DISMISS_ANIMATION_MS);
  }
}
