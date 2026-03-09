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
  inject,
  signal,
  computed,
  viewChild,
  ElementRef,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular/standalone';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';
import { AgentXInputComponent } from './agent-x-input.component';

// ============================================
// INTERFACES
// ============================================

/** Shape of a suggested quick action chip shown inside the chat. */
export interface OperationQuickAction {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
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
  imports: [CommonModule, FormsModule, NxtSheetHeaderComponent, AgentXInputComponent],
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

    <!-- ═══ COMMAND HUB (Upper-Middle) ═══ -->
    @if (showQuickActions()) {
      <div class="quick-actions-hub">
        <div class="quick-actions-row quick-actions-row--grid">
          @for (action of normalizedQuickActions(); track action.id) {
            <button type="button" class="quick-action-chip" (click)="onQuickAction(action)">
              <span>{{ shortActionLabel(action.label) }}</span>
            </button>
          }
        </div>
      </div>
    }

    <!-- ═══ MESSAGES ═══ -->
    <div class="messages-area" #messagesArea>
      @for (msg of messages(); track msg.id) {
        <div
          class="msg-row"
          [class.msg-user]="msg.role === 'user'"
          [class.msg-assistant]="msg.role === 'assistant'"
          [class.msg-system]="msg.role === 'system'"
          [class.msg-error]="msg.error"
        >
          <div class="msg-bubble">
            @if (msg.isTyping) {
              <div class="typing-dots"><span></span><span></span><span></span></div>
            } @else if (msg.role === 'system') {
              <p class="msg-text msg-text--system">{{ msg.content }}</p>
            } @else {
              <p class="msg-text">{{ msg.content }}</p>
            }
          </div>
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
      }

      .quick-actions-hub {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 6vh 20px 8px;
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

      .msg-bubble {
        padding: 10px 14px;
        border-radius: 14px;
        max-width: 100%;
      }

      .msg-user .msg-bubble {
        background: var(--op-primary);
        color: #0a0a0a;
        border-bottom-right-radius: 4px;
      }

      .msg-assistant .msg-bubble {
        background: transparent;
        border: none;
        color: var(--op-text);
        border-radius: 0;
        padding: 0;
      }

      .msg-system .msg-bubble {
        background: transparent;
        padding: 6px 12px;
      }

      .msg-error .msg-bubble {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.3);
      }

      .msg-text {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .msg-text--system {
        font-size: 12px;
        color: var(--op-text-muted);
        text-align: center;
        font-style: italic;
      }

      /* Typing indicator */
      .typing-dots {
        display: flex;
        gap: 4px;
        padding: 2px 0;
      }

      .typing-dots span {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--op-text-muted);
        animation: dotBounce 1.4s ease-in-out infinite;
      }

      .typing-dots span:nth-child(2) {
        animation-delay: 0.2s;
      }
      .typing-dots span:nth-child(3) {
        animation-delay: 0.4s;
      }

      @keyframes dotBounce {
        0%,
        60%,
        100% {
          transform: translateY(0);
          opacity: 0.4;
        }
        30% {
          transform: translateY(-5px);
          opacity: 1;
        }
      }

      /* ── SHARED INPUT ROW ── */
      .shared-input-row {
        padding: 12px 20px;
        padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
        border-top: 1px solid var(--op-border);
        background: var(--ion-background-color, var(--nxt1-color-bg-primary, #0a0a0a));
        flex-shrink: 0;
      }

      .file-input-hidden {
        display: none;
      }

      /* ── QUICK ACTION CHIPS ── */
      .quick-actions-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        flex-shrink: 0;
        justify-content: center;
      }

      .quick-actions-row--grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        width: min(560px, 100%);
      }

      .quick-action-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 12px;
        border: 1px solid var(--op-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        background: var(--op-surface);
        color: var(--op-text-secondary);
        font-size: 13px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        white-space: nowrap;
        -webkit-tap-highlight-color: transparent;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;
      }

      .quick-action-chip:active {
        background: var(--op-primary-glow);
        border-color: var(--op-primary);
        color: var(--op-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXOperationChatComponent {
  private readonly modalCtrl = inject(ModalController);

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

  /** Optional list of quick action suggestions shown as tappable chips. */
  @Input() quickActions: OperationQuickAction[] = [];

  // ============================================
  // LOCAL STATE
  // ============================================

  /** Isolated message history for this operation context. */
  protected readonly messages = signal<OperationMessage[]>([]);

  /** Current user input value. */
  protected readonly inputValue = signal('');

  /** Whether an AI response is being generated. */
  protected readonly _loading = signal(false);

  /** Whether quick action chips are visible (hide after first user message). */
  protected readonly showQuickActions = computed(
    () => this.normalizedQuickActions().length > 0 && !this.hasUserSent()
  );

  /** Normalized quick actions list (always target 6 options for command hub). */
  protected readonly normalizedQuickActions = computed<OperationQuickAction[]>(() => {
    const base = this.quickActions.map((a, index) => ({
      ...a,
      id: a.id || `cmd-${index + 1}`,
      label: this.shortActionLabel(a.label),
    }));

    const seen = new Set(base.map((a) => a.label.toLowerCase()));
    const fallbackLabels = this.getFallbackActionLabels();
    const filled = [...base];

    for (const label of fallbackLabels) {
      if (filled.length >= 6) break;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      filled.push({ id: `fallback-${filled.length + 1}`, label, icon: this.contextIcon });
    }

    return filled.slice(0, 6);
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
  }

  // ============================================
  // LIFECYCLE
  // ============================================

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
      await this.simulateResponse(text);
    } catch {
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

  /** Keep quick action labels compact in the sheet UI. */
  protected shortActionLabel(label: string): string {
    const compact = label.trim();
    if (compact.length <= 22) return compact;
    return `${compact.slice(0, 22).trimEnd()}...`;
  }

  private getFallbackActionLabels(): string[] {
    if (this.contextType === 'operation') {
      return [
        'Status',
        'Progress',
        'Refine',
        'Boost Quality',
        'Set Priority',
        'Notify Me',
        'Pause',
        'Export',
      ];
    }

    return [
      'Create Plan',
      'Generate Draft',
      'Refine Output',
      'Next Steps',
      'Best Version',
      'Publish Ready',
      'Save Draft',
      'Share',
    ];
  }

  /** Simulate an AI response (placeholder until backend wired). */
  private async simulateResponse(userInput: string): Promise<void> {
    const delay = 1200 + Math.random() * 800;
    await new Promise((resolve) => setTimeout(resolve, delay));

    const responses = this.getContextualResponses(userInput);
    const content = responses[Math.floor(Math.random() * responses.length)];

    this.replaceTyping({
      id: this.uid(),
      role: 'assistant',
      content,
      timestamp: new Date(),
    });
  }

  /** Return responses tailored to the operation context. */
  private getContextualResponses(input: string): string[] {
    if (this.contextType === 'operation') {
      return [
        `Here's the latest on "${this.contextTitle}":\n\n` +
          `• Processing is on track\n` +
          `• No blockers detected\n` +
          `• Estimated completion: within the hour\n\n` +
          `Want me to adjust priority or notify you when it's done?`,
        `Based on your input "${input.slice(0, 40)}…", I've updated the parameters for this operation. ` +
          `The changes will take effect on the next processing cycle.`,
        `Good question. This operation is currently at the analysis stage. ` +
          `I can provide a detailed breakdown or fast-track it if you need results sooner.`,
      ];
    }
    return [
      `I'll get started on "${this.contextTitle}" right away.\n\n` +
        `Here's what I'll do:\n` +
        `1. Gather relevant data from your profile\n` +
        `2. Process and analyze the results\n` +
        `3. Present a summary for your review\n\n` +
        `Anything specific you'd like me to focus on?`,
      `Great — I've pulled up everything related to "${this.contextTitle}". ` +
        `Based on "${input.slice(0, 40)}…", I'll tailor the output specifically for you.`,
      `Working on it! I'm cross-referencing your profile data with the latest insights. ` +
        `I'll have a draft ready in a moment. Feel free to refine your request while I work.`,
    ];
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
      setTimeout(() => {
        el.scrollTop = el.scrollHeight;
      }, 50);
    }
  }

  /** Generate a unique ID. */
  private uid(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `op-msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
