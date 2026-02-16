/**
 * @fileoverview Manage Team Dashboard Preview Component
 * @module @nxt1/ui/manage-team
 * @version 1.0.0
 *
 * Interactive mockup of the team management dashboard for use on
 * the manage-team landing page. Shows a realistic preview of the
 * roster list, team record, schedule, and completion progress
 * inside a browser-chrome window frame.
 *
 * Manage-team-specific — not a generic shared component.
 * Uses mock values for visual accuracy on the marketing page.
 *
 * 100% design-token styling where applicable. Micro-scale preview
 * elements use pixel values where token granularity is insufficient.
 * SSR-safe, responsive, purely presentational (aria-hidden).
 *
 * @example
 * ```html
 * <nxt1-manage-team-dashboard-preview />
 * ```
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtIconComponent } from '../components/icon';

// ============================================
// PREVIEW MOCK DATA
// ============================================

/** Mock roster players for the preview. */
const PREVIEW_ROSTER = [
  { id: 'p1', name: 'Marcus Johnson', number: '10', position: 'QB', status: 'active' as const },
  { id: 'p2', name: 'DeAndre Williams', number: '22', position: 'RB', status: 'active' as const },
  { id: 'p3', name: 'Tyler Brooks', number: '55', position: 'LB', status: 'active' as const },
  { id: 'p4', name: 'Chris Anderson', number: '7', position: 'WR', status: 'injured' as const },
] as const;

/** Mock schedule events for the preview. */
const PREVIEW_SCHEDULE = [
  {
    id: 's1',
    opponent: 'vs Lincoln Eagles',
    date: 'Fri, Mar 14',
    type: 'game' as const,
    result: 'W 28-14',
  },
  {
    id: 's2',
    opponent: 'at Westfield Lions',
    date: 'Fri, Mar 21',
    type: 'game' as const,
    result: null,
  },
  {
    id: 's3',
    opponent: 'vs Central Bears',
    date: 'Fri, Mar 28',
    type: 'game' as const,
    result: null,
  },
] as const;

@Component({
  selector: 'nxt1-manage-team-dashboard-preview',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div class="team-preview" aria-hidden="true">
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
          <span class="preview-title">Manage Team</span>
        </div>

        <!-- Dashboard Body -->
        <div class="preview-body">
          <!-- Team Header -->
          <div class="team-header-row">
            <div class="team-logo-box">
              <nxt1-icon name="shield" size="20" />
            </div>
            <div class="team-header-info">
              <span class="team-name">Riverside Tigers</span>
              <span class="team-meta">Football &bull; Varsity &bull; 2026</span>
            </div>
            <div class="completion-badge">
              <span class="completion-value">78%</span>
              <span class="completion-label">Complete</span>
            </div>
          </div>

          <!-- Record Card -->
          <div class="record-card">
            <div class="record-item">
              <span class="record-number record-number--wins">8</span>
              <span class="record-label">Wins</span>
            </div>
            <div class="record-divider"></div>
            <div class="record-item">
              <span class="record-number record-number--losses">2</span>
              <span class="record-label">Losses</span>
            </div>
            <div class="record-divider"></div>
            <div class="record-item">
              <span class="record-number">0</span>
              <span class="record-label">Ties</span>
            </div>
            <div class="record-divider"></div>
            <div class="record-item">
              <span class="record-number">#4</span>
              <span class="record-label">Rank</span>
            </div>
          </div>

          <!-- Roster Preview -->
          <div class="section-card">
            <div class="section-header">
              <nxt1-icon name="people-outline" size="12" />
              <span class="section-title">Roster</span>
              <span class="section-count">26 players</span>
            </div>
            @for (player of previewRoster; track player.id) {
              <div class="roster-row">
                <div class="player-avatar">
                  <span class="player-number">{{ player.number }}</span>
                </div>
                <div class="player-info">
                  <span class="player-name">{{ player.name }}</span>
                  <span class="player-pos">{{ player.position }}</span>
                </div>
                <span
                  class="status-dot"
                  [class.status-dot--active]="player.status === 'active'"
                  [class.status-dot--injured]="player.status === 'injured'"
                ></span>
              </div>
            }
          </div>

          <!-- Schedule Preview -->
          <div class="section-card">
            <div class="section-header">
              <nxt1-icon name="calendar-outline" size="12" />
              <span class="section-title">Schedule</span>
              <span class="section-count">10 games</span>
            </div>
            @for (event of previewSchedule; track event.id) {
              <div class="schedule-row">
                <div class="schedule-info">
                  <span class="schedule-opponent">{{ event.opponent }}</span>
                  <span class="schedule-date">{{ event.date }}</span>
                </div>
                @if (event.result) {
                  <span class="schedule-result schedule-result--win">{{ event.result }}</span>
                } @else {
                  <span class="schedule-result schedule-result--upcoming">Upcoming</span>
                }
              </div>
            }
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
     * TEAM PREVIEW CONTAINER
     * ============================================ */
      .team-preview {
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
        gap: var(--nxt1-spacing-2);
      }

      /* ============================================
     * TEAM HEADER ROW
     * ============================================ */
      .team-header-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .team-logo-box {
        width: 36px;
        height: 36px;
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .team-header-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .team-name {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        line-height: 1.2;
      }

      .team-meta {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
      }

      .completion-badge {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        background: var(--nxt1-color-alpha-primary10);
        border-radius: var(--nxt1-borderRadius-md);
        flex-shrink: 0;
      }

      .completion-value {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
        line-height: 1;
      }

      .completion-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 8px;
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      /* ============================================
     * RECORD CARD
     * ============================================ */
      .record-card {
        display: flex;
        align-items: center;
        justify-content: space-around;
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-borderRadius-md);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .record-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
      }

      .record-number {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        line-height: 1.2;
      }

      .record-number--wins {
        color: var(--nxt1-color-success);
      }

      .record-number--losses {
        color: var(--nxt1-color-error);
      }

      .record-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
      }

      .record-divider {
        width: 1px;
        height: var(--nxt1-spacing-6);
        background: var(--nxt1-color-border-subtle);
      }

      /* ============================================
     * SECTION CARD — Roster / Schedule containers
     * ============================================ */
      .section-card {
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-borderRadius-md);
        padding: var(--nxt1-spacing-2);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .section-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        margin-bottom: var(--nxt1-spacing-1_5);
        color: var(--nxt1-color-text-secondary);
      }

      .section-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 10px;
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .section-count {
        margin-left: auto;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
     * ROSTER ROWS
     * ============================================ */
      .roster-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-1_5) 0;
        border-top: 1px solid var(--nxt1-color-border-subtle);
      }

      .roster-row:first-of-type {
        border-top: none;
      }

      .player-avatar {
        width: 24px;
        height: 24px;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-surface-300);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .player-number {
        font-family: var(--nxt1-fontFamily-display);
        font-size: 9px;
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
      }

      .player-info {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
      }

      .player-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 10px;
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
      }

      .player-pos {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
      }

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: var(--nxt1-borderRadius-full);
        flex-shrink: 0;
      }

      .status-dot--active {
        background: var(--nxt1-color-success);
      }

      .status-dot--injured {
        background: var(--nxt1-color-error);
      }

      /* ============================================
     * SCHEDULE ROWS
     * ============================================ */
      .schedule-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-1_5) 0;
        border-top: 1px solid var(--nxt1-color-border-subtle);
      }

      .schedule-row:first-of-type {
        border-top: none;
      }

      .schedule-info {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .schedule-opponent {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 10px;
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
      }

      .schedule-date {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
      }

      .schedule-result {
        font-family: var(--nxt1-fontFamily-display);
        font-size: 9px;
        font-weight: var(--nxt1-fontWeight-semibold);
        white-space: nowrap;
      }

      .schedule-result--win {
        color: var(--nxt1-color-success);
      }

      .schedule-result--upcoming {
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
     * RESPONSIVE
     * ============================================ */
      @media (max-width: 480px) {
        .team-preview {
          padding: var(--nxt1-spacing-4) var(--nxt1-spacing-2);
        }

        .team-logo-box {
          width: 28px;
          height: 28px;
        }

        .record-number {
          font-size: var(--nxt1-fontSize-sm);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtManageTeamDashboardPreviewComponent {
  protected readonly previewRoster = PREVIEW_ROSTER;
  protected readonly previewSchedule = PREVIEW_SCHEDULE;
}
