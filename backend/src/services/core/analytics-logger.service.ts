/**
 * @fileoverview Analytics logger service for Agent X event sourcing + rollups
 * @module @nxt1/backend/services/analytics-logger
 */

import { z } from 'zod';
import {
  ANALYTICS_DOMAINS,
  ANALYTICS_SUBJECT_TYPES,
  ANALYTICS_SUMMARY_TIMEFRAMES,
  getAnalyticsEventTypesForDomain,
  isAnalyticsEventTypeForDomain,
  type AnalyticsDomain,
  type AnalyticsSubjectType,
  type AnalyticsSummaryTimeframe,
} from '@nxt1/core/models';
import {
  AnalyticsEventModel,
  type AnalyticsEventDocument,
} from '../../models/analytics/analytics-event.model.js';
import { AnalyticsRollupModel } from '../../models/analytics/analytics-rollup.model.js';
import { getRuntimeEnvironment } from '../../config/runtime-environment.js';
import { logger } from '../../utils/logger.js';

const trackEventSchema = z
  .object({
    subjectId: z.string().trim().min(1),
    subjectType: z.enum(ANALYTICS_SUBJECT_TYPES).default('user'),
    domain: z.enum(ANALYTICS_DOMAINS),
    eventType: z.string().trim().min(1),
    occurredAt: z.coerce.date().optional(),
    source: z.enum(['agent', 'user', 'system']).default('system'),
    actorUserId: z.string().trim().min(1).nullable().optional(),
    sessionId: z.string().trim().min(1).nullable().optional(),
    threadId: z.string().trim().min(1).nullable().optional(),
    value: z.union([z.number().finite(), z.string(), z.boolean(), z.null()]).optional(),
    tags: z.array(z.string().trim().min(1)).max(15).optional().default([]),
    payload: z.record(z.string(), z.unknown()).optional().default({}),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .superRefine((value, ctx) => {
    if (!isAnalyticsEventTypeForDomain(value.domain, value.eventType)) {
      ctx.addIssue({
        code: 'custom',
        message: `eventType '${value.eventType}' is not allowed for domain '${value.domain}'. Allowed values: ${getAnalyticsEventTypesForDomain(value.domain).join(', ')}`,
        path: ['eventType'],
      });
    }
  });

const summaryQuerySchema = z.object({
  subjectId: z.string().trim().min(1),
  subjectType: z.enum(ANALYTICS_SUBJECT_TYPES).default('user'),
  domain: z.enum(ANALYTICS_DOMAINS),
  timeframe: z.enum(ANALYTICS_SUMMARY_TIMEFRAMES).default('30d'),
});

export type TrackAnalyticsInput = z.infer<typeof trackEventSchema>;
export type AnalyticsSummaryQuery = z.infer<typeof summaryQuerySchema>;

function timeframeToMs(timeframe: AnalyticsSummaryTimeframe): number | null {
  switch (timeframe) {
    case '24h':
      return 24 * 60 * 60 * 1000;
    case '7d':
      return 7 * 24 * 60 * 60 * 1000;
    case '30d':
      return 30 * 24 * 60 * 60 * 1000;
    case '90d':
      return 90 * 24 * 60 * 60 * 1000;
    case 'all':
    default:
      return null;
  }
}

function getPeriodStart(timeframe: AnalyticsSummaryTimeframe, now: Date): Date | null {
  const ms = timeframeToMs(timeframe);
  return ms === null ? null : new Date(now.getTime() - ms);
}

export class AnalyticsLoggerService {
  async track(input: TrackAnalyticsInput) {
    const parsed = trackEventSchema.parse(input);
    const environment = getRuntimeEnvironment();
    const occurredAt = parsed.occurredAt ?? new Date();
    const numericValue = typeof parsed.value === 'number' ? parsed.value : null;
    const normalizedTags = [...new Set(parsed.tags.map((tag) => tag.trim().toLowerCase()))].slice(
      0,
      15
    );

    const document: AnalyticsEventDocument = {
      environment,
      subjectId: parsed.subjectId,
      subjectType: parsed.subjectType,
      domain: parsed.domain,
      eventType: parsed.eventType,
      occurredAt,
      source: parsed.source,
      actorUserId: parsed.actorUserId ?? null,
      sessionId: parsed.sessionId ?? null,
      threadId: parsed.threadId ?? null,
      value: parsed.value ?? null,
      numericValue,
      tags: normalizedTags,
      payload: parsed.payload,
      metadata: parsed.metadata,
      meta: {
        environment,
        subjectId: parsed.subjectId,
        subjectType: parsed.subjectType,
        domain: parsed.domain,
      },
    };

    const created = await AnalyticsEventModel.create(document);
    await this.applyIncrementalRollups(document);

    return {
      eventId: String(created._id),
      subjectId: parsed.subjectId,
      subjectType: parsed.subjectType,
      domain: parsed.domain,
      eventType: parsed.eventType,
      occurredAt: occurredAt.toISOString(),
    } as const;
  }

  async safeTrack(input: TrackAnalyticsInput): Promise<void> {
    try {
      await this.track(input);
    } catch (error) {
      logger.warn('Analytics event tracking failed (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
        subjectId: input.subjectId,
        domain: input.domain,
        eventType: input.eventType,
      });
    }
  }

  async getSummary(query: AnalyticsSummaryQuery) {
    const parsed = summaryQuerySchema.parse(query);

    const environment = getRuntimeEnvironment();

    let rollup = await AnalyticsRollupModel.findOne({
      environment,
      subjectId: parsed.subjectId,
      subjectType: parsed.subjectType,
      domain: parsed.domain,
      timeframe: parsed.timeframe,
    }).lean();

    if (!rollup) {
      await this.rebuildRollupsForSubject(parsed.subjectId, parsed.subjectType, parsed.domain);
      rollup = await AnalyticsRollupModel.findOne({
        environment,
        subjectId: parsed.subjectId,
        subjectType: parsed.subjectType,
        domain: parsed.domain,
        timeframe: parsed.timeframe,
      }).lean();
    }

    return {
      subjectId: parsed.subjectId,
      subjectType: parsed.subjectType,
      domain: parsed.domain,
      timeframe: parsed.timeframe,
      totalCount: rollup?.totalCount ?? 0,
      numericValueTotal: rollup?.numericValueTotal ?? 0,
      countsByEventType: rollup?.countsByEventType ?? {},
      lastEventAt: rollup?.lastEventAt ? new Date(rollup.lastEventAt).toISOString() : null,
      lastAggregatedAt: rollup?.lastAggregatedAt
        ? new Date(rollup.lastAggregatedAt).toISOString()
        : null,
    } as const;
  }

  async rebuildRollupsForSubject(
    subjectId: string,
    subjectType: AnalyticsSubjectType = 'user',
    domain?: AnalyticsDomain
  ): Promise<void> {
    const environment = getRuntimeEnvironment();
    const domains: AnalyticsDomain[] = domain ? [domain] : [...ANALYTICS_DOMAINS];

    for (const targetDomain of domains) {
      for (const timeframe of ANALYTICS_SUMMARY_TIMEFRAMES) {
        const now = new Date();
        const periodStart = getPeriodStart(timeframe, now);
        const match: Record<string, unknown> = {
          environment,
          subjectId,
          subjectType,
          domain: targetDomain,
        };

        if (periodStart) {
          match['occurredAt'] = { $gte: periodStart };
        }

        const rows = await AnalyticsEventModel.aggregate<{
          _id: string;
          count: number;
          numericValueTotal: number;
          lastEventAt: Date | null;
        }>([
          { $match: match },
          {
            $group: {
              _id: '$eventType',
              count: { $sum: 1 },
              numericValueTotal: { $sum: { $ifNull: ['$numericValue', 0] } },
              lastEventAt: { $max: '$occurredAt' },
            },
          },
        ]);

        const countsByEventType = Object.fromEntries(rows.map((row) => [row._id, row.count]));
        const totalCount = rows.reduce((sum, row) => sum + row.count, 0);
        const numericValueTotal = rows.reduce((sum, row) => sum + (row.numericValueTotal ?? 0), 0);
        const lastEventAt =
          rows
            .map((row) => row.lastEventAt)
            .filter((value): value is Date => value instanceof Date)
            .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

        await AnalyticsRollupModel.updateOne(
          {
            environment,
            subjectId,
            subjectType,
            domain: targetDomain,
            timeframe,
          },
          {
            $set: {
              environment,
              subjectId,
              subjectType,
              domain: targetDomain,
              timeframe,
              periodStart,
              periodEnd: now,
              totalCount,
              numericValueTotal,
              countsByEventType,
              lastEventAt,
              lastAggregatedAt: now,
            },
          },
          { upsert: true }
        );
      }
    }
  }

  private async applyIncrementalRollups(event: AnalyticsEventDocument): Promise<void> {
    const now = new Date();
    const timeframes: AnalyticsSummaryTimeframe[] = ['24h', '7d', '30d', '90d', 'all'];

    await Promise.all(
      timeframes.map(async (timeframe) => {
        const periodStart = getPeriodStart(timeframe, now);
        if (periodStart && event.occurredAt < periodStart) {
          return;
        }

        await AnalyticsRollupModel.updateOne(
          {
            environment: event.environment,
            subjectId: event.subjectId,
            subjectType: event.subjectType,
            domain: event.domain,
            timeframe,
          },
          {
            $set: {
              environment: event.environment,
              subjectId: event.subjectId,
              subjectType: event.subjectType,
              domain: event.domain,
              timeframe,
              periodStart,
              periodEnd: now,
              lastEventAt: event.occurredAt,
              lastAggregatedAt: now,
            },
            $inc: {
              totalCount: 1,
              numericValueTotal: typeof event.numericValue === 'number' ? event.numericValue : 0,
              [`countsByEventType.${event.eventType}`]: 1,
            },
          },
          { upsert: true }
        );
      })
    );
  }
}

let analyticsLoggerService: AnalyticsLoggerService | null = null;

export function getAnalyticsLoggerService(): AnalyticsLoggerService {
  analyticsLoggerService ??= new AnalyticsLoggerService();
  return analyticsLoggerService;
}
