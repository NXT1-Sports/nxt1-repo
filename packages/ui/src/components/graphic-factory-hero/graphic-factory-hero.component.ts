import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NxtSectionHeaderComponent, type SectionHeaderLevel } from '../section-header';

interface GraphicTemplateCard {
  readonly id: 'gameday' | 'stats' | 'awards' | 'commitment';
  readonly title: string;
  readonly format: string;
  readonly outcome: string;
}

const GRAPHIC_TEMPLATE_CARDS: readonly GraphicTemplateCard[] = [
  {
    id: 'gameday',
    title: 'Gameday',
    format: 'Matchup Poster',
    outcome: 'Game-ready visual for social + stories',
  },
  {
    id: 'stats',
    title: 'Stats',
    format: 'Performance Snapshot',
    outcome: 'Clean stat breakdown built for coaches',
  },
  {
    id: 'awards',
    title: 'Awards',
    format: 'Recognition Highlight',
    outcome: 'Professional recognition graphics in minutes',
  },
  {
    id: 'commitment',
    title: 'Commitment',
    format: 'Commit Graphic',
    outcome: 'Signature commitment announcement design',
  },
] as const;

@Component({
  selector: 'nxt1-graphic-factory-hero',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="graphic-factory" [attr.aria-labelledby]="titleId()">
      <!-- Centered header block -->
      <div class="graphic-factory__header">
        <nxt1-section-header
          variant="hero"
          align="center"
          [titleId]="titleId()"
          [headingLevel]="headingLevel()"
          eyebrow="The Graphic Factory"
          title="D1 Graphics. Zero Experience."
          subtitle="A carousel of elite templates built for recruiting momentum."
          support="Gameday, Stats, Awards, and Commitment graphics — all production-ready out of the box."
        />

        <p class="graphic-factory__value" role="note">
          Look like you have a full-time design team on payroll.
        </p>
      </div>

      <!-- Full-width card grid below -->
      <div
        class="graphic-factory__carousel"
        role="list"
        aria-label="Graphic template carousel showing Gameday, Stats, Awards, and Commitment templates"
      >
        @for (card of templateCards; track card.id) {
          <article class="graphic-card" role="listitem">
            <!-- 1080×1080 image placeholder -->
            <div
              class="graphic-card__preview"
              [attr.aria-label]="card.format + ' template preview'"
            >
              <img
                class="graphic-card__img"
                [src]="placeholderSrc"
                [alt]="card.format + ' — ' + card.outcome"
                width="1080"
                height="1080"
                loading="lazy"
              />
            </div>

            <!-- Card info -->
            <div class="graphic-card__info">
              <p class="graphic-card__chip">{{ card.title }}</p>
              <h3 class="graphic-card__title">{{ card.format }}</h3>
              <p class="graphic-card__outcome">{{ card.outcome }}</p>
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

      .graphic-factory {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-10);
        max-width: var(--nxt1-section-max-width);
        margin-inline: auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      /* ── Centered header ──────────────────────────────────── */

      .graphic-factory__header {
        display: grid;
        gap: var(--nxt1-spacing-5);
        justify-items: center;
        text-align: center;
        max-width: var(--nxt1-section-max-width-narrow);
        margin-inline: auto;
      }

      .graphic-factory__value {
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

      .graphic-factory__carousel {
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

      .graphic-factory__carousel::-webkit-scrollbar {
        height: var(--nxt1-scrollbar-width);
      }

      .graphic-factory__carousel::-webkit-scrollbar-track {
        background: transparent;
      }

      .graphic-factory__carousel::-webkit-scrollbar-thumb {
        background: var(--nxt1-color-surface-300);
        border-radius: var(--nxt1-borderRadius-full);
      }

      /* ── Card ─────────────────────────────────────────────── */

      .graphic-card {
        scroll-snap-align: start;
        display: flex;
        flex-direction: column;
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-default);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 94%, transparent);
        box-shadow: var(--nxt1-shadow-sm);
        overflow: hidden;
        transition:
          border-color 0.2s ease,
          box-shadow 0.2s ease;
      }

      .graphic-card:hover {
        border-color: color-mix(in srgb, var(--nxt1-color-primary) 40%, transparent);
        box-shadow: var(--nxt1-shadow-md);
      }

      /* ── Preview (1:1 aspect ratio = 1080×1080) ──────────── */

      .graphic-card__preview {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 1;
        overflow: hidden;
        background: var(--nxt1-color-surface-200);
        border-bottom: 1px solid var(--nxt1-color-border-default);
      }

      .graphic-card__img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      /* ── Card Info ────────────────────────────────────────── */

      .graphic-card__info {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-4);
      }

      .graphic-card__chip {
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

      .graphic-card__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .graphic-card__outcome {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ── Responsive: Tablet ───────────────────────────────── */

      @media (min-width: 640px) {
        .graphic-factory__carousel {
          grid-auto-columns: 44vw;
        }
      }

      /* ── Responsive: Desktop ──────────────────────────────── */

      @media (min-width: 1024px) {
        .graphic-factory__carousel {
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
        .graphic-card {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtGraphicFactoryHeroComponent {
  readonly headingLevel = input<SectionHeaderLevel>(1);
  readonly titleId = input<string>('graphic-factory-title');

  protected readonly templateCards = GRAPHIC_TEMPLATE_CARDS;

  /** Transparent 1×1 data-URI — SSR-safe, no network request, preserves aspect-ratio via CSS. */
  protected readonly placeholderSrc =
    'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221080%22 height=%221080%22%3E%3C/svg%3E';
}
