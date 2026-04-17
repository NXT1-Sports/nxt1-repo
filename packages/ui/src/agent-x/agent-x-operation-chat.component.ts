/**
 * @fileoverview Agent X Operation Chat — Bottom Sheet Chat Component
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Self-contained AI chat experience for a specific operation or quick command.
 * Opens inside NxtBottomSheetService.openSheet() with its own isolated
 * message history, input bar, and simulated AI responses.
 *
 * Each operation/command gets a dedicated conversational context so the
 * main Agent X chat remains uncluttered.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```typescript
 * await this.bottomSheet.openSheet({
 *   component: AgentXOperationChatComponent,
 *   componentProps: {
 *     contextId: 'op-1',
 *     contextTitle: 'Analyzing game film...',
 *     contextIcon: 'play',
 *     contextType: 'operation',
 *   },
 *   ...SHEET_PRESETS.FULL,
 * });
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  Input,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
  computed,
  viewChild,
  ElementRef,
  effect,
  output,
  PLATFORM_ID,
  DestroyRef,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { createAgentXApi, type AgentXApi } from '@nxt1/core/ai';
import type {
  AgentXAttachment,
  AgentXChatRequest,
  AgentXToolStep,
  AgentXMessagePart,
  AgentXRichCard,
  AgentXBillingActionReason,
  AgentXStreamStepEvent,
  AgentXStreamCardEvent,
} from '@nxt1/core/ai';
import {
  AGENT_X_ALLOWED_MIME_TYPES,
  AGENT_X_ENDPOINTS,
  AGENT_X_MAX_ATTACHMENTS,
  AGENT_X_MAX_FILE_SIZE,
  resolveAttachmentType,
} from '@nxt1/core/ai';
import { ModalController } from '@ionic/angular/standalone';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';
import { NxtChatBubbleComponent } from '../components/chat-bubble';
import { NxtIconComponent } from '../components/icon';
import { NxtLoggingService } from '../services/logging/logging.service';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { NxtToastService } from '../services/toast/toast.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { AGENT_X_OPERATION_CHAT_TEST_IDS } from '@nxt1/core/testing';
import { AgentXInputBarComponent } from './agent-x-input-bar.component';
import {
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
  AgentXJobService,
} from './agent-x-job.service';
import { AgentXStreamRegistryService } from './agent-x-stream-registry.service';
import { AgentXOperationEventService } from './agent-x-operation-event.service';
import { AgentXService } from './agent-x.service';
import { IntelService } from '../intel/intel.service';
import { NxtMediaViewerService } from '../components/media-viewer/media-viewer.service';
import type { MediaViewerItem } from '../components/media-viewer/media-viewer.types';
import { NxtDragDropDirective } from '../services/gesture';
import {
  AgentXActionCardComponent,
  type ActionCardApprovalEvent,
  type ActionCardReplyEvent,
} from './agent-x-action-card.component';
import type { BillingActionResolvedEvent } from './agent-x-billing-action-card.component';
import type { ConfirmationActionEvent } from './agent-x-confirmation-card.component';
import type { AskUserReplyEvent } from './agent-x-ask-user-card.component';
import type { DraftSubmittedEvent } from './agent-x-draft-card.component';
import type { AgentYieldState } from '@nxt1/core';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';
import type { AgentXPendingFile } from './agent-x-pending-file';

// ============================================
// INTERFACES
// ============================================

/** Shape of a suggested quick action chip shown inside the chat. */
export interface OperationQuickAction {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly description?: string;
}

/** Shape of a pending file staged for upload (preview shown above input). */
interface PendingFile {
  readonly file: File;
  readonly previewUrl: string | null; // objectURL for images, null for docs/video
  readonly isImage: boolean;
  readonly isVideo: boolean;
}

/** Attachment preview shown inside a sent message. */
interface MessageAttachment {
  readonly url: string;
  readonly type: 'image' | 'video' | 'doc';
  readonly name: string;
}

/** Shape of a single chat message inside the operation context. */
interface OperationMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly timestamp: Date;
  readonly imageUrl?: string;
  readonly videoUrl?: string;
  readonly attachments?: readonly MessageAttachment[];
  readonly isTyping?: boolean;
  readonly error?: boolean;
  readonly steps?: readonly AgentXToolStep[];
  readonly cards?: readonly AgentXRichCard[];
  readonly parts?: readonly AgentXMessagePart[];
}

@Component({
  selector: 'nxt1-agent-x-operation-chat',
  standalone: true,
  host: {
    '[class.agent-x-operation-chat--embedded]': 'embedded',
  },
  imports: [
    CommonModule,
    FormsModule,
    NxtSheetHeaderComponent,
    NxtChatBubbleComponent,
    NxtIconComponent,
    NxtDragDropDirective,
    AgentXInputBarComponent,
    AgentXActionCardComponent,
  ],
  template: `
    <div
      class="operation-chat-shell"
      nxtDragDrop
      (dragStateChange)="onDragStateChange($event)"
      (filesDropped)="onFilesDropped($event)"
    >
      @if (!embedded) {
        <!-- ═══ HEADER ═══ -->
        <nxt1-sheet-header
          [title]="headerTitle()"
          [subtitle]="contextTypeLabel()"
          [showAgentXIcon]="true"
          iconShape="rounded"
          closePosition="right"
          [showBorder]="true"
          (closeSheet)="dismiss()"
        />
      }

      <!-- ═══ MESSAGES ═══ -->
      <div class="messages-area" [class.messages-area--embedded]="embedded" #messagesArea>
        <!-- ═══ COORDINATOR WELCOME (commands only — operations skip straight to work) ═══ -->
        @if (showWelcome()) {
          <div class="msg-row msg-assistant">
            <nxt1-chat-bubble
              variant="agent-operation"
              [isOwn]="false"
              [content]="welcomeMessage()"
              [isTyping]="false"
              [isError]="false"
              [isSystem]="false"
            />
          </div>

          <!-- ═══ QUICK OPTIONS ═══ -->
          <h4 class="quick-prompts-title">Quick Prompts</h4>
          <!-- Desktop: single 2-col grid -->
          <div class="quick-options quick-options--desktop">
            @for (action of normalizedQuickActions(); track action.id) {
              <button
                type="button"
                class="quick-option-chip"
                [attr.data-coordinator]="resolveCoordinatorChipId(action)"
                (click)="onQuickAction(action)"
              >
                <span class="quick-option-chip__topline">
                  <span class="quick-option-chip__title">{{ action.label }}</span>
                </span>
                @if (action.description) {
                  <span class="quick-option-chip__description">{{ action.description }}</span>
                }
              </button>
            }
          </div>
          <!-- Mobile: rows of 4, each row scrolls horizontally -->
          <div class="quick-options-rows quick-options--mobile">
            @for (row of quickActionRows(); track $index) {
              <div class="quick-options-row">
                @for (action of row; track action.id) {
                  <button
                    type="button"
                    class="quick-option-chip"
                    [attr.data-coordinator]="resolveCoordinatorChipId(action)"
                    (click)="onQuickAction(action)"
                  >
                    <span class="quick-option-chip__topline">
                      <span class="quick-option-chip__title">{{ action.label }}</span>
                    </span>
                    @if (action.description) {
                      <span class="quick-option-chip__description">{{ action.description }}</span>
                    }
                  </button>
                }
              </div>
            }
          </div>

          <!-- ═══ SCHEDULED ACTIONS ═══ -->
          @if (scheduledActions.length > 0) {
            <h4 class="quick-prompts-title scheduled-title">Scheduled Actions</h4>
            <!-- Desktop: single 2-col grid -->
            <div class="quick-options quick-options--desktop scheduled-options">
              @for (action of scheduledActions; track action.id) {
                <button
                  type="button"
                  class="quick-option-chip scheduled-chip"
                  (click)="onQuickAction(action)"
                >
                  <span class="quick-option-chip__topline">
                    <span class="quick-option-chip__title">{{ action.label }}</span>
                  </span>
                  @if (action.description) {
                    <span class="quick-option-chip__description">{{ action.description }}</span>
                  }
                </button>
              }
            </div>
            <!-- Mobile: rows of 4, each row scrolls horizontally -->
            <div class="quick-options-rows quick-options--mobile scheduled-options">
              @for (row of scheduledActionRows(); track $index) {
                <div class="quick-options-row">
                  @for (action of row; track action.id) {
                    <button
                      type="button"
                      class="quick-option-chip scheduled-chip"
                      (click)="onQuickAction(action)"
                    >
                      <span class="quick-option-chip__topline">
                        <span class="quick-option-chip__title">{{ action.label }}</span>
                      </span>
                      @if (action.description) {
                        <span class="quick-option-chip__description">{{ action.description }}</span>
                      }
                    </button>
                  }
                </div>
              }
            </div>
          }
        }

        @for (msg of messages(); track msg.id; let first = $first) {
          <div
            class="msg-row"
            [class.msg-user]="msg.role === 'user'"
            [class.msg-assistant]="msg.role === 'assistant'"
            [class.msg-system]="msg.role === 'system'"
            [class.msg-error]="msg.error"
            [class.msg-row--wide]="msgHasDataTable(msg)"
          >
            <nxt1-chat-bubble
              variant="agent-operation"
              [isOwn]="msg.role === 'user'"
              [content]="msg.content"
              [isTyping]="!!msg.isTyping"
              [isError]="!!msg.error"
              [isSystem]="msg.role === 'system'"
              [steps]="msg.steps ?? []"
              [cards]="msg.cards ?? []"
              [parts]="msg.parts ?? []"
              (billingActionResolved)="onBillingActionResolved($event)"
              (confirmationAction)="onConfirmationAction($event)"
              (draftSubmitted)="onDraftSubmitted($event)"
              (askUserReply)="onAskUserReply($event)"
            />
            @if (msg.attachments?.length) {
              <div class="msg-attachments">
                @for (att of msg.attachments; track att.name + $index) {
                  <div class="msg-attachment" [class.msg-attachment--media]="att.type !== 'doc'">
                    @if (att.type === 'image') {
                      <img
                        [src]="att.url"
                        [alt]="att.name"
                        class="msg-attachment__thumb"
                        (click)="openAttachmentViewer(msg.attachments!, $index)"
                      />
                    } @else if (att.type === 'video') {
                      <video
                        [src]="att.url"
                        class="msg-attachment__thumb"
                        preload="metadata"
                        (click)="openAttachmentViewer(msg.attachments!, $index)"
                      ></video>
                      <div class="msg-attachment__play">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                          <path d="M8 5v14l11-7L8 5z" />
                        </svg>
                      </div>
                    } @else {
                      <div
                        class="msg-attachment__doc"
                        (click)="openAttachmentViewer(msg.attachments!, $index)"
                        style="cursor: pointer;"
                      >
                        <div
                          class="msg-attachment__doc-icon-wrap"
                          [style.background]="getFileColor(att.name, 0.15)"
                          [style.color]="getFileColor(att.name, 1)"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.5"
                            width="14"
                            height="14"
                          >
                            <path
                              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
                            />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>
                        <div class="msg-attachment__doc-info">
                          <span class="msg-attachment__doc-name">{{ att.name }}</span>
                          <span class="msg-attachment__doc-meta">{{ getFileExt(att.name) }}</span>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- ═══ THINKING INDICATOR (Copilot-style: spinning icon + shimmering text) ═══ -->
        @if (showThinking()) {
          <div class="thinking-block">
            <div class="thinking-block__avatar">
              <svg
                class="thinking-block__spinner"
                viewBox="0 0 16 16"
                fill="none"
                width="16"
                height="16"
              >
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-dasharray="28"
                  stroke-dashoffset="8"
                  stroke-linecap="round"
                />
              </svg>
            </div>
            <span class="thinking-block__label">Agent X is thinking…</span>
          </div>
        }

        <!-- ═══ HITL ACTION CARD (when operation is yielded — approval only) ═══ -->
        <!-- ask_user yields are handled inline via the rich card in the chat bubble -->
        @if (
          activeYieldState() && !yieldResolved() && activeYieldState()!.reason === 'needs_approval'
        ) {
          <div class="msg-row msg-assistant">
            <nxt1-agent-action-card
              #actionCard
              [yield]="activeYieldState()!"
              [operationId]="yieldOperationId()"
              (approve)="onApproveAction($event)"
              (reply)="onReplyAction($event)"
            />
          </div>
        }

        <!-- ═══ FAILURE BANNER (when operation has failed) ═══ -->
        @if (isFailed() && !retryStarted()) {
          <div class="failure-banner" [attr.data-testid]="failureTestIds.FAILURE_BANNER">
            <div class="failure-banner__header">
              <nxt1-icon name="alert-circle" [size]="20" />
              <span class="failure-banner__title" [attr.data-testid]="failureTestIds.FAILURE_TITLE"
                >Operation Failed</span
              >
            </div>
            <p class="failure-banner__message" [attr.data-testid]="failureTestIds.FAILURE_MESSAGE">
              {{ failureMessage() }}
            </p>
            <div class="failure-banner__actions">
              <button
                type="button"
                class="failure-banner__btn failure-banner__btn--retry"
                [attr.data-testid]="failureTestIds.BTN_RETRY"
                (click)="onRetry()"
              >
                <nxt1-icon name="refresh" [size]="14" />
                Retry
              </button>
              @if (!embedded) {
                <button
                  type="button"
                  class="failure-banner__btn failure-banner__btn--dismiss"
                  [attr.data-testid]="failureTestIds.BTN_DISMISS"
                  (click)="dismiss()"
                >
                  Dismiss
                </button>
              }
            </div>
          </div>
        }

        @if (retryStarted()) {
          <div class="msg-row msg-system">
            <nxt1-chat-bubble
              variant="agent-operation"
              [isOwn]="false"
              [content]="'🔄 Retrying this operation — a new job has been queued. You can close this sheet.'"
              [isTyping]="false"
              [isError]="false"
              [isSystem]="true"
            />
          </div>
        }
      </div>

      <!-- ═══ INPUT ═══ -->
      <nxt1-agent-x-input-bar
        [userMessage]="inputValue()"
        [isLoading]="_loading()"
        [canSend]="canSend()"
        [pendingFiles]="promptInputPendingFiles()"
        [selectedTask]="null"
        placeholder="Message A Coordinator"
        (messageChange)="inputValue.set($event)"
        (send)="send()"
        (stop)="cancelStream()"
        (toggleAttachments)="onUploadClick()"
        (removeFile)="removePendingFile($event)"
      />
      <input
        #fileInput
        class="file-input-hidden"
        type="file"
        [accept]="acceptedFileTypes"
        multiple
        (change)="onFileSelected($event)"
      />

      @if (isDragActive()) {
        <div
          class="chat-drop-overlay"
          [attr.data-testid]="chatTestIds.DROP_OVERLAY"
          aria-live="polite"
        >
          <div class="chat-drop-overlay__card">
            <div class="chat-drop-overlay__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M12 16V5" stroke-linecap="round" />
                <path d="M7.5 9.5 12 5l4.5 4.5" stroke-linecap="round" stroke-linejoin="round" />
                <path
                  d="M4 17.5a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 17.5"
                  stroke-linecap="round"
                />
              </svg>
            </div>
            <h3 class="chat-drop-overlay__title">Drop files to attach</h3>
            <p class="chat-drop-overlay__copy">
              Images, videos, PDFs, docs, and spreadsheets are supported. Up to 5 files, 20 MB each.
            </p>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         OPERATION CHAT BOTTOM SHEET
         ============================================ */
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        overflow: hidden;
        background: var(--ion-background-color, var(--nxt1-color-bg-primary, #0a0a0a));
        color: var(--nxt1-color-text-primary, #fff);

        --op-surface: var(
          --agent-surface,
          var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04))
        );
        --op-border: var(
          --agent-border,
          var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08))
        );
        --op-text: var(--agent-text-primary, var(--nxt1-color-text-primary, #fff));
        --op-text-secondary: var(
          --agent-text-secondary,
          var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7))
        );
        --op-text-muted: var(
          --agent-text-muted,
          var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5))
        );
        --op-primary: var(--nxt1-color-primary, #ccff00);
        --op-primary-glow: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        --op-glass-bg: var(--agent-glass-bg, var(--nxt1-glass-bg, rgba(18, 18, 18, 0.8)));
      }

      :host-context(.light),
      :host-context([data-theme='light']) {
        background: var(--ion-background-color, var(--nxt1-color-bg-primary, #ffffff));
        color: var(--nxt1-color-text-primary, #1a1a1a);

        --op-surface: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.03));
        --op-border: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.08));
        --op-text: var(--nxt1-color-text-primary, #1a1a1a);
        --op-text-secondary: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        --op-text-muted: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.45));
        --op-glass-bg: var(--nxt1-glass-bg, rgba(255, 255, 255, 0.8));

        --agent-surface: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.03));
        --agent-surface-hover: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.05));
        --agent-border: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.08));
        --agent-text-primary: var(--nxt1-color-text-primary, #1a1a1a);
        --agent-text-secondary: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        --agent-text-muted: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.45));
        --agent-glass-bg: var(--nxt1-glass-bg, rgba(255, 255, 255, 0.8));
      }

      :host.agent-x-operation-chat--embedded {
        flex: 1 1 auto;
        height: auto;
        min-height: 0;
        border: 1px solid var(--op-border);
        border-radius: var(--nxt1-radius-2xl, 20px);
        background: transparent;
      }

      .operation-chat-shell {
        position: relative;
        display: flex;
        flex: 1;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
      }

      .chat-drop-overlay {
        position: absolute;
        inset: 16px;
        z-index: 12;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background:
          linear-gradient(180deg, rgba(204, 255, 0, 0.16), rgba(204, 255, 0, 0.06)),
          rgba(10, 10, 10, 0.42);
        border: 1px solid rgba(204, 255, 0, 0.32);
        border-radius: 24px;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
        backdrop-filter: saturate(160%) blur(14px);
        -webkit-backdrop-filter: saturate(160%) blur(14px);
        pointer-events: none;
      }

      .chat-drop-overlay__card {
        width: min(100%, 420px);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        text-align: center;
        padding: 24px 28px;
        border-radius: 20px;
        background: rgba(7, 7, 7, 0.52);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .chat-drop-overlay__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: 18px;
        color: var(--op-primary);
        background: rgba(204, 255, 0, 0.12);
        box-shadow: inset 0 0 0 1px rgba(204, 255, 0, 0.14);
      }

      .chat-drop-overlay__icon svg {
        width: 24px;
        height: 24px;
      }

      .chat-drop-overlay__title {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        color: var(--op-text);
      }

      .chat-drop-overlay__copy {
        margin: 0;
        max-width: 320px;
        font-size: 13px;
        line-height: 1.55;
        color: var(--op-text-secondary);
      }

      /* ── MESSAGES ── */
      .messages-area {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 16px 20px;
        display: flex;
        flex-direction: column;
        gap: 20px;
        -webkit-overflow-scrolling: touch;
      }

      .messages-area--embedded {
        max-height: none;
        min-height: 0;
        flex: 1 1 auto;
        width: 100%;
        max-width: calc(100% - 48px);
        margin-left: auto;
        margin-right: auto;
        padding-bottom: 8px;
      }

      .msg-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-width: 88%;
        animation: fadeSlideIn 0.25s ease-out;
      }

      /* Full-width row for messages containing data tables */
      .msg-row--wide {
        max-width: 100%;
        width: 100%;
      }

      @keyframes fadeSlideIn {
        from {
          opacity: 0;
          transform: translateY(6px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .msg-user {
        margin-left: auto;
        align-items: flex-end;
      }

      .msg-assistant {
        margin-right: auto;
        align-items: flex-start;
      }

      .msg-assistant ::ng-deep nxt1-chat-bubble {
        background: var(--op-surface);
        border: 1px solid var(--op-border);
        border-radius: 14px;
        padding: 14px 16px;
        color: var(--op-text);
      }

      .msg-user ::ng-deep nxt1-chat-bubble,
      .msg-user ::ng-deep nxt1-chat-bubble.variant-agent-operation.own {
        background: var(--op-surface);
        border: 1px solid var(--op-border);
        border-radius: 14px;
        border-bottom-right-radius: 4px;
        padding: 10px 14px;
        color: var(--op-text);
      }

      .msg-system {
        margin: 0 auto;
        max-width: 100%;
      }

      /* ── MESSAGE ATTACHMENTS (thumbnails in sent messages) ── */
      .msg-attachments {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 6px;
        flex-wrap: wrap;
      }

      .msg-user .msg-attachments {
        justify-content: flex-end;
      }

      .msg-attachment {
        position: relative;
        height: 56px;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid var(--op-border, rgba(255, 255, 255, 0.08));
        background: var(--op-surface, rgba(255, 255, 255, 0.04));
      }

      .msg-attachment--media {
        width: 56px;
      }

      .msg-attachment__thumb {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        cursor: pointer;
      }

      .msg-attachment__play {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.35);
        color: #fff;
        pointer-events: none;
      }

      .msg-attachment__doc {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        min-width: 110px;
        max-width: 170px;
        height: 100%;
        box-sizing: border-box;
      }

      .msg-attachment__doc-icon-wrap {
        width: 30px;
        height: 30px;
        border-radius: 7px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .msg-attachment__doc-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .msg-attachment__doc-name {
        font-size: 11px;
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #fff);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.3;
      }

      .msg-attachment__doc-meta {
        font-size: 10px;
        color: var(--op-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        line-height: 1.2;
      }

      /* ── PENDING FILES PREVIEW STRIP ── */
      .pending-files-strip {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        margin: 0 32px 6px;
        overflow-x: auto;
        flex-shrink: 0;
        scrollbar-width: none;
        -ms-overflow-style: none;
        animation: fadeSlideIn 0.2s ease-out;
        border-radius: var(--nxt1-borderRadius-lg, 16px);
        border: 1px solid var(--nxt1-color-border-primary, rgba(204, 255, 0, 0.3));
        box-shadow:
          0 0 0 2px var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.06)),
          0 0 16px var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.05));
        background: var(--op-primary-glow, rgba(204, 255, 0, 0.03));
      }

      /* Match input-wrapper width: base 48px + .embedded padding 40px + .input-container padding 24px = 112px */
      :host.agent-x-operation-chat--embedded .pending-files-strip {
        width: calc(100% - 112px);
        max-width: calc(100% - 112px);
        margin-left: auto;
        margin-right: auto;
        box-sizing: border-box;
      }

      .pending-files-strip::-webkit-scrollbar {
        display: none;
      }

      .pending-file {
        position: relative;
        flex-shrink: 0;
        height: 64px;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid var(--op-border, rgba(255, 255, 255, 0.08));
        background: var(--op-surface, rgba(255, 255, 255, 0.06));
      }

      .pending-file--media {
        width: 64px;
      }

      .pending-file__thumb {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        cursor: pointer;
      }

      .pending-file__doc {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        min-width: 120px;
        max-width: 170px;
        height: 100%;
        box-sizing: border-box;
      }

      .pending-file__doc-icon-wrap {
        width: 32px;
        height: 32px;
        border-radius: 7px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .pending-file__doc-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }

      .pending-file__doc-name {
        font-size: 11px;
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #fff);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.3;
      }

      .pending-file__doc-meta {
        font-size: 10px;
        color: var(--op-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        line-height: 1.2;
      }

      .pending-file__play {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.35);
        color: #fff;
        pointer-events: none;
      }

      .pending-file__remove {
        position: absolute;
        top: 3px;
        right: 3px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: none;
        background: rgba(0, 0, 0, 0.65);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
        opacity: 0;
        transition: opacity 0.15s ease;
        -webkit-tap-highlight-color: transparent;
      }

      .pending-file:hover .pending-file__remove,
      .pending-file__remove:focus-visible {
        opacity: 1;
      }

      /* Always show remove button on touch devices */
      @media (hover: none) {
        .pending-file__remove {
          opacity: 1;
        }
      }

      /* ── EMBEDDED INPUT ── */
      .embedded {
        padding: 12px 20px;
        padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
        flex-shrink: 0;
      }

      :host.agent-x-operation-chat--embedded .embedded {
        width: 100%;
        max-width: calc(100% - 48px);
        margin-left: auto;
        margin-right: auto;
        box-sizing: border-box;
      }

      .file-input-hidden {
        display: none;
      }

      .quick-options {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        padding: 0 0 16px;
        animation: fadeSlideIn 0.3s ease-out;
      }

      .quick-option-chip {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        gap: 4px;
        min-height: 74px;
        padding: 10px 14px;
        border: 1px solid var(--op-border);
        border-radius: 22px;
        background: var(--op-surface);
        color: var(--op-text);
        font-size: 13px;
        font-weight: 600;
        font-family: inherit;
        line-height: 1.3;
        cursor: pointer;
        text-align: left;
        -webkit-tap-highlight-color: transparent;
        box-shadow:
          0 14px 34px color-mix(in srgb, var(--op-shadow, #000) 22%, transparent),
          inset 0 1px 0 color-mix(in srgb, white 7%, transparent);
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease,
          box-shadow 0.15s ease,
          transform 0.15s ease;
      }

      .quick-option-chip:active {
        background: var(--op-primary-glow);
        border-color: var(--op-primary);
        color: var(--op-primary);
        transform: translateY(1px) scale(0.99);
      }

      .quick-option-chip__topline {
        display: flex;
        align-items: flex-start;
        width: 100%;
      }

      .quick-option-chip__title {
        display: block;
        font-size: 14px;
        font-weight: 700;
        line-height: 1.25;
        letter-spacing: 0.01em;
      }

      .quick-option-chip__description {
        display: -webkit-box;
        overflow: hidden;
        width: 100%;
        color: var(--op-text-secondary);
        font-size: 12px;
        font-weight: 500;
        line-height: 1.45;
        margin-top: 1px;
        text-wrap: pretty;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
      }

      .quick-option-chip[data-coordinator] {
        --coordinator-pill-accent: var(--op-primary);
        --coordinator-pill-surface: color-mix(
          in srgb,
          var(--coordinator-pill-accent) 18%,
          var(--op-glass-bg)
        );
        --coordinator-pill-border: color-mix(
          in srgb,
          var(--coordinator-pill-accent) 54%,
          var(--op-border)
        );
        --coordinator-pill-shadow: color-mix(
          in srgb,
          var(--coordinator-pill-accent) 22%,
          transparent
        );
        border-color: var(--coordinator-pill-border);
        background: var(--coordinator-pill-surface);
        color: var(--op-text);
        font-weight: 600;
        box-shadow:
          0 16px 34px var(--coordinator-pill-shadow),
          inset 0 1px 0 color-mix(in srgb, var(--coordinator-pill-accent) 10%, white);
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        transition:
          border-color 0.15s ease,
          background 0.15s ease,
          box-shadow 0.15s ease,
          color 0.15s ease,
          transform 0.15s ease;
      }

      .quick-option-chip[data-coordinator]:active {
        border-color: color-mix(in srgb, var(--coordinator-pill-accent) 72%, white);
        background: color-mix(in srgb, var(--coordinator-pill-accent) 28%, var(--op-glass-bg));
        color: var(--op-text);
        box-shadow:
          0 18px 36px color-mix(in srgb, var(--coordinator-pill-accent) 26%, transparent),
          inset 0 1px 0 color-mix(in srgb, var(--coordinator-pill-accent) 14%, white);
        transform: translateY(1px) scale(0.99);
      }

      .quick-option-chip[data-coordinator='coord-recruiting'] {
        --coordinator-pill-accent: #ccff00;
      }

      .quick-option-chip[data-coordinator='coord-media'] {
        --coordinator-pill-accent: #ff7a45;
      }

      .quick-option-chip[data-coordinator='coord-scout'] {
        --coordinator-pill-accent: #41b8ff;
      }

      .quick-option-chip[data-coordinator='coord-academics'] {
        --coordinator-pill-accent: #9d7bff;
      }

      .quick-option-chip[data-coordinator='coord-roster'] {
        --coordinator-pill-accent: #2fd39a;
      }

      .quick-option-chip[data-coordinator='coord-scouting'] {
        --coordinator-pill-accent: #3fa3ff;
      }

      .quick-option-chip[data-coordinator='coord-team-media'] {
        --coordinator-pill-accent: #ff5d8f;
      }

      .quick-option-chip[data-coordinator='coord-prospect-search'] {
        --coordinator-pill-accent: #ffd447;
      }

      .quick-option-chip[data-coordinator='coord-evaluation'] {
        --coordinator-pill-accent: #57d4ff;
      }

      .quick-option-chip[data-coordinator='coord-outreach'] {
        --coordinator-pill-accent: #ff9a3d;
      }

      .quick-option-chip[data-coordinator='coord-compliance'] {
        --coordinator-pill-accent: #44d6c2;
      }

      /* Scheduled actions — different outline color */
      .scheduled-title {
        margin-top: 12px;
      }

      .scheduled-chip {
        border-color: rgba(168, 130, 255, 0.45);
        border-style: dashed;
      }

      .scheduled-chip:active {
        border-color: #a882ff;
        color: #a882ff;
        background: color-mix(in srgb, #a882ff 10%, transparent);
      }

      /* Desktop: show grid, hide mobile rows */
      .quick-prompts-title {
        margin: 0;
        padding: 0;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.1;
        color: var(--ion-text-color, #fff);
        text-align: left;
        opacity: 0.85;
      }

      .quick-options--mobile {
        display: none;
      }

      @media (max-width: 420px) {
        /* Mobile: hide desktop grid, show row layout */
        .quick-options--desktop {
          display: none;
        }

        .quick-options--mobile {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 0 0 14px;
        }

        .quick-options-row {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          overflow-y: hidden;
          scroll-snap-type: x proximity;
          -webkit-overflow-scrolling: touch;
        }

        .quick-options-row::-webkit-scrollbar {
          display: none;
        }

        .quick-options-row .quick-option-chip {
          flex: 0 0 224px;
          min-height: 68px;
          padding: 9px 12px;
          scroll-snap-align: start;
        }
      }

      /* ── FAILURE BANNER ── */
      .failure-banner {
        margin: 8px 0;
        padding: 16px;
        border-radius: 14px;
        border: 1px solid rgba(255, 59, 48, 0.25);
        background: rgba(255, 59, 48, 0.08);
        animation: fadeSlideIn 0.3s ease-out;
      }

      .failure-banner__header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        color: #ff3b30;
      }

      .failure-banner__title {
        font-size: 14px;
        font-weight: 600;
        letter-spacing: -0.01em;
      }

      .failure-banner__message {
        font-size: 13px;
        line-height: 1.5;
        color: var(--op-text-secondary);
        margin: 0 0 14px;
        white-space: pre-line;
      }

      .failure-banner__actions {
        display: flex;
        gap: 10px;
      }

      .failure-banner__btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: opacity 0.15s ease;
      }

      .failure-banner__btn:active {
        opacity: 0.7;
      }

      .failure-banner__btn--retry {
        background: var(--op-primary);
        color: #000;
        border: none;
      }

      .failure-banner__btn--dismiss {
        background: transparent;
        color: var(--op-text-secondary);
        border: 1px solid var(--op-border);
      }

      /* ── THINKING INDICATOR (Copilot-style) ── */
      .thinking-block {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        animation: fadeSlideIn 0.3s ease-out;
      }

      .thinking-block__avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--op-primary);
      }

      .thinking-block__spinner {
        width: 16px;
        height: 16px;
        animation: thinkingSpin 1s linear infinite;
      }

      .thinking-block__label {
        font-size: 13px;
        font-weight: 500;
        letter-spacing: -0.01em;
        background: linear-gradient(
          90deg,
          var(--op-text-muted) 0%,
          var(--op-text) 50%,
          var(--op-text-muted) 100%
        );
        background-size: 200% auto;
        color: transparent;
        -webkit-background-clip: text;
        background-clip: text;
        animation: thinkingShimmer 2s linear infinite;
      }

      @keyframes thinkingSpin {
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes thinkingShimmer {
        to {
          background-position: 200% center;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .thinking-block__spinner {
          animation: none;
        }
        .thinking-block__label {
          animation: none;
          color: var(--op-text-secondary);
          background: none;
          -webkit-background-clip: unset;
          background-clip: unset;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXOperationChatComponent implements AfterViewInit, OnDestroy {
  private readonly modalCtrl = inject(ModalController);
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL);
  private readonly logger = inject(NxtLoggingService).child('AgentXOperationChat');
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly jobService = inject(AgentXJobService);
  private readonly mediaViewer = inject(NxtMediaViewerService);
  private readonly getAuthToken = inject(AGENT_X_AUTH_TOKEN_FACTORY, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly streamRegistry = inject(AgentXStreamRegistryService);
  private readonly operationEventService = inject(AgentXOperationEventService);
  private readonly agentXService = inject(AgentXService);
  private readonly intelService = inject(IntelService, { optional: true });

  /** Pure API factory — used for SSE streaming. */
  private readonly api: AgentXApi = createAgentXApi(
    {
      get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
      post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
      put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
      patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
      delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
    },
    this.baseUrl
  );

  /** Active SSE abort controller — cancelled on destroy or when a new message starts. */
  private activeStream: AbortController | null = null;

  /** Operation ID from the backend — used for explicit cancel endpoint. */
  private _currentOperationId: string | null = null;

  // ============================================
  // INPUTS (from componentProps)
  // ============================================

  /** Unique identifier for this operation/command context. */
  @Input() contextId = '';

  /** Display title shown in the sheet header. */
  @Input() contextTitle = '';

  /** Icon name displayed in the header. */
  @Input() contextIcon = 'bolt';

  /**
   * Type of context driving this chat.
   * - `operation` — Active background operation
   * - `command` — Quick command chip
   */
  @Input() contextType: 'operation' | 'command' = 'command';

  /** Coordinator description shown as the welcome message. */
  @Input() contextDescription = '';

  /** When true, renders as a desktop-embedded panel instead of a dismissible sheet. */
  @Input() embedded = false;

  /** When true, coordinator chips emit to the parent instead of auto-sending as chat text. */
  @Input() delegateCoordinatorQuickActions = false;

  /** Optional list of quick action suggestions shown as tappable chips. */
  @Input() quickActions: readonly OperationQuickAction[] = [];

  /** Optional list of schedulable actions shown in a separate row. */
  @Input() scheduledActions: readonly OperationQuickAction[] = [];

  /** Optional initial message to auto-send when the sheet opens. */
  @Input() initialMessage = '';

  /** Optional initial files to seed into the pending files strip when opening. */
  @Input() initialFiles: PendingFile[] = [];

  /**
   * Optional MongoDB thread ID — when provided, loads the historical
   * conversation from the backend so the user can review past messages.
   */
  @Input() threadId = '';

  /**
   * When the operation is in `awaiting_input` state, the shell passes
   * its yield state so the action card renders at the bottom of the thread.
   */
  @Input()
  set yieldState(value: AgentYieldState | null) {
    this.activeYieldState.set(value);
  }

  /**
   * Current operation status — when `'error'`, the failure banner is shown
   * after thread messages load so the user knows what happened.
   */
  @Input() operationStatus: 'processing' | 'complete' | 'error' | 'awaiting_input' | null = null;

  /**
   * Human-readable error description when `operationStatus === 'error'`.
   * Displayed inside the failure banner.
   */
  @Input() errorMessage: string | null = null;

  // ============================================
  // LOCAL STATE
  // ============================================

  /** Isolated message history for this operation context. */
  protected readonly messages = signal<OperationMessage[]>([]);

  /** Current user input value. */
  protected readonly inputValue = signal('');

  /** Whether an AI response is being generated. */
  protected readonly _loading = signal(false);

  /**
   * MongoDB thread ID resolved after the first message.
   * Captured from the SSE `event: thread` frame or HTTP response
   * and included in subsequent requests for conversation continuity.
   */
  private readonly _resolvedThreadId = signal<string | null>(null);

  /** Active yield state for this operation (set via input binding). */
  protected readonly activeYieldState = signal<AgentYieldState | null>(null);

  /** Whether the yield has been resolved (approved/replied). */
  protected readonly yieldResolved = signal(false);

  /** Agent X SVG logo path data for inline icon rendering. */
  protected readonly agentXLogoPath: string = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon: string = AGENT_X_LOGO_POLYGON;

  /** Test IDs for failure banner elements. */
  protected readonly failureTestIds = AGENT_X_OPERATION_CHAT_TEST_IDS;

  /** Shared test IDs for the operation chat surface. */
  protected readonly chatTestIds = AGENT_X_OPERATION_CHAT_TEST_IDS;

  /** Comma-separated file types accepted by the hidden file input. */
  protected readonly acceptedFileTypes = AGENT_X_ALLOWED_MIME_TYPES.join(',');

  /** Whether this operation has failed — drives the failure banner. */
  protected readonly isFailed = computed(() => this.operationStatus === 'error');

  /** The failure message to display in the banner. */
  protected readonly failureMessage = computed(
    () => this.errorMessage || 'This operation encountered an error and could not complete.'
  );

  /** Whether a retry has been initiated (hides banner, shows confirmation). */
  protected readonly retryStarted = signal(false);

  /** Files staged for upload — displayed as previews above the input bar. */
  protected readonly pendingFiles = signal<PendingFile[]>([]);

  /** Pending files converted to AgentXPendingFile shape for prompt-input component. */
  protected readonly promptInputPendingFiles = computed<readonly AgentXPendingFile[]>(() =>
    this.pendingFiles().map((pf) => ({
      file: pf.file,
      previewUrl: pf.previewUrl,
      type: resolveAttachmentType(pf.file.type),
    }))
  );

  /** Whether a drag operation is hovering over the chat surface. */
  protected readonly isDragActive = signal(false);

  /** Whether to show the persistent "Agent X is thinking" indicator. */
  protected readonly showThinking = computed(() => {
    if (this.contextType !== 'operation') return false;
    if (this.operationStatus !== 'processing') return false;
    if (this.activeYieldState()) return false;
    // Don't show if the last message is already an assistant reply (thread loaded real content)
    const msgs = this.messages();
    if (msgs.length === 0) return true;
    const last = msgs[msgs.length - 1];
    return last.role !== 'assistant' || !!last.isTyping;
  });

  /** Whether this is a background operation (vs a quick command). */
  protected get isOperation(): boolean {
    return this.contextType === 'operation';
  }

  /** Whether the welcome message and quick option chips are visible (commands only). */
  protected readonly showWelcome = computed(
    () =>
      !this._isThreadMode() &&
      this.contextType !== 'operation' &&
      this.normalizedQuickActions().length > 0 &&
      !this.hasUserSent()
  );

  /** Welcome message content derived from coordinator description or a generated fallback. */
  protected readonly welcomeMessage = computed(() => {
    if (this.contextDescription) return this.contextDescription;
    const title = this.contextTitle || 'Agent X';
    return `You're now talking to ${title}. How can I help you today?`;
  });

  /** Normalized quick actions — uses provided actions, fills with fallbacks if needed. Operations get none. */
  protected readonly normalizedQuickActions = computed<OperationQuickAction[]>(() => {
    // Operations skip straight to work — no chatbot-style suggestion pills
    if (this.contextType === 'operation') return [];

    const provided = this.quickActions.map((a, index) => ({
      ...a,
      id: a.id || `cmd-${index + 1}`,
    }));

    if (provided.length > 0) return provided;

    return this.getFallbackActions().map((item, index) => ({
      id: `fallback-${index + 1}`,
      icon: this.contextIcon,
      ...item,
    }));
  });

  /** Quick actions chunked into rows of 4 for mobile horizontal-scroll layout. */
  protected readonly quickActionRows = computed<OperationQuickAction[][]>(() => {
    const all = this.normalizedQuickActions();
    const rows: OperationQuickAction[][] = [];
    for (let i = 0; i < all.length; i += 4) {
      rows.push(all.slice(i, i + 4));
    }
    return rows;
  });

  /** Scheduled actions chunked into rows of 4 for mobile horizontal-scroll layout. */
  protected readonly scheduledActionRows = computed<OperationQuickAction[][]>(() => {
    const all = this.scheduledActions;
    if (!all || all.length === 0) return [];
    const rows: OperationQuickAction[][] = [];
    for (let i = 0; i < all.length; i += 4) {
      rows.push(all.slice(i, i + 4));
    }
    return rows;
  });

  protected resolveCoordinatorChipId(action: OperationQuickAction): string | null {
    if (!action.id.startsWith('coord-')) return null;
    return action.id.startsWith('coord-coord-') ? action.id.slice('coord-'.length) : action.id;
  }

  /** Tracks whether the user has sent at least one message. */
  private readonly hasUserSent = signal(false);

  /** Emitted when the user sends their first message (briefing should hide). */
  readonly userMessageSent = output<void>();

  /** Emitted after a chat response completes (stream done or HTTP returned). */
  readonly responseComplete = output<void>();

  /** Emitted when the user approves a draft email card (HITL send). */
  readonly draftSubmitted = output<DraftSubmittedEvent>();

  /** Emitted when a coordinator chip should open a dedicated coordinator context. */
  readonly coordinatorQuickActionSelected = output<OperationQuickAction>();

  /** Whether this chat was opened to view a historical thread (suppresses generic welcome). */
  private readonly _isThreadMode = signal(false);

  /** Whether the send button should be enabled. */
  protected readonly canSend = computed(
    () =>
      (this.inputValue().trim().length > 0 || this.pendingFiles().length > 0) && !this._loading()
  );

  /** Human-readable label for the context type badge. */
  protected readonly contextTypeLabel = computed(() => {
    if (this.contextType !== 'operation') return 'Quick Command';
    return this.isFailed() ? 'Failed Operation' : 'Active Operation';
  });

  /**
   * Short header title — truncates to ~5 words for a professional look.
   * Strips trailing emojis and keeps only the first few words.
   */
  protected readonly headerTitle = computed(() => {
    const raw = this.contextTitle || 'Agent X';
    // Strip trailing emoji sequences
    const cleaned = raw.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]+$/gu, '').trim();
    const words = cleaned.split(/\s+/);
    if (words.length <= 5) return cleaned;
    return words.slice(0, 5).join(' ');
  });

  // ============================================
  // VIEW CHILDREN
  // ============================================

  private readonly messagesArea = viewChild<ElementRef>('messagesArea');
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly actionCardRef = viewChild<AgentXActionCardComponent>('actionCard');

  constructor() {
    // When the component is destroyed (e.g. session switch), detach from the
    // stream registry instead of aborting. The stream continues running in the
    // background and buffers its output. When the user returns to this session,
    // the component remounts and rehydrates from the buffer.
    this.destroyRef.onDestroy(() => {
      const threadId = this._resolvedThreadId();
      // Always detach listener to prevent dangling references on
      // completed entries (detach is a no-op if no entry exists).
      if (threadId) {
        this.streamRegistry.detach(threadId);
      }
      // Only abort the raw controller when there is NO active stream
      // in the registry — an active stream should survive the
      // component lifecycle and keep buffering in the registry.
      if (!threadId || !this.streamRegistry.hasActiveStream(threadId)) {
        this.activeStream?.abort();
      }
      this.activeStream = null;
    });

    // Auto-scroll when messages change
    effect(() => {
      const msgs = this.messages();
      if (msgs.length > 0) {
        this.scrollToBottom();
      }
    });

    // Auto-scroll when an action card appears (yield state set)
    effect(() => {
      if (this.activeYieldState()) {
        this.scrollToBottom();
      }
    });
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  /** Auto-send the initial message if provided. */
  private initialMessageSent = false;

  ngAfterViewInit(): void {
    // If opening an existing operation/thread, check for an active stream first.
    if (this.threadId?.trim()) {
      this._isThreadMode.set(true);
      this._resolvedThreadId.set(this.threadId.trim());

      // ── Rehydrate from stream registry (session switch recovery) ──────
      // If the user switched away while a stream was running, the registry
      // kept it alive. Claim it now to get buffered state + live updates.
      const snapshot = this.streamRegistry.claim(this.threadId.trim(), {
        onDelta: (text) => {
          this.messages.update((msgs) =>
            msgs.map((m) => {
              if (m.id !== 'typing') return m;
              // Rebuild parts for live updates
              const prevParts = [...(m.parts ?? [])];
              const last = prevParts[prevParts.length - 1];
              if (last?.type === 'text') {
                prevParts[prevParts.length - 1] = { type: 'text', content: last.content + text };
              } else {
                prevParts.push({ type: 'text', content: text });
              }
              return { ...m, content: m.content + text, isTyping: false, parts: prevParts };
            })
          );
        },
        onStep: (step) => {
          this.messages.update((msgs) =>
            msgs.map((m) => {
              if (m.id !== 'typing') return m;
              const prev = m.steps ?? [];
              const idx = prev.findIndex((s) => s.id === step.id);
              const next = idx >= 0 ? prev.map((s, i) => (i === idx ? step : s)) : [...prev, step];
              // Rebuild parts for live updates
              const prevParts = [...(m.parts ?? [])];
              const lastPart = prevParts[prevParts.length - 1];
              if (lastPart?.type === 'tool-steps') {
                const prevSteps = [...lastPart.steps];
                const si = prevSteps.findIndex((s) => s.id === step.id);
                if (si >= 0) {
                  prevSteps[si] = step;
                } else {
                  prevSteps.push(step);
                }
                prevParts[prevParts.length - 1] = { type: 'tool-steps', steps: prevSteps };
              } else {
                prevParts.push({ type: 'tool-steps', steps: [step] });
              }
              return { ...m, steps: next, parts: prevParts };
            })
          );
        },
        onCard: (card) => {
          this.messages.update((msgs) =>
            msgs.map((m) => {
              if (m.id !== 'typing') return m;
              const prevParts = [...(m.parts ?? [])];
              prevParts.push({ type: 'card', card });
              return { ...m, cards: [...(m.cards ?? []), card], parts: prevParts };
            })
          );
        },
        onDone: () => {
          const finalId = this.uid();
          this.messages.update((msgs) =>
            msgs.map((m) => (m.id === 'typing' ? { ...m, id: finalId, isTyping: false } : m))
          );
          this._loading.set(false);
          this.haptics.notification('success').catch(() => undefined);
          this.responseComplete.emit();
        },
        onError: (error) => {
          this.replaceTyping({
            id: this.uid(),
            role: 'assistant',
            content: error || 'Something went wrong. Please try again.',
            timestamp: new Date(),
            error: true,
          });
          this._loading.set(false);
          this.haptics.notification('error').catch(() => undefined);
        },
      });

      if (snapshot) {
        this.logger.info('Rehydrating from stream registry', {
          threadId: this.threadId.trim(),
          contentLength: snapshot.content.length,
          done: snapshot.done,
        });

        // Load persisted messages first, then append any in-flight streaming
        // state. We read a FRESH snapshot after the async load because deltas
        // may have arrived while the HTTP request was in flight — the claim-time
        // snapshot would be stale.
        void this.loadThreadMessages(this.threadId.trim()).then(() => {
          const fresh = this.streamRegistry.getSnapshot(this.threadId.trim());
          if (!fresh) return; // Entry pruned or aborted during load

          if (fresh.done) {
            // Stream completed — MongoDB should already have the final assistant
            // message. Only append if it errored (errors aren't persisted as
            // standard chat messages).
            if (fresh.error) {
              this.messages.update((msgs) => [
                ...msgs,
                {
                  id: this.uid(),
                  role: 'assistant' as const,
                  content: fresh.error || 'Something went wrong.',
                  timestamp: new Date(),
                  error: true,
                },
              ]);
            }
            return;
          }

          // Stream still active — append buffered content as a typing indicator.
          // fresh.content is up-to-date (includes deltas that arrived during load).
          if (fresh.content || fresh.steps.length || fresh.cards.length) {
            this.messages.update((msgs) => [
              ...msgs,
              {
                id: 'typing',
                role: 'assistant' as const,
                content: fresh.content,
                timestamp: new Date(),
                isTyping: !fresh.content, // dots if no text yet, text otherwise
                steps: fresh.steps.length > 0 ? [...fresh.steps] : undefined,
                cards: fresh.cards.length > 0 ? [...fresh.cards] : undefined,
                parts: fresh.parts.length > 0 ? [...fresh.parts] : undefined,
              },
            ]);
          }
          this._loading.set(true);
        });
        return;
      }

      // No active stream — load from MongoDB as before
      void this.loadThreadMessages(this.threadId.trim());
      return;
    }

    // If the operation failed but has no thread, still show the failure context.
    if (this.operationStatus === 'error') {
      this._isThreadMode.set(true);
      this.injectFailureMessage();
      return;
    }

    // Seed initial files if provided (from shell pending files)
    if (this.initialFiles.length > 0) {
      this.pendingFiles.set([...this.initialFiles]);
    }

    if ((this.initialMessage?.trim() || this.initialFiles.length > 0) && !this.initialMessageSent) {
      this.initialMessageSent = true;
      // Slight delay to let the sheet animation settle
      setTimeout(() => {
        if (this.initialMessage?.trim()) {
          this.inputValue.set(this.initialMessage.trim());
        }
        this.send();
      }, 150);
    }
  }

  /**
   * Load a historical thread into this isolated operation chat view.
   * Preserves the operation sheet UX while showing the persisted conversation.
   */
  private async loadThreadMessages(threadId: string): Promise<void> {
    this._loading.set(true);
    this.logger.info('Loading operation thread', { threadId, contextId: this.contextId });

    try {
      const items = await this.agentXService.getPersistedThreadMessages(threadId);

      if (!items.length) {
        this.logger.warn('Operation thread returned no messages', {
          threadId,
          contextId: this.contextId,
        });
        // Even with no messages, if the operation failed inject the error context
        if (this.operationStatus === 'error') {
          this.injectFailureMessage();
        }
        return;
      }

      const mapped: OperationMessage[] = items.map((msg) => {
        // Convert persisted toolCalls into AgentXToolStep[] for the chat bubble
        const steps: AgentXToolStep[] = (msg.toolCalls ?? []).map((tc, idx) => ({
          id: `tc-${idx}-${tc.toolName}`,
          label: tc.toolName.replace(/_/g, ' '),
          status: tc.status === 'success' ? ('success' as const) : ('error' as const),
          detail:
            tc.status === 'error' && tc.output?.['error']
              ? String(tc.output['error'])
              : tc.status === 'success'
                ? `${tc.toolName.replace(/_/g, ' ')} completed`
                : undefined,
        }));

        return {
          id: msg.id ?? this.uid(),
          role: msg.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: msg.content,
          timestamp: msg.createdAt ? new Date(msg.createdAt) : new Date(),
          ...(steps.length > 0 ? { steps } : {}),
          ...(typeof msg.resultData?.['imageUrl'] === 'string'
            ? { imageUrl: msg.resultData['imageUrl'] as string }
            : {}),
          ...(typeof msg.resultData?.['videoUrl'] === 'string'
            ? { videoUrl: msg.resultData['videoUrl'] as string }
            : {}),
        };
      });

      this.messages.set(mapped);
      const hadUser = mapped.some((msg) => msg.role === 'user');
      if (hadUser && !this.hasUserSent()) {
        this.hasUserSent.set(true);
        this.userMessageSent.emit();
      }
      this.logger.info('Operation thread loaded', {
        threadId,
        contextId: this.contextId,
        messageCount: mapped.length,
      });

      // If this operation has failed, inject an AI error message at the end
      // so the user understands what happened.
      if (this.operationStatus === 'error') {
        this.injectFailureMessage();
      }
    } catch (err) {
      this.logger.error('Failed to load operation thread', err, {
        threadId,
        contextId: this.contextId,
      });
      this.pushMessage({
        id: this.uid(),
        role: 'assistant',
        content: 'Failed to load this conversation. You can still continue here.',
        timestamp: new Date(),
        error: true,
      });
    } finally {
      this._loading.set(false);
    }
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /** Dismiss the bottom sheet. */
  async dismiss(): Promise<void> {
    if (this.embedded) return;
    await this.modalCtrl.dismiss(undefined, 'close');
  }

  /**
   * Retry the failed operation by re-enqueuing the same intent.
   * Shows a confirmation message and re-queues the job.
   */
  protected async onRetry(): Promise<void> {
    this.logger.info('Retrying failed operation', { contextId: this.contextId });
    this.breadcrumb.trackUserAction('operation-retry', { operationId: this.contextId });
    await this.haptics.impact('medium');

    this.retryStarted.set(true);

    const result = await this.jobService.retryOperation(this.contextId, this.contextTitle);

    if (result) {
      await this.haptics.notification('success');
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_RETRIED, {
        originalOperationId: this.contextId,
        newOperationId: result.operationId,
        source: 'operation-chat',
      });
      this.logger.info('Retry enqueued', {
        originalId: this.contextId,
        newOperationId: result.operationId,
      });
    } else {
      await this.haptics.notification('error');
      this.retryStarted.set(false);
      this.pushMessage({
        id: this.uid(),
        role: 'assistant',
        content:
          'Sorry, I couldn\u2019t restart this operation right now. Please try again in a moment.',
        timestamp: new Date(),
        error: true,
      });
    }
  }

  /**
   * Cancel the active SSE stream (if any) and reset loading state.
   * Bound to the stop button in the input bar.
   *
   * This performs four actions:
   * 1. Aborts the frontend fetch (drops the SSE connection).
   * 2. Fires an explicit POST to /cancel/:operationId (belt-and-suspenders).
   * 3. Transitions any in-flight tool steps from 'active' → 'error' with
   *    a "Cancelled" label so the UI stops showing spinners immediately.
   * 4. Resets the loading flag.
   */
  cancelStream(): void {
    // ✅ ACTION 1: Abort via registry (cleans up buffer + SSE connection)
    const threadId = this._resolvedThreadId();
    if (threadId) {
      this.streamRegistry.abort(threadId);
    }

    if (this.activeStream) {
      this.activeStream.abort();
      this.activeStream = null;
    }

    // ✅ ACTION 2: Notify backend explicitly (belt-and-suspenders)
    if (this._currentOperationId) {
      const opId = this._currentOperationId;
      this._currentOperationId = null;
      this._fireCancelRequest(opId);
    }

    // ✅ ACTION 3: Transition 'active' tool steps to 'error' (show "Cancelled")
    this.messages.update((msgs) =>
      msgs.map((m) => {
        const hasActiveSteps = m.steps?.some((s) => s.status === 'active');
        const hasActiveParts = m.parts?.some(
          (p) => p.type === 'tool-steps' && p.steps.some((s) => s.status === 'active')
        );
        if (!hasActiveSteps && !hasActiveParts) return m;

        const cancelStep = (s: AgentXToolStep): AgentXToolStep =>
          s.status === 'active' ? { ...s, status: 'error', label: 'Cancelled' } : s;

        return {
          ...m,
          isTyping: false,
          steps: m.steps?.map(cancelStep),
          parts: m.parts?.map((p) =>
            p.type === 'tool-steps' ? { ...p, steps: p.steps.map(cancelStep) } : p
          ),
        };
      })
    );

    // ✅ ACTION 4: Reset loading state
    this._loading.set(false);
    this.logger.info('Stream cancelled by user');
    this.breadcrumb.trackStateChange('agent-x-operation-chat:stream-cancelled', {
      contextId: this.contextId,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_STREAM_CANCELLED, {
      threadId: threadId ?? undefined,
      contextId: this.contextId,
      contextType: this.contextType,
    });
  }

  /**
   * Fire-and-forget POST to explicit cancel endpoint.
   * Non-critical — the SSE drop is the primary path; this is belt-and-suspenders.
   * @internal
   */
  private _fireCancelRequest(operationId: string): void {
    const url = `${this.baseUrl}/agent-x/cancel/${operationId}`;
    this.getAuthToken?.()
      .then((token) => {
        if (!token) return;
        return firstValueFrom(
          this.http.post(url, {}, { headers: { Authorization: `Bearer ${token}` } })
        );
      })
      .catch((err) => {
        this.logger.debug('Explicit cancel request failed (non-critical)', {
          operationId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }

  /** Send the current input as a user message. */
  async send(): Promise<void> {
    const text = this.inputValue().trim();
    const files = this.pendingFiles();
    if ((!text && files.length === 0) || this._loading()) return;

    this.inputValue.set('');
    if (!this.hasUserSent()) {
      this.hasUserSent.set(true);
      this.userMessageSent.emit();
    }

    // Build display content
    let displayContent = text;
    if (files.length > 0 && text) {
      displayContent = text;
    } else if (files.length > 0) {
      displayContent = `📎 ${files.length} file${files.length > 1 ? 's' : ''}`;
    }

    // Build display attachments from ALL pending files (images, videos, AND docs)
    const displayAttachments: MessageAttachment[] = files.map((f) => ({
      url: f.previewUrl ?? '',
      type: f.isImage ? ('image' as const) : f.isVideo ? ('video' as const) : ('doc' as const),
      name: f.file.name,
    }));

    // Clear pending state without revoking URLs (they're now owned by the message)
    this.pendingFiles.set([]);

    // Append user message
    this.pushMessage({
      id: this.uid(),
      role: 'user',
      content: displayContent,
      timestamp: new Date(),
      ...(displayAttachments.length > 0 ? { attachments: displayAttachments } : {}),
    });

    // Show typing indicator
    this.pushMessage({
      id: 'typing',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isTyping: true,
    });
    this._loading.set(true);

    try {
      // Upload files to Firebase Storage and get AgentXAttachment metadata
      let uploadedAttachments: AgentXAttachment[] = [];
      if (files.length > 0) {
        const authToken = await this.getAuthToken?.().catch(() => null);
        if (authToken) {
          uploadedAttachments = await this._uploadFiles(files, authToken);
        } else {
          this.logger.warn('No auth token — files will not be sent to AI', {
            count: files.length,
          });
        }
      }

      await this.callAgentChat(displayContent, uploadedAttachments);
      await this.haptics.notification('success');
      this.responseComplete.emit();
    } catch (err) {
      this.logger.error('Chat message failed', err, { contextId: this.contextId });
      await this.haptics.notification('error');
      this.replaceTyping({
        id: this.uid(),
        role: 'assistant',
        content: 'Something went wrong. Please try again.',
        timestamp: new Date(),
        error: true,
      });
    } finally {
      this._loading.set(false);
    }
  }

  /** Handle a quick action chip tap — auto-sends as user message. */
  async onQuickAction(action: OperationQuickAction): Promise<void> {
    if (this.delegateCoordinatorQuickActions && this.resolveCoordinatorChipId(action)) {
      this.coordinatorQuickActionSelected.emit(action);
      return;
    }

    this.inputValue.set(action.label);
    await this.send();
  }

  /** Open native file picker from the shared input plus button. */
  protected onUploadClick(): void {
    this.fileInput()?.nativeElement.click();
  }

  /** Toggle the drag overlay while files hover over the chat surface. */
  protected onDragStateChange(active: boolean): void {
    this.isDragActive.set(active);
  }

  /** Stage files dropped anywhere in the chat area. */
  protected async onFilesDropped(files: File[]): Promise<void> {
    const addedCount = this.stageFiles(files);
    this.isDragActive.set(false);

    if (addedCount === 0) {
      return;
    }

    await this.haptics.impact('light');
    this.logger.info('Files dropped into operation chat', {
      contextId: this.contextId,
      count: addedCount,
    });
    this.breadcrumb.trackUserAction('agent-x-files-dropped', {
      contextId: this.contextId,
      count: addedCount,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_FILES_DROPPED, {
      contextId: this.contextId,
      contextType: this.contextType,
      count: addedCount,
    });
  }

  /** Handle selected files/images — stage them as pending previews above input. */
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.stageFiles(files);
    input.value = '';
  }

  /** Remove a staged file from the pending preview strip. */
  protected removePendingFile(index: number): void {
    this.pendingFiles.update((prev) => {
      const removed = prev[index];
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  /**
   * Upload pending files to Firebase Storage via the backend upload endpoint.
   * Returns AgentXAttachment metadata for inclusion in the chat request.
   * @internal
   */
  private async _uploadFiles(
    files: readonly PendingFile[],
    authToken: string
  ): Promise<AgentXAttachment[]> {
    const uploaded: AgentXAttachment[] = [];

    for (const pending of files) {
      const formData = new FormData();
      formData.append('file', pending.file);

      const response = await fetch(`${this.baseUrl}${AGENT_X_ENDPOINTS.UPLOAD}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Upload failed');
        this.logger.error('File upload failed', errText, {
          name: pending.file.name,
          status: response.status,
        });
        continue; // Skip failed files, still send the rest
      }

      const result = (await response.json()) as {
        success: boolean;
        data?: { url: string; name: string; mimeType: string; sizeBytes: number };
        error?: string;
      };

      if (!result.success || !result.data) {
        this.logger.error('File upload returned error', result.error, {
          name: pending.file.name,
        });
        continue;
      }

      uploaded.push({
        id: crypto.randomUUID(),
        url: result.data.url,
        name: result.data.name,
        mimeType: result.data.mimeType,
        type: resolveAttachmentType(result.data.mimeType),
        sizeBytes: result.data.sizeBytes,
      });
    }

    this.logger.info('Files uploaded for operation chat', {
      attempted: files.length,
      succeeded: uploaded.length,
    });

    return uploaded;
  }

  /** Open the media viewer for a pending file thumbnail. */
  protected openPendingFileViewer(index: number): void {
    const mediaItems: MediaViewerItem[] = this.pendingFiles()
      .filter((pf) => pf.previewUrl || (!pf.isImage && !pf.isVideo))
      .map((pf) => {
        if (pf.isImage || pf.isVideo) {
          return {
            url: pf.previewUrl!,
            type: (pf.isVideo ? 'video' : 'image') as 'image' | 'video' | 'doc',
            alt: pf.file.name,
          };
        }
        return {
          url: pf.previewUrl || URL.createObjectURL(pf.file),
          type: 'doc' as const,
          name: pf.file.name,
          size: pf.file.size,
        };
      });

    if (!mediaItems.length) return;

    // Map the pending-file index to the viewer index
    const viewableFiles = this.pendingFiles().filter(
      (pf) => pf.previewUrl || (!pf.isImage && !pf.isVideo)
    );
    const target = this.pendingFiles()[index];
    const mediaIndex = target ? viewableFiles.indexOf(target) : 0;

    this.mediaViewer.open({
      items: mediaItems,
      initialIndex: Math.max(0, mediaIndex),
      showShare: false,
      source: 'agent-x-pending',
    });
  }

  /** Open the media viewer for a sent message attachment thumbnail. */
  protected openAttachmentViewer(attachments: readonly MessageAttachment[], index: number): void {
    const mediaItems: MediaViewerItem[] = attachments.map((att) => {
      if (att.type === 'image' || att.type === 'video') {
        return {
          url: att.url,
          type: att.type as 'image' | 'video',
          alt: att.name,
        };
      }
      return {
        url: att.url,
        type: 'doc' as const,
        name: att.name,
      };
    });

    if (!mediaItems.length) return;

    this.mediaViewer.open({
      items: mediaItems,
      initialIndex: Math.max(0, Math.min(index, mediaItems.length - 1)),
      source: 'agent-x-chat',
    });
  }

  /** Revoke all pending file object URLs (cleanup). */
  private _clearPendingFiles(): void {
    const files = this.pendingFiles();
    for (const pf of files) {
      if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl);
    }
    this.pendingFiles.set([]);
  }

  private stageFiles(files: readonly File[]): number {
    if (files.length === 0) {
      return 0;
    }

    const currentCount = this.pendingFiles().length;
    const nextPending: PendingFile[] = [];

    for (const file of files) {
      if (currentCount + nextPending.length >= AGENT_X_MAX_ATTACHMENTS) {
        this.toast.error(`Maximum ${AGENT_X_MAX_ATTACHMENTS} attachments allowed`);
        this.logger.warn('Rejected file because attachment limit was reached', {
          contextId: this.contextId,
          fileName: file.name,
        });
        break;
      }

      if (!AGENT_X_ALLOWED_MIME_TYPES.includes(file.type)) {
        this.toast.error(`Unsupported file type: ${file.name}`);
        this.logger.warn('Rejected unsupported operation chat file type', {
          contextId: this.contextId,
          fileName: file.name,
          mimeType: file.type,
        });
        continue;
      }

      if (file.size > AGENT_X_MAX_FILE_SIZE) {
        this.toast.error(`File too large: ${file.name} (max 20 MB)`);
        this.logger.warn('Rejected oversized operation chat file', {
          contextId: this.contextId,
          fileName: file.name,
          sizeBytes: file.size,
        });
        continue;
      }

      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      nextPending.push({
        file,
        previewUrl:
          (isImage || isVideo) && isPlatformBrowser(this.platformId)
            ? URL.createObjectURL(file)
            : null,
        isImage,
        isVideo,
      });
    }

    if (nextPending.length === 0) {
      return 0;
    }

    this.pendingFiles.update((prev) => [...prev, ...nextPending]);
    this.logger.debug('Files staged in operation chat', {
      contextId: this.contextId,
      count: nextPending.length,
      types: nextPending.map((pending) => resolveAttachmentType(pending.file.type)),
    });
    return nextPending.length;
  }

  ngOnDestroy(): void {
    this._clearPendingFiles();
  }

  /** Returns true when a message contains a data-table rich card (cards or parts). */
  protected msgHasDataTable(msg: OperationMessage): boolean {
    if (msg.cards?.some((c) => c.type === 'data-table')) return true;
    if (msg.parts?.some((p) => p.type === 'card' && p.card.type === 'data-table')) return true;
    return false;
  }

  /** File extension → colour (returns rgba string). */
  protected getFileColor(filename: string, alpha: number): string {
    const ext = this.getFileExt(filename).toLowerCase();
    const colors: Record<string, string> = {
      pdf: '239, 68, 68', // red
      doc: '59, 130, 246', // blue
      docx: '59, 130, 246',
      xls: '34, 197, 94', // green
      xlsx: '34, 197, 94',
      ppt: '249, 115, 22', // orange
      pptx: '249, 115, 22',
      txt: '148, 163, 184', // gray
      csv: '34, 197, 94',
      zip: '168, 85, 247', // purple
      rar: '168, 85, 247',
    };
    const rgb = colors[ext] ?? '148, 163, 184';
    return `rgba(${rgb}, ${alpha})`;
  }

  /** Extract uppercase extension from filename. */
  protected getFileExt(filename: string): string {
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex < 0) return 'FILE';
    return filename.slice(dotIndex + 1).toUpperCase();
  }

  /** Format bytes to human-readable size. */
  protected formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private getFallbackActions(): Pick<OperationQuickAction, 'label' | 'description'>[] {
    if (this.contextType === 'operation') {
      return [
        { label: 'Status', description: 'Check current progress and updates' },
        { label: 'Progress', description: 'View detailed completion breakdown' },
        { label: 'Refine', description: 'Adjust parameters and improve results' },
        { label: 'Boost Quality', description: 'Enhance output with extra processing' },
        { label: 'Set Priority', description: 'Change urgency and processing order' },
        { label: 'Notify Me', description: 'Get alerted when this is done' },
        { label: 'Pause', description: 'Temporarily hold this operation' },
        { label: 'Export', description: 'Download or share the results' },
      ];
    }

    return [
      { label: 'Create Plan', description: 'Build a step-by-step action plan' },
      { label: 'Generate Draft', description: 'Get a first draft ready to review' },
      { label: 'Refine Output', description: 'Polish and improve existing work' },
      { label: 'Next Steps', description: 'See recommended follow-up actions' },
      { label: 'Best Version', description: 'Optimize for the highest quality' },
      { label: 'Publish Ready', description: 'Finalize and prepare to share' },
      { label: 'Save Draft', description: 'Store your progress for later' },
      { label: 'Share', description: 'Send results to your team' },
    ];
  }

  /**
   * Send user message to backend Agent X chat.
   *
   * Uses real SSE streaming (via `createAgentXApi.streamMessage`) when running
   * in a browser with an available auth token. Tokens are appended to the
   * typing-indicator message in real time via `onDelta`, producing a fluid
   * "typing" effect.
   *
   * Falls back to a standard HTTP POST when streaming is unavailable
   * (SSR, missing auth token, mobile Capacitor without ReadableStream).
   */
  private async callAgentChat(
    userInput: string,
    attachments: AgentXAttachment[] = []
  ): Promise<void> {
    // Build conversation history from local messages (exclude typing indicators and empty content)
    const request = {
      message: userInput,
      history: this.messages()
        .filter((m) => !m.isTyping && m.role !== 'system' && m.content.trim().length > 0)
        .slice(-10)
        .map((m) => ({
          id: this.uid(),
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(),
        })),
      ...(this._resolvedThreadId() ? { threadId: this._resolvedThreadId()! } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    } satisfies AgentXChatRequest;

    // ── SSE streaming path ────────────────────────────────────────────
    const authToken = await this.getAuthToken?.().catch(() => null);

    this.breadcrumb.trackStateChange('agent-x-operation-chat:sending', {
      contextId: this.contextId,
      streaming: !!(authToken && isPlatformBrowser(this.platformId)),
    });

    if (authToken && isPlatformBrowser(this.platformId)) {
      await this._sendViaStream(request, authToken);
    } else {
      // ── Fallback: standard HTTP POST (SSR / mobile / no token) ─────
      await this._sendViaHttp(request);
    }
  }

  /**
   * SSE streaming path — connects via raw fetch + ReadableStream.
   * Appends tokens to the typing-indicator message in real time.
   *
   * Registers the stream with the StreamRegistry so it survives component
   * destroy (session switch). The registry buffers output and forwards live
   * updates to whichever component instance currently owns the UI.
   * @internal
   */
  private _sendViaStream(request: AgentXChatRequest, authToken: string): Promise<void> {
    // Cancel any previous in-flight stream (via registry or raw controller)
    const prevThreadId = this._resolvedThreadId();
    if (prevThreadId) {
      this.streamRegistry.abort(prevThreadId);
    }
    this.activeStream?.abort();
    this.activeStream = null;

    const streamingId = 'typing'; // The ID used by the existing typing indicator

    return new Promise<void>((resolve, reject) => {
      // Mutable parts accumulator — builds Copilot-style interleaved sequence
      const parts: AgentXMessagePart[] = [];

      this.activeStream = this.api.streamMessage(
        request,
        {
          onThread: (evt) => {
            this._resolvedThreadId.set(evt.threadId);
            // Store operation ID for explicit cancellation support
            if (evt.operationId) this._currentOperationId = evt.operationId;
            this.logger.debug('Stream thread resolved', { threadId: evt.threadId });

            // Register with the stream registry now that we have a threadId.
            // This MUST happen here (not earlier) because we need the threadId
            // for the registry key, and the AbortController for cleanup.
            if (this.activeStream) {
              this.streamRegistry.register(evt.threadId, this.activeStream);
            }
          },

          onDelta: (evt) => {
            const tid = this._resolvedThreadId();
            if (tid) this.streamRegistry.appendDelta(tid, evt.content);

            // Build interleaved parts: append to last text part or start new one
            const last = parts[parts.length - 1];
            if (last?.type === 'text') {
              parts[parts.length - 1] = { type: 'text', content: last.content + evt.content };
            } else {
              parts.push({ type: 'text', content: evt.content });
            }

            // Append the new token to the typing indicator in-place
            this.messages.update((msgs) =>
              msgs.map((m) =>
                m.id === streamingId
                  ? { ...m, content: m.content + evt.content, isTyping: false, parts: [...parts] }
                  : m
              )
            );
          },

          onStep: (evt: AgentXStreamStepEvent) => {
            const step: AgentXToolStep = {
              id: evt.id,
              label: evt.label,
              status: evt.status,
              detail: evt.detail,
            };
            const tid = this._resolvedThreadId();
            if (tid) this.streamRegistry.upsertStep(tid, step);

            // Bridge write_intel tool steps to IntelService so the Intel tab
            // shows the generating animation exactly when the agent is writing.
            this.intelService?.notifyToolStep(evt.id, evt.label, evt.status, evt.detail);

            // Build interleaved parts: upsert into last tool-steps group or start new one
            const lastPart = parts[parts.length - 1];
            if (lastPart?.type === 'tool-steps') {
              const prevSteps = [...lastPart.steps];
              const idx = prevSteps.findIndex((s) => s.id === evt.id);
              if (idx >= 0) {
                prevSteps[idx] = step;
              } else {
                prevSteps.push(step);
              }
              parts[parts.length - 1] = { type: 'tool-steps', steps: prevSteps };
            } else {
              parts.push({ type: 'tool-steps', steps: [step] });
            }

            this.messages.update((msgs) =>
              msgs.map((m) => {
                if (m.id !== streamingId) return m;
                const prev = m.steps ?? [];
                const idx = prev.findIndex((s) => s.id === evt.id);
                const next =
                  idx >= 0 ? prev.map((s, i) => (i === idx ? step : s)) : [...prev, step];
                return { ...m, steps: next, parts: [...parts] };
              })
            );
          },

          onCard: (evt: AgentXStreamCardEvent) => {
            const card: AgentXRichCard = { type: evt.type, title: evt.title, payload: evt.payload };
            const tid = this._resolvedThreadId();
            if (tid) this.streamRegistry.appendCard(tid, card);

            // When the card supersedes preceding streamed text (e.g. ask_user),
            // wipe all accumulated text parts so the question only appears once.
            if (evt.clearText) {
              parts.length = 0;
            }

            // Each card is its own part in the interleaved sequence
            parts.push({ type: 'card', card });

            this.messages.update((msgs) =>
              msgs.map((m) =>
                m.id === streamingId
                  ? {
                      ...m,
                      // If the card supersedes streamed text, wipe it.
                      content: evt.clearText ? '' : m.content,
                      cards: [...(m.cards ?? []), card],
                      parts: [...parts],
                    }
                  : m
              )
            );
          },

          onOperation: (evt) => {
            if (evt.operationId) {
              this._currentOperationId = evt.operationId;
            }
            if (evt.status === 'awaiting_input' && evt.yieldState) {
              this.activeYieldState.set(evt.yieldState);
              this.yieldResolved.set(false);
            }

            // Forward to the shared event service so the operations log sidebar
            // updates in real-time (in-progress spinner, complete, error states).
            this.operationEventService.emitOperationStatusUpdated(
              evt.threadId,
              evt.status,
              evt.timestamp
            );
          },

          onTitleUpdated: (evt) => {
            // Forward to the shared event service so the operations log sidebar
            // replaces "Processing…" with the auto-generated title instantly.
            this.operationEventService.emitTitleUpdated(evt.threadId, evt.title);
          },

          onPanel: (evt) => {
            this.agentXService.requestAutoOpenPanel(evt);
            this.logger.info('Forwarded panel event to AgentXService (immediate)', {
              type: evt.type,
            });
          },

          onMedia: (evt) => {
            // Insert a first-class image/video part so it renders immediately
            // (instead of waiting for the LLM to mention it in text).
            const mediaPart: AgentXMessagePart =
              evt.type === 'video'
                ? { type: 'video', url: evt.url }
                : { type: 'image', url: evt.url };
            parts.push(mediaPart);

            this.messages.update((msgs) =>
              msgs.map((m) => (m.id === streamingId ? { ...m, parts: [...parts] } : m))
            );
          },

          onDone: (evt) => {
            const tid = this._resolvedThreadId();
            if (tid) {
              this.streamRegistry.markDone(tid, {
                model: evt.model,
                threadId: evt.threadId,
                usage: evt.usage,
              });
            }

            // Freeze the final message — replace typing indicator with permanent ID
            const finalId = this.uid();
            this.messages.update((msgs) =>
              msgs.map((m) => (m.id === streamingId ? { ...m, id: finalId, isTyping: false } : m))
            );

            this.activeStream = null;
            this.breadcrumb.trackStateChange('agent-x-operation-chat:stream-complete', {
              contextId: this.contextId,
              model: evt.model,
            });
            this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_SENT, {
              contextType: this.contextType,
              contextId: this.contextId,
              streaming: true,
              model: evt.model,
            });
            // Surface autoOpenPanel instruction to the shell via the central service
            // (fallback — the panel SSE event should have already surfaced it)
            if (evt.autoOpenPanel && !this.agentXService.requestedSidePanel()) {
              this.agentXService.requestAutoOpenPanel(evt.autoOpenPanel);
              this.logger.info('Forwarded autoOpenPanel to AgentXService (done fallback)', {
                type: evt.autoOpenPanel.type,
              });
            }

            this.logger.info('Stream complete', {
              model: evt.model,
              outputTokens: evt.usage?.outputTokens,
              threadId: evt.threadId,
            });
            resolve();
          },

          onError: (evt) => {
            const tid = this._resolvedThreadId();
            if (tid) this.streamRegistry.markError(tid, evt.error);

            this.activeStream = null;

            // ── 402 billing gate → inject billing action card ──
            if (evt.status === 402) {
              const reason = this._mapBillingCode(evt.code);
              this._injectBillingCard(reason, evt.error);
              resolve(); // Resolved (not rejected) — user can act on the card
              return;
            }

            this.logger.error('Stream error', evt.error);
            this.breadcrumb.trackStateChange('agent-x-operation-chat:stream-error', {
              contextId: this.contextId,
            });
            this.replaceTyping({
              id: this.uid(),
              role: 'assistant',
              content: 'Something went wrong. Please try again.',
              timestamp: new Date(),
              error: true,
            });
            reject(new Error(evt.error));
          },
        },
        authToken,
        this.baseUrl
      );
    });
  }

  /**
   * Fallback HTTP POST path — used when streaming is unavailable.
   * @internal
   */
  private async _sendViaHttp(request: AgentXChatRequest): Promise<void> {
    try {
      const response = await this.api.sendMessage(request);

      if (response.success && response.message) {
        this.replaceTyping({
          id: response.message.id ?? this.uid(),
          role: 'assistant',
          content: response.message.content,
          timestamp: new Date(),
        });
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_SENT, {
          contextType: this.contextType,
          contextId: this.contextId,
          streaming: false,
        });
      } else {
        throw new Error(response.error ?? 'No response from Agent X');
      }
    } catch (httpErr: unknown) {
      // ── 402 billing gate → inject billing action card ──
      const status = (httpErr as { status?: number }).status;
      if (status === 402) {
        const body = (httpErr as { error?: { code?: string; error?: string } }).error;
        const reason = this._mapBillingCode(body?.code);
        this._injectBillingCard(reason, body?.error);
        return; // Handled — no rethrow
      }
      throw httpErr;
    }
  }

  /** Append a message to the local history. */
  private pushMessage(msg: OperationMessage): void {
    this.messages.update((prev) => [...prev, msg]);
  }

  /** Replace the typing indicator with a real message. */
  private replaceTyping(msg: OperationMessage): void {
    this.messages.update((prev) => [...prev.filter((m) => m.id !== 'typing'), msg]);
  }

  /** Scroll the messages area to the bottom. */
  private scrollToBottom(): void {
    const el = this.messagesArea()?.nativeElement;
    if (el) {
      // Scroll immediately without delay for instant keyboard response
      el.scrollTop = el.scrollHeight;
    }
  }

  // ============================================
  // ACTION CARD (HITL) HANDLERS
  // ============================================

  /** Handle billing card resolution (top-up completed, dismissed, etc.). */
  protected onBillingActionResolved(event: BillingActionResolvedEvent): void {
    this.logger.info('Billing action resolved (operation chat)', {
      reason: event.reason,
      completed: event.completed,
    });
    this.breadcrumb.trackUserAction('billing-card-resolved', {
      reason: event.reason,
      completed: event.completed,
      source: 'operation-chat',
    });

    if (event.completed) {
      this.pushMessage({
        id: this.uid(),
        role: 'system',
        content: '✅ Billing updated — you can resend your message.',
        timestamp: new Date(),
      });
    }
  }

  /** Handle draft approval through the shared approval-resolution pipeline. */
  protected onDraftSubmitted(event: DraftSubmittedEvent): void {
    this.logger.info('Draft email approved', {
      toEmail: event.toEmail,
      subject: event.subject?.slice(0, 50),
      approvalId: event.approvalId,
    });
    this.breadcrumb.trackUserAction('draft-email-approved', {
      toEmail: event.toEmail,
      source: 'operation-chat',
      approvalId: event.approvalId,
    });

    if (event.approvalId) {
      void this.agentXService.resolveInlineApproval({
        approvalId: event.approvalId,
        decision: 'approved',
        toolInput: {
          ...(event.toEmail ? { toEmail: event.toEmail } : {}),
          subject: event.subject,
          bodyHtml: event.content,
        },
        successMessage: 'Draft approved — Agent X is resuming',
      });
      return;
    }

    this.logger.warn('Inline draft card missing approvalId', {
      toEmail: event.toEmail,
      subject: event.subject?.slice(0, 50),
    });
    this.toast.error('This draft can no longer be sent directly. Refresh and try again.');
  }

  protected onConfirmationAction(event: ConfirmationActionEvent): void {
    if (!event.approvalId) {
      this.logger.warn('Inline confirmation action missing approvalId', {
        actionId: event.actionId,
      });
      return;
    }

    const decision =
      event.actionId === 'approve' ? 'approved' : event.actionId === 'reject' ? 'rejected' : null;

    if (!decision) {
      this.logger.warn('Unsupported inline confirmation action', {
        actionId: event.actionId,
        approvalId: event.approvalId,
      });
      return;
    }

    void this.agentXService.resolveInlineApproval({
      approvalId: event.approvalId,
      decision,
      successMessage:
        decision === 'approved' ? 'Approved — Agent X is resuming' : 'Request rejected',
    });
  }

  /** Route an ask_user card reply into the chat as a normal user message. */
  protected async onAskUserReply(event: AskUserReplyEvent): Promise<void> {
    this.logger.info('ask_user reply submitted', { threadId: event.threadId });
    this.inputValue.set(event.answer);
    await this.send();
  }

  /** Handle approval/rejection from the action card. */
  protected async onApproveAction(event: ActionCardApprovalEvent): Promise<void> {
    this.logger.info('Action card approval', {
      operationId: event.operationId,
      decision: event.decision,
    });
    this.breadcrumb.trackUserAction('action-card-approve', {
      operationId: event.operationId,
      decision: event.decision,
    });

    try {
      const success = await this.jobService.approveOperation(event.operationId, event.decision);
      if (success) {
        await this.haptics.notification('success');
        this.actionCardRef()?.markResolved(
          event.decision === 'approve' ? 'Approved — resuming' : 'Rejected — cancelled'
        );
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_APPROVED, {
          operationId: event.operationId,
          decision: event.decision,
          source: 'operation-chat',
        });
        // Brief delay to show resolved state before hiding
        setTimeout(() => {
          this.yieldResolved.set(true);
          this.pushMessage({
            id: this.uid(),
            role: 'system',
            content:
              event.decision === 'approve'
                ? '✅ Approved — Agent X is resuming the operation.'
                : '⛔ Rejected — Operation has been cancelled.',
            timestamp: new Date(),
          });
        }, 800);
      } else {
        this.logger.warn('Approve API returned false', { operationId: event.operationId });
        await this.haptics.notification('error');
        this.actionCardRef()?.markIdle();
      }
    } catch (err) {
      this.logger.error('Action card approval failed', err, { operationId: event.operationId });
      await this.haptics.notification('error');
      this.actionCardRef()?.markIdle();
    }
  }

  /** Handle text reply from the action card. */
  protected async onReplyAction(event: ActionCardReplyEvent): Promise<void> {
    this.logger.info('Action card reply', { operationId: event.operationId });
    this.breadcrumb.trackUserAction('action-card-reply', {
      operationId: event.operationId,
    });

    try {
      const activeYield = this.activeYieldState();
      const success =
        activeYield?.reason === 'needs_input'
          ? await this.resumeYieldedOperation(event.operationId, event.response)
          : await this.jobService.replyOperation(event.operationId, event.response);
      if (success) {
        await this.haptics.notification('success');
        this.actionCardRef()?.markResolved('Reply sent — resuming');
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_REPLIED, {
          operationId: event.operationId,
          source: 'operation-chat',
        });
        // Brief delay to show resolved state before hiding
        setTimeout(() => {
          this.yieldResolved.set(true);
          this.pushMessage({
            id: this.uid(),
            role: 'user',
            content: event.response,
            timestamp: new Date(),
          });
          this.pushMessage({
            id: this.uid(),
            role: 'system',
            content: '✅ Reply sent — Agent X is resuming with your input.',
            timestamp: new Date(),
          });
        }, 800);
      } else {
        this.logger.warn('Reply API returned false', { operationId: event.operationId });
        await this.haptics.notification('error');
        this.actionCardRef()?.markIdle();
      }
    } catch (err) {
      this.logger.error('Action card reply failed', err, { operationId: event.operationId });
      await this.haptics.notification('error');
      this.actionCardRef()?.markIdle();
    }
  }

  protected yieldOperationId(): string {
    return this._currentOperationId ?? this.contextId;
  }

  private async resumeYieldedOperation(operationId: string, response: string): Promise<boolean> {
    const authToken = await this.getAuthToken?.().catch(() => null);
    if (!authToken || !isPlatformBrowser(this.platformId)) {
      this.logger.warn('Cannot resume yielded operation without browser auth token', {
        operationId,
      });
      this.toast.error('Sign in again to continue this operation');
      return false;
    }

    const result = await this.api.resumeYieldedJob(operationId, response);
    if (!result?.resumed || !result.operationId) {
      this.logger.warn('Yielded operation resume failed', { operationId });
      return false;
    }

    const threadId = result.threadId ?? this._resolvedThreadId() ?? undefined;
    if (threadId) {
      this._resolvedThreadId.set(threadId);
    }

    this._currentOperationId = result.operationId;
    this.activeYieldState.set(null);

    this.pushMessage({
      id: 'typing',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isTyping: true,
    });
    this._loading.set(true);

    try {
      await this._sendViaStream(
        {
          message: 'Resume yielded operation',
          ...(threadId ? { threadId } : {}),
          resumeOperationId: result.operationId,
        },
        authToken
      );
      this.responseComplete.emit();
      return true;
    } catch (err) {
      this.logger.error('Failed to attach to resumed yielded operation stream', err, {
        operationId,
        resumedOperationId: result.operationId,
      });
      this.replaceTyping({
        id: this.uid(),
        role: 'assistant',
        content: 'Your reply was saved, but I could not reconnect to the resumed operation.',
        timestamp: new Date(),
        error: true,
      });
      return false;
    } finally {
      this._loading.set(false);
    }
  }

  /** Generate a unique ID. */
  private uid(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `op-msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // ============================================
  // BILLING 402 HELPERS
  // ============================================

  /** Map backend billing code to frontend billing-action reason. @internal */
  private _mapBillingCode(code?: string): AgentXBillingActionReason {
    switch (code) {
      case 'WALLET_EMPTY':
        return 'insufficient_funds';
      case 'NO_PAYMENT_METHOD':
        return 'payment_method_required';
      case 'BUDGET_EXCEEDED':
        return 'limit_reached';
      default:
        return 'insufficient_funds';
    }
  }

  /**
   * Replace the typing indicator with a billing-action rich card so the user
   * can resolve the billing issue inline without leaving the operation chat.
   * @internal
   */
  private _injectBillingCard(reason: AgentXBillingActionReason, description?: string): void {
    const card: AgentXRichCard = {
      type: 'billing-action',
      title: 'Action Required',
      payload: { reason, description },
    };

    this.replaceTyping({
      id: this.uid(),
      role: 'assistant',
      content: description ?? 'I need you to resolve a billing issue before I can continue.',
      timestamp: new Date(),
      cards: [card],
    });

    this.logger.info('Billing action card injected (operation chat)', { reason });
    this.breadcrumb.trackStateChange('agent-x-operation-chat:billing-card-shown', { reason });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_BILLING_CARD_VIEWED, { reason });
  }

  /**
   * Inject an AI-authored error message into the chat when an operation
   * has failed, so the user understands what happened.
   */
  private injectFailureMessage(): void {
    const reason = this.errorMessage || 'an unexpected error';
    this.pushMessage({
      id: this.uid(),
      role: 'assistant',
      content:
        `This operation was unable to complete due to ${reason}.\n\n` +
        `You can retry below, or dismiss and start a new request.`,
      timestamp: new Date(),
      error: true,
    });
  }
}
