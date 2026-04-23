/**
 * @fileoverview Playbook Nudge — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/playbookNudge
 *
 * Runs Wednesday + Saturday at 6:00 PM ET and calls the backend endpoint
 * that dispatches personalized Agent X playbook progress nudges.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const playbookNudge = onSchedule(
  {
    schedule: '0 18 * * 3,6',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting Agent X playbook nudge run');

    const url = `${BACKEND_URL.value()}/api/v1/agent-x/cron/playbook-nudge`;

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
        logger.error('Playbook nudge backend call failed', {
          status: response.status,
          body: body.slice(0, 500),
        });
        throw new Error(`Backend returned ${response.status}`);
      }

      const result = await response.json();
      logger.info('Agent X playbook nudge completed', { result });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Agent X playbook nudge failed', { error: error.message });
      throw error;
    }
  }
);
