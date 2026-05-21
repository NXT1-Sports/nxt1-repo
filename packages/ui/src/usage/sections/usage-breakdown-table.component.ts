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

import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import { NxtIconComponent } from '../../components/icon';
import type { UsageBreakdownLineItem, UsageBreakdownRow, UsageTimeframe } from '@nxt1/core';
import { formatPrice, USAGE_TIMEFRAME_OPTIONS } from '@nxt1/core';
import { USAGE_TEST_IDS } from '@nxt1/core/testing';

@Component({
  selector: 'nxt1-usage-breakdown-table',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <section class="usage-breakdown" [attr.data-testid]="testIds.BREAKDOWN_SECTION">
      <div class="section-header">
        <p class="section-subtitle">Usage from {{ periodLabel() }}.</p>
        <div class="timeframe-select">
          <select
            [value]="timeframe()"
            (change)="onTimeframeChange($event)"
            class="timeframe-dropdown"
            [attr.data-testid]="testIds.BREAKDOWN_TIMEFRAME_SELECT"
          >
            @for (opt of timeframeOptions; track opt.id) {
              <option [value]="opt.id">{{ opt.label }}</option>
            }
          </select>
        </div>
      </div>

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
              <!-- ────── Level 1: Day Row ────── -->
              <tr
                class="day-row"
                [class.day-row--expanded]="expandedRow() === row.date"
                [attr.data-testid]="testIds.BREAKDOWN_ROW"
                (click)="toggleRow.emit(row.date)"
              >
                <td class="col-date">
                  <div class="date-cell">
                    <nxt1-icon
                      [name]="expandedRow() === row.date ? 'chevronDown' : 'chevronForward'"
                      className="expand-icon"
                      size="14"
                    />
                    <span>{{ row.dateLabel }}</span>
                  </div>
                </td>
                <td class="col-gross">{{ formatAmount(row.grossAmount) }}</td>
                <td class="col-billed">
                  <strong>{{ formatAmount(row.billedAmount) }}</strong>
                </td>
              </tr>

              <!-- Expanded content for this day -->
              @if (expandedRow() === row.date) {
                <!-- ─── ORG PATH: Teams → Users → Products ─── -->
                @if (row.teams && row.teams.length > 0) {
                  @for (team of row.teams; track team.teamId) {
                    <!-- ────── Level 2: Team Row ────── -->
                    <tr
                      class="team-row"
                      [class.team-row--expanded]="isTeamExpanded(row.date, team.teamId)"
                      (click)="toggleTeam(row.date, team.teamId)"
                    >
                      <td colspan="3">
                        <div class="team-cell">
                          <nxt1-icon
                            [name]="
                              isTeamExpanded(row.date, team.teamId)
                                ? 'chevronDown'
                                : 'chevronForward'
                            "
                            className="expand-icon"
                            size="12"
                          />
                          <nxt1-icon name="people" size="14" className="team-icon" />
                          <span class="team-name">{{ team.teamName }}</span>
                          <span class="nested-amount">{{ formatAmount(team.grossAmount) }}</span>
                        </div>
                      </td>
                    </tr>

                    @if (isTeamExpanded(row.date, team.teamId)) {
                      @for (user of team.users; track user.userId) {
                        <!-- ────── Level 3: User Row ────── -->
                        <tr
                          class="user-row"
                          [class.user-row--expanded]="
                            isUserExpanded(row.date, team.teamId, user.userId)
                          "
                          (click)="toggleUser(row.date, team.teamId, user.userId)"
                        >
                          <td colspan="3">
                            <div class="user-cell">
                              <nxt1-icon
                                [name]="
                                  isUserExpanded(row.date, team.teamId, user.userId)
                                    ? 'chevronDown'
                                    : 'chevronForward'
                                "
                                className="expand-icon"
                                size="12"
                              />
                              <nxt1-icon name="person" size="14" className="user-icon" />
                              <span class="user-name">{{ user.userName }}</span>
                              <span class="nested-amount">{{
                                formatAmount(user.grossAmount)
                              }}</span>
                            </div>
                          </td>
                        </tr>

                        <!-- ────── Level 4: Product Line Items ────── -->
                        @if (isUserExpanded(row.date, team.teamId, user.userId)) {
                          <tr class="sku-header-row">
                            <td colspan="3">
                              <div class="sku-header sku-header--nested">
                                <span class="sku-col-name">Product</span>
                                <span class="sku-col">Units</span>
                                <span class="sku-col">Price/unit</span>
                                <span class="sku-col">Gross amount</span>
                                <span class="sku-col-billed">Billed amount</span>
                              </div>
                            </td>
                          </tr>
                          @for (item of user.lineItems; track $index) {
                            <tr class="sku-row">
                              <td colspan="3">
                                <div class="sku-detail sku-detail--nested">
                                  <span class="sku-col-name">
                                    @if (hasSubActions(item)) {
                                      <button
                                        type="button"
                                        class="sub-action-toggle"
                                        [attr.aria-expanded]="
                                          isSubActionsExpanded(
                                            subActionKey(row.date, team.teamId, user.userId, $index)
                                          )
                                        "
                                        (click)="
                                          toggleSubActions(
                                            $event,
                                            subActionKey(
                                              row.date,
                                              team.teamId,
                                              user.userId,
                                              $index
                                            ),
                                            item
                                          )
                                        "
                                      >
                                        <nxt1-icon
                                          [name]="
                                            isSubActionsExpanded(
                                              subActionKey(
                                                row.date,
                                                team.teamId,
                                                user.userId,
                                                $index
                                              )
                                            )
                                              ? 'chevronDown'
                                              : 'chevronForward'
                                          "
                                          className="expand-icon"
                                          size="12"
                                        />
                                        <span class="sku-name">{{ item.sku }}</span>
                                      </button>
                                    } @else {
                                      <span class="sku-name">{{ item.sku }}</span>
                                    }
                                  </span>
                                  <span class="sku-col">{{ item.units }}</span>
                                  <span class="sku-col">{{ item.pricePerUnit }}</span>
                                  <span class="sku-col">{{ formatAmount(item.grossAmount) }}</span>
                                  <span class="sku-col-billed">{{
                                    formatAmount(item.billedAmount)
                                  }}</span>
                                </div>
                              </td>
                            </tr>
                            @if (
                              hasSubActions(item) &&
                              isSubActionsExpanded(
                                subActionKey(row.date, team.teamId, user.userId, $index)
                              )
                            ) {
                              <tr class="sub-action-row">
                                <td colspan="3">
                                  <div class="sub-action-panel sub-action-panel--nested">
                                    @for (action of item.subActions; track action) {
                                      <div class="sub-action-item">
                                        <span class="sub-action-name">{{ action }}</span>
                                        <span class="sub-action-status">Included</span>
                                      </div>
                                    }
                                  </div>
                                </td>
                              </tr>
                            }
                          }
                        }
                      }
                    }
                  }
                } @else {
                  <!-- ─── INDIVIDUAL PATH: Flat product rows ─── -->
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
                  @for (item of row.lineItems; track $index) {
                    <tr class="sku-row">
                      <td colspan="3">
                        <div class="sku-detail">
                          <span class="sku-col-name">
                            @if (hasSubActions(item)) {
                              <button
                                type="button"
                                class="sub-action-toggle"
                                [attr.aria-expanded]="
                                  isSubActionsExpanded(
                                    subActionKey(row.date, 'individual', 'individual', $index)
                                  )
                                "
                                (click)="
                                  toggleSubActions(
                                    $event,
                                    subActionKey(row.date, 'individual', 'individual', $index),
                                    item
                                  )
                                "
                              >
                                <nxt1-icon
                                  [name]="
                                    isSubActionsExpanded(
                                      subActionKey(row.date, 'individual', 'individual', $index)
                                    )
                                      ? 'chevronDown'
                                      : 'chevronForward'
                                  "
                                  className="expand-icon"
                                  size="12"
                                />
                                <span class="sku-name">{{ item.sku }}</span>
                              </button>
                            } @else {
                              <span class="sku-name">{{ item.sku }}</span>
                            }
                          </span>
                          <span class="sku-col">{{ item.units }}</span>
                          <span class="sku-col">{{ item.pricePerUnit }}</span>
                          <span class="sku-col">{{ formatAmount(item.grossAmount) }}</span>
                          <span class="sku-col-billed">{{ formatAmount(item.billedAmount) }}</span>
                        </div>
                      </td>
                    </tr>
                    @if (
                      hasSubActions(item) &&
                      isSubActionsExpanded(
                        subActionKey(row.date, 'individual', 'individual', $index)
                      )
                    ) {
                      <tr class="sub-action-row">
                        <td colspan="3">
                          <div class="sub-action-panel">
                            @for (action of item.subActions; track action) {
                              <div class="sub-action-item">
                                <span class="sub-action-name">{{ action }}</span>
                                <span class="sub-action-status">Included</span>
                              </div>
                            }
                          </div>
                        </td>
                      </tr>
                    }
                  }
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

      .section-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--nxt1-spacing-4);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .section-subtitle {
        flex: 1;
        min-width: 0;
      }

      .timeframe-select {
        position: relative;
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
      }

      .timeframe-select::after {
        content: '';
        position: absolute;
        right: var(--nxt1-spacing-3);
        width: 10px;
        height: 6px;
        background: var(--nxt1-color-text-secondary);
        clip-path: polygon(0 0, 100% 0, 50% 100%);
        pointer-events: none;
      }

      .timeframe-dropdown {
        appearance: none;
        -webkit-appearance: none;
        background: var(--nxt1-color-surface-200);
        background-image: none;
        color: var(--nxt1-color-text-primary);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-md, 8px);
        min-width: 9.5rem;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-8) var(--nxt1-spacing-2)
          var(--nxt1-spacing-3);
        font-size: var(--nxt1-fontSize-sm);
        font-family: var(--nxt1-fontFamily-brand);
        line-height: 1.25;
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

      .section-header .section-subtitle {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        line-height: var(--nxt1-lineHeight-normal);
      }

      .table-container {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
      }

      .breakdown-table {
        width: 100%;
        min-width: 720px;
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

      /* ── Level 1: Day Row ─────────────────────── */

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

      /* ── Level 2: Team Row ─────────────────────── */

      .team-row {
        cursor: pointer;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        transition: background var(--nxt1-transition-fast);

        &:hover {
          background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.06));
        }

        &.team-row--expanded {
          background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.06));
        }

        td {
          padding: 0;
        }
      }

      .team-cell {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4) var(--nxt1-spacing-3)
          var(--nxt1-spacing-10);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-primary);
      }

      .team-icon {
        color: var(--nxt1-color-primary);
        flex-shrink: 0;
      }

      .team-name {
        font-weight: var(--nxt1-fontWeight-medium);
        flex: 1;
        min-width: 0;
      }

      .nested-amount {
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin-left: auto;
        flex-shrink: 0;
      }

      /* ── Level 3: User Row ─────────────────────── */

      .user-row {
        cursor: pointer;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        transition: background var(--nxt1-transition-fast);

        &:hover {
          background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.06));
        }

        &.user-row--expanded {
          background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.06));
        }

        td {
          padding: 0;
        }
      }

      .user-cell {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4) var(--nxt1-spacing-3)
          var(--nxt1-spacing-16, 64px);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-primary);
      }

      .user-icon {
        color: var(--nxt1-color-text-secondary);
        flex-shrink: 0;
      }

      .user-name {
        flex: 1;
        min-width: 0;
      }

      /* ── Level 4: Product Line Items ─────────────── */

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

      .sku-header--nested {
        padding-left: var(--nxt1-spacing-20, 80px);
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

      .sku-detail--nested {
        padding-left: var(--nxt1-spacing-20, 80px);
      }

      .sku-col-name {
        padding-right: var(--nxt1-spacing-2);
      }

      .sku-detail .sku-col-name {
        min-width: 0;
      }

      .sku-name {
        overflow-wrap: anywhere;
      }

      .sub-action-toggle {
        display: inline-grid;
        grid-template-columns: auto minmax(0, auto) auto;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        max-width: 100%;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .sub-action-toggle:hover .sku-name,
      .sub-action-toggle:focus-visible .sku-name {
        color: var(--nxt1-color-primary);
      }

      .sub-action-toggle:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 3px;
        border-radius: var(--nxt1-radius-sm, 6px);
      }

      .sub-action-row td {
        padding: 0;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .sub-action-panel {
        display: grid;
        gap: 1px;
        padding: 0 var(--nxt1-spacing-4) var(--nxt1-spacing-3) var(--nxt1-spacing-16, 64px);
        background: var(--nxt1-color-surface-200);
      }

      .sub-action-panel--nested {
        padding-left: var(--nxt1-spacing-24, 96px);
      }

      .sub-action-item {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm);
      }

      .sub-action-name {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .sub-action-status {
        color: var(--nxt1-color-text-tertiary);
        font-size: var(--nxt1-fontSize-xs);
        white-space: nowrap;
      }

      .sku-col {
        text-align: center;
      }

      .sku-col-billed {
        text-align: right;
      }

      @media (max-width: 640px) {
        .breakdown-table {
          min-width: 760px;
        }

        .sku-header,
        .sku-detail {
          min-width: 32rem;
        }

        .team-cell {
          padding-left: var(--nxt1-spacing-8);
        }

        .user-cell {
          padding-left: var(--nxt1-spacing-12);
        }

        .sku-header--nested,
        .sku-detail--nested {
          padding-left: var(--nxt1-spacing-14, 56px);
        }

        .sub-action-panel {
          padding-left: var(--nxt1-spacing-12, 48px);
        }

        .sub-action-panel--nested {
          padding-left: var(--nxt1-spacing-16, 64px);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageBreakdownTableComponent {
  protected readonly testIds = USAGE_TEST_IDS;

  readonly rows = input.required<readonly UsageBreakdownRow[]>();
  readonly expandedRow = input.required<string | null>();
  readonly periodLabel = input<string>('');
  readonly timeframe = input.required<UsageTimeframe>();

  readonly toggleRow = output<string>();
  readonly timeframeChange = output<UsageTimeframe>();

  protected readonly timeframeOptions = USAGE_TIMEFRAME_OPTIONS;

  // ── Nested expansion state (org drill-down) ───────────────────
  private readonly expandedTeams = signal<Set<string>>(new Set());
  private readonly expandedUsers = signal<Set<string>>(new Set());
  private readonly expandedSubActions = signal<Set<string>>(new Set());

  protected hasSubActions(item: UsageBreakdownLineItem): boolean {
    return (item.subActions?.length ?? 0) > 0;
  }

  protected subActionKey(date: string, teamId: string, userId: string, index: number): string {
    return `${date}::${teamId}::${userId}::${index}`;
  }

  protected isSubActionsExpanded(key: string): boolean {
    return this.expandedSubActions().has(key);
  }

  protected toggleSubActions(event: Event, key: string, item: UsageBreakdownLineItem): void {
    event.stopPropagation();
    if (!this.hasSubActions(item)) {
      return;
    }

    this.expandedSubActions.update((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  protected isTeamExpanded(date: string, teamId: string): boolean {
    return this.expandedTeams().has(`${date}::${teamId}`);
  }

  protected toggleTeam(date: string, teamId: string): void {
    const key = `${date}::${teamId}`;
    this.expandedTeams.update((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        // Also collapse any expanded users under this team
        const prefix = `${key}::`;
        for (const k of this.expandedUsers()) {
          if (k.startsWith(prefix)) {
            this.expandedUsers.update((s) => {
              const n = new Set(s);
              n.delete(k);
              return n;
            });
          }
        }
        this.collapseSubActionsWithPrefix(prefix);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  protected isUserExpanded(date: string, teamId: string, userId: string): boolean {
    return this.expandedUsers().has(`${date}::${teamId}::${userId}`);
  }

  protected toggleUser(date: string, teamId: string, userId: string): void {
    const key = `${date}::${teamId}::${userId}`;
    this.expandedUsers.update((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        this.collapseSubActionsWithPrefix(`${key}::`);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  private collapseSubActionsWithPrefix(prefix: string): void {
    this.expandedSubActions.update((prev) => {
      const next = new Set(prev);
      for (const key of prev) {
        if (key.startsWith(prefix)) {
          next.delete(key);
        }
      }
      return next;
    });
  }

  protected formatAmount(cents: number): string {
    return formatPrice(cents);
  }

  protected onTimeframeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as UsageTimeframe;
    this.timeframeChange.emit(value);
  }
}
