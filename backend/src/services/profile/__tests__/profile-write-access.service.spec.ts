import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUserTeams, mockGetActiveOrPendingRosterEntry } = vi.hoisted(() => ({
  mockGetUserTeams: vi.fn(),
  mockGetActiveOrPendingRosterEntry: vi.fn(),
}));

vi.mock('../../team/roster-entry.service.js', () => ({
  createRosterEntryService: () => ({
    getUserTeams: mockGetUserTeams,
    getActiveOrPendingRosterEntry: mockGetActiveOrPendingRosterEntry,
  }),
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { RosterEntryStatus } from '@nxt1/core/models';
import {
  createProfileWriteAccessService,
  resolveAuthorizedTargetSportSelection,
} from '../profile-write-access.service.js';

function createDocSnapshot(data: Record<string, unknown>, exists = true) {
  return {
    exists,
    data: () => data,
  };
}

function createDb(targetUserData: Record<string, unknown>) {
  return {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name === 'Users') {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(createDocSnapshot(targetUserData)),
          }),
        };
      }

      throw new Error(`Unexpected collection ${name}`);
    }),
  };
}

describe('ProfileWriteAccessService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows self writes without roster checks', async () => {
    const service = createProfileWriteAccessService(
      createDb({ role: 'coach', displayName: 'Coach Self' }) as never
    );

    const result = await service.assertCanManageProfileTarget({
      actorUserId: 'user-1',
      targetUserId: 'user-1',
      action: 'test:self',
    });

    expect(result.isSelfWrite).toBe(true);
    expect(mockGetUserTeams).not.toHaveBeenCalled();
  });

  it('rejects coach self-target access for athlete-only tools', async () => {
    const service = createProfileWriteAccessService(
      createDb({ role: 'coach', displayName: 'Coach Self' }) as never
    );

    await expect(
      service.assertCanManageAthleteProfileTarget({
        actorUserId: 'coach-1',
        targetUserId: 'coach-1',
        action: 'test:athlete-only-self',
      })
    ).rejects.toBeTruthy();
  });

  it('allows delegated coach writes to a shared athlete roster member', async () => {
    mockGetUserTeams.mockResolvedValue([
      {
        userId: 'coach-1',
        teamId: 'team-1',
        organizationId: 'org-1',
        sport: 'football',
        role: 'coach',
        status: RosterEntryStatus.ACTIVE,
      },
    ]);
    mockGetActiveOrPendingRosterEntry.mockResolvedValue({
      userId: 'athlete-1',
      teamId: 'team-1',
      organizationId: 'org-1',
      sport: 'football',
      role: 'athlete',
      status: RosterEntryStatus.ACTIVE,
    });

    const service = createProfileWriteAccessService(
      createDb({ role: 'athlete', displayName: 'Athlete Target' }) as never
    );

    const result = await service.assertCanManageProfileTarget({
      actorUserId: 'coach-1',
      targetUserId: 'athlete-1',
      action: 'test:delegated',
    });

    expect(result.isSelfWrite).toBe(false);
    expect(result.sharedTeamIds).toEqual(['team-1']);
    expect(result.sharedOrganizationIds).toEqual(['org-1']);
    expect(result.sharedSports).toEqual(['football']);
  });

  it('rejects delegated writes when the target is not an athlete', async () => {
    const service = createProfileWriteAccessService(
      createDb({ role: 'coach', displayName: 'Another Coach' }) as never
    );

    await expect(
      service.assertCanManageProfileTarget({
        actorUserId: 'coach-1',
        targetUserId: 'coach-2',
        action: 'test:not-athlete',
      })
    ).rejects.toBeTruthy();
  });

  it('rejects delegated writes without shared team scope', async () => {
    mockGetUserTeams.mockResolvedValue([
      {
        userId: 'director-1',
        teamId: 'team-1',
        organizationId: 'org-1',
        role: 'director',
        status: RosterEntryStatus.ACTIVE,
      },
    ]);
    mockGetActiveOrPendingRosterEntry.mockResolvedValue(null);

    const service = createProfileWriteAccessService(
      createDb({ role: 'athlete', displayName: 'Athlete Target' }) as never
    );

    await expect(
      service.assertCanManageProfileTarget({
        actorUserId: 'director-1',
        targetUserId: 'athlete-1',
        action: 'test:no-shared-team',
      })
    ).rejects.toBeTruthy();
  });

  it('rejects delegated writes when the athlete roster entry is only pending', async () => {
    mockGetUserTeams.mockResolvedValue([
      {
        userId: 'coach-1',
        teamId: 'team-1',
        organizationId: 'org-1',
        role: 'coach',
        status: RosterEntryStatus.ACTIVE,
      },
    ]);
    mockGetActiveOrPendingRosterEntry.mockResolvedValue({
      userId: 'athlete-1',
      teamId: 'team-1',
      organizationId: 'org-1',
      role: 'athlete',
      status: RosterEntryStatus.PENDING,
    });

    const service = createProfileWriteAccessService(
      createDb({ role: 'athlete', displayName: 'Athlete Target' }) as never
    );

    await expect(
      service.assertCanManageProfileTarget({
        actorUserId: 'coach-1',
        targetUserId: 'athlete-1',
        action: 'test:pending-target',
      })
    ).rejects.toBeTruthy();
  });

  it('does not grant shared sport scope when actor and athlete roster sports differ', async () => {
    mockGetUserTeams.mockResolvedValue([
      {
        userId: 'coach-1',
        teamId: 'team-1',
        organizationId: 'org-1',
        sport: 'football',
        role: 'coach',
        status: RosterEntryStatus.ACTIVE,
      },
    ]);
    mockGetActiveOrPendingRosterEntry.mockResolvedValue({
      userId: 'athlete-1',
      teamId: 'team-1',
      organizationId: 'org-1',
      sport: 'basketball',
      role: 'athlete',
      status: RosterEntryStatus.ACTIVE,
    });

    const service = createProfileWriteAccessService(
      createDb({ role: 'athlete', displayName: 'Athlete Target' }) as never
    );

    const result = await service.assertCanManageProfileTarget({
      actorUserId: 'coach-1',
      targetUserId: 'athlete-1',
      action: 'test:mismatched-sport-scope',
    });

    expect(result.sharedSports).toEqual([]);
  });

  it('resolves delegated sport access for legacy sports[].id records', () => {
    const selection = resolveAuthorizedTargetSportSelection(
      {
        sports: [
          {
            id: 'football',
            team: {
              teamId: 'team-1',
              organizationId: 'org-1',
            },
          },
        ],
      },
      'football',
      {
        actorUserId: 'coach-1',
        targetUserId: 'athlete-1',
        targetRole: 'athlete',
        targetUserData: {},
        isSelfWrite: false,
        sharedTeamIds: ['team-1'],
        sharedOrganizationIds: ['org-1'],
        sharedSports: ['football'],
      }
    );

    expect(selection?.index).toBe(0);
    expect(selection?.sportKey).toBe('football');
  });

  it('rejects delegated sport access when the roster sport does not match', () => {
    const selection = resolveAuthorizedTargetSportSelection(
      {
        sports: [
          {
            sport: 'basketball',
            team: {
              teamId: 'team-1',
              organizationId: 'org-1',
            },
          },
        ],
      },
      'basketball',
      {
        actorUserId: 'coach-1',
        targetUserId: 'athlete-1',
        targetRole: 'athlete',
        targetUserData: {},
        isSelfWrite: false,
        sharedTeamIds: ['team-1'],
        sharedOrganizationIds: ['org-1'],
        sharedSports: ['football'],
      }
    );

    expect(selection).toBeNull();
  });
});
