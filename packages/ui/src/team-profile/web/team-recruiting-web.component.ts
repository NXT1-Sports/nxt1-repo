/**
 * @fileoverview Team Recruiting Web Component
 * @module @nxt1/ui/team-profile/web
 * @version 1.0.0
 *
 * Recruiting tab content for team profile.
 * Displays recruiting activity — commitments, offers, visits.
 *
 * ⭐ WEB ONLY — SSR-safe ⭐
 */
import { Component, ChangeDetectionStrategy, inject, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import type { TeamProfileRecruitingActivity } from '@nxt1/core';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-recruiting-web',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtImageComponent],
  template: `
    <div class="team-recruiting">
      <h2 class="team-section__title">Recruiting Activity</h2>
      @if (filteredActivity().length > 0) {
        <div class="team-recruiting__list">
          @for (activity of filteredActivity(); track activity.id) {
            <button
              type="button"
              class="team-recruiting__card"
              (click)="activityClick.emit(activity)"
            >
              <div class="team-recruiting__avatar">
                @if (activity.athleteProfileImg) {
                  <nxt1-image
                    [src]="activity.athleteProfileImg"
                    [alt]="activity.athleteName"
                    [width]="44"
                    [height]="44"
                    fit="cover"
                  />
                } @else {
                  <nxt1-icon name="person" [size]="24" />
                }
              </div>
              <div class="team-recruiting__info">
                <span class="team-recruiting__name">
                  {{ activity.athleteName }}
                </span>
                @if (activity.position) {
                  <span class="team-recruiting__position">
                    {{ activity.position }}
                  </span>
                }
                @if (activity.highSchool) {
                  <span class="team-recruiting__school">
                    {{ activity.highSchool }}
                  </span>
                }
              </div>
              <div class="team-recruiting__badge team-recruiting__badge--{{ activity.category }}">
                {{ formatActivityType(activity.category) }}
              </div>
              @if (activity.date) {
                <span class="team-recruiting__date">
                  {{ formatDate(activity.date) }}
                </span>
              }
            </button>
          }
        </div>
      } @else {
        <div class="team-empty-state">
          <nxt1-icon name="school" [size]="40" />
          <h3>No recruiting activity</h3>
          <p>Recruiting commitments, offers, and visits will appear here.</p>
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

      .team-recruiting__list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .team-recruiting__card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
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

      .team-recruiting__card:hover {
        background: var(--m-surface-2, rgba(255, 255, 255, 0.08));
        border-color: var(--m-border, rgba(255, 255, 255, 0.08));
      }

      .team-recruiting__avatar {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.08));
        overflow: hidden;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
      }

      .team-recruiting__info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .team-recruiting__name {
        font-size: 14px;
        font-weight: 700;
        color: var(--m-text, #ffffff);
      }

      .team-recruiting__position {
        font-size: 12px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
      }

      .team-recruiting__school {
        font-size: 11px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
      }

      .team-recruiting__badge {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 4px 10px;
        border-radius: 6px;
        flex-shrink: 0;
      }

      .team-recruiting__badge--commitment {
        background: rgba(76, 175, 80, 0.18);
        color: #66bb6a;
      }

      .team-recruiting__badge--offer {
        background: rgba(33, 150, 243, 0.18);
        color: #42a5f5;
      }

      .team-recruiting__badge--visit {
        background: rgba(255, 152, 0, 0.18);
        color: #ffa726;
      }

      .team-recruiting__badge--decommitment {
        background: rgba(244, 67, 54, 0.18);
        color: #ef5350;
      }

      .team-recruiting__date {
        font-size: 11px;
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
export class TeamRecruitingWebComponent {
  protected readonly teamProfile = inject(TeamProfileService);

  // ============================================
  // INPUTS
  // ============================================

  /** Active side tab section — 'all-activity', 'commitments', 'offers', 'visits' */
  readonly activeSection = input<string>('all-activity');

  // ============================================
  // OUTPUTS
  // ============================================

  readonly activityClick = output<TeamProfileRecruitingActivity>();

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly filteredActivity = computed(() => {
    const section = this.activeSection();
    const all = this.teamProfile.recruitingActivity();

    if (!section || section === 'all-activity') {
      return all;
    }

    // Map side tab to type: 'commitments' → 'commitment', 'offers' → 'offer', etc.
    const typeMap: Record<string, string> = {
      commitments: 'commitment',
      offers: 'offer',
      visits: 'visit',
    };

    const filtered = typeMap[section];
    if (!filtered) return all;

    return all.filter((a) => a.category.includes(filtered));
  });

  // ============================================
  // HELPERS
  // ============================================

  protected formatActivityType(type: string): string {
    const labels: Record<string, string> = {
      commitment: 'Committed',
      offer: 'Offer',
      visit: 'Visit',
      decommitment: 'Decommit',
    };
    return labels[type] ?? type;
  }

  protected formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
