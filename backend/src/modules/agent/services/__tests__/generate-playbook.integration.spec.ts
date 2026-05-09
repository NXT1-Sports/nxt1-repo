import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentDashboardGoal } from '@nxt1/core';
import type { ContextBuilder } from '../../memory/context-builder.js';
import type { OpenRouterService } from '../../llm/openrouter.service.js';
import type { Firestore } from 'firebase-admin/firestore';

const { dispatchAgentPushMock, getAgentAppConfigMock } = vi.hoisted(() => ({
  dispatchAgentPushMock: vi.fn().mockResolvedValue(undefined),
  getAgentAppConfigMock: vi.fn().mockResolvedValue({
    coordinators: [
      { id: 'admin', name: 'Admin Coordinator', icon: 'sparkles' },
      { id: 'strategy', name: 'Strategy Coordinator', icon: 'trophy-outline' },
    ],
  }),
}));

vi.mock('../agent-push-adapter.service.js', () => ({
  dispatchAgentPush: dispatchAgentPushMock,
}));

vi.mock('../../config/agent-app-config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/agent-app-config.js')>();
  return {
    ...actual,
    getAgentAppConfig: getAgentAppConfigMock,
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

  async set(data: DocData): Promise<void> {
    this.state.data = { ...data };
  }

  async update(data: DocData): Promise<void> {
    this.state.data = { ...(this.state.data ?? {}), ...data };
  }

  async delete(): Promise<void> {
    this.state.data = undefined;
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
      .sort((a, b) => {
        const aValue = a[1].data?.[this.field];
        const bValue = b[1].data?.[this.field];
        const normalizedA = typeof aValue === 'string' ? aValue : String(aValue ?? '');
        const normalizedB = typeof bValue === 'string' ? bValue : String(bValue ?? '');
        return this.direction === 'desc'
          ? normalizedB.localeCompare(normalizedA)
          : normalizedA.localeCompare(normalizedB);
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
  private autoId = 0;

  constructor(
    private readonly docs: Map<string, FakeDocState>,
    private readonly createSubcollection: (
      doc: FakeDocState,
      name: string
    ) => Map<string, FakeDocState>
  ) {}

  doc(id?: string): FakeDocRef {
    const resolvedId = id ?? `doc-${this.autoId++}`;
    let state = this.docs.get(resolvedId);
    if (!state) {
      state = { data: undefined, subcollections: new Map() };
      this.docs.set(resolvedId, state);
    }
    return new FakeDocRef(state, resolvedId, this.createSubcollection);
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): FakeQueryRef {
    return new FakeQueryRef(this.docs, this.createSubcollection, field, direction);
  }
}

class FakeBatch {
  private readonly operations: Array<() => Promise<void>> = [];

  set(ref: FakeDocRef, data: DocData): void {
    this.operations.push(() => ref.set(data));
  }

  update(ref: FakeDocRef, data: DocData): void {
    this.operations.push(() => ref.update(data));
  }

  async commit(): Promise<void> {
    for (const operation of this.operations) {
      await operation();
    }
  }
}

class FakeFirestore {
  private readonly root = new Map<string, Map<string, FakeDocState>>();
  private readonly getOrCreateSubcollection = (
    doc: FakeDocState,
    name: string
  ): Map<string, FakeDocState> => this.getOrCreateCollection(doc.subcollections, name);

  constructor(seed: { userId: string; userData: DocData; syncReports?: DocData[] }) {
    const users = this.getOrCreateCollection(this.root, 'Users');
    const userState: FakeDocState = {
      data: seed.userData,
      subcollections: new Map(),
    };
    users.set(seed.userId, userState);

    const syncReports = this.getOrCreateCollection(userState.subcollections, 'agent_sync_reports');
    for (const [index, report] of (seed.syncReports ?? []).entries()) {
      syncReports.set(`sync-${index + 1}`, { data: report, subcollections: new Map() });
    }
  }

  collection(name: string): FakeCollectionRef {
    return new FakeCollectionRef(
      this.getOrCreateCollection(this.root, name),
      this.getOrCreateSubcollection
    );
  }

  batch(): FakeBatch {
    return new FakeBatch();
  }

  inspectCollection(path: readonly string[]): DocData[] {
    if (path.length === 0) return [];

    let collections = this.root;

    for (let i = 0; i < path.length - 1; i += 2) {
      const collectionName = path[i];
      const docId = path[i + 1];
      const docs = this.getOrCreateCollection(collections, collectionName);
      const doc = docId ? docs.get(docId) : undefined;
      if (!doc) return [];
      collections = doc.subcollections;
    }

    const targetCollection = this.getOrCreateCollection(collections, path[path.length - 1]);

    return [...targetCollection.values()]
      .map((state) => state.data)
      .filter((data): data is DocData => data !== undefined);
  }

  private getOrCreateCollection = (
    collections: Map<string, Map<string, FakeDocState>>,
    name: string
  ): Map<string, FakeDocState> => {
    let collection = collections.get(name);
    if (!collection) {
      collection = new Map();
      collections.set(name, collection);
    }
    return collection;
  };
}

const activeGoals: AgentDashboardGoal[] = [
  {
    id: 'goal-recruiting',
    text: 'Get athletes recruited',
    category: 'recruiting',
    createdAt: '2026-04-27T00:00:00.000Z',
  },
  {
    id: 'goal-film',
    text: 'Review film',
    category: 'development',
    createdAt: '2026-04-27T00:00:00.000Z',
  },
  {
    id: 'goal-brand',
    text: 'Build brand presence',
    category: 'branding',
    createdAt: '2026-04-27T00:00:00.000Z',
  },
];

function createMockLlm(): OpenRouterService {
  return {
    complete: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        notificationTitle: 'Your recruiting push is ready',
        notificationBody: 'Update roster sheet · Send coach outreach batch',
        items: [
          {
            id: 'weekly-1',
            weekLabel: 'Weekly',
            title: 'Update roster sheet',
            summary: 'Refresh your weekly roster materials.',
            why: 'Consistency keeps your program ready for every contact window.',
            details: 'Agent X will prepare the updated roster materials for review.',
            actionLabel: 'Review Draft',
            goal: { id: 'recurring', label: 'Weekly Tasks' },
            coordinator: { id: 'admin', label: 'Admin Coordinator', icon: 'sparkles' },
          },
          {
            id: 'weekly-2',
            weekLabel: 'Weekly',
            title: 'Check recruiting replies',
            summary: 'Review inbound recruiting responses.',
            why: 'Quick follow-up keeps momentum with active conversations.',
            details: 'Agent X will organize the latest recruiting replies for follow-up.',
            actionLabel: 'Open Inbox',
            goal: { id: 'recurring', label: 'Weekly Tasks' },
            coordinator: { id: 'admin', label: 'Admin Coordinator', icon: 'sparkles' },
          },
          {
            id: 'goal-1a',
            weekLabel: 'Mon',
            title: 'Send coach outreach batch',
            summary: 'Reach out to top recruiting targets.',
            why: 'Spring evaluation windows are active for your recruiting goals.',
            details: 'Agent X will draft the next coach outreach batch for approval.',
            actionLabel: 'Send Emails',
            goal: { id: 'goal-recruiting', label: 'Get athletes recruited' },
            coordinator: { id: 'strategy', label: 'Strategy Coordinator', icon: 'trophy-outline' },
          },
          {
            id: 'goal-1b',
            weekLabel: 'Tue',
            title: 'Refine target list',
            summary: 'Prioritize the next recruiting list.',
            why: 'A tighter target list improves the quality of every outreach cycle.',
            details: 'Agent X will refine the recruiting target list for this week.',
            actionLabel: 'View Targets',
            goal: { id: 'goal-recruiting', label: 'Get athletes recruited' },
            coordinator: { id: 'strategy', label: 'Strategy Coordinator', icon: 'trophy-outline' },
          },
          {
            id: 'goal-2a',
            weekLabel: 'Wed',
            title: 'Review first-half clips',
            summary: 'Study the first-half possession film.',
            why: 'Film review gives immediate corrections before next competition.',
            details: 'Agent X will organize the first-half clips for your review session.',
            actionLabel: 'Watch Film',
            goal: { id: 'goal-film', label: 'Review film' },
            coordinator: { id: 'strategy', label: 'Strategy Coordinator', icon: 'trophy-outline' },
          },
          {
            id: 'goal-2b',
            weekLabel: 'Thu',
            title: 'Tag teaching clips',
            summary: 'Tag the clips that should be kept for teaching.',
            why: 'Your best clips become reusable teaching material all season.',
            details: 'Agent X will tag the best teaching clips for your next session.',
            actionLabel: 'Tag Clips',
            goal: { id: 'goal-film', label: 'Review film' },
            coordinator: { id: 'strategy', label: 'Strategy Coordinator', icon: 'trophy-outline' },
          },
          {
            id: 'goal-3a',
            weekLabel: 'Fri',
            title: 'Draft content calendar',
            summary: 'Plan the next week of brand content.',
            why: 'Consistent posting sharpens your visibility with athletes and families.',
            details: 'Agent X will draft the next brand content calendar for review.',
            actionLabel: 'View Calendar',
            goal: { id: 'goal-brand', label: 'Build brand presence' },
            coordinator: { id: 'admin', label: 'Admin Coordinator', icon: 'sparkles' },
          },
          {
            id: 'goal-3b',
            weekLabel: 'Fri',
            title: 'Prepare social recap',
            summary: 'Package this week into a social recap.',
            why: 'Weekly recaps keep your brand visible without reinventing the story.',
            details: 'Agent X will prepare the weekly social recap assets for review.',
            actionLabel: 'Review Assets',
            goal: { id: 'goal-brand', label: 'Build brand presence' },
            coordinator: { id: 'admin', label: 'Admin Coordinator', icon: 'sparkles' },
          },
        ],
      }),
      parsedOutput: {
        notificationTitle: 'Your recruiting push is ready',
        notificationBody: 'Update roster sheet · Send coach outreach batch',
        items: [
          {
            id: 'weekly-1',
            weekLabel: 'Weekly',
            title: 'Update roster sheet',
            summary: 'Refresh your weekly roster materials.',
            why: 'Consistency keeps your program ready for every contact window.',
            details: 'Agent X will prepare the updated roster materials for review.',
            actionLabel: 'Review Draft',
            goal: { id: 'recurring', label: 'Weekly Tasks' },
            coordinator: { id: 'admin', label: 'Admin Coordinator', icon: 'sparkles' },
          },
          {
            id: 'weekly-2',
            weekLabel: 'Weekly',
            title: 'Check recruiting replies',
            summary: 'Review inbound recruiting responses.',
            why: 'Quick follow-up keeps momentum with active conversations.',
            details: 'Agent X will organize the latest recruiting replies for follow-up.',
            actionLabel: 'Open Inbox',
            goal: { id: 'recurring', label: 'Weekly Tasks' },
            coordinator: { id: 'admin', label: 'Admin Coordinator', icon: 'sparkles' },
          },
          {
            id: 'goal-1a',
            weekLabel: 'Mon',
            title: 'Send coach outreach batch',
            summary: 'Reach out to top recruiting targets.',
            why: 'Spring evaluation windows are active for your recruiting goals.',
            details: 'Agent X will draft the next coach outreach batch for approval.',
            actionLabel: 'Send Emails',
            goal: { id: 'goal-recruiting', label: 'Get athletes recruited' },
            coordinator: { id: 'strategy', label: 'Strategy Coordinator', icon: 'trophy-outline' },
          },
          {
            id: 'goal-1b',
            weekLabel: 'Tue',
            title: 'Refine target list',
            summary: 'Prioritize the next recruiting list.',
            why: 'A tighter target list improves the quality of every outreach cycle.',
            details: 'Agent X will refine the recruiting target list for this week.',
            actionLabel: 'View Targets',
            goal: { id: 'goal-recruiting', label: 'Get athletes recruited' },
            coordinator: { id: 'strategy', label: 'Strategy Coordinator', icon: 'trophy-outline' },
          },
          {
            id: 'goal-2a',
            weekLabel: 'Wed',
            title: 'Review first-half clips',
            summary: 'Study the first-half possession film.',
            why: 'Film review gives immediate corrections before next competition.',
            details: 'Agent X will organize the first-half clips for your review session.',
            actionLabel: 'Watch Film',
            goal: { id: 'goal-film', label: 'Review film' },
            coordinator: { id: 'strategy', label: 'Strategy Coordinator', icon: 'trophy-outline' },
          },
          {
            id: 'goal-2b',
            weekLabel: 'Thu',
            title: 'Tag teaching clips',
            summary: 'Tag the clips that should be kept for teaching.',
            why: 'Your best clips become reusable teaching material all season.',
            details: 'Agent X will tag the best teaching clips for your next session.',
            actionLabel: 'Tag Clips',
            goal: { id: 'goal-film', label: 'Review film' },
            coordinator: { id: 'strategy', label: 'Strategy Coordinator', icon: 'trophy-outline' },
          },
          {
            id: 'goal-3a',
            weekLabel: 'Fri',
            title: 'Draft content calendar',
            summary: 'Plan the next week of brand content.',
            why: 'Consistent posting sharpens your visibility with athletes and families.',
            details: 'Agent X will draft the next brand content calendar for review.',
            actionLabel: 'View Calendar',
            goal: { id: 'goal-brand', label: 'Build brand presence' },
            coordinator: { id: 'admin', label: 'Admin Coordinator', icon: 'sparkles' },
          },
          {
            id: 'goal-3b',
            weekLabel: 'Fri',
            title: 'Prepare social recap',
            summary: 'Package this week into a social recap.',
            why: 'Weekly recaps keep your brand visible without reinventing the story.',
            details: 'Agent X will prepare the weekly social recap assets for review.',
            actionLabel: 'Review Assets',
            goal: { id: 'goal-brand', label: 'Build brand presence' },
            coordinator: { id: 'admin', label: 'Admin Coordinator', icon: 'sparkles' },
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

describe('AgentGenerationService.generatePlaybook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates and persists two weekly tasks plus two tasks for each active goal', async () => {
    const llm = createMockLlm();
    const contextBuilder = {
      buildPromptContext: vi.fn().mockResolvedValue({
        profile: { userId: 'user-1', role: 'coach', displayName: 'Coach Johnson' },
        memories: { user: [], team: [], organization: [] },
        recentSyncSummaries: [],
      }),
      compressToPrompt: vi.fn().mockReturnValue('compressed-rag-context'),
    } as unknown as ContextBuilder;

    const fakeDb = new FakeFirestore({
      userId: 'user-1',
      userData: {
        role: 'coach',
        sport: 'basketball',
        primarySport: 'basketball',
        agentGoals: activeGoals,
      },
    });

    const service = new AgentGenerationService(llm, contextBuilder);

    const result = await service.generatePlaybook('user-1', fakeDb as unknown as Firestore);

    expect(result.items).toHaveLength(8);
    expect(result.items.filter((item) => item.goal?.id === 'recurring')).toHaveLength(2);
    expect(result.items.filter((item) => item.goal?.id === 'goal-recruiting')).toHaveLength(2);
    expect(result.items.filter((item) => item.goal?.id === 'goal-film')).toHaveLength(2);
    expect(result.items.filter((item) => item.goal?.id === 'goal-brand')).toHaveLength(2);

    const llmCall = vi.mocked(llm.complete).mock.calls[0];
    const userPrompt = llmCall?.[0]?.[1]?.content;
    const llmOptions = llmCall?.[1];

    expect(typeof userPrompt).toBe('string');
    expect(String(userPrompt)).toContain('EXACTLY 8 playbook items');
    expect(String(userPrompt)).toContain(
      'For EACH active user goal listed above, return EXACTLY 2 items tied to that goal.'
    );
    expect(llmOptions).toMatchObject({ tier: 'task_automation' });

    const savedPlaybooks = fakeDb.inspectCollection(['Users', 'user-1', 'agent_playbooks']);
    expect(savedPlaybooks).toHaveLength(1);
    expect(savedPlaybooks[0]?.['items']).toHaveLength(8);

    expect(dispatchAgentPushMock).toHaveBeenCalledTimes(1);
  });
});
