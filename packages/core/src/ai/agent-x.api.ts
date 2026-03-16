/**
 * @fileoverview Agent X API Factory
 * @module @nxt1/core/ai
 * @version 1.0.0
 *
 * Pure TypeScript API factory for Agent X.
 * Uses HttpAdapter pattern for platform portability.
 * Enterprise error handling with NxtApiError factories.
 *
 * @example
 * ```typescript
 * // Angular (Web)
 * const api = createAgentXApi(angularHttpAdapter, environment.apiUrl);
 *
 * // Capacitor (Mobile)
 * const api = createAgentXApi(capacitorHttpAdapter, API_URL);
 *
 * // Node.js (Backend tests)
 * const api = createAgentXApi(fetchAdapter, 'http://localhost:3000');
 * ```
 */

import type { HttpAdapter } from '../api/http-adapter';
import type {
  AgentXChatRequest,
  AgentXChatResponse,
  AgentXQuickTask,
  AgentXMessage,
  AgentDashboardData,
  AgentDashboardGoal,
  AgentDashboardPlaybook,
} from './agent-x.types';
import { AGENT_X_ENDPOINTS } from './agent-x.constants';
import { externalServiceError, rateLimitError, isNxtApiError } from '../errors';

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Standard API response wrapper.
 */
interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly errorCode?: string;
}

/**
 * Tasks response from API.
 */
interface TasksResponse {
  readonly tasks: AgentXQuickTask[];
}

/**
 * History response from API.
 */
interface HistoryResponse {
  readonly messages: AgentXMessage[];
  readonly hasMore: boolean;
}

// ============================================
// API FACTORY
// ============================================

/**
 * Creates an Agent X API client using the provided HTTP adapter.
 *
 * @param http - Platform-specific HTTP adapter
 * @param baseUrl - Base URL for API requests
 * @returns Agent X API methods
 *
 * @example
 * ```typescript
 * const api = createAgentXApi(httpAdapter, 'https://api.nxt1.com');
 *
 * // Send a message
 * const response = await api.sendMessage({
 *   message: 'Help me find colleges',
 *   mode: 'recruiting',
 *   userContext: { role: 'athlete', sport: 'football' }
 * });
 *
 * // Get tasks for user role
 * const tasks = await api.getQuickTasks('athlete');
 * ```
 */
export function createAgentXApi(http: HttpAdapter, baseUrl: string) {
  /**
   * Build full endpoint URL.
   */
  const endpoint = (path: string): string => `${baseUrl}${path}`;

  return {
    /**
     * Send a chat message to Agent X.
     *
     * @param request - Chat request with message and context
     * @returns Chat response with assistant message
     * @throws NxtApiError on failure (network, rate limit, AI service error)
     */
    async sendMessage(request: AgentXChatRequest): Promise<AgentXChatResponse> {
      try {
        const response = await http.post<ApiResponse<AgentXChatResponse>>(
          endpoint(AGENT_X_ENDPOINTS.CHAT),
          request
        );

        if (!response.success) {
          // Map error codes to appropriate NxtApiError types
          const errorCode = response.errorCode ?? 'UNKNOWN';

          if (errorCode === 'RATE_LIMIT') {
            throw rateLimitError(60, 'api');
          }

          if (errorCode === 'AI_SERVICE_ERROR' || errorCode === 'OPENROUTER_ERROR') {
            throw externalServiceError('ai');
          }

          return {
            success: false,
            error: response.error ?? 'Failed to send message',
            errorCode: errorCode as AgentXChatResponse['errorCode'],
          };
        }

        return response.data ?? { success: false, error: 'No response data' };
      } catch (error) {
        // Re-throw NxtApiErrors
        if (isNxtApiError(error)) {
          throw error;
        }

        // Wrap network errors
        throw externalServiceError('ai', error);
      }
    },

    /**
     * Get quick tasks filtered by user role.
     *
     * @param role - User role to filter tasks
     * @returns List of quick tasks for the role
     */
    async getQuickTasks(role?: string): Promise<AgentXQuickTask[]> {
      try {
        const url = role
          ? `${endpoint(AGENT_X_ENDPOINTS.TASKS)}?role=${encodeURIComponent(role)}`
          : endpoint(AGENT_X_ENDPOINTS.TASKS);

        const response = await http.get<ApiResponse<TasksResponse>>(url);

        if (!response.success || !response.data) {
          return [];
        }

        return response.data.tasks;
      } catch {
        return [];
      }
    },

    /**
     * Get conversation history.
     *
     * @param limit - Maximum messages to retrieve
     * @param before - Get messages before this ID (pagination)
     * @returns Conversation history
     */
    async getHistory(limit = 50, before?: string): Promise<HistoryResponse> {
      try {
        let url = `${endpoint(AGENT_X_ENDPOINTS.HISTORY)}?limit=${limit}`;
        if (before) {
          url += `&before=${encodeURIComponent(before)}`;
        }

        const response = await http.get<ApiResponse<HistoryResponse>>(url);

        if (!response.success || !response.data) {
          return { messages: [], hasMore: false };
        }

        return response.data;
      } catch {
        return { messages: [], hasMore: false };
      }
    },

    /**
     * Clear conversation history.
     *
     * @returns Whether clear was successful
     */
    async clearHistory(): Promise<boolean> {
      try {
        const response = await http.delete<ApiResponse<void>>(endpoint(AGENT_X_ENDPOINTS.CLEAR));
        return response.success;
      } catch {
        return false;
      }
    },

    /**
     * Fetch the aggregated Agent X dashboard (briefing, playbook, operations, coordinators).
     * Backend resolves role-specific content based on the authenticated user.
     */
    async getDashboard(): Promise<AgentDashboardData | null> {
      try {
        const response = await http.get<ApiResponse<AgentDashboardData>>(
          endpoint(AGENT_X_ENDPOINTS.DASHBOARD)
        );
        return response.success ? (response.data ?? null) : null;
      } catch {
        return null;
      }
    },

    /**
     * Set or update the user's Agent X goals (max 2).
     */
    async setGoals(goals: readonly AgentDashboardGoal[]): Promise<boolean> {
      try {
        const response = await http.post<ApiResponse<void>>(endpoint(AGENT_X_ENDPOINTS.GOALS), {
          goals,
        });
        return response.success;
      } catch {
        return false;
      }
    },

    /**
     * Generate or regenerate the weekly playbook based on current goals.
     */
    async generatePlaybook(force = false): Promise<AgentDashboardPlaybook | null> {
      try {
        const response = await http.post<ApiResponse<AgentDashboardPlaybook>>(
          endpoint(AGENT_X_ENDPOINTS.PLAYBOOK_GENERATE),
          { force }
        );
        return response.success ? (response.data ?? null) : null;
      } catch {
        return null;
      }
    },

    /**
     * Stream a chat response (for real-time typing effect).
     * Note: Requires backend SSE support.
     *
     * @param request - Chat request
     * @param onChunk - Callback for each text chunk
     * @param onComplete - Callback when streaming completes
     * @param onError - Callback on error
     */
    streamMessage(
      request: AgentXChatRequest,
      onChunk: (text: string) => void,
      onComplete: (message: AgentXMessage) => void,
      onError: (error: string) => void
    ): AbortController {
      const controller = new AbortController();

      // Note: This is a placeholder for SSE streaming implementation
      // The actual implementation depends on the HTTP adapter supporting streams
      // For now, fall back to regular request with simulated streaming

      this.sendMessage(request)
        .then((response: AgentXChatResponse) => {
          if (response.success && response.message) {
            // Simulate streaming by chunking the response
            const content = response.message.content;
            const words = content.split(' ');
            let currentIndex = 0;

            const streamInterval = setInterval(() => {
              if (controller.signal.aborted) {
                clearInterval(streamInterval);
                return;
              }

              if (currentIndex < words.length) {
                const chunk = words.slice(0, currentIndex + 1).join(' ');
                onChunk(chunk);
                currentIndex++;
              } else {
                clearInterval(streamInterval);
                onComplete(response.message!);
              }
            }, 50);
          } else {
            onError(response.error ?? 'Unknown error');
          }
        })
        .catch((error: unknown) => {
          onError(error instanceof Error ? error.message : 'Network error');
        });

      return controller;
    },
  } as const;
}

/**
 * Type for the Agent X API instance.
 */
export type AgentXApi = ReturnType<typeof createAgentXApi>;
