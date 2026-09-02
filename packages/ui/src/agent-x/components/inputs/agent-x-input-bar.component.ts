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
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import type { AgentXEffortLevel, AgentXExecutionMode, AgentXSelectedContext } from '@nxt1/core/ai';
import { AGENT_X_INPUT_TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../../../components/icon/icon.component';
import { NxtPlatformIconComponent } from '../../../components/platform-icon/platform-icon.component';
import type { AgentXPendingFile } from '../../types/agent-x-pending-file';

interface PendingConnectedSource {
  readonly platform: string;
  readonly profileUrl: string;
  readonly faviconUrl?: string;
}

type InputMenuPlacement = 'above' | 'below';

interface InputMenuLayout {
  readonly placement: InputMenuPlacement;
  readonly offsetX: number;
  readonly maxHeight: number | null;
}

const DEFAULT_INPUT_MENU_LAYOUT: InputMenuLayout = {
  placement: 'above',
  offsetX: 0,
  maxHeight: null,
};

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
      @if (
        pendingFiles().length > 0 || pendingSources().length > 0 || pendingContexts().length > 0
      ) {
        <div class="input-attachment-strip">
          @for (f of pendingFiles(); track pendingFileTrackId(f)) {
            <div class="input-attachment" [title]="f.file.name" (click)="openFile.emit($index)">
              @if (f.previewUrl) {
                <div
                  class="input-attachment-media-shell"
                  [class.input-attachment-media-shell--ready]="
                    isAttachmentPreviewReady(filePreviewReadyKey(f))
                  "
                >
                  <div class="input-attachment-shimmer" aria-hidden="true"></div>
                  @if (f.file.type.startsWith('video/')) {
                    <img
                      class="input-attachment-thumb input-attachment-thumb--video"
                      [src]="f.previewUrl"
                      [alt]="f.file.name"
                      (load)="markAttachmentPreviewSettled(filePreviewReadyKey(f))"
                      (error)="markAttachmentPreviewSettled(filePreviewReadyKey(f))"
                    />
                    <div class="input-attachment-play-icon">
                      <nxt1-icon name="playCircle" [size]="16" />
                    </div>
                  } @else {
                    <img
                      [src]="f.previewUrl"
                      [alt]="f.file.name"
                      class="input-attachment-thumb"
                      (load)="markAttachmentPreviewSettled(filePreviewReadyKey(f))"
                      (error)="markAttachmentPreviewSettled(filePreviewReadyKey(f))"
                    />
                  }
                </div>
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
                class="input-attachment-source-icon"
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

          @for (context of pendingContexts(); track context.id) {
            <div class="input-attachment" [title]="context.title">
              @if (contextPreviewUrl(context); as previewUrl) {
                <div
                  class="input-attachment-media-shell"
                  [class.input-attachment-media-shell--ready]="
                    isAttachmentPreviewReady(contextPreviewReadyKey(context, previewUrl))
                  "
                >
                  <div class="input-attachment-shimmer" aria-hidden="true"></div>
                  <img
                    class="input-attachment-thumb"
                    [class.input-attachment-thumb--video]="isContextVideo(context)"
                    [src]="previewUrl"
                    [alt]="context.title"
                    (load)="
                      markAttachmentPreviewSettled(contextPreviewReadyKey(context, previewUrl))
                    "
                    (error)="onContextPreviewError(context, previewUrl)"
                  />
                  @if (isContextVideo(context)) {
                    <div class="input-attachment-play-icon">
                      <nxt1-icon name="playCircle" [size]="16" />
                    </div>
                  }
                </div>
              } @else if (contextVideoUrl(context); as videoUrl) {
                <div
                  class="input-attachment-media-shell"
                  [class.input-attachment-media-shell--ready]="
                    isAttachmentPreviewReady(contextPreviewReadyKey(context, videoUrl))
                  "
                >
                  <div class="input-attachment-shimmer" aria-hidden="true"></div>
                  <video
                    class="input-attachment-thumb input-attachment-thumb--video"
                    [src]="videoUrl"
                    preload="metadata"
                    muted
                    playsinline
                    (loadeddata)="
                      markAttachmentPreviewSettled(contextPreviewReadyKey(context, videoUrl))
                    "
                    (error)="
                      markAttachmentPreviewSettled(contextPreviewReadyKey(context, videoUrl))
                    "
                  ></video>
                  <div class="input-attachment-play-icon">
                    <nxt1-icon name="playCircle" [size]="16" />
                  </div>
                </div>
              } @else {
                <div class="input-attachment-icon">
                  <nxt1-icon [name]="contextIconName(context)" [size]="18" />
                </div>
              }
              <div class="input-attachment-source-badge">{{ context.title }}</div>
              <button
                type="button"
                class="input-attachment-remove"
                (click)="removeContext.emit($index)"
                aria-label="Remove selected context"
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
          (ngModelChange)="onMessageInputChange($event)"
          (focus)="onInputFocus()"
          [placeholder]="placeholder()"
          (keydown.enter)="onEnterKey($event)"
          (paste)="onPaste($event)"
        ></textarea>

        <div class="input-actions">
          <div class="input-actions-left">
            <button
              type="button"
              class="input-btn input-btn--circle input-btn--attach"
              (click)="toggleAttachments.emit()"
              aria-label="Add attachment"
            >
              <nxt1-icon name="plus" [size]="22" />
            </button>

            <div class="input-mode-picker" #modePicker>
              <button
                #modeTrigger
                type="button"
                class="input-mode-trigger"
                [attr.aria-expanded]="modeMenuOpen()"
                aria-haspopup="menu"
                aria-label="Choose execution mode"
                (click)="toggleModeMenu()"
              >
                <nxt1-icon [name]="executionModeIcon()" [size]="16" />
                <span class="input-mode-trigger__label">{{ executionModeLabel() }}</span>
                <nxt1-icon name="chevronDown" [size]="14" className="input-mode-trigger__chevron" />
              </button>

              @if (modeMenuOpen()) {
                <button
                  type="button"
                  class="input-mode-backdrop"
                  aria-label="Close execution mode menu"
                  (click)="closeModeMenu()"
                ></button>

                <div
                  #modeMenu
                  class="input-mode-menu"
                  [class.input-mode-menu--below]="modeMenuLayout().placement === 'below'"
                  [style.left.px]="modeMenuLayout().offsetX"
                  [style.max-height.px]="modeMenuLayout().maxHeight"
                  role="menu"
                  aria-label="Execution mode options"
                >
                  @for (option of executionModeOptions; track option.value) {
                    <button
                      type="button"
                      class="input-mode-menu__item"
                      [class.input-mode-menu__item--active]="executionMode() === option.value"
                      (click)="selectExecutionMode(option.value)"
                      role="menuitemradio"
                      [attr.aria-checked]="executionMode() === option.value"
                    >
                      <span class="input-mode-menu__leading">
                        <nxt1-icon [name]="option.icon" [size]="16" />
                      </span>
                      <span class="input-mode-menu__copy">
                        <span class="input-mode-menu__title">{{ option.label }}</span>
                        <span class="input-mode-menu__description">{{ option.description }}</span>
                      </span>
                      @if (executionMode() === option.value) {
                        <nxt1-icon
                          name="checkmark"
                          [size]="16"
                          className="input-mode-menu__selected-indicator"
                        />
                      }
                    </button>
                  }
                </div>
              }
            </div>

            <div class="input-mode-picker" #effortPicker>
              <button
                #effortTrigger
                type="button"
                class="input-mode-trigger"
                [attr.aria-expanded]="effortMenuOpen()"
                aria-haspopup="menu"
                aria-label="Choose model effort"
                (click)="toggleEffortMenu()"
              >
                <span class="input-mode-trigger__label">{{ effortLevelLabel() }}</span>
                <nxt1-icon name="chevronDown" [size]="14" className="input-mode-trigger__chevron" />
              </button>

              @if (effortMenuOpen()) {
                <button
                  type="button"
                  class="input-mode-backdrop"
                  aria-label="Close model effort menu"
                  (click)="closeEffortMenu()"
                ></button>

                <div
                  #effortMenu
                  class="input-mode-menu"
                  [class.input-mode-menu--below]="effortMenuLayout().placement === 'below'"
                  [style.left.px]="effortMenuLayout().offsetX"
                  [style.max-height.px]="effortMenuLayout().maxHeight"
                  role="menu"
                  aria-label="Model effort options"
                >
                  @for (option of effortLevelOptions; track option.value) {
                    <button
                      type="button"
                      class="input-mode-menu__item"
                      [class.input-mode-menu__item--active]="effortLevel() === option.value"
                      [attr.data-testid]="effortLevelTestId(option.value)"
                      (click)="selectEffortLevel(option.value)"
                      role="menuitemradio"
                      [attr.aria-checked]="effortLevel() === option.value"
                    >
                      <span class="input-mode-menu__copy">
                        <span class="input-mode-menu__title">{{ option.label }}</span>
                        <span class="input-mode-menu__description">{{ option.description }}</span>
                      </span>
                      @if (effortLevel() === option.value) {
                        <nxt1-icon
                          name="checkmark"
                          [size]="16"
                          className="input-mode-menu__selected-indicator"
                        />
                      }
                    </button>
                  }
                </div>
              }
            </div>
          </div>

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
        --input-attach-fg: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.72));
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
        --input-attach-fg: var(--nxt1-color-text-secondary, rgba(26, 26, 26, 0.72));
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
        display: block;
        background: transparent;
        opacity: 0;
        transition: opacity 0.18s ease;
      }

      .input-attachment-source-icon {
        width: 56px;
        height: 56px;
        border-radius: 8px;
        border: 1px solid var(--input-border);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--input-surface-hover);
      }

      .input-attachment-thumb--video {
        display: block;
        background: #000;
      }

      .input-attachment-media-shell {
        position: relative;
        width: 56px;
        height: 56px;
        border-radius: 8px;
        overflow: hidden;
        background: var(--input-surface-hover);
      }

      .input-attachment-media-shell--ready .input-attachment-thumb {
        opacity: 1;
      }

      .input-attachment-media-shell--ready .input-attachment-shimmer {
        opacity: 0;
        visibility: hidden;
      }

      .input-attachment-shimmer {
        position: absolute;
        inset: 0;
        border-radius: 8px;
        background: var(
          --nxt1-skeleton-gradient,
          linear-gradient(
            90deg,
            var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08)) 25%,
            var(--nxt1-color-loading-skeletonShimmer, rgba(255, 255, 255, 0.15)) 50%,
            var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08)) 75%
          )
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer var(--nxt1-skeleton-animation-duration, 1.5s)
          var(--nxt1-skeleton-animation-timing, ease-in-out) infinite;
        transition:
          opacity 0.18s ease,
          visibility 0.18s ease;
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
        position: relative;
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

      .input-actions-left {
        display: flex;
        align-items: center;
        gap: 10px;
        container-type: inline-size;
        flex: 1 1 auto;
        min-width: 0;
      }

      .input-actions-right {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .input-mode-picker {
        position: relative;
        min-width: 0;
      }

      .input-mode-trigger {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 36px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid var(--input-border);
        background: var(--input-surface-hover);
        color: var(--input-attach-fg);
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

      .input-mode-trigger nxt1-icon {
        color: currentColor;
      }

      .input-mode-trigger:active {
        background: var(--input-surface-hover);
      }

      @media (hover: hover) and (pointer: fine) {
        .input-mode-trigger:hover {
          background: color-mix(in srgb, var(--input-primary-glow) 78%, var(--input-surface));
          color: var(--input-primary);
          border-color: color-mix(in srgb, var(--input-primary) 48%, var(--input-border));
          transform: translateY(-1px) scale(1.02);
          box-shadow: 0 8px 18px rgba(204, 255, 0, 0.16);
        }

        .input-mode-trigger:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--input-primary) 65%, transparent);
          outline-offset: 2px;
          background: color-mix(in srgb, var(--input-primary-glow) 72%, var(--input-surface));
          color: var(--input-primary);
          border-color: color-mix(in srgb, var(--input-primary) 52%, var(--input-border));
          box-shadow: 0 8px 18px rgba(204, 255, 0, 0.16);
        }
      }

      .input-mode-trigger__label {
        font-size: 0.8rem;
        font-weight: 600;
        letter-spacing: 0.01em;
      }

      .input-mode-trigger__chevron {
        flex: 0 0 auto;
      }

      .input-mode-backdrop {
        position: fixed;
        inset: 0;
        border: none;
        background: transparent;
        margin: 0;
        padding: 0;
        z-index: 1;
      }

      .input-mode-menu {
        position: absolute;
        left: 0;
        bottom: calc(100% + 10px);
        width: min(250px, max(176px, calc(100cqi - 40px)));
        max-width: min(calc(100cqi - 28px), calc(100vw - 24px));
        padding: 8px;
        border-radius: 18px;
        border: 1px solid var(--input-border);
        background: var(--input-surface);
        box-shadow:
          0 8px 24px rgba(0, 0, 0, 0.12),
          0 0 0 1px var(--input-border);
        backdrop-filter: saturate(160%) blur(14px);
        -webkit-backdrop-filter: saturate(160%) blur(14px);
        overflow-y: auto;
        overscroll-behavior: contain;
        z-index: 2;
      }

      .input-mode-menu--below {
        top: calc(100% + 10px);
        bottom: auto;
      }

      .input-mode-menu::-webkit-scrollbar {
        display: none;
      }

      .input-mode-menu__item {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 12px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--input-text);
        border-radius: 14px;
        padding: 10px 12px;
        text-align: left;
        cursor: pointer;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease,
          transform 0.18s ease;
      }

      .input-mode-menu__item:hover,
      .input-mode-menu__item--active {
        background: var(--input-surface-hover);
      }

      .input-mode-menu__item--active {
        border-color: color-mix(in srgb, var(--input-primary) 34%, var(--input-border));
      }

      .input-mode-menu__leading {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        color: var(--input-attach-fg);
      }

      .input-mode-menu__item--active .input-mode-menu__leading {
        color: var(--input-primary);
      }

      .input-mode-menu__copy {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1 1 auto;
      }

      .input-mode-menu__title {
        font-size: 0.83rem;
        font-weight: 600;
      }

      .input-mode-menu__description {
        font-size: 0.72rem;
        color: var(--input-muted);
      }

      .input-mode-menu__selected-indicator {
        flex: 0 0 auto;
      }

      @container (max-width: 340px) {
        .input-mode-trigger__chevron {
          display: none;
        }

        .input-mode-menu {
          width: min(220px, calc(100cqi - 32px));
        }
      }

      @container (max-width: 280px) {
        .input-mode-trigger {
          width: 36px;
          min-width: 36px;
          padding: 0;
          gap: 0;
          justify-content: center;
        }

        .input-mode-trigger__label,
        .input-mode-trigger__chevron {
          display: none;
        }

        .input-mode-menu {
          width: min(200px, calc(100cqi - 24px));
        }

        .input-mode-menu__description {
          display: none;
        }

        .input-mode-menu__selected-indicator {
          display: none;
        }
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
        color: var(--input-attach-fg);
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
  private static readonly MENU_GAP_PX = 10;
  private static readonly MENU_VIEWPORT_MARGIN_PX = 12;

  // ── Ref for auto-resize ──
  private readonly textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('messageInput');
  private readonly modePickerRef = viewChild<ElementRef<HTMLElement>>('modePicker');
  private readonly modeTriggerRef = viewChild<ElementRef<HTMLElement>>('modeTrigger');
  private readonly modeMenuRef = viewChild<ElementRef<HTMLElement>>('modeMenu');
  private readonly effortPickerRef = viewChild<ElementRef<HTMLElement>>('effortPicker');
  private readonly effortTriggerRef = viewChild<ElementRef<HTMLElement>>('effortTrigger');
  private readonly effortMenuRef = viewChild<ElementRef<HTMLElement>>('effortMenu');

  // ── Swipe-to-dismiss tracking ──
  private swipeStartX: number | null = null;
  private swipeStartY: number | null = null;
  private swipeCurrentX: number | null = null;
  private swipeCurrentY: number | null = null;
  private menuLayoutFrameId: number | null = null;
  private readonly settledAttachmentPreviewKeys = signal<ReadonlySet<string>>(new Set());
  private readonly failedContextPreviewUrls = signal<ReadonlySet<string>>(new Set());

  // ── Inputs ──
  readonly userMessage = input('');
  readonly placeholder = input('Describe what you want to execute');
  readonly executionMode = input<AgentXExecutionMode>('execute');
  readonly effortLevel = input<AgentXEffortLevel>('medium');
  readonly isLoading = input(false);
  readonly uploading = input(false);
  readonly canSend = input(false);
  readonly pendingFiles = input<readonly AgentXPendingFile[]>([]);
  readonly pendingSources = input<readonly PendingConnectedSource[]>([]);
  readonly pendingContexts = input<readonly AgentXSelectedContext[]>([]);
  /** String label of the currently selected task (null = none). */
  readonly selectedTask = input<string | null>(null);

  // ── Outputs ──
  readonly messageChange = output<string>();
  readonly executionModeChange = output<AgentXExecutionMode>();
  readonly effortLevelChange = output<AgentXEffortLevel>();
  readonly send = output<void>();
  readonly pause = output<void>();
  readonly toggleAttachments = output<void>();
  readonly filesPasted = output<File[]>();
  readonly openFile = output<number>();
  readonly removeFile = output<number>();
  readonly removeSource = output<number>();
  readonly removeContext = output<number>();
  readonly removeTask = output<void>();
  readonly focusInput = output<void>();
  protected readonly executionModeOptions: ReadonlyArray<{
    readonly value: AgentXExecutionMode;
    readonly label: string;
    readonly description: string;
    readonly icon: string;
  }> = [
    {
      value: 'execute',
      label: 'Execute',
      description: 'Run the request normally.',
      icon: 'bolt',
    },
    {
      value: 'plan',
      label: 'Plan',
      description: 'Draft the plan before execution.',
      icon: 'menu',
    },
  ];
  protected readonly effortLevelOptions: ReadonlyArray<{
    readonly value: AgentXEffortLevel;
    readonly label: string;
    readonly description: string;
  }> = [
    {
      value: 'high',
      label: 'High',
      description: 'Highest quality. Highest cost.',
    },
    {
      value: 'medium',
      label: 'Medium',
      description: 'Balanced quality and cost.',
    },
    {
      value: 'low',
      label: 'Low',
      description: 'Fastest. Lowest cost.',
    },
  ];
  protected readonly inputTestIds = AGENT_X_INPUT_TEST_IDS;
  protected readonly modeMenuOpen = signal(false);
  protected readonly effortMenuOpen = signal(false);
  protected readonly modeMenuLayout = signal<InputMenuLayout>(DEFAULT_INPUT_MENU_LAYOUT);
  protected readonly effortMenuLayout = signal<InputMenuLayout>(DEFAULT_INPUT_MENU_LAYOUT);

  constructor() {
    // Auto-resize textarea when message changes
    effect((onCleanup) => {
      this.userMessage();
      const textarea = this.textareaRef()?.nativeElement;
      if (!textarea) {
        return;
      }

      const resize = () => {
        this.resizeTextarea(textarea);
      };

      if (typeof requestAnimationFrame !== 'function') {
        resize();
        return;
      }

      const frameId = requestAnimationFrame(resize);
      onCleanup(() => cancelAnimationFrame(frameId));
    });

    effect(() => {
      const activeKeys = new Set<string>();

      for (const file of this.pendingFiles()) {
        const previewKey = this.filePreviewReadyKey(file);
        if (previewKey) {
          activeKeys.add(previewKey);
        }
      }

      for (const context of this.pendingContexts()) {
        const previewUrl = this.contextPreviewUrl(context) ?? this.contextVideoUrl(context);
        const previewKey = previewUrl ? this.contextPreviewReadyKey(context, previewUrl) : null;
        if (previewKey) {
          activeKeys.add(previewKey);
        }
      }

      this.settledAttachmentPreviewKeys.update((current) => {
        const next = new Set<string>();
        for (const key of current) {
          if (activeKeys.has(key)) {
            next.add(key);
          }
        }

        if (next.size === current.size && [...next].every((key) => current.has(key))) {
          return current;
        }

        return next;
      });

      const activePreviewUrls = new Set<string>();
      for (const context of this.pendingContexts()) {
        for (const candidateUrl of this.contextPreviewCandidateUrls(context)) {
          activePreviewUrls.add(candidateUrl);
        }
      }

      this.failedContextPreviewUrls.update((current) => {
        const next = new Set<string>();
        for (const url of current) {
          if (activePreviewUrls.has(url)) {
            next.add(url);
          }
        }

        if (next.size === current.size && [...next].every((url) => current.has(url))) {
          return current;
        }

        return next;
      });
    });

    effect((onCleanup) => {
      const modeMenuOpen = this.modeMenuOpen();
      const effortMenuOpen = this.effortMenuOpen();

      if (!modeMenuOpen && !effortMenuOpen) {
        this.cancelScheduledMenuLayoutUpdate();
        this.modeMenuLayout.set(DEFAULT_INPUT_MENU_LAYOUT);
        this.effortMenuLayout.set(DEFAULT_INPUT_MENU_LAYOUT);
        return;
      }

      const syncLayout = () => {
        this.scheduleMenuLayoutUpdate();
      };

      syncLayout();

      const win = globalThis.window;
      const viewport = win?.visualViewport;
      if (!win?.addEventListener) {
        return;
      }

      win.addEventListener('resize', syncLayout, { passive: true });
      win.addEventListener('scroll', syncLayout, { passive: true, capture: true });
      viewport?.addEventListener('resize', syncLayout, { passive: true });
      viewport?.addEventListener('scroll', syncLayout, { passive: true });

      onCleanup(() => {
        this.cancelScheduledMenuLayoutUpdate();
        win.removeEventListener('resize', syncLayout);
        win.removeEventListener('scroll', syncLayout, true);
        viewport?.removeEventListener('resize', syncLayout);
        viewport?.removeEventListener('scroll', syncLayout);
      });
    });
  }

  protected onEnterKey(event: Event): void {
    const kb = event as KeyboardEvent;
    if (!kb.shiftKey) {
      kb.preventDefault();
      if (this.canSend()) this.send.emit();
    }
  }

  protected onMessageInputChange(value: string): void {
    this.messageChange.emit(value);

    const textarea = this.textareaRef()?.nativeElement;
    if (!textarea) {
      return;
    }

    this.resizeTextarea(textarea);
  }

  protected onInputFocus(): void {
    this.closeMenus();
    this.focusInput.emit();
  }

  protected executionModeLabel(): string {
    return this.executionMode() === 'plan' ? 'Plan' : 'Execute';
  }

  protected executionModeIcon(): string {
    return this.executionMode() === 'plan' ? 'menu' : 'bolt';
  }

  protected effortLevelLabel(): string {
    switch (this.effortLevel()) {
      case 'medium':
        return 'Medium';
      case 'low':
        return 'Low';
      case 'high':
      default:
        return 'High';
    }
  }

  protected toggleModeMenu(): void {
    const nextValue = !this.modeMenuOpen();
    this.closeMenus();
    this.modeMenuOpen.set(nextValue);
  }

  protected closeModeMenu(): void {
    this.modeMenuOpen.set(false);
  }

  protected toggleEffortMenu(): void {
    const nextValue = !this.effortMenuOpen();
    this.closeMenus();
    this.effortMenuOpen.set(nextValue);
  }

  protected closeEffortMenu(): void {
    this.effortMenuOpen.set(false);
  }

  protected selectExecutionMode(mode: AgentXExecutionMode): void {
    this.executionModeChange.emit(mode);
    this.closeMenus();
  }

  protected selectEffortLevel(level: AgentXEffortLevel): void {
    this.effortLevelChange.emit(level);
    this.closeMenus();
  }

  protected effortLevelTestId(level: AgentXEffortLevel): string {
    switch (level) {
      case 'high':
        return this.inputTestIds.EFFORT_OPTION_HIGH;
      case 'medium':
        return this.inputTestIds.EFFORT_OPTION_MEDIUM;
      case 'low':
        return this.inputTestIds.EFFORT_OPTION_LOW;
    }
  }

  protected onPaste(event: ClipboardEvent): void {
    const clipboard = event.clipboardData;
    if (!clipboard) {
      return;
    }

    const pastedImages: File[] = [];

    for (const item of Array.from(clipboard.items)) {
      if (!item.type.startsWith('image/')) {
        continue;
      }

      const file = item.getAsFile();
      if (file && file.size > 0) {
        pastedImages.push(file);
      }
    }

    if (pastedImages.length === 0) {
      return;
    }

    // Keep image paste in the attachment pipeline instead of inserting raw data into text.
    event.preventDefault();
    this.filesPasted.emit(pastedImages);
  }

  private closeMenus(): void {
    this.closeModeMenu();
    this.closeEffortMenu();
  }

  private scheduleMenuLayoutUpdate(): void {
    this.cancelScheduledMenuLayoutUpdate();

    if (typeof requestAnimationFrame !== 'function') {
      this.updateOpenMenuLayouts();
      return;
    }

    this.menuLayoutFrameId = requestAnimationFrame(() => {
      this.menuLayoutFrameId = null;
      this.updateOpenMenuLayouts();
    });
  }

  private cancelScheduledMenuLayoutUpdate(): void {
    if (this.menuLayoutFrameId === null || typeof cancelAnimationFrame !== 'function') {
      this.menuLayoutFrameId = null;
      return;
    }

    cancelAnimationFrame(this.menuLayoutFrameId);
    this.menuLayoutFrameId = null;
  }

  private updateOpenMenuLayouts(): void {
    if (this.modeMenuOpen()) {
      this.modeMenuLayout.set(
        this.measureMenuLayout(this.modePickerRef(), this.modeTriggerRef(), this.modeMenuRef())
      );
    }

    if (this.effortMenuOpen()) {
      this.effortMenuLayout.set(
        this.measureMenuLayout(
          this.effortPickerRef(),
          this.effortTriggerRef(),
          this.effortMenuRef()
        )
      );
    }
  }

  private measureMenuLayout(
    pickerRef: ElementRef<HTMLElement> | undefined,
    triggerRef: ElementRef<HTMLElement> | undefined,
    menuRef: ElementRef<HTMLElement> | undefined
  ): InputMenuLayout {
    const picker = pickerRef?.nativeElement;
    const trigger = triggerRef?.nativeElement;
    const menu = menuRef?.nativeElement;
    const doc = globalThis.document;

    if (!picker || !trigger || !menu || !doc) {
      return DEFAULT_INPUT_MENU_LAYOUT;
    }

    const win = doc.defaultView;
    const viewport = win?.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportHeight = viewport?.height ?? win?.innerHeight ?? doc.documentElement.clientHeight;
    const viewportWidth = viewport?.width ?? win?.innerWidth ?? doc.documentElement.clientWidth;

    const pickerRect = picker.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const previousLeft = menu.style.left;
    const previousMaxHeight = menu.style.maxHeight;

    menu.style.left = '0px';
    menu.style.maxHeight = '';

    const menuRect = menu.getBoundingClientRect();
    const naturalHeight = menu.scrollHeight || menuRect.height;
    const menuWidth = menuRect.width;

    menu.style.left = previousLeft;
    menu.style.maxHeight = previousMaxHeight;

    const availableAbove =
      triggerRect.top -
      viewportTop -
      AgentXInputBarComponent.MENU_VIEWPORT_MARGIN_PX -
      AgentXInputBarComponent.MENU_GAP_PX;
    const availableBelow =
      viewportTop +
      viewportHeight -
      triggerRect.bottom -
      AgentXInputBarComponent.MENU_VIEWPORT_MARGIN_PX -
      AgentXInputBarComponent.MENU_GAP_PX;

    const placement: InputMenuPlacement =
      naturalHeight <= availableAbove || availableAbove >= availableBelow ? 'above' : 'below';
    const availableHeight = placement === 'above' ? availableAbove : availableBelow;
    const maxHeight = availableHeight > 0 ? Math.floor(availableHeight) : null;

    const minLeft = viewportLeft + AgentXInputBarComponent.MENU_VIEWPORT_MARGIN_PX;
    const maxLeft =
      viewportLeft + viewportWidth - AgentXInputBarComponent.MENU_VIEWPORT_MARGIN_PX - menuWidth;
    const desiredLeft =
      maxLeft >= minLeft
        ? clampValue(triggerRect.left, minLeft, maxLeft)
        : viewportLeft + AgentXInputBarComponent.MENU_VIEWPORT_MARGIN_PX;

    return {
      placement,
      offsetX: Math.round(desiredLeft - pickerRect.left),
      maxHeight,
    };
  }

  private resizeTextarea(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;

    if (!textarea.value) {
      textarea.style.height = '';
    }
  }

  protected contextPreviewUrl(context: AgentXSelectedContext): string | null {
    const failedUrls = this.failedContextPreviewUrls();
    return this.contextPreviewCandidateUrls(context).find((url) => !failedUrls.has(url)) ?? null;
  }

  protected onContextPreviewError(context: AgentXSelectedContext, previewUrl: string): void {
    const normalizedUrl = previewUrl.trim();
    if (!normalizedUrl) {
      this.markAttachmentPreviewSettled(this.contextPreviewReadyKey(context, previewUrl));
      return;
    }

    this.failedContextPreviewUrls.update((current) => {
      if (current.has(normalizedUrl)) {
        return current;
      }

      return new Set([...current, normalizedUrl]);
    });

    this.markAttachmentPreviewSettled(this.contextPreviewReadyKey(context, previewUrl));
  }

  private contextPreviewCandidateUrls(context: AgentXSelectedContext): readonly string[] {
    const candidates = [
      context.media?.thumbnailUrl,
      context.media?.imageUrl,
      this.cloudflareThumbnailUrl(context),
    ];

    return [...new Set(candidates.map((value) => value?.trim() ?? '').filter(Boolean))];
  }

  private cloudflareThumbnailUrl(context: AgentXSelectedContext): string | null {
    const cloudflareVideoId = context.media?.cloudflareVideoId?.trim();
    if (!cloudflareVideoId) {
      return null;
    }

    return `https://videodelivery.net/${cloudflareVideoId}/thumbnails/thumbnail.jpg`;
  }

  protected pendingFileTrackId(file: AgentXPendingFile): string {
    return [
      file.file.name,
      file.file.size,
      file.file.lastModified,
      file.file.type,
      file.nativeUri ?? '',
      file.nativeWebPath ?? '',
      file.previewUrl ?? '',
    ].join(':');
  }

  protected filePreviewReadyKey(file: AgentXPendingFile): string | null {
    if (!file.previewUrl) {
      return null;
    }

    return `file:${this.pendingFileTrackId(file)}`;
  }

  protected contextPreviewReadyKey(
    context: AgentXSelectedContext,
    previewUrl: string | null
  ): string | null {
    if (!previewUrl) {
      return null;
    }

    return `context:${context.id}:${previewUrl}`;
  }

  protected isAttachmentPreviewReady(key: string | null): boolean {
    if (!key) {
      return true;
    }

    return this.settledAttachmentPreviewKeys().has(key);
  }

  protected markAttachmentPreviewSettled(key: string | null): void {
    if (!key) {
      return;
    }

    this.settledAttachmentPreviewKeys.update((current) => {
      if (current.has(key)) {
        return current;
      }

      const next = new Set(current);
      next.add(key);
      return next;
    });
  }

  protected contextVideoUrl(context: AgentXSelectedContext): string | null {
    return context.media?.videoUrl ?? null;
  }

  protected isContextVideo(context: AgentXSelectedContext): boolean {
    return !!context.media?.videoUrl;
  }

  protected contextIconName(context: AgentXSelectedContext): string {
    if (context.metadata?.['itemType'] === 'film_review_playlist') return 'folder';
    if (context.source?.type === 'film_review') return 'videocam';
    if (context.source?.type === 'playbook') return 'documentText';
    if (context.source?.type === 'game_plan') return 'analytics';
    return 'analytics';
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

function clampValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
