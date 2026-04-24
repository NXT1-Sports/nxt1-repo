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

const router = Router();

const WEBHOOK_SECRET = process.env['CLOUDFLARE_WEBHOOK_SECRET'] ?? '';

function getCloudflareStreamHost(customerCode: string | undefined): string | null {
  if (!customerCode) return null;

  const normalizedCustomerCode = customerCode.startsWith('customer-')
    ? customerCode
    : `customer-${customerCode}`;

  return `https://${normalizedCustomerCode}.cloudflarestream.com`;
}

function buildCloudflarePlaybackUrls(
  videoId: string,
  customerCode: string | undefined,
  playback?: { hls?: string; dash?: string }
): { hlsUrl: string | null; dashUrl: string | null; iframeUrl: string | null } {
  const streamHost = getCloudflareStreamHost(customerCode);

  return {
    hlsUrl: playback?.hls ?? (streamHost ? `${streamHost}/${videoId}/manifest/video.m3u8` : null),
    dashUrl: playback?.dash ?? (streamHost ? `${streamHost}/${videoId}/manifest/video.mpd` : null),
    iframeUrl: streamHost ? `${streamHost}/${videoId}/iframe` : null,
  };
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

      logger.info(`${tag} Proxying webhook to creator environment: ${targetBackendUrl}`);
      try {
        const proxyResponse = await fetch(`${targetBackendUrl}/api/v1/cloudflare-webhook`, {
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
    if (db && nxt1UserId) {
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

        const cache = getCacheService();
        await Promise.all([
          cache.del(`profile:videos:${nxt1UserId}*`),
          cache.del('explore:*'),
          invalidateProfileCaches(nxt1UserId),
        ]);

        logger.info(`${tag} Reconciled persisted highlight post`, {
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

export default router;
