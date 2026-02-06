/**
 * @fileoverview Manage Team - Roster Section Component
 * @module @nxt1/ui/manage-team
 * @version 1.0.0
 *
 * Roster management section for viewing and managing players.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect, IonSearchbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  peopleOutline,
  personAddOutline,
  searchOutline,
  filterOutline,
  ellipsisVertical,
  starOutline,
  star,
  checkmarkCircle,
  alertCircleOutline,
  bandageOutline,
  mailOutline,
  trashOutline,
  createOutline,
  eyeOutline,
} from 'ionicons/icons';
import type { RosterPlayer, RosterActionEvent } from '@nxt1/core';
import { NxtAvatarComponent } from '../../components/avatar';

addIcons({
  peopleOutline,
  personAddOutline,
  searchOutline,
  filterOutline,
  ellipsisVertical,
  starOutline,
  star,
  checkmarkCircle,
  alertCircleOutline,
  bandageOutline,
  mailOutline,
  trashOutline,
  createOutline,
  eyeOutline,
});

@Component({
  selector: 'nxt1-manage-team-roster-section',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect, IonSearchbar, NxtAvatarComponent],
  template: `
    <div class="roster-section">
      <!-- Header -->
      <div class="roster-header">
        <div class="roster-count">
          <ion-icon name="people-outline"></ion-icon>
          <span>{{ activeCount() }} Active Players</span>
        </div>

        <div class="roster-actions">
          <button type="button" class="action-btn" (click)="onInvite()">
            <ion-ripple-effect></ion-ripple-effect>
            <ion-icon name="person-add-outline"></ion-icon>
            <span>Invite</span>
          </button>
        </div>
      </div>

      <!-- Search -->
      <ion-searchbar
        placeholder="Search players..."
        [debounce]="300"
        mode="ios"
        (ionInput)="onSearch($event)"
      ></ion-searchbar>

      <!-- Player List -->
      <div class="player-list">
        @for (player of filteredPlayers(); track player.id) {
          <div
            class="player-card"
            [class.player-card--invited]="player.status === 'invited'"
            [class.player-card--injured]="player.status === 'injured'"
          >
            <ion-ripple-effect></ion-ripple-effect>

            <!-- Player Avatar -->
            <nxt1-avatar
              [src]="player.photoUrl ?? null"
              [initials]="getInitials(player)"
              [size]="'md'"
            />

            <!-- Player Info -->
            <div class="player-info">
              <div class="player-name">
                <span>{{ player.firstName }} {{ player.lastName }}</span>
                @if (player.isCaptain) {
                  <ion-icon name="star" class="captain-badge"></ion-icon>
                }
              </div>
              <div class="player-meta">
                @if (player.number) {
                  <span class="jersey-number">#{{ player.number }}</span>
                }
                <span class="position">{{ player.position }}</span>
                @if (player.classYear) {
                  <span class="class-year">{{ player.classYear }}</span>
                }
              </div>
            </div>

            <!-- Status Badge -->
            <div class="player-status" [class]="'status-' + player.status">
              @switch (player.status) {
                @case ('active') {
                  <ion-icon name="checkmark-circle"></ion-icon>
                }
                @case ('invited') {
                  <ion-icon name="mail-outline"></ion-icon>
                }
                @case ('injured') {
                  <ion-icon name="bandage-outline"></ion-icon>
                }
                @case ('inactive') {
                  <ion-icon name="alert-circle-outline"></ion-icon>
                }
              }
            </div>

            <!-- Actions Menu -->
            <button type="button" class="menu-btn" (click)="onPlayerMenu(player, $event)">
              <ion-ripple-effect></ion-ripple-effect>
              <ion-icon name="ellipsis-vertical"></ion-icon>
            </button>
          </div>
        } @empty {
          <div class="empty-state">
            <ion-icon name="people-outline"></ion-icon>
            <h4>No Players Yet</h4>
            <p>Invite players to join your team roster</p>
            <button type="button" class="invite-btn" (click)="onInvite()">
              <ion-ripple-effect></ion-ripple-effect>
              <ion-icon name="person-add-outline"></ion-icon>
              <span>Invite Players</span>
            </button>
          </div>
        }
      </div>

      <!-- Position Groups Summary -->
      @if (positionGroups().size > 0) {
        <div class="position-summary">
          <h4 class="summary-title">By Position</h4>
          <div class="position-chips">
            @for (entry of positionGroupsArray(); track entry.position) {
              <div class="position-chip">
                <span class="position-name">{{ entry.position }}</span>
                <span class="position-count">{{ entry.count }}</span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       ROSTER SECTION - 2026 Design Tokens
       ============================================ */

      :host {
        display: block;
      }

      .roster-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
      }

      /* ============================================
         HEADER
         ============================================ */

      .roster-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .roster-count {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);

        ion-icon {
          font-size: 18px;
          color: var(--nxt1-color-primary);
        }
      }

      .roster-actions {
        display: flex;
        gap: var(--nxt1-spacing-2);
      }

      .action-btn {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
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
          background: var(--nxt1-color-primaryLight);
          transform: translateY(-1px);
        }

        &:active {
          transform: scale(0.98);
        }
      }

      /* ============================================
         SEARCH
         ============================================ */

      ion-searchbar {
        --background: var(--nxt1-color-surface-100);
        --border-radius: var(--nxt1-radius-lg);
        --box-shadow: none;
        --placeholder-color: var(--nxt1-color-text-tertiary);
        padding: 0;
      }

      /* ============================================
         PLAYER LIST
         ============================================ */

      .player-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .player-card {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);

        &:hover {
          background: var(--nxt1-color-surface-200);
          border-color: var(--nxt1-color-border-default);
        }
      }

      .player-card--invited {
        border-color: var(--nxt1-color-feedback-warning);
        border-style: dashed;
      }

      .player-card--injured {
        opacity: 0.7;
      }

      .player-info {
        flex: 1;
        min-width: 0;
      }

      .player-name {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);

        .captain-badge {
          font-size: 14px;
          color: var(--nxt1-color-secondary);
        }
      }

      .player-meta {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-primary);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary);
      }

      .jersey-number {
        font-weight: 600;
        color: var(--nxt1-color-primary);
      }

      .position {
        background: var(--nxt1-color-surface-200);
        padding: 2px 8px;
        border-radius: var(--nxt1-radius-sm);
      }

      .class-year {
        font-weight: 500;
      }

      /* ============================================
         STATUS BADGE
         ============================================ */

      .player-status {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: var(--nxt1-radius-full);

        ion-icon {
          font-size: 16px;
        }
      }

      .status-active {
        color: var(--nxt1-color-feedback-success);
      }

      .status-invited {
        color: var(--nxt1-color-feedback-warning);
      }

      .status-injured {
        color: var(--nxt1-color-feedback-error);
      }

      .status-inactive {
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
         MENU BUTTON
         ============================================ */

      .menu-btn {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: transparent;
        border: none;
        border-radius: var(--nxt1-radius-full);
        color: var(--nxt1-color-text-tertiary);
        cursor: pointer;
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-surface-300);
          color: var(--nxt1-color-text-primary);
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

        ion-icon {
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

      .invite-btn {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        border: none;
        border-radius: var(--nxt1-radius-lg);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        cursor: pointer;
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-primaryLight);
        }

        &:active {
          transform: scale(0.98);
        }
      }

      /* ============================================
         POSITION SUMMARY
         ============================================ */

      .position-summary {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
        padding-top: var(--nxt1-spacing-4);
        border-top: 1px solid var(--nxt1-color-border-subtle);
      }

      .summary-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      .position-chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2);
      }

      .position-chip {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-radius-full);
        font-size: var(--nxt1-fontSize-xs);
      }

      .position-name {
        color: var(--nxt1-color-text-secondary);
      }

      .position-count {
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        padding: 2px 6px;
        border-radius: var(--nxt1-radius-full);
        font-weight: 600;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageTeamRosterSectionComponent {
  /** Roster players */
  readonly players = input<readonly RosterPlayer[]>([]);

  /** Action event */
  readonly action = output<RosterActionEvent>();

  /** Invite event */
  readonly invite = output<void>();

  /** Search query */
  private searchQuery = '';

  /** Active player count */
  readonly activeCount = computed(() => this.players().filter((p) => p.status === 'active').length);

  /** Filtered players based on search */
  readonly filteredPlayers = computed(() => {
    const query = this.searchQuery.toLowerCase();
    if (!query) return this.players();

    return this.players().filter((p) => {
      const name = `${p.firstName} ${p.lastName}`.toLowerCase();
      const position = p.position.toLowerCase();
      const number = p.number?.toLowerCase() ?? '';
      return name.includes(query) || position.includes(query) || number.includes(query);
    });
  });

  /** Players grouped by position */
  readonly positionGroups = computed(() => {
    const groups = new Map<string, number>();
    for (const player of this.players()) {
      const count = groups.get(player.position) ?? 0;
      groups.set(player.position, count + 1);
    }
    return groups;
  });

  /** Position groups as array for iteration */
  readonly positionGroupsArray = computed(() =>
    Array.from(this.positionGroups().entries()).map(([position, count]) => ({
      position,
      count,
    }))
  );

  getInitials(player: RosterPlayer): string {
    return `${player.firstName.charAt(0)}${player.lastName.charAt(0)}`;
  }

  onSearch(event: CustomEvent): void {
    this.searchQuery = event.detail.value ?? '';
  }

  onInvite(): void {
    this.invite.emit();
    this.action.emit({ action: 'invite' });
  }

  onPlayerMenu(player: RosterPlayer, event: Event): void {
    event.stopPropagation();
    this.action.emit({ action: 'edit', playerId: player.id, player });
  }
}
