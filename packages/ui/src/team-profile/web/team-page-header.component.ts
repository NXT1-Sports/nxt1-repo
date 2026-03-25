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
            [width]="56"
            [height]="56"
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
            <h1 class="team-name">{{ headerTeamName() }}</h1>
          </div>
          @if (headerSubtitle()) {
            <p class="team-subtitle">{{ headerSubtitle() }}</p>
          }
        </div>
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
        width: 56px;
        height: 56px;
        border-radius: var(--nxt1-radius-lg, 12px);
        flex-shrink: 0;
      }

      .team-logo-fallback {
        width: 56px;
        height: 56px;
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
          width: 44px;
          height: 44px;
        }

        .team-logo-fallback {
          width: 44px;
          height: 44px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamPageHeaderComponent {
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

    const typeLabel = TeamPageHeaderComponent.formatTeamTypeLabel(team.teamType);
    const sportLabel = team.sport?.trim() ? team.sport.trim() : '';

    return `${typeLabel} ${sportLabel}`.trim();
  });
}
