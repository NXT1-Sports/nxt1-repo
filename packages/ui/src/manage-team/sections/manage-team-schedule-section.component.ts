/**
 * @fileoverview Manage Team - Schedule Section Component
 * @module @nxt1/ui/manage-team
 * @version 1.0.0
 *
 * Schedule management section for games, practices, and events.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  calendarOutline,
  addOutline,
  locationOutline,
  timeOutline,
  footballOutline,
  trophyOutline,
  checkmarkCircle,
  closeCircle,
  removeCircle,
  ellipsisVertical,
  homeOutline,
  airplaneOutline,
} from 'ionicons/icons';
import type { ScheduleEvent, ScheduleActionEvent } from '@nxt1/core';

@Component({
  selector: 'nxt1-manage-team-schedule-section',
  standalone: true,
  imports: [CommonModule, DatePipe, IonIcon, IonRippleEffect],
  template: `
    <div class="schedule-section">
      <!-- Header -->
      <div class="schedule-header">
        <div class="schedule-info">
          <ion-icon name="calendar-outline"></ion-icon>
          <span>{{ upcomingCount() }} Upcoming Events</span>
        </div>

        <button type="button" class="add-btn" (click)="onAddEvent()">
          <ion-ripple-effect></ion-ripple-effect>
          <ion-icon name="add-outline"></ion-icon>
          <span>Add Event</span>
        </button>
      </div>

      <!-- Event Groups -->
      <div class="event-groups">
        <!-- Upcoming Games -->
        @if (upcomingGames().length > 0) {
          <div class="event-group">
            <h4 class="group-title">
              <ion-icon name="football-outline"></ion-icon>
              Upcoming Games
            </h4>

            <div class="event-list">
              @for (event of upcomingGames(); track event.id) {
                <div class="event-card" [class.event-card--home]="event.isHome">
                  <ion-ripple-effect></ion-ripple-effect>

                  <!-- Date Badge -->
                  <div class="date-badge">
                    <span class="date-month">{{ event.date | date: 'MMM' }}</span>
                    <span class="date-day">{{ event.date | date: 'd' }}</span>
                  </div>

                  <!-- Event Info -->
                  <div class="event-info">
                    <div class="event-title">
                      @if (event.isHome) {
                        <span class="home-indicator">vs</span>
                      } @else {
                        <span class="away-indicator">&#64;</span>
                      }
                      <span class="opponent">{{ event.opponent }}</span>
                    </div>
                    <div class="event-meta">
                      <span class="event-time">
                        <ion-icon name="time-outline"></ion-icon>
                        {{ event.time }}
                      </span>
                      <span class="event-location">
                        <ion-icon name="location-outline"></ion-icon>
                        {{ event.location }}
                      </span>
                    </div>
                  </div>

                  <!-- Home/Away Badge -->
                  <div class="venue-badge" [class.venue-badge--home]="event.isHome">
                    <ion-icon
                      [name]="event.isHome ? 'home-outline' : 'airplane-outline'"
                    ></ion-icon>
                    <span>{{ event.isHome ? 'Home' : 'Away' }}</span>
                  </div>

                  <!-- Menu -->
                  <button type="button" class="menu-btn" (click)="onEventMenu(event, $event)">
                    <ion-ripple-effect></ion-ripple-effect>
                    <ion-icon name="ellipsis-vertical"></ion-icon>
                  </button>
                </div>
              }
            </div>
          </div>
        }

        <!-- Recent Results -->
        @if (recentResults().length > 0) {
          <div class="event-group">
            <h4 class="group-title">
              <ion-icon name="trophy-outline"></ion-icon>
              Recent Results
            </h4>

            <div class="event-list">
              @for (event of recentResults(); track event.id) {
                <div
                  class="result-card"
                  [class.result-card--win]="event.result?.outcome === 'win'"
                  [class.result-card--loss]="event.result?.outcome === 'loss'"
                  [class.result-card--tie]="event.result?.outcome === 'tie'"
                >
                  <ion-ripple-effect></ion-ripple-effect>

                  <!-- Result Badge -->
                  <div class="result-badge" [class]="'result-' + event.result?.outcome">
                    @switch (event.result?.outcome) {
                      @case ('win') {
                        <ion-icon name="checkmark-circle"></ion-icon>
                        <span>W</span>
                      }
                      @case ('loss') {
                        <ion-icon name="close-circle"></ion-icon>
                        <span>L</span>
                      }
                      @case ('tie') {
                        <ion-icon name="remove-circle"></ion-icon>
                        <span>T</span>
                      }
                    }
                  </div>

                  <!-- Result Info -->
                  <div class="result-info">
                    <div class="result-opponent">
                      <span>{{ event.isHome ? 'vs' : '@' }} {{ event.opponent }}</span>
                    </div>
                    <div class="result-date">{{ event.date | date: 'MMM d, yyyy' }}</div>
                  </div>

                  <!-- Score -->
                  <div class="result-score">
                    <span class="team-score">{{ event.result?.teamScore }}</span>
                    <span class="score-separator">-</span>
                    <span class="opponent-score">{{ event.result?.opponentScore }}</span>
                  </div>
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Empty State -->
      @if (events().length === 0) {
        <div class="empty-state">
          <ion-icon name="calendar-outline"></ion-icon>
          <h4>No Events Scheduled</h4>
          <p>Add games, practices, and other events to your schedule</p>
          <button type="button" class="add-event-btn" (click)="onAddEvent()">
            <ion-ripple-effect></ion-ripple-effect>
            <ion-icon name="add-outline"></ion-icon>
            <span>Add Event</span>
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       SCHEDULE SECTION - 2026 Design Tokens
       ============================================ */

      :host {
        display: block;
      }

      .schedule-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
      }

      /* ============================================
         HEADER
         ============================================ */

      .schedule-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .schedule-info {
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

      .add-btn {
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
        }

        &:active {
          transform: scale(0.98);
        }
      }

      /* ============================================
         EVENT GROUPS
         ============================================ */

      .event-groups {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
      }

      .event-group {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .group-title {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0;

        ion-icon {
          font-size: 16px;
          color: var(--nxt1-color-primary);
        }
      }

      .event-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      /* ============================================
         EVENT CARD
         ============================================ */

      .event-card {
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

      .event-card--home {
        border-left: 3px solid var(--nxt1-color-primary);
      }

      .date-badge {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-radius-md);
        flex-shrink: 0;
      }

      .date-month {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 600;
        color: var(--nxt1-color-primary);
        text-transform: uppercase;
      }

      .date-day {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        line-height: 1;
      }

      .event-info {
        flex: 1;
        min-width: 0;
      }

      .event-title {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
      }

      .home-indicator,
      .away-indicator {
        font-weight: 400;
        color: var(--nxt1-color-text-tertiary);
      }

      .event-meta {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary);
        margin-top: var(--nxt1-spacing-1);

        span {
          display: flex;
          align-items: center;
          gap: var(--nxt1-spacing-1);
        }

        ion-icon {
          font-size: 14px;
        }
      }

      .venue-badge {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        background: var(--nxt1-color-surface-300);
        border-radius: var(--nxt1-radius-full);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);

        ion-icon {
          font-size: 12px;
        }
      }

      .venue-badge--home {
        background: rgba(204, 255, 0, 0.15);
        color: var(--nxt1-color-primary);
      }

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

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-surface-300);
          color: var(--nxt1-color-text-primary);
        }
      }

      /* ============================================
         RESULT CARD
         ============================================ */

      .result-card {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        overflow: hidden;
      }

      .result-card--win {
        border-left: 3px solid var(--nxt1-color-feedback-success);
      }

      .result-card--loss {
        border-left: 3px solid var(--nxt1-color-feedback-error);
      }

      .result-card--tie {
        border-left: 3px solid var(--nxt1-color-text-tertiary);
      }

      .result-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-1);
        width: 48px;
        height: 48px;
        border-radius: var(--nxt1-radius-md);
        flex-shrink: 0;

        ion-icon {
          font-size: 18px;
        }

        span {
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-lg);
          font-weight: 700;
        }
      }

      .result-win {
        background: rgba(76, 175, 80, 0.15);
        color: var(--nxt1-color-feedback-success);
      }

      .result-loss {
        background: rgba(244, 67, 54, 0.15);
        color: var(--nxt1-color-feedback-error);
      }

      .result-tie {
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-tertiary);
      }

      .result-info {
        flex: 1;
        min-width: 0;
      }

      .result-opponent {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
      }

      .result-date {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary);
      }

      .result-score {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: 700;
      }

      .team-score {
        color: var(--nxt1-color-text-primary);
      }

      .score-separator {
        color: var(--nxt1-color-text-tertiary);
      }

      .opponent-score {
        color: var(--nxt1-color-text-secondary);
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

      .add-event-btn {
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

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-primaryLight);
        }

        &:active {
          transform: scale(0.98);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageTeamScheduleSectionComponent {
  constructor() {
    addIcons({
      calendarOutline,
      addOutline,
      locationOutline,
      timeOutline,
      footballOutline,
      trophyOutline,
      checkmarkCircle,
      closeCircle,
      removeCircle,
      ellipsisVertical,
      homeOutline,
      airplaneOutline,
    });
  }

  /** Schedule events */
  readonly events = input<readonly ScheduleEvent[]>([]);

  /** Action event */
  readonly action = output<ScheduleActionEvent>();

  /** Upcoming events count */
  readonly upcomingCount = computed(
    () => this.events().filter((e) => e.status === 'scheduled' || e.status === 'confirmed').length
  );

  /** Upcoming games */
  readonly upcomingGames = computed(() =>
    this.events()
      .filter((e) => e.type === 'game' && (e.status === 'scheduled' || e.status === 'confirmed'))
      .slice(0, 5)
  );

  /** Recent results */
  readonly recentResults = computed(() =>
    this.events()
      .filter((e) => e.status === 'completed' && e.result)
      .slice(-5)
      .reverse()
  );

  onAddEvent(): void {
    this.action.emit({ action: 'add' });
  }

  onEventMenu(event: ScheduleEvent, e: Event): void {
    e.stopPropagation();
    this.action.emit({ action: 'edit', eventId: event.id, event });
  }
}
