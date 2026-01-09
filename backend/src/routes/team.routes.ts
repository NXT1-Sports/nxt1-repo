/**
 * @fileoverview Team Routes
 * @module @nxt1/backend
 *
 * Team management routes using shared @nxt1/core types.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import type { ApiResponse, TeamV2, TeamMember } from '@nxt1/core';
import { isValidTeamCode, slugify } from '@nxt1/core';

import { db } from '../utils/firebase.js';
import { appGuard } from '../middleware/auth.middleware.js';

const router = Router();

// Apply auth guard to all routes
router.use(appGuard);

/**
 * GET /teams
 * Get teams the current user belongs to
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { uid } = req.user!;

    // Get user's team memberships
    const membershipSnapshot = await db
      .collection('TeamMembers')
      .where('userId', '==', uid)
      .get();

    const teamIds = membershipSnapshot.docs.map((doc) => doc.data().teamId);

    if (teamIds.length === 0) {
      return res.json({
        success: true,
        data: { teams: [] },
      });
    }

    // Fetch team details
    const teams: TeamV2[] = [];
    for (const teamId of teamIds) {
      const teamDoc = await db.collection('Teams').doc(teamId).get();
      if (teamDoc.exists) {
        const data = teamDoc.data()!;
        teams.push({
          id: teamDoc.id,
          name: data.name,
          slug: data.slug,
          sport: data.sport,
          teamType: data.teamType || 'high-school',
          logoUrl: data.logoUrl,
          bannerUrl: data.bannerUrl,
          location: data.location,
          description: data.description,
          memberCount: data.memberCount || 0,
          isPublic: data.isPublic ?? true,
          ownerId: data.ownerId,
          teamCode: data.teamCode,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      }
    }

    res.json({
      success: true,
      data: { teams },
    });
  } catch (error) {
    console.error('[Teams] get teams error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch teams',
    });
  }
});

/**
 * POST /teams
 * Create a new team
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { uid } = req.user!;
    const { name, sport, teamType, description, location, isPublic } = req.body;

    // Validation
    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Team name is required',
      });
    }

    if (!sport?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Sport is required',
      });
    }

    // Generate slug and team code
    const slug = slugify(name);
    const teamCode = generateTeamCode();

    const newTeam = {
      name: name.trim(),
      slug,
      sport: sport.trim(),
      teamType: teamType || 'high-school',
      description: description?.trim() || '',
      location: location || {},
      isPublic: isPublic ?? true,
      ownerId: uid,
      teamCode,
      memberCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const teamRef = await db.collection('Teams').add(newTeam);

    // Add creator as owner member
    await db.collection('TeamMembers').add({
      teamId: teamRef.id,
      userId: uid,
      role: 'owner',
      joinedAt: new Date().toISOString(),
    });

    // Create TeamCode document
    await db.collection('TeamCodes').add({
      teamCode,
      teamId: teamRef.id,
      teamName: name.trim(),
      sportName: sport.trim(),
      teamType: teamType || 'high-school',
      isActive: true,
      members: [uid],
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      data: {
        team: {
          id: teamRef.id,
          ...newTeam,
        },
      },
    });
  } catch (error) {
    console.error('[Teams] create team error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create team',
    });
  }
});

/**
 * GET /teams/:id
 * Get a specific team
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const doc = await db.collection('Teams').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Team not found',
      });
    }

    const data = doc.data()!;

    const team: TeamV2 = {
      id: doc.id,
      name: data.name,
      slug: data.slug,
      sport: data.sport,
      teamType: data.teamType || 'high-school',
      logoUrl: data.logoUrl,
      bannerUrl: data.bannerUrl,
      location: data.location,
      description: data.description,
      memberCount: data.memberCount || 0,
      isPublic: data.isPublic ?? true,
      ownerId: data.ownerId,
      teamCode: data.teamCode,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };

    res.json({
      success: true,
      data: { team },
    });
  } catch (error) {
    console.error('[Teams] get team error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch team',
    });
  }
});

/**
 * GET /teams/:id/members
 * Get team members
 */
router.get('/:id/members', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const membershipSnapshot = await db
      .collection('TeamMembers')
      .where('teamId', '==', id)
      .get();

    const members: TeamMember[] = [];

    for (const memberDoc of membershipSnapshot.docs) {
      const memberData = memberDoc.data();
      const userDoc = await db.collection('Users').doc(memberData.userId).get();

      if (userDoc.exists) {
        const userData = userDoc.data()!;
        members.push({
          id: memberDoc.id,
          teamId: id,
          userId: memberData.userId,
          role: memberData.role || 'member',
          displayName: userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
          photoUrl: userData.photoURL,
          position: userData.position,
          jerseyNumber: memberData.jerseyNumber,
          joinedAt: memberData.joinedAt,
        });
      }
    }

    res.json({
      success: true,
      data: { members },
    });
  } catch (error) {
    console.error('[Teams] get members error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch team members',
    });
  }
});

/**
 * POST /teams/:id/join
 * Join a team with team code
 */
router.post('/:id/join', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { uid } = req.user!;
    const { teamCode } = req.body;

    const teamDoc = await db.collection('Teams').doc(id).get();

    if (!teamDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Team not found',
      });
    }

    const teamData = teamDoc.data()!;

    // Verify team code if provided
    if (teamCode && teamData.teamCode !== teamCode.toUpperCase()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid team code',
      });
    }

    // Check if already a member
    const existingMembership = await db
      .collection('TeamMembers')
      .where('teamId', '==', id)
      .where('userId', '==', uid)
      .limit(1)
      .get();

    if (!existingMembership.empty) {
      return res.status(409).json({
        success: false,
        error: 'Already a team member',
      });
    }

    // Add as member
    await db.collection('TeamMembers').add({
      teamId: id,
      userId: uid,
      role: 'member',
      joinedAt: new Date().toISOString(),
    });

    // Update member count
    await db
      .collection('Teams')
      .doc(id)
      .update({
        memberCount: (teamData.memberCount || 0) + 1,
        updatedAt: new Date().toISOString(),
      });

    res.json({
      success: true,
      message: 'Successfully joined team',
    });
  } catch (error) {
    console.error('[Teams] join team error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to join team',
    });
  }
});

/**
 * DELETE /teams/:id/leave
 * Leave a team
 */
router.delete('/:id/leave', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { uid } = req.user!;

    const membershipSnapshot = await db
      .collection('TeamMembers')
      .where('teamId', '==', id)
      .where('userId', '==', uid)
      .limit(1)
      .get();

    if (membershipSnapshot.empty) {
      return res.status(404).json({
        success: false,
        error: 'Not a team member',
      });
    }

    const memberDoc = membershipSnapshot.docs[0];
    const memberData = memberDoc.data();

    // Owners cannot leave (must transfer ownership first)
    if (memberData.role === 'owner') {
      return res.status(400).json({
        success: false,
        error: 'Team owner cannot leave. Transfer ownership first.',
      });
    }

    // Remove membership
    await memberDoc.ref.delete();

    // Update member count
    const teamDoc = await db.collection('Teams').doc(id).get();
    if (teamDoc.exists) {
      await db
        .collection('Teams')
        .doc(id)
        .update({
          memberCount: Math.max((teamDoc.data()!.memberCount || 0) - 1, 0),
          updatedAt: new Date().toISOString(),
        });
    }

    res.json({
      success: true,
      message: 'Successfully left team',
    });
  } catch (error) {
    console.error('[Teams] leave team error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to leave team',
    });
  }
});

/**
 * Generate a unique team code
 */
function generateTeamCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default router;
