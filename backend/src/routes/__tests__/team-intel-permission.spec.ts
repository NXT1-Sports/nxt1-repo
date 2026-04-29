import { describe, expect, it } from 'vitest';

import {
  canGenerateTeamIntelForUser,
  canManageTeamMembershipForRole,
} from '../team/teams.routes.js';

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
