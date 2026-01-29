/**
 * @fileoverview Agent X Chat Component
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Chat messages display component with typing indicator.
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  viewChild,
  ElementRef,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AgentXMessage } from '@nxt1/core';
import { NxtIconComponent } from '../components/icon/icon.component';

@Component({
  selector: 'nxt1-agent-x-chat',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <div class="messages-container" #messagesContainer>
      @for (message of messages(); track message.id) {
        <div
          class="message-row"
          [class.user]="message.role === 'user'"
          [class.assistant]="message.role === 'assistant'"
          [class.error]="message.error"
        >
          @if (message.role === 'assistant') {
            <div class="message-avatar">
              <nxt1-icon name="bolt" [size]="20" />
            </div>
          }
          <div class="message-bubble">
            @if (message.isTyping) {
              <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            } @else {
              <p class="message-content">{{ message.content }}</p>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .messages-container {
        flex: 1;
        overflow-y: auto;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .message-row {
        display: flex;
        gap: 0.75rem;
        max-width: 85%;
      }

      .message-row.user {
        margin-left: auto;
        flex-direction: row-reverse;
      }

      .message-row.assistant {
        margin-right: auto;
      }

      .message-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--agent-surface, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--agent-border, rgba(255, 255, 255, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--agent-primary, #ccff00);
      }

      .message-bubble {
        padding: 0.875rem 1rem;
        border-radius: 16px;
        max-width: 100%;
      }

      .message-row.user .message-bubble {
        background: var(--agent-primary, #ccff00);
        color: #0a0a0a;
        border-bottom-right-radius: 4px;
      }

      .message-row.assistant .message-bubble {
        background: var(--agent-surface, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--agent-border, rgba(255, 255, 255, 0.08));
        color: var(--agent-text-primary, #ffffff);
        border-bottom-left-radius: 4px;
      }

      .message-row.error .message-bubble {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.3);
      }

      .message-content {
        margin: 0;
        font-size: 0.9375rem;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }

      /* Typing Indicator */
      .typing-indicator {
        display: flex;
        gap: 4px;
        padding: 4px 0;
      }

      .typing-indicator span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--agent-text-muted, rgba(255, 255, 255, 0.5));
        animation: typing 1.4s ease-in-out infinite;
      }

      .typing-indicator span:nth-child(2) {
        animation-delay: 0.2s;
      }

      .typing-indicator span:nth-child(3) {
        animation-delay: 0.4s;
      }

      @keyframes typing {
        0%,
        60%,
        100% {
          transform: translateY(0);
          opacity: 0.4;
        }
        30% {
          transform: translateY(-6px);
          opacity: 1;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXChatComponent {
  // ============================================
  // INPUTS
  // ============================================

  readonly messages = input.required<readonly AgentXMessage[]>();

  // ============================================
  // VIEW CHILD
  // ============================================

  private readonly container = viewChild<ElementRef>('messagesContainer');

  constructor() {
    // Auto-scroll on new messages
    effect(() => {
      const msgs = this.messages();
      if (msgs.length > 0) {
        this.scrollToBottom();
      }
    });
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private scrollToBottom(): void {
    const el = this.container()?.nativeElement;
    if (el) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        el.scrollTop = el.scrollHeight;
      }, 50);
    }
  }
}
