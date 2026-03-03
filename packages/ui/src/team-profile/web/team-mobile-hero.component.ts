/**
 * @fileoverview Team Mobile Hero Component
 * @module @nxt1/ui/team-profile/web
 * @version 1.0.0
 *
 * Mobile-only compact team identity hero block.
 * Displays: Back arrow, logo, team name, subtitle, follow, quick stats.
 *
 * Mirrors ProfileMobileHeroComponent architecture.
 *
 * ⭐ WEB ONLY (mobile viewport) — SSR-safe ⭐
 */
import { Component, ChangeDetectionStrategy, inject, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import { NxtBackButtonComponent } from '../../components/back-button';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-mobile-hero',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtImageComponent, NxtBackButtonComponent],
  template: `
    <div class="team-mobile-hero__inner">
      <nxt1-back-button
        class="team-mobile-hero__back"
        size="sm"
        variant="ghost"
        ariaLabel="Go back"
        (backClick)="back.emit()"
      />
      @if (teamProfile.team()?.logoUrl) {
        <nxt1-image
          class="team-mobile-hero__logo"
          [src]="teamProfile.team()!.logoUrl!"
          [alt]="teamProfile.team()!.teamName"
          [width]="48"
          [height]="48"
          variant="avatar"
          fit="contain"
          [priority]="true"
          [showPlaceholder]="false"
        />
      } @else {
        <div class="team-mobile-hero__logo-fallback">
          <nxt1-icon name="shield" [size]="24" />
        </div>
      }
      <div class="team-mobile-hero__text">
        <h1 class="team-mobile-hero__name">{{ headerTeamName() }}</h1>
        <p class="team-mobile-hero__meta">{{ headerSubtitle() }}</p>
      </div>
      <div class="team-mobile-hero__actions">
        @if (!teamProfile.isTeamAdmin()) {
          <button
            type="button"
            class="team-mobile-hero__follow-btn"
            [class.team-mobile-hero__follow-btn--following]="teamProfile.followStats()?.isFollowing"
            (click)="follow.emit()"
          >
            {{ teamProfile.followStats()?.isFollowing ? 'Following' : 'Follow' }}
          </button>
        }
      </div>
    </div>
    <!-- Quick Stats Row -->
    <div class="team-mobile-hero__stats">
      @if (teamProfile.recordDisplay()) {
        <div class="team-mobile-hero__stat">
          <span class="team-mobile-hero__stat-value">{{ teamProfile.recordDisplay() }}</span>
          <span class="team-mobile-hero__stat-label">Record</span>
        </div>
      }
      <div class="team-mobile-hero__stat">
        <span class="team-mobile-hero__stat-value">{{ teamProfile.rosterCount() }}</span>
        <span class="team-mobile-hero__stat-label">Athletes</span>
      </div>
      @if (teamProfile.followStats()) {
        <div class="team-mobile-hero__stat">
          <span class="team-mobile-hero__stat-value">{{
            teamProfile.followStats()!.followersCount
          }}</span>
          <span class="team-mobile-hero__stat-label">Followers</span>
        </div>
        @if (teamProfile.isTeamAdmin()) {
          <div class="team-mobile-hero__stat">
            <span class="team-mobile-hero__stat-value">{{
              teamProfile.followStats()!.followingCount ?? 0
            }}</span>
            <span class="team-mobile-hero__stat-label">Following</span>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 16px 16px 8px;
      }

      .team-mobile-hero__inner {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .team-mobile-hero__back {
        flex-shrink: 0;
      }

      .team-mobile-hero__logo {
        width: 48px;
        height: 48px;
        border-radius: 10px;
      }

      .team-mobile-hero__logo-fallback {
        width: 48px;
        height: 48px;
        border-radius: 10px;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
      }

      .team-mobile-hero__text {
        flex: 1;
        min-width: 0;
      }

      .team-mobile-hero__name {
        font-size: 17px;
        font-weight: 800;
        color: var(--m-text, #ffffff);
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .team-mobile-hero__meta {
        font-size: 12px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
        margin: 2px 0 0;
      }

      .team-mobile-hero__actions {
        flex-shrink: 0;
      }

      .team-mobile-hero__follow-btn {
        padding: 6px 14px;
        border-radius: 999px;
        border: 1px solid var(--m-accent, var(--nxt1-color-primary, #d4ff00));
        background: color-mix(
          in srgb,
          var(--m-accent, var(--nxt1-color-primary, #d4ff00)) 10%,
          transparent
        );
        color: var(--m-accent, var(--nxt1-color-primary, #d4ff00));
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      .team-mobile-hero__follow-btn--following {
        border-color: var(--m-border, rgba(255, 255, 255, 0.08));
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        color: var(--m-text-2, rgba(255, 255, 255, 0.7));
      }

      .team-mobile-hero__stats {
        display: flex;
        gap: 24px;
        padding: 12px 0 4px;
        justify-content: center;
      }

      .team-mobile-hero__stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .team-mobile-hero__stat-value {
        font-size: 16px;
        font-weight: 800;
        color: var(--m-text, #ffffff);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
      }

      .team-mobile-hero__stat-label {
        font-size: 10px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamMobileHeroComponent {
  protected readonly teamProfile = inject(TeamProfileService);

  private static formatTeamTypeLabel(teamType?: string): string {
    if (!teamType) return '';
    return teamType
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  // ============================================
  // OUTPUTS
  // ============================================

  readonly back = output<void>();
  readonly follow = output<void>();

  protected readonly headerTeamName = computed(() => {
    const team = this.teamProfile.team();
    if (!team) return '';

    const teamName = team.teamName?.trim() ?? '';
    if (!teamName) return '';

    const sport = team.sport?.trim();
    const withoutHighSchool = teamName.replace(/\bhigh\s+school\b/gi, '').trim();
    const withoutSport = sport
      ? withoutHighSchool
          .replace(new RegExp(`\\b${sport.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'gi'), '')
          .trim()
      : withoutHighSchool;

    const baseName = withoutSport.replace(/\s{2,}/g, ' ').trim();
    const cleanName = baseName || teamName;

    const mascot = team.branding?.mascot?.trim();
    if (!mascot) return cleanName;

    const mascotLower = mascot.toLowerCase();
    if (cleanName.toLowerCase().endsWith(mascotLower)) return cleanName;

    return `${cleanName} ${mascot}`;
  });

  // ============================================
  // COMPUTED
  // ============================================

  /** Header subtitle: Team type + sport (for example: "High School football") */
  protected readonly headerSubtitle = computed(() => {
    const team = this.teamProfile.team();
    if (!team) return '';

    const typeLabel = TeamMobileHeroComponent.formatTeamTypeLabel(team.teamType);
    const sportLabel = team.sport?.trim() ? team.sport.trim() : '';

    return `${typeLabel} ${sportLabel}`.trim();
  });
}
