/**
 * @fileoverview Get Analytics Summary Tool
 * @module @nxt1/backend/modules/agent/tools/database
 */

import {
  ANALYTICS_DOMAINS,
  ANALYTICS_SUMMARY_TIMEFRAMES,
  isAnalyticsDomain,
  isAnalyticsSubjectType,
  type AnalyticsDomain,
  type AnalyticsSubjectType,
  type AnalyticsSummaryTimeframe,
} from '@nxt1/core/models';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import {
  AnalyticsLoggerService,
  getAnalyticsLoggerService,
} from '../../../../services/core/analytics-logger.service.js';
import { AnalyticsEventModel } from '../../../../models/analytics/analytics-event.model.js';
import { AnalyticsRollupModel } from '../../../../models/analytics/analytics-rollup.model.js';
import {
  getRuntimeEnvironment,
  type RuntimeEnvironment,
} from '../../../../config/runtime-environment.js';
import { db } from '../../../../utils/firebase.js';
import { stagingDb } from '../../../../utils/firebase-staging.js';
import { z } from 'zod';

type SubjectTypeResolutionSource =
  | 'explicit'
  | 'analytics_rollup'
  | 'analytics_event'
  | 'firestore_entity'
  | 'user_id_fallback'
  | 'default_user';

function getPeriodStart(timeframe: AnalyticsSummaryTimeframe): Date | null {
  const now = Date.now();

  switch (timeframe) {
    case '24h':
      return new Date(now - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now - 90 * 24 * 60 * 60 * 1000);
    case 'all':
    default:
      return null;
  }
}

async function resolveSubjectTypeFromRollups(
  environment: RuntimeEnvironment,
  subjectId: string,
  domain: AnalyticsDomain,
  timeframe: AnalyticsSummaryTimeframe
): Promise<AnalyticsSubjectType | null> {
  const rollups = await AnalyticsRollupModel.find({
    environment,
    subjectId,
    domain,
    timeframe,
    totalCount: { $gt: 0 },
  }).lean();

  const subjectTypes = rollups
    .map((row) => row.subjectType)
    .filter((value): value is AnalyticsSubjectType => isAnalyticsSubjectType(value));
  const uniqueSubjectTypes = [...new Set(subjectTypes)];

  return uniqueSubjectTypes.length === 1 ? uniqueSubjectTypes[0] : null;
}

async function resolveSubjectTypeFromEvents(
  environment: RuntimeEnvironment,
  subjectId: string,
  domain: AnalyticsDomain,
  timeframe: AnalyticsSummaryTimeframe
): Promise<AnalyticsSubjectType | null> {
  const periodStart = getPeriodStart(timeframe);
  const match: Record<string, unknown> = {
    environment,
    subjectId,
    domain,
  };

  if (periodStart) {
    match['occurredAt'] = { $gte: periodStart };
  }

  const rows = await AnalyticsEventModel.aggregate<{ _id: string; count: number }>([
    { $match: match },
    { $group: { _id: '$subjectType', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);

  const subjectTypes = rows
    .map((row) => row._id)
    .filter((value): value is AnalyticsSubjectType => isAnalyticsSubjectType(value));

  return subjectTypes.length === 1 ? subjectTypes[0] : null;
}

async function resolveSubjectTypeFromFirestore(
  environment: RuntimeEnvironment,
  subjectId: string,
  userId: string
): Promise<{ subjectType: AnalyticsSubjectType; source: SubjectTypeResolutionSource }> {
  const firestore = environment === 'production' ? db : stagingDb;

  const [userSnap, teamSnap, organizationSnap] = await Promise.all([
    firestore.collection('Users').doc(subjectId).get(),
    firestore.collection('Teams').doc(subjectId).get(),
    firestore.collection('Organizations').doc(subjectId).get(),
  ]);

  const matches: AnalyticsSubjectType[] = [];
  if (userSnap.exists) matches.push('user');
  if (teamSnap.exists) matches.push('team');
  if (organizationSnap.exists) matches.push('organization');

  if (matches.length === 1) {
    return { subjectType: matches[0], source: 'firestore_entity' };
  }

  if (subjectId === userId && matches.includes('user')) {
    return { subjectType: 'user', source: 'user_id_fallback' };
  }

  return {
    subjectType: 'user',
    source: subjectId === userId ? 'user_id_fallback' : 'default_user',
  };
}

async function resolveSubjectType(
  rawSubjectType: string | undefined,
  subjectId: string,
  userId: string,
  domain: AnalyticsDomain,
  timeframe: AnalyticsSummaryTimeframe,
  environment: RuntimeEnvironment
): Promise<{ subjectType: AnalyticsSubjectType; source: SubjectTypeResolutionSource }> {
  if (rawSubjectType && isAnalyticsSubjectType(rawSubjectType)) {
    return { subjectType: rawSubjectType, source: 'explicit' };
  }

  const rollupSubjectType = await resolveSubjectTypeFromRollups(
    environment,
    subjectId,
    domain,
    timeframe
  );
  if (rollupSubjectType) {
    return { subjectType: rollupSubjectType, source: 'analytics_rollup' };
  }

  const eventSubjectType = await resolveSubjectTypeFromEvents(
    environment,
    subjectId,
    domain,
    timeframe
  );
  if (eventSubjectType) {
    return { subjectType: eventSubjectType, source: 'analytics_event' };
  }

  return resolveSubjectTypeFromFirestore(environment, subjectId, userId);
}

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
    'Gets an analytics summary for a user, team, or organization and domain, including total tracked events, counts by event type, and custom-template breakdowns for custom-domain queries. Pass subjectId and subjectType for team or organization analytics whenever possible.';

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
    const timeframe = parsed.data.timeframe;
    const normalizedTimeframe =
      timeframe &&
      ANALYTICS_SUMMARY_TIMEFRAMES.includes(
        timeframe as (typeof ANALYTICS_SUMMARY_TIMEFRAMES)[number]
      )
        ? (timeframe as (typeof ANALYTICS_SUMMARY_TIMEFRAMES)[number])
        : '30d';
    const environment = _context?.environment ?? getRuntimeEnvironment();
    const resolution = await resolveSubjectType(
      rawSubjectType,
      subjectId,
      userId,
      domain,
      normalizedTimeframe,
      environment
    );

    const summary = await this.analytics.getSummary({
      subjectId,
      subjectType: resolution.subjectType,
      domain,
      timeframe: normalizedTimeframe,
      templateKey: parsed.data.templateKey,
      templateBaseDomain: parsed.data.templateBaseDomain,
    });

    return {
      success: true,
      data: {
        ...summary,
        requestedSubjectType: rawSubjectType ?? null,
        resolvedSubjectType: resolution.subjectType,
        subjectTypeResolution: resolution.source,
      },
    };
  }
}
