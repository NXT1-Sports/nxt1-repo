/**
 * @fileoverview Track Analytics Event Tool
 * @module @nxt1/backend/modules/agent/tools/database
 */

import {
  ANALYTICS_DOMAINS,
  ANALYTICS_SUBJECT_TYPES,
  getDefaultAnalyticsEventType,
  isAnalyticsDomain,
} from '@nxt1/core/models';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import {
  AnalyticsLoggerService,
  getAnalyticsLoggerService,
} from '../../../../services/core/analytics-logger.service.js';
import { z } from 'zod';

const TrackAnalyticsEventInputSchema = z.object({
  userId: z.string().trim().min(1),
  subjectId: z.string().trim().min(1).optional(),
  subjectType: z.enum(ANALYTICS_SUBJECT_TYPES).optional(),
  domain: z.string().trim().min(1),
  eventType: z.string().trim().min(1).optional(),
  value: z.union([z.number(), z.string(), z.boolean(), z.null()]).optional(),
  tags: z.array(z.string()).optional(),
  payload: z.record(z.string(), z.unknown()),
  source: z.enum(['agent', 'user', 'system']).optional(),
});

export class TrackAnalyticsEventTool extends BaseTool {
  readonly name = 'track_analytics_event';
  readonly description =
    'Tracks a structured analytics event for recruiting, NIL, performance, engagement, communication, or custom user-defined metrics. Use this whenever the user explicitly asks to track something.';

  readonly parameters = TrackAnalyticsEventInputSchema;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;

  readonly entityGroup = 'platform_tools' as const;
  constructor(private readonly analytics: AnalyticsLoggerService = getAnalyticsLoggerService()) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = TrackAnalyticsEventInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const { userId, domain, payload } = parsed.data;
    if (!isAnalyticsDomain(domain)) {
      return {
        success: false,
        error: `domain is required and must be one of: ${ANALYTICS_DOMAINS.join(', ')}.`,
      };
    }

    const subjectId = parsed.data.subjectId ?? userId;
    const subjectType = parsed.data.subjectType ?? 'user';
    const eventType = parsed.data.eventType ?? getDefaultAnalyticsEventType(domain);
    const source = parsed.data.source ?? 'agent';

    const result = await this.analytics.track({
      subjectId,
      subjectType,
      domain,
      eventType,
      source,
      actorUserId: context?.userId ?? userId,
      sessionId: context?.sessionId ?? null,
      threadId: context?.threadId ?? null,
      value: parsed.data.value,
      tags: parsed.data.tags ?? [],
      payload,
      metadata: {
        toolName: this.name,
        initiatedBy: 'agent-tool',
      },
    });

    return {
      success: true,
      data: {
        ...result,
        message: `Tracked ${result.eventType} in ${result.domain} for ${result.subjectId}.`,
      },
    };
  }
}
