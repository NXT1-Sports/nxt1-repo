/**
 * @fileoverview Agent X Firecrawl Routes
 * @module @nxt1/backend/routes/agent-x/firecrawl
 *
 * Routes: /firecrawl/session/start, /firecrawl/session/complete,
 *         /firecrawl/session/cancel, /firecrawl/session/disconnect,
 *         /firecrawl/accounts
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../../middleware/auth.middleware.js';
import { PLATFORM_REGISTRY } from '@nxt1/core';
import { logger } from '../../utils/logger.js';
import {
  getAuthUser,
  PLATFORM_KEY_RE,
  getFirecrawlProfileService,
} from './shared.js';

const router = Router();

/**
 * Start an interactive browser session for a user to sign in to a third-party platform.
 * Returns an embeddable `interactiveLiveViewUrl` that the frontend renders in an iframe.
 *
 * Body: { platform: string }
 * The platform must exist in PLATFORM_REGISTRY with a `loginUrl`.
 */
router.post('/firecrawl/session/start', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { platform } = req.body;
    if (!platform || typeof platform !== 'string' || !PLATFORM_KEY_RE.test(platform)) {
      res.status(400).json({ success: false, error: 'Invalid platform identifier' });
      return;
    }

    // Look up the platform in the registry to get loginUrl (allowlist-based)
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

    // Handle Firecrawl 409 (concurrent saver on same profile)
    if (error.message.includes('409') || error.message.includes('conflict')) {
      res.status(409).json({
        success: false,
        error: 'Another session is currently active for this account. Please try again shortly.',
      });
      return;
    }

    // Handle concurrent session limit (free plan: 2 concurrent)
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

/**
 * Complete a Firecrawl sign-in session — saves profile and stores in Firestore.
 *
 * Body: { sessionId: string, platform: string, profileName: string }
 */
router.post('/firecrawl/session/complete', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
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

    // Verify profileName matches expected format to prevent spoofing
    const service = getFirecrawlProfileService();
    const expectedName = service.generateProfileName(user.uid, platform);
    if (profileName !== expectedName) {
      res.status(403).json({ success: false, error: 'Profile name mismatch' });
      return;
    }

    // Delete browser session — Firecrawl saves browser state to the profile
    await service.completeSignInSession(sessionId);

    // Validate that the saved profile actually authenticated successfully.
    // Probe the login URL — if authenticated, it should redirect away from the login page.
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
        // Probe failure is non-blocking — save as unverified rather than failing the entire flow
        logger.warn('[AgentX] Profile probe failed, saving as unverified', {
          userId: user.uid,
          platform,
          error: probeErr instanceof Error ? probeErr.message : String(probeErr),
        });
        verified = false;
      }
    }

    // Store the profile reference in Firestore
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

    res.json({
      success: true,
      data: { verified },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to complete Firecrawl sign-in session', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to complete sign-in session' });
  }
});

/**
 * Cancel an in-progress Firecrawl sign-in session (user dismissed the modal).
 * Cleans up the browser session without saving the profile.
 *
 * Body: { sessionId: string }
 */
router.post('/firecrawl/session/cancel', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { sessionId } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ success: false, error: 'sessionId is required' });
      return;
    }

    // Best-effort cleanup — don't fail if already expired
    try {
      const service = getFirecrawlProfileService();
      await service.completeSignInSession(sessionId);
    } catch {
      // Session may have already expired via TTL — that's fine
    }

    logger.info('[AgentX] Firecrawl sign-in session cancelled', {
      userId: user.uid,
      sessionId,
    });

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to cancel Firecrawl session', {
      error: error.message,
    });
    res.status(500).json({ success: false, error: 'Failed to cancel session' });
  }
});

/**
 * Disconnect a Firecrawl-authenticated account.
 * Removes the profile reference from the user's Firestore document.
 *
 * Body: { platform: string }
 */
router.post('/firecrawl/session/disconnect', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
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

    logger.info('[AgentX] Firecrawl account disconnected', {
      userId: user.uid,
      platform,
    });

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

/**
 * GET /firecrawl/accounts — Return the user's Firecrawl sign-in accounts.
 *
 * Used by the frontend Connected Accounts modal to show which platforms
 * are already signed in via Firecrawl persistent profiles.
 *
 * Returns: { success: true, data: Record<string, { status, profileName, connectedAt }> }
 */
router.get('/firecrawl/accounts', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
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

    // Only return firecrawl_profile entries with active/connected status
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
    logger.error('[AgentX] Failed to fetch Firecrawl accounts', {
      error: error.message,
    });
    res.status(500).json({ success: false, error: 'Failed to fetch accounts' });
  }
});

// ─── LIVE VIEW SESSION ENDPOINTS ─────────────────────────────────────────────
// Provide the Agent X desktop Command Center with session-backed, interactive
// browser views. Supports both allowlisted platforms and arbitrary validated URLs.

/**
 * POST /live-view/start — Start a new live-view browser session.
 *
 * Body: { url: string, platformKey?: string }
 *  - url:         The destination URL to open in the live view.
 *  - platformKey:  Optional platform hint (e.g. 'hudl') to skip domain matching.
 *
 * Returns: { success: true, data: LiveViewSession }

export default router;
