/**
 * @fileoverview Genesis Moment Component — "One Link. A Dynasty of Careers."
 * @module @nxt1/ui/components/genesis-moment
 * @version 2.0.0
 *
 * The "God Mode" cinematic section for the Team Platform landing page.
 * Visualises the moment a single Hudl URL detonates into a full
 * recruiting operation — profiles, highlights, graphics, emails,
 * scout reports, and offers cascade in a compact bento dashboard.
 *
 * 100 % design-token styling — zero hardcoded colour/font/spacing values.
 * SSR-safe (afterNextRender), OnPush, standalone, reduced-motion aware.
 *
 * @example
 * ```html
 * <nxt1-genesis-moment
 *   headline="One Link. A Dynasty of Careers."
 *   primaryCtaLabel="Deploy Agent X"
 *   primaryCtaRoute="/team-platform"
 * />
 * ```
 */

import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { NxtCtaButtonComponent } from '../cta-button';

/* ── Activity card types ── */

interface ActivityCard {
  readonly id: string;
  readonly type: 'profile' | 'highlight' | 'graphic' | 'offer' | 'email' | 'scout';
  readonly label: string;
  readonly meta: string;
  readonly accent: string;
  readonly icon: string;
}

const ACTIVITY_CARDS: readonly ActivityCard[] = [
  {
    id: 'p1',
    type: 'profile',
    label: 'J. Williams',
    meta: 'QB · Class of 2027',
    accent: 'primary',
    icon: '👤',
  },
  {
    id: 'h1',
    type: 'highlight',
    label: 'Season Highlights',
    meta: 'J. Williams · 4:32',
    accent: 'secondary',
    icon: '▶',
  },
  {
    id: 'g1',
    type: 'graphic',
    label: 'Game Day Graphic',
    meta: 'Auto-generated',
    accent: 'primary',
    icon: '🎨',
  },
  {
    id: 'o1',
    type: 'offer',
    label: 'Alabama',
    meta: 'Offer Received',
    accent: 'success',
    icon: '🎉',
  },
  {
    id: 'e1',
    type: 'email',
    label: 'Texas · Recruiting',
    meta: 'Email Delivered',
    accent: 'info',
    icon: '✉',
  },
  {
    id: 'p2',
    type: 'profile',
    label: 'M. Carter',
    meta: 'RB · Class of 2027',
    accent: 'primary',
    icon: '👤',
  },
  {
    id: 's1',
    type: 'scout',
    label: 'Scout Report',
    meta: 'K. Robinson · Published',
    accent: 'secondary',
    icon: '📋',
  },
  {
    id: 'o2',
    type: 'offer',
    label: 'Michigan',
    meta: 'Offer Received',
    accent: 'success',
    icon: '🎉',
  },
  {
    id: 'g2',
    type: 'graphic',
    label: 'Commit Graphic',
    meta: 'D. Thompson',
    accent: 'primary',
    icon: '🎨',
  },
  {
    id: 'h2',
    type: 'highlight',
    label: 'Top 10 Plays',
    meta: 'M. Carter · 2:18',
    accent: 'secondary',
    icon: '▶',
  },
  {
    id: 'e2',
    type: 'email',
    label: 'Ohio State · Staff',
    meta: 'Email Delivered',
    accent: 'info',
    icon: '✉',
  },
  {
    id: 'o3',
    type: 'offer',
    label: 'Clemson',
    meta: 'Offer Received',
    accent: 'success',
    icon: '🎉',
  },
];

@Component({
  selector: 'nxt1-genesis-moment',
  standalone: true,
  imports: [UpperCasePipe, NxtCtaButtonComponent],
  template: `
    <section class="genesis" [class.genesis--active]="deployed()" [attr.aria-labelledby]="ariaId()">
      <div class="genesis__content">
        <span class="genesis__badge" aria-hidden="true">
          <span class="genesis__badge-dot"></span>
          Team Platform
        </span>

        <h2 [id]="ariaId()" class="genesis__headline">{{ headline() }}</h2>

        <p class="genesis__subhead">{{ subhead() }}</p>

        <!-- ─── Terminal ─── -->
        <div
          class="genesis__terminal"
          role="img"
          [attr.aria-label]="'NXT1 Command Line showing ' + commandUrl()"
        >
          <div class="genesis__terminal-chrome">
            <span class="genesis__terminal-dot genesis__terminal-dot--red"></span>
            <span class="genesis__terminal-dot genesis__terminal-dot--yellow"></span>
            <span class="genesis__terminal-dot genesis__terminal-dot--green"></span>
            <span class="genesis__terminal-title">NXT1 Command Line</span>
          </div>
          <div class="genesis__terminal-body">
            <div class="genesis__terminal-row">
              <span class="genesis__terminal-prompt">▶</span>
              <span class="genesis__terminal-url">{{ commandUrl() }}</span>
              <span
                class="genesis__terminal-cursor"
                [class.genesis__terminal-cursor--hidden]="deployed()"
                >|</span
              >
            </div>
            <button
              type="button"
              class="genesis__deploy-btn"
              [class.genesis__deploy-btn--fired]="deployed()"
              [disabled]="deployed()"
              [attr.aria-label]="deployed() ? 'Agent X deployed' : 'Deploy Agent X'"
              (click)="deploy()"
            >
              @if (deployed()) {
                <span class="genesis__deploy-check" aria-hidden="true">✓</span> DEPLOYED
              } @else {
                DEPLOY AGENT X
              }
            </button>
          </div>
        </div>

        <!-- ─── Bento Explosion ─── -->
        @if (deployed()) {
          <div
            class="genesis__bento"
            role="region"
            aria-label="Agent X is building profiles, generating graphics, sending emails, and securing offers for 50 athletes"
          >
            <!-- Activity cards -->
            @for (card of activityCards; track card.id; let i = $index) {
              <article
                class="bento__card"
                [class.bento__card--highlight]="card.type === 'highlight'"
                [class.bento__card--graphic]="card.type === 'graphic'"
                [class.bento__card--offer]="card.type === 'offer'"
                [class.bento__card--email]="card.type === 'email'"
                [class.bento__card--scout]="card.type === 'scout'"
                [class.bento__card--profile]="card.type === 'profile'"
                [style.animation-delay]="i * 70 + 'ms'"
              >
                <!-- Image placeholder -->
                <div class="bento__visual" [class]="'bento__visual bento__visual--' + card.type">
                  <span class="bento__visual-icon">{{ card.icon }}</span>
                </div>
                <!-- Card info -->
                <div class="bento__info">
                  <span class="bento__label">{{ card.label }}</span>
                  <span class="bento__meta">{{ card.meta }}</span>
                </div>
                <!-- Type chip -->
                <span class="bento__chip" [class]="'bento__chip bento__chip--' + card.accent">
                  {{ card.type | uppercase }}
                </span>
              </article>
            }

            <!-- Live counter row -->
            <div class="bento__stats">
              <div class="bento__stat">
                <span class="bento__stat-val">50</span>
                <span class="bento__stat-lbl">Profiles</span>
              </div>
              <div class="bento__stat-divider"></div>
              <div class="bento__stat">
                <span class="bento__stat-val">312</span>
                <span class="bento__stat-lbl">Emails</span>
              </div>
              <div class="bento__stat-divider"></div>
              <div class="bento__stat">
                <span class="bento__stat-val">87</span>
                <span class="bento__stat-lbl">Graphics</span>
              </div>
              <div class="bento__stat-divider"></div>
              <div class="bento__stat">
                <span class="bento__stat-val">24</span>
                <span class="bento__stat-lbl">Offers</span>
              </div>
            </div>
          </div>
        }

        <!-- CTAs -->
        <div class="genesis__actions">
          @if (primaryCtaLabel()) {
            <nxt1-cta-button
              [label]="primaryCtaLabel()"
              [route]="primaryCtaRoute()"
              variant="primary"
              size="lg"
            />
          }
          @if (secondaryCtaLabel()) {
            <nxt1-cta-button
              [label]="secondaryCtaLabel()"
              [route]="secondaryCtaRoute()"
              variant="ghost"
              size="lg"
              (clicked)="secondaryCtaClicked.emit()"
            />
          }
        </div>

        <p class="genesis__proof" role="status" aria-live="polite">
          ⚡ 412 athletic programmes deployed Agent X today.
        </p>
      </div>
    </section>
  `,
  styles: [
    `
      /* ════════════════════════════════════════════
       * KEYFRAMES
       * ════════════════════════════════════════════ */

      @keyframes genesis-fade-up {
        from {
          opacity: 0;
          transform: translateY(var(--nxt1-spacing-4)) scale(0.97);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes genesis-card-pop {
        0% {
          opacity: 0;
          transform: scale(0.8) translateY(var(--nxt1-spacing-2));
        }
        60% {
          opacity: 1;
          transform: scale(1.03) translateY(0);
        }
        100% {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      @keyframes genesis-cursor-blink {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0;
        }
      }

      @keyframes genesis-pulse-ring {
        0% {
          box-shadow: 0 0 0 0 var(--nxt1-color-alpha-primary30, rgba(204, 255, 0, 0.3));
        }
        70% {
          box-shadow: 0 0 0 var(--nxt1-spacing-3) transparent;
        }
        100% {
          box-shadow: 0 0 0 0 transparent;
        }
      }

      @keyframes genesis-stat-in {
        from {
          opacity: 0;
          transform: translateY(var(--nxt1-spacing-2));
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes genesis-badge-dot-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.4;
        }
      }

      /* ════════════════════════════════════════════
       * HOST & ROOT
       * ════════════════════════════════════════════ */

      :host {
        display: block;
      }

      .genesis {
        position: relative;
        overflow: hidden;
        max-width: var(--nxt1-section-max-width, 80rem);
        margin: 0 auto;
        padding: var(--nxt1-spacing-20) var(--nxt1-spacing-5);
      }

      /* ── Content ── */

      .genesis__content {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-6);
        text-align: center;
      }

      /* ── Badge ── */

      .genesis__badge {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-1-5, var(--nxt1-spacing-1)) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-default);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 80%, transparent);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wider);
        text-transform: uppercase;
        backdrop-filter: blur(var(--nxt1-blur-sm, 8px));
      }

      .genesis__badge-dot {
        width: var(--nxt1-spacing-2);
        height: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
        animation: genesis-badge-dot-pulse 2s ease-in-out infinite;
      }

      /* ── Headline & Subhead ── */

      .genesis__headline {
        margin: 0;
        max-width: 20ch;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: clamp(var(--nxt1-fontSize-3xl), 6vw, var(--nxt1-fontSize-6xl));
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
        letter-spacing: var(--nxt1-letterSpacing-tight);
        text-wrap: balance;
      }

      .genesis__subhead {
        margin: 0;
        max-width: 58ch;
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-lg);
        line-height: var(--nxt1-lineHeight-relaxed);
        text-wrap: pretty;
      }

      /* ════════════════════════════════════════════
       * TERMINAL
       * ════════════════════════════════════════════ */

      .genesis__terminal {
        width: 100%;
        max-width: 44rem;
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-default);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 95%, transparent);
        box-shadow:
          var(--nxt1-shadow-xl),
          0 0 0 1px color-mix(in srgb, var(--nxt1-color-border-subtle) 50%, transparent);
        overflow: hidden;
        transition: box-shadow var(--nxt1-motion-duration-slow) var(--nxt1-motion-easing-inOut);
      }

      .genesis--active .genesis__terminal {
        box-shadow: var(--nxt1-glow-lg), var(--nxt1-shadow-xl);
        border-color: var(--nxt1-color-border-primary);
      }

      .genesis__terminal-chrome {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2-5, var(--nxt1-spacing-2)) var(--nxt1-spacing-4);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 90%, transparent);
      }

      .genesis__terminal-dot {
        width: var(--nxt1-spacing-2-5, 10px);
        height: var(--nxt1-spacing-2-5, 10px);
        border-radius: var(--nxt1-borderRadius-full);
      }

      .genesis__terminal-dot--red {
        background: var(--nxt1-color-error-500, #ef4444);
      }
      .genesis__terminal-dot--yellow {
        background: var(--nxt1-color-warning-500, #f59e0b);
      }
      .genesis__terminal-dot--green {
        background: var(--nxt1-color-success-500, #22c55e);
      }

      .genesis__terminal-title {
        flex: 1;
        text-align: center;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .genesis__terminal-body {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
      }

      .genesis__terminal-row {
        flex: 1 1 auto;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        min-width: 0;
      }

      .genesis__terminal-prompt {
        flex-shrink: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
      }

      .genesis__terminal-url {
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-sm);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .genesis__terminal-cursor {
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-mono);
        font-weight: var(--nxt1-fontWeight-bold);
        animation: genesis-cursor-blink 1s step-end infinite;
      }

      .genesis__terminal-cursor--hidden {
        display: none;
      }

      .genesis__deploy-btn {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-md);
        border: none;
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        cursor: pointer;
        white-space: nowrap;
        transition:
          background var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          transform var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          box-shadow var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut);
      }

      .genesis__deploy-btn:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: var(--nxt1-glow-md);
      }

      .genesis__deploy-btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .genesis__deploy-btn--fired {
        background: color-mix(
          in srgb,
          var(--nxt1-color-primary) 20%,
          var(--nxt1-color-surface-200)
        );
        color: var(--nxt1-color-primary);
        cursor: default;
        animation: genesis-pulse-ring 2s ease-out 1;
      }

      .genesis__deploy-check {
        font-weight: var(--nxt1-fontWeight-bold);
      }

      /* ════════════════════════════════════════════
       * BENTO GRID — The Explosion
       * ════════════════════════════════════════════ */

      .genesis__bento {
        width: 100%;
        max-width: 56rem;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--nxt1-spacing-3);
        animation: genesis-fade-up 0.4s var(--nxt1-motion-easing-out) both;
      }

      /* ── Card base ── */

      .bento__card {
        display: flex;
        flex-direction: column;
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 92%, transparent);
        overflow: hidden;
        animation: genesis-card-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }

      /* ── Visual placeholder (top of card) ── */

      .bento__visual {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        aspect-ratio: 16 / 10;
        overflow: hidden;
      }

      .bento__visual-icon {
        font-size: var(--nxt1-fontSize-xl);
        line-height: 1;
        opacity: 0.7;
        z-index: 1;
      }

      /* Type-specific visual placeholders — token-only backgrounds */
      .bento__visual--profile {
        background: var(--nxt1-color-surface-200);
      }
      .bento__visual--highlight {
        background: var(--nxt1-color-surface-200);
      }
      .bento__visual--graphic {
        background: var(--nxt1-color-surface-200);
      }
      .bento__visual--offer {
        background: var(--nxt1-color-surface-200);
      }
      .bento__visual--email {
        background: var(--nxt1-color-surface-200);
      }
      .bento__visual--scout {
        background: var(--nxt1-color-surface-200);
      }

      /* Highlight cards get a play button overlay */
      .bento__card--highlight .bento__visual-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-10);
        height: var(--nxt1-spacing-10);
        border-radius: var(--nxt1-borderRadius-full);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 70%, transparent);
        backdrop-filter: blur(var(--nxt1-blur-sm, 8px));
        font-size: var(--nxt1-fontSize-lg);
        opacity: 1;
      }

      /* ── Card info section ── */

      .bento__info {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0-5, 2px);
        padding: var(--nxt1-spacing-2-5, var(--nxt1-spacing-2)) var(--nxt1-spacing-3);
      }

      .bento__label {
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: left;
      }

      .bento__meta {
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-medium);
        text-align: left;
      }

      /* ── Type chip ── */

      .bento__chip {
        margin: 0 var(--nxt1-spacing-3) var(--nxt1-spacing-2-5, var(--nxt1-spacing-2));
        align-self: flex-start;
        display: inline-flex;
        padding: var(--nxt1-spacing-0-5, 2px) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wider);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .bento__chip--primary {
        background: color-mix(in srgb, var(--nxt1-color-primary) 14%, transparent);
        color: var(--nxt1-color-primary);
      }

      .bento__chip--secondary {
        background: color-mix(in srgb, var(--nxt1-color-secondary) 14%, transparent);
        color: var(--nxt1-color-secondary);
      }

      .bento__chip--success {
        background: color-mix(in srgb, var(--nxt1-color-success-500, #22c55e) 14%, transparent);
        color: var(--nxt1-color-success-500, #22c55e);
      }

      .bento__chip--info {
        background: color-mix(in srgb, var(--nxt1-color-info-500, #3b82f6) 14%, transparent);
        color: var(--nxt1-color-info-500, #3b82f6);
      }

      /* ════════════════════════════════════════════
       * STATS ROW
       * ════════════════════════════════════════════ */

      .bento__stats {
        grid-column: 1 / -1;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: var(--nxt1-spacing-5);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 90%, transparent);
        animation: genesis-stat-in 0.5s var(--nxt1-motion-easing-out) 0.9s both;
      }

      .bento__stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-0-5, 2px);
      }

      .bento__stat-val {
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-none);
      }

      .bento__stat-lbl {
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-medium);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .bento__stat-divider {
        width: 1px;
        height: var(--nxt1-spacing-8);
        background: var(--nxt1-color-border-subtle);
      }

      /* ════════════════════════════════════════════
       * ACTIONS & PROOF
       * ════════════════════════════════════════════ */

      .genesis__actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding-top: var(--nxt1-spacing-4);
      }

      .genesis__proof {
        margin: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        min-height: var(--nxt1-spacing-8);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 60%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 80%, transparent);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        backdrop-filter: blur(var(--nxt1-blur-sm, 8px));
      }

      /* ════════════════════════════════════════════
       * RESPONSIVE — Tablet (≤ 768px)
       * ════════════════════════════════════════════ */

      @media (max-width: 768px) {
        .genesis {
          padding: var(--nxt1-spacing-14) var(--nxt1-spacing-4);
        }

        .genesis__headline {
          font-size: clamp(var(--nxt1-fontSize-2xl), 8vw, var(--nxt1-fontSize-4xl));
        }

        .genesis__subhead {
          font-size: var(--nxt1-fontSize-base);
          max-width: 40ch;
        }

        .genesis__terminal-body {
          flex-direction: column;
          align-items: stretch;
        }

        .genesis__deploy-btn {
          width: 100%;
          justify-content: center;
          padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        }

        .genesis__bento {
          grid-template-columns: repeat(3, 1fr);
          gap: var(--nxt1-spacing-2);
        }

        .bento__stats {
          gap: var(--nxt1-spacing-3);
        }

        .bento__stat-val {
          font-size: var(--nxt1-fontSize-xl);
        }
      }

      /* ════════════════════════════════════════════
       * RESPONSIVE — Small Mobile (≤ 480px)
       * ════════════════════════════════════════════ */

      @media (max-width: 480px) {
        .genesis {
          padding: var(--nxt1-spacing-10) var(--nxt1-spacing-3);
        }

        .genesis__bento {
          grid-template-columns: repeat(2, 1fr);
        }

        .bento__visual {
          aspect-ratio: 16 / 9;
        }

        .bento__stats {
          flex-wrap: wrap;
          gap: var(--nxt1-spacing-4);
        }

        .bento__stat-divider {
          display: none;
        }

        .genesis__proof {
          font-size: var(--nxt1-fontSize-xs);
        }
      }

      /* ════════════════════════════════════════════
       * REDUCED MOTION
       * ════════════════════════════════════════════ */

      @media (prefers-reduced-motion: reduce) {
        .genesis__terminal-cursor {
          animation: none !important;
          opacity: 1;
        }
        .genesis__badge-dot {
          animation: none !important;
        }
        .genesis__bento {
          animation: none !important;
          opacity: 1;
        }
        .bento__card {
          animation: none !important;
          opacity: 1;
          transform: none;
        }
        .bento__stats {
          animation: none !important;
          opacity: 1;
        }
        .genesis__deploy-btn--fired {
          animation: none !important;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtGenesisMomentComponent {
  /* ── Public inputs ── */

  readonly headline = input('One Link. A Dynasty of Careers.');
  readonly subhead = input(
    'We turn a single URL into a fully operational recruiting department. You paste the roster. Agent X builds the brands, contacts the colleges, and delivers the offers.'
  );
  readonly commandUrl = input('https://www.hudl.com/team/westlake-hs/roster');
  readonly ariaId = input('genesis-moment-title');

  readonly primaryCtaLabel = input('Get Started Free');
  readonly primaryCtaRoute = input('/auth');
  readonly secondaryCtaLabel = input('Watch Demo');
  readonly secondaryCtaRoute = input('');

  /* ── Outputs ── */

  readonly secondaryCtaClicked = output<void>();
  readonly deployTriggered = output<void>();

  /* ── Internal state ── */

  private readonly _deployed = signal(false);

  protected readonly deployed = computed(() => this._deployed());

  /* ── Static activity data ── */

  protected readonly activityCards = ACTIVITY_CARDS;

  /** Trigger the deploy explosion animation. */
  protected deploy(): void {
    if (this._deployed()) return;
    this._deployed.set(true);
    this.deployTriggered.emit();
  }
}
