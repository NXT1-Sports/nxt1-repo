/**
 * @fileoverview Auth Routes — Team Code, Username, Team Sources
 * @module @nxt1/backend/routes/auth
 *
 * Handles:
 * - GET /validate-team-code  (alias: GET /team-code/validate/:code)
 * - GET /team-sources/:teamId
 * - GET /check-username
 */

import { Router } from 'express';
import type { Request, Response, Router as RouterType } from 'express';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { validationError, notFoundError } from '@nxt1/core/errors';
import { isValidTeamCode } from '@nxt1/core';
import type { ValidateTeamCodeResponse, TeamTypeApi } from '@nxt1/core';
import { logger } from '../../utils/logger.js';
import type { ConnectedSourceRecord } from './shared.js';

const router: RouterType = Router();

/**
 * GET /auth/validate-team-code
 * GET /auth/team-code/validate/:code
 * Validates a team code and returns basic team info (no auth required).
 */
router.get(
  ['/validate-team-code', '/team-code/validate/:code'],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const code = (req.params['code'] || req.query['teamCode']) as string;

    if (!code || !isValidTeamCode(code)) {
      const error = validationError([
        { field: 'teamCode', message: 'Team code is required', rule: 'required' },
      ]);
      sendError(res, error);
      return;
    }

    // Query Firestore
    const snapshot = await db
      .collection('Teams')
      .where('teamCode', '==', code.toUpperCase())
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (snapshot.empty) {
      const error = notFoundError('teamCode');
      sendError(res, error);
      return;
    }

    const doc = snapshot.docs[0];
    const data = doc?.data();

    const response: ValidateTeamCodeResponse = {
      valid: true,
      teamCode: {
        id: doc.id,
        code: data?.['teamCode'] as string,
        teamName: data?.['teamName'] as string,
        teamType: ((data?.['teamType'] as string)?.toLowerCase().replace(' ', '-') ||
          'high-school') as TeamTypeApi,
        sport: (data?.['sport'] as string) || (data?.['sportName'] as string),
        isFreeTrial: (data?.['isFreeTrial'] as boolean) || false,
        trialDays: data?.['trialDays'] as number | undefined,
        memberCount: (data?.['members'] as unknown[])?.length || 0,
        maxMembers: data?.['maxMembers'] as number | undefined,
      },
    };

    res.json(response);
  })
);

/**
 * GET /auth/team-sources/:teamId
 * Fetch existing connected sources for a team during onboarding.
 */
router.get(
  '/team-sources/:teamId',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const teamId = req.params['teamId'] as string;

    if (!teamId?.trim()) {
      const error = validationError([
        { field: 'teamId', message: 'Team ID is required', rule: 'required' },
      ]);
      sendError(res, error);
      return;
    }

    const teamDoc = await db.collection('Teams').doc(teamId).get();
    if (!teamDoc.exists) {
      res.json({ success: true, data: [] });
      return;
    }

    const teamData = teamDoc.data();
    const sources: ConnectedSourceRecord[] = Array.isArray(teamData?.['connectedSources'])
      ? teamData!['connectedSources']
      : [];

    res.json({ success: true, data: sources });
  })
);

/**
 * GET /auth/check-username
 * Check if a username is available.
 */
router.get(
  '/check-username',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const { username } = req.query;

    if (!username || typeof username !== 'string') {
      const error = validationError([
        { field: 'username', message: 'Username is required', rule: 'required' },
      ]);
      sendError(res, error);
      return;
    }

    const snapshot = await db
      .collection('Users')
      .where('username', '==', username.toLowerCase())
      .limit(1)
      .get();

    res.json({
      available: snapshot.empty,
      suggestions: snapshot.empty ? [] : [`${username}1`, `${username}2`, `${username}_`],
    });

    logger.debug('[GET /check-username]', { username, available: snapshot.empty });
  })
);

export default router;
