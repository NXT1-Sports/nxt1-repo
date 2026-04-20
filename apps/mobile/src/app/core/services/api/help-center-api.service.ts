/**
 * @fileoverview Help Center API Service - Mobile HTTP Adapter
 * @module @nxt1/mobile/features/help-center
 * @version 1.0.0
 *
 * Capacitor HTTP adapter for Help Center API.
 * Uses CapacitorHttpAdapter for native HTTP with automatic auth headers.
 */

import { Injectable, inject } from '@angular/core';
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
import { CapacitorHttpAdapter } from '../../infrastructure';
import { environment } from '../../../../environments/environment';

/**
 * Help Center API Service.
 * Mobile adapter using CapacitorHttpAdapter for native networking with auth.
 */
@Injectable({ providedIn: 'root' })
export class HelpCenterApiService implements HelpCenterApi {
  private readonly http = inject(CapacitorHttpAdapter);

  private readonly api = createHelpCenterApi(this.http, environment.apiUrl);

  // ============================================
  // DELEGATE TO PURE API
  // ============================================

  getHome(userType?: string): Promise<HelpCenterHomeResponse> {
    return this.api.getHome(userType);
  }

  getCategory(
    categoryId: HelpCategoryId,
    page?: number,
    limit?: number
  ): Promise<HelpCategoryDetailResponse> {
    return this.api.getCategory(categoryId, page, limit);
  }

  getArticle(slug: string): Promise<HelpArticleResponse> {
    return this.api.getArticle(slug);
  }

  search(filter: HelpSearchFilter): Promise<HelpSearchApiResponse> {
    return this.api.search(filter);
  }

  submitFeedback(feedback: ArticleFeedback): Promise<ArticleFeedbackResponse> {
    return this.api.submitFeedback(feedback);
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
