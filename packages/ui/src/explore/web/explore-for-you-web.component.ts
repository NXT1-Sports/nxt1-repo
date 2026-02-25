/**
 * @fileoverview Explore "For You" Landing Component — Web (Zero Ionic)
 * @module @nxt1/ui/explore/web
 * @version 1.0.0
 *
 * Multi-category curated overview displayed as the default explore landing view.
 * SSR-safe semantic HTML, zero Ionic dependencies, design token CSS.
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 *
 * For mobile app, use ExploreForYouComponent (Ionic variant) instead.
 *
 * Design Goals:
 * - Visually stunning entry point to the explore feature
 * - No tab pre-selected; showcases content from ALL categories
 * - Smooth horizontal scroll rows per category (CSS scroll snap)
 * - Personalized "For You" sections within each category strip
 * - Fully design-token driven (zero hard-coded values)
 * - Accessible: semantic landmarks, ARIA roles, keyboard navigation
 * - Respects prefers-reduced-motion
 * - IntersectionObserver-driven entry animations
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  afterNextRender,
  DestroyRef,
  PLATFORM_ID,
  inject,
  ElementRef,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import type { ExploreItem, ExploreTabId } from '@nxt1/core';
import {
  MOCK_ATHLETES,
  MOCK_COLLEGES,
  MOCK_TEAMS,
  MOCK_VIDEOS,
} from '../explore.mock-data';
import { NxtAvatarComponent } from '../../components/avatar';
import type { ExploreUser } from '../explore-shell.component';

/** Quick-access category tile shown in the discovery grid */
interface CategoryTile {
  readonly id: ExploreTabId;
  readonly label: string;
  readonly emoji: string;
}

const CATEGORY_TILES: readonly CategoryTile[] = [
  { id: 'colleges', label: 'Colleges', emoji: '🎓' },
  { id: 'athletes', label: 'Athletes', emoji: '🏃' },
  { id: 'teams', label: 'Teams', emoji: '🏆' },
  { id: 'videos', label: 'Videos', emoji: '🎬' },
  { id: 'leaderboards', label: 'Leaderboards', emoji: '📊' },
  { id: 'camps', label: 'Camps', emoji: '⛺' },
] as const;

/** SVG icon paths keyed by name */
const ICONS = {
  sparkles:
    'M12 2l1.68 5.16L19 9l-5.16 1.68L12 16l-1.68-5.16L5 9l5.16-1.68L12 2zm0 14l1.05 3.24L16 20l-2.95 1.05L12 24l-1.05-2.95L8 20l2.95-1.05L12 16z',
  chevronRight:
    'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z',
  eye: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  heart:
    'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3z',
  verified:
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  play: 'M8 5v14l11-7z',
} as const;

@Component({
  selector: 'nxt1-explore-for-you-web',
  standalone: true,
  imports: [CommonModule, NxtAvatarComponent],
  template: `
    <section class="for-you" aria-label="For You — personalized explore">

      <!-- ── Hero Banner ──────────────────────────────────── -->
      <div class="hero" role="banner">
        <div class="hero__content">
          <div class="hero__badge">
            <svg class="hero__badge-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path [attr.d]="icons.sparkles" />
            </svg>
            <span>For You</span>
          </div>
          <h1 class="hero__title">
            Discover Your<br />
            Next Level
          </h1>
          <p class="hero__subtitle">
            Athletes, colleges, teams, videos &amp; more — all in one place.
          </p>
        </div>
        <div class="hero__orb" aria-hidden="true"></div>
      </div>

      <!-- ── Category Quick Access ────────────────────────── -->
      <div class="section animate-section">
        <div class="section__header">
          <h2 class="section__title">Browse Categories</h2>
        </div>
        <nav class="category-grid" aria-label="Content categories">
          @for (tile of categoryTiles; track tile.id) {
            <button
              type="button"
              class="category-tile"
              [attr.aria-label]="'Browse ' + tile.label"
              (click)="onCategoryTap(tile.id)"
            >
              <span class="category-tile__icon" aria-hidden="true">{{ tile.emoji }}</span>
              <span class="category-tile__label">{{ tile.label }}</span>
            </button>
          }
        </nav>
      </div>

      <!-- ── Trending Athletes ─────────────────────────────── -->
      <div class="section animate-section">
        <div class="section__header">
          <h2 class="section__title">Trending Athletes</h2>
          <button
            type="button"
            class="see-all-btn"
            aria-label="See all athletes"
            (click)="onSeeAllTap('athletes')"
          >
            See All
            <svg class="see-all-btn__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path [attr.d]="icons.chevronRight" />
            </svg>
          </button>
        </div>
        <div class="h-scroll" role="list" aria-label="Trending athletes">
          @for (athlete of trendingAthletes(); track athlete.id) {
            <article
              class="athlete-card"
              role="listitem"
              [attr.aria-label]="athlete.name + ', ' + athlete.sport"
              (click)="onItemTap(athlete)"
              (keydown.enter)="onItemTap(athlete)"
              tabindex="0"
            >
              <div class="athlete-card__avatar">
                <nxt1-avatar
                  [src]="athlete.imageUrl"
                  [name]="athlete.name"
                  size="xl"
                />
                @if (athlete.isVerified) {
                  <span class="athlete-card__verified" aria-label="Verified">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path [attr.d]="icons.verified" />
                    </svg>
                  </span>
                }
              </div>
              <p class="athlete-card__name">{{ athlete.name }}</p>
              <p class="athlete-card__meta">{{ athlete.sport }}</p>
              @if (athlete.commitment) {
                <span class="athlete-card__committed">Committed</span>
              }
            </article>
          }
        </div>
      </div>

      <!-- ── Top Colleges ──────────────────────────────────── -->
      <div class="section animate-section">
        <div class="section__header">
          <h2 class="section__title">Top Colleges</h2>
          <button
            type="button"
            class="see-all-btn"
            aria-label="See all colleges"
            (click)="onSeeAllTap('colleges')"
          >
            See All
            <svg class="see-all-btn__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path [attr.d]="icons.chevronRight" />
            </svg>
          </button>
        </div>
        <div class="h-scroll" role="list" aria-label="Top colleges">
          @for (college of topColleges(); track college.id) {
            <article
              class="college-card"
              role="listitem"
              [attr.aria-label]="college.name + ', ' + college.division"
              (click)="onItemTap(college)"
              (keydown.enter)="onItemTap(college)"
              tabindex="0"
            >
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
              <svg
                class="college-card__arrow"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path [attr.d]="icons.chevronRight" />
              </svg>
            </article>
          }
        </div>
      </div>

      <!-- ── Latest Videos ─────────────────────────────────── -->
      <div class="section animate-section">
        <div class="section__header">
          <h2 class="section__title">Latest Videos</h2>
          <button
            type="button"
            class="see-all-btn"
            aria-label="See all videos"
            (click)="onSeeAllTap('videos')"
          >
            See All
            <svg class="see-all-btn__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path [attr.d]="icons.chevronRight" />
            </svg>
          </button>
        </div>
        <div class="h-scroll h-scroll--videos" role="list" aria-label="Latest videos">
          @for (video of latestVideos(); track video.id) {
            <article
              class="video-card"
              role="listitem"
              [attr.aria-label]="video.name + ' by ' + video.creator.name"
              (click)="onItemTap(video)"
              (keydown.enter)="onItemTap(video)"
              tabindex="0"
            >
              <div class="video-card__thumb">
                <img
                  [src]="video.thumbnailUrl"
                  [alt]="video.name"
                  loading="lazy"
                  class="video-card__img"
                />
                <span class="video-card__duration">{{ formatDuration(video.duration) }}</span>
                <div class="video-card__play-overlay" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor" class="video-card__play-icon">
                    <path [attr.d]="icons.play" />
                  </svg>
                </div>
              </div>
              <div class="video-card__info">
                <p class="video-card__title">{{ video.name }}</p>
                <div class="video-card__stats">
                  <span class="video-card__stat">
                    <svg viewBox="0 0 24 24" fill="currentColor" class="stat-icon" aria-hidden="true">
                      <path [attr.d]="icons.eye" />
                    </svg>
                    {{ formatCount(video.views) }}
                  </span>
                  <span class="video-card__stat">
                    <svg viewBox="0 0 24 24" fill="currentColor" class="stat-icon" aria-hidden="true">
                      <path [attr.d]="icons.heart" />
                    </svg>
                    {{ formatCount(video.likes) }}
                  </span>
                </div>
              </div>
            </article>
          }
        </div>
      </div>

      <!-- ── Top Teams ─────────────────────────────────────── -->
      <div class="section section--last animate-section">
        <div class="section__header">
          <h2 class="section__title">Top Teams</h2>
          <button
            type="button"
            class="see-all-btn"
            aria-label="See all teams"
            (click)="onSeeAllTap('teams')"
          >
            See All
            <svg class="see-all-btn__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path [attr.d]="icons.chevronRight" />
            </svg>
          </button>
        </div>
        <ul class="team-list" aria-label="Top teams">
          @for (team of topTeams(); track team.id) {
            <li>
              <article
                class="team-row"
                [attr.aria-label]="team.name + ', ' + team.sport"
                (click)="onItemTap(team)"
                (keydown.enter)="onItemTap(team)"
                tabindex="0"
                role="button"
              >
                <nxt1-avatar [src]="team.imageUrl" [name]="team.name" size="md" />
                <div class="team-row__info">
                  <p class="team-row__name">{{ team.name }}</p>
                  <p class="team-row__meta">{{ team.sport }} · {{ team.location }}</p>
                </div>
                @if (team.record) {
                  <span class="team-row__record">{{ team.record }}</span>
                }
                <svg
                  class="team-row__arrow"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path [attr.d]="icons.chevronRight" />
                </svg>
              </article>
            </li>
          }
        </ul>
      </div>
    </section>
  `,
  styles: [
    `
      /* ============================================================
         EXPLORE FOR YOU — Web (Zero Ionic)
         Design token driven, SSR-safe, zero hard-coded values.
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

      /* ── SECTION ENTRY ANIMATION ── */

      .animate-section {
        opacity: 0;
        transform: translateY(16px);
        transition:
          opacity var(--nxt1-duration-slow, 350ms) ease,
          transform var(--nxt1-duration-slow, 350ms) ease;
      }

      .animate-section.is-visible {
        opacity: 1;
        transform: translateY(0);
      }

      /* ── HERO BANNER ── */

      .hero {
        position: relative;
        overflow: hidden;
        padding: var(--nxt1-spacing-8, 32px) var(--nxt1-spacing-6, 24px)
          var(--nxt1-spacing-10, 40px);
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--fy-primary) 10%, transparent) 0%,
          var(--fy-surface) 60%
        );
        border-bottom: 1px solid var(--fy-border);
      }

      .hero__content {
        position: relative;
        z-index: 1;
        max-width: 600px;
      }

      .hero__badge {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        padding: var(--nxt1-spacing-1, 4px) var(--nxt1-spacing-3, 12px);
        background: color-mix(in srgb, var(--fy-primary) 15%, transparent);
        border: 1px solid color-mix(in srgb, var(--fy-primary) 30%, transparent);
        border-radius: var(--fy-radius-full);
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--fy-primary);
        letter-spacing: 0.3px;
        margin-bottom: var(--nxt1-spacing-4, 16px);
        width: fit-content;
      }

      .hero__badge-icon {
        width: 14px;
        height: 14px;
      }

      .hero__title {
        font-size: clamp(28px, 5vw, 42px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--fy-text-primary);
        line-height: var(--nxt1-lineHeight-tight, 1.15);
        margin-bottom: var(--nxt1-spacing-3, 12px);
        letter-spacing: -0.8px;
      }

      .hero__subtitle {
        font-size: var(--nxt1-fontSize-sm, 15px);
        color: var(--fy-text-secondary);
        line-height: var(--nxt1-lineHeight-normal, 1.5);
        margin: 0;
        max-width: 400px;
      }

      .hero__orb {
        position: absolute;
        top: -80px;
        right: -100px;
        width: 320px;
        height: 320px;
        background: radial-gradient(
          circle at center,
          color-mix(in srgb, var(--fy-primary) 18%, transparent) 0%,
          transparent 70%
        );
        border-radius: 50%;
        pointer-events: none;
        animation: orb-pulse 5s ease-in-out infinite;
      }

      @keyframes orb-pulse {
        0%,
        100% {
          opacity: 0.5;
          transform: scale(1);
        }
        50% {
          opacity: 0.9;
          transform: scale(1.08);
        }
      }

      /* ── SECTION ── */

      .section {
        padding: var(--nxt1-spacing-6, 24px) 0 0;
      }

      .section--last {
        padding-bottom: var(--nxt1-spacing-4, 16px);
      }

      .section__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-3, 12px);
      }

      .section__title {
        font-size: var(--nxt1-fontSize-lg, 17px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--fy-text-primary);
        letter-spacing: -0.3px;
      }

      .see-all-btn {
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
        transition: opacity var(--fy-duration-fast) ease;
      }

      .see-all-btn:hover {
        opacity: 0.8;
      }

      .see-all-btn__icon {
        width: 16px;
        height: 16px;
      }

      /* ── CATEGORY GRID ── */

      .category-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--nxt1-spacing-2, 8px);
        padding: 0 var(--nxt1-spacing-6, 24px);
      }

      @media (min-width: 640px) {
        .category-grid {
          grid-template-columns: repeat(6, 1fr);
        }
      }

      .category-tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-2, 8px);
        background: var(--fy-surface);
        border: 1px solid var(--fy-border);
        border-radius: var(--fy-radius-md);
        cursor: pointer;
        transition:
          background-color var(--fy-duration-fast) ease,
          transform var(--fy-duration-fast) ease,
          border-color var(--fy-duration-fast) ease;
      }

      .category-tile:hover {
        background: var(--fy-surface-hover);
        border-color: color-mix(in srgb, var(--fy-primary) 25%, transparent);
        transform: translateY(-2px);
      }

      .category-tile:active {
        transform: scale(0.96);
      }

      .category-tile__icon {
        font-size: 24px;
        line-height: 1;
      }

      .category-tile__label {
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--fy-text-secondary);
        text-align: center;
        line-height: 1.2;
      }

      /* ── HORIZONTAL SCROLL ── */

      .h-scroll {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-6, 24px);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        scrollbar-color: var(--fy-border) transparent;
        padding-bottom: var(--nxt1-spacing-2, 8px);
      }

      .h-scroll::-webkit-scrollbar {
        height: 4px;
      }

      .h-scroll::-webkit-scrollbar-track {
        background: transparent;
      }

      .h-scroll::-webkit-scrollbar-thumb {
        background: var(--fy-border);
        border-radius: var(--fy-radius-full);
      }

      /* ── ATHLETE CARDS ── */

      .athlete-card {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        width: 110px;
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-2, 8px);
        background: var(--fy-surface);
        border: 1px solid var(--fy-border);
        border-radius: var(--fy-radius-md);
        cursor: pointer;
        scroll-snap-align: start;
        transition:
          background-color var(--fy-duration-fast) ease,
          transform var(--fy-duration-fast) ease,
          border-color var(--fy-duration-fast) ease;
        outline: none;
      }

      .athlete-card:hover {
        background: var(--fy-surface-hover);
        border-color: color-mix(in srgb, var(--fy-primary) 20%, transparent);
        transform: translateY(-2px);
      }

      .athlete-card:focus-visible {
        outline: 2px solid var(--fy-primary);
        outline-offset: 2px;
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
        width: 16px;
        height: 16px;
        color: var(--fy-success);
        display: flex;
      }

      .athlete-card__verified svg {
        width: 100%;
        height: 100%;
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
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        width: 260px;
        padding: var(--nxt1-spacing-3, 12px);
        background: var(--fy-surface);
        border: 1px solid var(--fy-border);
        border-radius: var(--fy-radius-md);
        cursor: pointer;
        scroll-snap-align: start;
        transition:
          background-color var(--fy-duration-fast) ease,
          transform var(--fy-duration-fast) ease,
          border-color var(--fy-duration-fast) ease;
        outline: none;
      }

      .college-card:hover {
        background: var(--fy-surface-hover);
        border-color: color-mix(in srgb, var(--fy-primary) 20%, transparent);
        transform: translateY(-2px);
      }

      .college-card:focus-visible {
        outline: 2px solid var(--fy-primary);
        outline-offset: 2px;
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
        width: 18px;
        height: 18px;
        color: var(--fy-text-muted);
        opacity: 0.4;
      }

      /* ── VIDEO CARDS ── */

      .h-scroll--videos {
        gap: var(--nxt1-spacing-3, 12px);
      }

      .video-card {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        width: 220px;
        background: var(--fy-surface);
        border: 1px solid var(--fy-border);
        border-radius: var(--fy-radius-md);
        overflow: hidden;
        cursor: pointer;
        scroll-snap-align: start;
        transition:
          border-color var(--fy-duration-fast) ease,
          transform var(--fy-duration-fast) ease;
        outline: none;
      }

      .video-card:hover {
        border-color: color-mix(in srgb, var(--fy-primary) 20%, transparent);
        transform: translateY(-2px);
      }

      .video-card:focus-visible {
        outline: 2px solid var(--fy-primary);
        outline-offset: 2px;
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
      }

      .video-card__img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transition: transform var(--fy-duration-base) ease;
      }

      .video-card:hover .video-card__img {
        transform: scale(1.04);
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
        line-height: 1;
      }

      .video-card__play-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.25);
        opacity: 0;
        transition: opacity var(--fy-duration-fast) ease;
      }

      .video-card:hover .video-card__play-overlay {
        opacity: 1;
      }

      .video-card__play-icon {
        width: 44px;
        height: 44px;
        color: rgba(255, 255, 255, 0.95);
        filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
      }

      .video-card__info {
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-3, 12px)
          var(--nxt1-spacing-3, 12px);
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

      .stat-icon {
        width: 11px;
        height: 11px;
        flex-shrink: 0;
      }

      /* ── TEAM LIST ── */

      .team-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1, 4px);
        padding: 0 var(--nxt1-spacing-6, 24px);
        list-style: none;
        margin: 0;
      }

      .team-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px);
        background: var(--fy-surface);
        border: 1px solid var(--fy-border);
        border-radius: var(--fy-radius-md);
        cursor: pointer;
        transition:
          background-color var(--fy-duration-fast) ease,
          transform var(--fy-duration-fast) ease,
          border-color var(--fy-duration-fast) ease;
        outline: none;
      }

      .team-row:hover {
        background: var(--fy-surface-hover);
        border-color: color-mix(in srgb, var(--fy-primary) 20%, transparent);
      }

      .team-row:focus-visible {
        outline: 2px solid var(--fy-primary);
        outline-offset: 2px;
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
        width: 18px;
        height: 18px;
        color: var(--fy-text-muted);
        opacity: 0.4;
      }

      /* ── REDUCED MOTION ── */

      @media (prefers-reduced-motion: reduce) {
        .hero__orb {
          animation: none;
        }

        .animate-section {
          opacity: 1;
          transform: none;
          transition: none;
        }

        .category-tile,
        .athlete-card,
        .college-card,
        .video-card,
        .team-row {
          transition: none;
        }

        .video-card__img,
        .video-card__play-overlay {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreForYouWebComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private intersectionObserver?: IntersectionObserver;

  // ── Inputs ──────────────────────────────────────────────
  readonly user = input<ExploreUser | null>(null);

  // ── Outputs ─────────────────────────────────────────────
  /** Emitted when the user clicks a content item */
  readonly itemTap = output<ExploreItem>();
  /** Emitted when the user clicks "See All" or a category tile */
  readonly categorySelect = output<ExploreTabId>();

  // ── Constants ────────────────────────────────────────────
  protected readonly categoryTiles = CATEGORY_TILES;
  protected readonly icons = ICONS;

  // ── Computed mock data slices ────────────────────────────
  protected readonly trendingAthletes = computed(() => MOCK_ATHLETES.slice(0, 5));
  protected readonly topColleges = computed(() => MOCK_COLLEGES.slice(0, 4));
  protected readonly latestVideos = computed(() => MOCK_VIDEOS.slice(0, 4));
  protected readonly topTeams = computed(() => MOCK_TEAMS.slice(0, 3));

  constructor() {
    afterNextRender(() => {
      this.setupAnimations();
      this.destroyRef.onDestroy(() => this.intersectionObserver?.disconnect());
    });
  }

  // ── Event handlers ────────────────────────────────────────

  protected onItemTap(item: ExploreItem): void {
    this.itemTap.emit(item);
  }

  protected onSeeAllTap(tab: ExploreTabId): void {
    this.categorySelect.emit(tab);
  }

  protected onCategoryTap(tab: ExploreTabId): void {
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

  // ── Intersection Observer for animated section entry ─────

  private setupAnimations(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const sections = this.elementRef.nativeElement.querySelectorAll<HTMLElement>('.animate-section');

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            this.intersectionObserver?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    sections.forEach((section) => {
      this.intersectionObserver?.observe(section);
    });
  }
}
