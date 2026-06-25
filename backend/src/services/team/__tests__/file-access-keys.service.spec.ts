import { describe, expect, it } from 'vitest';

import { buildGrantedAccessKeys, resolveFileAccessContext } from '../file-access-keys.service.js';

type SeedRecord = Record<string, unknown>;

function cloneRecord(record: SeedRecord): SeedRecord {
  return JSON.parse(JSON.stringify(record)) as SeedRecord;
}

function createMockFirestore(seed: Record<string, Record<string, SeedRecord>>) {
  const store = new Map<string, SeedRecord>();

  for (const [collectionName, docs] of Object.entries(seed)) {
    for (const [docId, record] of Object.entries(docs)) {
      store.set(`${collectionName}/${docId}`, cloneRecord(record));
    }
  }

  return {
    collection(collectionName: string) {
      return {
        where(field: string, _operator: '==', value: unknown) {
          return {
            limit(_limit: number) {
              return {
                async get() {
                  const docs = [...store.entries()]
                    .filter(([path, record]) => {
                      const [pathCollectionName] = path.split('/');
                      return pathCollectionName === collectionName && record[field] === value;
                    })
                    .map(([path, record]) => ({
                      id: path.split('/').pop() ?? '',
                      data: () => cloneRecord(record),
                    }));

                  return { docs };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('resolveFileAccessContext', () => {
  it('uses active and pending roster entries to build team and organization access', async () => {
    const db = createMockFirestore({
      RosterEntries: {
        activeEntry: {
          userId: 'user-1',
          teamId: 'team-1',
          organizationId: 'org-1',
          status: 'active',
        },
        pendingEntry: {
          userId: 'user-1',
          teamId: 'team-2',
          organizationId: 'org-2',
          status: 'pending',
        },
        inactiveEntry: {
          userId: 'user-1',
          teamId: 'team-3',
          organizationId: 'org-3',
          status: 'removed',
        },
        otherUserEntry: {
          userId: 'user-2',
          teamId: 'team-4',
          organizationId: 'org-4',
          status: 'active',
        },
      },
      Roster: {
        legacyEntry: {
          userId: 'user-1',
          teamId: 'legacy-team',
          organizationId: 'legacy-org',
          status: 'active',
        },
      },
    });

    const context = await resolveFileAccessContext(db as never, 'user-1');

    expect(context).toEqual({
      userId: 'user-1',
      teamIds: ['team-1', 'team-2'],
      organizationIds: ['org-1', 'org-2'],
    });
    expect(buildGrantedAccessKeys(context)).toEqual([
      'user:user-1',
      'team:team-1',
      'team:team-2',
      'org:org-1',
      'org:org-2',
    ]);
  });
});
