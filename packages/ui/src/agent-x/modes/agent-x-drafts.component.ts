/**
 * @fileoverview Agent X Drafts Component
 * @module @nxt1/ui/agent-x/modes
 * @version 1.0.0
 *
 * Horizontal scrolling row of in-progress drafts.
 * Each card shows title, progress bar, status badge, and XP earned.
 * Appears at the top of Highlights & Graphics modes.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AgentXDraft } from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon/icon.component';

@Component({
  selector: 'nxt1-agent-x-drafts',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <section class="drafts-section" aria-label="Your Drafts">
      <div class="section-header">
        <div class="section-label">
          <nxt1-icon name="document-text-outline" [size]="18" class="section-icon" />
          <h3 class="section-title">Drafts</h3>
          <span class="draft-count">{{ drafts().length }}</span>
        </div>
        <button class="see-all-btn" (click)="viewAll.emit()">See all</button>
      </div>

      <div class="drafts-scroll">
        @for (draft of drafts(); track draft.id) {
          <button class="draft-card" (click)="draftSelected.emit(draft)">
            <!-- Thumbnail placeholder -->
            <div class="draft-thumbnail">
              <nxt1-icon
                [name]="draft.status === 'ready' ? 'checkmark-circle' : 'create-outline'"
                [size]="24"
                class="draft-thumb-icon"
              />
            </div>

            <!-- Info -->
            <div class="draft-info">
              <span class="draft-title">{{ draft.title }}</span>
              <div class="draft-meta">
                <span class="draft-status" [attr.data-status]="draft.status">
                  {{ statusLabel(draft.status) }}
                </span>
                <span class="draft-xp">+{{ draft.xpReward }} XP</span>
              </div>
            </div>

            <!-- Progress ring -->
            <div class="draft-progress">
              <svg viewBox="0 0 36 36" class="progress-ring">
                <path
                  class="progress-bg"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  class="progress-fill"
                  [attr.stroke-dasharray]="draft.progress + ', 100'"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span class="progress-text">{{ draft.progress }}%</span>
            </div>
          </button>
        }

        <!-- Create new draft CTA -->
        <button class="draft-card draft-card--new" (click)="createNew.emit()">
          <div class="new-draft-icon">
            <nxt1-icon name="add" [size]="28" />
          </div>
          <span class="new-draft-label">New</span>
        </button>
      </div>
    </section>
  `,
  styles: [
    `
      .drafts-section {
        margin-bottom: var(--nxt1-spacing-6);
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--nxt1-spacing-3);
      }

      .section-label {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .section-icon {
        color: var(--nxt1-color-text-secondary);
      }

      .section-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .draft-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 22px;
        height: 22px;
        padding: 0 var(--nxt1-spacing-1-5);
        font-size: var(--nxt1-fontSize-2xs, 0.65rem);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-onPrimary);
        background: var(--nxt1-color-primary);
        border-radius: var(--nxt1-radius-full);
      }

      .see-all-btn {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-primary);
        background: transparent;
        border: none;
        cursor: pointer;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-radius-md);
        transition: background var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .see-all-btn:hover {
        background: var(--nxt1-color-state-hover);
      }

      /* Horizontal scroll */
      .drafts-scroll {
        display: flex;
        gap: var(--nxt1-spacing-3);
        overflow-x: auto;
        padding-bottom: var(--nxt1-spacing-2);
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .drafts-scroll::-webkit-scrollbar {
        display: none;
      }

      /* Draft card */
      .draft-card {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        min-width: 260px;
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg);
        cursor: pointer;
        transition:
          background var(--nxt1-duration-fast) var(--nxt1-easing-out),
          border-color var(--nxt1-duration-fast) var(--nxt1-easing-out),
          transform var(--nxt1-duration-fast) var(--nxt1-easing-out);
        flex-shrink: 0;
      }

      .draft-card:hover {
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-primary);
        transform: translateY(-1px);
      }

      .draft-card:active {
        transform: scale(0.98);
      }

      /* Thumbnail */
      .draft-thumbnail {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-radius-md);
        flex-shrink: 0;
      }

      .draft-thumb-icon {
        color: var(--nxt1-color-primary);
      }

      /* Info */
      .draft-info {
        flex: 1;
        min-width: 0;
      }

      .draft-title {
        display: block;
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: var(--nxt1-spacing-1);
      }

      .draft-meta {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .draft-status {
        font-size: var(--nxt1-fontSize-2xs, 0.65rem);
        font-weight: var(--nxt1-fontWeight-semibold);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 2px 6px;
        border-radius: var(--nxt1-radius-sm);
      }

      .draft-status[data-status='in-progress'] {
        color: var(--nxt1-color-warning, #f0b429);
        background: var(--nxt1-color-alpha-warning10, rgba(240, 180, 41, 0.1));
      }

      .draft-status[data-status='review'] {
        color: var(--nxt1-color-info, #4da6ff);
        background: var(--nxt1-color-alpha-info10, rgba(77, 166, 255, 0.1));
      }

      .draft-status[data-status='ready'] {
        color: var(--nxt1-color-success, #38b000);
        background: var(--nxt1-color-alpha-success10, rgba(56, 176, 0, 0.1));
      }

      .draft-xp {
        font-size: var(--nxt1-fontSize-2xs, 0.65rem);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-primary);
      }

      /* Progress ring */
      .draft-progress {
        position: relative;
        width: 40px;
        height: 40px;
        flex-shrink: 0;
      }

      .progress-ring {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }

      .progress-bg {
        fill: none;
        stroke: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
        stroke-width: 3;
      }

      .progress-fill {
        fill: none;
        stroke: var(--nxt1-color-primary);
        stroke-width: 3;
        stroke-linecap: round;
        transition: stroke-dasharray 0.4s ease;
      }

      .progress-text {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
      }

      /* New draft CTA */
      .draft-card--new {
        flex-direction: column;
        justify-content: center;
        min-width: 100px;
        border-style: dashed;
        gap: var(--nxt1-spacing-1);
      }

      .new-draft-icon {
        color: var(--nxt1-color-text-secondary);
        transition: color var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .draft-card--new:hover .new-draft-icon {
        color: var(--nxt1-color-primary);
      }

      .new-draft-label {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
      }

      @media (prefers-reduced-motion: reduce) {
        .draft-card {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXDraftsComponent {
  /** Drafts to display. */
  readonly drafts = input.required<readonly AgentXDraft[]>();

  /** Emitted when a draft is selected. */
  readonly draftSelected = output<AgentXDraft>();

  /** Emitted when "See all" is clicked. */
  readonly viewAll = output<void>();

  /** Emitted when the user wants to create a new draft. */
  readonly createNew = output<void>();

  /** Map status to human label. */
  protected statusLabel(status: string): string {
    switch (status) {
      case 'in-progress':
        return 'In Progress';
      case 'review':
        return 'In Review';
      case 'ready':
        return 'Ready';
      default:
        return status;
    }
  }
}
