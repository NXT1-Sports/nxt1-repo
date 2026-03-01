/**
 * @fileoverview Profile Schedule Tab Component - Web
 * @module @nxt1/ui/profile/web
 *
 * Extracted from ProfileShellWebComponent.
 * Displays the team schedule with matchup rows.
 */
import { Component, ChangeDetectionStrategy, inject, input, computed } from '@angular/core';
import { type ProfileEvent } from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import { ProfileService } from '../profile.service';

@Component({
  selector: 'nxt1-profile-schedule-web',
  standalone: true,
  imports: [NxtIconComponent, NxtImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="madden-tab-section madden-schedule" aria-labelledby="schedule-heading">
      <h2 id="schedule-heading" class="sr-only">Schedule</h2>

      @if (scheduleEvents().length === 0) {
        <div class="madden-empty">
          <nxt1-icon name="calendar" [size]="48" />
          <h3>No schedule yet</h3>
          <p>
            @if (profile.isOwnProfile()) {
              Add games and practices to show your full season schedule.
            } @else {
              This athlete hasn't added any schedule items yet.
            }
          </p>
          @if (profile.isOwnProfile()) {
            <button type="button" class="madden-cta-btn" (click)="onAddEvent()">Add Game</button>
          }
        </div>
      } @else {
        <div class="schedule-board" role="list" aria-label="Team schedule">
          @for (row of scheduleRows(); track row.event.id) {
            <button
              type="button"
              class="schedule-row"
              [class.schedule-row--past]="row.isPast"
              role="listitem"
              (click)="onEventClick(row.event)"
            >
              <div class="schedule-row__date">
                <span class="schedule-row__month">{{ row.month }}</span>
                <span class="schedule-row__day">{{ row.day }}</span>
              </div>

              <div class="schedule-row__matchup">
                <div class="schedule-row__teams">
                  <div class="schedule-row__team schedule-row__team--home">
                    <span class="schedule-row__team-name">{{ row.homeTeam }}</span>
                    @if (row.homeLogo; as homeLogo) {
                      <nxt1-image
                        class="schedule-row__logo"
                        [src]="homeLogo"
                        [alt]="row.homeTeam + ' logo'"
                        [width]="20"
                        [height]="20"
                        variant="avatar"
                        fit="contain"
                        [showPlaceholder]="false"
                      />
                    }
                  </div>

                  <span class="schedule-row__vs">vs</span>

                  <div class="schedule-row__team schedule-row__team--away">
                    <span class="schedule-row__team-name">{{ row.awayTeam }}</span>
                    @if (row.awayLogo; as awayLogo) {
                      <nxt1-image
                        class="schedule-row__logo"
                        [src]="awayLogo"
                        [alt]="row.awayTeam + ' logo'"
                        [width]="20"
                        [height]="20"
                        variant="avatar"
                        fit="contain"
                        [showPlaceholder]="false"
                      />
                    }
                  </div>
                </div>

                <div class="schedule-row__meta">
                  <span>{{ row.location }}</span>
                  <span aria-hidden="true">•</span>
                  <span>{{ row.time }}</span>
                </div>
              </div>

              <div class="schedule-row__status">
                <span class="schedule-row__status-label">{{ row.statusLabel }}</span>
                <span class="schedule-row__status-value">{{ row.statusValue }}</span>
              </div>
            </button>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* ─── EMPTY STATE ─── */
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
      .madden-empty p {
        font-size: 14px;
        color: var(--m-text-2);
        margin: 0 0 20px;
        max-width: 280px;
      }
      .madden-cta-btn {
        background: var(--m-accent);
        color: #000;
        border: none;
        border-radius: 999px;
        padding: 10px 24px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: filter 0.15s;
      }
      .madden-cta-btn:hover {
        filter: brightness(1.1);
      }

      /* ─── SCHEDULE BOARD ─── */
      .madden-schedule {
        padding-top: 2px;
      }
      .schedule-board {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .schedule-row {
        width: 100%;
        border: 1px solid var(--m-border);
        border-radius: 12px;
        background: var(--m-surface);
        color: var(--m-text);
        display: grid;
        grid-template-columns: 72px minmax(0, 1fr) 130px;
        align-items: stretch;
        text-align: left;
        overflow: hidden;
        cursor: pointer;
        transition:
          border-color 0.18s ease,
          transform 0.18s ease,
          background 0.18s ease;
      }
      .schedule-row:hover {
        border-color: color-mix(in srgb, var(--m-accent) 20%, var(--m-border));
        background: var(--m-surface-2);
        transform: translateY(-1px);
      }
      .schedule-row:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--m-accent) 50%, transparent);
        outline-offset: 2px;
      }
      .schedule-row--past {
        opacity: 0.88;
      }
      .schedule-row--past .schedule-row__status-label {
        color: var(--m-text-2);
      }

      .schedule-row__date,
      .schedule-row__status {
        background: color-mix(in srgb, var(--m-surface-2) 70%, var(--m-surface));
      }

      .schedule-row__date {
        border-right: 1px solid var(--m-border);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1px;
        padding: 8px 6px;
      }
      .schedule-row__month {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--m-text-2);
      }
      .schedule-row__day {
        font-size: 22px;
        line-height: 1;
        font-weight: 800;
        color: var(--m-text);
      }

      .schedule-row__matchup {
        padding: 10px 12px;
        display: flex;
        min-width: 0;
        flex-direction: column;
        justify-content: center;
        gap: 6px;
      }
      .schedule-row__teams {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .schedule-row__team {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
      }
      .schedule-row__team-name {
        font-size: 14px;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: -0.01em;
        color: var(--m-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .schedule-row__logo {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        object-fit: cover;
        border: 1px solid var(--m-border);
        background: var(--m-surface);
        flex-shrink: 0;
      }
      .schedule-row__vs {
        flex-shrink: 0;
        font-size: 11px;
        font-weight: 600;
        text-transform: lowercase;
        color: var(--m-text-2);
      }
      .schedule-row__meta {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--m-text-2);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .schedule-row__status {
        border-left: 1px solid var(--m-border);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        gap: 4px;
      }
      .schedule-row__status-label {
        font-size: 14px;
        line-height: 1.1;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--m-text);
      }
      .schedule-row__status-value {
        font-size: 12px;
        line-height: 1.25;
        color: var(--m-text-2);
      }

      @media (max-width: 1024px) {
        .schedule-row {
          grid-template-columns: 68px minmax(0, 1fr) 120px;
        }
        .schedule-row__team-name {
          font-size: 13px;
        }
        .schedule-row__status-label {
          font-size: 13px;
        }
        .schedule-row__status-value {
          font-size: 12px;
        }
      }

      @media (max-width: 760px) {
        .schedule-row {
          grid-template-columns: 62px minmax(0, 1fr);
          grid-template-areas:
            'date matchup'
            'status status';
        }
        .schedule-row__date {
          grid-area: date;
        }
        .schedule-row__matchup {
          grid-area: matchup;
          padding: 9px 10px;
          gap: 6px;
        }
        .schedule-row__teams {
          gap: 8px;
          flex-wrap: wrap;
        }
        .schedule-row__team-name {
          font-size: 13px;
        }
        .schedule-row__logo {
          width: 22px;
          height: 22px;
        }
        .schedule-row__meta {
          font-size: 12px;
        }
        .schedule-row__status {
          grid-area: status;
          border-left: none;
          border-top: 1px solid var(--m-border);
          background: color-mix(in srgb, var(--m-surface-2) 70%, var(--m-surface));
          padding: 8px 10px;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
        }
        .schedule-row__status-label {
          font-size: 13px;
        }
        .schedule-row__status-value {
          font-size: 12px;
          text-align: right;
        }
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ],
})
export class ProfileScheduleWebComponent {
  protected readonly profile = inject(ProfileService);

  /** Active side tab from parent, used for season filtering */
  readonly activeSideTab = input<string>('');

  // ── Schedule computed signals ──

  protected readonly scheduleEvents = computed(() => {
    const sorted = [...this.profile.events()].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

    const gameSchedule = sorted.filter(
      (event) => event.type === 'game' || event.type === 'practice'
    );
    const base = gameSchedule.length > 0 ? gameSchedule : sorted;

    const sideTab = this.activeSideTab();
    if (sideTab.startsWith('season-')) {
      const seasonLabel = sideTab.replace('season-', '');
      return base.filter((event) => this.getSeasonForDate(event.startDate) === seasonLabel);
    }

    return base;
  });

  protected readonly scheduleRows = computed(() => {
    const events = this.scheduleEvents();
    const user = this.profile.user();
    const ownTeamName = user?.school?.name?.trim() || user?.displayName?.trim() || 'Team';
    const ownTeamLogo = user?.school?.logoUrl || user?.teamAffiliations?.[0]?.logoUrl;
    const now = Date.now();

    return events.map((event) => {
      const matchup = this.resolveMatchup(event, ownTeamName, ownTeamLogo);
      const isPast = new Date(event.startDate).getTime() <= now;

      return {
        event,
        isPast,
        month: this.formatEventMonth(event.startDate),
        day: this.formatEventDay(event.startDate),
        homeTeam: matchup.homeTeam,
        awayTeam: matchup.awayTeam,
        homeLogo: matchup.homeLogo,
        awayLogo: matchup.awayLogo,
        location: event.location || 'Location TBA',
        time: this.resolveTime(event),
        statusLabel: isPast ? 'Completed' : 'Upcoming',
        statusValue: event.result?.trim() || (isPast ? 'No score reported' : 'Scheduled'),
      };
    });
  });

  /** Unique season labels from schedule events */
  readonly scheduleSeasons = computed<readonly string[]>(() => {
    const events = this.profile.events();
    const gameEvents = events.filter((e) => e.type === 'game' || e.type === 'practice');
    const source = gameEvents.length > 0 ? gameEvents : events;

    const seen = new Set<string>();
    const seasons: string[] = [];
    for (const event of source) {
      const season = this.getSeasonForDate(event.startDate);
      if (!seen.has(season)) {
        seen.add(season);
        seasons.push(season);
      }
    }
    seasons.sort((a, b) => b.localeCompare(a));
    return seasons;
  });

  /** Resolved team name for schedule side-nav */
  readonly scheduleTeamName = computed(() => {
    const user = this.profile.user();
    const schoolName = user?.school?.name?.trim();
    if (schoolName) return schoolName;

    const firstTeamName = user?.teamAffiliations
      ?.find((affiliation) => affiliation.name?.trim())
      ?.name?.trim();
    if (firstTeamName) return firstTeamName;

    return user?.displayName?.trim() || 'Team';
  });

  protected onEventClick(_event: ProfileEvent): void {
    // No-op — parent handles navigation
  }

  protected onAddEvent(): void {
    // No-op — parent handles navigation
  }

  // ── Private helpers ──

  private formatEventMonth(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short' });
  }

  private formatEventDay(dateString: string): string {
    return new Date(dateString).getDate().toString();
  }

  private getSeasonForDate(dateString: string): string {
    const d = new Date(dateString);
    const year = d.getFullYear();
    const month = d.getMonth();
    if (month >= 7) {
      return `${year}-${year + 1}`;
    }
    return `${year - 1}-${year}`;
  }

  private resolveMatchup(
    event: ProfileEvent,
    ownTeamName: string,
    ownTeamLogo: string | undefined
  ): { homeTeam: string; awayTeam: string; homeLogo?: string; awayLogo?: string } {
    const opponentName = this.resolveOpponent(event, ownTeamName);
    const isHome = this.isHomeEvent(event.name, ownTeamName);

    return isHome
      ? {
          homeTeam: ownTeamName,
          awayTeam: opponentName,
          homeLogo: ownTeamLogo,
          awayLogo: event.logoUrl,
        }
      : {
          homeTeam: opponentName,
          awayTeam: ownTeamName,
          homeLogo: event.logoUrl,
          awayLogo: ownTeamLogo,
        };
  }

  private resolveOpponent(event: ProfileEvent, ownTeamName: string): string {
    if (event.opponent?.trim()) return event.opponent.trim();
    const parsed = this.parseMatchupTeams(event.name, ownTeamName);
    return parsed ?? 'Opponent';
  }

  private resolveTime(event: ProfileEvent): string {
    if (event.isAllDay) return 'All day';
    const d = new Date(event.startDate);
    if (Number.isNaN(d.getTime())) return 'Time TBA';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  private isHomeEvent(eventName: string, ownTeamName: string): boolean {
    const name = eventName.toLowerCase();
    if (name.includes(' @ ')) return !name.startsWith(ownTeamName.toLowerCase());
    return true;
  }

  private parseMatchupTeams(eventName: string, ownTeamName: string): string | undefined {
    const cleaned = eventName.trim();
    if (!cleaned) return undefined;

    const separator = cleaned.includes(' vs ')
      ? /\s+vs\.?\s+/i
      : cleaned.includes(' @ ')
        ? /\s+@\s+/i
        : null;
    if (!separator) return undefined;

    const [left, right] = cleaned.split(separator);
    if (!left?.trim() || !right?.trim()) return undefined;

    const leftTeam = left.trim();
    const rightTeam = right.trim();
    const own = ownTeamName.toLowerCase();

    if (leftTeam.toLowerCase() === own) return rightTeam;
    if (rightTeam.toLowerCase() === own) return leftTeam;
    return rightTeam;
  }
}
