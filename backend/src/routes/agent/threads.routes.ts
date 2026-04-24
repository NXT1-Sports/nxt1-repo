/**
 * @fileoverview Agent X — Thread & message CRUD (MongoDB).
 *
 * GET    /threads
 * GET    /threads/:threadId
 * GET    /threads/:threadId/messages
 * PATCH  /threads/:threadId
 * POST   /threads/:threadId/archive
 * POST   /threads
 */

import { Router, type Request, type Response } from 'express';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import type { AgentThreadCategory } from '@nxt1/core';
import { logger } from '../../utils/logger.js';
import { chatService, isValidObjectId, VALID_THREAD_CATEGORIES } from './shared.js';

const router = Router();

const AGENT_JOBS_COLLECTION = 'AgentJobs';
const AGENT_JOB_EVENTS_SUBCOLLECTION = 'events';
const DELETE_BATCH_SIZE = 450;

async function deleteJobEvents(
  db: Firestore,
  jobDoc: QueryDocumentSnapshot,
  userId: string,
  threadId: string
): Promise<void> {
  let lastEventDoc: QueryDocumentSnapshot | undefined;

  while (true) {
    let query = jobDoc.ref
      .collection(AGENT_JOB_EVENTS_SUBCOLLECTION)
      .orderBy('__name__')
      .limit(DELETE_BATCH_SIZE);

    if (lastEventDoc) {
      query = query.startAfter(lastEventDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    for (const eventDoc of snapshot.docs) {
      batch.delete(eventDoc.ref);
    }
    await batch.commit();

    lastEventDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  logger.info('Deleted AgentJob events for thread', {
    userId,
    threadId,
    operationId: jobDoc.id,
  });
}

async function deleteAgentJobsForThread(
  db: Firestore,
  userId: string,
  threadId: string
): Promise<number> {
  let deletedCount = 0;

  // Query by threadId to avoid requiring a composite index; enforce user ownership in code.
  const jobsSnapshot = await db
    .collection(AGENT_JOBS_COLLECTION)
    .where('threadId', '==', threadId)
    .get();

  for (const jobDoc of jobsSnapshot.docs) {
    const data = jobDoc.data() as { userId?: string };
    if (data.userId !== userId) continue;

    await deleteJobEvents(db, jobDoc, userId, threadId);
    await jobDoc.ref.delete();
    deletedCount += 1;
  }

  if (deletedCount > 0) {
    logger.info('Deleted AgentJobs for thread', {
      userId,
      threadId,
      deletedCount,
    });
  }

  return deletedCount;
}

// ─── GET /threads ─────────────────────────────────────────────────────────

router.get('/threads', appGuard, async (req: Request, res: Response) => {
  try {
    if (!chatService) {
      res.status(503).json({ success: false, error: 'Chat service not initialized' });
      return;
    }

    const user = (req as Request & { user?: { uid: string } }).user;
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const limitParam = req.query['limit'];
    const limit = Math.min(parseInt(typeof limitParam === 'string' ? limitParam : '20') || 20, 100);
    const archived =
      req.query['archived'] === 'true'
        ? true
        : req.query['archived'] === 'false'
          ? false
          : undefined;

    const beforeRaw = typeof req.query['before'] === 'string' ? req.query['before'] : undefined;
    const before = beforeRaw && /^\d{4}-\d{2}-\d{2}T/.test(beforeRaw) ? beforeRaw : undefined;

    const categoryRaw =
      typeof req.query['category'] === 'string' ? req.query['category'] : undefined;
    const category =
      categoryRaw && VALID_THREAD_CATEGORIES.has(categoryRaw)
        ? (categoryRaw as AgentThreadCategory)
        : undefined;

    const result = await chatService.getUserThreads({
      userId: user.uid,
      limit,
      before,
      archived,
      category,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to list threads', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to list threads' });
  }
});

// ─── GET /threads/:threadId ───────────────────────────────────────────────

router.get('/threads/:threadId', appGuard, async (req: Request, res: Response) => {
  try {
    if (!chatService) {
      res.status(503).json({ success: false, error: 'Chat service not initialized' });
      return;
    }

    const user = (req as Request & { user?: { uid: string } }).user;
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const threadId = req.params['threadId'] as string;
    if (!isValidObjectId(threadId)) {
      res.status(400).json({ success: false, error: 'Invalid thread ID format' });
      return;
    }

    const thread = await chatService.getThread(threadId, user.uid);
    if (!thread) {
      res.status(404).json({ success: false, error: 'Thread not found' });
      return;
    }

    res.json({ success: true, data: thread });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get thread', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to get thread' });
  }
});

// ─── GET /threads/:threadId/messages ─────────────────────────────────────

router.get('/threads/:threadId/messages', appGuard, async (req: Request, res: Response) => {
  try {
    if (!chatService) {
      res.status(503).json({ success: false, error: 'Chat service not initialized' });
      return;
    }

    const user = (req as Request & { user?: { uid: string } }).user;
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const threadId = req.params['threadId'] as string;
    if (!isValidObjectId(threadId)) {
      res.status(400).json({ success: false, error: 'Invalid thread ID format' });
      return;
    }

    const thread = await chatService.getThread(threadId, user.uid);
    if (!thread) {
      res.status(404).json({ success: false, error: 'Thread not found' });
      return;
    }

    const limitParam = req.query['limit'];
    const limit = Math.min(parseInt(typeof limitParam === 'string' ? limitParam : '50') || 50, 200);
    const before = typeof req.query['before'] === 'string' ? req.query['before'] : undefined;

    const result = await chatService.getThreadMessages({ threadId, limit, before });

    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get thread messages', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to get messages' });
  }
});

// ─── PATCH /threads/:threadId ─────────────────────────────────────────────

router.patch('/threads/:threadId', appGuard, async (req: Request, res: Response) => {
  try {
    if (!chatService) {
      res.status(503).json({ success: false, error: 'Chat service not initialized' });
      return;
    }

    const user = (req as Request & { user?: { uid: string } }).user;
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const threadId = req.params['threadId'] as string;
    if (!isValidObjectId(threadId)) {
      res.status(400).json({ success: false, error: 'Invalid thread ID format' });
      return;
    }

    const { title } = req.body as { title?: string };

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Title is required' });
      return;
    }

    if (title.trim().length > 200) {
      res.status(400).json({ success: false, error: 'Title must be 200 characters or less' });
      return;
    }

    const updated = await chatService.updateThreadTitle(threadId, user.uid, title.trim());
    if (!updated) {
      res.status(404).json({ success: false, error: 'Thread not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to update thread', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to update thread' });
  }
});

// ─── POST /threads/:threadId/archive ─────────────────────────────────────
// NOTE: This endpoint now performs a permanent delete for the thread.
// It removes:
// - MongoDB thread document
// - MongoDB messages for the thread
// - Firestore AgentJobs rows linked to the thread (plus events subcollection)

router.post('/threads/:threadId/archive', appGuard, async (req: Request, res: Response) => {
  try {
    if (!chatService) {
      res.status(503).json({ success: false, error: 'Chat service not initialized' });
      return;
    }

    const user = (req as Request & { user?: { uid: string } }).user;
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const threadId = req.params['threadId'] as string;
    if (!isValidObjectId(threadId)) {
      res.status(400).json({ success: false, error: 'Invalid thread ID format' });
      return;
    }

    const deleted = await chatService.deleteThread(threadId, user.uid);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Thread not found' });
      return;
    }

    const db = req.firebase?.db;
    if (db) {
      await deleteAgentJobsForThread(db, user.uid, threadId);
    } else {
      logger.warn('Firestore db unavailable while deleting AgentJobs for thread', {
        userId: user.uid,
        threadId,
      });
    }

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to delete thread', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to delete thread' });
  }
});

// ─── POST /threads ────────────────────────────────────────────────────────

router.post('/threads', appGuard, async (req: Request, res: Response) => {
  try {
    if (!chatService) {
      res.status(503).json({ success: false, error: 'Chat service not initialized' });
      return;
    }

    const user = (req as Request & { user?: { uid: string } }).user;
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { title, category } = req.body as { title?: string; category?: string };

    const validCategory =
      category && VALID_THREAD_CATEGORIES.has(category)
        ? (category as AgentThreadCategory)
        : undefined;

    const thread = await chatService.createThread({
      userId: user.uid,
      ...(title?.trim().slice(0, 200) ? { title: title.trim().slice(0, 200) } : {}),
      category: validCategory,
    });

    res.status(201).json({ success: true, data: thread });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to create thread', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to create thread' });
  }
});

export default router;
