/**
 * @fileoverview Agent X Operation Chat — Bottom Sheet Chat Component
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Self-contained AI chat experience for a specific operation or quick command.
 * Opens inside NxtBottomSheetService.openSheet() with its own isolated
 * message history, input bar, and simulated AI responses.
 *
 * Each operation/command gets a dedicated conversational context so the
 * main Agent X chat remains uncluttered.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```typescript
 * await this.bottomSheet.openSheet({
 *   component: AgentXOperationChatComponent,
 *   componentProps: {
 *     contextId: 'op-1',
 *     contextTitle: 'Analyzing game film...',
 *     contextIcon: 'play',
 *     contextType: 'operation',
 *   },
 *   ...SHEET_PRESETS.FULL,
 * });
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  Input,
  AfterViewInit,
  inject,
  signal,
  computed,
  viewChild,
  ElementRef,
  effect,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ModalController } from '@ionic/angular/standalone';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';
import { NxtChatBubbleComponent } from '../components/chat-bubble';
import { NxtIconComponent } from '../components/icon';
import { NxtLoggingService } from '../services/logging/logging.service';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { AGENT_X_OPERATION_CHAT_TEST_IDS } from '@nxt1/core/testing';
import { AgentXInputComponent } from './agent-x-input.component';
import { AGENT_X_API_BASE_URL, AgentXJobService } from './agent-x-job.service';
import { KeyboardService } from '../services/keyboard/keyboard.service';
import {
  AgentXActionCardComponent,
  type ActionCardApprovalEvent,
  type ActionCardReplyEvent,
} from './agent-x-action-card.component';
import type { AgentYieldState } from '@nxt1/core';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from './fab/agent-x-logo.constants';

// ============================================
// INTERFACES
// ============================================

/** Shape of a suggested quick action chip shown inside the chat. */
export interface OperationQuickAction {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly description?: string;
}

/** Shape of a single chat message inside the operation context. */
interface OperationMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly timestamp: Date;
  readonly imageUrl?: string;
  readonly videoUrl?: string;
  readonly isTyping?: boolean;
  readonly error?: boolean;
}

@Component({
  selector: 'nxt1-agent-x-operation-chat',
  standalone: true,
  host: {
    '[class.agent-x-operation-chat--embedded]': 'embedded',
  },
  imports: [
    CommonModule,
    FormsModule,
    NxtSheetHeaderComponent,
    NxtChatBubbleComponent,
    NxtIconComponent,
    AgentXInputComponent,
    AgentXActionCardComponent,
  ],
  template: `
    @if (!embedded) {
      <!-- ═══ HEADER ═══ -->
      <nxt1-sheet-header
        [title]="headerTitle()"
        [subtitle]="contextTypeLabel()"
        [showAgentXIcon]="true"
        iconShape="rounded"
        closePosition="right"
        [showBorder]="true"
        (closeSheet)="dismiss()"
      />
    }

    <!-- ═══ MESSAGES ═══ -->
    <div class="messages-area" [class.messages-area--embedded]="embedded" #messagesArea>
      <!-- ═══ COORDINATOR WELCOME (commands only — operations skip straight to work) ═══ -->
      @if (showWelcome()) {
        <div class="msg-row msg-assistant">
          <nxt1-chat-bubble
            variant="agent-operation"
            [isOwn]="false"
            [content]="welcomeMessage()"
            [isTyping]="false"
            [isError]="false"
            [isSystem]="false"
          />
        </div>

        <!-- ═══ QUICK OPTIONS ═══ -->
        <div class="quick-options">
          @for (action of normalizedQuickActions(); track action.id) {
            <button type="button" class="quick-option-chip" (click)="onQuickAction(action)">
              {{ action.label }}
            </button>
          }
        </div>
      }

      @for (msg of messages(); track msg.id; let first = $first) {
        <!-- Operation Brief card for the first user message in an operation context -->
        @if (first && msg.role === 'user' && isOperation) {
          <div class="operation-brief">
            <div class="operation-brief__header">
              <svg
                class="agent-x-mark"
                width="18"
                height="18"
                viewBox="0 0 612 792"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path [attr.d]="agentXLogoPath" />
                <polygon [attr.points]="agentXLogoPolygon" />
              </svg>
              <span class="operation-brief__label">Operation Brief</span>
            </div>
            <p class="operation-brief__text">{{ msg.content }}</p>
          </div>
        } @else {
          <div
            class="msg-row"
            [class.msg-user]="msg.role === 'user'"
            [class.msg-assistant]="msg.role === 'assistant'"
            [class.msg-system]="msg.role === 'system'"
            [class.msg-error]="msg.error"
          >
            <nxt1-chat-bubble
              variant="agent-operation"
              [isOwn]="msg.role === 'user'"
              [content]="msg.content"
              [imageUrl]="msg.imageUrl"
              [videoUrl]="msg.videoUrl"
              [isTyping]="!!msg.isTyping"
              [isError]="!!msg.error"
              [isSystem]="msg.role === 'system'"
            />
          </div>
        }
      }

      <!-- ═══ THINKING INDICATOR (when operation is processing and no AI reply yet) ═══ -->
      @if (showThinking()) {
        <div class="thinking-block">
          <div class="thinking-block__avatar">
            <svg
              class="agent-x-mark"
              width="22"
              height="22"
              viewBox="0 0 612 792"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path [attr.d]="agentXLogoPath" />
              <polygon [attr.points]="agentXLogoPolygon" />
            </svg>
          </div>
          <div class="thinking-block__content">
            <div class="thinking-block__dots"><span></span><span></span><span></span></div>
            <span class="thinking-block__label">Agent X is working on this…</span>
          </div>
        </div>
      }

      <!-- ═══ HITL ACTION CARD (when operation is yielded) ═══ -->
      @if (activeYieldState() && !yieldResolved()) {
        <div class="msg-row msg-assistant">
          <nxt1-agent-action-card
            #actionCard
            [yield]="activeYieldState()!"
            [operationId]="contextId"
            (approve)="onApproveAction($event)"
            (reply)="onReplyAction($event)"
          />
        </div>
      }

      <!-- ═══ FAILURE BANNER (when operation has failed) ═══ -->
      @if (isFailed() && !retryStarted()) {
        <div class="failure-banner" [attr.data-testid]="failureTestIds.FAILURE_BANNER">
          <div class="failure-banner__header">
            <nxt1-icon name="alert-circle" [size]="20" />
            <span class="failure-banner__title" [attr.data-testid]="failureTestIds.FAILURE_TITLE"
              >Operation Failed</span
            >
          </div>
          <p class="failure-banner__message" [attr.data-testid]="failureTestIds.FAILURE_MESSAGE">
            {{ failureMessage() }}
          </p>
          <div class="failure-banner__actions">
            <button
              type="button"
              class="failure-banner__btn failure-banner__btn--retry"
              [attr.data-testid]="failureTestIds.BTN_RETRY"
              (click)="onRetry()"
            >
              <nxt1-icon name="refresh" [size]="14" />
              Retry
            </button>
            @if (!embedded) {
              <button
                type="button"
                class="failure-banner__btn failure-banner__btn--dismiss"
                [attr.data-testid]="failureTestIds.BTN_DISMISS"
                (click)="dismiss()"
              >
                Dismiss
              </button>
            }
          </div>
        </div>
      }

      @if (retryStarted()) {
        <div class="msg-row msg-system">
          <nxt1-chat-bubble
            variant="agent-operation"
            [isOwn]="false"
            [content]="'🔄 Retrying this operation — a new job has been queued. You can close this sheet.'"
            [isTyping]="false"
            [isError]="false"
            [isSystem]="true"
          />
        </div>
      }
    </div>

    <!-- ═══ INPUT ═══ -->
    <nxt1-agent-x-input
      class="embedded"
      [hasMessages]="messages().length > 0"
      [selectedTask]="null"
      [isLoading]="_loading()"
      [canSend]="canSend()"
      [userMessage]="inputValue()"
      [placeholder]="'Start your agent'"
      (messageChange)="inputValue.set($event)"
      (send)="send()"
      (toggleTasks)="onUploadClick()"
    />
    <input
      #fileInput
      class="file-input-hidden"
      type="file"
      accept="image/*,.pdf,.doc,.docx,.txt"
      multiple
      (change)="onFileSelected($event)"
    />
  `,
  styles: [
    `
      /* ============================================
         OPERATION CHAT BOTTOM SHEET
         ============================================ */
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background: var(--ion-background-color, var(--nxt1-color-bg-primary, #0a0a0a));
        color: var(--nxt1-color-text-primary, #fff);

        --op-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --op-border: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        --op-text: var(--nxt1-color-text-primary, #fff);
        --op-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --op-text-muted: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --op-primary: var(--nxt1-color-primary, #ccff00);
        --op-primary-glow: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      :host.agent-x-operation-chat--embedded {
        min-height: 0;
        border: 1px solid var(--op-border);
        border-radius: var(--nxt1-radius-2xl, 20px);
        background: transparent;
      }

      /* ── MESSAGES ── */
      .messages-area {
        flex: 1;
        overflow-y: auto;
        padding: 16px 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        -webkit-overflow-scrolling: touch;
        /* Adjust for keyboard on mobile - no transition for instant response */
        max-height: calc(100vh - var(--keyboard-offset, 0px) - 200px);
      }

      .messages-area--embedded {
        max-height: none;
        min-height: 0;
      }

      .msg-row {
        display: flex;
        gap: 8px;
        max-width: 88%;
        animation: fadeSlideIn 0.25s ease-out;
      }

      @keyframes fadeSlideIn {
        from {
          opacity: 0;
          transform: translateY(6px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .msg-user {
        margin-left: auto;
        flex-direction: row-reverse;
      }

      .msg-assistant {
        margin-right: auto;
      }

      .msg-assistant ::ng-deep nxt1-chat-bubble {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid var(--op-border);
        border-radius: 14px;
        padding: 14px 16px;
      }

      .msg-system {
        margin: 0 auto;
        max-width: 100%;
      }

      /* ── EMBEDDED INPUT ── */
      .embedded {
        padding: 12px 20px;
        padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
        flex-shrink: 0;
        /* Move input up when keyboard opens */
        transform: translateY(calc(-1 * var(--keyboard-offset, 0px)));
        transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
      }

      .file-input-hidden {
        display: none;
      }

      .quick-options {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 4px 0 12px;
        animation: fadeSlideIn 0.3s ease-out;
      }

      .quick-option-chip {
        display: inline-flex;
        align-items: center;
        padding: 8px 14px;
        border: 1px solid var(--op-border);
        border-radius: 999px;
        background: var(--op-surface);
        color: var(--op-text-secondary);
        font-size: 13px;
        font-weight: 500;
        font-family: inherit;
        line-height: 1.3;
        cursor: pointer;
        white-space: nowrap;
        -webkit-tap-highlight-color: transparent;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;
      }

      .quick-option-chip:active {
        background: var(--op-primary-glow);
        border-color: var(--op-primary);
        color: var(--op-primary);
      }

      /* ── FAILURE BANNER ── */
      .failure-banner {
        margin: 8px 0;
        padding: 16px;
        border-radius: 14px;
        border: 1px solid rgba(255, 59, 48, 0.25);
        background: rgba(255, 59, 48, 0.08);
        animation: fadeSlideIn 0.3s ease-out;
      }

      .failure-banner__header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        color: #ff3b30;
      }

      .failure-banner__title {
        font-size: 14px;
        font-weight: 600;
        letter-spacing: -0.01em;
      }

      .failure-banner__message {
        font-size: 13px;
        line-height: 1.5;
        color: var(--op-text-secondary);
        margin: 0 0 14px;
        white-space: pre-line;
      }

      .failure-banner__actions {
        display: flex;
        gap: 10px;
      }

      .failure-banner__btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: opacity 0.15s ease;
      }

      .failure-banner__btn:active {
        opacity: 0.7;
      }

      .failure-banner__btn--retry {
        background: var(--op-primary);
        color: #000;
        border: none;
      }

      .failure-banner__btn--dismiss {
        background: transparent;
        color: var(--op-text-secondary);
        border: 1px solid var(--op-border);
      }

      /* ── OPERATION BRIEF CARD ── */
      .operation-brief {
        margin: 4px 0 12px;
        padding: 14px 16px;
        border-radius: 14px;
        border: 1px solid var(--op-border);
        background: rgba(255, 255, 255, 0.04);
        animation: fadeSlideIn 0.3s ease-out;
      }

      .operation-brief__header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 8px;
        color: var(--op-text-secondary);
      }

      .operation-brief__label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--op-text-secondary);
      }

      .operation-brief__text {
        font-size: 13px;
        line-height: 1.55;
        color: var(--op-text-primary);
        margin: 0;
        white-space: pre-line;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
      }

      /* ── THINKING INDICATOR ── */
      .thinking-block {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 14px 0;
        animation: fadeSlideIn 0.3s ease-out;
      }

      .thinking-block__avatar {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        background: var(--op-primary-glow);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--op-primary);
        flex-shrink: 0;
      }

      .thinking-block__content {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .thinking-block__dots {
        display: flex;
        gap: 4px;
        align-items: center;
        height: 20px;
      }

      .thinking-block__dots span {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--op-primary);
        animation: thinkingPulse 1.4s ease-in-out infinite;
      }

      .thinking-block__dots span:nth-child(2) {
        animation-delay: 0.2s;
      }

      .thinking-block__dots span:nth-child(3) {
        animation-delay: 0.4s;
      }

      .thinking-block__label {
        font-size: 12px;
        color: var(--op-text-secondary);
        letter-spacing: -0.01em;
      }

      @keyframes thinkingPulse {
        0%,
        80%,
        100% {
          opacity: 0.25;
          transform: scale(0.8);
        }
        40% {
          opacity: 1;
          transform: scale(1);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXOperationChatComponent implements AfterViewInit {
  private readonly modalCtrl = inject(ModalController);
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL);
  private readonly logger = inject(NxtLoggingService).child('AgentXOperationChat');
  private readonly haptics = inject(HapticsService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly keyboard = inject(KeyboardService, { optional: true });
  private readonly platformId = inject(PLATFORM_ID);
  private readonly jobService = inject(AgentXJobService);

  // ============================================
  // INPUTS (from componentProps)
  // ============================================

  /** Unique identifier for this operation/command context. */
  @Input() contextId = '';

  /** Display title shown in the sheet header. */
  @Input() contextTitle = '';

  /** Icon name displayed in the header. */
  @Input() contextIcon = 'bolt';

  /**
   * Type of context driving this chat.
   * - `operation` — Active background operation
   * - `command` — Quick command chip
   */
  @Input() contextType: 'operation' | 'command' = 'command';

  /** Coordinator description shown as the welcome message. */
  @Input() contextDescription = '';

  /** When true, renders as a desktop-embedded panel instead of a dismissible sheet. */
  @Input() embedded = false;

  /** Optional list of quick action suggestions shown as tappable chips. */
  @Input() quickActions: readonly OperationQuickAction[] = [];

  /** Optional initial message to auto-send when the sheet opens. */
  @Input() initialMessage = '';

  /**
   * Optional MongoDB thread ID — when provided, loads the historical
   * conversation from the backend so the user can review past messages.
   */
  @Input() threadId = '';

  /**
   * When the operation is in `awaiting_input` state, the shell passes
   * its yield state so the action card renders at the bottom of the thread.
   */
  @Input()
  set yieldState(value: AgentYieldState | null) {
    this.activeYieldState.set(value);
  }

  /**
   * Current operation status — when `'error'`, the failure banner is shown
   * after thread messages load so the user knows what happened.
   */
  @Input() operationStatus: 'processing' | 'complete' | 'error' | 'awaiting_input' | null = null;

  /**
   * Human-readable error description when `operationStatus === 'error'`.
   * Displayed inside the failure banner.
   */
  @Input() errorMessage: string | null = null;

  // ============================================
  // LOCAL STATE
  // ============================================

  /** Isolated message history for this operation context. */
  protected readonly messages = signal<OperationMessage[]>([]);

  /** Current user input value. */
  protected readonly inputValue = signal('');

  /** Whether an AI response is being generated. */
  protected readonly _loading = signal(false);

  /** Active yield state for this operation (set via input binding). */
  protected readonly activeYieldState = signal<AgentYieldState | null>(null);

  /** Whether the yield has been resolved (approved/replied). */
  protected readonly yieldResolved = signal(false);

  /** Agent X SVG logo path data for inline icon rendering. */
  protected readonly agentXLogoPath: string = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon: string = AGENT_X_LOGO_POLYGON;

  /** Test IDs for failure banner elements. */
  protected readonly failureTestIds = AGENT_X_OPERATION_CHAT_TEST_IDS;

  /** Whether this operation has failed — drives the failure banner. */
  protected readonly isFailed = computed(() => this.operationStatus === 'error');

  /** The failure message to display in the banner. */
  protected readonly failureMessage = computed(
    () => this.errorMessage || 'This operation encountered an error and could not complete.'
  );

  /** Whether a retry has been initiated (hides banner, shows confirmation). */
  protected readonly retryStarted = signal(false);

  /** Whether to show the persistent "Agent X is thinking" indicator. */
  protected readonly showThinking = computed(() => {
    if (this.contextType !== 'operation') return false;
    if (this.operationStatus !== 'processing') return false;
    if (this.activeYieldState()) return false;
    // Don't show if the last message is already an assistant reply (thread loaded real content)
    const msgs = this.messages();
    if (msgs.length === 0) return true;
    const last = msgs[msgs.length - 1];
    return last.role !== 'assistant' || !!last.isTyping;
  });

  /** Whether this is a background operation (vs a quick command). */
  protected get isOperation(): boolean {
    return this.contextType === 'operation';
  }

  /** Whether the welcome message and quick option chips are visible (commands only). */
  protected readonly showWelcome = computed(
    () =>
      !this._isThreadMode() &&
      this.contextType !== 'operation' &&
      this.normalizedQuickActions().length > 0 &&
      !this.hasUserSent()
  );

  /** Welcome message content derived from coordinator description or a generated fallback. */
  protected readonly welcomeMessage = computed(() => {
    if (this.contextDescription) return this.contextDescription;
    const title = this.contextTitle || 'Agent X';
    return `You're now talking to ${title}. How can I help you today?`;
  });

  /** Normalized quick actions — uses provided actions, fills with fallbacks if needed. Operations get none. */
  protected readonly normalizedQuickActions = computed<OperationQuickAction[]>(() => {
    // Operations skip straight to work — no chatbot-style suggestion pills
    if (this.contextType === 'operation') return [];

    const provided = this.quickActions.map((a, index) => ({
      ...a,
      id: a.id || `cmd-${index + 1}`,
    }));

    if (provided.length > 0) return provided;

    return this.getFallbackActions().map((item, index) => ({
      id: `fallback-${index + 1}`,
      icon: this.contextIcon,
      ...item,
    }));
  });

  /** Tracks whether the user has sent at least one message. */
  private readonly hasUserSent = signal(false);

  /** Whether this chat was opened to view a historical thread (suppresses generic welcome). */
  private readonly _isThreadMode = signal(false);

  /** Whether the send button should be enabled. */
  protected readonly canSend = computed(
    () => this.inputValue().trim().length > 0 && !this._loading()
  );

  /** Human-readable label for the context type badge. */
  protected readonly contextTypeLabel = computed(() => {
    if (this.contextType !== 'operation') return 'Quick Command';
    return this.isFailed() ? 'Failed Operation' : 'Active Operation';
  });

  /**
   * Short header title — truncates to ~5 words for a professional look.
   * Strips trailing emojis and keeps only the first few words.
   */
  protected readonly headerTitle = computed(() => {
    const raw = this.contextTitle || 'Agent X';
    // Strip trailing emoji sequences
    const cleaned = raw.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]+$/gu, '').trim();
    const words = cleaned.split(/\s+/);
    if (words.length <= 5) return cleaned;
    return words.slice(0, 5).join(' ');
  });

  // ============================================
  // VIEW CHILDREN
  // ============================================

  private readonly messagesArea = viewChild<ElementRef>('messagesArea');
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly actionCardRef = viewChild<AgentXActionCardComponent>('actionCard');

  constructor() {
    // Auto-scroll when messages change
    effect(() => {
      const msgs = this.messages();
      if (msgs.length > 0) {
        this.scrollToBottom();
      }
    });

    // Auto-scroll when an action card appears (yield state set)
    effect(() => {
      if (this.activeYieldState()) {
        this.scrollToBottom();
      }
    });

    // Apply keyboard offset to messages area (mobile only)
    if (isPlatformBrowser(this.platformId) && this.keyboard) {
      effect(() => {
        const offset = this.keyboard!.keyboardHeight();
        const messagesEl = this.messagesArea()?.nativeElement;
        if (messagesEl) {
          // Set keyboard offset immediately
          messagesEl.style.setProperty('--keyboard-offset', `${offset}px`);
          // Force immediate reflow for instant layout update
          void messagesEl.offsetHeight;
          // Auto-scroll instantly when keyboard opens
          if (offset > 0) {
            this.scrollToBottom();
          }
        }
      });
    }
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  /** Auto-send the initial message if provided. */
  private initialMessageSent = false;

  ngAfterViewInit(): void {
    // If opening an existing operation/thread, load its persisted messages.
    if (this.threadId?.trim()) {
      this._isThreadMode.set(true);
      void this.loadThreadMessages(this.threadId.trim());
      return;
    }

    // If the operation failed but has no thread, still show the failure context.
    if (this.operationStatus === 'error') {
      this._isThreadMode.set(true);
      this.injectFailureMessage();
      return;
    }

    if (this.initialMessage?.trim() && !this.initialMessageSent) {
      this.initialMessageSent = true;
      // Slight delay to let the sheet animation settle
      setTimeout(() => {
        this.inputValue.set(this.initialMessage.trim());
        this.send();
      }, 150);
    }
  }

  /**
   * Load a historical thread into this isolated operation chat view.
   * Preserves the operation sheet UX while showing the persisted conversation.
   */
  private async loadThreadMessages(threadId: string): Promise<void> {
    this._loading.set(true);
    this.logger.info('Loading operation thread', { threadId, contextId: this.contextId });

    try {
      const response = await firstValueFrom(
        this.http.get<{
          success: boolean;
          data?: {
            items: Array<{
              id?: string;
              role: string;
              content: string;
              createdAt?: string;
              resultData?: Record<string, unknown>;
            }>;
            hasMore?: boolean;
          };
          error?: string;
        }>(`${this.baseUrl}/agent-x/threads/${encodeURIComponent(threadId)}/messages?limit=50`)
      );

      if (!response.success || !response.data?.items?.length) {
        this.logger.warn('Operation thread returned no messages', {
          threadId,
          contextId: this.contextId,
        });
        // Even with no messages, if the operation failed inject the error context
        if (this.operationStatus === 'error') {
          this.injectFailureMessage();
        }
        return;
      }

      const mapped: OperationMessage[] = response.data.items.map((msg) => ({
        id: msg.id ?? this.uid(),
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
        timestamp: msg.createdAt ? new Date(msg.createdAt) : new Date(),
        ...(typeof msg.resultData?.['imageUrl'] === 'string'
          ? { imageUrl: msg.resultData['imageUrl'] as string }
          : {}),
        ...(typeof msg.resultData?.['videoUrl'] === 'string'
          ? { videoUrl: msg.resultData['videoUrl'] as string }
          : {}),
      }));

      this.messages.set(mapped);
      this.hasUserSent.set(mapped.some((msg) => msg.role === 'user'));
      this.logger.info('Operation thread loaded', {
        threadId,
        contextId: this.contextId,
        messageCount: mapped.length,
      });

      // If this operation has failed, inject an AI error message at the end
      // so the user understands what happened.
      if (this.operationStatus === 'error') {
        this.injectFailureMessage();
      }
    } catch (err) {
      this.logger.error('Failed to load operation thread', err, {
        threadId,
        contextId: this.contextId,
      });
      this.pushMessage({
        id: this.uid(),
        role: 'assistant',
        content: 'Failed to load this conversation. You can still continue here.',
        timestamp: new Date(),
        error: true,
      });
    } finally {
      this._loading.set(false);
    }
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /** Dismiss the bottom sheet. */
  async dismiss(): Promise<void> {
    if (this.embedded) return;
    await this.modalCtrl.dismiss(undefined, 'close');
  }

  /**
   * Retry the failed operation by re-enqueuing the same intent.
   * Shows a confirmation message and re-queues the job.
   */
  protected async onRetry(): Promise<void> {
    this.logger.info('Retrying failed operation', { contextId: this.contextId });
    this.breadcrumb.trackUserAction('operation-retry', { operationId: this.contextId });
    await this.haptics.impact('medium');

    this.retryStarted.set(true);

    const result = await this.jobService.retryOperation(this.contextId, this.contextTitle);

    if (result) {
      await this.haptics.notification('success');
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_RETRIED, {
        originalOperationId: this.contextId,
        newOperationId: result.operationId,
        source: 'operation-chat',
      });
      this.logger.info('Retry enqueued', {
        originalId: this.contextId,
        newOperationId: result.operationId,
      });
    } else {
      await this.haptics.notification('error');
      this.retryStarted.set(false);
      this.pushMessage({
        id: this.uid(),
        role: 'assistant',
        content:
          'Sorry, I couldn\u2019t restart this operation right now. Please try again in a moment.',
        timestamp: new Date(),
        error: true,
      });
    }
  }

  /** Send the current input as a user message. */
  async send(): Promise<void> {
    const text = this.inputValue().trim();
    if (!text || this._loading()) return;

    this.inputValue.set('');
    this.hasUserSent.set(true);

    // Append user message
    this.pushMessage({
      id: this.uid(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    });

    // Show typing indicator
    this.pushMessage({
      id: 'typing',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isTyping: true,
    });
    this._loading.set(true);

    try {
      await this.callAgentChat(text);
      await this.haptics.notification('success');
    } catch (err) {
      this.logger.error('Chat message failed', err, { contextId: this.contextId });
      await this.haptics.notification('error');
      this.replaceTyping({
        id: this.uid(),
        role: 'assistant',
        content: 'Something went wrong. Please try again.',
        timestamp: new Date(),
        error: true,
      });
    } finally {
      this._loading.set(false);
    }
  }

  /** Handle a quick action chip tap — auto-sends as user message. */
  async onQuickAction(action: OperationQuickAction): Promise<void> {
    this.inputValue.set(action.label);
    await this.send();
  }

  /** Open native file picker from the shared input plus button. */
  protected onUploadClick(): void {
    this.fileInput()?.nativeElement.click();
  }

  /** Handle selected files/images and append upload context into chat. */
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;

    this.hasUserSent.set(true);

    const firstThree = files
      .slice(0, 3)
      .map((f) => f.name)
      .join(', ');
    const suffix = files.length > 3 ? ` +${files.length - 3} more` : '';

    this.pushMessage({
      id: this.uid(),
      role: 'user',
      content: `Uploaded ${files.length} file${files.length > 1 ? 's' : ''}: ${firstThree}${suffix}`,
      timestamp: new Date(),
    });

    this.pushMessage({
      id: this.uid(),
      role: 'assistant',
      content: 'Got it. I can use these files in your request. Tell me what you want me to create.',
      timestamp: new Date(),
    });

    input.value = '';
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private getFallbackActions(): Pick<OperationQuickAction, 'label' | 'description'>[] {
    if (this.contextType === 'operation') {
      return [
        { label: 'Status', description: 'Check current progress and updates' },
        { label: 'Progress', description: 'View detailed completion breakdown' },
        { label: 'Refine', description: 'Adjust parameters and improve results' },
        { label: 'Boost Quality', description: 'Enhance output with extra processing' },
        { label: 'Set Priority', description: 'Change urgency and processing order' },
        { label: 'Notify Me', description: 'Get alerted when this is done' },
        { label: 'Pause', description: 'Temporarily hold this operation' },
        { label: 'Export', description: 'Download or share the results' },
      ];
    }

    return [
      { label: 'Create Plan', description: 'Build a step-by-step action plan' },
      { label: 'Generate Draft', description: 'Get a first draft ready to review' },
      { label: 'Refine Output', description: 'Polish and improve existing work' },
      { label: 'Next Steps', description: 'See recommended follow-up actions' },
      { label: 'Best Version', description: 'Optimize for the highest quality' },
      { label: 'Publish Ready', description: 'Finalize and prepare to share' },
      { label: 'Save Draft', description: 'Store your progress for later' },
      { label: 'Share', description: 'Send results to your team' },
    ];
  }

  /** Send user message to backend Agent X chat and replace typing indicator with response. */
  private async callAgentChat(userInput: string): Promise<void> {
    // Build conversation history from local messages (exclude typing indicators)
    const history = this.messages()
      .filter((m) => !m.isTyping && m.role !== 'system')
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    const rawResponse = await firstValueFrom(
      this.http.post(
        `${this.baseUrl}/agent-x/chat`,
        {
          message: userInput,
          mode: this.contextType === 'operation' ? 'operations' : undefined,
          history,
          userContext: {
            operationContext: this.contextTitle,
            contextType: this.contextType,
            contextId: this.contextId,
          },
        },
        { responseType: 'text' }
      )
    );

    const response = this.parseChatResponse(rawResponse);

    if (response.success && response.message) {
      this.replaceTyping({
        id: response.message.id ?? this.uid(),
        role: 'assistant',
        content: response.message.content,
        timestamp: new Date(),
      });
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_SENT, {
        contextType: this.contextType,
        contextId: this.contextId,
      });
    } else {
      throw new Error(response.error ?? 'No response from Agent X');
    }
  }

  /**
   * Parse chat endpoint payloads that may be JSON or SSE text.
   * Mobile can receive `text/event-stream`, which cannot be parsed by HttpClient JSON mode.
   */
  private parseChatResponse(raw: string): {
    success: boolean;
    message?: { id: string; content: string; metadata?: Record<string, unknown> };
    threadId?: string;
    error?: string;
  } {
    const text = raw?.trim();
    if (!text) {
      return { success: false, error: 'Empty response from Agent X' };
    }

    // First, attempt plain JSON payload parsing.
    try {
      return JSON.parse(text) as {
        success: boolean;
        message?: { id: string; content: string; metadata?: Record<string, unknown> };
        threadId?: string;
        error?: string;
      };
    } catch {
      // Not JSON; fall through to SSE frame parsing.
    }

    let threadId: string | undefined;
    let content = '';
    let doneModel: string | undefined;
    let sseError: string | undefined;

    const frames = text
      .split('\n\n')
      .map((f) => f.trim())
      .filter(Boolean);
    for (const frame of frames) {
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
        const payload = JSON.parse(dataLine) as {
          threadId?: string;
          content?: string;
          model?: string;
          error?: string;
        };

        if (eventType === 'thread' && payload.threadId) {
          threadId = payload.threadId;
        } else if (eventType === 'delta' && payload.content) {
          content += payload.content;
        } else if (eventType === 'done') {
          if (payload.threadId) threadId = payload.threadId;
          if (payload.model) doneModel = payload.model;
        } else if (eventType === 'error') {
          sseError = payload.error ?? 'Agent X stream error';
        }
      } catch {
        // Ignore malformed frames and continue parsing remaining events.
      }
    }

    if (sseError) {
      return { success: false, error: sseError, threadId };
    }

    if (content.length > 0) {
      return {
        success: true,
        threadId,
        message: {
          id: this.uid(),
          content,
          metadata: doneModel ? { model: doneModel } : undefined,
        },
      };
    }

    return { success: false, error: 'Unable to parse Agent X response', threadId };
  }

  /** Append a message to the local history. */
  private pushMessage(msg: OperationMessage): void {
    this.messages.update((prev) => [...prev, msg]);
  }

  /** Replace the typing indicator with a real message. */
  private replaceTyping(msg: OperationMessage): void {
    this.messages.update((prev) => [...prev.filter((m) => m.id !== 'typing'), msg]);
  }

  /** Scroll the messages area to the bottom. */
  private scrollToBottom(): void {
    const el = this.messagesArea()?.nativeElement;
    if (el) {
      // Scroll immediately without delay for instant keyboard response
      el.scrollTop = el.scrollHeight;
    }
  }

  // ============================================
  // ACTION CARD (HITL) HANDLERS
  // ============================================

  /** Handle approval/rejection from the action card. */
  protected async onApproveAction(event: ActionCardApprovalEvent): Promise<void> {
    this.logger.info('Action card approval', {
      operationId: event.operationId,
      decision: event.decision,
    });
    this.breadcrumb.trackUserAction('action-card-approve', {
      operationId: event.operationId,
      decision: event.decision,
    });

    try {
      const success = await this.jobService.approveOperation(event.operationId, event.decision);
      if (success) {
        await this.haptics.notification('success');
        this.actionCardRef()?.markResolved(
          event.decision === 'approve' ? 'Approved — resuming' : 'Rejected — cancelled'
        );
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_APPROVED, {
          operationId: event.operationId,
          decision: event.decision,
          source: 'operation-chat',
        });
        // Brief delay to show resolved state before hiding
        setTimeout(() => {
          this.yieldResolved.set(true);
          this.pushMessage({
            id: this.uid(),
            role: 'system',
            content:
              event.decision === 'approve'
                ? '✅ Approved — Agent X is resuming the operation.'
                : '⛔ Rejected — Operation has been cancelled.',
            timestamp: new Date(),
          });
        }, 800);
      } else {
        this.logger.warn('Approve API returned false', { operationId: event.operationId });
        await this.haptics.notification('error');
        this.actionCardRef()?.markIdle();
      }
    } catch (err) {
      this.logger.error('Action card approval failed', err, { operationId: event.operationId });
      await this.haptics.notification('error');
      this.actionCardRef()?.markIdle();
    }
  }

  /** Handle text reply from the action card. */
  protected async onReplyAction(event: ActionCardReplyEvent): Promise<void> {
    this.logger.info('Action card reply', { operationId: event.operationId });
    this.breadcrumb.trackUserAction('action-card-reply', {
      operationId: event.operationId,
    });

    try {
      const success = await this.jobService.replyOperation(event.operationId, event.response);
      if (success) {
        await this.haptics.notification('success');
        this.actionCardRef()?.markResolved('Reply sent — resuming');
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_REPLIED, {
          operationId: event.operationId,
          source: 'operation-chat',
        });
        // Brief delay to show resolved state before hiding
        setTimeout(() => {
          this.yieldResolved.set(true);
          this.pushMessage({
            id: this.uid(),
            role: 'user',
            content: event.response,
            timestamp: new Date(),
          });
          this.pushMessage({
            id: this.uid(),
            role: 'system',
            content: '✅ Reply sent — Agent X is resuming with your input.',
            timestamp: new Date(),
          });
        }, 800);
      } else {
        this.logger.warn('Reply API returned false', { operationId: event.operationId });
        await this.haptics.notification('error');
        this.actionCardRef()?.markIdle();
      }
    } catch (err) {
      this.logger.error('Action card reply failed', err, { operationId: event.operationId });
      await this.haptics.notification('error');
      this.actionCardRef()?.markIdle();
    }
  }

  /** Generate a unique ID. */
  private uid(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `op-msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Inject an AI-authored error message into the chat when an operation
   * has failed, so the user understands what happened.
   */
  private injectFailureMessage(): void {
    const reason = this.errorMessage || 'an unexpected error';
    this.pushMessage({
      id: this.uid(),
      role: 'assistant',
      content:
        `This operation was unable to complete due to ${reason}.\n\n` +
        `You can retry below, or dismiss and start a new request.`,
      timestamp: new Date(),
      error: true,
    });
  }
}
