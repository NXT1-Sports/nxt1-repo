/**
 * @fileoverview Get Analytics Summary Tool
 * @module @nxt1/backend/modules/agent/tools/database
 */

import {
  ANALYTICS_DOMAINS,
  ANALYTICS_SUMMARY_TIMEFRAMES,
  isAnalyticsDomain,
  isAnalyticsSubjectType,
} from '@nxt1/core/models';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import {
  AnalyticsLoggerService,
  getAnalyticsLoggerService,
} from '../../../../services/core/analytics-logger.service.js';
import { z } from 'zod';

const GetAnalyticsSummaryInputSchema = z.object({
  userId: z.string().trim().min(1),
  subjectId: z.string().trim().min(1).optional(),
  subjectType: z.string().trim().min(1).optional(),
  domain: z.string().trim().min(1),
  timeframe: z.string().trim().min(1).optional(),
  templateKey: z.string().trim().min(1).optional(),
  templateBaseDomain: z
    .enum(['recruiting', 'nil', 'performance', 'engagement', 'communication'])
    .optional(),
});

export class GetAnalyticsSummaryTool extends BaseTool {
  readonly name = 'get_analytics_summary';
  readonly description =
    'Gets an analytics summary for a subject and domain, including total tracked events, counts by event type, and custom-template breakdowns for custom-domain queries.';

  readonly parameters = GetAnalyticsSummaryInputSchema;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'database' as const;

  readonly entityGroup = 'platform_tools' as const;
  constructor(private readonly analytics: AnalyticsLoggerService = getAnalyticsLoggerService()) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = GetAnalyticsSummaryInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { userId, domain } = parsed.data;
    if (!domain || !isAnalyticsDomain(domain)) {
      return {
        success: false,
        error: `domain is required and must be one of: ${ANALYTICS_DOMAINS.join(', ')}.`,
      };
    }

    const subjectId = parsed.data.subjectId ?? userId;
    const rawSubjectType = parsed.data.subjectType;
    const subjectType =
      rawSubjectType && isAnalyticsSubjectType(rawSubjectType) ? rawSubjectType : 'user';
    const timeframe = parsed.data.timeframe;
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
      templateKey: parsed.data.templateKey,
      templateBaseDomain: parsed.data.templateBaseDomain,
    });

    return {
      success: true,
      data: summary,
    };
  }
}
