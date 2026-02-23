/**
 * @fileoverview Manage Team - Stats Section Component
 * @module @nxt1/ui/manage-team
 * @version 1.0.0
 *
 * Statistics management section with manual entry and integration sync.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  statsChartOutline,
  addOutline,
  trophyOutline,
  footballOutline,
  handLeftOutline,
  flashOutline,
  personOutline,
  syncOutline,
  createOutline,
  chevronForwardOutline,
  informationCircleOutline,
} from 'ionicons/icons';
import type { TeamIntegration, TeamRecord } from '@nxt1/core';

/** Team stats for display */
export interface TeamStatsDisplay {
  readonly season?: string;
  readonly record?: TeamRecord;
  readonly pointsScored?: number;
  readonly pointsAllowed?: number;
  readonly rosterSize?: number;
}

/** Stats action event */
export interface StatsActionEvent {
  readonly action: 'edit' | 'sync' | 'connect' | 'manage';
}

@Component({
  selector: 'nxt1-manage-team-stats-section',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect],
  template: `
    <div class="stats-section">
      <!-- Header -->
      <div class="stats-header">
        <div class="stats-info">
          <ion-icon name="stats-chart-outline"></ion-icon>
          <span>Team Statistics</span>
        </div>

        <div class="header-actions">
          @if (hasIntegration()) {
            <button type="button" class="sync-btn" (click)="onSyncStats()">
              <ion-ripple-effect></ion-ripple-effect>
              <ion-icon name="sync-outline"></ion-icon>
              <span>Sync</span>
            </button>
          }
          <button type="button" class="edit-btn" (click)="onEditStats()">
            <ion-ripple-effect></ion-ripple-effect>
            <ion-icon name="create-outline"></ion-icon>
            <span>Edit</span>
          </button>
        </div>
      </div>

      <!-- Season Record Card -->
      @if (stats()) {
        <div class="record-card">
          <div class="record-header">
            <ion-icon name="trophy-outline"></ion-icon>
            <span>Season Record</span>
            @if (stats()?.season) {
              <span class="season-badge">{{ stats()?.season }}</span>
            }
          </div>

          <div class="record-stats">
            <div class="record-item">
              <span class="record-value wins">{{ stats()?.record?.wins ?? 0 }}</span>
              <span class="record-label">Wins</span>
            </div>
            <div class="record-divider">-</div>
            <div class="record-item">
              <span class="record-value losses">{{ stats()?.record?.losses ?? 0 }}</span>
              <span class="record-label">Losses</span>
            </div>
            @if ((stats()?.record?.ties ?? 0) > 0) {
              <div class="record-divider">-</div>
              <div class="record-item">
                <span class="record-value ties">{{ stats()?.record?.ties ?? 0 }}</span>
                <span class="record-label">Ties</span>
              </div>
            }
          </div>

          @if (winPercentage() !== null) {
            <div class="win-percentage">
              <span class="percentage-value">{{ winPercentage() }}%</span>
              <span class="percentage-label">Win Rate</span>
            </div>
          }
        </div>
      }

      <!-- Quick Stats Grid -->
      @if (stats()) {
        <div class="stats-grid">
          <div class="stat-card">
            <ion-icon name="football-outline"></ion-icon>
            <div class="stat-content">
              <span class="stat-value">{{ stats()?.pointsScored ?? 0 }}</span>
              <span class="stat-label">Points Scored</span>
            </div>
          </div>

          <div class="stat-card">
            <ion-icon name="hand-left-outline"></ion-icon>
            <div class="stat-content">
              <span class="stat-value">{{ stats()?.pointsAllowed ?? 0 }}</span>
              <span class="stat-label">Points Allowed</span>
            </div>
          </div>

          <div class="stat-card">
            <ion-icon name="flash-outline"></ion-icon>
            <div class="stat-content">
              <span class="stat-value">{{ pointDifferential() }}</span>
              <span class="stat-label">Point Diff</span>
            </div>
          </div>

          <div class="stat-card">
            <ion-icon name="person-outline"></ion-icon>
            <div class="stat-content">
              <span class="stat-value">{{ stats()?.rosterSize ?? 0 }}</span>
              <span class="stat-label">Roster Size</span>
            </div>
          </div>
        </div>
      }

      <!-- Integration Section -->
      <div class="integration-section">
        <div class="integration-header">
          <h4>Stats Integration</h4>
          <p>Connect to external stats providers for automatic updates</p>
        </div>

        @if (activeIntegration()) {
          <div class="active-integration">
            <div class="integration-info">
              <div class="integration-logo">
                @switch (activeIntegration()?.provider) {
                  @case ('maxpreps') {
                    <span class="provider-icon maxpreps">MP</span>
                  }
                  @case ('hudl') {
                    <span class="provider-icon hudl">H</span>
                  }
                  @default {
                    <ion-icon name="sync-outline"></ion-icon>
                  }
                }
              </div>
              <div class="integration-details">
                <span class="integration-name">{{
                  getIntegrationName(activeIntegration()?.provider ?? '')
                }}</span>
                <span class="integration-status status-connected">
                  <span class="status-dot"></span>
                  Connected
                </span>
              </div>
            </div>
            <button type="button" class="manage-btn" (click)="onManageIntegration()">
              <ion-ripple-effect></ion-ripple-effect>
              <span>Manage</span>
              <ion-icon name="chevron-forward-outline"></ion-icon>
            </button>
          </div>
        } @else {
          <button type="button" class="connect-integration-btn" (click)="onConnectIntegration()">
            <ion-ripple-effect></ion-ripple-effect>
            <div class="btn-content">
              <ion-icon name="sync-outline"></ion-icon>
              <div class="btn-text">
                <span class="btn-title">Connect Stats Provider</span>
                <span class="btn-subtitle">MaxPreps, Hudl, and more</span>
              </div>
            </div>
            <ion-icon name="chevron-forward-outline" class="arrow"></ion-icon>
          </button>
        }
      </div>

      <!-- Empty State -->
      @if (!stats()) {
        <div class="empty-state">
          <ion-icon name="stats-chart-outline"></ion-icon>
          <h4>No Stats Yet</h4>
          <p>Add your team's statistics manually or connect an integration</p>
          <div class="empty-actions">
            <button type="button" class="add-stats-btn" (click)="onEditStats()">
              <ion-ripple-effect></ion-ripple-effect>
              <ion-icon name="add-outline"></ion-icon>
              <span>Add Stats</span>
            </button>
            <button type="button" class="connect-btn" (click)="onConnectIntegration()">
              <ion-ripple-effect></ion-ripple-effect>
              <ion-icon name="sync-outline"></ion-icon>
              <span>Connect Provider</span>
            </button>
          </div>
        </div>
      }

      <!-- Info Note -->
      <div class="info-note">
        <ion-icon name="information-circle-outline"></ion-icon>
        <span>Stats are visible on your public team profile</span>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       STATS SECTION - 2026 Design Tokens
       ============================================ */

      :host {
        display: block;
      }

      .stats-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
      }

      /* ============================================
         HEADER
         ============================================ */

      .stats-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .stats-info {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);

        ion-icon {
          font-size: 18px;
          color: var(--nxt1-color-secondary);
        }
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .sync-btn,
      .edit-btn {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
        border: none;
        border-radius: var(--nxt1-radius-full);
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
          background: var(--nxt1-color-surface-300);
        }

        &:active {
          transform: scale(0.98);
        }
      }

      .edit-btn {
        background: var(--nxt1-color-secondary);
        color: var(--nxt1-color-text-onPrimary);

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-secondaryLight);
        }
      }

      /* ============================================
         RECORD CARD
         ============================================ */

      .record-card {
        background: linear-gradient(
          135deg,
          var(--nxt1-color-surface-100) 0%,
          var(--nxt1-color-surface-200) 100%
        );
        border-radius: var(--nxt1-radius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        padding: var(--nxt1-spacing-5);
      }

      .record-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        margin-bottom: var(--nxt1-spacing-4);

        ion-icon {
          font-size: 20px;
          color: var(--nxt1-color-warning);
        }

        span {
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-sm);
          font-weight: 600;
          color: var(--nxt1-color-text-primary);
        }

        .season-badge {
          margin-left: auto;
          background: var(--nxt1-color-surface-300);
          padding: 4px 10px;
          border-radius: var(--nxt1-radius-full);
          font-size: var(--nxt1-fontSize-xs);
          color: var(--nxt1-color-text-secondary);
        }
      }

      .record-stats {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-4);
      }

      .record-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }

      .record-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-4xl);
        font-weight: 700;
        line-height: 1;

        &.wins {
          color: var(--nxt1-color-success);
        }

        &.losses {
          color: var(--nxt1-color-error);
        }

        &.ties {
          color: var(--nxt1-color-text-secondary);
        }
      }

      .record-label {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .record-divider {
        font-size: var(--nxt1-fontSize-2xl);
        color: var(--nxt1-color-text-tertiary);
      }

      .win-percentage {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        margin-top: var(--nxt1-spacing-4);
        padding-top: var(--nxt1-spacing-4);
        border-top: 1px solid var(--nxt1-color-border-subtle);

        .percentage-value {
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-xl);
          font-weight: 700;
          color: var(--nxt1-color-primary);
        }

        .percentage-label {
          font-size: var(--nxt1-fontSize-sm);
          color: var(--nxt1-color-text-secondary);
        }
      }

      /* ============================================
         STATS GRID
         ============================================ */

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-3);
      }

      @media (min-width: 640px) {
        .stats-grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      .stat-card {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);

        ion-icon {
          font-size: 24px;
          color: var(--nxt1-color-primary);
        }
      }

      .stat-content {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .stat-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        line-height: 1;
      }

      .stat-label {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
         INTEGRATION SECTION
         ============================================ */

      .integration-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .integration-header {
        h4 {
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-sm);
          font-weight: 600;
          color: var(--nxt1-color-text-primary);
          margin: 0 0 4px;
        }

        p {
          font-size: var(--nxt1-fontSize-xs);
          color: var(--nxt1-color-text-secondary);
          margin: 0;
        }
      }

      .active-integration {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
        border: 1px solid var(--nxt1-color-success);
      }

      .integration-info {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .integration-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: var(--nxt1-radius-lg);
        background: var(--nxt1-color-surface-200);
      }

      .provider-icon {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 700;
        border-radius: var(--nxt1-radius-sm);
        padding: 4px 8px;

        &.maxpreps {
          background: #003087;
          color: white;
        }

        &.hudl {
          background: #ff6b00;
          color: white;
        }
      }

      .integration-details {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .integration-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
      }

      .integration-status {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-size: var(--nxt1-fontSize-xs);

        &.status-connected {
          color: var(--nxt1-color-success);
        }

        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }
      }

      .manage-btn {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-full);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        cursor: pointer;
        overflow: hidden;

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-surface-200);
          border-color: var(--nxt1-color-primary);
          color: var(--nxt1-color-primary);
        }
      }

      .connect-integration-btn {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border: 1px dashed var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-xl);
        cursor: pointer;
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-surface-200);
          border-style: solid;
          border-color: var(--nxt1-color-primary);
        }

        .btn-content {
          display: flex;
          align-items: center;
          gap: var(--nxt1-spacing-3);

          > ion-icon {
            font-size: 24px;
            color: var(--nxt1-color-secondary);
          }
        }

        .btn-text {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
        }

        .btn-title {
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-sm);
          font-weight: 600;
          color: var(--nxt1-color-text-primary);
        }

        .btn-subtitle {
          font-size: var(--nxt1-fontSize-xs);
          color: var(--nxt1-color-text-secondary);
        }

        .arrow {
          font-size: 18px;
          color: var(--nxt1-color-text-tertiary);
        }
      }

      /* ============================================
         EMPTY STATE
         ============================================ */

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-4);
        text-align: center;

        > ion-icon {
          font-size: 48px;
          color: var(--nxt1-color-text-tertiary);
        }

        h4 {
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-lg);
          font-weight: 600;
          color: var(--nxt1-color-text-primary);
          margin: 0;
        }

        p {
          font-size: var(--nxt1-fontSize-sm);
          color: var(--nxt1-color-text-tertiary);
          margin: 0;
        }
      }

      .empty-actions {
        display: flex;
        gap: var(--nxt1-spacing-3);
        flex-wrap: wrap;
        justify-content: center;
      }

      .add-stats-btn,
      .connect-btn {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: var(--nxt1-color-secondary);
        color: var(--nxt1-color-text-onPrimary);
        border: none;
        border-radius: var(--nxt1-radius-lg);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        cursor: pointer;
        overflow: hidden;

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-secondaryLight);
        }

        &:active {
          transform: scale(0.98);
        }
      }

      .connect-btn {
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-surface-300);
        }
      }

      /* ============================================
         INFO NOTE
         ============================================ */

      .info-note {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-lg);

        ion-icon {
          font-size: 18px;
          color: var(--nxt1-color-info);
          flex-shrink: 0;
        }

        span {
          font-size: var(--nxt1-fontSize-sm);
          color: var(--nxt1-color-text-secondary);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageTeamStatsSectionComponent {
  constructor() {
    addIcons({
      statsChartOutline,
      addOutline,
      trophyOutline,
      footballOutline,
      handLeftOutline,
      flashOutline,
      personOutline,
      syncOutline,
      createOutline,
      chevronForwardOutline,
      informationCircleOutline,
    });
  }

  /** Team stats */
  readonly stats = input<TeamStatsDisplay | null>(null);

  /** Active stats integration */
  readonly statsIntegration = input<TeamIntegration | null>(null);

  /** Action event */
  readonly action = output<StatsActionEvent>();

  /** Has active integration */
  readonly hasIntegration = computed(() => this.statsIntegration() !== null);

  /** Active integration */
  readonly activeIntegration = computed(() => this.statsIntegration());

  /** Calculate win percentage */
  readonly winPercentage = computed(() => {
    const record = this.stats()?.record;
    if (!record) return null;

    const total = record.wins + record.losses + (record.ties ?? 0);
    if (total === 0) return null;

    return Math.round((record.wins / total) * 100);
  });

  /** Calculate point differential */
  readonly pointDifferential = computed(() => {
    const stats = this.stats();
    if (!stats) return '+0';

    const diff = (stats.pointsScored ?? 0) - (stats.pointsAllowed ?? 0);
    return diff >= 0 ? `+${diff}` : `${diff}`;
  });

  getIntegrationName(provider: string): string {
    const names: Record<string, string> = {
      maxpreps: 'MaxPreps',
      hudl: 'Hudl',
      gamechanger: 'GameChanger',
      sports_reference: 'Sports Reference',
    };
    return names[provider] ?? provider;
  }

  onEditStats(): void {
    this.action.emit({ action: 'edit' });
  }

  onSyncStats(): void {
    this.action.emit({ action: 'sync' });
  }

  onConnectIntegration(): void {
    this.action.emit({ action: 'connect' });
  }

  onManageIntegration(): void {
    this.action.emit({ action: 'manage' });
  }
}
