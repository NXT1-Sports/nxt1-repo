/**
 * @fileoverview Track Analytics Event Tool
 * @module @nxt1/backend/modules/agent/tools/database
 */

import {
  ANALYTICS_DOMAINS,
  ANALYTICS_SUBJECT_TYPES,
  getDefaultAnalyticsEventType,
  isAnalyticsDomain,
  isAnalyticsSubjectType,
} from '@nxt1/core/models';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import {
  AnalyticsLoggerService,
  getAnalyticsLoggerService,
} from '../../../../services/analytics-logger.service.js';

export class TrackAnalyticsEventTool extends BaseTool {
  readonly name = 'track_analytics_event';
  readonly description =
    'Tracks a structured analytics event for recruiting, NIL, performance, engagement, communication, or custom user-defined metrics. Use this whenever the user explicitly asks to track something.';

  readonly parameters = {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'Primary user or athlete ID.' },
      subjectId: {
        type: 'string',
        description: 'Optional analytics subject ID. Defaults to userId when omitted.',
      },
      subjectType: {
        type: 'string',
        enum: [...ANALYTICS_SUBJECT_TYPES],
        description: 'Defaults to user.',
      },
      domain: {
        type: 'string',
        enum: [...ANALYTICS_DOMAINS],
        description: 'Analytics domain such as recruiting, nil, or performance.',
      },
      eventType: {
        type: 'string',
        description: 'Optional ontology event type. Defaults intelligently by domain.',
      },
      value: {
        type: ['number', 'string', 'boolean', 'null'],
        description: 'Optional primary value for the event, such as 500 or 4.52.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags for filtering and grouping.',
      },
      payload: {
        type: 'object',
        description: 'Flexible structured event payload.',
      },
      source: {
        type: 'string',
        enum: ['agent', 'user', 'system'],
      },
    },
    required: ['userId', 'domain', 'payload'],
  } as const;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;

  constructor(private readonly analytics: AnalyticsLoggerService = getAnalyticsLoggerService()) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const userId = this.str(input, 'userId');
    if (!userId) return this.paramError('userId');

    const domain = this.str(input, 'domain');
    if (!domain || !isAnalyticsDomain(domain)) {
      return {
        success: false,
        error: `domain is required and must be one of: ${ANALYTICS_DOMAINS.join(', ')}.`,
      };
    }

    const subjectId = this.str(input, 'subjectId') ?? userId;
    const rawSubjectType = this.str(input, 'subjectType');
    const subjectType =
      rawSubjectType && isAnalyticsSubjectType(rawSubjectType) ? rawSubjectType : 'user';
    const eventType = this.str(input, 'eventType') ?? getDefaultAnalyticsEventType(domain);
    const payload = this.obj(input, 'payload') ?? {};

    const rawSource = this.str(input, 'source');
    const source = rawSource === 'system' || rawSource === 'user' ? rawSource : 'agent';

    const result = await this.analytics.track({
      subjectId,
      subjectType,
      domain,
      eventType,
      source,
      actorUserId: context?.userId ?? userId,
      sessionId: context?.sessionId ?? null,
      threadId: context?.threadId ?? null,
      value:
        typeof input['value'] === 'number' ||
        typeof input['value'] === 'string' ||
        typeof input['value'] === 'boolean' ||
        input['value'] === null
          ? (input['value'] as number | string | boolean | null)
          : undefined,
      tags: Array.isArray(input['tags'])
        ? input['tags'].filter((tag): tag is string => typeof tag === 'string')
        : [],
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
