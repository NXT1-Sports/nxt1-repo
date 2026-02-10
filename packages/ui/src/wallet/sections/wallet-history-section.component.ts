/**
 * @fileoverview Wallet History Section Component
 * @module @nxt1/ui/wallet/sections
 * @version 1.0.0
 *
 * Displays credit transaction history with type-aware icons,
 * color-coded amounts (spend = red, purchase/granted = green),
 * and relative timestamps.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  removeCircleOutline,
  addCircleOutline,
  giftOutline,
  returnDownBackOutline,
  chevronForwardOutline,
} from 'ionicons/icons';
import type { WalletTransaction } from '../wallet.mock-data';

addIcons({
  removeCircleOutline,
  addCircleOutline,
  giftOutline,
  returnDownBackOutline,
  chevronForwardOutline,
});

@Component({
  selector: 'nxt1-wallet-history-section',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect],
  template: `
    <div class="history-section">
      @if (transactions().length === 0) {
        <!-- Empty State -->
        <div class="empty-state">
          <ion-icon name="time-outline"></ion-icon>
          <p class="empty-title">No transactions yet</p>
          <p class="empty-description">Your credit activity will appear here</p>
        </div>
      } @else {
        <!-- Transaction List -->
        <div class="transaction-list">
          @for (txn of displayedTransactions(); track txn.id) {
            <div class="transaction-item">
              <!-- Type Icon -->
              <div class="txn-icon" [class]="'txn-icon--' + txn.type">
                <ion-icon [name]="getIcon(txn.type)"></ion-icon>
              </div>

              <!-- Details -->
              <div class="txn-details">
                <span class="txn-description">{{ txn.description }}</span>
                <span class="txn-time">{{ formatRelativeTime(txn.createdAt) }}</span>
              </div>

              <!-- Amount -->
              <div
                class="txn-amount"
                [class]="'txn-amount--' + (txn.amount > 0 ? 'positive' : 'negative')"
              >
                <span>{{ txn.amount > 0 ? '+' : '' }}{{ txn.amount }}</span>
              </div>
            </div>
          }
        </div>

        <!-- View All CTA -->
        @if (hasMore()) {
          <button type="button" class="view-all-btn" (click)="viewAll.emit()">
            <ion-ripple-effect></ion-ripple-effect>
            <span>View all transactions</span>
            <ion-icon name="chevron-forward-outline"></ion-icon>
          </button>
        }
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       WALLET HISTORY SECTION — 2026 Design Tokens
       ============================================ */

      :host {
        display: block;
      }

      .history-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) 0;
      }

      /* ============================================
         EMPTY STATE
         ============================================ */

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-6) var(--nxt1-spacing-4);

        ion-icon {
          font-size: 40px;
          color: var(--nxt1-color-text-tertiary);
        }
      }

      .empty-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      .empty-description {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary);
        margin: 0;
      }

      /* ============================================
         TRANSACTION LIST
         ============================================ */

      .transaction-list {
        display: flex;
        flex-direction: column;
      }

      .transaction-item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3) 0;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);

        &:last-child {
          border-bottom: none;
        }
      }

      /* ============================================
         TRANSACTION ICON
         ============================================ */

      .txn-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: var(--nxt1-radius-lg);
        flex-shrink: 0;

        ion-icon {
          font-size: 18px;
        }
      }

      .txn-icon--spend {
        background: color-mix(in srgb, var(--nxt1-color-error) 12%, transparent);

        ion-icon {
          color: var(--nxt1-color-error);
        }
      }

      .txn-icon--purchase {
        background: color-mix(in srgb, var(--nxt1-color-success) 12%, transparent);

        ion-icon {
          color: var(--nxt1-color-success);
        }
      }

      .txn-icon--granted {
        background: color-mix(in srgb, var(--nxt1-color-info) 12%, transparent);

        ion-icon {
          color: var(--nxt1-color-info);
        }
      }

      .txn-icon--refund {
        background: color-mix(in srgb, var(--nxt1-color-warning) 12%, transparent);

        ion-icon {
          color: var(--nxt1-color-warning);
        }
      }

      /* ============================================
         TRANSACTION DETAILS
         ============================================ */

      .txn-details {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }

      .txn-description {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .txn-time {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
         TRANSACTION AMOUNT
         ============================================ */

      .txn-amount {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 700;
        flex-shrink: 0;
      }

      .txn-amount--positive {
        color: var(--nxt1-color-success);
      }

      .txn-amount--negative {
        color: var(--nxt1-color-error);
      }

      /* ============================================
         VIEW ALL
         ============================================ */

      .view-all-btn {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3);
        background: transparent;
        border: none;
        border-radius: var(--nxt1-radius-lg);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        cursor: pointer;
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);

        ion-icon {
          font-size: 16px;
        }

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-surface-200);
        }

        &:active {
          transform: scale(0.98);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletHistorySectionComponent {
  /** All transactions */
  readonly transactions = input<readonly WalletTransaction[]>([]);

  /** Maximum items to display inline */
  readonly maxDisplayed = input(5);

  /** Emitted when user wants to see full history */
  readonly viewAll = output<void>();

  /** Transactions to display (capped by maxDisplayed) */
  readonly displayedTransactions = computed(() =>
    this.transactions().slice(0, this.maxDisplayed())
  );

  /** Whether there are more transactions than displayed */
  readonly hasMore = computed(() => this.transactions().length > this.maxDisplayed());

  /** Get icon name for transaction type */
  getIcon(type: WalletTransaction['type']): string {
    switch (type) {
      case 'spend':
        return 'remove-circle-outline';
      case 'purchase':
        return 'add-circle-outline';
      case 'granted':
        return 'gift-outline';
      case 'refund':
        return 'return-down-back-outline';
    }
  }

  /** Format ISO timestamp to relative time string */
  formatRelativeTime(isoString: string): string {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1_000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
}
