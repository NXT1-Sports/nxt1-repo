/**
 * @fileoverview Team Stats Web Component
 * @module @nxt1/ui/team-profile/web
 * @version 1.0.0
 *
 * Stats tab content for team profile.
 * Mirrors ProfileStatsWebComponent — injects TeamProfileService directly.
 *
 * ⭐ WEB ONLY — SSR-safe ⭐
 */
import { Component, ChangeDetectionStrategy, inject, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-stats-web',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <div class="team-stats-tab">
      <h2 class="team-section__title">Team Statistics</h2>
      @if (filteredStats().length > 0) {
        @for (category of filteredStats(); track category.name) {
          <div class="team-stats-category">
            <h3 class="team-subsection-title">
              {{ category.name }}
              @if (category.season) {
                <span class="team-stats-season">{{ category.season }}</span>
              }
            </h3>
            <div class="team-stats-grid">
              @for (stat of category.stats; track stat.key) {
                <div class="team-stat-card">
                  @if (stat.icon) {
                    <nxt1-icon [name]="stat.icon" [size]="18" />
                  }
                  <span class="team-stat-card__value">{{ stat.value }}</span>
                  <span class="team-stat-card__label">{{ stat.label }}</span>
                  @if (stat.trend) {
                    <span
                      class="team-stat-card__trend"
                      [class.team-stat-card__trend--up]="stat.trend === 'up'"
                      [class.team-stat-card__trend--down]="stat.trend === 'down'"
                    >
                      <nxt1-icon
                        [name]="
                          stat.trend === 'up'
                            ? 'trending-up'
                            : stat.trend === 'down'
                              ? 'trending-down'
                              : 'remove'
                        "
                        [size]="14"
                      />
                    </span>
                  }
                </div>
              }
            </div>
          </div>
        }
      } @else {
        <div class="madden-empty">
          <div class="madden-empty__icon" aria-hidden="true">
            <nxt1-icon name="stats-chart" [size]="40" />
          </div>
          <h3>No team stats</h3>
          <p>Team statistics and season records will appear here.</p>
          @if (teamProfile.isTeamAdmin()) {
            <button type="button" class="madden-cta-btn" (click)="manageTeam.emit()">
              Manage Stats
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .team-section__title {
        font-size: 16px;
        font-weight: 800;
        color: var(--m-text, #ffffff);
        margin: 0 0 12px;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }

      .team-subsection-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
        margin: 16px 0 10px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .team-stats-season {
        font-size: 11px;
        font-weight: 500;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
      }

      .team-stats-category {
        margin-bottom: 16px;
      }

      .team-stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 10px;
      }

      .team-stat-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 16px 12px;
        border-radius: 12px;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
        text-align: center;
        position: relative;
      }

      .team-stat-card__value {
        font-size: 20px;
        font-weight: 800;
        color: var(--m-text, #ffffff);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
      }

      .team-stat-card__label {
        font-size: 11px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .team-stat-card__trend {
        position: absolute;
        top: 8px;
        right: 8px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
      }

      .team-stat-card__trend--up {
        color: #4ade80;
      }

      .team-stat-card__trend--down {
        color: #f87171;
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
      .madden-cta-btn {
        margin-top: 12px;
        padding: 10px 24px;
        background: var(--nxt1-color-primary);
        border: none;
        border-radius: 9999px;
        color: #000;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .madden-cta-btn:hover {
        filter: brightness(1.1);
      }
      .madden-cta-btn:active {
        filter: brightness(0.95);
      }

      @media (max-width: 768px) {
        .team-stats-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamStatsWebComponent {
  protected readonly teamProfile = inject(TeamProfileService);

  // ============================================
  // INPUTS
  // ============================================

  /** Active side tab — category name slug or empty (show all) */
  readonly activeSideTab = input.required<string>();

  /** Emitted when admin clicks a manage CTA button */
  readonly manageTeam = output<void>();

  // ============================================
  // COMPUTED
  // ============================================

  /** Filtered stats based on active side tab */
  protected readonly filteredStats = computed(() => {
    const sideTab = this.activeSideTab();
    const stats = this.teamProfile.stats();

    if (!sideTab || sideTab === '') {
      return stats;
    }

    return stats.filter((cat) => cat.name.toLowerCase().replace(/\s+/g, '-') === sideTab);
  });
}
