/**
 * @fileoverview IapService — Apple In-App Purchases (StoreKit 2)
 * @module @nxt1/mobile/core/services
 *
 * Handles the full prepaid wallet top-up flow via Apple IAP:
 *   1. fetchProducts()  — load StoreKit product info (price, title)
 *   2. purchase(productId) — trigger StoreKit purchase sheet
 *   3. On success → POST /api/v1/iap/verify-receipt with jwsRepresentation
 *   4. Backend verifies via @apple/app-store-server-library + credits wallet
 *
 * Product IDs (must match App Store Connect → In-App Purchases):
 *   nxt1.wallet.100   $0.99   100 credits
 *   nxt1.wallet.500   $4.99   500 credits
 *   nxt1.wallet.1000  $9.99  1000 credits
 *   nxt1.wallet.2500 $24.99  2500 credits
 *   nxt1.wallet.5000 $49.99  5000 credits
 *
 * Usage:
 * ```typescript
 * const iap = inject(IapService);
 * await iap.fetchProducts();
 * await iap.purchase('nxt1.wallet.500');
 * ```
 */

import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import type { Product } from '@capgo/native-purchases';
import { NxtToastService } from '@nxt1/ui';
import { NxtLoggingService } from '@nxt1/ui';
import { USAGE_API_BASE_URL } from '@nxt1/ui';
import { NxtBottomSheetService } from '@nxt1/ui';
import type { BottomSheetAction } from '@nxt1/ui';

// ─── Constants ────────────────────────────────────────────────────────────

export const IAP_PRODUCT_IDS = [
  'nxt1.wallet.100',
  'nxt1.wallet.500',
  'nxt1.wallet.1000',
  'nxt1.wallet.2500',
  'nxt1.wallet.5000',
] as const;

export type IapProductId = (typeof IAP_PRODUCT_IDS)[number];

/** Credits each product adds to the wallet (in cents) */
export const IAP_CREDIT_MAP: Record<IapProductId, number> = {
  'nxt1.wallet.100': 100,
  'nxt1.wallet.500': 500,
  'nxt1.wallet.1000': 1000,
  'nxt1.wallet.2500': 2500,
  'nxt1.wallet.5000': 5000,
};

export interface IapProductDisplay {
  readonly productId: IapProductId;
  readonly credits: number;
  /** Formatted price string from StoreKit, e.g. "$0.99" */
  readonly priceString: string;
  readonly price: number;
  readonly currencyCode: string;
  readonly title: string;
}

// ─── Verify Receipt Response ──────────────────────────────────────────────

interface VerifyReceiptResponse {
  readonly success: boolean;
  readonly newBalanceCents: number;
  readonly transactionId: string;
  readonly message?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class IapService {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('IapService');
  private readonly baseUrl = inject(USAGE_API_BASE_URL);

  private readonly bottomSheet = inject(NxtBottomSheetService);

  // ── Reactive state ──────────────────────────────────────────────────────
  readonly products = signal<readonly IapProductDisplay[]>([]);
  readonly loading = signal(false);
  readonly purchasing = signal(false);

  // ── Platform check ──────────────────────────────────────────────────────
  readonly isSupported = Capacitor.getPlatform() === 'ios';

  // ============================================================
  // PUBLIC API
  // ============================================================

  /**
   * Load available products from App Store.
   * Call once on component init — results are cached in `products` signal.
   */
  async fetchProducts(): Promise<void> {
    if (!this.isSupported) {
      this.logger.warn('IAP not supported on this platform');
      this._loadFallbackProducts();
      return;
    }

    this.loading.set(true);
    try {
      const { products } = await NativePurchases.getProducts({
        productIdentifiers: [...IAP_PRODUCT_IDS],
        productType: PURCHASE_TYPE.INAPP,
      });

      if (products.length === 0) {
        this.logger.warn('No IAP products returned — check App Store Connect product IDs');
        this._loadFallbackProducts();
        return;
      }

      this.products.set(this._mapProducts(products));
      this.logger.info('IAP products loaded', { count: products.length });
    } catch (err) {
      this.logger.error('Failed to fetch IAP products', { error: err });
      this._loadFallbackProducts();
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Trigger the Apple purchase sheet for a product.
   * On success, sends the JWS transaction to the backend for verification.
   *
   * @returns updated wallet balance in cents, or null if purchase failed/cancelled
   */
  async purchase(productId: IapProductId): Promise<number | null> {
    if (!this.isSupported) {
      this.logger.warn('IAP purchase attempted on unsupported platform');
      this.toast.warning('In-app purchases are only available on iOS.');
      return null;
    }

    this.purchasing.set(true);
    try {
      const transaction = await NativePurchases.purchaseProduct({
        productIdentifier: productId,
        productType: PURCHASE_TYPE.INAPP,
        isConsumable: true,
      });

      this.logger.info('StoreKit transaction completed', {
        productId,
        transactionId: transaction.transactionId,
        hasJws: !!transaction.jwsRepresentation,
      });

      // Prefer jwsRepresentation (StoreKit 2) — backend handles both
      const jwsTransaction = transaction.jwsRepresentation ?? transaction.receipt;
      if (!jwsTransaction) {
        throw new Error('Transaction completed but no JWS or receipt returned from StoreKit');
      }

      // Verify with backend → credits wallet
      const result = await this._verifyWithBackend(jwsTransaction, transaction.transactionId);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // User-cancelled purchases are silent (SKError code 2)
      if (this._isUserCancelled(message)) {
        return null;
      }

      this.logger.error('IAP purchase failed', { productId, error: err });
      this.toast.error('Purchase failed. Please try again.');
      return null;
    } finally {
      this.purchasing.set(false);
    }
  }

  /**
   * Show a bottom sheet with available IAP products and trigger purchase on selection.
   * Fetches products from StoreKit if not yet loaded.
   *
   * Used as the `buyCreditsHandler` override in `UsageShellComponent` on iOS
   * so that tapping "Buy Credits" opens Apple IAP instead of Stripe.
   */
  async showProductsAndPurchase(): Promise<void> {
    // Ensure products are loaded
    if (this.products().length === 0) {
      await this.fetchProducts();
    }

    const products = this.products();
    if (products.length === 0) {
      this.toast.error('Unable to load available credit packages. Please try again.');
      return;
    }

    const result = await this.bottomSheet.show<BottomSheetAction>({
      title: 'Buy Credits',
      icon: 'card-outline',
      subtitle: 'Purchased via Apple In-App Purchase',
      actions: products.map((p) => ({
        label: `${p.credits.toLocaleString()} Credits — ${p.priceString}`,
        role: 'primary' as const,
      })),
    });

    if (!result?.confirmed) return;

    const selectedLabel = (result.data as BottomSheetAction | undefined)?.label;
    const selectedProduct = products.find(
      (p) => `${p.credits.toLocaleString()} Credits — ${p.priceString}` === selectedLabel
    );

    if (!selectedProduct) return;

    await this.purchase(selectedProduct.productId);
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private async _verifyWithBackend(
    jwsTransaction: string,
    transactionId: string
  ): Promise<number | null> {
    try {
      const response = await firstValueFrom(
        this.http.post<VerifyReceiptResponse>(`${this.baseUrl}/iap/verify-receipt`, {
          jwsTransaction,
        })
      );

      if (!response.success) {
        throw new Error(response.message ?? 'Backend verification failed');
      }

      this.logger.info('IAP verified by backend', {
        transactionId,
        newBalanceCents: response.newBalanceCents,
      });

      this.toast.success(
        `Credits added! New balance: $${(response.newBalanceCents / 100).toFixed(2)}`,
        { duration: 3000 }
      );

      return response.newBalanceCents;
    } catch (err) {
      this.logger.error('Backend IAP verification failed', { transactionId, error: err });
      // Do NOT show error toast for network issues — Apple already charged the user.
      // The webhook will process the transaction server-side as a fallback.
      this.toast.warning('Purchase recorded — credits will appear shortly.', { duration: 4000 });
      return null;
    }
  }

  private _mapProducts(raw: readonly Product[]): IapProductDisplay[] {
    return [...IAP_PRODUCT_IDS]
      .map((productId) => {
        const found = raw.find((p) => p.identifier === productId);
        if (!found) return null;
        return {
          productId,
          credits: IAP_CREDIT_MAP[productId],
          priceString: found.priceString,
          price: found.price,
          currencyCode: found.currencyCode,
          title: found.title,
        } satisfies IapProductDisplay;
      })
      .filter((p): p is IapProductDisplay => p !== null);
  }

  /** Fallback products with hardcoded USD prices when StoreKit is unavailable */
  private _loadFallbackProducts(): void {
    const fallback: IapProductDisplay[] = [
      {
        productId: 'nxt1.wallet.100',
        credits: 100,
        priceString: '$0.99',
        price: 0.99,
        currencyCode: 'USD',
        title: '100 Credits',
      },
      {
        productId: 'nxt1.wallet.500',
        credits: 500,
        priceString: '$4.99',
        price: 4.99,
        currencyCode: 'USD',
        title: '500 Credits',
      },
      {
        productId: 'nxt1.wallet.1000',
        credits: 1000,
        priceString: '$9.99',
        price: 9.99,
        currencyCode: 'USD',
        title: '1000 Credits',
      },
      {
        productId: 'nxt1.wallet.2500',
        credits: 2500,
        priceString: '$24.99',
        price: 24.99,
        currencyCode: 'USD',
        title: '2500 Credits',
      },
      {
        productId: 'nxt1.wallet.5000',
        credits: 5000,
        priceString: '$49.99',
        price: 49.99,
        currencyCode: 'USD',
        title: '5000 Credits',
      },
    ];
    this.products.set(fallback);
  }

  private _isUserCancelled(errorMessage: string): boolean {
    const lower = errorMessage.toLowerCase();
    return (
      lower.includes('cancel') ||
      lower.includes('cancelled') ||
      lower.includes('user cancelled') ||
      lower.includes('skpaymenttransactionstatefailed') ||
      lower.includes('domain=skerrordomain code=2')
    );
  }
}
