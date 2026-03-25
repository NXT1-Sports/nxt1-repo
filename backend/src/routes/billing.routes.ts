/**
 * @fileoverview Usage Recording Routes
 * @module @nxt1/backend/routes
 *
 * API endpoints for recording usage events (usage-based billing)
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';
import {
  recordUsageEvent,
  getUserUsageEvents,
  getTeamUsageEvents,
  type CreateUsageEventInput,
  UsageFeature,
  getUnitCost,
  checkBudget,
  recordSpend,
  getOrCreateBillingContext,
  updateBudget,
  updateTeamBudget,
  updateOrgBudget,
  updateTeamAllocation,
  getOrgTeamAllocations,
} from '../modules/billing/index.js';
import { validateBody } from '../middleware/validation.middleware.js';
import {
  CreateUsageEventDto,
  UpdateBudgetDto,
  UpdateTeamBudgetDto,
  UpdateOrganizationBudgetDto,
  UpdateTeamAllocationDto,
} from '../dtos/billing.dto.js';

const router = Router();

/**
 * POST /api/v1/billing/usage
 * Record a new usage event
 *
 * Body:
 * {
 *   feature: 'AI_GRAPHIC' | 'HIGHLIGHT' | ...
 *   quantity: number
 *   jobId?: string (for idempotency)
 *   metadata?: object
 * }
 */
router.post(
  '/usage',
  appGuard,
  validateBody(CreateUsageEventDto),
  async (req: Request, res: Response) => {
    try {
      const { feature, quantity, jobId, metadata } = req.body;

      // User is guaranteed by appGuard
      const userId = req.user!.uid;
      const rawTeamId = typeof req.body.teamId === 'string' ? req.body.teamId.trim() : '';
      const teamId = rawTeamId || userId;

      // Get Firebase context
      const db = req.firebase?.db;
      const environment = req.isStaging ? 'staging' : 'production';

      if (!db) {
        throw new Error('Firebase context not available');
      }

      // ── Budget gate ─────────────────────────────────────────
      const costCents = getUnitCost(feature as UsageFeature) * Number(quantity);
      const budgetResult = await checkBudget(db, userId, costCents, teamId);

      if (!budgetResult.allowed) {
        return res.status(402).json({
          error: 'budget_exceeded',
          message: budgetResult.reason,
          currentSpend: budgetResult.currentSpend,
          budget: budgetResult.budget,
          percentUsed: budgetResult.percentUsed,
          billingEntity: budgetResult.billingEntity,
        });
      }

      // Record usage event
      const input: CreateUsageEventInput = {
        userId,
        teamId: teamId || userId,
        feature,
        quantity: Number(quantity),
        unitCostSnapshot: 0, // Will be set by service
        currency: 'usd',
        stripePriceId: '', // Will be set by service
        jobId,
        metadata,
      };

      const eventId = await recordUsageEvent(db, input, environment);

      // ── Record spend against budget ─────────────────────────
      await recordSpend(db, userId, costCents, teamId);

      logger.info('[POST /usage] Usage event recorded', {
        eventId,
        userId,
        feature,
        quantity,
        costCents,
        billingEntity: budgetResult.billingEntity,
      });

      // Return immediately - processing happens async
      return res.status(202).json({
        success: true,
        eventId,
        message: 'Usage event recorded and queued for processing',
        currentSpend: budgetResult.currentSpend + costCents,
        budget: budgetResult.budget,
        percentUsed: Math.round(
          ((budgetResult.currentSpend + costCents) / budgetResult.budget) * 100
        ),
      });
    } catch (error) {
      logger.error('[POST /usage] Failed to record usage', {
        error,
        body: req.body,
      });

      return res.status(500).json({
        error: 'Failed to record usage event',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/v1/billing/usage/me
 * Get current user's usage events
 */
router.get('/usage/me', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;

    const db = req.firebase?.db;

    if (!db) {
      throw new Error('Firebase context not available');
    }

    const limit = Number(req.query['limit']) || 50;
    const events = await getUserUsageEvents(db, userId, limit);

    return res.json({
      success: true,
      events,
      count: events.length,
    });
  } catch (error) {
    logger.error('[GET /usage/me] Failed to get usage events', {
      error,
    });

    return res.status(500).json({
      error: 'Failed to get usage events',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/billing/usage/team/:teamId
 * Get team's usage events (requires team admin)
 */
router.get('/usage/team/:teamId', appGuard, async (req: Request, res: Response) => {
  try {
    const teamId = req.params['teamId'] as string;
    const userId = req.user!.uid;

    const db = req.firebase?.db;

    if (!db) {
      throw new Error('Firebase context not available');
    }

    // Verify the caller is a team member or admin
    const teamDoc = await db.collection('teams').doc(teamId).get();
    const teamData = teamDoc.data();
    if (!teamData) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const memberIds: string[] = Array.isArray(teamData['memberIds'])
      ? (teamData['memberIds'] as string[])
      : [];
    const adminIds: string[] = Array.isArray(teamData['adminIds'])
      ? (teamData['adminIds'] as string[])
      : [];
    if (
      !memberIds.includes(userId) &&
      !adminIds.includes(userId) &&
      teamData['createdBy'] !== userId
    ) {
      return res.status(403).json({ error: 'Access denied: not a team member' });
    }

    const limit = Number(req.query['limit']) || 100;
    const events = await getTeamUsageEvents(db, teamId, limit);

    return res.json({
      success: true,
      teamId,
      events,
      count: events.length,
    });
  } catch (error) {
    logger.error('[GET /usage/team/:teamId] Failed to get team usage events', {
      error,
      teamId: req.params['teamId'],
    });

    return res.status(500).json({
      error: 'Failed to get team usage events',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/billing/usage/features
 * Get list of billable features
 */
router.get('/usage/features', (_req: Request, res: Response) => {
  res.json({
    success: true,
    features: Object.values(UsageFeature),
  });
});

// ============================================
// BUDGET MANAGEMENT
// ============================================

/**
 * GET /api/v1/billing/budget
 * Get the current user's billing context (budget, spend, etc.)
 */
router.get('/budget', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const db = req.firebase?.db;

    if (!db) throw new Error('Firebase context not available');

    const ctx = await getOrCreateBillingContext(db, userId);

    return res.json({
      success: true,
      data: {
        billingEntity: ctx.billingEntity,
        monthlyBudget: ctx.monthlyBudget,
        currentPeriodSpend: ctx.currentPeriodSpend,
        periodStart: ctx.periodStart,
        periodEnd: ctx.periodEnd,
        percentUsed:
          ctx.monthlyBudget > 0
            ? Math.round((ctx.currentPeriodSpend / ctx.monthlyBudget) * 100)
            : 0,
        hardStop: ctx.hardStop,
        teamId: ctx.teamId,
        organizationId: ctx.organizationId,
      },
    });
  } catch (error) {
    logger.error('[GET /budget] Failed to get billing context', { error });
    return res.status(500).json({
      error: 'Failed to get budget',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/v1/billing/budget
 * Update the current user's monthly budget
 * Body: { monthlyBudget: number (cents) }
 */
router.put(
  '/budget',
  appGuard,
  validateBody(UpdateBudgetDto),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.uid;
      const { monthlyBudget } = req.body;
      const db = req.firebase?.db;

      if (!db) throw new Error('Firebase context not available');

      await updateBudget(db, userId, monthlyBudget);

      return res.json({ success: true, monthlyBudget });
    } catch (error) {
      logger.error('[PUT /budget] Failed to update budget', { error });
      return res.status(500).json({
        error: 'Failed to update budget',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * PUT /api/v1/billing/budget/team/:teamId
 * Update a team's monthly budget (team admin only)
 * Body: { monthlyBudget: number (cents) }
 */
router.put(
  '/budget/team/:teamId',
  appGuard,
  validateBody(UpdateTeamBudgetDto),
  async (req: Request, res: Response) => {
    try {
      const teamId = req.params['teamId'] as string;
      const { monthlyBudget } = req.body;
      const db = req.firebase?.db;

      if (!db) throw new Error('Firebase context not available');

      // Verify the caller is a team admin
      const teamDoc = await db.collection('teams').doc(teamId).get();
      const teamData = teamDoc.data();
      const userId = req.user!.uid;
      const adminIds: string[] = Array.isArray(teamData?.['adminIds'])
        ? (teamData!['adminIds'] as string[])
        : teamData?.['createdBy']
          ? [teamData['createdBy'] as string]
          : [];

      if (!adminIds.includes(userId)) {
        return res.status(403).json({ error: 'Only team admins can update the team budget' });
      }

      await updateTeamBudget(db, teamId, monthlyBudget);

      return res.json({ success: true, teamId, monthlyBudget });
    } catch (error) {
      logger.error('[PUT /budget/team/:teamId] Failed to update team budget', { error });
      return res.status(500).json({
        error: 'Failed to update team budget',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * PUT /api/v1/billing/budget/org/:orgId
 * Update an organization's master monthly budget (org admin only)
 * Body: { monthlyBudget: number (cents) }
 */
router.put(
  '/budget/org/:orgId',
  appGuard,
  validateBody(UpdateOrganizationBudgetDto),
  async (req: Request, res: Response) => {
    try {
      const orgId = String(req.params['orgId'] ?? '').trim();
      if (!orgId || orgId.length > 128) {
        return res.status(400).json({ error: 'Invalid organization ID' });
      }
      const { monthlyBudget } = req.body;
      const db = req.firebase?.db;

      if (!db) throw new Error('Firebase context not available');

      // Verify the caller is an org admin
      const userId = req.user!.uid;
      const orgDoc = await db.collection('organizations').doc(orgId).get();
      const orgData = orgDoc.data();

      if (!orgData) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const admins = (orgData['admins'] as Array<{ userId: string }>) ?? [];
      const adminIds = admins.map((a) => a.userId).filter(Boolean);
      const ownerId = orgData['ownerId'] as string | undefined;

      if (!adminIds.includes(userId) && ownerId !== userId) {
        return res
          .status(403)
          .json({ error: 'Only organization admins can update the org budget' });
      }

      await updateOrgBudget(db, orgId, monthlyBudget);

      return res.json({ success: true, organizationId: orgId, monthlyBudget });
    } catch (error) {
      logger.error('[PUT /budget/org/:orgId] Failed to update org budget', { error });
      return res.status(500).json({
        error: 'Failed to update organization budget',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * PUT /api/v1/billing/budget/org/:orgId/team/:teamId
 * Update a team's sub-allocation within an organization (org admin only)
 * Body: { monthlyLimit: number (cents) }
 */
router.put(
  '/budget/org/:orgId/team/:teamId',
  appGuard,
  validateBody(UpdateTeamAllocationDto),
  async (req: Request, res: Response) => {
    try {
      const orgId = String(req.params['orgId'] ?? '').trim();
      const teamId = String(req.params['teamId'] ?? '').trim();
      if (!orgId || orgId.length > 128 || !teamId || teamId.length > 128) {
        return res.status(400).json({ error: 'Invalid organization or team ID' });
      }
      const { monthlyLimit } = req.body;
      const db = req.firebase?.db;

      if (!db) throw new Error('Firebase context not available');

      // Verify the caller is an org admin
      const userId = req.user!.uid;
      const orgDoc = await db.collection('organizations').doc(orgId).get();
      const orgData = orgDoc.data();

      if (!orgData) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const admins = (orgData['admins'] as Array<{ userId: string }>) ?? [];
      const adminIds = admins.map((a) => a.userId).filter(Boolean);
      const ownerId = orgData['ownerId'] as string | undefined;

      if (!adminIds.includes(userId) && ownerId !== userId) {
        return res
          .status(403)
          .json({ error: 'Only organization admins can update team allocations' });
      }

      // Verify team belongs to this org
      const teamDoc = await db.collection('teams').doc(teamId).get();
      const teamData = teamDoc.data();
      if (!teamData || teamData['organizationId'] !== orgId) {
        return res.status(400).json({ error: 'Team does not belong to this organization' });
      }

      await updateTeamAllocation(db, teamId, orgId, monthlyLimit);

      return res.json({ success: true, teamId, organizationId: orgId, monthlyLimit });
    } catch (error) {
      logger.error('[PUT /budget/org/:orgId/team/:teamId] Failed to update team allocation', {
        error,
      });
      return res.status(500).json({
        error: 'Failed to update team allocation',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/v1/billing/budget/org/:orgId/allocations
 * Get all team allocations for an organization (org admin only)
 */
router.get('/budget/org/:orgId/allocations', appGuard, async (req: Request, res: Response) => {
  try {
    const orgId = String(req.params['orgId'] ?? '').trim();
    if (!orgId || orgId.length > 128) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }
    const db = req.firebase?.db;

    if (!db) throw new Error('Firebase context not available');

    // Verify the caller is an org admin
    const userId = req.user!.uid;
    const orgDoc = await db.collection('organizations').doc(orgId).get();
    const orgData = orgDoc.data();

    if (!orgData) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const admins = (orgData['admins'] as Array<{ userId: string }>) ?? [];
    const adminIds = admins.map((a) => a.userId).filter(Boolean);
    const ownerId = orgData['ownerId'] as string | undefined;

    if (!adminIds.includes(userId) && ownerId !== userId) {
      return res.status(403).json({ error: 'Only organization admins can view allocations' });
    }

    const allocations = await getOrgTeamAllocations(db, orgId);

    return res.json({ success: true, data: allocations });
  } catch (error) {
    logger.error('[GET /budget/org/:orgId/allocations] Failed to get allocations', { error });
    return res.status(500).json({
      error: 'Failed to get team allocations',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
