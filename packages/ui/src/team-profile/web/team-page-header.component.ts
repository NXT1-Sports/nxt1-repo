/**
 * @fileoverview Team Page Header Component - Desktop
 * @module @nxt1/ui/team-profile/web
 * @version 1.0.0
 *
 * Extracted desktop header for team profile page.
 * Displays: Back arrow, team logo, team name, subtitle, follow button.
 *
 * Mirrors ProfilePageHeaderComponent architecture.
 *
 * ⭐ WEB ONLY — SSR-safe, pure Tailwind ⭐
 */
import { Component, ChangeDetectionStrategy, inject, computed, output } from '@angular/core';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import { NxtBackButtonComponent } from '../../components/back-button';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-page-header',
  standalone: true,
  imports: [NxtIconComponent, NxtImageComponent, NxtBackButtonComponent],
  template: `
    <div class="team-page-header">
      <div class="team-page-header__left">
        <nxt1-back-button
          class="team-page-header__back"
          size="md"
          variant="ghost"
          ariaLabel="Go back"
          (backClick)="back.emit()"
        />
        <div class="team-page-header__identity">
          @if (teamProfile.team()?.logoUrl) {
            <nxt1-image
              class="team-page-header__logo"
              [src]="teamProfile.team()!.logoUrl!"
              [alt]="teamProfile.team()!.teamName"
              [width]="56"
              [height]="56"
              variant="avatar"
              fit="contain"
              [priority]="true"
              [showPlaceholder]="false"
            />
          } @else {
            <div class="team-page-header__logo-fallback">
              <nxt1-icon name="shield" [size]="28" />
            </div>
          }
          <div class="team-page-header__text">
            <h1 class="team-page-header__name">{{ teamProfile.team()?.teamName }}</h1>
            <p class="team-page-header__meta">{{ headerSubtitle() }}</p>
          </div>
        </div>
      </div>
      <div class="team-page-header__actions">
        @if (!teamProfile.isTeamAdmin()) {
          <button
            type="button"
            class="team-page-header__follow-btn"
            [class.team-page-header__follow-btn--following]="teamProfile.followStats()?.isFollowing"
            (click)="follow.emit()"
          >
            <nxt1-icon
              [name]="teamProfile.followStats()?.isFollowing ? 'checkmark' : 'add'"
              [size]="16"
            />
            {{ teamProfile.followStats()?.isFollowing ? 'Following' : 'Follow' }}
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .team-page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 24px 12px;
        gap: 16px;
      }

      .team-page-header__left {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .team-page-header__back {
        flex-shrink: 0;
      }

      .team-page-header__identity {
        display: flex;
        align-items: center;
        gap: 14px;
      }

      .team-page-header__logo {
        width: 56px;
        height: 56px;
        border-radius: 12px;
      }

      .team-page-header__logo-fallback {
        width: 56px;
        height: 56px;
        border-radius: 12px;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
      }

      .team-page-header__text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .team-page-header__name {
        font-size: 22px;
        font-weight: 800;
        color: var(--m-text, #ffffff);
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        letter-spacing: -0.01em;
      }

      .team-page-header__meta {
        font-size: 13px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
        margin: 0;
      }

      .team-page-header__actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .team-page-header__follow-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 999px;
        border: 1px solid var(--m-accent, var(--nxt1-color-primary, #d4ff00));
        background: color-mix(
          in srgb,
          var(--m-accent, var(--nxt1-color-primary, #d4ff00)) 10%,
          transparent
        );
        color: var(--m-accent, var(--nxt1-color-primary, #d4ff00));
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s;
      }

      .team-page-header__follow-btn:hover {
        background: color-mix(
          in srgb,
          var(--m-accent, var(--nxt1-color-primary, #d4ff00)) 20%,
          transparent
        );
      }

      .team-page-header__follow-btn--following {
        border-color: var(--m-border, rgba(255, 255, 255, 0.08));
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamPageHeaderComponent {
  protected readonly teamProfile = inject(TeamProfileService);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly back = output<void>();
  readonly follow = output<void>();

  // ============================================
  // COMPUTED
  // ============================================

  /** Header subtitle: sport · location · conference · record */
  protected readonly headerSubtitle = computed(() => {
    const team = this.teamProfile.team();
    if (!team) return '';
    const parts: string[] = [];
    if (team.sport) parts.push(team.sport);
    if (team.location) parts.push(team.location);
    if (team.conference) parts.push(team.conference);
    const record = this.teamProfile.recordDisplay();
    if (record) parts.push(record);
    return parts.join(' · ');
  });
}
