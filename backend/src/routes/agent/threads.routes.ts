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
import { type AgentThreadCategory, type AgentMessage, type AgentXAttachment } from '@nxt1/core';
import { logger } from '../../utils/logger.js';
import { chatService, isValidObjectId, VALID_THREAD_CATEGORIES } from './shared.js';
import { getStorage, type Storage } from 'firebase-admin/storage';
import { AgentMediaLifecycleService } from '../../modules/agent/tools/media/agent-media-lifecycle.service.js';

const router = Router();

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

async function refreshStorageUrl(
  media: Pick<AgentXAttachment, 'url'> & Partial<Pick<AgentXAttachment, 'storagePath'>>,
  options?: {
    readonly bucketName?: string;
    readonly storageInstance?: Storage;
  }
): Promise<Pick<AgentXAttachment, 'url'> & Partial<Pick<AgentXAttachment, 'storagePath'>>> {
  const storagePath =
    media.storagePath ?? AgentMediaLifecycleService.extractStoragePathFromUrl(media.url);
  if (!storagePath) {
    return media;
  }

  try {
    const bucket = options?.storageInstance
      ? options.storageInstance.bucket(options.bucketName)
      : getStorage().bucket(options?.bucketName);
    const url = await AgentMediaLifecycleService.ensureFirebaseDownloadUrl({
      bucket,
      storagePath,
    });
    return { ...media, url, storagePath };
  } catch {
    return { ...media, storagePath };
  }
}

function isVideoAttachment(attachment: AgentXAttachment): boolean {
  if (attachment.type === 'video') return true;
  if (typeof attachment.mimeType === 'string' && /^video\//i.test(attachment.mimeType)) return true;
  return /\.(?:mp4|mov|m4v|webm|avi|mkv)(?:[?#]|$)/i.test(attachment.url);
}

function isImageStoragePath(path: string): boolean {
  return /\.(?:png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(path);
}

function extractImageStoragePathFromUrl(value: string): string | null {
  const storagePath = AgentMediaLifecycleService.extractStoragePathFromUrl(value);
  return storagePath && isImageStoragePath(storagePath) ? storagePath : null;
}

function isVideoUrl(value: string): boolean {
  return /\.(?:mp4|mov|m4v|webm|avi|mkv)(?:[?#]|$)/i.test(value);
}

function extractVideoUrlsFromContent(content: string | undefined): string[] {
  if (!content) return [];
  const urls = content.match(/https?:\/\/[^\s)\]"'<>]+/gi) ?? [];
  const seen = new Set<string>();
  const videoUrls: string[] = [];
  for (const rawUrl of urls) {
    const url = rawUrl.trim().replace(/[),.;!?]+$/g, '');
    if (!url || seen.has(url) || !isVideoUrl(url)) continue;
    seen.add(url);
    videoUrls.push(url);
  }
  return videoUrls;
}

export async function refreshMessageContentMedia(
  content: string,
  bucketName?: string,
  storageInstance?: Storage
): Promise<string> {
  if (!content.trim()) return content;

  const rawUrls = content.match(/https?:\/\/[^\s<>"'\])]+/gi) ?? [];
  const replacements = new Map<string, string>();

  for (const rawUrl of rawUrls) {
    const url = rawUrl.trim().replace(/[),.;!?]+$/g, '');
    if (!url || replacements.has(url)) continue;

    const storagePath = extractImageStoragePathFromUrl(url);
    if (!storagePath) continue;

    const refreshed = await refreshStorageUrl(
      { url, storagePath },
      { bucketName, storageInstance }
    );
    if (refreshed.url !== url) {
      replacements.set(url, refreshed.url);
    }
  }

  if (replacements.size === 0) return content;

  let refreshedContent = content;
  for (const [oldUrl, newUrl] of replacements) {
    refreshedContent = refreshedContent.split(oldUrl).join(newUrl);
  }
  return refreshedContent;
}

export async function refreshMessagePartsMedia(
  parts: AgentMessage['parts'],
  bucketName?: string,
  storageInstance?: Storage
): Promise<AgentMessage['parts']> {
  if (!parts?.length) return parts;

  let changed = false;
  const refreshedParts = await Promise.all(
    parts.map(async (part) => {
      if (part.type === 'text') {
        const refreshedContent = await refreshMessageContentMedia(
          part.content,
          bucketName,
          storageInstance
        );
        if (refreshedContent === part.content) return part;
        changed = true;
        return { ...part, content: refreshedContent };
      }

      if (part.type === 'image') {
        const storagePath = extractImageStoragePathFromUrl(part.url);
        if (!storagePath) return part;

        const refreshed = await refreshStorageUrl(
          { url: part.url, storagePath },
          { bucketName, storageInstance }
        );
        if (refreshed.url === part.url) return part;

        changed = true;
        return { ...part, url: refreshed.url };
      }

      return part;
    })
  );

  return changed ? refreshedParts : parts;
}

function basenameFromStoragePath(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? 'video.mp4';
}

async function findSiblingVideoThumbnailUrl(params: {
  readonly attachment: AgentXAttachment;
  readonly bucketName: string;
  readonly storageInstance: Storage;
  readonly videoStoragePath?: string;
}): Promise<string | null> {
  const videoStoragePath = params.videoStoragePath;
  if (!videoStoragePath) return null;

  const separatorIndex = videoStoragePath.lastIndexOf('/');
  if (separatorIndex === -1) return null;

  const prefix = `${videoStoragePath.slice(0, separatorIndex + 1)}`;
  const [files] = await params.storageInstance.bucket(params.bucketName).getFiles({ prefix });
  const thumbnail = files.find(
    (file) => file.name !== videoStoragePath && isImageStoragePath(file.name)
  );
  if (!thumbnail) return null;

  const [thumbnailUrl] = await thumbnail.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 15 * 60 * 1000,
  });
  return thumbnailUrl;
}

export async function refreshAttachmentUrl(
  attachment: AgentXAttachment,
  bucketName: string,
  storageInstance: Storage
): Promise<AgentXAttachment> {
  const refreshedMedia = await refreshStorageUrl(
    {
      url: attachment.url,
      ...(attachment.storagePath ? { storagePath: attachment.storagePath } : {}),
    },
    { bucketName, storageInstance }
  );

  const inferredThumbnailUrl =
    typeof attachment.thumbnailUrl === 'string' && attachment.thumbnailUrl.trim().length > 0
      ? null
      : !isVideoAttachment(attachment)
        ? null
        : await findSiblingVideoThumbnailUrl({
            attachment,
            bucketName,
            storageInstance,
            videoStoragePath: refreshedMedia.storagePath,
          });

  const refreshedThumbnail =
    typeof attachment.thumbnailUrl === 'string' && attachment.thumbnailUrl.trim().length > 0
      ? await refreshStorageUrl({ url: attachment.thumbnailUrl }, { bucketName, storageInstance })
      : null;

  return {
    ...attachment,
    url: refreshedMedia.url,
    ...(refreshedMedia.storagePath ? { storagePath: refreshedMedia.storagePath } : {}),
    ...(refreshedThumbnail?.url || inferredThumbnailUrl
      ? { thumbnailUrl: refreshedThumbnail?.url ?? inferredThumbnailUrl ?? undefined }
      : {}),
  };
}

export async function refreshMessageResultDataMedia(
  resultData: AgentMessage['resultData'],
  bucketName?: string,
  storageInstance?: Storage
): Promise<AgentMessage['resultData']> {
  if (!resultData) return resultData;

  const refreshUrlIfNeeded = async (value: string): Promise<string> => {
    const refreshed = await refreshStorageUrl(
      {
        url: value,
      },
      { bucketName, storageInstance }
    );
    return refreshed.url;
  };

  const urlFieldNames = new Set([
    'imageUrl',
    'videoUrl',
    'outputUrl',
    'output_url',
    'outputPath',
    'output_path',
    'thumbnailUrl',
    'posterUrl',
    'poster',
    'url',
    'publicUrl',
    'downloadUrl',
  ]);
  const urlArrayFieldNames = new Set(['persistedMediaUrls', 'mediaUrls', 'imageUrls', 'videoUrls']);
  const visited = new WeakSet<object>();

  const refreshValue = async (
    key: string,
    value: unknown
  ): Promise<{ value: unknown; changed: boolean }> => {
    if (typeof value === 'string') {
      if (!urlFieldNames.has(key) || value.trim().length === 0) {
        return { value, changed: false };
      }
      const refreshedUrl = await refreshUrlIfNeeded(value);
      return { value: refreshedUrl, changed: refreshedUrl !== value };
    }

    if (Array.isArray(value)) {
      let changed = false;
      const refreshedArray = await Promise.all(
        value.map(async (item) => {
          if (typeof item === 'string') {
            if (!urlArrayFieldNames.has(key) || item.trim().length === 0) return item;
            const refreshedUrl = await refreshUrlIfNeeded(item);
            if (refreshedUrl !== item) changed = true;
            return refreshedUrl;
          }

          if (!item || typeof item !== 'object') return item;
          const refreshed = await refreshRecord(item as Record<string, unknown>);
          if (refreshed.changed) changed = true;
          return refreshed.value;
        })
      );
      return { value: changed ? refreshedArray : value, changed };
    }

    if (value && typeof value === 'object') {
      return refreshRecord(value as Record<string, unknown>);
    }

    return { value, changed: false };
  };

  const refreshRecord = async (
    record: Record<string, unknown>
  ): Promise<{ value: Record<string, unknown>; changed: boolean }> => {
    if (visited.has(record)) return { value: record, changed: false };
    visited.add(record);

    let changed = false;
    let nextRecord: Record<string, unknown> | null = null;
    for (const [key, value] of Object.entries(record)) {
      const refreshed = await refreshValue(key, value);
      if (!refreshed.changed) continue;

      nextRecord ??= { ...record };
      nextRecord[key] = refreshed.value;
      changed = true;
    }

    return { value: nextRecord ?? record, changed };
  };

  const refreshed = await refreshRecord(resultData);
  return refreshed.changed ? refreshed.value : resultData;
}

export async function refreshMessageAttachments(
  message: AgentMessage,
  bucketName: string,
  storageInstance: Storage
): Promise<AgentMessage> {
  const refreshedContent = await refreshMessageContentMedia(
    message.content,
    bucketName,
    storageInstance
  );
  const refreshedParts = await refreshMessagePartsMedia(message.parts, bucketName, storageInstance);
  const attachments =
    message.attachments && message.attachments.length > 0 ? message.attachments : null;
  const refreshedAttachments = attachments
    ? await Promise.all(
        attachments.map((attachment) =>
          refreshAttachmentUrl(attachment as AgentXAttachment, bucketName, storageInstance)
        )
      )
    : null;
  const refreshedResultData = await refreshMessageResultDataMedia(
    message.resultData,
    bucketName,
    storageInstance
  );
  const syntheticContentAttachments: AgentXAttachment[] = [];

  if (!refreshedAttachments?.some((attachment) => isVideoAttachment(attachment))) {
    for (const videoUrl of extractVideoUrlsFromContent(refreshedContent)) {
      const storagePath = AgentMediaLifecycleService.extractStoragePathFromUrl(videoUrl);
      if (!storagePath) continue;
      const thumbnailUrl = await findSiblingVideoThumbnailUrl({
        attachment: {
          id: `content-video-${syntheticContentAttachments.length + 1}`,
          url: videoUrl,
          storagePath,
          name: basenameFromStoragePath(storagePath),
          mimeType: 'video/mp4',
          type: 'video',
          sizeBytes: 0,
        },
        bucketName,
        storageInstance,
        videoStoragePath: storagePath,
      });
      if (!thumbnailUrl) continue;
      syntheticContentAttachments.push({
        id: `content-video-${syntheticContentAttachments.length + 1}`,
        url: videoUrl,
        storagePath,
        name: basenameFromStoragePath(storagePath),
        mimeType: 'video/mp4',
        type: 'video',
        sizeBytes: 0,
        thumbnailUrl,
      });
    }
  }

  if (
    refreshedContent === message.content &&
    refreshedParts === message.parts &&
    refreshedAttachments === null &&
    syntheticContentAttachments.length === 0 &&
    refreshedResultData === message.resultData
  ) {
    return message;
  }

  return {
    ...message,
    ...(refreshedContent !== message.content ? { content: refreshedContent } : {}),
    ...(refreshedParts !== message.parts ? { parts: refreshedParts } : {}),
    ...(refreshedAttachments || syntheticContentAttachments.length > 0
      ? { attachments: [...(refreshedAttachments ?? []), ...syntheticContentAttachments] }
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
    const light = req.query['light'] === 'true';

    const result = await chatService.getThreadMessages({ threadId, limit, before });
    const items = light
      ? result.items
      : await (async () => {
          const storageInstance = req.firebase?.storage ?? getStorage();
          const bucketName = storageInstance.bucket().name;
          const refreshedItems = await Promise.all(
            result.items.map((item) => refreshMessageAttachments(item, bucketName, storageInstance))
          );

          // Reconcile any pending upload-outbox entries for this user's thread.
          // No-op when outbox is empty; applies and marks synced when entries exist.
          // Re-sign after reconciliation: reconcile fetches raw MongoDB docs that
          // carry expired signed URLs — refreshMessageAttachments must run again on
          // any message that was updated so the caller always receives fresh URLs.
          const reconciledRaw = await chatService.reconcileUploadOutboxForThread({
            userId: user.uid,
            messages: refreshedItems,
          });

          return Promise.all(
            reconciledRaw.map((item, index) =>
              item === refreshedItems[index]
                ? item
                : refreshMessageAttachments(item, bucketName, storageInstance)
            )
          );
        })();

    res.json({
      success: true,
      data: {
        ...result,
        items,
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
