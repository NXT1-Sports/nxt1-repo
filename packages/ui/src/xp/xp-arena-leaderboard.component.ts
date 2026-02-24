/**
 * @fileoverview XP Arena Leaderboard Section (The Arena)
 * @module @nxt1/ui/xp
 * @version 1.1.0
 *
 * Interactive section presenting "The Arena" — real-time leaderboard
 * rankings with filter tabs (National, State, Position+Class, Head-to-Head),
 * a watch-list card, and motivational insights.
 *
 * Width uses the same `--nxt1-section-max-width` / `--nxt1-section-padding-x`
 * tokens as sibling landing-page sections so everything aligns seamlessly.
 *
 * Architecture notes:
 * - 100% design-token-driven for colors, typography, spacing, radii.
 * - Semantic HTML (section/header/h2/h3/article/aside) with
 *   deterministic aria-labelledby IDs via instance counter (SSR-safe,
 *   no random values — identical across server & client hydration).
 * - No browser APIs — pure presentational, SSR-safe, zero Ionic.
 * - Responsive: single-col (mobile) → 3-col VS layout (desktop 768px+).
 * - Filter tabs scroll horizontally on narrow viewports (no overflow).
 *
 * @example
 * ```html
 * <nxt1-xp-arena-leaderboard />
 * ```
 */

import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

type ArenaFilterId = 'national' | 'state' | 'positionClass' | 'headToHead';

interface ArenaFilterOption {
  readonly id: ArenaFilterId;
  readonly label: string;
}

interface ArenaRankingView {
  readonly id: Exclude<ArenaFilterId, 'headToHead'>;
  readonly label: string;
  readonly rank: string;
  readonly context: string;
}

interface ArenaAthleteSnapshot {
  readonly label: string;
  readonly xp: string;
  readonly streak: string;
  readonly badges: string;
}

const ARENA_FILTERS: readonly ArenaFilterOption[] = [
  { id: 'national', label: 'National' },
  { id: 'state', label: 'State' },
  { id: 'positionClass', label: 'Position + Class' },
  { id: 'headToHead', label: 'Head-to-Head' },
] as const;

const ARENA_RANKING_VIEWS: readonly ArenaRankingView[] = [
  {
    id: 'national',
    label: 'National Ranking',
    rank: '#47',
    context: 'out of 12,000 Quarterbacks',
  },
  {
    id: 'state',
    label: 'State Ranking',
    rank: '#3',
    context: 'in Texas',
  },
  {
    id: 'positionClass',
    label: 'Position + Class Ranking',
    rank: '#1',
    context: 'Point Guard, Class of 2028, Southeast Region',
  },
] as const;

/** Monotonic counter for deterministic SSR-safe element IDs. */
let arenaInstanceCounter = 0;

const ATHLETE_YOU: ArenaAthleteSnapshot = {
  label: 'You',
  xp: '8,400 XP',
  streak: '22-Day Streak',
  badges: '14 Badges',
};

const ATHLETE_RIVAL: ArenaAthleteSnapshot = {
  label: 'Rival',
  xp: '8,200 XP',
  streak: '18-Day Streak',
  badges: '12 Badges',
};

@Component({
  selector: 'nxt1-xp-arena-leaderboard',
  standalone: true,
  template: `
    <section class="arena" [attr.aria-labelledby]="titleId()">
      <header class="arena__header">
        <p class="arena__eyebrow">The Arena</p>
        <h2 [id]="titleId()" class="arena__title">Your Opponent Isn&rsquo;t Just on the Field.</h2>
        <p class="arena__subtitle">
          Real-time rankings against every athlete in your sport, position, state, and class year.
        </p>
      </header>

      <div class="arena__filters" role="tablist" aria-label="Arena leaderboard views">
        @for (filter of filters; track filter.id) {
          <button
            type="button"
            role="tab"
            class="arena__filter"
            [class.arena__filter--active]="activeFilter() === filter.id"
            [attr.aria-selected]="activeFilter() === filter.id"
            [attr.aria-controls]="tabPanelId(filter.id)"
            [attr.id]="tabId(filter.id)"
            (click)="setActiveFilter(filter.id)"
          >
            {{ filter.label }}
          </button>
        }
      </div>

      @if (activeFilter() !== 'headToHead' && activeRanking()) {
        <article
          class="arena-card"
          role="tabpanel"
          [attr.id]="tabPanelId(activeFilter())"
          [attr.aria-labelledby]="tabId(activeFilter())"
        >
          <h3 class="arena-card__title">{{ activeRanking()!.label }}</h3>
          <div class="arena-card__rank-line">
            <span class="arena-card__rank">{{ activeRanking()!.rank }}</span>
            <span class="arena-card__context">{{ activeRanking()!.context }}</span>
          </div>
          <p class="arena-card__note">
            Live leaderboard movement updates every time athletes complete XP missions.
          </p>
        </article>
      }

      @if (activeFilter() === 'headToHead') {
        <article
          class="arena-card arena-card--comparison"
          role="tabpanel"
          [attr.id]="tabPanelId('headToHead')"
          [attr.aria-labelledby]="tabId('headToHead')"
        >
          <h3 class="arena-card__title">Head-to-Head Comparison</h3>

          <div class="arena-vs">
            <div class="arena-athlete">
              <p class="arena-athlete__label">{{ athleteYou.label }}</p>
              <ul class="arena-athlete__stats" aria-label="Your stats">
                <li>{{ athleteYou.xp }}</li>
                <li>{{ athleteYou.streak }}</li>
                <li>{{ athleteYou.badges }}</li>
              </ul>
            </div>

            <div class="arena-vs__divider" aria-hidden="true">VS</div>

            <div class="arena-athlete">
              <p class="arena-athlete__label">{{ athleteRival.label }}</p>
              <ul class="arena-athlete__stats" aria-label="Rival stats">
                <li>{{ athleteRival.xp }}</li>
                <li>{{ athleteRival.streak }}</li>
                <li>{{ athleteRival.badges }}</li>
              </ul>
            </div>
          </div>

          <p class="arena-status">You lead by 200 XP. He posted a highlight 2 hours ago.</p>
        </article>
      }

      <article class="arena-card" [attr.aria-labelledby]="watchListTitleId()">
        <h3 [id]="watchListTitleId()" class="arena-card__title">The Watch List</h3>
        <p class="arena-card__copy">
          Follow rivals and get notified when they earn XP or climb a rank.
        </p>
        <p class="arena-notification" role="status">
          Marcus D. just passed you on the Texas QB Leaderboard.
        </p>
      </article>

      <aside class="arena-insights" aria-label="Arena motivation and trust signals">
        <p class="arena-insights__psychology">
          You don't need a coach to tell you to grind. The leaderboard does it for you.
        </p>
        <p class="arena-insights__trust">
          Top 10 in any leaderboard gets featured in our weekly &ldquo;Risers to Watch&rdquo; email
          sent to 5,000+ college coaches.
        </p>
      </aside>
    </section>
  `,
  styles: [
    `
      /* ============================================
         ARENA LEADERBOARD — Design Token CSS
         Matches sibling section containment pattern
         (Economy Rewards, Multiplier Effect, etc.)
         ============================================ */

      :host {
        display: block;
      }

      /* Section containment — matches --nxt1-section-* tokens from siblings */
      .arena {
        display: grid;
        gap: var(--nxt1-spacing-5);
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y, var(--nxt1-spacing-8))
          var(--nxt1-section-padding-x, var(--nxt1-spacing-4));
        overflow: hidden;
      }

      /* ============================================
         HEADER — centred, token typography
         ============================================ */

      .arena__header {
        display: grid;
        gap: var(--nxt1-spacing-2);
        text-align: center;
      }

      .arena__eyebrow {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .arena__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .arena__subtitle {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ============================================
         FILTER TABS — scroll on narrow, wrap on wide
         ============================================ */

      .arena__filters {
        display: flex;
        gap: var(--nxt1-spacing-2);
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        padding-bottom: var(--nxt1-spacing-1);
      }

      .arena__filters::-webkit-scrollbar {
        display: none;
      }

      .arena__filter {
        flex-shrink: 0;
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        white-space: nowrap;
        cursor: pointer;
        transition:
          border-color 180ms ease,
          color 180ms ease,
          background-color 180ms ease;

        &:hover {
          border-color: var(--nxt1-color-border-default);
          color: var(--nxt1-color-text-primary);
        }

        &:focus-visible {
          outline: 2px solid var(--nxt1-color-primary);
          outline-offset: 2px;
        }
      }

      .arena__filter--active {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      /* ============================================
         CARDS — ranking / comparison / watch-list
         ============================================ */

      .arena-card {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl, 12px);
        padding: var(--nxt1-spacing-4);
        display: grid;
        gap: var(--nxt1-spacing-2);
        min-width: 0;
        overflow: hidden;
      }

      .arena-card__title {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .arena-card__rank-line {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--nxt1-spacing-2);
      }

      .arena-card__rank {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
      }

      .arena-card__context {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        color: var(--nxt1-color-text-primary);
      }

      .arena-card__note,
      .arena-card__copy {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ============================================
         HEAD-TO-HEAD COMPARISON
         ============================================ */

      .arena-card--comparison {
        gap: var(--nxt1-spacing-3);
      }

      .arena-vs {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-3);
        min-width: 0;
      }

      .arena-vs__divider {
        justify-self: center;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        color: var(--nxt1-color-text-tertiary);
      }

      .arena-athlete {
        background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-lg, 8px);
        padding: var(--nxt1-spacing-3);
        display: grid;
        gap: var(--nxt1-spacing-2);
        min-width: 0;
        overflow: hidden;
      }

      .arena-athlete__label {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .arena-athlete__stats {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--nxt1-spacing-1);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
      }

      .arena-status {
        margin: 0;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-lg, 8px);
        background: var(--nxt1-color-alpha-primary5);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
      }

      /* ============================================
         WATCH LIST NOTIFICATION
         ============================================ */

      .arena-notification {
        margin: 0;
        border-left: var(--nxt1-borderWidth-thick, 3px) solid var(--nxt1-color-primary);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-200);
        border-radius: 0 var(--nxt1-borderRadius-lg, 8px) var(--nxt1-borderRadius-lg, 8px) 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-primary);
        word-break: break-word;
      }

      /* ============================================
         INSIGHTS ASIDE
         ============================================ */

      .arena-insights {
        display: grid;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl, 12px);
      }

      .arena-insights__psychology,
      .arena-insights__trust {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .arena-insights__psychology {
        color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .arena-insights__trust {
        color: var(--nxt1-color-text-secondary);
      }

      /* ============================================
         DESKTOP BREAKPOINT
         ============================================ */

      @media (min-width: 768px) {
        .arena-vs {
          grid-template-columns: 1fr auto 1fr;
          align-items: stretch;
        }

        .arena-vs__divider {
          align-self: center;
        }
      }

      /* ============================================
         REDUCED MOTION
         ============================================ */

      @media (prefers-reduced-motion: reduce) {
        .arena__filter {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtXpArenaLeaderboardComponent {
  /** Monotonic per-instance counter for deterministic SSR-safe IDs. */
  private readonly instanceId = ++arenaInstanceCounter;

  /** Static filter / ranking data. */
  protected readonly filters = ARENA_FILTERS;
  protected readonly athleteYou = ATHLETE_YOU;
  protected readonly athleteRival = ATHLETE_RIVAL;

  /** Private writeable signal — never exposed directly. */
  private readonly _activeFilter = signal<ArenaFilterId>('national');

  /** Public readonly computed signals. */
  protected readonly activeFilter = computed(() => this._activeFilter());
  protected readonly activeRanking = computed(() =>
    ARENA_RANKING_VIEWS.find((view) => view.id === this._activeFilter())
  );

  /** Deterministic IDs for aria-labelledby — SSR-safe (no crypto/random). */
  protected readonly titleId = computed(() => `xp-arena-title-${this.instanceId}`);
  protected readonly watchListTitleId = computed(() => `xp-arena-watch-${this.instanceId}`);

  /** Generate scoped tab / panel IDs for ARIA tablist pattern. */
  protected tabId(filterId: ArenaFilterId): string {
    return `xp-arena-tab-${filterId}-${this.instanceId}`;
  }

  protected tabPanelId(filterId: ArenaFilterId): string {
    return `xp-arena-panel-${filterId}-${this.instanceId}`;
  }

  /** Set active filter tab. */
  protected setActiveFilter(filterId: ArenaFilterId): void {
    this._activeFilter.set(filterId);
  }
}
