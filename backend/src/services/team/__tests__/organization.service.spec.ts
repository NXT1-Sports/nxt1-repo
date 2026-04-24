import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/cache.service.js', () => ({
  getCacheService: () => null,
  CACHE_TTL: { PROFILES: 300 },
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { OrganizationService } from '../organization.service.js';

function createDb() {
  const update = vi.fn(async () => undefined);

  return {
    update,
    db: {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          update,
        }),
      }),
    },
  };
}

describe('OrganizationService.addAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('promotes the first coach to org admin when no director exists', async () => {
    const { db, update } = createDb();
    const service = new OrganizationService(db as never);

    vi.spyOn(service, 'getOrganizationById')
      .mockResolvedValueOnce({
        id: 'org-1',
        name: 'Alcoa',
        type: 'organization',
        status: 'active',
        admins: [],
        ownerId: '',
        isClaimed: false,
        source: 'user_generated',
        createdAt: '2026-04-21T00:00:00.000Z',
        createdBy: 'seed-user',
      } as never)
      .mockResolvedValueOnce({
        id: 'org-1',
        name: 'Alcoa',
        type: 'organization',
        status: 'active',
        admins: [{ userId: 'coach-1', role: 'coach', addedAt: '2026-04-21T00:00:00.000Z' }],
        ownerId: 'coach-1',
        isClaimed: true,
        source: 'user_generated',
        createdAt: '2026-04-21T00:00:00.000Z',
        createdBy: 'seed-user',
      } as never);
    vi.spyOn(service as never, 'invalidateCache').mockResolvedValue(undefined);

    await service.addAdmin({
      organizationId: 'org-1',
      userId: 'coach-1',
      role: 'coach',
      addedBy: 'coach-1',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserIds: expect.anything(),
        ownerId: 'coach-1',
        isClaimed: true,
      })
    );
    expect(update.mock.calls[0]?.[0]?.admins).toEqual([
      expect.objectContaining({ userId: 'coach-1', role: 'coach' }),
    ]);
  });

  it('keeps coach admin assignment idempotent on onboarding retry', async () => {
    const { db, update } = createDb();
    const service = new OrganizationService(db as never);

    vi.spyOn(service, 'getOrganizationById')
      .mockResolvedValueOnce({
        id: 'org-1',
        name: 'Alcoa',
        type: 'organization',
        status: 'active',
        admins: [{ userId: 'coach-1', role: 'coach', addedAt: '2026-04-21T00:00:00.000Z' }],
        ownerId: 'coach-1',
        isClaimed: true,
        source: 'user_generated',
        createdAt: '2026-04-21T00:00:00.000Z',
        createdBy: 'seed-user',
      } as never)
      .mockResolvedValueOnce({
        id: 'org-1',
        name: 'Alcoa',
        type: 'organization',
        status: 'active',
        admins: [{ userId: 'coach-1', role: 'coach', addedAt: '2026-04-21T00:00:00.000Z' }],
        ownerId: 'coach-1',
        isClaimed: true,
        source: 'user_generated',
        createdAt: '2026-04-21T00:00:00.000Z',
        createdBy: 'seed-user',
      } as never);
    vi.spyOn(service as never, 'invalidateCache').mockResolvedValue(undefined);

    await service.addAdmin({
      organizationId: 'org-1',
      userId: 'coach-1',
      role: 'coach',
      addedBy: 'coach-1',
    });

    expect(update.mock.calls[0]?.[0]?.admins).toHaveLength(1);
    expect(update.mock.calls[0]?.[0]?.admins).toEqual([
      expect.objectContaining({ userId: 'coach-1', role: 'coach' }),
    ]);
  });

  it('removes coach admins when a director takes over and transfers org ownership', async () => {
    const { db, update } = createDb();
    const service = new OrganizationService(db as never);

    vi.spyOn(service, 'getOrganizationById')
      .mockResolvedValueOnce({
        id: 'org-1',
        name: 'Alcoa',
        type: 'organization',
        status: 'active',
        admins: [
          { userId: 'coach-1', role: 'coach', addedAt: '2026-04-20T00:00:00.000Z' },
          { userId: 'coach-2', role: 'coach', addedAt: '2026-04-20T00:00:00.000Z' },
        ],
        ownerId: 'coach-1',
        isClaimed: true,
        source: 'user_generated',
        createdAt: '2026-04-21T00:00:00.000Z',
        createdBy: 'seed-user',
      } as never)
      .mockResolvedValueOnce({
        id: 'org-1',
        name: 'Alcoa',
        type: 'organization',
        status: 'active',
        admins: [{ userId: 'director-1', role: 'director', addedAt: '2026-04-21T00:00:00.000Z' }],
        ownerId: 'director-1',
        isClaimed: true,
        source: 'user_generated',
        createdAt: '2026-04-21T00:00:00.000Z',
        createdBy: 'seed-user',
      } as never);
    vi.spyOn(service as never, 'invalidateCache').mockResolvedValue(undefined);

    await service.addAdmin({
      organizationId: 'org-1',
      userId: 'director-1',
      role: 'director',
      addedBy: 'director-1',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserIds: expect.anything(),
        ownerId: 'director-1',
        isClaimed: true,
      })
    );
    expect(update.mock.calls[0]?.[0]?.admins).toEqual([
      expect.objectContaining({ userId: 'director-1', role: 'director' }),
    ]);
  });

  it('does not add coach admins once a director already governs the organization', async () => {
    const { db, update } = createDb();
    const service = new OrganizationService(db as never);

    vi.spyOn(service, 'getOrganizationById')
      .mockResolvedValueOnce({
        id: 'org-1',
        name: 'Alcoa',
        type: 'organization',
        status: 'active',
        admins: [{ userId: 'director-1', role: 'director', addedAt: '2026-04-20T00:00:00.000Z' }],
        ownerId: 'director-1',
        isClaimed: true,
        source: 'user_generated',
        createdAt: '2026-04-21T00:00:00.000Z',
        createdBy: 'seed-user',
      } as never)
      .mockResolvedValueOnce({
        id: 'org-1',
        name: 'Alcoa',
        type: 'organization',
        status: 'active',
        admins: [{ userId: 'director-1', role: 'director', addedAt: '2026-04-20T00:00:00.000Z' }],
        ownerId: 'director-1',
        isClaimed: true,
        source: 'user_generated',
        createdAt: '2026-04-21T00:00:00.000Z',
        createdBy: 'seed-user',
      } as never);
    vi.spyOn(service as never, 'invalidateCache').mockResolvedValue(undefined);

    await service.addAdmin({
      organizationId: 'org-1',
      userId: 'coach-1',
      role: 'coach',
      addedBy: 'coach-1',
    });

    expect(update.mock.calls[0]?.[0]?.admins).toEqual([
      expect.objectContaining({ userId: 'director-1', role: 'director' }),
    ]);
    expect(update.mock.calls[0]?.[0]?.adminUserIds).toBeDefined();
  });

  it('normalizes serialized Firestore admin timestamps before writing admins back', async () => {
    const { db, update } = createDb();
    const service = new OrganizationService(db as never);

    vi.spyOn(service, 'getOrganizationById')
      .mockResolvedValueOnce({
        id: 'org-1',
        name: 'Alcoa',
        type: 'organization',
        status: 'active',
        admins: [
          {
            userId: 'coach-1',
            role: 'coach',
            addedAt: { _seconds: 1776810154, _nanoseconds: 622000000 },
          },
        ],
        ownerId: 'coach-1',
        isClaimed: true,
        source: 'user_generated',
        createdAt: '2026-04-21T00:00:00.000Z',
        createdBy: 'seed-user',
      } as never)
      .mockResolvedValueOnce({
        id: 'org-1',
        name: 'Alcoa',
        type: 'organization',
        status: 'active',
        admins: [
          {
            userId: 'director-1',
            role: 'director',
            addedAt: '2026-04-21T00:00:00.000Z',
          },
        ],
        ownerId: 'director-1',
        isClaimed: true,
        source: 'user_generated',
        createdAt: '2026-04-21T00:00:00.000Z',
        createdBy: 'seed-user',
      } as never);
    vi.spyOn(service as never, 'invalidateCache').mockResolvedValue(undefined);

    await service.addAdmin({
      organizationId: 'org-1',
      userId: 'director-1',
      role: 'director',
      addedBy: 'director-1',
    });

    const writtenAdmins = update.mock.calls[0]?.[0]?.admins as Array<Record<string, unknown>>;
    expect(writtenAdmins).toHaveLength(1);
    expect(writtenAdmins[0]?.['userId']).toBe('director-1');
    expect(writtenAdmins[0]?.['addedAt']).toBeInstanceOf(Date);
  });
});
