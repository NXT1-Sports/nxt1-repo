/**
 * @fileoverview Organization Routes
 * @module @nxt1/backend/routes/organization
 *
 * Endpoints for organization-level operations:
 * - POST /:organizationId/teams — Create a new team under an existing organization
 *
 * @version 1.0.0
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { CreateOrgTeamDto, OrgTeamType } from '../dtos/organization.dto.js';
import { asyncHandler, sendSuccess } from '@nxt1/core/errors/express';
import { validationError, notFoundError, forbiddenError, conflictError } from '@nxt1/core/errors';
import { RosterRole, RosterEntryStatus, type TeamTypeApi } from '@nxt1/core/models';
import * as teamCodeService from '../services/team-code.service.js';
import { createOrganizationService } from '../services/organization.service.js';
import { createRosterEntryService } from '../services/roster-entry.service.js';
import { getUserById } from '../services/users.service.js';
import { logger } from '../utils/logger.js';

const router = Router();

function normalizeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeOrgTeamType(teamType: OrgTeamType | undefined): TeamTypeApi {
  switch (teamType) {
    case OrgTeamType.HIGH_SCHOOL:
      return 'high-school';
    case OrgTeamType.CLUB:
      return 'club';
    case OrgTeamType.COLLEGE:
      return 'college';
    case OrgTeamType.MIDDLE_SCHOOL:
      return 'middle-school';
    // Organization flow supports these extra values in DTO; map to closest API type.
    case OrgTeamType.TRAVEL:
    case OrgTeamType.ACADEMY:
      return 'organization';
    case undefined:
      return 'high-school';
    default:
      return 'high-school';
  }
}

// ============================================
// POST /:organizationId/teams
// Create a new sport team under an existing organization
// ============================================

router.post(
  '/:organizationId/teams',
  appGuard,
  validateBody(CreateOrgTeamDto),
  asyncHandler(async (req: Request, res: Response) => {
    const organizationId = normalizeParam(req.params['organizationId']);
    const userId = req.user!.uid;
    const db = req.firebase!.db;
    const body = req.body as CreateOrgTeamDto;
    const sport = body.sport.trim().toLowerCase();

    if (!organizationId?.trim()) {
      throw validationError([
        { field: 'organizationId', message: 'Organization ID is required', rule: 'required' },
      ]);
    }

    logger.info('[Organization] Creating team under org', {
      organizationId,
      sport,
      userId,
    });

    // 1. Verify the organization exists
    const orgService = createOrganizationService(db);
    let org;
    try {
      org = await orgService.getOrganizationById(organizationId);
    } catch {
      throw notFoundError('Organization not found');
    }

    // 2. Permission check: caller must be the owner or an admin of this org
    const isOwner = org.ownerId === userId;
    const isAdmin = org.admins?.some((a: { userId: string }) => a.userId === userId);
    if (!isOwner && !isAdmin) {
      throw forbiddenError('permission');
    }

    // 3. Idempotency — check if a team for this sport already exists
    const existingQuery = await db
      .collection('Teams')
      .where('organizationId', '==', organizationId)
      .where('sport', '==', sport)
      .where('isActive', '==', true)
      .get();

    if (!existingQuery.empty) {
      // Also check legacy field name
      const alreadyExists = existingQuery.docs.some((doc) => {
        const d = doc.data();
        return d['sport'] === sport || d['sportName'] === sport;
      });
      if (alreadyExists) {
        throw conflictError(`A team for "${body.sport}" already exists under this organization`);
      }
    }

    // 4. Generate a unique 6-character team code
    let teamCode = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { team: existing } = await teamCodeService.getTeamCodeByCode(db, candidate, false);
      if (!existing) {
        teamCode = candidate;
        break;
      }
    }
    if (!teamCode) {
      throw new Error('Failed to generate unique team code after 10 attempts');
    }

    // 5. Fetch user details for the creator member record
    const user = await getUserById(userId, db);
    const creatorName = asString(user?.['displayName']) || asString(user?.['name']);
    const creatorEmail = asString(user?.['email']);

    // 6. Create the team via teamCodeService
    const teamType = normalizeOrgTeamType(body.teamType);
    const team = await teamCodeService.createTeamCode(db, {
      teamCode,
      teamName: org.name,
      teamType,
      sport,
      createdBy: userId,
      creatorRole: 'coach',
      creatorName,
      creatorEmail,
      level: body.level ?? '',
    });

    if (!team.id) {
      throw new Error('Team creation succeeded without team id');
    }

    logger.info('[Organization] Team created, linking to org', {
      teamId: team.id,
      organizationId,
      sport,
    });

    // 7. Link team to organization
    await db.collection('Teams').doc(team.id).update({
      organizationId,
      isClaimed: true,
      source: 'user_generated',
      updatedAt: new Date().toISOString(),
    });

    // 8. Increment org team count
    await orgService.incrementTeamCount(organizationId);

    // 9. Create roster entry (coach → team)
    const rosterService = createRosterEntryService(db);
    await rosterService.createRosterEntry({
      userId,
      teamId: team.id,
      organizationId,
      role: RosterRole.HEAD_COACH,
      status: RosterEntryStatus.ACTIVE,
      firstName: creatorName.split(/\s+/)[0] ?? '',
      lastName: creatorName.split(/\s+/).slice(1).join(' ') ?? '',
      email: creatorEmail,
    });

    logger.info('[Organization] Team + roster created successfully', {
      teamId: team.id,
      organizationId,
      sport,
      userId,
    });

    // 10. Return the newly created team with org context
    res.status(201);
    sendSuccess(res, {
      team: {
        id: team.id,
        teamCode: team.teamCode,
        teamName: team.teamName,
        sport: team.sport,
        organizationId,
        slug: team.slug,
        unicode: team.unicode,
      },
    });
  })
);

export default router;
