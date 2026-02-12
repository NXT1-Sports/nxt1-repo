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
        <!-- Animated gradient glow ring (matches search bar) -->
        <span class="glow-ring" aria-hidden="true"></span>

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
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        position: fixed;
        left: 0;
        right: 0;
        /* Desktop: sit comfortably above page bottom */
        bottom: 24px;
        z-index: var(--nxt1-z-index-fixed, 999);
        pointer-events: none;

        --agent-input-bg: var(--nxt1-glass-bg, rgba(18, 18, 18, 0.8));
        --agent-input-border: var(--nxt1-glass-borderSubtle, rgba(255, 255, 255, 0.08));
        --agent-input-radius: var(--nxt1-ui-radius-2xl, 20px);
        --agent-input-shadow:
          var(--nxt1-glass-shadow, 0 4px 16px rgba(0, 0, 0, 0.16)),
          0 0 0 1px var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        --agent-x-tail-size: 14px;
        --agent-x-tail-offset: 10px;
      }

      /* Desktop: offset left edge past sidebar so pill centers in content area */
      @media (min-width: 768px) {
        :host {
          left: var(--nxt1-sidebar-width, 280px);
        }
      }

      /* Mobile: position above the fixed footer pill bar */
      @media (max-width: 767px) {
        :host {
          bottom: calc(88px + env(safe-area-inset-bottom, 0));
        }
      }

      .input-container {
        padding: 0 1rem;
        background: transparent;
        border: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        pointer-events: auto;
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
        align-items: center;
        gap: 0.5rem;
        background: var(--agent-input-bg);
        border: 1px solid var(--agent-input-border);
        border-radius: var(--agent-input-radius);
        padding: 0.5rem 0.75rem 0.5rem 1rem;
        height: var(--nxt1-ui-btn-height-lg, 52px);
        box-shadow: var(--agent-input-shadow);
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        position: relative;
        width: min(100%, 560px);
        transition:
          border-color 0.2s ease,
          box-shadow 0.2s ease,
          transform 0.2s ease;
      }

      /* Gradient border glow (same as search bar ::after) */
      .input-wrapper::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        padding: 1px;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-alpha-primary30, rgba(204, 255, 0, 0.15)),
          transparent,
          var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.1))
        );
        mask:
          linear-gradient(#fff 0 0) content-box,
          linear-gradient(#fff 0 0);
        mask-composite: exclude;
        pointer-events: none;
        opacity: 0.6;
      }

      /* Animated gradient flow (same as search bar ::before) */
      .input-wrapper .glow-ring {
        content: '';
        position: absolute;
        inset: -2px;
        border-radius: inherit;
        background: linear-gradient(
          45deg,
          transparent,
          var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.1)),
          transparent,
          var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.1)),
          transparent
        );
        background-size: 400% 400%;
        opacity: 0;
        animation: agent-gradient-flow 3s ease-in-out infinite;
        pointer-events: none;
        z-index: -1;
      }

      .input-wrapper:hover {
        border-color: var(--nxt1-glass-border, rgba(255, 255, 255, 0.12));
        box-shadow:
          var(--nxt1-glass-shadow, 0 4px 16px rgba(0, 0, 0, 0.16)),
          0 0 20px var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      .input-wrapper:focus-within {
        border-color: var(--nxt1-color-primary, #ccff00);
        box-shadow:
          var(--nxt1-glass-shadow, 0 4px 16px rgba(0, 0, 0, 0.16)),
          0 0 0 2px var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.1)),
          0 0 28px var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.1));
        transform: translateY(-1px);
      }

      .input-wrapper:focus-within .glow-ring {
        opacity: 1;
      }

      @keyframes agent-gradient-flow {
        0% {
          background-position: 0% 50%;
        }
        50% {
          background-position: 100% 50%;
        }
        100% {
          background-position: 0% 50%;
        }
      }

      .message-input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        -webkit-appearance: none;
        appearance: none;
        color: var(--nxt1-nav-text, var(--nxt1-color-text-primary, #ffffff));
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        line-height: 1.5;
        resize: none;
        max-height: 120px;
        min-height: 24px;
        padding: 0;
        align-self: center;
      }

      .message-input:focus {
        outline: none;
        box-shadow: none;
      }

      .message-input::placeholder {
        color: var(
          --nxt1-nav-text-muted,
          var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5))
        );
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

      /* Mobile polish: pill tail + intro animation */
      @media (max-width: 767px) {
        .input-container {
          width: 100%;
          animation: agent-input-enter 520ms cubic-bezier(0.16, 1, 0.3, 1) 60ms both;
        }

        .input-wrapper {
          width: min(100%, 420px);
        }

        .input-wrapper::after {
          content: '';
          position: absolute;
          width: var(--agent-x-tail-size);
          height: var(--agent-x-tail-size);
          right: calc(var(--agent-x-tail-offset) + env(safe-area-inset-right, 0));
          bottom: calc(-0.5 * var(--agent-x-tail-size));
          background: var(--agent-input-bg);
          border-right: 1px solid var(--agent-input-border);
          border-bottom: 1px solid var(--agent-input-border);
          /* Rotate 55deg to angle the point toward the right (toward FAB) */
          transform: rotate(55deg) skewX(8deg);
          border-bottom-right-radius: 3px;
          filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2));
          animation: agent-tail-enter 520ms cubic-bezier(0.16, 1, 0.3, 1) 180ms both;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .input-container {
          animation: none;
        }

        .input-wrapper::after {
          animation: none;
        }
      }

      @keyframes agent-input-enter {
        0% {
          opacity: 0;
          transform: translateY(14px) scale(0.985);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes agent-tail-enter {
        0% {
          opacity: 0;
          transform: translateY(6px) rotate(55deg) skewX(8deg) scale(0.6);
        }
        100% {
          opacity: 1;
          transform: translateY(0) rotate(55deg) skewX(8deg) scale(1);
        }
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
