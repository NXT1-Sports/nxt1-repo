import { Router } from 'express';
import type { Request, Response, Router as RouterType } from 'express';
import { asyncHandler } from '@nxt1/core/errors/express';
import { fieldError, forbiddenError as _forbiddenError } from '@nxt1/core/errors';
import { uploadRateLimit } from '../../../middleware/rate-limit/rate-limit.middleware.js';
import { FILE_UPLOAD_RULES, formatFileSize } from '@nxt1/core';
import type { FileCategory } from '@nxt1/core';
import { logger } from '../../../utils/logger.js';
import { getCacheService } from '../../../services/core/cache.service.js';
import { invalidateProfileCaches } from '../../profile/shared.js';
import { buildVideoSearchIndex } from '../../../utils/search-index.js';
import { Timestamp } from 'firebase-admin/firestore';
import { PostVisibility } from '@nxt1/core';
import {
  CLOUDFLARE_API_BASE_URL,
  DEFAULT_CF_VIDEO_MAX_DURATION_SECONDS,
  DEFAULT_CF_UPLOAD_EXPIRY_HOURS,
  POSTS_COLLECTION,
  type CloudflareVideoFinalizeResponse,
  type PersistedHighlightVideoPostResponse,
  parseTusMetadataHeader,
  buildTusMetadataHeader,
  getTusMetadataValue,
  buildCloudflareVideoName,
  extractCloudflareVideoId,
  fetchCloudflareFinalizedVideo,
  getCloudflareHighlightPostId,
  trimOptionalString,
  parsePinnedFlag,
  parsePostVisibility,
  toVisibilityType,
  buildDefaultHighlightTitle,
} from './shared.js';

const router: RouterType = Router();

// ============================================
// POST /cloudflare/direct-url
// ============================================

router.post(
  '/cloudflare/direct-url',
  uploadRateLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.uid;
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];

    if (!accountId || !apiToken) {
      logger.error('Cloudflare direct upload requested without env configuration');
      return res.status(503).json({
        success: false,
        error: 'Cloudflare direct uploads are not configured',
      });
    }

    const tusResumable = req.headers['tus-resumable'];
    if (Array.isArray(tusResumable) || tusResumable !== '1.0.0') {
      throw fieldError('Tus-Resumable', 'Tus-Resumable header must be 1.0.0', 'required');
    }

    const uploadLengthHeader = req.headers['upload-length'];
    if (!uploadLengthHeader || Array.isArray(uploadLengthHeader)) {
      throw fieldError('Upload-Length', 'Upload-Length header is required', 'required');
    }

    const fileSize = Number(uploadLengthHeader);
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      throw fieldError('Upload-Length', 'Upload-Length must be a positive number', 'invalid');
    }

    const clientMetadata = parseTusMetadataHeader(req.headers['upload-metadata']);
    const fileName = getTusMetadataValue(clientMetadata, ['filename', 'fileName', 'name']);
    const mimeType = getTusMetadataValue(clientMetadata, ['filetype', 'mimeType', 'mimetype']);
    const uploadContext =
      getTusMetadataValue(clientMetadata, ['context', 'uploadcontext', 'uploadContext']) ??
      'general';
    const requestedDuration = getTusMetadataValue(clientMetadata, [
      'maxdurationseconds',
      'maxDurationSeconds',
    ]);

    if (!fileName) {
      throw fieldError(
        'Upload-Metadata',
        'Upload-Metadata must include filename metadata',
        'required'
      );
    }

    if (!mimeType) {
      throw fieldError(
        'Upload-Metadata',
        'Upload-Metadata must include filetype metadata',
        'required'
      );
    }

    const category: FileCategory = 'highlight-video';
    const rules = FILE_UPLOAD_RULES[category];
    const allowedTypes = rules.allowedTypes as readonly string[];

    if (!allowedTypes.includes(mimeType)) {
      throw fieldError(
        'filetype',
        `File type ${mimeType} not allowed. Allowed: ${allowedTypes.join(', ')}`,
        'invalid'
      );
    }

    if (fileSize > rules.maxSize) {
      throw fieldError(
        'Upload-Length',
        `File must be smaller than ${formatFileSize(rules.maxSize)}`,
        'maxSize'
      );
    }

    const parsedMaxDuration = requestedDuration ? Number(requestedDuration) : NaN;
    const maxDurationSeconds = Number.isFinite(parsedMaxDuration)
      ? Math.min(Math.max(parsedMaxDuration, 1), 36_000)
      : DEFAULT_CF_VIDEO_MAX_DURATION_SECONDS;

    // Use req.isStaging (set from the URL path by firebaseContext middleware)
    // NOT NODE_ENV — so that a single server instance handles both environments:
    // POST /api/v1/staging/upload/... → 'staging' → CF webhook updates stagingDb
    // POST /api/v1/upload/...         → 'production' → CF webhook updates productionDb
    const environment: 'staging' | 'production' = req.isStaging ? 'staging' : 'production';
    const backendUrl = process.env['BACKEND_URL']?.replace(/\/$/, '') ?? '';
    const expiresAt = new Date(
      Date.now() + DEFAULT_CF_UPLOAD_EXPIRY_HOURS * 60 * 60 * 1000
    ).toISOString();
    const videoName = buildCloudflareVideoName(userId, uploadContext, fileName);

    const upstreamMetadata = buildTusMetadataHeader({
      name: videoName,
      maxDurationSeconds: String(maxDurationSeconds),
      expiry: expiresAt,
      nxt1_user_id: userId,
      nxt1_context: uploadContext,
      nxt1_env: environment,
      nxt1_file_name: fileName,
      nxt1_mime_type: mimeType,
      ...(backendUrl ? { webhook_backend_url: backendUrl } : {}),
    });

    const response = await fetch(
      `${CLOUDFLARE_API_BASE_URL}/accounts/${accountId}/stream?direct_user=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Tus-Resumable': '1.0.0',
          'Upload-Length': String(fileSize),
          'Upload-Metadata': upstreamMetadata,
          'Upload-Creator': userId,
        },
      }
    );

    if (!response.ok) {
      let details = `status ${response.status}`;
      try {
        const body = (await response.json()) as {
          errors?: Array<{ message?: string }>;
          messages?: Array<{ message?: string }>;
        };
        const message = body.errors?.[0]?.message ?? body.messages?.[0]?.message;
        if (message) details = message;
      } catch {
        // Keep fallback status string
      }

      logger.error('Cloudflare direct upload provisioning failed', {
        userId,
        fileName,
        mimeType,
        fileSize,
        details,
      });

      return res.status(502).json({
        success: false,
        error: `Cloudflare direct upload provisioning failed: ${details}`,
      });
    }

    const uploadUrl = response.headers.get('Location');
    const cloudflareVideoId = uploadUrl ? extractCloudflareVideoId(uploadUrl) : null;

    if (!uploadUrl || !cloudflareVideoId) {
      logger.error('Cloudflare direct upload provisioning returned no Location header', {
        userId,
        fileName,
      });
      return res.status(502).json({
        success: false,
        error: 'Cloudflare direct upload provisioning returned no upload URL',
      });
    }

    logger.info('Provisioned Cloudflare tus direct upload URL', {
      userId,
      fileName,
      mimeType,
      fileSize: formatFileSize(fileSize),
      uploadContext,
      cloudflareVideoId,
    });

    res.setHeader('Access-Control-Expose-Headers', 'Location, Stream-Media-Id');
    res.setHeader('Location', uploadUrl);
    res.setHeader('Stream-Media-Id', cloudflareVideoId);

    return res.status(201).json({
      success: true,
      data: {
        uploadUrl,
        cloudflareVideoId,
        uploadMethod: 'tus',
        tusResumable: '1.0.0',
        expiresAt,
        maxSize: rules.maxSize,
        maxDurationSeconds,
        name: videoName,
        metadata: {
          userId,
          context: uploadContext,
          environment,
          originalFileName: fileName,
          mimeType,
        },
      },
    });
  })
);

// ============================================
// POST /cloudflare/finalize
// ============================================

router.post(
  '/cloudflare/finalize',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.uid;
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
    const customerCode = process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'];

    if (!accountId || !apiToken) {
      logger.error('Cloudflare finalize requested without env configuration');
      return res.status(503).json({
        success: false,
        error: 'Cloudflare direct uploads are not configured',
      });
    }

    const cloudflareVideoId =
      typeof req.body?.['cloudflareVideoId'] === 'string'
        ? (req.body['cloudflareVideoId'] as string).trim()
        : '';

    if (!cloudflareVideoId) {
      throw fieldError('cloudflareVideoId', 'cloudflareVideoId is required', 'required');
    }

    let finalized: CloudflareVideoFinalizeResponse;
    try {
      finalized = await fetchCloudflareFinalizedVideo(
        userId,
        cloudflareVideoId,
        accountId,
        apiToken,
        customerCode
      );
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error) {
        throw error;
      }

      return res.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : 'Cloudflare finalize failed',
      });
    }

    logger.info('Finalized Cloudflare direct upload session', {
      userId,
      cloudflareVideoId,
      status: finalized.status,
      readyToStream: finalized.readyToStream,
      context: finalized.metadata.context,
    });

    return res.json({
      success: true,
      data: finalized,
    });
  })
);

// ============================================
// POST /cloudflare/highlight-post
// ============================================

router.post(
  '/cloudflare/highlight-post',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.uid;
    const db = req.firebase!.db;
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
    const customerCode = process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'];

    if (!accountId || !apiToken) {
      logger.error('Cloudflare highlight persistence requested without env configuration');
      return res.status(503).json({
        success: false,
        error: 'Cloudflare direct uploads are not configured',
      });
    }

    const cloudflareVideoId =
      typeof req.body?.['cloudflareVideoId'] === 'string'
        ? (req.body['cloudflareVideoId'] as string).trim()
        : '';

    if (!cloudflareVideoId) {
      throw fieldError('cloudflareVideoId', 'cloudflareVideoId is required', 'required');
    }

    let finalized: CloudflareVideoFinalizeResponse;
    try {
      finalized = await fetchCloudflareFinalizedVideo(
        userId,
        cloudflareVideoId,
        accountId,
        apiToken,
        customerCode
      );
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error) {
        throw error;
      }

      return res.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : 'Cloudflare highlight persistence failed',
      });
    }

    const title = trimOptionalString(req.body?.['title'], 'title', 200);
    const content = trimOptionalString(req.body?.['content'], 'content', 2000);
    const sportId = trimOptionalString(req.body?.['sportId'], 'sportId', 100);
    const teamId = trimOptionalString(req.body?.['teamId'], 'teamId', 100);
    const organizationId = trimOptionalString(req.body?.['organizationId'], 'organizationId', 100);
    const isPinned = parsePinnedFlag(req.body?.['isPinned']);
    const requestedVisibility = parsePostVisibility(req.body?.['visibility']);

    const postId = getCloudflareHighlightPostId(cloudflareVideoId);
    const postRef = db.collection(POSTS_COLLECTION).doc(postId);
    const existingSnapshot = await postRef.get();
    const existingData = existingSnapshot.exists
      ? ((existingSnapshot.data() as Record<string, unknown>) ?? {})
      : {};

    const thumbnailUrl =
      finalized.thumbnailUrl ??
      finalized.previewUrl ??
      (existingData['thumbnailUrl'] as string | undefined) ??
      null;
    const mediaUrl =
      finalized.playback.iframeUrl ??
      (existingData['mediaUrl'] as string | undefined) ??
      finalized.playback.hlsUrl ??
      null;
    const createdAt = existingSnapshot.exists
      ? ((existingData['createdAt'] as Timestamp | undefined) ?? Timestamp.now())
      : finalized.uploadedAt
        ? Timestamp.fromDate(new Date(finalized.uploadedAt))
        : Timestamp.now();
    const updatedAt = Timestamp.now();
    const resolvedTitle =
      title ??
      (typeof existingData['title'] === 'string' ? (existingData['title'] as string) : undefined) ??
      buildDefaultHighlightTitle(finalized);
    const resolvedContent =
      content ??
      (typeof existingData['content'] === 'string' ? (existingData['content'] as string) : '') ??
      '';
    const visibility =
      requestedVisibility ??
      (existingData['visibility'] as PostVisibility | undefined) ??
      PostVisibility.PUBLIC;
    const tags = Array.isArray(existingData['tags']) ? (existingData['tags'] as string[]) : [];
    const searchIndex = buildVideoSearchIndex({
      title: resolvedTitle,
      description: resolvedContent,
      sport: sportId ?? (existingData['sportId'] as string | undefined),
      tags,
    });

    const payload: Record<string, unknown> = {
      id: postId,
      userId,
      ownerType: 'user',
      type: 'video',
      visibility,
      isPublic: visibility === PostVisibility.PUBLIC,
      title: resolvedTitle,
      content: resolvedContent,
      url: mediaUrl,
      mediaUrl,
      videoUrl:
        finalized.playback.hlsUrl ?? (existingData['videoUrl'] as string | undefined) ?? mediaUrl,
      thumbnailUrl,
      poster: thumbnailUrl,
      previewUrl:
        finalized.previewUrl ?? (existingData['previewUrl'] as string | undefined) ?? null,
      duration:
        finalized.durationSeconds ??
        ((typeof existingData['duration'] === 'number' ? existingData['duration'] : undefined) as
          | number
          | undefined) ??
        null,
      cloudflareVideoId,
      cloudflareStatus: finalized.status,
      readyToStream: finalized.readyToStream,
      playback: finalized.playback,
      cloudflareMetadata: finalized.metadata,
      uploadProvider: 'cloudflare-stream',
      searchIndex,
      tags,
      stats:
        (existingData['stats'] as Record<string, unknown> | undefined) ??
        ({ shares: 0, views: 0 } satisfies Record<string, number>),
      createdAt,
      updatedAt,
      ...((sportId ?? existingData['sportId'])
        ? { sportId: sportId ?? existingData['sportId'] }
        : {}),
      ...((teamId ?? existingData['teamId']) ? { teamId: teamId ?? existingData['teamId'] } : {}),
      ...((organizationId ?? existingData['organizationId'])
        ? { organizationId: organizationId ?? existingData['organizationId'] }
        : {}),
      ...((isPinned ?? existingData['isPinned'] !== undefined)
        ? { isPinned: isPinned ?? (existingData['isPinned'] as boolean) }
        : {}),
    };

    await postRef.set(payload);

    const cache = getCacheService();
    await Promise.all([
      cache.del(`profile:videos:${userId}*`),
      cache.del('explore:*'),
      invalidateProfileCaches(userId),
    ]);

    const responseBody: PersistedHighlightVideoPostResponse = {
      postId,
      cloudflareVideoId,
      status: finalized.status,
      readyToStream: finalized.readyToStream,
      title: resolvedTitle,
      content: resolvedContent,
      thumbnailUrl,
      mediaUrl,
      duration: finalized.durationSeconds,
      visibility: toVisibilityType(visibility),
      createdAt: createdAt.toDate().toISOString(),
      updatedAt: updatedAt.toDate().toISOString(),
      playback: finalized.playback,
    };

    logger.info('Persisted Cloudflare highlight post', {
      userId,
      postId,
      cloudflareVideoId,
      readyToStream: finalized.readyToStream,
      status: finalized.status,
    });

    return res.json({
      success: true,
      data: responseBody,
    });
  })
);

export default router;
