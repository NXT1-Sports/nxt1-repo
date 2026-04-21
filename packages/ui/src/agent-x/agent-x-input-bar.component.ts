/**
 * @fileoverview Agent X Input Bar — Shared Ion-Footer Input Component
 * @module @nxt1/ui/agent-x
 *
 * The canonical input bar used across Agent X surfaces (shell + operation chat).
 * Uses ion-footer so it pins to the bottom of whichever Ionic scroll container
 * owns it — the main page on the shell, the bottom sheet on operation chat.
 *
 * Handles native keyboard lift automatically on mobile via @capacitor/keyboard.
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  viewChild,
  ElementRef,
  effect,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonFooter } from '@ionic/angular/standalone';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { NxtIconComponent } from '../components/icon/icon.component';
import type { AgentXPendingFile } from './agent-x-pending-file';

@Component({
  selector: 'nxt1-agent-x-input-bar',
  standalone: true,
  imports: [FormsModule, IonFooter, NxtIconComponent],
  template: `
    <ion-footer class="ion-no-border agent-x-input-footer">
      <!-- Task pill (optional, inside card top) -->
      @if (selectedTask()) {
        <div class="input-task-pill">
          <span class="input-task-text">{{ selectedTask() }}</span>
          <button
            type="button"
            class="input-task-remove"
            (click)="removeTask.emit()"
            aria-label="Remove task"
          >
            <nxt1-icon name="close" [size]="13" />
          </button>
        </div>
      }

      <!-- Attachment strip (optional) -->
      @if (pendingFiles().length > 0) {
        <div class="input-attachment-strip">
          @for (f of pendingFiles(); track $index) {
            <div class="input-attachment">
              @if (f.previewUrl) {
                @if (f.file.type.startsWith('video/')) {
                  <video
                    class="input-attachment-thumb input-attachment-thumb--video"
                    [src]="f.previewUrl"
                    muted
                    playsinline
                    preload="metadata"
                  ></video>
                  <div class="input-attachment-play-icon">
                    <nxt1-icon name="play" [size]="14" />
                  </div>
                } @else {
                  <img [src]="f.previewUrl" [alt]="f.file.name" class="input-attachment-thumb" />
                }
              } @else {
                <div class="input-attachment-icon">
                  <nxt1-icon name="document" [size]="18" />
                </div>
              }
              <button
                type="button"
                class="input-attachment-remove"
                (click)="removeFile.emit($index)"
                aria-label="Remove file"
              >
                <nxt1-icon name="close" [size]="10" />
              </button>
            </div>
          }
        </div>
      }

      <!-- Input card -->
      <div class="input-card">
        <textarea
          #messageInput
          class="input-textarea"
          rows="1"
          [ngModel]="userMessage()"
          (ngModelChange)="messageChange.emit($event)"
          [placeholder]="placeholder()"
          [maxlength]="1000"
          (keydown.enter)="onEnterKey($event)"
        ></textarea>

        <div class="input-actions">
          <button
            type="button"
            class="input-btn"
            (click)="toggleAttachments.emit()"
            aria-label="Add attachment"
          >
            <nxt1-icon name="plus" [size]="22" />
          </button>

          <div class="input-actions-right">
            @if (isLoading() || uploading()) {
              <button
                type="button"
                class="input-btn input-btn--circle"
                (click)="stop.emit()"
                aria-label="Stop"
              >
                <div class="input-stop-loader">
                  <svg class="input-stop-svg" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" />
                  </svg>
                  <span class="input-stop-square"></span>
                </div>
              </button>
            } @else {
              <button
                type="button"
                class="input-btn input-btn--circle input-send-btn"
                [class.active]="canSend()"
                [disabled]="!canSend()"
                (click)="send.emit()"
                aria-label="Send"
              >
                <nxt1-icon name="arrowUp" [size]="18" />
              </button>
            }
          </div>
        </div>
      </div>
    </ion-footer>
  `,
  styles: [
    `
      :host {
        display: block;

        --input-bg: var(--agent-bg, var(--ion-background-color, #0a0a0a));
        --input-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.06));
        --input-border: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.09));
        --input-text: var(--nxt1-color-text-primary, #ffffff);
        --input-muted: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --input-primary: var(--nxt1-color-primary, #ccff00);
        --input-primary-glow: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        --input-surface-hover: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.1));
      }

      :host-context(.light),
      :host-context([data-theme='light']) {
        --input-bg: var(--nxt1-color-bg-primary, #ffffff);
        --input-surface: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.04));
        --input-border: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.09));
        --input-text: var(--nxt1-color-text-primary, #1a1a1a);
        --input-muted: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.4));
        --input-surface-hover: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.06));
      }

      ion-footer.agent-x-input-footer {
        --background: transparent;
        --border-width: 0;
        background: transparent;
        padding: 8px 12px calc(var(--footer-safe-area, env(safe-area-inset-bottom, 0px)) + 10px);
        transform: translateY(calc(-1 * var(--keyboard-height, 0px)));
        transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      }

      ion-footer.agent-x-input-footer::before {
        display: none !important;
      }

      /* ── Task pill ── */
      .input-task-pill {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px 4px 12px;
        background: var(--input-primary-glow);
        border: 1px solid var(--input-primary);
        border-radius: 20px;
        width: fit-content;
        margin-bottom: 6px;
      }

      .input-task-text {
        font-size: 0.8rem;
        color: var(--input-primary);
        font-weight: 500;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .input-task-remove {
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        color: var(--input-primary);
        opacity: 0.75;
      }

      /* ── Attachment strip ── */
      .input-attachment-strip {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        scrollbar-width: none;
        margin-bottom: 6px;
      }

      .input-attachment-strip::-webkit-scrollbar {
        display: none;
      }

      .input-attachment {
        position: relative;
        flex: 0 0 auto;
      }

      .input-attachment-thumb {
        width: 52px;
        height: 52px;
        border-radius: 8px;
        object-fit: cover;
        border: 1px solid var(--input-border);
      }

      .input-attachment-thumb--video {
        display: block;
        background: #000;
      }

      .input-attachment-play-icon {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        pointer-events: none;
        background: rgba(0, 0, 0, 0.35);
        border-radius: 8px;
      }

      .input-attachment-icon {
        width: 52px;
        height: 52px;
        border-radius: 8px;
        background: var(--input-surface);
        border: 1px solid var(--input-border);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--input-muted);
      }

      .input-attachment-remove {
        position: absolute;
        top: -4px;
        right: -4px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: none;
        background: rgba(255, 255, 255, 0.15);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      /* ── Main input card ── */
      .input-card {
        background: var(--input-surface);
        border: 1px solid var(--input-border);
        border-radius: 20px;
        padding: 12px 4px 6px 14px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .input-textarea {
        display: block;
        width: 100%;
        background: transparent;
        border: none;
        outline: none;
        -webkit-appearance: none;
        appearance: none;
        resize: none;
        color: var(--input-text);
        font-size: 16px;
        line-height: 1.5;
        min-height: 26px;
        max-height: 140px;
        overflow-y: auto;
        scrollbar-width: none;
        padding: 0;
        font-family: inherit;
      }

      .input-textarea:focus,
      .input-textarea:focus-visible {
        outline: none;
        box-shadow: none;
      }

      .input-textarea::-webkit-scrollbar {
        display: none;
      }

      .input-textarea::placeholder {
        color: var(--input-muted);
      }

      /* ── Action row ── */
      .input-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: 2px;
        margin: 0 -2px 0 -8px;
      }

      .input-actions-right {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .input-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 38px;
        flex: 0 0 38px;
        border-radius: 50%;
        border: none;
        background: transparent;
        color: var(--input-muted);
        -webkit-tap-highlight-color: transparent;
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease;
      }

      .input-btn:active {
        background: var(--input-surface-hover);
      }

      .input-btn--circle {
        background: var(--input-surface-hover);
      }

      .input-send-btn {
        transition:
          background 0.15s ease,
          color 0.15s ease,
          opacity 0.15s ease;
      }

      .input-send-btn.active {
        background: var(--input-text);
        color: var(--input-bg);
      }

      .input-send-btn:disabled {
        opacity: 0.25;
      }

      /* ── Stop spinner ── */
      .input-stop-loader {
        position: relative;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .input-stop-svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        animation: inputStopSpin 1s linear infinite;
      }

      .input-stop-svg circle {
        fill: none;
        stroke: var(--input-muted);
        stroke-width: 2.5;
        stroke-dasharray: 65, 100;
        stroke-linecap: round;
      }

      .input-stop-square {
        display: block;
        width: 8px;
        height: 8px;
        border-radius: 2px;
        background: var(--input-muted);
      }

      @keyframes inputStopSpin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXInputBarComponent implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef);

  // ── Ref for auto-resize ──
  private readonly textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('messageInput');

  // ── Inputs ──
  readonly userMessage = input('');
  readonly placeholder = input('Message A Coordinator');
  readonly isLoading = input(false);
  readonly uploading = input(false);
  readonly canSend = input(false);
  readonly pendingFiles = input<readonly AgentXPendingFile[]>([]);
  /** String label of the currently selected task (null = none). */
  readonly selectedTask = input<string | null>(null);

  // ── Outputs ──
  readonly messageChange = output<string>();
  readonly send = output<void>();
  readonly stop = output<void>();
  readonly toggleAttachments = output<void>();
  readonly removeFile = output<number>();
  readonly removeTask = output<void>();

  private keyboardShowListener?: PluginListenerHandle;
  private keyboardHideListener?: PluginListenerHandle;

  constructor() {
    // Auto-resize textarea when message changes
    effect(() => {
      const msg = this.userMessage();
      const el = this.textareaRef()?.nativeElement;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
      if (!msg) el.style.height = '';
    });
  }

  async ngOnInit(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        const { Keyboard } = await import('@capacitor/keyboard');

        this.keyboardShowListener = await Keyboard.addListener('keyboardWillShow', (info) => {
          // Subtract 10px so the footer doesn't overshoot above the keyboard
          const offset = Math.max(0, info.keyboardHeight - 10);
          this.el.nativeElement.style.setProperty('--keyboard-height', `${offset}px`);
          // Remove safe-area-inset-bottom padding — keyboard covers the home bar
          this.el.nativeElement.style.setProperty('--footer-safe-area', '0px');
        });

        this.keyboardHideListener = await Keyboard.addListener('keyboardWillHide', () => {
          this.el.nativeElement.style.setProperty('--keyboard-height', '0px');
          this.el.nativeElement.style.removeProperty('--footer-safe-area');
        });
      } catch {
        // @capacitor/keyboard not available — silently ignore
      }
    }
  }

  ngOnDestroy(): void {
    if (this.keyboardShowListener) {
      this.keyboardShowListener.remove();
    }
    if (this.keyboardHideListener) {
      this.keyboardHideListener.remove();
    }
  }

  protected onEnterKey(event: Event): void {
    const kb = event as KeyboardEvent;
    if (!kb.shiftKey) {
      kb.preventDefault();
      if (this.canSend()) this.send.emit();
    }
  }
}
