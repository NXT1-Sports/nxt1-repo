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
import type { TeamProfileRosterMember } from '@nxt1/core';
import { TEAM_PROFILE_ROSTER_SORT_LABELS } from '@nxt1/core';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-roster-web',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
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
        <div class="team-roster__list">
          @for (member of filteredRoster(); track member.id) {
            <button
              type="button"
              class="team-roster__member"
              (click)="memberClick.emit(member)"
              [attr.aria-label]="'View profile for ' + member.displayName"
            >
              <span class="team-roster__number">{{ member.jerseyNumber ?? '—' }}</span>
              <div class="team-roster__member-info">
                <div class="team-roster__member-name">
                  {{ member.displayName }}
                  @if (member.isVerified) {
                    <nxt1-icon name="checkmark-circle" [size]="14" class="team-roster__verified" />
                  }
                </div>
                <span class="team-roster__member-meta">
                  {{ member.position ?? '' }}
                  @if (member.classYear) {
                    · Class of {{ member.classYear }}
                  }
                </span>
              </div>
              @if (member.height || member.weight) {
                <span class="team-roster__member-size">
                  {{ member.height ?? '' }}
                  @if (member.height && member.weight) {
                    /
                  }
                  {{ member.weight ?? '' }}
                </span>
              }
              <nxt1-icon name="chevron-forward" [size]="16" class="team-roster__chevron" />
            </button>
          }
        </div>
      } @else {
        <div class="team-empty-state">
          <nxt1-icon name="people" [size]="40" />
          <h3>No roster members</h3>
          <p>Athletes will appear here when they join the team.</p>
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
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }

      .team-roster__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
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

      .team-roster__list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .team-roster__member {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        border-radius: 10px;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        border: 1px solid transparent;
        cursor: pointer;
        width: 100%;
        text-align: left;
        transition:
          background 0.12s,
          border-color 0.12s;
      }

      .team-roster__member:hover {
        background: var(--m-surface-2, rgba(255, 255, 255, 0.08));
        border-color: var(--m-border, rgba(255, 255, 255, 0.08));
      }

      .team-roster__number {
        font-size: 18px;
        font-weight: 800;
        color: var(--m-accent, var(--nxt1-color-primary, #d4ff00));
        width: 32px;
        text-align: center;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
      }

      .team-roster__member-info {
        flex: 1;
        min-width: 0;
      }

      .team-roster__member-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--m-text, #ffffff);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .team-roster__verified {
        color: var(--m-accent, var(--nxt1-color-primary, #d4ff00));
      }

      .team-roster__member-meta {
        font-size: 12px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
      }

      .team-roster__member-size {
        font-size: 12px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        white-space: nowrap;
      }

      .team-roster__chevron {
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        flex-shrink: 0;
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

    return sorted.filter((m) => m.classYear === sideTab);
  });

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onRosterSortChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.teamProfile.setRosterSort(target.value);
  }
}
