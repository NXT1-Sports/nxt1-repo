/**
 * @fileoverview Coaches Persona Preview Component
 * @module apps/web/features/marketing/personas/coaches
 * @version 1.0.0
 *
 * Interactive mockup of a college coach's recruiting dashboard
 * for use on the `/coaches` persona landing page. Shows a realistic
 * preview of the search results, player watchlist, team management,
 * and evaluation tools inside a browser-chrome window frame.
 *
 * Coaches-persona-specific — not a generic shared component.
 * Uses mock values for visual accuracy on the marketing page.
 *
 * 100% design-token styling where applicable.
 * SSR-safe, responsive, purely presentational (aria-hidden).
 *
 * @example
 * ```html
 * <nxt1-coaches-preview />
 * ```
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtIconComponent } from '@nxt1/ui/components/icon';

// ============================================
// PREVIEW MOCK DATA
// ============================================

/** Mock search filters. */
const PREVIEW_FILTERS = [
  { id: 'f1', label: 'QB', active: true },
  { id: 'f2', label: 'WR', active: false },
  { id: 'f3', label: 'RB', active: false },
  { id: 'f4', label: '2026', active: true },
  { id: 'f5', label: 'Texas', active: false },
] as const;

/** Mock athlete search results. */
const PREVIEW_RESULTS = [
  {
    id: 'r1',
    name: 'Marcus Johnson',
    position: 'QB',
    classYear: '2026',
    school: 'Riverside High',
    gpa: '3.8',
    rating: 4.5,
    starred: true,
  },
  {
    id: 'r2',
    name: 'Jaylen Williams',
    position: 'QB',
    classYear: '2026',
    school: 'Oakwood Prep',
    gpa: '3.6',
    rating: 4.2,
    starred: false,
  },
  {
    id: 'r3',
    name: 'Devon Carter',
    position: 'QB',
    classYear: '2026',
    school: 'Lincoln Academy',
    gpa: '3.9',
    rating: 4.1,
    starred: true,
  },
] as const;

/** Mock watchlist summary. */
const PREVIEW_WATCHLIST = {
  total: 48,
  newThisWeek: 7,
  evaluations: 12,
} as const;

/** Mock recent evaluations. */
const PREVIEW_EVALUATIONS = [
  { id: 'e1', athlete: 'Marcus Johnson', status: 'Offer Sent', statusType: 'success' },
  { id: 'e2', athlete: 'Devon Carter', status: 'Evaluating', statusType: 'warning' },
] as const;

@Component({
  selector: 'nxt1-coaches-preview',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div class="coaches-preview" aria-hidden="true">
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
          <div class="chrome-title">Coach Recruiting Dashboard</div>
        </div>

        <!-- Dashboard Body -->
        <div class="preview-body">
          <!-- Search Bar -->
          <div class="search-bar">
            <nxt1-icon name="search-outline" size="14" />
            <span class="search-placeholder">Search athletes by name, sport, position…</span>
          </div>

          <!-- Filter Pills -->
          <div class="filter-row">
            @for (filter of filters; track filter.id) {
              <span class="filter-pill" [class.filter-pill--active]="filter.active">
                {{ filter.label }}
              </span>
            }
          </div>

          <!-- Two Column: Results + Sidebar -->
          <div class="preview-columns">
            <!-- Left: Search Results Table -->
            <div class="results-panel">
              <div class="panel-header">
                <span class="panel-title">Search Results</span>
                <span class="panel-count">324 athletes</span>
              </div>

              @for (athlete of results; track athlete.id) {
                <div class="result-row">
                  <div class="result-avatar">
                    <nxt1-icon name="person-outline" size="14" />
                  </div>
                  <div class="result-info">
                    <div class="result-name-row">
                      <span class="result-name">{{ athlete.name }}</span>
                      @if (athlete.starred) {
                        <nxt1-icon name="star" size="10" />
                      }
                    </div>
                    <span class="result-meta"
                      >{{ athlete.position }} · {{ athlete.school }} · {{ athlete.classYear }}</span
                    >
                  </div>
                  <div class="result-stats">
                    <span class="result-gpa">{{ athlete.gpa }} GPA</span>
                    <div class="result-rating">
                      <nxt1-icon name="star" size="8" />
                      <span>{{ athlete.rating }}</span>
                    </div>
                  </div>
                </div>
              }
            </div>

            <!-- Right: Watchlist & Evaluations -->
            <div class="sidebar-panel">
              <!-- Watchlist Card -->
              <div class="sidebar-card">
                <div class="sidebar-title">
                  <nxt1-icon name="bookmark-outline" size="14" />
                  <span>My Watchlist</span>
                </div>
                <div class="watchlist-stats">
                  <div class="watchlist-stat">
                    <span class="watchlist-value">{{ watchlist.total }}</span>
                    <span class="watchlist-label">Athletes</span>
                  </div>
                  <div class="watchlist-stat">
                    <span class="watchlist-value">+{{ watchlist.newThisWeek }}</span>
                    <span class="watchlist-label">This Week</span>
                  </div>
                  <div class="watchlist-stat">
                    <span class="watchlist-value">{{ watchlist.evaluations }}</span>
                    <span class="watchlist-label">Evaluations</span>
                  </div>
                </div>
              </div>

              <!-- Recent Evaluations -->
              <div class="sidebar-card">
                <div class="sidebar-title">
                  <nxt1-icon name="clipboard-outline" size="14" />
                  <span>Recent Evaluations</span>
                </div>
                @for (evaluation of evaluations; track evaluation.id) {
                  <div class="eval-row">
                    <span class="eval-name">{{ evaluation.athlete }}</span>
                    <span class="eval-status" [class]="'eval-status--' + evaluation.statusType">
                      {{ evaluation.status }}
                    </span>
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

      .coaches-preview {
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
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      /* Search Bar */
      .search-bar {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--nxt1-color-bg-secondary);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-primary);
        color: var(--nxt1-color-text-tertiary);
      }

      .search-placeholder {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      /* Filters */
      .filter-row {
        display: flex;
        gap: var(--nxt1-spacing-1_5);
        flex-wrap: wrap;
      }

      .filter-pill {
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-full);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
        background: var(--nxt1-color-bg-secondary);
        border: 1px solid var(--nxt1-color-border-primary);
      }

      .filter-pill--active {
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-inverse);
        border-color: var(--nxt1-color-primary);
      }

      /* Columns */
      .preview-columns {
        display: grid;
        grid-template-columns: 1.4fr 1fr;
        gap: var(--nxt1-spacing-3);
      }

      /* Results Panel */
      .results-panel {
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

      /* Result Rows */
      .result-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-3);
        border-bottom: 1px solid var(--nxt1-color-border-primary);
      }

      .result-row:last-child {
        border-bottom: none;
      }

      .result-avatar {
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

      .result-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0_5);
        min-width: 0;
      }

      .result-name-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        color: var(--nxt1-color-warning);
      }

      .result-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      .result-meta {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
      }

      .result-stats {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: var(--nxt1-spacing-0_5);
        flex-shrink: 0;
      }

      .result-gpa {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
      }

      .result-rating {
        display: flex;
        align-items: center;
        gap: 2px;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        font-weight: 700;
        color: var(--nxt1-color-warning);
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

      /* Watchlist Stats */
      .watchlist-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--nxt1-spacing-2);
      }

      .watchlist-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-0_5);
      }

      .watchlist-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-md);
        font-weight: 700;
        color: var(--nxt1-color-primary);
      }

      .watchlist-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
        text-align: center;
      }

      /* Evaluation Rows */
      .eval-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-1_5) 0;
        border-bottom: 1px solid var(--nxt1-color-border-primary);
      }

      .eval-row:last-child {
        border-bottom: none;
      }

      .eval-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
      }

      .eval-status {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        font-weight: 700;
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
      }

      .eval-status--success {
        background: var(--nxt1-color-alpha-success10, rgba(52, 199, 89, 0.1));
        color: var(--nxt1-color-success);
      }

      .eval-status--warning {
        background: var(--nxt1-color-alpha-warning10, rgba(255, 159, 10, 0.1));
        color: var(--nxt1-color-warning);
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
export class NxtCoachesPreviewComponent {
  protected readonly filters = PREVIEW_FILTERS;
  protected readonly results = PREVIEW_RESULTS;
  protected readonly watchlist = PREVIEW_WATCHLIST;
  protected readonly evaluations = PREVIEW_EVALUATIONS;
}
