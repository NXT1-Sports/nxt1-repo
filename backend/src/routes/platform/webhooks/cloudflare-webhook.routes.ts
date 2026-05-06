/**
 * @fileoverview Cloudflare Stream Webhook Routes
 * @module @nxt1/backend/routes
 *
 * POST endpoint for Cloudflare Stream notification webhooks.
 * Cloudflare sends events when videos finish processing (ready/errored)
 * or are live-connected. We use these to:
 *   1. Pull processed artifacts (MP4, captions) back to Firebase Storage
 *   2. Delete the ephemeral Cloudflare video after extraction
 *   3. Notify Agent X jobs waiting on video processing
 *
 * Webhook signature verification uses HMAC-SHA256 with the shared secret
 * configured via CLOUDFLARE_WEBHOOK_SECRET env var.
 *
 * @see https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
 */

import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from '../../../utils/logger.js';
import { getCacheService } from '../../../services/core/cache.service.js';
import { invalidateProfileCaches } from '../../profile/shared.js';
import { buildCloudflarePlaybackUrls } from '../../core/upload/shared.js';

const router = Router();

const WEBHOOK_SECRET = process.env['CLOUDFLARE_WEBHOOK_SECRET'] ?? '';

function resolveWebhookPath(
  meta: Record<string, string>
): '/api/v1/cloudflare-webhook' | '/api/v1/staging/cloudflare-webhook' {
  const env = (meta['nxt1_env'] ?? '').trim().toLowerCase();
  return env === 'staging' ? '/api/v1/staging/cloudflare-webhook' : '/api/v1/cloudflare-webhook';
}

function getCloudflareHighlightPostId(cloudflareVideoId: string): string {
  return `cf-stream-${cloudflareVideoId}`;
}

/**
 * Verify Cloudflare webhook signature (HMAC-SHA256).
 *
 * Cloudflare sends the signature in the `Webhook-Signature` header as a
 * hex-encoded HMAC-SHA256 digest of the raw body using the shared secret.
 *
 * @see https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/#verify-webhook-authenticity
 */
function verifySignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  try {
    // Cloudflare sends: time=<timestamp>,sig1=<hex_signature>
    // Parse the signature components
    const parts = signatureHeader.split(',');
    const timePart = parts.find((p) => p.startsWith('time='));
    const sigPart = parts.find((p) => p.startsWith('sig1='));

    if (!timePart || !sigPart) {
      // Fallback: treat entire header as plain hex signature
      const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
    }

    const timestamp = timePart.replace('time=', '');
    const signature = sigPart.replace('sig1=', '');

    // Verify the signature: HMAC-SHA256(secret, timestamp + "." + body)
    const signedPayload = `${timestamp}.${rawBody}`;
    const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

/**
 * POST /api/v1/cloudflare-webhook
 *
 * Receives Cloudflare Stream webhook notifications.
 * Events:
 *   - video.ready:  Video finished processing — download & pull back to Firebase
 *   - video.error:  Video processing failed — log and notify Agent X job
 *   - video.live:   Live stream connected (future use)
 */
router.post('/', async (req: Request, res: Response) => {
  const tag = '[POST /cloudflare-webhook]';

  try {
    // ── 1. Signature verification ────────────────────────────────────────
    if (WEBHOOK_SECRET) {
      const signature = req.headers['webhook-signature'] as string | undefined;
      const rawBody = req.rawBody || JSON.stringify(req.body);

      if (!signature) {
        logger.warn(`${tag} Missing Webhook-Signature header`);
        return res.status(401).json({ error: 'Missing Webhook-Signature header' });
      }

      if (!verifySignature(rawBody, signature, WEBHOOK_SECRET)) {
        logger.warn(`${tag} Invalid webhook signature`);
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } else if (process.env['NODE_ENV'] === 'production') {
      logger.warn(
        `${tag} CLOUDFLARE_WEBHOOK_SECRET not configured — accepting unverified webhooks is insecure`
      );
    }

    // ── 2. Parse payload ─────────────────────────────────────────────────
    const payload = req.body;

    if (!payload || typeof payload !== 'object') {
      logger.warn(`${tag} Empty or invalid payload`);
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const meta = (payload.meta ?? {}) as Record<string, string>;
    const targetBackendUrl = meta['webhook_backend_url'];
    const currentBackendUrl = process.env['BACKEND_URL']?.replace(/\/$/, '');
    const webhookPath = resolveWebhookPath(meta);

    // ── 3. Cross-Environment Proxy Routing ───────────────────────────────
    // Cloudflare Stream only supports exactly 1 global webhook per account.
    // To support dev/staging/prod simultaneously, the video's 'meta' tag stores
    // the backend URL that created it. If this server isn't the creator, we proxy!
    if (targetBackendUrl && currentBackendUrl && targetBackendUrl !== currentBackendUrl) {
      if (
        targetBackendUrl.startsWith('http://localhost') ||
        targetBackendUrl.startsWith('http://127.0.0.1')
      ) {
        logger.debug(`${tag} Ignoring webhook for local dev backend: ${targetBackendUrl}`);
        return res.status(200).json({ ignored: true, reason: 'local_creator' });
      }

      logger.info(`${tag} Proxying webhook to creator environment: ${targetBackendUrl}`, {
        webhookPath,
      });
      try {
        const proxyResponse = await fetch(`${targetBackendUrl}${webhookPath}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Forward the signature so the target environment can verify it too
            'Webhook-Signature': req.headers['webhook-signature'] as string,
          },
          body: req.rawBody || JSON.stringify(payload),
        });

        if (!proxyResponse.ok) {
          logger.warn(`${tag} Proxy target returned non-2xx status: ${proxyResponse.status}`);
        }
        return res.status(proxyResponse.status).json(await proxyResponse.json());
      } catch (err) {
        logger.error(`${tag} Failed to proxy webhook to ${targetBackendUrl}`, { error: err });
        // Return 200 to Cloudflare so it doesn't retry the dead local tunnel endlessly
        return res.status(200).json({ proxied: false, error: 'Proxy fetch failed' });
      }
    }

    // Single global Cloudflare webhook commonly points at /api/v1/cloudflare-webhook.
    // If the payload declares staging but this request is on the production path,
    // internally re-route to the staging path on the same backend.
    const isRequestPathStaging = req.originalUrl.includes('/staging/');
    if (
      !isRequestPathStaging &&
      webhookPath === '/api/v1/staging/cloudflare-webhook' &&
      currentBackendUrl
    ) {
      logger.info(`${tag} Re-routing webhook to staging path on same backend`, {
        currentBackendUrl,
        webhookPath,
      });
      try {
        const rerouteResponse = await fetch(`${currentBackendUrl}${webhookPath}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Webhook-Signature': req.headers['webhook-signature'] as string,
          },
          body: req.rawBody || JSON.stringify(payload),
        });

        if (!rerouteResponse.ok) {
          logger.warn(`${tag} Staging re-route returned non-2xx status: ${rerouteResponse.status}`);
        }
        return res.status(rerouteResponse.status).json(await rerouteResponse.json());
      } catch (err) {
        logger.error(`${tag} Failed to re-route webhook to staging path`, { error: err });
        return res.status(200).json({ proxied: false, error: 'Staging re-route failed' });
      }
    }

    // Cloudflare webhook payload shape:
    // { uid: string, readyToStream: boolean, status: { state: string, errorReasonCode?: string, errorReasonText?: string }, meta: { ... }, ... }
    const videoUid = payload.uid as string | undefined;
    const status = payload.status as
      | { state?: string; errorReasonCode?: string; errorReasonText?: string }
      | undefined;
    const readyToStream = payload.readyToStream as boolean | undefined;

    if (!videoUid) {
      logger.warn(`${tag} Payload missing video uid`);
      return res.status(400).json({ error: 'Missing video uid' });
    }

    const state = status?.state ?? (readyToStream ? 'ready' : 'unknown');
    const nxt1UserId = meta['nxt1_user_id'] ?? null;
    const customerCode = process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'];
    const playback = buildCloudflarePlaybackUrls(videoUid, customerCode, {
      hls:
        typeof payload['playback']?.['hls'] === 'string'
          ? (payload['playback']['hls'] as string)
          : undefined,
      dash:
        typeof payload['playback']?.['dash'] === 'string'
          ? (payload['playback']['dash'] as string)
          : undefined,
    });
    const thumbnailUrl =
      typeof payload['thumbnail'] === 'string'
        ? (payload['thumbnail'] as string)
        : typeof payload['preview'] === 'string'
          ? (payload['preview'] as string)
          : null;

    logger.info(`${tag} Received event`, {
      videoUid,
      state,
      readyToStream,
      nxt1UserId,
      errorCode: status?.errorReasonCode,
    });

    const db = req.firebase?.db;
    if (!db) {
      logger.warn(`${tag} Firestore context unavailable; skipping reconciliation`, {
        videoUid,
        state,
      });
    }

    if (db) {
      const postRef = db.collection('Posts').doc(getCloudflareHighlightPostId(videoUid));
      const postSnap = await postRef.get();

      if (postSnap.exists) {
        const updatePayload: Record<string, unknown> = {
          cloudflareStatus: state,
          readyToStream: readyToStream === true,
          updatedAt: Timestamp.now(),
          playback,
        };

        if (thumbnailUrl) {
          updatePayload['thumbnailUrl'] = thumbnailUrl;
          updatePayload['poster'] = thumbnailUrl;
        }

        if (playback.iframeUrl) {
          updatePayload['mediaUrl'] = playback.iframeUrl;
        }

        if (playback.hlsUrl) {
          updatePayload['videoUrl'] = playback.hlsUrl;
        }

        if (typeof payload['duration'] === 'number') {
          updatePayload['duration'] = payload['duration'] as number;
        }

        if (state === 'error') {
          updatePayload['cloudflareError'] = {
            code: status?.errorReasonCode ?? null,
            message: status?.errorReasonText ?? null,
          };
        } else if (state === 'ready') {
          updatePayload['cloudflareError'] = null;
        }

        await postRef.update(updatePayload);

        // Determine whether this is a team post and resolve team code for cache
        // invalidation. Team posts written by WriteTeamPostTool have a `teamId`
        // field. We look up the team doc to get the `teamCode` slug.
        const existingData = postSnap.data() as Record<string, unknown>;
        const resolvedUserId =
          typeof existingData['userId'] === 'string' && existingData['userId'].trim().length > 0
            ? (existingData['userId'] as string)
            : nxt1UserId;
        const teamId =
          typeof existingData['teamId'] === 'string' ? existingData['teamId'] : undefined;
        let teamCode: string | undefined;
        if (teamId) {
          try {
            const teamSnap = await db.collection('Teams').doc(teamId).get();
            const td = teamSnap.data() as Record<string, unknown> | undefined;
            teamCode =
              typeof td?.['teamCode'] === 'string' ? (td['teamCode'] as string) : undefined;
          } catch {
            // Non-fatal — team cache will expire on TTL
          }
        }

        const cache = getCacheService();
        await Promise.all([
          ...(resolvedUserId
            ? [
                cache.del(`profile:videos:${resolvedUserId}*`),
                invalidateProfileCaches(resolvedUserId),
              ]
            : []),
          cache.del('explore:*'),
          ...(teamCode
            ? [
                cache.delByPrefix(`team:timeline:v1:${teamCode}:`),
                cache.delByPrefix(`team:profile:code:${teamCode}:`),
              ]
            : []),
        ]);

        logger.info(`${tag} Reconciled persisted highlight post`, {
          videoUid,
          postId: getCloudflareHighlightPostId(videoUid),
          state,
          nxt1UserId,
          resolvedUserId,
        });
      } else {
        logger.warn(`${tag} No persisted highlight post found for Cloudflare UID`, {
          videoUid,
          postId: getCloudflareHighlightPostId(videoUid),
          state,
          nxt1UserId,
        });
      }
    }

    // ── 3. Handle event by state ─────────────────────────────────────────
    switch (state) {
      case 'ready': {
        logger.info(`${tag} Video ready for extraction`, {
          videoUid,
          nxt1UserId,
          duration: payload.duration,
        });

        break;
      }

      case 'error': {
        logger.error(`${tag} Video processing failed`, {
          videoUid,
          nxt1UserId,
          errorCode: status?.errorReasonCode,
          errorText: status?.errorReasonText,
        });

        break;
      }

      default: {
        logger.info(`${tag} Unhandled state: ${state}`, {
          videoUid,
          readyToStream,
          state,
        });
      }
    }

    // Always acknowledge receipt — Cloudflare retries on non-2xx
    return res.status(200).json({ received: true, videoUid, state });
  } catch (error) {
    logger.error(`${tag} Webhook processing failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/v1/cloudflare-webhook/repair/:videoId
 *
 * Manually syncs a Cloudflare Stream video's current status into the Firestore
 * post doc. Used when the webhook was not configured or the webhook failed to
 * deliver (e.g., local dev where CF can't reach localhost).
 *
 * The caller must be authenticated (auth middleware applied at route registration).
 */
router.post('/repair/:videoId', async (req: Request, res: Response) => {
  const tag = '[POST /cloudflare-webhook/repair]';
  const { videoId } = req.params;

  if (!videoId || typeof videoId !== 'string') {
    return res.status(400).json({ error: 'Missing videoId' });
  }

  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
  const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
  const customerCode = process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'];

  if (!accountId || !apiToken) {
    return res.status(503).json({ error: 'Cloudflare not configured on this server' });
  }

  try {
    // Fetch current video state from Cloudflare
    const cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${videoId}`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
      }
    );

    if (!cfResponse.ok) {
      const body = await cfResponse.text().catch(() => '');
      logger.warn(`${tag} CF API returned non-2xx`, {
        videoId,
        status: cfResponse.status,
        body: body.slice(0, 200),
      });
      return res.status(502).json({ error: `CF API error: ${cfResponse.status}` });
    }

    const cfBody = (await cfResponse.json()) as Record<string, unknown>;
    const result = cfBody['result'] as Record<string, unknown> | null | undefined;
    if (!result) {
      return res.status(404).json({ error: 'Video not found in Cloudflare' });
    }

    const state = (result['status'] as Record<string, string> | undefined)?.['state'] ?? 'unknown';
    const readyToStream = result['readyToStream'] === true;
    const cfPlayback = result['playback'] as Record<string, string> | undefined;
    const thumbnailUrl =
      typeof result['thumbnail'] === 'string'
        ? result['thumbnail']
        : typeof result['preview'] === 'string'
          ? result['preview']
          : null;

    const playback = buildCloudflarePlaybackUrls(videoId, customerCode, {
      hls: cfPlayback?.['hls'],
      dash: cfPlayback?.['dash'],
    });

    const db = req.firebase?.db;
    if (!db) {
      return res.status(503).json({ error: 'Firestore not available' });
    }

    const postRef = db.collection('Posts').doc(getCloudflareHighlightPostId(videoId));
    const postSnap = await postRef.get();

    if (!postSnap.exists) {
      return res
        .status(404)
        .json({ error: `Post doc cf-stream-${videoId} not found in Firestore` });
    }

    const existingData = postSnap.data() as Record<string, unknown>;
    const nxt1UserId = typeof existingData['userId'] === 'string' ? existingData['userId'] : null;

    const updatePayload: Record<string, unknown> = {
      cloudflareStatus: state,
      readyToStream,
      updatedAt: Timestamp.now(),
      playback,
    };

    if (thumbnailUrl) {
      updatePayload['thumbnailUrl'] = thumbnailUrl;
      updatePayload['poster'] = thumbnailUrl;
    }

    if (playback.iframeUrl) {
      updatePayload['mediaUrl'] = playback.iframeUrl;
    }

    if (playback.hlsUrl) {
      updatePayload['videoUrl'] = playback.hlsUrl;
    }

    if (typeof result['duration'] === 'number') {
      updatePayload['duration'] = result['duration'];
    }

    if (state === 'ready') {
      updatePayload['cloudflareError'] = null;
    }

    await postRef.update(updatePayload);

    // Invalidate caches
    if (nxt1UserId) {
      const teamId =
        typeof existingData['teamId'] === 'string' ? existingData['teamId'] : undefined;
      let teamCode: string | undefined;
      if (teamId) {
        try {
          const teamSnap = await db.collection('Teams').doc(teamId).get();
          const td = teamSnap.data() as Record<string, unknown> | undefined;
          teamCode = typeof td?.['teamCode'] === 'string' ? (td['teamCode'] as string) : undefined;
        } catch {
          /* non-fatal */
        }
      }

      const cache = getCacheService();
      await Promise.all([
        cache.del(`profile:videos:${nxt1UserId}*`),
        cache.del('explore:*'),
        invalidateProfileCaches(nxt1UserId),
        ...(teamCode
          ? [
              cache.delByPrefix(`team:timeline:v1:${teamCode}:`),
              cache.delByPrefix(`team:profile:code:${teamCode}:`),
            ]
          : []),
      ]);
    }

    logger.info(`${tag} Repaired stuck post`, {
      videoId,
      state,
      readyToStream,
      iframeUrl: playback.iframeUrl,
    });

    return res.status(200).json({
      repaired: true,
      videoId,
      postId: getCloudflareHighlightPostId(videoId),
      state,
      readyToStream,
      iframeUrl: playback.iframeUrl,
    });
  } catch (error) {
    logger.error(`${tag} Repair failed`, {
      videoId,
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: 'Repair failed' });
  }
});

/**
 * POST /api/v1/staging/cloudflare-webhook/repair-team/:teamId
 *
 * Bulk-repairs all stuck video posts for a team — i.e. posts where
 * cloudflareVideoId is set but readyToStream is false (status: inprogress).
 *
 * This was needed because WriteTeamPostTool historically set nxt1_env to
 * NODE_ENV ('production') in Cloudflare video metadata, causing the CF webhook
 * to update the production Firestore doc instead of the staging one, leaving
 * team video posts permanently stuck at cloudflareStatus: 'inprogress'.
 *
 * The caller must be authenticated (auth middleware applied at route registration).
 */
router.post('/repair-team/:teamId', async (req: Request, res: Response) => {
  const tag = '[POST /cloudflare-webhook/repair-team]';
  const { teamId } = req.params;

  if (!teamId || typeof teamId !== 'string') {
    return res.status(400).json({ error: 'Missing teamId' });
  }

  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
  const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
  const customerCode = process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'];

  if (!accountId || !apiToken) {
    return res.status(503).json({ error: 'Cloudflare not configured on this server' });
  }

  const db = req.firebase?.db;
  if (!db) {
    return res.status(503).json({ error: 'Firestore not available' });
  }

  try {
    // Find all video posts for this team that are stuck (readyToStream !== true)
    const stuckSnap = await db
      .collection('Posts')
      .where('teamId', '==', teamId)
      .where('type', '==', 'video')
      .where('readyToStream', '==', false)
      .get();

    if (stuckSnap.empty) {
      return res.status(200).json({ repaired: 0, skipped: 0, message: 'No stuck posts found' });
    }

    logger.info(`${tag} Found stuck video posts`, { teamId, count: stuckSnap.docs.length });

    const results: Array<{ postId: string; videoId: string; state: string; repaired: boolean }> =
      [];

    for (const postDoc of stuckSnap.docs) {
      const data = postDoc.data() as Record<string, unknown>;
      const cloudflareVideoId =
        typeof data['cloudflareVideoId'] === 'string' ? data['cloudflareVideoId'] : null;

      if (!cloudflareVideoId) {
        results.push({ postId: postDoc.id, videoId: '', state: 'no_cf_id', repaired: false });
        continue;
      }

      try {
        const cfResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${cloudflareVideoId}`,
          { headers: { Authorization: `Bearer ${apiToken}` } }
        );

        if (!cfResponse.ok) {
          logger.warn(`${tag} CF API non-2xx for video`, {
            cloudflareVideoId,
            status: cfResponse.status,
          });
          results.push({
            postId: postDoc.id,
            videoId: cloudflareVideoId,
            state: `cf_error_${cfResponse.status}`,
            repaired: false,
          });
          continue;
        }

        const cfBody = (await cfResponse.json()) as Record<string, unknown>;
        const result = cfBody['result'] as Record<string, unknown> | null | undefined;
        if (!result) {
          results.push({
            postId: postDoc.id,
            videoId: cloudflareVideoId,
            state: 'cf_not_found',
            repaired: false,
          });
          continue;
        }

        const state =
          (result['status'] as Record<string, string> | undefined)?.['state'] ?? 'unknown';
        const readyToStream = result['readyToStream'] === true;
        const cfPlayback = result['playback'] as Record<string, string> | undefined;
        const thumbnailUrl =
          typeof result['thumbnail'] === 'string'
            ? result['thumbnail']
            : typeof result['preview'] === 'string'
              ? result['preview']
              : null;

        const playback = buildCloudflarePlaybackUrls(cloudflareVideoId, customerCode, {
          hls: cfPlayback?.['hls'],
          dash: cfPlayback?.['dash'],
        });

        const updatePayload: Record<string, unknown> = {
          cloudflareStatus: state,
          readyToStream,
          updatedAt: Timestamp.now(),
          playback,
        };

        if (thumbnailUrl) {
          updatePayload['thumbnailUrl'] = thumbnailUrl;
          updatePayload['poster'] = thumbnailUrl;
        }
        if (playback.iframeUrl) updatePayload['mediaUrl'] = playback.iframeUrl;
        if (playback.hlsUrl) updatePayload['videoUrl'] = playback.hlsUrl;
        if (typeof result['duration'] === 'number') updatePayload['duration'] = result['duration'];
        if (state === 'ready') updatePayload['cloudflareError'] = null;

        await postDoc.ref.update(updatePayload);
        results.push({ postId: postDoc.id, videoId: cloudflareVideoId, state, repaired: true });

        logger.info(`${tag} Repaired stuck team video post`, {
          teamId,
          postId: postDoc.id,
          cloudflareVideoId,
          state,
          readyToStream,
        });
      } catch (err) {
        logger.error(`${tag} Failed to repair individual post`, {
          postId: postDoc.id,
          cloudflareVideoId,
          error: err instanceof Error ? err.message : String(err),
        });
        results.push({
          postId: postDoc.id,
          videoId: cloudflareVideoId,
          state: 'repair_error',
          repaired: false,
        });
      }
    }

    // Invalidate team caches after bulk repair
    const teamSnap = await db
      .collection('Teams')
      .doc(teamId)
      .get()
      .catch(() => null);
    const td = teamSnap?.data() as Record<string, unknown> | undefined;
    const teamCode = typeof td?.['teamCode'] === 'string' ? td['teamCode'] : undefined;

    if (teamCode) {
      const cache = getCacheService();
      await Promise.all([
        cache.delByPrefix(`team:timeline:v1:${teamCode}:`),
        cache.delByPrefix(`team:profile:code:${teamCode}:`),
      ]);
    }

    const repairedCount = results.filter((r) => r.repaired).length;
    logger.info(`${tag} Bulk repair complete`, { teamId, repairedCount, total: results.length });

    return res.status(200).json({
      repaired: repairedCount,
      skipped: results.length - repairedCount,
      results,
    });
  } catch (error) {
    logger.error(`${tag} Bulk repair failed`, {
      teamId,
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: 'Bulk repair failed' });
  }
});

export default router;
