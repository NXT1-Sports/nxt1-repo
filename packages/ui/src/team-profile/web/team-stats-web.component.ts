/**
 * @fileoverview Team Stats Web Component
 * @module @nxt1/ui/team-profile/web
 * @version 2.0.0
 *
 * Stats tab content for team profile.
 * Uses the shared StatsDashboardComponent (same UI as athlete profiles).
 * Structured stats are mapped via mapTeamStatsToGameLogs().
 * Polymorphic STAT/METRIC timeline items render above as feed cards.
 *
 * ⭐ WEB ONLY — SSR-safe ⭐
 */
import { Component, ChangeDetectionStrategy, inject, input, computed } from '@angular/core';
import {
  type FeedItem,
  type FeedItemMetric,
  type FeedItemStat,
  buildSeasonRecordMap,
  mapTeamStatsToGameLogs,
} from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon';
import { FeedStatCardComponent } from '../../post-cards/feed-stat-card.component';
import { FeedMetricsCardComponent } from '../../post-cards/feed-metrics-card.component';
import { StatsDashboardComponent } from '../../components/stats-dashboard';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-stats-web',
  standalone: true,
  imports: [
    NxtIconComponent,
    FeedStatCardComponent,
    FeedMetricsCardComponent,
    StatsDashboardComponent,
  ],
  template: `
    <div class="team-stats-tab">
      @if (isTimelineLoading()) {
        <!-- Loading skeleton while timeline is fetching -->
        <div class="team-stats-loading" aria-hidden="true">
          @for (i of [1, 2, 3]; track i) {
            <div class="team-stats-loading__card"></div>
          }
        </div>
      } @else {
        <!-- ── Section 1: Polymorphic STAT/METRIC items synced from connected accounts ── -->
        @if (timelineStatItems().length > 0) {
          <div class="team-stats-feed">
            @for (item of timelineStatItems(); track item.id) {
              @switch (item.feedType) {
                @case ('STAT') {
                  <nxt1-feed-stat-card [data]="asStat(item).statData" />
                }
                @case ('METRIC') {
                  <nxt1-feed-metrics-card [data]="asMetric(item).metricsData" />
                }
              }
            }
          </div>
        }

        <!-- ── Section 2: Structured stats via shared StatsDashboardComponent ── -->
        @if (gameLogs().length > 0) {
          <nxt1-stats-dashboard
            [gameLogs]="gameLogs()"
            [entityName]="entityName()"
            [activeSideTab]="activeSideTab()"
            emptyMessage="No stats have been recorded for this team yet."
          />
        }

        <!-- ── Empty state: nothing from either source ── -->
        @if (timelineStatItems().length === 0 && gameLogs().length === 0) {
          <div class="madden-empty">
            <div class="madden-empty__icon" aria-hidden="true">
              <nxt1-icon name="stats-chart-outline" [size]="40" />
            </div>
            <h3>No stat updates</h3>
            <p>Stat updates captured in the timeline will appear here.</p>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .team-stats-tab {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .team-stats-feed {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 4px;
      }

      .team-stats-loading {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .team-stats-loading__card {
        height: 124px;
        border-radius: 12px;
        background: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0.05) 20%,
          rgba(255, 255, 255, 0.1) 50%,
          rgba(255, 255, 255, 0.05) 80%
        );
        background-size: 180% 100%;
        animation: shimmer 1.4s ease-in-out infinite;
      }

      .madden-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 48px 24px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.6));
      }
      .madden-empty h3 {
        font-size: 16px;
        font-weight: 700;
        color: var(--m-text);
        margin: 16px 0 8px;
      }
      .madden-empty__icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.06));
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 4px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.4));
      }
      .madden-empty p {
        font-size: 14px;
        color: var(--m-text-2);
        margin: 0;
        max-width: 280px;
      }

      @keyframes shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamStatsWebComponent {
  protected readonly teamProfile = inject(TeamProfileService);

  // ── Inputs ──

  /** Active side tab — forwarded to StatsDashboardComponent for season/type filtering. */
  readonly activeSideTab = input.required<string>();

  // ── Computed ──

  /** Loading indicator while the timeline feed is fetching. */
  protected readonly isTimelineLoading = computed(() => this.teamProfile.timelineLoading());

  /** Polymorphic STAT/METRIC items captured in the timeline feed (e.g. synced from Hudl/MaxPreps). */
  protected readonly timelineStatItems = computed<readonly FeedItem[]>(() =>
    this.teamProfile
      .timeline()
      .filter((item) => item.feedType === 'STAT' || item.feedType === 'METRIC')
  );

  /** Season record map for enriching each stat category with a W-L record. */
  private readonly seasonRecordMap = computed(() =>
    buildSeasonRecordMap(this.teamProfile.team()?.record, this.teamProfile.team()?.seasonHistory)
  );

  /**
   * Structured stats mapped to ProfileSeasonGameLog[] for StatsDashboardComponent.
   * Uses the shared team-stats helper — same path as athlete profile stats.
   */
  protected readonly gameLogs = computed(() =>
    mapTeamStatsToGameLogs(this.teamProfile.stats(), this.seasonRecordMap())
  );

  /** Display name passed to the dashboard legend. */
  protected readonly entityName = computed(() => this.teamProfile.team()?.teamName ?? 'Team');

  // ── Type narrowing helpers ──

  protected asStat(item: FeedItem): FeedItemStat {
    return item as FeedItemStat;
  }

  protected asMetric(item: FeedItem): FeedItemMetric {
    return item as FeedItemMetric;
  }
}
