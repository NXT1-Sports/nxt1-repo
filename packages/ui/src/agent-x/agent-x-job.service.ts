/**
 * @fileoverview Agent X Background Job Service
 * @module @nxt1/ui/agent-x
 *
 * Shared Angular service for enqueuing Agent X background jobs via the
 * BullMQ-backed REST API. Fire-and-forget by default — the frontend
 * never blocks on AI processing.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Both apps provide AGENT_X_API_BASE_URL in their app.config.ts:
 * ```typescript
 * { provide: AGENT_X_API_BASE_URL, useFactory: () => environment.apiUrl }
 * ```
 *
 * @example
 * ```typescript
 * const result = await agentXJobService.enqueue(
 *   'Scrape linked accounts for new athlete profile',
 *   { linkedAccounts: [...], sport: 'Football' }
 * );
 * // result = { jobId: 'abc', operationId: 'xyz' }
 * ```
 */

import { Injectable, inject, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NxtLoggingService } from '../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { APP_EVENTS } from '@nxt1/core/analytics';

/**
 * Injection token for the Agent X API base URL.
 * Must be provided in each app's app.config.ts:
 *
 * ```typescript
 * { provide: AGENT_X_API_BASE_URL, useFactory: () => environment.apiUrl }
 * ```
 */
export const AGENT_X_API_BASE_URL = new InjectionToken<string>('AGENT_X_API_BASE_URL');

/**
 * Injection token for a factory that retrieves the current user's Firebase ID token.
 * Required for the SSE streaming path (which uses raw `fetch()` and cannot rely
 * on the Angular `authInterceptor`).
 *
 * Must be provided in each app's app.config.ts:
 *
 * ```typescript
 * import { Auth } from '@angular/fire/auth';
 * {
 *   provide: AGENT_X_AUTH_TOKEN_FACTORY,
 *   useFactory: (auth: Auth) => () => auth.currentUser?.getIdToken() ?? Promise.resolve(null),
 *   deps: [Auth],
 * }
 * ```
 */
export const AGENT_X_AUTH_TOKEN_FACTORY = new InjectionToken<() => Promise<string | null>>(
  'AGENT_X_AUTH_TOKEN_FACTORY'
);

/** Response from the /agent-x/ask endpoint. */
interface EnqueueResponse {
  readonly success: boolean;
  readonly data?: {
    readonly jobId: string;
    readonly operationId: string;
  };
  readonly error?: string;
}

/** Response from the /agent-x/status/:id endpoint. */
interface JobStatusResponse {
  readonly success: boolean;
  readonly data?: {
    readonly jobId: string;
    readonly status: string;
    readonly progress?: {
      readonly percent: number;
      readonly message: string;
    };
    readonly result?: unknown;
    readonly error?: string;
  };
  readonly error?: string;
}

@Injectable({ providedIn: 'root' })
export class AgentXJobService {
  private readonly http = inject(HttpClient);
  private readonly logger = inject(NxtLoggingService).child('AgentXJobService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  private readonly baseUrl = `${inject(AGENT_X_API_BASE_URL)}/agent-x`;

  /**
   * Enqueue a new Agent X background job.
   *
   * @param intent - Natural language description of the task
   * @param context - Arbitrary context data for the AI agent
   * @returns Job identifiers (jobId + operationId) or null on failure
   */
  async enqueue(
    intent: string,
    context?: Record<string, unknown>
  ): Promise<{ jobId: string; operationId: string } | null> {
    this.logger.info('Enqueuing Agent X job', { intent: intent.slice(0, 80) });
    void this.breadcrumb.trackStateChange('agent-x-job:enqueuing', {
      intent: intent.slice(0, 80),
    });

    try {
      const response = await firstValueFrom(
        this.http.post<EnqueueResponse>(`${this.baseUrl}/ask`, {
          intent,
          context,
        })
      );

      if (!response.success || !response.data) {
        this.logger.warn('Agent X enqueue failed', { error: response.error });
        void this.breadcrumb.trackStateChange('agent-x-job:enqueue-failed');
        return null;
      }

      this.logger.info('Agent X job enqueued', {
        jobId: response.data.jobId,
        operationId: response.data.operationId,
      });
      void this.breadcrumb.trackStateChange('agent-x-job:enqueued', {
        jobId: response.data.jobId,
      });
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_JOB_ENQUEUED, {
        source: 'background-job',
        intent: intent.slice(0, 80),
      });

      return response.data;
    } catch (err) {
      this.logger.error('Failed to enqueue Agent X job', err);
      void this.breadcrumb.trackStateChange('agent-x-job:enqueue-error');
      return null;
    }
  }

  /**
   * Poll the status of an existing job.
   *
   * @param jobId - The BullMQ job ID
   * @returns Current job status or null on failure
   */
  async getStatus(jobId: string): Promise<JobStatusResponse['data'] | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<JobStatusResponse>(`${this.baseUrl}/status/${encodeURIComponent(jobId)}`)
      );

      return response.success ? (response.data ?? null) : null;
    } catch (err) {
      this.logger.error('Failed to get job status', err, { jobId });
      return null;
    }
  }
}
