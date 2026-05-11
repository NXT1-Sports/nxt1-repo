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
 *   commandUrl="https://www.hudl.com/team/westlake-hs/roster"
 * />
 * ```
 */

import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  afterNextRender,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { UpperCasePipe } from '@angular/common';

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
    label: 'Roster Intake',
    meta: '50 athletes synced',
    accent: 'primary',
    icon: 'ID',
  },
  {
    id: 'h1',
    type: 'highlight',
    label: 'Film Pull',
    meta: 'Friday game indexed',
    accent: 'secondary',
    icon: 'PLAY',
  },
  {
    id: 'g1',
    type: 'graphic',
    label: 'Graphic Set',
    meta: 'Program branded',
    accent: 'primary',
    icon: 'ART',
  },
  {
    id: 'o1',
    type: 'offer',
    label: 'Offer Watch',
    meta: 'Signals updated',
    accent: 'success',
    icon: 'WIN',
  },
  {
    id: 'e1',
    type: 'email',
    label: 'Coach Outreach',
    meta: 'Emails drafted',
    accent: 'info',
    icon: 'SEND',
  },
  {
    id: 'p2',
    type: 'profile',
    label: 'Athlete Briefs',
    meta: 'Scout-ready packets',
    accent: 'primary',
    icon: 'BIO',
  },
  {
    id: 's1',
    type: 'scout',
    label: 'Scout Reports',
    meta: 'Benchmarks mapped',
    accent: 'secondary',
    icon: 'RPT',
  },
  {
    id: 'o2',
    type: 'offer',
    label: 'Fit Scores',
    meta: 'Targets ranked',
    accent: 'success',
    icon: 'FIT',
  },
  {
    id: 'g2',
    type: 'graphic',
    label: 'Spotlight Drop',
    meta: 'Social ready',
    accent: 'primary',
    icon: 'POST',
  },
  {
    id: 'h2',
    type: 'highlight',
    label: 'Highlight Reels',
    meta: 'Clips assembled',
    accent: 'secondary',
    icon: 'CUT',
  },
  {
    id: 'e2',
    type: 'email',
    label: 'Parent Update',
    meta: 'Brief prepared',
    accent: 'info',
    icon: 'NOTE',
  },
  {
    id: 'o3',
    type: 'offer',
    label: 'Playbook',
    meta: 'Next actions live',
    accent: 'success',
    icon: 'OPS',
  },
];

const COMMAND_TYPEWRITER_INITIAL_DELAY_MS = 450;
const COMMAND_TYPEWRITER_STEP_MS = 26;
const COMMAND_AUTO_TAP_DELAY_MS = 500;
const COMMAND_AUTO_TAP_PRESS_MS = 160;

@Component({
  selector: 'nxt1-genesis-moment',
  standalone: true,
  imports: [UpperCasePipe],
  template: `
    <section class="genesis" [class.genesis--active]="deployed()" [attr.aria-labelledby]="ariaId()">
      <div class="genesis__content">
        <span class="genesis__badge" aria-hidden="true">
          <span class="genesis__badge-dot"></span>
          Program Command Center
        </span>

        @if (headingLevel() === 1) {
          <h1 [id]="ariaId()" class="genesis__headline">{{ headline() }}</h1>
        } @else {
          <h2 [id]="ariaId()" class="genesis__headline">{{ headline() }}</h2>
        }

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
              <span class="genesis__terminal-url">{{ displayedCommand() }}</span>
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
              [class.genesis__deploy-btn--auto-tap]="autoTapActive()"
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
                <span class="bento__stat-val">12</span>
                <span class="bento__stat-lbl">Film Reviews</span>
              </div>
              <div class="bento__stat-divider"></div>
              <div class="bento__stat">
                <span class="bento__stat-val">4</span>
                <span class="bento__stat-lbl">Game Plans</span>
              </div>
              <div class="bento__stat-divider"></div>
              <div class="bento__stat">
                <span class="bento__stat-val">9</span>
                <span class="bento__stat-lbl">Playbooks</span>
              </div>
              <div class="bento__stat-divider"></div>
              <div class="bento__stat">
                <span class="bento__stat-val">28</span>
                <span class="bento__stat-lbl">Staff Actions</span>
              </div>
            </div>
          </div>
        }
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

      .genesis__deploy-btn--auto-tap:not(:disabled) {
        transform: translateY(var(--nxt1-spacing-0-5, 2px)) scale(0.98);
        box-shadow: var(--nxt1-glow-md);
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
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        line-height: var(--nxt1-lineHeight-none);
        opacity: 0.82;
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
        font-size: var(--nxt1-fontSize-xs);
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
export class NxtGenesisMomentComponent implements OnDestroy {
  /* ── Public inputs ── */

  readonly headline = input('One Link. A Dynasty of Careers.');
  readonly subhead = input(
    'We turn a single URL into a fully operational recruiting department. You paste the roster. Agent X builds the brands, contacts the colleges, and delivers the offers.'
  );
  readonly commandUrl = input('https://www.hudl.com/team/westlake-hs/roster');
  readonly ariaId = input('genesis-moment-title');
  readonly headingLevel = input<1 | 2>(2);

  /* ── Outputs ── */

  readonly deployTriggered = output<void>();

  /* ── Internal state ── */

  private readonly _deployed = signal(false);
  private readonly _displayedCommand = signal('');
  private readonly _autoTapActive = signal(false);
  private typewriterTimer: ReturnType<typeof setTimeout> | null = null;
  private autoTapTimer: ReturnType<typeof setTimeout> | null = null;
  private autoTapPressTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly deployed = computed(() => this._deployed());
  protected readonly displayedCommand = computed(() => this._displayedCommand());
  protected readonly autoTapActive = computed(() => this._autoTapActive());

  /* ── Static activity data ── */

  protected readonly activityCards = ACTIVITY_CARDS;

  constructor() {
    afterNextRender(() => {
      this.startCommandTypewriter();
    });
  }

  /** Trigger the deploy explosion animation. */
  protected deploy(): void {
    if (this._deployed()) return;
    this.clearAutoTapTimers();
    this._autoTapActive.set(false);
    this._deployed.set(true);
    this.deployTriggered.emit();
  }

  ngOnDestroy(): void {
    this.clearTypewriterTimer();
    this.clearAutoTapTimers();
  }

  private startCommandTypewriter(): void {
    this.clearTypewriterTimer();
    this._displayedCommand.set('');

    const targetCommand = this.commandUrl();
    if (targetCommand.length === 0) {
      this.scheduleAutoTapDeploy();
      return;
    }

    const commandCharacters = Array.from(targetCommand);
    let characterIndex = 0;

    const typeNextCharacter = (): void => {
      characterIndex += 1;
      this._displayedCommand.set(commandCharacters.slice(0, characterIndex).join(''));

      if (characterIndex < commandCharacters.length) {
        this.typewriterTimer = setTimeout(typeNextCharacter, COMMAND_TYPEWRITER_STEP_MS);
        return;
      }

      this.typewriterTimer = null;
      this.scheduleAutoTapDeploy();
    };

    this.typewriterTimer = setTimeout(typeNextCharacter, COMMAND_TYPEWRITER_INITIAL_DELAY_MS);
  }

  private scheduleAutoTapDeploy(): void {
    this.clearAutoTapTimers();
    if (this._deployed()) return;

    this.autoTapTimer = setTimeout(() => {
      this._autoTapActive.set(true);

      this.autoTapPressTimer = setTimeout(() => {
        this._autoTapActive.set(false);
        this.deploy();
      }, COMMAND_AUTO_TAP_PRESS_MS);
    }, COMMAND_AUTO_TAP_DELAY_MS);
  }

  private clearTypewriterTimer(): void {
    if (this.typewriterTimer === null) return;
    clearTimeout(this.typewriterTimer);
    this.typewriterTimer = null;
  }

  private clearAutoTapTimers(): void {
    if (this.autoTapTimer !== null) {
      clearTimeout(this.autoTapTimer);
      this.autoTapTimer = null;
    }

    if (this.autoTapPressTimer !== null) {
      clearTimeout(this.autoTapPressTimer);
      this.autoTapPressTimer = null;
    }
  }
}
