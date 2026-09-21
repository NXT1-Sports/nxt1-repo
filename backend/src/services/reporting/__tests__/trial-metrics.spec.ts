import { describe, expect, it } from 'vitest';
import { computeTrialLifecycleMetrics } from '../trial-metrics.js';

interface FakeWalletDoc {
  readonly id: string;
  readonly ownerId: string;
  readonly ownerType: 'individual' | 'organization';
  readonly trial: {
    readonly status: 'active' | 'expired' | 'converted';
    readonly startedAt?: string;
    readonly expiresAt?: string;
    readonly convertedAt?: string | null;
  };
}

function createFakeFirestore(params: {
  readonly wallets: readonly FakeWalletDoc[];
  readonly users: Readonly<Record<string, Record<string, unknown>>>;
}) {
  const users = new Map(Object.entries(params.users));

  return {
    collection(name: string) {
      if (name === 'Wallets') {
        return {
          where(field: string, op: string, value: unknown) {
            if (field !== 'trial.status' || op !== 'in' || !Array.isArray(value)) {
              throw new Error(`Unsupported query: ${field} ${op}`);
            }
            const allowedStatuses = value as string[];
            return {
              get: async () => ({
                docs: params.wallets
                  .filter((wallet) => allowedStatuses.includes(wallet.trial.status))
                  .map((wallet) => ({ id: wallet.id, data: () => wallet })),
              }),
            };
          },
        };
      }

      if (name === 'Users') {
        return {
          doc: (id: string) => ({ id }),
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    },
    getAll: async (...refs: Array<{ id: string }>) =>
      refs.map((ref) => ({
        id: ref.id,
        data: () => users.get(ref.id),
      })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const periodStart = new Date('2026-09-01T00:00:00.000Z');
const periodEnd = new Date('2026-09-30T23:59:59.999Z');

describe('computeTrialLifecycleMetrics', () => {
  it('counts an unaffiliated individual wallet as personal', async () => {
    const db = createFakeFirestore({
      wallets: [
        {
          id: 'user-1',
          ownerId: 'user-1',
          ownerType: 'individual',
          trial: { status: 'active', startedAt: '2026-09-05T00:00:00.000Z' },
        },
      ],
      users: { 'user-1': {} },
    });

    const result = await computeTrialLifecycleMetrics(db, periodStart, periodEnd);

    expect(result.started).toEqual({ personal: 1, organization: 0, total: 1 });
  });

  it('excludes a personal wallet whose user is billing-routed to an organization', async () => {
    const db = createFakeFirestore({
      wallets: [
        {
          id: 'athlete-1',
          ownerId: 'athlete-1',
          ownerType: 'individual',
          trial: { status: 'active', startedAt: '2026-09-05T00:00:00.000Z' },
        },
      ],
      users: {
        'athlete-1': {
          activeBillingTarget: { ownerType: 'organization', organizationId: 'org-1' },
        },
      },
    });

    const result = await computeTrialLifecycleMetrics(db, periodStart, periodEnd);

    expect(result.started).toEqual({ personal: 0, organization: 0, total: 0 });
  });

  it('excludes a personal wallet for a user with an organizationId/teamId even on an individual owner type target', async () => {
    const db = createFakeFirestore({
      wallets: [
        {
          id: 'athlete-2',
          ownerId: 'athlete-2',
          ownerType: 'individual',
          trial: { status: 'active', startedAt: '2026-09-05T00:00:00.000Z' },
        },
      ],
      users: {
        'athlete-2': {
          activeBillingTarget: {
            ownerType: 'individual',
            organizationId: 'org-1',
            teamId: 'team-1',
          },
        },
      },
    });

    const result = await computeTrialLifecycleMetrics(db, periodStart, periodEnd);

    expect(result.started).toEqual({ personal: 0, organization: 0, total: 0 });
  });

  it('counts an organization wallet as organization', async () => {
    const db = createFakeFirestore({
      wallets: [
        {
          id: 'org:org-1',
          ownerId: 'org-1',
          ownerType: 'organization',
          trial: { status: 'active', startedAt: '2026-09-10T00:00:00.000Z' },
        },
      ],
      users: {},
    });

    const result = await computeTrialLifecycleMetrics(db, periodStart, periodEnd);

    expect(result.started).toEqual({ personal: 0, organization: 1, total: 1 });
  });

  it('computes conversion counts, conversion rate, and average days to conversion', async () => {
    const db = createFakeFirestore({
      wallets: [
        {
          id: 'user-converted',
          ownerId: 'user-converted',
          ownerType: 'individual',
          trial: {
            status: 'converted',
            startedAt: '2026-09-01T00:00:00.000Z',
            convertedAt: '2026-09-11T00:00:00.000Z',
          },
        },
        {
          id: 'user-expired',
          ownerId: 'user-expired',
          ownerType: 'individual',
          trial: {
            status: 'expired',
            startedAt: '2026-08-01T00:00:00.000Z',
            expiresAt: '2026-09-15T00:00:00.000Z',
          },
        },
      ],
      users: { 'user-converted': {}, 'user-expired': {} },
    });

    const result = await computeTrialLifecycleMetrics(db, periodStart, periodEnd);

    expect(result.converted).toEqual({ personal: 1, organization: 0, total: 1 });
    expect(result.expired).toEqual({ personal: 1, organization: 0, total: 1 });
    expect(result.conversionRatePercent).toEqual({ personal: 50, organization: 0, total: 50 });
    expect(result.avgDaysToConversion).toEqual({ personal: 10, organization: 0, total: 10 });
  });

  it('ignores trial events outside the reporting window', async () => {
    const db = createFakeFirestore({
      wallets: [
        {
          id: 'user-old',
          ownerId: 'user-old',
          ownerType: 'individual',
          trial: { status: 'active', startedAt: '2026-01-01T00:00:00.000Z' },
        },
      ],
      users: { 'user-old': {} },
    });

    const result = await computeTrialLifecycleMetrics(db, periodStart, periodEnd);

    expect(result.started).toEqual({ personal: 0, organization: 0, total: 0 });
  });
});
