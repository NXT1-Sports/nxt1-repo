/**
 * @fileoverview Agent X — Live-view browser session routes + health endpoint.
 *
 * POST /live-view/start
 * POST /live-view/navigate
 * POST /live-view/refresh
 * POST /live-view/close
 * GET  /health
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import { getLiveViewSessionService, queueService, llmService } from './shared.js';

const router = Router();

// ─── POST /live-view/start ─────────────────────────────────────────────────

router.post('/live-view/start', appGuard, async (req: Request, res: Response) => {
  // Override request timeout — live-view sessions can take time to initialise
  res.setTimeout(90_000);

  try {
    const user = (req as Request & { user?: { uid: string } }).user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { url, platformKey } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, error: 'url is required' });
      return;
    }

    const db = req.firebase?.db;
    let connectedAccounts: Record<string, { profileName?: string; status?: string }> = {};
    if (db) {
      const userDoc = await db.collection('Users').doc(user.uid).get();
      connectedAccounts =
        (userDoc.data()?.['connectedAccounts'] as Record<
          string,
          { profileName?: string; status?: string }
        >) ?? {};
    }

    const service = getLiveViewSessionService();
    const result = await service.startSession(
      user.uid,
      { url, platformKey: platformKey ?? null },
      connectedAccounts
    );

    // Guard: check if response was already sent (edge case with 90s timeout)
    if (res.headersSent) return;

    logger.info('[AgentX] Live-view session started', {
      userId: user.uid,
      url,
      platformKey,
      sessionId: result.session?.sessionId,
    });

    res.json({ success: true, data: result.session });
  } catch (err) {
    if (res.headersSent) return;

    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to start live-view session', {
      error: error.message,
      stack: error.stack,
    });

    if (error.message.includes('409') || error.message.includes('conflict')) {
      res.status(409).json({
        success: false,
        error: 'A live-view session is already active. Please close the existing session first.',
      });
      return;
    }

    if (error.message.includes('maximum number of concurrent') || error.message.includes('429')) {
      res.status(429).json({
        success: false,
        error: 'Too many active browser sessions. Please try again in a moment.',
      });
      return;
    }

    res.status(500).json({ success: false, error: 'Failed to start browser session' });
  }
});

// ─── POST /live-view/navigate ──────────────────────────────────────────────

router.post('/live-view/navigate', appGuard, async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user?: { uid: string } }).user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { sessionId, url } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ success: false, error: 'sessionId is required' });
      return;
    }
    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, error: 'url is required' });
      return;
    }

    const service = getLiveViewSessionService();
    const result = await service.navigate(sessionId, user.uid, url);

    logger.info('[AgentX] Live-view navigate', { userId: user.uid, sessionId, url });

    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to navigate live-view session', {
      error: error.message,
      sessionId: req.body?.sessionId,
    });

    if (error.message.includes('not found') || error.message.includes('expired')) {
      res.status(404).json({ success: false, error: 'Browser session not found or expired' });
      return;
    }

    res.status(500).json({ success: false, error: 'Navigation failed' });
  }
});

// ─── POST /live-view/refresh ───────────────────────────────────────────────

router.post('/live-view/refresh', appGuard, async (req: Request, res: Response) => {
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

    const service = getLiveViewSessionService();
    const result = await service.refresh(sessionId, user.uid);

    logger.info('[AgentX] Live-view refresh', { userId: user.uid, sessionId });

    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to refresh live-view session', {
      error: error.message,
      sessionId: req.body?.sessionId,
    });

    if (error.message.includes('not found') || error.message.includes('expired')) {
      res.status(404).json({ success: false, error: 'Browser session not found or expired' });
      return;
    }

    res.status(500).json({ success: false, error: 'Refresh failed' });
  }
});

// ─── POST /live-view/close ─────────────────────────────────────────────────

router.post('/live-view/close', appGuard, async (req: Request, res: Response) => {
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
      const service = getLiveViewSessionService();
      await service.closeSession(sessionId, user.uid);
    } catch {
      // Best-effort close — session may already be terminated
    }

    logger.info('[AgentX] Live-view session closed', { userId: user.uid, sessionId });

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to close live-view session', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to close session' });
  }
});

// ─── GET /health ───────────────────────────────────────────────────────────
// Unauthenticated — used by health checks / load balancers

router.get('/health', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');

  try {
    const servicesReady = queueService !== null && llmService !== null;

    let dbReachable = false;
    try {
      const db = req.firebase?.db;
      if (db) {
        await db.collection('_health').doc('ping').get();
        dbReachable = true;
      }
    } catch {
      // DB ping failed — degraded
    }

    const status = servicesReady && dbReachable ? 'active' : servicesReady ? 'degraded' : 'down';

    res.status(status === 'down' ? 503 : 200).json({
      success: true,
      data: { status },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Health check failed', { error: error.message });
    res.status(503).json({ success: true, data: { status: 'down' } });
  }
});

export default router;
