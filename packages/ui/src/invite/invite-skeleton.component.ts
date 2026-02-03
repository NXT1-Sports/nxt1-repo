/**
 * @fileoverview Invite Skeleton Component - Loading State
 * @module @nxt1/ui/invite
 * @version 1.0.0
 *
 * Skeleton loading placeholders for invite feature.
 * Matches the layout of the actual content.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-invite-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="invite-skeleton">
      <!-- Stats Card Skeleton -->
      <div class="skeleton-stats-card">
        <div class="skeleton-stats-card__main">
          <div class="skeleton-ring"></div>
          <div class="skeleton-stats-info">
            <div class="skeleton-line skeleton-line--lg"></div>
            <div class="skeleton-line skeleton-line--sm"></div>
            <div class="skeleton-progress-bar"></div>
          </div>
        </div>
        <div class="skeleton-quick-stats">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton-stat">
              <div class="skeleton-line skeleton-line--md"></div>
              <div class="skeleton-line skeleton-line--xs"></div>
            </div>
          }
        </div>
      </div>

      <!-- Link Card Skeleton -->
      <div class="skeleton-link-card">
        <div class="skeleton-link-content">
          <div class="skeleton-line skeleton-line--xs"></div>
          <div class="skeleton-line skeleton-line--md"></div>
        </div>
        <div class="skeleton-btn"></div>
      </div>

      <!-- Quick Share Skeleton -->
      <div class="skeleton-section">
        <div class="skeleton-line skeleton-line--sm skeleton-section-title"></div>
        <div class="skeleton-channel-grid">
          @for (i of [1, 2, 3]; track i) {
            <div class="skeleton-channel">
              <div class="skeleton-channel__icon"></div>
              <div class="skeleton-line skeleton-line--sm"></div>
            </div>
          }
        </div>
      </div>

      <!-- Social Grid Skeleton -->
      <div class="skeleton-section">
        <div class="skeleton-line skeleton-line--sm skeleton-section-title"></div>
        <div class="skeleton-channel-grid skeleton-channel-grid--4">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton-channel skeleton-channel--small">
              <div class="skeleton-channel__icon skeleton-channel__icon--small"></div>
              <div class="skeleton-line skeleton-line--xs"></div>
            </div>
          }
        </div>
      </div>

      <!-- QR Section Skeleton -->
      <div class="skeleton-qr-section">
        <div class="skeleton-line skeleton-line--sm skeleton-section-title"></div>
        <div class="skeleton-qr">
          <div class="skeleton-qr__code"></div>
          <div class="skeleton-qr__actions">
            <div class="skeleton-btn skeleton-btn--half"></div>
            <div class="skeleton-btn skeleton-btn--half"></div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       SKELETON BASE STYLES
       ============================================ */

      :host {
        display: block;
        padding: var(--nxt1-spacing-4);
      }

      .invite-skeleton {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
      }

      /* Shimmer animation - Uses global design tokens (2026 Theme-Aware) */
      @keyframes skeleton-shimmer {
        0% {
          background-position: -200% 0;
        }
        100% {
          background-position: 200% 0;
        }
      }

      .skeleton-line,
      .skeleton-ring,
      .skeleton-btn,
      .skeleton-channel__icon,
      .skeleton-qr__code,
      .skeleton-progress-bar {
        background: linear-gradient(
          90deg,
          var(--nxt1-color-loading-skeleton) 25%,
          var(--nxt1-color-loading-skeletonShimmer) 50%,
          var(--nxt1-color-loading-skeleton) 75%
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer 1.5s infinite ease-in-out;
        border-radius: var(--nxt1-radius-md);
      }

      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .skeleton-line,
        .skeleton-ring,
        .skeleton-btn,
        .skeleton-channel__icon,
        .skeleton-qr__code,
        .skeleton-progress-bar {
          animation: none;
          background: var(--nxt1-color-loading-skeleton);
        }
      }

      .skeleton-line {
        height: 12px;
      }

      .skeleton-line--xs {
        height: 8px;
        width: 40px;
      }

      .skeleton-line--sm {
        height: 12px;
        width: 80px;
      }

      .skeleton-line--md {
        height: 16px;
        width: 120px;
      }

      .skeleton-line--lg {
        height: 32px;
        width: 100px;
      }

      /* ============================================
       STATS CARD SKELETON
       ============================================ */

      .skeleton-stats-card {
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        padding: var(--nxt1-spacing-4);
      }

      .skeleton-stats-card__main {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .skeleton-ring {
        width: 100px;
        height: 100px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .skeleton-stats-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .skeleton-progress-bar {
        height: 6px;
        width: 100%;
        margin-top: var(--nxt1-spacing-2);
      }

      .skeleton-quick-stats {
        display: flex;
        justify-content: space-between;
        padding-top: var(--nxt1-spacing-3);
        border-top: 1px solid var(--nxt1-color-border-subtle);
      }

      .skeleton-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1);
      }

      /* ============================================
       LINK CARD SKELETON
       ============================================ */

      .skeleton-link-card {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .skeleton-link-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .skeleton-btn {
        width: 80px;
        height: 36px;
        border-radius: var(--nxt1-radius-full);
      }

      .skeleton-btn--half {
        flex: 1;
        height: 44px;
        border-radius: var(--nxt1-radius-lg);
      }

      /* ============================================
       SECTIONS
       ============================================ */

      .skeleton-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .skeleton-section-title {
        width: 60px;
      }

      /* ============================================
       CHANNEL GRID SKELETON
       ============================================ */

      .skeleton-channel-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--nxt1-spacing-3);
      }

      .skeleton-channel-grid--4 {
        grid-template-columns: repeat(4, 1fr);
      }

      .skeleton-channel {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .skeleton-channel--small {
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-2);
      }

      .skeleton-channel__icon {
        width: 52px;
        height: 52px;
        border-radius: var(--nxt1-radius-xl);
      }

      .skeleton-channel__icon--small {
        width: 44px;
        height: 44px;
        border-radius: var(--nxt1-radius-lg);
      }

      /* ============================================
       QR SECTION SKELETON
       ============================================ */

      .skeleton-qr-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .skeleton-qr {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .skeleton-qr__code {
        width: 180px;
        height: 180px;
        border-radius: var(--nxt1-radius-lg);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .skeleton-qr__actions {
        display: flex;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        max-width: 280px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteSkeletonComponent {}
