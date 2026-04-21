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
import { PERFORMANCE_ADAPTER } from '../services/performance';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { ATTRIBUTE_NAMES, TRACE_NAMES } from '@nxt1/core/performance';
import { AgentXControlPanelStateService } from './agent-x-control-panel-state.service';
import { ProfileGenerationStateService } from '../profile/profile-generation-state.service';

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

/** Result returned when enqueue fails. */
export interface EnqueueFailure {
  readonly reason: 'billing' | 'server' | 'unknown';
  readonly message: string;
  readonly code?: string;
}

/** Type guard: check if result is a failure (not a success). */
export function isEnqueueFailure(
  result: { jobId: string; operationId: string; threadId?: string } | EnqueueFailure
): result is EnqueueFailure {
  return 'reason' in result;
}

/** Response shape used for background Agent X job status tracking. */
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
  private readonly performance = inject(PERFORMANCE_ADAPTER, { optional: true });
  private readonly controlPanelState = inject(AgentXControlPanelStateService);
  private readonly profileGeneration = inject(ProfileGenerationStateService);

  private readonly baseUrl = `${inject(AGENT_X_API_BASE_URL)}/agent-x`;

  /**
   * Enqueue a new Agent X background job.
   *
   * Enqueue a task via the unified /chat SSE endpoint.
   * The LLM processes the intent and may call `enqueue_heavy_task` internally
   * for heavy work, with the SSE proxy streaming results back transparently.
   *
   * @param intent - Natural language description of the task
   * @param context - Arbitrary context data for the AI agent
   * @returns Synthetic job identifiers or failure info
   */
  async enqueue(
    intent: string,
    context?: Record<string, unknown>
  ): Promise<{ jobId: string; operationId: string; threadId?: string } | EnqueueFailure> {
    this.logger.info('Enqueuing background Agent X task', { intent: intent.slice(0, 80) });
    void this.breadcrumb.trackStateChange('agent-x-job:enqueuing', {
      intent: intent.slice(0, 80),
    });

    try {
      const enqueueHttp = () =>
        firstValueFrom(
          this.http.post<{
            success: boolean;
            data?: { jobId: string; operationId: string; threadId?: string };
            error?: string;
            code?: string;
          }>(`${this.baseUrl}/enqueue`, {
            intent,
            userContext: context,
          })
        );

      const response = await (this.performance?.trace(
        TRACE_NAMES.AGENT_X_JOB_ENQUEUE,
        enqueueHttp,
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'agent_x_jobs',
            has_context: String(!!context && Object.keys(context).length > 0),
            entry_point: 'background_enqueue',
          },
          onSuccess: async (result, trace) => {
            await trace.putMetric('intent_length', intent.trim().length);
            await trace.putMetric('context_keys', Object.keys(context ?? {}).length);
            await trace.putMetric('success', result.success ? 1 : 0);
          },
        }
      ) ?? enqueueHttp());

      if (!response.success || !response.data) {
        if (response.code && response.code.toLowerCase().includes('billing')) {
          this.logger.warn('Agent X billing gate blocked job', {
            code: response.code,
            message: response.error,
          });
          void this.breadcrumb.trackStateChange('agent-x-job:billing-blocked', {
            code: response.code,
          });
          return {
            reason: 'billing',
            message: response.error || 'Payment required to use Agent X',
            code: response.code,
          };
        }

        return {
          reason: 'server',
          message: response.error || 'Failed to start action',
          code: response.code,
        };
      }

      this.logger.info('Background Agent X task enqueued', {
        operationId: response.data.operationId,
        jobId: response.data.jobId,
      });
      void this.breadcrumb.trackStateChange('agent-x-job:enqueued', {
        operationId: response.data.operationId,
      });
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_JOB_ENQUEUED, {
        source: 'background-enqueue',
        intent: intent.slice(0, 80),
      });
      this.profileGeneration.watchForProfileWrites(response.data.operationId);

      return response.data;
    } catch (err) {
      this.logger.error('Failed to dispatch Agent X task', err);
      void this.breadcrumb.trackStateChange('agent-x-job:enqueue-error');
      this.controlPanelState.reportExecutionFailure();
      return {
        reason: 'server',
        message: err instanceof Error ? err.message : 'Failed to start action',
      };
    }
  }

  /**
   * @deprecated Status polling is no longer supported. All job status is
   * streamed via the unified /chat SSE connection. Returns null.
   */
  async getStatus(_jobId: string): Promise<JobStatusResponse['data'] | null> {
    this.logger.warn('getStatus() is deprecated — use /chat SSE stream instead', { _jobId });
    return null;
  }

  // ============================================
  // HUMAN-IN-THE-LOOP (HITL) METHODS
  // ============================================

  /**
   * Approve or reject an operation that is awaiting user decision.
   *
   * @param operationId - The Firestore operation ID
   * @param decision - 'approve' or 'reject'
   * @returns Whether the decision was accepted by the backend
   */
  async approveOperation(operationId: string, decision: 'approve' | 'reject'): Promise<boolean> {
    this.logger.info('Sending approval decision', { operationId, decision });
    void this.breadcrumb.trackStateChange('agent-x-job:approve', { operationId, decision });

    try {
      const approveHttp = () =>
        firstValueFrom(
          this.http.post<{ success: boolean; error?: string }>(
            `${this.baseUrl}/operations/${encodeURIComponent(operationId)}/approve`,
            { decision }
          )
        );

      const response = await (this.performance?.trace(
        TRACE_NAMES.AGENT_X_OPERATION_APPROVE,
        approveHttp,
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'agent_x_jobs',
            decision,
          },
          onSuccess: async (result, trace) => {
            await trace.putMetric('success', result.success ? 1 : 0);
          },
        }
      ) ?? approveHttp());

      if (!response.success) {
        this.logger.warn('Approval decision rejected by backend', {
          operationId,
          error: response.error,
        });
        return false;
      }

      this.logger.info('Approval decision accepted', { operationId, decision });
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_APPROVED, {
        operationId,
        decision,
      });
      return true;
    } catch (err) {
      this.logger.error('Failed to send approval decision', err, { operationId });
      return false;
    }
  }

  /**
   * Reply to an operation that is awaiting user text input.
   *
   * @param operationId - The Firestore operation ID
   * @param userResponse - The user's text response
   * @returns Whether the reply was accepted by the backend
   */
  async replyOperation(operationId: string, userResponse: string): Promise<boolean> {
    this.logger.info('Sending user reply to operation', {
      operationId,
      responseLength: userResponse.length,
    });
    void this.breadcrumb.trackStateChange('agent-x-job:reply', { operationId });

    try {
      const replyHttp = () =>
        firstValueFrom(
          this.http.post<{ success: boolean; error?: string }>(
            `${this.baseUrl}/operations/${encodeURIComponent(operationId)}/reply`,
            { userResponse }
          )
        );

      const response = await (this.performance?.trace(
        TRACE_NAMES.AGENT_X_OPERATION_REPLY,
        replyHttp,
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'agent_x_jobs',
          },
          onSuccess: async (result, trace) => {
            await trace.putMetric('response_length', userResponse.length);
            await trace.putMetric('success', result.success ? 1 : 0);
          },
        }
      ) ?? replyHttp());

      if (!response.success) {
        this.logger.warn('Reply rejected by backend', {
          operationId,
          error: response.error,
        });
        return false;
      }

      this.logger.info('Reply accepted', { operationId });
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_REPLIED, { operationId });
      return true;
    } catch (err) {
      this.logger.error('Failed to send reply', err, { operationId });
      return false;
    }
  }

  /**
   * Retry a failed operation by re-enqueuing the same intent.
   *
   * @param operationId - The failed operation's ID (for tracking only)
   * @param intent - The original natural language intent to re-submit
   * @returns New job identifiers or null on failure
   */
  async retryOperation(
    operationId: string,
    intent: string
  ): Promise<{ jobId: string; operationId: string } | null> {
    this.logger.info('Retrying failed operation', { operationId, intent: intent.slice(0, 80) });
    void this.breadcrumb.trackStateChange('agent-x-job:retry', { operationId });

    const retryTask = () => this.enqueue(intent, { retryOf: operationId });

    const result = await (this.performance?.trace(TRACE_NAMES.AGENT_X_OPERATION_RETRY, retryTask, {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'agent_x_jobs',
      },
      onSuccess: async (retryResult, trace) => {
        await trace.putMetric('intent_length', intent.trim().length);
        await trace.putMetric('success', isEnqueueFailure(retryResult) ? 0 : 1);
      },
    }) ?? retryTask());

    if (isEnqueueFailure(result)) {
      return null;
    }

    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_RETRIED, {
      originalOperationId: operationId,
      newOperationId: result.operationId,
    });

    return result;
  }
}
