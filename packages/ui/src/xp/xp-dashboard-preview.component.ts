/**
 * @fileoverview XP Dashboard Preview Component
 * @module @nxt1/ui/xp
 * @version 1.0.0
 *
 * Interactive mockup of the XP/Missions dashboard for use on
 * the XP landing page. Shows a realistic preview of the progress
 * ring, mission cards, badge shelf, and streak banner inside a
 * browser-chrome window frame.
 *
 * XP-specific — not a generic shared component.
 * Uses mock values for visual accuracy on the marketing page.
 *
 * 100% design-token styling where applicable. Micro-scale preview
 * elements use pixel values where token granularity is insufficient.
 * SSR-safe, responsive, purely presentational (aria-hidden).
 *
 * @example
 * ```html
 * <nxt1-xp-dashboard-preview />
 * ```
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtIconComponent } from '../components/icon';

// ============================================
// PREVIEW MOCK DATA
// ============================================

/** Mock missions for the preview task list. */
const PREVIEW_MISSIONS = [
  {
    id: 'upload-highlight',
    label: 'Upload highlight reel',
    points: 150,
    completed: true,
    icon: 'videocam-outline',
  },
  {
    id: 'complete-bio',
    label: 'Complete your bio',
    points: 100,
    completed: true,
    icon: 'person-outline',
  },
  {
    id: 'add-stats',
    label: 'Add season stats',
    points: 125,
    completed: false,
    icon: 'stats-chart-outline',
  },
  {
    id: 'follow-colleges',
    label: 'Follow 5 colleges',
    points: 75,
    completed: false,
    icon: 'school-outline',
  },
] as const;

/** Mock badges for the badge shelf. */
const PREVIEW_BADGES = [
  { id: 'profile-pro', icon: 'person', rarity: 'rare' as const, label: 'Profile Pro' },
  { id: 'media-master', icon: 'videocam', rarity: 'epic' as const, label: 'Media Master' },
  { id: 'early-bird', icon: 'sunny', rarity: 'common' as const, label: 'Early Bird' },
  { id: 'networker', icon: 'people', rarity: 'uncommon' as const, label: 'Networker' },
] as const;

@Component({
  selector: 'nxt1-xp-dashboard-preview',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div class="xp-preview" aria-hidden="true">
      <!-- Subtle glow behind dashboard -->
      <div class="preview-glow"></div>

      <!-- Dashboard window -->
      <div class="preview-window">
        <!-- Browser Chrome -->
        <div class="preview-chrome">
          <div class="preview-dots">
            <span class="dot dot--close"></span>
            <span class="dot dot--minimize"></span>
            <span class="dot dot--expand"></span>
          </div>
          <span class="preview-title">XP &amp; Missions</span>
        </div>

        <!-- Dashboard Body -->
        <div class="preview-body">
          <!-- Top Row: Progress Ring + Streak -->
          <div class="preview-top-row">
            <!-- Mini Progress Ring -->
            <div class="progress-ring-box">
              <svg class="progress-ring" viewBox="0 0 80 80" aria-hidden="true">
                <!-- Background circle -->
                <circle
                  cx="40"
                  cy="40"
                  r="33"
                  fill="none"
                  stroke="var(--nxt1-color-surface-300)"
                  stroke-width="6"
                />
                <!-- Progress arc (68% filled) -->
                <circle
                  cx="40"
                  cy="40"
                  r="33"
                  fill="none"
                  stroke="var(--nxt1-color-primary)"
                  stroke-width="6"
                  stroke-linecap="round"
                  stroke-dasharray="207.3"
                  stroke-dashoffset="66.3"
                  transform="rotate(-90 40 40)"
                  class="progress-arc"
                />
              </svg>
              <div class="progress-center">
                <span class="progress-level">Lv 3</span>
                <span class="progress-label">All-Star</span>
              </div>
            </div>

            <!-- Stats Column -->
            <div class="preview-stats-col">
              <div class="stat-item">
                <span class="stat-value">2,450</span>
                <span class="stat-label">Total XP</span>
              </div>
              <div class="stat-item">
                <span class="stat-value">12/18</span>
                <span class="stat-label">Missions</span>
              </div>
              <!-- Streak Badge -->
              <div class="streak-badge">
                <nxt1-icon name="flame" size="12" />
                <span class="streak-count">7 Day Streak</span>
              </div>
            </div>
          </div>

          <!-- Mission List -->
          <div class="preview-missions">
            <div class="missions-header">
              <span class="missions-title">Active Missions</span>
              <span class="missions-count">4 tasks</span>
            </div>
            @for (mission of previewMissions; track mission.id) {
              <div class="mission-row" [class.mission-row--done]="mission.completed">
                <div class="mission-check" [class.mission-check--done]="mission.completed">
                  @if (mission.completed) {
                    <nxt1-icon name="checkmark" size="10" />
                  }
                </div>
                <div class="mission-info">
                  <span class="mission-label">{{ mission.label }}</span>
                </div>
                <span class="mission-points" [class.mission-points--done]="mission.completed">
                  +{{ mission.points }} XP
                </span>
              </div>
            }
          </div>

          <!-- Badge Shelf -->
          <div class="badge-shelf">
            <span class="badge-shelf-title">Badges Earned</span>
            <div class="badge-grid">
              @for (badge of previewBadges; track badge.id) {
                <div class="badge-item" [class]="'badge-item badge-item--' + badge.rarity">
                  <nxt1-icon [name]="badge.icon" size="16" />
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
     * HOST — Block display, fill parent container
     * ============================================ */
      :host {
        display: block;
        width: 100%;
      }

      /* ============================================
     * XP PREVIEW CONTAINER
     * ============================================ */
      .xp-preview {
        position: relative;
        width: 100%;
        max-width: 520px;
        margin: 0 auto;
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-4);
      }

      /* ============================================
     * GLOW — Soft primary halo behind dashboard
     * ============================================ */
      .preview-glow {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 80%;
        height: 70%;
        background: radial-gradient(
          ellipse at center,
          var(--nxt1-color-alpha-primary12) 0%,
          var(--nxt1-color-alpha-primary5) 50%,
          transparent 80%
        );
        border-radius: var(--nxt1-borderRadius-full);
        pointer-events: none;
        z-index: 0;
      }

      /* ============================================
     * DASHBOARD WINDOW
     * ============================================ */
      .preview-window {
        position: relative;
        z-index: 2;
        width: 100%;
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-xl);
        overflow: hidden;
        box-shadow:
          0 0 0 1px var(--nxt1-color-alpha-primary6),
          0 20px 60px rgba(0, 0, 0, 0.4),
          0 4px 16px rgba(0, 0, 0, 0.2);
      }

      /* Browser Chrome */
      .preview-chrome {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-200);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .preview-dots {
        display: flex;
        gap: var(--nxt1-spacing-1);
      }

      .dot {
        width: 8px;
        height: 8px;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-surface-400);
      }

      .dot--close {
        background: var(--nxt1-color-error);
      }
      .dot--minimize {
        background: var(--nxt1-color-warning);
      }
      .dot--expand {
        background: var(--nxt1-color-success);
      }

      .preview-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
      }

      /* Dashboard Body */
      .preview-body {
        padding: var(--nxt1-spacing-3);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      /* ============================================
     * TOP ROW — Progress Ring + Stats
     * ============================================ */
      .preview-top-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4);
      }

      /* Progress Ring */
      .progress-ring-box {
        position: relative;
        width: 80px;
        height: 80px;
        flex-shrink: 0;
      }

      .progress-ring {
        width: 100%;
        height: 100%;
      }

      .progress-arc {
        filter: drop-shadow(0 0 4px var(--nxt1-color-alpha-primary30));
      }

      .progress-center {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
      }

      .progress-level {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
        line-height: 1;
      }

      .progress-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 8px;
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      /* Stats Column */
      .preview-stats-col {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
        flex: 1;
        min-width: 0;
      }

      .stat-item {
        display: flex;
        align-items: baseline;
        gap: var(--nxt1-spacing-1_5);
      }

      .stat-value {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        line-height: 1.2;
      }

      .stat-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-tertiary);
      }

      /* Streak Badge */
      .streak-badge {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2);
        background: var(--nxt1-color-alpha-primary10);
        border-radius: var(--nxt1-borderRadius-full);
        color: var(--nxt1-color-primary);
        width: fit-content;
      }

      .streak-count {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      /* ============================================
     * MISSION LIST
     * ============================================ */
      .preview-missions {
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-borderRadius-md);
        padding: var(--nxt1-spacing-2);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .missions-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--nxt1-spacing-1_5);
      }

      .missions-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 10px;
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .missions-count {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
      }

      .mission-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-1_5) 0;
        border-top: 1px solid var(--nxt1-color-border-subtle);
      }

      .mission-row:first-of-type {
        border-top: none;
      }

      .mission-check {
        width: 16px;
        height: 16px;
        border-radius: var(--nxt1-borderRadius-full);
        border: 1.5px solid var(--nxt1-color-border-default);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .mission-check--done {
        background: var(--nxt1-color-success);
        border-color: var(--nxt1-color-success);
        color: var(--nxt1-color-surface-100);
      }

      .mission-info {
        flex: 1;
        min-width: 0;
      }

      .mission-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 10px;
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
      }

      .mission-row--done .mission-label {
        color: var(--nxt1-color-text-tertiary);
        text-decoration: line-through;
      }

      .mission-points {
        font-family: var(--nxt1-fontFamily-display);
        font-size: 9px;
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-primary);
        white-space: nowrap;
      }

      .mission-points--done {
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
     * BADGE SHELF
     * ============================================ */
      .badge-shelf {
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-borderRadius-md);
        padding: var(--nxt1-spacing-2);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .badge-shelf-title {
        display: block;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 10px;
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin-bottom: var(--nxt1-spacing-1_5);
      }

      .badge-grid {
        display: flex;
        gap: var(--nxt1-spacing-2);
      }

      .badge-item {
        width: 36px;
        height: 36px;
        border-radius: var(--nxt1-borderRadius-lg);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1.5px solid transparent;
      }

      /* Rarity color tiers */
      .badge-item--common {
        background: var(--nxt1-color-surface-300);
        border-color: var(--nxt1-color-border-default);
        color: var(--nxt1-color-text-secondary);
      }

      .badge-item--uncommon {
        background: var(--nxt1-color-alpha-primary10);
        border-color: var(--nxt1-color-alpha-primary20);
        color: var(--nxt1-color-primary);
      }

      .badge-item--rare {
        background: var(--nxt1-color-infoBg);
        border-color: var(--nxt1-color-info);
        color: var(--nxt1-color-info);
      }

      .badge-item--epic {
        background: var(--nxt1-color-warningBg);
        border-color: var(--nxt1-color-warning);
        color: var(--nxt1-color-warning);
      }

      /* ============================================
     * RESPONSIVE
     * ============================================ */
      @media (max-width: 480px) {
        .xp-preview {
          padding: var(--nxt1-spacing-4) var(--nxt1-spacing-2);
        }

        .progress-ring-box {
          width: 64px;
          height: 64px;
        }

        .progress-level {
          font-size: var(--nxt1-fontSize-xs);
        }

        .progress-label {
          font-size: 7px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtXpDashboardPreviewComponent {
  protected readonly previewMissions = PREVIEW_MISSIONS;
  protected readonly previewBadges = PREVIEW_BADGES;
}
