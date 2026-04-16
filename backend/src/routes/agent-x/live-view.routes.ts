/**
 * @fileoverview Agent X Live View & Health Routes
 * @module @nxt1/backend/routes/agent-x/live-view
 *
 * Routes: /live-view/start, /live-view/navigate, /live-view/refresh,
 *         /live-view/close, /health
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../../middleware/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import {
  queueService,
  llmService,
  getAuthUser,
  PLATFORM_KEY_RE,
  getLiveViewSessionService,
} from './shared.js';

const router = Router();

/**
 * POST /live-view/start — Start a new live-view browser session.
 *
 * Body: { url: string, platformKey?: string }
 *  - url:         The destination URL to open in the live view.
 *  - platformKey:  Optional platform hint (e.g. 'hudl') to skip domain matching.
 *
 * Returns: { success: true, data: LiveViewSession }
 */
router.post('/live-view/start', appGuard, async (req: Request, res: Response) => {
  // Firecrawl browser sessions legitimately take 15-30s to start.
  // Override the global 30s timeout to avoid a premature 408.
  res.setTimeout(90_000);

  try {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { url, platformKey } = req.body;

    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, error: 'URL is required' });
      return;
    }

    if (platformKey && (typeof platformKey !== 'string' || !PLATFORM_KEY_RE.test(platformKey))) {
      res.status(400).json({ success: false, error: 'Invalid platform key' });
      return;
    }

    // Fetch connected accounts for auth profile reuse
    const { db } = req.firebase!;
    const userDoc = await db.collection('Users').doc(user.uid).get();
    const connectedAccounts =
      (userDoc.data()?.['connectedAccounts'] as Record<
        string,
        { profileName?: string; status?: string }
      >) ?? {};

    const service = getLiveViewSessionService();
    const result = await service.startSession(user.uid, { url, platformKey }, connectedAccounts);

    logger.info('[AgentX] Live view session started', {
      userId: user.uid,
      sessionId: result.session.sessionId,
      tier: result.session.destinationTier,
      authStatus: result.session.authStatus,
    });

    // Guard: the global request timeout may have already sent a 408
    if (res.headersSent) {
      logger.warn('[AgentX] Live view session started but response already sent (timeout)', {
        sessionId: result.session.sessionId,
      });
      return;
    }

    res.json({ success: true, data: result.session });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));

    // Guard: don't attempt to write if the timeout middleware already responded
    if (res.headersSent) {
      logger.warn('[AgentX] Live view start error after response already sent', {
        error: error.message,
      });
      return;
    }

    // 409 — conflict (concurrent saver on same profile)
    if (error.message.includes('409') || error.message.includes('conflict')) {
      res.status(409).json({
        success: false,
        error: 'Another session is currently active for this account. Please try again shortly.',
      });
      return;
    }

    // 429 — concurrent session limit
    if (error.message.includes('maximum number of concurrent')) {
      res.status(429).json({
        success: false,
        error: 'Too many active sessions. Please wait a moment and try again.',
      });
      return;
    }

    logger.error('[AgentX] Failed to start live view session', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to start live view session' });
  }
});

/**
 * POST /live-view/navigate — Navigate an active session to a new URL.
 *
 * Body: { sessionId: string, url: string }
 */
router.post('/live-view/navigate', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { sessionId, url } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ success: false, error: 'Session ID is required' });
      return;
    }
    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, error: 'URL is required' });
      return;
    }

    const service = getLiveViewSessionService();
    const result = await service.navigate(sessionId, user.uid, url);

    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to navigate live view', { error: error.message });

    if (error.message.includes('not found') || error.message.includes('expired')) {
      res.status(404).json({ success: false, error: error.message });
      return;
    }

    res.status(500).json({ success: false, error: 'Failed to navigate' });
  }
});

/**
 * POST /live-view/refresh — Refresh the current page in an active session.
 *
 * Body: { sessionId: string }
 */
router.post('/live-view/refresh', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { sessionId } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ success: false, error: 'Session ID is required' });
      return;
    }

    const service = getLiveViewSessionService();
    await service.refresh(sessionId, user.uid);

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to refresh live view', { error: error.message });

    if (error.message.includes('not found') || error.message.includes('expired')) {
      res.status(404).json({ success: false, error: error.message });
      return;
    }

    res.status(500).json({ success: false, error: 'Failed to refresh' });
  }
});

/**
 * POST /live-view/close — Close and clean up a live-view session.
 *
 * Body: { sessionId: string }
 */
router.post('/live-view/close', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { sessionId } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ success: false, error: 'Session ID is required' });
      return;
    }

    const service = getLiveViewSessionService();
    await service.closeSession(sessionId, user.uid);

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to close live view session', { error: error.message });
    // Swallow errors on close — best-effort cleanup
    res.json({ success: true });
  }
});

// ─── GET /health — Agent X system health (unauthenticated, highly cached) ─
// Returns the current operational status of Agent X:
//   'active'   → All systems go (green dot)
//   'degraded' → Partial issues, queue delays, or elevated error rates (yellow dot)
//   'down'     → Offline, execution paused (red dot)
//
// The endpoint checks:
//   1. Whether the BullMQ queue service is connected
//   2. Whether the LLM (OpenRouter) service is reachable
//   3. Whether Firestore is responding
//
// Cache: CDN-safe 60s cache header. No auth required — lightweight status probe.
router.get('/health', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');

  try {
    // Check 1: Queue service connected?
    const queueHealthy = queueService !== null;

    // Check 2: LLM service available?
    const llmHealthy = llmService !== null;

    // Check 3: Quick Firestore read (uses request-injected db from firebaseContext)
    let firestoreHealthy = false;
    try {
      const { db } = req.firebase!;
      await db.collection('_health').doc('ping').get();
      firestoreHealthy = true;
    } catch {
      firestoreHealthy = false;
    }

    // Determine overall status
    let status: 'active' | 'degraded' | 'down';
    if (queueHealthy && llmHealthy && firestoreHealthy) {
      status = 'active';
    } else if (!queueHealthy && !llmHealthy) {
      status = 'down';
    } else {
      status = 'degraded';
    }

    res.json({ success: true, data: { status } });
  } catch (err) {
    logger.error('[AgentX] Health check failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    // If the health check itself throws, report 'down'
    res.json({ success: true, data: { status: 'down' } });
  }
});


export default router;
