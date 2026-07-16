/**
 * @fileoverview Cloudflare Video Analytics Sync — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/syncCloudflareVideoAnalytics
 *
 * Runs every day at 3:00 AM Eastern. Calls the backend CRON endpoint that:
 *   1. Pulls the last 24h of Cloudflare Stream playback analytics
 *   2. Resolves matching Posts by cloudflareVideoId
 *   3. Writes video_played and video_watched analyticsEvents records
 *   4. Updates per-post sync timestamps for observability
 *
 * Required secrets/params (Firebase Secret Manager / .env.local):
 *   - CRON_SECRET: Shared secret between this function and the backend
 *   - BACKEND_URL: Base URL of the backend API (e.g. https://api.nxt1.com)
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

/**
 * Sync Cloudflare Stream video analytics every day at 3:00 AM ET.
 *
 * The backend responds immediately after accepting the job, then performs the
 * analytics sync in the background. This scheduler only verifies the backend
 * accepted the request so the recurring trigger exists and is observable.
 */
export const syncCloudflareVideoAnalytics = onSchedule(
  {
    schedule: '0 3 * * *',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 120,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting Cloudflare video analytics sync trigger');

    try {
      const result = await postBackendCronJson<{
        success: boolean;
        message?: string;
        status?: string;
      }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/agent-x/cron/sync-cloudflare-video-analytics',
        cronSecret: CRON_SECRET.value(),
        jobName: 'syncCloudflareVideoAnalytics',
        timeoutMs: 20_000,
        maxAttempts: 3,
      });

      if (!result) {
        logger.warn('Cloudflare video analytics sync skipped due to transient backend outage');
        return;
      }

      logger.info('Cloudflare video analytics sync accepted by backend', {
        result: result.data,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Cloudflare video analytics sync trigger failed', {
        error: error.message,
      });
      throw error;
    }
  }
);
