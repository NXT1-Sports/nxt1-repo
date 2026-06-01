/**
 * @fileoverview Compress Old Videos — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/compressOldVideos
 *
 * Runs nightly at 2:00 AM Eastern. Calls the backend to compress video files
 * in Firebase Storage that are ≥ 3 days old and not yet marked compressed.
 *
 * Why compress instead of delete?
 *   Agent X thread videos are referenced by permanent Firebase Storage paths.
 *   Compressing in-place (same GCS path, same download URL) reduces storage costs
 *   without any database migrations or client-side URL updates.
 *
 * Compression parameters (applied by backend → ffmpeg-mcp):
 *   - CRF 32 (medium–high compression, good subjective quality for review clips)
 *   - max 720p downscale
 *   - H.264, medium preset
 *
 * Files already processed carry custom GCS metadata nxt1-compressed=true and are
 * skipped on all subsequent runs — the function is fully idempotent.
 *
 * Required secrets (Firebase Secret Manager):
 *   - CRON_SECRET: Shared secret between this function and the backend
 *   - BACKEND_URL: Base URL of the backend API (e.g. https://api.nxt1sports.com)
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

/**
 * Compress old Agent X thread videos — 2:00 AM ET, every day.
 *
 * Makes an authenticated POST to the backend which then:
 *   1. Lists all video files under Users/ that are ≥ 3 days old, ≥ 5 MB,
 *      and do NOT have nxt1-compressed=true in their custom GCS metadata
 *   2. Compresses up to 30 files via ffmpeg-mcp (CRF 32, medium preset)
 *   3. Overwrites each original file in GCS — download URLs are preserved
 *   4. Stamps nxt1-compressed=true metadata so the file is never reprocessed
 *   5. Returns processed/skipped/error counts and total bytes saved
 */
export const compressOldVideos = onSchedule(
  {
    schedule: '0 2 * * *',
    timeZone: 'America/New_York',
    retryCount: 2,
    timeoutSeconds: 540, // 9 minutes — backend processes up to 30 files per run
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting Agent X old video compression');

    const url = `${BACKEND_URL.value()}/api/v1/agent-x/cron/compress-old-videos`;

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

      const result = (await response.json()) as {
        success: boolean;
        data?: {
          processed: number;
          skipped: number;
          errors: number;
          bytesReducedMb: number;
          dryRun: boolean;
        };
      };
      logger.info('Agent X old video compression completed', { result });
    } catch (error) {
      logger.error('Agent X old video compression failed', { error });
      throw error; // Re-throw so Cloud Scheduler retries
    }
  }
);
