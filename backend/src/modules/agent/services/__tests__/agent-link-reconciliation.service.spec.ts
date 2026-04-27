import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentLinkReconciliationService } from '../agent-link-reconciliation.service.js';
import { AgentMessageModel } from '../../../../models/agent/agent-message.model.js';

vi.mock('../../../../models/agent/agent-message.model.js', () => ({
  AgentMessageModel: {
    find: vi.fn(),
  },
}));

type FakeDocRef = {
  readonly id: string;
  update: (patch: Record<string, unknown>) => Promise<void>;
};

function buildFirestoreMock(initialDocs: Record<string, Record<string, unknown>>) {
  const docs = new Map<string, Record<string, unknown>>();
  for (const [id, data] of Object.entries(initialDocs)) {
    docs.set(id, { ...data });
  }

  const refs = new Map<string, FakeDocRef>();

  const getRef = (id: string): FakeDocRef => {
    const existing = refs.get(id);
    if (existing) return existing;

    const created: FakeDocRef = {
      id,
      update: async (patch: Record<string, unknown>) => {
        const current = docs.get(id) ?? {};
        docs.set(id, { ...current, ...patch });
      },
    };
    refs.set(id, created);
    return created;
  };

  const db = {
    collection: () => ({
      doc: (id: string) => getRef(id),
    }),
    getAll: async (...inputRefs: FakeDocRef[]) =>
      inputRefs.map((ref) => ({
        id: ref.id,
        exists: docs.has(ref.id),
        data: () => docs.get(ref.id),
        ref,
      })),
  };

  return {
    db,
    readDoc: (id: string) => docs.get(id),
  };
}

function mockRecentMessages(messages: readonly Record<string, unknown>[]): void {
  const exec = vi.fn().mockResolvedValue(messages);
  const lean = vi.fn(() => ({ exec }));
  const limit = vi.fn(() => ({ lean }));
  const sort = vi.fn(() => ({ limit }));
  const select = vi.fn(() => ({ sort }));

  vi.mocked(AgentMessageModel.find).mockReturnValue({ select } as unknown as never);
}

describe('AgentLinkReconciliationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('repairs missing threadId on matching AgentJobs docs', async () => {
    mockRecentMessages([
      {
        operationId: 'chat-op-1',
        threadId: 'thread-1',
        userId: 'user-1',
        createdAt: '2026-04-24T10:00:00.000Z',
      },
    ]);

    const firestore = buildFirestoreMock({
      'chat-op-1': { operationId: 'chat-op-1', userId: 'user-1', threadId: null },
    });

    const service = new AgentLinkReconciliationService();
    const result = await service.reconcileJobThreadLinks(firestore.db as never, {
      lookbackDays: 30,
      messageScanLimit: 100,
      repairLimit: 10,
      batchSize: 50,
    });

    expect(result.repaired).toBe(1);
    expect(firestore.readDoc('chat-op-1')?.['threadId']).toBe('thread-1');
  });

  it('does not overwrite mismatched threadId by default', async () => {
    mockRecentMessages([
      {
        operationId: 'chat-op-2',
        threadId: 'thread-new',
        userId: 'user-2',
        createdAt: '2026-04-24T10:00:00.000Z',
      },
    ]);

    const firestore = buildFirestoreMock({
      'chat-op-2': { operationId: 'chat-op-2', userId: 'user-2', threadId: 'thread-existing' },
    });

    const service = new AgentLinkReconciliationService();
    const result = await service.reconcileJobThreadLinks(firestore.db as never, {
      lookbackDays: 30,
      messageScanLimit: 100,
      repairLimit: 10,
      batchSize: 50,
    });

    expect(result.repaired).toBe(0);
    expect(result.skippedMismatchedThreadId).toBe(1);
    expect(firestore.readDoc('chat-op-2')?.['threadId']).toBe('thread-existing');
  });
});
