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
  AgentDashboardBriefing,
  ShellWeeklyPlaybookItem,
  AgentXStreamCallbacks,
  AgentXStreamThreadEvent,
  AgentXStreamTitleUpdatedEvent,
  AgentXStreamDeltaEvent,
  AgentXStreamDoneEvent,
  AgentXStreamErrorEvent,
  AgentXStreamStepEvent,
  AgentXStreamCardEvent,
} from './agent-x.types';
import type { AgentMessage } from './chat.types';
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
 * History response from API (general chat history).
 */
interface HistoryResponse {
  readonly messages: AgentXMessage[];
  readonly hasMore: boolean;
}

/**
 * Thread messages response from API.
 * Uses the backend AgentMessage shape (createdAt, resultData, etc.)
 * rather than the UI AgentXMessage shape. Callers must map to AgentXMessage.
 */
export interface ThreadMessagesResponse {
  readonly messages: AgentMessage[];
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
     * Update the status of a single playbook item (e.g., mark as complete).
     *
     * @param itemId - The playbook item ID to update
     * @param status - New status for the item
     * @returns The updated item, or null on failure
     */
    async updatePlaybookItemStatus(
      itemId: string,
      status: ShellWeeklyPlaybookItem['status']
    ): Promise<ShellWeeklyPlaybookItem | null> {
      try {
        const response = await http.post<ApiResponse<ShellWeeklyPlaybookItem>>(
          `${endpoint(AGENT_X_ENDPOINTS.PLAYBOOK_ITEM_STATUS)}/${encodeURIComponent(itemId)}/status`,
          { status }
        );
        return response.success ? (response.data ?? null) : null;
      } catch {
        return null;
      }
    },

    /**
     * Generate or refresh the AI daily briefing based on goals and recent activity.
     *
     * @param force - When true, regenerates even if a fresh briefing already exists
     * @returns The generated briefing, or null on failure
     */
    async generateBriefing(force = false): Promise<AgentDashboardBriefing | null> {
      try {
        const response = await http.post<ApiResponse<AgentDashboardBriefing>>(
          endpoint(AGENT_X_ENDPOINTS.BRIEFING_GENERATE),
          { force }
        );
        return response.success ? (response.data ?? null) : null;
      } catch {
        return null;
      }
    },

    /**
     * Get messages for a specific thread (used for deep-link thread loading).
     *
     * @param threadId - The MongoDB thread ID to fetch messages for
     * @param limit - Maximum messages to retrieve (default 50, max 200)
     * @returns Messages array and pagination info, or null on failure
     */
    async getThreadMessages(threadId: string, limit = 50): Promise<ThreadMessagesResponse | null> {
      try {
        const url = `${endpoint(AGENT_X_ENDPOINTS.THREAD_MESSAGES)}/${encodeURIComponent(threadId)}/messages?limit=${limit}`;
        const response =
          await http.get<ApiResponse<{ items: AgentMessage[]; hasMore: boolean }>>(url);
        if (!response.success || !response.data) return null;
        return { messages: response.data.items, hasMore: response.data.hasMore };
      } catch {
        return null;
      }
    },

    /**
     * Check the Agent X system health status.
     *
     * Unauthenticated, CDN-cached (60s). Used by the status dot to determine
     * whether Agent X is operational, degraded, or down.
     *
     * @returns Current system status ('active' | 'degraded' | 'down')
     */
    async checkHealth(): Promise<'active' | 'degraded' | 'down'> {
      try {
        const response = await http.get<ApiResponse<{ status: 'active' | 'degraded' | 'down' }>>(
          endpoint(AGENT_X_ENDPOINTS.HEALTH)
        );
        return response.success && response.data ? response.data.status : 'degraded';
      } catch {
        return 'down';
      }
    },

    /**
     * Stream a chat response using the backend SSE endpoint.
     *
     * Connects to `POST /agent-x/chat` with `Accept: text/event-stream`.
     * The backend emits four event types:
     *   - `thread`  → { threadId } — sent immediately before LLM inference
     *   - `delta`   → { content } — one frame per LLM token
     *   - `done`    → { threadId, model, usage } — final frame
     *   - `error`   → { error } — on failure
     *
     * @param request   - Chat request payload
     * @param callbacks - Typed callbacks for each SSE event type
     * @param authToken - Bearer token for the Authorization header
     * @param baseUrl   - API base URL (full, including /api/v1/… prefix)
     * @returns AbortController — call `.abort()` to cancel the stream
     */
    streamMessage(
      request: AgentXChatRequest,
      callbacks: AgentXStreamCallbacks,
      authToken: string,
      streamBaseUrl: string
    ): AbortController {
      const controller = new AbortController();

      (async () => {
        try {
          const response = await fetch(`${streamBaseUrl}${AGENT_X_ENDPOINTS.CHAT}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify(request),
            signal: controller.signal,
          });

          if (!response.ok || !response.body) {
            callbacks.onError({ error: `HTTP ${response.status}: ${response.statusText}` });
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Split on double-newline (SSE frame boundary)
            const frames = buffer.split('\n\n');
            // Last element may be an incomplete frame — keep it in the buffer
            buffer = frames.pop() ?? '';

            for (const frame of frames) {
              if (!frame.trim()) continue;

              // Parse `event:` and `data:` lines within the frame
              let eventType = 'message';
              let dataLine = '';

              for (const line of frame.split('\n')) {
                if (line.startsWith('event:')) {
                  eventType = line.slice('event:'.length).trim();
                } else if (line.startsWith('data:')) {
                  dataLine = line.slice('data:'.length).trim();
                }
              }

              if (!dataLine) continue;

              try {
                const payload = JSON.parse(dataLine) as unknown;

                switch (eventType) {
                  case 'thread':
                    callbacks.onThread?.(payload as AgentXStreamThreadEvent);
                    break;
                  case 'delta':
                    callbacks.onDelta(payload as AgentXStreamDeltaEvent);
                    break;
                  case 'step': {
                    const step = payload as Record<string, unknown>;
                    if (
                      step &&
                      typeof step['id'] === 'string' &&
                      typeof step['label'] === 'string'
                    ) {
                      callbacks.onStep?.(step as unknown as AgentXStreamStepEvent);
                    }
                    break;
                  }
                  case 'card': {
                    const card = payload as Record<string, unknown>;
                    if (
                      card &&
                      typeof card['type'] === 'string' &&
                      typeof card['title'] === 'string' &&
                      card['payload'] != null
                    ) {
                      callbacks.onCard?.(card as unknown as AgentXStreamCardEvent);
                    }
                    break;
                  }
                  case 'title_updated': {
                    const titleEvt = payload as Record<string, unknown>;
                    if (
                      titleEvt &&
                      typeof titleEvt['threadId'] === 'string' &&
                      typeof titleEvt['title'] === 'string'
                    ) {
                      callbacks.onTitleUpdated?.(
                        titleEvt as unknown as AgentXStreamTitleUpdatedEvent
                      );
                    }
                    break;
                  }
                  case 'done':
                    callbacks.onDone(payload as AgentXStreamDoneEvent);
                    break;
                  case 'error':
                    callbacks.onError(payload as AgentXStreamErrorEvent);
                    break;
                }
              } catch {
                // Malformed JSON in a single frame — skip silently
              }
            }
          }
        } catch (error) {
          if ((error as { name?: string }).name === 'AbortError') return;
          callbacks.onError({
            error: error instanceof Error ? error.message : 'Stream connection failed',
          });
        }
      })();

      return controller;
    },
  } as const;
}

/**
 * Type for the Agent X API instance.
 */
export type AgentXApi = ReturnType<typeof createAgentXApi>;
