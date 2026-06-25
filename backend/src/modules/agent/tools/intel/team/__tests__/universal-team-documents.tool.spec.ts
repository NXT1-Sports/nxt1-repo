import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCanManageTeamMutationForUser, mockScheduleUniversalFileSemanticSync } = vi.hoisted(
  () => ({
    mockCanManageTeamMutationForUser: vi.fn().mockResolvedValue(true),
    mockScheduleUniversalFileSemanticSync: vi.fn(),
  })
);

vi.mock('../../../../../../services/team/team-intel-permissions.js', () => ({
  canManageTeamMutationForUser: mockCanManageTeamMutationForUser,
}));

vi.mock('../../../../../../services/team/universal-file-semantic.service.js', () => ({
  scheduleUniversalFileSemanticSync: mockScheduleUniversalFileSemanticSync,
  UniversalFileSemanticService: class UniversalFileSemanticService {
    constructor() {}

    async search(): Promise<readonly unknown[]> {
      return [];
    }
  },
}));

import {
  GetUniversalTeamDocumentTool,
  UpdateUniversalTeamDocumentTool,
} from '../universal-team-documents.tool.js';

function createDb(options?: {
  readonly teamDoc?: {
    readonly exists: boolean;
    readonly data: () => unknown;
  };
  readonly universalDoc?: {
    readonly id: string;
    readonly exists: boolean;
    readonly data: () => unknown;
  };
  readonly universalSet?: ReturnType<typeof vi.fn>;
}) {
  let currentUniversalData = options?.universalDoc?.data();
  const universalSet =
    options?.universalSet ??
    vi.fn().mockImplementation(async (payload: Record<string, unknown>) => {
      currentUniversalData = payload;
    });
  const teamDoc =
    options?.teamDoc ??
    ({
      exists: true,
      data: () => ({ ownerId: 'coach-1' }),
    } as const);
  const universalDoc =
    options?.universalDoc ??
    ({
      id: 'missing-document',
      exists: false,
      data: () => undefined,
    } as const);

  const db = {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name === 'Teams') {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(teamDoc),
          }),
        };
      }

      if (name === 'UniversalFiles') {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockImplementation(async () => ({
              id: universalDoc.id,
              exists: universalDoc.exists,
              data: () => currentUniversalData,
            })),
            set: universalSet,
          }),
        };
      }

      if (name === 'RosterEntries') {
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ docs: [], empty: true, size: 0 }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected collection ${name}`);
    }),
  };

  return { db, universalSet };
}

describe('universal team document Agent X tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanManageTeamMutationForUser.mockResolvedValue(true);
  });

  it('updates document access lists while preserving owner write access', async () => {
    mockCanManageTeamMutationForUser.mockResolvedValue(false);
    const { db, universalSet } = createDb({
      universalDoc: {
        id: 'doc-1',
        exists: true,
        data: () => ({
          id: 'doc-1',
          teamId: 'team-1',
          type: 'file',
          ownerUserId: 'coach-1',
          title: 'Install Sheet',
          normalizedTitle: 'install sheet',
          status: 'ready',
          payloadKind: 'native',
          payload: {
            content: { text: 'Original notes' },
          },
          readAccessKeys: ['user:coach-1'],
          writeAccessKeys: ['user:coach-1'],
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }),
      },
    });

    const tool = new UpdateUniversalTeamDocumentTool(db as never);
    const result = await tool.execute(
      {
        documentId: 'doc-1',
        patch: {
          readAccessKeys: ['user:user-2'],
          writeAccessKeys: [],
        },
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(universalSet).toHaveBeenCalledWith(
      expect.objectContaining({
        readAccessKeys: ['user:coach-1', 'user:user-2'],
        writeAccessKeys: ['user:coach-1'],
      })
    );
    expect(result.data).toMatchObject({
      summary: {
        readAccessKeys: ['user:coach-1', 'user:user-2'],
        writeAccessKeys: ['user:coach-1'],
      },
    });
    expect(mockScheduleUniversalFileSemanticSync).toHaveBeenCalled();
  });

  it('marks pointer-backed uploaded files as inspect-only in get_universal_team_document summaries', async () => {
    const { db } = createDb({
      universalDoc: {
        id: 'upload-1',
        exists: true,
        data: () => ({
          id: 'upload-1',
          teamId: 'team-1',
          type: 'file',
          title: 'Sample.pdf',
          normalizedTitle: 'sample.pdf',
          status: 'ready',
          payloadKind: 'pointer',
          payload: {
            storagePath: 'Users/coach-1/uploads/pdf/unbound/123_Sample.pdf',
            mimeType: 'application/pdf',
            preview: {
              text: 'Uploaded playbook PDF preview',
            },
          },
          classification: {
            primary: 'strategy_document',
            route: 'uploaded_playbook',
            labels: ['uploaded-file'],
          },
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }),
      },
    });

    const tool = new GetUniversalTeamDocumentTool(db as never);
    const result = await tool.execute({ documentId: 'upload-1' }, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      summary: {
        artifactKind: 'pointer_file',
        editableViaUniversalDocumentTool: false,
      },
    });
  });

  it('updates artifact metadata in place for pointer-backed Team Files uploads', async () => {
    const { db, universalSet } = createDb({
      universalDoc: {
        id: 'upload-1',
        exists: true,
        data: () => ({
          id: 'upload-1',
          teamId: 'team-1',
          type: 'file',
          ownerUserId: 'coach-1',
          title: 'Sample.pdf',
          normalizedTitle: 'sample.pdf',
          status: 'ready',
          payloadKind: 'pointer',
          payload: {
            storagePath: 'Users/coach-1/uploads/pdf/unbound/123_Sample.pdf',
            mimeType: 'application/pdf',
            preview: {
              text: 'Uploaded playbook PDF preview',
            },
          },
          classification: {
            primary: 'strategy_document',
            route: 'uploaded_playbook',
            labels: ['uploaded-file'],
          },
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }),
      },
    });

    const tool = new UpdateUniversalTeamDocumentTool(db as never);
    const result = await tool.execute(
      {
        documentId: 'upload-1',
        patch: {
          artifactSummary: 'Condensed summary of the uploaded playbook.',
          artifactNotes: 'Inside zone rules, flood, smash, and installation coaching points.',
          artifactTags: ['playbook', 'notes'],
          artifactStatus: 'ready',
          artifactGeneratedAt: '2026-06-25T00:00:00.000Z',
        },
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(universalSet).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactSummary: 'Condensed summary of the uploaded playbook.',
        artifactNotes: 'Inside zone rules, flood, smash, and installation coaching points.',
        artifactTags: ['playbook', 'notes'],
        artifactStatus: 'ready',
        artifactGeneratedAt: '2026-06-25T00:00:00.000Z',
        payloadKind: 'pointer',
      })
    );
    expect(result.data).toMatchObject({
      summary: {
        artifactKind: 'pointer_file',
        artifactSummary: 'Condensed summary of the uploaded playbook.',
        artifactTags: ['playbook', 'notes'],
        artifactStatus: 'ready',
      },
    });
  });

  it('returns a clear authorization error when the user cannot mutate the team document', async () => {
    mockCanManageTeamMutationForUser.mockResolvedValue(false);
    const { db, universalSet } = createDb({
      universalDoc: {
        id: 'doc-1',
        exists: true,
        data: () => ({
          id: 'doc-1',
          teamId: 'team-1',
          type: 'file',
          ownerUserId: 'coach-1',
          title: 'Install Sheet',
          normalizedTitle: 'install sheet',
          status: 'ready',
          payloadKind: 'native',
          payload: {
            content: { text: 'Original notes' },
          },
          readAccessKeys: ['user:coach-1'],
          writeAccessKeys: ['user:coach-1'],
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }),
      },
    });

    const tool = new UpdateUniversalTeamDocumentTool(db as never);
    const result = await tool.execute(
      {
        documentId: 'doc-1',
        patch: {
          title: 'Blocked Rename',
        },
      },
      { userId: 'viewer-1' }
    );

    expect(result).toMatchObject({
      success: false,
      error: 'Not authorized to edit this file. Read-only access cannot make changes.',
    });
    expect(universalSet).not.toHaveBeenCalled();
  });

  it('allows a directly shared writer to edit a document without team-manage access', async () => {
    mockCanManageTeamMutationForUser.mockResolvedValue(false);
    const { db, universalSet } = createDb({
      universalDoc: {
        id: 'doc-1',
        exists: true,
        data: () => ({
          id: 'doc-1',
          teamId: 'team-1',
          type: 'file',
          ownerUserId: 'owner-user',
          title: 'Install Sheet',
          normalizedTitle: 'install sheet',
          status: 'ready',
          payloadKind: 'native',
          payload: {
            content: { text: 'Original notes' },
          },
          readAccessKeys: ['user:test-user'],
          writeAccessKeys: ['user:test-user'],
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }),
      },
    });

    const tool = new UpdateUniversalTeamDocumentTool(db as never);
    const result = await tool.execute(
      {
        documentId: 'doc-1',
        patch: {
          title: 'Writer Updated Sheet',
        },
      },
      { userId: 'test-user' }
    );

    expect(result.success).toBe(true);
    expect(universalSet).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Writer Updated Sheet',
        normalizedTitle: 'writer updated sheet',
        updatedByUserId: 'test-user',
      })
    );
  });

  it('rejects document share updates from non-owners without team-manage access', async () => {
    mockCanManageTeamMutationForUser.mockResolvedValue(false);
    const { db, universalSet } = createDb({
      universalDoc: {
        id: 'doc-1',
        exists: true,
        data: () => ({
          id: 'doc-1',
          teamId: 'team-1',
          type: 'file',
          ownerUserId: 'coach-1',
          title: 'Install Sheet',
          normalizedTitle: 'install sheet',
          status: 'ready',
          payloadKind: 'native',
          payload: {
            content: { text: 'Original notes' },
          },
          readAccessKeys: ['user:coach-1'],
          writeAccessKeys: ['user:coach-1'],
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }),
      },
    });

    const tool = new UpdateUniversalTeamDocumentTool(db as never);
    const result = await tool.execute(
      {
        documentId: 'doc-1',
        patch: {
          readAccessKeys: ['user:user-2'],
        },
      },
      { userId: 'viewer-1' }
    );

    expect(result).toMatchObject({
      success: false,
      error: 'Only the file owner or a team manager can update direct file sharing.',
    });
    expect(universalSet).not.toHaveBeenCalled();
  });
});
