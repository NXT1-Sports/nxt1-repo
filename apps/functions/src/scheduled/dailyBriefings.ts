/**
 * @fileoverview Daily Briefings — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/dailyBriefings
 *
 * Runs daily and calls the backend cron endpoint that generates Agent X
 * daily briefings for users with active goals.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const dailyBriefings = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting daily Agent X briefings run');

    const url = `${BACKEND_URL.value()}/api/v1/agent-x/cron/daily-briefings`;

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
        logger.error('Daily briefings backend call failed', {
          status: response.status,
          body: body.slice(0, 500),
        });
        throw new Error(`Backend returned ${response.status}`);
      }

      const result = await response.json();
      logger.info('Daily Agent X briefings completed', { result });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Daily Agent X briefings failed', { error: error.message });
      throw error;
    }
  }
);
