/**
 * @fileoverview Usage Budgets — Budget Cards with Progress Bars
 * @module @nxt1/ui/usage
 *
 * Professional budget management section matching GitHub billing style.
 * Cards: Account | Product | Stop usage flag | Progress bar (spent/budget).
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { NxtIconComponent } from '../../components/icon';
import type { UsageBudget } from '@nxt1/core';
import { formatPrice } from '@nxt1/core';
import { USAGE_TEST_IDS } from '@nxt1/core/testing';

@Component({
  selector: 'nxt1-usage-budgets',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <section class="budgets" [attr.data-testid]="testIds.BUDGET_SECTION">
      <div class="section-header">
        <div>
          <p class="section-subtitle">
            Set spending limits and receive alerts when you approach or exceed them.
          </p>
        </div>
        <button
          class="new-budget-btn"
          [attr.data-testid]="testIds.BUDGET_NEW_BTN"
          (click)="createBudget.emit()"
        >
          <nxt1-icon name="plus" size="16" />
          New budget
        </button>
      </div>

      <div class="table-container">
        <table class="budget-table">
          <thead>
            <tr>
              <th class="col-account">Account</th>
              <th class="col-product">Product</th>
              <th class="col-stop">Stop on limit</th>
              <th class="col-progress">Spending</th>
            </tr>
          </thead>
          <tbody>
            @for (budget of budgets(); track budget.id) {
              <tr
                class="budget-row"
                [attr.data-testid]="testIds.BUDGET_CARD"
                (click)="editBudget.emit(budget.id)"
              >
                <td class="col-account">{{ budget.accountName }}</td>
                <td class="col-product">{{ budget.productName }}</td>
                <td class="col-stop">
                  @if (budget.stopOnLimit) {
                    <nxt1-icon
                      name="checkmark-circle-outline"
                      className="stop-icon stop-icon--on"
                      size="20"
                    />
                  } @else {
                    <nxt1-icon name="close" className="stop-icon stop-icon--off" size="20" />
                  }
                </td>
                <td class="col-progress">
                  <div class="progress-cell">
                    <div class="progress-bar-container">
                      <div
                        class="progress-bar-fill"
                        [class.progress-bar-fill--warning]="
                          getPercent(budget) >= 75 && getPercent(budget) < 100
                        "
                        [class.progress-bar-fill--danger]="getPercent(budget) >= 100"
                        [style.width.%]="clampPercent(budget)"
                      ></div>
                    </div>
                    <span class="progress-label">
                      {{ formatAmount(budget.spent) }} / {{ formatAmount(budget.budgetLimit) }}
                      @if (getPercent(budget) >= 90) {
                        <nxt1-icon name="alert-circle-outline" className="alert-icon" size="14" />
                      }
                    </span>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4" class="empty-row">No budgets configured.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: [
    `
      .budgets {
        margin-bottom: var(--nxt1-spacing-8);
      }

      .section-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: var(--nxt1-spacing-4);
        gap: var(--nxt1-spacing-4);
      }

      .section-heading {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-1) 0;
      }

      .section-subtitle {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        line-height: var(--nxt1-lineHeight-normal);
      }

      .new-budget-btn {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-md, 8px);
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        transition: background var(--nxt1-transition-fast);

        &:hover {
          background: var(--nxt1-color-surface-300);
        }
      }

      .table-container {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        overflow-x: auto;
      }

      .budget-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 560px;
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

      .col-stop {
        text-align: center;
      }

      .budget-row {
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        cursor: pointer;
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
        }
      }

      .stop-icon {
        font-size: var(--nxt1-icon-size-md, 20px);
      }

      .stop-icon--on {
        color: var(--nxt1-color-success);
      }

      .stop-icon--off {
        color: var(--nxt1-color-text-tertiary);
      }

      .progress-cell {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
      }

      .progress-bar-container {
        width: 100%;
        height: var(--nxt1-spacing-1-5);
        background: var(--nxt1-color-surface-300);
        border-radius: var(--nxt1-radius-full);
        overflow: hidden;
      }

      .progress-bar-fill {
        height: 100%;
        background: var(--nxt1-color-primary);
        border-radius: var(--nxt1-radius-full);
        transition: width var(--nxt1-duration-slow, 300ms) var(--nxt1-easing-out, ease-out);
      }

      .progress-bar-fill--warning {
        background: var(--nxt1-color-warning);
      }

      .progress-bar-fill--danger {
        background: var(--nxt1-color-error);
      }

      .progress-label {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-size: var(--nxt1-fontSize-xs);
        font-variant-numeric: tabular-nums;
        color: var(--nxt1-color-text-secondary);
      }

      .alert-icon {
        font-size: var(--nxt1-fontSize-sm, 14px);
        color: var(--nxt1-color-warning);
      }

      .empty-row {
        padding: var(--nxt1-spacing-6) var(--nxt1-spacing-4);
        text-align: center;
        color: var(--nxt1-color-text-tertiary);
        font-size: var(--nxt1-fontSize-sm);
      }

      @media (max-width: 640px) {
        .section-header {
          flex-direction: column;
        }

        .col-stop {
          display: none;
        }

        .budget-table {
          min-width: auto;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageBudgetsComponent {
  protected readonly testIds = USAGE_TEST_IDS;

  readonly budgets = input.required<readonly UsageBudget[]>();

  readonly createBudget = output<void>();
  readonly editBudget = output<string>();

  protected formatAmount(cents: number): string {
    return formatPrice(cents);
  }

  protected getPercent(budget: UsageBudget): number {
    if (budget.budgetLimit === 0) return 0;
    return (budget.spent / budget.budgetLimit) * 100;
  }

  protected clampPercent(budget: UsageBudget): number {
    return Math.min(this.getPercent(budget), 100);
  }
}
