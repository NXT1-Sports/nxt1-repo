import { describe, expect, it, vi } from 'vitest';

const { productionDbMock, stagingDbMock } = vi.hoisted(() => ({
  productionDbMock: {},
  stagingDbMock: {},
}));

vi.mock('../../../../../../utils/firebase.js', () => ({ db: productionDbMock }));
vi.mock('../../../../../../utils/firebase-staging.js', () => ({ stagingDb: stagingDbMock }));

import {
  FIREBASE_MCP_SHARED_PROFILE_COUPLED_VIEWS,
  EnvironmentAwareFirebaseMcpBridgeService,
  FirebaseMcpBridgeService,
  type FirebaseMcpBridge,
  buildFirebaseMcpListViewsCacheKey,
  buildFirebaseMcpQueryViewCacheKey,
} from '../firebase-mcp-bridge.service.js';

type FakeDocData = Record<string, unknown>;

function createDocSnapshot(id: string, data: FakeDocData | undefined) {
  return {
    id,
    exists: data !== undefined,
    data: () => data,
  };
}

function createQuery(collectionName: string, store: Record<string, Record<string, FakeDocData>>) {
  const filters: Array<{ field: string; operator: string; value: unknown }> = [];

  return {
    where(field: string, operator: string, value: unknown) {
      filters.push({ field, operator, value });
      return this;
    },
    async get() {
      const docs = Object.entries(store[collectionName] ?? {})
        .filter(([, data]) =>
          filters.every((filter) => {
            const current = data[filter.field];
            if (filter.operator === '==') return current === filter.value;
            if (filter.operator === 'in' && Array.isArray(filter.value)) {
              return filter.value.includes(current as never);
            }
            if (filter.operator === 'array-contains' && Array.isArray(current)) {
              return current.includes(filter.value);
            }
            return false;
          })
        )
        .map(([id, data]) => createDocSnapshot(id, data));

      return { docs };
    },
  };
}

function createFirestoreStub(store: Record<string, Record<string, FakeDocData>>) {
  return {
    collection(collectionName: string) {
      return {
        doc(id: string) {
          return {
            async get() {
              return createDocSnapshot(id, store[collectionName]?.[id]);
            },
          };
        },
        where(field: string, operator: string, value: unknown) {
          return createQuery(collectionName, store).where(field, operator, value);
        },
        async get() {
          const docs = Object.entries(store[collectionName] ?? {}).map(([id, data]) =>
            createDocSnapshot(id, data)
          );
          return { docs };
        },
      };
    },
  };
}

describe('FirebaseMcpBridgeService resolveAccessScope', () => {
  it('builds user-prefixed cache keys for Firebase MCP view caches', () => {
    const queryKey = buildFirebaseMcpQueryViewCacheKey('user_123', 'user_profile_snapshot', {
      view: 'user_profile_snapshot',
      teamIds: 'team_1',
      organizationIds: 'org_1',
    });
    const listKey = buildFirebaseMcpListViewsCacheKey('user_123', {
      teamIds: 'team_1',
      organizationIds: 'org_1',
    });

    expect(
      queryKey.startsWith('agent:mcp:firebase:query-view:user:user_123:view:user_profile_snapshot:')
    ).toBe(true);
    expect(listKey.startsWith('agent:mcp:firebase:list-views:user:user_123:')).toBe(true);
  });

  it('uses view-wide prefixes for shared profile-coupled views', () => {
    const sharedView = FIREBASE_MCP_SHARED_PROFILE_COUPLED_VIEWS[0];
    const queryKey = buildFirebaseMcpQueryViewCacheKey('viewer_1', sharedView, {
      teamIds: 'team_1',
      organizationIds: 'org_1',
    });

    expect(
      queryKey.startsWith(`agent:mcp:firebase:query-view:view:${sharedView}:user:viewer_1:`)
    ).toBe(true);
  });

  it('includes team-admin managed teams in query scope without roster membership', async () => {
    const service = new FirebaseMcpBridgeService();
    Object.defineProperty(service, 'firestore', {
      value: createFirestoreStub({
        RosterEntries: {},
        Teams: {
          team_1: {
            ownerId: 'owner_1',
            adminIds: ['coach_1'],
            organizationId: 'org_1',
          },
        },
        Organizations: {
          org_1: { ownerId: 'org_owner_1', admins: [] },
        },
      }),
    });

    const scope = await (
      service as unknown as {
        resolveAccessScope: (context: { userId: string }) => Promise<{
          teamIds: string[];
          organizationIds: string[];
          defaultTeamId: string | null;
          defaultOrganizationId: string | null;
        }>;
      }
    ).resolveAccessScope({ userId: 'coach_1' });

    expect(scope.teamIds).toEqual(['team_1']);
    expect(scope.organizationIds).toEqual(['org_1']);
    expect(scope.defaultTeamId).toBe('team_1');
    expect(scope.defaultOrganizationId).toBe('org_1');
  });

  it('includes organization-admin teams in query scope without direct roster membership', async () => {
    const service = new FirebaseMcpBridgeService();
    Object.defineProperty(service, 'firestore', {
      value: createFirestoreStub({
        RosterEntries: {},
        Teams: {
          team_1: {
            ownerId: 'owner_1',
            adminIds: [],
            organizationId: 'org_1',
          },
          team_2: {
            ownerId: 'owner_2',
            adminIds: [],
            organizationId: 'org_1',
          },
        },
        Organizations: {
          org_1: {
            ownerId: 'org_owner_1',
            admins: [{ userId: 'director_1', role: 'director' }],
          },
        },
      }),
    });

    const scope = await (
      service as unknown as {
        resolveAccessScope: (context: { userId: string }) => Promise<{
          teamIds: string[];
          organizationIds: string[];
          defaultTeamId: string | null;
          defaultOrganizationId: string | null;
        }>;
      }
    ).resolveAccessScope({ userId: 'director_1' });

    expect(scope.teamIds).toEqual(['team_1', 'team_2']);
    expect(scope.organizationIds).toEqual(['org_1']);
    expect(scope.defaultOrganizationId).toBe('org_1');
  });

  it('routes staging contexts to the staging bridge', async () => {
    const productionBridge: FirebaseMcpBridge = {
      listViews: vi.fn().mockResolvedValue({ views: ['production'] }),
      queryView: vi
        .fn()
        .mockResolvedValue({ view: 'production_profile_snapshot', count: 0, items: [] }),
      mutate: vi.fn().mockResolvedValue({ success: true, message: 'production' }),
    };
    const stagingBridge: FirebaseMcpBridge = {
      listViews: vi.fn().mockResolvedValue({ views: ['staging'] }),
      queryView: vi
        .fn()
        .mockResolvedValue({ view: 'organization_profile_snapshot', count: 1, items: [] }),
      mutate: vi.fn().mockResolvedValue({ success: true, message: 'staging' }),
    };

    const bridge = new EnvironmentAwareFirebaseMcpBridgeService(productionBridge, stagingBridge);
    const context = { userId: 'director_1', environment: 'staging' } as const;

    await bridge.listViews(context);
    await bridge.queryView({ view: 'organization_profile_snapshot' }, context);
    await bridge.mutate(
      {
        operation: 'update',
        collection: 'Organizations',
        documentId: 'org_1',
        patch: { primaryColor: '#CC0022' },
      },
      context
    );

    expect(stagingBridge.listViews).toHaveBeenCalledWith(context);
    expect(stagingBridge.queryView).toHaveBeenCalledWith(
      { view: 'organization_profile_snapshot' },
      context
    );
    expect(stagingBridge.mutate).toHaveBeenCalledWith(
      {
        operation: 'update',
        collection: 'Organizations',
        documentId: 'org_1',
        patch: { primaryColor: '#CC0022' },
      },
      context
    );
    expect(productionBridge.listViews).not.toHaveBeenCalled();
    expect(productionBridge.queryView).not.toHaveBeenCalled();
    expect(productionBridge.mutate).not.toHaveBeenCalled();
  });
});
