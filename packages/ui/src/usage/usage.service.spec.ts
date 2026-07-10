import '@angular/compiler';

import { Injector, NgZone, runInInjectionContext } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { NxtBrowserService } from '../services/browser/browser.service';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtModalService } from '../services/modal';
import { NxtToastService } from '../services/toast/toast.service';
import { UsageApiService } from './usage-api.service';
import { UsageService } from './usage.service';

describe('UsageService download analytics', () => {
  const api = {
    getReceiptUrl: vi.fn(),
    getInvoiceUrl: vi.fn(),
  };
  const browser = {
    open: vi.fn(),
  };
  const analytics = {
    trackEvent: vi.fn(),
  };
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  const modal = {
    withLoading: vi.fn(async (_config: unknown, action: () => Promise<unknown>) => action()),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    logger.child.mockReturnValue(logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks receipt downloads after fetching the receipt URL', async () => {
    api.getReceiptUrl.mockResolvedValue('https://example.com/receipt.pdf');
    const service = createService();

    await service.openReceipt('receipt_123');

    expect(api.getReceiptUrl).toHaveBeenCalledWith('receipt_123');
    expect(browser.open).toHaveBeenCalledWith({
      url: 'https://example.com/receipt.pdf',
      presentationStyle: 'fullscreen',
    });
    expect(analytics.trackEvent).toHaveBeenCalledWith('usage_receipt_downloaded', {
      recordId: 'receipt_123',
    });
  });

  it('tracks invoice downloads when the invoice URL is already cached on the record', async () => {
    const service = createService();
    (
      service as unknown as {
        _paymentHistory: { set: (value: Array<{ id: string; invoiceUrl: string }>) => void };
      }
    )._paymentHistory.set([{ id: 'invoice_123', invoiceUrl: 'https://example.com/invoice.pdf' }]);

    await service.openInvoice('invoice_123');

    expect(api.getInvoiceUrl).not.toHaveBeenCalled();
    expect(browser.open).toHaveBeenCalledWith({
      url: 'https://example.com/invoice.pdf',
      presentationStyle: 'fullscreen',
    });
    expect(analytics.trackEvent).toHaveBeenCalledWith('usage_invoice_downloaded', {
      recordId: 'invoice_123',
    });
  });
});

function createService(): UsageService {
  const injector = Injector.create({
    providers: [
      { provide: UsageApiService, useValue: api },
      {
        provide: HapticsService,
        useValue: {
          impact: vi.fn().mockResolvedValue(undefined),
          notification: vi.fn().mockResolvedValue(undefined),
        },
      },
      { provide: NxtToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: NxtBrowserService, useValue: browser },
      { provide: NxtModalService, useValue: modal },
      { provide: NxtLoggingService, useValue: logger },
      {
        provide: NxtBreadcrumbService,
        useValue: { trackStateChange: vi.fn(), trackUserAction: vi.fn() },
      },
      { provide: NgZone, useValue: { runOutsideAngular: (fn: () => void) => fn() } },
      { provide: ANALYTICS_ADAPTER, useValue: analytics },
    ],
  });

  return runInInjectionContext(injector, () => new UsageService());
}
