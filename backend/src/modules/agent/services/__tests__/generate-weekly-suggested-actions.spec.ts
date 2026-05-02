import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContextBuilder } from '../../memory/context-builder.js';
import type { OpenRouterService } from '../../llm/openrouter.service.js';
import type { Firestore } from 'firebase-admin/firestore';

const { getAgentAppConfigMock, resolveConfiguredCoordinatorsForRoleMock } = vi.hoisted(() => ({
  getAgentAppConfigMock: vi.fn().mockResolvedValue({
    coordinators: [
      {
        id: 'admin_coordinator',
        name: 'Admin Coordinator',
        icon: 'sparkles',
        description: 'Keeps operations on track.',
        availableForRoles: ['athlete', 'coach', 'director'],
        commands: [
          {
            id: 'admin-priority',
            label: 'Priority Radar',
            icon: 'sparkles',
            subLabel: "Surface this week's top priorities",
          },
          {
            id: 'admin-deadlines',
            label: 'Deadline Sweep',
            icon: 'calendar',
            subLabel: 'Check the next key deadlines',
          },
        ],
        scheduledActions: [
          {
            id: 'admin-weekly-review',
            label: 'Weekly Review',
            icon: 'calendar',
            subLabel: 'Review recurring admin tasks',
          },
        ],
      },
    ],
  }),
  resolveConfiguredCoordinatorsForRoleMock: vi.fn().mockReturnValue([
    {
      id: 'admin_coordinator',
      name: 'Admin Coordinator',
      icon: 'sparkles',
      description: 'Keeps operations on track.',
      availableForRoles: ['athlete', 'coach', 'director'],
      commands: [
        {
          id: 'admin-priority',
          label: 'Priority Radar',
          icon: 'sparkles',
          subLabel: "Surface this week's top priorities",
        },
        {
          id: 'admin-deadlines',
          label: 'Deadline Sweep',
          icon: 'calendar',
          subLabel: 'Check the next key deadlines',
        },
      ],
      scheduledActions: [
        {
          id: 'admin-weekly-review',
          label: 'Weekly Review',
          icon: 'calendar',
          subLabel: 'Review recurring admin tasks',
        },
      ],
    },
  ]),
}));

vi.mock('../../config/agent-app-config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/agent-app-config.js')>();
  return {
    ...actual,
    getAgentAppConfig: getAgentAppConfigMock,
    resolveConfiguredCoordinatorsForRole: resolveConfiguredCoordinatorsForRoleMock,
  };
});

const { AgentGenerationService } = await import('../generation.service.js');

type DocData = Record<string, unknown>;

interface FakeDocState {
  data?: DocData;
  subcollections: Map<string, Map<string, FakeDocState>>;
}

interface FakeDocSnapshot {
  readonly id: string;
  readonly exists: boolean;
  data(): DocData | undefined;
  readonly ref: FakeDocRef;
}

class FakeDocRef {
  constructor(
    private readonly state: FakeDocState,
    readonly id: string,
    private readonly createSubcollection: (
      doc: FakeDocState,
      name: string
    ) => Map<string, FakeDocState>
  ) {}

  async get(): Promise<FakeDocSnapshot> {
    return {
      id: this.id,
      exists: this.state.data !== undefined,
      data: () => this.state.data,
      ref: this,
    };
  }

  async set(data: DocData, options?: { merge?: boolean }): Promise<void> {
    this.state.data = options?.merge ? { ...(this.state.data ?? {}), ...data } : { ...data };
  }

  collection(name: string): FakeCollectionRef {
    return new FakeCollectionRef(
      this.createSubcollection(this.state, name),
      this.createSubcollection
    );
  }
}

class FakeQueryRef {
  private limitCount: number | null = null;

  constructor(
    private readonly docs: Map<string, FakeDocState>,
    private readonly createSubcollection: (
      doc: FakeDocState,
      name: string
    ) => Map<string, FakeDocState>,
    private readonly field: string,
    private readonly direction: 'asc' | 'desc'
  ) {}

  limit(count: number): FakeQueryRef {
    this.limitCount = count;
    return this;
  }

  async get(): Promise<{ empty: boolean; docs: FakeDocSnapshot[] }> {
    const docs = [...this.docs.entries()]
      .filter(([, state]) => state.data !== undefined)
      .sort((left, right) => {
        const leftValue = left[1].data?.[this.field];
        const rightValue = right[1].data?.[this.field];
        const normalizedLeft =
          typeof leftValue === 'string' ? leftValue : JSON.stringify(leftValue);
        const normalizedRight =
          typeof rightValue === 'string' ? rightValue : JSON.stringify(rightValue);
        return this.direction === 'desc'
          ? normalizedRight.localeCompare(normalizedLeft)
          : normalizedLeft.localeCompare(normalizedRight);
      })
      .slice(0, this.limitCount ?? Number.MAX_SAFE_INTEGER)
      .map(
        ([id, state]) =>
          ({
            id,
            exists: state.data !== undefined,
            data: () => state.data,
            ref: new FakeDocRef(state, id, this.createSubcollection),
          }) satisfies FakeDocSnapshot
      );

    return { empty: docs.length === 0, docs };
  }
}

class FakeCollectionRef {
  constructor(
    private readonly docs: Map<string, FakeDocState>,
    private readonly createSubcollection: (
      doc: FakeDocState,
      name: string
    ) => Map<string, FakeDocState>
  ) {}

  doc(id: string): FakeDocRef {
    let state = this.docs.get(id);
    if (!state) {
      state = { data: undefined, subcollections: new Map() };
      this.docs.set(id, state);
    }
    return new FakeDocRef(state, id, this.createSubcollection);
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): FakeQueryRef {
    return new FakeQueryRef(this.docs, this.createSubcollection, field, direction);
  }
}

class FakeFirestore {
  private readonly root = new Map<string, Map<string, FakeDocState>>();
  private readonly getOrCreateSubcollection = (
    doc: FakeDocState,
    name: string
  ): Map<string, FakeDocState> => this.getOrCreateCollection(doc.subcollections, name);

  constructor(seed: { userId: string; userData: DocData }) {
    const users = this.getOrCreateCollection(this.root, 'Users');
    users.set(seed.userId, {
      data: seed.userData,
      subcollections: new Map(),
    });
  }

  collection(name: string): FakeCollectionRef {
    return new FakeCollectionRef(
      this.getOrCreateCollection(this.root, name),
      this.getOrCreateSubcollection
    );
  }

  inspectCollection(path: readonly string[]): DocData[] {
    let collections = this.root;

    for (let index = 0; index < path.length - 1; index += 2) {
      const collectionName = path[index];
      const docId = path[index + 1];
      const docs = this.getOrCreateCollection(collections, collectionName);
      const doc = docs.get(docId);
      if (!doc) return [];
      collections = doc.subcollections;
    }

    const targetCollection = this.getOrCreateCollection(collections, path[path.length - 1]);
    return [...targetCollection.values()]
      .map((state) => state.data)
      .filter((data): data is DocData => data !== undefined);
  }

  private getOrCreateCollection(
    collections: Map<string, Map<string, FakeDocState>>,
    name: string
  ): Map<string, FakeDocState> {
    let collection = collections.get(name);
    if (!collection) {
      collection = new Map();
      collections.set(name, collection);
    }
    return collection;
  }
}

function createMockLlm(): OpenRouterService {
  return {
    complete: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        coordinators: [
          {
            coordinatorId: 'admin_coordinator',
            actions: [
              {
                actionId: 'admin-suggested-1',
                label: 'Review Weekly Priorities',
                subLabel: 'Align what matters most this week.',
                icon: 'sparkles',
                promptText: 'Please review my weekly priorities and tell me what to do first.',
              },
              {
                actionId: 'admin-suggested-2',
                label: 'Check Open Deadlines',
                subLabel: 'Surface deadlines I should act on now.',
                icon: 'calendar',
                promptText: 'Please surface the deadlines I should act on right now.',
              },
              {
                actionId: 'admin-suggested-3',
                label: 'Plan My Admin Week',
                subLabel: 'Turn this week into a clear checklist.',
                icon: 'list',
                promptText: 'Please turn my admin week into a clear checklist with priorities.',
              },
            ],
          },
        ],
      }),
      parsedOutput: {
        coordinators: [
          {
            coordinatorId: 'admin_coordinator',
            actions: [
              {
                actionId: 'admin-suggested-1',
                label: 'Review Weekly Priorities',
                subLabel: 'Align what matters most this week.',
                icon: 'sparkles',
                promptText: 'Please review my weekly priorities and tell me what to do first.',
              },
              {
                actionId: 'admin-suggested-2',
                label: 'Check Open Deadlines',
                subLabel: 'Surface deadlines I should act on now.',
                icon: 'calendar',
                promptText: 'Please surface the deadlines I should act on right now.',
              },
              {
                actionId: 'admin-suggested-3',
                label: 'Plan My Admin Week',
                subLabel: 'Turn this week into a clear checklist.',
                icon: 'list',
                promptText: 'Please turn my admin week into a clear checklist with priorities.',
              },
            ],
          },
        ],
      },
      toolCalls: [],
      model: 'test-model',
      usage: { inputTokens: 100, outputTokens: 100, totalTokens: 200 },
      latencyMs: 20,
      costUsd: 0.01,
      finishReason: 'stop',
    }),
  } as unknown as OpenRouterService;
}

describe('AgentGenerationService.generateWeeklySuggestedActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips generation without recent activity when not forced', async () => {
    const llm = createMockLlm();
    const contextBuilder = {
      buildPromptContext: vi.fn(),
      compressToPrompt: vi.fn(),
    } as unknown as ContextBuilder;
    const fakeDb = new FakeFirestore({
      userId: 'user-1',
      userData: {
        role: 'athlete',
        primarySport: 'football',
      },
    });

    const service = new AgentGenerationService(llm, contextBuilder, fakeDb as unknown as Firestore);

    const result = await service.generateWeeklySuggestedActions(
      'user-1',
      false,
      fakeDb as unknown as Firestore
    );

    expect(result).toBeNull();
    expect(vi.mocked(llm.complete)).not.toHaveBeenCalled();
  });

  it('generates and persists suggested actions on first load when forced', async () => {
    const llm = createMockLlm();
    const contextBuilder = {
      buildPromptContext: vi.fn().mockResolvedValue({
        profile: { userId: 'user-1', role: 'athlete', displayName: 'John Keller' },
        memories: { user: [], team: [], organization: [] },
        recentSyncSummaries: [],
      }),
      compressToPrompt: vi.fn().mockReturnValue('compressed-rag-context'),
    } as unknown as ContextBuilder;
    const fakeDb = new FakeFirestore({
      userId: 'user-1',
      userData: {
        role: 'athlete',
        primarySport: 'football',
      },
    });

    const service = new AgentGenerationService(llm, contextBuilder, fakeDb as unknown as Firestore);

    const result = await service.generateWeeklySuggestedActions(
      'user-1',
      true,
      fakeDb as unknown as Firestore
    );

    expect(result).not.toBeNull();
    expect(result?.coordinators).toHaveLength(1);
    expect(result?.coordinators[0]?.actions).toHaveLength(3);
    expect(vi.mocked(llm.complete)).toHaveBeenCalledTimes(1);

    const savedSuggestedActions = fakeDb.inspectCollection([
      'Users',
      'user-1',
      'agent_suggested_actions',
    ]);
    expect(savedSuggestedActions).toHaveLength(1);
    expect(savedSuggestedActions[0]?.['coordinators']).toBeDefined();
  });
});
