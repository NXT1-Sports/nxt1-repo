/**
 * @fileoverview Agent X Service - Shared State Management
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Signal-based state management for Agent X AI assistant.
 * Shared between web and mobile applications.
 *
 * Features:
 * - Reactive state with Angular signals
 * - Message history management
 * - Mode switching
 * - Task selection
 * - Loading states
 * - Title animation
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class AgentXPageComponent {
 *   private readonly agentX = inject(AgentXService);
 *
 *   readonly messages = this.agentX.messages;
 *   readonly isLoading = this.agentX.isLoading;
 *   readonly selectedMode = this.agentX.selectedMode;
 *
 *   async sendMessage(): Promise<void> {
 *     await this.agentX.sendMessage('Help me find colleges');
 *   }
 * }
 * ```
 */

import { Injectable, inject, signal, computed, DestroyRef, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  type AgentXMessage,
  type AgentXQuickTask,
  type AgentXMode,
  type AgentXUserContext,
  type AgentXChatRequest,
  type AgentDashboardData,
  type AgentDashboardGoal,
  type AgentDashboardPlaybook,
  type ShellBriefingInsight,
  type ShellWeeklyPlaybookItem,
  type ShellActiveOperation,
  type ShellCommandCategory,
  AGENT_X_CONFIG,
  AGENT_X_MODES,
  AGENT_X_DEFAULT_MODE,
  ATHLETE_QUICK_TASKS,
  COACH_QUICK_TASKS,
  COLLEGE_QUICK_TASKS,
} from '@nxt1/core';
import { createAgentXApi } from '@nxt1/core/ai';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { APP_EVENTS } from '@nxt1/core/analytics';
import {
  AgentXJobService,
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
} from './agent-x-job.service';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/**
 * Agent X state management service.
 * Provides reactive state for the AI chat interface.
 */
@Injectable({ providedIn: 'root' })
export class AgentXService {
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('AgentXService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL);
  private readonly getAuthToken = inject(AGENT_X_AUTH_TOKEN_FACTORY, { optional: true });
  private readonly jobService = inject(AgentXJobService);

  /** Pure API factory instance — used for SSE streaming and non-streaming calls. */
  private readonly api = createAgentXApi(
    {
      get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
      post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
      put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
      patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
      delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
    },
    this.baseUrl
  );

  /** Active SSE abort controller — cancelled on destroy or when a new message starts. */
  private activeStream: AbortController | null = null;

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _messages = signal<AgentXMessage[]>([]);
  private readonly _isLoading = signal(false);
  private readonly _selectedTask = signal<AgentXQuickTask | null>(null);
  private readonly _userMessage = signal('');
  private readonly _currentTitle = signal(AGENT_X_CONFIG.welcomeTitles[0]);
  private readonly _selectedMode = signal<AgentXMode>(AGENT_X_DEFAULT_MODE);
  private readonly _userContext = signal<AgentXUserContext | null>(null);
  /** The MongoDB thread ID for the current conversation (persisted across messages). */
  private readonly _currentThreadId = signal<string | null>(null);

  /**
   * Pending thread request used by external surfaces (activity, push notifications)
   * to tell the Agent X shell to open a bottom sheet for a specific thread.
   */
  private readonly _pendingThread = signal<{
    threadId: string;
    title: string;
    operationId?: string;
    icon?: string;
  } | null>(null);

  // Animation interval reference
  private titleAnimationInterval?: ReturnType<typeof setInterval>;

  // Polling interval for active operations
  private operationsPollingInterval?: ReturnType<typeof setInterval>;
  private static readonly POLL_INTERVAL_MS = 10_000; // 10s when operations active

  // ============================================
  // DASHBOARD STATE (live from backend)
  // ============================================

  private readonly _dashboardLoading = signal(true);
  private readonly _dashboardLoaded = signal(false);
  private readonly _briefingInsights = signal<ShellBriefingInsight[]>([]);
  private readonly _briefingPreviewText = signal('');
  private readonly _weeklyPlaybook = signal<ShellWeeklyPlaybookItem[]>([]);
  private readonly _activeOperations = signal<ShellActiveOperation[]>([]);
  private readonly _coordinators = signal<ShellCommandCategory[]>([]);
  private readonly _goals = signal<AgentDashboardGoal[]>([]);
  private readonly _playbookGeneratedAt = signal<string | null>(null);
  private readonly _canRegenerate = signal(false);
  private readonly _playbookGenerating = signal(false);

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Current chat messages */
  readonly messages = computed(() => this._messages());

  /** Whether AI is processing */
  readonly isLoading = computed(() => this._isLoading());

  /** Currently selected quick task */
  readonly selectedTask = computed(() => this._selectedTask());

  /** Current user input */
  readonly userMessage = computed(() => this._userMessage());

  /** Animated welcome title */
  readonly currentTitle = computed(() => this._currentTitle());

  /** Selected operational mode */
  readonly selectedMode = computed(() => this._selectedMode());

  /** User context for personalization */
  readonly userContext = computed(() => this._userContext());

  /** Whether conversation is empty */
  readonly isEmpty = computed(() => this._messages().length === 0);

  /** Message count */
  readonly messageCount = computed(() => this._messages().length);

  /** Can send message (has input and not loading) */
  readonly canSend = computed(() => this._userMessage().trim().length > 0 && !this._isLoading());

  /** Available modes configuration */
  readonly modes = signal(AGENT_X_MODES);

  /**
   * The current MongoDB thread ID.
   * Set after the first `event: thread` SSE frame is received.
   * Pass this back to subsequent `sendMessage()` calls to continue the thread.
   */
  readonly currentThreadId = computed(() => this._currentThreadId());

  /** Pending thread open request for the Agent X shell. */
  readonly pendingThread = computed(() => this._pendingThread());

  // ============================================
  // DASHBOARD COMPUTED SIGNALS
  // ============================================

  readonly dashboardLoading = computed(() => this._dashboardLoading());
  readonly dashboardLoaded = computed(() => this._dashboardLoaded());
  readonly briefingInsights = computed(() => this._briefingInsights());
  readonly briefingPreviewText = computed(() => this._briefingPreviewText());
  readonly weeklyPlaybook = computed(() => this._weeklyPlaybook());
  readonly activeOperations = computed(() => this._activeOperations());
  readonly coordinators = computed(() => this._coordinators());
  readonly goals = computed(() => this._goals());
  readonly hasGoals = computed(() => this._goals().length > 0);
  readonly playbookGeneratedAt = computed(() => this._playbookGeneratedAt());
  readonly canRegenerate = computed(() => this._canRegenerate());
  readonly playbookGenerating = computed(() => this._playbookGenerating());

  // ============================================
  // QUICK TASKS (by category)
  // ============================================

  readonly athleteTasks = signal(ATHLETE_QUICK_TASKS);
  readonly coachTasks = signal(COACH_QUICK_TASKS);
  readonly collegeTasks = signal(COLLEGE_QUICK_TASKS);

  // ============================================
  // USER MESSAGE TWO-WAY BINDING
  // ============================================

  /**
   * Get current user message (for template binding).
   */
  getUserMessage(): string {
    return this._userMessage();
  }

  /**
   * Set user message (for template binding).
   */
  setUserMessage(value: string): void {
    if (value.length <= AGENT_X_CONFIG.maxInputLength) {
      this._userMessage.set(value);
    }
  }

  // ============================================
  // MODE MANAGEMENT
  // ============================================

  /**
   * Change the operational mode.
   */
  setMode(mode: AgentXMode): void {
    this._selectedMode.set(mode);
    this.logger.debug('Mode changed', { mode });
  }

  // ============================================
  // USER CONTEXT
  // ============================================

  /**
   * Set user context for AI personalization.
   */
  setUserContext(context: AgentXUserContext): void {
    this._userContext.set(context);
  }

  /**
   * Check if user has specific role.
   */
  hasRole(role: string): boolean {
    return this._userContext()?.role === role;
  }

  /**
   * Check if user is logged in (has context).
   */
  isLoggedIn(): boolean {
    return this._userContext() !== null;
  }

  // ============================================
  // TASK MANAGEMENT
  // ============================================

  /**
   * Select a quick task.
   */
  async selectTask(task: AgentXQuickTask): Promise<void> {
    await this.haptics.impact('light');
    this._selectedTask.set(task);
    this._userMessage.set(task.prompt);
    this.logger.debug('Task selected', { taskId: task.id });
  }

  /**
   * Clear selected task.
   */
  clearTask(): void {
    this._selectedTask.set(null);
  }

  // ============================================
  // EXTERNAL MESSAGE INJECTION
  // ============================================

  /**
   * Push a message into the chat from an external source
   * (e.g., background agent task completion, push notification).
   *
   * Supports text-only, image-only, or text + image messages.
   */
  pushMessage(message: Omit<AgentXMessage, 'id' | 'timestamp'>): void {
    // Dedup: skip if the last message has the same imageUrl (prevents duplicate
    // injection when user taps an activity item or notification multiple times).
    if (message.imageUrl) {
      const msgs = this._messages();
      const last = msgs[msgs.length - 1];
      if (last?.imageUrl === message.imageUrl) {
        this.logger.debug('Duplicate image message skipped', { imageUrl: message.imageUrl });
        return;
      }
    }

    const fullMessage: AgentXMessage = {
      ...message,
      id: this.generateId(),
      timestamp: new Date(),
    };
    this._messages.update((msgs) => [...msgs, fullMessage]);
    this.logger.info('External message pushed', {
      role: message.role,
      hasImage: !!message.imageUrl,
    });
  }

  // ============================================
  // PENDING THREAD COORDINATION
  // ============================================

  /**
   * Request that the Agent X shell open a specific persisted thread in a bottom sheet.
   * Used by activity items and push notifications on mobile.
   */
  queuePendingThread(params: {
    threadId: string;
    title: string;
    operationId?: string;
    icon?: string;
  }): void {
    this._pendingThread.set({
      threadId: params.threadId,
      title: params.title,
      operationId: params.operationId,
      icon: params.icon,
    });
    this.logger.info('Queued pending thread open', {
      threadId: params.threadId,
      operationId: params.operationId,
    });
  }

  /** Clear the pending thread request after the shell has consumed it. */
  clearPendingThread(): void {
    this._pendingThread.set(null);
  }

  // ============================================
  // THREAD LOADING (DEEP LINK)
  // ============================================

  /**
   * Load a historical thread by ID — used when the user taps an activity
   * notification or deep link with `?thread=<id>`.
   *
   * Fetches the thread messages from the backend and replaces the current
   * chat state so the user sees the full conversation.
   */
  async loadThread(threadId: string): Promise<void> {
    if (!threadId || this._currentThreadId() === threadId) return;
    // Guard against concurrent loads — let the in-flight request finish
    if (this._isLoading()) return;

    this.logger.info('Loading thread from deep link', { threadId });
    this.breadcrumb.trackStateChange('agent-x:loading-thread', { threadId });
    this._isLoading.set(true);

    try {
      const result = await this.api.getThreadMessages(threadId);
      if (!result || result.messages.length === 0) {
        this.logger.warn('Thread not found or empty', { threadId });
        return;
      }

      // Map backend AgentMessage → UI AgentXMessage
      const messages: AgentXMessage[] = result.messages.map((msg) => {
        const imageUrl = msg.resultData?.['imageUrl'] as string | undefined;
        return {
          id: msg.id || this.generateId(),
          role: msg.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: msg.content,
          timestamp: msg.createdAt ? new Date(msg.createdAt) : new Date(),
          ...(imageUrl ? { imageUrl } : {}),
        };
      });

      this._messages.set(messages);
      this._currentThreadId.set(threadId);
      this.logger.info('Thread loaded', { threadId, messageCount: messages.length });
      this.breadcrumb.trackStateChange('agent-x:thread-loaded', {
        threadId,
        messageCount: messages.length,
      });
    } catch (err) {
      this.logger.error('Failed to load thread', err, { threadId });
      this.toast.error('Failed to load conversation');
    } finally {
      this._isLoading.set(false);
    }
  }

  // ============================================
  // MESSAGE MANAGEMENT
  // ============================================

  /**
   * Send a message to Agent X using real-time SSE streaming.
   *
   * Opens a `POST /agent-x/chat` SSE connection.
   * Token fragments are written into the message signal as they arrive,
   * producing the live "typing" effect without any simulated delays.
   *
   * SSE event sequence:
   *  1. `event: thread`  → threadId persisted immediately
   *  2. `event: delta`   → content appended token-by-token
   *  3. `event: done`    → streaming complete, metadata stored
   *  4. `event: error`   → error message shown, stream closed
   *
   * Falls back to a standard `http.post()` if `AGENT_X_AUTH_TOKEN_FACTORY`
   * is not provided (e.g. mobile, tests) or the auth token cannot be resolved.
   *
   * @param content - Optional override text; defaults to the current input signal value.
   */
  async sendMessage(content?: string): Promise<void> {
    const message = content ?? this._userMessage().trim();
    if (!message || this._isLoading()) return;

    // Cancel any in-flight stream before starting a new one
    this.activeStream?.abort();
    this.activeStream = null;

    // Clear input and task
    this._userMessage.set('');
    this._selectedTask.set(null);

    await this.haptics.impact('light');

    // Add user message
    const userMessage: AgentXMessage = {
      id: this.generateId(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    this._messages.update((msgs) => [...msgs, userMessage]);

    // Add typing indicator (replaced by the streaming assistant message)
    const streamingId = this.generateId();
    const typingMessage: AgentXMessage = {
      id: streamingId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isTyping: true,
    };
    this._messages.update((msgs) => [...msgs, typingMessage]);
    this._isLoading.set(true);

    const request: AgentXChatRequest = {
      message,
      mode: this._selectedMode(),
      history: this._messages()
        .filter((m) => m.id !== streamingId && !m.isTyping)
        .slice(-AGENT_X_CONFIG.maxHistoryLength)
        .map((m) => ({ ...m })),
      userContext: this._userContext() ?? undefined,
      ...(this._currentThreadId() ? { threadId: this._currentThreadId()! } : {}),
    };

    this.logger.info('Sending message', { mode: request.mode, threadId: this._currentThreadId() });
    this.breadcrumb.trackStateChange('agent-x:sending', { mode: request.mode });

    // ── SSE path ────────────────────────────────────────────────────────
    const authToken = await this.getAuthToken?.().catch(() => null);

    if (authToken && isPlatformBrowser(this.platformId)) {
      await this._sendViaStream(request, streamingId, authToken);
    } else {
      // ── Fallback: standard HTTP POST (mobile / no token) ────────────
      await this._sendViaHttp(request, streamingId);
    }
  }

  /**
   * SSE streaming path — connects via raw fetch + ReadableStream.
   * @internal
   */
  private async _sendViaStream(
    request: AgentXChatRequest,
    streamingId: string,
    authToken: string
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      this.activeStream = this.api.streamMessage(
        request,
        {
          onThread: (evt) => {
            // Persist threadId immediately — before LLM inference begins
            this._currentThreadId.set(evt.threadId);
            this.logger.debug('Thread resolved', { threadId: evt.threadId });
          },

          onDelta: (evt) => {
            // Append the new token to the streaming message in-place
            this._messages.update((msgs) =>
              msgs.map((m) =>
                m.id === streamingId
                  ? { ...m, content: m.content + evt.content, isTyping: false }
                  : m
              )
            );
          },

          onDone: (evt) => {
            // Freeze the final message with metadata
            this._messages.update((msgs) =>
              msgs.map((m) =>
                m.id === streamingId
                  ? {
                      ...m,
                      isTyping: false,
                      metadata: {
                        model: evt.model,
                        inputTokens: evt.usage?.inputTokens,
                        outputTokens: evt.usage?.outputTokens,
                        mode: request.mode,
                      },
                    }
                  : m
              )
            );

            this._isLoading.set(false);
            this.activeStream = null;

            this.haptics.notification('success').catch(() => undefined);
            this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_SENT, {
              mode: this._selectedMode(),
              streaming: true,
              model: evt.model,
              threadId: evt.threadId,
            });
            this.logger.info('Stream complete', {
              model: evt.model,
              outputTokens: evt.usage?.outputTokens,
              threadId: evt.threadId,
            });

            resolve();
          },

          onError: (evt) => {
            this.logger.error('Stream error', evt.error);
            this._replaceWithError(streamingId);
            this._isLoading.set(false);
            this.activeStream = null;
            this.haptics.notification('error').catch(() => undefined);
            resolve();
          },
        },
        authToken,
        this.baseUrl
      );

      // Ensure loading is cleared on service destroy (e.g. route change mid-stream)
      this.destroyRef.onDestroy(() => {
        this.activeStream?.abort();
        this.activeStream = null;
      });
    });
  }

  /**
   * Fallback HTTP POST path — used when streaming is unavailable (mobile, tests).
   * @internal
   */
  private async _sendViaHttp(request: AgentXChatRequest, streamingId: string): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.post<{
          success: boolean;
          message?: AgentXMessage;
          threadId?: string;
          error?: string;
        }>(`${this.baseUrl}/agent-x/chat`, request)
      );

      if (response.success && response.message) {
        if (response.threadId) this._currentThreadId.set(response.threadId);

        this._messages.update((msgs) =>
          msgs.map((m) =>
            m.id === streamingId
              ? {
                  ...m,
                  content: response.message!.content,
                  isTyping: false,
                  metadata: response.message!.metadata,
                }
              : m
          )
        );

        await this.haptics.notification('success');
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_SENT, {
          mode: this._selectedMode(),
          streaming: false,
        });
      } else {
        throw new Error(response.error ?? 'No response from Agent X');
      }
    } catch (error) {
      this.logger.error('Send message failed (HTTP fallback)', error);
      await this.haptics.notification('error');
      this._replaceWithError(streamingId);
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Replace the placeholder streaming message with a user-facing error message.
   * @internal
   */
  private _replaceWithError(streamingId: string): void {
    this._messages.update((msgs) =>
      msgs.map((m) =>
        m.id === streamingId
          ? {
              ...m,
              content: 'Sorry, something went wrong. Please try again.',
              isTyping: false,
              error: true,
            }
          : m
      )
    );
  }

  /**
   * Clear all messages and reset conversation thread.
   */
  async clearMessages(): Promise<void> {
    this.activeStream?.abort();
    this.activeStream = null;
    await this.haptics.impact('light');
    this._messages.set([]);
    this._selectedTask.set(null);
    this._userMessage.set('');
    this._currentThreadId.set(null);
    this.toast.success('Conversation cleared');
    this.logger.debug('Conversation cleared');
  }

  // ============================================
  // TITLE ANIMATION
  // ============================================

  /**
   * Start the welcome title animation.
   * Should be called in afterNextRender().
   */
  startTitleAnimation(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const titles = AGENT_X_CONFIG.welcomeTitles;
    let index = 0;

    this.titleAnimationInterval = setInterval(() => {
      index = (index + 1) % titles.length;
      this._currentTitle.set(titles[index]);
    }, AGENT_X_CONFIG.titleRotationMs);

    // Cleanup on destroy
    this.destroyRef.onDestroy(() => {
      this.stopTitleAnimation();
    });
  }

  /**
   * Stop the title animation.
   */
  stopTitleAnimation(): void {
    if (this.titleAnimationInterval) {
      clearInterval(this.titleAnimationInterval);
      this.titleAnimationInterval = undefined;
    }
  }

  // ============================================
  // OPERATIONS POLLING
  // ============================================

  /**
   * Start or stop operations polling based on whether active (processing) operations exist.
   * Polls dashboard every 10s when operations are in-progress, stops when all done.
   */
  private manageOperationsPolling(operations: readonly ShellActiveOperation[]): void {
    const hasProcessing = operations.some((op) => op.status === 'processing');

    if (hasProcessing && !this.operationsPollingInterval) {
      this.logger.debug('Starting operations polling', { count: operations.length });
      this.operationsPollingInterval = setInterval(
        () => this.pollDashboard(),
        AgentXService.POLL_INTERVAL_MS
      );
      this.destroyRef.onDestroy(() => this.stopOperationsPolling());
    } else if (!hasProcessing && this.operationsPollingInterval) {
      this.logger.debug('Stopping operations polling — no active operations');
      this.stopOperationsPolling();
    }
  }

  /**
   * Silent dashboard poll — refreshes operations state without showing loading indicators.
   */
  private async pollDashboard(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ success: boolean; data?: AgentDashboardData; error?: string }>(
          `${this.baseUrl}/agent-x/dashboard`
        )
      );

      if (response.success && response.data) {
        const { briefing, playbook, activeOperations, coordinators } = response.data;
        this._briefingInsights.set([...briefing.insights]);
        this._briefingPreviewText.set(briefing.previewText);
        this._weeklyPlaybook.set([...playbook.items]);
        this._goals.set([...playbook.goals]);
        this._playbookGeneratedAt.set(playbook.generatedAt);
        this._canRegenerate.set(playbook.canRegenerate);
        this._activeOperations.set([...activeOperations]);
        this._coordinators.set([...coordinators]);

        // Re-evaluate polling need
        this.manageOperationsPolling(activeOperations);
      }
    } catch {
      // Silent failure — polling is best-effort
      this.logger.debug('Dashboard poll failed (will retry)');
    }
  }

  /**
   * Stop the operations polling interval.
   */
  private stopOperationsPolling(): void {
    if (this.operationsPollingInterval) {
      clearInterval(this.operationsPollingInterval);
      this.operationsPollingInterval = undefined;
    }
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Generate a unique message ID.
   */
  private generateId(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // ============================================
  // DASHBOARD MANAGEMENT
  // ============================================

  /**
   * Load the full Agent X dashboard from the backend.
   * Called once when the Agent X page mounts.
   */
  async loadDashboard(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    this._dashboardLoading.set(true);
    this.logger.info('Loading Agent X dashboard');
    this.breadcrumb.trackStateChange('agent-x:dashboard-loading');

    try {
      const response = await firstValueFrom(
        this.http.get<{ success: boolean; data?: AgentDashboardData; error?: string }>(
          `${this.baseUrl}/agent-x/dashboard`
        )
      );

      if (response.success && response.data) {
        const { briefing, playbook, activeOperations, coordinators } = response.data;
        this._briefingInsights.set([...briefing.insights]);
        this._briefingPreviewText.set(briefing.previewText);
        this._weeklyPlaybook.set([...playbook.items]);
        this._goals.set([...playbook.goals]);
        this._playbookGeneratedAt.set(playbook.generatedAt);
        this._canRegenerate.set(playbook.canRegenerate);
        this._activeOperations.set([...activeOperations]);
        this._coordinators.set([...coordinators]);
        this._dashboardLoaded.set(true);

        this.logger.info('Dashboard loaded', {
          goalCount: playbook.goals.length,
          playbookItems: playbook.items.length,
          operations: activeOperations.length,
        });
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_DASHBOARD_VIEWED, {
          hasGoals: playbook.goals.length > 0,
          hasPlaybook: playbook.items.length > 0,
        });

        // Start or stop polling based on active operations
        this.manageOperationsPolling(activeOperations);
      }
    } catch (err) {
      this.logger.error('Failed to load dashboard', err);
    } finally {
      this._dashboardLoading.set(false);
    }
  }

  /**
   * Set or update user goals (max 2), then optionally regenerate playbook.
   */
  async setGoals(goals: AgentDashboardGoal[]): Promise<boolean> {
    this.logger.info('Setting Agent X goals', { count: goals.length });
    this.breadcrumb.trackStateChange('agent-x:goals-setting');

    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; error?: string }>(`${this.baseUrl}/agent-x/goals`, {
          goals,
        })
      );

      if (response.success) {
        this._goals.set(goals);
        this._canRegenerate.set(true);
        this.toast.success('Goals saved! Generating your playbook...');
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_GOALS_SET, { count: goals.length });

        // Auto-generate playbook after setting goals
        await this.generatePlaybook();
        return true;
      }
      this.toast.error(response.error ?? 'Failed to save goals');
      return false;
    } catch (err) {
      this.logger.error('Failed to set goals', err);
      this.toast.error('Failed to save goals');
      return false;
    }
  }

  /**
   * Generate or regenerate the weekly playbook.
   */
  async generatePlaybook(force = false): Promise<void> {
    if (this._goals().length === 0) {
      this.toast.info('Set your goals first to generate a playbook');
      return;
    }

    this._playbookGenerating.set(true);
    this.logger.info('Generating playbook', { force });
    this.breadcrumb.trackStateChange('agent-x:playbook-generating');

    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; data?: AgentDashboardPlaybook; error?: string }>(
          `${this.baseUrl}/agent-x/playbook/generate`,
          { force }
        )
      );

      if (response.success && response.data) {
        this._weeklyPlaybook.set([...response.data.items]);
        this._playbookGeneratedAt.set(response.data.generatedAt);
        this._canRegenerate.set(true);
        this.toast.success('Weekly playbook generated!');
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_GENERATED, {
          itemCount: response.data.items.length,
          forced: force,
        });
      } else {
        this.toast.error(response.error ?? 'Failed to generate playbook');
      }
    } catch (err) {
      this.logger.error('Failed to generate playbook', err);
      this.toast.error('Failed to generate playbook');
    } finally {
      this._playbookGenerating.set(false);
    }
  }

  /**
   * Execute a playbook action by dispatching it as an Agent X job.
   */
  async executePlaybookAction(item: ShellWeeklyPlaybookItem): Promise<void> {
    const intent = `${item.actionLabel}: ${item.title}. ${item.details}`;
    this.logger.info('Executing playbook action', {
      itemId: item.id,
      actionLabel: item.actionLabel,
    });

    const result = await this.jobService.enqueue(intent, {
      source: 'playbook',
      playbookItemId: item.id,
      goalId: item.goal?.id,
    });

    if (result) {
      // Update the item status to in-progress
      this._weeklyPlaybook.update((items) =>
        items.map((i) => (i.id === item.id ? { ...i, status: 'in-progress' as const } : i))
      );

      // Add the operation to active operations
      this._activeOperations.update((ops) => [
        {
          id: result.operationId,
          label: `${item.actionLabel}...`,
          progress: 0,
          icon: 'sparkles',
          status: 'processing' as const,
        },
        ...ops,
      ]);

      this.toast.success(`Agent X is working on: ${item.title}`);
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
        itemId: item.id,
        actionLabel: item.actionLabel,
      });

      // Start polling to track this new operation
      this.manageOperationsPolling(this._activeOperations());
    } else {
      this.toast.error('Failed to start this action');
    }
  }
}
