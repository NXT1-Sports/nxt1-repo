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
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
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
  /** Error message from backend (on success: false responses) */
  readonly error?: string;
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

  // Tracks whether products in the `products` signal came from StoreKit (true)
  // or from the hardcoded fallback (false). purchaseProduct() only works after
  // getProducts() has populated the plugin's internal cache — if this is false,
  // we must reload before purchasing.
  private _storeKitLoaded = false;

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
        this.logger.warn('No IAP products returned from StoreKit — using fallback display prices');
        this._storeKitLoaded = false;
        this._loadFallbackProducts();
        return;
      }

      this._storeKitLoaded = true;
      this.products.set(this._mapProducts(products));
      this.logger.info('IAP products loaded from StoreKit', { count: products.length });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error('Failed to fetch IAP products from StoreKit', {
        error: err,
        message: errMsg,
      });
      this._storeKitLoaded = false;
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
      // NOTE: purchaseProduct() in the native plugin ALSO calls Product.products(for:)
      // internally — it does NOT rely on a separate cache from getProducts().
      // If getProducts() returned empty, purchaseProduct() will fail too with
      // "Cannot find product for id X". Both fail because Apple's StoreKit API
      // isn't returning these product IDs for this app.
      //
      // Root cause: either bundle ID mismatch with App Store Connect, or products
      // were recently approved and haven't propagated to Apple's servers yet
      // (can take 24–48 hours even after showing "Approved" in ASC).
      if (!this._storeKitLoaded) {
        this.logger.error('StoreKit products unavailable — purchase blocked', {
          productId,
          note: 'Product.products(for:) returned empty. Check bundle ID in ASC or wait for propagation.',
        });
        this.toast.error(
          'Purchase unavailable: App Store products not found. If products were recently added, please wait a few hours and try again.',
          { duration: 8000 }
        );
        return null;
      }

      // Generate a UUID token for this purchase — required by StoreKit 2 for
      // refund attribution via App Store Server Notifications webhook.
      // Must be RFC 4122 UUID format (iOS requirement).
      const appAccountToken = crypto.randomUUID();

      const transaction = await NativePurchases.purchaseProduct({
        productIdentifier: productId,
        productType: PURCHASE_TYPE.INAPP,
        isConsumable: true,
        appAccountToken,
      });

      this.logger.info('StoreKit transaction completed', {
        productId,
        transactionId: transaction.transactionId,
        hasJws: !!transaction.jwsRepresentation,
        environment: transaction.environment,
      });

      // Prefer jwsRepresentation (StoreKit 2) — backend handles both
      const jwsTransaction = transaction.jwsRepresentation ?? transaction.receipt;
      if (!jwsTransaction) {
        // Transaction completed in StoreKit (user was charged) but no JWS returned.
        // Do NOT say "Purchase failed" — show the reconciliation message instead.
        this.logger.error('Transaction completed but no JWS/receipt returned', {
          productId,
          transactionId: transaction.transactionId,
        });
        this.toast.warning('Purchase recorded — credits will appear shortly.', { duration: 4000 });
        return null;
      }

      // Verify with backend → credits wallet
      const result = await this._verifyWithBackend(
        jwsTransaction,
        transaction.transactionId,
        appAccountToken,
        transaction.environment
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Extract error code for diagnostics (StoreKit errors have a numeric code)
      const errorCode = (err as Record<string, unknown>)?.['code'] ?? 'unknown';

      // User-cancelled purchases are silent (SKError code 2)
      if (this._isUserCancelled(message)) {
        return null;
      }

      this.logger.error('IAP purchase failed', { productId, errorCode, message, error: err });

      // Show the raw StoreKit error on-screen so it can be diagnosed without Xcode.
      // Truncate to 120 chars to keep the toast readable.
      const displayMsg = message.length > 120 ? message.slice(0, 120) + '…' : message;
      this.toast.error(`Purchase failed: ${displayMsg}`, { duration: 6000 });
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
    transactionId: string,
    appAccountToken: string,
    transactionEnvironment?: 'Sandbox' | 'Production' | 'Xcode'
  ): Promise<number | null> {
    // Tell the backend which Apple environment to use for JWS verification.
    // Critical for TestFlight builds: they use a production binary but Apple
    // issues Sandbox JWS tokens, which would fail against the production verifier.
    const sandboxEnvironment =
      transactionEnvironment === 'Sandbox' || transactionEnvironment === 'Xcode';

    try {
      const response = await firstValueFrom(
        this.http.post<VerifyReceiptResponse>(`${this.baseUrl}/iap/verify-receipt`, {
          jwsTransaction,
          sandboxEnvironment,
          appAccountToken,
        })
      );

      // Defensive check for unexpected 200 success:false responses
      if (!response.success) {
        this.logger.error('Backend IAP verification returned success:false', {
          transactionId,
          error: response.error,
        });
        this.toast.error(response.error ?? 'Verification failed. Please contact support.');
        return null;
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
      if (err instanceof HttpErrorResponse) {
        const isNetworkError = err.status === 0;
        if (isNetworkError) {
          // No connectivity — Apple already charged the user; webhook will reconcile
          this.logger.error('Network error during IAP verification — webhook will reconcile', {
            transactionId,
            error: err.message,
          });
          this.toast.warning('Purchase recorded — credits will appear shortly.', {
            duration: 4000,
          });
        } else {
          // Backend explicitly rejected the transaction (4xx/5xx)
          const errBody = err.error as { error?: string } | null;
          const errMsg = errBody?.error ?? 'Verification failed. Please contact support.';
          this.logger.error('Backend IAP verification rejected', {
            transactionId,
            status: err.status,
            error: errMsg,
          });
          this.toast.error(`Purchase error: ${errMsg}`);
        }
      } else {
        // Unexpected non-HTTP error
        this.logger.error('Unexpected error during IAP verification', {
          transactionId,
          error: err,
        });
        this.toast.warning('Purchase recorded — credits will appear shortly.', { duration: 4000 });
      }
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
