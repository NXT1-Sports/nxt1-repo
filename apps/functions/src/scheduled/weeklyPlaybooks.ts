/**
 * @fileoverview Weekly Playbooks — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/weeklyPlaybooks
 *
 * Runs every Monday at 8:00 AM ET and calls the backend cron endpoint that
 * generates weekly Agent X playbooks.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const weeklyPlaybooks = onSchedule(
  {
    schedule: '0 8 * * 1',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting weekly Agent X playbooks run');

    const url = `${BACKEND_URL.value()}/api/v1/agent-x/cron/weekly-playbooks`;

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
        logger.error('Weekly playbooks backend call failed', {
          status: response.status,
          body: body.slice(0, 500),
        });
        throw new Error(`Backend returned ${response.status}`);
      }

      const result = await response.json();
      logger.info('Weekly Agent X playbooks completed', { result });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Weekly Agent X playbooks failed', { error: error.message });
      throw error;
    }
  }
);
