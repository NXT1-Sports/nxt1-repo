/**
 * @fileoverview Messages Routes
 * @module @nxt1/backend/routes/messages
 *
 * REST API endpoints for the Messages/Conversations feature.
 * Matches MESSAGES_API_ENDPOINTS from @nxt1/core/messages/constants.
 *
 * Route mount point: /api/v1/messages (set in index.ts)
 *
 * All endpoints require authentication (appGuard).
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';
import * as messagesService from '../services/messages.service.js';
import { syncAllUserEmails } from '../services/email-sync.service.js';
import { type MessagesFilterId, MESSAGES_UI_CONFIG } from '@nxt1/core';

const router = Router();

// ============================================
// ALL ROUTES REQUIRE AUTHENTICATION
// ============================================

router.use(appGuard);

// ============================================
// CONVERSATION LIST
// ============================================

/**
 * GET /api/v1/messages/conversations
 *
 * List conversations for the authenticated user.
 * Query params:
 *   - filter: MessagesFilterId ('all' | 'unread')
 *   - page: number (default 1)
 *   - limit: number (default 20, max 100)
 *   - q: search query string
 */
router.get('/conversations', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const filter = (req.query['filter'] as MessagesFilterId) ?? 'all';
    const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string) || 20));
    const query = (req.query['q'] as string) || undefined;

    const result = await messagesService.getConversations(userId, filter, page, limit, query);

    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('[Messages] GET /conversations failed', {
      userId: req.user?.uid,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: 'Failed to load conversations' });
  }
});

// ============================================
// CONVERSATION THREAD
// ============================================

/**
 * GET /api/v1/messages/thread/:conversationId
 *
 * Get messages for a specific conversation.
 * Query params:
 *   - page: number (default 1)
 *   - limit: number (default 30, max 100)
 */
router.get('/thread/:conversationId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const conversationId = req.params['conversationId'] as string;
    const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string) || 30));

    const result = await messagesService.getThread(userId, conversationId, page, limit);

    if (!result.success) {
      res.status(404).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('[Messages] GET /thread/:id failed', {
      conversationId: req.params['conversationId'],
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: 'Failed to load thread' });
  }
});

// ============================================
// SEND MESSAGE
// ============================================

/**
 * POST /api/v1/messages/send
 *
 * Send a message to an existing conversation.
 * Body: { conversationId, body, replyToId? }
 */
router.post('/send', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const { conversationId, body, replyToId } = req.body as {
      conversationId?: string;
      body?: string;
      replyToId?: string;
    };

    if (!conversationId || !body?.trim()) {
      res.status(400).json({ success: false, error: 'conversationId and body are required' });
      return;
    }

    if (body.length > MESSAGES_UI_CONFIG.maxMessageLength) {
      res.status(400).json({
        success: false,
        error: `Message exceeds ${MESSAGES_UI_CONFIG.maxMessageLength} character limit`,
      });
      return;
    }

    const message = await messagesService.sendMessage(
      userId,
      conversationId,
      body.trim(),
      replyToId,
      req.firebase?.db
    );

    res.json({ success: true, data: message });
  } catch (err) {
    logger.error('[Messages] POST /send failed', {
      userId: req.user?.uid,
      error: err instanceof Error ? err.message : String(err),
    });
    const status = (err as Error).message === 'Conversation not found' ? 404 : 500;
    res.status(status).json({ success: false, error: (err as Error).message });
  }
});

// ============================================
// CREATE CONVERSATION
// ============================================

/**
 * POST /api/v1/messages/create
 *
 * Create a new conversation.
 * Body: { type, participantIds, title?, initialMessage? }
 */
router.post('/create', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const { type, participantIds, title, initialMessage } = req.body as {
      type?: string;
      participantIds?: string[];
      title?: string;
      initialMessage?: string;
    };

    if (!type || !participantIds || participantIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'type and participantIds (non-empty) are required',
      });
      return;
    }

    const validTypes = ['direct', 'group', 'team', 'coach'];
    if (!validTypes.includes(type)) {
      res
        .status(400)
        .json({ success: false, error: `Invalid type. Must be: ${validTypes.join(', ')}` });
      return;
    }

    const conversation = await messagesService.createConversation(
      userId,
      type as 'direct' | 'group' | 'team' | 'coach',
      participantIds,
      title,
      initialMessage
    );

    res.status(201).json({ success: true, data: conversation });
  } catch (err) {
    logger.error('[Messages] POST /create failed', {
      userId: req.user?.uid,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: 'Failed to create conversation' });
  }
});

// ============================================
// MARK AS READ
// ============================================

/**
 * PUT /api/v1/messages/read/:conversationId
 */
router.put('/read/:conversationId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const conversationId = req.params['conversationId'] as string;

    await messagesService.markAsRead(userId, conversationId);

    res.json({ success: true });
  } catch (err) {
    logger.error('[Messages] PUT /read/:id failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: 'Failed to mark as read' });
  }
});

// ============================================
// MUTE
// ============================================

/**
 * PUT /api/v1/messages/mute/:conversationId
 * Body: { muted: boolean }
 */
router.put('/mute/:conversationId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const conversationId = req.params['conversationId'] as string;
    const { muted } = req.body as { muted?: boolean };

    if (typeof muted !== 'boolean') {
      res.status(400).json({ success: false, error: 'muted (boolean) is required' });
      return;
    }

    await messagesService.toggleMute(userId, conversationId, muted);

    res.json({ success: true });
  } catch (err) {
    logger.error('[Messages] PUT /mute/:id failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: 'Failed to toggle mute' });
  }
});

// ============================================
// PIN
// ============================================

/**
 * PUT /api/v1/messages/pin/:conversationId
 * Body: { pinned: boolean }
 */
router.put('/pin/:conversationId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const conversationId = req.params['conversationId'] as string;
    const { pinned } = req.body as { pinned?: boolean };

    if (typeof pinned !== 'boolean') {
      res.status(400).json({ success: false, error: 'pinned (boolean) is required' });
      return;
    }

    await messagesService.togglePin(userId, conversationId, pinned);

    res.json({ success: true });
  } catch (err) {
    logger.error('[Messages] PUT /pin/:id failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: 'Failed to toggle pin' });
  }
});

// ============================================
// DELETE
// ============================================

/**
 * DELETE /api/v1/messages/delete/:conversationId
 */
router.delete('/delete/:conversationId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const conversationId = req.params['conversationId'] as string;

    await messagesService.deleteConversation(userId, conversationId);

    res.json({ success: true });
  } catch (err) {
    logger.error('[Messages] DELETE /delete/:id failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: 'Failed to delete conversation' });
  }
});

// ============================================
// UNREAD COUNT
// ============================================

/**
 * GET /api/v1/messages/unread-count
 */
router.get('/unread-count', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const count = await messagesService.getUnreadCount(userId);

    res.json({ success: true, data: { count } });
  } catch (err) {
    logger.error('[Messages] GET /unread-count failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: 'Failed to get unread count' });
  }
});

// ============================================
// EMAIL SYNC
// ============================================

/**
 * POST /api/v1/messages/sync
 *
 * Trigger an email sync for all connected providers.
 * Returns sync results per provider.
 */
router.post('/sync', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;

    logger.info('[Messages] Email sync triggered', { userId });

    const results = await syncAllUserEmails(userId, req.firebase?.db);

    res.json({ success: true, data: results });
  } catch (err) {
    logger.error('[Messages] POST /sync failed', {
      userId: req.user?.uid,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: 'Email sync failed' });
  }
});

export default router;
