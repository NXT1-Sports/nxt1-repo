/**
 * @fileoverview The Rankings Engine (Authority) Section
 * @module @nxt1/ui/components/rankings-engine-section
 * @version 1.0.0
 *
 * "Billboard Hot 100" style leaderboard section that visualizes NXT1's
 * ranking algorithm for athlete recruiting visibility.
 *
 * 2026 standards:
 * - SSR-safe (no DOM/browser APIs)
 * - 100% design-token driven colors, typography, spacing
 * - Semantic HTML for accessibility and SEO
 * - Mobile-first responsive layout
 * - OnPush change detection
 *
 * @example
 * ```html
 * <nxt1-rankings-engine-section />
 * <nxt1-rankings-engine-section [headingLevel]="3" />
 * ```
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtIconComponent } from '../icon';
import { NxtSectionHeaderComponent, type SectionHeaderLevel } from '../section-header';

// ============================================
// TYPES
// ============================================

interface RankingEntry {
  readonly id: string;
  readonly rank: number;
  readonly name: string;
  readonly position: string;
  readonly state: string;
  readonly gradClass: number;
  readonly score: number;
  readonly delta: number;
  readonly isHighlighted: boolean;
}

interface RankingFactor {
  readonly id: string;
  readonly icon: string;
  readonly label: string;
  readonly weight: string;
}

// ============================================
// STATIC DATA
// ============================================

const RANKING_ENTRIES: readonly RankingEntry[] = [
  {
    id: 'rank-1',
    rank: 1,
    name: 'Jordan Thomas',
    position: 'QB',
    state: 'Texas',
    gradClass: 2027,
    score: 98.7,
    delta: 4,
    isHighlighted: true,
  },
  {
    id: 'rank-2',
    rank: 2,
    name: 'Marcus Williams',
    position: 'WR',
    state: 'Florida',
    gradClass: 2027,
    score: 97.2,
    delta: 1,
    isHighlighted: false,
  },
  {
    id: 'rank-3',
    rank: 3,
    name: 'DeShawn Carter',
    position: 'RB',
    state: 'Georgia',
    gradClass: 2028,
    score: 96.8,
    delta: 7,
    isHighlighted: false,
  },
  {
    id: 'rank-4',
    rank: 4,
    name: 'Avery Jackson',
    position: 'CB',
    state: 'California',
    gradClass: 2027,
    score: 95.4,
    delta: 2,
    isHighlighted: false,
  },
  {
    id: 'rank-5',
    rank: 5,
    name: 'Elijah Brooks',
    position: 'SG',
    state: 'California',
    gradClass: 2028,
    score: 94.9,
    delta: 12,
    isHighlighted: true,
  },
  {
    id: 'rank-6',
    rank: 6,
    name: 'Noah Rivera',
    position: 'ATH',
    state: 'Ohio',
    gradClass: 2027,
    score: 94.1,
    delta: 3,
    isHighlighted: false,
  },
] as const;

const RANKING_FACTORS: readonly RankingFactor[] = [
  {
    id: 'factor-stats',
    icon: 'stats-chart-outline',
    label: 'Verified Stats',
    weight: '35%',
  },
  {
    id: 'factor-film',
    icon: 'videocam-outline',
    label: 'Film Quality',
    weight: '30%',
  },
  {
    id: 'factor-engagement',
    icon: 'trending-up-outline',
    label: 'Engagement',
    weight: '20%',
  },
  {
    id: 'factor-consistency',
    icon: 'flash-outline',
    label: 'Consistency',
    weight: '15%',
  },
] as const;

let rankingsEngineInstanceCounter = 0;

@Component({
  selector: 'nxt1-rankings-engine-section',
  standalone: true,
  imports: [NxtIconComponent, NxtSectionHeaderComponent],
  template: `
    <section class="rankings-engine" [attr.aria-labelledby]="titleId()">
      <div class="rankings-engine__shell">
        <nxt1-section-header
          eyebrow="The Rankings Engine"
          eyebrowIcon="podium-outline"
          title="Climb the Charts."
          subtitle="Our ranking algorithm uses verified stats, film quality, and engagement. Climb the list, get noticed."
          [headingLevel]="headingLevel()"
          [titleId]="titleId()"
          layout="split"
        >
          <!-- Leaderboard visual -->
          <div class="rankings-visual">
            <!-- Algorithm factors card -->
            <article class="factors-card" aria-label="How the ranking algorithm works">
              <header class="factors-card__header">
                <p class="factors-card__eyebrow">Algorithm Weights</p>
              </header>

              <div class="factors-grid" role="list" aria-label="Ranking factors">
                @for (factor of rankingFactors; track factor.id) {
                  <div class="factor-item" role="listitem">
                    <span class="factor-item__icon" aria-hidden="true">
                      <nxt1-icon [name]="factor.icon" size="14" />
                    </span>
                    <span class="factor-item__label">{{ factor.label }}</span>
                    <span class="factor-item__weight">{{ factor.weight }}</span>
                  </div>
                }
              </div>
            </article>

            <!-- Leaderboard card -->
            <article class="chart-card" aria-label="NXT1 top ranked athletes leaderboard">
              <header class="chart-card__header">
                <div class="chart-card__title-wrap">
                  <p class="chart-card__eyebrow">NXT1 Top Ranked</p>
                  <h3 class="chart-card__title">Hot Chart · This Week</h3>
                </div>

                <div class="chart-card__badge">
                  <nxt1-icon name="flame-outline" size="14" />
                  <span>Live</span>
                </div>
              </header>

              <!-- Desktop column headers -->
              <div class="chart-head" aria-hidden="true">
                <span class="chart-head__rank">#</span>
                <span class="chart-head__name">Athlete</span>
                <span class="chart-head__meta">Class</span>
                <span class="chart-head__score">Score</span>
                <span class="chart-head__delta">Move</span>
              </div>

              <ol class="chart-list" aria-label="Top athletes ranked by NXT1 algorithm">
                @for (entry of rankings; track entry.id) {
                  <li
                    class="chart-entry"
                    [class.chart-entry--highlighted]="entry.isHighlighted"
                    [class.chart-entry--gold]="entry.rank === 1"
                  >
                    <span class="chart-entry__rank" [attr.aria-label]="'Rank ' + entry.rank">
                      {{ entry.rank }}
                    </span>

                    <span class="chart-entry__info">
                      <span class="chart-entry__name">{{ entry.name }}</span>
                      <span class="chart-entry__detail">
                        {{ entry.position }} · {{ entry.state }}
                      </span>
                    </span>

                    <span class="chart-entry__class">
                      '{{ entry.gradClass.toString().slice(-2) }}
                    </span>

                    <span class="chart-entry__score">
                      {{ entry.score.toFixed(1) }}
                    </span>

                    <span class="chart-entry__delta">
                      <nxt1-icon name="arrow-up-outline" size="12" />
                      {{ entry.delta }}
                    </span>
                  </li>
                }
              </ol>
            </article>
          </div>
        </nxt1-section-header>
      </div>
    </section>
  `,
  styles: [
    `
      /* ============================================
         RANKINGS ENGINE — Host
         ============================================ */

      :host {
        display: block;
      }

      /* ============================================
         SECTION WRAPPER
         ============================================ */

      .rankings-engine {
        width: 100%;
        padding-block: var(--nxt1-spacing-14);
      }

      .rankings-engine__shell {
        width: min(100%, var(--nxt1-section-max-width));
        margin-inline: auto;
        padding-inline: var(--nxt1-section-padding-x);
      }

      /* ============================================
         VISUAL STACK (factors card + chart card)
         ============================================ */

      .rankings-visual {
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      /* ============================================
         ALGORITHM FACTORS CARD
         ============================================ */

      .factors-card {
        display: grid;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
      }

      .factors-card__header {
        display: flex;
        align-items: center;
      }

      .factors-card__eyebrow {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .factors-grid {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .factor-item {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
      }

      .factor-item__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-primary);
      }

      .factor-item__label {
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .factor-item__weight {
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      /* ============================================
         LEADERBOARD CHART CARD
         ============================================ */

      .chart-card {
        display: grid;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-alpha-primary15);
        background: var(--nxt1-color-surface-100);
        box-shadow:
          var(--nxt1-shadow-md),
          0 0 0 1px var(--nxt1-color-alpha-primary10);
      }

      .chart-card__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
      }

      .chart-card__title-wrap {
        display: grid;
        gap: var(--nxt1-spacing-1);
      }

      .chart-card__eyebrow {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .chart-card__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .chart-card__badge {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary10);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      /* ============================================
         CHART COLUMN HEADERS (desktop)
         ============================================ */

      .chart-head {
        display: grid;
        grid-template-columns: 2.5rem 1fr 3.5rem 3.5rem 3.5rem;
        gap: var(--nxt1-spacing-2);
        padding: 0 var(--nxt1-spacing-3);
        align-items: center;
      }

      .chart-head span {
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .chart-head__score,
      .chart-head__delta {
        text-align: right;
      }

      /* ============================================
         CHART LIST
         ============================================ */

      .chart-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      /* ============================================
         CHART ENTRY ROW
         ============================================ */

      .chart-entry {
        display: grid;
        grid-template-columns: 2.5rem 1fr 3.5rem 3.5rem 3.5rem;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        transition: border-color var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .chart-entry--highlighted {
        border-color: var(--nxt1-color-alpha-primary30);
        background: linear-gradient(
          90deg,
          var(--nxt1-color-alpha-primary10),
          var(--nxt1-color-surface-200)
        );
      }

      .chart-entry--gold .chart-entry__rank {
        color: var(--nxt1-color-secondary);
        text-shadow: 0 0 8px var(--nxt1-color-alpha-primary20);
      }

      /* ── Rank ── */

      .chart-entry__rank {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        text-align: center;
        line-height: var(--nxt1-lineHeight-none);
      }

      /* ── Info (name + detail) ── */

      .chart-entry__info {
        display: grid;
        gap: var(--nxt1-spacing-0_5);
        min-width: 0;
      }

      .chart-entry__name {
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .chart-entry__detail {
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-tight);
      }

      /* ── Class year ── */

      .chart-entry__class {
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        text-align: center;
      }

      /* ── Score ── */

      .chart-entry__score {
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        text-align: right;
      }

      /* ── Delta (movement arrows) ── */

      .chart-entry__delta {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: var(--nxt1-spacing-0_5);
        color: var(--nxt1-color-success);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      /* ============================================
         RESPONSIVE — TABLET
         ============================================ */

      @media (max-width: 991px) {
        .rankings-engine {
          padding-block: var(--nxt1-spacing-10);
        }

        .rankings-engine__shell {
          padding-inline: var(--nxt1-spacing-4);
        }

        .chart-card {
          padding: var(--nxt1-spacing-4);
        }

        .chart-head {
          padding: 0 var(--nxt1-spacing-2);
        }
      }

      /* ============================================
         RESPONSIVE — MOBILE
         ============================================ */

      @media (max-width: 767px) {
        .chart-head {
          display: none;
        }

        .chart-entry {
          grid-template-columns: 2rem 1fr auto;
          grid-template-areas:
            'rank info delta'
            'rank info score';
          row-gap: var(--nxt1-spacing-0_5);
          column-gap: var(--nxt1-spacing-2);
          padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-3);
        }

        .chart-entry__rank {
          grid-area: rank;
          font-size: var(--nxt1-fontSize-base);
        }

        .chart-entry__info {
          grid-area: info;
        }

        .chart-entry__class {
          display: none;
        }

        .chart-entry__detail::after {
          content: none;
        }

        .chart-entry__score {
          grid-area: score;
          font-size: var(--nxt1-fontSize-xs);
          color: var(--nxt1-color-text-secondary);
        }

        .chart-entry__delta {
          grid-area: delta;
          justify-self: end;
        }
      }

      /* ============================================
         ACCESSIBILITY — Reduced Motion
         ============================================ */

      @media (prefers-reduced-motion: reduce) {
        .chart-entry {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtRankingsEngineSectionComponent {
  private readonly instanceId = ++rankingsEngineInstanceCounter;

  /** Heading level for the section title (for proper document outline). */
  readonly headingLevel = input<SectionHeaderLevel>(2);

  /** Unique ID for the section title element (ARIA). */
  readonly titleId = computed(() => `rankings-engine-title-${this.instanceId}`);

  protected readonly rankings = RANKING_ENTRIES;
  protected readonly rankingFactors = RANKING_FACTORS;
}
