import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NxtSectionHeaderComponent, type SectionHeaderLevel } from '../section-header';

interface HighlightTemplateCard {
  readonly id: 'hype-reel' | 'top-plays' | 'skills-breakdown' | 'game-recap';
  readonly title: string;
  readonly format: string;
  readonly outcome: string;
}

const HIGHLIGHT_TEMPLATE_CARDS: readonly HighlightTemplateCard[] = [
  {
    id: 'hype-reel',
    title: 'Hype Reel',
    format: 'Highlight Montage',
    outcome: 'A cinematic first impression for every coach inbox',
  },
  {
    id: 'top-plays',
    title: 'Top Plays',
    format: 'Best-Of Compilation',
    outcome: 'Your hardest plays stacked and ready to send',
  },
  {
    id: 'skills-breakdown',
    title: 'Skills',
    format: 'Position Breakdown',
    outcome: 'Drill-level proof coaches actually want to see',
  },
  {
    id: 'game-recap',
    title: 'Game Recap',
    format: 'Post-Game Edit',
    outcome: 'Turn Friday night into Saturday morning content',
  },
] as const;

@Component({
  selector: 'nxt1-video-highlights-hero',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="video-highlights" [attr.aria-labelledby]="titleId()">
      <!-- Centered header block -->
      <div class="video-highlights__header">
        <nxt1-section-header
          variant="hero"
          align="center"
          [titleId]="titleId()"
          [headingLevel]="headingLevel()"
          eyebrow="The Highlight Lab"
          title="Varsity Highlights. Zero Film Crew."
          subtitle="A carousel of pro-grade highlight formats built for recruiting tape."
          support="Hype Reels, Top Plays, Skills Breakdowns, and Game Recaps — all camera-ready out of the box."
        />

        <p class="video-highlights__value" role="note">
          Look like you have a full-time film team running your highlights.
        </p>
      </div>

      <!-- Full-width card grid below -->
      <div
        class="video-highlights__carousel"
        role="list"
        aria-label="Highlight template carousel showing Hype Reel, Top Plays, Skills Breakdown, and Game Recap formats"
      >
        @for (card of templateCards; track card.id) {
          <article class="highlight-card" role="listitem">
            <!-- 1080×1080 image placeholder -->
            <div
              class="highlight-card__preview"
              [attr.aria-label]="card.format + ' template preview'"
            >
              <img
                class="highlight-card__img"
                [src]="placeholderSrc"
                [alt]="card.format + ' — ' + card.outcome"
                width="1080"
                height="1080"
                loading="lazy"
              />
              <!-- Play overlay -->
              <div class="highlight-card__play-overlay" aria-hidden="true">
                <svg class="highlight-card__play-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>

            <!-- Card info -->
            <div class="highlight-card__info">
              <p class="highlight-card__chip">{{ card.title }}</p>
              <h3 class="highlight-card__title">{{ card.format }}</h3>
              <p class="highlight-card__outcome">{{ card.outcome }}</p>
            </div>
          </article>
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* ── Section wrapper — single column, stacked ─────────── */

      .video-highlights {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-10);
        max-width: var(--nxt1-section-max-width);
        margin-inline: auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      /* ── Centered header ──────────────────────────────────── */

      .video-highlights__header {
        display: grid;
        gap: var(--nxt1-spacing-5);
        justify-items: center;
        text-align: center;
        max-width: var(--nxt1-section-max-width-narrow);
        margin-inline: auto;
      }

      .video-highlights__value {
        margin: 0;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-full);
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: clamp(var(--nxt1-fontSize-base), 2.5vw, var(--nxt1-fontSize-xl));
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 60%, transparent);
        border: 1px solid var(--nxt1-color-border-default);
      }

      /* ── Carousel ─────────────────────────────────────────── */

      .video-highlights__carousel {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: 72vw;
        gap: var(--nxt1-spacing-4);
        overflow-x: auto;
        overscroll-behavior-x: contain;
        padding-bottom: var(--nxt1-spacing-3);
        scroll-snap-type: x mandatory;
        scroll-padding-inline: var(--nxt1-section-padding-x);
        -webkit-overflow-scrolling: touch;
      }

      .video-highlights__carousel::-webkit-scrollbar {
        height: var(--nxt1-scrollbar-width);
      }

      .video-highlights__carousel::-webkit-scrollbar-track {
        background: transparent;
      }

      .video-highlights__carousel::-webkit-scrollbar-thumb {
        background: var(--nxt1-color-surface-300);
        border-radius: var(--nxt1-borderRadius-full);
      }

      /* ── Card ─────────────────────────────────────────────── */

      .highlight-card {
        scroll-snap-align: start;
        display: flex;
        flex-direction: column;
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-default);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 94%, transparent);
        box-shadow: var(--nxt1-shadow-sm);
        overflow: hidden;
        transition:
          border-color var(--nxt1-motion-duration-fast, 150ms)
            var(--nxt1-motion-easing-standard, ease),
          box-shadow var(--nxt1-motion-duration-fast, 150ms)
            var(--nxt1-motion-easing-standard, ease);
      }

      .highlight-card:hover {
        border-color: color-mix(in srgb, var(--nxt1-color-primary) 40%, transparent);
        box-shadow: var(--nxt1-shadow-md);
      }

      /* ── Preview (1:1 aspect ratio = 1080×1080) ──────────── */

      .highlight-card__preview {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 1;
        overflow: hidden;
        background: var(--nxt1-color-surface-200);
        border-bottom: 1px solid var(--nxt1-color-border-default);
      }

      .highlight-card__img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      /* ── Play overlay ─────────────────────────────────────── */

      .highlight-card__play-overlay {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 30%, transparent);
        opacity: 0;
        transition: opacity var(--nxt1-motion-duration-fast, 150ms)
          var(--nxt1-motion-easing-standard, ease);
      }

      .highlight-card:hover .highlight-card__play-overlay {
        opacity: 1;
      }

      .highlight-card__play-icon {
        width: var(--nxt1-spacing-12, 48px);
        height: var(--nxt1-spacing-12, 48px);
        color: var(--nxt1-color-text-on-primary);
        filter: drop-shadow(
          0 var(--nxt1-spacing-0-5, 2px) var(--nxt1-spacing-2, 8px)
            color-mix(in srgb, var(--nxt1-color-surface-100) 40%, transparent)
        );
      }

      /* ── Card Info ────────────────────────────────────────── */

      .highlight-card__info {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-4);
      }

      .highlight-card__chip {
        width: fit-content;
        margin: 0;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-primary) 30%, transparent);
        color: var(--nxt1-color-primary);
        background: color-mix(in srgb, var(--nxt1-color-primary) 10%, transparent);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .highlight-card__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .highlight-card__outcome {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ── Responsive: Tablet ───────────────────────────────── */

      @media (min-width: 640px) {
        .video-highlights__carousel {
          grid-auto-columns: 44vw;
        }
      }

      /* ── Responsive: Desktop ──────────────────────────────── */

      @media (min-width: 1024px) {
        .video-highlights__carousel {
          grid-auto-flow: row;
          grid-auto-columns: unset;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          overflow-x: visible;
          padding-bottom: 0;
          scroll-snap-type: none;
        }
      }

      /* ── Reduced motion ───────────────────────────────────── */

      @media (prefers-reduced-motion: reduce) {
        .highlight-card,
        .highlight-card__play-overlay {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtVideoHighlightsHeroComponent {
  readonly headingLevel = input<SectionHeaderLevel>(1);
  readonly titleId = input<string>('video-highlights-title');

  protected readonly templateCards = HIGHLIGHT_TEMPLATE_CARDS;

  /** Transparent 1×1 data-URI — SSR-safe, no network request, preserves aspect-ratio via CSS. */
  protected readonly placeholderSrc =
    'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221080%22 height=%221080%22%3E%3C/svg%3E';
}
