/**
 * @fileoverview Manual analytics rollup worker
 * @module @nxt1/backend/workers/analytics-rollup-worker
 *
 * Backfills or repairs analytics rollups from the raw event stream.
 */

import { AnalyticsEventModel } from '../models/analytics-event.model.js';
import { getAnalyticsLoggerService } from '../services/analytics-logger.service.js';
import { logger } from '../utils/logger.js';

export async function rebuildRecentAnalyticsRollups(limit: number = 250): Promise<void> {
  const analytics = getAnalyticsLoggerService();
  const rows = await AnalyticsEventModel.aggregate<{
    _id: { subjectId: string; subjectType: string; domain: string };
  }>([
    { $sort: { occurredAt: -1 } },
    {
      $group: {
        _id: {
          subjectId: '$subjectId',
          subjectType: '$subjectType',
          domain: '$domain',
        },
      },
    },
    { $limit: limit },
  ]);

  for (const row of rows) {
    await analytics.rebuildRollupsForSubject(
      row._id.subjectId,
      row._id.subjectType as 'user' | 'team' | 'organization',
      row._id.domain as
        | 'recruiting'
        | 'nil'
        | 'performance'
        | 'engagement'
        | 'communication'
        | 'system'
        | 'custom'
    );
  }

  logger.info('Analytics rollup rebuild complete', { subjectsProcessed: rows.length });
}

const isDirectRun = process.argv[1]?.includes('analytics-rollup.worker');
if (isDirectRun) {
  rebuildRecentAnalyticsRollups()
    .then(() => {
      logger.info('Analytics rollup worker finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Analytics rollup worker failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    });
}
