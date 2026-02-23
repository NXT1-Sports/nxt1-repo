/**
 * @fileoverview Badge Count Service - Lightweight Shell Badge State
 * @module @nxt1/web/core/services
 * @version 1.0.0
 *
 * Minimal, zero-dependency service that holds badge counts for the app shell.
 * Exists so that WebShellComponent does NOT need to import ActivityService
 * (or any feature service) from @nxt1/ui — avoiding the barrel-bomb import
 * that pulls the entire @nxt1/ui package into the shell's eager chunk.
 *
 * Architecture (Twitter / Discord pattern):
 * ┌─────────────────────────────────────────────────┐
 * │  BadgeCountService (core, always loaded)        │
 * │  ─ activityBadge signal                         │
 * │  ─ messagesBadge signal                         │
 * │  ─ totalUnread computed                         │
 * ├─────────────────────────────────────────────────┤
 * │  WebShellComponent READS badge counts           │
 * │  (no dependency on any feature service)         │
 * ├─────────────────────────────────────────────────┤
 * │  Feature services WRITE badge counts lazily:    │
 * │  ─ ActivityService → setActivityBadge()         │
 * │  ─ MessagesService → setMessagesBadge()         │
 * └─────────────────────────────────────────────────┘
 *
 * Why not use GlobalBadgeService from @nxt1/ui?
 * ─ Importing anything from @nxt1/ui triggers the single-barrel FESM
 *   which forces the entire package (500+ components) into one chunk.
 *   This lightweight local service avoids that import entirely.
 *   Once @nxt1/ui is split into secondary entry points, this service
 *   can be replaced by @nxt1/ui/services/badge.
 *
 * @example
 * ```typescript
 * // In WebShellComponent (shell reads):
 * private readonly badges = inject(BadgeCountService);
 * readonly notificationCount = this.badges.totalUnread;
 *
 * // In ActivityService (feature writes):
 * private readonly badges = inject(BadgeCountService);
 * this.badges.setActivityBadge(unreadCount);
 * ```
 */

import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class BadgeCountService {
  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _activityBadge = signal(0);
  private readonly _messagesBadge = signal(0);

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Activity/notification unread count */
  readonly activityBadge = computed(() => this._activityBadge());

  /** Messages unread count */
  readonly messagesBadge = computed(() => this._messagesBadge());

  /** Total unread across all badge types */
  readonly totalUnread = computed(() => this._activityBadge() + this._messagesBadge());

  /** Whether there are any unread items */
  readonly hasAnyUnread = computed(() => this.totalUnread() > 0);

  // ============================================
  // PUBLIC METHODS — Called by feature services
  // ============================================

  /**
   * Set the activity/notification badge count.
   * Called by ActivityService when feed loads or items are marked read.
   */
  setActivityBadge(count: number): void {
    this._activityBadge.set(Math.max(0, Math.round(count)));
  }

  /** Increment activity badge (e.g. real-time push notification) */
  incrementActivityBadge(amount = 1): void {
    this._activityBadge.update((c) => c + Math.max(0, amount));
  }

  /** Clear the activity badge */
  clearActivityBadge(): void {
    this._activityBadge.set(0);
  }

  /**
   * Set the messages badge count.
   * Called by MessagesService when messages load or are read.
   */
  setMessagesBadge(count: number): void {
    this._messagesBadge.set(Math.max(0, Math.round(count)));
  }

  /** Clear the messages badge */
  clearMessagesBadge(): void {
    this._messagesBadge.set(0);
  }

  /** Clear all badges (e.g. on sign-out) */
  clearAll(): void {
    this._activityBadge.set(0);
    this._messagesBadge.set(0);
  }
}
