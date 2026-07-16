import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserTeams, getTeamCodeById } = vi.hoisted(() => ({
  getUserTeams: vi.fn().mockResolvedValue([{ teamId: 'team_1' }, { teamId: 'team_2' }]),
  getTeamCodeById: vi.fn().mockImplementation(async (_db, teamId: string) => ({
    team:
      teamId === 'team_1'
        ? { teamCode: 'ABC123', slug: 'alpha-wolves' }
        : { teamCode: 'XYZ789', slug: 'beta-bears' },
  })),
}));

const cache = {
  del: vi.fn().mockResolvedValue(undefined),
  delByPrefix: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../../services/core/cache.service.js', () => ({
  CACHE_TTL: {},
  getCacheService: () => cache,
}));

vi.mock('../../../services/profile/users.service.js', () => ({
  buildUsersBatchCachePrefix: () => 'users:test:batch:',
  CACHE_KEYS: {
    USER_BY_ID: (userId: string) => `users:test:${userId}`,
  },
}));

vi.mock('../../../services/team/roster-entry.service.js', () => ({
  createRosterEntryService: () => ({
    getUserTeams,
  }),
}));

vi.mock('../../../services/team/team-code.service.js', () => ({
  getTeamCodeById,
}));

vi.mock('../../../modules/agent/memory/context-builder.js', () => ({
  buildAgentContextCacheKey: (userId: string) => `agent:context:${userId}`,
}));

vi.mock(
  '../../../modules/agent/tools/integrations/firebase-mcp/firebase-mcp-bridge.service.js',
  () => ({
    FIREBASE_MCP_SHARED_PROFILE_COUPLED_VIEWS: [
      'team_roster_members',
      'organization_roster_members',
      'team_highlight_videos',
      'organization_highlight_videos',
    ],
    buildFirebaseMcpListViewsCachePrefix: (userId: string) =>
      `agent:mcp:firebase:list-views:user:${userId}`,
    buildFirebaseMcpQueryViewViewerCachePrefix: (userId: string) =>
      `agent:mcp:firebase:query-view:user:${userId}`,
    buildFirebaseMcpQueryViewWideCachePrefix: (view: string) =>
      `agent:mcp:firebase:query-view:view:${view}`,
  })
);

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {},
  getFirestore: () => ({}),
}));

import { invalidateProfileCaches } from '../shared.js';

describe('invalidateProfileCaches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.del.mockResolvedValue(undefined);
    cache.delByPrefix.mockResolvedValue(undefined);
    getUserTeams.mockResolvedValue([{ teamId: 'team_1' }, { teamId: 'team_2' }]);
  });

  it('invalidates Firebase MCP profile view caches alongside profile caches', async () => {
    await invalidateProfileCaches('user_123', 'ngoc-son');

    expect(cache.del).toHaveBeenCalledWith('user:profile:user_123');
    expect(cache.del).toHaveBeenCalledWith('users:test:user_123');
    expect(cache.del).toHaveBeenCalledWith('agent:context:user_123');
    expect(cache.del).toHaveBeenCalledWith('user:profile:unicode:ngoc-son');

    expect(cache.delByPrefix).toHaveBeenCalledWith('agent:mcp:firebase:list-views:user:user_123:');
    expect(cache.delByPrefix).toHaveBeenCalledWith('agent:mcp:firebase:query-view:user:user_123:');
    expect(cache.delByPrefix).toHaveBeenCalledWith(
      'agent:mcp:firebase:query-view:view:team_roster_members:'
    );
    expect(cache.delByPrefix).toHaveBeenCalledWith(
      'agent:mcp:firebase:query-view:view:organization_roster_members:'
    );
    expect(cache.delByPrefix).toHaveBeenCalledWith('users:test:batch:');
    expect(cache.delByPrefix).toHaveBeenCalledWith('profile:sub:awards:user_123');
    expect(cache.delByPrefix).toHaveBeenCalledWith('profile:sub:schedule:user_123');
    expect(cache.delByPrefix).toHaveBeenCalledWith('team:profile:id:team_1:');
    expect(cache.delByPrefix).toHaveBeenCalledWith('team:profile:id:team_2:');
    expect(cache.delByPrefix).toHaveBeenCalledWith('team:profile:code:ABC123:');
    expect(cache.delByPrefix).toHaveBeenCalledWith('team:profile:slug:alpha-wolves:');
  });
});
