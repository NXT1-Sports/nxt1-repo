/**
 * @fileoverview Edit Profile Routes Tests
 * @module @nxt1/backend/routes/__tests__/edit-profile
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { RosterEntryStatus } from '@nxt1/core/models';
import type { RosterEntry } from '@nxt1/core/models';
import { expectExpressRouter } from './route-test.utils.js';

describe('Edit Profile Routes', () => {
  let router: unknown;

  beforeAll(async () => {
    const module = await import('../../routes/profile/edit-profile.routes.js');
    router = module.default;
  }, 15_000);

  it('should register the edit profile endpoints', () => {
    expectExpressRouter(
      router,
      [
        { path: '/:uid/edit', method: 'get' },
        { path: '/:uid/section/:sectionId', method: 'put' },
        { path: '/:uid/photo', method: 'post' },
        { path: '/:uid/photo/:type', method: 'delete' },
        { path: '/:uid/active-sport-index', method: 'put' },
      ],
      5
    );
  });
});

// ─── resolvePreviousTeamIdFromRoster ──────────────────────────────────────────

function makeMockRosterService(entries: Partial<RosterEntry>[] = []) {
  return {
    getUserTeams: vi.fn().mockResolvedValue(entries),
  };
}

describe('resolvePreviousTeamIdFromRoster', () => {
  let resolvePreviousTeamIdFromRoster: (options: {
    rosterEntryService: ReturnType<typeof makeMockRosterService>;
    userId: string;
    sport?: string;
    organizationId?: string | null;
  }) => Promise<string | null>;

  beforeAll(async () => {
    const module = await import('../../routes/profile/edit-profile.routes.js');
    resolvePreviousTeamIdFromRoster = (module as unknown as Record<string, unknown>)[
      'resolvePreviousTeamIdFromRoster'
    ] as typeof resolvePreviousTeamIdFromRoster;
  }, 15_000);

  it('resolves teamId from an active roster entry matching sport and organizationId', async () => {
    const svc = makeMockRosterService([
      {
        teamId: 'team_abc',
        sport: 'Basketball',
        organizationId: 'org_1',
        status: RosterEntryStatus.ACTIVE,
      },
    ]);

    const result = await resolvePreviousTeamIdFromRoster({
      rosterEntryService: svc,
      userId: 'user_1',
      sport: 'Basketball',
      organizationId: 'org_1',
    });

    expect(result).toBe('team_abc');
    expect(svc.getUserTeams).toHaveBeenCalledWith({
      userId: 'user_1',
      status: [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING],
    });
  });

  it('resolves teamId from a pending roster entry when active entry is absent', async () => {
    const svc = makeMockRosterService([
      {
        teamId: 'team_pending',
        sport: 'Soccer',
        organizationId: 'org_2',
        status: RosterEntryStatus.PENDING,
      },
    ]);

    const result = await resolvePreviousTeamIdFromRoster({
      rosterEntryService: svc,
      userId: 'user_2',
      sport: 'Soccer',
      organizationId: 'org_2',
    });

    expect(result).toBe('team_pending');
  });

  it('matches by sport alone when organizationId is absent from the sports record', async () => {
    const svc = makeMockRosterService([
      {
        teamId: 'team_xyz',
        sport: 'Football',
        organizationId: 'org_5',
        status: RosterEntryStatus.ACTIVE,
      },
    ]);

    const result = await resolvePreviousTeamIdFromRoster({
      rosterEntryService: svc,
      userId: 'user_3',
      sport: 'Football',
      organizationId: null,
    });

    expect(result).toBe('team_xyz');
  });

  it('matches by organizationId alone when sport is absent from the sports record', async () => {
    const svc = makeMockRosterService([
      {
        teamId: 'team_org_only',
        sport: 'Basketball',
        organizationId: 'org_9',
        status: RosterEntryStatus.ACTIVE,
      },
    ]);

    const result = await resolvePreviousTeamIdFromRoster({
      rosterEntryService: svc,
      userId: 'user_4',
      sport: undefined,
      organizationId: 'org_9',
    });

    expect(result).toBe('team_org_only');
  });

  it('returns null and does NOT query Firestore when both sport and organizationId are absent', async () => {
    const svc = makeMockRosterService([
      {
        teamId: 'team_abc',
        sport: 'Basketball',
        organizationId: 'org_1',
        status: RosterEntryStatus.ACTIVE,
      },
    ]);

    const result = await resolvePreviousTeamIdFromRoster({
      rosterEntryService: svc,
      userId: 'user_5',
      sport: undefined,
      organizationId: null,
    });

    expect(result).toBeNull();
    // Must not hit Firestore — prevents false positives on multi-team athletes
    expect(svc.getUserTeams).not.toHaveBeenCalled();
  });

  it('returns null when no roster entry matches the given sport and organizationId', async () => {
    const svc = makeMockRosterService([
      {
        teamId: 'team_other',
        sport: 'Football',
        organizationId: 'org_99',
        status: RosterEntryStatus.ACTIVE,
      },
    ]);

    const result = await resolvePreviousTeamIdFromRoster({
      rosterEntryService: svc,
      userId: 'user_6',
      sport: 'Basketball',
      organizationId: 'org_1',
    });

    expect(result).toBeNull();
  });

  it('returns null when the matched entry has no teamId stored', async () => {
    const svc = makeMockRosterService([
      {
        teamId: undefined,
        sport: 'Basketball',
        organizationId: 'org_1',
        status: RosterEntryStatus.ACTIVE,
      },
    ]);

    const result = await resolvePreviousTeamIdFromRoster({
      rosterEntryService: svc,
      userId: 'user_7',
      sport: 'Basketball',
      organizationId: 'org_1',
    });

    expect(result).toBeNull();
  });

  it('is case-insensitive for sport matching', async () => {
    const svc = makeMockRosterService([
      {
        teamId: 'team_case',
        sport: 'BASKETBALL',
        organizationId: 'org_1',
        status: RosterEntryStatus.ACTIVE,
      },
    ]);

    const result = await resolvePreviousTeamIdFromRoster({
      rosterEntryService: svc,
      userId: 'user_8',
      sport: 'basketball',
      organizationId: 'org_1',
    });

    expect(result).toBe('team_case');
  });
});
