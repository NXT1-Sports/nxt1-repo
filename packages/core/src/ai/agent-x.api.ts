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
  AgentXStreamOperationEvent,
  AgentXStreamProgressEvent,
  AgentXStreamReplacedEvent,
  AutoOpenPanelInstruction,
  CompletedGoalRecord,
  AgentCompleteGoalResponse,
  AgentGoalHistoryResponse,
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
 * Includes thread metadata like latestPausedYieldState for session lifecycle.
 */
export interface ThreadMessagesResponse {
  readonly messages: AgentMessage[];
  readonly hasMore: boolean;
  readonly nextCursor?: string;
  readonly threadMetadata?: {
    readonly id: string;
    readonly latestPausedYieldState?: unknown;
  };
}

export interface AgentMessageActionResult {
  readonly success: boolean;
  readonly error?: string;
}

export interface EditMessageResult extends AgentMessageActionResult {
  readonly data?: {
    readonly message: AgentMessage;
    readonly operationId: string;
    readonly rerunEnqueued: boolean;
    readonly deletedAssistantMessageId?: string;
  };
}

export interface DeleteMessageResult extends AgentMessageActionResult {
  readonly data?: {
    readonly messageId: string;
    readonly deletedResponseMessageId?: string;
    readonly restoreTokenId: string;
    readonly undoExpiresAt: string;
  };
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
     * Mark an active goal as completed.
     * Archives the goal to `goal_history` subcollection and removes it from active goals.
     *
     * @param goalId - ID of the active goal to complete
     * @param notes - Optional user notes about the completion
     * @returns The completed goal record, or null on failure
     */
    async completeGoal(goalId: string, notes?: string): Promise<CompletedGoalRecord | null> {
      try {
        const response = await http.post<AgentCompleteGoalResponse>(
          `${endpoint(AGENT_X_ENDPOINTS.GOAL_COMPLETE)}/${encodeURIComponent(goalId)}/complete`,
          { goalId, ...(notes ? { notes } : {}) }
        );
        return response.success ? (response.data?.completedGoal ?? null) : null;
      } catch {
        return null;
      }
    },

    /**
     * Fetch the user's paginated history of completed goals.
     *
     * @returns Array of completed goal records ordered newest-first, or empty array on failure
     */
    async getGoalHistory(): Promise<readonly CompletedGoalRecord[]> {
      try {
        const response = await http.get<AgentGoalHistoryResponse>(
          endpoint(AGENT_X_ENDPOINTS.GOAL_HISTORY)
        );
        return response.success ? (response.data?.history ?? []) : [];
      } catch {
        return [];
      }
    },

    /**
     * Generate or regenerate the weekly playbook based on current goals.
     */
    async generatePlaybook(force = false): Promise<AgentDashboardPlaybook | null> {
      try {
        const enqueueResponse = await http.post<ApiResponse<{ operationId: string }>>(
          endpoint(AGENT_X_ENDPOINTS.PLAYBOOK_GENERATE),
          { force }
        );

        if (!enqueueResponse.success || !enqueueResponse.data?.operationId) {
          return null;
        }

        const operationId = enqueueResponse.data.operationId;
        const maxAttempts = 50;
        const pollIntervalMs = 1500;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const cacheBust = Date.now();
          const statusResponse = await http.get<
            ApiResponse<{
              status: string;
              result?: { data?: { playbook?: AgentDashboardPlaybook } };
              error?: string;
            }>
          >(
            `${endpoint(AGENT_X_ENDPOINTS.PLAYBOOK_GENERATE_STATUS)}/${encodeURIComponent(operationId)}?_=${cacheBust}`
          );

          if (!statusResponse.success || !statusResponse.data) {
            return null;
          }

          const status = statusResponse.data.status;
          if (status === 'completed') {
            return statusResponse.data.result?.data?.playbook ?? null;
          }

          if (status === 'failed' || status === 'cancelled') {
            return null;
          }

          await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        return null;
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
    async getThreadMessages(
      threadId: string,
      limit = 50,
      before?: string
    ): Promise<ThreadMessagesResponse | null> {
      try {
        let url = `${endpoint(AGENT_X_ENDPOINTS.THREAD_MESSAGES)}/${encodeURIComponent(threadId)}/messages?limit=${limit}`;
        if (before) {
          url += `&before=${encodeURIComponent(before)}`;
        }
        const response = await http.get<
          ApiResponse<{
            items: AgentMessage[];
            hasMore: boolean;
            nextCursor?: string;
            thread?: { id: string; latestPausedYieldState?: unknown };
          }>
        >(url);
        if (!response.success || !response.data) return null;
        return {
          messages: response.data.items,
          hasMore: response.data.hasMore,
          nextCursor: response.data.nextCursor,
          threadMetadata: response.data.thread,
        };
      } catch {
        return null;
      }
    },

    /**
     * Fetch one active message by ID.
     */
    async getMessage(messageId: string): Promise<AgentMessage | null> {
      try {
        const response = await http.get<ApiResponse<AgentMessage>>(
          `${endpoint(AGENT_X_ENDPOINTS.MESSAGES)}/${encodeURIComponent(messageId)}`
        );
        return response.success ? (response.data ?? null) : null;
      } catch {
        return null;
      }
    },

    /**
     * Edit a user message and enqueue a rerun operation.
     */
    async editMessage(
      messageId: string,
      payload: { message: string; threadId: string; reason?: string }
    ): Promise<EditMessageResult> {
      try {
        const response = await http.put<
          ApiResponse<{
            message: AgentMessage;
            operationId: string;
            rerunEnqueued: boolean;
            deletedAssistantMessageId?: string;
          }>
        >(`${endpoint(AGENT_X_ENDPOINTS.MESSAGES)}/${encodeURIComponent(messageId)}`, payload);

        if (!response.success) {
          return { success: false, error: response.error ?? 'Failed to edit message' };
        }

        return {
          success: true,
          data: response.data,
        };
      } catch {
        return { success: false, error: 'Failed to edit message' };
      }
    },

    /**
     * Soft-delete a message (with optional paired assistant reply deletion).
     */
    async deleteMessage(
      messageId: string,
      payload: { threadId: string; deleteResponse?: boolean }
    ): Promise<DeleteMessageResult> {
      try {
        const response = await http.post<
          ApiResponse<{
            messageId: string;
            deletedResponseMessageId?: string;
            restoreTokenId: string;
            undoExpiresAt: string;
          }>
        >(
          `${endpoint(AGENT_X_ENDPOINTS.MESSAGES)}/${encodeURIComponent(messageId)}/delete`,
          payload
        );

        if (!response.success) {
          return { success: false, error: response.error ?? 'Failed to delete message' };
        }

        return {
          success: true,
          data: response.data,
        };
      } catch {
        return { success: false, error: 'Failed to delete message' };
      }
    },

    /**
     * Undo a soft-deleted message using a restore token.
     */
    async undoMessage(
      messageId: string,
      payload: { restoreTokenId: string }
    ): Promise<AgentMessageActionResult> {
      try {
        const response = await http.post<ApiResponse<{ message: AgentMessage }>>(
          `${endpoint(AGENT_X_ENDPOINTS.MESSAGES)}/${encodeURIComponent(messageId)}/undo`,
          payload
        );

        return {
          success: response.success,
          ...(response.success ? {} : { error: response.error ?? 'Failed to restore message' }),
        };
      } catch {
        return { success: false, error: 'Failed to restore message' };
      }
    },

    /**
     * Submit feedback on a message.
     */
    async submitMessageFeedback(
      messageId: string,
      payload: {
        threadId: string;
        rating: 1 | 2 | 3 | 4 | 5;
        category?: 'helpful' | 'incorrect' | 'incomplete' | 'confusing' | 'other';
        text?: string;
      }
    ): Promise<AgentMessageActionResult> {
      try {
        const response = await http.post<
          ApiResponse<{ messageId: string; feedbackSaved: boolean }>
        >(
          `${endpoint(AGENT_X_ENDPOINTS.MESSAGES)}/${encodeURIComponent(messageId)}/feedback`,
          payload
        );

        return {
          success: response.success,
          ...(response.success ? {} : { error: response.error ?? 'Failed to submit feedback' }),
        };
      } catch {
        return { success: false, error: 'Failed to submit feedback' };
      }
    },

    /**
     * Record lightweight message interaction annotations (copy/view).
     */
    async annotateMessage(
      messageId: string,
      payload: { action: 'copied' | 'viewed'; metadata?: Record<string, unknown> }
    ): Promise<AgentMessageActionResult> {
      try {
        const response = await http.post<ApiResponse<void>>(
          `${endpoint(AGENT_X_ENDPOINTS.MESSAGES)}/${encodeURIComponent(messageId)}/annotation`,
          payload
        );
        return {
          success: response.success,
          ...(response.success ? {} : { error: response.error ?? 'Failed to annotate message' }),
        };
      } catch {
        return { success: false, error: 'Failed to annotate message' };
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
     * Resolve a pending approval request and optionally attach edited tool input.
     *
     * When the backend resumes the operation, it returns the new queued
     * operationId so the frontend can re-attach to the SSE stream.
     */
    async resolveApproval(
      approvalId: string,
      decision: 'approved' | 'rejected',
      toolInput?: Record<string, unknown>
    ): Promise<{
      decision: 'approved' | 'rejected';
      resumed: boolean;
      jobId?: string;
      operationId?: string;
      threadId?: string | null;
    } | null> {
      try {
        const response = await http.post<
          ApiResponse<{
            decision: 'approved' | 'rejected';
            resumed: boolean;
            jobId?: string;
            operationId?: string;
            threadId?: string | null;
          }>
        >(`${endpoint(AGENT_X_ENDPOINTS.APPROVALS)}/${encodeURIComponent(approvalId)}/resolve`, {
          decision,
          ...(toolInput ? { toolInput } : {}),
        });
        return response.success && response.data ? response.data : null;
      } catch {
        return null;
      }
    },

    /**
     * Resume a yielded operation after the user answers an inline question.
     *
     * The backend returns the new queued operationId so the frontend can
     * re-attach to the resumed SSE stream.
     */
    async resumeYieldedJob(
      operationId: string,
      response: string
    ): Promise<{
      resumed: boolean;
      jobId?: string;
      operationId?: string;
      threadId?: string | null;
    } | null> {
      try {
        const result = await http.post<
          ApiResponse<{
            resumed: boolean;
            jobId?: string;
            operationId?: string;
            threadId?: string | null;
          }>
        >(`${endpoint(AGENT_X_ENDPOINTS.RESUME_JOB)}/${encodeURIComponent(operationId)}`, {
          response,
        });

        return result.success && result.data ? result.data : null;
      } catch {
        return null;
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
            // Parse the response body for structured error info (402 billing, etc.)
            let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
            let code: string | undefined;
            try {
              const body = (await response.json()) as Record<string, unknown>;
              if (typeof body['error'] === 'string') errorMsg = body['error'];
              if (typeof body['code'] === 'string') code = body['code'] as string;
            } catch {
              /* response may not be JSON */
            }
            callbacks.onError({ error: errorMsg, status: response.status, code });
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
                  case 'operation': {
                    const op = payload as Record<string, unknown>;
                    const validStatuses = new Set([
                      'queued',
                      'running',
                      'paused',
                      'awaiting_input',
                      'awaiting_approval',
                      'complete',
                      'failed',
                      'cancelled',
                    ]);
                    if (
                      op &&
                      typeof op['threadId'] === 'string' &&
                      typeof op['status'] === 'string' &&
                      validStatuses.has(op['status'])
                    ) {
                      callbacks.onOperation?.(op as unknown as AgentXStreamOperationEvent);
                    }
                    break;
                  }
                  case 'progress': {
                    const progress = payload as Record<string, unknown>;
                    const validTypes = new Set(['progress_stage', 'progress_subphase', 'metric']);
                    if (
                      progress &&
                      typeof progress['type'] === 'string' &&
                      validTypes.has(progress['type'])
                    ) {
                      callbacks.onProgress?.(progress as unknown as AgentXStreamProgressEvent);
                    }
                    break;
                  }
                  case 'stream_replaced': {
                    const streamReplaced = payload as Record<string, unknown>;
                    if (
                      streamReplaced &&
                      typeof streamReplaced['operationId'] === 'string' &&
                      typeof streamReplaced['replacedByStreamId'] === 'string' &&
                      streamReplaced['reason'] === 'replaced' &&
                      typeof streamReplaced['timestamp'] === 'string'
                    ) {
                      callbacks.onStreamReplaced?.(
                        streamReplaced as unknown as AgentXStreamReplacedEvent
                      );
                    }
                    break;
                  }
                  case 'done':
                    callbacks.onDone(payload as AgentXStreamDoneEvent);
                    break;
                  case 'panel': {
                    const panel = payload as Record<string, unknown>;
                    if (
                      panel &&
                      typeof panel['type'] === 'string' &&
                      typeof panel['url'] === 'string'
                    ) {
                      callbacks.onPanel?.(panel as unknown as AutoOpenPanelInstruction);
                    }
                    break;
                  }
                  case 'media': {
                    const media = payload as Record<string, unknown>;
                    if (
                      media &&
                      typeof media['type'] === 'string' &&
                      typeof media['url'] === 'string'
                    ) {
                      callbacks.onMedia?.({
                        type: media['type'] as 'image' | 'video',
                        url: media['url'] as string,
                        mimeType:
                          typeof media['mimeType'] === 'string' ? media['mimeType'] : undefined,
                      });
                    }
                    break;
                  }
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
