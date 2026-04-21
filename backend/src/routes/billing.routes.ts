/**
 * @fileoverview Usage Recording Routes
 * @module @nxt1/backend/routes
 *
 * API endpoints for recording usage events (usage-based billing)
 */

import { Router, type Request, type Response } from 'express';
import { appGuard, cronGuard } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';
import { getCacheService } from '../services/cache.service.js';
import {
  recordUsageEvent,
  getUserUsageEvents,
  getTeamUsageEvents,
  type CreateUsageEventInput,
  UsageFeature,
  getUnitCost,
  checkBudget,
  recordSpend,
  resolveBillingTarget,
  updateBudget,
  updateOrgBudget,
  updateTeamAllocation,
  deleteOrgBudget,
  deleteTeamAllocation,
  getOrgTeamAllocations,
  getPricingConfig,
  updatePricingConfig,
  type PricingConfig,
  getStripeClient,
  COLLECTIONS,
  refundCharge,
  generateInvoice,
  getOrCreateCustomer,
  getBillingState,
  getPersonalBillingSummary,
} from '../modules/billing/index.js';
import { validateBody } from '../middleware/validation.middleware.js';
import {
  CreateUsageEventDto,
  BudgetIntervalDto,
  UpdateBudgetDto,
  UpdateOrganizationBudgetDto,
  UpdateTeamAllocationDto,
  UpdatePricingConfigDto,
  OrgRefundDto,
} from '../dtos/billing.dto.js';

const router = Router();

function getNormalizedBudgetIntervalQuery(value: unknown): BudgetIntervalDto | null {
  if (
    value === BudgetIntervalDto.DAILY ||
    value === BudgetIntervalDto.WEEKLY ||
    value === BudgetIntervalDto.MONTHLY
  ) {
    return value;
  }

  if (value === undefined || value === null || value === '') {
    return BudgetIntervalDto.MONTHLY;
  }

  return null;
}

async function buildAvailableBudgetTargets(
  db: FirebaseFirestore.Firestore,
  organizationId: string
): Promise<readonly { id: string; type: 'organization' | 'team'; label: string }[]> {
  const teamsSnap = await db
    .collection('Teams')
    .where('organizationId', '==', organizationId)
    .get();

  return [
    { id: organizationId, type: 'organization', label: 'Organization' },
    ...teamsSnap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const label =
          (typeof data['name'] === 'string' && data['name'].trim()) ||
          (typeof data['teamName'] === 'string' && data['teamName'].trim()) ||
          'Unknown Team';
        return {
          id: doc.id,
          type: 'team' as const,
          label,
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label)),
  ];
}

// ============================================
// CACHE CONFIGURATION
// ============================================

const BILLING_CACHE_TTL = {
  pricing: 5 * 60, // 5 minutes  — pricing config rarely changes
} as const;

const PRICING_CACHE_KEY = 'billing:pricing:config';

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
 *   dynamicCostCents?: number  (pre-calculated cost from resolveAICost)
 *   rawProviderCostUsd?: number (raw OpenRouter cost for audit trail)
 * }
 */
router.post(
  '/usage',
  appGuard,
  validateBody(CreateUsageEventDto),
  async (req: Request, res: Response) => {
    try {
      const { feature, quantity, jobId, metadata, dynamicCostCents, rawProviderCostUsd } = req.body;

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

      // ── Determine cost ─────────────────────────────────────
      // Dynamic cost (from resolveAICost) takes precedence over static lookup
      const isDynamic = typeof dynamicCostCents === 'number' && dynamicCostCents > 0;
      const costCents = isDynamic
        ? dynamicCostCents * Number(quantity)
        : getUnitCost(feature as UsageFeature) * Number(quantity);

      // ── Budget gate ─────────────────────────────────────────
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
        ...(isDynamic
          ? {
              dynamicCostCents: dynamicCostCents as number,
              ...(typeof rawProviderCostUsd === 'number' ? { rawProviderCostUsd } : {}),
            }
          : {}),
      };

      const eventId = await recordUsageEvent(input, environment);

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
    const events = await getUserUsageEvents(userId, limit);

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
    const teamDoc = await db.collection('Teams').doc(teamId).get();
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
    const events = await getTeamUsageEvents(teamId, limit);

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

    // Read the user's personal billing state for user-level preferences
    const personalCtxData = await getPersonalBillingSummary(db, userId);
    const autoTopUpEnabled = personalCtxData?.autoTopUpEnabled ?? false;
    const autoTopUpThresholdCents = personalCtxData?.autoTopUpThresholdCents ?? 0;
    const autoTopUpAmountCents = personalCtxData?.autoTopUpAmountCents ?? 0;

    // Resolve billing target using the user's active billing target.
    const target = await resolveBillingTarget(db, userId);
    const ctx = target.context;
    const adminResult =
      target.type === 'organization' && target.organizationId
        ? await (async (): Promise<{ isOrgAdmin: boolean; isTeamAdmin: boolean }> => {
            const [userDoc, orgDoc] = await Promise.all([
              db.collection('Users').doc(userId).get(),
              db.collection('Organizations').doc(target.organizationId!).get(),
            ]);
            const role = userDoc.data()?.['role'] as string | undefined;
            const orgData = orgDoc.data();

            let orgAdmin = false;
            if (orgData) {
              const ownerId = orgData['ownerId'] as string | undefined;
              const admins = (orgData['admins'] as Array<{ userId: string }>) ?? [];
              const adminIds = admins.map((admin) => admin.userId).filter(Boolean);
              orgAdmin = role === 'director' || ownerId === userId || adminIds.includes(userId);
            }

            if (orgAdmin) {
              return { isOrgAdmin: true, isTeamAdmin: true };
            }

            const rosterSnap = await db
              .collection('RosterEntries')
              .where('userId', '==', userId)
              .where('status', '==', 'active')
              .limit(1)
              .get();

            if (!rosterSnap.empty) {
              const teamId = rosterSnap.docs[0]!.data()['teamId'] as string | undefined;
              if (teamId) {
                const teamDoc = await db.collection('Teams').doc(teamId).get();
                const teamData = teamDoc.data();
                const teamAdminIds: string[] = Array.isArray(teamData?.['adminIds'])
                  ? (teamData!['adminIds'] as string[])
                  : teamData?.['createdBy']
                    ? [teamData['createdBy'] as string]
                    : [];

                return {
                  isOrgAdmin: false,
                  isTeamAdmin: teamAdminIds.includes(userId),
                };
              }
            }

            return { isOrgAdmin: false, isTeamAdmin: false };
          })()
        : { isOrgAdmin: false, isTeamAdmin: false };

    const walletBalance = ctx.walletBalanceCents ?? 0;
    const availableBudgetTargets =
      target.type === 'organization' && target.organizationId && adminResult.isOrgAdmin
        ? await buildAvailableBudgetTargets(db, target.organizationId)
        : undefined;

    return res.json({
      success: true,
      data: {
        billingMode:
          ctx.billingMode ?? (target.type === 'organization' ? 'organization' : 'personal'),
        billingEntity: ctx.billingEntity,
        budgetInterval: ctx.budgetInterval ?? BudgetIntervalDto.MONTHLY,
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
        paymentProvider: ctx.paymentProvider,
        walletBalanceCents: walletBalance,
        pendingHoldsCents: ctx.pendingHoldsCents ?? 0,
        isOrgAdmin: adminResult.isOrgAdmin,
        isTeamAdmin: adminResult.isTeamAdmin,
        autoTopUpEnabled,
        autoTopUpThresholdCents,
        autoTopUpAmountCents,
        orgWalletEmpty: ctx.billingEntity !== 'individual' && walletBalance <= 0,
        availableBudgetTargets,
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
 * Update the current user's monthly budget.
 * For directors, resolves to the organization billing context.
 * Body: { monthlyBudget: number (cents) }
 */
router.put(
  '/budget',
  appGuard,
  validateBody(UpdateBudgetDto),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.uid;
      const { monthlyBudget, budgetInterval, hardStop } = req.body as UpdateBudgetDto;
      const db = req.firebase?.db;

      if (!db) throw new Error('Firebase context not available');

      // Resolve the correct billing target (directors → org context)
      const target = await resolveBillingTarget(db, userId);
      const normalizedInterval = budgetInterval ?? BudgetIntervalDto.MONTHLY;
      const normalizedHardStop = hardStop === undefined ? undefined : hardStop === 'hard';

      if (target.type === 'organization' && target.organizationId) {
        await updateOrgBudget(
          db,
          target.organizationId,
          monthlyBudget,
          normalizedInterval,
          normalizedHardStop
        );
      } else {
        await updateBudget(db, userId, monthlyBudget, normalizedInterval, normalizedHardStop);
      }

      return res.json({
        success: true,
        monthlyBudget,
        budgetInterval: normalizedInterval,
        hardStop: normalizedHardStop,
      });
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
      const { monthlyBudget, budgetInterval, hardStop } = req.body as UpdateOrganizationBudgetDto;
      const db = req.firebase?.db;

      if (!db) throw new Error('Firebase context not available');

      // Verify the caller is an org admin
      const userId = req.user!.uid;
      const orgDoc = await db.collection('Organizations').doc(orgId).get();
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

      const normalizedInterval = budgetInterval ?? BudgetIntervalDto.MONTHLY;
      const normalizedHardStop = hardStop === undefined ? undefined : hardStop === 'hard';
      await updateOrgBudget(db, orgId, monthlyBudget, normalizedInterval, normalizedHardStop);

      return res.json({
        success: true,
        organizationId: orgId,
        monthlyBudget,
        budgetInterval: normalizedInterval,
        hardStop: normalizedHardStop,
      });
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
 * DELETE /api/v1/billing/budget/org/:orgId
 * Delete an organization's master budget row for a given cadence (org admin only)
 * Query: ?budgetInterval=daily|weekly|monthly
 */
router.delete('/budget/org/:orgId', appGuard, async (req: Request, res: Response) => {
  try {
    const orgId = String(req.params['orgId'] ?? '').trim();
    if (!orgId || orgId.length > 128) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    const normalizedInterval = getNormalizedBudgetIntervalQuery(req.query['budgetInterval']);
    if (!normalizedInterval) {
      return res.status(400).json({
        error: 'Budget interval must be one of: daily, weekly, monthly',
      });
    }

    const db = req.firebase?.db;
    if (!db) throw new Error('Firebase context not available');

    const userId = req.user!.uid;
    const orgDoc = await db.collection('Organizations').doc(orgId).get();
    const orgData = orgDoc.data();

    if (!orgData) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const admins = (orgData['admins'] as Array<{ userId: string }>) ?? [];
    const adminIds = admins.map((a) => a.userId).filter(Boolean);
    const ownerId = orgData['ownerId'] as string | undefined;

    if (!adminIds.includes(userId) && ownerId !== userId) {
      return res.status(403).json({ error: 'Only organization admins can delete the org budget' });
    }

    await deleteOrgBudget(db, orgId, normalizedInterval);

    return res.json({
      success: true,
      organizationId: orgId,
      budgetInterval: normalizedInterval,
    });
  } catch (error) {
    logger.error('[DELETE /budget/org/:orgId] Failed to delete org budget', { error });
    return res.status(500).json({
      error: 'Failed to delete organization budget',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

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
      const { monthlyLimit, budgetInterval } = req.body as UpdateTeamAllocationDto;
      const db = req.firebase?.db;

      if (!db) throw new Error('Firebase context not available');

      // Verify the caller is an org admin
      const userId = req.user!.uid;
      const orgDoc = await db.collection('Organizations').doc(orgId).get();
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
      const teamDoc = await db.collection('Teams').doc(teamId).get();
      const teamData = teamDoc.data();
      if (!teamData || teamData['organizationId'] !== orgId) {
        return res.status(400).json({ error: 'Team does not belong to this organization' });
      }

      const normalizedInterval = budgetInterval ?? BudgetIntervalDto.MONTHLY;
      await updateTeamAllocation(db, teamId, orgId, monthlyLimit, normalizedInterval);

      return res.json({
        success: true,
        teamId,
        organizationId: orgId,
        monthlyLimit,
        budgetInterval: normalizedInterval,
      });
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
 * DELETE /api/v1/billing/budget/org/:orgId/team/:teamId
 * Delete a team's sub-allocation row for a given cadence (org admin only)
 * Query: ?budgetInterval=daily|weekly|monthly
 */
router.delete('/budget/org/:orgId/team/:teamId', appGuard, async (req: Request, res: Response) => {
  try {
    const orgId = String(req.params['orgId'] ?? '').trim();
    const teamId = String(req.params['teamId'] ?? '').trim();
    if (!orgId || orgId.length > 128 || !teamId || teamId.length > 128) {
      return res.status(400).json({ error: 'Invalid organization or team ID' });
    }

    const normalizedInterval = getNormalizedBudgetIntervalQuery(req.query['budgetInterval']);
    if (!normalizedInterval) {
      return res.status(400).json({
        error: 'Budget interval must be one of: daily, weekly, monthly',
      });
    }

    const db = req.firebase?.db;
    if (!db) throw new Error('Firebase context not available');

    const userId = req.user!.uid;
    const orgDoc = await db.collection('Organizations').doc(orgId).get();
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
        .json({ error: 'Only organization admins can delete team allocations' });
    }

    const teamDoc = await db.collection('Teams').doc(teamId).get();
    const teamData = teamDoc.data();
    if (!teamData || teamData['organizationId'] !== orgId) {
      return res.status(400).json({ error: 'Team does not belong to this organization' });
    }

    await deleteTeamAllocation(db, teamId, orgId, normalizedInterval);

    return res.json({
      success: true,
      teamId,
      organizationId: orgId,
      budgetInterval: normalizedInterval,
    });
  } catch (error) {
    logger.error('[DELETE /budget/org/:orgId/team/:teamId] Failed to delete team allocation', {
      error,
    });
    return res.status(500).json({
      error: 'Failed to delete team allocation',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

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
    const orgDoc = await db.collection('Organizations').doc(orgId).get();
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

// ============================================
// PRICING CONFIG — Admin
// IAP routes are at /api/v1/iap/ (see iap.routes.ts)
// ============================================

/**
 * GET /api/v1/billing/pricing
 * Get current pricing config (multiplier, feature overrides).
 * Intended for admin use.
 */
router.get('/pricing', appGuard, async (req: Request, res: Response) => {
  try {
    const db = req.firebase?.db;
    if (!db) throw new Error('Firebase context not available');

    try {
      const cached = await getCacheService().get<PricingConfig>(PRICING_CACHE_KEY);
      if (cached) {
        return res.json({ success: true, config: cached });
      }
    } catch {
      /* cache unavailable */
    }

    const config = await getPricingConfig(db);

    try {
      await getCacheService().set(PRICING_CACHE_KEY, config, { ttl: BILLING_CACHE_TTL.pricing });
    } catch {
      /* cache unavailable */
    }

    return res.json({ success: true, config });
  } catch (error) {
    logger.error('[GET /pricing] Failed to get pricing config', { error });
    return res.status(500).json({
      error: 'Failed to get pricing config',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/v1/billing/pricing
 * Update pricing config. Admin only.
 * Body: { defaultMultiplier?: number, featureOverrides?: Record<string, number> }
 */
router.put(
  '/pricing',
  appGuard,
  validateBody(UpdatePricingConfigDto),
  async (req: Request, res: Response) => {
    try {
      const db = req.firebase?.db;
      if (!db) throw new Error('Firebase context not available');

      const { defaultMultiplier, featureOverrides } = req.body as UpdatePricingConfigDto;

      await updatePricingConfig(db, {
        ...(defaultMultiplier !== undefined ? { defaultMultiplier } : {}),
        ...(featureOverrides !== undefined ? { featureOverrides } : {}),
      });

      // Bust Redis pricing cache so next GET picks up the new config immediately
      try {
        await getCacheService().del(PRICING_CACHE_KEY);
      } catch {
        /* cache unavailable */
      }

      return res.json({ success: true });
    } catch (error) {
      logger.error('[PUT /pricing] Failed to update pricing config', { error });
      return res.status(500).json({
        error: 'Failed to update pricing config',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// ============================================
// STRIPE REFUND — Org Admin
// ============================================

/**
 * POST /api/v1/billing/refund/org/:orgId
 * Org admin issues a Stripe refund for a specific charge.
 *
 * Body: { chargeId: string, amountCents?: number }
 *
 * Stripe fires a `charge.refunded` webhook which decrements
 * `currentPeriodSpend` on the org billing context automatically.
 */
router.post(
  '/refund/org/:orgId',
  appGuard,
  validateBody(OrgRefundDto),
  async (req: Request, res: Response) => {
    try {
      const orgId = String(req.params['orgId'] ?? '').trim();
      if (!orgId || orgId.length > 128) {
        return res.status(400).json({ error: 'Invalid organization ID' });
      }

      const { chargeId, amountCents } = req.body as OrgRefundDto;
      const db = req.firebase?.db;
      if (!db) throw new Error('Firebase context not available');

      // Verify caller is an org admin / owner
      const userId = req.user!.uid;
      const orgDoc = await db.collection('Organizations').doc(orgId).get();
      const orgData = orgDoc.data();
      if (!orgData) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const admins = (orgData['admins'] as Array<{ userId: string }>) ?? [];
      const adminIds = admins.map((a) => a.userId).filter(Boolean);
      const ownerId = orgData['ownerId'] as string | undefined;
      if (!adminIds.includes(userId) && ownerId !== userId) {
        return res.status(403).json({ error: 'Only organization admins can issue refunds' });
      }

      const environment = req.isStaging ? 'staging' : 'production';

      // Verify the charge belongs to a customer of this org (prevent cross-org refunds)
      const stripe = getStripeClient(environment);
      const charge = await stripe.charges.retrieve(chargeId);
      const chargeCustomerId =
        typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;

      if (chargeCustomerId) {
        const customerSnap = await db
          .collection(COLLECTIONS.STRIPE_CUSTOMERS)
          .where('stripeCustomerId', '==', chargeCustomerId)
          .where('environment', '==', environment)
          .limit(1)
          .get();

        if (!customerSnap.empty) {
          const linkedUserId = customerSnap.docs[0]!.data()['userId'] as string;
          // Must belong to this org (userId = 'org:<orgId>')
          if (linkedUserId !== `org:${orgId}`) {
            return res.status(403).json({
              error: 'Charge does not belong to this organization',
            });
          }
        }
      }

      const refund = await refundCharge(chargeId, environment, amountCents);

      logger.info('[POST /refund/org/:orgId] Refund issued', {
        orgId,
        chargeId,
        refundId: refund.id,
        amountCents: refund.amount,
        issuedBy: userId,
      });

      return res.json({
        success: true,
        data: {
          refundId: refund.id,
          chargeId,
          amountCents: refund.amount,
          status: refund.status,
        },
      });
    } catch (error) {
      logger.error('[POST /refund/org/:orgId] Failed to issue refund', { error });
      return res.status(500).json({
        error: 'Failed to issue refund',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/v1/billing/cron/send-monthly-invoices
 *
 * Manually trigger Stripe invoice generation for a user/org.
 * Protected by cronGuard (requires X-Cron-Secret header matching CRON_SECRET).
 *
 * Body: { userId: string, environment?: 'staging' | 'production' }
 *
 * How to test:
 *   curl -X POST https://<host>/api/v1/billing/cron/send-monthly-invoices \
 *     -H "X-Cron-Secret: <CRON_SECRET>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"userId":"<director-uid>","environment":"staging"}'
 */
router.post('/cron/send-monthly-invoices', cronGuard, async (req: Request, res: Response) => {
  try {
    const { userId, environment: envOverride } = req.body as {
      userId?: string;
      environment?: string;
    };

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId is required' });
    }

    const environment: 'staging' | 'production' =
      envOverride === 'staging' ? 'staging' : 'production';
    const db = req.firebase?.db;
    if (!db) return res.status(500).json({ error: 'Firebase context unavailable' });

    // Resolve who actually pays (director → org, individual → individual)
    const billingCtx = await getBillingState(db, userId);
    if (!billingCtx) {
      return res.status(404).json({ error: `No billing context for user ${userId}` });
    }

    if (billingCtx.paymentProvider === 'iap') {
      return res.status(400).json({
        error:
          'IAP user — Stripe invoices do not apply. Billing is handled via Apple/Google wallet.',
      });
    }

    // Determine the customer ID to bill
    let customerUserId = userId;
    let description = `individual: ${userId}`;

    if (billingCtx.billingEntity === 'organization' && billingCtx.organizationId) {
      customerUserId = `org:${billingCtx.organizationId}`;
      description = `org: ${billingCtx.organizationId}`;
      const orgDoc = await db.collection('Organizations').doc(billingCtx.organizationId).get();
      const orgData = orgDoc.data();
      const orgEmail =
        (orgData?.['billingEmail'] as string) ||
        (orgData?.['email'] as string) ||
        `${billingCtx.organizationId}@nxt1.app`;
      const customer = await getOrCreateCustomer(
        db,
        customerUserId,
        orgEmail,
        billingCtx.teamId,
        environment
      );
      const result = await generateInvoice(customer.customerId, environment, {
        collectionMethod: 'send_invoice',
        daysUntilDue: 30,
      });
      logger.info('[POST /cron/send-monthly-invoices] Invoice triggered for org', {
        userId,
        organizationId: billingCtx.organizationId,
        customerId: customer.customerId,
        result,
      });
      return res.json({
        success: result.success,
        customerId: customer.customerId,
        description,
        result,
      });
    }

    // Individual
    const userDoc = await db.collection('Users').doc(userId).get();
    const userData = userDoc.data();
    const userEmail = (userData?.['email'] as string) || `${userId}@nxt1.app`;
    const customer = await getOrCreateCustomer(db, userId, userEmail, undefined, environment);
    const result = await generateInvoice(customer.customerId, environment, {
      collectionMethod: 'charge_automatically',
    });
    logger.info('[POST /cron/send-monthly-invoices] Invoice triggered for individual', {
      userId,
      customerId: customer.customerId,
      result,
    });
    return res.json({
      success: result.success,
      customerId: customer.customerId,
      description,
      result,
    });
  } catch (error) {
    logger.error('[POST /cron/send-monthly-invoices] Failed', { error });
    return res.status(500).json({
      error: 'Failed to generate invoice',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
