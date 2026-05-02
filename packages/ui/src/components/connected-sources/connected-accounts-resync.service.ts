import { Injectable, inject } from '@angular/core';
import { APP_EVENTS, type AnalyticsAdapter } from '@nxt1/core/analytics';
import { HapticsService } from '../../services/haptics/haptics.service';
import { NxtToastService } from '../../services/toast/toast.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { AgentXJobService, isEnqueueFailure } from '../../agent-x/services/agent-x-job.service';

export interface ConnectedAccountsResyncSource {
  readonly platform: string;
  readonly label?: string;
  readonly username?: string;
  readonly url?: string;
  readonly connected?: boolean;
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

  async request(accounts: readonly ConnectedAccountsResyncSource[] = []): Promise<boolean> {
    const requestedAccounts = accounts
      .filter((account) => account.connected || !!account.username || !!account.url)
      .map((account) => ({
        platform: account.platform,
        label: account.label ?? account.platform,
        username: account.username,
        url: account.url,
      }));

    const platformSummary = requestedAccounts.map((account) => account.label).join(', ');
    const intent =
      requestedAccounts.length > 0
        ? `Re-sync my connected accounts right now. Refresh these linked accounts: ${platformSummary}. Pull in the latest public updates and update my NXT1 profile with any changed data.`
        : 'Re-sync all of my connected accounts right now. Review the accounts linked on my NXT1 profile, pull in the latest public updates, and refresh my profile with any changed data.';

    this.logger.info('Requesting connected accounts re-sync', {
      requestedAccountCount: requestedAccounts.length,
      platforms: requestedAccounts.map((account) => account.platform),
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
