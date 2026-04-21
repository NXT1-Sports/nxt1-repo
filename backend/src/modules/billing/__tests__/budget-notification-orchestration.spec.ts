import { describe, expect, it } from 'vitest';
import { determinePostDeductionWalletAlertKind } from '../budget.service.js';

describe('determinePostDeductionWalletAlertKind', () => {
  it('suppresses wallet-empty alerts when auto top-up succeeds', () => {
    expect(
      determinePostDeductionWalletAlertKind(0, true, true, {
        status: 'succeeded',
      })
    ).toBe('none');
  });

  it('suppresses low-balance alerts while another auto top-up is already in progress', () => {
    expect(
      determinePostDeductionWalletAlertKind(125, true, false, {
        status: 'in_progress',
        reason: 'lock_held',
      })
    ).toBe('none');
  });

  it('keeps wallet-empty alerts when auto top-up fails', () => {
    expect(
      determinePostDeductionWalletAlertKind(0, true, true, {
        status: 'failed',
        reason: 'charge_failed',
      })
    ).toBe('wallet_empty');
  });

  it('prefers threshold alerts over the generic low-balance alert', () => {
    expect(
      determinePostDeductionWalletAlertKind(400, true, true, {
        status: 'not_attempted',
      })
    ).toBe('credits_threshold');
  });

  it('falls back to the generic low-balance alert when no threshold alert applies', () => {
    expect(
      determinePostDeductionWalletAlertKind(175, true, false, {
        status: 'not_attempted',
      })
    ).toBe('low_balance');
  });
});
