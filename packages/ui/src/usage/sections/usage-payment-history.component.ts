/**
 * @fileoverview Usage Payment History Table — Full History with Status Badges
 * @module @nxt1/ui/usage
 *
 * Professional payment history table matching GitHub billing style.
 * Columns: Date, ID, Payment Method, Amount, Status badge, Receipt/Invoice icons.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { receiptOutline, documentTextOutline, downloadOutline } from 'ionicons/icons';
import type { UsagePaymentHistoryRecord } from '@nxt1/core';
import { formatPrice } from '@nxt1/core';

@Component({
  selector: 'nxt1-usage-payment-history',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <section class="payment-history">
      <h2 class="section-heading">Payment history</h2>

      <div class="table-container">
        <table class="history-table">
          <thead>
            <tr>
              <th class="col-date">Date</th>
              <th class="col-id">ID</th>
              <th class="col-method">Payment method</th>
              <th class="col-amount">Amount</th>
              <th class="col-status">Status</th>
              <th class="col-actions">Receipt / Invoice</th>
            </tr>
          </thead>
          <tbody>
            @for (record of records(); track record.id) {
              <tr class="history-row">
                <td class="col-date">{{ record.dateLabel }}</td>
                <td class="col-id">
                  <span class="id-text">{{ record.displayId }}</span>
                </td>
                <td class="col-method">{{ record.paymentMethodLabel }}</td>
                <td class="col-amount">{{ formatAmount(record.amount) }}</td>
                <td class="col-status">
                  <span
                    class="status-badge"
                    [class.status-badge--success]="record.status === 'completed'"
                    [class.status-badge--declined]="record.status === 'failed'"
                    [class.status-badge--pending]="record.status === 'pending'"
                    [class.status-badge--refunded]="record.status === 'refunded'"
                  >
                    {{ getStatusLabel(record.status) }}
                  </span>
                </td>
                <td class="col-actions">
                  <div class="action-icons">
                    @if (record.receiptUrl) {
                      <button
                        class="icon-btn"
                        title="Download receipt"
                        (click)="downloadReceipt.emit(record.id)"
                      >
                        <ion-icon name="receipt-outline"></ion-icon>
                      </button>
                    }
                    @if (record.invoiceUrl) {
                      <button
                        class="icon-btn"
                        title="Download invoice"
                        (click)="downloadInvoice.emit(record.id)"
                      >
                        <ion-icon name="document-text-outline"></ion-icon>
                      </button>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (hasMore()) {
        <div class="load-more">
          <button class="load-more-btn" (click)="loadMore.emit()">Load more history</button>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .payment-history {
        margin-bottom: var(--nxt1-spacing-8);
      }

      .section-heading {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-4) 0;
      }

      .table-container {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        overflow-x: auto;
      }

      .history-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 640px;
      }

      thead tr {
        border-bottom: 1px solid var(--nxt1-color-border-default);
      }

      th {
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        text-align: left;
        white-space: nowrap;
      }

      .history-row {
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        transition: background var(--nxt1-transition-fast);

        &:last-child {
          border-bottom: none;
        }

        &:hover {
          background: var(--nxt1-color-surface-200);
        }

        td {
          padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
          font-size: var(--nxt1-fontSize-sm);
          color: var(--nxt1-color-text-primary);
          white-space: nowrap;
        }
      }

      .id-text {
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
      }

      .col-amount {
        font-variant-numeric: tabular-nums;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        padding: var(--nxt1-spacing-0-5) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-radius-full);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-snug);
      }

      .status-badge--success {
        background: var(--nxt1-color-successBg);
        color: var(--nxt1-color-success);
      }

      .status-badge--declined {
        background: var(--nxt1-color-errorBg);
        color: var(--nxt1-color-error);
      }

      .status-badge--pending {
        background: var(--nxt1-color-warningBg);
        color: var(--nxt1-color-warning);
      }

      .status-badge--refunded {
        background: var(--nxt1-color-infoBg);
        color: var(--nxt1-color-info);
      }

      .action-icons {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
      }

      .icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-8);
        height: var(--nxt1-spacing-8);
        border: none;
        background: transparent;
        color: var(--nxt1-color-text-tertiary);
        border-radius: var(--nxt1-radius-sm, 4px);
        cursor: pointer;
        transition:
          color var(--nxt1-transition-fast),
          background var(--nxt1-transition-fast);

        &:hover {
          color: var(--nxt1-color-text-primary);
          background: var(--nxt1-color-surface-300);
        }

        ion-icon {
          font-size: var(--nxt1-icon-size-sm, 16px);
        }
      }

      .load-more {
        display: flex;
        justify-content: center;
        padding: var(--nxt1-spacing-4) 0;
      }

      .load-more-btn {
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-primary);
        background: transparent;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-md, 8px);
        cursor: pointer;
        transition: background var(--nxt1-transition-fast);

        &:hover {
          background: var(--nxt1-color-surface-200);
        }
      }

      @media (max-width: 640px) {
        .col-id,
        .col-method {
          display: none;
        }

        .history-table {
          min-width: auto;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsagePaymentHistoryComponent {
  constructor() {
    addIcons({ receiptOutline, documentTextOutline, downloadOutline });
  }

  readonly records = input.required<readonly UsagePaymentHistoryRecord[]>();
  readonly hasMore = input<boolean>(false);

  readonly downloadReceipt = output<string>();
  readonly downloadInvoice = output<string>();
  readonly loadMore = output<void>();

  protected formatAmount(cents: number): string {
    return formatPrice(cents);
  }

  protected getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      completed: 'Success',
      failed: 'Declined',
      pending: 'Pending',
      refunded: 'Refunded',
      processing: 'Processing',
      canceled: 'Canceled',
      disputed: 'Disputed',
    };
    return labels[status] ?? status;
  }
}
