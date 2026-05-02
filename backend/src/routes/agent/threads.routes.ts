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
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import type { AgentThreadCategory, AgentMessage, AgentXAttachment } from '@nxt1/core';
import { logger } from '../../utils/logger.js';
import { chatService, isValidObjectId, VALID_THREAD_CATEGORIES } from './shared.js';
import { getStorage } from 'firebase-admin/storage';

const router = Router();

function resolveAttachmentTypeFromMimeType(mimeType: string): AgentXAttachment['type'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType === 'text/csv' ||
    mimeType === 'text/plain' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return 'csv';
  }
  return 'doc';
}

function extractLegacyMessageAttachments(message: AgentMessage): readonly AgentXAttachment[] {
  const matches = [
    ...message.content.matchAll(
      /\[Attached (?:file|video): (.+?) \((.+?)\) — (https?:\/\/[^\]]+)\]/g
    ),
  ];

  return matches.map((match, index) => {
    const name = match[1] ?? `attachment-${index + 1}`;
    const mimeType = match[2] ?? 'application/octet-stream';
    const url = match[3] ?? '';
    return {
      id: `${message.id}-legacy-${index + 1}`,
      url,
      name,
      mimeType,
      type: resolveAttachmentTypeFromMimeType(mimeType),
      sizeBytes: 0,
    };
  });
}

function extractStoragePathFromUrl(url: string, bucketName: string): string | null {
  try {
    const parsed = new URL(url);
    const pathname = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    if (pathname.startsWith(`${bucketName}/`)) {
      return pathname.slice(bucketName.length + 1);
    }
    return null;
  } catch {
    return null;
  }
}

async function refreshStorageUrl(
  media: Pick<AgentXAttachment, 'url'> & Partial<Pick<AgentXAttachment, 'storagePath'>>,
  bucketName: string
): Promise<Pick<AgentXAttachment, 'url'> & Partial<Pick<AgentXAttachment, 'storagePath'>>> {
  const storagePath = media.storagePath ?? extractStoragePathFromUrl(media.url, bucketName);
  if (!storagePath) return media;

  try {
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    const storageFile = getStorage().bucket(bucketName).file(storagePath);
    const [signedUrl] = await storageFile.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresAt,
    });

    return {
      ...media,
      url: signedUrl,
      storagePath,
    };
  } catch (err) {
    logger.warn('Failed to refresh attachment signed URL', {
      storagePath,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ...media,
      ...(storagePath ? { storagePath } : {}),
    };
  }
}

async function refreshAttachmentUrl(
  attachment: AgentXAttachment,
  bucketName: string
): Promise<AgentXAttachment> {
  if (attachment.type === 'video') {
    const videoId =
      typeof attachment.cloudflareVideoId === 'string' &&
      attachment.cloudflareVideoId.trim().length > 0
        ? attachment.cloudflareVideoId.trim()
        : null;

    if (videoId) {
      const watchUrl = `https://watch.cloudflarestream.com/${videoId}`;
      return attachment.url === watchUrl ? attachment : { ...attachment, url: watchUrl };
    }

    return attachment;
  }

  const refreshedMedia = await refreshStorageUrl(
    {
      url: attachment.url,
      ...(attachment.storagePath ? { storagePath: attachment.storagePath } : {}),
    },
    bucketName
  );

  return {
    ...attachment,
    url: refreshedMedia.url,
    ...(refreshedMedia.storagePath ? { storagePath: refreshedMedia.storagePath } : {}),
  };
}

async function refreshMessageResultDataMedia(
  resultData: AgentMessage['resultData'],
  bucketName: string
): Promise<AgentMessage['resultData']> {
  if (!resultData) return resultData;

  let refreshedResultData: Record<string, unknown> | null = null;

  const refreshUrlIfNeeded = async (value: string): Promise<string> => {
    const refreshed = await refreshStorageUrl(
      {
        url: value,
      },
      bucketName
    );
    return refreshed.url;
  };

  const refreshField = async (field: 'imageUrl' | 'videoUrl'): Promise<void> => {
    const value = resultData[field];
    if (typeof value !== 'string' || value.trim().length === 0) return;

    const refreshedUrl = await refreshUrlIfNeeded(value);
    if (refreshedUrl !== value) {
      refreshedResultData ??= { ...resultData };
      refreshedResultData[field] = refreshedUrl;
    }
  };

  const refreshArrayField = async (
    field: 'persistedMediaUrls' | 'mediaUrls' | 'imageUrls' | 'videoUrls'
  ): Promise<void> => {
    const value = resultData[field];
    if (!Array.isArray(value) || value.length === 0) return;

    let changed = false;
    const refreshedArray: unknown[] = [];
    for (const item of value) {
      if (typeof item !== 'string' || item.trim().length === 0) {
        refreshedArray.push(item);
        continue;
      }

      const refreshedUrl = await refreshUrlIfNeeded(item);
      if (refreshedUrl !== item) changed = true;
      refreshedArray.push(refreshedUrl);
    }

    if (changed) {
      refreshedResultData ??= { ...resultData };
      refreshedResultData[field] = refreshedArray;
    }
  };

  const refreshFilesField = async (): Promise<void> => {
    const value = resultData['files'];
    if (!Array.isArray(value) || value.length === 0) return;

    let changed = false;
    const refreshedFiles = await Promise.all(
      value.map(async (item) => {
        if (!item || typeof item !== 'object') return item;

        const record = item as Record<string, unknown>;
        let nextRecord: Record<string, unknown> | null = null;

        for (const urlField of ['url', 'downloadUrl'] as const) {
          const current = record[urlField];
          if (typeof current !== 'string' || current.trim().length === 0) continue;

          const refreshedUrl = await refreshUrlIfNeeded(current);
          if (refreshedUrl === current) continue;

          nextRecord ??= { ...record };
          nextRecord[urlField] = refreshedUrl;
          changed = true;
        }

        return nextRecord ?? item;
      })
    );

    if (changed) {
      refreshedResultData ??= { ...resultData };
      refreshedResultData['files'] = refreshedFiles;
    }
  };

  await refreshField('imageUrl');
  await refreshField('videoUrl');
  await refreshArrayField('persistedMediaUrls');
  await refreshArrayField('mediaUrls');
  await refreshArrayField('imageUrls');
  await refreshArrayField('videoUrls');
  await refreshFilesField();

  return refreshedResultData ?? resultData;
}

async function refreshMessageAttachments(message: AgentMessage): Promise<AgentMessage> {
  const bucketName = getStorage().bucket().name;
  const attachments =
    message.attachments && message.attachments.length > 0
      ? message.attachments
      : extractLegacyMessageAttachments(message);
  const refreshedAttachments =
    attachments && attachments.length > 0
      ? await Promise.all(
          attachments.map((attachment) =>
            refreshAttachmentUrl(attachment as AgentXAttachment, bucketName)
          )
        )
      : attachments;
  const refreshedResultData = await refreshMessageResultDataMedia(message.resultData, bucketName);

  if (refreshedAttachments === attachments && refreshedResultData === message.resultData) {
    return message;
  }

  return {
    ...message,
    ...(refreshedAttachments && refreshedAttachments.length > 0
      ? { attachments: refreshedAttachments }
      : {}),
    ...(refreshedResultData ? { resultData: refreshedResultData } : {}),
  };
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

    const thread = await chatService.getThreadWithMetadata(threadId, user.uid);
    if (!thread) {
      res.status(404).json({ success: false, error: 'Thread not found' });
      return;
    }

    const limitParam = req.query['limit'];
    const limit = Math.min(parseInt(typeof limitParam === 'string' ? limitParam : '50') || 50, 200);
    const before = typeof req.query['before'] === 'string' ? req.query['before'] : undefined;

    const result = await chatService.getThreadMessages({ threadId, limit, before });
    const refreshedItems = await Promise.all(
      result.items.map((item) => refreshMessageAttachments(item))
    );

    // Reconcile any pending upload-outbox entries for this user's thread.
    // No-op when outbox is empty; applies and marks synced when entries exist.
    const reconciledItems = await chatService.reconcileUploadOutboxForThread({
      userId: user.uid,
      messages: refreshedItems,
    });

    res.json({
      success: true,
      data: {
        ...result,
        items: reconciledItems,
        thread: {
          id: thread.id,
          latestPausedYieldState: thread.latestPausedYieldState,
        },
      },
    });
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
