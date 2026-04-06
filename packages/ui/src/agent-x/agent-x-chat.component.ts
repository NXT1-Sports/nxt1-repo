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
  output,
  viewChild,
  ElementRef,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AgentXMessage } from '@nxt1/core';
import { NxtIconComponent } from '../components/icon/icon.component';
import { NxtChatBubbleComponent } from '../components/chat-bubble';
import {
  AgentXActionCardComponent,
  type ActionCardApprovalEvent,
  type ActionCardReplyEvent,
} from './agent-x-action-card.component';

@Component({
  selector: 'nxt1-agent-x-chat',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtChatBubbleComponent, AgentXActionCardComponent],
  template: `
    <div class="messages-container" #messagesContainer>
      @for (message of messages(); track message.id) {
        @if (message.yieldState && message.operationId) {
          <!-- ═══ ACTION CARD (HITL yield) ═══ -->
          <div class="message-row assistant">
            <div class="message-avatar">
              <nxt1-icon name="bolt" [size]="20" />
            </div>
            <nxt1-agent-action-card
              [yield]="message.yieldState"
              [operationId]="message.operationId"
              (approve)="onApprove($event)"
              (reply)="onReply($event)"
            />
          </div>
        } @else {
          <!-- ═══ STANDARD CHAT BUBBLE ═══ -->
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
            <nxt1-chat-bubble
              variant="agent-chat"
              [isOwn]="message.role === 'user'"
              [content]="message.content"
              [imageUrl]="message.imageUrl"
              [isTyping]="!!message.isTyping"
              [isError]="!!message.error"
              [steps]="message.steps ?? []"
              [cards]="message.cards ?? []"
            />
          </div>
        }
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
  // OUTPUTS
  // ============================================

  /** Bubbles approval events up to the parent shell/service. */
  readonly approveAction = output<ActionCardApprovalEvent>();

  /** Bubbles reply events up to the parent shell/service. */
  readonly replyAction = output<ActionCardReplyEvent>();

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
  // ACTION CARD HANDLERS
  // ============================================

  protected onApprove(event: ActionCardApprovalEvent): void {
    this.approveAction.emit(event);
  }

  protected onReply(event: ActionCardReplyEvent): void {
    this.replyAction.emit(event);
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
