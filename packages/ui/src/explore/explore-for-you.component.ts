/**
 * @fileoverview Explore "For You" Landing Component — Mobile (Ionic)
 * @module @nxt1/ui/explore
 * @version 1.0.0
 *
 * Multi-category curated overview displayed as the default explore landing view.
 * Shows personalized sections for athletes, colleges, teams, videos, and more
 * using placeholder mock data to demonstrate the visual hierarchy.
 *
 * ⭐ MOBILE ONLY — Uses Ionic components and design tokens ⭐
 *
 * For web app, use ExploreForYouWebComponent instead.
 *
 * Design Goals:
 * - Visually stunning entry point to the explore feature
 * - No tab pre-selected; showcases content from ALL categories
 * - Smooth horizontal scroll rows per category
 * - Personalized "For You" sections within each category strip
 * - Fully design-token driven (zero hard-coded values)
 * - Accessible with ARIA labels and roles
 * - Respects prefers-reduced-motion
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  sparklesOutline,
  chevronForwardOutline,
  schoolOutline,
  personOutline,
  peopleOutline,
  playCircleOutline,
  calendarOutline,
  trophyOutline,
  heartOutline,
  eyeOutline,
  checkmarkCircle,
} from 'ionicons/icons';
import type { ExploreItem, ExploreTabId } from '@nxt1/core';
import { MOCK_ATHLETES, MOCK_COLLEGES, MOCK_TEAMS, MOCK_VIDEOS } from './explore.mock-data';
import { NxtAvatarComponent } from '../components/avatar';
import type { ExploreUser } from './explore-shell.component';

@Component({
  selector: 'nxt1-explore-for-you',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect, NxtAvatarComponent],
  template: `
    <section class="for-you" aria-label="For You — personalized explore">
      <!-- ── Trending Athletes ─────────────────────────────── -->
      <div class="section">
        <div class="section__header">
          <h2 class="section__title">Trending Athletes</h2>
          <button
            type="button"
            class="section__see-all"
            aria-label="See all athletes"
            (click)="onSeeAllTap('athletes')"
          >
            See All
            <ion-icon name="chevron-forward-outline" aria-hidden="true" />
          </button>
        </div>
        <div class="h-scroll" role="list" aria-label="Trending athletes">
          @for (athlete of trendingAthletes(); track athlete.id) {
            <button
              class="athlete-card"
              type="button"
              role="listitem"
              [attr.aria-label]="athlete.name + ', ' + athlete.subtitle"
              (click)="onItemTap(athlete)"
            >
              <ion-ripple-effect></ion-ripple-effect>
              <div class="athlete-card__avatar">
                <nxt1-avatar [src]="athlete.imageUrl" [name]="athlete.name" size="xl" />
                @if (athlete.isVerified) {
                  <span class="athlete-card__verified" aria-label="Verified">
                    <ion-icon name="checkmark-circle" aria-hidden="true" />
                  </span>
                }
              </div>
              <p class="athlete-card__name">{{ athlete.name }}</p>
              <p class="athlete-card__meta">{{ athlete.sport }}</p>
              @if (athlete.commitment) {
                <span class="athlete-card__committed">Committed</span>
              }
            </button>
          }
        </div>
      </div>

      <!-- ── Top Colleges ──────────────────────────────────── -->
      <div class="section">
        <div class="section__header">
          <h2 class="section__title">Top Colleges</h2>
          <button
            type="button"
            class="section__see-all"
            aria-label="See all colleges"
            (click)="onSeeAllTap('colleges')"
          >
            See All
            <ion-icon name="chevron-forward-outline" aria-hidden="true" />
          </button>
        </div>
        <div class="h-scroll" role="list" aria-label="Top colleges">
          @for (college of topColleges(); track college.id) {
            <button
              class="college-card"
              type="button"
              role="listitem"
              [attr.aria-label]="college.name + ', ' + college.division"
              (click)="onItemTap(college)"
            >
              <ion-ripple-effect></ion-ripple-effect>
              <div class="college-card__logo">
                <nxt1-avatar [src]="college.imageUrl" [name]="college.name" size="lg" />
              </div>
              <div class="college-card__info">
                <p class="college-card__name">{{ college.name }}</p>
                <p class="college-card__meta">{{ college.division }}</p>
                @if (college.conference) {
                  <p class="college-card__conference">{{ college.conference }}</p>
                }
              </div>
              <ion-icon
                name="chevron-forward-outline"
                class="college-card__arrow"
                aria-hidden="true"
              />
            </button>
          }
        </div>
      </div>

      <!-- ── Latest Videos ─────────────────────────────────── -->
      <div class="section">
        <div class="section__header">
          <h2 class="section__title">Latest Videos</h2>
          <button
            type="button"
            class="section__see-all"
            aria-label="See all videos"
            (click)="onSeeAllTap('videos')"
          >
            See All
            <ion-icon name="chevron-forward-outline" aria-hidden="true" />
          </button>
        </div>
        <div class="h-scroll h-scroll--videos" role="list" aria-label="Latest videos">
          @for (video of latestVideos(); track video.id) {
            <button
              class="video-card"
              type="button"
              role="listitem"
              [attr.aria-label]="video.name + ' by ' + video.creator.name"
              (click)="onItemTap(video)"
            >
              <ion-ripple-effect></ion-ripple-effect>
              <div class="video-card__thumb">
                <img
                  [src]="video.thumbnailUrl"
                  [alt]="video.name"
                  loading="lazy"
                  class="video-card__img"
                />
                <span class="video-card__duration" aria-label="Duration">
                  {{ formatDuration(video.duration) }}
                </span>
                <div class="video-card__play" aria-hidden="true">
                  <ion-icon name="play-circle-outline" />
                </div>
              </div>
              <div class="video-card__info">
                <p class="video-card__title">{{ video.name }}</p>
                <div class="video-card__stats">
                  <span class="video-card__stat">
                    <ion-icon name="eye-outline" aria-hidden="true" />
                    {{ formatCount(video.views) }}
                  </span>
                  <span class="video-card__stat">
                    <ion-icon name="heart-outline" aria-hidden="true" />
                    {{ formatCount(video.likes) }}
                  </span>
                </div>
              </div>
            </button>
          }
        </div>
      </div>

      <!-- ── Top Teams ─────────────────────────────────────── -->
      <div class="section section--last">
        <div class="section__header">
          <h2 class="section__title">Top Teams</h2>
          <button
            type="button"
            class="section__see-all"
            aria-label="See all teams"
            (click)="onSeeAllTap('teams')"
          >
            See All
            <ion-icon name="chevron-forward-outline" aria-hidden="true" />
          </button>
        </div>
        <div class="team-list" role="list" aria-label="Top teams">
          @for (team of topTeams(); track team.id) {
            <button
              class="team-row"
              type="button"
              role="listitem"
              [attr.aria-label]="team.name + ', ' + team.sport"
              (click)="onItemTap(team)"
            >
              <ion-ripple-effect></ion-ripple-effect>
              <nxt1-avatar [src]="team.imageUrl" [name]="team.name" size="md" />
              <div class="team-row__info">
                <p class="team-row__name">{{ team.name }}</p>
                <p class="team-row__meta">{{ team.sport }} · {{ team.location }}</p>
              </div>
              @if (team.record) {
                <span class="team-row__record">{{ team.record }}</span>
              }
              <ion-icon name="chevron-forward-outline" class="team-row__arrow" aria-hidden="true" />
            </button>
          }
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      /* ============================================================
         EXPLORE FOR YOU — Mobile / Ionic
         Design token driven, zero hard-coded values.
         All spacing, color, typography via CSS custom properties.
         ============================================================ */

      :host {
        display: block;

        --fy-bg: var(--nxt1-color-bg-primary, #0a0a0a);
        --fy-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.03));
        --fy-surface-hover: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        --fy-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --fy-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --fy-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --fy-text-muted: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        --fy-primary: var(--nxt1-color-primary, #ccff00);
        --fy-primary-on: var(--nxt1-color-on-primary, #000000);
        --fy-success: var(--nxt1-color-success, #30d158);
        --fy-radius-sm: var(--nxt1-radius-sm, 8px);
        --fy-radius-md: var(--nxt1-radius-md, 12px);
        --fy-radius-lg: var(--nxt1-radius-lg, 16px);
        --fy-radius-full: var(--nxt1-radius-full, 9999px);
        --fy-duration-fast: var(--nxt1-duration-fast, 150ms);
        --fy-duration-base: var(--nxt1-duration-base, 250ms);
      }

      /* ── FOR YOU WRAPPER ── */

      .for-you {
        padding-bottom: var(--nxt1-spacing-10, 40px);
      }

      /* ── SECTION ── */

      .section {
        padding: var(--nxt1-spacing-5, 20px) 0 0;
      }

      .section--last {
        padding-bottom: var(--nxt1-spacing-4, 16px);
      }

      .section__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-3, 12px);
      }

      .section__title {
        font-size: var(--nxt1-fontSize-base, 16px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--fy-text-primary);
        letter-spacing: -0.2px;
      }

      .section__see-all {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--fy-primary);
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        -webkit-tap-highlight-color: transparent;
      }

      .section__see-all ion-icon {
        font-size: 14px;
        opacity: 0.8;
      }

      /* ── HORIZONTAL SCROLL ── */

      .h-scroll {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-4, 16px);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .h-scroll::-webkit-scrollbar {
        display: none;
      }

      /* ── ATHLETE CARDS ── */

      .athlete-card {
        position: relative;
        overflow: hidden;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        width: 100px;
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-2, 8px);
        background: var(--fy-surface);
        border: 1px solid var(--fy-border);
        border-radius: var(--fy-radius-md);
        cursor: pointer;
        scroll-snap-align: start;
        -webkit-tap-highlight-color: transparent;
        transition:
          background-color var(--fy-duration-fast) ease,
          transform var(--fy-duration-fast) ease;
      }

      .athlete-card:hover {
        background: var(--fy-surface-hover);
      }

      .athlete-card:active {
        transform: scale(0.96);
      }

      .athlete-card__avatar {
        position: relative;
        margin-bottom: var(--nxt1-spacing-1, 4px);
      }

      .athlete-card__verified {
        position: absolute;
        bottom: 0;
        right: -2px;
        font-size: 16px;
        color: var(--fy-success);
        line-height: 1;
      }

      .athlete-card__name {
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--fy-text-primary);
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        margin: 0;
      }

      .athlete-card__meta {
        font-size: var(--nxt1-fontSize-2xs, 11px);
        color: var(--fy-text-muted);
        text-align: center;
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      .athlete-card__committed {
        font-size: 9px;
        font-weight: var(--nxt1-fontWeight-bold, 700);
        letter-spacing: 0.5px;
        text-transform: uppercase;
        color: var(--fy-primary-on);
        background: var(--fy-primary);
        padding: 2px 6px;
        border-radius: var(--fy-radius-full);
        margin-top: 2px;
        display: block;
      }

      /* ── COLLEGE CARDS ── */

      .college-card {
        position: relative;
        overflow: hidden;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        width: 240px;
        padding: var(--nxt1-spacing-3, 12px);
        background: var(--fy-surface);
        border: 1px solid var(--fy-border);
        border-radius: var(--fy-radius-md);
        cursor: pointer;
        scroll-snap-align: start;
        -webkit-tap-highlight-color: transparent;
        transition:
          background-color var(--fy-duration-fast) ease,
          transform var(--fy-duration-fast) ease;
        text-align: left;
      }

      .college-card:hover {
        background: var(--fy-surface-hover);
      }

      .college-card:active {
        transform: scale(0.97);
      }

      .college-card__logo {
        flex-shrink: 0;
      }

      .college-card__info {
        flex: 1;
        min-width: 0;
      }

      .college-card__name {
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--fy-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin: 0 0 2px;
      }

      .college-card__meta {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: var(--fy-text-secondary);
        margin: 0 0 2px;
      }

      .college-card__conference {
        font-size: var(--nxt1-fontSize-2xs, 11px);
        color: var(--fy-text-muted);
        margin: 0;
      }

      .college-card__arrow {
        flex-shrink: 0;
        font-size: 16px;
        color: var(--fy-text-muted);
        opacity: 0.5;
      }

      /* ── VIDEO CARDS ── */

      .h-scroll--videos {
        gap: var(--nxt1-spacing-3, 12px);
      }

      .video-card {
        position: relative;
        overflow: hidden;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
        width: 200px;
        background: var(--fy-surface);
        border: 1px solid var(--fy-border);
        border-radius: var(--fy-radius-md);
        cursor: pointer;
        scroll-snap-align: start;
        -webkit-tap-highlight-color: transparent;
        transition:
          background-color var(--fy-duration-fast) ease,
          transform var(--fy-duration-fast) ease;
        text-align: left;
      }

      .video-card:hover {
        background: var(--fy-surface-hover);
      }

      .video-card:active {
        transform: scale(0.97);
      }

      .video-card__thumb {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        background: var(--fy-surface-hover);
        border-radius: var(--fy-radius-md) var(--fy-radius-md) 0 0;
      }

      .video-card__img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transition: transform var(--fy-duration-base) ease;
      }

      .video-card:hover .video-card__img {
        transform: scale(1.03);
      }

      .video-card__duration {
        position: absolute;
        bottom: var(--nxt1-spacing-1, 4px);
        right: var(--nxt1-spacing-1, 4px);
        padding: 2px 6px;
        background: rgba(0, 0, 0, 0.8);
        color: #fff;
        font-size: var(--nxt1-fontSize-2xs, 11px);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        border-radius: var(--fy-radius-sm);
      }

      .video-card__play {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 40px;
        color: rgba(255, 255, 255, 0.9);
        opacity: 0;
        transition: opacity var(--fy-duration-fast) ease;
        background: rgba(0, 0, 0, 0.2);
      }

      .video-card:hover .video-card__play {
        opacity: 1;
      }

      .video-card__info {
        padding: 0 var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-3, 12px);
      }

      .video-card__title {
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--fy-text-primary);
        margin: 0 0 var(--nxt1-spacing-1, 4px);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: var(--nxt1-lineHeight-tight, 1.3);
      }

      .video-card__stats {
        display: flex;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .video-card__stat {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: var(--nxt1-fontSize-2xs, 11px);
        color: var(--fy-text-muted);
      }

      .video-card__stat ion-icon {
        font-size: 11px;
      }

      /* ── TEAM LIST ── */

      .team-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1, 4px);
        padding: 0 var(--nxt1-spacing-4, 16px);
      }

      .team-row {
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px);
        background: var(--fy-surface);
        border: 1px solid var(--fy-border);
        border-radius: var(--fy-radius-md);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition:
          background-color var(--fy-duration-fast) ease,
          transform var(--fy-duration-fast) ease;
        text-align: left;
      }

      .team-row:hover {
        background: var(--fy-surface-hover);
      }

      .team-row:active {
        transform: scale(0.98);
      }

      .team-row__info {
        flex: 1;
        min-width: 0;
      }

      .team-row__name {
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--fy-text-primary);
        margin: 0 0 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .team-row__meta {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: var(--fy-text-secondary);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .team-row__record {
        flex-shrink: 0;
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--fy-text-muted);
        padding: 2px 8px;
        background: var(--fy-surface-hover);
        border-radius: var(--fy-radius-full);
      }

      .team-row__arrow {
        flex-shrink: 0;
        font-size: 16px;
        color: var(--fy-text-muted);
        opacity: 0.4;
      }

      /* ── REDUCED MOTION ── */

      @media (prefers-reduced-motion: reduce) {
        .athlete-card,
        .college-card,
        .video-card,
        .team-row {
          transition: none;
        }

        .video-card__img {
          transition: none;
        }

        .video-card__play {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreForYouComponent {
  constructor() {
    addIcons({
      sparklesOutline,
      chevronForwardOutline,
      schoolOutline,
      personOutline,
      peopleOutline,
      playCircleOutline,
      calendarOutline,
      trophyOutline,
      heartOutline,
      eyeOutline,
      checkmarkCircle,
    });
  }

  // ── Inputs ──────────────────────────────────────────────
  readonly user = input<ExploreUser | null>(null);

  // ── Outputs ─────────────────────────────────────────────
  /** Emitted when the user taps a content item */
  readonly itemTap = output<ExploreItem>();
  /** Emitted when the user taps "See All" or a category tile */
  readonly categorySelect = output<ExploreTabId>();

  // ── Constants ────────────────────────────────────────────

  // ── Computed mock data slices ────────────────────────────

  protected readonly trendingAthletes = computed(() => MOCK_ATHLETES.slice(0, 5));
  protected readonly topColleges = computed(() => MOCK_COLLEGES.slice(0, 4));
  protected readonly latestVideos = computed(() => MOCK_VIDEOS.slice(0, 4));
  protected readonly topTeams = computed(() => MOCK_TEAMS.slice(0, 3));

  // ── Event handlers ────────────────────────────────────────

  protected onItemTap(item: ExploreItem): void {
    this.itemTap.emit(item);
  }

  protected onSeeAllTap(tab: ExploreTabId): void {
    this.categorySelect.emit(tab);
  }

  // ── Formatters ────────────────────────────────────────────

  protected formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  protected formatCount(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  }
}
