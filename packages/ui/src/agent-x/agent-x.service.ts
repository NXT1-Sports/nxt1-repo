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
  AGENT_X_CONFIG,
  AGENT_X_MODES,
  AGENT_X_DEFAULT_MODE,
  ATHLETE_QUICK_TASKS,
  COACH_QUICK_TASKS,
  COLLEGE_QUICK_TASKS,
} from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';

/**
 * Agent X state management service.
 * Provides reactive state for the AI chat interface.
 */
@Injectable({ providedIn: 'root' })
export class AgentXService {
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('AgentXService');
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

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

  // Animation interval reference
  private titleAnimationInterval?: ReturnType<typeof setInterval>;

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
  // MESSAGE MANAGEMENT
  // ============================================

  /**
   * Send a message to Agent X.
   */
  async sendMessage(content?: string): Promise<void> {
    const message = content ?? this._userMessage().trim();
    if (!message || this._isLoading()) return;

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

    // Add typing indicator
    const typingMessage: AgentXMessage = {
      id: 'typing',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isTyping: true,
    };
    this._messages.update((msgs) => [...msgs, typingMessage]);
    this._isLoading.set(true);

    try {
      // TODO: Replace with actual API call
      // const request: AgentXChatRequest = {
      //   message,
      //   mode: this._selectedMode(),
      //   history: this._messages().slice(-AGENT_X_CONFIG.maxHistoryLength),
      //   userContext: this._userContext() ?? undefined,
      // };
      // const response = await this.api.sendMessage(request);

      // Simulate response for now
      await this.simulateResponse(message);
    } catch (error) {
      this.logger.error('Send message failed', error);
      await this.haptics.notification('error');

      // Replace typing with error
      this._messages.update((msgs) => {
        const filtered = msgs.filter((m) => m.id !== 'typing');
        return [
          ...filtered,
          {
            id: this.generateId(),
            role: 'assistant' as const,
            content: 'Sorry, something went wrong. Please try again.',
            timestamp: new Date(),
            error: true,
          },
        ];
      });
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Clear all messages.
   */
  async clearMessages(): Promise<void> {
    await this.haptics.impact('light');
    this._messages.set([]);
    this._selectedTask.set(null);
    this._userMessage.set('');
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
   * Simulate AI response (placeholder until backend integration).
   */
  private async simulateResponse(userInput: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1000));

    const responses = [
      `I understand you're asking about "${userInput.slice(0, 50)}...". Let me help you with that!\n\nThis is a demo response. In the full version, I'll provide personalized recruiting insights, college recommendations, and actionable advice tailored to your profile.`,
      `Great question! Based on what you've shared, here are some initial thoughts:\n\n• First, let's understand your goals better\n• Then I can provide specific recommendations\n• We'll create an action plan together\n\nWhat specific aspect would you like to focus on first?`,
      `I'm here to help with your recruiting journey! Here's what I can assist with:\n\n🎯 College matching based on your profile\n📧 Communication strategies with coaches\n📊 Timeline and milestone planning\n\nLet's dive deeper into what matters most to you.`,
    ];

    const responseContent = responses[Math.floor(Math.random() * responses.length)];

    // Replace typing with actual response
    this._messages.update((msgs) => {
      const filtered = msgs.filter((m) => m.id !== 'typing');
      return [
        ...filtered,
        {
          id: this.generateId(),
          role: 'assistant' as const,
          content: responseContent,
          timestamp: new Date(),
        },
      ];
    });

    await this.haptics.notification('success');
  }
}
