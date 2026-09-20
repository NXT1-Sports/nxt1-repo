import { Injector, runInInjectionContext } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CREDIT_PACKAGES_USD } from '../buy-credits-flow.shared';
import { UsageService } from '../usage.service';
import { BuyCreditsAutoTopupModalComponent } from './buy-credits-autotopup-modal.component';

type BuyCreditsAutoTopupModalTestAccess = BuyCreditsAutoTopupModalComponent & {
  activeTab: { set(tab: 'buy' | 'auto-topup' | 'invoice'): void };
  headerTitle: () => string;
  headerIcon: () => string;
  selectPackage(value: number): void;
  onCustomAmountInput(value: string): void;
  onBuyNow(): void;
  selectInvoicePackage(value: number): void;
  onCustomInvoiceAmountInput(value: string): void;
  onRequestInvoice(): void;
  poNumber: { set(value: string): void };
  selectedNetDays: { set(value: 30): void };
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

  it('emits invoice request result with PO number and net payment terms', () => {
    const component = createComponent();
    const testAccess = component as BuyCreditsAutoTopupModalTestAccess;
    const closeEmitSpy = vi.spyOn(testAccess.close, 'emit');

    testAccess.selectInvoicePackage(1000);
    testAccess.poNumber.set('PO-2026-OHIO-01');
    testAccess.onRequestInvoice();

    expect(closeEmitSpy).toHaveBeenCalledWith({
      type: 'invoice',
      amountCents: 100_000,
      poNumber: 'PO-2026-OHIO-01',
      netDays: 30,
    });
  });

  it('updates modal header title and icon dynamically based on active tab', () => {
    const component = createComponent();
    const testAccess = component as BuyCreditsAutoTopupModalTestAccess;

    expect(testAccess.headerTitle()).toBe('Add Credits');
    expect(testAccess.headerIcon()).toBe('card-outline');

    testAccess.activeTab.set('auto-topup');
    expect(testAccess.headerTitle()).toBe('Auto Top-Up');
    expect(testAccess.headerIcon()).toBe('refresh-outline');

    testAccess.activeTab.set('invoice');
    expect(testAccess.headerTitle()).toBe('Pay by Invoice');
    expect(testAccess.headerIcon()).toBe('document-text-outline');
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
