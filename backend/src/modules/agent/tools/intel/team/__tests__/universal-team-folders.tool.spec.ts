import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCacheDel, mockCanManageTeamMutationForUser, mockCanReadTeamIntelForUser } = vi.hoisted(
  () => ({
    mockCacheDel: vi.fn().mockResolvedValue(undefined),
    mockCanManageTeamMutationForUser: vi.fn().mockResolvedValue(true),
    mockCanReadTeamIntelForUser: vi.fn().mockResolvedValue(true),
  })
);

vi.mock('../../../../../../services/core/cache.service.js', () => ({
  getCacheService: () => ({
    del: mockCacheDel,
  }),
}));

vi.mock('../../../../../../services/team/team-intel-permissions.js', () => ({
  canManageTeamMutationForUser: mockCanManageTeamMutationForUser,
  canReadTeamIntelForUser: mockCanReadTeamIntelForUser,
}));

import {
  CreateTeamFileFolderTool,
  DeleteTeamFileFolderTool,
  ListTeamFileFoldersTool,
  MoveUniversalFileToFolderTool,
  UpdateTeamFileFolderTool,
} from '../universal-team-folders.tool.js';

type MockDoc = {
  readonly id: string;
  readonly data: () => unknown;
  readonly ref: {
    readonly set: ReturnType<typeof vi.fn>;
    readonly update: ReturnType<typeof vi.fn>;
    readonly delete: ReturnType<typeof vi.fn>;
  };
};

function makeDoc(id: string, data: Record<string, unknown>): MockDoc {
  return {
    id,
    data: () => data,
    ref: {
      set: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function createQuery(
  docs: readonly MockDoc[],
  filters: readonly { field: string; value: unknown }[] = []
): {
  readonly where: ReturnType<typeof vi.fn>;
  readonly limit: ReturnType<typeof vi.fn>;
  readonly get: ReturnType<typeof vi.fn>;
} {
  const applyFilters = () =>
    docs.filter((doc) =>
      filters.every(({ field, value }) => {
        const record = (doc.data() ?? {}) as Record<string, unknown>;
        const current = record[field];
        return (current ?? null) === (value ?? null);
      })
    );

  return {
    where: vi
      .fn()
      .mockImplementation((field: string, _op: string, value: unknown) =>
        createQuery(docs, [...filters, { field, value }])
      ),
    limit: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue({
        docs: applyFilters(),
        empty: applyFilters().length === 0,
        size: applyFilters().length,
      }),
    }),
    get: vi.fn().mockResolvedValue({
      docs: applyFilters(),
      empty: applyFilters().length === 0,
      size: applyFilters().length,
    }),
  };
}

function createDb(options: {
  readonly teamDoc?: { readonly exists: boolean; readonly data: () => unknown };
  readonly folderDoc?: {
    readonly id: string;
    readonly exists: boolean;
    readonly data: () => unknown;
  };
  readonly universalDoc?: {
    readonly id: string;
    readonly exists: boolean;
    readonly data: () => unknown;
  };
  readonly folderSet?: ReturnType<typeof vi.fn>;
  readonly folderDelete?: ReturnType<typeof vi.fn>;
  readonly universalSet?: ReturnType<typeof vi.fn>;
  readonly folderDocs?: readonly MockDoc[];
  readonly universalFolderDocs?: readonly MockDoc[];
}) {
  const folderSet = options.folderSet ?? vi.fn().mockResolvedValue(undefined);
  const folderDelete = options.folderDelete ?? vi.fn().mockResolvedValue(undefined);
  const universalSet = options.universalSet ?? vi.fn().mockResolvedValue(undefined);
  const teamDoc = options.teamDoc ?? { exists: true, data: () => ({ ownerId: 'coach-1' }) };
  const folderDoc = options.folderDoc ?? {
    id: 'missing-folder',
    exists: false,
    data: () => undefined,
  };
  const universalDoc = options.universalDoc ?? {
    id: 'missing-document',
    exists: false,
    data: () => undefined,
  };
  const folderDocs = options.folderDocs ?? [];
  const universalFolderDocs = options.universalFolderDocs ?? [];

  const db = {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name === 'Teams') {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(teamDoc),
          }),
        };
      }

      if (name === 'TeamFileFolders') {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(folderDoc),
            set: folderSet,
            delete: folderDelete,
          }),
          where: vi
            .fn()
            .mockImplementation((field: string, _op: string, value: unknown) =>
              createQuery(folderDocs, [{ field, value }])
            ),
        };
      }

      if (name === 'UniversalFiles') {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(universalDoc),
            set: universalSet,
          }),
          where: vi
            .fn()
            .mockImplementation((field: string, _op: string, value: unknown) =>
              createQuery(universalFolderDocs, [{ field, value }])
            ),
        };
      }

      throw new Error(`Unexpected collection ${name}`);
    }),
  };

  return { db, folderSet, folderDelete, universalSet };
}

describe('universal team folder Agent X tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanManageTeamMutationForUser.mockResolvedValue(true);
    mockCanReadTeamIntelForUser.mockResolvedValue(true);
    mockCacheDel.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists team file folders for authorized readers', async () => {
    const { db } = createDb({
      folderDocs: [
        makeDoc('folder-2', {
          teamId: 'team-1',
          name: 'Zeta',
          normalizedName: 'zeta',
          sortOrder: 2,
          createdByUserId: 'coach-1',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }),
        makeDoc('folder-1', {
          teamId: 'team-1',
          name: 'Alpha',
          normalizedName: 'alpha',
          sortOrder: 0,
          createdByUserId: 'coach-1',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }),
      ],
    });

    const tool = new ListTeamFileFoldersTool(db as never);
    const result = await tool.execute({ teamId: 'team-1' }, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    expect(mockCanReadTeamIntelForUser).toHaveBeenCalledWith(db, 'coach-1', 'team-1', {
      ownerId: 'coach-1',
    });
    expect(result.data).toMatchObject({
      count: 2,
      folders: [
        expect.objectContaining({ id: 'folder-1', name: 'Alpha' }),
        expect.objectContaining({ id: 'folder-2', name: 'Zeta' }),
      ],
    });
  });

  it('creates a team file folder and invalidates folder caches', async () => {
    const { db, folderSet } = createDb({ folderDocs: [] });

    const tool = new CreateTeamFileFolderTool(db as never);
    const result = await tool.execute(
      {
        folderId: 'folder-install',
        teamId: 'team-1',
        name: 'Install Plans',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(folderSet).toHaveBeenCalledTimes(1);
    expect(folderSet.mock.calls[0]?.[0]).toMatchObject({
      id: 'folder-install',
      teamId: 'team-1',
      name: 'Install Plans',
      sortOrder: 0,
    });
    expect(mockCacheDel).toHaveBeenCalledWith('team:file_folders:team-1');
  });

  it('accepts numeric-string sortOrder when creating a team file folder', async () => {
    const { db, folderSet } = createDb({ folderDocs: [] });

    const tool = new CreateTeamFileFolderTool(db as never);
    const result = await tool.execute(
      {
        folderId: 'folder-sorted',
        teamId: 'team-1',
        name: 'Sorted Folder',
        sortOrder: '7',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(folderSet).toHaveBeenCalledTimes(1);
    expect(folderSet.mock.calls[0]?.[0]).toMatchObject({
      id: 'folder-sorted',
      teamId: 'team-1',
      name: 'Sorted Folder',
      sortOrder: 7,
    });
  });

  it('rejects reparenting a folder into its own descendant tree', async () => {
    const { db } = createDb({
      folderDoc: {
        id: 'folder-root',
        exists: true,
        data: () => ({
          teamId: 'team-1',
          name: 'Root',
          normalizedName: 'root',
          sortOrder: 0,
          createdByUserId: 'coach-1',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }),
      },
      folderDocs: [
        makeDoc('folder-root', {
          teamId: 'team-1',
          name: 'Root',
          normalizedName: 'root',
          sortOrder: 0,
          createdByUserId: 'coach-1',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }),
        makeDoc('folder-child', {
          teamId: 'team-1',
          name: 'Child',
          normalizedName: 'child',
          parentId: 'folder-root',
          sortOrder: 1,
          createdByUserId: 'coach-1',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }),
      ],
    });

    const tool = new UpdateTeamFileFolderTool(db as never);
    const result = await tool.execute(
      {
        folderId: 'folder-root',
        parentId: 'folder-child',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('inside its own tree');
  });

  it('deletes a folder, reparents children, and clears file assignments', async () => {
    const childFolder = makeDoc('folder-child', {
      teamId: 'team-1',
      name: 'Child',
      normalizedName: 'child',
      parentId: 'folder-parent',
      sortOrder: 1,
      createdByUserId: 'coach-1',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });
    const universalFile = makeDoc('doc-1', {
      teamId: 'team-1',
      folderId: 'folder-parent',
      title: 'Callsheet',
    });
    const { db, folderDelete } = createDb({
      folderDoc: {
        id: 'folder-parent',
        exists: true,
        data: () => ({
          teamId: 'team-1',
          name: 'Parent',
          normalizedName: 'parent',
          parentId: 'folder-grandparent',
          sortOrder: 0,
          createdByUserId: 'coach-1',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }),
      },
      folderDocs: [childFolder],
      universalFolderDocs: [universalFile],
    });

    const tool = new DeleteTeamFileFolderTool(db as never);
    const result = await tool.execute({ folderId: 'folder-parent' }, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    expect(folderDelete).toHaveBeenCalledTimes(1);
    expect(childFolder.ref.set).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 'folder-grandparent' }),
      { merge: true }
    );
    expect(universalFile.ref.set).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: null, updatedByUserId: 'coach-1' }),
      { merge: true }
    );
    expect(result.data).toMatchObject({
      reparentedFolderCount: 1,
      unassignedDocumentCount: 1,
    });
  });

  it('moves a universal native file into a resolved folder by name', async () => {
    const { db, universalSet } = createDb({
      universalDoc: {
        id: 'doc-1',
        exists: true,
        data: () => ({
          teamId: 'team-1',
          type: 'file',
          title: 'Game Plan PDF',
          normalizedTitle: 'game plan pdf',
          status: 'ready',
          payloadKind: 'native',
          payload: {
            kind: 'pdf',
            url: 'https://cdn.example.com/game-plan.pdf',
          },
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }),
      },
      folderDocs: [
        makeDoc('folder-pdfs', {
          teamId: 'team-1',
          name: 'PDFs',
          normalizedName: 'pdfs',
          sortOrder: 0,
          createdByUserId: 'coach-1',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }),
      ],
    });

    const tool = new MoveUniversalFileToFolderTool(db as never);
    const result = await tool.execute(
      {
        documentId: 'doc-1',
        folderName: 'PDFs',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(universalSet).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: 'folder-pdfs', updatedByUserId: 'coach-1' }),
      { merge: true }
    );
    expect(result.data).toMatchObject({
      documentId: 'doc-1',
      folderId: 'folder-pdfs',
      folderName: 'PDFs',
      fileType: 'file',
    });
  });
});
