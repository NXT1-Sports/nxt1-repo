/**
 * @fileoverview Get Analytics Summary Tool
 * @module @nxt1/backend/modules/agent/tools/database
 */

import {
  ANALYTICS_DOMAINS,
  ANALYTICS_SUBJECT_TYPES,
  ANALYTICS_SUMMARY_TIMEFRAMES,
  isAnalyticsDomain,
  isAnalyticsSubjectType,
} from '@nxt1/core/models';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import {
  AnalyticsLoggerService,
  getAnalyticsLoggerService,
} from '../../../../services/analytics-logger.service.js';

export class GetAnalyticsSummaryTool extends BaseTool {
  readonly name = 'get_analytics_summary';
  readonly description =
    'Gets a pre-aggregated analytics summary for a subject and domain, including total tracked events and counts by event type.';

  readonly parameters = {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'Primary user or athlete ID.' },
      subjectId: {
        type: 'string',
        description: 'Optional subject ID. Defaults to userId.',
      },
      subjectType: {
        type: 'string',
        enum: [...ANALYTICS_SUBJECT_TYPES],
      },
      domain: {
        type: 'string',
        enum: [...ANALYTICS_DOMAINS],
      },
      timeframe: {
        type: 'string',
        enum: [...ANALYTICS_SUMMARY_TIMEFRAMES],
        description: 'Defaults to 30d.',
      },
    },
    required: ['userId', 'domain'],
  } as const;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'database' as const;

  constructor(private readonly analytics: AnalyticsLoggerService = getAnalyticsLoggerService()) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    _context?: ToolExecutionContext
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
    const timeframe = this.str(input, 'timeframe');
    const normalizedTimeframe =
      timeframe &&
      ANALYTICS_SUMMARY_TIMEFRAMES.includes(
        timeframe as (typeof ANALYTICS_SUMMARY_TIMEFRAMES)[number]
      )
        ? (timeframe as (typeof ANALYTICS_SUMMARY_TIMEFRAMES)[number])
        : '30d';

    const summary = await this.analytics.getSummary({
      subjectId,
      subjectType,
      domain,
      timeframe: normalizedTimeframe,
    });

    return {
      success: true,
      data: summary,
    };
  }
}
