/**
 * @fileoverview Usage Dashboard API Factory
 * @module @nxt1/core/usage
 * @version 2.0.0
 *
 * Pure TypeScript API factory for the billing dashboard.
 * Uses HttpAdapter pattern for 100% portability (web + mobile).
 *
 * @author NXT1 Engineering
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  UsageDashboardData,
  UsageDashboardRequest,
  UsageDashboardResponse,
  UsageHistoryResponse,
  UsagePaymentMethod,
  UsagePaymentHistoryRecord,
  UsageOverview,
  UsageChartDataPoint,
  UsageBreakdownRow,
  UsageBudget,
  BillingContextSummary,
} from './usage.types';
import { USAGE_API_ENDPOINTS } from './usage.constants';

// ============================================
// API RESPONSE WRAPPERS
// ============================================

interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

// ============================================
// API FACTORY
// ============================================

/**
 * Create Usage Dashboard API client.
 * Pure factory — works with any HttpAdapter (Angular HttpClient, Capacitor, fetch).
 */
export function createUsageApi(http: HttpAdapter, baseUrl: string) {
  const endpoints = {
    dashboard: `${baseUrl}${USAGE_API_ENDPOINTS.dashboard}`,
    overview: `${baseUrl}${USAGE_API_ENDPOINTS.overview}`,
    chart: `${baseUrl}${USAGE_API_ENDPOINTS.chart}`,
    breakdown: `${baseUrl}${USAGE_API_ENDPOINTS.breakdown}`,
    history: `${baseUrl}${USAGE_API_ENDPOINTS.history}`,
    paymentMethods: `${baseUrl}${USAGE_API_ENDPOINTS.paymentMethods}`,
    portalSession: `${baseUrl}${USAGE_API_ENDPOINTS.portalSession}`,
    budgets: `${baseUrl}${USAGE_API_ENDPOINTS.budgets}`,
    downloadReceipt: `${baseUrl}${USAGE_API_ENDPOINTS.downloadReceipt}`,
    downloadInvoice: `${baseUrl}${USAGE_API_ENDPOINTS.downloadInvoice}`,
    redeemCoupon: `${baseUrl}${USAGE_API_ENDPOINTS.redeemCoupon}`,
    budget: `${baseUrl}${USAGE_API_ENDPOINTS.budget}`,
    budgetTeam: `${baseUrl}${USAGE_API_ENDPOINTS.budgetTeam}`,
  } as const;

  return {
    /** Fetch complete dashboard data */
    async getDashboard(params?: UsageDashboardRequest): Promise<UsageDashboardData> {
      const queryParams = new URLSearchParams();
      if (params?.timeframe) queryParams.set('timeframe', params.timeframe);
      if (params?.periodStart) queryParams.set('periodStart', params.periodStart);
      if (params?.periodEnd) queryParams.set('periodEnd', params.periodEnd);
      if (params?.productFilter) queryParams.set('productFilter', params.productFilter);
      if (params?.searchQuery) queryParams.set('q', params.searchQuery);
      if (params?.groupBy) queryParams.set('groupBy', params.groupBy);

      const qs = queryParams.toString();
      const url = qs ? `${endpoints.dashboard}?${qs}` : endpoints.dashboard;

      const response = await http.get<UsageDashboardResponse>(url);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch usage dashboard');
      }
      return response.data;
    },

    /** Fetch overview cards only */
    async getOverview(): Promise<UsageOverview> {
      const response = await http.get<ApiResponse<UsageOverview>>(endpoints.overview);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch usage overview');
      }
      return response.data;
    },

    /** Fetch chart data for a timeframe */
    async getChartData(timeframe: string): Promise<readonly UsageChartDataPoint[]> {
      const url = `${endpoints.chart}?timeframe=${encodeURIComponent(timeframe)}`;
      const response = await http.get<ApiResponse<readonly UsageChartDataPoint[]>>(url);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch chart data');
      }
      return response.data;
    },

    /** Fetch breakdown rows for a timeframe */
    async getBreakdown(timeframe: string): Promise<readonly UsageBreakdownRow[]> {
      const url = `${endpoints.breakdown}?timeframe=${encodeURIComponent(timeframe)}`;
      const response = await http.get<ApiResponse<readonly UsageBreakdownRow[]>>(url);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch usage breakdown');
      }
      return response.data;
    },

    /** Fetch paginated payment history */
    async getHistory(
      page: number = 1,
      limit: number = 20
    ): Promise<{
      readonly records: readonly UsagePaymentHistoryRecord[];
      readonly total: number;
      readonly hasMore: boolean;
    }> {
      const url = `${endpoints.history}?page=${page}&limit=${limit}`;
      const response = await http.get<UsageHistoryResponse>(url);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch payment history');
      }
      return response.data;
    },

    /** Fetch saved payment methods (read-only display) */
    async getPaymentMethods(): Promise<readonly UsagePaymentMethod[]> {
      const response = await http.get<ApiResponse<readonly UsagePaymentMethod[]>>(
        endpoints.paymentMethods
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch payment methods');
      }
      return response.data;
    },

    /**
     * Create a Stripe Customer Portal session.
     * Returns the portal URL — the frontend redirects the user there.
     * All payment method, billing address, and invoice management happens on Stripe.
     */
    async createPortalSession(): Promise<string> {
      const response = await http.post<ApiResponse<string> & { url?: string }>(
        endpoints.portalSession,
        {}
      );
      // Backend returns { success, url } at top level
      const url = (response as { url?: string }).url ?? response.data;
      if (!response.success || !url) {
        throw new Error(response.error ?? 'Failed to create billing portal session');
      }
      return url;
    },

    /** Fetch budgets */
    async getBudgets(): Promise<readonly UsageBudget[]> {
      const response = await http.get<ApiResponse<readonly UsageBudget[]>>(endpoints.budgets);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch budgets');
      }
      return response.data;
    },

    /** Get a receipt download URL */
    async getReceiptUrl(transactionId: string): Promise<string> {
      const response = await http.get<ApiResponse<{ url: string }>>(
        `${endpoints.downloadReceipt}/${transactionId}`
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to get receipt');
      }
      return response.data.url;
    },

    /** Get an invoice download URL */
    async getInvoiceUrl(transactionId: string): Promise<string> {
      const response = await http.get<ApiResponse<{ url: string }>>(
        `${endpoints.downloadInvoice}/${transactionId}`
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to get invoice');
      }
      return response.data.url;
    },

    /** Redeem a coupon code */
    async redeemCoupon(code: string): Promise<void> {
      const response = await http.post<ApiResponse<void>>(endpoints.redeemCoupon, { code });
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to redeem coupon');
      }
    },

    // ── Budget Management ──────────────────────────────

    /** Fetch the user's billing context (budget, spend, billing entity) */
    async getBillingContext(): Promise<BillingContextSummary> {
      const response = await http.get<ApiResponse<BillingContextSummary>>(endpoints.budget);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to fetch billing context');
      }
      return response.data;
    },

    /** Update the user's monthly budget (in cents) */
    async updateBudget(monthlyBudget: number): Promise<void> {
      const response = await http.put<ApiResponse<void>>(endpoints.budget, { monthlyBudget });
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to update budget');
      }
    },

    /** Update a team's monthly budget (in cents) — team admin only */
    async updateTeamBudget(teamId: string, monthlyBudget: number): Promise<void> {
      const response = await http.put<ApiResponse<void>>(`${endpoints.budgetTeam}/${teamId}`, {
        monthlyBudget,
      });
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to update team budget');
      }
    },
  } as const;
}

/** Type derived from API factory */
export type UsageApi = ReturnType<typeof createUsageApi>;
