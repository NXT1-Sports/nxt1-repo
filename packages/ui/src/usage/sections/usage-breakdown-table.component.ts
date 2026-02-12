/**
 * @fileoverview Usage Breakdown Table — Expandable Daily Rows
 * @module @nxt1/ui/usage
 *
 * Professional data table with expandable rows showing daily SKU details.
 * Columns: Date, (expand), Gross amount, Billed amount.
 * Expanded: SKU, Units, Price/unit, Gross amount, Billed amount.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronForwardOutline, chevronDownOutline } from 'ionicons/icons';
import type { UsageBreakdownRow, UsageTimeframe } from '@nxt1/core';
import { formatPrice, USAGE_TIMEFRAME_OPTIONS } from '@nxt1/core';

addIcons({ chevronForwardOutline, chevronDownOutline });

@Component({
  selector: 'nxt1-usage-breakdown-table',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <section class="usage-breakdown">
      <div class="section-header">
        <h2 class="section-heading">Usage breakdown</h2>
        <div class="timeframe-select">
          <select
            [value]="timeframe()"
            (change)="onTimeframeChange($event)"
            class="timeframe-dropdown"
          >
            @for (opt of timeframeOptions; track opt.id) {
              <option [value]="opt.id">{{ opt.label }}</option>
            }
          </select>
        </div>
      </div>
      <p class="section-subtitle">
        Usage for {{ periodLabel() }}. For license-based products, the price/unit is a prorated
        portion of the monthly price.
      </p>

      <!-- Table -->
      <div class="table-container">
        <table class="breakdown-table">
          <thead>
            <tr>
              <th class="col-date">Date</th>
              <th class="col-gross">Gross amount</th>
              <th class="col-billed">Billed amount</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.date) {
              <!-- Day Row -->
              <tr
                class="day-row"
                [class.day-row--expanded]="expandedRow() === row.date"
                (click)="toggleRow.emit(row.date)"
              >
                <td class="col-date">
                  <div class="date-cell">
                    <ion-icon
                      [name]="
                        expandedRow() === row.date
                          ? 'chevron-down-outline'
                          : 'chevron-forward-outline'
                      "
                      class="expand-icon"
                    ></ion-icon>
                    <span>{{ row.dateLabel }}</span>
                  </div>
                </td>
                <td class="col-gross">{{ formatAmount(row.grossAmount) }}</td>
                <td class="col-billed">
                  <strong>{{ formatAmount(row.billedAmount) }}</strong>
                </td>
              </tr>

              <!-- Expanded SKU Rows -->
              @if (expandedRow() === row.date) {
                <tr class="sku-header-row">
                  <td colspan="3">
                    <div class="sku-header">
                      <span class="sku-col-name">Product</span>
                      <span class="sku-col">Units</span>
                      <span class="sku-col">Price/unit</span>
                      <span class="sku-col">Gross amount</span>
                      <span class="sku-col-billed">Billed amount</span>
                    </div>
                  </td>
                </tr>
                @for (item of row.lineItems; track item.sku) {
                  <tr class="sku-row">
                    <td colspan="3">
                      <div class="sku-detail">
                        <span class="sku-col-name">{{ item.sku }}</span>
                        <span class="sku-col">{{ item.units }}</span>
                        <span class="sku-col">{{ item.pricePerUnit }}</span>
                        <span class="sku-col">{{ formatAmount(item.grossAmount) }}</span>
                        <span class="sku-col-billed">{{ formatAmount(item.billedAmount) }}</span>
                      </div>
                    </td>
                  </tr>
                }
              }
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: [
    `
      .usage-breakdown {
        margin-bottom: var(--nxt1-spacing-8);
      }

      .section-heading {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2) 0;
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-4);
        margin-bottom: var(--nxt1-spacing-2);
      }

      .timeframe-dropdown {
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-md, 8px);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        font-size: var(--nxt1-fontSize-sm);
        font-family: var(--nxt1-fontFamily-brand);
        cursor: pointer;
        outline: none;

        &:focus {
          border-color: var(--nxt1-color-primary);
        }

        option {
          background: var(--nxt1-color-surface-200);
          color: var(--nxt1-color-text-primary);
        }
      }

      .section-subtitle {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-5) 0;
        line-height: var(--nxt1-lineHeight-normal);
      }

      .table-container {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        overflow: hidden;
      }

      .breakdown-table {
        width: 100%;
        border-collapse: collapse;
      }

      thead tr {
        border-bottom: 1px solid var(--nxt1-color-border-default);
      }

      th {
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-4);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        text-align: left;
      }

      .col-gross,
      .col-billed {
        text-align: right;
      }

      .day-row {
        cursor: pointer;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        transition: background var(--nxt1-transition-fast);

        &:hover {
          background: var(--nxt1-color-surface-200);
        }

        &.day-row--expanded {
          background: var(--nxt1-color-surface-200);
        }

        td {
          padding: var(--nxt1-spacing-4) var(--nxt1-spacing-4);
          font-size: var(--nxt1-fontSize-sm);
          color: var(--nxt1-color-text-primary);
        }
      }

      .date-cell {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .expand-icon {
        font-size: var(--nxt1-fontSize-sm, 14px);
        color: var(--nxt1-color-text-tertiary);
        flex-shrink: 0;
      }

      .sku-header-row td {
        padding: 0;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .sku-header {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4) var(--nxt1-spacing-3)
          var(--nxt1-spacing-10);
        background: var(--nxt1-color-surface-200);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      .sku-row td {
        padding: 0;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .sku-detail {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4) var(--nxt1-spacing-3)
          var(--nxt1-spacing-10);
        background: var(--nxt1-color-surface-200);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-primary);
      }

      .sku-col-name {
        padding-right: var(--nxt1-spacing-2);
      }

      .sku-col {
        text-align: center;
      }

      .sku-col-billed {
        text-align: right;
      }

      @media (max-width: 640px) {
        .sku-header,
        .sku-detail {
          grid-template-columns: 1.5fr 1fr 1fr;
        }

        .sku-col:nth-child(2),
        .sku-col:nth-child(3) {
          display: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageBreakdownTableComponent {
  readonly rows = input.required<readonly UsageBreakdownRow[]>();
  readonly expandedRow = input.required<string | null>();
  readonly periodLabel = input<string>('');
  readonly timeframe = input.required<UsageTimeframe>();

  readonly toggleRow = output<string>();
  readonly timeframeChange = output<UsageTimeframe>();

  protected readonly timeframeOptions = USAGE_TIMEFRAME_OPTIONS;

  protected formatAmount(cents: number): string {
    return formatPrice(cents);
  }

  protected onTimeframeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as UsageTimeframe;
    this.timeframeChange.emit(value);
  }
}
