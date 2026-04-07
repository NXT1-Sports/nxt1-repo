/**
 * @fileoverview Summarize Inactive Threads — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/summarizeInactiveThreads
 *
 * Runs daily at 3 AM Eastern (off-peak). Calls the backend's CRON endpoint
 * to extract durable memories from inactive Agent X conversation threads.
 *
 * The heavy lifting lives in the backend (`MemorySummarizationService`).
 * This Cloud Function is only the scheduler wrapper that fires an
 * authenticated HTTP call.
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
 * Summarize inactive Agent X threads — 3:00 AM ET, every day.
 *
 * Makes an authenticated POST to the backend which then:
 *   1. Queries threads inactive for > 24 hours with memorySummarized ≠ true
 *   2. Extracts durable facts (preferences, goals, recruiting context)
 *   3. Stores facts as vector memories for future RAG retrieval
 *   4. Marks threads as memorySummarized: true
 */
export const summarizeInactiveThreads = onSchedule(
  {
    schedule: '0 3 * * *',
    timeZone: 'America/New_York',
    retryCount: 2,
    timeoutSeconds: 540, // 9 minutes — processing up to 50 threads
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting Agent X thread memory summarization');

    const url = `${BACKEND_URL.value()}/api/v1/agent-x/cron/summarize-threads`;

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
      logger.info('Agent X thread summarization completed', { result });
    } catch (error) {
      logger.error('Agent X thread summarization failed', { error });
      throw error; // Re-throw so Cloud Scheduler retries
    }
  }
);
