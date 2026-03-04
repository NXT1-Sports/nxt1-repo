/**
 * @fileoverview XP & Leaderboards Gamification Section
 * @module apps/web/features/marketing/components/xp-leaderboard-section
 * @version 1.0.0
 *
 * Shared marketing section component that visualizes XP progression
 * and leaderboard momentum for persona pages.
 *
 * 2026 standards:
 * - SSR-safe (no DOM/browser APIs)
 * - 100% design-token driven colors/typography/spacing
 * - Semantic structure for accessibility and SEO
 * - Mobile-first responsive layout
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NxtIconComponent } from '@nxt1/ui/components/icon';
import { NxtSectionHeaderComponent } from '@nxt1/ui/components/section-header';

interface XpAction {
  readonly id: string;
  readonly icon: string;
  readonly label: string;
  readonly xp: string;
}

interface LeaderboardEntry {
  readonly id: string;
  readonly rank: string;
  readonly name: string;
  readonly xp: string;
  readonly trend: string;
  readonly isCurrentUser: boolean;
}

const XP_ACTIONS: readonly XpAction[] = [
  {
    id: 'update-stats',
    icon: 'stats-chart-outline',
    label: 'Update stats',
    xp: '+120 XP',
  },
  {
    id: 'post-highlights',
    icon: 'videocam-outline',
    label: 'Post highlights',
    xp: '+180 XP',
  },
  {
    id: 'log-training',
    icon: 'flash-outline',
    label: 'Log training',
    xp: '+90 XP',
  },
];

const LEADERBOARD: readonly LeaderboardEntry[] = [
  {
    id: 'lb-1',
    rank: '#1',
    name: 'Jordan Miles',
    xp: '5,940 XP',
    trend: '+140',
    isCurrentUser: false,
  },
  {
    id: 'lb-2',
    rank: '#2',
    name: 'Avery Jackson',
    xp: '5,610 XP',
    trend: '+120',
    isCurrentUser: false,
  },
  {
    id: 'lb-3',
    rank: '#3',
    name: 'You · Marcus Johnson',
    xp: '5,430 XP',
    trend: '+310',
    isCurrentUser: true,
  },
  {
    id: 'lb-4',
    rank: '#4',
    name: 'Noah Carter',
    xp: '5,390 XP',
    trend: '+95',
    isCurrentUser: false,
  },
  {
    id: 'lb-5',
    rank: '#5',
    name: 'Elijah Turner',
    xp: '5,180 XP',
    trend: '+80',
    isCurrentUser: false,
  },
];

@Component({
  selector: 'nxt1-xp-leaderboard-section',
  standalone: true,
  imports: [NxtIconComponent, NxtSectionHeaderComponent],
  template: `
    <section class="xp-leaderboard" aria-labelledby="xp-leaderboard-title">
      <div class="xp-leaderboard__shell">
        <nxt1-section-header
          eyebrow="XP & Leaderboards"
          eyebrowIcon="trophy-outline"
          title="Compete Every Day."
          subtitle="Earn XP for updating stats, posting highlights, and training. Climb the Risers to Watch leaderboard every day you show up."
          support="Grind on the field. Climb on the app."
          [headingLevel]="2"
          titleId="xp-leaderboard-title"
          layout="split"
        >
          <div class="leaderboard-stack">
            <article class="xp-card" aria-label="XP actions that increase your rank">
              <header class="xp-card__header">
                <p class="xp-card__eyebrow">Daily XP Paths</p>
              </header>

              <div class="xp-actions" aria-label="XP actions">
                @for (action of xpActions; track action.id) {
                  <div class="xp-action">
                    <span class="xp-action__icon" aria-hidden="true">
                      <nxt1-icon [name]="action.icon" size="14" />
                    </span>
                    <span class="xp-action__label">{{ action.label }}</span>
                    <span class="xp-action__value">{{ action.xp }}</span>
                  </div>
                }
              </div>
            </article>

            <article
              class="leaderboard-card"
              aria-label="Risers to Watch leaderboard preview showing rank progression"
            >
              <header class="leaderboard-card__header">
                <div class="leaderboard-card__title-wrap">
                  <p class="leaderboard-card__eyebrow">Risers to Watch Leaderboard</p>
                  <h3 class="leaderboard-card__title">Top 5 · This Week</h3>
                </div>

                <div class="leaderboard-card__trend">
                  <nxt1-icon name="trending-up-outline" size="14" />
                  <span>+2 ranks</span>
                </div>
              </header>

              <div class="leaderboard-head" aria-hidden="true">
                <span>Rank</span>
                <span>Athlete</span>
                <span>XP</span>
                <span>Gain</span>
              </div>

              <ol class="leaderboard-list" aria-label="Top athletes by XP">
                @for (entry of leaderboard; track entry.id) {
                  <li
                    class="leaderboard-item"
                    [class.leaderboard-item--active]="entry.isCurrentUser"
                  >
                    <span class="leaderboard-item__rank">{{ entry.rank }}</span>
                    <span class="leaderboard-item__name">{{ entry.name }}</span>
                    <span class="leaderboard-item__xp">{{ entry.xp }}</span>
                    <span class="leaderboard-item__trend">{{ entry.trend }}</span>
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
      :host {
        display: block;
      }

      .xp-leaderboard {
        width: 100%;
        padding-block: var(--nxt1-spacing-14);
      }

      .xp-leaderboard__shell {
        width: min(100%, var(--nxt1-content-max-width));
        margin-inline: auto;
        padding-inline: var(--nxt1-content-padding-x);
      }

      .leaderboard-card {
        display: grid;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-alpha-primary45);
        background: var(--nxt1-color-surface-100);
        box-shadow:
          var(--nxt1-shadow-md),
          0 0 0 1px var(--nxt1-color-alpha-primary20);
      }

      .leaderboard-stack {
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .xp-card {
        display: grid;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
      }

      .xp-card__header {
        display: flex;
        align-items: center;
      }

      .xp-card__eyebrow {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .leaderboard-card__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
      }

      .leaderboard-card__title-wrap {
        display: grid;
        gap: var(--nxt1-spacing-1);
      }

      .leaderboard-card__eyebrow {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .leaderboard-card__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .leaderboard-card__trend {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary8);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .xp-actions {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .xp-action {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
      }

      .leaderboard-head {
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        gap: var(--nxt1-spacing-2);
        padding: 0 var(--nxt1-spacing-3);
      }

      .leaderboard-head span {
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .xp-action__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-primary);
      }

      .xp-action__label {
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .xp-action__value {
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      .leaderboard-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .leaderboard-item {
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
      }

      .leaderboard-item--active {
        border-color: var(--nxt1-color-alpha-primary45);
        background: linear-gradient(
          90deg,
          var(--nxt1-color-alpha-primary12),
          var(--nxt1-color-surface-200)
        );
      }

      .leaderboard-item__rank,
      .leaderboard-item__xp,
      .leaderboard-item__trend {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .leaderboard-item__rank {
        color: var(--nxt1-color-text-primary);
      }

      .leaderboard-item__name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
      }

      .leaderboard-item__trend {
        color: var(--nxt1-color-success);
      }

      @media (max-width: 991px) {
        .xp-leaderboard {
          padding-block: var(--nxt1-spacing-10);
        }

        .xp-leaderboard__shell {
          padding-inline: var(--nxt1-spacing-4);
        }

        .leaderboard-card {
          padding: var(--nxt1-spacing-4);
        }

        .leaderboard-head {
          padding: 0 var(--nxt1-spacing-2);
        }
      }

      @media (max-width: 767px) {
        .leaderboard-head {
          display: none;
        }

        .leaderboard-item {
          grid-template-columns: auto 1fr auto;
          grid-template-areas:
            'rank name trend'
            'rank xp xp';
          row-gap: var(--nxt1-spacing-1);
        }

        .leaderboard-item__rank {
          grid-area: rank;
        }

        .leaderboard-item__name {
          grid-area: name;
        }

        .leaderboard-item__xp {
          grid-area: xp;
        }

        .leaderboard-item__trend {
          grid-area: trend;
          justify-self: end;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtXpLeaderboardSectionComponent {
  protected readonly xpActions = XP_ACTIONS;
  protected readonly leaderboard = LEADERBOARD;
}
