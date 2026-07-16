import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockUserDoc = {
  readonly email?: string;
  readonly preferences?: {
    readonly notifications?: {
      readonly email?: boolean;
    };
  };
  readonly recaps?: ReadonlyArray<{
    readonly recapNumber?: number;
  }>;
};

type MockAgentJobDoc = {
  readonly userId?: string;
  readonly origin?: string;
};

const weeklyRecapMocks = vi.hoisted(() => {
  const enqueue = vi.fn();
  const userDocRequests: string[] = [];
  const usersCollectionSelect = vi.fn();
  const agentJobsWhere = vi.fn();
  const agentJobsSelect = vi.fn();
  const dispatchCreate = vi.fn();
  const dispatchSet = vi.fn();
  const dispatchDelete = vi.fn();
  const Timestamp = { fromDate: vi.fn((value: Date) => value) };
  const FieldValue = { serverTimestamp: vi.fn(() => 'server-timestamp') };

  let usersById: Record<string, MockUserDoc> = {};
  let agentJobs: MockAgentJobDoc[] = [];

  return {
    enqueue,
    userDocRequests,
    usersCollectionSelect,
    agentJobsWhere,
    agentJobsSelect,
    dispatchCreate,
    dispatchSet,
    dispatchDelete,
    Timestamp,
    FieldValue,
    setFixture(input: {
      readonly usersById: Record<string, MockUserDoc>;
      readonly agentJobs: MockAgentJobDoc[];
    }) {
      usersById = input.usersById;
      agentJobs = input.agentJobs;
    },
    getFirestore() {
      return {
        collection(name: string) {
          if (name === 'AgentJobs') {
            return {
              where: weeklyRecapMocks.agentJobsWhere.mockImplementation(
                (_field: string, _operator: string, _value: unknown) => {
                  return {
                    select: weeklyRecapMocks.agentJobsSelect.mockImplementation(
                      (..._fields: string[]) => ({
                        get: async () => ({
                          docs: agentJobs.map((job) => ({
                            data: () => job,
                          })),
                        }),
                      })
                    ),
                  };
                }
              ),
            };
          }

          if (name === 'Users') {
            return {
              select: weeklyRecapMocks.usersCollectionSelect,
              doc(userId: string) {
                weeklyRecapMocks.userDocRequests.push(userId);
                return {
                  collection(collectionName: string) {
                    if (collectionName !== 'agent_weekly_recaps') {
                      throw new Error(`Unexpected user subcollection: ${collectionName}`);
                    }

                    return {
                      orderBy(_field: string, _direction: string) {
                        return {
                          limit(limitCount: number) {
                            return {
                              get: async () => {
                                const user = usersById[userId];
                                const docs = [...(user?.recaps ?? [])]
                                  .sort(
                                    (left, right) =>
                                      Number(right.recapNumber ?? 0) - Number(left.recapNumber ?? 0)
                                  )
                                  .slice(0, limitCount)
                                  .map((recap) => ({
                                    data: () => recap,
                                  }));

                                return {
                                  empty: docs.length === 0,
                                  docs,
                                };
                              },
                            };
                          },
                        };
                      },
                    };
                  },
                  get: async () => {
                    const user = usersById[userId];
                    if (!user) {
                      return {
                        id: userId,
                        exists: false,
                        data: () => undefined,
                      };
                    }

                    return {
                      id: userId,
                      exists: true,
                      data: () => user,
                    };
                  },
                };
              },
            };
          }

          if (name === 'AgentWeeklyRecapDispatches') {
            return {
              doc() {
                return {
                  create: weeklyRecapMocks.dispatchCreate,
                  set: weeklyRecapMocks.dispatchSet,
                  delete: weeklyRecapMocks.dispatchDelete,
                };
              },
            };
          }

          throw new Error(`Unexpected collection: ${name}`);
        },
      };
    },
  };
});

vi.mock('@nxt1/core', () => ({
  AGENT_TRIGGER_RULES: [{ type: 'weekly_recap', intentTemplate: 'Weekly recap intent' }],
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => weeklyRecapMocks.getFirestore(),
  Timestamp: weeklyRecapMocks.Timestamp,
  FieldValue: weeklyRecapMocks.FieldValue,
}));

vi.mock('../trigger.service.js', () => ({
  AgentTriggerService: class AgentTriggerService {},
}));

vi.mock('../../services/generation.service.js', () => ({
  AgentGenerationService: class AgentGenerationService {},
}));

vi.mock('../../llm/openrouter.service.js', () => ({
  OpenRouterService: class OpenRouterService {},
}));

vi.mock('../../memory/context-builder.js', () => ({
  ContextBuilder: class ContextBuilder {},
}));

vi.mock('../../memory/sync-memory-extractor.service.js', () => ({
  SyncMemoryExtractorService: class SyncMemoryExtractorService {},
}));

vi.mock('../../memory/vector.service.js', () => ({
  VectorMemoryService: class VectorMemoryService {},
}));

vi.mock('../../queue/queue.service.js', () => ({
  AgentQueueService: class AgentQueueService {
    enqueue = weeklyRecapMocks.enqueue;
  },
}));

vi.mock('../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../services/core/sync-delta-event.service.js', () => ({
  getSyncDeltaEventService: vi.fn(),
}));

vi.mock('../../../../utils/firebase.js', () => ({
  db: {},
}));

const { runWeeklyRecaps } = await import('../trigger.listeners.js');

describe('runWeeklyRecaps smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    weeklyRecapMocks.userDocRequests.length = 0;
    weeklyRecapMocks.usersCollectionSelect.mockImplementation(() => {
      throw new Error('runWeeklyRecaps should not scan the full Users collection');
    });
    weeklyRecapMocks.dispatchCreate.mockResolvedValue(undefined);
    weeklyRecapMocks.dispatchSet.mockResolvedValue(undefined);
    weeklyRecapMocks.dispatchDelete.mockResolvedValue(undefined);
    weeklyRecapMocks.enqueue.mockResolvedValue('queued');
    weeklyRecapMocks.setFixture({
      usersById: {
        'active-eligible': {
          email: 'active@example.com',
          preferences: { notifications: { email: true } },
          recaps: [{ recapNumber: 2 }],
        },
        'active-opt-out': {
          email: 'optout@example.com',
          preferences: { notifications: { email: false } },
          recaps: [{ recapNumber: 7 }],
        },
        'inactive-user': {
          email: 'inactive@example.com',
          preferences: { notifications: { email: true } },
        },
      },
      agentJobs: [
        { userId: 'active-eligible', origin: 'user' },
        { userId: 'active-opt-out', origin: 'user' },
        { userId: 'cron-user', origin: 'system_cron' },
      ],
    });
  });

  it('enqueues only recently active user-origin recipients instead of all users', async () => {
    const result = await runWeeklyRecaps();

    expect(weeklyRecapMocks.Timestamp.fromDate).toHaveBeenCalledTimes(1);
    expect(weeklyRecapMocks.agentJobsWhere).toHaveBeenCalledWith(
      'createdAt',
      '>=',
      expect.any(Date)
    );
    expect(weeklyRecapMocks.agentJobsSelect).toHaveBeenCalledWith('userId', 'origin');

    expect(weeklyRecapMocks.userDocRequests).toEqual([
      'active-eligible',
      'active-opt-out',
      'active-eligible',
    ]);
    expect(weeklyRecapMocks.userDocRequests).not.toContain('inactive-user');
    expect(weeklyRecapMocks.usersCollectionSelect).not.toHaveBeenCalled();

    expect(weeklyRecapMocks.enqueue).toHaveBeenCalledTimes(1);
    expect(weeklyRecapMocks.dispatchCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'active-eligible',
        recapNumber: 3,
        recapWeekLabel: 'Week 3',
      })
    );
    expect(weeklyRecapMocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'active-eligible',
        origin: 'system_cron',
        displayIntent: 'Generate Week 3 recap for this user.',
        sessionId: expect.stringContaining('trigger_weekly_recap_'),
        triggerEvent: expect.objectContaining({
          eventData: expect.objectContaining({
            recapNumber: 3,
            recapWeekLabel: 'Week 3',
          }),
        }),
        context: expect.objectContaining({
          recapNumber: 3,
          recapWeekLabel: 'Week 3',
        }),
      }),
      'production'
    );

    expect(result).toMatchObject({
      totalUsers: 2,
      eligible: 1,
      enqueued: 1,
      skippedAlreadyDispatched: 0,
      skippedEmailOptOut: 1,
      failed: 0,
    });
  });
});
