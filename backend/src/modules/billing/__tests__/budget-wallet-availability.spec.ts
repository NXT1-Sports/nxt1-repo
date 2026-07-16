import { describe, expect, it } from 'vitest';

import { checkBudgetFromContext } from '../budget.service.js';
import type { BillingState } from '../types/index.js';

function createBillingState(overrides: Partial<BillingState> = {}): BillingState {
  return {
    billingEntity: 'individual',
    monthlyBudget: 0,
    currentPeriodSpend: 0,
    periodStart: '2026-06-01T00:00:00.000Z',
    periodEnd: '2026-06-30T23:59:59.999Z',
    notified50: false,
    notified80: false,
    notified100: false,
    iapLowBalanceNotified: false,
    hardStop: true,
    paymentProvider: 'iap',
    walletBalanceCents: 0,
    pendingHoldsCents: 0,
    createdAt: new Date('2026-06-01T00:00:00.000Z') as never,
    updatedAt: new Date('2026-06-01T00:00:00.000Z') as never,
    ...overrides,
  };
}

describe('checkBudgetFromContext wallet availability messaging', () => {
  it('keeps the negative available wallet balance in insufficient-funds messaging', () => {
    const result = checkBudgetFromContext(
      createBillingState({
        walletBalanceCents: 0,
        pendingHoldsCents: 73,
      }),
      40
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Wallet balance of $-0.73 (available) is insufficient.');
    expect(result.budget).toBe(-73);
  });
});
