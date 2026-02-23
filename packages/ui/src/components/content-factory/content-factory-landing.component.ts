import { ChangeDetectionStrategy, Component } from '@angular/core';

interface ContentAssetCard {
  readonly id: string;
  readonly title: string;
}

/** Row 1 — scrolls left */
const ROW_A: readonly ContentAssetCard[] = [
  { id: 'game-day', title: 'Game Day' },
  { id: 'mvp', title: 'MVP Spotlight' },
  { id: 'commit', title: 'Commit Graphic' },
  { id: 'stat-leaders', title: 'Stat Leaders' },
  { id: 'rivalry', title: 'Rivalry Matchup' },
  { id: 'potw', title: 'Player of the Week' },
  { id: 'season-recap', title: 'Season Recap' },
  { id: 'championship', title: 'Championship' },
] as const;

/** Row 2 — scrolls right (reverse) */
const ROW_B: readonly ContentAssetCard[] = [
  { id: 'signing-day', title: 'Signing Day' },
  { id: 'senior-night', title: 'Senior Night' },
  { id: 'schedule-drop', title: 'Schedule Drop' },
  { id: 'record-breaker', title: 'Record Breaker' },
  { id: 'team-intro', title: 'Team Intro' },
  { id: 'hype-reel', title: 'Hype Reel' },
  { id: 'award-winner', title: 'Award Winner' },
  { id: 'camp-invite', title: 'Camp Invite' },
] as const;

@Component({
  selector: 'nxt1-content-factory-landing',
  standalone: true,
  template: `
    <section class="cf" aria-labelledby="content-factory-title">
      <!-- Center-aligned section header -->
      <header class="cf__header">
        <p class="cf__eyebrow">
          The <span class="cf__eyebrow-accent">Content Factory</span>
          (Brand Building)
        </p>
        <h2 id="content-factory-title" class="cf__title">A D1 Creative Team in a Box.</h2>
        <p class="cf__subtitle">
          Turn raw game footage into elite, branded content for every player and the program itself.
        </p>
      </header>

      <!-- Marquee ticker -->
      <div class="marquee" aria-label="Auto-generated branded content examples scrolling showcase">
        <!-- Row 1 — scrolls left -->
        <div class="marquee__row">
          <div class="marquee__track marquee__track--left">
            @for (asset of rowA; track asset.id) {
              <div class="tile" [attr.aria-label]="asset.title">
                <span class="tile__badge">Generated</span>
                <div class="tile__canvas">
                  <div class="tile__glow"></div>
                  <span class="tile__pill">{{ asset.title }}</span>
                </div>
              </div>
            }
            <!-- Duplicate set for seamless infinite loop -->
            @for (asset of rowA; track asset.id + '-dup') {
              <div class="tile" aria-hidden="true">
                <span class="tile__badge">Generated</span>
                <div class="tile__canvas">
                  <div class="tile__glow"></div>
                  <span class="tile__pill">{{ asset.title }}</span>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Row 2 — scrolls right -->
        <div class="marquee__row">
          <div class="marquee__track marquee__track--right">
            @for (asset of rowB; track asset.id) {
              <div class="tile" [attr.aria-label]="asset.title">
                <span class="tile__badge">Generated</span>
                <div class="tile__canvas">
                  <div class="tile__glow"></div>
                  <span class="tile__pill">{{ asset.title }}</span>
                </div>
              </div>
            }
            <!-- Duplicate set for seamless infinite loop -->
            @for (asset of rowB; track asset.id + '-dup') {
              <div class="tile" aria-hidden="true">
                <span class="tile__badge">Generated</span>
                <div class="tile__canvas">
                  <div class="tile__glow"></div>
                  <span class="tile__pill">{{ asset.title }}</span>
                </div>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Closing statement -->
      <p class="cf__quote">
        No designers needed. Agent X generates pro-grade assets for every win, every offer, and
        every milestone.
      </p>
    </section>
  `,
  styles: [
    `
      /* ─────────────────────────────────────────
         Component-scoped layout tokens
         (structural values with no global token)
         ───────────────────────────────────────── */
      :host {
        --_header-max-w: 38rem;
        --_subtitle-max-w: 30rem;
        --_tile-size: var(--nxt1-spacing-40);
        --_marquee-speed: 40s;

        display: block;
      }

      /* ── Section shell ── */
      .cf {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-8);
      }

      /* ── Center-aligned header ── */
      .cf__header {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: var(--nxt1-spacing-3);
        max-width: var(--_header-max-w);
        margin: 0 auto;
      }

      .cf__eyebrow {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .cf__eyebrow-accent {
        color: var(--nxt1-color-primary);
      }

      .cf__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: clamp(var(--nxt1-fontSize-3xl), 5vw, var(--nxt1-fontSize-5xl));
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
        letter-spacing: var(--nxt1-letterSpacing-tight);
      }

      .cf__subtitle {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
        max-width: var(--_subtitle-max-w);
      }

      /* ── Marquee container ── */
      .marquee {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        overflow: hidden;
        -webkit-mask-image: linear-gradient(
          to right,
          transparent 0%,
          black 6%,
          black 94%,
          transparent 100%
        );
        mask-image: linear-gradient(
          to right,
          transparent 0%,
          black 6%,
          black 94%,
          transparent 100%
        );
      }

      .marquee__row {
        overflow: hidden;
        width: 100%;
      }

      .marquee__track {
        display: flex;
        gap: var(--nxt1-spacing-3);
        width: max-content;
        will-change: transform;
      }

      .marquee__track--left {
        animation: marquee-left var(--_marquee-speed) linear infinite;
      }

      .marquee__track--right {
        animation: marquee-right var(--_marquee-speed) linear infinite;
      }

      @keyframes marquee-left {
        0% {
          transform: translateX(0);
        }
        100% {
          transform: translateX(-50%);
        }
      }

      @keyframes marquee-right {
        0% {
          transform: translateX(-50%);
        }
        100% {
          transform: translateX(0);
        }
      }

      /* Pause on hover for accessibility */
      .marquee:hover .marquee__track {
        animation-play-state: paused;
      }

      /* Respect reduced motion preference */
      @media (prefers-reduced-motion: reduce) {
        .marquee__track--left,
        .marquee__track--right {
          animation: none;
        }
      }

      /* ── Compact square tile ── */
      .tile {
        flex-shrink: 0;
        width: var(--_tile-size);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-lg);
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
      }

      .tile__badge {
        align-self: flex-start;
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-1_5);
        border-radius: var(--nxt1-borderRadius-sm);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        line-height: var(--nxt1-lineHeight-tight);
      }

      .tile__canvas {
        position: relative;
        overflow: hidden;
        aspect-ratio: 1;
        border-radius: var(--nxt1-borderRadius-md);
        background: linear-gradient(
          145deg,
          var(--nxt1-color-surface-200),
          var(--nxt1-color-surface-300, var(--nxt1-color-surface-200))
        );
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .tile__glow {
        position: absolute;
        inset: 0;
        background: radial-gradient(
          ellipse 65% 65% at 50% 55%,
          var(--nxt1-color-alpha-primary20),
          transparent 70%
        );
        pointer-events: none;
      }

      .tile__pill {
        position: relative;
        z-index: 1;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-surface-100);
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-none);
        white-space: nowrap;
      }

      /* ── Footer quote ── */
      .cf__quote {
        margin: 0;
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-lg);
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-alpha-primary10);
        background: var(--nxt1-color-alpha-primary4, transparent);
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-relaxed);
        text-align: center;
        max-width: var(--_header-max-w);
        align-self: center;
        width: 100%;
      }

      /* ── Responsive: tablet+ (640px) ── */
      @media (min-width: 640px) {
        :host {
          --_tile-size: var(--nxt1-spacing-44);
        }

        .tile__pill {
          font-size: var(--nxt1-fontSize-xs);
          padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
        }
      }

      /* ── Responsive: desktop (1024px) ── */
      @media (min-width: 1024px) {
        :host {
          --_tile-size: var(--nxt1-spacing-48);
        }

        .cf {
          gap: var(--nxt1-spacing-10);
        }

        .marquee {
          gap: var(--nxt1-spacing-4);
        }

        .cf__quote {
          font-size: var(--nxt1-fontSize-base);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtContentFactoryLandingComponent {
  protected readonly rowA = ROW_A;
  protected readonly rowB = ROW_B;
}
