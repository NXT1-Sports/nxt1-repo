/**
 * @fileoverview Agent X — Firecrawl persistent profile sign-in routes.
 *
 * POST /firecrawl/session/start
 * POST /firecrawl/session/complete
 * POST /firecrawl/session/cancel
 * POST /firecrawl/session/disconnect
 * GET  /firecrawl/accounts
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { PLATFORM_REGISTRY } from '@nxt1/core/platforms';
import { logger } from '../../utils/logger.js';
import { getFirecrawlProfileService, PLATFORM_KEY_RE } from './shared.js';

const router = Router();

// ─── POST /firecrawl/session/start ────────────────────────────────────────

router.post('/firecrawl/session/start', appGuard, async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user?: { uid: string } }).user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { platform } = req.body;
    if (!platform || typeof platform !== 'string' || !PLATFORM_KEY_RE.test(platform)) {
      res.status(400).json({ success: false, error: 'Invalid platform identifier' });
      return;
    }

    const platformDef = PLATFORM_REGISTRY.find((p) => p.platform === platform && p.loginUrl);
    if (!platformDef?.loginUrl) {
      res.status(400).json({
        success: false,
        error: `Platform "${platform}" does not support Firecrawl sign-in`,
      });
      return;
    }

    const isMobile = req.body.isMobile === true;
    const service = getFirecrawlProfileService();
    const session = await service.startSignInSession(
      user.uid,
      platform,
      platformDef.loginUrl,
      isMobile
    );

    logger.info('[AgentX] Firecrawl sign-in session started', {
      userId: user.uid,
      platform,
      sessionId: session.sessionId,
      profileName: session.profileName,
    });

    res.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        interactiveLiveViewUrl: session.interactiveLiveViewUrl,
        liveViewUrl: session.liveViewUrl,
        profileName: session.profileName,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to start Firecrawl sign-in session', {
      error: error.message,
      stack: error.stack,
    });

    if (error.message.includes('409') || error.message.includes('conflict')) {
      res.status(409).json({
        success: false,
        error: 'Another session is currently active for this account. Please try again shortly.',
      });
      return;
    }

    if (error.message.includes('maximum number of concurrent')) {
      res.status(429).json({
        success: false,
        error: 'Too many active sessions. Please wait a moment and try again.',
      });
      return;
    }

    res.status(500).json({ success: false, error: 'Failed to start sign-in session' });
  }
});

// ─── POST /firecrawl/session/complete ─────────────────────────────────────

router.post('/firecrawl/session/complete', appGuard, async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user?: { uid: string } }).user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { sessionId, platform, profileName } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ success: false, error: 'sessionId is required' });
      return;
    }
    if (!platform || typeof platform !== 'string' || !PLATFORM_KEY_RE.test(platform)) {
      res.status(400).json({ success: false, error: 'Invalid platform identifier' });
      return;
    }
    if (!profileName || typeof profileName !== 'string') {
      res.status(400).json({ success: false, error: 'profileName is required' });
      return;
    }

    const service = getFirecrawlProfileService();
    const expectedName = service.generateProfileName(user.uid, platform);
    if (profileName !== expectedName) {
      res.status(403).json({ success: false, error: 'Profile name mismatch' });
      return;
    }

    await service.completeSignInSession(sessionId);

    const platformDef = PLATFORM_REGISTRY.find((p) => p.platform === platform && p.loginUrl);
    let verified = true;

    if (platformDef?.loginUrl) {
      try {
        const probe = await service.probeProfileStatus(user.uid, platform, platformDef.loginUrl);
        verified = probe.authenticated;

        logger.info('[AgentX] Firecrawl profile probe result', {
          userId: user.uid,
          platform,
          authenticated: probe.authenticated,
          pageTitle: probe.pageTitle,
          finalUrl: probe.finalUrl,
        });
      } catch (probeErr) {
        logger.warn('[AgentX] Profile probe failed, saving as unverified', {
          userId: user.uid,
          platform,
          error: probeErr instanceof Error ? probeErr.message : String(probeErr),
        });
        verified = false;
      }
    }

    const db = req.firebase?.db;
    if (db) {
      await db
        .collection('Users')
        .doc(user.uid)
        .set(
          {
            connectedAccounts: {
              [platform]: {
                type: 'firecrawl_profile',
                profileName,
                status: verified ? 'active' : 'unverified',
                connectedAt: new Date().toISOString(),
                ...(verified
                  ? {}
                  : { verificationNote: 'Profile probe could not confirm authentication' }),
              },
            },
          },
          { merge: true }
        );
    }

    logger.info('[AgentX] Firecrawl sign-in session completed', {
      userId: user.uid,
      platform,
      profileName,
      sessionId,
      verified,
    });

    res.json({ success: true, data: { verified } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to complete Firecrawl sign-in session', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to complete sign-in session' });
  }
});

// ─── POST /firecrawl/session/cancel ───────────────────────────────────────

router.post('/firecrawl/session/cancel', appGuard, async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user?: { uid: string } }).user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { sessionId } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ success: false, error: 'sessionId is required' });
      return;
    }

    try {
      const service = getFirecrawlProfileService();
      await service.completeSignInSession(sessionId);
    } catch {
      // Session may have already expired via TTL
    }

    logger.info('[AgentX] Firecrawl sign-in session cancelled', {
      userId: user.uid,
      sessionId,
    });

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to cancel Firecrawl session', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to cancel session' });
  }
});

// ─── POST /firecrawl/session/disconnect ───────────────────────────────────

router.post('/firecrawl/session/disconnect', appGuard, async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user?: { uid: string } }).user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { platform } = req.body;
    if (!platform || typeof platform !== 'string' || !PLATFORM_KEY_RE.test(platform)) {
      res.status(400).json({ success: false, error: 'Invalid platform identifier' });
      return;
    }

    const db = req.firebase?.db;
    if (db) {
      const { FieldValue } = await import('firebase-admin/firestore');
      await db
        .collection('Users')
        .doc(user.uid)
        .update({
          [`connectedAccounts.${platform}`]: FieldValue.delete(),
        });
    }

    logger.info('[AgentX] Firecrawl account disconnected', { userId: user.uid, platform });

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to disconnect Firecrawl account', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to disconnect account' });
  }
});

// ─── GET /firecrawl/accounts ──────────────────────────────────────────────

router.get('/firecrawl/accounts', appGuard, async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user?: { uid: string } }).user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const db = req.firebase?.db;
    if (!db) {
      res.json({ success: true, data: {} });
      return;
    }

    const userDoc = await db.collection('Users').doc(user.uid).get();
    const accounts =
      (userDoc.data()?.['connectedAccounts'] as Record<
        string,
        { type?: string; status?: string; profileName?: string; connectedAt?: string }
      >) ?? {};

    const result: Record<string, { status: string; connectedAt?: string }> = {};
    for (const [platform, account] of Object.entries(accounts)) {
      if (
        account?.type === 'firecrawl_profile' &&
        (account.status === 'active' || account.status === 'connected')
      ) {
        result[platform] = {
          status: account.status,
          connectedAt: account.connectedAt,
        };
      }
    }

    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to fetch Firecrawl accounts', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch accounts' });
  }
});

export default router;
