import type { UniversalFileDoc } from '@nxt1/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findOneMock,
  updateManyMock,
  insertManyMock,
  deleteManyMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  findOneMock: vi.fn(),
  updateManyMock: vi.fn(async () => undefined),
  insertManyMock: vi.fn(async () => undefined),
  deleteManyMock: vi.fn(async () => undefined),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('../../../modules/agent/memory/team-universal-file-semantic.model.js', () => ({
  TEAM_UNIVERSAL_FILE_SEMANTIC_VECTOR_INDEX_NAME: 'semantic-index',
  TeamUniversalFileSemanticModel: {
    findOne: findOneMock,
    updateMany: updateManyMock,
    insertMany: insertManyMock,
    deleteMany: deleteManyMock,
  },
}));

vi.mock('../../../modules/agent/tools/media/parse-document.tool.js', () => ({
  ParseDocumentTool: class ParseDocumentTool {},
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: {
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
  },
}));

import { UniversalFileSemanticService } from '../universal-file-semantic.service.js';

function createFirestoreMock() {
  const set = vi.fn(async () => undefined);
  const doc = vi.fn(() => ({ set }));
  const collection = vi.fn(() => ({ doc }));

  return {
    db: { collection } as never,
    set,
  };
}

function createFindOneChain<T>(value: T) {
  return {
    sort: vi.fn(() => ({
      lean: vi.fn(async () => value),
      select: vi.fn(() => ({
        lean: vi.fn(async () => value),
      })),
    })),
  };
}

describe('UniversalFileSemanticService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses the concurrent semantic version after a duplicate-key collision', async () => {
    const { db, set } = createFirestoreMock();
    const llm = {
      embed: vi.fn(async () => [0.1, 0.2, 0.3]),
    };
    const service = new UniversalFileSemanticService(db, llm as never);

    const exactLookupResults = [null, null, { version: 3, totalChunks: 1 }];
    const latestVersionResults = [{ version: 2 }];

    findOneMock.mockImplementation((query: Record<string, unknown>) => {
      if ('contentHash' in query) {
        return createFindOneChain(exactLookupResults.shift() ?? null);
      }

      return createFindOneChain(latestVersionResults.shift() ?? null);
    });

    const duplicateKeyError = Object.assign(new Error('duplicate key error'), { code: 11000 });
    insertManyMock.mockRejectedValueOnce(duplicateKeyError);

    const document = {
      id: 'file-123',
      teamId: 'team-123',
      ownerUserId: 'user-123',
      createdByUserId: 'user-123',
      title: 'Opponent Film',
      normalizedTitle: 'opponent film',
      payloadKind: 'native',
      type: 'file',
      payload: {},
      updatedAt: '2026-06-30T20:54:14.000Z',
      createdAt: '2026-06-30T20:54:14.000Z',
    } as UniversalFileDoc;

    await service.syncDocument(document, {
      semanticText: 'Trips right, inside zone on first down.',
    });

    expect(llm.embed).toHaveBeenCalledOnce();
    expect(insertManyMock).toHaveBeenCalledOnce();
    expect(deleteManyMock).not.toHaveBeenCalled();
    expect(loggerInfoMock).toHaveBeenCalledWith(
      '[UniversalFileSemantic] Detected concurrent semantic sync write, retrying',
      expect.objectContaining({
        fileId: 'file-123',
        teamId: 'team-123',
        attempt: 1,
      })
    );
    expect(set).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        semanticSync: expect.objectContaining({
          status: 'synced',
          documentId: 'file-123',
          version: 3,
          chunkCount: 1,
          error: null,
        }),
      }),
      { merge: true }
    );
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });
});
