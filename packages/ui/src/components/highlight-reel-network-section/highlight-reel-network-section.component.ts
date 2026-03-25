/**
 * @fileoverview NxtHighlightReelNetworkSectionComponent — "The Highlight Reel Network"
 * @module @nxt1/ui/components/highlight-reel-network-section
 *
 * Premium distribution visualization showing how a single highlight upload
 * syndicates across every high-impact surface on the NXT1 platform.
 *
 * Visual architecture:
 * 1. Section header (shared component)
 * 2. Realistic video player mockup as the central hub element
 * 3. Clean static connector stem from player to distribution grid
 * 4. Four destination cards with gradient icon containers, numbered steps,
 *    title, description, and proof metadata
 * 5. Closing benefit pull-quote with accent bar
 *
 * Design philosophy: editorial, restrained motion, real-product feel.
 * One subtle play-button glow — no bouncing, pulsing, or expanding rings.
 * 100 % design-token driven, semantic, accessible, SSR-safe, responsive.
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent, type SectionHeaderLevel } from '../section-header';

/** Represents one syndication destination in the distribution visualization. */
export interface DistributionDestination {
  readonly id: 'explore-feed' | 'social-accounts' | 'sport-pages' | 'coach-newsletters';
  readonly label: string;
  readonly detail: string;
  readonly proof: string;
  /** Inline SVG path data rendered inside a 24×24 viewBox. */
  readonly svgPath: string;
}

const DISTRIBUTION_DESTINATIONS: readonly DistributionDestination[] = [
  {
    id: 'explore-feed',
    label: 'NXT1 Explore Feed',
    detail: 'High-visibility placement for breakout content and daily recruiting discovery.',
    proof: '40k+ daily visitors',
    svgPath:
      'M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.467.733-3.559',
  },
  {
    id: 'social-accounts',
    label: 'NXT1 Social Accounts',
    detail: 'Published to Instagram, TikTok, X, and YouTube through one coordinated pipeline.',
    proof: 'Instagram · TikTok · X · YouTube',
    svgPath:
      'M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z',
  },
  {
    id: 'sport-pages',
    label: 'Sport-Specific Landing Pages',
    detail: 'Automatically routed to the right recruiting audience by sport taxonomy.',
    proof: 'e.g., /sports/football',
    svgPath:
      'M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z M6 6h.008v.008H6V6Z',
  },
  {
    id: 'coach-newsletters',
    label: 'Email Newsletters to Coaches',
    detail: 'Featured in outbound recruiting email drops built for active college programs.',
    proof: 'Coach-facing distribution',
    svgPath:
      'M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75',
  },
] as const;

let highlightReelNetworkInstanceCounter = 0;

@Component({
  selector: 'nxt1-highlight-reel-network-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="hrn" [attr.aria-labelledby]="titleId()">
      <div class="hrn__shell">
        <!-- ── Section header ── -->
        <nxt1-section-header
          [titleId]="titleId()"
          [headingLevel]="headingLevel()"
          variant="hero"
          align="center"
          eyebrow="The Highlight Reel Network"
          title="Broadcast Across the NXT1 Network."
          subtitle="One upload syndicates your highlight to every high-impact surface where coaches and fans already pay attention."
        />

        <!-- ── Distribution visualization ── -->
        <article class="hrn__viz" [attr.aria-labelledby]="mapTitleId()">
          <h3 class="sr-only" [id]="mapTitleId()">Syndication Map</h3>

          <!-- Video player mockup — the "source" -->
          <div class="player" aria-hidden="true">
            <div class="player__frame">
              <!-- Faux video surface with gradient -->
              <div class="player__surface">
                <!-- Diagonal field lines for texture -->
                <span class="player__field-line player__field-line--1"></span>
                <span class="player__field-line player__field-line--2"></span>
                <span class="player__field-line player__field-line--3"></span>
              </div>

              <!-- Play button -->
              <span class="player__play">
                <svg class="player__play-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.14v14l11-7-11-7Z" />
                </svg>
              </span>

              <!-- Top-left badge -->
              <span class="player__badge">HIGHLIGHT</span>

              <!-- Bottom-right duration -->
              <span class="player__duration">0:47</span>

              <!-- Bottom progress bar -->
              <span class="player__progress">
                <span class="player__progress-fill"></span>
              </span>
            </div>
            <p class="player__caption">Your Highlight</p>
          </div>

          <!-- Static connector stem -->
          <div class="hrn__stem" aria-hidden="true">
            <span class="hrn__stem-line"></span>
            <span class="hrn__stem-arrow">
              <svg viewBox="0 0 12 8" fill="none">
                <path
                  d="M1 1l5 5 5-5"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
          </div>

          <!-- "Distributes to" label -->
          <p class="hrn__flow-label" aria-hidden="true">Distributes to</p>

          <!-- Destination cards -->
          <ol class="hrn__destinations" [attr.aria-describedby]="benefitId()">
            @for (dest of destinations; track dest.id; let idx = $index) {
              <li class="dest">
                <div class="dest__card">
                  <!-- Step indicator + icon -->
                  <div class="dest__head">
                    <span class="dest__icon-box" aria-hidden="true">
                      <svg
                        class="dest__icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path [attr.d]="dest.svgPath" />
                      </svg>
                    </span>
                    <span class="dest__step" aria-hidden="true">{{ idx + 1 }}</span>
                  </div>

                  <p class="dest__label">{{ dest.label }}</p>
                  <p class="dest__detail">{{ dest.detail }}</p>

                  <p class="dest__proof">{{ dest.proof }}</p>
                </div>
              </li>
            }
          </ol>
        </article>

        <!-- ── Benefit callout ── -->
        <aside class="hrn__benefit" [id]="benefitId()">
          <span class="hrn__benefit-bar" aria-hidden="true"></span>
          <p class="hrn__benefit-copy">
            Your play doesn't just live on your phone. It lives on the
            <em class="hrn__benefit-accent">largest sports intelligence network</em>
            in the country.
          </p>
        </aside>
      </div>
    </section>
  `,
  styles: [
    `
      /* ============================================
         HIGHLIGHT REEL NETWORK — v3
         Realistic video player + clean distribution.
         One subtle animation. Editorial feel.
         100 % token-driven, SSR-safe, accessible.
         ============================================ */

      /* ── Single animation: gentle play-button glow ── */

      @keyframes hrn-play-glow {
        0%,
        100% {
          box-shadow:
            0 0 0 0 var(--nxt1-color-alpha-primary30),
            0 0 12px 2px var(--nxt1-color-alpha-primary10);
        }
        50% {
          box-shadow:
            0 0 0 6px var(--nxt1-color-alpha-primary10),
            0 0 20px 4px var(--nxt1-color-alpha-primary20);
        }
      }

      /* ── Screen-reader only ── */

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
        border: 0;
      }

      /* ── Host & Section ── */

      :host {
        display: block;
      }

      .hrn {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        background: transparent;
      }

      .hrn__shell {
        display: grid;
        gap: var(--nxt1-spacing-10);
      }

      /* ── Visualization container ── */

      .hrn__viz {
        display: grid;
        justify-items: center;
        gap: 0;
      }

      /* ============================================
         VIDEO PLAYER MOCKUP
         ============================================ */

      .player {
        display: grid;
        justify-items: center;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        max-width: 280px;
      }

      .player__frame {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        border-radius: var(--nxt1-borderRadius-xl);
        overflow: hidden;
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
      }

      /* Gradient surface simulating video screenshot */

      .player__surface {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-surface-200) 0%,
          var(--nxt1-color-surface-100) 40%,
          color-mix(in srgb, var(--nxt1-color-primary) 6%, var(--nxt1-color-surface-100)) 70%,
          var(--nxt1-color-surface-200) 100%
        );
      }

      /* Subtle diagonal field-line texture */

      .player__field-line {
        position: absolute;
        height: 1px;
        background: var(--nxt1-color-alpha-primary8);
        transform-origin: left center;
        pointer-events: none;
      }

      .player__field-line--1 {
        top: 30%;
        left: -10%;
        width: 120%;
        transform: rotate(-12deg);
      }

      .player__field-line--2 {
        top: 55%;
        left: -5%;
        width: 110%;
        transform: rotate(-12deg);
      }

      .player__field-line--3 {
        top: 78%;
        left: -8%;
        width: 115%;
        transform: rotate(-12deg);
      }

      /* Play button in center */

      .player__play {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-12);
        height: var(--nxt1-spacing-12);
        border-radius: var(--nxt1-borderRadius-full);
        background: color-mix(in srgb, var(--nxt1-color-primary) 90%, transparent);
        color: var(--nxt1-color-surface-50);
        animation: hrn-play-glow 4s ease-in-out infinite;
      }

      .player__play-icon {
        width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
        margin-left: 2px; /* optical center for play triangle */
      }

      /* Top-left badge */

      .player__badge {
        position: absolute;
        top: var(--nxt1-spacing-2);
        left: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-sm);
        background: color-mix(in srgb, var(--nxt1-color-surface-50) 80%, transparent);
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-3xs, 0.5625rem);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-widest);
        text-transform: uppercase;
        line-height: var(--nxt1-lineHeight-normal);
        backdrop-filter: blur(4px);
      }

      /* Bottom-right duration */

      .player__duration {
        position: absolute;
        bottom: calc(var(--nxt1-spacing-2) + 3px);
        right: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-1_5);
        border-radius: var(--nxt1-borderRadius-sm);
        background: color-mix(in srgb, var(--nxt1-color-surface-50) 75%, transparent);
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: 1;
        font-variant-numeric: tabular-nums;
        backdrop-filter: blur(4px);
      }

      /* Bottom progress bar */

      .player__progress {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: var(--nxt1-color-alpha-primary10);
      }

      .player__progress-fill {
        display: block;
        width: 35%;
        height: 100%;
        background: var(--nxt1-color-primary);
        border-radius: 0 var(--nxt1-borderRadius-full) var(--nxt1-borderRadius-full) 0;
      }

      /* Caption under player */

      .player__caption {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        line-height: var(--nxt1-lineHeight-normal);
      }

      /* ============================================
         CONNECTOR STEM (player → grid)
         ============================================ */

      .hrn__stem {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0;
        padding: var(--nxt1-spacing-1) 0;
      }

      .hrn__stem-line {
        width: 1px;
        height: var(--nxt1-spacing-6);
        background: linear-gradient(
          to bottom,
          var(--nxt1-color-alpha-primary30),
          var(--nxt1-color-alpha-primary15)
        );
      }

      .hrn__stem-arrow {
        display: inline-flex;
        width: var(--nxt1-spacing-3);
        height: var(--nxt1-spacing-2);
        color: var(--nxt1-color-alpha-primary30);
      }

      .hrn__stem-arrow svg {
        width: 100%;
        height: 100%;
      }

      /* "Distributes to" label */

      .hrn__flow-label {
        margin: var(--nxt1-spacing-3) 0 var(--nxt1-spacing-4);
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        text-align: center;
        line-height: var(--nxt1-lineHeight-normal);
      }

      /* ============================================
         DESTINATION CARDS
         ============================================ */

      .hrn__destinations {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--nxt1-spacing-3);
        width: 100%;
      }

      .dest {
        display: block;
      }

      .dest__card {
        display: grid;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        padding: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        position: relative;
        transition:
          border-color var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          box-shadow var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut);
      }

      .dest__card:hover {
        border-color: var(--nxt1-color-alpha-primary20);
        box-shadow: 0 0 0 1px var(--nxt1-color-alpha-primary8);
      }

      /* Icon box + step badge row */

      .dest__head {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .dest__icon-box {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-10);
        height: var(--nxt1-spacing-10);
        border-radius: var(--nxt1-borderRadius-lg);
        background: linear-gradient(
          135deg,
          var(--nxt1-color-alpha-primary15),
          var(--nxt1-color-alpha-primary8)
        );
        border: 1px solid var(--nxt1-color-alpha-primary15);
        flex-shrink: 0;
      }

      .dest__icon {
        width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
        color: var(--nxt1-color-primary);
      }

      .dest__step {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-3xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: 1;
        flex-shrink: 0;
      }

      /* Card body */

      .dest__label {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
      }

      .dest__detail {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* Proof metadata */

      .dest__proof {
        margin: 0;
        display: inline-flex;
        align-self: flex-start;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        line-height: var(--nxt1-lineHeight-normal);
      }

      /* ── Benefit callout ── */

      .hrn__benefit {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-4);
        max-width: 42rem;
        margin-inline: auto;
        text-align: left;
      }

      .hrn__benefit-bar {
        flex-shrink: 0;
        width: 3px;
        min-height: 100%;
        align-self: stretch;
        border-radius: var(--nxt1-borderRadius-full);
        background: linear-gradient(
          to bottom,
          var(--nxt1-color-primary),
          var(--nxt1-color-alpha-primary20)
        );
      }

      .hrn__benefit-copy {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .hrn__benefit-accent {
        font-style: normal;
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
      }

      /* ============================================
         RESPONSIVE — Tablet (2-col grid)
         ============================================ */

      @media (min-width: 768px) {
        .player {
          max-width: 320px;
        }

        .hrn__destinations {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--nxt1-spacing-4);
        }

        .dest__label {
          font-size: var(--nxt1-fontSize-lg);
        }

        .hrn__benefit {
          text-align: center;
          justify-content: center;
        }
      }

      /* ============================================
         RESPONSIVE — Desktop
         ============================================ */

      @media (min-width: 1024px) {
        .player {
          max-width: 360px;
        }

        .player__play {
          width: var(--nxt1-spacing-14, 3.5rem);
          height: var(--nxt1-spacing-14, 3.5rem);
        }

        .player__play-icon {
          width: var(--nxt1-spacing-6);
          height: var(--nxt1-spacing-6);
        }

        .hrn__destinations {
          gap: var(--nxt1-spacing-5);
        }

        .dest__card {
          padding: var(--nxt1-spacing-5) var(--nxt1-spacing-6);
          gap: var(--nxt1-spacing-3);
        }

        .dest__icon-box {
          width: var(--nxt1-spacing-12);
          height: var(--nxt1-spacing-12);
          border-radius: var(--nxt1-borderRadius-xl);
        }

        .dest__icon {
          width: var(--nxt1-spacing-6);
          height: var(--nxt1-spacing-6);
        }

        .dest__label {
          font-size: var(--nxt1-fontSize-xl);
        }
      }

      /* ============================================
         ACCESSIBILITY — Reduced motion
         ============================================ */

      @media (prefers-reduced-motion: reduce) {
        .player__play {
          animation: none;
          box-shadow: 0 0 12px 2px var(--nxt1-color-alpha-primary15);
        }

        .dest__card {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtHighlightReelNetworkSectionComponent {
  private readonly instanceId = ++highlightReelNetworkInstanceCounter;

  readonly headingLevel = input<SectionHeaderLevel>(2);

  protected readonly destinations = DISTRIBUTION_DESTINATIONS;

  readonly titleId = computed(() => `highlight-reel-network-title-${this.instanceId}`);
  readonly mapTitleId = computed(() => `highlight-reel-network-map-title-${this.instanceId}`);
  readonly benefitId = computed(() => `highlight-reel-network-benefit-${this.instanceId}`);
}
