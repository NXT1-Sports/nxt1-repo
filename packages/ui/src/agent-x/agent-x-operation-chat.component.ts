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
import { NxtLoggingService } from '../services/logging/logging.service';
import { HapticsService } from '../services/haptics/haptics.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { AgentXInputComponent } from './agent-x-input.component';
import { AGENT_X_API_BASE_URL } from './agent-x-job.service';
import { KeyboardService } from '../services/keyboard/keyboard.service';

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
  readonly isTyping?: boolean;
  readonly error?: boolean;
}

@Component({
  selector: 'nxt1-agent-x-operation-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NxtSheetHeaderComponent,
    NxtChatBubbleComponent,
    AgentXInputComponent,
  ],
  template: `
    <!-- ═══ HEADER ═══ -->
    <nxt1-sheet-header
      [title]="contextTitle"
      [subtitle]="contextTypeLabel()"
      [showAgentXIcon]="true"
      iconShape="rounded"
      closePosition="right"
      [showBorder]="true"
      (closeSheet)="dismiss()"
    />

    <!-- ═══ MESSAGES ═══ -->
    <div class="messages-area" #messagesArea>
      <!-- ═══ COORDINATOR WELCOME ═══ -->
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

      @for (msg of messages(); track msg.id) {
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
            [isTyping]="!!msg.isTyping"
            [isError]="!!msg.error"
            [isSystem]="msg.role === 'system'"
          />
        </div>
      }
    </div>

    <!-- ═══ INPUT ═══ -->
    <div class="shared-input-row">
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
    </div>
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

      .msg-system {
        margin: 0 auto;
        max-width: 100%;
      }

      /* ── SHARED INPUT ROW ── */
      .shared-input-row {
        padding: 12px 20px;
        padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
        border-top: 1px solid var(--op-border);
        background: var(--ion-background-color, var(--nxt1-color-bg-primary, #0a0a0a));
        flex-shrink: 0;
        /* Move input up when keyboard opens */
        transform: translateY(calc(-1 * var(--keyboard-offset, 0px)));
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
  private readonly keyboard = inject(KeyboardService, { optional: true });
  private readonly platformId = inject(PLATFORM_ID);

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

  /** Optional list of quick action suggestions shown as tappable chips. */
  @Input() quickActions: OperationQuickAction[] = [];

  /** Optional initial message to auto-send when the sheet opens. */
  @Input() initialMessage = '';

  // ============================================
  // LOCAL STATE
  // ============================================

  /** Isolated message history for this operation context. */
  protected readonly messages = signal<OperationMessage[]>([]);

  /** Current user input value. */
  protected readonly inputValue = signal('');

  /** Whether an AI response is being generated. */
  protected readonly _loading = signal(false);

  /** Whether the welcome message and quick option chips are visible (hide after first user message). */
  protected readonly showWelcome = computed(
    () => this.normalizedQuickActions().length > 0 && !this.hasUserSent()
  );

  /** Welcome message content derived from coordinator description or a generated fallback. */
  protected readonly welcomeMessage = computed(() => {
    if (this.contextDescription) return this.contextDescription;
    const title = this.contextTitle || 'Agent X';
    return `You're now talking to ${title}. How can I help you today?`;
  });

  /** Normalized quick actions — uses provided actions, fills with fallbacks if needed. */
  protected readonly normalizedQuickActions = computed<OperationQuickAction[]>(() => {
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

  /** Whether the send button should be enabled. */
  protected readonly canSend = computed(
    () => this.inputValue().trim().length > 0 && !this._loading()
  );

  /** Human-readable label for the context type badge. */
  protected readonly contextTypeLabel = computed(() =>
    this.contextType === 'operation' ? 'Active Operation' : 'Quick Command'
  );

  // ============================================
  // VIEW CHILDREN
  // ============================================

  private readonly messagesArea = viewChild<ElementRef>('messagesArea');
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  constructor() {
    // Auto-scroll when messages change
    effect(() => {
      const msgs = this.messages();
      if (msgs.length > 0) {
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
    if (this.initialMessage?.trim() && !this.initialMessageSent) {
      this.initialMessageSent = true;
      // Slight delay to let the sheet animation settle
      setTimeout(() => {
        this.inputValue.set(this.initialMessage.trim());
        this.send();
      }, 150);
    }
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /** Dismiss the bottom sheet. */
  async dismiss(): Promise<void> {
    await this.modalCtrl.dismiss(undefined, 'close');
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

  /** Generate a unique ID. */
  private uid(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `op-msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
