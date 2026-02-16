/**
 * @fileoverview Sport Landing Preview Component
 * @module @nxt1/ui/sport-landing
 * @version 1.0.0
 *
 * Interactive mockup that previews a sport-specific recruiting dashboard.
 * Receives data from the parent landing component via inputs so the
 * same component code renders different sport visuals.
 *
 * SSR-safe, responsive, purely presentational (aria-hidden).
 *
 * @example
 * ```html
 * <nxt1-sport-landing-preview
 *   [sportLabel]="config.previewSportLabel"
 *   [highlights]="config.previewHighlights"
 *   [rankings]="config.previewRankings"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { NxtIconComponent } from '../components/icon';
import type { SportLandingHighlight, SportLandingRanking } from '@nxt1/core';

@Component({
  selector: 'nxt1-sport-landing-preview',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div class="sport-preview" aria-hidden="true">
      <div class="preview-glow"></div>

      <div class="preview-window">
        <!-- Browser Chrome -->
        <div class="preview-chrome">
          <div class="chrome-dots">
            <span class="dot dot--close"></span>
            <span class="dot dot--min"></span>
            <span class="dot dot--max"></span>
          </div>
          <div class="chrome-title">{{ sportLabel() }} Recruiting — NXT1</div>
        </div>

        <!-- Dashboard Body -->
        <div class="preview-body">
          <!-- Two Column Layout -->
          <div class="preview-columns">
            <!-- Left: Rankings Table -->
            <div class="rankings-panel">
              <div class="panel-header">
                <nxt1-icon name="trophy-outline" [size]="14" />
                <span>Top {{ sportLabel() }} Recruits</span>
              </div>
              <div class="rankings-table">
                <div class="table-header-row">
                  <span class="col-rank">#</span>
                  <span class="col-name">Name</span>
                  <span class="col-pos">Pos</span>
                  <span class="col-year">Class</span>
                  <span class="col-rating">Rating</span>
                </div>
                @for (player of rankings(); track player.rank) {
                  <div class="table-row" [class.table-row--top]="player.rank <= 3">
                    <span class="col-rank rank-badge">{{ player.rank }}</span>
                    <span class="col-name">{{ player.name }}</span>
                    <span class="col-pos">{{ player.position }}</span>
                    <span class="col-year">{{ player.classYear }}</span>
                    <span class="col-rating">
                      <span class="rating-pill">{{ player.rating }}</span>
                    </span>
                  </div>
                }
              </div>
            </div>

            <!-- Right: Highlights & Stats -->
            <div class="highlights-panel">
              <div class="panel-header">
                <nxt1-icon name="videocam-outline" [size]="14" />
                <span>Top Highlights</span>
              </div>

              @for (clip of highlights(); track clip.id) {
                <div class="highlight-card">
                  <div class="highlight-thumb">
                    <nxt1-icon name="play-outline" [size]="20" />
                    <span class="highlight-duration">{{ clip.duration }}</span>
                  </div>
                  <div class="highlight-meta">
                    <div class="highlight-title">{{ clip.title }}</div>
                    <div class="highlight-views">
                      <nxt1-icon name="eye-outline" [size]="11" />
                      {{ clip.views }} views
                    </div>
                  </div>
                </div>
              }

              <!-- Quick stats row -->
              <div class="quick-stats">
                <div class="quick-stat">
                  <span class="quick-stat-value">125K+</span>
                  <span class="quick-stat-label">Athletes</span>
                </div>
                <div class="quick-stat">
                  <span class="quick-stat-value">900+</span>
                  <span class="quick-stat-label">Programs</span>
                </div>
                <div class="quick-stat">
                  <span class="quick-stat-value">2M+</span>
                  <span class="quick-stat-label">Views/mo</span>
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

      .sport-preview {
        position: relative;
        width: 100%;
        max-width: 680px;
        margin: 0 auto;
      }

      /* Subtle glow */
      .preview-glow {
        position: absolute;
        inset: -20%;
        background: radial-gradient(
          ellipse at center,
          var(--nxt1-color-primary-rgb, rgba(59, 130, 246, 0.12)) 0%,
          transparent 70%
        );
        filter: blur(40px);
        z-index: 0;
        pointer-events: none;
      }

      /* Window frame */
      .preview-window {
        position: relative;
        z-index: 1;
        border-radius: var(--nxt1-radius-xl, 16px);
        overflow: hidden;
        background: var(--nxt1-color-surface-primary, #fff);
        border: 1px solid var(--nxt1-color-border-primary, rgba(0, 0, 0, 0.08));
        box-shadow:
          0 4px 24px rgba(0, 0, 0, 0.08),
          0 1px 3px rgba(0, 0, 0, 0.04);
      }

      /* Chrome top bar */
      .preview-chrome {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px;
        background: var(--nxt1-color-surface-secondary, #f9fafb);
        border-bottom: 1px solid var(--nxt1-color-border-primary, rgba(0, 0, 0, 0.06));
      }
      .chrome-dots {
        display: flex;
        gap: 6px;
      }
      .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
      }
      .dot--close {
        background: #ff5f57;
      }
      .dot--min {
        background: #ffbd2e;
      }
      .dot--max {
        background: #28c840;
      }
      .chrome-title {
        font-size: 11px;
        color: var(--nxt1-color-text-secondary, #6b7280);
        font-weight: 500;
      }

      /* Body */
      .preview-body {
        padding: 16px;
      }

      .preview-columns {
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        gap: 16px;
      }

      /* Panel header */
      .panel-header {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #111827);
        margin-bottom: 10px;
      }

      /* Rankings Table */
      .rankings-table {
        font-size: 11px;
        border: 1px solid var(--nxt1-color-border-primary, rgba(0, 0, 0, 0.06));
        border-radius: var(--nxt1-radius-md, 8px);
        overflow: hidden;
      }
      .table-header-row,
      .table-row {
        display: grid;
        grid-template-columns: 28px 1fr 36px 42px 48px;
        align-items: center;
        padding: 6px 10px;
      }
      .table-header-row {
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, #6b7280);
        background: var(--nxt1-color-surface-secondary, #f9fafb);
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .table-row {
        border-top: 1px solid var(--nxt1-color-border-primary, rgba(0, 0, 0, 0.04));
        color: var(--nxt1-color-text-primary, #111827);
      }
      .table-row--top {
        font-weight: 600;
      }
      .rank-badge {
        font-weight: 700;
      }
      .rating-pill {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 999px;
        background: var(--nxt1-color-primary, #3b82f6);
        color: #fff;
        font-size: 10px;
        font-weight: 700;
      }

      /* Highlights */
      .highlight-card {
        display: flex;
        gap: 10px;
        padding: 8px;
        border: 1px solid var(--nxt1-color-border-primary, rgba(0, 0, 0, 0.06));
        border-radius: var(--nxt1-radius-md, 8px);
        margin-bottom: 8px;
      }
      .highlight-thumb {
        flex-shrink: 0;
        width: 72px;
        height: 48px;
        background: var(--nxt1-color-surface-secondary, #f3f4f6);
        border-radius: var(--nxt1-radius-sm, 6px);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      }
      .highlight-duration {
        position: absolute;
        bottom: 3px;
        right: 4px;
        font-size: 9px;
        font-weight: 600;
        background: rgba(0, 0, 0, 0.7);
        color: #fff;
        padding: 1px 4px;
        border-radius: 3px;
      }
      .highlight-meta {
        min-width: 0;
      }
      .highlight-title {
        font-size: 11px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #111827);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .highlight-views {
        display: flex;
        align-items: center;
        gap: 3px;
        font-size: 10px;
        color: var(--nxt1-color-text-tertiary, #9ca3af);
        margin-top: 2px;
      }

      /* Quick stats */
      .quick-stats {
        display: flex;
        justify-content: space-between;
        margin-top: 12px;
        padding: 10px;
        background: var(--nxt1-color-surface-secondary, #f9fafb);
        border-radius: var(--nxt1-radius-md, 8px);
      }
      .quick-stat {
        text-align: center;
      }
      .quick-stat-value {
        display: block;
        font-size: 14px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #111827);
      }
      .quick-stat-label {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--nxt1-color-text-tertiary, #9ca3af);
      }

      /* Responsive */
      @media (max-width: 600px) {
        .preview-columns {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtSportLandingPreviewComponent {
  readonly sportLabel = input.required<string>();
  readonly highlights = input.required<readonly SportLandingHighlight[]>();
  readonly rankings = input.required<readonly SportLandingRanking[]>();
}
