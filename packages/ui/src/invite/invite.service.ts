/**
 * @fileoverview Invite Service - Shared State Management
 * @module @nxt1/ui/invite
 * @version 1.0.0
 *
 * Signal-based state management for Invite feature.
 * Shared between web and mobile applications.
 *
 * Features:
 * - Reactive state with Angular signals
 * - Multi-channel invite support
 * - Native share integration ready
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class InvitePageComponent {
 *   private readonly invite = inject(InviteService);
 *
 *   readonly stats = this.invite.stats;
 *   async shareVia(channel: InviteChannel): Promise<void> {
 *     await this.invite.shareViaChannel(channel);
 *   }
 * }
 * ```
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import {
  type InviteStats,
  type InviteItem,
  type InviteLink,
  type InviteTeam,
  type InviteChannel,
  type InviteChannelConfig,
  type InviteType,
  type InviteRecipient,
  INVITE_CHANNELS,
  INVITE_UI_CONFIG,
} from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtPlatformService } from '../services/platform';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { InviteApiService } from './invite-api.service';

/**
 * Invite state management service.
 * Provides reactive state for the invite interface.
 */
@Injectable({ providedIn: 'root' })
export class InviteService {
  private readonly api = inject(InviteApiService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('InviteService');
  private readonly platform = inject(NxtPlatformService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _stats = signal<InviteStats | null>(null);
  private readonly _history = signal<InviteItem[]>([]);
  private readonly _inviteLink = signal<InviteLink | null>(null);
  private readonly _teams = signal<InviteTeam[]>([]);
  private readonly _selectedTeam = signal<InviteTeam | null>(null);
  private readonly _selectedRecipients = signal<InviteRecipient[]>([]);
  private readonly _customMessage = signal<string>('');
  private readonly _inviteType = signal<InviteType>('general');

  // Loading states
  private readonly _isLoading = signal(false);
  private readonly _isSending = signal(false);
  private readonly _isLoadingStats = signal(false);
  private readonly _isLoadingHistory = signal(false);

  // Error state
  private readonly _error = signal<string | null>(null);

  // Celebration state
  private readonly _showCelebration = signal(false);

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** User's invite statistics */
  readonly stats = computed(() => this._stats());

  /** Invite history */
  readonly history = computed(() => this._history());

  /** Generated invite link */
  readonly inviteLink = computed(() => this._inviteLink());

  /** Available teams for team invite */
  readonly teams = computed(() => this._teams());

  /** Selected team for team invite */
  readonly selectedTeam = computed(() => this._selectedTeam());

  /** Selected recipients */
  readonly selectedRecipients = computed(() => this._selectedRecipients());

  /** Custom message */
  readonly customMessage = computed(() => this._customMessage());

  /** Current invite type */
  readonly inviteType = computed(() => this._inviteType());

  /** Loading states */
  readonly isLoading = computed(() => this._isLoading());
  readonly isSending = computed(() => this._isSending());
  readonly isLoadingStats = computed(() => this._isLoadingStats());

  /** Error message */
  readonly error = computed(() => this._error());

  /** Celebration state */
  readonly showCelebration = computed(() => this._showCelebration());

  /** Available channels for current platform */
  readonly availableChannels = computed(() => {
    const currentPlatform: 'ios' | 'android' | 'web' = this.platform.isIOS()
      ? 'ios'
      : this.platform.isAndroid()
        ? 'android'
        : 'web';
    return INVITE_CHANNELS.filter((c: InviteChannelConfig) =>
      c.platforms.includes(currentPlatform)
    );
  });

  /** Quick share channels */
  readonly quickShareChannels = computed(() => {
    const available = this.availableChannels();
    return available.filter((c: InviteChannelConfig) =>
      INVITE_UI_CONFIG.quickShareChannels.includes(c.id)
    );
  });

  /** Social channels grid */
  readonly socialChannels = computed(() => {
    const available = this.availableChannels();
    return available.filter((c: InviteChannelConfig) =>
      INVITE_UI_CONFIG.socialChannels.includes(c.id)
    );
  });

  /** Other channels (QR, contacts, etc.) */
  readonly otherChannels = computed(() => {
    const available = this.availableChannels();
    const quickIds = INVITE_UI_CONFIG.quickShareChannels;
    const socialIds = INVITE_UI_CONFIG.socialChannels;
    return available.filter(
      (c: InviteChannelConfig) => !quickIds.includes(c.id) && !socialIds.includes(c.id)
    );
  });

  /** Streak days */
  readonly streakDays = computed(() => this._stats()?.streakDays ?? 0);

  /** Conversion rate */
  readonly conversionRate = computed(() => this._stats()?.conversionRate ?? 0);

  /** Has recipients selected */
  readonly hasRecipients = computed(() => this._selectedRecipients().length > 0);

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Initialize the invite service - load all data.
   */
  async initialize(): Promise<void> {
    this._isLoading.set(true);
    this._error.set(null);

    this.logger.debug('Initializing invite service');
    this.breadcrumb.trackStateChange('invite:initializing');
    this.analytics?.trackEvent(APP_EVENTS.INVITE_VIEWED);

    try {
      // Load all data in parallel
      await Promise.all([this.loadStats(), this.loadInviteLink(), this.loadTeams()]);

      await this.haptics.impact('light');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize';
      this._error.set(message);
      this.logger.error('Failed to initialize invite service', err);
      this.breadcrumb.trackStateChange('invite:error', { reason: message });
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Load user's invite statistics.
   */
  async loadStats(): Promise<void> {
    this._isLoadingStats.set(true);

    try {
      const stats = await this.api.getStats();
      this._stats.set(stats);
      this.logger.info('Invite stats loaded', { sent: stats.totalSent, accepted: stats.accepted });
    } catch (err) {
      this.logger.error('Failed to load invite stats', err);
    } finally {
      this._isLoadingStats.set(false);
    }
  }

  /**
   * Load invite history.
   */
  async loadHistory(): Promise<void> {
    this._isLoadingHistory.set(true);

    try {
      const response = await this.api.getHistory();
      this._history.set(response.items as InviteItem[]);
      this.logger.info('Invite history loaded', { count: response.items.length });
    } catch (err) {
      this.logger.error('Failed to load invite history', err);
    } finally {
      this._isLoadingHistory.set(false);
    }
  }

  /**
   * Generate/load invite link.
   */
  async loadInviteLink(): Promise<void> {
    try {
      const type = this._inviteType();
      const teamId = this._selectedTeam()?.id;
      const teamCode = this._selectedTeam()?.teamCode;
      const link = await this.api.generateLink(type, teamId, teamCode);
      this._inviteLink.set(link);
      this.logger.info('Invite link generated', { type, teamId: teamId ?? 'none' });
      this.analytics?.trackEvent(APP_EVENTS.INVITE_LINK_GENERATED, {
        type,
        teamId: teamId ?? 'none',
      });
    } catch (err) {
      this.logger.error('Failed to load invite link', err);
    }
  }

  /**
   * Load available teams for team invite.
   * Teams are loaded from the profile/team context — no dedicated endpoint needed here.
   */
  async loadTeams(): Promise<void> {
    // Teams are provided externally (via user's team data)
    // This method is kept for interface compatibility
    this.logger.debug('Teams loaded from external source');
  }

  /**
   * Set invite type.
   */
  setInviteType(type: InviteType): void {
    this._inviteType.set(type);
  }

  /**
   * Select a team for team invite.
   */
  selectTeam(team: InviteTeam | null): void {
    this._selectedTeam.set(team);
    if (team) {
      this._inviteType.set('team');
      this.analytics?.trackEvent(APP_EVENTS.INVITE_TEAM_SELECTED, { teamId: team.id });
    }
  }

  /**
   * Add recipient to selection.
   */
  addRecipient(recipient: InviteRecipient): void {
    const current = this._selectedRecipients();
    if (current.length >= INVITE_UI_CONFIG.maxBulkRecipients) {
      this.toast.warning(`Maximum ${INVITE_UI_CONFIG.maxBulkRecipients} recipients`);
      return;
    }
    if (!current.find((r) => r.id === recipient.id)) {
      this._selectedRecipients.set([...current, recipient]);
      this.haptics.impact('light');
      this.analytics?.trackEvent(APP_EVENTS.INVITE_RECIPIENT_ADDED, { recipientId: recipient.id });
    }
  }

  /**
   * Remove recipient from selection.
   */
  removeRecipient(recipientId: string): void {
    const current = this._selectedRecipients();
    this._selectedRecipients.set(current.filter((r) => r.id !== recipientId));
  }

  /**
   * Clear all selected recipients.
   */
  clearRecipients(): void {
    this._selectedRecipients.set([]);
  }

  /**
   * Set custom message.
   */
  setCustomMessage(message: string): void {
    if (message.length <= INVITE_UI_CONFIG.maxMessageLength) {
      this._customMessage.set(message);
    }
  }

  /**
   * Share via a specific channel.
   * Records the invite on the backend and triggers native share on mobile.
   */
  async shareViaChannel(channel: InviteChannel): Promise<void> {
    const link = this._inviteLink();
    if (!link) {
      this.toast.error('Invite link not available');
      return;
    }

    this._isSending.set(true);
    await this.haptics.impact('medium');

    this.logger.debug('Sharing via channel', { channel });
    this.breadcrumb.trackStateChange('invite:sharing', { channel });
    this.analytics?.trackEvent(APP_EVENTS.INVITE_CHANNEL_SELECTED, { channel });

    try {
      const recipients = this._selectedRecipients();
      const type = this._inviteType();
      const teamId = this._selectedTeam()?.id;
      const message = this._customMessage() || undefined;

      // Record the invite on the backend
      await this.api.sendInvite({
        type,
        channel,
        recipients: recipients.length > 0 ? recipients : [{ id: `share_${Date.now()}` }],
        teamId,
        message,
      });

      // Show celebration
      this._showCelebration.set(true);

      await this.haptics.notification('success');
      this.toast.success('Invite shared!');
      this.analytics?.trackEvent(APP_EVENTS.INVITE_SENT, {
        channel,
        type,
        recipientCount: String(recipients.length),
        teamId: teamId ?? 'none',
      });
      this.breadcrumb.trackStateChange('invite:sent', { channel, type });
      this.analytics?.trackEvent(APP_EVENTS.INVITE_CELEBRATION_SHOWN);

      // Hide celebration after animation
      setTimeout(() => {
        this._showCelebration.set(false);
      }, 2500);

      // Refresh stats
      await this.loadStats();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to share';
      this.toast.error(message);
      this.logger.error('Failed to share', err, { channel });
    } finally {
      this._isSending.set(false);
    }
  }

  /**
   * Copy invite link to clipboard.
   */
  async copyLink(): Promise<void> {
    const link = this._inviteLink();
    if (!link) return;

    if (!this.platform.isBrowser()) return;

    try {
      await navigator.clipboard.writeText(link.url);
      await this.haptics.impact('light');
      this.toast.success('Link copied!');
      this.analytics?.trackEvent(APP_EVENTS.INVITE_LINK_COPIED);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = link.url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.toast.success('Link copied!');
    }
  }

  /**
   * Dismiss celebration overlay.
   */
  dismissCelebration(): void {
    this._showCelebration.set(false);
  }

  /**
   * Reset invite form state.
   */
  reset(): void {
    this._selectedTeam.set(null);
    this._selectedRecipients.set([]);
    this._customMessage.set('');
    this._inviteType.set('general');
    this._error.set(null);
  }
}
