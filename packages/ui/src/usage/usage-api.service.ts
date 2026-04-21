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
import {
  createUsageApi,
  type UsageApi,
  type UsageDashboardData,
  type BillingStateSummary,
  type UsageTimeframe,
} from '@nxt1/core';

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

  private readonly noCacheOptions = { headers: { 'X-No-Cache': '1' } };

  private readonly api = createUsageApi(
    {
      get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
      post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
      put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
      patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
      delete: <T>(url: string, config?: { params?: Record<string, string | number | boolean> }) =>
        firstValueFrom(this.http.delete<T>(url, config?.params ? { params: config.params } : {})),
    },
    this.baseUrl
  );

  // ── Dashboard ────────────────────────────────

  readonly getDashboard: UsageApi['getDashboard'] = this.api.getDashboard;

  async getDashboardFresh(timeframe?: UsageTimeframe): Promise<UsageDashboardData> {
    const response = await firstValueFrom(
      this.http.get<{
        success: boolean;
        data?: UsageDashboardData;
        error?: string;
      }>(`${this.baseUrl}/usage/dashboard`, {
        ...this.noCacheOptions,
        params: timeframe ? { timeframe } : undefined,
      })
    );

    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Failed to fetch usage dashboard');
    }

    return response.data;
  }

  /**
   * Bust the HTTP cache for all billing-related endpoints.
   * Call this before loadDashboard() when a mutation has changed the billing
   * state (e.g. billing mode switch) so the next GET is fresh.
   * Fires both requests in parallel for minimum latency.
   */
  bustDashboardCache(): Promise<void> {
    return Promise.all([
      firstValueFrom(
        this.http.get<unknown>(`${this.baseUrl}/usage/dashboard`, this.noCacheOptions)
      ).catch(() => void 0),
      firstValueFrom(
        this.http.get<unknown>(`${this.baseUrl}/billing/budget`, this.noCacheOptions)
      ).catch(() => void 0),
    ]).then(() => void 0);
  }
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

  async getBudgetsFresh() {
    const response = await firstValueFrom(
      this.http.get<{
        success: boolean;
        data?: readonly import('@nxt1/core').UsageBudget[];
        error?: string;
      }>(`${this.baseUrl}/usage/budgets`, this.noCacheOptions)
    );

    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Failed to fetch budgets');
    }

    return response.data;
  }

  // ── Downloads & Coupons ──────────────────────

  readonly getReceiptUrl: UsageApi['getReceiptUrl'] = this.api.getReceiptUrl;
  readonly getInvoiceUrl: UsageApi['getInvoiceUrl'] = this.api.getInvoiceUrl;
  readonly redeemCoupon: UsageApi['redeemCoupon'] = this.api.redeemCoupon;

  // ── Budget Management ────────────────────────

  readonly getBillingState: UsageApi['getBillingState'] = this.api.getBillingState;

  async getBillingStateFresh(): Promise<BillingStateSummary> {
    const response = await firstValueFrom(
      this.http.get<{
        success: boolean;
        data?: BillingStateSummary;
        error?: string;
      }>(`${this.baseUrl}/billing/budget`, this.noCacheOptions)
    );

    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Failed to fetch billing state');
    }

    return response.data;
  }
  readonly updateBudget: UsageApi['updateBudget'] = this.api.updateBudget;
  readonly updateTeamBudget: UsageApi['updateTeamBudget'] = this.api.updateTeamBudget;
  readonly buyCredits: UsageApi['buyCredits'] = this.api.buyCredits;
  readonly confirmCheckoutSession: UsageApi['confirmCheckoutSession'] =
    this.api.confirmCheckoutSession;
  readonly deleteBudget: UsageApi['deleteBudget'] = this.api.deleteBudget;
  readonly deleteTeamBudget: UsageApi['deleteTeamBudget'] = this.api.deleteTeamBudget;
  readonly configureAutoTopUp: UsageApi['configureAutoTopUp'] = this.api.configureAutoTopUp;
  readonly setBillingMode: UsageApi['setBillingMode'] = this.api.setBillingMode;
  readonly requestInvoiceTopUp: UsageApi['requestInvoiceTopUp'] = this.api.requestInvoiceTopUp;
  // ── Stripe SetupIntent ────────────────────────────────────────────

  readonly getSetupIntent: UsageApi['getSetupIntent'] = this.api.getSetupIntent;
}
