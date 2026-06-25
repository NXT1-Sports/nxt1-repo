import { describe, expect, it } from 'vitest';

import { propagateInheritedFolderShareAccess } from '../folder-share-propagation.service.js';

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

  const createDocRef = (path: string) => ({
    async get() {
      const record = store.get(path);
      return {
        id: path.split('/').pop() ?? '',
        exists: record !== undefined,
        data: () => (record ? cloneRecord(record) : undefined),
      };
    },
    async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
      const current = store.get(path) ?? {};
      store.set(path, options?.merge ? { ...current, ...cloneRecord(data) } : cloneRecord(data));
    },
  });

  const createCollectionRef = (collectionName: string) => ({
    doc(docId: string) {
      return createDocRef(`${collectionName}/${docId}`);
    },
    where(field: string, _operator: '==', value: unknown) {
      return {
        async get() {
          const docs = [...store.entries()]
            .filter(([path, record]) => {
              const [pathCollectionName] = path.split('/');
              return pathCollectionName === collectionName && record[field] === value;
            })
            .map(([path, record]) => ({
              id: path.split('/').pop() ?? '',
              ref: createDocRef(path),
              data: () => cloneRecord(record),
            }));

          return { docs };
        },
      };
    },
  });

  return {
    collection(collectionName: string) {
      return createCollectionRef(collectionName);
    },
    getRecord(path: string) {
      const record = store.get(path);
      return record ? cloneRecord(record) : undefined;
    },
  };
}

describe('propagateInheritedFolderShareAccess', () => {
  it('propagates parent share deltas through inherited descendants while preserving child extras', async () => {
    const db = createMockFirestore({
      TeamFileFolders: {
        root: {
          readAccessKeys: ['user:owner'],
          writeAccessKeys: ['user:owner'],
        },
        child: {
          parentId: 'root',
          acl: { mode: 'copied_from_folder', sourceFolderId: 'root' },
          readAccessKeys: ['user:owner', 'user:coach-a'],
          writeAccessKeys: ['user:owner'],
        },
      },
      UniversalFiles: {
        nested: {
          folderId: 'child',
          acl: { mode: 'copied_from_folder', sourceFolderId: 'child' },
          readAccessKeys: ['user:owner', 'user:coach-a'],
          writeAccessKeys: ['user:owner'],
        },
      },
    });

    const result = await propagateInheritedFolderShareAccess({
      db: db as never,
      folderId: 'root',
      previousAccess: {
        readAccessKeys: ['user:owner'],
        writeAccessKeys: ['user:owner'],
      },
      nextAccess: {
        readAccessKeys: ['user:owner', 'user:shared-athlete'],
        writeAccessKeys: ['user:owner'],
      },
      updatedByUserId: 'owner',
      updatedAt: '2026-06-24T10:00:00.000Z',
    });

    expect(result).toEqual({ updatedFolderCount: 1, updatedFileCount: 1 });
    expect(db.getRecord('TeamFileFolders/child')).toMatchObject({
      readAccessKeys: ['user:owner', 'user:coach-a', 'user:shared-athlete'],
      writeAccessKeys: ['user:owner'],
      updatedByUserId: 'owner',
      updatedAt: '2026-06-24T10:00:00.000Z',
    });
    expect(db.getRecord('UniversalFiles/nested')).toMatchObject({
      readAccessKeys: ['user:owner', 'user:coach-a', 'user:shared-athlete'],
      writeAccessKeys: ['user:owner'],
      updatedByUserId: 'owner',
      updatedAt: '2026-06-24T10:00:00.000Z',
    });
  });

  it('skips descendants that no longer inherit from the shared parent', async () => {
    const db = createMockFirestore({
      TeamFileFolders: {
        root: {
          readAccessKeys: ['user:owner'],
          writeAccessKeys: ['user:owner'],
        },
        explicitChild: {
          parentId: 'root',
          acl: { mode: 'explicit' },
          readAccessKeys: ['user:owner', 'user:explicit-only'],
          writeAccessKeys: ['user:owner'],
        },
      },
      UniversalFiles: {
        explicitNested: {
          folderId: 'explicitChild',
          acl: { mode: 'copied_from_folder', sourceFolderId: 'explicitChild' },
          readAccessKeys: ['user:owner', 'user:explicit-only'],
          writeAccessKeys: ['user:owner'],
        },
      },
    });

    const result = await propagateInheritedFolderShareAccess({
      db: db as never,
      folderId: 'root',
      previousAccess: {
        readAccessKeys: ['user:owner'],
        writeAccessKeys: ['user:owner'],
      },
      nextAccess: {
        readAccessKeys: ['user:owner', 'user:new-share'],
        writeAccessKeys: ['user:owner'],
      },
      updatedByUserId: 'owner',
      updatedAt: '2026-06-24T10:00:00.000Z',
    });

    expect(result).toEqual({ updatedFolderCount: 0, updatedFileCount: 0 });
    expect(db.getRecord('TeamFileFolders/explicitChild')).toMatchObject({
      readAccessKeys: ['user:owner', 'user:explicit-only'],
      writeAccessKeys: ['user:owner'],
    });
    expect(db.getRecord('UniversalFiles/explicitNested')).toMatchObject({
      readAccessKeys: ['user:owner', 'user:explicit-only'],
      writeAccessKeys: ['user:owner'],
    });
  });
});
