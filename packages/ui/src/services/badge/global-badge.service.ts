/**
 * @fileoverview Global Badge Service - Centralized Badge State Management
 * @module @nxt1/ui/services/badge
 * @version 1.0.0
 *
 * Professional 2026 pattern for managing notification badges across the app.
 * Used by Twitter/X, Instagram, Discord - single source of truth for all badge counts.
 *
 * Architecture:
 * - Feature services (ActivityService, MessagesService) UPDATE badges
 * - UI components (Footer, Header) READ badges
 * - Signals ensure reactive updates without manual subscriptions
 * - Computed signals auto-derive "has unread" states
 *
 * Why this pattern?
 * - Decoupled: Features don't know about UI, UI doesn't know about features
 * - Testable: Easy to mock badge counts in tests
 * - Scalable: Add new badge types (messages, mentions) without changing UI
 * - SSR-Safe: Pure signals, no browser APIs
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```typescript
 * // In ActivityService - UPDATE badges
 * class ActivityService {
 *   private readonly badgeService = inject(GlobalBadgeService);
 *
 *   async loadFeed(): Promise<void> {
 *     const items = await this.api.getFeed();
 *     const unread = items.filter(i => !i.isRead).length;
 *     this.badgeService.setActivityBadge(unread);
 *   }
 * }
 *
 * // In MobileShellComponent - READ badges
 * class MobileShellComponent {
 *   private readonly badgeService = inject(GlobalBadgeService);
 *
 *   // Computed tabs with badges auto-update
 *   readonly tabs = this.badgeService.footerTabsWithBadges;
 * }
 *
 * // In any component - check for unread
 * readonly hasUnread = this.badgeService.hasAnyUnread;
 * ```
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import { DEFAULT_FOOTER_TABS, type FooterTabItem, updateTabBadge } from '@nxt1/core';
import { NxtLoggingService } from '../logging';

/**
 * Badge type identifiers.
 * Add new types here as features are added.
 */
export type BadgeType = 'activity' | 'messages' | 'notifications' | 'mentions' | 'deals';

// Badge to tab mapping - reserved for future footer badge integration
// const BADGE_TO_TAB_MAP: Record<BadgeType, string> = {
//   activity: 'activity',
//   messages: 'messages',
//   notifications: 'activity',
//   mentions: 'activity',
//   deals: 'activity',
// };

/**
 * Global Badge Service
 *
 * Centralized state management for all notification badges in the app.
 * Feature services update badges, UI components read them.
 *
 * Pattern:
 * - Private writeable signals for each badge type
 * - Public computed signals for reading
 * - Methods for updating badges
 * - Computed footer tabs with badges merged
 */
@Injectable({ providedIn: 'root' })
export class GlobalBadgeService {
  private readonly logger = inject(NxtLoggingService).child('GlobalBadge');

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  /** Activity/notifications unread count */
  private readonly _activityBadge = signal(0);

  /** Messages unread count */
  private readonly _messagesBadge = signal(0);

  /** Custom tab badges (for future expansion) */
  private readonly _customBadges = signal<Record<string, number>>({});

  /** Base footer tabs configuration */
  private readonly _baseTabs = signal<FooterTabItem[]>(DEFAULT_FOOTER_TABS);

  // ============================================
  // PUBLIC COMPUTED SIGNALS (READ-ONLY)
  // ============================================

  /** Activity badge count */
  readonly activityBadge = computed(() => this._activityBadge());

  /** Messages badge count */
  readonly messagesBadge = computed(() => this._messagesBadge());

  /** Total unread across all badge types */
  readonly totalUnread = computed(() => {
    return this._activityBadge() + this._messagesBadge();
  });

  /** Whether there are any unread items anywhere */
  readonly hasAnyUnread = computed(() => this.totalUnread() > 0);

  /** Whether activity tab has unread items (for showing dot) */
  readonly hasActivityUnread = computed(() => this._activityBadge() > 0);

  /** Whether messages tab has unread items */
  readonly hasMessagesUnread = computed(() => this._messagesBadge() > 0);

  /**
   * Footer tabs with current badge counts merged.
   * Use this in MobileShellComponent instead of raw DEFAULT_FOOTER_TABS.
   *
   * @example
   * ```typescript
   * class MobileShellComponent {
   *   readonly tabs = this.badgeService.footerTabsWithBadges;
   * }
   * ```
   */
  readonly footerTabsWithBadges = computed<FooterTabItem[]>(() => {
    let tabs = [...this._baseTabs()];

    // Apply activity badge
    const activityCount = this._activityBadge();
    if (activityCount > 0) {
      tabs = updateTabBadge(tabs, 'activity', activityCount);
    }

    // Apply messages badge
    const messagesCount = this._messagesBadge();
    if (messagesCount > 0) {
      tabs = updateTabBadge(tabs, 'messages', messagesCount);
    }

    // Apply any custom badges
    const customs = this._customBadges();
    for (const [tabId, count] of Object.entries(customs)) {
      if (count > 0) {
        tabs = updateTabBadge(tabs, tabId, count);
      }
    }

    return tabs;
  });

  // ============================================
  // PUBLIC METHODS - Badge Updates
  // ============================================

  /**
   * Set the activity/notifications badge count.
   * Called by ActivityService when feed loads or items are read.
   *
   * @param count - Number of unread items (0 to clear)
   */
  setActivityBadge(count: number): void {
    const clamped = Math.max(0, Math.round(count));
    const previous = this._activityBadge();

    if (clamped !== previous) {
      this._activityBadge.set(clamped);
      this.logger.debug('Activity badge updated', { previous, current: clamped });
    }
  }

  /**
   * Increment the activity badge (for real-time notifications).
   *
   * @param amount - Amount to increment by (default 1)
   */
  incrementActivityBadge(amount = 1): void {
    this._activityBadge.update((current) => current + amount);
    this.logger.debug('Activity badge incremented', {
      amount,
      total: this._activityBadge(),
    });
  }

  /**
   * Clear the activity badge (mark all as read).
   */
  clearActivityBadge(): void {
    if (this._activityBadge() > 0) {
      this._activityBadge.set(0);
      this.logger.debug('Activity badge cleared');
    }
  }

  /**
   * Set the messages badge count.
   * Called by MessagesService when messages load or are read.
   *
   * @param count - Number of unread messages (0 to clear)
   */
  setMessagesBadge(count: number): void {
    const clamped = Math.max(0, Math.round(count));
    const previous = this._messagesBadge();

    if (clamped !== previous) {
      this._messagesBadge.set(clamped);
      this.logger.debug('Messages badge updated', { previous, current: clamped });
    }
  }

  /**
   * Clear the messages badge.
   */
  clearMessagesBadge(): void {
    if (this._messagesBadge() > 0) {
      this._messagesBadge.set(0);
      this.logger.debug('Messages badge cleared');
    }
  }

  /**
   * Set a custom badge for any tab.
   * Use for future features like "deals" or "offers".
   *
   * @param tabId - Footer tab ID
   * @param count - Badge count (0 to clear)
   */
  setCustomBadge(tabId: string, count: number): void {
    const clamped = Math.max(0, Math.round(count));
    this._customBadges.update((badges) => ({
      ...badges,
      [tabId]: clamped,
    }));
    this.logger.debug('Custom badge updated', { tabId, count: clamped });
  }

  /**
   * Clear all badges (e.g., on logout).
   */
  clearAllBadges(): void {
    this._activityBadge.set(0);
    this._messagesBadge.set(0);
    this._customBadges.set({});
    this.logger.debug('All badges cleared');
  }

  /**
   * Get badge count for a specific tab.
   *
   * @param tabId - Footer tab ID
   * @returns Badge count or 0
   */
  getBadgeForTab(tabId: string): number {
    if (tabId === 'activity') return this._activityBadge();
    if (tabId === 'messages') return this._messagesBadge();
    return this._customBadges()[tabId] ?? 0;
  }

  // ============================================
  // CONFIGURATION
  // ============================================

  /**
   * Update the base footer tabs configuration.
   * Useful for role-based tab customization.
   *
   * @param tabs - New base tabs configuration
   */
  setBaseTabs(tabs: FooterTabItem[]): void {
    this._baseTabs.set(tabs);
  }
}
