import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Organization, User } from '@nxt1/core';
import { ProfileHydrationService } from '../profile-hydration.service.js';

function createTeamDoc(id: string, data: Record<string, unknown>, exists = true) {
  return {
    id,
    exists,
    data: () => data,
  };
}

function createDb(teamDocs: Record<string, Record<string, unknown>>) {
  return {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name !== 'Teams') {
        throw new Error(`Unexpected collection: ${name}`);
      }

      return {
        doc: vi.fn().mockImplementation((id: string) => ({
          get: vi
            .fn()
            .mockResolvedValue(
              teamDocs[id] ? createTeamDoc(id, teamDocs[id]) : createTeamDoc(id, {}, false)
            ),
        })),
      };
    }),
  };
}

function createOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    name: 'Denver High School',
    type: 'organization',
    status: 'active',
    admins: [],
    isClaimed: true,
    source: 'user_generated',
    createdAt: '2026-03-16T00:00:00.000Z',
    createdBy: 'creator-1',
    ...overrides,
  };
}

describe('ProfileHydrationService', () => {
  const rosterEntryService = {
    getUserTeams: vi.fn(),
  };
  const organizationService = {
    getOrganizationById: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hydrates claimed organization admin flags from organization admins', async () => {
    const directorUserId = 'gg4zqduRE8el4RbnCpnKC4VG7RY2';
    rosterEntryService.getUserTeams.mockResolvedValue([{ teamId: 'team-1' }]);
    organizationService.getOrganizationById.mockResolvedValue(
      createOrganization({
        admins: [{ userId: directorUserId, role: 'director', addedAt: '2026-04-20T22:35:33.000Z' }],
        isClaimed: true,
      })
    );

    const service = new ProfileHydrationService(
      createDb({
        'team-1': {
          sport: 'Football',
          organizationId: 'org-1',
          teamType: 'high-school',
          teamName: 'Denver High School',
        },
      }) as never,
      rosterEntryService as never,
      organizationService as never
    );

    const hydrated = await service.hydrateUser({
      id: directorUserId,
      role: 'director',
      sports: [{ sport: 'Football', order: 0 }],
    } as User);

    expect(hydrated.sports?.[0]?.team).toMatchObject({
      name: 'Denver High School',
      isOrganizationClaimed: true,
      isUserOrganizationAdmin: true,
    });
  });

  it('hydrates claimed organization flags as non-admin for roster members outside org admins', async () => {
    rosterEntryService.getUserTeams.mockResolvedValue([{ teamId: 'team-1' }]);
    organizationService.getOrganizationById.mockResolvedValue(
      createOrganization({
        admins: [{ userId: 'director-1', role: 'director', addedAt: '2026-04-20T22:35:33.000Z' }],
        isClaimed: true,
      })
    );

    const service = new ProfileHydrationService(
      createDb({
        'team-1': {
          sport: 'Football',
          organizationId: 'org-1',
          teamType: 'high-school',
          teamName: 'Denver High School',
        },
      }) as never,
      rosterEntryService as never,
      organizationService as never
    );

    const hydrated = await service.hydrateUser({
      id: 'member-1',
      role: 'director',
      sports: [{ sport: 'Football', order: 0 }],
    } as User);

    expect(hydrated.sports?.[0]?.team).toMatchObject({
      isOrganizationClaimed: true,
      isUserOrganizationAdmin: false,
    });
  });
});
