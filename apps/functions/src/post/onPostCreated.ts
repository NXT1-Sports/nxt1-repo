/**
 * @fileoverview Post Created Trigger — Event-Driven Timeline Scanning
 * @module @nxt1/functions/post
 *
 * Fires whenever a new document is created in the `Posts` Firestore collection.
 * Calls the backend to enqueue a debounced BullMQ timeline scan job for the
 * post author. The 30-minute debounce in BullMQ means that a burst of posts
 * from the same user results in exactly one scan.
 *
 * This is the PRIMARY trigger path for keeping Agent X memory up-to-date
 * with user social activity. The nightly cron safety net is a fallback.
 *
 * Required secrets (Firebase Secret Manager):
 *   - CRON_SECRET: Shared secret between this function and the backend
 *   - BACKEND_URL: Base URL of the backend API (e.g. https://api.nxt1.com)
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

/**
 * onPostCreated — Enqueue a delayed timeline scan for the post author.
 *
 * Extracts `userId` and optional `teamId` from the new post document,
 * then calls the backend's enqueue endpoint. The backend applies a
 * 30-minute BullMQ debounce per user so rapid-fire posts don't cause
 * redundant LLM extraction calls.
 */
export const onPostCreatedV3 = onDocumentCreated(
  {
    document: 'Posts/{postId}',
    region: 'us-central1',
    maxInstances: 20,
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [CRON_SECRET],
  },
  async (event) => {
    const postId = event.params['postId'];
    const snapshot = event.data;

    if (!snapshot) {
      logger.warn('No data in post created event', { postId });
      return;
    }

    const postData = snapshot.data();
    const userId = postData?.['userId'];
    const teamId = postData?.['teamId'];
    const deletedAt = postData?.['deletedAt'];
    const visibility = postData?.['visibility'];

    if (!userId || typeof userId !== 'string') {
      logger.warn('Post missing userId, skipping timeline scan enqueue', { postId });
      return;
    }

    // Skip deleted or private posts — no value in scanning them for Agent X memory
    if (deletedAt != null) {
      logger.info('Skipping timeline scan enqueue for deleted post', { postId, userId });
      return;
    }
    if (visibility === 'PRIVATE') {
      logger.info('Skipping timeline scan enqueue for private post', { postId, userId });
      return;
    }

    const url = `${BACKEND_URL.value()}/api/v1/agent-x/cron/enqueue-timeline-scan`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': CRON_SECRET.value(),
        },
        body: JSON.stringify({
          userId,
          ...(typeof teamId === 'string' ? { teamId } : {}),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error('Backend enqueue-timeline-scan returned error', {
          status: response.status,
          body: body.slice(0, 500),
          postId,
          userId,
        });
        return; // Don't throw — this is a best-effort trigger
      }

  const result = (await response.json()) as { data?: { jobId?: string } };
      logger.info('Timeline scan enqueued for post author', {
        postId,
        userId,
        teamId: teamId ?? null,
        jobId: result?.data?.jobId,
      });
    } catch (error) {
      // Log but don't throw — a failed enqueue is not critical enough to retry
      // the entire Cloud Function. The nightly cron safety net will catch it.
      logger.error('Failed to enqueue timeline scan', {
        postId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);
