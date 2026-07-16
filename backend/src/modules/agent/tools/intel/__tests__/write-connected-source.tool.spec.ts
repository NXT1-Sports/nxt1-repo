import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { WriteConnectedSourceTool } from '../organization/write-connected-source.tool.js';

type MockDocSnapshot = {
  exists: boolean;
  data: () => Record<string, unknown>;
};

type MockDocRef = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

function createDocRef(snapshot: MockDocSnapshot): MockDocRef {
  return {
    get: vi.fn().mockResolvedValue(snapshot),
    set: vi.fn().mockResolvedValue(undefined),
  };
}

describe('WriteConnectedSourceTool', () => {
  let userDoc: MockDocRef;
  let teamDoc: MockDocRef;
  let db: {
    collection: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    userDoc = createDocRef({
      exists: true,
      data: () => ({
        role: 'director',
        displayName: 'John Keller',
        teamCode: { teamId: 'team-123' },
        sports: [{ sport: 'football', team: { teamId: 'team-123' } }],
        activeSportIndex: 0,
      }),
    });
    teamDoc = createDocRef({
      exists: true,
      data: () => ({
        connectedSources: [],
      }),
    });

    db = {
      collection: vi.fn((name: string) => ({
        doc: vi.fn((id: string) => {
          if (name === 'Users' && id === 'user-123') return userDoc;
          if (name === 'Teams' && id === 'team-123') return teamDoc;
          return createDocRef({ exists: false, data: () => ({}) });
        }),
      })),
    };
  });

  it('uses authenticated context userId when the tool input omits userId', async () => {
    const tool = new WriteConnectedSourceTool(db as never);

    const result = await tool.execute(
      {
        url: 'https://x.com/CPdogsfootball',
        platform: 'twitter',
      },
      { userId: 'user-123' }
    );

    expect(result.success).toBe(true);
    expect(userDoc.get).toHaveBeenCalledTimes(1);
    expect(teamDoc.set).toHaveBeenCalledTimes(1);
    expect(result.data).toMatchObject({
      target: 'team',
      userId: 'user-123',
      teamId: 'team-123',
      platform: 'x',
    });
  });

  it('resolves teamId from teamCode when a director lacks a flat user.teamId', async () => {
    const tool = new WriteConnectedSourceTool(db as never);

    const result = await tool.execute(
      {
        userId: 'user-123',
        url: 'https://x.com/CPdogsfootball',
        platform: 'twitter',
      },
      { userId: 'user-123' }
    );

    expect(result.success).toBe(true);
    expect(teamDoc.get).toHaveBeenCalledTimes(1);
    expect(teamDoc.set).toHaveBeenCalledWith(
      expect.objectContaining({
        connectedSources: expect.arrayContaining([
          expect.objectContaining({
            platform: 'x',
            profileUrl: 'https://x.com/CPdogsfootball',
            scopeId: 'football',
            syncStatus: 'idle',
            addedBy: 'John Keller',
            addedById: 'user-123',
          }),
        ]),
      }),
      { merge: true }
    );
  });

  it('preserves terminal sync status during tracked team writes', async () => {
    teamDoc = createDocRef({
      exists: true,
      data: () => ({
        connectedSources: [
          {
            platform: 'hudl',
            profileUrl:
              'https://fan.hudl.com/usa/in/crown-point/organization/18116/crown-point-high-school/team/449401/boys-varsity-basketball',
            scopeId: 'football',
            scopeType: 'sport',
            syncStatus: 'success',
            connected: true,
          },
        ],
      }),
    });

    db = {
      collection: vi.fn((name: string) => ({
        doc: vi.fn((id: string) => {
          if (name === 'Users' && id === 'user-123') return userDoc;
          if (name === 'Teams' && id === 'team-123') return teamDoc;
          return createDocRef({ exists: false, data: () => ({}) });
        }),
      })),
    };

    const tool = new WriteConnectedSourceTool(db as never);

    const result = await tool.execute(
      {
        userId: 'user-123',
        url: 'https://fan.hudl.com/usa/in/crown-point/organization/18116/crown-point-high-school/team/449401/boys-varsity-basketball',
        platform: 'hudl',
      },
      { userId: 'user-123', operationId: 'op-123' }
    );

    expect(result.success).toBe(true);
    expect(teamDoc.set).toHaveBeenCalledWith(
      expect.objectContaining({
        connectedSources: expect.arrayContaining([
          expect.objectContaining({
            platform: 'hudl',
            scopeId: 'football',
            syncStatus: 'success',
            connected: true,
            addedBy: 'John Keller',
            addedById: 'user-123',
          }),
        ]),
      }),
      { merge: true }
    );
  });

  it('preserves existing lifecycle state during non-tracked team rewrites', async () => {
    teamDoc = createDocRef({
      exists: true,
      data: () => ({
        connectedSources: [
          {
            platform: 'x',
            profileUrl: 'https://x.com/CPdogsfootball',
            scopeId: 'football',
            scopeType: 'sport',
            syncStatus: 'pending',
            connected: false,
          },
        ],
      }),
    });

    db = {
      collection: vi.fn((name: string) => ({
        doc: vi.fn((id: string) => {
          if (name === 'Users' && id === 'user-123') return userDoc;
          if (name === 'Teams' && id === 'team-123') return teamDoc;
          return createDocRef({ exists: false, data: () => ({}) });
        }),
      })),
    };

    const tool = new WriteConnectedSourceTool(db as never);

    const result = await tool.execute(
      {
        userId: 'user-123',
        url: 'https://x.com/CPdogsfootball',
        platform: 'twitter',
      },
      { userId: 'user-123' }
    );

    expect(result.success).toBe(true);
    expect(teamDoc.set).toHaveBeenCalledWith(
      expect.objectContaining({
        connectedSources: expect.arrayContaining([
          expect.objectContaining({
            platform: 'x',
            scopeId: 'football',
            syncStatus: 'pending',
            connected: false,
          }),
        ]),
      }),
      { merge: true }
    );
  });

  it('rejects execution when authenticated tool context is missing', async () => {
    const tool = new WriteConnectedSourceTool(db as never);

    const result = await tool.execute({
      url: 'https://x.com/CPdogsfootball',
      platform: 'twitter',
    });

    expect(result).toEqual({
      success: false,
      error: 'Authenticated tool context is required.',
    });
  });
});
