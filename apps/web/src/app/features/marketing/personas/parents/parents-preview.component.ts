/**
 * @fileoverview Parents Persona Preview Component
 * @module @nxt1/ui/personas/parents
 * @version 1.0.0
 *
 * Interactive mockup of a parent's family recruiting dashboard
 * for use on the `/parents` persona landing page. Shows a realistic
 * preview of the parent's view — child's recruiting timeline,
 * coach interest activity, profile completeness, and family
 * settings inside a browser-chrome window frame.
 *
 * Parents-persona-specific — not a generic shared component.
 * Uses mock values for visual accuracy on the marketing page.
 *
 * 100% design-token styling where applicable.
 * SSR-safe, responsive, purely presentational (aria-hidden).
 *
 * @example
 * ```html
 * <nxt1-parents-preview />
 * ```
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtIconComponent } from '@nxt1/ui/components/icon';

// ============================================
// PREVIEW MOCK DATA
// ============================================

/** Mock child athlete profile. */
const PREVIEW_CHILD = {
  name: 'Sarah Johnson',
  sport: 'Soccer',
  position: 'Forward',
  classYear: '2027',
  school: 'Riverside High',
  profileComplete: 85,
} as const;

/** Mock recruiting timeline events. */
const PREVIEW_TIMELINE = [
  { id: 't1', icon: 'eye-outline', label: 'Stanford viewed profile', time: '3h ago', type: 'view' },
  {
    id: 't2',
    icon: 'mail-outline',
    label: 'Message from UCLA coach',
    time: '1d ago',
    type: 'message',
  },
  {
    id: 't3',
    icon: 'star-outline',
    label: 'Added to Oregon watchlist',
    time: '2d ago',
    type: 'watchlist',
  },
  {
    id: 't4',
    icon: 'videocam-outline',
    label: 'Highlight reel viewed 12 times',
    time: '3d ago',
    type: 'video',
  },
] as const;

/** Mock profile completeness sections. */
const PREVIEW_CHECKLIST = [
  { id: 'c1', label: 'Basic Info', done: true },
  { id: 'c2', label: 'Academics', done: true },
  { id: 'c3', label: 'Highlight Video', done: true },
  { id: 'c4', label: 'Measurables', done: false },
  { id: 'c5', label: 'References', done: false },
] as const;

/** Mock interest summary. */
const PREVIEW_INTEREST = {
  profileViews: 147,
  coachMessages: 8,
  watchlists: 5,
} as const;

@Component({
  selector: 'nxt1-parents-preview',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div class="parents-preview" aria-hidden="true">
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
          <div class="chrome-title">Family Recruiting Dashboard</div>
        </div>

        <!-- Dashboard Body -->
        <div class="preview-body">
          <!-- Child Profile Summary -->
          <div class="child-card">
            <div class="child-header">
              <div class="child-avatar">
                <nxt1-icon name="person-outline" size="20" />
              </div>
              <div class="child-info">
                <span class="child-name">{{ child.name }}</span>
                <span class="child-meta"
                  >{{ child.position }} · {{ child.sport }} · Class of {{ child.classYear }}</span
                >
                <span class="child-school">{{ child.school }}</span>
              </div>
            </div>
            <!-- Profile Completeness -->
            <div class="completeness">
              <div class="completeness-header">
                <span class="completeness-label">Profile Complete</span>
                <span class="completeness-value">{{ child.profileComplete }}%</span>
              </div>
              <div class="completeness-bar">
                <div class="completeness-fill" [style.width.%]="child.profileComplete"></div>
              </div>
            </div>
          </div>

          <!-- Two Column Layout -->
          <div class="preview-columns">
            <!-- Left: Interest Summary + Timeline -->
            <div class="column-left">
              <!-- Interest Summary -->
              <div class="interest-cards">
                <div class="interest-card">
                  <nxt1-icon name="eye-outline" size="14" />
                  <span class="interest-value">{{ interest.profileViews }}</span>
                  <span class="interest-label">Views</span>
                </div>
                <div class="interest-card">
                  <nxt1-icon name="mail-outline" size="14" />
                  <span class="interest-value">{{ interest.coachMessages }}</span>
                  <span class="interest-label">Messages</span>
                </div>
                <div class="interest-card">
                  <nxt1-icon name="star-outline" size="14" />
                  <span class="interest-value">{{ interest.watchlists }}</span>
                  <span class="interest-label">Watchlists</span>
                </div>
              </div>

              <!-- Timeline -->
              <div class="timeline-card">
                <div class="card-title">
                  <nxt1-icon name="time-outline" size="14" />
                  <span>Recruiting Activity</span>
                </div>
                @for (event of timeline; track event.id) {
                  <div class="timeline-row">
                    <nxt1-icon [name]="event.icon" size="12" />
                    <span class="timeline-label">{{ event.label }}</span>
                    <span class="timeline-time">{{ event.time }}</span>
                  </div>
                }
              </div>
            </div>

            <!-- Right: Profile Checklist -->
            <div class="column-right">
              <div class="checklist-card">
                <div class="card-title">
                  <nxt1-icon name="checkmark-circle" size="14" />
                  <span>Profile Checklist</span>
                </div>
                @for (item of checklist; track item.id) {
                  <div class="checklist-row">
                    @if (item.done) {
                      <nxt1-icon name="checkmark-circle" size="14" />
                    } @else {
                      <div class="checklist-empty"></div>
                    }
                    <span class="checklist-label" [class.checklist-label--done]="item.done">
                      {{ item.label }}
                    </span>
                  </div>
                }
              </div>

              <!-- Tip Card -->
              <div class="tip-card">
                <nxt1-icon name="bulb-outline" size="14" />
                <span class="tip-text"
                  >Complete the Measurables section to increase profile visibility by 40%.</span
                >
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

      .parents-preview {
        position: relative;
        width: 100%;
        max-width: 640px;
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

      /* Child Profile Card */
      .child-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-bg-secondary);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-primary);
      }

      .child-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .child-avatar {
        width: 44px;
        height: 44px;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary10);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-primary);
        flex-shrink: 0;
      }

      .child-info {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0_5);
      }

      .child-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      .child-meta {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 600;
        color: var(--nxt1-color-primary);
      }

      .child-school {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);
      }

      /* Completeness Bar */
      .completeness {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
      }

      .completeness-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .completeness-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-secondary);
      }

      .completeness-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 700;
        color: var(--nxt1-color-primary);
      }

      .completeness-bar {
        height: 6px;
        background: var(--nxt1-color-bg-primary);
        border-radius: var(--nxt1-borderRadius-full);
        overflow: hidden;
      }

      .completeness-fill {
        height: 100%;
        background: var(--nxt1-color-primary);
        border-radius: var(--nxt1-borderRadius-full);
        transition: width var(--nxt1-motion-duration-normal) var(--nxt1-motion-easing-inOut);
      }

      /* Two Columns */
      .preview-columns {
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        gap: var(--nxt1-spacing-3);
      }

      .column-left,
      .column-right {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      /* Interest Summary Cards */
      .interest-cards {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--nxt1-spacing-2);
      }

      .interest-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-2_5);
        background: var(--nxt1-color-bg-secondary);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-primary);
        color: var(--nxt1-color-primary);
      }

      .interest-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-md);
        font-weight: 700;
        color: var(--nxt1-color-primary);
      }

      .interest-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
      }

      /* Card shared */
      .timeline-card,
      .checklist-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-bg-secondary);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-primary);
      }

      .card-title {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      /* Timeline Rows */
      .timeline-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-1_5) 0;
        border-bottom: 1px solid var(--nxt1-color-border-primary);
        color: var(--nxt1-color-text-secondary);
      }

      .timeline-row:last-child {
        border-bottom: none;
      }

      .timeline-label {
        flex: 1;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-primary);
      }

      .timeline-time {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
        flex-shrink: 0;
      }

      /* Checklist Rows */
      .checklist-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-1) 0;
        color: var(--nxt1-color-success);
      }

      .checklist-empty {
        width: 14px;
        height: 14px;
        border-radius: var(--nxt1-borderRadius-full);
        border: 2px solid var(--nxt1-color-border-primary);
        flex-shrink: 0;
      }

      .checklist-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-primary);
      }

      .checklist-label--done {
        color: var(--nxt1-color-text-tertiary);
        text-decoration: line-through;
      }

      /* Tip Card */
      .tip-card {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-3);
        background: var(--nxt1-color-alpha-primary6);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
      }

      .tip-text {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-primary);
        line-height: 1.5;
      }

      /* Responsive */
      @media (max-width: 640px) {
        .preview-columns {
          grid-template-columns: 1fr;
        }

        .interest-cards {
          grid-template-columns: repeat(3, 1fr);
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
export class NxtParentsPreviewComponent {
  protected readonly child = PREVIEW_CHILD;
  protected readonly timeline = PREVIEW_TIMELINE;
  protected readonly checklist = PREVIEW_CHECKLIST;
  protected readonly interest = PREVIEW_INTEREST;
}
