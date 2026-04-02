/**
 * @fileoverview Usage API Service — Angular HTTP Adapter
 * @module @nxt1/ui/usage
 * @version 2.0.0
 *
 * Angular HTTP adapter for the Usage/Billing Dashboard API.
 * Wraps the pure TypeScript API factory with Angular's HttpClient.
 */

import { Injectable, InjectionToken, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { createUsageApi, type UsageApi } from '@nxt1/core';

/**
 * Injection token for Usage API base URL.
 * Apps should provide this in their config:
 *
 * ```typescript
 * { provide: USAGE_API_BASE_URL, useFactory: () => environment.apiURL }
 * ```
 */
export const USAGE_API_BASE_URL = new InjectionToken<string>('USAGE_API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api/v1',
});

/**
 * Usage API Service.
 * Angular adapter for the pure TypeScript Usage API.
 */
@Injectable({ providedIn: 'root' })
export class UsageApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(USAGE_API_BASE_URL);

  private readonly api = createUsageApi(
    {
      get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
      post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
      put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
      patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
      delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
    },
    this.baseUrl
  );

  // ── Dashboard ────────────────────────────────

  readonly getDashboard: UsageApi['getDashboard'] = this.api.getDashboard;
  readonly getOverview: UsageApi['getOverview'] = this.api.getOverview;
  readonly getChartData: UsageApi['getChartData'] = this.api.getChartData;
  readonly getBreakdown: UsageApi['getBreakdown'] = this.api.getBreakdown;
  readonly getHistory: UsageApi['getHistory'] = this.api.getHistory;

  // ── Payment Methods (read-only display) ───

  readonly getPaymentMethods: UsageApi['getPaymentMethods'] = this.api.getPaymentMethods;

  // ── Stripe Customer Portal ───────────────

  readonly createPortalSession: UsageApi['createPortalSession'] = this.api.createPortalSession;

  // ── Billing Info (read-only, synced from Stripe) ──────

  readonly getBudgets: UsageApi['getBudgets'] = this.api.getBudgets;

  // ── Downloads & Coupons ──────────────────────

  readonly getReceiptUrl: UsageApi['getReceiptUrl'] = this.api.getReceiptUrl;
  readonly getInvoiceUrl: UsageApi['getInvoiceUrl'] = this.api.getInvoiceUrl;
  readonly redeemCoupon: UsageApi['redeemCoupon'] = this.api.redeemCoupon;

  // ── Budget Management ────────────────────────

  readonly getBillingContext: UsageApi['getBillingContext'] = this.api.getBillingContext;
  readonly updateBudget: UsageApi['updateBudget'] = this.api.updateBudget;
  readonly updateTeamBudget: UsageApi['updateTeamBudget'] = this.api.updateTeamBudget;
}
