/**
 * @fileoverview Opportunity Radar Section — AI College Match Discovery
 * @module apps/web/features/marketing/components/opportunity-radar-section
 * @version 2.0.0
 *
 * Shared AI recruiting section that surfaces high-fit college programs
 * athletes would miss through manual search alone. Displays a ranked
 * grid of matched schools with college logos, match percentages, and
 * division/state metadata.
 *
 * Standards:
 * - 100% design-token driven styles (zero hardcoded values)
 * - SSR-safe deterministic IDs — no browser APIs
 * - Semantic HTML for SEO (section > header > ul > li)
 * - Accessible: ARIA landmarks, role="list", alt text on logos
 * - Mobile-first responsive grid for web and mobile surfaces
 * - College logos follow Coach Rolodex pattern (ESPN CDN)
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent } from '@nxt1/ui/components/section-header';

// ============================================
// PUBLIC TYPES
// ============================================

export interface OpportunityRadarSchoolMatch {
  /** Stable unique identifier for list tracking. */
  readonly id: string;
  /** Display name of the college program. */
  readonly schoolName: string;
  /** US state abbreviation (e.g. "OH", "TX"). */
  readonly stateCode: string;
  /** AI match fit percentage (0–100). */
  readonly matchPercent: number;
  /** NCAA division label (e.g. "D2", "D3", "NAIA"). */
  readonly division: string;
  /** ESPN CDN logo URL for the college. */
  readonly logoUrl: string;
}

// ============================================
// DEFAULT DATA — 12 D2 school matches
// ============================================

const DEFAULT_OPPORTUNITY_RADAR_MATCHES: readonly OpportunityRadarSchoolMatch[] = [
  {
    id: 'opp-truman-state',
    schoolName: 'Truman State',
    stateCode: 'MO',
    matchPercent: 96,
    division: 'D2',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2547.png',
  },
  {
    id: 'opp-west-liberty',
    schoolName: 'West Liberty',
    stateCode: 'WV',
    matchPercent: 95,
    division: 'D2',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/8588.png',
  },
  {
    id: 'opp-bellarmine',
    schoolName: 'Bellarmine',
    stateCode: 'KY',
    matchPercent: 95,
    division: 'D2',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/91.png',
  },
  {
    id: 'opp-ashland',
    schoolName: 'Ashland',
    stateCode: 'OH',
    matchPercent: 94,
    division: 'D2',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2046.png',
  },
  {
    id: 'opp-augusta',
    schoolName: 'Augusta',
    stateCode: 'GA',
    matchPercent: 94,
    division: 'D2',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2032.png',
  },
  {
    id: 'opp-tampa',
    schoolName: 'Tampa',
    stateCode: 'FL',
    matchPercent: 94,
    division: 'D2',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2513.png',
  },
  {
    id: 'opp-st-edwards',
    schoolName: "St. Edward's",
    stateCode: 'TX',
    matchPercent: 93,
    division: 'D2',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2560.png',
  },
  {
    id: 'opp-colorado-mesa',
    schoolName: 'Colorado Mesa',
    stateCode: 'CO',
    matchPercent: 93,
    division: 'D2',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2728.png',
  },
  {
    id: 'opp-catawba',
    schoolName: 'Catawba',
    stateCode: 'NC',
    matchPercent: 93,
    division: 'D2',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2123.png',
  },
  {
    id: 'opp-dominican-ca',
    schoolName: 'Dominican (CA)',
    stateCode: 'CA',
    matchPercent: 92,
    division: 'D2',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2176.png',
  },
  {
    id: 'opp-seattle-pacific',
    schoolName: 'Seattle Pacific',
    stateCode: 'WA',
    matchPercent: 92,
    division: 'D2',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2477.png',
  },
  {
    id: 'opp-sw-minnesota-state',
    schoolName: 'SW Minnesota State',
    stateCode: 'MN',
    matchPercent: 91,
    division: 'D2',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2535.png',
  },
] as const;

// ============================================
// INSTANCE COUNTER — unique SSR-safe IDs
// ============================================

let opportunityRadarInstanceCounter = 0;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-opportunity-radar-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="opportunity-radar" [attr.aria-labelledby]="titleId()">
      <div class="opportunity-radar__inner">
        <!-- Centered section header above content -->
        <div class="opportunity-radar__header">
          <nxt1-section-header
            [titleId]="titleId()"
            eyebrow="The Opportunity Radar"
            [headingLevel]="2"
            variant="hero"
            align="center"
            title="It Finds Schools You Missed."
            subtitle="Based on your GPA and stats, AI surfaces programs in your 90th percentile fit range."
            support="Don't just chase Duke. Let AI find the programs where you can play and get paid."
          />
        </div>

        <!-- Match grid panel -->
        <article class="radar-panel" [attr.aria-labelledby]="panelTitleId()">
          <header class="radar-panel__header">
            <div class="radar-panel__title-row">
              <div class="radar-panel__title-group">
                <p class="radar-panel__eyebrow">AI Match Results</p>
                <h3 class="radar-panel__title" [id]="panelTitleId()">Top Program Matches</h3>
              </div>

              <div class="radar-panel__badge" role="status" aria-live="polite">
                <span class="radar-panel__badge-dot" aria-hidden="true"></span>
                <span>{{ matches().length }} Found</span>
              </div>
            </div>

            <p class="radar-panel__summary">
              {{ matches().length }} programs identified across {{ uniqueDivisions() }} divisions ·
              {{ averageMatchPercent() }}% average fit score.
            </p>
          </header>

          <ul class="radar-grid" role="list" aria-label="AI ranked college matches">
            @for (match of matches(); track match.id) {
              <li class="match-card" role="listitem">
                <div class="match-card__logo-wrap" aria-hidden="true">
                  <img
                    class="match-card__logo"
                    [src]="match.logoUrl"
                    [alt]="match.schoolName + ' logo'"
                    loading="lazy"
                    decoding="async"
                    width="40"
                    height="40"
                  />
                </div>

                <div class="match-card__info">
                  <p class="match-card__name">{{ match.schoolName }}</p>
                  <p class="match-card__meta">{{ match.division }} · {{ match.stateCode }}</p>
                </div>

                <div class="match-card__score">
                  <span class="match-card__percent">{{ match.matchPercent }}%</span>
                  <span class="match-card__label">Match</span>
                </div>
              </li>
            }
          </ul>
        </article>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* ============================================
         SECTION LAYOUT
         ============================================ */

      .opportunity-radar {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        background: transparent;
      }

      .opportunity-radar__inner {
        display: grid;
        gap: var(--nxt1-spacing-10);
      }

      .opportunity-radar__header {
        display: grid;
        justify-items: center;
      }

      /* ============================================
         PANEL
         ============================================ */

      .radar-panel {
        display: grid;
        gap: var(--nxt1-spacing-6);
        padding: var(--nxt1-spacing-6);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-shadow-md);
      }

      .radar-panel__header {
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .radar-panel__title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
        flex-wrap: wrap;
      }

      .radar-panel__title-group {
        display: grid;
        gap: var(--nxt1-spacing-1);
      }

      .radar-panel__eyebrow {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .radar-panel__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .radar-panel__badge {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary6);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        white-space: nowrap;
      }

      .radar-panel__badge-dot {
        width: var(--nxt1-spacing-1_5);
        height: var(--nxt1-spacing-1_5);
        border-radius: var(--nxt1-borderRadius-full);
        background: currentColor;
      }

      .radar-panel__summary {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ============================================
         MATCH GRID
         ============================================ */

      .radar-grid {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-3);
      }

      @media (min-width: 640px) {
        .radar-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (min-width: 1024px) {
        .radar-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      /* ============================================
         MATCH CARD
         ============================================ */

      .match-card {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3_5) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        transition:
          border-color var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-out),
          box-shadow var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-out);
      }

      .match-card:hover {
        border-color: var(--nxt1-color-alpha-primary30);
        box-shadow: 0 0 0 1px var(--nxt1-color-alpha-primary12);
      }

      .match-card__logo-wrap {
        flex-shrink: 0;
        width: var(--nxt1-spacing-11);
        height: var(--nxt1-spacing-11);
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        padding: var(--nxt1-spacing-1);
      }

      .match-card__logo {
        width: 100%;
        height: 100%;
        object-fit: contain;
        border-radius: var(--nxt1-borderRadius-md);
      }

      .match-card__info {
        flex: 1;
        min-width: 0;
        display: grid;
        gap: var(--nxt1-spacing-0_5, 2px);
      }

      .match-card__name {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .match-card__meta {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .match-card__score {
        flex-shrink: 0;
        display: grid;
        justify-items: center;
        gap: var(--nxt1-spacing-px);
      }

      .match-card__percent {
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .match-card__label {
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      /* ============================================
         MOBILE REFINEMENT
         ============================================ */

      @media (max-width: 639px) {
        .radar-panel {
          padding: var(--nxt1-spacing-4);
        }

        .radar-panel__title {
          font-size: var(--nxt1-fontSize-lg);
        }

        .match-card {
          padding: var(--nxt1-spacing-3);
        }

        /* Show only 6 matches on mobile to keep the list digestible */
        .match-card:nth-child(n + 7) {
          display: none;
        }
      }

      /* ============================================
         ACCESSIBILITY — Reduced Motion
         ============================================ */

      @media (prefers-reduced-motion: reduce) {
        .match-card {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtOpportunityRadarSectionComponent {
  private readonly instanceId = ++opportunityRadarInstanceCounter;

  readonly titleId = computed(() => `opportunity-radar-title-${this.instanceId}`);
  readonly panelTitleId = computed(() => `opportunity-radar-panel-title-${this.instanceId}`);

  readonly matches = input<readonly OpportunityRadarSchoolMatch[]>(
    DEFAULT_OPPORTUNITY_RADAR_MATCHES
  );

  readonly averageMatchPercent = computed(() => {
    const schools = this.matches();
    if (schools.length === 0) return 0;
    const total = schools.reduce((sum, school) => sum + school.matchPercent, 0);
    return Math.round(total / schools.length);
  });

  readonly uniqueDivisions = computed(() => {
    const divs = new Set(this.matches().map((m) => m.division));
    return divs.size;
  });
}
