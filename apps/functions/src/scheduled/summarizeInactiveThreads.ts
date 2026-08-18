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
import { postBackendCronJson } from './utils/backendCronRequest';
import { sendScheduledSlackAlert } from './utils/slackAlert';

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

    try {
      // postBackendCronJson handles:
      //   - AbortSignal.timeout() so the fetch never hangs indefinitely
      //   - Automatic retry on 408 / 429 / 5xx with linear backoff
      //   - Fail-open (returns null) after exhausting retries instead of crashing
      const result = await postBackendCronJson({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/agent-x/cron/summarize-threads',
        cronSecret: CRON_SECRET.value(),
        jobName: 'summarizeInactiveThreads',
        // Backend responds immediately (fire-and-forget route), so 15 s is ample.
        // If the backend is cold-starting and takes longer, retries will catch it.
        timeoutMs: 15_000,
        maxAttempts: 3,
      });

      if (result === null) {
        // All retries exhausted — backend was unavailable.
        // Logged as a warning (not an error) to avoid inflating crash metrics;
        // Cloud Scheduler's own retryCount: 2 will re-run the function if needed.
        logger.warn('summarizeInactiveThreads: backend unavailable after retries — skipping run');
        await sendScheduledSlackAlert({
          title: 'Thread Summarization Backend Unavailable',
          summary:
            'The nightly thread summarization function could not hand off work to the backend after retrying.',
          route: '/api/v1/agent-x/cron/summarize-threads',
          error: 'Backend unavailable after retries',
        });
        return;
      }

      logger.info('Agent X thread summarization completed', { result: result.data });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      logger.error('Agent X thread summarization failed', { error: normalized.message });
      await sendScheduledSlackAlert({
        title: 'Thread Summarization Request Failed',
        summary:
          'The nightly thread summarization function failed before the backend accepted the request.',
        route: '/api/v1/agent-x/cron/summarize-threads',
        error: normalized.message,
      });
      throw normalized;
    }
  }
);
