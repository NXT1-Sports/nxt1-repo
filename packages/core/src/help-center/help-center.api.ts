/**
 * @fileoverview Help Center API Factory - Pure TypeScript
 * @module @nxt1/core/help-center
 * @version 1.0.0
 *
 * Pure functions for Help Center API calls.
 * 100% portable - NO platform dependencies.
 * Enterprise error handling with NxtApiError factories.
 *
 * Uses HttpAdapter pattern for cross-platform compatibility.
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  HelpCategoryId,
  HelpSearchFilter,
  ArticleFeedback,
  SupportTicketRequest,
  HelpCenterHomeResponse,
  HelpCategoryDetailResponse,
  HelpArticleResponse,
  HelpSearchApiResponse,
  ChatMessageResponse,
  SupportTicketResponse,
  ArticleFeedbackResponse,
} from './help-center.types';
import { HELP_API_ENDPOINTS, HELP_PAGINATION_DEFAULTS } from './help-center.constants';
import { createApiError, isNxtApiError } from '../errors';

// ============================================
// API FACTORY TYPE
// ============================================

export type HelpCenterApi = ReturnType<typeof createHelpCenterApi>;

// ============================================
// HELP CENTER API FACTORY
// ============================================

/**
 * Create Help Center API instance.
 *
 * @param http - Platform-specific HTTP adapter
 * @param baseUrl - Base URL for API endpoints
 * @returns Help Center API methods
 *
 * @example
 * ```typescript
 * // Web (Angular)
 * const api = createHelpCenterApi(angularHttpAdapter, environment.apiUrl);
 *
 * // Mobile (Capacitor)
 * const api = createHelpCenterApi(capacitorHttpAdapter, API_URL);
 *
 * // Usage
 * const home = await api.getHome();
 * const results = await api.search({ query: 'recruiting' });
 * ```
 */
export function createHelpCenterApi(http: HttpAdapter, baseUrl: string) {
  const buildUrl = (
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string => {
    const url = `${baseUrl}${path}`;
    if (!params) return url;

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });

    const queryString = searchParams.toString();
    return queryString ? `${url}?${queryString}` : url;
  };

  const replaceParams = (path: string, params: Record<string, string>): string => {
    let result = path;
    Object.entries(params).forEach(([key, value]) => {
      result = result.replace(`:${key}`, encodeURIComponent(value));
    });
    return result;
  };

  return {
    /**
     * Get help center home/landing page data.
     *
     * @param userType - Optional user type for personalization
     * @returns Home page data
     * @throws NxtApiError on failure
     */
    async getHome(userType?: string): Promise<HelpCenterHomeResponse> {
      try {
        const url = buildUrl(HELP_API_ENDPOINTS.HOME, { userType });
        const response = await http.get<HelpCenterHomeResponse>(url);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to fetch help center home',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message:
            error instanceof Error ? error.message : 'Unknown error fetching help center home',
        });
      }
    },

    /**
     * Get category detail with articles.
     *
     * @param categoryId - Category identifier
     * @param page - Page number
     * @param limit - Items per page
     * @returns Category detail with articles
     * @throws NxtApiError on failure
     */
    async getCategory(
      categoryId: HelpCategoryId,
      page: number = HELP_PAGINATION_DEFAULTS.INITIAL_PAGE,
      limit: number = HELP_PAGINATION_DEFAULTS.LIMIT
    ): Promise<HelpCategoryDetailResponse> {
      try {
        const path = replaceParams(HELP_API_ENDPOINTS.CATEGORY, { id: categoryId });
        const url = buildUrl(path, { page, limit });

        const response = await http.get<HelpCategoryDetailResponse>(url);

        if (!response.success) {
          throw createApiError('RES_NOT_FOUND', {
            message: response.error ?? `Category ${categoryId} not found`,
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error fetching category',
        });
      }
    },

    /**
     * Get single article by slug.
     *
     * @param slug - Article URL slug
     * @returns Article details
     * @throws NxtApiError on failure
     */
    async getArticle(slug: string): Promise<HelpArticleResponse> {
      try {
        const path = replaceParams(HELP_API_ENDPOINTS.ARTICLE, { slug });
        const url = `${baseUrl}${path}`;

        const response = await http.get<HelpArticleResponse>(url);

        if (!response.success) {
          throw createApiError('RES_NOT_FOUND', {
            message: response.error ?? `Article "${slug}" not found`,
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error fetching article',
        });
      }
    },

    /**
     * Search help center content.
     *
     * @param filter - Search filters and pagination
     * @returns Search results
     * @throws NxtApiError on failure
     */
    async search(filter: HelpSearchFilter): Promise<HelpSearchApiResponse> {
      try {
        const url = buildUrl(HELP_API_ENDPOINTS.SEARCH, {
          query: filter.query,
          categories: filter.categories?.join(','),
          types: filter.types?.join(','),
          userType: filter.userType,
          sortBy: filter.sortBy,
          sortOrder: filter.sortOrder,
          page: filter.page ?? HELP_PAGINATION_DEFAULTS.INITIAL_PAGE,
          limit: filter.limit ?? HELP_PAGINATION_DEFAULTS.LIMIT,
        });

        const response = await http.get<HelpSearchApiResponse>(url);

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Search failed',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error during search',
        });
      }
    },

    /**
     * Submit article feedback (helpful/not helpful).
     *
     * @param feedback - Feedback data
     * @returns Feedback response
     * @throws NxtApiError on failure
     */
    async submitFeedback(feedback: ArticleFeedback): Promise<ArticleFeedbackResponse> {
      try {
        const path = replaceParams(HELP_API_ENDPOINTS.FEEDBACK, { id: feedback.articleId });
        const url = `${baseUrl}${path}`;

        const response = await http.post<ArticleFeedbackResponse>(url, {
          isHelpful: feedback.isHelpful,
          feedback: feedback.feedback,
        });

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to submit feedback',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error submitting feedback',
        });
      }
    },

    /**
     * Send AI chat message.
     *
     * @param sessionId - Chat session ID
     * @param message - User message
     * @param userContext - Optional user context
     * @returns AI response message
     * @throws NxtApiError on failure
     */
    async sendChatMessage(
      sessionId: string,
      message: string,
      userContext?: { userType?: string; currentPage?: string }
    ): Promise<ChatMessageResponse> {
      try {
        const url = `${baseUrl}${HELP_API_ENDPOINTS.CHAT}`;

        const response = await http.post<ChatMessageResponse>(url, {
          sessionId,
          message,
          userContext,
        });

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to send chat message',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: error instanceof Error ? error.message : 'Unknown error in chat',
        });
      }
    },

    /**
     * Submit support ticket.
     *
     * @param ticket - Support ticket request
     * @returns Created ticket response
     * @throws NxtApiError on failure
     */
    async submitSupportTicket(ticket: SupportTicketRequest): Promise<SupportTicketResponse> {
      try {
        const url = `${baseUrl}${HELP_API_ENDPOINTS.SUPPORT}`;

        const response = await http.post<SupportTicketResponse>(url, ticket);

        if (!response.success) {
          throw createApiError('VAL_INVALID_INPUT', {
            message: response.error ?? 'Failed to submit support ticket',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message:
            error instanceof Error ? error.message : 'Unknown error submitting support ticket',
        });
      }
    },
  } as const;
}
