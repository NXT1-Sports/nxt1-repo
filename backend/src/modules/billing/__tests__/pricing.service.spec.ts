import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

describe('calculateChargeAmount', () => {
  const mockGet = vi.fn();

  const db = {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: mockGet,
      })),
    })),
  } as unknown as Firestore;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('prefers coordinator overrides over feature overrides', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        defaultMultiplier: 3,
        featureOverrides: {
          brand_coordinator: 4,
          'activity-usage': 2,
        },
      }),
    });

    const { calculateChargeAmount } = await import('../pricing.service.js');

    const result = await calculateChargeAmount(db, 1.25, 'activity-usage', 'brand_coordinator');

    expect(result.multiplier).toBe(4);
    expect(result.overrideSource).toBe('coordinator');
    expect(result.chargeAmountCents).toBe(500);
  });

  it('falls back to the feature override when no coordinator override exists', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        defaultMultiplier: 3,
        featureOverrides: {
          'activity-usage': 2.5,
        },
      }),
    });

    const { calculateChargeAmount } = await import('../pricing.service.js');

    const result = await calculateChargeAmount(db, 1, 'activity-usage', 'unknown_coordinator');

    expect(result.multiplier).toBe(2.5);
    expect(result.overrideSource).toBe('feature');
    expect(result.chargeAmountCents).toBe(250);
  });

  it('falls back to default multiplier for unknown dynamic features', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        defaultMultiplier: 3,
        featureOverrides: {},
      }),
    });

    const { calculateChargeAmount } = await import('../pricing.service.js');

    const result = await calculateChargeAmount(
      db,
      0.75,
      'opponent-tendency-analysis',
      'unknown_coordinator'
    );

    expect(result.multiplier).toBe(3);
    expect(result.overrideSource).toBe('default');
    expect(result.chargeAmountCents).toBe(225);
  });
});
