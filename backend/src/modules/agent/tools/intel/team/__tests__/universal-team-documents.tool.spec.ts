import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCanManageTeamMutationForUser,
  mockScheduleUniversalFileSemanticSync,
  mockSemanticSearch,
} = vi.hoisted(() => ({
  mockCanManageTeamMutationForUser: vi.fn().mockResolvedValue(true),
  mockScheduleUniversalFileSemanticSync: vi.fn(),
  mockSemanticSearch: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../../../../services/team/team-intel-permissions.js', () => ({
  canManageTeamMutationForUser: mockCanManageTeamMutationForUser,
}));

vi.mock('../../../../../../services/team/universal-file-semantic.service.js', () => ({
  scheduleUniversalFileSemanticSync: mockScheduleUniversalFileSemanticSync,
  UniversalFileSemanticService: class UniversalFileSemanticService {
    async search(...args: readonly unknown[]): Promise<readonly unknown[]> {
      return mockSemanticSearch(...args);
    }
  },
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      file: () => ({
        getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example.com/callsheet.png']),
      }),
    }),
  }),
}));

import {
  CreateUniversalTeamDocumentTool,
  ListUniversalTeamDocumentsTool,
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
  readonly referencedDocs?: Readonly<
    Record<string, { readonly exists: boolean; readonly data: () => unknown }>
  >;
  readonly rosterDocs?: readonly Record<string, unknown>[];
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
  const referencedDocs = options?.referencedDocs ?? {};
  const rosterDocs = options?.rosterDocs ?? [];

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

      if (name in referencedDocs) {
        const referencedDoc = referencedDocs[name]!;
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              id: 'ref-1',
              exists: referencedDoc.exists,
              data: referencedDoc.data,
            }),
          }),
        };
      }

      if (name === 'RosterEntries') {
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                docs: rosterDocs.map((data, index) => ({
                  id: `roster-${index + 1}`,
                  data: () => data,
                })),
                empty: rosterDocs.length === 0,
                size: rosterDocs.length,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected collection ${name}`);
    }),
  };

  return { db, universalSet };
}

function createListDb(documents: readonly Record<string, unknown>[]) {
  const docs = documents.map((data, index) => ({
    id: String(data['id'] ?? `doc-${index + 1}`),
    exists: true,
    data: () => data,
  }));

  const buildSnapshot = (field?: string, value?: unknown) => {
    const filteredDocs =
      field === undefined
        ? docs
        : docs.filter((doc) => {
            const record = doc.data();
            return record[field] === value;
          });

    return {
      empty: filteredDocs.length === 0,
      size: filteredDocs.length,
      docs: filteredDocs,
    };
  };

  return {
    getAll: vi.fn().mockImplementation(async (...refs: Array<{ id: string }>) =>
      refs.map((ref) => {
        const match = docs.find((doc) => doc.id === ref.id);
        return {
          id: ref.id,
          exists: !!match,
          data: () => match?.data(),
        };
      })
    ),
    collection: vi.fn().mockImplementation((name: string) => {
      if (name === 'UniversalFiles') {
        return {
          doc: vi.fn().mockImplementation((id: string) => ({ id })),
          where: vi.fn().mockImplementation((field: string, _operator: string, value: unknown) => ({
            orderBy: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  get: vi.fn().mockResolvedValue(buildSnapshot(field, value)),
                }),
              }),
            }),
          })),
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
}

describe('universal team document Agent X tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanManageTeamMutationForUser.mockResolvedValue(true);
    mockSemanticSearch.mockResolvedValue([]);
  });

  it('creates a saved Files record for an uploaded source file asset', async () => {
    const { db, universalSet } = createDb({
      universalDoc: {
        id: 'upload-doc-1',
        exists: true,
        data: () => ({}),
      },
    });
    const tool = new CreateUniversalTeamDocumentTool(db as never);

    const result = await tool.execute(
      {
        documentId: 'upload-doc-1',
        title: 'Opponent Packet.pdf',
        summary: 'Uploaded PDF source file for Agent X analysis.',
        classification: {
          primary: 'source_file',
          route: 'document_ingestion',
          labels: ['agent-chat-upload', 'pdf'],
        },
        sourceFile: {
          storagePath: 'Users/coach-1/uploads/pdf/unbound/opponent-packet.pdf',
          fileName: 'Opponent Packet.pdf',
          mimeType: 'application/pdf',
          origin: 'agent_chat_input',
          sizeBytes: 37_000_000,
        },
      },
      { userId: 'coach-1', environment: 'staging' }
    );

    expect(result.success).toBe(true);
    expect(universalSet).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'upload-doc-1',
        type: 'file',
        payloadKind: 'native',
        payload: expect.objectContaining({
          asset: expect.objectContaining({
            kind: 'pdf',
            origin: 'agent_chat_input',
            mimeType: 'application/pdf',
            sizeBytes: 37_000_000,
            storagePath: 'Users/coach-1/uploads/pdf/unbound/opponent-packet.pdf',
          }),
        }),
      })
    );
    expect(mockScheduleUniversalFileSemanticSync).toHaveBeenCalled();
  });

  it('loads native uploaded Files assets with inspection inputs', async () => {
    const { db } = createDb({
      universalDoc: {
        id: 'upload-doc-1',
        exists: true,
        data: () => ({
          id: 'upload-doc-1',
          teamId: '',
          type: 'file',
          ownerUserId: 'coach-1',
          createdByUserId: 'coach-1',
          title: 'Opponent Packet.pdf',
          normalizedTitle: 'opponent packet.pdf',
          status: 'ready',
          payloadKind: 'native',
          payload: {
            asset: {
              kind: 'pdf',
              origin: 'agent_chat_input',
              mimeType: 'application/pdf',
              sizeBytes: 37_000_000,
              url: '',
              storagePath: 'Users/coach-1/uploads/pdf/unbound/opponent-packet.pdf',
            },
          },
          readAccessKeys: ['user:coach-1'],
          writeAccessKeys: ['user:coach-1'],
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-02T00:00:00.000Z',
        }),
      },
    });
    const tool = new GetUniversalTeamDocumentTool(db as never);

    const result = await tool.execute(
      { documentId: 'upload-doc-1' },
      { userId: 'coach-1', environment: 'staging' }
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          artifactKind: 'uploaded_file',
          file: expect.objectContaining({
            mimeType: 'application/pdf',
            storagePath: 'Users/coach-1/uploads/pdf/unbound/opponent-packet.pdf',
          }),
          inspection: expect.objectContaining({
            documentRef: 'team-file:upload-doc-1',
            parseDocumentInput: expect.objectContaining({
              storagePath: 'team-file:upload-doc-1',
              fileName: 'Opponent Packet.pdf',
            }),
            renderPdfPagesInput: expect.objectContaining({
              storagePath: 'team-file:upload-doc-1',
            }),
          }),
        }),
      })
    );
  });

  it('uses semantic search first when query is provided', async () => {
    const db = createListDb([
      {
        id: 'doc-1',
        teamId: '',
        type: 'file',
        ownerUserId: 'coach-1',
        title: 'Red Zone Menu',
        normalizedTitle: 'red zone menu',
        status: 'ready',
        payloadKind: 'native',
        payload: {
          content: { text: 'Goal line package and short-yardage notes.' },
        },
        readAccessKeys: ['user:coach-1'],
        writeAccessKeys: ['user:coach-1'],
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
      },
    ]);
    mockSemanticSearch.mockResolvedValue([
      {
        fileId: 'doc-1',
        score: 0.91,
        excerpt: 'Goal line package and short-yardage notes.',
      },
    ]);

    const tool = new ListUniversalTeamDocumentsTool(db as never);
    const result = await tool.execute({ query: 'goal line package' }, { userId: 'coach-1' });

    expect(mockSemanticSearch).toHaveBeenCalledWith(
      { teamId: '', userId: 'coach-1' },
      'goal line package',
      expect.objectContaining({ topK: 25, includeArchived: false })
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      documents: [
        expect.objectContaining({
          id: 'doc-1',
          semanticScore: 0.91,
        }),
      ],
    });
  });

  it('excludes owned team-scoped semantic hits from personal-scope results', async () => {
    const db = createListDb([
      {
        id: 'doc-personal',
        type: 'file',
        ownerUserId: 'coach-1',
        title: 'Personal Upload',
        normalizedTitle: 'personal upload',
        status: 'ready',
        payloadKind: 'native',
        payload: {
          content: { text: 'Personal upload notes.' },
        },
        readAccessKeys: ['user:coach-1'],
        writeAccessKeys: ['user:coach-1'],
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
      },
      {
        id: 'doc-team',
        teamId: 'team-1',
        type: 'file',
        ownerUserId: 'coach-1',
        title: 'Team Upload',
        normalizedTitle: 'team upload',
        status: 'ready',
        payloadKind: 'native',
        payload: {
          content: { text: 'Team upload notes.' },
        },
        readAccessKeys: ['user:coach-1'],
        writeAccessKeys: ['user:coach-1'],
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-03T00:00:00.000Z',
      },
    ]);
    mockSemanticSearch.mockResolvedValue([
      {
        fileId: 'doc-team',
        score: 0.94,
        excerpt: 'Team upload notes.',
      },
      {
        fileId: 'doc-personal',
        score: 0.89,
        excerpt: 'Personal upload notes.',
      },
    ]);

    const tool = new ListUniversalTeamDocumentsTool(db as never);
    const result = await tool.execute({ query: 'upload notes' }, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      documents: [expect.objectContaining({ id: 'doc-personal' })],
    });
    expect((result.data as { documents: Array<{ id: string }> }).documents).toHaveLength(1);
  });

  it('falls back to standard filtering when query-based semantic search has no hits', async () => {
    const db = createListDb([
      {
        id: 'doc-2',
        teamId: '',
        type: 'file',
        ownerUserId: 'coach-1',
        title: 'Third Down Sheet',
        normalizedTitle: 'third down sheet',
        summary: 'Third down call menu',
        status: 'ready',
        payloadKind: 'native',
        payload: {
          content: { text: 'Third down pressure plan and empty checks.' },
        },
        readAccessKeys: ['user:coach-1'],
        writeAccessKeys: ['user:coach-1'],
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-03T00:00:00.000Z',
      },
    ]);
    mockSemanticSearch.mockResolvedValue([]);

    const tool = new ListUniversalTeamDocumentsTool(db as never);
    const result = await tool.execute({ query: 'third down' }, { userId: 'coach-1' });

    expect(mockSemanticSearch).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      documents: [expect.objectContaining({ id: 'doc-2' })],
    });
  });

  it.each([
    [{ classification: 'playbook' }, 'playbook', 'classification'],
    [{ route: 'callsheet' }, 'callsheet', 'route'],
    [{ label: 'terminology' }, 'terminology', 'label'],
  ] as const)(
    'uses metadata-only %s as semantic discovery intent',
    async (input, expectedQuery, filteredProperty) => {
      const db = createListDb([
        {
          id: 'doc-install',
          teamId: '',
          type: 'file',
          ownerUserId: 'coach-1',
          title: 'Tuesday Install Sheet',
          normalizedTitle: 'tuesday install sheet',
          classification: {
            primary: 'strategy_document',
            route: 'install_sheet',
            labels: ['offense', 'installation'],
          },
          status: 'ready',
          payloadKind: 'native',
          payload: {
            content: { text: 'Inside zone rules, quick game calls, and red zone answers.' },
          },
          readAccessKeys: ['user:coach-1'],
          writeAccessKeys: ['user:coach-1'],
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
      ]);
      mockSemanticSearch.mockResolvedValue([
        {
          fileId: 'doc-install',
          score: 0.88,
          excerpt: 'Inside zone rules, quick game calls, and red zone answers.',
        },
      ]);

      const tool = new ListUniversalTeamDocumentsTool(db as never);
      const result = await tool.execute(input, { userId: 'coach-1' });

      expect(mockSemanticSearch).toHaveBeenCalledWith(
        { teamId: '', userId: 'coach-1' },
        expectedQuery,
        expect.objectContaining({ topK: 25, includeArchived: false })
      );
      expect(mockSemanticSearch.mock.calls[0]?.[2]).not.toHaveProperty(filteredProperty);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        documents: [
          expect.objectContaining({
            id: 'doc-install',
            semanticScore: 0.88,
          }),
        ],
      });
    }
  );

  it('lists personal files when the stored document omits teamId', async () => {
    const db = createListDb([
      {
        id: 'doc-personal',
        type: 'file',
        ownerUserId: 'coach-1',
        title: 'Upload Smoke File',
        normalizedTitle: 'upload smoke file',
        status: 'ready',
        payloadKind: 'pointer',
        payload: {
          attachment: { kind: 'file', name: 'upload-smoke.txt' },
        },
        readAccessKeys: ['user:coach-1'],
        writeAccessKeys: ['user:coach-1'],
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-04T00:00:00.000Z',
      },
      {
        id: 'doc-team-owned',
        teamId: 'team-7',
        type: 'file',
        ownerUserId: 'coach-1',
        title: 'Team Install Sheet',
        normalizedTitle: 'team install sheet',
        status: 'ready',
        payloadKind: 'native',
        payload: {
          content: { text: 'Team-only install notes.' },
        },
        readAccessKeys: ['user:coach-1'],
        writeAccessKeys: ['user:coach-1'],
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      },
    ]);

    const tool = new ListUniversalTeamDocumentsTool(db as never);
    const result = await tool.execute({}, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      documents: [expect.objectContaining({ id: 'doc-personal' })],
    });
    expect((result.data as { documents: Array<{ id: string }> }).documents).toHaveLength(1);
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

  it('returns a signed inspection URL for pointer-backed image artifacts', async () => {
    const { db } = createDb({
      universalDoc: {
        id: 'callsheet-1',
        exists: true,
        data: () => ({
          id: 'callsheet-1',
          teamId: 'team-1',
          type: 'file',
          ownerUserId: 'coach-1',
          title: 'Week 1 Callsheet.png',
          normalizedTitle: 'week-1-callsheet.png',
          status: 'ready',
          payloadKind: 'pointer',
          payload: {
            collectionName: 'SavedFiles',
            documentId: 'saved-file-1',
            preview: {
              summary: 'PNG callsheet preview',
            },
          },
          classification: {
            primary: 'strategy_document',
            route: 'callsheet',
            labels: ['callsheet'],
          },
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }),
      },
      referencedDocs: {
        SavedFiles: {
          exists: true,
          data: () => ({
            payload: {
              asset: {
                kind: 'image',
                mimeType: 'image/png',
                sizeBytes: 1024,
                origin: 'upload',
                url: 'https://storage.googleapis.com/nxt1-prod.appspot.com/file/private-callsheet.png',
                storagePath: 'Teams/team-1/callsheets/private-callsheet.png',
              },
            },
          }),
        },
      },
    });

    const tool = new GetUniversalTeamDocumentTool(db as never);
    const result = await tool.execute({ documentId: 'callsheet-1' }, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      inspection: {
        inspectionUrl: 'https://signed.example.com/callsheet.png',
        mimeType: 'image/png',
        kind: 'image',
        sizeBytes: 1024,
        storagePath: 'Teams/team-1/callsheets/private-callsheet.png',
        documentRef: 'team-file:callsheet-1',
        parseDocumentInput: {
          storagePath: 'team-file:callsheet-1',
          url: 'https://signed.example.com/callsheet.png',
          fileName: 'Week 1 Callsheet.png',
          mimeType: 'image/png',
        },
        collectionName: 'SavedFiles',
        sourceDocumentId: 'saved-file-1',
      },
      summary: {
        inspection: {
          inspectionUrl: 'https://signed.example.com/callsheet.png',
        },
      },
    });
  });

  it('allows team members to read legacy team-scoped documents without explicit access keys', async () => {
    const { db } = createDb({
      universalDoc: {
        id: 'legacy-callsheet-1',
        exists: true,
        data: () => ({
          id: 'legacy-callsheet-1',
          teamId: 'team-1',
          organizationId: 'org-1',
          type: 'file',
          ownerUserId: 'coach-1',
          title: 'Legacy Callsheet',
          normalizedTitle: 'legacy callsheet',
          status: 'ready',
          payloadKind: 'pointer',
          payload: {
            collectionName: 'SavedFiles',
            documentId: 'saved-file-legacy-1',
          },
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }),
      },
      referencedDocs: {
        SavedFiles: {
          exists: false,
          data: () => undefined,
        },
      },
      rosterDocs: [
        {
          userId: 'viewer-1',
          teamId: 'team-1',
          organizationId: 'org-1',
          status: 'active',
        },
      ],
    });

    const tool = new GetUniversalTeamDocumentTool(db as never);
    const result = await tool.execute({ documentId: 'legacy-callsheet-1' }, { userId: 'viewer-1' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      document: {
        readAccessKeys: expect.arrayContaining(['user:coach-1', 'team:team-1', 'org:org-1']),
      },
      summary: {
        artifactKind: 'pointer_file',
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

  it('persists markdown format when updating managed document content', async () => {
    mockCanManageTeamMutationForUser.mockResolvedValue(false);
    const { db, universalSet } = createDb({
      universalDoc: {
        id: 'doc-markdown-1',
        exists: true,
        data: () => ({
          id: 'doc-markdown-1',
          teamId: 'team-1',
          type: 'file',
          ownerUserId: 'owner-user',
          title: 'Practice Script',
          normalizedTitle: 'practice script',
          status: 'ready',
          payloadKind: 'native',
          payload: {
            content: { text: 'Original notes', format: 'markdown' },
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
        documentId: 'doc-markdown-1',
        patch: {
          content: '# Tuesday Practice\n\n- Indy\n- Team Run',
        },
      },
      { userId: 'test-user' }
    );

    expect(result.success).toBe(true);
    expect(universalSet).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          content: expect.objectContaining({
            text: '# Tuesday Practice\n\n- Indy\n- Team Run',
            format: 'markdown',
          }),
        }),
      })
    );
  });

  it('updates artifact metadata for user-owned unbound uploads without team context', async () => {
    mockCanManageTeamMutationForUser.mockResolvedValue(false);
    const { db, universalSet } = createDb({
      universalDoc: {
        id: 'upload-2',
        exists: true,
        data: () => ({
          id: 'upload-2',
          teamId: '',
          type: 'file',
          ownerUserId: 'test-user',
          title: 'Game Callsheet.xlsx',
          normalizedTitle: 'game callsheet.xlsx',
          status: 'ready',
          payloadKind: 'pointer',
          payload: {
            storagePath: 'Users/test-user/uploads/xlsx/unbound/123_callsheet.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
        documentId: 'upload-2',
        patch: {
          artifactSummary: 'Updated summary for personal upload.',
          artifactNotes: 'Updated notes for personal upload.',
        },
      },
      { userId: 'test-user' }
    );

    expect(result.success).toBe(true);
    expect(universalSet).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactSummary: 'Updated summary for personal upload.',
        artifactNotes: 'Updated notes for personal upload.',
      })
    );
  });

  it('preserves page-by-page enrich_document_notes artifactNotes when later patches send condensed notes', async () => {
    mockCanManageTeamMutationForUser.mockResolvedValue(false);
    const pageByPageNotes = [
      '# AI Notes: Offense.pdf',
      '',
      'Processed pages: 2',
      'Analyzed pages: 2',
      'Failed pages: 0',
      '',
      '## Page-by-page notes',
      '',
      '### Page 1',
      '- Formation install notes',
      '',
      '### Page 2',
      '- Route concept notes',
    ].join('\n');
    const { db, universalSet } = createDb({
      universalDoc: {
        id: 'upload-page-notes',
        exists: true,
        data: () => ({
          id: 'upload-page-notes',
          teamId: '',
          type: 'file',
          ownerUserId: 'test-user',
          title: 'Offense.pdf',
          normalizedTitle: 'offense.pdf',
          status: 'ready',
          payloadKind: 'pointer',
          payload: {
            storagePath: 'Users/test-user/uploads/pdf/unbound/123_offense.pdf',
            mimeType: 'application/pdf',
          },
          artifactClassification: {
            kind: 'ai_page_notes',
            source: 'enrich_document_notes',
            pageCount: 2,
            analyzedPageCount: 2,
            failedPageCount: 0,
          },
          artifactSummary: 'Original summary',
          artifactNotes: pageByPageNotes,
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
        documentId: 'upload-page-notes',
        patch: {
          artifactSummary: 'Condensed coaching synthesis.',
          artifactNotes: 'Condensed coaching synthesis with key takeaways.',
        },
      },
      { userId: 'test-user' }
    );

    expect(result.success).toBe(true);
    expect(universalSet).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactSummary: 'Condensed coaching synthesis.',
        artifactNotes: pageByPageNotes,
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
      error: 'Only the file owner can update direct file sharing.',
    });
    expect(universalSet).not.toHaveBeenCalled();
  });
});
