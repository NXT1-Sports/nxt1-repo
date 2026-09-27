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
import type { AgentXAttachment } from '@nxt1/core';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { validateBody } from '../../middleware/validation/validation.middleware.js';
import {
  SyncAgentMessageAttachmentDto,
  UpdateAgentMessageDto,
  EditAndResendMessageDto,
  DeleteAgentMessageDto,
  UndoAgentMessageDto,
  AgentMessageFeedbackDto,
  AgentMessageAnnotationDto,
} from '../../dtos/agent-x.dto.js';
import { logger } from '../../utils/logger.js';
import {
  chatService,
  isValidObjectId,
  queueService,
  jobRepository,
  pubsubService,
  activeAbortControllers,
} from './shared.js';
import { AgentMessageEditService } from '../../modules/agent/services/agent-message-edit.service.js';
import { AgentOperationCancellationService } from '../../modules/agent/services/agent-operation-cancellation.service.js';

const router = Router();

function toAgentXAttachment(
  attachment: SyncAgentMessageAttachmentDto['attachment']
): AgentXAttachment {
  return {
    id: attachment.id,
    url: attachment.url as string,
    ...(attachment.storagePath ? { storagePath: attachment.storagePath } : {}),
    name: attachment.name,
    mimeType: attachment.mimeType as string,
    type: attachment.type as AgentXAttachment['type'],
    sizeBytes: attachment.sizeBytes as number,
    ...(attachment.cloudflareVideoId ? { cloudflareVideoId: attachment.cloudflareVideoId } : {}),
    ...(attachment.thumbnailUrl ? { thumbnailUrl: attachment.thumbnailUrl } : {}),
  };
}

function getAuthUser(req: Request): { uid: string } | null {
  const user = (req as Request & { user?: { uid?: string } }).user;
  return user?.uid ? { uid: user.uid } : null;
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

router.post(
  '/messages/attachments/sync',
  appGuard,
  validateBody(SyncAgentMessageAttachmentDto),
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

      const body = req.body as SyncAgentMessageAttachmentDto;
      const attachment = toAgentXAttachment(body.attachment);
      const message = await chatService.syncMessageAttachmentByIdempotencyKey({
        userId: auth.uid,
        idempotencyKey: body.idempotencyKey,
        attachment,
      });

      if (!message) {
        // Message not yet persisted (race: TUS finished before /chat committed).
        // Write to durable outbox — reconciled on next thread-messages load.
        await chatService.queueAttachmentSync({
          userId: auth.uid,
          idempotencyKey: body.idempotencyKey,
          attachment,
        });
        res.json({ success: true, data: { messageId: null, queued: true } });
        return;
      }

      res.json({ success: true, data: { messageId: message.id, queued: false } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to sync Agent X message attachment', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to sync attachment' });
    }
  }
);

async function handleEditAndResend(
  req: Request,
  res: Response,
  body: UpdateAgentMessageDto | EditAndResendMessageDto
) {
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

    const rawMessageId = req.params['messageId'] as string;
    let messageId = rawMessageId;

    if (!isValidObjectId(rawMessageId)) {
      const resolved = await chatService.getMessageByOperationOrId(
        rawMessageId,
        auth.uid,
        body.threadId
      );
      if (resolved) {
        messageId = resolved.id;
      } else {
        res.status(400).json({ success: false, error: 'Invalid message ID format' });
        return;
      }
    }

    const db = req.firebase?.db;
    if (!db || !jobRepository) {
      res.status(503).json({ success: false, error: 'Agent persistence unavailable' });
      return;
    }

    const cancellationService = new AgentOperationCancellationService(
      jobRepository,
      queueService,
      pubsubService,
      chatService
    );
    const editService = new AgentMessageEditService(
      chatService,
      jobRepository,
      queueService,
      cancellationService
    );

    const environment = req.isStaging ? 'staging' : 'production';
    const result = await editService.editAndResend(db, {
      messageId,
      userId: auth.uid,
      threadId: body.threadId,
      message: body.message,
      reason: body.reason,
      expectedRevision: body.expectedRevision,
      idempotencyKey: body.idempotencyKey,
      environment,
      activeAbortControllers,
    });

    if (!result.success) {
      const isNotFound = result.error === 'Message not found';
      const isConflict = result.error?.includes('already been modified');
      const statusCode = isNotFound ? 404 : isConflict ? 409 : 400;
      res.status(statusCode).json({ success: false, error: result.error });
      return;
    }

    res.json(result);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to edit and resend Agent X message', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to edit message' });
  }
}

router.put(
  '/messages/:messageId',
  appGuard,
  validateBody(UpdateAgentMessageDto),
  async (req: Request, res: Response) => {
    await handleEditAndResend(req, res, req.body as UpdateAgentMessageDto);
  }
);

router.post(
  '/messages/:messageId/edit-and-resend',
  appGuard,
  validateBody(EditAndResendMessageDto),
  async (req: Request, res: Response) => {
    await handleEditAndResend(req, res, req.body as EditAndResendMessageDto);
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
