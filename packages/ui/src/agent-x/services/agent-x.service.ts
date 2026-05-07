/**
 * @fileoverview Agent X Service - Shared State Management
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Signal-based state management for the Agent X command center.
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
  type AgentMessage,
  type AgentXAttachment,
  type AgentXMessage,
  type AgentXQuickTask,
  type AgentXRichCard,
  type AgentXMode,
  type AgentXUserContext,
  type AgentDashboardData,
  type AgentDashboardGoal,
  type AgentDashboardPlaybook,
  type AgentDashboardBriefing,
  type CompletedGoalRecord,
  type ShellBriefingInsight,
  type ShellWeeklyPlaybookItem,
  type ShellCommandCategory,
  type AutoOpenPanelInstruction,
  AGENT_X_CONFIG,
  AGENT_X_MODES,
  AGENT_X_DEFAULT_MODE,
  AGENT_X_ALLOWED_MIME_TYPES,
  AGENT_X_MAX_ATTACHMENTS,
  AGENT_X_MAX_FILE_SIZE,
  AGENT_X_MAX_VIDEO_FILE_SIZE,
  AGENT_X_RUNTIME_CONFIG,
  resolveAttachmentType,
} from '@nxt1/core';
import { createAgentXApi } from '@nxt1/core/ai';
import { HapticsService } from '../../services/haptics/haptics.service';
import { NxtToastService } from '../../services/toast/toast.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { APP_EVENTS, USER_PROPERTIES } from '@nxt1/core/analytics';
import { TRACE_NAMES, ATTRIBUTE_NAMES } from '@nxt1/core/performance';
import { PERFORMANCE_ADAPTER } from '../../services/performance/performance-adapter.token';
import { AGENT_X_API_BASE_URL, AGENT_X_AUTH_TOKEN_FACTORY } from './agent-x-job.service';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { AgentXPendingFile } from '../types/agent-x-pending-file';
import type { ConnectedAppSource } from '../components/modals/agent-x-attachments-sheet.component';

/** sessionStorage key for in-flight operation drop-recovery. */
const AGENT_X_PENDING_OP_KEY = 'nxt1_pending_agent_op';
const AGENT_X_PENDING_PLAYBOOK_OP_KEY = 'nxt1_pending_playbook_op';
const AGENT_X_PENDING_STARTUP_MESSAGE_KEY = 'nxt1_pending_startup_message';
const AGENT_X_WEEKLY_TASKS_GOAL_ID = 'recurring';
const AGENT_X_WEEKLY_TASKS_GOAL_LABEL = 'Weekly Tasks';

function isWeeklyTasksGoalPill(pill: { id: string; label: string }): boolean {
  return (
    pill.id === AGENT_X_WEEKLY_TASKS_GOAL_ID ||
    pill.label.trim().toLowerCase() === AGENT_X_WEEKLY_TASKS_GOAL_LABEL.toLowerCase()
  );
}

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
  private readonly performance = inject(PERFORMANCE_ADAPTER, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL);
  private readonly getAuthToken = inject(AGENT_X_AUTH_TOKEN_FACTORY, { optional: true });
  /** Pure API factory instance — used for non-streaming calls (approval, threads, dashboard). */
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
  /** Filtered connected app sources available for file attachments — set by the shell, read by operation-chat. */
  private readonly _attachmentConnectedSources = signal<readonly ConnectedAppSource[]>([]);
  /** The MongoDB thread ID for the current conversation (persisted across messages). */
  private readonly _currentThreadId = signal<string | null>(null);

  /** Files staged for upload — shown as previews before the user sends the message. */
  private readonly _pendingFiles = signal<AgentXPendingFile[]>([]);
  /** Whether file uploads are currently in progress. */
  private readonly _uploading = signal(false);

  /**
   * When the agent's response includes an `autoOpenPanel` instruction,
   * the service populates this signal so the shell can react via effect().
   */
  private readonly _requestedSidePanel = signal<AutoOpenPanelInstruction | null>(null);

  /**
   * When an inline approval is resolved and the backend resumes the operation,
   * this signal holds the resume params so the shell can open op-chat to attach
   * to the new stream via its `resumeOperationId` input.
   */
  private readonly _pendingResumeOp = signal<{
    operationId: string;
    threadId?: string;
  } | null>(null);

  /**
   * Pending resolved op: filled when onThread fires for an in-flight stream
   * after the originating chat component was destroyed.
   */
  private readonly _pendingResolvedOp = signal<{
    operationId: string;
    threadId: string;
  } | null>(null);

  /**
   * Pending startup message queued by an external surface (e.g. profile timeline CTA).
   * The Agent X web shell reads this via effect() after resetToDefaultDesktopSession()
   * and immediately sends it as the opening message in a new desktop session.
   */
  private readonly _pendingStartupMessage = signal<string | null>(null);

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

  /** Quick tasks loaded from the backend. */
  private readonly _quickTasks = signal<readonly AgentXQuickTask[]>([]);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const persistedMessage = sessionStorage.getItem(AGENT_X_PENDING_STARTUP_MESSAGE_KEY)?.trim();
      if (persistedMessage) {
        this._pendingStartupMessage.set(persistedMessage);
      }
    }
    void this.loadQuickTasks();
  }

  // Animation interval reference
  private titleAnimationInterval?: ReturnType<typeof setInterval>;

  // Retry counter for loadDashboard() when auth token not yet available
  private _dashboardRetryCount = 0;
  private static readonly MAX_DASHBOARD_RETRIES = 4;
  private static readonly PLAYBOOK_POLL_INTERVAL_MS =
    AGENT_X_RUNTIME_CONFIG.playbookAsync.pollIntervalMs;
  private static readonly PLAYBOOK_POLL_MAX_ATTEMPTS =
    AGENT_X_RUNTIME_CONFIG.playbookAsync.pollMaxAttempts;

  // ============================================
  // DASHBOARD STATE (live from backend)
  // ============================================

  private readonly _dashboardLoading = signal(true);
  private readonly _dashboardLoaded = signal(false);
  private readonly _dashboardError = signal<string | null>(null);
  private readonly _briefingInsights = signal<ShellBriefingInsight[]>([]);
  private readonly _briefingPreviewText = signal('');
  private readonly _weeklyPlaybook = signal<ShellWeeklyPlaybookItem[]>([]);
  private readonly _coordinators = signal<ShellCommandCategory[]>([]);
  private readonly _goals = signal<AgentDashboardGoal[]>([]);
  private readonly _activePlaybookId = signal<string | null>(null);
  private readonly _playbookGeneratedAt = signal<string | null>(null);
  private readonly _canRegenerate = signal(false);
  private readonly _playbookGenerating = signal(false);
  private readonly _briefingGenerating = signal(false);

  /** Archived completed goals from `goal_history` subcollection. */
  private readonly _goalHistory = signal<CompletedGoalRecord[]>([]);
  private readonly _goalHistoryLoading = signal(false);
  private readonly _goalHistoryError = signal<string | null>(null);
  private _playbookResumePollingInFlight = false;

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

  /** Filtered connected app sources for the attachment picker — shared across all Agent X surfaces. */
  readonly attachmentConnectedSources = computed(() => this._attachmentConnectedSources());

  /** Whether conversation is empty */
  readonly isEmpty = computed(() => this._messages().length === 0);

  /** Message count */
  readonly messageCount = computed(() => this._messages().length);

  /** Can send message (has text or files, and not loading) */
  readonly canSend = computed(
    () =>
      (this._userMessage().trim().length > 0 || this._pendingFiles().length > 0) &&
      !this._isLoading()
  );

  /** Files staged for upload, exposed as readonly. */
  readonly pendingFiles = computed(() => this._pendingFiles());

  /** Whether file uploads are in progress. */
  readonly uploading = computed(() => this._uploading());

  /** Whether there are any pending files. */
  readonly hasPendingFiles = computed(() => this._pendingFiles().length > 0);

  /** Available modes configuration */
  private readonly _modes = signal(AGENT_X_MODES);
  readonly modes = computed(() => this._modes());

  /**
   * The current MongoDB thread ID.
   * Set after the first `event: thread` SSE frame is received.
   * Pass this back to subsequent `sendMessage()` calls to continue the thread.
   */
  readonly currentThreadId = computed(() => this._currentThreadId());

  /** Pending startup message for the Agent X web shell to pick up on init. */
  readonly pendingStartupMessage = computed(() => this._pendingStartupMessage());

  /** Pending thread open request for the Agent X shell. */
  readonly pendingThread = computed(() => this._pendingThread());

  /**
   * Pending operation resume request — set after inline approval resolves.
   * The web shell effect watches this and opens op-chat with the resume params.
   */
  readonly pendingResumeOp = computed(() => this._pendingResumeOp());

  /**
   * Set when the SSE `onThread` event fires for a stream whose chat component
   * was already destroyed (navigate-away-before-thread race). The web shell
   * effect watches this and remounts the chat component with the correct
   * threadId so it can claim the buffered stream from the registry.
   */
  readonly pendingResolvedOp = computed(() => this._pendingResolvedOp());

  /**
   * Requested side panel content from the agent.
   * The shell listens to this via effect() and opens the expanded panel automatically.
   */
  readonly requestedSidePanel = computed(() => this._requestedSidePanel());

  // ============================================
  // DASHBOARD COMPUTED SIGNALS
  // ============================================

  readonly dashboardLoading = computed(() => this._dashboardLoading());
  readonly dashboardLoaded = computed(() => this._dashboardLoaded());
  readonly dashboardError = computed(() => this._dashboardError());
  readonly briefingInsights = computed(() => this._briefingInsights());
  readonly briefingPreviewText = computed(() => this._briefingPreviewText());
  readonly weeklyPlaybook = computed(() => this._weeklyPlaybook());
  readonly coordinators = computed(() => this._coordinators());
  readonly goals = computed(() => this._goals());
  readonly hasGoals = computed(() => this._goals().length > 0);
  readonly playbookGeneratedAt = computed(() => this._playbookGeneratedAt());
  readonly canRegenerate = computed(() => this._canRegenerate());
  readonly playbookGenerating = computed(() => this._playbookGenerating());
  readonly briefingGenerating = computed(() => this._briefingGenerating());

  /** Completed goals history (ordered newest-first). */
  readonly goalHistory = computed(() => this._goalHistory());
  readonly goalHistoryLoading = computed(() => this._goalHistoryLoading());
  readonly goalHistoryError = computed(() => this._goalHistoryError());
  readonly totalGoalsCompleted = computed(() => this._goalHistory().length);

  readonly allTasksComplete = computed(() => {
    const items = this._weeklyPlaybook();
    const active = items.filter((t) => t.status !== 'snoozed');
    return active.length > 0 && active.every((t) => t.status === 'complete');
  });

  /** Whether every playbook task has been snoozed (none active or complete). */
  readonly allTasksSnoozed = computed(() => {
    const items = this._weeklyPlaybook();
    return items.length > 0 && items.every((t) => t.status === 'snoozed');
  });

  // ── Playbook Category Pill Filter (shared between web & mobile shells) ──

  /** Currently selected category pill ID. 'all' = show everything. */
  private readonly _activeCategoryId = signal<string>('all');
  readonly activeCategoryId = computed(() => this._activeCategoryId());

  /** Pending (non-complete, non-snoozed) playbook items. */
  readonly pendingPlaybookItems = computed(() =>
    this._weeklyPlaybook().filter((t) => t.status !== 'complete' && t.status !== 'snoozed')
  );

  /** Derive unique category pills from the playbook tasks. */
  readonly categoryPills = computed(() => {
    const tasks = this._weeklyPlaybook();
    const pills: { id: string; label: string }[] = [{ id: 'all', label: 'All' }];
    const seen = new Set<string>();

    for (const task of tasks) {
      const goalId = task.goal?.id;
      if (!goalId || seen.has(goalId)) continue;
      seen.add(goalId);
      pills.push({ id: goalId, label: task.goal?.label ?? goalId });
    }

    const [allPill, ...goalPills] = pills;
    const orderedGoalPills = [
      ...goalPills.filter((pill) => !isWeeklyTasksGoalPill(pill)),
      ...goalPills.filter((pill) => isWeeklyTasksGoalPill(pill)),
    ];

    return [allPill, ...orderedGoalPills];
  });

  /** Show pills only when there are 2+ unique categories. */
  readonly showCategoryPills = computed(() => this.categoryPills().length > 2);

  /** Pending playbook items filtered by the active category pill. */
  readonly filteredPlaybookItems = computed(() => {
    const active = this._activeCategoryId();
    const pending = this.pendingPlaybookItems();
    if (active === 'all') return pending;
    // Auto-fallback: if active category no longer exists, show all
    const exists = pending.some((t) => t.goal?.id === active);
    if (!exists) return pending;
    return pending.filter((t) => t.goal?.id === active);
  });

  /** Select a category pill. */
  selectCategory(id: string): void {
    this._activeCategoryId.set(id);
  }

  /** Reset category filter (called internally when playbook is regenerated). */
  resetCategoryFilter(): void {
    this._activeCategoryId.set('all');
  }

  // ============================================
  // QUICK TASKS (by category)
  // ============================================

  readonly quickTasks = computed(() => this._quickTasks());
  readonly athleteTasks = computed(() =>
    this._quickTasks().filter((task) => task.category === 'athlete')
  );
  readonly coachTasks = computed(() =>
    this._quickTasks().filter((task) => task.category === 'coach')
  );
  readonly collegeTasks = computed(() =>
    this._quickTasks().filter((task) => task.category === 'college')
  );

  async loadQuickTasks(): Promise<void> {
    try {
      const tasks = await this.api.getQuickTasks();
      this._quickTasks.set(tasks);
      this.logger.debug('Quick tasks loaded', { count: tasks.length });
    } catch (err) {
      this._quickTasks.set([]);
      this.logger.error('Failed to load quick tasks', err);
    }
  }

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
   * Store the filtered + favicon-enriched connected sources so all Agent X surfaces
   * (shell input bar, operation-chat bottom sheet, operations log → chat) read from
   * a single source of truth instead of relying on `componentProps` being passed.
   */
  setAttachmentConnectedSources(sources: readonly ConnectedAppSource[]): void {
    this._attachmentConnectedSources.set(sources);
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
   * Supports text-only, text + attachments messages.
   */
  pushMessage(message: Omit<AgentXMessage, 'id' | 'timestamp'>): void {
    // Dedup: skip if the last message has the same attachment URLs (prevents duplicate
    // injection when user taps an activity item or notification multiple times).
    const attachmentUrls = (message.attachments ?? []).map((a) => a.url).join('|');
    if (attachmentUrls.length > 0) {
      const msgs = this._messages();
      const last = msgs[msgs.length - 1];
      const lastUrls = (last?.attachments ?? []).map((a) => a.url).join('|');
      if (lastUrls === attachmentUrls) {
        this.logger.debug('Duplicate message with same attachments skipped', {
          attachmentUrls,
        });
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
      attachmentCount: message.attachments?.length ?? 0,
    });
  }

  /** Remove a single message from chat history by id. */
  removeMessage(id: string): void {
    this._messages.update((msgs) => msgs.filter((m) => m.id !== id));
  }

  // ============================================
  // PENDING THREAD COORDINATION
  // ============================================

  /**
   * Queue a startup message that the Agent X web shell will immediately send
   * as the opening message when it loads. Called by external surfaces before
   * navigating to /agent. The shell consumes and clears this via effect().
   */
  queueStartupMessage(message: string): void {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    this._pendingStartupMessage.set(trimmedMessage);

    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.setItem(AGENT_X_PENDING_STARTUP_MESSAGE_KEY, trimmedMessage);
    }

    this.logger.info('Queued startup message for Agent X shell');
  }

  /** Consumed by the shell after it fires the session. */
  clearStartupMessage(): void {
    this._pendingStartupMessage.set(null);

    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.removeItem(AGENT_X_PENDING_STARTUP_MESSAGE_KEY);
    }
  }

  /**
   * Consume and clear a queued startup message (if present).
   * Returns null when no startup message is available.
   */
  consumeStartupMessage(): string | null {
    const message = this._pendingStartupMessage()?.trim() ?? '';
    if (!message) {
      if (!isPlatformBrowser(this.platformId)) return null;
      const persisted = sessionStorage.getItem(AGENT_X_PENDING_STARTUP_MESSAGE_KEY)?.trim() ?? '';
      if (!persisted) return null;
      this.clearStartupMessage();
      return persisted;
    }

    this.clearStartupMessage();
    return message;
  }

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

  /** Clear the pending resume op after the shell has consumed it. */
  clearPendingResumeOp(): void {
    this._pendingResumeOp.set(null);
  }

  /**
   * Signal that an in-flight SSE stream resolved its threadId while no
   * chat component was mounted. The shell's effect will remount the
   * component with the correct threadId to claim the buffered stream.
   */
  setPendingResolvedOp(operationId: string, threadId: string): void {
    const trimmedOp = operationId.trim();
    const trimmedThread = threadId.trim();
    if (!trimmedOp || !trimmedThread) return;
    this._pendingResolvedOp.set({ operationId: trimmedOp, threadId: trimmedThread });
  }

  /** Clear the pending resolved op after the shell has consumed it. */
  clearPendingResolvedOp(): void {
    this._pendingResolvedOp.set(null);
  }

  /**
   * Read and immediately clear any pending drop-recovery operation from
   * sessionStorage (saved mid-stream when the page was refreshed).
   * The web shell calls this on init and opens op-chat with the result.
   */
  getAndClearDropRecoveryOp(): { operationId: string; threadId?: string } | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    try {
      const raw = sessionStorage.getItem(AGENT_X_PENDING_OP_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { operationId?: unknown; threadId?: unknown };
      if (typeof parsed.operationId !== 'string') return null;
      sessionStorage.removeItem(AGENT_X_PENDING_OP_KEY);
      return {
        operationId: parsed.operationId,
        threadId: typeof parsed.threadId === 'string' ? parsed.threadId : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Persist an in-flight operation so the web shell can recover it after
   * refresh/navigation even before the stream resolves a threadId.
   */
  persistDropRecoveryOp(operationId: string, threadId?: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const trimmedOperationId = operationId.trim();
    if (!trimmedOperationId) return;
    try {
      sessionStorage.setItem(
        AGENT_X_PENDING_OP_KEY,
        JSON.stringify({
          operationId: trimmedOperationId,
          ...(threadId?.trim() ? { threadId: threadId.trim() } : {}),
          savedAt: Date.now(),
        })
      );
    } catch {
      // Non-blocking best-effort persistence.
    }
  }

  /** Clear any persisted drop-recovery operation marker. */
  clearDropRecoveryOp(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      sessionStorage.removeItem(AGENT_X_PENDING_OP_KEY);
    } catch {
      // Non-blocking best-effort cleanup.
    }
  }

  /** Clear the requested side panel after the shell has consumed it. */
  clearRequestedSidePanel(): void {
    this._requestedSidePanel.set(null);
  }

  /**
   * Surface an auto-open panel instruction from an external streaming source
   * (e.g. the operation chat component's own SSE path).
   * The shell effect watches `requestedSidePanel()` and handles rendering.
   */
  requestAutoOpenPanel(instruction: AutoOpenPanelInstruction): void {
    this._requestedSidePanel.set(instruction);
    this.logger.info('Agent requested side panel (external)', { type: instruction.type });
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
      const { messages: persistedMessages, latestPausedYieldState } =
        await this.getPersistedThreadMessages(threadId);

      if (persistedMessages.length === 0) {
        this.logger.warn('Thread not found or empty', { threadId });
        return;
      }

      // Phase K (single-bubble guarantee): suppress assistant_partial rows
      // when assistant_final exists for the same operationId. This prevents
      // the pause/resume double-bubble where a partial snapshot row and the
      // completed final row both render as visible assistant bubbles.
      const canonicalMessages = this.resolveCanonicalAssistantRows(persistedMessages);

      const messages = canonicalMessages
        // Phase J (thread-as-truth): tool/system rows are persisted for
        // backend replay only — they must not render as chat bubbles.
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        // P1: skip empty assistant rows (no content, no parts, no steps, no resultData).
        .filter((m) => {
          if (m.role !== 'assistant') return true;
          return (
            (m.content ?? '').trim().length > 0 ||
            (m.parts?.length ?? 0) > 0 ||
            (m.steps?.length ?? 0) > 0 ||
            (!!m.resultData && Object.keys(m.resultData).length > 0)
          );
        })
        .map((message) => this.mapPersistedMessageToUi(message));

      this._messages.set(messages);
      this._currentThreadId.set(threadId);

      this.logger.info('Thread loaded', { threadId, messageCount: messages.length });
      this.breadcrumb.trackStateChange('agent-x:thread-loaded', {
        threadId,
        messageCount: messages.length,
        hasPendingYield: !!latestPausedYieldState,
      });
    } catch (err) {
      this.logger.error('Failed to load thread', err, { threadId });
      this.toast.error('Failed to load conversation');
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Load the full persisted history for a thread by draining every cursor page.
   * This powers history display and is intentionally separate from the smaller
   * context window sent back to the LLM on new messages.
   * Also returns thread metadata including latestPausedYieldState.
   */
  async getPersistedThreadMessages(
    threadId: string
  ): Promise<{ messages: AgentMessage[]; latestPausedYieldState?: unknown }> {
    const pageLimit = 200;
    const allMessages: AgentMessage[] = [];
    const seenMessageIds = new Set<string>();
    let before: string | undefined;
    let pageCount = 0;
    let latestPausedYieldState: unknown;

    while (pageCount < 100) {
      const result = await this.api.getThreadMessages(threadId, pageLimit, before);
      if (!result || result.messages.length === 0) {
        break;
      }

      // Capture thread metadata from the first page
      if (pageCount === 0 && result.threadMetadata) {
        latestPausedYieldState = result.threadMetadata.latestPausedYieldState;
      }

      const pageMessages = result.messages.filter((message) => {
        if (!message.id) {
          return true;
        }

        if (seenMessageIds.has(message.id)) {
          return false;
        }

        seenMessageIds.add(message.id);
        return true;
      });

      allMessages.unshift(...pageMessages);
      pageCount += 1;

      if (!result.hasMore || !result.nextCursor) {
        break;
      }

      before = result.nextCursor;
    }

    this.logger.info('Persisted thread history fetched', {
      threadId,
      messageCount: allMessages.length,
      pageCount,
      hasLatestPausedYieldState: !!latestPausedYieldState,
    });

    return { messages: allMessages, latestPausedYieldState };
  }

  // ============================================
  // MESSAGE MANAGEMENT
  // ============================================

  /**
   * Resolve an approval-backed inline card.
   *
   * Calls the backend, shows a toast, and — if the operation was resumed —
   * sets `_pendingResumeOp` so the web shell can open an op-chat session that
   * attaches to the new SSE stream (via the `resumeOperationId` input).
   *
   * The heavy streaming work deliberately lives in `AgentXOperationChatComponent`.
   */
  async resolveInlineApproval(params: {
    approvalId: string;
    decision: 'approved' | 'rejected';
    toolInput?: Record<string, unknown>;
    successMessage?: string;
    trustForSession?: boolean;
  }): Promise<boolean> {
    this.logger.info('Resolving inline approval', {
      approvalId: params.approvalId,
      decision: params.decision,
    });
    this.breadcrumb.trackStateChange('agent-x:inline-approval', {
      approvalId: params.approvalId,
      decision: params.decision,
    });

    try {
      const result = await this.api.resolveApproval(
        params.approvalId,
        params.decision,
        params.toolInput,
        params.trustForSession
      );

      if (!result) {
        this.logger.warn('Inline approval returned null', {
          approvalId: params.approvalId,
          decision: params.decision,
        });
        this.toast.error('Failed to process approval');
        return false;
      }

      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_APPROVED, {
        approvalId: params.approvalId,
        decision: params.decision,
        resumed: result.resumed,
      });

      if (params.decision === 'rejected') {
        this.toast.success(params.successMessage ?? 'Request rejected');
        return true;
      }

      this.toast.success(params.successMessage ?? 'Approved — Agent X is resuming');

      // Signal the web shell to open an op-chat session that attaches to the
      // resumed stream. The shell effect watches pendingResumeOp() and calls
      // setDesktopSession with the resumeOperationId input.
      if (result.resumed && result.operationId) {
        this._pendingResumeOp.set({
          operationId: result.operationId,
          threadId: result.threadId ?? undefined,
        });
      }

      return true;
    } catch (err) {
      this.logger.error('Failed to resolve inline approval', err, {
        approvalId: params.approvalId,
        decision: params.decision,
      });
      this.toast.error('Failed to process approval');
      return false;
    }
  }

  // ============================================
  // FILE ATTACHMENT MANAGEMENT
  // ============================================

  /**
   * Stage files for upload. Validates MIME type, size, and attachment count.
   * Creates preview URLs for images and videos. Call before sendMessage().
   */
  addFiles(files: File[]): void {
    const current = this._pendingFiles();

    for (const file of files) {
      if (current.length >= AGENT_X_MAX_ATTACHMENTS) {
        this.toast.error(`Maximum ${AGENT_X_MAX_ATTACHMENTS} attachments allowed`);
        break;
      }

      if (!AGENT_X_ALLOWED_MIME_TYPES.includes(file.type)) {
        this.toast.error(`Unsupported file type: ${file.name}`);
        this.logger.warn('Rejected unsupported file type', { name: file.name, type: file.type });
        continue;
      }

      const isVideoFile = file.type.startsWith('video/');
      const maxSize = isVideoFile ? AGENT_X_MAX_VIDEO_FILE_SIZE : AGENT_X_MAX_FILE_SIZE;
      const maxLabel = isVideoFile ? '500 MB' : '20 MB';
      if (file.size > maxSize) {
        this.toast.error(`File too large: ${file.name} (max ${maxLabel})`);
        this.logger.warn('Rejected oversized file', { name: file.name, sizeBytes: file.size });
        continue;
      }

      const shouldCreatePreview = file.type.startsWith('image/') || file.type.startsWith('video/');
      const previewUrl =
        shouldCreatePreview && isPlatformBrowser(this.platformId)
          ? URL.createObjectURL(file)
          : null;
      const pending: AgentXPendingFile = {
        file,
        previewUrl,
        type: resolveAttachmentType(file.type),
      };
      this._pendingFiles.update((list) => [...list, pending]);
      this.logger.debug('File staged', { name: file.name, type: pending.type });
    }
  }

  /**
   * Remove a staged file by index.
   */
  removeFile(index: number): void {
    const current = this._pendingFiles();
    if (index < 0 || index >= current.length) return;

    const removed = current[index];
    if (removed.previewUrl && isPlatformBrowser(this.platformId)) {
      URL.revokeObjectURL(removed.previewUrl);
    }
    this._pendingFiles.update((list) => list.filter((_, i) => i !== index));
    this.logger.debug('File removed', { name: removed.file.name });
  }

  /**
   * Clear all staged files and revoke preview URLs.
   */
  clearPendingFiles(): void {
    if (isPlatformBrowser(this.platformId)) {
      for (const f of this._pendingFiles()) {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      }
    }
    this._pendingFiles.set([]);
  }

  /**
   * Take all pending files and clear the queue WITHOUT revoking preview URLs.
   * Used when transferring ownership to another component (e.g. operation-chat).
   */
  takePendingFiles(): AgentXPendingFile[] {
    const files = this._pendingFiles();
    this._pendingFiles.set([]);
    return files;
  }

  /**
   * Clear all messages and reset conversation thread.
   */
  async clearMessages(): Promise<void> {
    await this.haptics.impact('light');
    this._messages.set([]);
    this._selectedTask.set(null);
    this._userMessage.set('');
    this._currentThreadId.set(null);
    this.clearPendingFiles();
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

  /**
   * Phase-aware projection: suppress `assistant_partial` rows for any
   * `operationId` that has a corresponding `assistant_final` row.
   *
   * Also handles **legacy rows** (written before `semanticPhase` was added)
   * via a richness-based heuristic: when multiple untagged assistant rows
   * share the same `operationId`, only the richest one is kept. "Richness" is
   * ranked as: has resultData > has steps > has toolCalls > longest content.
   * The richest row is the final persist; the earlier partial has no metadata.
   *
   * `assistant_yield` rows are kept until a final exists because they carry
   * distinct user-facing prompts that require interaction.
   */
  private resolveCanonicalAssistantRows(
    messages: readonly AgentMessage[]
  ): readonly AgentMessage[] {
    const isChatPrefixedOperationId = (value: string | undefined): boolean =>
      typeof value === 'string' && value.startsWith('chat-');

    // Phase-tagged final rows.
    const finalOperationIds = new Set<string>();
    let lastBareFinalIndex = -1;
    messages.forEach((msg, index) => {
      if (msg.role === 'assistant' && msg.semanticPhase === 'assistant_final' && msg.operationId) {
        finalOperationIds.add(msg.operationId);
        if (!isChatPrefixedOperationId(msg.operationId)) {
          lastBareFinalIndex = Math.max(lastBareFinalIndex, index);
        }
      }
    });

    // Collapse assistant_tool_call rows when no final exists for the operationId.
    // Keep only the last intermediate row per operationId (last-wins as items are
    // in chronological order). Earlier turns are suppressed — they are abandoned
    // ReAct iterations, not distinct user-visible replies.
    const toolCallSuppressedIds = new Set<string>();
    const toolCallLastSeen = new Map<string, string>();
    for (const msg of messages) {
      if (
        msg.role === 'assistant' &&
        msg.semanticPhase === 'assistant_tool_call' &&
        msg.operationId &&
        !finalOperationIds.has(msg.operationId)
      ) {
        const prev = toolCallLastSeen.get(msg.operationId);
        if (prev) toolCallSuppressedIds.add(prev);
        toolCallLastSeen.set(msg.operationId, msg.id);
      }
    }

    // Collapse assistant_partial rows when no final exists for the operationId.
    // These are durability snapshots for an in-flight stream, so only the latest
    // snapshot should render while the operation is still running.
    const partialSuppressedIds = new Set<string>();
    const partialLastSeen = new Map<string, string>();
    for (const msg of messages) {
      if (
        msg.role === 'assistant' &&
        msg.semanticPhase === 'assistant_partial' &&
        msg.operationId &&
        !finalOperationIds.has(msg.operationId)
      ) {
        const prev = partialLastSeen.get(msg.operationId);
        if (prev) partialSuppressedIds.add(prev);
        partialLastSeen.set(msg.operationId, msg.id);
      }
    }

    // Legacy untagged rows with duplicate operationIds.
    const legacyMultiMap = new Map<string, AgentMessage[]>();
    for (const msg of messages) {
      if (
        msg.role === 'assistant' &&
        !msg.semanticPhase &&
        msg.operationId &&
        !finalOperationIds.has(msg.operationId)
      ) {
        const bucket = legacyMultiMap.get(msg.operationId) ?? [];
        bucket.push(msg);
        legacyMultiMap.set(msg.operationId, bucket);
      }
    }

    const legacySuppressedIds = new Set<string>();
    for (const [, bucket] of legacyMultiMap) {
      if (bucket.length < 2) continue;
      const richest = bucket.reduce((best, candidate) =>
        this.assistantRowRichness(candidate) >= this.assistantRowRichness(best) ? candidate : best
      );
      for (const row of bucket) {
        if (row.id !== richest.id) legacySuppressedIds.add(row.id);
      }
    }

    if (
      finalOperationIds.size === 0 &&
      toolCallSuppressedIds.size === 0 &&
      partialSuppressedIds.size === 0 &&
      legacySuppressedIds.size === 0
    )
      return messages;

    return messages.filter((msg, index) => {
      if (msg.role !== 'assistant') return true;

      // When assistant_final exists for this operationId, keep only the final
      // row. Suppress partials and untagged trajectory rows (written by
      // ThreadMessageWriter) that would cause duplicate bubbles with repeated
      // media/cards.
      if (msg.operationId && finalOperationIds.has(msg.operationId)) {
        return msg.semanticPhase === 'assistant_final';
      }

      // Pause/resume cross-operation collapse:
      // parent operation ids are `chat-*` while resumed child operations use
      // bare UUID ids. When a later bare-UUID final exists, suppress stale
      // parent assistant trajectory rows so only the resumed final bubble remains.
      if (
        lastBareFinalIndex >= 0 &&
        index < lastBareFinalIndex &&
        msg.operationId &&
        isChatPrefixedOperationId(msg.operationId) &&
        !finalOperationIds.has(msg.operationId) &&
        (msg.semanticPhase === 'assistant_tool_call' || !msg.semanticPhase)
      ) {
        return false;
      }

      // Suppress all-but-last assistant_tool_call rows (no final path).
      if (toolCallSuppressedIds.has(msg.id)) return false;

      // Suppress all-but-last assistant_partial rows (no final path).
      if (partialSuppressedIds.has(msg.id)) return false;

      // Suppress non-richest legacy duplicates (untagged rows with no final).
      if (legacySuppressedIds.has(msg.id)) return false;
      return true;
    });
  }

  /** Numeric richness score — higher means more metadata, prefers the final row. */
  private assistantRowRichness(msg: AgentMessage): number {
    let score = 0;
    if (msg.resultData && Object.keys(msg.resultData).length > 0) score += 1000;
    if ((msg.steps?.length ?? 0) > 0) score += 100 * (msg.steps?.length ?? 0);
    if ((msg.toolCalls?.length ?? 0) > 0) score += 50 * (msg.toolCalls?.length ?? 0);
    if ((msg.parts?.length ?? 0) > 0) score += 20 * (msg.parts?.length ?? 0);
    score += Math.min(msg.content?.length ?? 0, 500);
    return score;
  }

  private normalizeDetectedMediaUrl(url: string): string {
    return url.trim().replace(/[.,!?;:]+$/g, '');
  }

  private inferMediaTypeFromUrl(url: string): 'image' | 'video' | null {
    const normalizedUrl = this.normalizeDetectedMediaUrl(url).toLowerCase();
    const pathname = normalizedUrl.split(/[?#]/, 1)[0] ?? normalizedUrl;

    if (
      /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i.test(pathname) ||
      /\/images?\//i.test(pathname)
    ) {
      return 'image';
    }

    if (
      /\.(m3u8|mov|mp4|m4v|webm|ogg|ogv)$/i.test(pathname) ||
      /\/videos?\//i.test(pathname) ||
      /stream|cloudflare/i.test(normalizedUrl)
    ) {
      return 'video';
    }

    return null;
  }

  private extractMediaUrlsFromText(content: string | undefined): string[] {
    if (!content) return [];

    const urls = new Set<string>();
    const matches = content.match(/https?:\/\/[^\s)\]"'<>]+/gi) ?? [];
    for (const match of matches) {
      const normalized = this.normalizeDetectedMediaUrl(match);
      if (!normalized || !/^https?:\/\//i.test(normalized)) continue;
      if (!this.inferMediaTypeFromUrl(normalized)) continue;
      urls.add(normalized);
    }

    return [...urls];
  }

  private extractMediaUrlsFromResultData(resultData: AgentMessage['resultData']): string[] {
    if (!resultData) return [];

    const mediaUrls = new Set<string>();
    const pushUrl = (value: unknown): void => {
      if (typeof value !== 'string') return;
      const trimmed = this.normalizeDetectedMediaUrl(value);
      if (!/^https?:\/\//i.test(trimmed)) return;
      if (!this.inferMediaTypeFromUrl(trimmed)) return;
      mediaUrls.add(trimmed);
    };

    pushUrl(resultData['imageUrl']);
    pushUrl(resultData['videoUrl']);
    pushUrl(resultData['outputUrl']);

    for (const key of ['persistedMediaUrls', 'mediaUrls', 'imageUrls', 'videoUrls'] as const) {
      const value = resultData[key];
      if (!Array.isArray(value)) continue;
      for (const url of value) pushUrl(url);
    }

    const files = resultData['files'];
    if (Array.isArray(files)) {
      for (const file of files) {
        if (!file || typeof file !== 'object') continue;
        const record = file as Record<string, unknown>;
        pushUrl(record['url']);
        pushUrl(record['downloadUrl']);
      }
    }

    return [...mediaUrls];
  }

  private normalizePersistedAttachments(
    attachments: readonly AgentXAttachment[]
  ): readonly AgentXAttachment[] {
    const seen = new Set<string>();
    const deduped: AgentXAttachment[] = [];

    for (const attachment of attachments) {
      const normalizedUrl = this.normalizeDetectedMediaUrl(attachment.url);
      const key = `${attachment.type}|${normalizedUrl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push({
        ...attachment,
        url: normalizedUrl,
      });
    }

    return deduped;
  }

  private stripPersistedAttachmentAnnotations(content: string): string {
    return content
      .replace(/\n\n\[Attached (?:file|video): .+/gs, '')
      .replace(/\n\n\[Connected sources available[^\]]*\]/gs, '')
      .replace(
        /\n\[Instruction: treat these as user-connected sources for this request; do not state they are missing\.\]/gs,
        ''
      )
      .trim();
  }

  private mapPersistedMessageToUi(message: AgentMessage): AgentXMessage {
    const attachments = this.normalizePersistedAttachments(
      (message.attachments ?? []) as readonly AgentXAttachment[]
    );

    // Strip the AI-context annotation lines appended by the backend FIRST, before
    // any URL scanning. "[Attached video: ...]" suffixes are injected into message
    // content so the LLM knows what was resolved — scanning the raw content would
    // cause those URLs to appear as derivedVideoUrl and render as attachment pills
    // on the user's message bubble even though the user never uploaded anything.
    const displayContent = this.stripPersistedAttachmentAnnotations(message.content);

    if (message.role !== 'assistant') {
      return {
        id: message.id || this.generateId(),
        role: message.role,
        content: displayContent,
        timestamp: message.createdAt ? new Date(message.createdAt) : new Date(),
        ...(attachments.length > 0 ? { attachments } : {}),
      };
    }

    // Unified attachment model: backend populates attachments[] at save time from tool resultData.
    // Frontend simply reads attachments directly — no content scanning, no waterfall.
    const cards = (
      message.cards?.length
        ? message.cards
        : (message.parts ?? [])
            .filter(
              (
                part
              ): part is Extract<NonNullable<AgentMessage['parts']>[number], { type: 'card' }> =>
                part.type === 'card'
            )
            .map((part) => part.card)
    ) as readonly AgentXRichCard[];

    return {
      id: message.id || this.generateId(),
      role: message.role,
      content: displayContent,
      timestamp: message.createdAt ? new Date(message.createdAt) : new Date(),
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(cards.length > 0 ? { cards } : {}),
    };
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

    // Guard: require a valid auth token before hitting the backend.
    // This prevents a 401 race condition on page load when Firebase hasn't
    // fully restored the auth session yet.
    if (this.getAuthToken) {
      const token = await this.getAuthToken().catch(() => null);
      if (!token) {
        // Schedule a retry with backoff to handle Firebase session restore race condition.
        // Retries at ~1.5s, 3s, 4.5s, 6s — then give up silently.
        if (this._dashboardRetryCount < AgentXService.MAX_DASHBOARD_RETRIES) {
          const delay = 1500 * (this._dashboardRetryCount + 1);
          this._dashboardRetryCount++;
          this.logger.debug(
            `loadDashboard: no auth token yet, retrying in ${delay}ms (attempt ${this._dashboardRetryCount})`
          );
          setTimeout(() => void this.loadDashboard(), delay);
        } else {
          this.logger.debug('loadDashboard: no auth token after max retries, giving up');
          this._dashboardLoading.set(false);
        }
        return;
      }
    }
    // Auth token acquired — reset retry counter for future manual refreshes
    this._dashboardRetryCount = 0;

    // On first load: show skeleton. On background refresh (already loaded): update silently.
    const isRefresh = this._dashboardLoaded();
    if (!isRefresh) {
      this._dashboardLoading.set(true);
      this._dashboardError.set(null);
    }
    this.logger.info('Loading Agent X dashboard', { isRefresh });
    this.breadcrumb.trackStateChange('agent-x:dashboard-loading');

    try {
      const response = await firstValueFrom(
        this.http.get<{ success: boolean; data?: AgentDashboardData; error?: string }>(
          `${this.baseUrl}/agent-x/dashboard`
        )
      );

      if (response.success && response.data) {
        const { briefing, playbook, coordinators } = response.data;
        this._briefingInsights.set([...briefing.insights]);
        this._briefingPreviewText.set(briefing.previewText);
        this._weeklyPlaybook.set([...playbook.items]);
        this._activePlaybookId.set(playbook.id ?? null);
        this.resetCategoryFilter();
        this._goals.set([...playbook.goals]);
        this._playbookGeneratedAt.set(playbook.generatedAt);
        this._canRegenerate.set(playbook.canRegenerate);
        this._coordinators.set([...coordinators]);
        this._dashboardLoaded.set(true);

        this.logger.info('Dashboard loaded', {
          goalCount: playbook.goals.length,
          playbookItems: playbook.items.length,
        });
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_DASHBOARD_VIEWED, {
          hasGoals: playbook.goals.length > 0,
          hasPlaybook: playbook.items.length > 0,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error loading dashboard';
      this.logger.error('Failed to load dashboard', err);
      this._dashboardError.set(message);
    } finally {
      this._dashboardLoading.set(false);
      // If a playbook job was queued before refresh/navigation, resume polling.
      void this.resumePendingPlaybookGenerationFromStorage();
    }
  }

  /**
   * Set or update user goals (max 3), then optionally regenerate playbook.
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

        // Auto-generate playbook after setting goals (non-blocking)
        this.generatePlaybook().catch((err) => {
          this.logger.warn('Background playbook generation failed', err);
        });
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
   * Mark an active goal as completed.
   * Optimistically removes the goal from the active list; rolls back on failure.
   */
  async completeGoal(goalId: string): Promise<void> {
    const previous = this._goals();
    const goal = previous.find((g) => g.id === goalId);

    // Optimistically remove from active list if we have the goal locally.
    // If _goals isn't hydrated yet (no loadDashboard call), skip the local
    // update — the backend is the source of truth and will still persist.
    if (goal) {
      this._goals.update((goals) => goals.filter((g) => g.id !== goalId));
    }

    this.breadcrumb.trackStateChange('agent-x:goal-completing:pending', {
      goalId,
      goal_category: goal?.category ?? 'unknown',
    });
    await this.haptics.impact('medium');

    try {
      const completeHttp = () =>
        firstValueFrom(
          this.http.post<{
            success: boolean;
            data?: { completedGoal: CompletedGoalRecord };
            error?: string;
          }>(`${this.baseUrl}/agent-x/goals/${encodeURIComponent(goalId)}/complete`, {})
        );

      const response = await (this.performance?.trace(
        TRACE_NAMES.AGENT_X_GOAL_COMPLETE,
        completeHttp,
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'agent_x_goals',
            goal_category: goal?.category ?? 'unknown',
          },
        }
      ) ?? completeHttp());

      if (response.success && response.data?.completedGoal) {
        // Prepend to history (newest-first)
        this._goalHistory.update((h) => [response.data!.completedGoal, ...h]);
        this._canRegenerate.set(this._goals().length > 0);

        const daysToComplete = response.data.completedGoal.daysToComplete;
        this.logger.info('Goal completed', { goalId, category: goal?.category, daysToComplete });
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_GOAL_COMPLETED, {
          goalId,
          goal_category: goal?.category,
          role: response.data.completedGoal.role,
          daysToComplete,
        });
        this.analytics?.setUserProperties({
          [USER_PROPERTIES.GOALS_COMPLETED_TOTAL]: this._goalHistory().length,
        });
        this.breadcrumb.trackStateChange('agent-x:goal-completing:completed', {
          goalId,
          goal_category: goal?.category,
        });
        this.toast.success('Goal completed! 🎯');
        await this.haptics.notification('success');
      } else {
        // Rollback local state only if we had performed an optimistic removal
        if (goal) this._goals.set(previous);
        this.toast.error(response.error ?? 'Failed to complete goal');
        this.logger.error('Complete goal failed — rolled back', null, { goalId });
      }
    } catch (err) {
      // Rollback local state only if we had performed an optimistic removal
      if (goal) this._goals.set(previous);
      this.logger.error('Failed to complete goal', err, { goalId });
      this.toast.error('Failed to complete goal');
    }
  }

  /**
   * Load the user's completed goal history from the backend.
   * Fires `AGENT_X_GOAL_HISTORY_VIEWED` analytics event on success.
   */
  async loadGoalHistory(): Promise<void> {
    if (this._goalHistoryLoading()) return;
    this._goalHistoryLoading.set(true);
    this._goalHistoryError.set(null);
    this.logger.info('Loading goal history');

    try {
      type HistoryResponse = {
        success: boolean;
        data?: { history: CompletedGoalRecord[]; totalCompleted: number };
        error?: string;
      };

      const historyHttp = () =>
        firstValueFrom(this.http.get<HistoryResponse>(`${this.baseUrl}/agent-x/goal-history`));

      const response = await (this.performance?.trace(
        TRACE_NAMES.AGENT_X_GOAL_HISTORY_LOAD,
        historyHttp,
        {
          attributes: {
            [ATTRIBUTE_NAMES.FEATURE_NAME]: 'agent_x_goals',
          },
          onSuccess: async (res, trace) => {
            if (res.success && res.data) {
              await trace.putMetric('history_count', res.data.totalCompleted);
            }
          },
        }
      ) ?? historyHttp());

      if (response.success && response.data) {
        this._goalHistory.set(response.data.history);
        this.logger.info('Goal history loaded', { count: response.data.totalCompleted });
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_GOAL_HISTORY_VIEWED, {
          totalCompleted: response.data.totalCompleted,
        });
      } else {
        this._goalHistoryError.set(response.error ?? 'Failed to load history');
        this.logger.error('Failed to load goal history', null, { error: response.error });
      }
    } catch (err) {
      this._goalHistoryError.set('Failed to load history');
      this.logger.error('Failed to load goal history', err);
    } finally {
      this._goalHistoryLoading.set(false);
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
      type PlaybookEnqueueResponse = {
        success: boolean;
        data?: { operationId?: string };
        error?: string;
      };

      const enqueueResponse = await firstValueFrom(
        this.http.post<PlaybookEnqueueResponse>(`${this.baseUrl}/agent-x/playbook/generate`, {
          force,
        })
      );

      if (!enqueueResponse.success || !enqueueResponse.data?.operationId) {
        this.toast.error(enqueueResponse.error ?? 'Failed to queue playbook generation');
        return;
      }

      const operationId = enqueueResponse.data.operationId;
      this.logger.info('Playbook generation queued', { operationId, force });
      this.persistPendingPlaybookOperation(operationId);

      const pollResult = await this.pollPlaybookGenerationStatus(operationId);
      if (!pollResult.success) {
        // Keep the pending marker on timeout so refresh can resume background polling.
        if (!pollResult.timedOut) {
          this.clearPendingPlaybookOperation();
          this.toast.error(pollResult.error ?? 'Playbook generation failed');
        }
        return;
      }

      this.clearPendingPlaybookOperation();
      await this.applyPlaybookPollResult(pollResult.playbook, force);

      this._canRegenerate.set(true);
      this.toast.success('Weekly playbook generated!');
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_GENERATED, {
        itemCount: pollResult.playbook?.items.length ?? this._weeklyPlaybook().length,
        forced: force,
      });
    } catch (err) {
      this.logger.error('Failed to generate playbook', err);
      this.toast.error('Failed to generate playbook');
    } finally {
      this._playbookGenerating.set(false);
    }
  }

  private async pollPlaybookGenerationStatus(operationId: string): Promise<{
    success: boolean;
    playbook: AgentDashboardPlaybook | null;
    error?: string;
    timedOut?: boolean;
  }> {
    type PlaybookStatusPayload = {
      operationId: string;
      status: string;
      result?: {
        data?: {
          playbook?: AgentDashboardPlaybook;
        };
      };
      error?: string | null;
    };

    type PlaybookStatusResponse = {
      success: boolean;
      data?: PlaybookStatusPayload;
      error?: string;
    };

    for (let attempt = 0; attempt < AgentXService.PLAYBOOK_POLL_MAX_ATTEMPTS; attempt++) {
      const cacheBust = Date.now();
      const response = await firstValueFrom(
        this.http.get<PlaybookStatusResponse>(
          `${this.baseUrl}/agent-x/playbook/generate/status/${encodeURIComponent(operationId)}?_=${cacheBust}`
        )
      );

      if (!response.success || !response.data) {
        return {
          success: false,
          playbook: null,
          error: response.error ?? 'Failed to fetch playbook generation status',
          timedOut: false,
        };
      }

      const status = response.data.status;
      if (status === 'completed') {
        return {
          success: true,
          playbook: response.data.result?.data?.playbook ?? null,
        };
      }

      if (status === 'failed' || status === 'cancelled') {
        return {
          success: false,
          playbook: null,
          error: response.data.error ?? 'Playbook generation failed',
          timedOut: false,
        };
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, AgentXService.PLAYBOOK_POLL_INTERVAL_MS);
      });
    }

    return {
      success: false,
      playbook: null,
      error: 'Playbook generation timed out. Please refresh in a moment.',
      timedOut: true,
    };
  }

  private async applyPlaybookPollResult(
    playbook: AgentDashboardPlaybook | null,
    forceRegenerate = false
  ): Promise<void> {
    if (playbook) {
      const newItems = playbook.items as ShellWeeklyPlaybookItem[];
      this._activePlaybookId.set(playbook.id ?? null);

      // Forced regenerations should immediately reflect the server-generated
      // playbook, even when IDs are reused. This fixes the stale UI case where
      // nothing changed until a full app refresh.
      if (forceRegenerate) {
        this._weeklyPlaybook.set([...newItems]);
      } else {
        // Non-forced generation keeps previous completed/snoozed items while
        // appending any truly new IDs.
        const existing = this._weeklyPlaybook();
        const existingIds = new Set(existing.map((i) => i.id));
        const uniqueNew = newItems.filter((i) => !existingIds.has(i.id));
        this._weeklyPlaybook.set([...existing, ...uniqueNew]);
      }

      this.resetCategoryFilter();
      this._playbookGeneratedAt.set(playbook.generatedAt);
      return;
    }

    // Fallback: refresh dashboard if worker completion payload is unavailable.
    await this.loadDashboard();
  }

  private persistPendingPlaybookOperation(operationId: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      sessionStorage.setItem(
        AGENT_X_PENDING_PLAYBOOK_OP_KEY,
        JSON.stringify({ operationId, savedAt: Date.now() })
      );
    } catch {
      // Non-blocking best-effort persistence.
    }
  }

  private readPendingPlaybookOperation(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    try {
      const raw = sessionStorage.getItem(AGENT_X_PENDING_PLAYBOOK_OP_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { operationId?: unknown };
      return typeof parsed.operationId === 'string' ? parsed.operationId : null;
    } catch {
      return null;
    }
  }

  private clearPendingPlaybookOperation(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      sessionStorage.removeItem(AGENT_X_PENDING_PLAYBOOK_OP_KEY);
    } catch {
      // Non-blocking best-effort cleanup.
    }
  }

  private async resumePendingPlaybookGenerationFromStorage(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this._playbookGenerating()) return;
    if (this._playbookResumePollingInFlight) return;

    const operationId = this.readPendingPlaybookOperation();
    if (!operationId) return;

    this._playbookResumePollingInFlight = true;
    this._playbookGenerating.set(true);
    this.logger.info('Resuming pending playbook generation polling', { operationId });

    try {
      const pollResult = await this.pollPlaybookGenerationStatus(operationId);

      if (!pollResult.success) {
        if (!pollResult.timedOut) {
          this.clearPendingPlaybookOperation();
          this.logger.warn('Pending playbook operation ended unsuccessfully', {
            operationId,
            error: pollResult.error,
          });
        }
        return;
      }

      this.clearPendingPlaybookOperation();
      await this.applyPlaybookPollResult(pollResult.playbook, true);
      this._canRegenerate.set(true);
      this.toast.success('Weekly playbook generated in background');
    } catch (err) {
      this.logger.warn('Failed to resume pending playbook polling', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this._playbookGenerating.set(false);
      this._playbookResumePollingInFlight = false;
    }
  }

  /**
   * Generate or refresh the daily briefing.
   */
  async generateBriefing(force = false): Promise<void> {
    this._briefingGenerating.set(true);
    this.logger.info('Generating briefing', { force });
    this.breadcrumb.trackStateChange('agent-x:briefing-generating');

    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; data?: AgentDashboardBriefing; error?: string }>(
          `${this.baseUrl}/agent-x/briefing/generate`,
          { force }
        )
      );

      if (response.success && response.data) {
        this._briefingInsights.set([...response.data.insights]);
        this._briefingPreviewText.set(response.data.previewText);
        this.logger.info('Briefing generated', { insightCount: response.data.insights.length });
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_DASHBOARD_VIEWED, {
          hasGoals: this._goals().length > 0,
          hasPlaybook: this._weeklyPlaybook().length > 0,
        });
      }
    } catch (err) {
      this.logger.error('Failed to generate briefing', err);
    } finally {
      this._briefingGenerating.set(false);
    }
  }

  /**
   * Execute a playbook action by routing it through the standard chat loop.
   *
   * Previously this used the fire-and-forget `jobService.enqueue()` path which
   * cancelled the SSE stream immediately, preventing the operations log from
   * receiving real-time status updates (in-progress, awaiting_input, etc.).
   *
   * Now the shells call this to build the intent string, then route through
   * their own chat UI (bottom sheet on mobile, desktop session on web) so the
   * full SSE lifecycle is preserved.
   *
   * @returns The intent string and item metadata for the shell to dispatch.
   */
  preparePlaybookAction(item: ShellWeeklyPlaybookItem): {
    intent: string;
    itemId: string;
    title: string;
    actionLabel: string;
  } {
    const intent = this.buildPlaybookActionIntent(item);
    this.logger.info('Preparing playbook action for chat', {
      itemId: item.id,
      actionLabel: item.actionLabel,
    });

    // Update the item status to in-progress immediately
    this._weeklyPlaybook.update((items) =>
      items.map((i) => (i.id === item.id ? { ...i, status: 'in-progress' as const } : i))
    );

    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_PLAYBOOK_ACTION_EXECUTED, {
      itemId: item.id,
      actionLabel: item.actionLabel,
    });

    return { intent, itemId: item.id, title: item.title, actionLabel: item.actionLabel };
  }

  private buildPlaybookActionIntent(item: ShellWeeklyPlaybookItem): string {
    const summary = item.summary.trim();
    const details = this.normalizePlaybookDetailsToRequest(item.details);
    const objective = this.normalizeObjectiveToFirstPerson(summary);
    const executionRequest = this.normalizeExecutionRequestToFirstPerson(details);

    return [
      `I want to ${item.actionLabel.toLowerCase()}: ${item.title}.`,
      'Please execute this action now.',
      objective ? `Objective: ${objective}` : '',
      executionRequest ? `Execution request: ${executionRequest}` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private normalizeObjectiveToFirstPerson(summary: string): string {
    const normalized = this.convertSecondPersonToFirstPerson(summary);
    if (!normalized) return '';
    if (/^i\b/i.test(normalized)) return normalized;
    return `I want to ${this.lowercaseFirst(normalized)}`;
  }

  private normalizeExecutionRequestToFirstPerson(details: string): string {
    const normalized = this.convertSecondPersonToFirstPerson(details);
    if (!normalized) return '';
    if (/^i\b/i.test(normalized)) return normalized;
    return `I need you to ${this.lowercaseFirst(normalized)}`;
  }

  private normalizePlaybookDetailsToRequest(details: string): string {
    const trimmed = details.trim();
    if (!trimmed) return '';

    return trimmed
      .replace(/\bAgent X has prepared\b/gi, 'Prepare')
      .replace(/\bAgent X already prepared\b/gi, 'Prepare')
      .replace(/\bhas prepared\b/gi, 'prepare')
      .replace(/\balready prepared\b/gi, 'prepare now')
      .replace(/\bhas created\b/gi, 'create')
      .replace(/\balready generated\b/gi, 'generate now');
  }

  private convertSecondPersonToFirstPerson(text: string): string {
    return text
      .replace(/\byour\b/gi, 'my')
      .replace(/\byou are\b/gi, 'I am')
      .replace(/\byou have\b/gi, 'I have')
      .replace(/\byou're\b/gi, "I'm")
      .replace(/\byou've\b/gi, "I've")
      .trim();
  }

  private lowercaseFirst(text: string): string {
    if (!text) return text;
    return text[0].toLowerCase() + text.slice(1);
  }

  /**
   * Mark a playbook item as explicitly complete (user pressed "Mark Done").
   * Updates the local signal immediately and persists to backend.
   */
  async markPlaybookItemComplete(itemId: string): Promise<boolean> {
    const previousItems = this._weeklyPlaybook();
    const playbookId = this._activePlaybookId() ?? undefined;

    this._weeklyPlaybook.update((items) =>
      items.map((i) => (i.id === itemId ? { ...i, status: 'complete' as const } : i))
    );
    this.logger.info('Playbook item marked done', { itemId, playbookId });

    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; error?: string }>(
          `${this.baseUrl}/agent-x/playbook/item/${encodeURIComponent(itemId)}/status`,
          { status: 'complete', ...(playbookId ? { playbookId } : {}) }
        )
      );

      if (!response.success) {
        this._weeklyPlaybook.set(previousItems);
        this.logger.warn('Mark-done rejected by backend', {
          itemId,
          playbookId,
          error: response.error,
        });
        this.toast.error(response.error ?? 'Failed to save completed task');
        return false;
      }

      await this.loadGoalHistory();
      return true;
    } catch (err) {
      this._weeklyPlaybook.set(previousItems);
      this.logger.warn('Failed to persist mark-done to backend', {
        itemId,
        playbookId,
        error: String(err),
      });
      this.toast.error('Failed to save completed task');
      return false;
    }
  }

  /**
   * Snooze a playbook item — dismisses it from the pending list without
   * counting it as complete. Progress bar denominator shrinks by 1.
   */
  snoozePlaybookItem(itemId: string): void {
    this._weeklyPlaybook.update((items) =>
      items.map((i) => (i.id === itemId ? { ...i, status: 'snoozed' as const } : i))
    );
    this.logger.info('Playbook item snoozed', { itemId });

    // Persist snooze to backend so the playbook Firestore doc stays in sync
    firstValueFrom(
      this.http.post<{ success: boolean }>(
        `${this.baseUrl}/agent-x/playbook/item/${encodeURIComponent(itemId)}/status`,
        { status: 'snoozed' }
      )
    ).catch((err) => {
      this.logger.warn('Failed to persist snooze to backend', { itemId, error: String(err) });
    });
  }
}
