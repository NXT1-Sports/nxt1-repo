/**
 * @fileoverview Team Page Header Component - Desktop
 * @module @nxt1/ui/team-profile/web
 * @version 2.0.0
 *
 * Desktop header for team profile pages.
 * Uses the shared `NxtEntityPageHeaderComponent` for structural layout
 * (row flex, back button, gap, padding) and projects team-specific
 * content into the identity and trailing slots.
 *
 * Displays: Back arrow → [Logo + Team Name + Subtitle] → [Follow Button]
 *
 * Layout is pixel-aligned with `ProfilePageHeaderComponent` because
 * both delegate their flex row to the same shared entity header shell.
 *
 * ⭐ WEB ONLY — SSR-safe, design-token-based ⭐
 */
import { Component, ChangeDetectionStrategy, inject, computed, output } from '@angular/core';
import { NxtEntityPageHeaderComponent } from '../../components/entity-page-header';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import { TeamProfileService } from '../team-profile.service';

@Component({
  selector: 'nxt1-team-page-header',
  standalone: true,
  imports: [NxtEntityPageHeaderComponent, NxtIconComponent, NxtImageComponent],
  template: `
    <nxt1-entity-page-header backAriaLabel="Go back" (back)="back.emit()">
      <!-- ═══ IDENTITY: Team logo + name + subtitle ═══ -->
      <div headerIdentity class="team-identity">
        @if (teamProfile.team()?.logoUrl) {
          <nxt1-image
            class="team-logo"
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
          <div class="team-logo-fallback">
            <nxt1-icon name="shield" [size]="24" />
          </div>
        }
        <div class="team-name-block">
          <div class="team-name-row">
            <h1 class="team-name">{{ teamProfile.team()?.teamName }}</h1>
          </div>
          @if (headerSubtitle()) {
            <p class="team-subtitle">{{ headerSubtitle() }}</p>
          }
        </div>
      </div>

      <!-- ═══ TRAILING: Follow stats + button ═══ -->
      <div headerTrailing class="team-trailing">
        <div class="team-follow-stats">
          <button type="button" class="team-stat">
            <span class="team-stat-count">{{ followersCount() }}</span>
            <span class="team-stat-label">Followers</span>
          </button>
        </div>
        @if (!teamProfile.isTeamAdmin()) {
          <button
            type="button"
            class="follow-btn"
            [class.follow-btn--following]="teamProfile.followStats()?.isFollowing"
            (click)="follow.emit()"
            [attr.aria-label]="
              teamProfile.followStats()?.isFollowing ? 'Unfollow team' : 'Follow team'
            "
          >
            <nxt1-icon
              [name]="teamProfile.followStats()?.isFollowing ? 'checkmark' : 'plus'"
              [size]="13"
            />
            {{ teamProfile.followStats()?.isFollowing ? 'Following' : 'Follow' }}
          </button>
        }
      </div>
    </nxt1-entity-page-header>
  `,
  styles: [
    `
      /* ============================================
         HOST — delegate layout to NxtEntityPageHeaderComponent
         ============================================ */
      :host {
        display: block;
      }

      /* ============================================
         IDENTITY — logo + name block
         ============================================ */
      .team-identity {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        min-width: 0;
      }

      .team-logo {
        width: 48px;
        height: 48px;
        border-radius: var(--nxt1-radius-lg, 12px);
        flex-shrink: 0;
      }

      .team-logo-fallback {
        width: 48px;
        height: 48px;
        border-radius: var(--nxt1-radius-lg, 12px);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-tertiary);
        flex-shrink: 0;
      }

      .team-name-block {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .team-name-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        min-width: 0;
      }

      .team-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-tight);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin: 0 0 var(--nxt1-spacing-0-5) 0;
      }

      .team-subtitle {
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-normal);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin: 0;
      }

      /* ============================================
         TRAILING — pushed right in the entity header flex row
         ============================================ */
      .team-trailing {
        flex-shrink: 0;
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4, 16px);
      }

      /* ============================================
         FOLLOW STATS — Followers count
         ============================================ */
      .team-follow-stats {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4, 16px);
      }
      .team-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        line-height: 1;
      }
      .team-stat:hover .team-stat-count {
        color: var(--nxt1-color-primary);
      }
      .team-stat-count {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg, 18px);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        transition: color 0.15s ease;
      }
      .team-stat-label {
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-tertiary);
        letter-spacing: 0.04em;
      }

      /* ============================================
         FOLLOW BUTTON — matches profile header style
         ============================================ */
      .follow-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        flex-shrink: 0;
        border: 1.5px solid var(--nxt1-color-primary);
        background: color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
        color: var(--nxt1-color-primary);
        border-radius: var(--nxt1-radius-md, 8px);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 13px;
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: 0.01em;
        line-height: 1;
        padding: 7px 16px;
        cursor: pointer;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        transition:
          transform 0.1s ease,
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;
      }

      .follow-btn:hover {
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-bg-primary);
        border-color: var(--nxt1-color-primary);
      }

      .follow-btn:active {
        transform: scale(0.97);
      }

      .follow-btn:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .follow-btn--following {
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        color: var(--nxt1-color-text-secondary);
      }

      .follow-btn--following:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        color: var(--nxt1-color-text-primary);
        border-color: var(--nxt1-color-border-default);
      }

      /* ============================================
         RESPONSIVE
         ============================================ */
      @media (max-width: 900px) {
        .team-name {
          font-size: var(--nxt1-fontSize-xl);
        }

        .team-subtitle {
          font-size: var(--nxt1-fontSize-sm);
        }

        .team-logo {
          width: 40px;
          height: 40px;
        }

        .team-logo-fallback {
          width: 40px;
          height: 40px;
        }
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
  // FOLLOW STATS
  // ============================================

  protected readonly followersCount = computed(
    () => this.teamProfile.followStats()?.followersCount ?? 0
  );

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
