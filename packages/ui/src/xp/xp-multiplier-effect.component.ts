/**
 * @fileoverview XP Multiplier Effect (Virality) Section
 * @module @nxt1/ui/xp
 * @version 1.1.0
 *
 * Landing-page section highlighting referral-based team growth and
 * group achievement incentives ("The Multiplier Effect").
 *
 * Content:
 *   Headline — "Bring Your Team. Multiply Your Grind."
 *   Visual  — Referral chain: You → 3 teammates × +500 XP each
 *   Graphic — Placeholder preview of the custom team graphic reward
 *   Why     — "Recruiting is a team sport…"
 *
 * Architecture notes:
 * - 100% design-token-driven for colors, typography, spacing, radii.
 * - Structural dimensions (node min-widths, fork shape, grid constraints)
 *   are scoped CSS custom properties on :host for overridability and
 *   documentation, following the same convention as xp-dashboard-preview.
 * - Semantic HTML (section/header/h2/h3/aside/blockquote) with
 *   deterministic aria-labelledby IDs (SSR-safe, no random values).
 * - No browser APIs, no platform checks needed — pure presentational.
 * - Responsive: 1-col (mobile) → 3-col targets (tablet) → 2-panel split (desktop).
 *
 * @example
 * ```html
 * <nxt1-xp-multiplier-effect />
 * ```
 */

import { ChangeDetectionStrategy, Component, computed } from '@angular/core';

/** Single teammate-invite row data. */
interface TeammateBonus {
  readonly id: string;
  readonly label: string;
  readonly bonus: string;
}

/** Static referral data — 3 teammates × +500 XP each. */
const TEAMMATE_BONUSES: readonly TeammateBonus[] = [
  { id: 'tm-1', label: 'Teammate 1', bonus: '+500 XP' },
  { id: 'tm-2', label: 'Teammate 2', bonus: '+500 XP' },
  { id: 'tm-3', label: 'Teammate 3', bonus: '+500 XP' },
] as const;

/** Monotonic counter for deterministic SSR-safe element IDs. */
let multiplierEffectInstanceCounter = 0;

@Component({
  selector: 'nxt1-xp-multiplier-effect',
  standalone: true,
  template: `
    <section class="multiplier" [attr.aria-labelledby]="titleId()">
      <header class="multiplier__header">
        <p class="multiplier__eyebrow">The Multiplier Effect</p>
        <h2 class="multiplier__title" [id]="titleId()">Bring Your Team. Multiply Your Grind.</h2>
        <p class="multiplier__subtitle">
          Invite 3 teammates &mdash; each one earns you a
          <strong class="multiplier__accent">+500 XP</strong> bonus.
        </p>
      </header>

      <!-- Referral-chain graphic -->
      <div class="multiplier__layout">
        <div
          class="referral-chain"
          role="img"
          aria-label="Referral chain graphic: you invite 3 teammates, each worth plus 500 XP"
        >
          <!-- Source node -->
          <div class="referral-chain__source">
            <span class="node node--source" aria-hidden="true">
              <svg
                class="node__icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              You
            </span>
            <span class="source-label">Team Captain</span>
          </div>

          <!-- Decorative branching connector -->
          <div class="referral-chain__connector" aria-hidden="true">
            <div class="connector__trunk"></div>
            <div class="connector__branches">
              <span class="connector__branch"></span>
              <span class="connector__branch"></span>
              <span class="connector__branch"></span>
            </div>
          </div>

          <!-- Target nodes -->
          <div
            class="referral-chain__targets"
            role="list"
            aria-label="Invited teammates and bonuses"
          >
            @for (teammate of teammates; track teammate.id) {
              <div class="target" role="listitem">
                <span class="node node--target">
                  <svg
                    class="node__icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="10" cy="7" r="4" />
                    <path d="M20 8v6M23 11h-6" />
                  </svg>
                  {{ teammate.label }}
                </span>
                <span class="target__bonus">{{ teammate.bonus }}</span>
              </div>
            }
          </div>

          <!-- Total callout -->
          <div class="referral-chain__total" aria-label="Total bonus: plus 1500 XP">
            <span class="total__value">+1,500 XP</span>
            <span class="total__label">Total Referral Bonus</span>
          </div>
        </div>

        <!-- Team Invite Graphic Preview -->
        <aside class="graphic-preview" [attr.aria-labelledby]="badgeTitleId()">
          <div class="graphic-preview__image">
            <!-- Placeholder shimmer for the actual invite graphic -->
            <div class="graphic-preview__placeholder" aria-hidden="true">
              <div class="graphic-preview__placeholder-bg">
                <svg
                  class="graphic-preview__placeholder-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
            </div>
          </div>
          <div class="graphic-preview__content">
            <span class="graphic-preview__badge">Exclusive Reward</span>
            <h3 class="graphic-preview__title" [id]="badgeTitleId()">Custom Team Graphic</h3>
            <p class="graphic-preview__desc">
              Invite your teammates and unlock a personalized team graphic &mdash; designed to flex
              your squad&rsquo;s commitment.
            </p>
          </div>
        </aside>
      </div>

      <!-- Why callout -->
      <blockquote class="multiplier__why">
        <span class="multiplier__why-label">Why it matters</span>
        <p class="multiplier__why-text">
          Recruiting is a team sport. When your whole roster is on NXT1, coaches notice the entire
          program.
        </p>
      </blockquote>
    </section>
  `,
  styles: [
    `
      /* ============================================
         SCOPED STRUCTURAL CUSTOM PROPERTIES
         All colors/typography/spacing/radii use global
         design tokens. Structural dimensions that have
         no global token equivalent are declared here as
         scoped custom properties for overridability.
         ============================================ */

      :host {
        /* Node sizing (touch-target accessible) */
        --_node-min-height: var(--nxt1-spacing-11, 2.75rem);
        --_node-source-min-width: 7.5rem;
        --_node-target-min-width: 8.75rem;
        --_node-icon-size: var(--nxt1-spacing-4, 1rem);

        /* Connector/fork shape */
        --_connector-height: var(--nxt1-spacing-5, 1.25rem);

        /* Desktop aside minimum */
        --_aside-min-width: 17.5rem;

        /* Badge icon container */
        --_badge-icon-size: var(--nxt1-spacing-12, 3rem);

        display: block;
      }

      /* ============================================
         SECTION — matches sibling section widths
         ============================================ */

      .multiplier {
        display: grid;
        gap: var(--nxt1-spacing-5);
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y, var(--nxt1-spacing-8))
          var(--nxt1-section-padding-x, var(--nxt1-spacing-4));
      }

      /* ============================================
         HEADER
         ============================================ */

      .multiplier__header {
        display: grid;
        gap: var(--nxt1-spacing-2);
        text-align: center;
      }

      .multiplier__eyebrow {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .multiplier__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .multiplier__subtitle {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .multiplier__accent {
        color: var(--nxt1-color-primary);
        font-weight: var(--nxt1-fontWeight-bold);
      }

      /* ============================================
         LAYOUT — stacked (mobile) → side-by-side (desktop)
         ============================================ */

      .multiplier__layout {
        display: grid;
        gap: var(--nxt1-spacing-4);
      }

      /* ============================================
         REFERRAL CHAIN CARD
         ============================================ */

      .referral-chain {
        display: grid;
        gap: var(--nxt1-spacing-3);
        justify-items: center;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-100);
        padding: var(--nxt1-spacing-5) var(--nxt1-spacing-4);
      }

      /* ---- Source node ---- */

      .referral-chain__source {
        display: grid;
        justify-items: center;
        gap: var(--nxt1-spacing-1_5);
      }

      .node {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-1_5);
        min-height: var(--_node-min-height);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-default);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        white-space: nowrap;
      }

      .node__icon {
        width: var(--_node-icon-size);
        height: var(--_node-icon-size);
        flex-shrink: 0;
      }

      .node--source {
        min-width: var(--_node-source-min-width);
        color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary12);
        border-color: var(--nxt1-color-alpha-primary30);
      }

      .source-label {
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      /* ---- Connector (decorative fork) ---- */

      .referral-chain__connector {
        display: grid;
        gap: 0;
        width: 100%;
        max-width: var(--_node-target-min-width);
      }

      .connector__trunk {
        width: 1px;
        height: var(--_connector-height);
        margin: 0 auto;
        background: var(--nxt1-color-alpha-primary30);
      }

      .connector__branches {
        display: flex;
        justify-content: space-between;
      }

      .connector__branch {
        flex: 1;
        height: var(--_connector-height);
        border-left: 1px solid var(--nxt1-color-alpha-primary30);
        border-right: 1px solid var(--nxt1-color-alpha-primary30);
        border-bottom: 1px solid var(--nxt1-color-alpha-primary30);
        border-bottom-left-radius: var(--nxt1-borderRadius-lg);
        border-bottom-right-radius: var(--nxt1-borderRadius-lg);
      }

      .connector__branch + .connector__branch {
        border-left: none;
      }

      /* ---- Target nodes ---- */

      .referral-chain__targets {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-2);
        width: 100%;
      }

      .target {
        display: grid;
        justify-items: center;
        gap: var(--nxt1-spacing-1);
      }

      .node--target {
        min-width: var(--_node-target-min-width);
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-surface-200);
      }

      .target__bonus {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary15);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      /* ---- Total callout ---- */

      .referral-chain__total {
        display: grid;
        justify-items: center;
        gap: var(--nxt1-spacing-1);
        padding-top: var(--nxt1-spacing-3);
        border-top: 1px solid var(--nxt1-color-border-subtle);
        width: 100%;
        text-align: center;
      }

      .total__value {
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .total__label {
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-medium);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      /* ============================================
         TEAM INVITE GRAPHIC PREVIEW
         ============================================ */

      .graphic-preview {
        display: grid;
        gap: 0;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-100);
        overflow: hidden;
      }

      /* Image area — 16:9 aspect ratio placeholder */
      .graphic-preview__image {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        background: var(--nxt1-color-surface-200);
      }

      .graphic-preview__placeholder {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .graphic-preview__placeholder-bg {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-alpha-primary8) 0%,
          var(--nxt1-color-alpha-primary15) 50%,
          var(--nxt1-color-alpha-primary8) 100%
        );
        background-size: 200% 200%;
        animation: shimmer-graphic 3s ease-in-out infinite;
      }

      .graphic-preview__placeholder-icon {
        width: 2.5rem;
        height: 2.5rem;
        color: var(--nxt1-color-alpha-primary40);
        opacity: 0.7;
      }

      @keyframes shimmer-graphic {
        0%,
        100% {
          background-position: 0% 50%;
        }
        50% {
          background-position: 100% 50%;
        }
      }

      /* Content area below the image */
      .graphic-preview__content {
        display: grid;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-4);
      }

      .graphic-preview__badge {
        width: fit-content;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary15);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .graphic-preview__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-snug);
      }

      .graphic-preview__desc {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ============================================
         WHY BLOCKQUOTE
         ============================================ */

      .multiplier__why {
        margin: 0;
        display: grid;
        gap: var(--nxt1-spacing-1);
        border-left: 2px solid var(--nxt1-color-alpha-primary40);
        padding: var(--nxt1-spacing-3) 0 var(--nxt1-spacing-3) var(--nxt1-spacing-4);
      }

      .multiplier__why-label {
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .multiplier__why-text {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ============================================
         RESPONSIVE — Tablet (640px)
         ============================================ */

      @media (min-width: 640px) {
        .referral-chain__connector {
          max-width: 100%;
        }

        .referral-chain__targets {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      /* ============================================
         RESPONSIVE — Desktop (1024px)
         ============================================ */

      @media (min-width: 1024px) {
        .multiplier__title {
          font-size: var(--nxt1-fontSize-3xl);
        }

        .multiplier__subtitle {
          font-size: var(--nxt1-fontSize-base);
        }

        .multiplier__layout {
          grid-template-columns: minmax(0, 2fr) minmax(var(--_aside-min-width), 1fr);
          align-items: stretch;
        }

        .graphic-preview {
          align-content: start;
        }

        .graphic-preview__placeholder-icon {
          width: 3rem;
          height: 3rem;
        }

        .total__value {
          font-size: var(--nxt1-fontSize-xl);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtXpMultiplierEffectComponent {
  /** Monotonic per-instance counter for deterministic SSR-safe IDs. */
  private readonly instanceId = ++multiplierEffectInstanceCounter;

  /** Static teammate referral bonus data. */
  protected readonly teammates = TEAMMATE_BONUSES;

  /** Deterministic IDs for aria-labelledby — SSR-safe (no crypto/random). */
  protected readonly titleId = computed(() => `xp-multiplier-title-${this.instanceId}`);
  protected readonly badgeTitleId = computed(() => `xp-multiplier-badge-${this.instanceId}`);
}
