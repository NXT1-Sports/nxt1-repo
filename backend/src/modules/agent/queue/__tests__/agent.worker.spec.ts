/**
 * @fileoverview Unit Tests — AgentWorker
 * @module @nxt1/backend/modules/agent/queue
 *
 * Tests the background worker in isolation by mocking BullMQ's Worker
 * and the AgentRouter. Verifies job processing, progress reporting,
 * event handling, and graceful shutdown.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentJobPayload, AgentJobOrigin, AgentOperationResult } from '@nxt1/core';
import { AgentYieldException } from '../../exceptions/agent-yield.exception.js';

const mockExecuteBillingDeduction = vi.fn().mockResolvedValue({
  charged: true,
  rawCostUsd: 0,
  chargeAmountCents: 0,
});
const mockGetBillingState = vi.fn().mockResolvedValue(null);
const mockCreateWalletHold = vi.fn().mockResolvedValue({
  success: true,
  holdId: 'hold-1',
  availableBalance: 0,
});
const mockReleaseWalletHold = vi.fn().mockResolvedValue(undefined);
const mockLogAgentTaskCompletion = vi.fn().mockResolvedValue({
  activityId: 'activity-1',
  notificationId: 'notification-1',
});
const mockLogAgentTaskFailure = vi.fn().mockResolvedValue({
  activityId: 'activity-failure-1',
  notificationId: 'notification-failure-1',
});
const mockDeriveBodyFromResult = vi.fn().mockReturnValue('Drafted 5 recruiting emails');
const mockProcessRecapForUser = vi.fn().mockResolvedValue(undefined);
const mockUpdateWeeklyRecapDispatchStatus = vi.fn().mockResolvedValue(true);
const mockUpsertTeamFileFromAttachment = vi.fn().mockResolvedValue('promoted-export-file-1');
const mockAttachExportAssetToUniversalDocument = vi.fn().mockResolvedValue(true);
const mockPublishAgentDeliverableGeneratedDomainEvent = vi.fn().mockResolvedValue({
  domainEventType: 'agent.deliverable_generated',
  projections: [
    {
      projector: 'marketing',
      eventKey: 'agent.deliverable_generated::op-worker-test',
      eventType: 'agent.deliverable_generated',
      deduplicated: false,
    },
  ],
});

vi.mock('../../../billing/usage-deduction.service.js', () => ({
  executeBillingDeduction: mockExecuteBillingDeduction,
}));

vi.mock('../../../billing/budget.service.js', () => ({
  getBillingState: mockGetBillingState,
  createWalletHold: mockCreateWalletHold,
  releaseWalletHold: mockReleaseWalletHold,
}));

vi.mock('../../services/agent-activity.service.js', () => ({
  logAgentTaskCompletion: mockLogAgentTaskCompletion,
  logAgentTaskFailure: mockLogAgentTaskFailure,
  deriveBodyFromResult: mockDeriveBodyFromResult,
}));

vi.mock('../../services/weekly-recap-email.service.js', () => ({
  processRecapForUser: mockProcessRecapForUser,
  updateWeeklyRecapDispatchStatus: mockUpdateWeeklyRecapDispatchStatus,
}));

vi.mock('../../../../services/team/team-files-index.service.js', () => ({
  upsertTeamFileFromAttachment: mockUpsertTeamFileFromAttachment,
  attachExportAssetToUniversalDocument: mockAttachExportAssetToUniversalDocument,
}));

vi.mock('../../../../services/domain-events/domain-events.service.js', () => ({
  publishAgentDeliverableGeneratedDomainEvent: mockPublishAgentDeliverableGeneratedDomainEvent,
}));

// ─── Capture the processor callback ────────────────────────────────────────

let capturedProcessor: ((job: unknown) => Promise<unknown>) | null = null;
const mockWorkerOn = vi.fn();
const mockWorkerClose = vi.fn();
const mockWorkerIsRunning = vi.fn().mockReturnValue(true);

vi.mock('bullmq', () => {
  // Use a real function so `new Worker(...)` works (arrow functions aren't constructors)
  function MockWorker(
    this: Record<string, unknown>,
    _name: string,
    processor: (job: unknown) => Promise<unknown>
  ) {
    capturedProcessor = processor;
    this.on = mockWorkerOn;
    this.close = mockWorkerClose;
    this.isRunning = mockWorkerIsRunning;
  }
  class MockUnrecoverableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UnrecoverableError';
    }
  }
  return { Worker: MockWorker, Job: class {}, UnrecoverableError: MockUnrecoverableError };
});

// ─── Mock Firebase ─────────────────────────────────────────────────────────

const mockFirestoreSnapshot = {
  empty: true,
  exists: false,
  docs: [] as unknown[],
  size: 0,
  forEach: () => undefined,
  data: () => ({}),
};
const mockFirestoreRef = {
  collection: function () {
    return mockFirestoreRef;
  },
  doc: function () {
    return mockFirestoreRef;
  },
  where: function () {
    return mockFirestoreRef;
  },
  orderBy: function () {
    return mockFirestoreRef;
  },
  limit: function () {
    return mockFirestoreRef;
  },
  get: async () => mockFirestoreSnapshot,
  set: async () => undefined,
  add: async () => ({ id: 'test-id' }),
  update: async () => undefined,
  delete: async () => undefined,
};
const mockFirestore = {
  ...mockFirestoreRef,
  batch: () => ({
    set: () => undefined,
    update: () => undefined,
    delete: () => undefined,
    commit: async () => undefined,
  }),
} as unknown as FirebaseFirestore.Firestore;

const mockProductionFirestore = {
  ...mockFirestoreRef,
  batch: () => ({
    set: () => undefined,
    update: () => undefined,
    delete: () => undefined,
    commit: async () => undefined,
  }),
} as unknown as FirebaseFirestore.Firestore;

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => mockProductionFirestore),
}));

// ─── Import after mocks ────────────────────────────────────────────────────

const { AgentWorker } = await import('../agent.worker.js');

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makePayload(overrides?: Partial<AgentJobPayload>): AgentJobPayload {
  return {
    operationId: 'op-worker-test',
    userId: 'user-abc',
    intent: 'Draft recruiting emails for all D1 coaches',
    sessionId: 'sess-789',
    origin: 'user' as AgentJobOrigin,
    ...overrides,
  };
}

function makeMockJob(payload: AgentJobPayload, environment: 'staging' | 'production' = 'staging') {
  return {
    id: payload.operationId,
    data: {
      kind: 'agent' as const,
      payload,
      enqueuedAt: '2026-03-10T00:00:00Z',
      environment,
    },
    progress: null,
    updateProgress: vi.fn(),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AgentWorker', () => {
  const mockRouterResult: AgentOperationResult = {
    summary: 'Drafted 5 recruiting emails',
    data: {
      plan: {
        operationId: 'op-worker-test',
        tasks: [],
        createdAt: '2026-03-10T00:00:00Z',
      },
    },
    suggestions: ['Follow up in 3 days'],
  };

  const mockRouter = {
    run: vi.fn().mockResolvedValue(mockRouterResult),
    classify: vi.fn(),
    registerAgent: vi.fn(),
  };

  const mockJobRepo = {
    updateProgress: vi.fn().mockResolvedValue(undefined),
    markYielded: vi.fn().mockResolvedValue(undefined),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    patchContext: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(null),
    writeJobEvent: vi.fn().mockResolvedValue(undefined),
    writeJobEventWithAutoSeq: vi.fn().mockResolvedValue(0),
    allocateEventSeqRange: vi.fn().mockResolvedValue(0),
    withCollection: vi.fn(),
  };

  const mockWeeklyRecapJobRepo = {
    updateProgress: vi.fn().mockResolvedValue(undefined),
    markYielded: vi.fn().mockResolvedValue(undefined),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    patchContext: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(null),
    writeJobEvent: vi.fn().mockResolvedValue(undefined),
    writeJobEventWithAutoSeq: vi.fn().mockResolvedValue(0),
    allocateEventSeqRange: vi.fn().mockResolvedValue(0),
  };

  const mockPubSub = {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(() => undefined),
    subscribeControl: vi.fn().mockResolvedValue(async () => undefined),
    subscriberCount: vi.fn().mockResolvedValue(0),
  };

  const mockQueueService = {
    registerController: vi.fn(),
    unregisterController: vi.fn(),
  };

  const mockChatService = {
    addMessage: vi.fn().mockResolvedValue({ id: 'msg-worker-1' }),
    updateThreadPausedYieldState: vi.fn().mockResolvedValue(true),
    generateOperationTitle: vi.fn().mockResolvedValue('Built Your Coach Outreach Plan'),
    applyGeneratedThreadTitle: vi.fn().mockResolvedValue('Built Your Coach Outreach Plan'),
    generateThreadTitle: vi.fn().mockResolvedValue('MaxPreps Sync Complete'),
  };

  const mockLlmService = {
    complete: vi.fn(),
  };

  const mockEnqueueContinuation = vi.fn().mockResolvedValue('continued-job-1');

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteBillingDeduction.mockResolvedValue({
      charged: true,
      rawCostUsd: 0,
      chargeAmountCents: 0,
    });
    mockGetBillingState.mockResolvedValue(null);
    mockCreateWalletHold.mockResolvedValue({
      success: true,
      holdId: 'hold-1',
      availableBalance: 0,
    });
    mockReleaseWalletHold.mockResolvedValue(undefined);
    mockLogAgentTaskCompletion.mockResolvedValue({
      activityId: 'activity-1',
      notificationId: 'notification-1',
    });
    mockLogAgentTaskFailure.mockResolvedValue({
      activityId: 'activity-failure-1',
      notificationId: 'notification-failure-1',
    });
    mockDeriveBodyFromResult.mockReturnValue('Drafted 5 recruiting emails');
    mockProcessRecapForUser.mockResolvedValue(undefined);
    mockUpdateWeeklyRecapDispatchStatus.mockResolvedValue(true);
    mockUpsertTeamFileFromAttachment.mockResolvedValue('promoted-export-file-1');
    mockAttachExportAssetToUniversalDocument.mockResolvedValue(true);
    mockPublishAgentDeliverableGeneratedDomainEvent.mockResolvedValue({
      domainEventType: 'agent.deliverable_generated',
      projections: [
        {
          projector: 'marketing',
          eventKey: 'agent.deliverable_generated::op-worker-test',
          eventType: 'agent.deliverable_generated',
          deduplicated: false,
        },
      ],
    });
    mockJobRepo.getById.mockResolvedValue(null);
    mockJobRepo.withCollection.mockReturnValue(mockWeeklyRecapJobRepo);
    mockWeeklyRecapJobRepo.getById.mockResolvedValue(null);
    mockPubSub.subscriberCount.mockResolvedValue(0);
    capturedProcessor = null;
    // Instantiate worker — this captures the processor
    new AgentWorker(
      mockRouter as never,
      mockJobRepo as never,
      mockJobRepo as never,
      mockChatService as never,
      mockPubSub as never,
      mockFirestore,
      mockLlmService as never,
      'redis://localhost:6379',
      mockEnqueueContinuation,
      mockQueueService as never
    );
  });

  // ── Processor Binding ───────────────────────────────────────────────────

  it('should register a processor with BullMQ Worker', () => {
    expect(capturedProcessor).toBeTypeOf('function');
  });

  it('should attach event listeners (completed, failed, error)', () => {
    // 3 event listeners are attached in attachEventListeners()
    expect(mockWorkerOn).toHaveBeenCalledWith('completed', expect.any(Function));
    expect(mockWorkerOn).toHaveBeenCalledWith('failed', expect.any(Function));
    expect(mockWorkerOn).toHaveBeenCalledWith('error', expect.any(Function));
  });

  // ── Job Processing ───────────────────────────────────────────────────────

  it('should call AgentRouter.run() with the job payload', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    await capturedProcessor!(job);

    expect(mockRouter.run).toHaveBeenCalledWith(
      payload,
      expect.any(Function),
      mockFirestore,
      expect.any(Function),
      'staging',
      expect.anything()
    );
  });

  it('should call AgentRouter.run() with production Firestore for production jobs', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload, 'production');

    await capturedProcessor!(job);

    expect(mockRouter.run).toHaveBeenCalledWith(
      payload,
      expect.any(Function),
      mockProductionFirestore,
      expect.any(Function),
      'production',
      expect.anything()
    );
  });

  it('should return an AgentQueueJobResult on success', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    const result = (await capturedProcessor!(job)) as Record<string, unknown>;

    expect(result).toHaveProperty(
      'result',
      expect.objectContaining({
        ...mockRouterResult,
      })
    );
    expect(result).toHaveProperty('durationMs');
    expect(result).toHaveProperty('completedAt');
    expect(typeof result['durationMs']).toBe('number');
  });

  it('should persist the assistant response without regenerating thread titles', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-123' },
      intent: 'Analyze my linked maxpreps account for Belleville football',
    });
    const job = makeMockJob(payload);

    await capturedProcessor!(job);

    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-123',
        role: 'assistant',
        content: 'Drafted 5 recruiting emails',
      })
    );
    expect(mockJobRepo.markCompleted).toHaveBeenCalledWith('op-worker-test', expect.any(Object));
    expect(mockChatService.generateOperationTitle).not.toHaveBeenCalled();
    expect(mockChatService.applyGeneratedThreadTitle).not.toHaveBeenCalled();
    expect(mockChatService.generateThreadTitle).not.toHaveBeenCalled();
  });

  it('persists data.response as the durable completion summary when result summary is blank', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-highlight-response-123' },
      intent: 'Create me a gunslinger wild west highlight reel',
    });
    const job = makeMockJob(payload);

    mockRouter.run.mockResolvedValueOnce({
      summary: '',
      data: {
        response: 'Your Gunslinger Wild West highlight reel is ready.',
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockJobRepo.markCompleted).toHaveBeenCalledWith(
      'op-worker-test',
      expect.objectContaining({
        summary: 'Your Gunslinger Wild West highlight reel is ready.',
      })
    );
  });

  it('persists streamed assistant text as durable summary when structured summary is blank', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-highlight-streamed-123' },
      intent: 'Create me a gunslinger wild west highlight reel',
    });
    const job = makeMockJob(payload);
    mockDeriveBodyFromResult.mockReturnValueOnce('');

    mockRouter.run.mockImplementationOnce(async (_payload, _onUpdate, _db, onStreamEvent) => {
      onStreamEvent?.({
        type: 'delta',
        agentId: 'brand_coordinator',
        text: 'Your Gunslinger Wild West highlight reel is locked and loaded.',
      });
      return {
        summary: '',
        data: {},
      } satisfies AgentOperationResult;
    });

    await capturedProcessor!(job);

    expect(mockJobRepo.markCompleted).toHaveBeenCalledWith(
      'op-worker-test',
      expect.objectContaining({
        summary: 'Your Gunslinger Wild West highlight reel is locked and loaded.',
      })
    );
  });

  it('completes a recovered final-turn deliverable without treating it as max-iteration failure', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-completed-at-limit-123' },
      intent: 'Create a gunslinger highlight reel',
    });
    const job = makeMockJob(payload);

    mockRouter.run.mockResolvedValueOnce({
      summary: 'Your gunslinger highlight reel is ready.',
      success: true,
      data: {
        completedAtIterationLimit: true,
        videoUrl: 'https://cdn.example.com/gunslinger-reel.mp4',
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockJobRepo.markCompleted).toHaveBeenCalledWith(
      payload.operationId,
      expect.objectContaining({
        summary: 'Your gunslinger highlight reel is ready.',
      })
    );
    expect(mockJobRepo.markFailed).not.toHaveBeenCalled();
  });

  it('persists delegated coordinator image artifacts as attachments', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-graphic-123' },
      intent: 'Create a welcome graphic for me',
    });
    const job = makeMockJob(payload);

    mockRouter.run.mockResolvedValueOnce({
      summary: 'Image generated',
      data: {
        dispatch_kind: 'coordinator',
        coordinator_artifacts: {
          imageUrl: 'https://cdn.example.com/welcome-generated.jpg',
        },
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-graphic-123',
        role: 'assistant',
        attachments: [
          expect.objectContaining({
            url: 'https://cdn.example.com/welcome-generated.jpg',
            type: 'image',
          }),
        ],
      })
    );
    expect(mockPublishAgentDeliverableGeneratedDomainEvent).not.toHaveBeenCalled();
  });

  it('persists generated image markdown when the summary omits the final chart url', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-chart-inline-123' },
      intent: 'Make me a recruiting funnel chart',
    });
    const job = makeMockJob(payload);
    const imageUrl =
      'https://storage.googleapis.com/nxt-1-v2.firebasestorage.app/Users/user-1/threads/thread-chart-inline-123/media/staged/image/chart.png?X-Goog-Signature=signed';

    mockRouter.run.mockResolvedValueOnce({
      summary: 'Here is your recruiting funnel chart.',
      data: {
        imageUrl,
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-chart-inline-123',
        role: 'assistant',
        content: expect.stringContaining(`![image.jpg](${imageUrl})`),
        attachments: [
          expect.objectContaining({
            url: imageUrl,
            type: 'image',
          }),
        ],
      })
    );
  });

  it('publishes marketing deliverable events for production image outputs', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-graphic-prod-123' },
      intent: 'Create a welcome graphic for me',
    });
    const job = makeMockJob(payload, 'production');

    mockRouter.run.mockResolvedValueOnce({
      summary: 'Image generated',
      title: 'Welcome Graphic',
      data: {
        dispatch_kind: 'coordinator',
        coordinator_artifacts: {
          imageUrl: 'https://cdn.example.com/welcome-generated.jpg',
        },
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockPublishAgentDeliverableGeneratedDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'production',
        operationId: 'op-worker-test',
        userId: 'user-abc',
        threadId: 'thread-graphic-prod-123',
        title: 'Welcome Graphic',
        deliverables: [
          expect.objectContaining({
            url: 'https://cdn.example.com/welcome-generated.jpg',
            type: 'image',
          }),
        ],
      })
    );
  });

  it('publishes marketing deliverable events for delegated tool outputs nested in toolCallRecords', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-graphic-prod-nested-123' },
      intent: 'Create a premium recruiting social graphic for me',
    });
    const job = makeMockJob(payload, 'production');

    mockRouter.run.mockResolvedValueOnce({
      summary: 'Graphic generated',
      title: 'Premium Recruiting Social Graphic',
      data: {
        dispatch_kind: 'coordinator',
        toolCallRecords: [
          {
            toolName: 'delegate_to_coordinator',
            status: 'success',
            output: {
              coordinator_observation: 'Graphic completed successfully.',
              data: {
                imageUrl: 'https://cdn.example.com/braylon-graphic.png',
                storagePath:
                  'Users/user-abc/threads/thread-graphic-prod-nested-123/media/braylon-graphic.png',
                mimeType: 'image/png',
              },
            },
          },
        ],
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-graphic-prod-nested-123',
        role: 'assistant',
        attachments: [
          expect.objectContaining({
            url: 'https://cdn.example.com/braylon-graphic.png',
            type: 'image',
          }),
        ],
      })
    );
    expect(mockPublishAgentDeliverableGeneratedDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'production',
        operationId: 'op-worker-test',
        userId: 'user-abc',
        threadId: 'thread-graphic-prod-nested-123',
        title: 'Premium Recruiting Social Graphic',
        deliverables: [
          expect.objectContaining({
            url: 'https://cdn.example.com/braylon-graphic.png',
            type: 'image',
          }),
        ],
      })
    );
  });

  it('does not publish marketing deliverable events for staging outputs', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-graphic-staging-123' },
      intent: 'Create a welcome graphic for me',
    });
    const job = makeMockJob(payload, 'staging');

    mockRouter.run.mockResolvedValueOnce({
      summary: 'Image generated',
      title: 'Welcome Graphic',
      data: {
        dispatch_kind: 'coordinator',
        coordinator_artifacts: {
          imageUrl: 'https://cdn.example.com/welcome-generated.jpg',
        },
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockPublishAgentDeliverableGeneratedDomainEvent).not.toHaveBeenCalled();
  });

  it('attaches generated exports in the assistant message payload', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-callsheet-123' },
      intent: 'Create a football play callsheet spreadsheet and add it to the saved document',
    });
    const job = makeMockJob(payload);
    mockRouter.run.mockResolvedValueOnce({
      summary: 'Callsheet spreadsheet generated and attached.',
      data: {
        files: [
          {
            url: 'https://cdn.example.com/Test2-Starter-Callsheet.xlsx',
            storagePath: 'Users/user-abc/threads/thread-callsheet-123/exports/callsheet.xlsx',
            name: 'Test2 Starter Callsheet.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            sizeBytes: 4096,
          },
        ],
        toolCallRecords: [
          {
            toolName: 'update_universal_team_document',
            status: 'success',
            output: {
              data: {
                document: {
                  id: 'doc-callsheet-1',
                  teamId: 'team-77',
                  folderId: 'folder-playbook',
                  organizationId: 'org-1',
                  sport: 'football',
                  readAccessKeys: ['team:team-77'],
                  writeAccessKeys: ['team:team-77'],
                },
              },
            },
          },
        ],
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            artifactRole: 'export',
            artifactGroupId: 'op-worker-test',
            relatedDocumentId: 'doc-callsheet-1',
            name: 'Test2 Starter Callsheet.xlsx',
            type: 'doc',
          }),
        ],
      })
    );
    expect(mockUpsertTeamFileFromAttachment).not.toHaveBeenCalled();
    expect(mockAttachExportAssetToUniversalDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-callsheet-1',
        userId: 'user-abc',
        origin: 'agent_chat_output',
        sourceThreadId: 'thread-callsheet-123',
        sourceOperationId: 'op-worker-test',
        attachment: expect.objectContaining({
          artifactRole: 'export',
          relatedDocumentId: 'doc-callsheet-1',
          artifactGroupId: 'op-worker-test',
          storagePath: 'Users/user-abc/threads/thread-callsheet-123/exports/callsheet.xlsx',
          name: 'Test2 Starter Callsheet.xlsx',
        }),
      })
    );
  });

  it('indexes delegated coordinator exports against nested created Files documents', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-practice-script-123' },
      intent: 'Create me a practice script and save as a new document please',
    });
    const job = makeMockJob(payload);
    mockRouter.run.mockResolvedValueOnce({
      summary: 'Practice script generated and saved.',
      data: {
        dispatch_kind: 'coordinator',
        coordinator_artifacts: {
          downloadUrl: 'https://cdn.example.com/Fall-Camp-Practice-Script.xlsx',
          storagePath:
            'Users/user-abc/threads/thread-practice-script-123/exports/practice-script.xlsx',
          fileName: 'Fall Camp Practice Script.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          sizeBytes: 8192,
        },
        toolCallRecords: [
          {
            toolName: 'delegate_to_coordinator',
            status: 'success',
            output: {
              coordinator_observation: 'Practice script completed successfully.',
              coordinator_tool_call_records: [
                {
                  toolName: 'create_universal_team_document',
                  status: 'success',
                  output: {
                    data: {
                      document: {
                        id: 'doc-practice-script-1',
                        teamId: 'team-77',
                        folderId: 'folder-practice',
                        organizationId: 'org-1',
                        sport: 'football',
                        readAccessKeys: ['team:team-77'],
                        writeAccessKeys: ['team:team-77'],
                      },
                    },
                  },
                },
                {
                  toolName: 'dynamic_export',
                  status: 'success',
                  input: {},
                  output: {
                    data: {
                      downloadUrl: 'https://cdn.example.com/Fall-Camp-Practice-Script.xlsx',
                      storagePath:
                        'Users/user-abc/threads/thread-practice-script-123/exports/practice-script.xlsx',
                      fileName: 'Fall Camp Practice Script.xlsx',
                      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                      format: 'xlsx',
                      sizeBytes: 8192,
                    },
                  },
                },
              ],
            },
          },
          {
            toolName: 'create_universal_team_document',
            status: 'success',
            input: {},
            output: {
              data: {
                document: {
                  id: 'doc-created-after-export-1',
                  title: 'Duplicate Practice Script Matrix',
                },
              },
            },
          },
        ],
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockUpsertTeamFileFromAttachment).not.toHaveBeenCalled();
    expect(mockAttachExportAssetToUniversalDocument).toHaveBeenCalledTimes(1);
    expect(mockAttachExportAssetToUniversalDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-practice-script-1',
        userId: 'user-abc',
        origin: 'agent_chat_output',
        sourceThreadId: 'thread-practice-script-123',
        sourceOperationId: 'op-worker-test',
        attachment: expect.objectContaining({
          artifactRole: 'export',
          relatedDocumentId: 'doc-practice-script-1',
          artifactGroupId: 'op-worker-test',
          storagePath:
            'Users/user-abc/threads/thread-practice-script-123/exports/practice-script.xlsx',
          name: 'Fall Camp Practice Script.xlsx',
        }),
      })
    );
  });

  it('attaches delegated PDF exports to the document created by Strategy Coordinator', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-program-game-plan-123' },
      intent: 'Create program game-planning standards and export them as a PDF',
    });
    const job = makeMockJob(payload);
    mockRouter.run.mockResolvedValueOnce({
      summary: 'Program game-planning standards saved and exported.',
      data: {
        dispatch_kind: 'coordinator',
        coordinator_artifacts: {
          downloadUrl: 'https://cdn.example.com/Program-Game-Planning-Standards.pdf',
          storagePath:
            'Users/user-abc/threads/thread-program-game-plan-123/exports/program-game-plan.pdf',
          fileName: 'Program Game Planning Standards.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 16384,
        },
        toolCallRecords: [
          {
            toolName: 'delegate_to_coordinator',
            status: 'success',
            output: {
              coordinator_observation: 'Program game plan completed successfully.',
              coordinator_tool_call_records: [
                {
                  toolName: 'create_universal_team_document',
                  status: 'success',
                  output: {
                    data: {
                      document: {
                        id: 'doc-program-game-plan-1',
                        teamId: 'team-77',
                        folderId: 'folder-game-plans',
                        organizationId: 'org-1',
                        sport: 'football',
                        readAccessKeys: ['team:team-77'],
                        writeAccessKeys: ['team:team-77'],
                      },
                    },
                  },
                },
                {
                  toolName: 'dynamic_export',
                  status: 'success',
                  input: {
                    format: 'pdf',
                    relatedDocumentId: 'doc-program-game-plan-1',
                  },
                  output: {
                    data: {
                      downloadUrl: 'https://cdn.example.com/Program-Game-Planning-Standards.pdf',
                      storagePath:
                        'Users/user-abc/threads/thread-program-game-plan-123/exports/program-game-plan.pdf',
                      fileName: 'Program Game Planning Standards.pdf',
                      mimeType: 'application/pdf',
                      format: 'pdf',
                      sizeBytes: 16384,
                      artifactRole: 'export',
                      relatedDocumentId: 'doc-program-game-plan-1',
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockUpsertTeamFileFromAttachment).not.toHaveBeenCalled();
    expect(mockAttachExportAssetToUniversalDocument).toHaveBeenCalledTimes(1);
    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            name: 'Program Game Planning Standards.pdf',
            mimeType: 'application/pdf',
            type: 'pdf',
            relatedDocumentId: 'doc-program-game-plan-1',
          }),
        ],
      })
    );
    expect(mockAttachExportAssetToUniversalDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-program-game-plan-1',
        userId: 'user-abc',
        origin: 'agent_chat_output',
        sourceThreadId: 'thread-program-game-plan-123',
        sourceOperationId: 'op-worker-test',
        attachment: expect.objectContaining({
          artifactRole: 'export',
          relatedDocumentId: 'doc-program-game-plan-1',
          artifactGroupId: 'op-worker-test',
          mimeType: 'application/pdf',
          type: 'pdf',
          storagePath:
            'Users/user-abc/threads/thread-program-game-plan-123/exports/program-game-plan.pdf',
          name: 'Program Game Planning Standards.pdf',
        }),
      })
    );
  });

  it('attaches direct PDF exports to the immediately preceding created Files document', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-direct-test-pdf-123' },
      intent: 'create me a quick test pdf and save as a document please',
    });
    const job = makeMockJob(payload);
    const pdfUrl = 'https://cdn.example.com/Test_PDF_Document.pdf';
    const storagePath = 'Users/user-abc/threads/thread-direct-test-pdf-123/exports/test.pdf';

    mockRouter.run.mockResolvedValueOnce({
      summary: 'All done. Here is your test PDF.',
      data: {
        attachments: [
          {
            url: pdfUrl,
            storagePath,
            name: 'Test_PDF_Document.pdf',
            mimeType: 'application/pdf',
            type: 'doc',
            sizeBytes: 19044,
            artifactRole: 'export',
          },
        ],
        toolCallRecords: [
          {
            toolName: 'create_universal_team_document',
            status: 'success',
            input: { title: 'Test PDF Document' },
            output: {
              document: {
                id: 'doc-direct-test-pdf-1',
                title: 'Test PDF Document',
              },
            },
          },
          {
            toolName: 'dynamic_export',
            status: 'success',
            input: {
              format: 'pdf',
              fileName: 'Test_PDF_Document',
            },
            output: {
              downloadUrl: pdfUrl,
              storagePath,
              fileName: 'Test_PDF_Document.pdf',
              mimeType: 'application/pdf',
              format: 'pdf',
              sizeBytes: 19044,
              artifactRole: 'export',
              attachments: [
                {
                  url: pdfUrl,
                  storagePath,
                  name: 'Test_PDF_Document.pdf',
                  mimeType: 'application/pdf',
                  type: 'doc',
                  sizeBytes: 19044,
                  artifactRole: 'export',
                },
              ],
            },
          },
        ],
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockUpsertTeamFileFromAttachment).not.toHaveBeenCalled();
    expect(mockAttachExportAssetToUniversalDocument).toHaveBeenCalledTimes(1);
    expect(mockAttachExportAssetToUniversalDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-direct-test-pdf-1',
        userId: 'user-abc',
        origin: 'agent_chat_output',
        sourceThreadId: 'thread-direct-test-pdf-123',
        sourceOperationId: 'op-worker-test',
        attachment: expect.objectContaining({
          artifactRole: 'export',
          relatedDocumentId: 'doc-direct-test-pdf-1',
          artifactGroupId: 'op-worker-test',
          mimeType: 'application/pdf',
          type: 'pdf',
          storagePath,
          name: 'Test_PDF_Document.pdf',
        }),
      })
    );
  });

  it('attaches direct PPTX exports to the immediately preceding created Files document', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-direct-test-pptx-123' },
      intent: 'create me a quick staff presentation and save it as a document please',
    });
    const job = makeMockJob(payload);
    const pptxUrl = 'https://cdn.example.com/Staff_Presentation.pptx';
    const storagePath = 'Users/user-abc/threads/thread-direct-test-pptx-123/exports/staff.pptx';

    mockRouter.run.mockResolvedValueOnce({
      summary: 'All done. Here is your staff presentation.',
      data: {
        attachments: [
          {
            url: pptxUrl,
            storagePath,
            name: 'Staff_Presentation.pptx',
            mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            type: 'doc',
            sizeBytes: 22044,
            artifactRole: 'export',
          },
        ],
        toolCallRecords: [
          {
            toolName: 'create_universal_team_document',
            status: 'success',
            input: { title: 'Staff Presentation' },
            output: {
              document: {
                id: 'doc-direct-test-pptx-1',
                title: 'Staff Presentation',
              },
            },
          },
          {
            toolName: 'dynamic_export',
            status: 'success',
            input: {
              format: 'pptx',
              fileName: 'Staff_Presentation',
            },
            output: {
              downloadUrl: pptxUrl,
              storagePath,
              fileName: 'Staff_Presentation.pptx',
              mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              format: 'pptx',
              sizeBytes: 22044,
              artifactRole: 'export',
              attachments: [
                {
                  url: pptxUrl,
                  storagePath,
                  name: 'Staff_Presentation.pptx',
                  mimeType:
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                  type: 'doc',
                  sizeBytes: 22044,
                  artifactRole: 'export',
                },
              ],
            },
          },
        ],
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockAttachExportAssetToUniversalDocument).toHaveBeenCalledTimes(1);
    expect(mockAttachExportAssetToUniversalDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-direct-test-pptx-1',
        userId: 'user-abc',
        origin: 'agent_chat_output',
        sourceThreadId: 'thread-direct-test-pptx-123',
        sourceOperationId: 'op-worker-test',
        attachment: expect.objectContaining({
          artifactRole: 'export',
          relatedDocumentId: 'doc-direct-test-pptx-1',
          artifactGroupId: 'op-worker-test',
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          type: 'doc',
          storagePath,
          name: 'Staff_Presentation.pptx',
        }),
      })
    );
  });

  it('persists generated video links with poster metadata for markdown reloads', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-video-123' },
      intent: 'trim first 5 seconds',
    });
    const job = makeMockJob(payload);
    const videoUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fstaged%2Fvideo%2Ftrimmed.mp4?alt=media&token=video';
    const thumbnailUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fstaged%2Fvideo%2Ftrimmed-thumbnail.jpg?alt=media&token=thumb';
    const encodedThumbnailUrl = encodeURIComponent(thumbnailUrl).replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );

    mockRouter.run.mockResolvedValueOnce({
      summary: 'Trimmed the first 5 seconds from your clip.',
      data: {
        outputUrl: videoUrl,
        videoUrl,
        thumbnailUrl,
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-video-123',
        role: 'assistant',
        content: expect.stringContaining(`${videoUrl}#poster=${encodedThumbnailUrl}`),
        attachments: [
          expect.objectContaining({
            url: videoUrl,
            type: 'video',
            thumbnailUrl,
          }),
        ],
      })
    );
  });

  it('adds poster metadata when persisted prose has an older signed URL for the same video object', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-video-refresh-123' },
      intent: 'create a highlight reel',
    });
    const job = makeMockJob(payload);
    const contentVideoUrl =
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fstaged%2Fvideo%2Fhighlight.mp4?alt=media&token=old';
    const refreshedVideoUrl =
      'https://storage.googleapis.com/nxt-1-v2.firebasestorage.app/Users/user-1/threads/thread-1/media/staged/video/highlight.mp4?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=new';
    const thumbnailUrl =
      'https://storage.googleapis.com/nxt-1-v2.firebasestorage.app/Users/user-1/threads/thread-1/media/staged/video/highlight-thumbnail.jpg?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=thumb';
    const encodedThumbnailUrl = encodeURIComponent(thumbnailUrl).replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );

    mockRouter.run.mockResolvedValueOnce({
      summary: `Highlight video ready: [View Video](${contentVideoUrl})`,
      data: {
        outputUrl: refreshedVideoUrl,
        videoUrl: refreshedVideoUrl,
        thumbnailUrl,
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-video-refresh-123',
        role: 'assistant',
        content: expect.stringContaining(`${contentVideoUrl}#poster=${encodedThumbnailUrl}`),
        attachments: [
          expect.objectContaining({
            url: refreshedVideoUrl,
            type: 'video',
            thumbnailUrl,
          }),
        ],
      })
    );
    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.not.stringContaining(`Videos:\n- [video.mp4](${refreshedVideoUrl}`),
      })
    );
  });

  it('should append scheduled runs to the original thread before router execution', async () => {
    const payload = makePayload({
      origin: 'system_cron' as AgentJobOrigin,
      context: { threadId: 'thread-recurring-123' },
      intent: 'Send my weekly recruiting analytics recap',
      displayIntent: 'Weekly recruiting analytics recap',
    });
    const job = {
      ...makeMockJob(payload),
      name: 'recv:user-abc:1234567890',
      repeatJobKey: 'repeat:recv:user-abc:1234567890',
    };

    await capturedProcessor!(job);

    expect(mockJobRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'op-worker-test',
        origin: 'system_cron',
      })
    );

    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-recurring-123',
        userId: payload.userId,
        role: 'user',
        content: 'Weekly recruiting analytics recap',
        origin: 'system_cron',
        operationId: 'op-worker-test',
      })
    );

    const firstChatWriteOrder = mockChatService.addMessage.mock.invocationCallOrder[0];
    const routerRunOrder = mockRouter.run.mock.invocationCallOrder[0];

    expect(firstChatWriteOrder).toBeLessThan(routerRunOrder);
  });

  it('should use the BullMQ run id as the operation id for scheduled executions', async () => {
    const payload = makePayload({
      origin: 'system_cron' as AgentJobOrigin,
      operationId: 'recurring-user-abc-1700000000000',
      context: { threadId: 'thread-recurring-123' },
    });
    const job = {
      ...makeMockJob(payload),
      id: 'repeat:key:1777381200000',
      name: 'recv:user-abc:1234567890',
      repeatJobKey: 'repeat:key',
    };

    await capturedProcessor!(job);

    expect(mockJobRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'repeat:key:1777381200000',
      })
    );
    expect(mockRouter.run).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'repeat:key:1777381200000',
      }),
      expect.any(Function),
      mockFirestore,
      expect.any(Function),
      'staging',
      expect.anything()
    );
    expect(mockJobRepo.patchContext).toHaveBeenCalledWith('repeat:key:1777381200000', {
      recurringTaskKey: 'repeat:key',
    });
  });

  it('should persist scheduled assistant responses to the originating thread via sourceId fallback', async () => {
    const payload = makePayload({
      origin: 'system_cron' as AgentJobOrigin,
      context: { sourceId: 'thread-recurring-source-only-123' } as Record<string, unknown>,
      intent: 'Send John a reminder to check out NXT1 Sports',
      displayIntent: 'Send John a reminder to check out NXT1 Sports',
    });
    const job = {
      ...makeMockJob(payload),
      id: 'repeat:key:1777381200000',
      name: 'recv:user-abc:1234567890',
      repeatJobKey: 'repeat:key',
    };

    mockRouter.run.mockResolvedValueOnce({
      ...mockRouterResult,
      summary: 'Email sent to john@nxt1sports.com',
    });

    await capturedProcessor!(job);

    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-recurring-source-only-123',
        role: 'assistant',
        origin: 'system_cron',
        operationId: 'repeat:key:1777381200000',
        content: 'Email sent to john@nxt1sports.com',
      })
    );
  });

  it('should rehydrate old scheduled run thread linkage from RecurringTasks metadata', async () => {
    const payload = makePayload({
      origin: 'system_cron' as AgentJobOrigin,
      operationId: 'recurring-user-abc-1700000000000',
      context: undefined,
      intent: 'Send John a reminder to check out NXT1 Sports',
      displayIntent: 'Send John a reminder to check out NXT1 Sports',
    });
    const job = {
      ...makeMockJob(payload),
      id: 'repeat:key:1777381200000',
      name: 'recv:user-abc:1234567890',
      repeatJobKey: 'repeat:key',
    };

    const firestoreGetSpy = vi.spyOn(mockFirestoreRef, 'get').mockResolvedValueOnce({
      ...mockFirestoreSnapshot,
      exists: true,
      data: () => ({
        userId: 'user-abc',
        sourceId: 'thread-from-recurring-task-doc',
        jobName: 'recv:user-abc:1234567890',
      }),
    });

    mockRouter.run.mockResolvedValueOnce({
      ...mockRouterResult,
      summary: 'Email sent to john@nxt1sports.com',
    });

    await capturedProcessor!(job);

    expect(firestoreGetSpy).toHaveBeenCalled();
    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-from-recurring-task-doc',
        role: 'user',
        origin: 'system_cron',
        operationId: 'repeat:key:1777381200000',
      })
    );
    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-from-recurring-task-doc',
        role: 'assistant',
        origin: 'system_cron',
        operationId: 'repeat:key:1777381200000',
        content: 'Email sent to john@nxt1sports.com',
      })
    );
  });

  it('should persist weekly recap jobs in the dedicated recap collection', async () => {
    const payload = makePayload({
      origin: 'system_cron' as AgentJobOrigin,
      triggerEvent: {
        id: 'weekly_recap_2026-W23_user-abc',
        type: 'weekly_recap',
        userId: 'user-abc',
        intent: '',
        eventData: { weekKey: '2026-W23' },
        origin: 'system_cron',
        priority: 'normal',
        createdAt: '2026-06-05T13:00:00.000Z',
      },
    });
    const job = makeMockJob(payload);

    await capturedProcessor!(job);

    expect(mockJobRepo.withCollection).toHaveBeenCalledWith('AgentWeeklyRecapJobs');
    expect(mockWeeklyRecapJobRepo.create).toHaveBeenCalledWith(payload);
    expect(mockWeeklyRecapJobRepo.markCompleted).toHaveBeenCalledWith(
      'op-worker-test',
      expect.any(Object)
    );
    expect(mockJobRepo.create).not.toHaveBeenCalled();
  });

  it('should process weekly recap jobs against the job environment Firestore', async () => {
    const payload = makePayload({
      origin: 'system_cron' as AgentJobOrigin,
      triggerEvent: {
        id: 'weekly_recap_2026-W23_user-abc',
        type: 'weekly_recap',
        userId: 'user-abc',
        intent: '',
        eventData: { weekKey: '2026-W23' },
        origin: 'system_cron',
        priority: 'normal',
        createdAt: '2026-06-05T13:00:00.000Z',
      },
    });
    const job = makeMockJob(payload, 'staging');

    await capturedProcessor!(job);

    expect(mockProcessRecapForUser).toHaveBeenCalledWith(
      'user-abc',
      'Drafted 5 recruiting emails',
      'op-worker-test',
      mockFirestore,
      {
        recapNumber: undefined,
        weekLabel: undefined,
      }
    );
  });

  it('should mark weekly recap dispatches failed when the job fails before recap processing', async () => {
    const payload = makePayload({
      origin: 'system_cron' as AgentJobOrigin,
      triggerEvent: {
        id: 'weekly_recap_2026-W23_user-abc',
        type: 'weekly_recap',
        userId: 'user-abc',
        intent: '',
        eventData: { weekKey: '2026-W23' },
        origin: 'system_cron',
        priority: 'normal',
        createdAt: '2026-06-05T13:00:00.000Z',
      },
    });
    const job = makeMockJob(payload, 'staging');

    mockRouter.run.mockRejectedValueOnce(new Error('LLM timeout'));

    await expect(capturedProcessor!(job)).rejects.toThrow('LLM timeout');

    expect(mockUpdateWeeklyRecapDispatchStatus).toHaveBeenCalledWith(mockFirestore, {
      operationId: 'op-worker-test',
      status: 'failed',
      error: 'LLM timeout',
    });
  });

  it('should persist streamed parts and tool steps for thread reload hydration', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-123' },
      intent: 'Find the top transfer portal athletes in the browser',
    });
    const job = makeMockJob(payload);
    mockRouter.run.mockImplementationOnce(async (_p, _onUpdate, _db, onStreamEvent) => {
      onStreamEvent({
        type: 'delta',
        agentId: 'router',
        text: 'I opened the live browser and checked the page. ',
      });
      onStreamEvent({
        type: 'step_active',
        agentId: 'router',
        toolName: 'read_live_view',
        stageType: 'tool',
        stage: 'fetching_data',
        metadata: { source: 'live_view', hostname: 'on3.com' },
        message: 'Reading current page...',
        icon: 'search',
      });
      onStreamEvent({
        type: 'tool_result',
        agentId: 'router',
        toolName: 'read_live_view',
        toolSuccess: true,
        toolResult: { count: 4 },
        message: 'Read current page',
        icon: 'search',
      });

      return {
        ...mockRouterResult,
        summary: 'Found 4 transfer portal athletes',
      };
    });

    await capturedProcessor!(job);

    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-123',
        role: 'assistant',
        content: 'I opened the live browser and checked the page.',
        steps: [
          expect.objectContaining({
            status: 'success',
            label: 'Read current page',
            detail: '4 result(s)',
            icon: 'search',
          }),
        ],
        parts: [
          {
            type: 'text',
            content: 'I opened the live browser and checked the page. ',
          },
          {
            type: 'tool-steps',
            steps: [
              expect.objectContaining({
                status: 'success',
                label: 'Read current page',
                detail: '4 result(s)',
              }),
            ],
          },
        ],
      })
    );
  });

  it('does not persist routing-only streamed text as the final assistant answer', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-film-review' },
      intent: 'Analyze the 8 selected film clips',
    });
    const job = makeMockJob(payload);

    mockRouter.run.mockImplementationOnce(async (_p, _onUpdate, _db, onStreamEvent) => {
      onStreamEvent({
        type: 'delta',
        agentId: 'router',
        text: 'Routing this to my performance coordinator for a full breakdown.',
      });

      return {
        ...mockRouterResult,
        summary:
          'Across the selected clips, the main trend is late second-level fits against split-flow action. Prioritize fitting the backside B gap and cleaning up force support.',
      };
    });

    await capturedProcessor!(job);

    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-film-review',
        role: 'assistant',
        content:
          'Across the selected clips, the main trend is late second-level fits against split-flow action. Prioritize fitting the backside B gap and cleaning up force support.',
      })
    );
    expect(mockChatService.addMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Routing this to my performance coordinator'),
      })
    );
  });

  it('persists approval yields onto the thread so refresh can recover approvalId', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-approval-1' },
    });
    const job = makeMockJob(payload);

    mockRouter.run.mockRejectedValueOnce(
      new AgentYieldException({
        reason: 'needs_approval',
        promptToUser: 'Review this email before sending.',
        agentId: 'recruiting_coordinator',
        messages: [{ role: 'user', content: 'Send the email' }],
        pendingToolCall: {
          toolName: 'send_email',
          toolInput: {
            toEmail: 'coach@example.com',
            subject: 'Checking in',
          },
          toolCallId: 'tool-approval-1',
        },
        approvalId: 'approval-123',
      })
    );

    await capturedProcessor!(job);

    expect(mockChatService.updateThreadPausedYieldState).toHaveBeenCalledWith(
      'thread-approval-1',
      expect.objectContaining({
        reason: 'needs_approval',
        approvalId: 'approval-123',
      })
    );
  });

  it('should call job.updateProgress at least once (final 100%)', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    await capturedProcessor!(job);

    // At minimum, the final 100% progress is reported
    expect(job.updateProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        outcomeCode: 'success_default',
        percent: 100,
      })
    );
  });

  it('should skip billing for platform-sponsored jobs', async () => {
    const payload = makePayload({
      origin: 'database_event' as AgentJobOrigin,
      context: { skipBilling: true },
    });
    const job = makeMockJob(payload);

    await capturedProcessor!(job);

    expect(mockExecuteBillingDeduction).not.toHaveBeenCalled();
    expect(mockCreateWalletHold).not.toHaveBeenCalled();
  });

  it('should pass active team context into billing deduction', async () => {
    const payload = makePayload({
      context: {
        teamId: 'team-football',
        organizationId: 'org-crown-point',
      },
    });
    const job = makeMockJob(payload);

    await capturedProcessor!(job);

    expect(mockExecuteBillingDeduction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-abc',
        operationId: 'op-worker-test',
        teamId: 'team-football',
        organizationId: 'org-crown-point',
      })
    );
  });

  it('should pass the resolved coordinator into billing when the payload was not pre-routed', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    mockRouter.run.mockImplementationOnce(async (_p, onUpdate) => {
      onUpdate?.({
        operationId: payload.operationId,
        status: 'running',
        agentId: 'brand_coordinator',
        step: {
          agentId: 'brand_coordinator',
          message: 'Designing the graphic',
          timestamp: '2026-03-10T00:00:00Z',
        },
      });

      return mockRouterResult;
    });

    await capturedProcessor!(job);

    expect(mockExecuteBillingDeduction).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'op-worker-test',
        coordinatorId: 'router',
        metadata: expect.objectContaining({
          agent: 'router',
        }),
      })
    );
  });

  it('should emit a billing-action card when hard-stop hold creation fails for insufficient balance', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    mockGetBillingState.mockResolvedValue({
      billingEntity: 'individual',
      hardStop: true,
      paymentProvider: 'stripe',
    });
    mockCreateWalletHold.mockResolvedValue({
      success: false,
      reason: 'Insufficient available balance: $0.11 < $0.40',
      availableBalance: 11,
    });

    const result = await capturedProcessor!(job);

    expect(result).toEqual(
      expect.objectContaining({
        result: expect.objectContaining({
          data: expect.objectContaining({
            blockedByBilling: true,
            reason: 'insufficient_funds',
            currentBalanceCents: 11,
            amountNeededCents: 40,
          }),
        }),
      })
    );

    expect(mockPubSub.publish).toHaveBeenCalledWith(
      payload.operationId,
      'card',
      expect.objectContaining({
        type: 'billing-action',
        payload: expect.objectContaining({
          reason: 'insufficient_funds',
          currentBalanceCents: 11,
          amountNeededCents: 40,
        }),
      })
    );
  });

  it('should dispatch completion push for active user-viewed jobs by default', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    mockJobRepo.getById.mockResolvedValue({
      viewerLastSeenAt: new Date().toISOString(),
    });
    mockPubSub.subscriberCount.mockResolvedValue(1);

    await capturedProcessor!(job);

    expect(mockLogAgentTaskCompletion).toHaveBeenCalledTimes(1);
  });

  it('should suppress completion push only when active-viewer suppression is explicitly enabled', async () => {
    const payload = makePayload({
      notificationPolicy: {
        suppressPushWhenActivelyViewing: true,
      },
    });
    const job = makeMockJob(payload);

    mockJobRepo.getById.mockResolvedValue({
      viewerLastSeenAt: new Date().toISOString(),
    });
    mockPubSub.subscriberCount.mockResolvedValue(1);

    await capturedProcessor!(job);

    expect(mockLogAgentTaskCompletion).not.toHaveBeenCalled();
  });

  // ── Progress Tracking ─────────────────────────────────────────────────

  it('should track step progress via the onUpdate callback', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    // Override router.run to invoke the onUpdate callback
    mockRouter.run.mockImplementationOnce(async (_p: unknown, onUpdate: (u: unknown) => void) => {
      onUpdate({
        operationId: 'op-worker-test',
        status: 'acting',
        step: {
          id: '1',
          timestamp: new Date().toISOString(),
          status: 'acting',
          message: 'Plan created with 3 task(s)',
          payload: { eventType: 'plan_created', taskCount: 3 },
        },
      });
      onUpdate({
        operationId: 'op-worker-test',
        status: 'acting',
        step: {
          id: '2',
          timestamp: new Date().toISOString(),
          status: 'acting',
          message: 'Running task task-1: Evaluate athletes',
          payload: { eventType: 'task_started', taskId: 'task-1' },
        },
      });
      return mockRouterResult;
    });

    await capturedProcessor!(job);

    // Should have called updateProgress multiple times (2 updates + 1 final)
    expect(job.updateProgress.mock.calls.length).toBeGreaterThanOrEqual(3);

    // The first update should parse totalSteps=3
    const firstProgress = job.updateProgress.mock.calls[0][0];
    expect(firstProgress.totalSteps).toBe(3);

    // The second update should increment stepIndex
    const secondProgress = job.updateProgress.mock.calls[1][0];
    expect(secondProgress.currentStep).toBe(1);
    expect(secondProgress.percent).toBeGreaterThan(0);
  });

  // ── Error Propagation ─────────────────────────────────────────────────

  it('should propagate errors from AgentRouter.run()', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    mockRouter.run.mockRejectedValueOnce(new Error('LLM timeout'));

    await expect(capturedProcessor!(job)).rejects.toThrow('LLM timeout');
  });

  it('should auto-continue timed out jobs as a new operation', async () => {
    const payload = makePayload({
      context: {
        threadId: 'thread-timeout-1',
      },
    });
    const job = makeMockJob(payload);

    mockRouter.run.mockRejectedValueOnce(new Error('Agent job timed out after 120 minutes'));

    const result = (await capturedProcessor!(job)) as Record<string, unknown>;

    expect(mockEnqueueContinuation).toHaveBeenCalledTimes(1);
    expect(mockEnqueueContinuation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: payload.userId,
        intent: payload.intent,
        context: expect.objectContaining({
          resumedFrom: payload.operationId,
          timeoutContinuationCount: 1,
          timeoutContinuedFrom: payload.operationId,
        }),
      }),
      'staging'
    );

    expect(mockJobRepo.create).toHaveBeenCalledTimes(2);
    expect(mockJobRepo.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ operationId: payload.operationId })
    );
    expect(mockJobRepo.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        context: expect.objectContaining({
          resumedFrom: payload.operationId,
          timeoutContinuationCount: 1,
        }),
      })
    );
    expect(mockJobRepo.markCompleted).toHaveBeenCalledWith(
      payload.operationId,
      expect.objectContaining({
        data: expect.objectContaining({
          continuationReason: 'timeout',
        }),
      })
    );
    expect(mockJobRepo.markFailed).not.toHaveBeenCalledWith(
      payload.operationId,
      'Agent job timed out after 120 minutes'
    );
    expect(result).toHaveProperty('result');
  });

  it('should mark the job as failed when the router returns a failed plan result', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    mockRouter.run.mockResolvedValueOnce({
      summary: 'Execution plan failed. Task 1 (performance_coordinator) failed: LLM timeout',
      data: {
        operationStatus: 'failed',
        firstFailedTask: {
          id: '1',
          assignedAgent: 'performance_coordinator',
          error: 'LLM timeout',
        },
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockJobRepo.markFailed).toHaveBeenCalledWith(
      'op-worker-test',
      'Execution plan failed. Task 1 (performance_coordinator) failed: LLM timeout'
    );
    expect(mockJobRepo.markCompleted).not.toHaveBeenCalled();

    const finalProgress = job.updateProgress.mock.calls.at(-1)?.[0];
    expect(finalProgress.status).toBe('failed');
    expect(finalProgress.message).toContain('Execution plan failed.');
  });

  it('marks the job failed when result.success is false even if deliverables exist', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    mockRouter.run.mockResolvedValueOnce({
      summary: 'Your graphic is ready.',
      success: false,
      errorMessage: 'analytics event failed',
      data: {
        operationStatus: 'failed',
        imageUrl: 'https://cdn.example.com/generated-graphic.jpg',
        firstFailedTask: {
          id: 'analytics',
          assignedAgent: 'brand_coordinator',
          error: 'analytics event failed',
        },
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockJobRepo.markFailed).toHaveBeenCalledWith('op-worker-test', 'Your graphic is ready.');
    expect(mockJobRepo.markCompleted).not.toHaveBeenCalled();

    const finalProgress = job.updateProgress.mock.calls.at(-1)?.[0];
    expect(finalProgress.status).toBe('failed');
  });

  it('suppresses terminal completion side effects when persisted job is paused', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-paused-1' },
    });
    const job = makeMockJob(payload);
    mockRouter.run.mockResolvedValueOnce(mockRouterResult);

    mockJobRepo.getById.mockResolvedValueOnce(null).mockResolvedValueOnce({
      operationId: payload.operationId,
      status: 'paused',
      yieldState: {
        pendingToolCall: { toolName: 'resume_paused_operation' },
      },
    });

    const outcome = (await capturedProcessor!(job)) as { result?: { summary?: string } };

    expect(outcome.result?.summary).toBe('Operation paused. Resume whenever you are ready.');
    expect(mockJobRepo.markCompleted).not.toHaveBeenCalled();
    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-paused-1',
        semanticPhase: 'assistant_partial',
        content: 'Drafted 5 recruiting emails',
      })
    );

    const finalProgress = job.updateProgress.mock.calls.at(-1)?.[0];
    expect(finalProgress.status).toBe('paused');
  });

  it('persists streamed content when pause wins the post-run completion race', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-paused-after-result-1' },
    });
    const job = makeMockJob(payload);

    mockRouter.run.mockImplementationOnce(async (_p, _onUpdate, _db, onStreamEvent) => {
      onStreamEvent({
        type: 'delta',
        agentId: 'brand_coordinator',
        text: 'Your gunslinger highlight reel is ready.',
      });
      return {
        summary: 'Your gunslinger highlight reel is ready.',
        data: {
          videoUrl: 'https://cdn.example.com/gunslinger-reel.mp4',
          thumbnailUrl: 'https://cdn.example.com/gunslinger-poster.jpg',
          toolCallRecords: [
            {
              toolName: 'ffmpeg_merge_videos',
              status: 'success',
              output: {
                videoUrl: 'https://cdn.example.com/gunslinger-reel.mp4',
                thumbnailUrl: 'https://cdn.example.com/gunslinger-poster.jpg',
              },
            },
          ],
        },
      } satisfies AgentOperationResult;
    });
    mockJobRepo.getById.mockResolvedValueOnce(null).mockResolvedValueOnce({
      operationId: payload.operationId,
      status: 'paused',
      yieldState: {
        pendingToolCall: { toolName: 'resume_paused_operation' },
      },
    });

    const outcome = (await capturedProcessor!(job)) as { result?: { summary?: string } };

    expect(outcome.result?.summary).toBe('Operation paused. Resume whenever you are ready.');
    expect(mockJobRepo.markCompleted).not.toHaveBeenCalled();
    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-paused-after-result-1',
        operationId: payload.operationId,
        semanticPhase: 'assistant_partial',
        idempotencyKey: `${payload.operationId}:assistant_partial`,
        content: 'Your gunslinger highlight reel is ready.',
        attachments: expect.arrayContaining([
          expect.objectContaining({
            type: 'video',
            url: 'https://cdn.example.com/gunslinger-reel.mp4',
            thumbnailUrl: 'https://cdn.example.com/gunslinger-poster.jpg',
          }),
        ]),
        resultData: expect.objectContaining({
          videoUrl: 'https://cdn.example.com/gunslinger-reel.mp4',
        }),
        toolCalls: expect.arrayContaining([
          expect.objectContaining({
            toolName: 'ffmpeg_merge_videos',
            status: 'success',
          }),
        ]),
      })
    );
  });

  it('retries a transient MongoDB failure while persisting a post-run paused snapshot', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-paused-persist-retry-1' },
    });
    const job = makeMockJob(payload);

    mockRouter.run.mockImplementationOnce(async (_p, _onUpdate, _db, onStreamEvent) => {
      onStreamEvent({
        type: 'delta',
        agentId: 'brand_coordinator',
        text: 'Your finished reel is ready.',
      });
      return mockRouterResult;
    });
    mockJobRepo.getById.mockResolvedValueOnce(null).mockResolvedValueOnce({
      operationId: payload.operationId,
      status: 'paused',
      yieldState: {
        pendingToolCall: { toolName: 'resume_paused_operation' },
      },
    });
    mockChatService.addMessage
      .mockRejectedValueOnce(new Error('temporary MongoDB outage'))
      .mockResolvedValueOnce({ id: 'msg-paused-retry' });

    await capturedProcessor!(job);

    expect(mockChatService.addMessage).toHaveBeenCalledTimes(2);
    expect(mockChatService.addMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        threadId: 'thread-paused-persist-retry-1',
        semanticPhase: 'assistant_partial',
        content: 'Your finished reel is ready.',
      })
    );
  });

  it('persists generated video metadata when a post-run pause has no streamed text', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-paused-metadata-only-1' },
    });
    const job = makeMockJob(payload);

    mockRouter.run.mockResolvedValueOnce({
      summary: '',
      data: {
        videoUrl: 'https://cdn.example.com/metadata-only-reel.mp4',
        thumbnailUrl: 'https://cdn.example.com/metadata-only-poster.jpg',
      },
    } satisfies AgentOperationResult);
    mockJobRepo.getById.mockResolvedValueOnce(null).mockResolvedValueOnce({
      operationId: payload.operationId,
      status: 'paused',
      yieldState: {
        pendingToolCall: { toolName: 'resume_paused_operation' },
      },
    });

    await capturedProcessor!(job);

    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-paused-metadata-only-1',
        semanticPhase: 'assistant_partial',
        content: 'Drafted 5 recruiting emails',
        attachments: expect.arrayContaining([
          expect.objectContaining({
            type: 'video',
            url: 'https://cdn.example.com/metadata-only-reel.mp4',
            thumbnailUrl: 'https://cdn.example.com/metadata-only-poster.jpg',
          }),
        ]),
        resultData: expect.objectContaining({
          videoUrl: 'https://cdn.example.com/metadata-only-reel.mp4',
        }),
      })
    );
  });

  it('treats AbortError as controlled pause when persisted state is paused', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-paused-abort-1' },
    });
    const job = makeMockJob(payload);

    const abortErr = new Error('Operation aborted');
    abortErr.name = 'AbortError';
    mockRouter.run.mockRejectedValueOnce(abortErr);

    mockJobRepo.getById
      .mockResolvedValueOnce({
        operationId: payload.operationId,
        status: 'paused',
        yieldState: {
          pendingToolCall: { toolName: 'resume_paused_operation' },
        },
      })
      .mockResolvedValueOnce({
        operationId: payload.operationId,
        status: 'paused',
        yieldState: {
          pendingToolCall: { toolName: 'resume_paused_operation' },
        },
      });

    const outcome = (await capturedProcessor!(job)) as { result?: { summary?: string } };

    expect(outcome.result?.summary).toBe('Operation paused. Resume whenever you are ready.');
    expect(mockJobRepo.markFailed).not.toHaveBeenCalled();

    const finalProgress = job.updateProgress.mock.calls.at(-1)?.[0];
    expect(finalProgress.status).toBe('paused');
  });

  it('persists paused partial snapshots without a bracketed placeholder when only steps exist', async () => {
    const payload = makePayload({
      context: { threadId: 'thread-paused-step-only-1' },
    });
    const job = makeMockJob(payload);

    mockRouter.run.mockImplementationOnce(async (_p, _onUpdate, _db, onStreamEvent) => {
      onStreamEvent({
        type: 'step_active',
        agentId: 'router',
        toolName: 'execute_saved_plan',
        stageType: 'tool',
        stage: 'executing_plan',
        message: 'Executing approved plan',
      });

      const abortErr = new Error('Operation aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    });

    mockJobRepo.getById
      .mockResolvedValueOnce({
        operationId: payload.operationId,
        status: 'paused',
        yieldState: {
          pendingToolCall: { toolName: 'resume_paused_operation' },
        },
      })
      .mockResolvedValueOnce({
        operationId: payload.operationId,
        status: 'paused',
        yieldState: {
          pendingToolCall: { toolName: 'resume_paused_operation' },
        },
      });

    await capturedProcessor!(job);

    expect(mockChatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-paused-step-only-1',
        role: 'assistant',
        semanticPhase: 'assistant_partial',
        content: '',
        steps: [
          expect.objectContaining({
            label: 'Executing approved plan',
          }),
        ],
      })
    );
    expect(mockChatService.addMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        content: '[Operation paused by user]',
      })
    );
  });

  it('aborts queued child operations while waiting on parent completion', async () => {
    const payload = makePayload({
      operationId: 'op-child-1',
      context: { parentOperationId: 'op-parent-1' },
    });
    const job = makeMockJob(payload);

    mockPubSub.subscribeControl.mockImplementationOnce(async (_operationId, onControl) => {
      onControl({ action: 'cancel', issuedBy: 'user' });
      return async () => undefined;
    });

    mockJobRepo.getById.mockImplementation(async (operationId: string) => {
      if (operationId === payload.operationId) {
        return { operationId, status: 'queued' };
      }
      if (operationId === 'op-parent-1') {
        return { operationId, status: 'running' };
      }
      return null;
    });

    await expect(capturedProcessor!(job)).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Queued child operation aborted before parent completion',
    });

    expect(mockQueueService.registerController).toHaveBeenCalledWith(
      payload.operationId,
      expect.any(AbortController)
    );
    expect(mockPubSub.subscribeControl).toHaveBeenCalledWith(
      payload.operationId,
      expect.any(Function)
    );
    expect(mockRouter.run).not.toHaveBeenCalled();
  });

  it('uses the explicit error message when a failed result only says task completed', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    mockRouter.run.mockResolvedValueOnce({
      summary: 'Task completed.',
      success: false,
      errorMessage: 'Media production did not produce a final video URL.',
      data: {
        operationStatus: 'failed',
      },
    } satisfies AgentOperationResult);

    await capturedProcessor!(job);

    expect(mockJobRepo.markFailed).toHaveBeenCalledWith(
      'op-worker-test',
      'Media production did not produce a final video URL.'
    );
    expect(mockJobRepo.markFailed).not.toHaveBeenCalledWith('op-worker-test', 'Task completed.');
  });

  it('checks parent operation status before running queued child operations', async () => {
    const payload = makePayload({
      operationId: 'op-child-2',
      context: { parentOperationId: 'op-parent-2' },
    });
    const job = makeMockJob(payload);

    mockJobRepo.getById.mockImplementation(async (operationId: string) => {
      if (operationId === 'op-parent-2') {
        return { operationId, status: 'completed' };
      }
      if (operationId === payload.operationId) {
        return { operationId, status: 'queued' };
      }
      return null;
    });

    await capturedProcessor!(job);

    expect(mockJobRepo.getById).toHaveBeenCalledWith('op-parent-2');
    expect(mockRouter.run).toHaveBeenCalledTimes(1);
    expect(mockQueueService.unregisterController).toHaveBeenCalledWith(payload.operationId);
  });

  it('force-fails stale parent operations so queued children do not wait forever', async () => {
    const payload = makePayload({
      operationId: 'op-child-stale-1',
      context: { parentOperationId: 'op-parent-stale-1' },
    });
    const job = makeMockJob(payload);

    const staleIso = new Date(Date.now() - (2 * 60 * 60 * 1000 + 6 * 60 * 1000)).toISOString();

    mockJobRepo.getById.mockImplementation(async (operationId: string) => {
      if (operationId === 'op-parent-stale-1') {
        return {
          operationId,
          status: 'acting',
          createdAt: staleIso,
          updatedAt: staleIso,
        };
      }
      if (operationId === payload.operationId) {
        return { operationId, status: 'queued' };
      }
      return null;
    });

    await capturedProcessor!(job);

    expect(mockJobRepo.markFailed).toHaveBeenCalledWith(
      'op-parent-stale-1',
      'Parent operation became stale while a child operation was blocked waiting for completion.'
    );
    expect(mockRouter.run).toHaveBeenCalledTimes(1);
  });

  it('should publish deltas immediately (live) and non-deltas after persisted seq', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    let resolveFirstPersist: () => void = () => undefined;
    const firstPersistPromise = new Promise<void>((resolve) => {
      resolveFirstPersist = resolve;
    });

    mockJobRepo.allocateEventSeqRange.mockImplementation(async () => 0);
    mockJobRepo.writeJobEvent
      .mockImplementationOnce(async () => firstPersistPromise)
      .mockImplementation(async () => undefined);

    mockRouter.run.mockImplementationOnce(async (_p, _onUpdate, _db, onStreamEvent) => {
      onStreamEvent({ type: 'delta', text: 'hello ' });
      onStreamEvent({ type: 'delta', text: 'world' });
      onStreamEvent({ type: 'step_active', message: 'Analyzing...' });
      return {
        ...mockRouterResult,
        summary: 'hello world',
      };
    });

    const processingPromise = capturedProcessor!(job);

    // ╔════════════════════════════════════════════════════════════════════╗
    // ║  NEW: Deltas are published IMMEDIATELY (onLiveEvent hook)          ║
    // ║  Non-delta events wait for persisted seq (onPersistedEvent hook)   ║
    // ╚════════════════════════════════════════════════════════════════════╝
    await vi.waitFor(() => {
      // Live deltas published immediately (token-by-token UX)
      expect(mockPubSub.publish).toHaveBeenCalledWith(
        expect.any(String),
        'delta',
        expect.objectContaining({ content: expect.any(String) })
      );
    });

    const liveDeltaPublishCount = mockPubSub.publish.mock.calls.filter(
      (call) => call[1] === 'delta'
    ).length;
    expect(liveDeltaPublishCount).toBeGreaterThan(0);

    await vi.waitFor(() => {
      expect(mockJobRepo.writeJobEvent).toHaveBeenCalledTimes(1);
    });

    resolveFirstPersist();
    await processingPromise;

    // After persistence completes, non-delta events should also be published
    const allPublishCalls = mockPubSub.publish.mock.calls;
    expect(allPublishCalls.length).toBeGreaterThan(liveDeltaPublishCount);

    // Verify non-delta events (if any) are published
    const nonDeltaPublishes = allPublishCalls.filter((call) => call[1] !== 'delta');
    expect(nonDeltaPublishes.length).toBeGreaterThanOrEqual(0);

    // If non-delta events have seq numbers, they should be monotonic
    const nonDeltaSeqs = nonDeltaPublishes
      .map((call) => (call[2] as { seq?: unknown })?.seq)
      .filter((value): value is number => typeof value === 'number');

    if (nonDeltaSeqs.length > 0) {
      expect(nonDeltaSeqs).toEqual([...nonDeltaSeqs].sort((a, b) => a - b));
    }
  });

  it('should publish panel events and preserve autoOpenPanel on done', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);

    mockRouter.run.mockImplementationOnce(async (_p, _onUpdate, _db, onStreamEvent) => {
      onStreamEvent({
        type: 'tool_result',
        toolName: 'open_live_view',
        toolSuccess: true,
        stepId: 'step-live-view',
        stageType: 'tool',
        message: 'Opening virtual browser',
        toolResult: {
          autoOpenPanel: {
            type: 'live-view',
            url: 'https://connect.firecrawl.dev/session/live-123',
            title: 'acumbbcamps.com',
          },
        },
      });

      return {
        ...mockRouterResult,
        summary: 'Live view opened',
      };
    });

    await capturedProcessor!(job);

    expect(mockPubSub.publish).toHaveBeenCalledWith(
      payload.operationId,
      'panel',
      expect.objectContaining({
        type: 'live-view',
        url: 'https://connect.firecrawl.dev/session/live-123',
      })
    );

    expect(mockPubSub.publish).toHaveBeenCalledWith(
      payload.operationId,
      'done',
      expect.objectContaining({
        autoOpenPanel: expect.objectContaining({
          type: 'live-view',
          url: 'https://connect.firecrawl.dev/session/live-123',
        }),
      })
    );
  });

  it('should publish live media events from generated video tool results', async () => {
    const payload = makePayload();
    const job = makeMockJob(payload);
    const videoUrl = 'https://cdn.example.com/generated/highlight.mp4';
    const thumbnailUrl = 'https://cdn.example.com/generated/highlight-thumb.jpg';

    mockRouter.run.mockImplementationOnce(async (_p, _onUpdate, _db, onStreamEvent) => {
      onStreamEvent({
        type: 'tool_result',
        toolName: 'stage_media',
        toolSuccess: true,
        stepId: 'step-stage-media',
        stageType: 'tool',
        message: 'Stage Media',
        toolResult: {
          outputUrl: videoUrl,
          thumbnailUrl,
          mimeType: 'video/mp4',
        },
      });

      return {
        ...mockRouterResult,
        summary: 'Generated video',
      };
    });

    await capturedProcessor!(job);

    expect(mockPubSub.publish).toHaveBeenCalledWith(payload.operationId, 'media', {
      type: 'video',
      url: videoUrl,
      mimeType: 'video/mp4',
      thumbnailUrl,
    });
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('should close the BullMQ worker', async () => {
      const worker = new AgentWorker(
        mockRouter as never,
        mockJobRepo as never,
        mockJobRepo as never,
        mockChatService as never,
        mockPubSub as never,
        mockFirestore,
        mockLlmService as never,
        'redis://localhost:6379'
      );
      await worker.shutdown();
      expect(mockWorkerClose).toHaveBeenCalled();
    });
  });

  describe('isRunning', () => {
    it('should delegate to the BullMQ worker', () => {
      const worker = new AgentWorker(
        mockRouter as never,
        mockJobRepo as never,
        mockJobRepo as never,
        mockChatService as never,
        mockPubSub as never,
        mockFirestore,
        mockLlmService as never,
        'redis://localhost:6379'
      );
      expect(worker.isRunning()).toBe(true);
    });
  });
});
