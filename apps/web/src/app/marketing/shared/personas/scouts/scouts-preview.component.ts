/**
 * @fileoverview Scouts Persona Preview Component
 * @module apps/web/featur../shared/personas/scouts
 * @version 1.0.0
 *
 * Interactive mockup of an independent scout's evaluation dashboard
 * for use on the `/scouts` persona landing page. Shows a realistic
 * preview of the scouting workspace — athlete evaluation cards,
 * prospect lists, scouting reports, and rating tools inside a
 * browser-chrome window frame.
 *
 * Scouts-persona-specific — not a generic shared component.
 * Uses mock values for visual accuracy on the marketing page.
 *
 * 100% design-token styling where applicable.
 * SSR-safe, responsive, purely presentational (aria-hidden).
 *
 * @example
 * ```html
 * <nxt1-scouts-preview />
 * ```
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtIconComponent } from '@nxt1/ui/components/icon';

// ============================================
// PREVIEW MOCK DATA
// ============================================

/** Mock prospect evaluation cards. */
const PREVIEW_PROSPECTS = [
  {
    id: 'p1',
    name: 'Marcus Johnson',
    position: 'QB',
    classYear: '2026',
    school: 'Riverside High',
    grade: 'A',
    rating: 92,
    status: 'Top Prospect',
  },
  {
    id: 'p2',
    name: 'Jaylen Williams',
    position: 'WR',
    classYear: '2026',
    school: 'Oakwood Prep',
    grade: 'B+',
    rating: 87,
    status: 'Rising',
  },
  {
    id: 'p3',
    name: 'Devon Carter',
    position: 'DB',
    classYear: '2027',
    school: 'Lincoln Academy',
    grade: 'A-',
    rating: 89,
    status: 'Sleeper',
  },
] as const;

/** Mock scouting report metrics. */
const PREVIEW_METRICS = [
  { id: 'm1', label: 'Arm Strength', score: 9.2 },
  { id: 'm2', label: 'Accuracy', score: 8.7 },
  { id: 'm3', label: 'Pocket Presence', score: 8.5 },
  { id: 'm4', label: 'Football IQ', score: 9.0 },
] as const;

/** Mock prospect lists. */
const PREVIEW_LISTS = [
  { id: 'l1', name: 'Top 25 QBs — 2026', count: 25, updated: 'Today' },
  { id: 'l2', name: 'Texas Sleepers', count: 18, updated: '2d ago' },
  { id: 'l3', name: 'Camp Invites — June', count: 42, updated: '1w ago' },
] as const;

@Component({
  selector: 'nxt1-scouts-preview',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div class="scouts-preview" aria-hidden="true">
      <!-- Subtle glow -->
      <div class="preview-glow"></div>

      <!-- Dashboard Window -->
      <div class="preview-window">
        <!-- Browser Chrome -->
        <div class="preview-chrome">
          <div class="chrome-dots">
            <span class="dot dot--close"></span>
            <span class="dot dot--min"></span>
            <span class="dot dot--max"></span>
          </div>
          <div class="chrome-title">Scouting Workspace</div>
        </div>

        <!-- Dashboard Body -->
        <div class="preview-body">
          <!-- Two Column Layout -->
          <div class="preview-columns">
            <!-- Left: Prospect Evaluations -->
            <div class="prospects-panel">
              <div class="panel-header">
                <span class="panel-title">Prospect Evaluations</span>
                <span class="panel-count">{{ prospects.length }} athletes</span>
              </div>

              @for (prospect of prospects; track prospect.id) {
                <div class="prospect-row">
                  <div class="prospect-avatar">
                    <nxt1-icon name="person-outline" size="14" />
                  </div>
                  <div class="prospect-info">
                    <div class="prospect-name-row">
                      <span class="prospect-name">{{ prospect.name }}</span>
                      <span
                        class="prospect-status"
                        [class]="'status--' + prospect.status.toLowerCase().replace(' ', '-')"
                      >
                        {{ prospect.status }}
                      </span>
                    </div>
                    <span class="prospect-meta"
                      >{{ prospect.position }} · {{ prospect.school }} ·
                      {{ prospect.classYear }}</span
                    >
                  </div>
                  <div class="prospect-rating">
                    <span class="rating-grade">{{ prospect.grade }}</span>
                    <span class="rating-score">{{ prospect.rating }}</span>
                  </div>
                </div>
              }
            </div>

            <!-- Right: Metrics + Lists -->
            <div class="sidebar-panel">
              <!-- Scouting Report Metrics -->
              <div class="sidebar-card">
                <div class="sidebar-title">
                  <nxt1-icon name="clipboard-outline" size="14" />
                  <span>Scout Report</span>
                </div>
                @for (metric of metrics; track metric.id) {
                  <div class="metric-row">
                    <span class="metric-label">{{ metric.label }}</span>
                    <div class="metric-bar-wrapper">
                      <div class="metric-bar">
                        <div class="metric-fill" [style.width.%]="metric.score * 10"></div>
                      </div>
                      <span class="metric-score">{{ metric.score }}</span>
                    </div>
                  </div>
                }
              </div>

              <!-- Prospect Lists -->
              <div class="sidebar-card">
                <div class="sidebar-title">
                  <nxt1-icon name="list-outline" size="14" />
                  <span>My Lists</span>
                </div>
                @for (list of lists; track list.id) {
                  <div class="list-row">
                    <div class="list-info">
                      <span class="list-name">{{ list.name }}</span>
                      <span class="list-meta">{{ list.count }} athletes · {{ list.updated }}</span>
                    </div>
                    <nxt1-icon name="chevron-forward-outline" size="12" />
                  </div>
                }
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

      .scouts-preview {
        position: relative;
        width: 100%;
        max-width: 660px;
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
      }

      /* Two Column Layout */
      .preview-columns {
        display: grid;
        grid-template-columns: 1.3fr 1fr;
        gap: var(--nxt1-spacing-3);
      }

      /* Prospects Panel */
      .prospects-panel {
        display: flex;
        flex-direction: column;
        background: var(--nxt1-color-bg-secondary);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-primary);
        overflow: hidden;
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-3);
        border-bottom: 1px solid var(--nxt1-color-border-primary);
      }

      .panel-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      .panel-count {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);
      }

      /* Prospect Rows */
      .prospect-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-3);
        border-bottom: 1px solid var(--nxt1-color-border-primary);
      }

      .prospect-row:last-child {
        border-bottom: none;
      }

      .prospect-avatar {
        width: 32px;
        height: 32px;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary10);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--nxt1-color-primary);
      }

      .prospect-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0_5);
        min-width: 0;
      }

      .prospect-name-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .prospect-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      .prospect-status {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 8px;
        font-weight: 700;
        padding: 2px var(--nxt1-spacing-1_5);
        border-radius: var(--nxt1-borderRadius-full);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .status--top-prospect {
        background: var(--nxt1-color-alpha-success10, rgba(52, 199, 89, 0.1));
        color: var(--nxt1-color-success);
      }

      .status--rising {
        background: var(--nxt1-color-alpha-warning10, rgba(255, 159, 10, 0.1));
        color: var(--nxt1-color-warning);
      }

      .status--sleeper {
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
      }

      .prospect-meta {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
      }

      .prospect-rating {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-0_5);
        flex-shrink: 0;
      }

      .rating-grade {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 800;
        color: var(--nxt1-color-primary);
      }

      .rating-score {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
      }

      /* Sidebar */
      .sidebar-panel {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .sidebar-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-bg-secondary);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-primary);
      }

      .sidebar-title {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      /* Metric Rows */
      .metric-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .metric-label {
        flex-shrink: 0;
        width: 90px;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-secondary);
      }

      .metric-bar-wrapper {
        flex: 1;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
      }

      .metric-bar {
        flex: 1;
        height: 6px;
        background: var(--nxt1-color-bg-primary);
        border-radius: var(--nxt1-borderRadius-full);
        overflow: hidden;
      }

      .metric-fill {
        height: 100%;
        background: var(--nxt1-color-primary);
        border-radius: var(--nxt1-borderRadius-full);
      }

      .metric-score {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        min-width: 22px;
        text-align: right;
      }

      /* List Rows */
      .list-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-1_5) 0;
        border-bottom: 1px solid var(--nxt1-color-border-primary);
        color: var(--nxt1-color-text-tertiary);
      }

      .list-row:last-child {
        border-bottom: none;
      }

      .list-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0_5);
        min-width: 0;
      }

      .list-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
      }

      .list-meta {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
      }

      /* Responsive */
      @media (max-width: 640px) {
        .preview-columns {
          grid-template-columns: 1fr;
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
export class NxtScoutsPreviewComponent {
  protected readonly prospects = PREVIEW_PROSPECTS;
  protected readonly metrics = PREVIEW_METRICS;
  protected readonly lists = PREVIEW_LISTS;
}
