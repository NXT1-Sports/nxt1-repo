/**
 * @fileoverview Team Roster Web Component
 * @module @nxt1/ui/team-profile/web
 * @version 1.0.0
 *
 * Roster tab content for team profile — split by class year on side tabs.
 * Mirrors ProfileOverviewWebComponent pattern — injects TeamProfileService directly.
 *
 * ⭐ WEB ONLY — SSR-safe ⭐
 */
import { Component, ChangeDetectionStrategy, inject, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import type { TeamProfileRosterMember } from '@nxt1/core';
import { TEAM_PROFILE_ROSTER_SORT_LABELS } from '@nxt1/core';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-roster-web',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtImageComponent],
  template: `
    <div class="team-roster">
      <div class="team-roster__header">
        <h2 class="team-section__title">Roster ({{ teamProfile.rosterCount() }})</h2>
        <div class="team-roster__sort">
          <span class="team-roster__sort-label">Sort by:</span>
          <select
            class="team-roster__sort-select"
            [value]="teamProfile.rosterSort()"
            (change)="onRosterSortChange($event)"
            aria-label="Sort roster by"
          >
            @for (option of rosterSortOptions; track option.value) {
              <option [value]="option.value">{{ option.label }}</option>
            }
          </select>
        </div>
      </div>

      @if (filteredRoster().length > 0) {
        <div class="team-roster__grid">
          @for (member of filteredRoster(); track member.id) {
            <button
              type="button"
              class="roster-card"
              (click)="memberClick.emit(member)"
              [attr.aria-label]="
                'View profile for ' +
                (member.displayName ?? member.firstName + ' ' + member.lastName)
              "
            >
              <div class="roster-card__image-wrap">
                @if (member.profileImg) {
                  <nxt1-image
                    class="roster-card__image"
                    [src]="member.profileImg"
                    [alt]="member.displayName ?? member.firstName + ' ' + member.lastName"
                    [width]="400"
                    [height]="400"
                    fit="cover"
                    [showPlaceholder]="false"
                  />
                } @else {
                  <div class="roster-card__placeholder">
                    <nxt1-icon name="shield" [size]="48" />
                  </div>
                }
                @if (member.views) {
                  <span class="roster-card__views">
                    <nxt1-icon name="flame" [size]="14" />
                    <strong>{{ member.views | number }}</strong>
                    <span>VIEWS</span>
                  </span>
                }
              </div>
              <div class="roster-card__info">
                <div class="roster-card__name-row">
                  <h3 class="roster-card__name">
                    {{ member.displayName ?? member.firstName + ' ' + member.lastName }}
                  </h3>
                  @if (member.jerseyNumber) {
                    <span class="roster-card__jersey">#{{ member.jerseyNumber }}</span>
                  }
                </div>
                @if (member.position) {
                  <p class="roster-card__position">{{ member.position }}</p>
                }
                @if (member.height || member.weight) {
                  <p class="roster-card__measurables">
                    @if (member.height) {
                      <span>{{ member.height }}</span>
                    }
                    @if (member.height && member.weight) {
                      <span class="roster-card__sep">·</span>
                    }
                    @if (member.weight) {
                      <span>{{ member.weight }}</span>
                    }
                  </p>
                }
                @if (member.classYear) {
                  <p class="roster-card__class">Class of {{ member.classYear }}</p>
                }
              </div>
            </button>
          }
        </div>
      } @else {
        <div class="madden-empty">
          <div class="madden-empty__icon" aria-hidden="true">
            <nxt1-icon name="people" [size]="40" />
          </div>
          <h3>No roster members</h3>
          <p>Athletes will appear here when they join the team.</p>
          @if (teamProfile.isTeamAdmin()) {
            <button type="button" class="madden-cta-btn" (click)="invite.emit()">
              Invite Players
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
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        letter-spacing: 0.02em;
      }

      .team-roster__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
      }

      .team-roster__sort {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .team-roster__sort-label {
        font-size: 12px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
      }

      .team-roster__sort-select {
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
        border-radius: 8px;
        color: var(--m-text, #ffffff);
        font-size: 12px;
        padding: 6px 10px;
        cursor: pointer;
      }

      /* ─── CARD GRID ─── */
      .team-roster__grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
      }

      .roster-card {
        display: flex;
        flex-direction: column;
        border-radius: 14px;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
        overflow: hidden;
        cursor: pointer;
        text-align: left;
        width: 100%;
        padding: 0;
        transition:
          border-color 0.18s ease,
          box-shadow 0.18s ease,
          transform 0.18s ease;
      }

      .roster-card:hover {
        border-color: color-mix(
          in srgb,
          var(--m-accent, #d4ff00) 30%,
          var(--m-border, rgba(255, 255, 255, 0.08))
        );
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        transform: translateY(-2px);
      }

      .roster-card:focus-visible {
        outline: none;
        border-color: var(--m-accent, #d4ff00);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--m-accent, #d4ff00) 40%, transparent);
      }

      /* ─── IMAGE AREA ─── */
      .roster-card__image-wrap {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 1;
        overflow: hidden;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.06));
      }

      .roster-card__image {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .roster-card__image ::ng-deep img {
        width: 100%;
        height: 100%;
      }

      /* ─── CARD INFO ─── */
      .roster-card__name-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 6px;
      }

      .roster-card__jersey {
        font-size: 11px;
        font-weight: 700;
        color: var(--m-accent, #d4ff00);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        white-space: nowrap;
        flex-shrink: 0;
      }

      .roster-card__measurables {
        font-size: 11px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        margin: 2px 0 0;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .roster-card__sep {
        opacity: 0.4;
      }

      .roster-card__placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--m-text-3, rgba(255, 255, 255, 0.25));
      }

      .roster-card__views {
        position: absolute;
        bottom: 10px;
        right: 10px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 5px 10px;
        border-radius: 20px;
        background: rgba(0, 0, 0, 0.72);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        color: var(--m-accent, #d4ff00);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.03em;
        line-height: 1;
      }

      .roster-card__views strong {
        color: var(--m-text, #ffffff);
        font-weight: 800;
        font-size: 13px;
      }

      .roster-card__views span {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
      }

      /* ─── INFO AREA ─── */
      .roster-card__info {
        padding: 14px 16px 16px;
      }

      .roster-card__name {
        font-size: 16px;
        font-weight: 700;
        color: var(--m-text, #ffffff);
        margin: 0;
        line-height: 1.3;
      }

      .roster-card__position {
        font-size: 13px;
        font-weight: 500;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        margin: 2px 0 0;
        line-height: 1.3;
      }

      .roster-card__class {
        font-size: 13px;
        font-weight: 600;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
        margin: 2px 0 0;
        line-height: 1.3;
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

      /* ─── RESPONSIVE ─── */
      @media (max-width: 640px) {
        .team-roster__grid {
          grid-template-columns: 1fr;
          gap: 12px;
        }
      }

      @media (min-width: 1200px) {
        .team-roster__grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamRosterWebComponent {
  protected readonly teamProfile = inject(TeamProfileService);

  // ============================================
  // INPUTS
  // ============================================

  /** Active side tab — class year filter or 'all' */
  readonly activeSideTab = input.required<string>();

  // ============================================
  // OUTPUTS
  // ============================================

  readonly memberClick = output<TeamProfileRosterMember>();

  readonly invite = output<void>();
  readonly manageTeam = output<void>();

  // ============================================
  // COMPUTED
  // ============================================

  /** Roster sort options */
  protected readonly rosterSortOptions = Object.entries(TEAM_PROFILE_ROSTER_SORT_LABELS).map(
    ([value, label]) => ({ value, label })
  );

  /** Filtered roster based on active side tab (class year or 'all') */
  protected readonly filteredRoster = computed(() => {
    const sideTab = this.activeSideTab();
    const sorted = this.teamProfile.sortedRoster();

    if (!sideTab || sideTab === 'all') {
      return sorted;
    }

    // Side tab id is 'class-{year}' (e.g. 'class-2027'), member.classYear is '{year}' (e.g. '2027')
    const yearFilter = sideTab.startsWith('class-') ? sideTab.slice(6) : sideTab;
    return sorted.filter((m) => m.classYear === yearFilter);
  });

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onRosterSortChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.teamProfile.setRosterSort(target.value);
  }
}
