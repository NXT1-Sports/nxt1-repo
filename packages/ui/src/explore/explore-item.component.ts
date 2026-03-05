/**
 * @fileoverview Explore Item Component - Single Search Result
 * @module @nxt1/ui/explore
 * @version 1.0.0
 *
 * Renders a single explore result item (college, video, athlete, team).
 * Uses type-specific templates for optimal presentation.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <nxt1-explore-item
 *   [item]="item"
 *   (itemClick)="onItemClick(item)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  locationOutline,
  checkmarkCircle,
  eyeOutline,
  heartOutline,
  chevronForward,
} from 'ionicons/icons';
import {
  type ExploreItem,
  type ExploreCollegeItem,
  type ExploreVideoItem,
  type ExploreAthleteItem,
  type ExploreTeamItem,
  formatSportDisplayName,
} from '@nxt1/core';
import { NxtAvatarComponent } from '../components/avatar';
import { NxtIconComponent } from '../components/icon';
import { HapticsService } from '../services/haptics/haptics.service';

@Component({
  selector: 'nxt1-explore-item',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect, NxtAvatarComponent, NxtIconComponent],
  template: `
    <div
      class="explore-item"
      [class.explore-item--college]="item().type === 'colleges'"
      [class.explore-item--video]="item().type === 'videos'"
      [class.explore-item--athlete]="item().type === 'athletes'"
      [class.explore-item--team]="item().type === 'teams'"
      (click)="handleClick()"
      role="article"
      [attr.aria-label]="item().name"
    >
      <ion-ripple-effect></ion-ripple-effect>

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
          <p class="item-subtitle">{{ college.division }} • {{ college.conference }}</p>
          <div class="item-meta">
            <span class="meta-item">
              <ion-icon name="location-outline" />
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
          <img [src]="video.thumbnailUrl" [alt]="video.name" />
          <span class="video-duration">{{ formatDuration(video.duration) }}</span>
        </div>
        <div class="item-content">
          <div class="item-header">
            <span class="item-name item-name--video">{{ video.name }}</span>
          </div>
          <p class="item-subtitle">{{ video.creator.name }}</p>
          <div class="item-meta">
            <span class="meta-item">
              <ion-icon name="eye-outline" />
              {{ formatViews(video.views) }}
            </span>
            <span class="meta-item">
              <ion-icon name="heart-outline" />
              {{ formatViews(video.likes) }}
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
              <ion-icon name="checkmark-circle" class="verified-badge" />
            }
          </div>
          <p class="item-subtitle">
            {{ athlete.position }} • {{ formatSportDisplayName(athlete.sport) }}
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
              <ion-icon name="checkmark-circle" class="verified-badge" />
            }
          </div>
          <p class="item-subtitle">
            {{ formatSportDisplayName(team.sport) }} • {{ team.location }}
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
      :host {
        display: block;
        --item-bg: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        --item-bg-hover: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        --item-border: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        --item-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --item-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --item-text-muted: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --item-primary: var(--nxt1-color-primary, #ccff00);
        --item-success: var(--nxt1-color-success, #30d158);
      }

      :host-context(.light),
      :host-context([data-theme='light']) {
        --item-bg: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.02));
        --item-bg-hover: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.04));
        --item-border: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.08));
        --item-text-primary: var(--nxt1-color-text-primary, #1a1a1a);
        --item-text-secondary: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        --item-text-muted: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.5));
      }

      .explore-item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px);
        background: var(--item-bg);
        border-radius: var(--nxt1-radius-lg, 12px);
        cursor: pointer;
        position: relative;
        overflow: hidden;
        transition: background-color 0.2s ease;
      }

      .explore-item:hover {
        background: var(--item-bg-hover);
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
        background: var(--item-bg);
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
        font-size: 11px;
        font-weight: 500;
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
        font-size: 15px;
        font-weight: 600;
        color: var(--item-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .item-name--video {
        white-space: normal;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        line-height: 1.3;
      }

      .verified-badge {
        flex-shrink: 0;
        font-size: 14px;
        color: var(--item-success);
      }

      .item-subtitle {
        font-size: 13px;
        color: var(--item-text-secondary);
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
        font-size: 12px;
        color: var(--item-text-muted);
      }

      .meta-item ion-icon {
        font-size: 12px;
      }

      .item-action {
        flex-shrink: 0;
        color: var(--item-text-muted);
        opacity: 0.5;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreItemComponent {
  protected readonly formatSportDisplayName = formatSportDisplayName;

  constructor() {
    addIcons({
      locationOutline,
      checkmarkCircle,
      eyeOutline,
      heartOutline,
      chevronForward,
    });
  }

  private readonly haptics = inject(HapticsService);

  readonly item = input.required<ExploreItem>();
  readonly itemClick = output<ExploreItem>();

  /** Type-cast helpers for template */
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

  protected async handleClick(): Promise<void> {
    await this.haptics.impact('light');
    this.itemClick.emit(this.item());
  }
}
