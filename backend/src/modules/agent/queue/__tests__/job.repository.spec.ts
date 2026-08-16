import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentJobRepository } from '../job.repository.js';

const sendAgentJobFailureAlertMock = vi.hoisted(() => vi.fn());
const sendSlackAlertMock = vi.hoisted(() => vi.fn());
const classifyAgentJobAutoResolveTypeMock = vi.hoisted(() => vi.fn());
const shouldAutoRetryAgentJobMock = vi.hoisted(() => vi.fn());
const shouldSendAgentJobCustomerRecoveryEmailMock = vi.hoisted(() => vi.fn());
const isAgentJobCustomerRecoveryEmailEnabledMock = vi.hoisted(() => vi.fn());
const sendAgentJobRecoveryStartedEmailMock = vi.hoisted(() => vi.fn());
const trackAgentJobTerminalEventMock = vi.hoisted(() => vi.fn());

vi.mock(
  '../../../../services/communications/agent-jobs/email/agent-job-failure-alert.service.js',
  () => ({
    sendAgentJobFailureAlert: sendAgentJobFailureAlertMock,
  })
);

vi.mock('../../../../services/platform/alert.service.js', () => ({
  sendSlackAlert: sendSlackAlertMock,
}));

vi.mock('../../services/agent-job-auto-resolver.service.js', () => ({
  classifyAgentJobAutoResolveType: classifyAgentJobAutoResolveTypeMock,
  shouldAutoRetryAgentJob: shouldAutoRetryAgentJobMock,
  shouldSendAgentJobCustomerRecoveryEmail: shouldSendAgentJobCustomerRecoveryEmailMock,
}));

vi.mock(
  '../../../../services/communications/agent-jobs/email/agent-job-recovery-started-email.service.js',
  () => ({
    isAgentJobCustomerRecoveryEmailEnabled: isAgentJobCustomerRecoveryEmailEnabledMock,
    sendAgentJobRecoveryStartedEmail: sendAgentJobRecoveryStartedEmailMock,
  })
);

vi.mock('../../services/ga4-agent-job.service.js', () => ({
  trackAgentJobTerminalEvent: trackAgentJobTerminalEventMock,
}));

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

interface MockQueryRef {
  readonly __kind: 'query';
  readonly operationId: string;
  readonly collectionName: string;
  readonly direction: 'asc' | 'desc';
  readonly limitCount?: number;
  orderBy(field: string, nextDirection: 'asc' | 'desc'): MockQueryRef;
  limit(nextLimit: number): MockQueryRef;
  get(): Promise<MockQuerySnapshot>;
}

interface MockEventDocRef {
  readonly __kind: 'event-doc';
  readonly operationId: string;
  readonly collectionName: string;
  readonly id: string;
  set(payload: Record<string, unknown>, options?: { merge?: boolean }): Promise<void>;
}

interface MockJobDocRef {
  readonly __kind: 'job-doc';
  readonly operationId: string;
}

interface MockTransaction {
  get(target: MockJobDocRef | MockQueryRef): Promise<MockDocSnapshot | MockQuerySnapshot>;
  set(ref: MockEventDocRef, payload: Record<string, unknown>): void;
  update(ref: MockJobDocRef, payload: Record<string, unknown>): void;
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

  const subcollectionKey = (operationId: string, collectionName: string) =>
    `${operationId}:${collectionName}`;
  const makeEventDocs = (operationId: string, collectionName = 'events') =>
    events.get(subcollectionKey(operationId, collectionName)) ?? [];

  const makeEventDocView = (data: Record<string, unknown>) => ({
    data: () => data,
    get: (field: string) => data[field],
  });

  const makeEventsQuery = (
    operationId: string,
    collectionName = 'events',
    direction: 'asc' | 'desc' = 'asc',
    limitCount?: number
  ): MockQueryRef => ({
    __kind: 'query' as const,
    operationId,
    collectionName,
    direction,
    limitCount,
    orderBy(_field: string, nextDirection: 'asc' | 'desc') {
      return makeEventsQuery(operationId, collectionName, nextDirection, limitCount);
    },
    limit(nextLimit: number) {
      return makeEventsQuery(operationId, collectionName, direction, nextLimit);
    },
    async get(): Promise<MockQuerySnapshot> {
      const sorted = [...makeEventDocs(operationId, collectionName)].sort((a, b) => {
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

  const makeEventCollection = (operationId: string, collectionName = 'events') => ({
    __kind: 'collection' as const,
    operationId,
    collectionName,
    doc(explicitId?: string) {
      const id = explicitId ?? `evt-${autoId++}`;
      return {
        __kind: 'event-doc' as const,
        operationId,
        collectionName,
        id,
        async set(payload: Record<string, unknown>) {
          const list = makeEventDocs(operationId, collectionName);
          const existingIndex = list.findIndex(
            (entry) => entry['eventId'] === id || entry['id'] === id
          );
          if (existingIndex >= 0) {
            list.splice(existingIndex, 1, { ...list[existingIndex], ...payload, id });
          } else {
            list.push({ ...payload, id });
          }
          events.set(subcollectionKey(operationId, collectionName), list);
        },
      } satisfies MockEventDocRef;
    },
    async add(payload: Record<string, unknown>) {
      const list = makeEventDocs(operationId, collectionName);
      list.push({ ...payload, id: `evt-${autoId++}` });
      events.set(subcollectionKey(operationId, collectionName), list);
      return { id: `evt-${autoId - 1}` };
    },
    orderBy(_field: string, direction: 'asc' | 'desc') {
      return makeEventsQuery(operationId, collectionName, direction);
    },
  });

  const makeJobDocRef = (
    operationId: string
  ): MockJobDocRef & {
    collection(name: string): ReturnType<typeof makeEventCollection>;
    get(): Promise<MockDocSnapshot>;
    set(payload: Record<string, unknown>, options?: { merge?: boolean }): Promise<void>;
    update(payload: Record<string, unknown>): Promise<void>;
  } => ({
    __kind: 'job-doc' as const,
    operationId,
    collection(name: string) {
      if (name !== 'events' && name !== 'result_chunks') {
        throw new Error(`Unexpected subcollection: ${name}`);
      }
      return makeEventCollection(operationId, name);
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
      const operations: Array<{ ref: MockEventDocRef; payload: Record<string, unknown> }> = [];
      return {
        set(ref: MockEventDocRef, payload: Record<string, unknown>) {
          operations.push({ ref, payload });
        },
        async commit() {
          for (const op of operations) {
            const list = makeEventDocs(op.ref.operationId, op.ref.collectionName);
            list.push({ ...op.payload, id: `evt-${autoId++}` });
            events.set(subcollectionKey(op.ref.operationId, op.ref.collectionName), list);
          }
        },
      };
    },
    async runTransaction<T>(handler: (txn: MockTransaction) => Promise<T>): Promise<T> {
      const run = txChain.then(async () => {
        const txn: MockTransaction = {
          async get(
            target: MockJobDocRef | MockQueryRef
          ): Promise<MockDocSnapshot | MockQuerySnapshot> {
            if (target?.__kind === 'job-doc') {
              return makeDocSnapshot(jobs.get(target.operationId));
            }
            if (target?.__kind === 'query') {
              return target.get();
            }
            throw new Error('Unsupported transaction target');
          },
          set(ref: MockEventDocRef, payload: Record<string, unknown>) {
            if (ref?.__kind !== 'event-doc') throw new Error('Unsupported transaction set target');
            const list = makeEventDocs(ref.operationId, ref.collectionName);
            list.push({ ...payload, id: ref.id });
            events.set(subcollectionKey(ref.operationId, ref.collectionName), list);
          },
          update(ref: MockJobDocRef, payload: Record<string, unknown>) {
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
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    classifyAgentJobAutoResolveTypeMock.mockReturnValue(null);
    shouldAutoRetryAgentJobMock.mockReturnValue(true);
    shouldSendAgentJobCustomerRecoveryEmailMock.mockReturnValue(true);
    isAgentJobCustomerRecoveryEmailEnabledMock.mockReturnValue(false);
    sendAgentJobFailureAlertMock.mockResolvedValue(undefined);
    sendSlackAlertMock.mockResolvedValue(true);
    sendAgentJobRecoveryStartedEmailMock.mockResolvedValue('skipped');

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

  it('stamps active retention TTL on non-terminal event writes', async () => {
    await repository.writeJobEvent('op-seq-1', {
      seq: 0,
      userId: 'user-1',
      type: 'delta',
      text: 'hello',
    });

    const [event] = await repository.getJobEvents('op-seq-1');
    const expiresAt = event?.expiresAt;

    expect(expiresAt).toBeDefined();
    expect(typeof expiresAt?.toMillis).toBe('function');

    const now = Date.now();
    const activeRetentionMs = 14 * 24 * 60 * 60 * 1000;
    const expiresAtMs = expiresAt?.toMillis() ?? 0;

    expect(expiresAtMs).toBeGreaterThan(now + activeRetentionMs - 60_000);
    expect(expiresAtMs).toBeLessThan(now + activeRetentionMs + 60_000);
  });

  it('stamps terminal retention TTL on done events', async () => {
    await repository.writeJobEvent('op-seq-1', {
      seq: 0,
      userId: 'user-1',
      type: 'done',
      success: true,
    });

    const [event] = await repository.getJobEvents('op-seq-1');
    const expiresAt = event?.expiresAt;

    expect(expiresAt).toBeDefined();

    const now = Date.now();
    const terminalRetentionMs = 30 * 24 * 60 * 60 * 1000;
    const expiresAtMs = expiresAt?.toMillis() ?? 0;

    expect(expiresAtMs).toBeGreaterThan(now + terminalRetentionMs - 60_000);
    expect(expiresAtMs).toBeLessThan(now + terminalRetentionMs + 60_000);
  });

  it('extends existing event TTL when a job becomes terminal', async () => {
    await repository.writeJobEvent('op-seq-1', {
      seq: 0,
      userId: 'user-1',
      type: 'delta',
      text: 'stream chunk',
    });

    const [beforeEvent] = await repository.getJobEvents('op-seq-1');
    const beforeExpiresAtMs = beforeEvent?.expiresAt?.toMillis() ?? 0;

    await repository.markCompleted('op-seq-1', {
      summary: 'Done',
      data: { ok: true },
    });

    const [afterEvent] = await repository.getJobEvents('op-seq-1');
    const afterExpiresAtMs = afterEvent?.expiresAt?.toMillis() ?? 0;
    const minimumExtensionMs = 15 * 24 * 60 * 60 * 1000;

    expect(afterExpiresAtMs).toBeGreaterThan(beforeExpiresAtMs + minimumExtensionMs);
  });

  it('persists an explicit success flag for completed results', async () => {
    await repository.markCompleted('op-seq-1', {
      summary: 'Done',
      data: { ok: true },
    });

    const job = await repository.getById('op-seq-1');

    expect(job?.result).toMatchObject({ success: true });
  });

  it('round-trips oversized completion results without losing nested artifact data', async () => {
    const fullResult = {
      summary: 'Full playbook analysis completed.',
      data: {
        document: {
          id: 'offense-playbook',
          artifactNotes: 'play-by-play detail '.repeat(90_000),
          evidenceTrace: Array.from({ length: 250 }, (_, index) => ({
            page: index + 1,
            finding: `Formation and assignment ${index + 1}`,
          })),
        },
        toolCallRecords: Array.from({ length: 100 }, (_, index) => ({
          toolName: 'enrich_document_notes',
          status: 'success',
          output: { page: index + 1, detail: `Page ${index + 1} analyzed` },
        })),
      },
    };

    await repository.markCompleted('op-seq-1', fullResult);

    const parent = firestore.readJob('op-seq-1');
    expect(parent?.['resultStorage']).toBe('subcollection');
    expect(parent?.['resultChunkCount']).toBeGreaterThan(1);
    expect((parent?.['result'] as { data?: unknown }).data).toBeUndefined();

    const job = await repository.getById('op-seq-1');
    expect(job?.result).toEqual({ ...fullResult, success: true });
  });

  it('clears stale failure alert state when a later completion succeeds', async () => {
    firestore.seedJob('op-seq-1', {
      ...firestore.readJob('op-seq-1'),
      failureAlertStatus: 'sent',
      failureAlertError: 'Previous attempt failed',
      failureSlackAlertStatus: 'sent',
      failureSlackAlertError: 'Previous attempt failed',
    });

    await repository.markCompleted('op-seq-1', { summary: 'Recovered successfully.' });

    const parent = firestore.readJob('op-seq-1');
    expect(parent?.['failureAlertStatus']).toBeNull();
    expect(parent?.['failureAlertError']).toBeNull();
    expect(parent?.['failureSlackAlertStatus']).toBeNull();
    expect(parent?.['failureSlackAlertError']).toBeNull();
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
    expect(trackAgentJobTerminalEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'op-seq-1',
        status: 'completed',
        userId: 'user-1',
        origin: 'user',
        intent: 'Test sequencing',
        summary: 'Done',
      })
    );
  });

  it('clears stale error when marking job completed', async () => {
    await repository.markFailed('op-seq-1', 'temporary failure');

    const failedJob = await repository.getById('op-seq-1');
    expect(failedJob?.status).toBe('failed');
    expect(failedJob?.error).toBe('temporary failure');

    await repository.markCompleted('op-seq-1', {
      summary: 'Recovered',
      data: { ok: true },
    });

    const recoveredJob = await repository.getById('op-seq-1');
    expect(recoveredJob?.status).toBe('completed');
    expect(recoveredJob?.error).toBeNull();
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
    expect(trackAgentJobTerminalEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'op-seq-1',
        status: 'failed',
        userId: 'user-1',
        origin: 'user',
        intent: 'Test sequencing',
        error: 'boom',
      })
    );
  });

  it('sends internal email and Slack alerts when marking a job failed outside tests', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await repository.markFailed('op-seq-1', 'boom');

    expect(sendAgentJobFailureAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'op-seq-1',
        userId: 'user-1',
        origin: 'user',
        intent: 'Test sequencing',
        error: 'boom',
      })
    );
    expect(sendSlackAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'agent',
        severity: 'critical',
        title: 'Agent X Job Failed',
        summary: 'An Agent X background job has failed and needs review.',
        fields: expect.arrayContaining([
          { label: 'Operation ID', value: 'op-seq-1' },
          { label: 'User ID', value: 'user-1' },
          { label: 'Origin', value: 'user' },
          { label: 'Error', value: 'boom' },
        ]),
      })
    );

    const job = await repository.getById('op-seq-1');
    expect(job?.failureAlertStatus).toBe('sent');
    expect(job?.failureAlertError).toBeNull();
    expect(job?.failureSlackAlertStatus).toBe('sent');
    expect(job?.failureSlackAlertError).toBeNull();
  });

  it('still sends Slack when the internal failure email fails', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    sendAgentJobFailureAlertMock.mockRejectedValueOnce(new Error('smtp down'));

    await repository.markFailed('op-seq-1', 'boom');

    expect(sendAgentJobFailureAlertMock).toHaveBeenCalledOnce();
    expect(sendSlackAlertMock).toHaveBeenCalledOnce();

    const job = await repository.getById('op-seq-1');
    expect(job?.failureAlertStatus).toBe('failed');
    expect(job?.failureAlertError).toBe('smtp down');
    expect(job?.failureSlackAlertStatus).toBe('sent');
    expect(job?.failureSlackAlertError).toBeNull();
  });

  it('suppresses customer recovery emails for policy-blocked jobs while keeping internal alerts', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    classifyAgentJobAutoResolveTypeMock.mockReturnValue('openrouter_insufficient_credits');
    shouldSendAgentJobCustomerRecoveryEmailMock.mockReturnValue(false);
    isAgentJobCustomerRecoveryEmailEnabledMock.mockReturnValue(true);

    await repository.markFailed('op-seq-1', 'OpenRouter streaming error 402: insufficient credits');

    expect(sendAgentJobFailureAlertMock).toHaveBeenCalledOnce();
    expect(sendSlackAlertMock).toHaveBeenCalledOnce();
    expect(sendAgentJobRecoveryStartedEmailMock).not.toHaveBeenCalled();

    const job = await repository.getById('op-seq-1');
    expect(job?.autoRecoveryStartedEmailStatus).toBe('skipped');
    expect(job?.autoRecoveryStartedEmailError).toBe('suppressed_by_policy');
  });

  it('does not send customer recovery emails when auto-retry is disabled for the failure type', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    classifyAgentJobAutoResolveTypeMock.mockReturnValue('openrouter_insufficient_credits');
    shouldAutoRetryAgentJobMock.mockReturnValue(false);
    isAgentJobCustomerRecoveryEmailEnabledMock.mockReturnValue(true);

    await repository.markFailed('op-seq-1', 'OpenRouter streaming error 402: insufficient credits');

    expect(sendAgentJobFailureAlertMock).toHaveBeenCalledOnce();
    expect(sendSlackAlertMock).toHaveBeenCalledOnce();
    expect(sendAgentJobRecoveryStartedEmailMock).not.toHaveBeenCalled();

    const job = await repository.getById('op-seq-1');
    expect(job?.autoRecoveryStartedEmailStatus).toBeUndefined();
  });

  it('does not overwrite a completed job when markFailed arrives late', async () => {
    await repository.markCompleted('op-seq-1', {
      summary: 'Done',
      data: { ok: true },
    });

    await repository.markFailed('op-seq-1', 'late failure write');

    const job = await repository.getById('op-seq-1');
    expect(job?.status).toBe('completed');
    expect(job?.error).toBeNull();
    expect(sendAgentJobFailureAlertMock).not.toHaveBeenCalled();
    expect(sendSlackAlertMock).not.toHaveBeenCalled();
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
