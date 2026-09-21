import { describe, expect, it } from 'vitest';
import {
  buildPersonalWalletTrial,
  shouldBackfillPersonalTrial,
} from '../backfill-personal-trials.js';

describe('backfill-personal-trials', () => {
  it('builds a 30-day active trial that preserves current wallet balance', () => {
    const startedAt = new Date('2026-08-01T00:00:00.000Z');

    const trial = buildPersonalWalletTrial(
      {
        balanceCents: 2500,
        createdAt: startedAt.toISOString(),
      },
      startedAt
    );

    expect(trial).toMatchObject({
      grantCents: 2500,
      status: 'active',
      convertedAt: null,
      conversionSource: null,
      displayMode: 'credits',
    });
    expect(trial.startedAt).toBe(startedAt.toISOString());
    expect(trial.expiresAt).toBe(new Date(startedAt.getTime() + 30 * 86_400_000).toISOString());
  });

  it('backfills users who already paid \u2014 paid users still get the trial', () => {
    const shouldBackfill = shouldBackfillPersonalTrial({
      walletExists: true,
      hasTrial: false,
      balanceCents: 2500,
    });

    expect(shouldBackfill).toBe(true);
  });

  it('skips users with no balance to preserve', () => {
    const shouldBackfill = shouldBackfillPersonalTrial({
      walletExists: true,
      hasTrial: false,
      balanceCents: 0,
    });

    expect(shouldBackfill).toBe(false);
  });

  it('allows backfill when wallet has credits', () => {
    const shouldBackfill = shouldBackfillPersonalTrial({
      walletExists: true,
      hasTrial: false,
      balanceCents: 2500,
    });

    expect(shouldBackfill).toBe(true);
  });
});
