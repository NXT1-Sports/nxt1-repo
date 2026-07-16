/**
 * @fileoverview Playbooks State Service (Signal-based)
 * @module nxt1-ui/playbook
 *
 * Signal-based service for managing playbook state, plays, and game plans.
 * Handles all data fetching, creation, updating, and deletion of plays and game plans.
 * Implements full observability with logging, analytics, breadcrumbs, and performance tracing.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {} from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TRACE_NAMES } from '@nxt1/core/performance';
import type { AnalyticsAdapter } from '@nxt1/core/analytics';
import type { PerformanceAdapter } from '@nxt1/core/performance';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { PERFORMANCE_ADAPTER } from '../../services/performance';
import { AGENT_X_API_BASE_URL } from '../../agent-x/services/agent-x-job.service';

/**
 * Playbook data structure (extended view model)
 */
export interface PlaybookViewModel {
  readonly id: string;
  readonly teamId: string;
  readonly sport: string;
  readonly name: string;
  readonly plays: readonly unknown[];
  readonly playCount: number;
}

interface PlaybooksListResponse {
  readonly success: boolean;
  readonly data?: {
    readonly playbooks: readonly PlaybookViewModel[];
    readonly count: number;
  };
  readonly error?: string;
}

/**
 * Signal-based service for managing playbooks, plays, and game plans.
 * Provides reactive state management with full observability instrumentation.
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class PlaybooksComponent {
 *   private readonly playbooksService = inject(PlaybooksService);
 *
 *   protected readonly playbooks = this.playbooksService.playbooks;
 *   protected readonly loading = this.playbooksService.loading;
 *   protected readonly error = this.playbooksService.error;
 *
 *   async loadPlaybooks(teamId: string): Promise<void> {
 *     await this.playbooksService.loadPlaybooks(teamId);
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class PlaybooksService {
  private readonly http = inject(HttpClient);
  private readonly logger = inject(NxtLoggingService).child('PlaybooksService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, {
    optional: true,
  }) as AnalyticsAdapter | null;
  private readonly breadcrumb = inject(NxtBreadcrumbService) as NxtBreadcrumbService;
  private readonly performance = inject(PERFORMANCE_ADAPTER, {
    optional: true,
  }) as PerformanceAdapter | null;
  private readonly agentXBaseUrl = `${inject(AGENT_X_API_BASE_URL)}/agent-x`;

  // ============================================
  // Private Writeable Signals
  // ============================================

  private readonly _playbooks = signal<PlaybookViewModel[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  // ============================================
  // Public Computed Signals (Read-Only)
  // ============================================

  /** List of playbooks */
  readonly playbooks = computed(() => this._playbooks());

  /** Loading state */
  readonly loading = computed(() => this._loading());

  /** Error message */
  readonly error = computed(() => this._error());

  /** Whether playbooks list is empty */
  readonly isPlaybooksEmpty = computed(() => this._playbooks().length === 0);

  /** Count of playbooks */
  readonly playbookCount = computed(() => this._playbooks().length);

  /**
   * Load playbooks for a team
   * @param teamId Team ID to load playbooks for
   * @throws Error if loading fails
   */
  async loadPlaybooks(teamId: string, sport?: string): Promise<void> {
    this._loading.set(true);
    this._error.set(null);

    const normalizedSport = sport?.trim().toLowerCase();

    this.logger.info('Loading playbooks', { teamId, sport: normalizedSport });
    void this.breadcrumb.trackStateChange('playbooks loading', {
      teamId,
      sport: normalizedSport ?? null,
    });

    try {
      const response =
        (await this.performance?.trace(
          TRACE_NAMES.PLAYBOOK_LIST,
          () => this.loadPlaybooksImpl(teamId, normalizedSport),
          {
            attributes: { team_id: teamId, sport: normalizedSport ?? 'all' },
            onSuccess: async () => {
              // Metrics tracked via analytics
            },
          }
        )) ?? (await this.loadPlaybooksImpl(teamId, normalizedSport));

      this._playbooks.set(response);
      this.logger.info('Playbooks loaded', {
        teamId,
        sport: normalizedSport,
        count: response.length,
      });

      void this.breadcrumb.trackStateChange('playbooks loaded', {
        teamId,
        sport: normalizedSport ?? null,
        count: response.length,
      });

      this.analytics?.trackEvent(APP_EVENTS.PLAYBOOK_LIST_LOADED, {
        team_id: teamId,
        sport: normalizedSport ?? null,
        playbook_count: response.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load playbooks';
      this.logger.error('Failed to load playbooks', err, { teamId, sport: normalizedSport });
      this._error.set(message);

      void this.breadcrumb.trackStateChange('playbooks error', {
        teamId,
        sport: normalizedSport ?? null,
        error: message,
      });

      this.analytics?.trackEvent(APP_EVENTS.ERROR_OCCURRED, {
        feature: 'playbooks_load',
        error_message: message,
        team_id: teamId,
        sport: normalizedSport ?? null,
      });

      throw err;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Internal implementation: load playbooks
   */
  private async loadPlaybooksImpl(teamId: string, sport?: string): Promise<PlaybookViewModel[]> {
    const params: Record<string, string> = { teamId, limit: '16' };
    if (sport) params['sport'] = sport;

    const response = await firstValueFrom(
      this.http.get<PlaybooksListResponse>(`${this.agentXBaseUrl}/playbooks`, {
        params,
      })
    );

    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Failed to load playbooks');
    }

    return [...(response.data.playbooks ?? [])];
  }
}
