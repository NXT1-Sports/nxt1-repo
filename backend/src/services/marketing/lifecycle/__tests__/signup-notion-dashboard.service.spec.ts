import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  enqueueSignupNotionDashboardEntry,
  processSignupNotionDashboardEntry,
  runSignupNotionDashboardSync,
} from '../signup-notion-dashboard.service.js';

const ORIGINAL_ENV = { ...process.env };

type StoredDocument = Record<string, unknown>;

interface FakeDocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;
  data(): StoredDocument | undefined;
  get(path: string): unknown;
}

interface FakeDocumentReference {
  readonly id: string;
  get(): Promise<FakeDocumentSnapshot>;
  update(payload: Record<string, unknown>): Promise<void>;
}

interface FakeTransaction {
  get(ref: FakeDocumentReference): Promise<FakeDocumentSnapshot>;
  update(ref: FakeDocumentReference, payload: Record<string, unknown>): Promise<void>;
}

interface FakeQuerySnapshot {
  readonly empty: boolean;
  readonly docs: readonly FakeDocumentSnapshot[];
  readonly size: number;
}

interface FakeQueryReference {
  doc(id: string): FakeDocumentReference;
  where(path: string, operator: '<=', value: unknown): FakeQueryReference;
  orderBy(path: string, direction?: 'asc' | 'desc'): FakeQueryReference;
  limit(limit: number): FakeQueryReference;
  get(): Promise<FakeQuerySnapshot>;
}

function cloneDocument<T>(value: T): T {
  return structuredClone(value);
}

function isDeleteTransform(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.constructor !== undefined &&
    value.constructor.name === 'DeleteTransform'
  );
}

function getNestedValue(record: StoredDocument | undefined, path: string): unknown {
  if (!record) return undefined;
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, record);
}

function setNestedValue(record: StoredDocument, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = record;

  for (const part of parts.slice(0, -1)) {
    const existing = current[part];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const finalKey = parts[parts.length - 1];
  if (!finalKey) return;

  if (isDeleteTransform(value)) {
    delete current[finalKey];
    return;
  }

  current[finalKey] = value;
}

function createSnapshot(id: string, document: StoredDocument | undefined): FakeDocumentSnapshot {
  return {
    id,
    exists: document !== undefined,
    data: () => (document ? cloneDocument(document) : undefined),
    get: (path: string) => cloneDocument(getNestedValue(document, path)),
  };
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function createFakeFirestore(initialUsers: Record<string, StoredDocument>) {
  const users = new Map<string, StoredDocument>(
    Object.entries(initialUsers).map(([id, user]) => [id, cloneDocument(user)])
  );

  const createDocumentReference = (id: string): FakeDocumentReference => ({
    id,
    get: async () => createSnapshot(id, users.get(id)),
    update: async (payload: Record<string, unknown>) => {
      const existing = users.get(id) ?? {};
      for (const [path, value] of Object.entries(payload)) {
        setNestedValue(existing, path, isDeleteTransform(value) ? value : cloneDocument(value));
      }
      users.set(id, existing);
    },
  });

  const createQueryReference = (queryLimit = Number.POSITIVE_INFINITY): FakeQueryReference => ({
    doc: (id: string) => createDocumentReference(id),
    where: () => createQueryReference(queryLimit),
    orderBy: () => createQueryReference(queryLimit),
    limit: (limit: number) => createQueryReference(limit),
    get: async () => {
      const dueUsers = [...users.entries()]
        .filter(([, user]) => {
          const nextAttemptAt = toDate(
            getNestedValue(user, 'lifecycle.signup.notionDashboard.nextAttemptAt')
          );
          return nextAttemptAt !== null && nextAttemptAt.getTime() <= Date.now();
        })
        .slice(0, queryLimit)
        .map(([id, user]) => createSnapshot(id, user));

      return {
        empty: dueUsers.length === 0,
        docs: dueUsers,
        size: dueUsers.length,
      };
    },
  });

  return {
    users,
    db: {
      collection: (name: string) => {
        if (name !== 'Users') throw new Error(`Unexpected collection: ${name}`);
        return createQueryReference();
      },
      runTransaction: async <T>(callback: (transaction: FakeTransaction) => Promise<T> | T) =>
        callback({
          get: (ref: FakeDocumentReference) => ref.get(),
          update: (ref: FakeDocumentReference, payload: Record<string, unknown>) =>
            ref.update(payload),
        }),
    } as unknown as FirebaseFirestore.Firestore,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function configureNotionEnv(): void {
  process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'true';
  process.env['NOTION_API_TOKEN'] = 'secret-test';
  process.env['NOTION_SIGNUP_DASHBOARD_DATABASE_ID'] = 'database-1';
  process.env['NOTION_SIGNUP_DASHBOARD_MAX_ATTEMPTS'] = '2';
}

describe('signup Notion dashboard lifecycle service', () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
  const now = new Date('2026-05-26T12:00:00.000Z');

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    fetchMock.mockReset();
    process.env = { ...ORIGINAL_ENV };
    configureNotionEnv();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it('queues a signup once and skips duplicate enqueue attempts', async () => {
    const { db, users } = createFakeFirestore({
      'user-1': {
        email: 'ava@example.com',
        role: 'coach',
        coach: { organization: 'Ava Elite Academy' },
        onboardingCompleted: true,
      },
    });

    const firstResult = await enqueueSignupNotionDashboardEntry({
      db,
      userId: 'user-1',
      environment: 'production',
      role: 'athlete',
    });
    const secondResult = await enqueueSignupNotionDashboardEntry({
      db,
      userId: 'user-1',
      environment: 'production',
      role: 'athlete',
    });

    expect(firstResult).toEqual({ status: 'queued' });
    expect(secondResult).toEqual({ status: 'skipped', reason: 'already-queued' });
    expect(getNestedValue(users.get('user-1'), 'lifecycle.signup.notionDashboard')).toMatchObject({
      status: 'queued',
      environment: 'production',
      idempotencyKey: 'signup-notion-dashboard:production:user-1',
      attemptCount: 0,
    });
  });

  it('syncs a queued user to Notion and preserves team and organization ids', async () => {
    const { db, users } = createFakeFirestore({
      'coach-1': {
        email: 'coach@example.com',
        firstName: 'Jordan',
        lastName: 'Reed',
        role: 'coach',
        onboardingCompleted: true,
        onboardingCompletedAt: now,
        sports: [
          {
            sport: 'Football',
            order: 0,
            team: {
              type: 'high-school',
              name: 'Alcoa Football',
              teamId: 'team-1',
              organizationId: 'org-1',
            },
          },
        ],
        lifecycle: {
          signup: {
            notionDashboard: {
              status: 'queued',
              environment: 'production',
              nextAttemptAt: now,
              attemptCount: 0,
            },
          },
        },
      },
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'page-1', url: 'https://notion.so/page-1' }));

    const result = await processSignupNotionDashboardEntry({
      db,
      userId: 'coach-1',
      environment: 'production',
      now,
    });

    const createCall = fetchMock.mock.calls.find(([, init]) => {
      return (
        init?.method === 'POST' &&
        typeof init?.body === 'string' &&
        String(init.body).includes('"parent"')
      );
    });

    const createBody = JSON.parse(String(createCall?.[1]?.body)) as {
      readonly properties: Record<string, unknown>;
    };

    expect(result).toEqual({
      userId: 'coach-1',
      outcome: 'created',
      pageId: 'page-1',
      pageUrl: 'https://notion.so/page-1',
    });
    const notes = (
      createBody.properties['Notes'] as {
        readonly rich_text: readonly [{ readonly text: { readonly content: string } }];
      }
    ).rich_text[0].text.content;
    expect(createBody.properties['Organization']).toEqual({
      title: [{ type: 'text', text: { content: 'Alcoa Football' } }],
    });
    expect(createBody.properties['Stage']).toEqual({ status: { name: 'Account Started' } });
    expect(createBody.properties['Type']).toEqual({ select: { name: 'High School' } });
    expect(notes).toContain('Team ID: team-1');
    expect(notes).toContain('Organization ID: org-1');
    expect(getNestedValue(users.get('coach-1'), 'lifecycle.signup.notionDashboard')).toMatchObject({
      status: 'created',
      pageId: 'page-1',
      pageUrl: 'https://notion.so/page-1',
    });
  });

  it('skips queued work when the stored environment does not match the cron environment', async () => {
    const { db } = createFakeFirestore({
      'staging-user': {
        email: 'staging@example.com',
        role: 'coach',
        coach: { organization: 'Staging Sports Club' },
        onboardingCompleted: true,
        lifecycle: {
          signup: {
            notionDashboard: {
              status: 'queued',
              environment: 'staging',
              nextAttemptAt: now,
              attemptCount: 0,
            },
          },
        },
      },
    });

    const result = await processSignupNotionDashboardEntry({
      db,
      userId: 'staging-user',
      environment: 'production',
      now,
    });

    expect(result).toEqual({
      userId: 'staging-user',
      outcome: 'skipped',
      reason: 'environment-mismatch',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks retryable Notion failures as failed with a future retry', async () => {
    const { db, users } = createFakeFirestore({
      'retry-user': {
        email: 'retry@example.com',
        role: 'coach',
        coach: { organization: 'Retry Athletics' },
        onboardingCompleted: true,
        lifecycle: {
          signup: {
            notionDashboard: {
              status: 'queued',
              environment: 'production',
              nextAttemptAt: now,
              attemptCount: 0,
            },
          },
        },
      },
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'rate limited' }, 429));

    const result = await processSignupNotionDashboardEntry({
      db,
      userId: 'retry-user',
      environment: 'production',
      now,
    });

    const state = getNestedValue(
      users.get('retry-user'),
      'lifecycle.signup.notionDashboard'
    ) as Record<string, unknown>;

    expect(result).toMatchObject({ userId: 'retry-user', outcome: 'failed' });
    expect(state['status']).toBe('failed');
    expect(state['attemptCount']).toBe(1);
    expect(state['nextAttemptAt']).toBeInstanceOf(Date);
  });

  it('dead-letters non-retryable Notion failures without scheduling another attempt', async () => {
    const { db, users } = createFakeFirestore({
      'dead-user': {
        email: 'dead@example.com',
        role: 'coach',
        coach: { organization: 'Dead Letter Prep' },
        onboardingCompleted: true,
        lifecycle: {
          signup: {
            notionDashboard: {
              status: 'queued',
              environment: 'production',
              nextAttemptAt: now,
              attemptCount: 0,
            },
          },
        },
      },
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'bad schema' }, 400));

    const result = await processSignupNotionDashboardEntry({
      db,
      userId: 'dead-user',
      environment: 'production',
      now,
    });

    const state = getNestedValue(
      users.get('dead-user'),
      'lifecycle.signup.notionDashboard'
    ) as Record<string, unknown>;

    expect(result).toMatchObject({ userId: 'dead-user', outcome: 'dead_letter' });
    expect(state['status']).toBe('dead_letter');
    expect(state['attemptCount']).toBe(1);
    expect(state['failedPermanentAt']).toBeInstanceOf(Date);
    expect(state['nextAttemptAt']).toBeUndefined();
  });

  it('dead-letters retryable failures after the configured max attempts', async () => {
    const { db, users } = createFakeFirestore({
      'exhausted-user': {
        email: 'exhausted@example.com',
        role: 'coach',
        coach: { organization: 'Exhausted Academy' },
        onboardingCompleted: true,
        lifecycle: {
          signup: {
            notionDashboard: {
              status: 'failed',
              environment: 'production',
              nextAttemptAt: now,
              attemptCount: 1,
            },
          },
        },
      },
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'rate limited' }, 429));

    const result = await processSignupNotionDashboardEntry({
      db,
      userId: 'exhausted-user',
      environment: 'production',
      now,
    });

    const state = getNestedValue(
      users.get('exhausted-user'),
      'lifecycle.signup.notionDashboard'
    ) as Record<string, unknown>;

    expect(result).toMatchObject({ userId: 'exhausted-user', outcome: 'dead_letter' });
    expect(state['status']).toBe('dead_letter');
    expect(state['attemptCount']).toBe(2);
    expect(state['nextAttemptAt']).toBeUndefined();
  });

  it('skips active processing leases without calling Notion', async () => {
    const { db } = createFakeFirestore({
      'leased-user': {
        email: 'leased@example.com',
        role: 'coach',
        coach: { organization: 'Leased Sports' },
        onboardingCompleted: true,
        lifecycle: {
          signup: {
            notionDashboard: {
              status: 'processing',
              environment: 'production',
              nextAttemptAt: now,
              leaseExpiresAt: new Date(now.getTime() + 60_000),
              attemptCount: 0,
            },
          },
        },
      },
    });

    const result = await processSignupNotionDashboardEntry({
      db,
      userId: 'leased-user',
      environment: 'production',
      now,
    });

    expect(result).toEqual({ userId: 'leased-user', outcome: 'skipped', reason: 'lease-active' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reclaims expired processing leases', async () => {
    const { db } = createFakeFirestore({
      'expired-lease-user': {
        email: 'expired@example.com',
        role: 'coach',
        coach: { organization: 'Expired League' },
        onboardingCompleted: true,
        lifecycle: {
          signup: {
            notionDashboard: {
              status: 'processing',
              environment: 'production',
              nextAttemptAt: now,
              leaseExpiresAt: new Date(now.getTime() - 60_000),
              attemptCount: 0,
            },
          },
        },
      },
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ results: [{ id: 'expired-page', url: 'https://notion.so/expired' }] })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'expired-page', url: 'https://notion.so/expired' })
    );

    const result = await processSignupNotionDashboardEntry({
      db,
      userId: 'expired-lease-user',
      environment: 'production',
      now,
    });

    expect(result).toEqual({
      userId: 'expired-lease-user',
      outcome: 'existing',
      pageId: 'expired-page',
      pageUrl: 'https://notion.so/expired',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('skips future retry windows without calling Notion', async () => {
    const { db } = createFakeFirestore({
      'future-user': {
        email: 'future@example.com',
        role: 'coach',
        coach: { organization: 'Future Program' },
        onboardingCompleted: true,
        lifecycle: {
          signup: {
            notionDashboard: {
              status: 'failed',
              environment: 'production',
              nextAttemptAt: new Date(now.getTime() + 60_000),
              attemptCount: 1,
            },
          },
        },
      },
    });

    const result = await processSignupNotionDashboardEntry({
      db,
      userId: 'future-user',
      environment: 'production',
      now,
    });

    expect(result).toEqual({ userId: 'future-user', outcome: 'skipped', reason: 'not-due' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('runs due queued users through the sync worker', async () => {
    const { db } = createFakeFirestore({
      'worker-user': {
        email: 'worker@example.com',
        role: 'coach',
        coach: { organization: 'Worker Football' },
        onboardingCompleted: true,
        lifecycle: {
          signup: {
            notionDashboard: {
              status: 'queued',
              environment: 'production',
              nextAttemptAt: now,
              attemptCount: 0,
            },
          },
        },
      },
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ results: [{ id: 'existing-page', url: 'https://notion.so/existing' }] })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'existing-page', url: 'https://notion.so/existing' })
    );

    const result = await runSignupNotionDashboardSync({
      db,
      environment: 'production',
      now,
      limit: 10,
    });

    expect(result).toMatchObject({
      processedCount: 1,
      existingCount: 1,
      failedCount: 0,
    });
  });
});
