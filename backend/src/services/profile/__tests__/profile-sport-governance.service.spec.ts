import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUserTeams, warnLogger } = vi.hoisted(() => ({
  mockGetUserTeams: vi.fn(),
  warnLogger: vi.fn(),
}));

vi.mock('../../team/roster-entry.service.js', () => ({
  createRosterEntryService: () => ({
    getUserTeams: mockGetUserTeams,
  }),
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: warnLogger,
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { assertCanMutateOwnSports } from '../profile-sport-governance.service.js';

function createOrganizationSnapshot(id: string, data: Record<string, unknown>, exists = true) {
  return {
    id,
    exists,
    data: () => data,
  };
}

function createDb(organizations: Record<string, Record<string, unknown>>) {
  return {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name !== 'Organizations') {
        throw new Error(`Unexpected collection ${name}`);
      }

      return {
        doc: vi.fn().mockImplementation((id: string) => ({
          get: vi
            .fn()
            .mockResolvedValue(
              organizations[id]
                ? createOrganizationSnapshot(id, organizations[id])
                : createOrganizationSnapshot(id, {}, false)
            ),
        })),
      };
    }),
  };
}

describe('assertCanMutateOwnSports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows sport mutation when the user has no governed organization affiliations', async () => {
    mockGetUserTeams.mockResolvedValue([]);

    await expect(
      assertCanMutateOwnSports(createDb({}) as never, 'user-1')
    ).resolves.toBeUndefined();
  });

  it('allows sport mutation for organization admins in claimed orgs', async () => {
    mockGetUserTeams.mockResolvedValue([{ organizationId: 'org-1' }]);

    const db = createDb({
      'org-1': {
        isClaimed: true,
        admins: [{ userId: 'admin-1', role: 'director' }],
      },
    });

    await expect(assertCanMutateOwnSports(db as never, 'admin-1')).resolves.toBeUndefined();
  });

  it('rejects sport mutation for non-admin members of claimed organizations', async () => {
    mockGetUserTeams.mockResolvedValue([{ organizationId: 'org-1' }]);

    const db = createDb({
      'org-1': {
        isClaimed: true,
        admins: [{ userId: 'director-1', role: 'director' }],
      },
    });

    await expect(assertCanMutateOwnSports(db as never, 'member-1')).rejects.toMatchObject({
      code: 'AUTHZ_ADMIN_REQUIRED',
      statusCode: 403,
    });
    expect(warnLogger).toHaveBeenCalledWith(
      '[Profile] Governed organization blocked sport mutation',
      expect.objectContaining({ userId: 'member-1', organizationId: 'org-1' })
    );
  });
});
