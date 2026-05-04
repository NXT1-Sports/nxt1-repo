import { describe, expect, it } from 'vitest';
import type { FirebaseMcpScope } from '../shared.js';
import { executeFirebaseViewQuery } from '../views.js';

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
  let limitValue: number | undefined;

  return {
    where(field: string, operator: string, value: unknown) {
      filters.push({ field, operator, value });
      return this;
    },
    limit(value: number) {
      limitValue = value;
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
            return true;
          })
        )
        .slice(0, limitValue)
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
      };
    },
  };
}

describe('Firebase MCP roster views', () => {
  it('returns canonical absolute athlete profile URLs for team roster members', async () => {
    const firestore = createFirestoreStub({
      RosterEntries: {
        roster_1: {
          userId: 'user_1',
          teamId: 'team_1',
          organizationId: 'org_1',
          displayName: 'Ngoc Son',
          role: 'athlete',
          sport: 'Basketball Mens',
          status: 'active',
          updatedAt: '2026-05-04T12:00:00.000Z',
        },
      },
      Users: {
        user_1: {
          firstName: 'Ngoc',
          lastName: 'Son',
          displayName: 'Ngoc Son',
          unicode: 'GMlswjvTHKRqo0fk7240IiguBuR2',
          primarySport: 'Basketball Mens',
        },
      },
      Teams: {
        team_1: {
          teamName: 'Crown Point Basketball Mens',
          slug: 'crown-point-basketball-mens',
        },
      },
      Organizations: {
        org_1: {
          name: 'Crown Point',
        },
      },
    }) as never;

    const scope: FirebaseMcpScope = {
      userId: 'director_1',
      teamIds: ['team_1'],
      organizationIds: ['org_1'],
      defaultTeamId: 'team_1',
      defaultOrganizationId: 'org_1',
      appBaseUrl: 'http://localhost:4200',
    };

    const result = await executeFirebaseViewQuery(firestore, scope, {
      view: 'team_roster_members',
      filters: { teamId: 'team_1' },
      limit: 10,
    });

    expect(result.count).toBe(1);
    expect(result.items[0]?.['profilePath']).toBe(
      '/profile/mens-basketball/ngoc-son/GMlswjvTHKRqo0fk7240IiguBuR2'
    );
    expect(result.items[0]?.['profileUrl']).toBe(
      'http://localhost:4200/profile/mens-basketball/ngoc-son/GMlswjvTHKRqo0fk7240IiguBuR2'
    );

    const profile = result.items[0]?.['profile'] as Record<string, unknown>;
    expect(profile['profileUrl']).toBe(
      'http://localhost:4200/profile/mens-basketball/ngoc-son/GMlswjvTHKRqo0fk7240IiguBuR2'
    );
  });
});
