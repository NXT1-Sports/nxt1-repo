import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  viewChild,
  ElementRef,
  signal,
  effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NxtIconComponent } from '../components/icon/icon.component';
import type { AgentXQuickTask } from '@nxt1/core';
import { AGENT_X_ALLOWED_MIME_TYPES } from '@nxt1/core';
import type { AgentXPendingFile } from './agent-x-pending-file';

@Component({
  selector: 'nxt1-agent-x-prompt-input',
  standalone: true,
  imports: [FormsModule, NxtIconComponent],
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

      <!-- Pending File Previews -->
      @if (pendingFiles().length > 0) {
        <div class="attachment-strip">
          @for (pending of pendingFiles(); track $index) {
            <div class="attachment-preview" [title]="pending.file.name">
              @if (pending.previewUrl) {
                <img
                  [src]="pending.previewUrl"
                  [alt]="pending.file.name"
                  class="attachment-thumb"
                />
              } @else {
                <div class="attachment-file-icon">
                  <nxt1-icon name="document" [size]="20" />
                </div>
              }
              <button
                type="button"
                class="attachment-remove"
                (click)="onRemoveFile($index)"
                aria-label="Remove file"
              >
                <nxt1-icon name="close" [size]="10" />
              </button>
            </div>
          }
        </div>
      }

      <div class="input-wrapper">
        <button
          type="button"
          class="plus-btn"
          (click)="toggleTasks.emit()"
          [attr.aria-label]="plusButtonAriaLabel()"
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

        @if (isLoading() || uploading()) {
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
        transition: bottom 0.28s cubic-bezier(0.32, 0.72, 0, 1);

        --agent-input-bg: var(--nxt1-glass-bg, rgba(18, 18, 18, 0.8));
        --agent-input-border: var(--nxt1-glass-borderSubtle, rgba(255, 255, 255, 0.08));
        --agent-input-radius: 24px;
        --agent-input-shadow: var(--nxt1-glass-shadow, 0 4px 16px rgba(0, 0, 0, 0.16));
        --agent-input-min-height: 48px;
        --nxt1-btn-height: 36px;
      }

      :host-context(.light),
      :host-context([data-theme='light']) {
        --agent-input-bg: var(--nxt1-glass-bg, rgba(255, 255, 255, 0.8));
        --agent-input-border: var(--nxt1-glass-borderSubtle, rgba(0, 0, 0, 0.08));
        --agent-input-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
        --agent-text-secondary: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        --agent-surface-hover: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.05));
      }

      :host(.embedded) {
        position: static;
        left: auto;
        right: auto;
        bottom: auto;
        z-index: auto;
        pointer-events: auto;
      }

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
        min-width: 0;
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

      .attachment-strip {
        display: flex;
        gap: 0.5rem;
        padding: 0.75rem;
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
        background: var(--agent-input-bg, rgba(18, 18, 18, 0.8));
        border: 1px solid var(--agent-input-border, rgba(255, 255, 255, 0.08));
        border-radius: var(--agent-input-radius, 24px);
        box-shadow:
          var(--agent-input-shadow, 0 4px 16px rgba(0, 0, 0, 0.16)),
          0 0 0 1px var(--nxt1-color-alpha-primary10, var(--nxt1-color-alpha-primary15));
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        pointer-events: auto;
      }

      .attachment-strip::-webkit-scrollbar {
        display: none;
      }

      .attachment-preview {
        position: relative;
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .attachment-thumb {
        width: 56px;
        height: 56px;
        border-radius: 8px;
        object-fit: cover;
        border: 1px solid var(--agent-input-border, rgba(255, 255, 255, 0.08));
      }

      .attachment-file-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: 8px;
        background: var(--agent-surface-hover, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--agent-input-border, rgba(255, 255, 255, 0.08));
        color: var(--agent-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .attachment-remove {
        position: absolute;
        top: -4px;
        right: -4px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: none;
        background: rgba(255, 255, 255, 0.15);
        color: #fff;
        cursor: pointer;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        transition:
          transform 0.15s ease,
          background 0.15s ease;
      }

      .attachment-remove:hover {
        background: rgba(255, 255, 255, 0.25);
      }

      .attachment-remove:active {
        transform: scale(0.9);
      }

      .input-wrapper {
        display: flex;
        align-items: flex-end;
        gap: 0.5rem;
        background: var(--agent-input-bg);
        border: 1px solid var(--agent-input-border);
        border-radius: var(--agent-input-radius);
        padding: 0.375rem 0.5rem 0.375rem 0.85rem;
        min-height: var(--agent-input-min-height);
        height: auto;
        box-shadow:
          var(--agent-input-shadow),
          0 0 0 1px var(--nxt1-color-alpha-primary10, var(--nxt1-color-alpha-primary15));
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        position: relative;
        width: 100%;
        overflow: visible;
        transition:
          border-color 0.2s ease,
          box-shadow 0.2s ease,
          border-radius 0.2s ease,
          transform 0.2s ease;
      }

      .input-wrapper::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        padding: 1px;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-alpha-primary30, var(--nxt1-color-alpha-primary15)),
          transparent,
          var(--nxt1-color-alpha-primary20, var(--nxt1-color-alpha-primary15))
        );
        mask:
          linear-gradient(#fff 0 0) content-box,
          linear-gradient(#fff 0 0);
        mask-composite: exclude;
        pointer-events: none;
        opacity: 0.6;
      }

      .input-wrapper::before {
        content: '';
        position: absolute;
        inset: -2px;
        border-radius: inherit;
        background: linear-gradient(
          45deg,
          transparent,
          var(--nxt1-color-alpha-primary20, var(--nxt1-color-alpha-primary15)),
          transparent,
          var(--nxt1-color-alpha-primary20, var(--nxt1-color-alpha-primary15)),
          transparent
        );
        background-size: 400% 400%;
        opacity: 0;
        animation: nxt1-nav-gradient-flow 3s ease-in-out infinite;
        pointer-events: none;
        z-index: -1;
      }

      .input-wrapper:hover {
        border-color: var(--nxt1-glass-border, rgba(255, 255, 255, 0.12));
        box-shadow:
          var(--agent-input-shadow),
          0 0 20px var(--nxt1-color-alpha-primary10, var(--nxt1-color-alpha-primary15));
      }

      .input-wrapper:focus-within {
        border-color: var(--nxt1-color-primary, #ccff00);
        box-shadow:
          var(--agent-input-shadow),
          0 0 0 2px var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.1)),
          0 0 28px var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.1));
        transform: translateY(-1px);
      }

      .input-wrapper:focus-within::before {
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
          color 0.2s ease,
          transform 0.2s ease;
        margin-bottom: 2px;
      }

      .plus-btn:hover {
        background: var(--agent-surface-hover, rgba(255, 255, 255, 0.04));
      }

      .plus-btn:active {
        transform: scale(0.97);
      }

      .message-input {
        flex: 1;
        display: block;
        background: transparent;
        border: none;
        outline: none;
        -webkit-appearance: none;
        appearance: none;
        color: var(--nxt1-nav-text, var(--nxt1-color-text-primary, #ffffff));
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        line-height: 1.5;
        resize: none;
        min-height: 24px;
        max-height: 160px;
        padding: 0;
        margin-bottom: 6px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
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

      :host-context(.light) .message-input,
      :host-context([data-theme='light']) .message-input {
        color: var(--nxt1-color-text-primary, #1a1a1a);
      }

      :host-context(.light) .message-input::placeholder,
      :host-context([data-theme='light']) .message-input::placeholder {
        color: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.45));
      }

      :host-context(.light) .message-input::-webkit-scrollbar-thumb,
      :host-context([data-theme='light']) .message-input::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.15);
      }

      .message-input::-webkit-scrollbar {
        width: 4px;
        display: block;
      }

      .message-input::-webkit-scrollbar-track {
        background: transparent;
      }

      .message-input::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
      }

      .primary-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        flex: 0 0 34px;
        align-self: flex-end;
        background: transparent;
        color: var(--agent-text-secondary, rgba(255, 255, 255, 0.7));
        border: none;
        border-radius: 50%;
        margin-bottom: 1px;
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
        .input-wrapper,
        .plus-btn,
        .primary-btn {
          transition: none;
        }

        .input-wrapper::before,
        .stop-spinner {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXPromptInputComponent {
  readonly hasMessages = input<boolean>(false);
  readonly selectedTask = input<AgentXQuickTask | null>(null);
  readonly isLoading = input<boolean>(false);
  readonly canSend = input<boolean>(false);
  readonly userMessage = input<string>('');
  readonly placeholder = input<string>('Type a message');
  readonly pendingFiles = input<readonly AgentXPendingFile[]>([]);
  readonly uploading = input<boolean>(false);
  readonly plusButtonAriaLabel = input<string>('Open quick actions');

  readonly messageChange = output<string>();
  readonly send = output<void>();
  readonly pause = output<void>();
  readonly removeTask = output<void>();
  readonly toggleTasks = output<void>();
  readonly filesAdded = output<File[]>();
  readonly fileRemoved = output<number>();

  protected readonly acceptTypes = AGENT_X_ALLOWED_MIME_TYPES.join(',');
  private readonly inputRef = viewChild<ElementRef>('messageInput');
  protected readonly isExpanded = signal<boolean>(false);

  constructor() {
    effect(() => {
      const msg = this.userMessage();
      if (!msg) {
        const textarea = this.inputRef()?.nativeElement;
        if (textarea) {
          textarea.style.height = 'auto';
          this.isExpanded.set(false);
        }
      }
    });
  }

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

  protected onPrimaryAction(): void {
    if (this.canSend()) {
      this.send.emit();
    }
  }

  protected onStopAction(): void {
    this.pause.emit();
  }

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.filesAdded.emit(Array.from(input.files));
      input.value = '';
    }
  }

  protected onRemoveFile(index: number): void {
    this.fileRemoved.emit(index);
  }

  private autoResize(): void {
    const textarea = this.inputRef()?.nativeElement;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = 160;
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = Math.min(scrollHeight, maxHeight) + 'px';
      this.isExpanded.set(scrollHeight > 48);
    }
  }
}
