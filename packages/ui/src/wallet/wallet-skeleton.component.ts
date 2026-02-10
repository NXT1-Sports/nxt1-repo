/**
 * @fileoverview Wallet Skeleton Component
 * @module @nxt1/ui/wallet
 * @version 1.0.0
 *
 * Skeleton loading state for Credit Wallet feature.
 * Shows animated placeholders while content is loading.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Animated shimmer effect
 * - Matches actual layout structure
 * - Theme-aware colors
 * - Reduced motion support
 *
 * @example
 * ```html
 * <nxt1-wallet-skeleton />
 * ```
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-wallet-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="skeleton-container">
      <!-- Balance Card Skeleton -->
      <div class="balance-skeleton">
        <div class="balance-total-skeleton shimmer"></div>
        <div class="balance-label-skeleton shimmer"></div>
        <div class="balance-breakdown-skeleton">
          @for (i of [1, 2, 3]; track i) {
            <div class="balance-type-skeleton shimmer" [style.animation-delay]="i * 0.08 + 's'"></div>
          }
        </div>
      </div>

      <!-- Bundles Skeleton -->
      <div class="bundles-skeleton">
        <div class="bundles-title-skeleton shimmer"></div>
        <div class="bundle-grid-skeleton">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="bundle-card-skeleton shimmer" [style.animation-delay]="i * 0.1 + 's'"></div>
          }
        </div>
      </div>

      <!-- History Skeleton -->
      <div class="history-skeleton">
        <div class="history-title-skeleton shimmer"></div>
        @for (i of [1, 2, 3, 4, 5]; track i) {
          <div class="history-item-skeleton shimmer" [style.animation-delay]="i * 0.08 + 's'"></div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       WALLET SKELETON — Loading States
       2026 Theme-Aware Design Tokens
       ============================================ */

      :host {
        display: block;
      }

      .skeleton-container {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
        padding: var(--nxt1-spacing-4);
      }

      /* Shimmer Animation */
      .shimmer {
        background: linear-gradient(
          90deg,
          var(--nxt1-color-loading-skeleton) 0%,
          var(--nxt1-color-loading-skeletonShimmer) 50%,
          var(--nxt1-color-loading-skeleton) 100%
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer 1.5s infinite ease-in-out;
      }

      @keyframes skeleton-shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .shimmer {
          animation: none;
          background: var(--nxt1-color-loading-skeleton);
        }
      }

      /* ============================================
         BALANCE SKELETON
         ============================================ */

      .balance-skeleton {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-6);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
      }

      .balance-total-skeleton {
        width: 140px;
        height: 56px;
        border-radius: var(--nxt1-radius-lg);
      }

      .balance-label-skeleton {
        width: 100px;
        height: 18px;
        border-radius: var(--nxt1-radius-md);
      }

      .balance-breakdown-skeleton {
        display: flex;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        margin-top: var(--nxt1-spacing-2);
      }

      .balance-type-skeleton {
        flex: 1;
        height: 60px;
        border-radius: var(--nxt1-radius-lg);
      }

      /* ============================================
         BUNDLES SKELETON
         ============================================ */

      .bundles-skeleton {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .bundles-title-skeleton {
        width: 140px;
        height: 22px;
        border-radius: var(--nxt1-radius-md);
      }

      .bundle-grid-skeleton {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-3);
      }

      .bundle-card-skeleton {
        height: 120px;
        border-radius: var(--nxt1-radius-xl);
      }

      /* ============================================
         HISTORY SKELETON
         ============================================ */

      .history-skeleton {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .history-title-skeleton {
        width: 120px;
        height: 22px;
        border-radius: var(--nxt1-radius-md);
      }

      .history-item-skeleton {
        height: 64px;
        border-radius: var(--nxt1-radius-lg);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletSkeletonComponent {}
