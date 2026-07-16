import '@angular/compiler';

import { Injector, NgZone, PLATFORM_ID, runInInjectionContext } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NxtOverlayService } from '../../components/overlay';
import { HapticsService } from '../../services/haptics/haptics.service';
import { NxtHeaderPortalService } from '../../services/header-portal';
import { NxtToastService } from '../../services/toast/toast.service';
import { UsageService } from '../usage.service';
import { UsageShellWebComponent } from './usage-shell-web.component';

type UsageShellWebTestAccess = UsageShellWebComponent & {
  onBuyCredits(): Promise<void>;
  onManageBilling(): Promise<void>;
};

describe('UsageShellWebComponent analytics', () => {
  const usageService = {
    trackCreditPurchaseViewed: vi.fn(),
    trackCreditPackageListViewed: vi.fn(),
    trackPaymentInfoAdded: vi.fn(),
    openBillingPortal: vi.fn().mockResolvedValue(undefined),
    autoTopUpEnabled: vi.fn().mockReturnValue(false),
    autoTopUpThresholdCents: vi.fn().mockReturnValue(500),
    autoTopUpAmountCents: vi.fn().mockReturnValue(1000),
    defaultPaymentMethod: vi.fn().mockReturnValue({ brand: 'visa' }),
    isOrgAdmin: vi.fn().mockReturnValue(true),
    billingContext: vi.fn().mockReturnValue({ organizationId: 'org_123' }),
  };
  const overlay = {
    open: vi.fn().mockReturnValue({
      closed: Promise.resolve({ reason: 'close', data: null }),
    }),
  };
  const haptics = {
    impact: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    usageService.trackCreditPurchaseViewed.mockReset();
    usageService.trackCreditPackageListViewed.mockReset();
    usageService.trackPaymentInfoAdded.mockReset();
    usageService.openBillingPortal.mockClear();
    overlay.open.mockClear();
    haptics.impact.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks view_item and view_item_list when add credits is opened', async () => {
    const component = createComponent();
    const testAccess = component as UsageShellWebTestAccess;

    await testAccess.onBuyCredits();

    expect(usageService.trackCreditPurchaseViewed).toHaveBeenCalledWith('org_123');
    expect(usageService.trackCreditPackageListViewed).toHaveBeenCalledWith('org_123');
    expect(overlay.open).toHaveBeenCalled();
  });

  it('tracks add_payment_info when billing management is opened', async () => {
    const component = createComponent();
    const testAccess = component as UsageShellWebTestAccess;

    await testAccess.onManageBilling();

    expect(usageService.trackPaymentInfoAdded).toHaveBeenCalledWith('usage_manage_billing');
    expect(usageService.openBillingPortal).toHaveBeenCalled();
  });

  function createComponent(): UsageShellWebComponent {
    const injector = Injector.create({
      providers: [
        { provide: UsageService, useValue: usageService },
        { provide: NxtOverlayService, useValue: overlay },
        {
          provide: NxtHeaderPortalService,
          useValue: { setCenterContent: vi.fn(), setRightContent: vi.fn(), clearAll: vi.fn() },
        },
        { provide: NxtToastService, useValue: { info: vi.fn(), warning: vi.fn() } },
        { provide: HapticsService, useValue: haptics },
        { provide: NgZone, useValue: { runOutsideAngular: (fn: () => void) => fn() } },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });

    return runInInjectionContext(injector, () => new UsageShellWebComponent());
  }
});
