/**
 * @fileoverview Weekly Recaps — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/weeklyRecaps
 *
 * Runs every Friday at 9:00 AM ET and calls the backend cron endpoint that
 * generates and sends weekly Agent X recap emails.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const weeklyRecaps = onSchedule(
  {
    schedule: '0 9 * * 5',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting weekly Agent X recaps run');

    const url = `${BACKEND_URL.value()}/api/v1/agent-x/cron/weekly-recaps`;

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
        logger.error('Weekly recaps backend call failed', {
          status: response.status,
          body: body.slice(0, 500),
        });
        throw new Error(`Backend returned ${response.status}`);
      }

      const result = await response.json();
      logger.info('Weekly Agent X recaps completed', { result });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Weekly Agent X recaps failed', { error: error.message });
      throw error;
    }
  }
);
