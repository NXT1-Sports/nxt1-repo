import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetFirestore, mockLogger } = vi.hoisted(() => ({
  mockGetFirestore: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: mockGetFirestore,
}));

vi.mock('../../../../utils/logger.js', () => ({
  logger: mockLogger,
}));

const { getConnectedSourceSyncTracker } =
  await import('../connected-source-sync-tracker.service.js');

function createFirestoreMock(initialSources: Record<string, unknown>[]) {
  const docRef = { id: 'team-123' };
  const update = vi.fn();
  const get = vi.fn().mockResolvedValue({
    exists: true,
    data: () => ({ connectedSources: initialSources }),
  });
  const runTransaction = vi.fn(
    async (fn: (tx: { get: typeof get; update: typeof update }) => unknown) => fn({ get, update })
  );
  const collection = vi.fn(() => ({
    doc: vi.fn(() => docRef),
  }));

  mockGetFirestore.mockReturnValue({
    collection,
    runTransaction,
  });

  return { update, runTransaction };
}

describe('ConnectedSourceSyncTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fills missing attribution on existing rows when marking manual resync pending', async () => {
    const { update } = createFirestoreMock([
      {
        platform: 'x',
        profileUrl: 'https://x.com/cpdogsfootball',
        scopeId: 'football',
      },
    ]);
    const tracker = getConnectedSourceSyncTracker();
    const operationId = 'op-pending';

    tracker.trackFromContext(operationId, {
      connectedSourceTargets: [
        {
          docType: 'team',
          docId: 'team-123',
          platform: 'x',
          profileUrl: 'https://x.com/cpdogsfootball',
          scopeId: 'football',
          addedBy: 'Chris Paul',
          addedById: 'user-123',
        },
      ],
    });

    await tracker.markPending(operationId);
    tracker.discard(operationId);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[1]).toEqual({
      connectedSources: [
        expect.objectContaining({
          platform: 'x',
          profileUrl: 'https://x.com/cpdogsfootball',
          scopeId: 'football',
          syncStatus: 'pending',
          connected: false,
          addedBy: 'Chris Paul',
          addedById: 'user-123',
        }),
      ],
    });
  });

  it('seeds attribution when flush upserts a missing tracked row', async () => {
    const { update } = createFirestoreMock([]);
    const tracker = getConnectedSourceSyncTracker();
    const operationId = 'op-flush';

    tracker.trackFromContext(operationId, {
      connectedSourceTargets: [
        {
          docType: 'team',
          docId: 'team-123',
          platform: 'maxpreps',
          profileUrl: 'https://www.maxpreps.com/team/example',
          scopeId: 'football',
          addedBy: 'Chris Paul',
          addedById: 'user-123',
        },
      ],
    });

    await tracker.flush(operationId, 'success');

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[1]).toEqual({
      connectedSources: [
        expect.objectContaining({
          platform: 'maxpreps',
          profileUrl: 'https://www.maxpreps.com/team/example',
          scopeId: 'football',
          syncStatus: 'success',
          connected: true,
          connectionType: 'link',
          addedBy: 'Chris Paul',
          addedById: 'user-123',
        }),
      ],
    });
  });

  it('preserves earlier attribution when the same source is tracked again later in the operation', async () => {
    const profileUrl =
      'https://fan.hudl.com/usa/in/crown-point/organization/18116/crown-point-high-school/team/449401/boys-varsity-basketball';
    const { update } = createFirestoreMock([
      {
        platform: 'hudl',
        profileUrl,
        scopeId: 'basketball',
      },
    ]);
    const tracker = getConnectedSourceSyncTracker();
    const operationId = 'op-merge';

    tracker.trackFromContext(operationId, {
      connectedSourceTargets: [
        {
          docType: 'team',
          docId: 'team-123',
          platform: 'hudl',
          profileUrl,
          scopeId: '',
          addedBy: 'Chris Paul',
          addedById: 'user-123',
        },
      ],
    });

    tracker.track(operationId, {
      docType: 'team',
      docId: 'team-123',
      platform: 'hudl',
      profileUrl,
      scopeId: 'basketball',
    });

    await tracker.flush(operationId, 'success');

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[1]).toEqual({
      connectedSources: [
        expect.objectContaining({
          platform: 'hudl',
          scopeId: 'basketball',
          syncStatus: 'success',
          addedBy: 'Chris Paul',
          addedById: 'user-123',
        }),
      ],
    });
  });

  it('updates every logical duplicate row for the tracked source during lifecycle writes', async () => {
    const profileUrl = 'https://www.maxpreps.com/team/example';
    const { update } = createFirestoreMock([
      {
        platform: 'maxpreps',
        profileUrl,
        scopeId: 'football',
      },
      {
        platform: 'maxpreps',
        profileUrl,
        scopeId: 'basketball',
      },
      {
        platform: 'maxpreps',
        profileUrl: 'https://www.maxpreps.com/team/other',
        scopeId: 'football',
      },
    ]);
    const tracker = getConnectedSourceSyncTracker();
    const operationId = 'op-duplicates';

    tracker.trackFromContext(operationId, {
      connectedSourceTargets: [
        {
          docType: 'team',
          docId: 'team-123',
          platform: 'maxpreps',
          profileUrl,
          scopeId: 'football',
          addedBy: 'Chris Paul',
          addedById: 'user-123',
        },
      ],
    });

    await tracker.markPending(operationId);
    await tracker.flush(operationId, 'success');

    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0]?.[1]).toEqual({
      connectedSources: [
        expect.objectContaining({
          platform: 'maxpreps',
          profileUrl,
          scopeId: 'football',
          syncStatus: 'pending',
          connected: false,
        }),
        expect.objectContaining({
          platform: 'maxpreps',
          profileUrl,
          scopeId: 'basketball',
          syncStatus: 'pending',
          connected: false,
        }),
        expect.objectContaining({
          platform: 'maxpreps',
          profileUrl: 'https://www.maxpreps.com/team/other',
          scopeId: 'football',
          syncStatus: 'pending',
          connected: false,
        }),
      ],
    });
    expect(update.mock.calls[1]?.[1]).toEqual({
      connectedSources: [
        expect.objectContaining({
          platform: 'maxpreps',
          profileUrl,
          scopeId: 'football',
          syncStatus: 'success',
          connected: true,
        }),
        expect.objectContaining({
          platform: 'maxpreps',
          profileUrl,
          scopeId: 'basketball',
          syncStatus: 'success',
          connected: true,
        }),
        expect.objectContaining({
          platform: 'maxpreps',
          profileUrl: 'https://www.maxpreps.com/team/other',
          scopeId: 'football',
          syncStatus: 'success',
          connected: true,
        }),
      ],
    });
  });

  it('matches and updates a global source row without a scopeId', async () => {
    const { update } = createFirestoreMock([
      {
        platform: 'x',
        profileUrl: 'https://x.com/cpdogsfootball',
        scopeType: 'global',
      },
    ]);
    const tracker = getConnectedSourceSyncTracker();
    const operationId = 'op-global-x';

    tracker.trackFromContext(operationId, {
      connectedSourceTargets: [
        {
          docType: 'team',
          docId: 'team-123',
          platform: 'x',
          profileUrl: 'https://x.com/cpdogsfootball',
          scopeType: 'global',
          scopeId: '',
          addedBy: 'Chris Paul',
          addedById: 'user-123',
        },
      ],
    });

    await tracker.markPending(operationId);
    await tracker.flush(operationId, 'success');

    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0]?.[1]).toEqual({
      connectedSources: [
        expect.objectContaining({
          platform: 'x',
          profileUrl: 'https://x.com/cpdogsfootball',
          scopeType: 'global',
          syncStatus: 'pending',
          connected: false,
          addedBy: 'Chris Paul',
          addedById: 'user-123',
        }),
      ],
    });
    expect(update.mock.calls[1]?.[1]).toEqual({
      connectedSources: [
        expect.objectContaining({
          platform: 'x',
          profileUrl: 'https://x.com/cpdogsfootball',
          scopeType: 'global',
          syncStatus: 'success',
          connected: true,
          addedBy: 'Chris Paul',
          addedById: 'user-123',
        }),
      ],
    });
  });
});
