/**
 * @fileoverview Profile Stats Tab Component - Web
 * @module @nxt1/ui/profile/web
 *
 * Extracted from ProfileShellWebComponent.
 * Displays game log tables, career/season stats, and top stats comparison bars.
 */
import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import {
  type AthleticStat,
  type GameLogEntry,
  type GameLogSeasonTotals,
  type ProfileSeasonGameLog,
} from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon';
import { ProfileService } from '../profile.service';

interface StatsComparisonItem {
  readonly label: string;
  readonly playerDisplay: string;
  readonly averageDisplay: string;
  readonly playerPercent: number;
  readonly averagePercent: number;
}

@Component({
  selector: 'nxt1-profile-stats-web',
  standalone: true,
  imports: [NxtIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="madden-tab-section stats-board" aria-labelledby="stats-heading">
      <h2 id="stats-heading" class="sr-only">Athletic Statistics</h2>

      @if (profile.gameLog().length === 0 && profile.athleticStats().length === 0) {
        <div class="madden-empty">
          <nxt1-icon name="stats-chart" [size]="48" />
          <h3>No stats recorded</h3>
          <p>
            @if (profile.isOwnProfile()) {
              Add your athletic and academic stats to complete your profile.
            } @else {
              This athlete hasn't recorded any stats yet.
            }
          </p>
          @if (profile.isOwnProfile()) {
            <button type="button" class="madden-cta-btn" (click)="onAddStats()">Add Stats</button>
          }
        </div>
      } @else {
        <!-- ═══ Category Tabs (Passing / Rushing / etc.) ═══ -->
        @if (gameLogCategoriesForSeason().length > 0) {
          <nav class="stats-board__tabs" aria-label="Stat categories">
            @for (cat of gameLogCategoriesForSeason(); track cat; let i = $index) {
              <button
                type="button"
                class="stats-board__tab"
                [class.stats-board__tab--active]="activeGameLogCategoryIdx() === i"
                (click)="onGameLogCategoryChange(i)"
              >
                {{ cat }}
              </button>
            }
          </nav>
        }

        @if (activeGameLog(); as gl) {
          <!-- ═══════════ CAREER MODE ═══════════ -->
          @if (isCareerMode()) {
            <!-- Career Summary Header -->
            <div class="gl-summary">
              <div class="gl-summary__left">
                <span class="gl-summary__season">Career</span>
                @if (gl.seasonRecord) {
                  <span class="gl-summary__record">Overall Record: {{ gl.seasonRecord }}</span>
                }
              </div>
            </div>

            <!-- Career Totals (aggregate across all seasons) -->
            @if (gl.totals && gl.totals.length > 0) {
              <div class="gl-totals">
                @for (totalRow of gl.totals; track totalRow.label) {
                  @if (totalRow.label === 'Career Totals' || totalRow.label === 'Per Game Avg') {
                    <div class="gl-totals__row">
                      <span class="gl-totals__label">{{ totalRow.label }}</span>
                      <div class="gl-totals__chips">
                        @for (col of gl.columns; track col.key) {
                          <div class="gl-totals__chip">
                            <span class="gl-totals__chip-label">{{ col.label }}</span>
                            <span class="gl-totals__chip-value">{{
                              totalRow.stats[col.key] !== undefined ? totalRow.stats[col.key] : '-'
                            }}</span>
                          </div>
                        }
                      </div>
                    </div>
                  }
                }
              </div>
            }

            <!-- Per-Season Stat Boards -->
            @for (seasonLog of careerSeasonLogs(); track seasonLog.season + seasonLog.category) {
              <div
                class="gl-season-board"
                role="region"
                [attr.aria-label]="seasonLog.season + ' ' + seasonLog.category + ' statistics'"
              >
                <div class="gl-season-board__header">
                  <span class="gl-season-board__title">{{ seasonLog.season }}</span>
                  @if (seasonLog.seasonRecord) {
                    <span class="gl-season-board__record">{{ seasonLog.seasonRecord }}</span>
                  }
                </div>
                @if (seasonLog.totals && seasonLog.totals.length > 0) {
                  <div class="gl-totals gl-totals--season">
                    @for (totalRow of seasonLog.totals; track totalRow.label) {
                      <div class="gl-totals__row">
                        <span class="gl-totals__label">{{ totalRow.label }}</span>
                        <div class="gl-totals__chips">
                          @for (col of seasonLog.columns; track col.key) {
                            <div class="gl-totals__chip">
                              <span class="gl-totals__chip-label">{{ col.label }}</span>
                              <span class="gl-totals__chip-value">{{
                                totalRow.stats[col.key] !== undefined
                                  ? totalRow.stats[col.key]
                                  : '-'
                              }}</span>
                            </div>
                          }
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <!-- ═══════════ SINGLE SEASON MODE ═══════════ -->
          } @else {
            <!-- Season Summary Header -->
            <div class="gl-summary">
              <div class="gl-summary__left">
                <span class="gl-summary__season">{{ gl.season }}</span>
                @if (gl.seasonRecord) {
                  <span class="gl-summary__record">Record: {{ gl.seasonRecord }}</span>
                }
              </div>
            </div>

            <!-- Season Totals Cards -->
            @if (gl.totals && gl.totals.length > 0) {
              <div class="gl-totals">
                @for (totalRow of gl.totals; track totalRow.label) {
                  <div class="gl-totals__row">
                    <span class="gl-totals__label">{{ totalRow.label }}</span>
                    <div class="gl-totals__chips">
                      @for (col of gl.columns; track col.key) {
                        <div class="gl-totals__chip">
                          <span class="gl-totals__chip-label">{{ col.label }}</span>
                          <span class="gl-totals__chip-value">{{
                            totalRow.stats[col.key] !== undefined ? totalRow.stats[col.key] : '-'
                          }}</span>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          }

          <!-- ═══ Game Log Table (single-season only) ═══ -->
          @if (!isCareerMode()) {
            <div class="gl-table-wrap">
              <table
                class="gl-table"
                role="grid"
                aria-label="Game log for {{ gl.season }} {{ gl.category }}"
              >
                <thead>
                  <tr>
                    <th scope="col" class="gl-th gl-th--sticky">
                      <button type="button" class="gl-th-btn" (click)="onGameLogSort('date')">
                        Date
                        @if (gameLogSortKey() === 'date') {
                          <span class="gl-sort-arrow" aria-hidden="true">{{
                            gameLogSortDir() === 'asc' ? '▲' : '▼'
                          }}</span>
                        }
                      </button>
                    </th>
                    <th scope="col" class="gl-th">
                      <span class="gl-th-text">Result</span>
                    </th>
                    <th scope="col" class="gl-th">
                      <span class="gl-th-text">Opponent</span>
                    </th>
                    @for (col of gl.columns; track col.key) {
                      <th scope="col" class="gl-th gl-th--stat">
                        <button
                          type="button"
                          class="gl-th-btn"
                          [title]="col.tooltip ?? col.label"
                          (click)="onGameLogSort(col.key)"
                        >
                          {{ col.label }}
                          @if (gameLogSortKey() === col.key) {
                            <span class="gl-sort-arrow" aria-hidden="true">{{
                              gameLogSortDir() === 'asc' ? '▲' : '▼'
                            }}</span>
                          }
                        </button>
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (
                    game of sortedGameLogEntries();
                    track game.date + game.opponent;
                    let rowIdx = $index
                  ) {
                    <tr class="gl-row" [class.gl-row--alt]="rowIdx % 2 === 1">
                      <td class="gl-td gl-td--sticky gl-td--date">
                        {{ game.date }}
                      </td>
                      <td class="gl-td gl-td--result">
                        <span
                          class="gl-result"
                          [class.gl-result--win]="game.outcome === 'win'"
                          [class.gl-result--loss]="game.outcome === 'loss'"
                          [class.gl-result--tie]="game.outcome === 'tie'"
                        >
                          {{ game.result }}
                        </span>
                      </td>
                      <td class="gl-td gl-td--opponent">{{ game.opponent }}</td>
                      @for (col of gl.columns; track col.key) {
                        <td class="gl-td gl-td--stat">
                          {{ game.stats[col.key] !== undefined ? game.stats[col.key] : '-' }}
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          <!-- ═══ Top Stats Comparison Bars ═══ -->
          @if (statsComparisonItems().length > 0) {
            <section class="stats-compare" aria-labelledby="stats-compare-heading">
              <header class="stats-compare__header">
                <h3 id="stats-compare-heading" class="stats-compare__title">Top Stats</h3>
                <div class="stats-compare__legend" role="list" aria-label="Comparison legend">
                  <span class="stats-compare__legend-item" role="listitem">
                    <span
                      class="stats-compare__dot stats-compare__dot--player"
                      aria-hidden="true"
                    ></span>
                    <span>{{ profile.user()?.firstName || 'Athlete' }}</span>
                  </span>
                  <span class="stats-compare__legend-item" role="listitem">
                    <span
                      class="stats-compare__dot stats-compare__dot--average"
                      aria-hidden="true"
                    ></span>
                    <span>National Average</span>
                  </span>
                </div>
              </header>

              <div class="stats-compare__grid" role="list" aria-label="Top stats comparison">
                @for (item of statsComparisonItems(); track item.label) {
                  <article class="stats-compare__item" role="listitem">
                    <div class="stats-compare__values">
                      <span class="stats-compare__value stats-compare__value--player">{{
                        item.playerDisplay
                      }}</span>
                      <span class="stats-compare__value stats-compare__value--average">{{
                        item.averageDisplay
                      }}</span>
                    </div>

                    <div class="stats-compare__bar-zone" aria-hidden="true">
                      <div
                        class="stats-compare__bar stats-compare__bar--player"
                        [style.height.%]="item.playerPercent"
                      ></div>
                      <div
                        class="stats-compare__bar stats-compare__bar--average"
                        [style.height.%]="item.averagePercent"
                      ></div>
                    </div>

                    <span class="stats-compare__label">{{ item.label }}</span>
                  </article>
                }
              </div>
            </section>
          }
        }
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* ─── EMPTY STATE ─── */
      .madden-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 48px 24px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.6));
      }
      .madden-empty h3 {
        font-size: 16px;
        font-weight: 700;
        color: var(--m-text);
        margin: 16px 0 8px;
      }
      .madden-empty p {
        font-size: 14px;
        color: var(--m-text-2);
        margin: 0 0 20px;
        max-width: 280px;
      }
      .madden-cta-btn {
        background: var(--m-accent);
        color: #000;
        border: none;
        border-radius: 999px;
        padding: 10px 24px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: filter 0.15s;
      }
      .madden-cta-btn:hover {
        filter: brightness(1.1);
      }

      /* ─── STATS BOARD ─── */
      .stats-board {
        padding-top: 0;
      }

      /* Category pill tabs */
      .stats-board__tabs {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 0 16px;
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .stats-board__tabs::-webkit-scrollbar {
        display: none;
      }
      .stats-board__tab {
        flex-shrink: 0;
        padding: 7px 16px;
        border-radius: 999px;
        border: 1px solid var(--m-border);
        background: transparent;
        color: var(--m-text-2);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.18s ease;
        white-space: nowrap;
        line-height: 1.2;
      }
      .stats-board__tab:hover {
        background: var(--m-surface-2);
        color: var(--m-text);
        border-color: color-mix(in srgb, var(--m-accent) 30%, var(--m-border));
      }
      .stats-board__tab--active {
        background: var(--m-accent);
        color: #000;
        border-color: var(--m-accent);
        font-weight: 700;
      }
      .stats-board__tab--active:hover {
        background: var(--m-accent);
        color: #000;
        border-color: var(--m-accent);
        filter: brightness(1.08);
      }

      /* ─── STATS COMPARE ─── */
      .stats-compare {
        margin-top: 10px;
        border: 1px solid var(--m-border);
        border-radius: 8px;
        background: var(--m-surface);
        padding: 12px 12px 8px;
      }
      .stats-compare__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 4px;
      }
      .stats-compare__title {
        margin: 0;
        font-size: 14px;
        font-weight: 800;
        color: var(--m-text);
        letter-spacing: -0.01em;
      }
      .stats-compare__legend {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .stats-compare__legend-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--m-text-2);
        font-size: 12px;
        font-weight: 500;
      }
      .stats-compare__dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
      }
      .stats-compare__dot--player {
        background: var(--m-accent);
      }
      .stats-compare__dot--average {
        background: color-mix(in srgb, var(--m-text-3) 70%, var(--m-border));
      }
      .stats-compare__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
        gap: 6px;
      }
      .stats-compare__item {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
      }
      .stats-compare__values {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
        margin-bottom: 5px;
      }
      .stats-compare__value {
        font-variant-numeric: tabular-nums;
        line-height: 1.04;
        white-space: nowrap;
      }
      .stats-compare__value--player {
        font-size: 16px;
        font-weight: 800;
        color: var(--m-text);
      }
      .stats-compare__value--average {
        font-size: 12px;
        font-weight: 500;
        color: var(--m-text-3);
      }
      .stats-compare__bar-zone {
        --stats-compare-bar-max-height: 70px;
        position: relative;
        width: 100%;
        height: var(--stats-compare-bar-max-height);
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 6px;
        border-bottom: 1px solid var(--m-border);
        margin-bottom: 6px;
      }
      .stats-compare__bar {
        width: 10px;
        border-radius: 999px 999px 0 0;
        min-height: 0;
      }
      .stats-compare__bar--player {
        background: var(--m-accent);
      }
      .stats-compare__bar--average {
        background: color-mix(in srgb, var(--m-text-3) 70%, var(--m-border));
      }
      .stats-compare__label {
        font-size: 12px;
        font-weight: 500;
        color: var(--m-text);
        text-align: center;
        letter-spacing: -0.01em;
        text-transform: uppercase;
      }

      /* ═══ GAME LOG ═══ */
      .gl-team-type-nav {
        display: none;
        align-items: center;
        gap: 4px;
        padding: 0 0 10px;
      }
      @media (max-width: 768px) {
        .gl-team-type-nav {
          display: flex;
        }
      }
      .gl-team-type-pill {
        flex: 1;
        padding: 8px 0;
        border-radius: 8px;
        border: 1px solid var(--m-border);
        background: transparent;
        color: var(--m-text-2);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: center;
      }
      .gl-team-type-pill:hover {
        background: var(--m-surface-2);
        color: var(--m-text);
      }
      .gl-team-type-pill--active {
        background: var(--m-accent);
        color: #000;
        border-color: var(--m-accent);
      }

      .gl-season-nav {
        display: none;
        align-items: center;
        gap: 6px;
        padding: 0 0 12px;
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      @media (max-width: 768px) {
        .gl-season-nav {
          display: flex;
        }
      }
      .gl-season-nav::-webkit-scrollbar {
        display: none;
      }
      .gl-season-pill {
        flex-shrink: 0;
        padding: 6px 14px;
        border-radius: 999px;
        border: 1px solid var(--m-border);
        background: transparent;
        color: var(--m-text-2);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
      }
      .gl-season-pill:hover {
        background: var(--m-surface-2);
        color: var(--m-text);
      }
      .gl-season-pill--active {
        background: var(--m-accent);
        color: #000;
        border-color: var(--m-accent);
      }
      .gl-season-pill--active:hover {
        background: var(--m-accent);
        filter: brightness(1.08);
      }

      .gl-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 0 0 10px;
        flex-wrap: wrap;
      }
      .gl-summary__left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .gl-summary__season {
        font-size: 15px;
        font-weight: 800;
        color: var(--m-text);
        letter-spacing: -0.01em;
      }
      .gl-summary__record {
        font-size: 13px;
        font-weight: 600;
        color: var(--m-text-2);
        padding: 3px 10px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--m-accent) 12%, var(--m-surface));
        border: 1px solid color-mix(in srgb, var(--m-accent) 25%, var(--m-border));
      }

      .gl-totals {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 0 0 14px;
      }
      .gl-totals__row {
        border: 1px solid var(--m-border);
        border-radius: 10px;
        background: var(--m-surface);
        padding: 12px 14px;
      }
      .gl-totals__label {
        display: block;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--m-text-3);
        margin-bottom: 8px;
      }
      .gl-totals__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .gl-totals__chip {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 50px;
        padding: 6px 10px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--m-accent) 6%, var(--m-surface-2));
        border: 1px solid color-mix(in srgb, var(--m-border) 60%, transparent);
      }
      .gl-totals__chip-label {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--m-text-3);
        line-height: 1;
        margin-bottom: 3px;
      }
      .gl-totals__chip-value {
        font-size: 16px;
        font-weight: 800;
        color: var(--m-text);
        font-variant-numeric: tabular-nums;
        line-height: 1.2;
        letter-spacing: -0.01em;
      }

      .gl-season-board {
        border: 1px solid var(--m-border);
        border-radius: 12px;
        background: var(--m-surface);
        padding: 14px 16px 10px;
        margin-bottom: 12px;
      }
      .gl-season-board__header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
        flex-wrap: wrap;
      }
      .gl-season-board__title {
        font-size: 14px;
        font-weight: 700;
        color: var(--m-text);
        letter-spacing: 0.01em;
      }
      .gl-season-board__record {
        font-size: 12px;
        font-weight: 600;
        color: var(--m-accent);
        background: color-mix(in srgb, var(--m-accent) 12%, transparent);
        border-radius: 6px;
        padding: 2px 8px;
      }

      .gl-totals--season {
        padding: 0;
      }
      .gl-totals--season .gl-totals__row {
        border: none;
        background: transparent;
        padding: 4px 0 0;
      }
      .gl-totals--season .gl-totals__label {
        font-size: 10px;
        margin-bottom: 6px;
      }
      .gl-totals--season .gl-totals__chip {
        min-width: 44px;
        padding: 4px 8px;
      }
      .gl-totals--season .gl-totals__chip-value {
        font-size: 14px;
      }

      .gl-table-wrap {
        position: relative;
        border-radius: 10px;
        border: 1px solid var(--m-border);
        overflow: hidden;
        overflow-x: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--m-surface-2) transparent;
        background: var(--m-surface);
      }

      .gl-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: auto;
        min-width: max-content;
      }

      .gl-th {
        padding: 10px 14px;
        text-align: center;
        white-space: nowrap;
        vertical-align: middle;
        background: color-mix(in srgb, var(--m-accent) 5%, var(--m-surface));
        border-bottom: 1px solid var(--m-border);
      }
      .gl-th--sticky {
        position: sticky;
        left: 0;
        z-index: 2;
        text-align: left;
        background: color-mix(in srgb, var(--m-accent) 5%, var(--m-surface));
      }
      .gl-th--stat {
        min-width: 52px;
      }
      .gl-th-btn {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--m-text-3);
        transition: color 0.15s ease;
        white-space: nowrap;
      }
      .gl-th-btn:hover {
        color: var(--m-text);
      }
      .gl-th-text {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--m-text-3);
      }
      .gl-sort-arrow {
        font-size: 9px;
        color: var(--m-accent);
        line-height: 1;
      }

      .gl-row {
        transition: background 0.1s ease;
      }
      .gl-row:hover {
        background: color-mix(in srgb, var(--m-accent) 4%, transparent);
      }
      .gl-row--alt {
        background: color-mix(in srgb, var(--m-surface-2) 40%, transparent);
      }
      .gl-row--alt:hover {
        background: color-mix(in srgb, var(--m-accent) 6%, var(--m-surface-2));
      }

      .gl-td {
        padding: 10px 14px;
        text-align: center;
        white-space: nowrap;
        vertical-align: middle;
        font-size: 14px;
        font-weight: 600;
        color: var(--m-text);
        font-variant-numeric: tabular-nums;
        border-bottom: 1px solid color-mix(in srgb, var(--m-border) 40%, transparent);
      }
      .gl-td--sticky {
        position: sticky;
        left: 0;
        z-index: 1;
        text-align: left;
        background: var(--m-surface);
        font-weight: 500;
        color: var(--m-text-2);
        font-size: 13px;
      }
      .gl-row--alt .gl-td--sticky {
        background: color-mix(in srgb, var(--m-surface-2) 40%, var(--m-surface));
      }
      .gl-td--date {
        font-variant-numeric: tabular-nums;
      }
      .gl-td--result {
        text-align: left;
        padding-left: 10px;
      }
      .gl-td--opponent {
        text-align: left;
        font-weight: 700;
        color: var(--m-text);
      }
      .gl-td--stat {
        font-weight: 600;
      }

      .gl-result {
        font-weight: 800;
        font-size: 13px;
        letter-spacing: 0.02em;
        white-space: nowrap;
      }
      .gl-result--win {
        color: #22c55e;
      }
      .gl-result--loss {
        color: #ef4444;
      }
      .gl-result--tie {
        color: var(--m-text-2);
      }

      .gl-table tbody tr:last-child .gl-td {
        border-bottom: none;
      }

      @media (max-width: 640px) {
        .gl-season-nav {
          padding-bottom: 8px;
        }
        .gl-season-pill {
          padding: 5px 10px;
          font-size: 11px;
        }
        .gl-summary {
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
          padding-bottom: 8px;
        }
        .gl-summary__season {
          font-size: 14px;
        }
        .gl-totals__row {
          padding: 10px;
        }
        .gl-totals__chip {
          min-width: 42px;
          padding: 4px 7px;
        }
        .gl-totals__chip-label {
          font-size: 9px;
        }
        .gl-totals__chip-value {
          font-size: 14px;
        }
        .gl-th {
          padding: 8px 10px;
        }
        .gl-th-btn,
        .gl-th-text {
          font-size: 10px;
        }
        .gl-td {
          padding: 8px 10px;
          font-size: 13px;
        }
        .gl-result {
          font-size: 12px;
        }
        .stats-board__tabs {
          padding-bottom: 12px;
        }
        .stats-board__tab {
          padding: 6px 12px;
          font-size: 11px;
        }
        .stats-compare {
          padding: 10px 8px 8px;
        }
        .stats-compare__header {
          align-items: flex-start;
          flex-direction: column;
          gap: 10px;
        }
        .stats-compare__legend {
          gap: 10px;
        }
        .stats-compare__value--player {
          font-size: 14px;
        }
        .stats-compare__value--average {
          font-size: 11px;
        }
        .stats-compare__bar-zone {
          --stats-compare-bar-max-height: 56px;
        }
        .stats-compare__bar {
          width: 8px;
        }
        .stats-compare__label {
          font-size: 11px;
        }
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ],
})
export class ProfileStatsWebComponent {
  protected readonly profile = inject(ProfileService);

  // Active stat category index for stats tab pill switcher
  private readonly _activeStatCategoryIdx = signal(0);
  protected readonly activeStatCategoryIdx = computed(() => this._activeStatCategoryIdx());
  protected readonly activeStatCategory = computed(() => {
    const cats = this.profile.athleticStats();
    const idx = this._activeStatCategoryIdx();
    return cats[idx] ?? cats[0] ?? null;
  });

  protected readonly statsComparisonItems = computed<readonly StatsComparisonItem[]>(() => {
    const category = this.activeStatCategory();
    if (!category?.stats?.length) return [];

    const comparisonSource = category.stats.slice(0, 4);
    const parsedValues = comparisonSource.map((stat) => this.parseNumericStatValue(stat.value));
    const maxValue = Math.max(...parsedValues.filter((value) => value > 0), 1);

    return comparisonSource.map((stat, index) => {
      const playerNumeric = Math.max(0, this.parseNumericStatValue(stat.value));
      const averageNumeric = Math.max(
        0,
        this.resolveComparisonAverage(stat, playerNumeric, maxValue, index, comparisonSource.length)
      );

      return {
        label: stat.label,
        playerDisplay: `${stat.value}${stat.unit ?? ''}`,
        averageDisplay: this.formatComparisonAverage(stat, averageNumeric),
        playerPercent: this.toBarPercent(playerNumeric, maxValue),
        averagePercent: this.toBarPercent(averageNumeric, maxValue),
      };
    });
  });

  protected onStatCategoryChange(idx: number): void {
    this._activeStatCategoryIdx.set(idx);
  }

  // ============================================
  // GAME LOG SIGNALS & METHODS
  // ============================================

  private readonly _isCareerMode = signal(true);
  protected readonly isCareerMode = computed(() => this._isCareerMode());

  private readonly _activeTeamType = signal<'school' | 'club'>('school');
  protected readonly activeTeamType = computed(() => this._activeTeamType());

  private readonly _activeGameLogSeasonIdx = signal(0);
  protected readonly activeGameLogSeasonIdx = computed(() => this._activeGameLogSeasonIdx());

  private readonly _activeGameLogCategoryIdx = signal(0);
  protected readonly activeGameLogCategoryIdx = computed(() => this._activeGameLogCategoryIdx());

  private readonly _gameLogSortKey = signal<string>('date');
  private readonly _gameLogSortDir = signal<'asc' | 'desc'>('asc');
  protected readonly gameLogSortKey = computed(() => this._gameLogSortKey());
  protected readonly gameLogSortDir = computed(() => this._gameLogSortDir());

  protected readonly hasSchoolGameLogs = computed(() =>
    this.profile.gameLog().some((l) => (l.teamType ?? 'school') === 'school')
  );

  protected readonly hasClubGameLogs = computed(() =>
    this.profile.gameLog().some((l) => l.teamType === 'club')
  );

  private readonly filteredGameLogs = computed(() => {
    const teamType = this._activeTeamType();
    return this.profile.gameLog().filter((l) => (l.teamType ?? 'school') === teamType);
  });

  private getUniqueSeasons(logs: readonly ProfileSeasonGameLog[]): readonly string[] {
    const seen = new Set<string>();
    const seasons: string[] = [];
    for (const log of logs) {
      if (!seen.has(log.season)) {
        seen.add(log.season);
        seasons.push(log.season);
      }
    }
    return seasons;
  }

  readonly gameLogSeasons = computed<readonly string[]>(() => {
    return this.getUniqueSeasons(this.filteredGameLogs());
  });

  readonly schoolSeasons = computed<readonly string[]>(() => {
    const logs = this.profile.gameLog().filter((l) => (l.teamType ?? 'school') === 'school');
    return this.getUniqueSeasons(logs);
  });

  readonly schoolStatsTeamName = computed(() => {
    const user = this.profile.user();
    const schoolName = user?.school?.name?.trim();
    if (schoolName) return schoolName;

    const schoolAffiliation = (user?.teamAffiliations ?? []).find((affiliation) => {
      const type = this.normalizeTeamType(affiliation.type);
      return type === 'high-school' || type === 'middle-school';
    });

    return schoolAffiliation?.name?.trim() || 'School';
  });

  readonly clubSeasons = computed<readonly string[]>(() => {
    const logs = this.profile.gameLog().filter((l) => l.teamType === 'club');
    return this.getUniqueSeasons(logs);
  });

  readonly clubStatsTeamName = computed(() => {
    const user = this.profile.user();
    const clubAffiliation = (user?.teamAffiliations ?? []).find((affiliation) => {
      const type = this.normalizeTeamType(affiliation.type);
      return type === 'club' || type === 'travel' || type === 'academy';
    });

    return clubAffiliation?.name?.trim() || 'Club';
  });

  protected readonly gameLogCategoriesForSeason = computed<readonly string[]>(() => {
    const logs = this.filteredGameLogs();

    if (this._isCareerMode()) {
      const seen = new Set<string>();
      const cats: string[] = [];
      for (const log of logs) {
        if (!seen.has(log.category)) {
          seen.add(log.category);
          cats.push(log.category);
        }
      }
      return cats;
    }

    const seasons = this.gameLogSeasons();
    const activeIdx = this._activeGameLogSeasonIdx();
    const activeSeason = seasons[activeIdx] ?? seasons[0];
    if (!activeSeason) return [];
    return logs.filter((l) => l.season === activeSeason).map((l) => l.category);
  });

  protected readonly activeGameLog = computed<ProfileSeasonGameLog | null>(() => {
    const logs = this.filteredGameLogs();
    const categories = this.gameLogCategoriesForSeason();
    const catIdx = this._activeGameLogCategoryIdx();
    const activeCategory = categories[catIdx] ?? categories[0];
    if (!activeCategory) return null;

    if (this._isCareerMode()) {
      return this.buildCareerGameLog(logs, activeCategory);
    }

    const seasons = this.gameLogSeasons();
    const seasonIdx = this._activeGameLogSeasonIdx();
    const activeSeason = seasons[seasonIdx] ?? seasons[0];
    if (!activeSeason) return null;

    const seasonLogs = logs.filter((l) => l.season === activeSeason);
    const seasonCatLogs = seasonLogs.filter((l) => l.category === activeCategory);
    return seasonCatLogs[0] ?? null;
  });

  protected readonly careerSeasonLogs = computed<readonly ProfileSeasonGameLog[]>(() => {
    if (!this._isCareerMode()) return [];
    const logs = this.filteredGameLogs();
    const categories = this.gameLogCategoriesForSeason();
    const catIdx = this._activeGameLogCategoryIdx();
    const activeCategory = categories[catIdx] ?? categories[0];
    if (!activeCategory) return [];
    return logs.filter((l) => l.category === activeCategory);
  });

  protected readonly sortedGameLogEntries = computed<readonly GameLogEntry[]>(() => {
    const gl = this.activeGameLog();
    if (!gl?.games?.length) return [];

    const key = this._gameLogSortKey();
    const dir = this._gameLogSortDir();
    const games = [...gl.games];

    games.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      if (key === 'date') {
        aVal = a.date;
        bVal = b.date;
      } else if (key === 'opponent') {
        aVal = a.opponent.toLowerCase();
        bVal = b.opponent.toLowerCase();
      } else if (key === 'result') {
        aVal = a.result;
        bVal = b.result;
      } else {
        aVal = this.parseNumericStatValue(a.stats[key]);
        bVal = this.parseNumericStatValue(b.stats[key]);
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return dir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const strA = String(aVal);
      const strB = String(bVal);
      return dir === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });

    return games;
  });

  onGameLogSeasonChange(idx: number): void {
    this._isCareerMode.set(false);
    this._activeGameLogSeasonIdx.set(idx);
    this._activeGameLogCategoryIdx.set(0);
    this._gameLogSortKey.set('date');
    this._gameLogSortDir.set('asc');
  }

  onCareerModeActivate(): void {
    this._isCareerMode.set(true);
    this._activeGameLogCategoryIdx.set(0);
    this._gameLogSortKey.set('date');
    this._gameLogSortDir.set('asc');
  }

  onTeamTypeChange(type: 'school' | 'club'): void {
    this._activeTeamType.set(type);
    this._isCareerMode.set(true);
    this._activeGameLogSeasonIdx.set(0);
    this._activeGameLogCategoryIdx.set(0);
    this._gameLogSortKey.set('date');
    this._gameLogSortDir.set('asc');
  }

  protected onGameLogCategoryChange(idx: number): void {
    this._activeGameLogCategoryIdx.set(idx);
    this._gameLogSortKey.set('date');
    this._gameLogSortDir.set('asc');
  }

  protected onGameLogSort(key: string): void {
    if (this._gameLogSortKey() === key) {
      this._gameLogSortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this._gameLogSortKey.set(key);
      this._gameLogSortDir.set(key === 'date' ? 'asc' : 'desc');
    }
  }

  protected onAddStats(): void {
    // Placeholder — shell handles this
  }

  private parseNumericStatValue(raw: string | number | null | undefined): number {
    if (typeof raw === 'number') {
      return Number.isFinite(raw) ? raw : 0;
    }
    if (typeof raw !== 'string') return 0;
    const normalized = raw.replace(/,/g, '').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private formatNumberWithCommas(value: number): string {
    const str = Math.round(value).toString();
    return str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  private buildCareerGameLog(
    allLogs: readonly ProfileSeasonGameLog[],
    category: string
  ): ProfileSeasonGameLog {
    const catLogs = allLogs.filter((l) => l.category === category);
    if (catLogs.length === 0) {
      return { season: 'Career', category, columns: [], games: [] };
    }

    const columns = catLogs[0].columns;
    const allGames: GameLogEntry[] = [];
    for (const log of catLogs) {
      const shortYear = log.season.slice(2, 4);
      for (const game of log.games) {
        allGames.push({ ...game, date: `${game.date}/${shortYear}` });
      }
    }

    const totalGames = allGames.length;
    const careerTotalStats: Record<string, string | number> = {};
    const careerAvgStats: Record<string, string | number> = {};

    for (const col of columns) {
      if (col.key === 'PCT') continue;
      if (col.key === 'AVG') continue;
      if (col.key === 'LNG') {
        let maxVal = 0;
        for (const g of allGames) {
          const v = this.parseNumericStatValue(g.stats[col.key]);
          if (v > maxVal) maxVal = v;
        }
        careerTotalStats[col.key] = maxVal;
        careerAvgStats[col.key] = '-';
        continue;
      }

      let sum = 0;
      for (const g of allGames) {
        sum += this.parseNumericStatValue(g.stats[col.key]);
      }
      careerTotalStats[col.key] = sum;
      careerAvgStats[col.key] = totalGames > 0 ? Math.round((sum / totalGames) * 10) / 10 : 0;
    }

    if (careerTotalStats['C'] !== undefined && careerTotalStats['ATT'] !== undefined) {
      const c = this.parseNumericStatValue(careerTotalStats['C']);
      const att = this.parseNumericStatValue(careerTotalStats['ATT']);
      const pct = att > 0 ? (c / att).toFixed(3) : '.000';
      careerTotalStats['PCT'] = pct;
      careerAvgStats['PCT'] = pct;
    }

    const ydsTotal = this.parseNumericStatValue(careerTotalStats['YDS']);
    const attTotal = this.parseNumericStatValue(careerTotalStats['ATT'] ?? careerTotalStats['CAR']);
    if (attTotal > 0) {
      const avg = Math.round((ydsTotal / attTotal) * 10) / 10;
      careerTotalStats['AVG'] = avg;
      careerAvgStats['AVG'] = avg;
    }

    if (typeof careerTotalStats['YDS'] === 'number' && careerTotalStats['YDS'] >= 1000) {
      careerTotalStats['YDS'] = this.formatNumberWithCommas(careerTotalStats['YDS']);
    }

    let totalWins = 0;
    let totalLosses = 0;
    for (const log of catLogs) {
      if (log.seasonRecord) {
        const parts = log.seasonRecord.split('-').map((p) => parseInt(p, 10));
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          totalWins += parts[0];
          totalLosses += parts[1];
        }
      }
    }
    const careerRecord = `${totalWins}-${totalLosses}`;

    const totals: GameLogSeasonTotals[] = [
      { label: 'Career Totals', stats: careerTotalStats },
      { label: 'Per Game Avg', stats: careerAvgStats },
    ];

    return {
      season: 'Career',
      category,
      columns,
      games: allGames,
      totals,
      seasonRecord: careerRecord,
      verified: catLogs.every((l) => l.verified),
      verifiedBy: catLogs[0].verifiedBy,
    };
  }

  private resolveComparisonAverage(
    stat: AthleticStat,
    playerNumeric: number,
    maxValue: number,
    index: number,
    total: number
  ): number {
    const extendedStat = stat as AthleticStat & {
      readonly nationalAverage?: string | number;
      readonly nationalAvg?: string | number;
      readonly average?: string | number;
      readonly avg?: string | number;
      readonly benchmark?: string | number;
    };

    const explicitAverage =
      extendedStat.nationalAverage ??
      extendedStat.nationalAvg ??
      extendedStat.average ??
      extendedStat.avg ??
      extendedStat.benchmark;

    const parsedExplicit = this.parseNumericStatValue(explicitAverage);
    if (parsedExplicit > 0) return parsedExplicit;

    if (playerNumeric <= 0) return 0;

    const rankFactor = total > 1 ? index / (total - 1) : 0;
    const maxRelativeFloor = maxValue * (0.014 + rankFactor * 0.01);
    const valueBased = playerNumeric * 0.02;

    return Math.max(0, Math.min(playerNumeric, Math.max(maxRelativeFloor, valueBased)));
  }

  private formatComparisonAverage(stat: AthleticStat, value: number): string {
    const hasDecimal = stat.value.includes('.');
    const rounded = hasDecimal ? Math.round(value * 10) / 10 : Math.round(value);
    return `${rounded}${stat.unit ?? ''}`;
  }

  private toBarPercent(value: number, maxValue: number): number {
    if (value <= 0 || maxValue <= 0) return 0;
    const rawPercent = (value / maxValue) * 100;
    return Math.max(3, Math.min(100, rawPercent));
  }

  private normalizeTeamType(type?: string): string {
    if (!type) return 'other';
    const normalized = type.trim().toLowerCase();
    if (normalized === 'high-school' || normalized === 'high school' || normalized === 'hs')
      return 'high-school';
    if (normalized === 'middle-school' || normalized === 'middle school' || normalized === 'ms')
      return 'middle-school';
    if (normalized === 'club') return 'club';
    if (normalized === 'juco' || normalized === 'junior college') return 'juco';
    if (normalized === 'college') return 'college';
    if (normalized === 'academy') return 'academy';
    if (normalized === 'travel' || normalized === 'travel-team' || normalized === 'travel team')
      return 'travel';
    return 'other';
  }
}
