/**
 * @fileoverview Agent X — Message-level actions.
 *
 * GET  /messages/:messageId
 * PUT  /messages/:messageId
 * POST /messages/:messageId/delete
 * POST /messages/:messageId/undo
 * POST /messages/:messageId/feedback
 * POST /messages/:messageId/annotation
 */

import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { AgentJobPayload } from '@nxt1/core';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { validateBody } from '../../middleware/validation/validation.middleware.js';
import {
  UpdateAgentMessageDto,
  DeleteAgentMessageDto,
  UndoAgentMessageDto,
  AgentMessageFeedbackDto,
  AgentMessageAnnotationDto,
} from '../../dtos/agent-x.dto.js';
import { logger } from '../../utils/logger.js';
import { chatService, isValidObjectId, queueService } from './shared.js';

const router = Router();

const EDIT_WINDOW_MS = 5 * 60 * 1000;

function getAuthUser(req: Request): { uid: string } | null {
  const user = (req as Request & { user?: { uid?: string } }).user;
  return user?.uid ? { uid: user.uid } : null;
}

function parseIsoTimestamp(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

router.get('/messages/:messageId', appGuard, async (req: Request, res: Response) => {
  try {
    if (!chatService) {
      res.status(503).json({ success: false, error: 'Chat service not initialized' });
      return;
    }

    const auth = getAuthUser(req);
    if (!auth) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const messageId = req.params['messageId'] as string;
    if (!isValidObjectId(messageId)) {
      res.status(400).json({ success: false, error: 'Invalid message ID format' });
      return;
    }

    const message = await chatService.getMessageById(messageId, auth.uid);
    if (!message) {
      res.status(404).json({ success: false, error: 'Message not found' });
      return;
    }

    await chatService.appendMessageAction({
      messageId,
      userId: auth.uid,
      action: 'viewed',
      metadata: { source: 'message_fetch' },
    });

    res.json({ success: true, data: message });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to fetch Agent X message', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to fetch message' });
  }
});

router.put(
  '/messages/:messageId',
  appGuard,
  validateBody(UpdateAgentMessageDto),
  async (req: Request, res: Response) => {
    try {
      if (!chatService) {
        res.status(503).json({ success: false, error: 'Chat service not initialized' });
        return;
      }

      const auth = getAuthUser(req);
      if (!auth) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const messageId = req.params['messageId'] as string;
      if (!isValidObjectId(messageId)) {
        res.status(400).json({ success: false, error: 'Invalid message ID format' });
        return;
      }

      const body = req.body as UpdateAgentMessageDto;
      const current = await chatService.getMessageById(messageId, auth.uid);
      if (!current) {
        res.status(404).json({ success: false, error: 'Message not found' });
        return;
      }

      if (current.threadId !== body.threadId) {
        res.status(400).json({ success: false, error: 'Thread mismatch for message' });
        return;
      }

      if (current.role !== 'user') {
        res.status(400).json({ success: false, error: 'Only user messages can be edited' });
        return;
      }

      const createdAtMs = parseIsoTimestamp(current.createdAt);
      if (createdAtMs === null) {
        res.status(400).json({ success: false, error: 'Message has invalid timestamp' });
        return;
      }

      if (Date.now() - createdAtMs > EDIT_WINDOW_MS) {
        res
          .status(400)
          .json({ success: false, error: 'Only messages from the last 5 minutes can be edited' });
        return;
      }

      const operationId = crypto.randomUUID();
      const edited = await chatService.editUserMessage({
        messageId,
        userId: auth.uid,
        threadId: body.threadId,
        newContent: body.message.trim(),
        reason: body.reason,
        agentRerunId: operationId,
      });

      if (!edited) {
        res.status(404).json({ success: false, error: 'Message could not be updated' });
        return;
      }

      const nextAssistant = await chatService.getNextAssistantMessage(
        edited.threadId,
        edited.createdAt
      );
      let deletedAssistantMessageId: string | undefined;
      if (nextAssistant) {
        const deleteToken = crypto.randomUUID();
        const deleted = await chatService.softDeleteMessage({
          messageId: nextAssistant.id,
          userId: auth.uid,
          restoreTokenId: deleteToken,
        });
        if (deleted) {
          deletedAssistantMessageId = deleted.id;
        }
      }

      let rerunEnqueued = false;
      if (queueService) {
        const payload: AgentJobPayload = {
          operationId,
          userId: auth.uid,
          intent: body.message.trim(),
          sessionId: crypto.randomUUID(),
          origin: 'user',
          context: {
            threadId: edited.threadId,
            editedMessageId: edited.id,
            editReason: body.reason ?? null,
          },
        };

        await queueService.enqueue(payload);
        rerunEnqueued = true;
      }

      res.json({
        success: true,
        data: {
          message: edited,
          operationId,
          rerunEnqueued,
          deletedAssistantMessageId,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to edit Agent X message', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to edit message' });
    }
  }
);

router.post(
  '/messages/:messageId/delete',
  appGuard,
  validateBody(DeleteAgentMessageDto),
  async (req: Request, res: Response) => {
    try {
      if (!chatService) {
        res.status(503).json({ success: false, error: 'Chat service not initialized' });
        return;
      }

      const auth = getAuthUser(req);
      if (!auth) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const messageId = req.params['messageId'] as string;
      if (!isValidObjectId(messageId)) {
        res.status(400).json({ success: false, error: 'Invalid message ID format' });
        return;
      }

      const body = req.body as DeleteAgentMessageDto;
      const current = await chatService.getMessageById(messageId, auth.uid);
      if (!current) {
        res.status(404).json({ success: false, error: 'Message not found' });
        return;
      }

      if (current.threadId !== body.threadId) {
        res.status(400).json({ success: false, error: 'Thread mismatch for message' });
        return;
      }

      const restoreTokenId = crypto.randomUUID();
      const deleted = await chatService.softDeleteMessage({
        messageId,
        userId: auth.uid,
        restoreTokenId,
      });

      if (!deleted) {
        res.status(404).json({ success: false, error: 'Message could not be deleted' });
        return;
      }

      let deletedResponseMessageId: string | undefined;
      if (body.deleteResponse) {
        const nextAssistant = await chatService.getNextAssistantMessage(
          deleted.threadId,
          deleted.createdAt
        );
        if (nextAssistant) {
          const responseToken = crypto.randomUUID();
          const deletedResponse = await chatService.softDeleteMessage({
            messageId: nextAssistant.id,
            userId: auth.uid,
            restoreTokenId: responseToken,
          });
          if (deletedResponse) {
            deletedResponseMessageId = deletedResponse.id;
          }
        }
      }

      res.json({
        success: true,
        data: {
          messageId: deleted.id,
          deletedResponseMessageId,
          restoreTokenId,
          undoExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to delete Agent X message', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to delete message' });
    }
  }
);

router.post(
  '/messages/:messageId/undo',
  appGuard,
  validateBody(UndoAgentMessageDto),
  async (req: Request, res: Response) => {
    try {
      if (!chatService) {
        res.status(503).json({ success: false, error: 'Chat service not initialized' });
        return;
      }

      const auth = getAuthUser(req);
      if (!auth) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const messageId = req.params['messageId'] as string;
      if (!isValidObjectId(messageId)) {
        res.status(400).json({ success: false, error: 'Invalid message ID format' });
        return;
      }

      const body = req.body as UndoAgentMessageDto;
      const restored = await chatService.undoSoftDelete({
        messageId,
        userId: auth.uid,
        restoreTokenId: body.restoreTokenId,
      });

      if (!restored) {
        res
          .status(404)
          .json({ success: false, error: 'Message not found or restore token expired' });
        return;
      }

      res.json({ success: true, data: { message: restored } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to undo Agent X message delete', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to restore message' });
    }
  }
);

router.post(
  '/messages/:messageId/feedback',
  appGuard,
  validateBody(AgentMessageFeedbackDto),
  async (req: Request, res: Response) => {
    try {
      if (!chatService) {
        res.status(503).json({ success: false, error: 'Chat service not initialized' });
        return;
      }

      const auth = getAuthUser(req);
      if (!auth) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const messageId = req.params['messageId'] as string;
      if (!isValidObjectId(messageId)) {
        res.status(400).json({ success: false, error: 'Invalid message ID format' });
        return;
      }

      const body = req.body as AgentMessageFeedbackDto;
      const saved = await chatService.setMessageFeedback({
        messageId,
        userId: auth.uid,
        threadId: body.threadId,
        rating: body.rating,
        category: body.category,
        text: body.text,
      });

      if (!saved) {
        res.status(404).json({ success: false, error: 'Message not found' });
        return;
      }

      res.json({ success: true, data: { messageId, feedbackSaved: true } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to submit Agent X message feedback', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to submit feedback' });
    }
  }
);

router.post(
  '/messages/:messageId/annotation',
  appGuard,
  validateBody(AgentMessageAnnotationDto),
  async (req: Request, res: Response) => {
    try {
      if (!chatService) {
        res.status(503).json({ success: false, error: 'Chat service not initialized' });
        return;
      }

      const auth = getAuthUser(req);
      if (!auth) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const messageId = req.params['messageId'] as string;
      if (!isValidObjectId(messageId)) {
        res.status(400).json({ success: false, error: 'Invalid message ID format' });
        return;
      }

      const body = req.body as AgentMessageAnnotationDto;
      await chatService.appendMessageAction({
        messageId,
        userId: auth.uid,
        action: body.action,
        metadata: body.metadata,
      });

      res.json({ success: true });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to annotate Agent X message', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to annotate message' });
    }
  }
);

export default router;
