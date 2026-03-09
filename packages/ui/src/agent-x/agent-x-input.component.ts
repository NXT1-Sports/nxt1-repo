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
import { NxtIconComponent } from '../components/icon/icon.component';
import type { AgentXQuickTask } from '@nxt1/core';

@Component({
  selector: 'nxt1-agent-x-input',
  standalone: true,
  imports: [CommonModule, FormsModule, NxtIconComponent],
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
            <nxt1-icon name="close" [size]="16" />
          </button>
        </div>
      }

      <div class="input-wrapper nxt1-shared-animated-glass-input">
        <button
          type="button"
          class="plus-btn"
          (click)="toggleTasks.emit()"
          aria-label="Open quick actions"
        >
          <nxt1-icon name="plus" [size]="20" />
        </button>

        <textarea
          #messageInput
          [ngModel]="userMessage()"
          (ngModelChange)="onMessageChange($event)"
          (keydown.enter)="onEnterPress($event)"
          [placeholder]="placeholder()"
          rows="1"
          [maxlength]="1000"
          class="message-input"
        ></textarea>

        @if (isLoading()) {
          <button
            type="button"
            class="primary-btn stop"
            (click)="onStopAction()"
            aria-label="Stop generation"
          >
            <div class="stop-wrapper">
              <svg class="stop-spinner" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="16" />
              </svg>
              <span class="stop-square"></span>
            </div>
          </button>
        } @else {
          <button
            type="button"
            class="primary-btn"
            [class.send]="canSend()"
            [disabled]="!canSend()"
            (click)="onPrimaryAction()"
            aria-label="Send message"
          >
            <nxt1-icon name="arrowUp" [size]="18" />
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        position: fixed;
        left: var(--agent-input-left, 0);
        right: var(--agent-input-right, 0);
        bottom: calc(24px + var(--keyboard-offset, 0px));
        z-index: var(--nxt1-z-index-fixed, 999);
        pointer-events: none;
        transition: bottom 0.3s ease-out;

        --agent-input-bg: var(--nxt1-glass-bg, rgba(18, 18, 18, 0.8));
        --agent-input-border: var(--nxt1-glass-borderSubtle, rgba(255, 255, 255, 0.08));
        --agent-input-radius: var(--nxt1-ui-radius-2xl, 20px);
        --agent-input-shadow: var(--nxt1-glass-shadow, 0 4px 16px rgba(0, 0, 0, 0.16));
        --agent-input-min-height: 48px;
      }

      :host(.embedded) {
        position: static;
        left: auto;
        right: auto;
        bottom: auto;
        z-index: auto;
        pointer-events: auto;
      }

      /* Desktop: offset left edge past sidebar so pill centers in content area */
      @media (min-width: 768px) {
        :host {
          left: var(--agent-input-desktop-left, var(--nxt1-sidebar-width, 280px));
          right: var(--agent-input-desktop-right, 0);
        }
      }

      @media (max-width: 767px) {
        :host {
          left: var(--nxt1-footer-left, 16px);
          right: var(--nxt1-footer-right, 16px);
          bottom: calc(
            var(--nxt1-footer-bottom, 20px) + var(--nxt1-pill-height, 44px) + 16px +
              var(--keyboard-offset, 0px)
          );
        }

        .input-container {
          max-width: 344px;
          margin: 0 auto;
          padding: 0;
        }
      }

      .input-container {
        padding: 0 0.75rem;
        background: transparent;
        border: none;
        display: flex;
        flex-direction: column;
        align-items: stretch;
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
        max-width: 100%;
        align-self: flex-start;
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

      .plus-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        flex: 0 0 32px;
        border-radius: 50%;
        border: none;
        background: transparent;
        color: var(--agent-text-secondary, rgba(255, 255, 255, 0.7));
        transition:
          background-color 0.2s ease,
          color 0.2s ease;
      }

      .plus-btn:active {
        transform: scale(0.97);
      }

      .plus-btn:hover {
        background: var(--agent-surface-hover, rgba(255, 255, 255, 0.04));
      }

      .input-wrapper {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: var(--agent-input-bg);
        border: 1px solid var(--agent-input-border);
        border-radius: 999px;
        padding: 0.375rem 0.5rem 0.375rem 0.85rem;
        min-height: var(--agent-input-min-height);
        box-shadow: var(--agent-input-shadow);
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        position: relative;
        width: 100%;
        transition:
          border-color 0.2s ease,
          box-shadow 0.2s ease;
      }

      .input-wrapper:hover {
        border-color: var(--nxt1-glass-border, rgba(255, 255, 255, 0.12));
      }

      .input-wrapper:focus-within {
        border-color: var(--nxt1-color-primary, #ccff00);
        box-shadow: 0 0 0 2px var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.1));
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
        overflow: hidden;
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

      .primary-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        flex: 0 0 34px;
        background: transparent;
        color: var(--agent-text-secondary, rgba(255, 255, 255, 0.7));
        border: none;
        border-radius: 50%;
        transition:
          transform 0.2s ease,
          background-color 0.2s ease,
          color 0.2s ease;
      }

      .primary-btn.send {
        background: var(--agent-primary, #ccff00);
        color: var(--nxt1-color-bg-primary, #0a0a0a);
      }

      .primary-btn:disabled {
        opacity: 0.8;
      }

      .primary-btn:not(:disabled):active {
        transform: scale(0.95);
      }

      .primary-btn.stop {
        background: transparent;
        cursor: pointer;
        opacity: 1;
      }

      .primary-btn.stop:active {
        transform: scale(0.92);
      }

      .stop-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
      }

      .stop-spinner {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        animation: stopSpin 1s linear infinite;
      }

      .stop-spinner circle {
        fill: none;
        stroke: var(--agent-text-secondary, rgba(255, 255, 255, 0.7));
        stroke-width: 2;
        stroke-dasharray: 80, 100;
        stroke-linecap: round;
      }

      .stop-square {
        display: block;
        width: 10px;
        height: 10px;
        border-radius: 2px;
        background: var(--agent-text-secondary, rgba(255, 255, 255, 0.7));
      }

      @keyframes stopSpin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (max-width: 767px) {
        .input-container {
          padding: 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .plus-btn,
        .primary-btn {
          transition: none;
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
  readonly placeholder = input<string>('Type a message');

  // ============================================
  // OUTPUTS
  // ============================================

  readonly messageChange = output<string>();
  readonly send = output<void>();
  readonly stop = output<void>();
  readonly removeTask = output<void>();
  readonly toggleTasks = output<void>();

  // ============================================
  // VIEW CHILD
  // ============================================

  private readonly inputRef = viewChild<ElementRef>('messageInput');

  constructor() {}

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

  protected onPrimaryAction(): void {
    this.onSend();
  }

  protected onStopAction(): void {
    this.stop.emit();
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
