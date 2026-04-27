import { beforeEach, describe, expect, it } from 'vitest';
import { AgentJobRepository } from '../job.repository.js';

interface MockDocSnapshot {
  readonly exists: boolean;
  data(): Record<string, unknown> | undefined;
  get(field: string): unknown;
}

interface MockQuerySnapshot {
  readonly docs: Array<{
    data(): Record<string, unknown>;
    get(field: string): unknown;
  }>;
}

function createMockFirestore() {
  const jobs = new Map<string, Record<string, unknown>>();
  const events = new Map<string, Array<Record<string, unknown>>>();
  let autoId = 0;
  let txChain = Promise.resolve();

  const makeDocSnapshot = (doc: Record<string, unknown> | undefined): MockDocSnapshot => ({
    exists: !!doc,
    data: () => doc,
    get: (field: string) => doc?.[field],
  });

  const makeEventDocs = (operationId: string) => events.get(operationId) ?? [];

  const makeEventDocView = (data: Record<string, unknown>) => ({
    data: () => data,
    get: (field: string) => data[field],
  });

  const makeEventsQuery = (
    operationId: string,
    direction: 'asc' | 'desc' = 'asc',
    limitCount?: number
  ) => ({
    __kind: 'query' as const,
    operationId,
    direction,
    limitCount,
    orderBy(_field: string, nextDirection: 'asc' | 'desc') {
      return makeEventsQuery(operationId, nextDirection, limitCount);
    },
    limit(nextLimit: number) {
      return makeEventsQuery(operationId, direction, nextLimit);
    },
    async get(): Promise<MockQuerySnapshot> {
      const sorted = [...makeEventDocs(operationId)].sort((a, b) => {
        const aSeq = Number(a['seq'] ?? -1);
        const bSeq = Number(b['seq'] ?? -1);
        return direction === 'asc' ? aSeq - bSeq : bSeq - aSeq;
      });
      const sliced = typeof limitCount === 'number' ? sorted.slice(0, limitCount) : sorted;
      return {
        docs: sliced.map((doc) => makeEventDocView(doc)),
      };
    },
  });

  const makeEventCollection = (operationId: string) => ({
    __kind: 'collection' as const,
    operationId,
    doc() {
      const id = `evt-${autoId++}`;
      return {
        __kind: 'event-doc' as const,
        operationId,
        id,
      };
    },
    async add(payload: Record<string, unknown>) {
      const list = makeEventDocs(operationId);
      list.push({ ...payload, id: `evt-${autoId++}` });
      events.set(operationId, list);
      return { id: `evt-${autoId - 1}` };
    },
    orderBy(_field: string, direction: 'asc' | 'desc') {
      return makeEventsQuery(operationId, direction);
    },
  });

  const makeJobDocRef = (operationId: string) => ({
    __kind: 'job-doc' as const,
    operationId,
    collection(name: string) {
      if (name !== 'events') throw new Error(`Unexpected subcollection: ${name}`);
      return makeEventCollection(operationId);
    },
    async get(): Promise<MockDocSnapshot> {
      return makeDocSnapshot(jobs.get(operationId));
    },
    async set(payload: Record<string, unknown>, options?: { merge?: boolean }) {
      if (options?.merge) {
        const current = jobs.get(operationId) ?? {};
        jobs.set(operationId, { ...current, ...payload });
        return;
      }
      jobs.set(operationId, { ...payload });
    },
    async update(payload: Record<string, unknown>) {
      const current = jobs.get(operationId);
      if (!current) throw new Error(`Job ${operationId} not found`);
      jobs.set(operationId, { ...current, ...payload });
    },
  });

  const db = {
    collection(name: string) {
      if (name !== 'AgentJobs') throw new Error(`Unexpected collection: ${name}`);
      return {
        doc(operationId: string) {
          return makeJobDocRef(operationId);
        },
      };
    },
    batch() {
      const operations: Array<{ ref: { operationId: string }; payload: Record<string, unknown> }> =
        [];
      return {
        set(ref: { operationId: string }, payload: Record<string, unknown>) {
          operations.push({ ref, payload });
        },
        async commit() {
          for (const op of operations) {
            const list = makeEventDocs(op.ref.operationId);
            list.push({ ...op.payload, id: `evt-${autoId++}` });
            events.set(op.ref.operationId, list);
          }
        },
      };
    },
    async runTransaction<T>(handler: (txn: any) => Promise<T>): Promise<T> {
      const run = txChain.then(async () => {
        const txn = {
          async get(target: any): Promise<MockDocSnapshot | MockQuerySnapshot> {
            if (target?.__kind === 'job-doc') {
              return makeDocSnapshot(jobs.get(target.operationId));
            }
            if (target?.__kind === 'query') {
              return target.get();
            }
            throw new Error('Unsupported transaction target');
          },
          set(ref: any, payload: Record<string, unknown>) {
            if (ref?.__kind !== 'event-doc') throw new Error('Unsupported transaction set target');
            const list = makeEventDocs(ref.operationId);
            list.push({ ...payload, id: ref.id });
            events.set(ref.operationId, list);
          },
          update(ref: any, payload: Record<string, unknown>) {
            if (ref?.__kind !== 'job-doc') {
              throw new Error('Unsupported transaction update target');
            }
            const current = jobs.get(ref.operationId);
            if (!current) throw new Error(`Job ${ref.operationId} not found`);
            jobs.set(ref.operationId, { ...current, ...payload });
          },
        };

        return handler(txn);
      });

      txChain = run.then(
        () => undefined,
        () => undefined
      );

      return run;
    },
  };

  return {
    db,
    seedJob(operationId: string, doc: Record<string, unknown>) {
      jobs.set(operationId, { ...doc });
    },
    readJob(operationId: string): Record<string, unknown> | undefined {
      return jobs.get(operationId);
    },
  };
}

describe('AgentJobRepository sequencing', () => {
  let firestore: ReturnType<typeof createMockFirestore>;
  let repository: AgentJobRepository;

  beforeEach(async () => {
    firestore = createMockFirestore();
    repository = new AgentJobRepository(firestore.db as never);

    await repository.create({
      operationId: 'op-seq-1',
      userId: 'user-1',
      intent: 'Test sequencing',
      sessionId: 'sess-1',
      origin: 'user',
      context: {},
    });
  });

  it('allocates unique contiguous seq values under concurrent range requests', async () => {
    const allocations = await Promise.all(
      Array.from({ length: 20 }, () => repository.allocateEventSeqRange('op-seq-1', 1))
    );

    const sorted = [...allocations].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: 20 }, (_, index) => index));

    const job = await repository.getById('op-seq-1');
    expect(job?.nextEventSeq).toBe(20);
  });

  it('allocates non-overlapping ranges under concurrent mixed-size requests', async () => {
    const counts = [3, 1, 5, 2, 4, 1, 6];
    const starts = await Promise.all(
      counts.map((count) => repository.allocateEventSeqRange('op-seq-1', count))
    );

    const allocatedSeqs = starts
      .map((start, index) =>
        Array.from({ length: counts[index] ?? 0 }, (_, offset) => start + offset)
      )
      .flat()
      .sort((a, b) => a - b);

    expect(allocatedSeqs).toEqual(
      Array.from({ length: counts.reduce((sum, n) => sum + n, 0) }, (_, index) => index)
    );

    const job = await repository.getById('op-seq-1');
    expect(job?.nextEventSeq).toBe(counts.reduce((sum, n) => sum + n, 0));
  });

  it('writes events with auto-seq atomically under concurrent writes', async () => {
    const writtenSeqs = await Promise.all(
      Array.from({ length: 15 }, (_, index) =>
        repository.writeJobEventWithAutoSeq('op-seq-1', {
          userId: 'user-1',
          type: 'delta',
          text: `chunk-${index}`,
        })
      )
    );

    expect([...writtenSeqs].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 15 }, (_, index) => index)
    );

    const events = await repository.getJobEvents('op-seq-1');
    expect(events.map((event) => event.seq)).toEqual(
      Array.from({ length: 15 }, (_, index) => index)
    );

    const job = await repository.getById('op-seq-1');
    expect(job?.nextEventSeq).toBe(15);
  });

  it('backfills next seq from existing events when nextEventSeq is missing', async () => {
    firestore.seedJob('op-backfill', {
      operationId: 'op-backfill',
      userId: 'user-1',
      status: 'processing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const backfillRepo = new AgentJobRepository(firestore.db as never);
    await backfillRepo.writeJobEvent('op-backfill', {
      seq: 7,
      userId: 'user-1',
      type: 'delta',
      text: 'seed',
    });

    const allocated = await backfillRepo.allocateEventSeqRange('op-backfill', 2);
    expect(allocated).toBe(8);

    const job = firestore.readJob('op-backfill');
    expect(job?.['nextEventSeq']).toBe(10);
  });

  it('updates progress for non-locked statuses', async () => {
    await repository.updateProgress('op-seq-1', {
      status: 'processing',
      message: 'Working',
      agentId: 'router',
      outcomeCode: 'success_default',
      percent: 10,
      currentStep: 1,
      totalSteps: 10,
      updatedAt: new Date().toISOString(),
    });

    const job = await repository.getById('op-seq-1');
    expect(job?.status).toBe('processing');
    expect(job?.progress?.message).toBe('Working');
  });

  it('does not overwrite paused status with late progress updates', async () => {
    await repository.markPaused('op-seq-1', {
      reason: 'needs_input',
      promptToUser: 'Operation paused. Resume whenever you are ready.',
      agentId: 'router',
      messages: [],
      pendingToolCall: {
        toolName: 'resume_paused_operation',
        toolInput: { operationId: 'op-seq-1' },
        toolCallId: 'pause_resume_op-seq-1',
      },
      yieldedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await repository.updateProgress('op-seq-1', {
      status: 'completed',
      message: 'This should be ignored',
      agentId: 'router',
      outcomeCode: 'success_default',
      percent: 100,
      currentStep: 1,
      totalSteps: 1,
      updatedAt: new Date().toISOString(),
    });

    const job = await repository.getById('op-seq-1');
    expect(job?.status).toBe('paused');
    expect(job?.progress).toBeNull();
    expect(job?.yieldState?.pendingToolCall?.toolName).toBe('resume_paused_operation');
  });

  it('clears yieldState when marking job completed', async () => {
    await repository.markPaused('op-seq-1', {
      reason: 'needs_input',
      promptToUser: 'Operation paused. Resume whenever you are ready.',
      agentId: 'router',
      messages: [],
      pendingToolCall: {
        toolName: 'resume_paused_operation',
        toolInput: { operationId: 'op-seq-1' },
        toolCallId: 'pause_resume_op-seq-1',
      },
      yieldedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await repository.markCompleted('op-seq-1', {
      summary: 'Done',
      data: { ok: true },
    });

    const job = await repository.getById('op-seq-1');
    expect(job?.status).toBe('completed');
    expect(job?.yieldState ?? null).toBeNull();
    expect(job?.progress?.status).toBe('completed');
    expect(job?.progress?.percent).toBe(100);
    expect(job?.progress?.outcomeCode).toBe('success_default');
  });

  it('clears yieldState when marking job failed', async () => {
    await repository.markPaused('op-seq-1', {
      reason: 'needs_input',
      promptToUser: 'Operation paused. Resume whenever you are ready.',
      agentId: 'router',
      messages: [],
      pendingToolCall: {
        toolName: 'resume_paused_operation',
        toolInput: { operationId: 'op-seq-1' },
        toolCallId: 'pause_resume_op-seq-1',
      },
      yieldedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await repository.markFailed('op-seq-1', 'boom');

    const job = await repository.getById('op-seq-1');
    expect(job?.status).toBe('failed');
    expect(job?.yieldState ?? null).toBeNull();
    expect(job?.progress?.status).toBe('failed');
    expect(job?.progress?.percent).toBe(100);
    expect(job?.progress?.outcomeCode).toBe('task_failed');
  });

  it('clears yieldState when marking job cancelled', async () => {
    await repository.markPaused('op-seq-1', {
      reason: 'needs_input',
      promptToUser: 'Operation paused. Resume whenever you are ready.',
      agentId: 'router',
      messages: [],
      pendingToolCall: {
        toolName: 'resume_paused_operation',
        toolInput: { operationId: 'op-seq-1' },
        toolCallId: 'pause_resume_op-seq-1',
      },
      yieldedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await repository.markCancelled('op-seq-1');

    const job = await repository.getById('op-seq-1');
    expect(job?.status).toBe('cancelled');
    expect(job?.yieldState ?? null).toBeNull();
    expect(job?.progress?.status).toBe('cancelled');
    expect(job?.progress?.percent).toBe(100);
  });
});
