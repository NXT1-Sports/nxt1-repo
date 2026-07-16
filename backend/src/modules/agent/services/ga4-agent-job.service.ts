import { APP_EVENTS } from '@nxt1/core/analytics';
import { logger } from '../../../utils/logger.js';

export interface AgentJobTerminalAnalyticsInput {
  readonly operationId: string;
  readonly status: 'completed' | 'failed';
  readonly userId?: string | null;
  readonly origin?: string | null;
  readonly threadId?: string | null;
  readonly intent?: string | null;
  readonly autoResolveType?: string | null;
  readonly autoResolveStatus?: string | null;
  readonly summary?: string | null;
  readonly error?: string | null;
}

const GA4_MEASUREMENT_ID = process.env['GA4_MEASUREMENT_ID'];
const GA4_API_SECRET = process.env['GA4_API_SECRET'];

let missingConfigLogged = false;

function truncateValue(value: string | null | undefined, maxLength = 100): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, maxLength);
}

export async function trackAgentJobTerminalEvent(
  input: AgentJobTerminalAnalyticsInput
): Promise<void> {
  if (!GA4_MEASUREMENT_ID || !GA4_API_SECRET) {
    if (!missingConfigLogged) {
      missingConfigLogged = true;
      logger.info(
        '[ga4-agent-job] Skipping agent job terminal event because GA4 is not configured'
      );
    }
    return;
  }

  const eventName =
    input.status === 'completed' ? APP_EVENTS.AGENT_X_JOB_COMPLETED : APP_EVENTS.AGENT_X_JOB_FAILED;

  const params: Record<string, string | number | boolean> = {
    operation_id: input.operationId,
    job_status: input.status,
    event_id: `${input.operationId}:${input.status}`,
    engagement_time_msec: 1,
  };

  const origin = truncateValue(input.origin, 40);
  const threadId = truncateValue(input.threadId, 100);
  const intent = truncateValue(input.intent, 100);
  const autoResolveType = truncateValue(input.autoResolveType, 40);
  const autoResolveStatus = truncateValue(input.autoResolveStatus, 40);
  const summary = truncateValue(input.summary, 100);
  const errorMessage = truncateValue(input.error, 100);

  if (origin) params['origin'] = origin;
  if (threadId) params['thread_id'] = threadId;
  if (intent) params['intent'] = intent;
  if (autoResolveType) params['auto_resolve_type'] = autoResolveType;
  if (autoResolveStatus) params['auto_resolve_status'] = autoResolveStatus;
  if (summary) params['summary'] = summary;
  if (errorMessage) params['error_message'] = errorMessage;

  const endpoint = new URL('https://www.google-analytics.com/mp/collect');
  endpoint.searchParams.set('measurement_id', GA4_MEASUREMENT_ID);
  endpoint.searchParams.set('api_secret', GA4_API_SECRET);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        client_id: input.userId ? `nxt1:${input.userId}` : `agent-job:${input.operationId}`,
        ...(input.userId ? { user_id: input.userId } : {}),
        events: [
          {
            name: eventName,
            params,
          },
        ],
      }),
    });

    if (!response.ok) {
      logger.warn('[ga4-agent-job] GA4 rejected terminal event', {
        operationId: input.operationId,
        status: input.status,
        httpStatus: response.status,
      });
    }
  } catch (error) {
    logger.warn('[ga4-agent-job] Failed to send terminal event', {
      operationId: input.operationId,
      status: input.status,
      error,
    });
  }
}
