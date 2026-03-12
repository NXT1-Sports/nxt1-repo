/**
 * @fileoverview Help Center API Service - Angular HTTP Adapter
 * @module @nxt1/web/features/help-center
 * @version 1.0.0
 *
 * Angular HTTP adapter for Help Center API.
 * Wraps the pure TypeScript API factory with Angular's HttpClient
 * and Firebase Performance tracing.
 */

import { Injectable, inject, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  createHelpCenterApi,
  type HelpCenterApi,
  type HelpCategoryId,
  type HelpSearchFilter,
  type ArticleFeedback,
  type SupportTicketRequest,
  type HelpCenterHomeResponse,
  type HelpCategoryDetailResponse,
  type HelpArticleResponse,
  type HelpSearchApiResponse,
  type ArticleFeedbackResponse,
  type ChatMessageResponse,
  type SupportTicketResponse,
} from '@nxt1/core';
import { environment } from '../../../../environments/environment';
import { PerformanceService } from '../../../core/services/performance.service';
import { TRACE_NAMES, ATTRIBUTE_NAMES, METRIC_NAMES } from '@nxt1/core/performance';

/**
 * Injection token for Help Center API base URL.
 */
export const HELP_CENTER_API_BASE_URL = new InjectionToken<string>('HELP_CENTER_API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiURL,
});

/**
 * Help Center API Service.
 * Angular adapter wrapping the pure TypeScript Help Center API factory
 * with performance tracing on every operation.
 */
@Injectable({ providedIn: 'root' })
export class HelpCenterApiService implements HelpCenterApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(HELP_CENTER_API_BASE_URL);
  private readonly performance = inject(PerformanceService);

  private readonly api = createHelpCenterApi(
    {
      get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
      post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
      put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
      patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
      delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
    },
    this.baseUrl
  );

  // ============================================
  // DELEGATE TO PURE API WITH PERFORMANCE TRACING
  // ============================================

  getHome(userType?: string): Promise<HelpCenterHomeResponse> {
    return this.performance.trace(TRACE_NAMES.HELP_HOME_LOAD, () => this.api.getHome(userType), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'help_center',
      },
    });
  }

  getCategory(
    categoryId: HelpCategoryId,
    page?: number,
    limit?: number
  ): Promise<HelpCategoryDetailResponse> {
    return this.performance.trace(
      TRACE_NAMES.HELP_CATEGORY_LOAD,
      () => this.api.getCategory(categoryId, page, limit),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'help_center',
          category_id: categoryId,
        },
      }
    );
  }

  getArticle(slug: string): Promise<HelpArticleResponse> {
    return this.performance.trace(TRACE_NAMES.HELP_ARTICLE_LOAD, () => this.api.getArticle(slug), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'help_center',
        article_slug: slug,
      },
    });
  }

  search(filter: HelpSearchFilter): Promise<HelpSearchApiResponse> {
    return this.performance.trace(TRACE_NAMES.HELP_SEARCH, () => this.api.search(filter), {
      attributes: {
        [ATTRIBUTE_NAMES.FEATURE_NAME]: 'help_center',
        search_query: filter.query || '',
      },
      onSuccess: async (result, trace) => {
        const count = result.data?.results?.length ?? 0;
        await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, count);
      },
    });
  }

  submitFeedback(feedback: ArticleFeedback): Promise<ArticleFeedbackResponse> {
    return this.performance.trace(
      TRACE_NAMES.HELP_FEEDBACK_SUBMIT,
      () => this.api.submitFeedback(feedback),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'help_center',
          is_helpful: String(feedback.isHelpful),
        },
      }
    );
  }

  sendChatMessage(
    sessionId: string,
    message: string,
    userContext?: { userType?: string; currentPage?: string }
  ): Promise<ChatMessageResponse> {
    return this.api.sendChatMessage(sessionId, message, userContext);
  }

  submitSupportTicket(ticket: SupportTicketRequest): Promise<SupportTicketResponse> {
    return this.api.submitSupportTicket(ticket);
  }
}
