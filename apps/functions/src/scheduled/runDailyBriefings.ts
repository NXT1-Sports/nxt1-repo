/**
 * @fileoverview Daily Briefings — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/runDailyBriefings
 *
 * Runs daily at 8 AM Eastern. Calls the backend's CRON endpoint to
 * trigger Agent X daily briefings for all opted-in users.
 *
 * The heavy lifting lives in the backend (`runDailyBriefings` in
 * trigger.listeners.ts). This Cloud Function is only the scheduler
 * wrapper that fires an authenticated HTTP call.
 *
 * Required secrets (Firebase Secret Manager):
 *   - CRON_SECRET: Shared secret between this function and the backend
 *   - BACKEND_URL: Base URL of the backend API (e.g. https://api.nxt1.com)
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

/**
 * Daily Agent X briefings — 8:00 AM ET, every day.
 *
 * Makes an authenticated POST to the backend which then:
 *   1. Fetches all opted-in users (agentGoals ≠ [])
 *   2. Enqueues BullMQ trigger jobs for daily_briefing
 *   3. Generates daily content for each user via OpenRouter
 *   4. Dispatches `agent_action` notifications via NotificationService
 */
export const agentDailyBriefings = onSchedule(
  {
    schedule: '0 8 * * *',
    timeZone: 'America/New_York',
    retryCount: 3,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting Agent X daily briefings');

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
        const body = await response.text();
        logger.error('Backend returned error', {
          status: response.status,
          body: body.slice(0, 500),
        });
        throw new Error(`Backend responded with ${response.status}`);
      }

      const result = await response.json();
      logger.info('Agent X daily briefings completed', { result });
    } catch (error) {
      logger.error('Agent X daily briefings failed', { error });
      throw error; // Re-throw so Cloud Scheduler retries
    }
  }
);
