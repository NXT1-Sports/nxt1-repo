/**
 * @fileoverview Weekly Help Center Refresh — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/weeklyHelpCenterRefresh
 *
 * Runs every Sunday at 2:00 AM UTC. Calls the backend's CRON endpoint to
 * trigger the agent-driven help center content refresh pipeline.
 *
 * The heavy lifting lives in the backend (`HelpCenterRefreshService`):
 *   1. Pulls signals: global knowledge, agent memories, analytics rollups,
 *      agent task failures, and web search (Tavily)
 *   2. Pass 1 LLM: synthesizes a topic brief — content gaps this week
 *   3. Semantic dedup gate: drops topics already covered in recent articles
 *   4. Pass 2 LLM: writes full articles + FAQs for approved topics
 *   5. Upserts HelpArticle and HelpFaq documents to MongoDB
 *   6. Ingests all new content into agentGlobalKnowledge (vector RAG)
 *   7. Busts all help center cache keys
 *
 * Required secrets (Firebase Secret Manager):
 *   - CRON_SECRET: Shared secret between this function and the backend
 *
 * Required params (Firebase App Hosting / .env):
 *   - BACKEND_URL: Base URL of the backend API (e.g. https://api.nxt1sports.com)
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

/**
 * Weekly Help Center Refresh — every Sunday at 2:00 AM UTC.
 *
 * Scheduled after weeklyCleanup (midnight Sunday) to ensure the database
 * is in a clean state before new content is generated.
 *
 * 9-minute timeout to accommodate:
 *   - 3 Tavily web search calls (~3s each)
 *   - 2 LLM passes via OpenRouter (Claude 3.5 Sonnet, ~30s each)
 *   - 10 semantic dedup vector searches (~1s each)
 *   - MongoDB upserts + knowledge ingestion (~2s each)
 */
export const weeklyHelpCenterRefresh = onSchedule(
  {
    schedule: '0 2 * * 0',
    timeZone: 'UTC',
    retryCount: 1,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting weekly help center refresh');

    const url = `${BACKEND_URL.value()}/api/v1/agent-x/cron/refresh-help-center`;

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
        logger.error('Backend returned error for help center refresh', {
          status: response.status,
          body: body.slice(0, 500),
        });
        throw new Error(`Backend responded with ${response.status}`);
      }

      const result = await response.json();
      logger.info('Weekly help center refresh completed', { result });
    } catch (error) {
      logger.error('Weekly help center refresh failed', { error });
      throw error; // Re-throw so Cloud Scheduler retries (retryCount: 1)
    }
  }
);
