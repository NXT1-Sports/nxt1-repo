import { describe, expect, it, vi } from 'vitest';

import { UsageService } from './usage.service';

type UsageServiceMethodContext = {
  _paymentHistory: () => Array<{
    id: string;
    receiptUrl?: string | null;
    invoiceUrl?: string | null;
  }>;
  browser: { open: ReturnType<typeof vi.fn> };
  trackAnalyticsEvent: ReturnType<typeof vi.fn>;
  logger: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  runWithSharedLoader: ReturnType<typeof vi.fn>;
  api: {
    getReceiptUrl: ReturnType<typeof vi.fn>;
    getInvoiceUrl: ReturnType<typeof vi.fn>;
  };
  toast: { error: ReturnType<typeof vi.fn> };
};

describe('UsageService download analytics', () => {
  it('tracks receipt downloads after fetching the receipt URL', async () => {
    const ctx = createContext({
      receiptUrl: 'https://example.com/receipt.pdf',
    });

    await UsageService.prototype.openReceipt.call(ctx as never, 'receipt_123');

    expect(ctx.api.getReceiptUrl).toHaveBeenCalledWith('receipt_123');
    expect(ctx.browser.open).toHaveBeenCalledWith({
      url: 'https://example.com/receipt.pdf',
      presentationStyle: 'fullscreen',
    });
    expect(ctx.trackAnalyticsEvent).toHaveBeenCalledWith('usage_receipt_downloaded', {
      recordId: 'receipt_123',
    });
  });

  it('tracks invoice downloads when the invoice URL is already cached on the record', async () => {
    const ctx = createContext({
      paymentHistory: [{ id: 'invoice_123', invoiceUrl: 'https://example.com/invoice.pdf' }],
    });

    await UsageService.prototype.openInvoice.call(ctx as never, 'invoice_123');

    expect(ctx.api.getInvoiceUrl).not.toHaveBeenCalled();
    expect(ctx.browser.open).toHaveBeenCalledWith({
      url: 'https://example.com/invoice.pdf',
      presentationStyle: 'fullscreen',
    });
    expect(ctx.trackAnalyticsEvent).toHaveBeenCalledWith('usage_invoice_downloaded', {
      recordId: 'invoice_123',
    });
  });
});

function createContext(options?: {
  paymentHistory?: Array<{ id: string; receiptUrl?: string | null; invoiceUrl?: string | null }>;
  receiptUrl?: string;
  invoiceUrl?: string;
}): UsageServiceMethodContext {
  const paymentHistory = options?.paymentHistory ?? [];

  return {
    _paymentHistory: () => paymentHistory,
    browser: {
      open: vi.fn(),
    },
    trackAnalyticsEvent: vi.fn(),
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    },
    runWithSharedLoader: vi.fn(async (_config: unknown, action: () => Promise<unknown>) =>
      action()
    ),
    api: {
      getReceiptUrl: vi.fn().mockResolvedValue(options?.receiptUrl),
      getInvoiceUrl: vi.fn().mockResolvedValue(options?.invoiceUrl),
    },
    toast: {
      error: vi.fn(),
    },
  };
}
