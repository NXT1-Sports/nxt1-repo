/**
 * @fileoverview Agent X — Firecrawl persistent profile sign-in routes.
 *
 * POST /firecrawl/session/start
 * POST /firecrawl/session/complete
 * POST /firecrawl/session/cancel
 * POST /firecrawl/session/disconnect
 * GET  /firecrawl/accounts
 * GET  /firecrawl/monitors
 * POST /firecrawl/monitors
 * GET  /firecrawl/monitors/:platform
 * PATCH /firecrawl/monitors/:platform
 * DELETE /firecrawl/monitors/:platform
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { PLATFORM_REGISTRY } from '@nxt1/core/platforms';
import { logger } from '../../utils/logger.js';
import {
  getFirecrawlMonitorService,
  getFirecrawlProfileService,
  PLATFORM_KEY_RE,
} from './shared.js';
import { getAgentEngineErrorCode } from '../../modules/agent/exceptions/agent-engine.error.js';
import { isFirecrawlUnsupportedSiteError } from '../../modules/agent/tools/integrations/firecrawl/browser/firecrawl-profile.service.js';
import {
  FirecrawlMonitorServiceError,
  type FirecrawlMonitorSchedule,
  type FirecrawlMonitorSummary,
} from '../../modules/agent/tools/integrations/firecrawl/browser/firecrawl-monitor.service.js';

const router = Router();

const SIGN_IN_UNSUPPORTED_ERROR_CODE = 'SIGN_IN_UNSUPPORTED' as const;
const FIRECRAWL_MONITOR_REQUEST_TIMEOUT_MS = 90_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getPlatformLabel(platform: unknown): string {
  if (typeof platform !== 'string') return 'This platform';
  return PLATFORM_REGISTRY.find((p) => p.platform === platform)?.label ?? 'This platform';
}

function buildUnsupportedSignInMessage(platform: unknown): string {
  return `${getPlatformLabel(platform)} sign-in is currently unsupported. We are working on it, check back soon.`;
}

function getAuthenticatedUser(req: Request, res: Response): { uid: string } | null {
  const user = (req as Request & { user?: { uid: string } }).user;
  if (!user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return null;
  }

  return user;
}

function getFirestoreDb(
  req: Request,
  res: Response
): NonNullable<Request['firebase']>['db'] | null {
  const db = req.firebase?.db;
  if (!db) {
    res.status(503).json({ success: false, error: 'Firestore is unavailable' });
    return null;
  }

  return db;
}

function applyFirecrawlMonitorRequestTimeout(res: Response): void {
  res.setTimeout(FIRECRAWL_MONITOR_REQUEST_TIMEOUT_MS);
}

function normalizeTargetUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeSchedule(value: unknown): FirecrawlMonitorSchedule | null {
  if (!isRecord(value)) return null;

  const text = typeof value['text'] === 'string' ? value['text'].trim() : '';
  const cron = typeof value['cron'] === 'string' ? value['cron'].trim() : '';
  const timezone = typeof value['timezone'] === 'string' ? value['timezone'].trim() : '';

  if ((!text && !cron) || (text && cron)) return null;

  return {
    ...(text ? { text } : {}),
    ...(cron ? { cron } : {}),
    ...(timezone ? { timezone } : {}),
  };
}

function normalizeOptionalGoal(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === 'boolean' ? value : null;
}

function normalizeMetadata(value: unknown): Record<string, unknown> | undefined | null {
  if (value === undefined) return undefined;
  return isRecord(value) ? value : null;
}

function normalizePlatformParam(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function handleMonitorServiceError(
  error: unknown,
  res: Response,
  fallbackMessage: string
): boolean {
  if (error instanceof FirecrawlMonitorServiceError) {
    res.status(error.status).json({ success: false, error: error.message });
    return true;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  logger.error('[AgentX] Firecrawl monitor request failed', {
    error: message,
    stack: error instanceof Error ? error.stack : undefined,
  });
  res.status(500).json({ success: false, error: fallbackMessage });
  return false;
}

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
    const errorCode = getAgentEngineErrorCode(error);

    if (errorCode === 'LIVE_VIEW_SIGN_IN_UNSUPPORTED' || isFirecrawlUnsupportedSiteError(error)) {
      logger.warn('[AgentX] Firecrawl sign-in unsupported for platform', {
        platform: req.body?.platform,
        error: error.message,
      });
      res.status(422).json({
        success: false,
        code: SIGN_IN_UNSUPPORTED_ERROR_CODE,
        error: buildUnsupportedSignInMessage(req.body?.platform),
      });
      return;
    }

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

    logger.error('[AgentX] Failed to start Firecrawl sign-in session', {
      error: error.message,
      stack: error.stack,
    });

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
    const user = getAuthenticatedUser(req, res);
    if (!user) {
      return;
    }

    const { platform } = req.body;
    if (!platform || typeof platform !== 'string' || !PLATFORM_KEY_RE.test(platform)) {
      res.status(400).json({ success: false, error: 'Invalid platform identifier' });
      return;
    }

    const db = req.firebase?.db;
    if (db) {
      const monitorService = getFirecrawlMonitorService();
      const existingMonitor = await monitorService.getMonitor(db, user.uid, platform);
      if (existingMonitor) {
        await monitorService.deleteMonitor(db, user.uid, platform);
      }

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

// ─── GET /firecrawl/monitors ──────────────────────────────────────────────

router.get('/firecrawl/monitors', appGuard, async (req: Request, res: Response) => {
  applyFirecrawlMonitorRequestTimeout(res);

  const user = getAuthenticatedUser(req, res);
  if (!user) return;

  const db = getFirestoreDb(req, res);
  if (!db) return;

  try {
    const service = getFirecrawlMonitorService();
    const monitors = await service.listMonitors(db, user.uid);
    res.json({ success: true, data: monitors });
  } catch (error) {
    handleMonitorServiceError(error, res, 'Failed to fetch Firecrawl monitors');
  }
});

// ─── POST /firecrawl/monitors ─────────────────────────────────────────────

router.post('/firecrawl/monitors', appGuard, async (req: Request, res: Response) => {
  applyFirecrawlMonitorRequestTimeout(res);

  const user = getAuthenticatedUser(req, res);
  if (!user) return;

  const db = getFirestoreDb(req, res);
  if (!db) return;

  const { platform } = req.body;
  if (!platform || typeof platform !== 'string' || !PLATFORM_KEY_RE.test(platform)) {
    res.status(400).json({ success: false, error: 'Invalid platform identifier' });
    return;
  }

  const targetUrl = normalizeTargetUrl(req.body?.targetUrl);
  if (!targetUrl) {
    res
      .status(400)
      .json({ success: false, error: 'targetUrl must be an absolute http or https URL' });
    return;
  }

  const schedule = normalizeSchedule(req.body?.schedule);
  if (!schedule) {
    res.status(400).json({
      success: false,
      error: 'schedule must be an object with either text or cron and optional timezone',
    });
    return;
  }

  const goal = normalizeOptionalGoal(req.body?.goal);
  if (goal === null) {
    res
      .status(400)
      .json({ success: false, error: 'goal must be a non-empty string when provided' });
    return;
  }

  const judgeEnabled = normalizeOptionalBoolean(req.body?.judgeEnabled);
  if (judgeEnabled === null) {
    res.status(400).json({ success: false, error: 'judgeEnabled must be a boolean when provided' });
    return;
  }

  const metadata = normalizeMetadata(req.body?.metadata);
  if (metadata === null) {
    res.status(400).json({ success: false, error: 'metadata must be an object when provided' });
    return;
  }

  try {
    const service = getFirecrawlMonitorService();
    const monitor = await service.createMonitor(db, user.uid, {
      platform,
      targetUrl,
      schedule,
      ...(goal ? { goal } : {}),
      ...(typeof judgeEnabled === 'boolean' ? { judgeEnabled } : {}),
      ...(metadata ? { metadata } : {}),
    });

    res.status(201).json({ success: true, data: monitor });
  } catch (error) {
    handleMonitorServiceError(error, res, 'Failed to create Firecrawl monitor');
  }
});

// ─── GET /firecrawl/monitors/:platform ────────────────────────────────────

router.get('/firecrawl/monitors/:platform', appGuard, async (req: Request, res: Response) => {
  applyFirecrawlMonitorRequestTimeout(res);

  const user = getAuthenticatedUser(req, res);
  if (!user) return;

  const platform = normalizePlatformParam(req.params['platform']);
  if (!platform || !PLATFORM_KEY_RE.test(platform)) {
    res.status(400).json({ success: false, error: 'Invalid platform identifier' });
    return;
  }

  const db = getFirestoreDb(req, res);
  if (!db) return;

  try {
    const service = getFirecrawlMonitorService();
    const monitor = await service.getMonitor(db, user.uid, platform);
    if (!monitor) {
      res
        .status(404)
        .json({ success: false, error: `No Firecrawl monitor exists for ${platform}.` });
      return;
    }

    res.json({ success: true, data: monitor });
  } catch (error) {
    handleMonitorServiceError(error, res, 'Failed to fetch Firecrawl monitor');
  }
});

// ─── PATCH /firecrawl/monitors/:platform ──────────────────────────────────

router.patch('/firecrawl/monitors/:platform', appGuard, async (req: Request, res: Response) => {
  applyFirecrawlMonitorRequestTimeout(res);

  const user = getAuthenticatedUser(req, res);
  if (!user) return;

  const platform = normalizePlatformParam(req.params['platform']);
  if (!platform || !PLATFORM_KEY_RE.test(platform)) {
    res.status(400).json({ success: false, error: 'Invalid platform identifier' });
    return;
  }

  const db = getFirestoreDb(req, res);
  if (!db) return;

  const targetUrl =
    req.body?.targetUrl === undefined ? undefined : normalizeTargetUrl(req.body.targetUrl);
  if (req.body?.targetUrl !== undefined && !targetUrl) {
    res
      .status(400)
      .json({ success: false, error: 'targetUrl must be an absolute http or https URL' });
    return;
  }

  const schedule =
    req.body?.schedule === undefined ? undefined : normalizeSchedule(req.body.schedule);
  if (req.body?.schedule !== undefined && !schedule) {
    res.status(400).json({
      success: false,
      error: 'schedule must be an object with either text or cron and optional timezone',
    });
    return;
  }

  const goal = normalizeOptionalGoal(req.body?.goal);
  if (goal === null) {
    res
      .status(400)
      .json({ success: false, error: 'goal must be a non-empty string when provided' });
    return;
  }

  const judgeEnabled = normalizeOptionalBoolean(req.body?.judgeEnabled);
  if (judgeEnabled === null) {
    res.status(400).json({ success: false, error: 'judgeEnabled must be a boolean when provided' });
    return;
  }

  const enabled = normalizeOptionalBoolean(req.body?.enabled);
  if (enabled === null) {
    res.status(400).json({ success: false, error: 'enabled must be a boolean when provided' });
    return;
  }

  if (
    targetUrl === undefined &&
    schedule === undefined &&
    goal === undefined &&
    judgeEnabled === undefined &&
    enabled === undefined
  ) {
    res.status(400).json({ success: false, error: 'At least one monitor field must be provided' });
    return;
  }

  try {
    const service = getFirecrawlMonitorService();
    const monitor = await service.updateMonitor(db, user.uid, platform, {
      ...(targetUrl ? { targetUrl } : {}),
      ...(schedule ? { schedule } : {}),
      ...(goal ? { goal } : {}),
      ...(typeof judgeEnabled === 'boolean' ? { judgeEnabled } : {}),
      ...(typeof enabled === 'boolean' ? { enabled } : {}),
    });

    res.json({ success: true, data: monitor });
  } catch (error) {
    handleMonitorServiceError(error, res, 'Failed to update Firecrawl monitor');
  }
});

// ─── DELETE /firecrawl/monitors/:platform ─────────────────────────────────

router.delete('/firecrawl/monitors/:platform', appGuard, async (req: Request, res: Response) => {
  applyFirecrawlMonitorRequestTimeout(res);

  const user = getAuthenticatedUser(req, res);
  if (!user) return;

  const platform = normalizePlatformParam(req.params['platform']);
  if (!platform || !PLATFORM_KEY_RE.test(platform)) {
    res.status(400).json({ success: false, error: 'Invalid platform identifier' });
    return;
  }

  const db = getFirestoreDb(req, res);
  if (!db) return;

  try {
    const service = getFirecrawlMonitorService();
    const deleted = await service.deleteMonitor(db, user.uid, platform);
    res.json({
      success: true,
      data: {
        platform,
        monitorId: deleted.monitorId,
        deleted: true,
      },
    });
  } catch (error) {
    handleMonitorServiceError(error, res, 'Failed to delete Firecrawl monitor');
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
        {
          type?: string;
          status?: string;
          profileName?: string;
          connectedAt?: string;
          monitor?: FirecrawlMonitorSummary;
        }
      >) ?? {};

    const result: Record<
      string,
      { status: string; connectedAt?: string; monitor?: FirecrawlMonitorSummary }
    > = {};
    for (const [platform, account] of Object.entries(accounts)) {
      if (
        account?.type === 'firecrawl_profile' &&
        (account.status === 'active' || account.status === 'connected')
      ) {
        result[platform] = {
          status: account.status,
          connectedAt: account.connectedAt,
          ...(isRecord(account.monitor)
            ? { monitor: account.monitor as FirecrawlMonitorSummary }
            : {}),
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
