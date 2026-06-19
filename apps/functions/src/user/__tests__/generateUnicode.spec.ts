import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setMock, docMock, collectionMock, serverTimestampMock, deleteFieldMock, dbMock } =
  vi.hoisted(() => {
    const localSetMock = vi.fn();
    const localDocMock = vi.fn(() => ({
      set: localSetMock,
    }));
    const localCollectionMock = vi.fn(() => ({
      doc: localDocMock,
    }));
    const localServerTimestampMock = vi.fn(() => '__SERVER_TIMESTAMP__');
    const localDeleteFieldMock = vi.fn(() => '__DELETE_FIELD__');
    const localDbMock = {
      collection: localCollectionMock,
    };

    return {
      setMock: localSetMock,
      docMock: localDocMock,
      collectionMock: localCollectionMock,
      serverTimestampMock: localServerTimestampMock,
      deleteFieldMock: localDeleteFieldMock,
      dbMock: localDbMock,
    };
  });

vi.mock('../../firebase-admin', () => ({
  db: dbMock,
  FieldValue: {
    serverTimestamp: serverTimestampMock,
    delete: deleteFieldMock,
  },
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { releaseUnicode } from '../generateUnicode';

describe('releaseUnicode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses set with merge so releasing a missing unicode doc is idempotent', async () => {
    await releaseUnicode('18302826');

    expect(collectionMock).toHaveBeenCalledWith('Unicodes');
    expect(docMock).toHaveBeenCalledWith('18302826');
    expect(deleteFieldMock).toHaveBeenCalledTimes(1);
    expect(serverTimestampMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith(
      {
        used: false,
        userId: '__DELETE_FIELD__',
        releasedAt: '__SERVER_TIMESTAMP__',
      },
      { merge: true }
    );
  });
});
