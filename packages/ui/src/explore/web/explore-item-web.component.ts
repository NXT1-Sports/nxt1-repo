/**
 * @fileoverview Explore Item Component — Web (Zero Ionic)
 * @module @nxt1/ui/explore/web
 * @version 1.0.0
 *
 * Renders a single explore result item (college, video, athlete, team).
 * Uses type-specific templates for optimal presentation.
 * Inline SVGs replace IonIcon; CSS hover/active replaces IonRippleEffect.
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 *
 * For mobile app, use ExploreItemComponent (Ionic variant) instead.
 */

import { Component, ChangeDetectionStrategy, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  type ExploreItem,
  type ExploreCollegeItem,
  type ExploreVideoItem,
  type ExploreAthleteItem,
  type ExploreTeamItem,
  formatSportDisplayName,
} from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtAvatarComponent } from '../../components/avatar';
import { NxtIconComponent } from '../../components/icon';
import { HapticsService } from '../../services/haptics/haptics.service';

/** SVG path data keyed by icon purpose */
const ICON_PATHS = {
  location:
    'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
  verified:
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  eye: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  heart:
    'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z',
} as const;

@Component({
  selector: 'nxt1-explore-item-web',
  standalone: true,
  imports: [CommonModule, NxtAvatarComponent, NxtIconComponent],
  template: `
    <div
      class="explore-item"
      [class.explore-item--college]="item().type === 'colleges'"
      [class.explore-item--video]="item().type === 'videos'"
      [class.explore-item--athlete]="item().type === 'athletes'"
      [class.explore-item--team]="item().type === 'teams'"
      (click)="handleClick()"
      role="article"
      [attr.data-testid]="testIds.LIST_ITEM"
      [attr.aria-label]="item().name"
    >
      <!-- College Item -->
      @if (item().type === 'colleges') {
        @let college = asCollege();
        <div class="item-avatar">
          <nxt1-avatar [src]="college.imageUrl" [name]="college.name" size="lg" />
        </div>
        <div class="item-content">
          <div class="item-header">
            <span class="item-name">{{ college.name }}</span>
          </div>
          <p class="item-subtitle">{{ college.division }} · {{ college.conference }}</p>
          <div class="item-meta">
            <span class="meta-item">
              <svg class="meta-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path [attr.d]="iconPaths.location" />
              </svg>
              {{ college.location }}
            </span>
          </div>
        </div>
        <div class="item-action">
          <nxt1-icon name="chevronRight" [size]="20" />
        </div>
      }

      <!-- Video Item -->
      @else if (item().type === 'videos') {
        @let video = asVideo();
        <div class="item-thumbnail">
          <img [src]="video.thumbnailUrl" [alt]="video.name" loading="lazy" />
          <span class="video-duration">{{ formatDuration(video.duration) }}</span>
        </div>
        <div class="item-content">
          <div class="item-header">
            <span class="item-name item-name--video">{{ video.name }}</span>
          </div>
          <p class="item-subtitle">{{ video.creator.name }}</p>
          <div class="item-meta">
            <span class="meta-item">
              <svg class="meta-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path [attr.d]="iconPaths.eye" />
              </svg>
              {{ formatViews(video.views) }}
            </span>
          </div>
        </div>
      }

      <!-- Athlete Item -->
      @else if (item().type === 'athletes') {
        @let athlete = asAthlete();
        <div class="item-avatar">
          <nxt1-avatar [src]="athlete.imageUrl" [name]="athlete.name" size="lg" />
        </div>
        <div class="item-content">
          <div class="item-header">
            <span class="item-name">{{ athlete.name }}</span>
            @if (athlete.isVerified) {
              <svg
                class="verified-badge"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-label="Verified"
              >
                <path [attr.d]="iconPaths.verified" />
              </svg>
            }
          </div>
          <p class="item-subtitle">
            {{ athlete.position }} · {{ formatSportDisplayName(athlete.sport) }}
          </p>
          <div class="item-meta">
            @if (athlete.team) {
              <span class="meta-item">{{ athlete.team }}</span>
            }
            @if (athlete.classYear) {
              <span class="meta-item">Class of {{ athlete.classYear }}</span>
            }
          </div>
        </div>
        <div class="item-action">
          <nxt1-icon name="chevronRight" [size]="20" />
        </div>
      }

      <!-- Team Item -->
      @else if (item().type === 'teams') {
        @let team = asTeam();
        <div class="item-avatar">
          <nxt1-avatar [src]="team.imageUrl" [name]="team.name" size="lg" />
        </div>
        <div class="item-content">
          <div class="item-header">
            <span class="item-name">{{ team.name }}</span>
            @if (team.isVerified) {
              <svg
                class="verified-badge"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-label="Verified"
              >
                <path [attr.d]="iconPaths.verified" />
              </svg>
            }
          </div>
          <p class="item-subtitle">
            {{ formatSportDisplayName(team.sport) }} · {{ team.location }}
          </p>
          <div class="item-meta">
            <span class="meta-item">{{ team.memberCount }} members</span>
            @if (team.record) {
              <span class="meta-item">{{ team.record }}</span>
            }
          </div>
        </div>
        <div class="item-action">
          <nxt1-icon name="chevronRight" [size]="20" />
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         EXPLORE ITEM (WEB) — Design Token CSS
         Zero Ionic, SSR-safe
         ============================================ */

      :host {
        display: block;
      }

      .explore-item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border-radius: var(--nxt1-radius-lg, 12px);
        cursor: pointer;
        position: relative;
        overflow: hidden;
        transition:
          background-color var(--nxt1-duration-fast, 150ms) ease,
          transform var(--nxt1-duration-fast, 150ms) ease;
      }

      .explore-item:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      }

      .explore-item:active {
        transform: scale(0.98);
      }

      .item-avatar {
        flex-shrink: 0;
      }

      .item-thumbnail {
        position: relative;
        flex-shrink: 0;
        width: 120px;
        height: 68px;
        border-radius: var(--nxt1-radius-md, 8px);
        overflow: hidden;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
      }

      .item-thumbnail img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .video-duration {
        position: absolute;
        bottom: 4px;
        right: 4px;
        padding: 2px 6px;
        background: rgba(0, 0, 0, 0.8);
        color: #fff;
        font-size: var(--nxt1-fontSize-2xs, 11px);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        border-radius: var(--nxt1-radius-sm, 4px);
      }

      .item-content {
        flex: 1;
        min-width: 0;
      }

      .item-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        margin-bottom: 2px;
      }

      .item-name {
        font-size: var(--nxt1-fontSize-sm, 15px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .item-name--video {
        white-space: normal;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        line-height: var(--nxt1-lineHeight-tight, 1.3);
      }

      .verified-badge {
        flex-shrink: 0;
        width: 14px;
        height: 14px;
        color: var(--nxt1-color-success, #30d158);
      }

      .item-subtitle {
        font-size: var(--nxt1-fontSize-xs, 13px);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 4px 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .item-meta {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        flex-wrap: wrap;
      }

      .meta-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: var(--nxt1-fontSize-2xs, 12px);
        color: var(--nxt1-color-text-tertiary);
      }

      .meta-icon {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
      }

      .item-action {
        flex-shrink: 0;
        color: var(--nxt1-color-text-tertiary);
        opacity: 0.5;
      }

      @media (prefers-reduced-motion: reduce) {
        .explore-item {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreItemWebComponent {
  private readonly haptics = inject(HapticsService);

  protected readonly testIds = TEST_IDS.EXPLORE;
  protected readonly formatSportDisplayName = formatSportDisplayName;

  // ============================================
  // INPUTS / OUTPUTS
  // ============================================

  readonly item = input.required<ExploreItem>();
  readonly itemClick = output<ExploreItem>();

  // ============================================
  // ICON PATHS (exposed to template)
  // ============================================

  protected readonly iconPaths = ICON_PATHS;

  // ============================================
  // TYPE-CAST HELPERS
  // ============================================

  protected asCollege(): ExploreCollegeItem {
    return this.item() as ExploreCollegeItem;
  }

  protected asVideo(): ExploreVideoItem {
    return this.item() as ExploreVideoItem;
  }

  protected asAthlete(): ExploreAthleteItem {
    return this.item() as ExploreAthleteItem;
  }

  protected asTeam(): ExploreTeamItem {
    return this.item() as ExploreTeamItem;
  }

  // ============================================
  // FORMATTERS
  // ============================================

  protected formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  protected formatViews(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected async handleClick(): Promise<void> {
    await this.haptics.impact('light');
    this.itemClick.emit(this.item());
  }
}
