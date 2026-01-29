/**
 * @fileoverview Agent X Input Component
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Bottom input bar with task pill and send button.
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  viewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { sendOutline, send, sparklesOutline, closeCircleOutline } from 'ionicons/icons';
import type { AgentXQuickTask } from '@nxt1/core';

@Component({
  selector: 'nxt1-agent-x-input',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon, IonSpinner],
  template: `
    <div class="input-container" [class.has-messages]="hasMessages()">
      <!-- Selected Task Pill -->
      @if (selectedTask()) {
        <div class="task-pill">
          <span class="task-pill-text">{{ selectedTask()?.title }}</span>
          <button
            type="button"
            class="task-pill-remove"
            (click)="removeTask.emit()"
            aria-label="Remove task"
          >
            <ion-icon name="close-circle-outline"></ion-icon>
          </button>
        </div>
      }

      <div class="input-wrapper">
        <textarea
          #messageInput
          [ngModel]="userMessage()"
          (ngModelChange)="onMessageChange($event)"
          (keydown.enter)="onEnterPress($event)"
          placeholder="Ask anything..."
          rows="1"
          [maxlength]="1000"
          class="message-input"
        ></textarea>

        <div class="input-actions">
          <button
            type="button"
            class="action-btn"
            (click)="toggleTasks.emit()"
            aria-label="AI Tasks"
          >
            <ion-icon name="sparkles-outline"></ion-icon>
          </button>

          <button
            type="button"
            class="send-btn"
            (click)="onSend()"
            [disabled]="!canSend()"
            aria-label="Send message"
          >
            @if (isLoading()) {
              <ion-spinner name="crescent" class="send-spinner"></ion-spinner>
            } @else {
              <ion-icon [name]="canSend() ? 'send' : 'send-outline'"></ion-icon>
            }
          </button>
        </div>
      </div>

      <p class="disclaimer">Agent X can make mistakes. Check important info.</p>
    </div>
  `,
  styles: [
    `
      .input-container {
        padding: 0.75rem 1rem;
        padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0));
        background: var(--agent-glass-bg, rgba(18, 18, 18, 0.8));
        backdrop-filter: var(--agent-glass-backdrop, saturate(180%) blur(20px));
        -webkit-backdrop-filter: var(--agent-glass-backdrop, saturate(180%) blur(20px));
        border-top: 1px solid var(--agent-glass-border, rgba(255, 255, 255, 0.1));
      }

      .input-container.has-messages {
        position: sticky;
        bottom: 0;
      }

      .task-pill {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.375rem 0.75rem;
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.1));
        border: 1px solid var(--agent-primary, #ccff00);
        border-radius: 20px;
        margin-bottom: 0.5rem;
        max-width: fit-content;
      }

      .task-pill-text {
        font-size: 0.8125rem;
        color: var(--agent-primary, #ccff00);
        font-weight: 500;
      }

      .task-pill-remove {
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        color: var(--agent-primary, #ccff00);
        opacity: 0.7;
        transition: opacity 0.2s;
      }

      .task-pill-remove:hover {
        opacity: 1;
      }

      .task-pill-remove ion-icon {
        font-size: 1rem;
      }

      .input-wrapper {
        display: flex;
        align-items: flex-end;
        gap: 0.5rem;
        background: var(--agent-surface, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--agent-border, rgba(255, 255, 255, 0.08));
        border-radius: 24px;
        padding: 0.5rem 0.5rem 0.5rem 1rem;
        transition: border-color 0.2s;
      }

      .input-wrapper:focus-within {
        border-color: var(--agent-primary, #ccff00);
      }

      .message-input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        color: var(--agent-text-primary, #ffffff);
        font-size: 1rem;
        line-height: 1.5;
        resize: none;
        max-height: 120px;
        min-height: 24px;
        padding: 0;
      }

      .message-input::placeholder {
        color: var(--agent-text-muted, rgba(255, 255, 255, 0.5));
      }

      .input-actions {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }

      .action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: transparent;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        color: var(--agent-text-secondary, rgba(255, 255, 255, 0.7));
        transition: all 0.2s;
      }

      .action-btn:hover {
        background: var(--agent-surface-hover, rgba(255, 255, 255, 0.04));
        color: var(--agent-primary, #ccff00);
      }

      .action-btn ion-icon {
        font-size: 1.25rem;
      }

      .send-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: var(--agent-primary, #ccff00);
        border: none;
        border-radius: 50%;
        cursor: pointer;
        color: #0a0a0a;
        transition: all 0.2s;
      }

      .send-btn:disabled {
        background: var(--agent-surface, rgba(255, 255, 255, 0.02));
        color: var(--agent-text-muted, rgba(255, 255, 255, 0.5));
        cursor: not-allowed;
      }

      .send-btn:not(:disabled):hover {
        transform: scale(1.05);
        box-shadow: 0 0 20px var(--agent-primary-glow, rgba(204, 255, 0, 0.3));
      }

      .send-btn:not(:disabled):active {
        transform: scale(0.95);
      }

      .send-btn ion-icon {
        font-size: 1.125rem;
      }

      .send-spinner {
        width: 18px;
        height: 18px;
        --color: currentColor;
      }

      .disclaimer {
        text-align: center;
        font-size: 0.75rem;
        color: var(--agent-text-muted, rgba(255, 255, 255, 0.5));
        margin: 0.5rem 0 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXInputComponent {
  // ============================================
  // INPUTS
  // ============================================

  readonly hasMessages = input<boolean>(false);
  readonly selectedTask = input<AgentXQuickTask | null>(null);
  readonly isLoading = input<boolean>(false);
  readonly canSend = input<boolean>(false);
  readonly userMessage = input<string>('');

  // ============================================
  // OUTPUTS
  // ============================================

  readonly messageChange = output<string>();
  readonly send = output<void>();
  readonly removeTask = output<void>();
  readonly toggleTasks = output<void>();

  // ============================================
  // VIEW CHILD
  // ============================================

  private readonly inputRef = viewChild<ElementRef>('messageInput');

  constructor() {
    // Register icons
    addIcons({
      sendOutline,
      send,
      sparklesOutline,
      closeCircleOutline,
    });
  }

  // ============================================
  // HANDLERS
  // ============================================

  protected onMessageChange(value: string): void {
    this.messageChange.emit(value);
    this.autoResize();
  }

  protected onEnterPress(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    if (!keyEvent.shiftKey && this.canSend()) {
      event.preventDefault();
      this.send.emit();
    }
  }

  protected onSend(): void {
    if (this.canSend()) {
      this.send.emit();
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private autoResize(): void {
    const textarea = this.inputRef()?.nativeElement;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  }
}
