import { Injectable, inject } from '@angular/core';
import { APP_EVENTS, type AnalyticsAdapter } from '@nxt1/core/analytics';
import { HapticsService } from '../../services/haptics/haptics.service';
import { NxtToastService } from '../../services/toast/toast.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { AgentXJobService, isEnqueueFailure } from '../../agent-x/services/agent-x-job.service';
import { ProfileGenerationStateService } from '../../profile/profile-generation-state.service';

export interface ConnectedAccountsResyncSource {
  readonly platform: string;
  readonly label?: string;
  readonly username?: string;
  readonly url?: string;
  readonly connected?: boolean;
  readonly scopeType?: 'global' | 'sport' | 'team';
  readonly scopeId?: string;
  /** 'link' = pasted URL/username, 'signin' = OAuth. Sign-in accounts are excluded from the resync prompt. */
  readonly connectionType?: string;
}

const INTERNAL_CONNECTED_ACCOUNT_PLATFORMS = new Set(['nxt1']);

export interface ConnectedAccountsResyncRequest {
  readonly requestedAccounts: readonly {
    readonly platform: string;
    readonly label: string;
    readonly username?: string;
    readonly url?: string;
    readonly scopeType?: 'global' | 'sport' | 'team';
    readonly scopeId?: string;
  }[];
  readonly platformSummary: string;
  readonly intent: string;
}

export function buildConnectedAccountsResyncRequest(
  accounts: readonly ConnectedAccountsResyncSource[] = []
): ConnectedAccountsResyncRequest {
  const requestedAccounts = accounts
    .filter((account) => account.connected || !!account.username || !!account.url)
    // Exclude OAuth sign-in accounts — only URL/username-linked accounts are mentioned in the prompt.
    .filter((account) => account.connectionType !== 'signin')
    .map((account) => ({
      platform: account.platform.trim(),
      label: (account.label ?? account.platform).trim(),
      username: account.username,
      url: account.url,
      scopeType: account.scopeType,
      scopeId: account.scopeId,
    }))
    .filter((account) => account.platform.length > 0)
    .filter((account) => !INTERNAL_CONNECTED_ACCOUNT_PLATFORMS.has(account.platform.toLowerCase()));

  const platformSummary = requestedAccounts.map((account) => account.label).join(', ');
  const intent =
    requestedAccounts.length > 0
      ? `Re-sync my connected accounts right now. Refresh these linked accounts: ${platformSummary}. Pull in the latest public updates and update my NXT1 profile with any changed data.`
      : 'Re-sync all of my external connected accounts right now. Review the externally linked accounts saved on my NXT1 profile, pull in the latest public updates, and refresh my profile with any changed data.';

  return {
    requestedAccounts,
    platformSummary,
    intent,
  };
}

@Injectable({ providedIn: 'root' })
export class ConnectedAccountsResyncService {
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ConnectedAccountsResyncService');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly analytics: AnalyticsAdapter | null =
    inject(ANALYTICS_ADAPTER, { optional: true }) ?? null;
  private readonly agentXJobService = inject(AgentXJobService);
  private readonly profileGeneration = inject(ProfileGenerationStateService);

  async request(
    accounts: readonly ConnectedAccountsResyncSource[] = [],
    teamIdOverride?: string
  ): Promise<boolean> {
    const { requestedAccounts, platformSummary, intent } =
      buildConnectedAccountsResyncRequest(accounts);

    this.logger.info('Requesting connected accounts re-sync', {
      requestedAccountCount: requestedAccounts.length,
      platforms: requestedAccounts.map((account) => account.platform),
      teamIdOverride,
    });
    this.breadcrumb.trackUserAction('connected-accounts:resync-requested');
    this.analytics?.trackEvent(APP_EVENTS.PROFILE_EDITED, {
      source: 'connected-accounts',
      action: 'resync-requested',
      requestedAccountCount: requestedAccounts.length,
    });

    try {
      const job = await this.agentXJobService.enqueue(intent, {
        source: 'connected_accounts',
        trigger: 'manual_resync',
        requestedAt: new Date().toISOString(),
        requestedAccounts,
        ...(teamIdOverride ? { teamIdOverride } : {}),
      });

      if (isEnqueueFailure(job)) {
        this.toast.error(
          job.reason === 'billing'
            ? job.message
            : 'Unable to start re-sync right now. Please try again.'
        );
        this.logger.warn('Connected accounts re-sync enqueue failed', { reason: job.reason });
        return false;
      }

      await this.haptics.notification('success');
      this.toast.success('Re-sync started. Agent X is refreshing your connected accounts.');
      this.logger.info('Connected accounts re-sync enqueued', {
        jobId: job.jobId,
        operationId: job.operationId,
      });

      // Start the profile generation banner immediately for account re-sync jobs.
      // This keeps /profile UX consistent even when backend tool-step labels evolve.
      this.profileGeneration.attachToOperation(job.operationId, job.threadId, platformSummary);

      return true;
    } catch (err) {
      this.toast.error('Unable to start re-sync right now. Please try again.');
      this.logger.error('Failed to request connected accounts re-sync', err, {
        requestedAccountCount: requestedAccounts.length,
      });
      return false;
    }
  }
}
