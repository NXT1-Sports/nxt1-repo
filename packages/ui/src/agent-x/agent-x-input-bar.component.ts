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
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import { NxtIconComponent } from '../components/icon/icon.component';
import { NxtPlatformIconComponent } from '../components/platform-icon/platform-icon.component';
import type { AgentXPendingFile } from './agent-x-pending-file';

interface PendingConnectedSource {
  readonly platform: string;
  readonly profileUrl: string;
  readonly faviconUrl?: string;
}

@Component({
  selector: 'nxt1-agent-x-input-bar',
  standalone: true,
  imports: [FormsModule, NxtIconComponent, NxtPlatformIconComponent],
  template: `
    <div class="agent-x-input-root">
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
      @if (pendingFiles().length > 0 || pendingSources().length > 0) {
        <div class="input-attachment-strip">
          @for (f of pendingFiles(); track $index) {
            <div class="input-attachment" [title]="f.file.name" (click)="openFile.emit($index)">
              @if (f.previewUrl) {
                @if (f.file.type.startsWith('video/')) {
                  <video
                    class="input-attachment-thumb input-attachment-thumb--video"
                    [src]="f.previewUrl"
                    muted
                    playsinline
                    preload="auto"
                  ></video>
                  <div class="input-attachment-play-icon">
                    <nxt1-icon name="playCircle" [size]="16" />
                  </div>
                } @else {
                  <img [src]="f.previewUrl" [alt]="f.file.name" class="input-attachment-thumb" />
                }
              } @else {
                <div class="input-attachment-icon">
                  @if (f.file.type.startsWith('video/')) {
                    <nxt1-icon name="videocam" [size]="20" />
                  } @else {
                    <nxt1-icon name="documentText" [size]="20" />
                  }
                </div>
              }
              @if (!f.file.type.startsWith('image/') && !f.file.type.startsWith('video/')) {
                <div class="input-attachment-file-badge">{{ f.file.name }}</div>
              }
              <button
                type="button"
                class="input-attachment-remove"
                (click)="$event.stopPropagation(); removeFile.emit($index)"
                aria-label="Remove file"
              >
                <nxt1-icon name="close" [size]="10" className="input-attachment-remove-icon" />
              </button>
            </div>
          }

          @for (source of pendingSources(); track source.platform + '-' + source.profileUrl) {
            <div class="input-attachment" [title]="source.platform">
              <nxt1-platform-icon
                class="input-attachment-thumb"
                icon="link"
                [faviconUrl]="source.faviconUrl"
                [size]="28"
                [alt]="source.platform"
              />
              <div class="input-attachment-source-badge">{{ source.platform }}</div>
              <button
                type="button"
                class="input-attachment-remove"
                (click)="removeSource.emit($index)"
                aria-label="Remove app source"
              >
                <nxt1-icon name="close" [size]="10" className="input-attachment-remove-icon" />
              </button>
            </div>
          }
        </div>
      }

      <!-- Input card -->
      <div
        class="input-card"
        (touchstart)="onSwipeStart($event)"
        (touchmove)="onSwipeMove($event)"
        (touchend)="onSwipeEnd()"
        (touchcancel)="onSwipeCancel()"
      >
        <textarea
          #messageInput
          class="input-textarea"
          rows="1"
          [ngModel]="userMessage()"
          (ngModelChange)="messageChange.emit($event)"
          (focus)="onInputFocus()"
          [placeholder]="placeholder()"
          [maxlength]="1000"
          (keydown.enter)="onEnterKey($event)"
        ></textarea>

        <div class="input-actions">
          <button
            type="button"
            class="input-btn input-btn--circle input-btn--attach"
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
                (click)="pause.emit()"
                aria-label="Pause"
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
    </div>
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
        --input-caret: var(--nxt1-color-primary, #ccff00);
        --input-selection-bg: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        --input-surface-hover: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.1));
        --input-chip-remove-bg: rgba(10, 10, 10, 0.88);
        --input-chip-remove-fg: #ffffff;
        --input-chip-remove-border: rgba(255, 255, 255, 0.55);
        --input-chip-remove-icon: #ffffff;
        background: transparent;
      }

      .agent-x-input-root {
        background: transparent;
        padding: 8px 12px var(--footer-safe-area, env(safe-area-inset-bottom, 0px));
        --highlight-color-focused: var(--input-caret);
        --highlight-color-valid: var(--input-caret);
        --highlight-color-invalid: var(--nxt1-color-error, #ff4d4f);
      }

      :host-context(.light),
      :host-context([data-theme='light']),
      :host-context([data-base-theme='light']) {
        --input-bg: var(--nxt1-color-bg-primary, #ffffff);
        --input-surface: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.04));
        --input-border: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.09));
        --input-text: var(--nxt1-color-text-primary, #1a1a1a);
        --input-muted: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.4));
        --input-surface-hover: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.06));
        --input-chip-remove-bg: rgba(240, 240, 240, 0.96);
        --input-chip-remove-fg: #1a1a1a;
        --input-chip-remove-border: rgba(0, 0, 0, 0.3);
        --input-chip-remove-icon: #1a1a1a;
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
        padding: 10px;
        overflow-x: auto;
        scrollbar-width: none;
        margin-bottom: 6px;
        background: var(--input-surface);
        border: 1px solid var(--input-border);
        border-radius: 24px;
        box-shadow:
          0 8px 24px rgba(0, 0, 0, 0.12),
          0 0 0 1px var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.08));
        backdrop-filter: saturate(160%) blur(14px);
        -webkit-backdrop-filter: saturate(160%) blur(14px);
      }

      .input-attachment-strip::-webkit-scrollbar {
        display: none;
      }

      .input-attachment {
        position: relative;
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      .input-attachment-thumb {
        width: 56px;
        height: 56px;
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
        width: 56px;
        height: 56px;
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
        border: 1.5px solid var(--input-chip-remove-border);
        background: var(--input-chip-remove-bg);
        color: var(--input-chip-remove-fg);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
      }

      .input-attachment-remove-icon {
        color: var(--input-chip-remove-icon);
      }

      .input-attachment-source-badge {
        position: absolute;
        left: 4px;
        right: 4px;
        bottom: 4px;
        max-width: calc(100% - 8px);
        padding: 1px 6px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        font-size: 9px;
        font-weight: 600;
        line-height: 1.2;
        text-align: center;
        text-transform: capitalize;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        pointer-events: none;
      }

      .input-attachment-file-badge {
        position: absolute;
        left: 4px;
        right: 4px;
        bottom: 4px;
        max-width: calc(100% - 8px);
        padding: 1px 6px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        font-size: 9px;
        font-weight: 600;
        line-height: 1.2;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        pointer-events: none;
      }

      /* ── Main input card ── */
      .input-card {
        background: var(--input-surface);
        border: 1px solid var(--input-border);
        border-radius: 28px;
        padding: 12px 4px 6px 14px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
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
        caret-color: var(--input-caret);
        accent-color: var(--input-caret);
      }

      .input-textarea::selection {
        color: var(--input-text);
        background: var(--input-selection-bg);
      }

      .input-textarea::-moz-selection {
        color: var(--input-text);
        background: var(--input-selection-bg);
      }

      /* Deep Ionic input overrides to prevent system-blue cursor/highlight leaks. */
      .agent-x-input-root :is(ion-input, ion-textarea, ion-searchbar) {
        --highlight-color-focused: var(--input-caret);
        --highlight-color-valid: var(--input-caret);
        --caret-color: var(--input-caret);
        --color: var(--input-text);
      }

      .agent-x-input-root :is(input, textarea) {
        caret-color: var(--input-caret);
        accent-color: var(--input-caret);
      }

      .agent-x-input-root :is(input, textarea)::selection {
        color: var(--input-text);
        background: var(--input-selection-bg);
      }

      .agent-x-input-root :is(input, textarea)::-moz-selection {
        color: var(--input-text);
        background: var(--input-selection-bg);
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
        margin: 0 4px 0 4px;
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
        width: 36px;
        height: 36px;
        flex: 0 0 36px;
        border-radius: 999px;
        border: 1px solid var(--input-border);
        background: var(--input-surface);
        color: var(--input-muted);
        -webkit-tap-highlight-color: transparent;
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease,
          border-color 0.15s ease,
          transform 0.18s ease,
          box-shadow 0.18s ease;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      }

      .input-btn:active {
        background: var(--input-surface-hover);
      }

      .input-btn--circle {
        background: var(--input-surface-hover);
      }

      .input-btn--attach {
        margin-left: -6px;
      }

      .input-btn--attach nxt1-icon {
        transition: transform 0.2s ease;
      }

      @media (hover: hover) and (pointer: fine) {
        .input-btn--attach:hover {
          background: color-mix(in srgb, var(--input-primary-glow) 78%, var(--input-surface));
          color: var(--input-primary);
          border-color: color-mix(in srgb, var(--input-primary) 48%, var(--input-border));
          transform: translateY(-1px) scale(1.04);
          box-shadow: 0 8px 18px rgba(204, 255, 0, 0.16);
        }

        .input-btn--attach:hover nxt1-icon {
          transform: rotate(90deg) scale(1.06);
        }

        .input-btn--attach:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--input-primary) 65%, transparent);
          outline-offset: 2px;
          background: color-mix(in srgb, var(--input-primary-glow) 72%, var(--input-surface));
          color: var(--input-primary);
          border-color: color-mix(in srgb, var(--input-primary) 52%, var(--input-border));
          box-shadow: 0 8px 18px rgba(204, 255, 0, 0.16);
        }
      }

      .input-send-btn {
        transition:
          background 0.15s ease,
          color 0.15s ease,
          border-color 0.15s ease,
          opacity 0.15s ease,
          box-shadow 0.15s ease;
      }

      .input-send-btn.active {
        background: var(--input-primary-glow);
        color: var(--input-primary);
        border-color: var(--input-primary);
        box-shadow: 0 4px 12px rgba(204, 255, 0, 0.15);
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
export class AgentXInputBarComponent {
  private static readonly SWIPE_DISMISS_THRESHOLD_PX = 36;
  private static readonly SWIPE_VERTICAL_RATIO = 1.2;

  // ── Ref for auto-resize ──
  private readonly textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('messageInput');

  // ── Swipe-to-dismiss tracking ──
  private swipeStartX: number | null = null;
  private swipeStartY: number | null = null;
  private swipeCurrentX: number | null = null;
  private swipeCurrentY: number | null = null;

  // ── Inputs ──
  readonly userMessage = input('');
  readonly placeholder = input('Message A Coordinator');
  readonly isLoading = input(false);
  readonly uploading = input(false);
  readonly canSend = input(false);
  readonly pendingFiles = input<readonly AgentXPendingFile[]>([]);
  readonly pendingSources = input<readonly PendingConnectedSource[]>([]);
  /** String label of the currently selected task (null = none). */
  readonly selectedTask = input<string | null>(null);

  // ── Outputs ──
  readonly messageChange = output<string>();
  readonly send = output<void>();
  readonly pause = output<void>();
  readonly toggleAttachments = output<void>();
  readonly openFile = output<number>();
  readonly removeFile = output<number>();
  readonly removeSource = output<number>();
  readonly removeTask = output<void>();
  readonly focusInput = output<void>();

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

  protected onEnterKey(event: Event): void {
    const kb = event as KeyboardEvent;
    if (!kb.shiftKey) {
      kb.preventDefault();
      if (this.canSend()) this.send.emit();
    }
  }

  protected onInputFocus(): void {
    this.focusInput.emit();
  }

  protected onSwipeStart(event: TouchEvent): void {
    if (event.touches.length !== 1) {
      this.onSwipeCancel();
      return;
    }

    const touch = event.touches[0];
    this.swipeStartX = touch.clientX;
    this.swipeStartY = touch.clientY;
    this.swipeCurrentX = touch.clientX;
    this.swipeCurrentY = touch.clientY;
  }

  protected onSwipeMove(event: TouchEvent): void {
    if (this.swipeStartY === null || this.swipeStartX === null || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    this.swipeCurrentX = touch.clientX;
    this.swipeCurrentY = touch.clientY;
  }

  protected onSwipeEnd(): void {
    if (
      this.swipeStartY === null ||
      this.swipeStartX === null ||
      this.swipeCurrentY === null ||
      this.swipeCurrentX === null
    ) {
      this.onSwipeCancel();
      return;
    }

    const deltaY = this.swipeCurrentY - this.swipeStartY;
    const deltaX = this.swipeCurrentX - this.swipeStartX;
    const isMostlyVertical =
      Math.abs(deltaY) > Math.abs(deltaX) * AgentXInputBarComponent.SWIPE_VERTICAL_RATIO;
    const isSwipeDown = deltaY >= AgentXInputBarComponent.SWIPE_DISMISS_THRESHOLD_PX;

    this.onSwipeCancel();

    if (isMostlyVertical && isSwipeDown) {
      void this.dismissKeyboard();
    }
  }

  protected onSwipeCancel(): void {
    this.swipeStartX = null;
    this.swipeStartY = null;
    this.swipeCurrentX = null;
    this.swipeCurrentY = null;
  }

  private async dismissKeyboard(): Promise<void> {
    this.textareaRef()?.nativeElement?.blur();

    const active = globalThis.document?.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }

    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      const { Keyboard } = await import('@capacitor/keyboard');
      await Keyboard.hide();
    } catch {
      // No-op: blur fallback above already handles web/unsupported cases.
    }
  }
}
