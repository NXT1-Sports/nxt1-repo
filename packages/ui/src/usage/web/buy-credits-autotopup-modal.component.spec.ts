import { Injector, runInInjectionContext } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CREDIT_PACKAGES_USD } from '../buy-credits-flow.shared';
import { UsageService } from '../usage.service';
import { BuyCreditsAutoTopupModalComponent } from './buy-credits-autotopup-modal.component';

type BuyCreditsAutoTopupModalTestAccess = BuyCreditsAutoTopupModalComponent & {
  selectPackage(value: number): void;
  onCustomAmountInput(value: string): void;
  onBuyNow(): void;
  close: { emit(payload: unknown): void };
};

describe('BuyCreditsAutoTopupModalComponent analytics', () => {
  const usageService = {
    trackCreditPackageAddedToCart: vi.fn(),
    trackCreditCheckoutStarted: vi.fn(),
  };

  beforeEach(async () => {
    usageService.trackCreditPackageAddedToCart.mockReset();
    usageService.trackCreditCheckoutStarted.mockReset();
  });

  it('tracks add_to_cart immediately when a preset package is selected', () => {
    const component = createComponent();
    const testAccess = component as BuyCreditsAutoTopupModalTestAccess;

    testAccess.selectPackage(CREDIT_PACKAGES_USD[0]);

    expect(usageService.trackCreditPackageAddedToCart).toHaveBeenCalledWith(
      CREDIT_PACKAGES_USD[0] * 100,
      'org_123',
      { selection_type: 'preset' }
    );
  });

  it('tracks custom amounts as add_to_cart before begin_checkout on buy', () => {
    const component = createComponent();
    const testAccess = component as BuyCreditsAutoTopupModalTestAccess;
    const closeEmitSpy = vi.spyOn(testAccess.close, 'emit');

    testAccess.onCustomAmountInput('12.50');
    testAccess.onBuyNow();

    expect(usageService.trackCreditPackageAddedToCart).toHaveBeenCalledWith(1250, 'org_123', {
      selection_type: 'custom',
    });
    expect(usageService.trackCreditCheckoutStarted).toHaveBeenCalledWith(1250, 'org_123', {
      payment_method: 'stripe',
      checkout_type: 'direct_charge',
    });
    expect(closeEmitSpy).toHaveBeenCalledWith({ type: 'buy', amountCents: 1250 });
  });

  function createComponent(): BuyCreditsAutoTopupModalComponent {
    const injector = Injector.create({
      providers: [{ provide: UsageService, useValue: usageService }],
    });
    const component = runInInjectionContext(
      injector,
      () => new BuyCreditsAutoTopupModalComponent()
    );

    Object.assign(component as object, {
      organizationId: () => 'org_123',
      hasSavedDefaultMethod: () => true,
    });

    return component;
  }
});
