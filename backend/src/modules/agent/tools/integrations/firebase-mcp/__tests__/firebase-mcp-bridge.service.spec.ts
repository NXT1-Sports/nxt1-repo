import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../utils/firebase.js', () => ({ db: {} }));
vi.mock('../../../../../../utils/firebase-staging.js', () => ({ stagingDb: {} }));

import { FirebaseMcpBridgeService } from '../firebase-mcp-bridge.service.js';

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
});
