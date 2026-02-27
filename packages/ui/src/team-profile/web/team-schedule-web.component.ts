/**
 * @fileoverview Team Schedule Web Component
 * @module @nxt1/ui/team-profile/web
 * @version 1.0.0
 *
 * Schedule tab content for team profile.
 * Mirrors ProfileScheduleWebComponent — injects TeamProfileService directly.
 *
 * ⭐ WEB ONLY — SSR-safe ⭐
 */
import { Component, ChangeDetectionStrategy, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-schedule-web',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <div class="team-schedule">
      <h2 class="team-section__title">Schedule</h2>
      @if (teamProfile.schedule().length > 0) {
        <!-- Upcoming Games -->
        @if (shouldShowUpcoming() && teamProfile.upcomingSchedule().length > 0) {
          <div class="team-schedule-group">
            <h3 class="team-subsection-title">Upcoming</h3>
            @for (event of teamProfile.upcomingSchedule(); track event.id) {
              <div class="team-schedule-row">
                <div class="team-schedule-row__date">
                  <span class="team-schedule-row__day">{{ formatGameDate(event.date) }}</span>
                  <span class="team-schedule-row__time">{{ event.time }}</span>
                </div>
                <div class="team-schedule-row__matchup">
                  <span class="team-schedule-row__tag">{{ event.isHome ? 'HOME' : 'AWAY' }}</span>
                  <span class="team-schedule-row__opponent"
                    >{{ event.isHome ? 'vs' : '@' }} {{ event.opponent }}</span
                  >
                </div>
                <span class="team-schedule-row__venue">{{ event.location }}</span>
              </div>
            }
          </div>
        }
        <!-- Completed Games -->
        @if (shouldShowCompleted() && teamProfile.completedSchedule().length > 0) {
          <div class="team-schedule-group">
            <h3 class="team-subsection-title">Completed</h3>
            @for (event of teamProfile.completedSchedule(); track event.id) {
              <div
                class="team-schedule-row"
                [class.team-schedule-row--win]="event.result?.outcome === 'win'"
                [class.team-schedule-row--loss]="event.result?.outcome === 'loss'"
              >
                <div class="team-schedule-row__date">
                  <span class="team-schedule-row__day">{{ formatGameDate(event.date) }}</span>
                </div>
                <div class="team-schedule-row__matchup">
                  <span
                    class="team-schedule-row__tag team-schedule-row__tag--result"
                    [class.team-schedule-row__tag--win]="event.result?.outcome === 'win'"
                    [class.team-schedule-row__tag--loss]="event.result?.outcome === 'loss'"
                  >
                    {{
                      event.result?.outcome === 'win'
                        ? 'W'
                        : event.result?.outcome === 'loss'
                          ? 'L'
                          : 'T'
                    }}
                  </span>
                  <span class="team-schedule-row__opponent"
                    >{{ event.isHome ? 'vs' : '@' }} {{ event.opponent }}</span
                  >
                </div>
                <span class="team-schedule-row__score"
                  >{{ event.result?.teamScore }}-{{ event.result?.opponentScore }}</span
                >
              </div>
            }
          </div>
        }
      } @else {
        <div class="team-empty-state">
          <nxt1-icon name="calendar-clear" [size]="40" />
          <h3>No schedule yet</h3>
          <p>Games, practices, and events will appear here.</p>
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
      }

      .team-schedule-group {
        margin-bottom: 20px;
      }

      .team-schedule-row {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 10px 14px;
        border-radius: 10px;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        margin-bottom: 6px;
      }

      .team-schedule-row__date {
        display: flex;
        flex-direction: column;
        gap: 1px;
        width: 80px;
        flex-shrink: 0;
      }

      .team-schedule-row__day {
        font-size: 12px;
        font-weight: 700;
        color: var(--m-text, #ffffff);
      }

      .team-schedule-row__time {
        font-size: 11px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
      }

      .team-schedule-row__matchup {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .team-schedule-row__tag {
        font-size: 10px;
        font-weight: 700;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.08));
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .team-schedule-row__tag--result {
        width: 18px;
        text-align: center;
        padding: 2px 4px;
      }

      .team-schedule-row__tag--win {
        color: #4ade80;
        background: rgba(74, 222, 128, 0.1);
      }

      .team-schedule-row__tag--loss {
        color: #f87171;
        background: rgba(248, 113, 113, 0.1);
      }

      .team-schedule-row__opponent {
        font-size: 13px;
        color: var(--m-text, #ffffff);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .team-schedule-row__venue {
        font-size: 11px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        white-space: nowrap;
      }

      .team-schedule-row__score {
        font-size: 14px;
        font-weight: 800;
        color: var(--m-text, #ffffff);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
      }

      .team-empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 48px 16px;
        gap: 10px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
      }

      .team-empty-state h3 {
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
        margin: 4px 0 0;
      }

      .team-empty-state p {
        font-size: 13px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        margin: 0;
        max-width: 320px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamScheduleWebComponent {
  protected readonly teamProfile = inject(TeamProfileService);

  // ============================================
  // INPUTS
  // ============================================

  /** Active side tab — 'upcoming', 'completed', or empty (show all) */
  readonly activeSideTab = input.required<string>();

  // ============================================
  // COMPUTED
  // ============================================

  protected shouldShowUpcoming(): boolean {
    const tab = this.activeSideTab();
    return !tab || tab === '' || tab === 'upcoming';
  }

  protected shouldShowCompleted(): boolean {
    const tab = this.activeSideTab();
    return !tab || tab === '' || tab === 'completed';
  }

  // ============================================
  // HELPERS
  // ============================================

  protected formatGameDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
