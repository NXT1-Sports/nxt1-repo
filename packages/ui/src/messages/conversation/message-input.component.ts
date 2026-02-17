/**
 * @fileoverview Message Input Component
 * @module @nxt1/ui/messages/conversation
 * @version 1.0.0
 *
 * Professional message composer with:
 * - Auto-expanding textarea (1-5 lines)
 * - Send button with haptic feedback
 * - Reply-to preview with dismiss
 * - Character limit indicator
 * - Attachment button (future)
 * - Keyboard-aware safe area
 * - Sending state disabled UX
 *
 * ⭐ SHARED — Works on both web and mobile ⭐
 *
 * Follows iMessage / WhatsApp / Instagram DMs input pattern:
 * - Bar pinned to bottom above keyboard
 * - Rounded input area with send button
 * - Grows as user types multi-line
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  inject,
  signal,
  computed,
  viewChild,
  ElementRef,
  afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Message } from '@nxt1/core';
import { MESSAGES_UI_CONFIG } from '@nxt1/core';
import { HapticsService } from '../../services/haptics/haptics.service';

/** SVG icon paths */
const INPUT_ICONS = {
  send: 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z',
  attachment:
    'M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z',
  close:
    'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
} as const;

@Component({
  selector: 'nxt1-message-input',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Reply-to preview bar -->
    @if (replyTo()) {
      <div class="reply-preview">
        <div class="reply-preview-bar"></div>
        <div class="reply-preview-content">
          <span class="reply-preview-label">
            Replying to <strong>{{ replyTo()!.sender.name }}</strong>
          </span>
          <span class="reply-preview-text">{{ replyTo()!.body }}</span>
        </div>
        <button class="reply-dismiss" (click)="dismissReply.emit()" aria-label="Cancel reply">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path [attr.d]="icons.close" />
          </svg>
        </button>
      </div>
    }

    <!-- Input bar -->
    <div class="input-bar">
      <!-- Attachment button (future) -->
      <button class="input-action attach-button" aria-label="Attach file" [disabled]="isSending()">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path [attr.d]="icons.attachment" />
        </svg>
      </button>

      <!-- Text input area -->
      <div class="input-wrapper">
        <textarea
          #textareaEl
          class="input-field"
          [placeholder]="placeholder()"
          [value]="messageText()"
          [disabled]="isSending()"
          [attr.maxlength]="maxLength"
          (input)="onInput($event)"
          (keydown)="onKeydown($event)"
          rows="1"
          aria-label="Type a message"
        ></textarea>
      </div>

      <!-- Send button -->
      <button
        class="input-action send-button"
        [class.send-button--active]="canSend()"
        [disabled]="!canSend() || isSending()"
        (click)="onSend()"
        [attr.aria-label]="isSending() ? 'Sending...' : 'Send message'"
      >
        @if (isSending()) {
          <div class="send-spinner"></div>
        } @else {
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path [attr.d]="icons.send" />
          </svg>
        }
      </button>
    </div>

    <!-- Character count (shown when approaching limit) -->
    @if (showCharCount()) {
      <div
        class="char-count"
        [class.char-count--warning]="isNearLimit()"
        [class.char-count--error]="isOverLimit()"
      >
        {{ messageText().length }} / {{ maxLength }}
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        background: var(--nxt1-color-bg-primary);
        border-top: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
      }

      /* ============================================
         REPLY PREVIEW
         ============================================ */

      .reply-preview {
        display: flex;
        align-items: stretch;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-50);
        border-bottom: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
        animation: slideUp 150ms ease-out;
      }

      .reply-preview-bar {
        width: calc(var(--nxt1-spacing-px) * 3);
        border-radius: var(--nxt1-radius-full);
        background: var(--nxt1-color-primary);
        flex-shrink: 0;
        align-self: stretch;
      }

      .reply-preview-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0_5);
      }

      .reply-preview-label {
        font-size: var(--nxt1-font-size-xs);
        color: var(--nxt1-color-primary);
        line-height: 1.2;
      }

      .reply-preview-text {
        font-size: var(--nxt1-font-size-xs);
        color: var(--nxt1-color-text-tertiary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.3;
      }

      .reply-dismiss {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-6);
        height: var(--nxt1-spacing-6);
        border: none;
        background: none;
        color: var(--nxt1-color-text-tertiary);
        cursor: pointer;
        border-radius: var(--nxt1-radius-full);
        flex-shrink: 0;
        -webkit-tap-highlight-color: transparent;
        transition: background-color var(--nxt1-ui-transition-fast);
      }

      .reply-dismiss:hover {
        background: var(--nxt1-color-surface-100);
      }

      .reply-dismiss svg {
        width: var(--nxt1-spacing-4);
        height: var(--nxt1-spacing-4);
      }

      /* ============================================
         INPUT BAR
         ============================================ */

      .input-bar {
        display: flex;
        align-items: flex-end;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        padding-bottom: calc(var(--nxt1-spacing-2) + env(safe-area-inset-bottom, 0px));
      }

      /* Action buttons (attach, send) */
      .input-action {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-9);
        height: var(--nxt1-spacing-9);
        border: none;
        border-radius: var(--nxt1-radius-full);
        cursor: pointer;
        flex-shrink: 0;
        -webkit-tap-highlight-color: transparent;
        transition: all var(--nxt1-ui-transition-fast);
      }

      .input-action svg {
        width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
      }

      .input-action:disabled {
        opacity: 0.4;
        cursor: default;
      }

      .attach-button {
        background: none;
        color: var(--nxt1-color-text-tertiary);
      }

      .attach-button:hover:not(:disabled) {
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-secondary);
      }

      /* Send button */
      .send-button {
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-disabled);
      }

      .send-button--active {
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-inverse);
      }

      .send-button--active:hover:not(:disabled) {
        filter: brightness(1.1);
      }

      .send-button--active:active:not(:disabled) {
        transform: scale(0.95);
      }

      /* Text input wrapper */
      .input-wrapper {
        flex: 1;
        min-width: 0;
        position: relative;
      }

      .input-field {
        display: block;
        width: 100%;
        min-height: var(--nxt1-spacing-9);
        max-height: calc(var(--nxt1-spacing-9) * 5);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-spacing-5);
        background: var(--nxt1-color-surface-50);
        color: var(--nxt1-color-text-primary);
        font-family: inherit;
        font-size: var(--nxt1-font-size-base);
        line-height: 1.4;
        resize: none;
        overflow-y: auto;
        outline: none;
        -webkit-tap-highlight-color: transparent;
        transition: border-color var(--nxt1-ui-transition-fast);
      }

      .input-field:focus {
        border-color: var(--nxt1-color-primary);
      }

      .input-field:disabled {
        opacity: 0.6;
        cursor: default;
      }

      .input-field::placeholder {
        color: var(--nxt1-color-text-disabled);
      }

      /* ============================================
         CHARACTER COUNT
         ============================================ */

      .char-count {
        text-align: right;
        padding: 0 var(--nxt1-spacing-4) var(--nxt1-spacing-1);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);
        line-height: 1;
      }

      .char-count--warning {
        color: var(--nxt1-color-warning);
      }

      .char-count--error {
        color: var(--nxt1-color-error);
      }

      /* ============================================
         SEND SPINNER
         ============================================ */

      .send-spinner {
        width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
        border: calc(var(--nxt1-spacing-px) * 2) solid rgba(255, 255, 255, 0.3);
        border-top-color: var(--nxt1-color-text-inverse);
        border-radius: var(--nxt1-radius-full);
        animation: spin 0.8s linear infinite;
      }

      /* ============================================
         ANIMATIONS
         ============================================ */

      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(var(--nxt1-spacing-2));
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .send-spinner {
          animation-duration: 1.5s;
        }

        .reply-preview {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageInputComponent {
  private readonly haptics = inject(HapticsService);
  private readonly textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('textareaEl');

  /** Message being replied to (null if none) */
  readonly replyTo = input<Message | null>(null);

  /** Whether a message is currently being sent */
  readonly isSending = input(false);

  /** Placeholder text */
  readonly placeholder = input('Type a message...');

  /** Emitted when the user sends a message */
  readonly messageSend = output<string>();

  /** Emitted when reply context is dismissed */
  readonly dismissReply = output<void>();

  /** Icon paths */
  readonly icons = INPUT_ICONS;

  /** Max message length */
  readonly maxLength = MESSAGES_UI_CONFIG.maxMessageLength;

  /** Current message text */
  readonly messageText = signal('');

  /** Whether the send button should be active */
  readonly canSend = computed(() => {
    const text = this.messageText().trim();
    return text.length > 0 && text.length <= this.maxLength && !this.isSending();
  });

  /** Show char count when > 80% of limit */
  readonly showCharCount = computed(() => this.messageText().length > this.maxLength * 0.8);

  /** Near limit warning (> 90%) */
  readonly isNearLimit = computed(() => this.messageText().length > this.maxLength * 0.9);

  /** Over limit */
  readonly isOverLimit = computed(() => this.messageText().length > this.maxLength);

  constructor() {
    afterNextRender(() => {
      // Focus textarea after render (not on mobile to avoid keyboard pop)
    });
  }

  /** Handle textarea input and auto-resize */
  onInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    this.messageText.set(textarea.value);
    this.autoResize(textarea);
  }

  /** Handle keyboard shortcuts */
  onKeydown(event: KeyboardEvent): void {
    // Enter to send (without Shift)
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (this.canSend()) {
        this.onSend();
      }
    }
  }

  /** Send the message */
  async onSend(): Promise<void> {
    const text = this.messageText().trim();
    if (!text || this.isSending()) return;

    await this.haptics.impact('light');
    this.messageSend.emit(text);
    this.messageText.set('');

    // Reset textarea height
    const textarea = this.textareaRef()?.nativeElement;
    if (textarea) {
      textarea.value = '';
      textarea.style.height = 'auto';
    }
  }

  /** Focus the input programmatically */
  focus(): void {
    this.textareaRef()?.nativeElement?.focus();
  }

  /** Auto-resize textarea to fit content */
  private autoResize(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }
}
