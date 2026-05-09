import { describe, expect, it } from 'vitest';

import {
  canGenerateTeamIntelForUser,
  canManageTeamMembershipForRole,
  canManageTeamMutationWithResolvedRole,
} from '../../services/team/team-intel-permissions.js';

describe('canGenerateTeamIntelForUser', () => {
  it('allows administrative, coach, and director team managers to generate Intel', () => {
    expect(
      canGenerateTeamIntelForUser({
        userId: 'admin-1',
        legacyMembers: [{ id: 'admin-1', role: 'Administrative' }],
      })
    ).toBe(true);

    expect(
      canGenerateTeamIntelForUser({
        userId: 'coach-1',
        roster: [{ userId: 'coach-1', role: 'coach' }],
      })
    ).toBe(true);

    expect(
      canGenerateTeamIntelForUser({
        userId: 'director-1',
        roster: [{ userId: 'director-1', role: 'director' }],
      })
    ).toBe(true);
    expect(
      canGenerateTeamIntelForUser({
        userId: 'owner-1',
        roster: [{ userId: 'owner-1', role: 'owner' }],
      })
    ).toBe(true);
  });

  it('blocks non-manager roster roles', () => {
    expect(
      canGenerateTeamIntelForUser({
        userId: 'athlete-1',
        roster: [{ userId: 'athlete-1', role: 'athlete' }],
      })
    ).toBe(false);
  });
});

describe('canManageTeamMembershipForRole', () => {
  it('allows manager roles used by team editors', () => {
    expect(canManageTeamMembershipForRole('director')).toBe(true);
    expect(canManageTeamMembershipForRole('assistant-coach')).toBe(true);
    expect(canManageTeamMembershipForRole('program_director')).toBe(true);
    expect(canManageTeamMembershipForRole(' Administrative ')).toBe(true);
  });

  it('rejects non-manager roles', () => {
    expect(canManageTeamMembershipForRole('athlete')).toBe(false);
    expect(canManageTeamMembershipForRole('parent')).toBe(false);
    expect(canManageTeamMembershipForRole(undefined)).toBe(false);
  });
});

describe('canManageTeamMutationWithResolvedRole', () => {
  it('allows roster managers and explicit team admins to mutate team data', () => {
    expect(
      canManageTeamMutationWithResolvedRole({
        userId: 'coach-1',
        rosterRole: 'assistant-coach',
        teamData: {},
      })
    ).toBe(true);

    expect(
      canManageTeamMutationWithResolvedRole({
        userId: 'admin-1',
        teamData: { adminIds: ['admin-1'] },
      })
    ).toBe(true);

    expect(
      canManageTeamMutationWithResolvedRole({
        userId: 'creator-1',
        teamData: { createdBy: 'creator-1' },
      })
    ).toBe(true);

    expect(
      canManageTeamMutationWithResolvedRole({
        userId: 'legacy-1',
        teamData: {
          members: [{ id: 'legacy-1', role: 'Administrative' }],
        },
      })
    ).toBe(true);
  });

  it('rejects users without a manager role or admin linkage', () => {
    expect(
      canManageTeamMutationWithResolvedRole({
        userId: 'athlete-1',
        rosterRole: 'athlete',
        teamData: {
          adminIds: ['admin-1'],
          members: [{ id: 'athlete-1', role: 'athlete' }],
        },
      })
    ).toBe(false);
  });
});
