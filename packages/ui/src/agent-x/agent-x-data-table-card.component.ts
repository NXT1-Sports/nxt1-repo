/**
 * @fileoverview Agent X Data Table Card — Structured Tabular Display
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Renders a responsive data table card inline in the Agent X chat timeline.
 * Accepts column definitions and row data from the `data-table` rich card payload.
 * Horizontally scrollable when content overflows on small viewports.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import type { AgentXRichCard, AgentXDataTableColumn, AgentXDataTablePayload } from '@nxt1/core/ai';

@Component({
  selector: 'nxt1-agent-x-data-table-card',
  standalone: true,
  template: `
    <div class="table-card">
      <div class="table-card__header">
        <svg class="table-card__icon" viewBox="0 0 20 20" fill="none">
          <rect
            x="2"
            y="3"
            width="16"
            height="14"
            rx="2"
            stroke="currentColor"
            stroke-width="1.5"
          />
          <line x1="2" y1="7.5" x2="18" y2="7.5" stroke="currentColor" stroke-width="1.5" />
          <line
            x1="8"
            y1="7.5"
            x2="8"
            y2="17"
            stroke="currentColor"
            stroke-width="1"
            opacity="0.5"
          />
          <line
            x1="13"
            y1="7.5"
            x2="13"
            y2="17"
            stroke="currentColor"
            stroke-width="1"
            opacity="0.5"
          />
        </svg>
        <span class="table-card__title">{{ card().title }}</span>
        <span class="table-card__count">{{ rows().length }} rows</span>
      </div>

      <div class="table-card__scroll">
        <table class="table-card__table">
          <thead>
            <tr>
              @for (col of columns(); track col.key) {
                <th [class]="'align-' + (col.align ?? 'left')">{{ col.label }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track $index) {
              <tr>
                @for (col of columns(); track col.key) {
                  <td [class]="'align-' + (col.align ?? 'left')">{{ row[col.key] ?? '—' }}</td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [
    `
      .table-card {
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        border-radius: 12px;
        overflow: hidden;
        margin-top: 8px;
      }

      .table-card__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .table-card__icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .table-card__title {
        flex: 1;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .table-card__count {
        font-size: 0.75rem;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        font-variant-numeric: tabular-nums;
      }

      .table-card__scroll {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }

      .table-card__table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.8125rem;
        line-height: 1.4;
      }

      thead tr {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      }

      th {
        padding: 8px 12px;
        font-weight: 600;
        white-space: nowrap;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      td {
        padding: 8px 12px;
        color: var(--nxt1-color-text-primary, #ffffff);
        white-space: normal;
        min-width: 80px;
        word-break: break-word;
      }

      tr:not(:last-child) td {
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.05));
      }

      tbody tr {
        transition: background 0.15s ease;
      }

      tbody tr:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      }

      .align-left {
        text-align: left;
      }
      .align-center {
        text-align: center;
      }
      .align-right {
        text-align: right;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXDataTableCardComponent {
  /** The rich card data (type, title, payload). */
  readonly card = input.required<AgentXRichCard>();

  /** Extract columns from the data-table payload. */
  protected readonly columns = computed<readonly AgentXDataTableColumn[]>(() => {
    const payload = this.card().payload as AgentXDataTablePayload;
    return Array.isArray(payload?.columns) ? payload.columns : [];
  });

  /** Extract rows from the data-table payload. */
  protected readonly rows = computed<
    readonly Record<string, string | number | boolean | undefined>[]
  >(() => {
    const payload = this.card().payload as AgentXDataTablePayload;
    return Array.isArray(payload?.rows) ? payload.rows : [];
  });
}
