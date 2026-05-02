/**
 * @fileoverview Weekly Suggested Actions — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/weeklySuggestedActions
 *
 * Runs every Sunday at 9:00 AM ET and calls the backend cron endpoint that
 * generates personalized coordinator-panel suggested actions for active users.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const weeklySuggestedActions = onSchedule(
  {
    schedule: '0 9 * * 0',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting weekly Agent X suggested actions run');

    const url = `${BACKEND_URL.value()}/api/v1/agent-x/cron/suggested-actions`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': CRON_SECRET.value(),
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.error('Weekly suggested actions backend call failed', {
          status: response.status,
          body: body.slice(0, 500),
        });
        throw new Error(`Backend returned ${response.status}`);
      }

      const result = await response.json();
      logger.info('Weekly Agent X suggested actions completed', { result });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Weekly Agent X suggested actions failed', { error: error.message });
      throw error;
    }
  }
);
