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
import { appGuard } from '../../middleware/auth.middleware.js';
import type { AgentThreadCategory } from '@nxt1/core';
import { logger } from '../../utils/logger.js';
import { chatService, isValidObjectId, VALID_THREAD_CATEGORIES } from './shared.js';

const router = Router();

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

    const archived = await chatService.archiveThread(threadId, user.uid);
    if (!archived) {
      res.status(404).json({ success: false, error: 'Thread not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to archive thread', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to archive thread' });
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
      title: title?.trim().slice(0, 200) || 'New Conversation',
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
