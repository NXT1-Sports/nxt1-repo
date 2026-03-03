/**
 * @fileoverview Athletes Persona Preview Component
 * @module @nxt1/ui/personas/athletes
 * @version 1.0.0
 *
 * Interactive mockup of an athlete's recruiting profile dashboard
 * for use on the `/athletes` persona landing page. Shows a realistic
 * preview of the athlete's profile card, highlight reel, recruiting
 * activity, and XP progress inside a browser-chrome window frame.
 *
 * Athletes-persona-specific — not a generic shared component.
 * Uses mock values for visual accuracy on the marketing page.
 *
 * 100% design-token styling where applicable. Micro-scale preview
 * elements use pixel values where token granularity is insufficient.
 * SSR-safe, responsive, purely presentational (aria-hidden).
 *
 * @example
 * ```html
 * <nxt1-athletes-preview />
 * ```
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtIconComponent } from '@nxt1/ui/components/icon';

// ============================================
// PREVIEW MOCK DATA
// ============================================

/** Mock profile stats. */
const PREVIEW_PROFILE = {
  name: 'Marcus Johnson',
  sport: 'Football',
  position: 'Quarterback',
  classYear: '2026',
  school: 'Riverside High',
  location: 'Austin, TX',
  gpa: '3.8',
  height: '6\'2"',
  weight: '195 lbs',
  avatar: '/assets/shared/images/athlete-1.png',
  verified: true,
} as const;

/** Mock recruiting activity feed. */
const PREVIEW_ACTIVITY = [
  { id: 'a1', icon: 'eye-outline', label: 'Profile viewed by Alabama', time: '2h ago' },
  { id: 'a2', icon: 'mail-outline', label: 'Message from Texas A&M', time: '5h ago' },
  { id: 'a3', icon: 'star-outline', label: 'Added to Oklahoma watchlist', time: '1d ago' },
] as const;

/** Mock highlight videos. */
const PREVIEW_HIGHLIGHTS = [
  { id: 'h1', title: 'Junior Season Highlights', views: '2.4K', duration: '3:24' },
  { id: 'h2', title: 'Combine Performance', views: '1.1K', duration: '2:10' },
] as const;

/** Mock XP progress. */
const PREVIEW_XP = {
  level: 12,
  current: 3450,
  next: 4000,
  percentComplete: 86,
} as const;

@Component({
  selector: 'nxt1-athletes-preview',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div class="athletes-preview" aria-hidden="true">
      <!-- Subtle glow behind dashboard -->
      <div class="preview-glow"></div>

      <!-- Dashboard window -->
      <div class="preview-window">
        <!-- Browser Chrome -->
        <div class="preview-chrome">
          <div class="chrome-dots">
            <span class="dot dot--close"></span>
            <span class="dot dot--min"></span>
            <span class="dot dot--max"></span>
          </div>
          <div class="chrome-title">My Recruiting Profile</div>
        </div>

        <!-- Dashboard Body -->
        <div class="preview-body">
          <!-- Profile Card -->
          <div class="profile-card">
            <div class="profile-header">
              <div class="profile-avatar">
                <img [src]="profile.avatar" [alt]="profile.name" loading="lazy" />
              </div>
              <div class="profile-info">
                <div class="profile-name-row">
                  <span class="profile-name">{{ profile.name }}</span>
                  @if (profile.verified) {
                    <nxt1-icon name="checkmark-circle" size="14" />
                  }
                </div>
                <span class="profile-meta"
                  >{{ profile.position }} · {{ profile.sport }} · Class of
                  {{ profile.classYear }}</span
                >
                <span class="profile-school">{{ profile.school }} · {{ profile.location }}</span>
              </div>
            </div>

            <!-- Quick Stats Row -->
            <div class="profile-stats">
              <div class="stat-pill">
                <span class="stat-label">HT</span>
                <span class="stat-value">{{ profile.height }}</span>
              </div>
              <div class="stat-pill">
                <span class="stat-label">WT</span>
                <span class="stat-value">{{ profile.weight }}</span>
              </div>
              <div class="stat-pill">
                <span class="stat-label">GPA</span>
                <span class="stat-value">{{ profile.gpa }}</span>
              </div>
            </div>
          </div>

          <!-- Two Column Layout -->
          <div class="preview-columns">
            <!-- Left: Recruiting Activity -->
            <div class="column-card">
              <div class="column-title">
                <nxt1-icon name="flash-outline" size="14" />
                <span>Recruiting Activity</span>
              </div>
              @for (item of activity; track item.id) {
                <div class="activity-row">
                  <nxt1-icon [name]="item.icon" size="12" />
                  <span class="activity-label">{{ item.label }}</span>
                  <span class="activity-time">{{ item.time }}</span>
                </div>
              }
            </div>

            <!-- Right: Highlights & XP -->
            <div class="column-right">
              <!-- Highlights -->
              <div class="column-card">
                <div class="column-title">
                  <nxt1-icon name="videocam-outline" size="14" />
                  <span>Highlights</span>
                </div>
                @for (video of highlights; track video.id) {
                  <div class="highlight-row">
                    <nxt1-icon name="play-circle-outline" size="14" />
                    <div class="highlight-info">
                      <span class="highlight-title">{{ video.title }}</span>
                      <span class="highlight-meta"
                        >{{ video.views }} views · {{ video.duration }}</span
                      >
                    </div>
                  </div>
                }
              </div>

              <!-- XP Progress -->
              <div class="column-card xp-card">
                <div class="column-title">
                  <nxt1-icon name="rocket-outline" size="14" />
                  <span>XP Progress</span>
                </div>
                <div class="xp-bar-wrapper">
                  <div class="xp-bar">
                    <div class="xp-bar-fill" [style.width.%]="xp.percentComplete"></div>
                  </div>
                  <span class="xp-label"
                    >Level {{ xp.level }} · {{ xp.current }}/{{ xp.next }} XP</span
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .athletes-preview {
        position: relative;
        width: 100%;
        max-width: 620px;
        margin: 0 auto;
      }

      .preview-glow {
        position: absolute;
        inset: 10% 5%;
        background: var(--nxt1-color-alpha-primary10);
        filter: blur(48px);
        border-radius: var(--nxt1-borderRadius-3xl);
        z-index: 0;
        pointer-events: none;
      }

      .preview-window {
        position: relative;
        z-index: 1;
        border-radius: var(--nxt1-borderRadius-xl);
        overflow: hidden;
        background: var(--nxt1-color-bg-primary);
        border: 1px solid var(--nxt1-color-border-primary);
        box-shadow:
          0 4px 24px var(--nxt1-color-alpha-primary6),
          0 1px 4px var(--nxt1-color-alpha-primary4);
      }

      .preview-chrome {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        background: var(--nxt1-color-bg-secondary);
        border-bottom: 1px solid var(--nxt1-color-border-primary);
      }

      .chrome-dots {
        display: flex;
        gap: var(--nxt1-spacing-1_5);
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: var(--nxt1-borderRadius-full);
      }

      .dot--close {
        background: var(--nxt1-color-error);
      }
      .dot--min {
        background: var(--nxt1-color-warning);
      }
      .dot--max {
        background: var(--nxt1-color-success);
      }

      .chrome-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
        letter-spacing: 0.02em;
      }

      .preview-body {
        padding: var(--nxt1-spacing-4);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      /* Profile Card */
      .profile-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-bg-secondary);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-primary);
      }

      .profile-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .profile-avatar {
        width: 48px;
        height: 48px;
        border-radius: var(--nxt1-borderRadius-full);
        overflow: hidden;
        flex-shrink: 0;
        background: var(--nxt1-color-alpha-primary10);
      }

      .profile-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .profile-info {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0_5);
        min-width: 0;
      }

      .profile-name-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        color: var(--nxt1-color-primary);
      }

      .profile-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      .profile-meta {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 600;
        color: var(--nxt1-color-primary);
      }

      .profile-school {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);
      }

      .profile-stats {
        display: flex;
        gap: var(--nxt1-spacing-2);
      }

      .stat-pill {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2_5);
        background: var(--nxt1-color-bg-primary);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-primary);
      }

      .stat-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .stat-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      /* Two Column Layout */
      .preview-columns {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-3);
      }

      .column-right {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .column-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-bg-secondary);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-primary);
      }

      .column-title {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      /* Activity Rows */
      .activity-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-1_5) 0;
        border-bottom: 1px solid var(--nxt1-color-border-primary);
        color: var(--nxt1-color-text-secondary);
      }

      .activity-row:last-child {
        border-bottom: none;
      }

      .activity-label {
        flex: 1;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-primary);
      }

      .activity-time {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
        flex-shrink: 0;
      }

      /* Highlight Rows */
      .highlight-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        color: var(--nxt1-color-primary);
      }

      .highlight-info {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0_5);
        min-width: 0;
      }

      .highlight-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .highlight-meta {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
      }

      /* XP Progress */
      .xp-card {
        gap: var(--nxt1-spacing-1_5);
      }

      .xp-bar-wrapper {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
      }

      .xp-bar {
        height: 6px;
        background: var(--nxt1-color-bg-primary);
        border-radius: var(--nxt1-borderRadius-full);
        overflow: hidden;
      }

      .xp-bar-fill {
        height: 100%;
        background: var(--nxt1-color-primary);
        border-radius: var(--nxt1-borderRadius-full);
        transition: width var(--nxt1-motion-duration-normal) var(--nxt1-motion-easing-inOut);
      }

      .xp-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
      }

      /* Responsive */
      @media (max-width: 640px) {
        .preview-columns {
          grid-template-columns: 1fr;
        }

        .profile-stats {
          flex-wrap: wrap;
        }
      }

      @media (max-width: 480px) {
        .preview-body {
          padding: var(--nxt1-spacing-3);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAthletesPreviewComponent {
  protected readonly profile = PREVIEW_PROFILE;
  protected readonly activity = PREVIEW_ACTIVITY;
  protected readonly highlights = PREVIEW_HIGHLIGHTS;
  protected readonly xp = PREVIEW_XP;
}
