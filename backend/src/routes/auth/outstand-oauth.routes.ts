import { FieldValue } from 'firebase-admin/firestore';
import { Router } from 'express';
import type { Request, Response, Router as RouterType } from 'express';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { internalError, validationError } from '@nxt1/core/errors';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import { invalidateProfileCaches } from '../profile/shared.js';
import {
  OutstandSocialBridgeService,
  OutstandSocialPlatformSchema,
  type OutstandSocialPlatform,
} from '../../modules/agent/tools/integrations/outstand-social/index.js';
import {
  ALLOWED_MOBILE_SCHEMES,
  decodeOAuthState,
  encodeOAuthState,
  getDefaultFrontendUrl,
  isAllowedOrigin,
} from './shared.js';

const router: RouterType = Router();

let bridgeSingleton: OutstandSocialBridgeService | null = null;

function getBridge(): OutstandSocialBridgeService {
  if (bridgeSingleton) {
    return bridgeSingleton;
  }

  bridgeSingleton = new OutstandSocialBridgeService();
  return bridgeSingleton;
}

function parsePlatform(value: unknown): OutstandSocialPlatform | null {
  const parsed = OutstandSocialPlatformSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function resolveBackendBaseUrl(req: Request): string {
  const configured = process.env['BACKEND_URL']?.trim();
  const forwardedHostHeader = req.headers['x-forwarded-host'];
  const forwardedProtoHeader = req.headers['x-forwarded-proto'];

  const forwardedHost =
    typeof forwardedHostHeader === 'string' ? forwardedHostHeader.split(',')[0]?.trim() : undefined;
  const forwardedProto =
    typeof forwardedProtoHeader === 'string'
      ? forwardedProtoHeader.split(',')[0]?.trim()
      : undefined;

  const host = forwardedHost || req.get('host')?.trim();
  const protocol =
    forwardedProto ||
    req.protocol ||
    (configured ? new URL(configured).protocol.replace(':', '') : undefined);

  if (host && protocol) {
    return `${protocol}://${host}`;
  }

  return configured || 'http://localhost:3000';
}

function buildCallbackUrl(
  req: Request,
  platform: OutstandSocialPlatform,
  statePayload: string
): string {
  const backendUrl = resolveBackendBaseUrl(req);
  const pathPrefix = req.isStaging ? '/api/v1/staging' : '/api/v1';

  const callback = new URL(`${backendUrl}${pathPrefix}/auth/outstand/callback`);
  callback.searchParams.set('platform', platform);
  callback.searchParams.set('state', statePayload);

  return callback.toString();
}

router.get(
  '/outstand/connect-url',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    const uid = req.user!.uid;
    const platform = parsePlatform(req.query['platform']);
    const origin = (req.query['origin'] as string | undefined)?.trim();
    const mobileScheme = (req.query['mobileScheme'] as string | undefined)?.trim();

    if (!platform) {
      sendError(
        res,
        validationError([
          {
            field: 'platform',
            message: 'platform must be one of: x, instagram, youtube, tiktok',
            rule: 'invalid',
          },
        ])
      );
      return;
    }

    if (origin && !isAllowedOrigin(origin, req.isStaging)) {
      sendError(
        res,
        validationError([{ field: 'origin', message: 'Origin not allowed', rule: 'invalid' }])
      );
      return;
    }

    if (mobileScheme && !ALLOWED_MOBILE_SCHEMES.has(mobileScheme)) {
      sendError(
        res,
        validationError([
          { field: 'mobileScheme', message: 'Unknown mobile scheme', rule: 'invalid' },
        ])
      );
      return;
    }

    const statePayload = mobileScheme
      ? encodeOAuthState(uid, '', mobileScheme)
      : origin
        ? encodeOAuthState(uid, origin)
        : uid;

    const callbackUrl = buildCallbackUrl(req, platform, statePayload);

    try {
      const bridge = getBridge();
      const url = await bridge.getAuthUrl(platform, callbackUrl);
      res.json({ url, state: statePayload, platform, callbackUrl });
    } catch (error) {
      logger.error('[Outstand OAuth] Failed to generate connect URL', {
        uid,
        platform,
        error: error instanceof Error ? error.message : String(error),
      });
      sendError(res, internalError(new Error('Failed to initialize Outstand OAuth flow')));
    }
  })
);

router.get(
  '/outstand/callback',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const platform = parsePlatform(req.query['platform']);
    const rawState = (req.query['state'] as string | undefined) ?? '';
    const oauthError = (req.query['error'] as string | undefined)?.trim();
    const pendingConnectionId = (req.query['pending_connection_id'] as string | undefined)?.trim();
    const connectionId = (req.query['connection_id'] as string | undefined)?.trim();
    const socialAccountId = (req.query['social_account_id'] as string | undefined)?.trim();
    const code = (req.query['code'] as string | undefined)?.trim();

    const { uid, origin: stateOrigin, mobileScheme } = decodeOAuthState(rawState);

    const renderResult = (success: boolean, message: string): void => {
      const params = new URLSearchParams({
        provider: 'outstand',
        platform: platform ?? 'unknown',
        success: String(success),
        message,
      });

      if (mobileScheme && ALLOWED_MOBILE_SCHEMES.has(mobileScheme)) {
        res.redirect(`${mobileScheme}://oauth/callback?${params.toString()}`);
        return;
      }

      const frontendUrl =
        stateOrigin && isAllowedOrigin(stateOrigin, req.isStaging)
          ? stateOrigin
          : getDefaultFrontendUrl(req.isStaging);

      res.redirect(`${frontendUrl}/oauth/success?${params.toString()}`);
    };

    if (oauthError) {
      renderResult(
        false,
        oauthError === 'access_denied' ? 'Connection cancelled' : `OAuth error: ${oauthError}`
      );
      return;
    }

    if (!uid || !platform) {
      renderResult(false, 'Invalid callback - missing uid or platform');
      return;
    }

    try {
      const bridge = getBridge();
      const account = await bridge.resolveConnectedSocialAccount({
        platform,
        pendingConnectionId,
        connectionId,
        code,
        socialAccountId,
      });

      const now = new Date().toISOString();
      const userRef = req.firebase!.db.collection('Users').doc(uid);
      const oauthTokenRef = userRef.collection('oauthTokens').doc(`outstand-${platform}`);

      const batch = req.firebase!.db.batch();
      batch.set(
        userRef,
        {
          connectedSocialAccounts: {
            [platform]: {
              outstandAccountId: account.id,
              network: account.network,
              username: account.username,
              displayName: account.displayName ?? null,
              profileUrl: account.profileUrl ?? null,
              followerCount: account.followerCount ?? 0,
              connectedAt: account.connectedAt ?? now,
              lastSyncedAt: now,
              isActive: account.isActive,
            },
          },
          updatedAt: now,
        },
        { merge: true }
      );

      batch.set(
        oauthTokenRef,
        {
          provider: 'outstand',
          platform,
          socialAccountId: account.id,
          connectedAt: now,
          updatedAt: now,
          lastRefreshedAt: now,
        },
        { merge: true }
      );

      await batch.commit();

      await invalidateProfileCaches(uid).catch((error) => {
        logger.warn('[Outstand OAuth] Cache invalidation failed after connect', {
          uid,
          platform,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      renderResult(true, `${platform} connected successfully`);
    } catch (error) {
      logger.error('[Outstand OAuth] callback failed', {
        uid,
        platform,
        error: error instanceof Error ? error.message : String(error),
      });
      renderResult(false, 'Failed to finalize Outstand connection');
    }
  })
);

router.post(
  '/outstand/disconnect',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const uid = req.user!.uid;
    const platform = parsePlatform(req.body?.platform);

    if (!platform) {
      sendError(
        res,
        validationError([
          {
            field: 'platform',
            message: 'platform must be one of: x, instagram, youtube, tiktok',
            rule: 'invalid',
          },
        ])
      );
      return;
    }

    const userRef = req.firebase!.db.collection('Users').doc(uid);
    const userSnap = await userRef.get();
    const existingConnected =
      (userSnap.data()?.['connectedSocialAccounts'] as
        | Record<string, { outstandAccountId?: string }>
        | undefined) ?? {};
    const outstandAccountId = existingConnected[platform]?.outstandAccountId;

    const batch = req.firebase!.db.batch();
    batch.update(userRef, {
      [`connectedSocialAccounts.${platform}`]: FieldValue.delete(),
      updatedAt: new Date().toISOString(),
    });
    batch.delete(userRef.collection('oauthTokens').doc(`outstand-${platform}`));
    await batch.commit();

    if (outstandAccountId) {
      try {
        const bridge = getBridge();
        await bridge.deleteSocialAccount(outstandAccountId);
      } catch (error) {
        logger.warn('[Outstand OAuth] Provider-side disconnect failed', {
          uid,
          platform,
          outstandAccountId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await invalidateProfileCaches(uid).catch((error) => {
      logger.warn('[Outstand OAuth] Cache invalidation failed after disconnect', {
        uid,
        platform,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    res.json({ success: true, platform });
  })
);

export default router;
