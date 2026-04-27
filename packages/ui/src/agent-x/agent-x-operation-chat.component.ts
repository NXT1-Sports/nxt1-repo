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
  EnvironmentInjector,
  runInInjectionContext,
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
  AgentXPlannerItem,
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
  AGENT_X_MAX_VIDEO_FILE_SIZE,
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
import { ChatBubbleActionsComponent } from './agent-x-chat-bubble-actions.component';
import { type AgentXFeedbackSubmitEvent } from './agent-x-feedback-modal.component';
import { AgentXMessageUndoComponent } from './agent-x-message-undo.component';
import {
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
  AgentXJobService,
} from './agent-x-job.service';
import { AgentXStreamRegistryService } from './agent-x-stream-registry.service';
import {
  AgentXOperationEventService,
  type OperationEventSubscription,
} from './agent-x-operation-event.service';
import { AgentXService } from './agent-x.service';
import { AgentXVideoUploadService } from './agent-x-video-upload.service';
import { IntelService } from '../intel/intel.service';
import { ProfileGenerationStateService } from '../profile/profile-generation-state.service';
import { NxtMediaViewerService } from '../components/media-viewer/media-viewer.service';
import type { MediaViewerItem } from '../components/media-viewer/media-viewer.types';
import { NxtPlatformIconComponent } from '../components/platform-icon/platform-icon.component';
import { NxtDragDropDirective } from '../services/gesture';
import {
  AgentXActionCardComponent,
  type ActionCardApprovalEvent,
  type ActionCardReplyEvent,
} from './agent-x-action-card.component';
import type { BillingActionResolvedEvent } from './agent-x-billing-action-card.component';
import type { ConfirmationActionEvent } from './agent-x-confirmation-card.component';
import {
  AgentXAskUserCardComponent,
  type AskUserReplyEvent,
} from './agent-x-ask-user-card.component';
import { AgentXPausedCardComponent, type PauseResumeEvent } from './agent-x-paused-card.component';
import type { DraftSubmittedEvent } from './agent-x-draft-card.component';
import type { AgentYieldState } from '@nxt1/core';
import { buildLinkSourcesFormData, type OnboardingUserType } from '@nxt1/core';
import type { LinkSourcesFormData } from '@nxt1/core/api';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';
import type { AgentXPendingFile } from './agent-x-pending-file';
import { getThinkingLabel, getToolStepDisplayLabel } from './agent-x-agent-presentation';
import {
  AgentXAttachmentsSheetComponent,
  type ConnectedAppSource,
} from './agent-x-attachments-sheet.component';
import type { AgentXUser, AgentXConnectedAccountsSaveRequest } from './agent-x-shell.component';
import { buildPendingAttachmentViewer } from './pending-attachments-viewer.util';
import {
  bindAgentXKeyboardOffset,
  type AgentXKeyboardOffsetBinding,
} from './agent-x-keyboard-offset.util';

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
  readonly operationId?: string;
  readonly imageUrl?: string;
  readonly videoUrl?: string;
  readonly attachments?: readonly MessageAttachment[];
  readonly isTyping?: boolean;
  readonly error?: boolean;
  readonly steps?: readonly AgentXToolStep[];
  readonly cards?: readonly AgentXRichCard[];
  readonly parts?: readonly AgentXMessagePart[];
  readonly yieldState?: AgentYieldState;
  readonly yieldCardState?: 'idle' | 'submitting' | 'resolved';
  readonly yieldResolvedText?: string;
}

const PAUSE_RESUME_TOOL_NAME = 'resume_paused_operation';

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
    NxtPlatformIconComponent,
    AgentXInputBarComponent,
    ChatBubbleActionsComponent,
    AgentXMessageUndoComponent,
    AgentXActionCardComponent,
    AgentXAskUserCardComponent,
    AgentXPausedCardComponent,
  ],
  template: `
    <div
      class="operation-chat-shell"
      nxtDragDrop
      (dragStateChange)="onDragStateChange($event)"
      (filesDropped)="onFilesDropped($event)"
      (click)="onShellClick($event)"
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
            [class.msg-row--wide]="msgHasDataTable(msg) || !!msg.yieldState"
          >
            @if (msg.yieldState?.reason === 'needs_approval') {
              <nxt1-agent-action-card
                [yield]="msg.yieldState!"
                [operationId]="msg.operationId || yieldOperationId()"
                [externalCardState]="msg.yieldCardState ?? null"
                [externalResolvedText]="msg.yieldResolvedText ?? ''"
                (approve)="onApproveAction($event)"
                (reply)="onReplyAction($event)"
              />
            } @else if (isPauseYieldMessage(msg)) {
              <nxt1-agent-x-paused-card
                [operationId]="msg.operationId || yieldOperationId()"
                [message]="
                  msg.yieldState?.promptToUser || 'Operation paused. Resume whenever you are ready.'
                "
                (resumeRequested)="onPauseResume($event)"
              />
            } @else if (isAskUserYield(msg)) {
              <nxt1-agent-x-ask-user-card
                [card]="buildAskUserCardFromYield(msg)"
                (replySubmitted)="onAskUserReply($event)"
              />
            } @else {
              <nxt1-chat-bubble
                variant="agent-operation"
                [isOwn]="msg.role === 'user'"
                [content]="msg.content"
                [isStreaming]="msg.id === 'typing'"
                [isTyping]="!!msg.isTyping"
                [typingLabel]="msg.id === 'typing' ? thinkingLabel() : 'Thinking...'"
                [isError]="!!msg.error"
                [isSystem]="msg.role === 'system'"
                [steps]="msg.steps ?? []"
                [cards]="messageCardsForBubble(msg)"
                [parts]="messagePartsForBubble(msg)"
                (billingActionResolved)="onBillingActionResolved($event)"
                (confirmationAction)="onConfirmationAction($event)"
                (draftSubmitted)="onDraftSubmitted($event)"
                (askUserReply)="onAskUserReply($event)"
                (retryRequested)="onRetryErrorMessage(msg)"
              />
            }
            @if (!msg.yieldState && msg.attachments?.length) {
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
            @if (!msg.yieldState && msg.id !== 'typing' && msg.role !== 'system' && !msg.error) {
              <nxt1-agent-x-chat-bubble-actions
                [alignEnd]="msg.role === 'user'"
                (copy)="copyMessageContent(msg)"
              />
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
            <span class="thinking-block__label">{{ thinkingLabel() }}</span>
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

      <!-- ═══ INPUT FOOTER (floating, keyboard-aware) ═══ -->
      <div class="chat-input-footer">
        @if (executionPlanCard(); as executionPlan) {
          <details
            class="execution-plan-dock"
            [open]="executionPlanExpanded()"
            (toggle)="onExecutionPlanToggle($event)"
          >
            <summary class="execution-plan-dock__summary">
              <span class="execution-plan-dock__title">{{ executionPlan.title }}</span>
              <span class="execution-plan-dock__progress"
                >{{ executionPlanDoneCount() }}/{{ executionPlanTotalCount() }}</span
              >
              <svg class="execution-plan-dock__chevron" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 4L10 8L6 12"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </summary>

            <div class="execution-plan-dock__body">
              <div class="execution-plan-dock__items">
                @for (item of executionPlanItems(); track item.id) {
                  <div
                    class="execution-plan-dock__item"
                    [class.execution-plan-dock__item--done]="item.done"
                  >
                    <span class="execution-plan-dock__item-check" aria-hidden="true">
                      @if (item.done) {
                        <svg viewBox="0 0 16 16" fill="none">
                          <rect
                            x="1"
                            y="1"
                            width="14"
                            height="14"
                            rx="3"
                            fill="var(--nxt1-color-primary, #ccff00)"
                          />
                          <path
                            d="M4.5 8L7 10.5L11.5 5.5"
                            stroke="var(--nxt1-color-text-onPrimary, #0a0a0a)"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </svg>
                      } @else {
                        <svg viewBox="0 0 16 16" fill="none">
                          <rect
                            x="1.5"
                            y="1.5"
                            width="13"
                            height="13"
                            rx="2.5"
                            stroke="currentColor"
                            stroke-width="1"
                          />
                        </svg>
                      }
                    </span>
                    <span class="execution-plan-dock__item-label">{{ item.label }}</span>
                  </div>
                }
              </div>
            </div>
          </details>
        }

        <nxt1-agent-x-message-undo
          [visible]="pendingUndoState() !== null"
          [triggerId]="undoBannerTriggerId()"
          [durationSeconds]="10"
          (undo)="undoDeletedMessage()"
          (expired)="clearUndoState()"
        />

        <nxt1-agent-x-input-bar
          [userMessage]="inputValue()"
          [isLoading]="_loading()"
          [canSend]="canSend()"
          [pendingFiles]="promptInputPendingFiles()"
          [pendingSources]="pendingConnectedSources()"
          [selectedTask]="null"
          placeholder="Message A Coordinator"
          (messageChange)="inputValue.set($event)"
          (send)="send()"
          (pause)="pauseStream()"
          (toggleAttachments)="onUploadClick()"
          (openFile)="openPendingFileViewer($event)"
          (removeFile)="removePendingFile($event)"
          (removeSource)="
            pendingConnectedSources.update((srcs) => srcs.filter((_, i) => i !== $event))
          "
          (focusInput)="onInputFocus()"
        ></nxt1-agent-x-input-bar>

        @if (showDesktopAttachmentMenu()) {
          <button
            type="button"
            class="desktop-attach-menu-backdrop"
            aria-label="Close attachment menu"
            (click)="closeDesktopAttachmentMenu()"
          ></button>
          <div class="desktop-attach-menu" role="menu" aria-label="Attachment options">
            <button
              type="button"
              class="desktop-attach-menu__item desktop-attach-menu__item--primary"
              (click)="onDesktopAttachmentUploadClick()"
            >
              <nxt1-icon name="plus" [size]="15" />
              <div class="desktop-attach-menu__copy">
                <span class="desktop-attach-menu__title">Upload File</span>
                <span class="desktop-attach-menu__meta">Photo, video, PDF, doc, or sheet</span>
              </div>
            </button>

            <div class="desktop-attach-menu__section">Connected Apps</div>

            @if (desktopAttachmentSources().length > 0) {
              <div class="desktop-attach-menu__apps-row" role="list">
                @for (
                  source of desktopAttachmentSources();
                  track source.platform + source.profileUrl
                ) {
                  <button
                    type="button"
                    class="desktop-attach-menu__app-chip"
                    [title]="source.platform"
                    role="listitem"
                    (click)="onDesktopAttachmentSourceSelected(source)"
                  >
                    <nxt1-platform-icon
                      icon="link"
                      [faviconUrl]="source.faviconUrl"
                      [size]="30"
                      [alt]="source.platform"
                    />
                    <span class="desktop-attach-menu__app-chip-label">{{ source.platform }}</span>
                  </button>
                }
                <button
                  type="button"
                  class="desktop-attach-menu__connect-more"
                  (click)="onDesktopManageConnectedApps()"
                >
                  <nxt1-icon name="plusCircle" [size]="14" />
                  Connect more
                </button>
              </div>
            } @else {
              <button
                type="button"
                class="desktop-attach-menu__apps-placeholder"
                (click)="onDesktopManageConnectedApps()"
              >
                <div class="desktop-attach-menu__apps-placeholder-icon">
                  <nxt1-icon name="link" [size]="18" />
                </div>
                <div class="desktop-attach-menu__copy">
                  <span class="desktop-attach-menu__title">No connected apps yet</span>
                  <span class="desktop-attach-menu__meta">Connect apps for richer context</span>
                </div>
                <nxt1-icon name="chevronRight" [size]="16" />
              </button>
            }
          </div>
        }

        <input
          #desktopAttachmentFileInput
          type="file"
          class="file-input-hidden"
          [accept]="acceptedFileTypes"
          multiple
          (change)="onDesktopAttachmentFilesSelected($event)"
        />
      </div>

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
        padding: 16px 20px calc(8px + var(--agent-keyboard-offset, 0px));
        display: flex;
        flex-direction: column;
        gap: 20px;
        -webkit-overflow-scrolling: touch;
      }

      /* ── Floating input footer — transparent, lifts with keyboard ── */
      .chat-input-footer {
        position: relative;
        background: transparent;
        transform: translateY(calc(-1 * var(--agent-keyboard-offset, 0px)));
        transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      }

      .execution-plan-dock {
        margin: 0 18px 4px;
        border: 1px solid var(--op-border);
        border-radius: 14px;
        background: color-mix(in srgb, var(--op-surface) 86%, transparent);
        overflow: hidden;
      }

      .execution-plan-dock__summary {
        list-style: none;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        cursor: pointer;
        user-select: none;
        border-bottom: 1px solid transparent;
      }

      .execution-plan-dock__summary::-webkit-details-marker,
      .execution-plan-dock__summary::marker {
        display: none;
        content: '';
      }

      .execution-plan-dock[open] .execution-plan-dock__summary {
        border-bottom-color: var(--op-border);
      }

      .execution-plan-dock__title {
        flex: 1;
        min-width: 0;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--op-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .execution-plan-dock__progress {
        font-size: 0.74rem;
        color: var(--op-text-muted);
        font-variant-numeric: tabular-nums;
      }

      .execution-plan-dock__chevron {
        width: 14px;
        height: 14px;
        color: var(--op-text-muted);
        transition: transform 0.2s ease;
      }

      .execution-plan-dock[open] .execution-plan-dock__chevron {
        transform: rotate(90deg);
      }

      .execution-plan-dock__body {
        padding: 8px 10px 10px;
      }

      .execution-plan-dock__items {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .execution-plan-dock__item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        color: var(--op-text-secondary);
      }

      .execution-plan-dock__item--done .execution-plan-dock__item-label {
        text-decoration: line-through;
        color: var(--op-text-muted);
      }

      .execution-plan-dock__item-check {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        margin-top: 1px;
        color: var(--op-text-muted);
      }

      .execution-plan-dock__item-check svg {
        width: 16px;
        height: 16px;
      }

      .execution-plan-dock__item-label {
        font-size: 0.76rem;
        line-height: 1.45;
      }

      .operation-cancel-inline {
        margin: 8px 18px 0;
        border: 1px solid var(--op-border);
        border-radius: 999px;
        background: var(--op-surface);
        color: var(--op-text-secondary);
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }

      .operation-cancel-inline:hover {
        color: var(--op-text);
      }

      .desktop-attach-menu-backdrop {
        position: fixed;
        inset: 0;
        border: 0;
        background: transparent;
        z-index: 30;
      }

      .desktop-attach-menu {
        position: absolute;
        left: 18px;
        bottom: calc(100% + 10px);
        width: min(380px, calc(100% - 24px));
        z-index: 40;
        padding: 8px;
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        border-radius: 14px;
        background: var(--nxt1-color-surface-100, rgba(15, 18, 14, 0.96));
        box-shadow: var(--nxt1-navigation-dropdown, 0 24px 48px rgba(0, 0, 0, 0.38));
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .desktop-attach-menu__section {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--op-text-muted);
        padding: 8px 10px 2px;
      }

      .desktop-attach-menu__item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        width: 100%;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: var(--op-text);
        text-align: left;
        padding: 10px;
        cursor: pointer;
        transition: background-color 0.15s ease;
      }

      .desktop-attach-menu__item:hover {
        background: var(--op-surface);
      }

      .desktop-attach-menu__item--primary {
        border: 1px solid color-mix(in srgb, var(--op-primary) 30%, var(--op-border));
        background: color-mix(in srgb, var(--op-primary-glow) 72%, transparent);
      }

      .desktop-attach-menu__copy {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .desktop-attach-menu__title {
        font-size: 13px;
        font-weight: 600;
        line-height: 1.3;
        color: var(--op-text);
      }

      .desktop-attach-menu__meta {
        font-size: 11px;
        line-height: 1.35;
        color: var(--op-text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 300px;
      }

      /* ─── Connected Apps Row (chips, matches mobile sheet) ─── */
      .desktop-attach-menu__apps-row {
        display: flex;
        align-items: stretch;
        gap: 8px;
        overflow-x: auto;
        padding: 4px 2px 6px;
        scrollbar-width: none;
      }

      .desktop-attach-menu__apps-row::-webkit-scrollbar {
        display: none;
      }

      .desktop-attach-menu__app-chip {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-width: 72px;
        max-width: 72px;
        padding: 8px 6px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.09));
        border-radius: 10px;
        background: var(--op-surface);
        color: inherit;
        cursor: pointer;
        flex-shrink: 0;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          transform 0.12s ease;
      }

      .desktop-attach-menu__app-chip:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.15));
      }

      .desktop-attach-menu__app-chip:active {
        transform: scale(0.96);
      }

      .desktop-attach-menu__app-chip-label {
        font-size: 9px;
        font-weight: 500;
        text-align: center;
        line-height: 1.2;
        color: var(--op-text);
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .desktop-attach-menu__connect-more {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-width: 72px;
        max-width: 72px;
        padding: 8px 6px;
        border: 1px dashed rgba(255, 255, 255, 0.2);
        border-radius: 10px;
        background: transparent;
        color: var(--op-text-muted);
        font-size: 9px;
        font-weight: 500;
        cursor: pointer;
        flex-shrink: 0;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;
      }

      .desktop-attach-menu__connect-more:hover {
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.06));
        border-color: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-primary, #ccff00);
      }

      /* ─── Empty state (no connected apps) ─── */
      .desktop-attach-menu__apps-placeholder {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 10px;
        border: 1px dashed var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.16));
        border-radius: 10px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.03));
        color: inherit;
        cursor: pointer;
        text-align: left;
        transition:
          background 0.15s ease,
          border-color 0.15s ease;
      }

      .desktop-attach-menu__apps-placeholder:hover {
        background: var(--op-surface);
        border-color: rgba(255, 255, 255, 0.22);
      }

      .desktop-attach-menu__apps-placeholder-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 8px;
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.08));
        color: var(--nxt1-color-primary, #ccff00);
        flex-shrink: 0;
      }

      :host-context(.keyboard-open) .chat-input-footer {
        transition-duration: 0.22s;
      }

      .messages-area--embedded {
        max-height: none;
        min-height: 0;
        flex: 1 1 auto;
        width: 100%;
        max-width: calc(100% - 48px);
        margin-left: auto;
        margin-right: auto;
        padding-bottom: 24px;
      }

      :host.agent-x-operation-chat--embedded .chat-input-footer {
        width: 100%;
        max-width: calc(100% - 48px);
        margin-left: auto;
        margin-right: auto;
        padding-bottom: 14px;
        box-sizing: border-box;
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
        /* Use the accent directly — no color-mix with inherited bg vars that
           may resolve incorrectly inside Ionic portal-rendered modals */
        border-color: var(--coordinator-pill-accent);
        background: color-mix(in srgb, var(--coordinator-pill-accent) 12%, transparent);
        color: var(--op-text);
        font-weight: 600;
        box-shadow:
          0 4px 16px color-mix(in srgb, var(--coordinator-pill-accent) 20%, transparent),
          inset 0 1px 0 color-mix(in srgb, var(--coordinator-pill-accent) 25%, white);
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
        background: color-mix(in srgb, var(--coordinator-pill-accent) 22%, transparent);
        box-shadow:
          0 6px 18px color-mix(in srgb, var(--coordinator-pill-accent) 28%, transparent),
          inset 0 1px 0 color-mix(in srgb, var(--coordinator-pill-accent) 30%, white);
        transform: translateY(1px) scale(0.99);
      }

      /* ─── Light mode: slightly stronger tint since white bg needs more contrast ─── */
      :host-context(.light) .quick-option-chip[data-coordinator],
      :host-context([data-theme='light']) .quick-option-chip[data-coordinator],
      :host-context([data-base-theme='light']) .quick-option-chip[data-coordinator] {
        background: color-mix(in srgb, var(--coordinator-pill-accent) 16%, transparent);
      }

      :host-context(.light) .quick-option-chip[data-coordinator]:active,
      :host-context([data-theme='light']) .quick-option-chip[data-coordinator]:active,
      :host-context([data-base-theme='light']) .quick-option-chip[data-coordinator]:active {
        background: color-mix(in srgb, var(--coordinator-pill-accent) 26%, transparent);
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
  private readonly injector = inject(EnvironmentInjector);
  private readonly streamRegistry = inject(AgentXStreamRegistryService);
  private readonly operationEventService = inject(AgentXOperationEventService);
  private readonly agentXService = inject(AgentXService);
  private readonly hostElement = inject(ElementRef);
  private readonly desktopAttachmentFileInput = viewChild<ElementRef<HTMLInputElement>>(
    'desktopAttachmentFileInput'
  );

  /** Shared keyboard offset binding used by shell and operation chat. */
  private keyboardOffsetBinding?: AgentXKeyboardOffsetBinding;
  private readonly videoUploadService = inject(AgentXVideoUploadService);
  private readonly intelService = inject(IntelService, { optional: true });
  private readonly profileGenerationState = inject(ProfileGenerationStateService, {
    optional: true,
  });

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

  /** Last operationId explicitly attached via resume flow (approval/input handoff). */
  private _lastResumeAttachOperationId: string | null = null;

  /** Buffered token text waiting to be committed to the typing message. */
  private pendingTypingDelta = '';

  /** RAF handle for batched typing flushes. */
  private pendingTypingFlushFrame: number | null = null;

  /** RAF handle for batched auto-scroll writes. */
  private pendingScrollFrame: number | null = null;

  /** Most recent requested scroll behavior for the next batched scroll write. */
  private pendingScrollBehavior: ScrollBehavior = 'auto';

  /** Timers used for post-focus scroll corrections while keyboard animates in. */
  private focusScrollTimers: ReturnType<typeof setTimeout>[] = [];

  /** Operation ID from the backend — used for explicit cancel endpoint. */
  private _currentOperationId: string | null = null;

  /**
   * Active Firestore job event subscription for background jobs (scrape, welcome
   * graphic, etc.) that are enqueued without an open SSE connection.
   * Cleaned up on destroy or when the job completes/errors.
   */
  private _activeFirestoreSub: OperationEventSubscription | null = null;

  /**
   * Shadow Firestore subscription opened the moment an SSE `thread` event
   * arrives with an operationId. It uses no-op callbacks so nothing renders,
   * but its shared `lastProcessedSeq` counter advances in lock-step as the
   * DebouncedEventWriter flushes batches to Firestore.
   *
   * If the SSE connection drops, `_subscribeToFirestoreJobEvents` attaches UI
   * callbacks to the *same* fanout entry — inheriting the already-advanced
   * seq — so no events that were shown via SSE are replayed. Zero duplication.
   *
   * Cleaned up when the SSE stream resolves (success or error).
   */
  private _shadowFirestoreSub: OperationEventSubscription | null = null;

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

  /** Connected app sources used by the attachments bottom sheet. */
  @Input() connectedSources: readonly ConnectedAppSource[] = [];

  /** Current user — needed to open the connected accounts modal. */
  @Input() user: AgentXUser | null = null;

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
    if (value) {
      this.upsertInlineYieldMessage(value, this.resolveYieldOperationId(value));
    }
  }

  /**
   * Current operation status — when `'error'`, the failure banner is shown
   * after thread messages load so the user knows what happened.
   */
  @Input() operationStatus:
    | 'processing'
    | 'complete'
    | 'error'
    | 'paused'
    | 'awaiting_input'
    | 'awaiting_approval'
    | null = null;

  /**
   * Human-readable error description when `operationStatus === 'error'`.
   * Displayed inside the failure banner.
   */
  @Input() errorMessage: string | null = null;

  /**
   * When set, the component immediately attaches to a resumed SSE stream
   * for the given operationId on init — used by the web shell after
   * an inline approval resolves and the backend resumes the operation.
   */
  @Input() resumeOperationId = '';
  // ============================================

  /** Isolated message history for this operation context. */
  protected readonly messages = signal<OperationMessage[]>([]);

  /** Active inline edit target for a user message. */
  protected readonly editingMessageId = signal<string | null>(null);

  /** Current draft text shown in the inline edit component. */
  protected readonly editingMessageDraft = signal('');

  /** Assistant message selected for feedback modal submission. */
  protected readonly feedbackTargetMessageId = signal<string | null>(null);

  /** Preferred initial star rating when opening the feedback modal. */
  protected readonly feedbackDefaultRating = signal<1 | 2 | 3 | 4 | 5>(5);

  /** Pending delete token used by the undo countdown banner. */
  protected readonly pendingUndoState = signal<{
    messageId: string;
    restoreTokenId: string;
    threadId: string;
  } | null>(null);

  /** Incremented for each delete action so the undo countdown restarts. */
  protected readonly undoBannerTriggerId = signal(0);

  /** Current user input value. */
  protected readonly inputValue = signal('');

  /** Whether an AI response is being generated. */
  protected readonly _loading = signal(false);

  /**
   * Video upload progress (0–100) while Cloudflare TUS upload is in-flight.
   * `null` when no upload is active. Drives the progress indicator in the
   * typing bubble so the user sees real-time feedback on large video uploads.
   */
  protected readonly _videoUploadPercent = signal<number | null>(null);

  /** Human-readable upload phase label ('Uploading video… 42%'). */
  protected readonly _videoUploadLabel = computed(() => {
    const pct = this._videoUploadPercent();
    if (pct === null) return null;
    if (pct === 0) return 'Preparing video…';
    return `Uploading video… ${pct}%`;
  });

  /** Most recent backend progress commentary message (stage/subphase/metric). */
  protected readonly _latestProgressLabel = signal<string | null>(null);

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

  /** Connected app sources staged from the attachments sheet — shown as chips in the input bar. */
  protected readonly pendingConnectedSources = signal<ConnectedAppSource[]>([]);

  /** Desktop-only attachment menu visibility (embedded web mode). */
  protected readonly showDesktopAttachmentMenu = signal(false);

  /** Desktop attachment menu connected sources (same source contract as mobile sheet). */
  protected readonly desktopAttachmentSources = computed(() =>
    this.agentXService.attachmentConnectedSources()
  );

  /** Pending files converted to AgentXPendingFile shape for prompt-input component. */
  protected readonly promptInputPendingFiles = computed<readonly AgentXPendingFile[]>(() =>
    this.pendingFiles().map((pf) => ({
      file: pf.file,
      previewUrl: pf.previewUrl,
      type: resolveAttachmentType(pf.file.type),
    }))
  );

  /** Most recent planner card so execution plan can dock above the composer. */
  protected readonly executionPlanCard = computed<AgentXRichCard | null>(() => {
    const messages = this.messages();
    for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
      const message = messages[messageIndex];
      if (!message) continue;

      const parts = message.parts ?? [];
      for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
        const part = parts[partIndex];
        if (part?.type === 'card' && part.card.type === 'planner') {
          return part.card;
        }
      }

      const cards = message.cards ?? [];
      for (let cardIndex = cards.length - 1; cardIndex >= 0; cardIndex -= 1) {
        const card = cards[cardIndex];
        if (card?.type === 'planner') {
          return card;
        }
      }
    }

    return null;
  });

  /** Composer-adjacent execution-plan accordion expansion state. */
  protected readonly executionPlanExpanded = signal(true);

  /** Summary progress count for the docked execution plan. */
  protected readonly executionPlanTotalCount = computed(() => {
    const card = this.executionPlanCard();
    if (!card || card.type !== 'planner') return 0;
    const payload = card.payload;
    if (!('items' in payload) || !Array.isArray(payload.items)) return 0;
    return payload.items.length;
  });

  /** Completed item count for the docked execution plan. */
  protected readonly executionPlanDoneCount = computed(() => {
    const card = this.executionPlanCard();
    if (!card || card.type !== 'planner') return 0;
    const payload = card.payload;
    if (!('items' in payload) || !Array.isArray(payload.items)) return 0;
    return payload.items.filter((item) => Boolean(item?.done)).length;
  });

  protected readonly executionPlanItems = computed<readonly AgentXPlannerItem[]>(() => {
    const card = this.executionPlanCard();
    if (!card || card.type !== 'planner') return [];
    const payload = card.payload;
    if (!('items' in payload) || !Array.isArray(payload.items)) return [];
    return payload.items as readonly AgentXPlannerItem[];
  });

  /** Whether a drag operation is hovering over the chat surface. */
  protected readonly isDragActive = signal(false);

  /** Whether to show the persistent "Agent X is thinking" indicator. */
  protected readonly showThinking = computed(() => {
    if (this.contextType !== 'operation') return false;
    if (this.operationStatus !== 'processing') return false;
    if (this.activeYieldState()) return false;
    const msgs = this.messages();
    // Avoid duplicate loaders during refresh/rehydration while the inline typing
    // placeholder is already rendering the in-flight response state.
    if (msgs.some((msg) => msg.id === 'typing')) return false;
    // Don't show if the last message is already an assistant reply (thread loaded real content)
    if (msgs.length === 0) return true;
    const last = msgs[msgs.length - 1];
    return last.role !== 'assistant' || !!last.isTyping;
  });

  /** The latest active tool step driving the persistent thinking shimmer. */
  protected readonly thinkingStep = computed<AgentXToolStep | null>(() => {
    const messages = this.messages();
    for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
      const steps = messages[messageIndex]?.steps;
      if (!steps?.length) continue;
      for (let stepIndex = steps.length - 1; stepIndex >= 0; stepIndex -= 1) {
        const step = steps[stepIndex];
        if (step.status === 'active') {
          return step;
        }
      }
    }
    return null;
  });

  /** Human-readable thinking shimmer label driven by structured agent progress. */
  protected readonly thinkingLabel = computed(() => {
    const uploadLabel = this._videoUploadLabel();
    if (uploadLabel) return uploadLabel;
    const progressLabel = this._latestProgressLabel();
    if (progressLabel) return progressLabel;
    return getThinkingLabel(this.thinkingStep());
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

  /** Normalized quick actions — only explicit coordinator-provided actions are shown. */
  protected readonly normalizedQuickActions = computed<OperationQuickAction[]>(() => {
    // Operations skip straight to work — no chatbot-style suggestion pills
    if (this.contextType === 'operation') return [];

    return this.quickActions.map((a, index) => ({
      ...a,
      id: a.id || `cmd-${index + 1}`,
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

  /** Emitted when the user saves connected accounts from the connected accounts modal. */
  readonly connectedAccountsSave = output<AgentXConnectedAccountsSaveRequest>();

  /** Monotonic response turn counter used for completion idempotency. */
  private _responseTurnId = 0;

  /** Whether `responseComplete` already emitted for the active turn. */
  private _responseCompleteEmitted = false;

  /** Rolling latency samples for streamed delta chunks (ms). */
  private deltaLatencySamples: number[] = [];

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

  private isFirestoreOperationId(value: string | null | undefined): value is string {
    const trimmed = value?.trim();
    if (!trimmed) return false;
    const bare = trimmed.startsWith('chat-') ? trimmed.slice(5) : trimmed;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bare);
  }

  private resolveFirestoreOperationId(): string | null {
    const candidates = [
      this._currentOperationId,
      this.resumeOperationId?.trim() || null,
      this.contextId?.trim() || null,
    ];

    for (const candidate of candidates) {
      if (this.isFirestoreOperationId(candidate)) return candidate;
    }

    return null;
  }

  private inferOperationStatusFromYield(
    yieldState: AgentYieldState
  ): 'paused' | 'awaiting_input' | 'awaiting_approval' {
    if (yieldState.reason === 'needs_approval') return 'awaiting_approval';
    if (yieldState.pendingToolCall?.toolName === PAUSE_RESUME_TOOL_NAME) return 'paused';
    return 'awaiting_input';
  }

  private coercePersistedYieldState(value: unknown): AgentYieldState | null {
    if (!value || typeof value !== 'object') return null;

    const candidate = value as Partial<AgentYieldState>;
    if (typeof candidate.reason !== 'string') return null;
    if (!candidate.pendingToolCall || typeof candidate.pendingToolCall.toolName !== 'string') {
      return null;
    }

    return candidate as AgentYieldState;
  }

  private applyPendingYieldState(
    yieldState: AgentYieldState,
    threadId: string,
    source: string
  ): void {
    const pendingStatus = this.inferOperationStatusFromYield(yieldState);
    this.activeYieldState.set(yieldState);
    this.yieldResolved.set(false);
    this.upsertInlineYieldMessage(yieldState, this.resolveYieldOperationId(yieldState));
    this.operationStatus = pendingStatus;

    this.logger.info('Applied pending yield state on thread load', {
      threadId,
      contextId: this.contextId,
      source,
      pendingStatus,
      reason: yieldState.reason,
      toolName: yieldState.pendingToolCall?.toolName,
    });
  }

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
  constructor() {
    // When the component is destroyed (e.g. session switch), detach from the
    // stream registry instead of aborting. The stream continues running in the
    // background and buffers its output. When the user returns to this session,
    // the component remounts and rehydrates from the buffer.
    this.destroyRef.onDestroy(() => {
      this.clearPendingTypingDelta();
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
      // Clean up any active Firestore job event subscription.
      this._activeFirestoreSub?.unsubscribe();
      this._activeFirestoreSub = null;
      // Clean up the shadow Firestore subscription if still open.
      this._shadowFirestoreSub?.unsubscribe();
      this._shadowFirestoreSub = null;
    });

    // Auto-scroll when messages change
    effect(() => {
      const msgs = this.messages();
      if (msgs.length > 0) {
        this.scrollToBottom({ onlyIfNearBottom: true, behavior: 'auto' });
      }
    });

    // Auto-scroll when an action card appears (yield state set)
    effect(() => {
      const yieldState = this.activeYieldState();
      if (yieldState) {
        // Keep timeline and yield state in sync so cards always render inline,
        // even if a specific event path misses direct insertion.
        this.upsertInlineYieldMessage(yieldState, this.resolveYieldOperationId(yieldState));
        this.scrollToBottom({ behavior: 'smooth' });
      }
    });
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  /** Auto-send the initial message if provided. */
  private initialMessageSent = false;

  ngAfterViewInit(): void {
    // Bind immediately so all code paths (including early returns) get keyboard lift.
    void this.bindKeyboardOffset();

    // If opening an existing operation/thread, check for an active stream first.
    if (this.threadId?.trim()) {
      this._isThreadMode.set(true);
      this._resolvedThreadId.set(this.threadId.trim());

      // ── Rehydrate from stream registry (session switch recovery) ──────
      // If the user switched away while a stream was running, the registry
      // kept it alive. Claim it now to get buffered state + live updates.
      const snapshot = this.streamRegistry.claim(this.threadId.trim(), {
        onDelta: (text) => {
          this.queueTypingDelta(text);
        },
        onStep: (step) => {
          this.flushPendingTypingDelta();
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
          this.flushPendingTypingDelta();
          this.messages.update((msgs) =>
            msgs.map((m) => {
              if (m.id !== 'typing') return m;
              const prevParts = [...(m.parts ?? [])];
              prevParts.push({ type: 'card', card });
              return { ...m, cards: [...(m.cards ?? []), card], parts: prevParts };
            })
          );
        },
        onDone: (evt) => {
          this.flushPendingTypingDelta();
          this.finalizeStreamedAssistantMessage({
            streamingId: 'typing',
            messageId:
              evt != null && typeof evt['messageId'] === 'string' ? evt['messageId'] : undefined,
            success:
              evt != null && typeof evt['success'] === 'boolean' ? evt['success'] : undefined,
            source: 'stream-registry-done',
          });
          this._loading.set(false);
          this.haptics.notification('success').catch(() => undefined);
          this.emitResponseCompleteOnce('stream-registry-done');
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

      // No active SSE stream — load MongoDB history first.
      // If this is a background operation still in-flight (scrape, welcome graphic, etc.)
      // additionally attach a Firestore listener so the user sees live progress.
      if (
        this.contextId?.trim() &&
        this.contextType === 'operation' &&
        this.operationStatus === 'processing'
      ) {
        // Snapshot BEFORE the async load — reconciliation inside loadThreadMessages
        // may optimistically flip status to 'complete' if an assistant reply exists.
        // But reconciliation is a guess; Firestore is authoritative. Always attach
        // the live listener when the job was in-progress going in.
        const operationId = this.resolveFirestoreOperationId();
        void this.loadThreadMessages(this.threadId.trim()).then(async () => {
          if (!operationId) {
            this.logger.warn('Skipping Firestore operation rehydrate: no valid operationId', {
              contextId: this.contextId,
              threadId: this.threadId,
            });
            return;
          }
          // Branch on whether the thread already has a completed assistant reply.
          const hasAssistantReply = this.messages().some(
            (m) => !m.isTyping && m.role === 'assistant' && m.content?.trim()
          );

          if (hasAssistantReply) {
            // ── Job is already done ──────────────────────────────────────────
            // loadThreadMessages reconciliation already set operationStatus to
            // 'complete' and broadcasted via emitOperationStatusUpdated.
            // MongoDB has the full response — no Firestore subscription needed.
            // Skip to avoid a hanging subscription (the done event would be
            // filtered by startAfterSeq anyway and onDone would never fire).
            this.logger.info('Thread already has assistant reply — skipping Firestore subscribe', {
              operationId,
            });
            return;
          }

          // ── Job still in-flight ──────────────────────────────────────────
          // The user refreshed mid-stream. Reconstruct the partial response
          // from stored Firestore events so the user sees what was generated
          // before the refresh, then continue live from the last stored seq.
          const stored = await this.operationEventService.getStoredEventState(operationId);

          if (stored.latestYieldState) {
            this.activeYieldState.set(stored.latestYieldState);
            this.yieldResolved.set(false);
            this.upsertInlineYieldMessage(stored.latestYieldState, operationId);
          }

          if (stored.isDone) {
            // The job completed while we were loading MongoDB history.
            // Firestore already has the full response — no live subscribe needed.
            // If MongoDB didn't save it yet (race), inject from Firestore state.
            const alreadyHasAssistant = this.messages().some(
              (m) => !m.isTyping && m.role === 'assistant' && m.content?.trim()
            );
            if (!alreadyHasAssistant && stored.content) {
              this.messages.update((msgs) => [
                ...msgs,
                {
                  id: this.uid(),
                  role: 'assistant' as const,
                  content: stored.content,
                  timestamp: new Date(),
                  isTyping: false,
                  steps: stored.steps.length > 0 ? stored.steps : undefined,
                },
              ]);
            }
            this.operationStatus = 'complete';
            this.operationEventService.emitOperationStatusUpdated(
              this.threadId?.trim() ?? operationId,
              'complete',
              new Date().toISOString()
            );
            return;
          }

          // Job still running. Inject typing bubble with accumulated content
          // from Firestore so the user immediately sees what was generated,
          // then subscribe from maxSeq so new tokens append cleanly.
          // IMPORTANT: parts must be pre-populated to match content — the template
          // renders from `parts`, not `content`. Without this, onDelta builds parts
          // from scratch and only post-refresh tokens appear.
          const storedParts: AgentXMessagePart[] = [];
          if (stored.steps.length > 0) {
            storedParts.push({ type: 'tool-steps', steps: stored.steps });
          }
          if (stored.content) {
            storedParts.push({ type: 'text', content: stored.content });
          }
          this.messages.update((msgs) => {
            if (msgs.some((m) => m.id === 'typing')) return msgs;
            return [
              ...msgs,
              {
                id: 'typing',
                role: 'assistant' as const,
                content: stored.content,
                timestamp: new Date(),
                isTyping: !stored.content,
                steps: stored.steps.length > 0 ? [...stored.steps] : undefined,
                parts: storedParts.length > 0 ? storedParts : undefined,
              },
            ];
          });
          this._loading.set(true);
          this._subscribeToFirestoreJobEvents(undefined, stored.maxSeq);
        });
      } else {
        void this.loadThreadMessages(this.threadId.trim()).then(async () => {
          const pendingStatus =
            this.operationStatus === 'paused' ||
            this.operationStatus === 'awaiting_input' ||
            this.operationStatus === 'awaiting_approval';
          const operationId = this.resolveFirestoreOperationId();
          if (!pendingStatus || !operationId) return;

          const stored = await this.operationEventService.getStoredEventState(operationId);
          if (!stored.latestYieldState) return;

          this.activeYieldState.set(stored.latestYieldState);
          this.yieldResolved.set(false);
          this.upsertInlineYieldMessage(stored.latestYieldState, operationId);
        });
      }
      return;
    }

    // If the operation failed but has no thread, still show the failure context.
    if (this.operationStatus === 'error') {
      this._isThreadMode.set(true);
      this.injectFailureMessage();
      return;
    }

    // Background operation with no threadId yet (thread creation race condition from
    // agent-scrape.service / agent-welcome.service): subscribe directly to Firestore
    // events so the user sees live progress without waiting for thread linkage.
    if (
      this.contextId?.trim() &&
      this.contextType === 'operation' &&
      this.operationStatus === 'processing'
    ) {
      this._isThreadMode.set(true);
      this._subscribeToFirestoreJobEvents();
      return;
    }

    // Seed initial files if provided (from shell pending files)
    if (this.initialFiles.length > 0) {
      this.pendingFiles.set([...this.initialFiles]);
    }

    // Drop-recovery / inline-approval resume: attach to the given operationId stream.
    if (this.resumeOperationId?.trim()) {
      void this._attachToResumedOperation({
        operationId: this.resumeOperationId.trim(),
        threadId: this.threadId?.trim() || undefined,
        afterSeq: 0,
      });
      return;
    }

    if (this.initialMessage?.trim() && !this.initialMessageSent) {
      this.initialMessageSent = true;
      // Slight delay to let the sheet animation settle
      setTimeout(() => {
        this.inputValue.set(this.initialMessage.trim());
        this.send();
      }, 150);
    }
  }

  ngOnDestroy(): void {
    // Stream lifecycle cleanup is handled in the constructor's destroyRef callback.
    // Keep this hook for non-stream resources only to avoid aborting resumed runs
    // during component remounts.
    this._clearPendingFiles();
    this.clearFocusScrollTimers();
    this.keyboardOffsetBinding?.teardown();
  }

  /** Bind shared keyboard offset behavior so operation chat matches shell exactly. */
  private async bindKeyboardOffset(): Promise<void> {
    this.keyboardOffsetBinding = await bindAgentXKeyboardOffset({
      platformId: this.platformId,
      hostElement: this.hostElement.nativeElement,
      offsetCssVar: '--agent-keyboard-offset',
      safeAreaCssVar: '--footer-safe-area',
      keyboardOffsetTrimPx: -6,
      onKeyboardShow: () => {
        // When keyboard opens, scroll to bottom to show all content
        this.scrollToBottom({ behavior: 'auto' });
      },
    });
  }

  /** Ensure latest messages remain visible when the input receives focus. */
  protected onInputFocus(): void {
    this.clearFocusScrollTimers();
    this.scrollToBottom({ behavior: 'auto' });

    // iOS keyboard and bottom-sheet reflow can settle a bit later; follow-up
    // scrolls keep the last assistant content above the floating input.
    for (const delay of [90, 190, 320]) {
      const timer = setTimeout(() => this.scrollToBottom({ behavior: 'auto' }), delay);
      this.focusScrollTimers.push(timer);
    }
  }

  private clearFocusScrollTimers(): void {
    for (const timer of this.focusScrollTimers) {
      clearTimeout(timer);
    }
    this.focusScrollTimers = [];
  }

  /**
   * Subscribe to `AgentJobs/{contextId}/events` via Firestore `onSnapshot` for
   * background jobs (scrape, welcome graphic, etc.) that were enqueued without
   * an open SSE connection. Called after MongoDB history has been loaded so that
   * live events appear after the historical context, matching the stream registry
   * rehydration pattern used for normal chat.
   *
   * Guards:
   * - `contextId` must be set (it is the operationId)
   * - Only starts if no subscription is already active (idempotent)
   * - Cleans itself up on `done` / `error` / component destroy
   */
  private _subscribeToFirestoreJobEvents(
    explicitOperationId?: string,
    startAfterSeq?: number
  ): void {
    const operationId = explicitOperationId ?? this.contextId;
    if (!operationId?.trim() || this._activeFirestoreSub) return;

    // Viewing an existing in-flight operation is a new UI turn even when no user
    // message is sent from this component instance.
    this.beginResponseTurn('firestore-subscribe');

    this.logger.info('Attaching Firestore job event listener for background operation', {
      operationId,
      startAfterSeq,
    });
    this.breadcrumb.trackStateChange('operation-chat:firestore-subscribe', {
      operationId,
      startAfterSeq,
    });

    // Push a typing placeholder if one isn't already in the messages list.
    // The post-refresh code path pre-injects the bubble before calling this
    // method; the direct subscribe path (no thread) relies on this guard.
    if (!this.messages().some((m) => m.id === 'typing')) {
      this._loading.set(true);
      this.messages.update((msgs) => [
        ...msgs,
        {
          id: 'typing',
          role: 'assistant' as const,
          content: '',
          timestamp: new Date(),
          isTyping: true,
        },
      ]);
    }

    this._activeFirestoreSub = runInInjectionContext(this.injector, () =>
      this.operationEventService.subscribe(
        operationId,
        {
          onDelta: (text) => {
            this.queueTypingDelta(text);
          },

          onStep: (step) => {
            this.flushPendingTypingDelta();
            this.messages.update((msgs) =>
              msgs.map((m) => {
                if (m.id !== 'typing') return m;
                const prev = m.steps ?? [];
                const idx = prev.findIndex((s) => s.id === step.id);
                const next =
                  idx >= 0 ? prev.map((s, i) => (i === idx ? step : s)) : [...prev, step];
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
            this.flushPendingTypingDelta();
            this.messages.update((msgs) =>
              msgs.map((m) => {
                if (m.id !== 'typing') return m;
                const prevParts = [...(m.parts ?? [])];
                prevParts.push({ type: 'card', card });
                return { ...m, cards: [...(m.cards ?? []), card], parts: prevParts };
              })
            );
          },

          onProgress: (event) => {
            const message = typeof event.message === 'string' ? event.message.trim() : '';
            if (!message) return;
            this._latestProgressLabel.set(message);
          },

          onDone: (evt) => {
            this.flushPendingTypingDelta();
            this._latestProgressLabel.set(null);
            this.finalizeStreamedAssistantMessage({
              streamingId: 'typing',
              messageId: evt.messageId,
              success: evt.success,
              source: 'firestore-done',
            });
            this._loading.set(false);
            this._activeFirestoreSub?.unsubscribe();
            this._activeFirestoreSub = null;
            this.haptics.notification('success').catch(() => undefined);
            this.emitResponseCompleteOnce('firestore-done');
            this.logger.info('Background job stream complete (Firestore)', {
              operationId,
            });
          },

          onError: (error) => {
            this._latestProgressLabel.set(null);
            this.replaceTyping({
              id: this.uid(),
              role: 'assistant',
              content: error || 'Something went wrong. Please try again.',
              timestamp: new Date(),
              error: true,
            });
            this._loading.set(false);
            this._activeFirestoreSub?.unsubscribe();
            this._activeFirestoreSub = null;
            this.haptics.notification('error').catch(() => undefined);
            this.logger.error('Background job stream error (Firestore)', new Error(error), {
              operationId,
            });
            // Trigger a parent refresh so the operations log re-fetches the
            // authoritative status from the backend. Firestore may have errored
            // before the done event arrived, leaving the sidebar spinner stuck.
            this.emitResponseCompleteOnce('firestore-error');
          },
        },
        startAfterSeq !== undefined ? { startAfterSeq } : undefined
      )
    );
  }

  /**
   * Load a historical thread into this isolated operation chat view.
   * Preserves the operation sheet UX while showing the persisted conversation.
   */
  private async loadThreadMessages(threadId: string): Promise<void> {
    this._loading.set(true);
    this.logger.info('Loading operation thread', { threadId, contextId: this.contextId });

    try {
      const { messages: items, latestPausedYieldState } =
        await this.agentXService.getPersistedThreadMessages(threadId);
      const persistedPendingYieldState = this.coercePersistedYieldState(latestPausedYieldState);

      if (!items.length) {
        if (persistedPendingYieldState) {
          this.messages.set([]);
          this.applyPendingYieldState(
            persistedPendingYieldState,
            threadId,
            'thread-metadata-empty'
          );
          return;
        }

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
        const persistedSteps: AgentXToolStep[] = (msg.steps ?? []).map((step) => {
          const normalized = {
            ...step,
            label: getToolStepDisplayLabel(step),
          } satisfies AgentXToolStep;
          return normalized;
        });

        const fallbackSteps: AgentXToolStep[] = (msg.toolCalls ?? []).map((tc, idx) => ({
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

        const steps = persistedSteps.length > 0 ? persistedSteps : fallbackSteps;
        const persistedParts =
          msg.parts?.map((part) =>
            part.type === 'tool-steps'
              ? {
                  type: 'tool-steps' as const,
                  steps: part.steps.map((step) => ({
                    ...step,
                    label: getToolStepDisplayLabel(step),
                  })),
                }
              : part.type === 'card'
                ? {
                    type: 'card' as const,
                    card: {
                      ...part.card,
                      agentId:
                        typeof (part.card as { agentId?: unknown }).agentId === 'string'
                          ? (part.card as { agentId: AgentXRichCard['agentId'] }).agentId
                          : 'router',
                    },
                  }
                : part
          ) ?? [];

        return {
          id: msg.id ?? this.uid(),
          role: msg.role === 'user' ? ('user' as const) : ('assistant' as const),
          operationId: typeof msg.operationId === 'string' ? msg.operationId : undefined,
          // Strip model-context attachment annotations from legacy rows.
          // UI should show attachment cards, never raw URL reference text.
          content: msg.content.replace(/\n\n\[Attached (?:file|video): .+/gs, '').trim(),
          timestamp: msg.createdAt ? new Date(msg.createdAt) : new Date(),
          ...(steps.length > 0 ? { steps } : {}),
          ...(persistedParts.length > 0 ? { parts: persistedParts } : {}),
          ...(typeof msg.resultData?.['imageUrl'] === 'string'
            ? { imageUrl: msg.resultData['imageUrl'] as string }
            : {}),
          ...(typeof msg.resultData?.['videoUrl'] === 'string'
            ? { videoUrl: msg.resultData['videoUrl'] as string }
            : {}),
          ...((msg.attachments?.length ?? 0) > 0
            ? {
                attachments: (msg.attachments ?? []).map((a) => ({
                  url: a.url,
                  name: a.name,
                  type: (a.type === 'image' ? 'image' : a.type === 'video' ? 'video' : 'doc') as
                    | 'image'
                    | 'video'
                    | 'doc',
                })),
              }
            : {}),
        };
      });

      this.messages.set(mapped);

      // Recover the most recent Firestore operation id from persisted messages.
      // On session re-entry, contextId can be a non-Firestore id (e.g. thread id),
      // but paused/awaiting yield rehydration requires a real AgentJobs operationId.
      const latestMessageOperationId = [...items]
        .reverse()
        .map((msg) => (typeof msg.operationId === 'string' ? msg.operationId.trim() : ''))
        .find((id) => this.isFirestoreOperationId(id));
      if (latestMessageOperationId) {
        this._currentOperationId = latestMessageOperationId;
      }

      // Thread metadata is the canonical persisted source for paused yields.
      // Hydrate it before any status reconciliation so the resume card renders
      // regardless of whether an assistant message exists.
      if (persistedPendingYieldState) {
        this.applyPendingYieldState(persistedPendingYieldState, threadId, 'thread-metadata');
      }

      // loadThreadMessages replaces the full timeline; if a pending yield was
      // already known (input setter / stream / rehydrate), project it back into
      // the shared message list so rich cards do not disappear on revisit.
      const activeYield = this.activeYieldState();
      if (activeYield) {
        this.upsertInlineYieldMessage(activeYield, this._currentOperationId ?? this.contextId);
      }

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

      // ── Status reconciliation ─────────────────────────────────────────
      // If the sidebar still shows this entry as "processing" but the thread
      // already has an assistant reply, the backend completed the job while
      // the frontend had no live stream to receive the done event (e.g. the
      // user refreshed mid-response). The thread content is the authoritative
      // proof of completion — reconcile without waiting for an event that
      // will never arrive.
      const hasAssistantReply = mapped.some((m) => m.role === 'assistant' && m.content?.trim());
      if (this.operationStatus === 'processing' && hasAssistantReply && !this.activeYieldState()) {
        // Fallback for legacy data where thread metadata has no paused yield
        // but Firestore event state still contains one.
        let pendingYieldState: AgentYieldState | null = null;

        const operationId = this.resolveFirestoreOperationId();
        if (operationId) {
          const stored = await this.operationEventService.getStoredEventState(operationId);
          pendingYieldState = stored.latestYieldState;
        }

        if (pendingYieldState) {
          this.applyPendingYieldState(pendingYieldState, threadId, 'firestore-fallback');
        } else {
          this.logger.info(
            'Thread content proves job complete — reconciling stale in-progress status',
            {
              threadId,
              contextId: this.contextId,
            }
          );
          this.operationStatus = 'complete';
          // Broadcast directly through the shared event service so the operations
          // log sidebar updates regardless of how this component was opened
          // (bottom sheet, embedded, etc.). responseComplete.emit() is an @Output
          // and is deaf when the component is opened imperatively via openSheet().
          this.operationEventService.emitOperationStatusUpdated(
            threadId,
            'complete',
            new Date().toISOString()
          );
        }
      }

      // Persisted thread history can contain stale `active` tool states when a
      // refresh happened before the final status write landed in MongoDB.
      // Normalize here so completed/error operations never keep spinning icons.
      if (
        this.operationStatus === 'complete' ||
        (this.operationStatus !== 'processing' && hasAssistantReply)
      ) {
        this.settleActiveToolSteps('success');
      } else if (
        this.operationStatus === 'error' ||
        this.operationStatus === 'paused' ||
        this.operationStatus === 'awaiting_input' ||
        this.operationStatus === 'awaiting_approval'
      ) {
        this.settleActiveToolSteps('error');
      }

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
   * Pause the active stream and persist a resumable backend paused state.
   *
   * Unlike cancel, pause keeps the operation resumable via /resume-job.
   */
  pauseStream(): void {
    let pausedOperationId: string | null = null;
    const threadId = this._resolvedThreadId();
    if (threadId) {
      this.streamRegistry.abort(threadId);
    }

    if (this.activeStream) {
      this.activeStream.abort();
      this.activeStream = null;
    }

    if (this._currentOperationId) {
      const opId = this._currentOperationId;
      pausedOperationId = opId;
      this._firePauseRequest(opId);
    }

    this.messages.update((msgs) =>
      msgs.map((m) => {
        const hasTyping = m.isTyping === true;
        const hasActiveSteps = m.steps?.some((s) => s.status === 'active');
        const hasActiveParts = m.parts?.some(
          (p) => p.type === 'tool-steps' && p.steps.some((s) => s.status === 'active')
        );
        if (!hasTyping && !hasActiveSteps && !hasActiveParts) return m;

        const pauseStep = (s: AgentXToolStep): AgentXToolStep =>
          s.status === 'active' ? { ...s, status: 'error', label: 'Paused' } : s;

        return {
          ...m,
          isTyping: false,
          steps: m.steps?.map(pauseStep),
          parts: m.parts?.map((p) =>
            p.type === 'tool-steps' ? { ...p, steps: p.steps.map(pauseStep) } : p
          ),
        };
      })
    );

    this._loading.set(false);

    const targetOperationId = pausedOperationId ?? this.contextId;
    if (targetOperationId) {
      // Ensure the effect that mirrors activeYieldState into the timeline uses
      // the same operation id so pause cards update in place (no duplicates).
      this._currentOperationId = targetOperationId;
      const pauseYieldState = this.buildLocalPauseYieldState(targetOperationId);
      this.activeYieldState.set(pauseYieldState);
      this.yieldResolved.set(false);
    }

    this.logger.info('Stream paused by user');
    this.breadcrumb.trackStateChange('agent-x-operation-chat:stream-paused', {
      contextId: this.contextId,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_STREAM_PAUSED, {
      threadId: threadId ?? undefined,
      contextId: this.contextId,
      contextType: this.contextType,
    });

    if (threadId) {
      this.operationEventService.emitOperationStatusUpdated(
        threadId,
        'paused',
        new Date().toISOString()
      );
    }
  }

  private buildLocalPauseYieldState(operationId: string): AgentYieldState {
    const nowIso = new Date().toISOString();
    const expiresAtIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const existing = this.activeYieldState();

    return {
      reason: 'needs_input',
      promptToUser: 'Operation paused. Resume whenever you are ready.',
      agentId: (existing?.agentId ?? 'router') as AgentYieldState['agentId'],
      messages: existing?.messages ?? [],
      ...(existing?.planContext ? { planContext: existing.planContext } : {}),
      pendingToolCall: {
        toolName: PAUSE_RESUME_TOOL_NAME,
        toolInput: {
          operationId,
          pauseRequestedAt: nowIso,
        },
        toolCallId: existing?.pendingToolCall?.toolCallId ?? `pause_resume_${operationId}`,
      },
      yieldedAt: nowIso,
      expiresAt: expiresAtIso,
    };
  }

  /**
   * Cancel the active SSE stream (if any) and reset loading state.
   * Bound to the explicit "Cancel run" action in the input footer.
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
        const hasTyping = m.isTyping === true;
        const hasActiveSteps = m.steps?.some((s) => s.status === 'active');
        const hasActiveParts = m.parts?.some(
          (p) => p.type === 'tool-steps' && p.steps.some((s) => s.status === 'active')
        );
        if (!hasTyping && !hasActiveSteps && !hasActiveParts) return m;

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

    // Immediately mark the operations-log entry as complete so the sidebar
    // spinner clears right away. The backend SSE will never deliver the terminal
    // `event: operation` frame for an aborted stream, so we emit locally here.
    if (threadId) {
      this.operationEventService.emitOperationStatusUpdated(
        threadId,
        'complete',
        new Date().toISOString()
      );
    }
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

  /**
   * Fire-and-forget POST to explicit pause endpoint.
   * Non-critical for UX responsiveness; local stream abort remains immediate.
   * @internal
   */
  private _firePauseRequest(operationId: string): void {
    const url = `${this.baseUrl}/agent-x/pause/${operationId}`;
    this.getAuthToken?.()
      .then((token) => {
        if (!token) return;
        return firstValueFrom(
          this.http.post(url, {}, { headers: { Authorization: `Bearer ${token}` } })
        );
      })
      .catch((err) => {
        this.logger.debug('Explicit pause request failed (non-critical)', {
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

    // Lock immediately — before any state mutations — to prevent concurrent sends
    // triggered by tap + click double-emit (Ionic mobile) or rapid input events.
    this._loading.set(true);

    this.inputValue.set('');
    if (!this.hasUserSent()) {
      this.hasUserSent.set(true);
      this.userMessageSent.emit();
    }

    const activeYield = this.activeYieldState();
    const pausedOperationId =
      activeYield?.pendingToolCall?.toolName === PAUSE_RESUME_TOOL_NAME
        ? this.yieldOperationId()
        : null;

    // A user can intentionally move on from a paused operation by sending a
    // brand-new message. Keep this as a NORMAL chat send (new turn with full
    // thread context), and abandon the paused card state.
    if (pausedOperationId) {
      this.logger.info('New message sent while paused; abandoning paused operation state', {
        pausedOperationId,
        contextId: this.contextId,
      });
      this.breadcrumb.trackUserAction('send-while-paused', {
        operationId: pausedOperationId,
      });

      // Best-effort cancel clears persisted paused state on the backend thread.
      // If this fails, normal send still proceeds and the stream events can
      // overwrite stale state.
      this._fireCancelRequest(pausedOperationId);

      // Prevent stale paused operation IDs from being reused by a rapid
      // follow-up pause tap before the new stream publishes onThread/onOperation.
      this._currentOperationId = null;

      this.activeYieldState.set(null);
      this.yieldResolved.set(true);
      this.messages.update((messages) =>
        messages.filter(
          (message) =>
            !(
              message.operationId === pausedOperationId &&
              message.yieldState?.pendingToolCall?.toolName === PAUSE_RESUME_TOOL_NAME
            )
        )
      );

      // Transition the operation view back into active send mode for this turn.
      this.operationStatus = 'processing';
    }

    // Capture and clear connected sources
    const pendingSources = this.pendingConnectedSources();
    this.pendingConnectedSources.set([]);

    // Build display content — append source context if present
    let displayContent = text;
    if (!text && files.length > 0) {
      displayContent = `📎 ${files.length} file${files.length > 1 ? 's' : ''}`;
    }
    if (pendingSources.length > 0) {
      const sourceLabels = pendingSources.map((s) => s.platform).join(', ');
      displayContent = displayContent
        ? `${displayContent} [via ${sourceLabels}]`
        : `[via ${sourceLabels}]`;
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
    this.beginResponseTurn('send');
    this.pushMessage({
      id: 'typing',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isTyping: true,
    });

    try {
      // Upload files to Firebase Storage and get AgentXAttachment metadata
      let uploadedAttachments: AgentXAttachment[] = [];
      if (files.length > 0) {
        const authToken = await this.getAuthToken?.().catch(() => null);
        if (authToken) {
          uploadedAttachments = await this._uploadFiles(files, authToken);
          if (uploadedAttachments.length === 0) {
            this.replaceTyping({
              id: this.uid(),
              role: 'assistant',
              content:
                'I could not upload your attachment(s). Please check your connection and try again.',
              timestamp: new Date(),
              error: true,
            });
            await this.haptics.notification('error');
            return;
          }
        } else {
          this.logger.error('Auth token unavailable — staged attachments cannot be sent to AI', {
            count: files.length,
            contextId: this.contextId,
          });
          this.breadcrumb.trackUserAction('agent-x-upload-auth-missing', {
            contextId: this.contextId,
            stagedFileCount: files.length,
          });
          this.analytics?.trackEvent(APP_EVENTS.AGENT_X_ERROR_AUTH_MISSING, {
            contextId: this.contextId,
            contextType: this.contextType,
            stagedFileCount: files.length,
          });
          this.toast.error(
            `Session expired: ${files.length} attached file(s) cannot be sent. Please re-authenticate.`
          );
          this.replaceTyping({
            id: this.uid(),
            role: 'assistant',
            content: 'Your session expired before attachments could upload. Please sign in again.',
            timestamp: new Date(),
            error: true,
          });
          await this.haptics.notification('error');
          return;
        }
      }

      await this.callAgentChat(displayContent, uploadedAttachments);
      await this.haptics.notification('success');
    } catch (err) {
      this.logger.error('Chat message failed', err, { contextId: this.contextId });
      await this.haptics.notification('error');
      // Only inject the error bubble if onError (stream handler) didn't already do it.
      // onError replaces the typing bubble then rejects — the catch would otherwise duplicate it.
      const alreadyHasError = this.messages().some((m) => m.error && m.id !== 'typing');
      if (!alreadyHasError) {
        this.replaceTyping({
          id: this.uid(),
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
          timestamp: new Date(),
          error: true,
        });
      }
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

  /** Retry the last user message after an error bubble's "Try again" is clicked. */
  protected async onRetryErrorMessage(errorMsg: OperationMessage): Promise<void> {
    // Find the user message that preceded this error bubble
    const msgs = this.messages();
    const errorIdx = msgs.findIndex((m) => m.id === errorMsg.id);
    const lastUserMsg = [...msgs]
      .slice(0, errorIdx)
      .reverse()
      .find((m) => m.role === 'user');

    if (!lastUserMsg) return;

    // Remove the error bubble and re-send the last user message
    this.messages.update((prev) => prev.filter((m) => m.id !== errorMsg.id));
    this.inputValue.set(lastUserMsg.content);
    await this.send();
  }

  /** Open attachments bottom sheet over this operation sheet without dismissing it. */
  protected async onUploadClick(): Promise<void> {
    // Desktop embedded mode (web): use inline professional menu, not mobile bottom-sheet UI.
    if (this.isDesktopAttachmentMenuMode()) {
      this.showDesktopAttachmentMenu.update((open) => !open);
      return;
    }

    // Always read from AgentXService so connected sources are available regardless
    // of whether this sheet was opened from the shell, the operations log, or anywhere else.
    const sources = this.agentXService.attachmentConnectedSources();
    const modal = await this.modalCtrl.create({
      component: AgentXAttachmentsSheetComponent,
      componentProps: {
        connectedSources: sources,
      },
      breakpoints: [0, 0.5, 0.72],
      initialBreakpoint: 0.5,
      expandToScroll: false,
      handle: true,
      handleBehavior: 'cycle',
      showBackdrop: true,
      backdropBreakpoint: 0.5,
      backdropDismiss: true,
      canDismiss: true,
      cssClass: ['nxt-bottom-sheet', 'nxt-bottom-sheet-content'],
    });

    await modal.present();
    const result = await modal.onWillDismiss<File[] | ConnectedAppSource>();

    if (result.data && result.role === 'files-selected') {
      const files = result.data as File[];
      this.stageFiles(files);
      return;
    }

    if (result.data && result.role === 'source-selected') {
      const source = result.data as ConnectedAppSource;
      this.pendingConnectedSources.update((current) => {
        const exists = current.some(
          (item) => item.platform === source.platform && item.profileUrl === source.profileUrl
        );
        return exists ? current : [...current, source];
      });
      return;
    }

    if (result.role === 'manage-connected-apps') {
      await this.openConnectedAccountsModal();
    }
  }

  protected closeDesktopAttachmentMenu(): void {
    this.showDesktopAttachmentMenu.set(false);
  }

  /** Close desktop attachment menu when clicking anywhere outside the menu/attach trigger. */
  protected onShellClick(event: MouseEvent): void {
    if (!this.showDesktopAttachmentMenu()) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    if (target.closest('.desktop-attach-menu') || target.closest('.input-btn--attach')) {
      return;
    }

    this.closeDesktopAttachmentMenu();
  }

  protected onDesktopAttachmentUploadClick(): void {
    this.showDesktopAttachmentMenu.set(false);
    this.desktopAttachmentFileInput()?.nativeElement.click();
  }

  protected async onDesktopAttachmentFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';

    if (!files.length) {
      return;
    }

    const addedCount = this.stageFiles(files);
    if (addedCount > 0) {
      await this.haptics.impact('light');
    }
  }

  protected onDesktopAttachmentSourceSelected(source: ConnectedAppSource): void {
    this.pendingConnectedSources.update((current) => {
      const exists = current.some(
        (item) => item.platform === source.platform && item.profileUrl === source.profileUrl
      );
      return exists ? current : [...current, source];
    });
    this.showDesktopAttachmentMenu.set(false);
  }

  protected async onDesktopManageConnectedApps(): Promise<void> {
    this.showDesktopAttachmentMenu.set(false);
    await this.openConnectedAccountsModal();
  }

  private async openConnectedAccountsModal(): Promise<void> {
    const user = this.user;
    const role = (user?.role as OnboardingUserType) ?? null;
    const { ConnectedAccountsModalService } = await import('../components/connected-sources');
    const service = runInInjectionContext(this.injector, () =>
      inject(ConnectedAccountsModalService)
    );
    const result = await service.open({
      role,
      selectedSports: user?.selectedSports ?? [],
      linkSourcesData: buildLinkSourcesFormData({
        connectedSources: user?.connectedSources ?? [],
        connectedEmails: user?.connectedEmails ?? [],
        firebaseProviders: user?.firebaseProviders ?? [],
      }) as LinkSourcesFormData | null,
      scope: role === 'coach' || role === 'director' ? 'team' : 'athlete',
    });

    if (result.linkSources) {
      this.connectedAccountsSave.emit({
        linkSources: result.linkSources,
        requestResync: result.resync === true,
        resyncSources: result.sources ?? [],
      });
    }
  }

  private isDesktopAttachmentMenuMode(): boolean {
    return this.embedded && isPlatformBrowser(this.platformId) && window.innerWidth >= 768;
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
   * Upload pending files. Videos go via Cloudflare Stream TUS;
   * images, PDFs, docs go via the existing Firebase Storage endpoint.
   * Returns AgentXAttachment metadata for inclusion in the chat request.
   * Tracks upload success/failure with observability (logging, analytics, breadcrumbs, toasts).
   * @internal
   */
  private async _uploadFiles(
    files: readonly PendingFile[],
    authToken: string
  ): Promise<AgentXAttachment[]> {
    const UPLOAD_TIMEOUT_MS = 20_000;
    const MAX_UPLOAD_ATTEMPTS = 2;

    const uploaded: AgentXAttachment[] = [];
    const failed: string[] = [];

    const videoFiles = files.filter((f) => f.isVideo);
    const nonVideoFiles = files.filter((f) => !f.isVideo);

    // --- Non-video files: upload to Firebase Storage via /agent-x/upload ---
    for (const pending of nonVideoFiles) {
      const formData = new FormData();
      formData.append('file', pending.file);
      const threadId = this._resolvedThreadId();
      // threadId may be null on first message (SSE thread event fires after upload starts).
      // Backend accepts null and uses fallback unbound storage path.
      if (threadId) formData.append('threadId', threadId);

      let uploadedThisFile = false;
      let lastErrorMessage = 'Unknown upload failure';

      for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
        try {
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => abortController.abort(), UPLOAD_TIMEOUT_MS);

          const response = await fetch(`${this.baseUrl}${AGENT_X_ENDPOINTS.UPLOAD}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${authToken}` },
            body: formData,
            signal: abortController.signal,
          }).finally(() => clearTimeout(timeoutId));

          if (!response.ok) {
            const errText = await response.text().catch(() => 'Upload failed');
            lastErrorMessage = `HTTP ${response.status}: ${errText || 'Unknown error'}`;
            throw new Error(lastErrorMessage);
          }

          const result = (await response.json()) as {
            success: boolean;
            data?: {
              url: string;
              storagePath?: string;
              name: string;
              mimeType: string;
              sizeBytes: number;
            };
            error?: string;
          };

          if (!result.success || !result.data) {
            lastErrorMessage = result.error || 'Unknown backend error';
            throw new Error(lastErrorMessage);
          }

          uploaded.push({
            id: crypto.randomUUID(),
            url: result.data.url,
            ...(result.data.storagePath ? { storagePath: result.data.storagePath } : {}),
            name: result.data.name,
            mimeType: result.data.mimeType,
            type: resolveAttachmentType(result.data.mimeType),
            sizeBytes: result.data.sizeBytes,
          });

          this.logger.info('File uploaded successfully', {
            contextId: this.contextId,
            fileName: pending.file.name,
            fileSize: pending.file.size,
            mimeType: result.data.mimeType,
            hasThreadId: !!threadId,
            attempt,
          });

          uploadedThisFile = true;
          break;
        } catch (err) {
          lastErrorMessage = err instanceof Error ? err.message : String(err);

          if (attempt < MAX_UPLOAD_ATTEMPTS) {
            this.logger.warn('File upload attempt failed; retrying once', {
              contextId: this.contextId,
              fileName: pending.file.name,
              attempt,
              maxAttempts: MAX_UPLOAD_ATTEMPTS,
              errorMessage: lastErrorMessage,
            });
            continue;
          }

          this.logger.error('File upload failed after retries', err, {
            contextId: this.contextId,
            fileName: pending.file.name,
            fileSize: pending.file.size,
            fileMimeType: pending.file.type,
            hasThreadId: !!threadId,
            maxAttempts: MAX_UPLOAD_ATTEMPTS,
            errorMessage: lastErrorMessage,
          });
          this.breadcrumb.trackUserAction('agent-x-upload-network-error', {
            contextId: this.contextId,
            fileName: pending.file.name,
          });
        }
      }

      if (!uploadedThisFile) {
        failed.push(pending.file.name);
      }
    }

    // Track upload metrics and show user feedback
    if (nonVideoFiles.length > 0) {
      this.logger.info('Non-video attachment upload batch complete', {
        contextId: this.contextId,
        attempted: nonVideoFiles.length,
        succeeded: uploaded.length,
        failed: failed.length,
        failedNames: failed,
      });

      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_ATTACHMENTS_UPLOADED, {
        contextId: this.contextId,
        contextType: this.contextType,
        totalAttempted: nonVideoFiles.length,
        successCount: uploaded.length,
        failureCount: failed.length,
        failureReasons: 'see breadcrumbs',
      });

      // Show user feedback if any uploads failed
      if (failed.length > 0 && failed.length === nonVideoFiles.length) {
        // All failed
        this.toast.error(
          `All ${failed.length} file(s) failed to upload. Check your connection and try again.`
        );
      } else if (failed.length > 0) {
        // Partial failure
        this.toast.warning(
          `${failed.length} of ${nonVideoFiles.length} file(s) failed to upload: ${failed.join(', ')}. Other files sent.`
        );
      }
    }

    // --- Video files: upload to Cloudflare Stream via TUS ---
    for (const pending of videoFiles) {
      try {
        this._videoUploadPercent.set(0);
        const videoResult = await new Promise<{ streamUrl: string; cloudflareVideoId: string }>(
          (resolve, reject) => {
            this.videoUploadService.uploadVideo(pending.file, authToken).subscribe({
              next: (progress) => {
                // Pipe intermediate progress into signal — user sees live % in the typing area
                if (progress.phase === 'uploading' || progress.phase === 'provisioning') {
                  this._videoUploadPercent.set(progress.percent);
                }
                if (
                  progress.phase === 'complete' &&
                  progress.streamUrl &&
                  progress.cloudflareVideoId
                ) {
                  this._videoUploadPercent.set(100);
                  resolve({
                    streamUrl: progress.streamUrl,
                    cloudflareVideoId: progress.cloudflareVideoId,
                  });
                } else if (progress.phase === 'error') {
                  reject(new Error(progress.errorMessage ?? 'Video upload failed'));
                }
              },
              error: (err) => reject(err),
            });
          }
        );
        this._videoUploadPercent.set(null);

        uploaded.push({
          id: crypto.randomUUID(),
          url: videoResult.streamUrl,
          name: pending.file.name,
          mimeType: pending.file.type,
          type: 'video',
          sizeBytes: pending.file.size,
          cloudflareVideoId: videoResult.cloudflareVideoId,
        });
      } catch (err) {
        this._videoUploadPercent.set(null);
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.error('Video Cloudflare upload failed', err, {
          contextId: this.contextId,
          fileName: pending.file.name,
          fileSize: pending.file.size,
          errorMessage: errorMsg,
        });
        this.breadcrumb.trackUserAction('agent-x-video-upload-error', {
          contextId: this.contextId,
          fileName: pending.file.name,
          errorType: err instanceof Error ? 'network' : 'unknown',
        });
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_VIDEO_UPLOAD_FAILED, {
          contextId: this.contextId,
          contextType: this.contextType,
          fileName: pending.file.name,
          errorMessage: errorMsg,
        });
        failed.push(pending.file.name);
      }
    }

    // Track video upload metrics
    if (videoFiles.length > 0) {
      const videoFailureCount = failed.filter((f) =>
        videoFiles.some((v) => v.file.name === f)
      ).length;
      this.logger.info('Video attachment upload batch complete', {
        contextId: this.contextId,
        attempted: videoFiles.length,
        succeeded: videoFiles.length - videoFailureCount,
        failed: videoFailureCount,
      });
    }

    this.logger.info('All file uploads complete for operation chat', {
      contextId: this.contextId,
      totalAttempted: files.length,
      totalSucceeded: uploaded.length,
      totalFailed: failed.length,
      videos: videoFiles.length,
      nonVideos: nonVideoFiles.length,
    });

    return uploaded;
  }

  /** Open the media viewer for a pending file thumbnail. */
  protected openPendingFileViewer(index: number): void {
    const viewer = buildPendingAttachmentViewer(this.pendingFiles(), index, {
      createObjectURL: (file) => URL.createObjectURL(file),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
    });

    if (!viewer.items.length) return;

    this.mediaViewer
      .open({
        items: viewer.items,
        initialIndex: viewer.initialIndex,
        showShare: false,
        source: 'agent-x-pending',
        presentation: 'overlay',
      })
      .finally(() => viewer.cleanup());
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

  protected isPersistedMessageId(messageId: string): boolean {
    return /^[a-f0-9]{24}$/i.test(messageId);
  }

  protected onExecutionPlanToggle(event: Event): void {
    const details = event.currentTarget as HTMLDetailsElement | null;
    this.executionPlanExpanded.set(Boolean(details?.open));
  }

  private settleActiveToolSteps(status: 'success' | 'error'): void {
    this.messages.update((msgs) =>
      msgs.map((message) => {
        const hasActiveSteps = message.steps?.some((step) => step.status === 'active');
        const hasActiveParts = message.parts?.some(
          (part) =>
            part.type === 'tool-steps' && part.steps.some((step) => step.status === 'active')
        );
        if (!hasActiveSteps && !hasActiveParts) return message;

        const finalizeStep = (step: AgentXToolStep): AgentXToolStep =>
          step.status === 'active' ? { ...step, status } : step;

        return {
          ...message,
          steps: message.steps?.map(finalizeStep),
          parts: message.parts?.map((part) =>
            part.type === 'tool-steps' ? { ...part, steps: part.steps.map(finalizeStep) } : part
          ),
        };
      })
    );
  }

  private finalizeStreamedAssistantMessage(params: {
    streamingId: string;
    messageId?: string;
    success?: boolean;
    threadId?: string;
    source: string;
  }): void {
    const streamedMessage = this.messages().find((m) => m.id === params.streamingId);
    const hasVisibleContent =
      Boolean(streamedMessage?.content.trim()) ||
      Boolean(streamedMessage?.parts?.length) ||
      Boolean(streamedMessage?.cards?.length) ||
      Boolean(streamedMessage?.steps?.length);

    const persistedMessageId =
      typeof params.messageId === 'string' && this.isPersistedMessageId(params.messageId)
        ? params.messageId
        : null;

    this.settleActiveToolSteps(params.success === false ? 'error' : 'success');

    if (persistedMessageId) {
      this.messages.update((msgs) =>
        msgs.map((m) =>
          m.id === params.streamingId ? { ...m, id: persistedMessageId, isTyping: false } : m
        )
      );
      return;
    }

    if (params.success === false) {
      const localFailureId = this.uid();
      this.messages.update((msgs) =>
        msgs.map((m) =>
          m.id === params.streamingId ? { ...m, id: localFailureId, isTyping: false } : m
        )
      );
      return;
    }

    const resolvedThreadId =
      (typeof params.threadId === 'string' && params.threadId.trim().length > 0
        ? params.threadId.trim()
        : null) ??
      this._resolvedThreadId() ??
      (this.threadId?.trim() || null);

    this.logger.error(
      'Successful streamed assistant completion missing persisted DB message ID',
      new Error('Missing persisted DB message ID'),
      {
        source: params.source,
        contextId: this.contextId,
        contextType: this.contextType,
        streamingId: params.streamingId,
        threadId: resolvedThreadId,
      }
    );

    this.messages.update((msgs) =>
      msgs.map((m) =>
        m.id === params.streamingId
          ? {
              ...m,
              isTyping: false,
              content: hasVisibleContent
                ? m.content
                : 'Resumed. Waiting for synced updates from Agent X…',
            }
          : m
      )
    );

    if (resolvedThreadId) {
      void this.loadThreadMessages(resolvedThreadId).catch((err) => {
        this.logger.error('Failed to reload persisted thread after missing DB message ID', err, {
          source: params.source,
          contextId: this.contextId,
          threadId: resolvedThreadId,
        });
      });
    }
  }

  protected async copyMessageContent(msg: OperationMessage): Promise<void> {
    const text = msg.content.trim();
    if (!text) return;

    this.logger.info('Copying operation chat message', {
      contextId: this.contextId,
      contextType: this.contextType,
      messageId: msg.id,
      role: msg.role,
    });
    this.breadcrumb.trackUserAction('agent-x-message-copy', {
      contextId: this.contextId,
      contextType: this.contextType,
      messageId: msg.id,
      role: msg.role,
    });

    try {
      const copied = await this.copyText(text);
      if (!copied) {
        this.logger.warn('Failed to copy operation chat message to clipboard', {
          contextId: this.contextId,
          messageId: msg.id,
        });
        this.toast.error('Failed to copy message');
        return;
      }

      await this.haptics.impact('light');
      this.toast.success('Message copied');
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_COPIED, {
        contextId: this.contextId,
        contextType: this.contextType,
        role: msg.role,
      });

      if (this.isPersistedMessageId(msg.id)) {
        await this.api.annotateMessage(msg.id, {
          action: 'copied',
          metadata: { source: 'operation-chat' },
        });
      }
    } catch (err) {
      this.logger.error('Copy message action failed', err, {
        contextId: this.contextId,
        contextType: this.contextType,
        messageId: msg.id,
      });
      this.toast.error('Failed to copy message');
    }
  }

  protected openFeedbackModal(msg: OperationMessage): void {
    if (!this.isPersistedMessageId(msg.id) || msg.role !== 'assistant') return;

    this.logger.info('Opening message feedback modal', {
      contextId: this.contextId,
      contextType: this.contextType,
      messageId: msg.id,
    });
    this.breadcrumb.trackUserAction('agent-x-message-feedback-opened', {
      contextId: this.contextId,
      contextType: this.contextType,
      messageId: msg.id,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_FEEDBACK_OPENED, {
      contextId: this.contextId,
      contextType: this.contextType,
    });

    this.feedbackTargetMessageId.set(msg.id);
    this.feedbackDefaultRating.set(5);
  }

  protected closeFeedbackModal(): void {
    this.feedbackTargetMessageId.set(null);
  }

  protected async submitMessageFeedbackFromModal(event: AgentXFeedbackSubmitEvent): Promise<void> {
    const messageId = this.feedbackTargetMessageId();
    const threadId = this.resolveActiveThreadId();
    if (!messageId || !threadId) return;

    this.logger.info('Submitting message feedback', {
      contextId: this.contextId,
      contextType: this.contextType,
      messageId,
      threadId,
      rating: event.rating,
      category: event.category ?? null,
    });
    this.breadcrumb.trackUserAction('agent-x-message-feedback-submit', {
      contextId: this.contextId,
      messageId,
      rating: event.rating,
      category: event.category ?? null,
    });

    try {
      const result = await this.api.submitMessageFeedback(messageId, {
        threadId,
        rating: event.rating,
        category: event.category,
        text: event.text,
      });

      if (!result.success) {
        this.logger.warn('Message feedback submission rejected', {
          contextId: this.contextId,
          contextType: this.contextType,
          messageId,
          threadId,
          error: result.error ?? null,
        });
        this.toast.error(result.error ?? 'Failed to submit feedback');
        return;
      }

      this.closeFeedbackModal();
      await this.haptics.impact('light');
      this.toast.success('Feedback submitted');
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_FEEDBACK_SUBMITTED, {
        contextId: this.contextId,
        contextType: this.contextType,
        rating: event.rating,
        feedbackCategory: event.category ?? undefined,
      });
    } catch (err) {
      this.logger.error('Message feedback submission failed', err, {
        contextId: this.contextId,
        contextType: this.contextType,
        messageId,
        threadId,
      });
      this.toast.error('Failed to submit feedback');
    }
  }

  protected isEditingMessage(messageId: string): boolean {
    return this.editingMessageId() === messageId;
  }

  protected startEditingMessage(msg: OperationMessage): void {
    if (msg.role !== 'user' || !this.isPersistedMessageId(msg.id)) return;

    this.logger.info('Opening inline message editor', {
      contextId: this.contextId,
      contextType: this.contextType,
      messageId: msg.id,
    });
    this.breadcrumb.trackUserAction('agent-x-message-edit-started', {
      contextId: this.contextId,
      contextType: this.contextType,
      messageId: msg.id,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_EDIT_STARTED, {
      contextId: this.contextId,
      contextType: this.contextType,
    });

    this.editingMessageId.set(msg.id);
    this.editingMessageDraft.set(msg.content);
  }

  protected cancelEditingMessage(): void {
    this.editingMessageId.set(null);
    this.editingMessageDraft.set('');
  }

  protected async saveEditedMessage(msg: OperationMessage, nextText: string): Promise<void> {
    if (!this.isPersistedMessageId(msg.id)) return;
    const trimmed = nextText.trim();
    if (!trimmed || trimmed === msg.content.trim()) {
      this.cancelEditingMessage();
      return;
    }

    const threadId = this.resolveActiveThreadId();
    if (!threadId) {
      this.toast.error('Unable to edit message without thread context');
      return;
    }

    this.logger.info('Saving inline message edit', {
      contextId: this.contextId,
      contextType: this.contextType,
      messageId: msg.id,
      threadId,
      length: trimmed.length,
    });
    this.breadcrumb.trackUserAction('agent-x-message-edit-submit', {
      contextId: this.contextId,
      contextType: this.contextType,
      messageId: msg.id,
      threadId,
    });

    try {
      const result = await this.api.editMessage(msg.id, {
        message: trimmed,
        threadId,
        reason: 'user_edit',
      });

      if (!result.success || !result.data) {
        this.logger.warn('Message edit rejected by backend', {
          contextId: this.contextId,
          contextType: this.contextType,
          messageId: msg.id,
          threadId,
          error: result.error ?? null,
        });
        this.toast.error(result.error ?? 'Failed to edit message');
        return;
      }

      this.messages.update((messages) =>
        messages.map((entry) => (entry.id === msg.id ? { ...entry, content: trimmed } : entry))
      );
      this.cancelEditingMessage();

      await this.haptics.notification('success');
      this.toast.success('Message edited. Regenerating response...');
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_EDIT_SAVED, {
        contextId: this.contextId,
        contextType: this.contextType,
        rerunEnqueued: !!result.data.rerunEnqueued,
      });

      if (result.data.rerunEnqueued && result.data.operationId) {
        await this._attachToResumedOperation({
          operationId: result.data.operationId,
          threadId,
        });
      }
    } catch (err) {
      this.logger.error('Saving inline message edit failed', err, {
        contextId: this.contextId,
        contextType: this.contextType,
        messageId: msg.id,
        threadId,
      });
      this.toast.error('Failed to edit message');
    }
  }

  protected async deleteMessage(msg: OperationMessage): Promise<void> {
    if (!this.isPersistedMessageId(msg.id)) return;
    const threadId = this.resolveActiveThreadId();
    if (!threadId) {
      this.toast.error('Unable to delete message without thread context');
      return;
    }

    this.logger.info('Deleting operation chat message', {
      contextId: this.contextId,
      contextType: this.contextType,
      messageId: msg.id,
      threadId,
      deleteResponse: msg.role === 'user',
    });
    this.breadcrumb.trackUserAction('agent-x-message-delete', {
      contextId: this.contextId,
      contextType: this.contextType,
      messageId: msg.id,
      threadId,
    });

    try {
      const result = await this.api.deleteMessage(msg.id, {
        threadId,
        deleteResponse: msg.role === 'user',
      });

      if (!result.success || !result.data) {
        this.logger.warn('Message delete rejected by backend', {
          contextId: this.contextId,
          contextType: this.contextType,
          messageId: msg.id,
          threadId,
          error: result.error ?? null,
        });
        this.toast.error(result.error ?? 'Failed to delete message');
        return;
      }

      this.messages.update((messages) =>
        messages.filter(
          (entry) =>
            entry.id !== result.data?.messageId &&
            entry.id !== (result.data?.deletedResponseMessageId ?? '__none__')
        )
      );

      await this.haptics.impact('light');

      this.pendingUndoState.set({
        messageId: msg.id,
        restoreTokenId: result.data.restoreTokenId,
        threadId,
      });
      this.undoBannerTriggerId.update((value) => value + 1);
      this.toast.success('Message deleted');
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_DELETED, {
        contextId: this.contextId,
        contextType: this.contextType,
        deleteResponse: msg.role === 'user',
      });
    } catch (err) {
      this.logger.error('Delete message action failed', err, {
        contextId: this.contextId,
        contextType: this.contextType,
        messageId: msg.id,
        threadId,
      });
      this.toast.error('Failed to delete message');
    }
  }

  protected clearUndoState(): void {
    this.pendingUndoState.set(null);
  }

  protected async undoDeletedMessage(): Promise<void> {
    const undoState = this.pendingUndoState();
    if (!undoState) return;

    this.logger.info('Restoring deleted operation chat message', {
      contextId: this.contextId,
      contextType: this.contextType,
      messageId: undoState.messageId,
      threadId: undoState.threadId,
    });
    this.breadcrumb.trackUserAction('agent-x-message-undo', {
      contextId: this.contextId,
      contextType: this.contextType,
      messageId: undoState.messageId,
      threadId: undoState.threadId,
    });

    try {
      const undoResult = await this.api.undoMessage(undoState.messageId, {
        restoreTokenId: undoState.restoreTokenId,
      });

      if (!undoResult.success) {
        this.logger.warn('Undo message rejected by backend', {
          contextId: this.contextId,
          contextType: this.contextType,
          messageId: undoState.messageId,
          threadId: undoState.threadId,
          error: undoResult.error ?? null,
        });
        this.toast.error(undoResult.error ?? 'Failed to restore message');
        return;
      }

      await this.loadThreadMessages(undoState.threadId);
      this.clearUndoState();
      this.toast.success('Message restored');
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_MESSAGE_UNDONE, {
        contextId: this.contextId,
        contextType: this.contextType,
      });
    } catch (err) {
      this.logger.error('Undo message action failed', err, {
        contextId: this.contextId,
        contextType: this.contextType,
        messageId: undoState.messageId,
        threadId: undoState.threadId,
      });
      this.toast.error('Failed to restore message');
    }
  }

  private resolveActiveThreadId(): string | null {
    const threadId = this._resolvedThreadId() ?? this.threadId.trim();
    return threadId && threadId.length > 0 ? threadId : null;
  }

  private async copyText(value: string): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) return false;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // Fallback below.
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
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

      const isVideoFile = file.type.startsWith('video/');
      const maxSize = isVideoFile ? AGENT_X_MAX_VIDEO_FILE_SIZE : AGENT_X_MAX_FILE_SIZE;
      const maxLabel = isVideoFile ? '500 MB' : '20 MB';
      if (file.size > maxSize) {
        this.toast.error(`File too large: ${file.name} (max ${maxLabel})`);
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

  /** Returns true when a message contains a data-table rich card (cards or parts). */
  protected msgHasDataTable(msg: OperationMessage): boolean {
    if (msg.cards?.some((c) => c.type === 'data-table')) return true;
    if (msg.parts?.some((p) => p.type === 'card' && p.card.type === 'data-table')) return true;
    return false;
  }

  /** Hide planner cards inline in bubbles; planner is rendered once in the composer dock. */
  protected messageCardsForBubble(msg: OperationMessage): readonly AgentXRichCard[] {
    return (msg.cards ?? []).filter((card) => card.type !== 'planner');
  }

  /** Hide planner card parts inline in bubbles; planner is rendered once in the composer dock. */
  protected messagePartsForBubble(msg: OperationMessage): readonly AgentXMessagePart[] {
    return (msg.parts ?? []).filter(
      (part) => !(part.type === 'card' && part.card.type === 'planner')
    );
  }

  /** Build the ask_user card payload directly from the yield message in the shared timeline. */
  protected buildAskUserCardFromYield(msg: OperationMessage): AgentXRichCard {
    const yieldState = msg.yieldState;
    const pendingInput = yieldState?.pendingToolCall?.toolInput;
    const question =
      pendingInput && typeof pendingInput['question'] === 'string'
        ? pendingInput['question']
        : (yieldState?.promptToUser ?? '');
    const context =
      pendingInput && typeof pendingInput['context'] === 'string'
        ? pendingInput['context']
        : undefined;
    const threadId = this._resolvedThreadId() ?? (this.threadId.trim() || undefined);

    return {
      type: 'ask_user',
      agentId: yieldState?.agentId ?? 'router',
      title: 'Quick Question',
      payload: {
        question,
        ...(context ? { context } : {}),
        ...(threadId ? { threadId } : {}),
        ...(msg.operationId ? { operationId: msg.operationId } : {}),
      },
    };
  }

  protected isPauseYieldMessage(msg: OperationMessage): boolean {
    const yieldState = msg.yieldState;
    if (!yieldState || yieldState.reason !== 'needs_input') return false;
    if (msg.yieldCardState === 'submitting' || msg.yieldCardState === 'resolved') return false;
    return yieldState.pendingToolCall?.toolName === PAUSE_RESUME_TOOL_NAME;
  }

  /**
   * True only for genuine ask-user yields (not pause yields in any state).
   * Pause yields have toolName === PAUSE_RESUME_TOOL_NAME and must never
   * fall through to the Quick Question card, even while being dismissed.
   */
  protected isAskUserYield(msg: OperationMessage): boolean {
    return (
      msg.yieldState?.reason === 'needs_input' &&
      msg.yieldState?.pendingToolCall?.toolName !== PAUSE_RESUME_TOOL_NAME
    );
  }

  /** Deterministic message id for inline yield cards so they update in place. */
  private inlineYieldMessageId(yieldState: AgentYieldState, operationId?: string): string {
    const discriminator =
      yieldState.approvalId ?? yieldState.pendingToolCall?.toolCallId ?? yieldState.reason;
    return `yield:${operationId ?? this.contextId}:${discriminator}`;
  }

  /** Ensure the current yield is represented inline in the shared message timeline. */
  private upsertInlineYieldMessage(yieldState: AgentYieldState, operationId?: string): void {
    const resolvedOperationId = operationId || this.contextId;
    const messageId = this.inlineYieldMessageId(yieldState, resolvedOperationId);

    this.messages.update((messages) => {
      const existingIndex = messages.findIndex((message) => message.id === messageId);
      if (existingIndex >= 0) {
        return messages.map((message, index) =>
          index === existingIndex
            ? { ...message, yieldState, operationId: resolvedOperationId }
            : message
        );
      }

      const typingIndex = messages.findIndex((message) => message.id === 'typing');
      const yieldMessage: OperationMessage = {
        id: messageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        operationId: resolvedOperationId,
        yieldState,
        yieldCardState: 'idle',
      };

      if (typingIndex < 0) {
        return [...messages, yieldMessage];
      }

      return [...messages.slice(0, typingIndex), yieldMessage, ...messages.slice(typingIndex)];
    });
  }

  /** Update the visual lifecycle of inline yield cards without leaving the shared timeline. */
  private updateInlineYieldMessageState(
    operationId: string,
    state: 'idle' | 'submitting' | 'resolved',
    resolvedText?: string
  ): void {
    this.messages.update((messages) =>
      messages.map((message) =>
        message.yieldState && message.operationId === operationId
          ? {
              ...message,
              yieldCardState: state,
              ...(resolvedText !== undefined ? { yieldResolvedText: resolvedText } : {}),
            }
          : message
      )
    );
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

  /**
   * Send user message to backend Agent X chat.
   *
   * Uses real SSE streaming (via `createAgentXApi.streamMessage`) when running
   * in a browser with an available auth token. Tokens are appended to the
   * typing-indicator message in real time via `onDelta`, producing a fluid
   * "typing" effect.
   */
  private async callAgentChat(
    userInput: string,
    attachments: AgentXAttachment[] = []
  ): Promise<void> {
    // Build conversation history: previous turns only.
    // The current user message is sent as `message` — exclude it from history to avoid
    // duplicating it in the backend context builder. Truncate long assistant responses
    // (e.g. markdown reports) to a safe limit; the backend owns final context windowing.
    const MAX_HISTORY_CONTENT_CHARS = 40_000;
    const allMessages = this.messages().filter(
      (m) => !m.isTyping && m.role !== 'system' && m.content.trim().length > 0
    );
    let lastUserIdx = -1;
    for (let i = allMessages.length - 1; i >= 0; i--) {
      if (allMessages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    // Exclude the last user message — it IS the current turn, already in `message`.
    const historyMessages =
      lastUserIdx >= 0 ? allMessages.filter((_m, i) => i !== lastUserIdx) : allMessages;

    const request = {
      message: userInput,
      history: historyMessages.slice(-20).map((m) => ({
        id: this.uid(),
        role: m.role as 'user' | 'assistant',
        content:
          m.content.length > MAX_HISTORY_CONTENT_CHARS
            ? `${m.content.slice(0, MAX_HISTORY_CONTENT_CHARS)}…`
            : m.content,
        timestamp: new Date(),
      })),
      // NOTE: threadId identifies the conversation thread for server-side context lookup.
      ...(this.resolveActiveThreadId() ? { threadId: this.resolveActiveThreadId()! } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    } satisfies AgentXChatRequest;

    // ── SSE streaming path ────────────────────────────────────────────
    const authToken = await this.getAuthToken?.().catch(() => null);

    this.breadcrumb.trackStateChange('agent-x-operation-chat:sending', {
      contextId: this.contextId,
      streaming: !!(authToken && isPlatformBrowser(this.platformId)),
    });

    if (authToken && isPlatformBrowser(this.platformId)) {
      try {
        await this._sendViaStream(request, authToken);
      } catch (err) {
        if (this.isStreamLimitError(err)) {
          this.logger.warn('Stream limited on initial send; retrying once with backoff', {
            contextId: this.contextId,
          });
          this.breadcrumb.trackStateChange('agent-x-operation-chat:stream-limit-retry', {
            contextId: this.contextId,
          });

          // Retry once after a short backoff to allow stale stream slots to clear.
          await new Promise((resolve) => setTimeout(resolve, 900));

          try {
            await this._sendViaStream(request, authToken);
            return;
          } catch (retryErr) {
            if (this.isStreamLimitError(retryErr)) {
              this.logger.warn('Stream limit persisted after retry', {
                contextId: this.contextId,
              });
              this.replaceTyping({
                id: this.uid(),
                role: 'assistant',
                content:
                  'Too many active Agent X sessions right now. Close other tabs or wait a moment, then try again.',
                timestamp: new Date(),
                error: true,
              });
            }
            throw retryErr;
          }
        }

        throw err;
      }
    } else {
      this.logger.warn('Blocked Agent X send: streaming prerequisites unavailable', {
        hasAuthToken: !!authToken,
        browser: isPlatformBrowser(this.platformId),
        contextId: this.contextId,
      });
      this.breadcrumb.trackStateChange('agent-x-operation-chat:stream-prereq-missing', {
        contextId: this.contextId,
        hasAuthToken: !!authToken,
      });
      this.replaceTyping({
        id: this.uid(),
        role: 'assistant',
        content: 'Sign in to continue chatting with Agent X.',
        timestamp: new Date(),
        error: true,
      });
    }
  }

  /** True when backend rejected stream attach due to active stream limits. */
  private isStreamLimitError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const asRecord = err as Record<string, unknown>;
    return asRecord['status'] === 429 || asRecord['code'] === 'AGENT_STREAM_LIMIT_REACHED';
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
    this.clearPendingTypingDelta();
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
              this.streamRegistry.register(evt.threadId, this.activeStream, {
                retentionHint: this.contextType === 'operation' ? 'long-running' : 'standard',
              });
            }

            // Link operationId → threadId in the registry so per-operation
            // observers (e.g. ProfileGenerationStateService) receive events
            // even after this component unmounts.
            if (evt.operationId) {
              this.streamRegistry.linkOperation(evt.operationId, evt.threadId);
            }

            // Open a shadow Firestore subscription so its lastProcessedSeq
            // advances in parallel with the SSE stream. No UI callbacks — just
            // seat-reservation. If SSE drops, _subscribeToFirestoreJobEvents
            // joins this same fanout entry at the correct seq, preventing
            // duplication of tokens already shown via SSE.
            if (evt.operationId && !this._shadowFirestoreSub && !this._activeFirestoreSub) {
              this._shadowFirestoreSub = runInInjectionContext(this.injector, () =>
                this.operationEventService.subscribe(evt.operationId!, {
                  onDelta: () => undefined,
                  onStep: () => undefined,
                  onCard: () => undefined,
                  onDone: () => undefined,
                  onError: () => undefined,
                })
              );
              this.logger.debug('Shadow Firestore sub opened for SSE drop protection', {
                operationId: evt.operationId,
              });
            }
          },

          onDelta: (evt) => {
            const tid = this._resolvedThreadId();
            if (tid) this.streamRegistry.appendDelta(tid, evt.content);
            this.recordDeltaLatency(evt.emittedAt);

            // Build interleaved parts: append to last text part or start new one
            const last = parts[parts.length - 1];
            if (last?.type === 'text') {
              parts[parts.length - 1] = { type: 'text', content: last.content + evt.content };
            } else {
              parts.push({ type: 'text', content: evt.content });
            }

            // Batch token writes to one UI commit per frame.
            this.queueTypingDelta(evt.content);
          },

          onStep: (evt: AgentXStreamStepEvent) => {
            this.flushPendingTypingDelta();
            const rawStep: AgentXToolStep = {
              id: evt.id,
              label: evt.label,
              agentId: evt.agentId,
              stageType: evt.stageType,
              stage: evt.stage,
              outcomeCode: evt.outcomeCode,
              metadata: evt.metadata,
              status: evt.status,
              icon: evt.icon,
              detail: evt.detail,
            };
            const step: AgentXToolStep = {
              ...rawStep,
              label: getToolStepDisplayLabel(rawStep),
            };
            const tid = this._resolvedThreadId();
            if (tid) this.streamRegistry.upsertStep(tid, step);

            // Bridge write_intel tool steps to IntelService so the Intel tab
            // shows the generating animation exactly when the agent is writing.
            this.intelService?.notifyToolStep(evt.id, step.label, evt.status, evt.detail);
            // Bridge all tool steps to ProfileGenerationStateService so the
            // profile generation banner gets live progress from SSE (not Firestore).
            if (this._currentOperationId) {
              this.profileGenerationState?.receiveStep(this._currentOperationId, step);
            }

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
            this.flushPendingTypingDelta();
            const card: AgentXRichCard = {
              type: evt.type,
              agentId: evt.agentId,
              title: evt.title,
              payload: evt.payload,
            };
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
            if (
              (evt.status === 'paused' ||
                evt.status === 'awaiting_input' ||
                evt.status === 'awaiting_approval') &&
              evt.yieldState
            ) {
              this.activeYieldState.set(evt.yieldState);
              this.yieldResolved.set(false);
              this.upsertInlineYieldMessage(
                evt.yieldState,
                evt.operationId ?? this._currentOperationId ?? this.contextId
              );
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

          onStreamReplaced: (evt) => {
            this.flushPendingTypingDelta();
            this.activeStream = null;
            this.messages.update((msgs) => msgs.filter((m) => m.id !== streamingId));
            this._loading.set(false);

            // Shadow Firestore fanout may continue feeding the newer stream lease.
            this._shadowFirestoreSub?.unsubscribe();
            this._shadowFirestoreSub = null;

            this.logger.info('SSE stream replaced by newer lease', {
              operationId: evt.operationId,
              replacedByStreamId: evt.replacedByStreamId,
            });
            this.breadcrumb.trackStateChange('agent-x-operation-chat:stream-replaced', {
              operationId: evt.operationId,
            });
            this.emitResponseCompleteOnce('sse-stream-replaced');
            resolve();
          },

          onDone: (evt) => {
            this.flushPendingTypingDelta();
            this._latestProgressLabel.set(null);
            const tid = this._resolvedThreadId();
            if (tid) {
              this.streamRegistry.markDone(tid, {
                model: evt.model,
                threadId: evt.threadId,
                messageId: evt.messageId,
                usage: evt.usage,
              });
            }

            // Freeze the final message — replace typing indicator with permanent ID
            this.finalizeStreamedAssistantMessage({
              streamingId,
              messageId: evt.messageId,
              success: true,
              threadId: evt.threadId,
              source: 'sse-done',
            });

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
            // Notify profile generation banner that the job completed successfully.
            if (this._currentOperationId) {
              this.profileGenerationState?.receiveJobDone(this._currentOperationId, true);
            }
            // Surface autoOpenPanel instruction to the shell via the central service
            // (fallback — the panel SSE event should have already surfaced it)
            if (evt.autoOpenPanel && !this.agentXService.requestedSidePanel()) {
              this.agentXService.requestAutoOpenPanel(evt.autoOpenPanel);
              this.logger.info('Forwarded autoOpenPanel to AgentXService (done fallback)', {
                type: evt.autoOpenPanel.type,
              });
            }

            // Shadow sub served its purpose — SSE completed normally.
            this._shadowFirestoreSub?.unsubscribe();
            this._shadowFirestoreSub = null;

            this.logger.info('Stream complete', {
              model: evt.model,
              outputTokens: evt.usage?.outputTokens,
              threadId: evt.threadId,
              deltaLatency: this.summarizeDeltaLatencies(),
            });
            this.emitResponseCompleteOnce('sse-done');
            resolve();
          },

          onError: (evt) => {
            const tid = this._resolvedThreadId();
            if (tid) this.streamRegistry.markError(tid, evt.error);

            this.activeStream = null;
            this._latestProgressLabel.set(null);

            // 429 is usually a transient concurrent-stream cap. Let caller decide
            // whether to retry instead of immediately rendering a terminal error.
            if (evt.status === 429) {
              const error = new Error(evt.error);
              (error as Error & { status?: number; code?: string }).status = evt.status;
              (error as Error & { status?: number; code?: string }).code = evt.code;
              reject(error);
              return;
            }

            // ── 402 billing gate → inject billing action card ──
            if (evt.status === 402) {
              const reason = this._mapBillingCode(evt.code);
              this._injectBillingCard(reason, evt.error);
              this._shadowFirestoreSub?.unsubscribe();
              this._shadowFirestoreSub = null;
              resolve(); // Resolved (not rejected) — user can act on the card
              return;
            }

            // ── Network drop fallback → seamlessly switch to Firestore watch ──
            // If the SSE connection dropped (not a backend logic error) and we
            // already have an operationId, the DebouncedEventWriter has been
            // writing all events to Firestore in parallel. Subscribe to it now
            // so the user sees the response arrive without an error bubble.
            const isNetworkDrop = !evt.status || evt.status === 0 || evt.status >= 500;
            const isResumeThrottle = evt.status === 429 && Boolean(request.resumeOperationId);
            if ((isNetworkDrop || isResumeThrottle) && this._currentOperationId) {
              this.logger.warn('SSE stream unavailable — falling back to Firestore watch', {
                operationId: this._currentOperationId,
                status: evt.status,
                resumeOperationId: request.resumeOperationId,
              });
              this.breadcrumb.trackStateChange('agent-x-operation-chat:sse-fallback-firestore', {
                operationId: this._currentOperationId,
                status: evt.status,
              });
              // Ensure the typing indicator is still present for the Firestore path.
              this.messages.update((msgs) => {
                if (msgs.some((m) => m.id === 'typing')) return msgs;
                return [
                  ...msgs,
                  {
                    id: 'typing',
                    role: 'assistant' as const,
                    content: '',
                    timestamp: new Date(),
                    isTyping: true,
                  },
                ];
              });
              this._loading.set(true);
              // Attach the UI callbacks to the existing fanout entry — the shadow
              // sub's lastProcessedSeq is already advanced past events shown via SSE.
              this._subscribeToFirestoreJobEvents(this._currentOperationId);
              // Remove the shadow listener only after the UI listener has joined
              // (operationEventService.subscribe is synchronous, so by this line
              // the UI listener is already registered in the fanout map).
              this._shadowFirestoreSub?.unsubscribe();
              this._shadowFirestoreSub = null;
              resolve(); // Hand control to the Firestore subscriber
              return;
            }

            // Notify profile generation banner that the job failed.
            if (this._currentOperationId) {
              this.profileGenerationState?.receiveJobDone(
                this._currentOperationId,
                false,
                evt.error
              );
            }

            this.logger.error('Stream error', evt.error);
            this.breadcrumb.trackStateChange('agent-x-operation-chat:stream-error', {
              contextId: this.contextId,
            });
            // Clean up shadow sub on any terminal non-network error.
            this._shadowFirestoreSub?.unsubscribe();
            this._shadowFirestoreSub = null;

            this.replaceTyping({
              id: this.uid(),
              role: 'assistant',
              content: 'Something went wrong. Please try again.',
              timestamp: new Date(),
              error: true,
            });
            const error = new Error(evt.error);
            (error as Error & { status?: number; code?: string }).status = evt.status;
            (error as Error & { status?: number; code?: string }).code = evt.code;
            reject(error);
          },
        },
        authToken,
        this.baseUrl
      );
    });
  }

  /** Append a message to the local history. */
  private pushMessage(msg: OperationMessage): void {
    this.messages.update((prev) => [...prev, msg]);
  }

  /** Start a new response turn and clear completion guards. */
  private beginResponseTurn(source: string): void {
    this._responseTurnId += 1;
    this._responseCompleteEmitted = false;
    this._latestProgressLabel.set(null);
    this.logger.debug('Response turn started', {
      turnId: this._responseTurnId,
      source,
      contextId: this.contextId,
    });
  }

  /** Emit `responseComplete` at most once for the active response turn. */
  private emitResponseCompleteOnce(source: string): void {
    if (this._responseCompleteEmitted) {
      this.logger.debug('Duplicate responseComplete suppressed', {
        turnId: this._responseTurnId,
        source,
        contextId: this.contextId,
      });
      return;
    }

    this._responseCompleteEmitted = true;
    this.responseComplete.emit();
  }

  private recordDeltaLatency(emittedAt?: string): void {
    if (!emittedAt) return;

    const emittedAtMs = Date.parse(emittedAt);
    if (Number.isNaN(emittedAtMs)) return;

    const latencyMs = Date.now() - emittedAtMs;
    if (latencyMs < 0 || latencyMs > 120_000) return;

    this.deltaLatencySamples.push(latencyMs);
    if (this.deltaLatencySamples.length > 120) {
      this.deltaLatencySamples.shift();
    }
  }

  private summarizeDeltaLatencies(): { count: number; avgMs: number; p95Ms: number } {
    if (this.deltaLatencySamples.length === 0) {
      return { count: 0, avgMs: 0, p95Ms: 0 };
    }

    const sorted = [...this.deltaLatencySamples].sort((a, b) => a - b);
    const count = sorted.length;
    const avgMs = Math.round(sorted.reduce((sum, value) => sum + value, 0) / count);
    const p95Index = Math.min(count - 1, Math.floor(count * 0.95));
    const p95Ms = Math.round(sorted[p95Index] ?? 0);

    return { count, avgMs, p95Ms };
  }

  /** Replace the typing indicator with a real message. */
  private replaceTyping(msg: OperationMessage): void {
    this.clearPendingTypingDelta();
    this.messages.update((prev) => [...prev.filter((m) => m.id !== 'typing'), msg]);
  }

  /** Buffer a streamed token chunk and flush it once per animation frame. */
  private queueTypingDelta(text: string): void {
    if (!text) return;
    this.pendingTypingDelta += text;

    if (this.pendingTypingFlushFrame !== null) return;

    if (isPlatformBrowser(this.platformId) && typeof requestAnimationFrame === 'function') {
      this.pendingTypingFlushFrame = requestAnimationFrame(() => {
        this.pendingTypingFlushFrame = null;
        this.flushPendingTypingDelta();
      });
      return;
    }

    this.flushPendingTypingDelta();
  }

  /** Flush buffered streamed token chunks into the typing message. */
  private flushPendingTypingDelta(): void {
    if (!this.pendingTypingDelta) return;

    const delta = this.pendingTypingDelta;
    this.pendingTypingDelta = '';

    this.messages.update((msgs) =>
      msgs.map((m) => {
        if (m.id !== 'typing') return m;
        const prevParts = [...(m.parts ?? [])];
        const last = prevParts[prevParts.length - 1];
        if (last?.type === 'text') {
          prevParts[prevParts.length - 1] = { type: 'text', content: last.content + delta };
        } else {
          prevParts.push({ type: 'text', content: delta });
        }
        return { ...m, content: m.content + delta, isTyping: false, parts: prevParts };
      })
    );
  }

  /** Clear buffered streamed token chunks and cancel any scheduled flush. */
  private clearPendingTypingDelta(): void {
    this.pendingTypingDelta = '';
    if (this.pendingTypingFlushFrame !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.pendingTypingFlushFrame);
    }
    this.pendingTypingFlushFrame = null;
  }

  /** Returns true when the viewport is pinned near the bottom of the message list. */
  private isNearBottom(el: HTMLElement, thresholdPx = 120): boolean {
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    return distanceFromBottom <= thresholdPx;
  }

  /** Scroll the messages area to the bottom. */
  private scrollToBottom(options?: {
    onlyIfNearBottom?: boolean;
    behavior?: ScrollBehavior;
  }): void {
    const el = this.messagesArea()?.nativeElement;
    if (!el) return;

    if (options?.onlyIfNearBottom && !this.isNearBottom(el)) return;

    this.pendingScrollBehavior = options?.behavior ?? 'auto';
    if (this.pendingScrollFrame !== null) return;

    const commitScroll = () => {
      this.pendingScrollFrame = null;
      const top = el.scrollHeight;
      const behavior = this.pendingScrollBehavior;
      if (typeof el.scrollTo === 'function') {
        el.scrollTo({ top, behavior });
      } else {
        el.scrollTop = top;
      }
    };

    if (isPlatformBrowser(this.platformId) && typeof requestAnimationFrame === 'function') {
      this.pendingScrollFrame = requestAnimationFrame(commitScroll);
      return;
    }

    commitScroll();
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
      void this.resolveInlineApproval({
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

    void this.resolveInlineApproval({
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
    this.updateInlineYieldMessageState(event.operationId, 'submitting');

    const approvalId = event.approvalId ?? this.activeYieldState()?.approvalId;
    if (!approvalId) {
      this.logger.warn('Action card approval missing approvalId', {
        operationId: event.operationId,
        decision: event.decision,
      });
      await this.haptics.notification('error');
      this.updateInlineYieldMessageState(event.operationId, 'idle');
      this.toast.error('This approval request is no longer available. Refresh and try again.');
      return;
    }

    try {
      const success = await this.resolveInlineApproval({
        approvalId,
        decision: event.decision === 'approve' ? 'approved' : 'rejected',
        ...(event.toolInput ? { toolInput: event.toolInput } : {}),
        successMessage:
          event.decision === 'approve' ? 'Approved — Agent X is resuming' : 'Request rejected',
      });
      if (success) {
        await this.haptics.notification('success');
        this.updateInlineYieldMessageState(
          event.operationId,
          'resolved',
          event.decision === 'approve' ? 'Approved — resuming' : 'Rejected — cancelled'
        );
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_APPROVED, {
          operationId: event.operationId,
          decision: event.decision,
          approvalId,
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
        this.updateInlineYieldMessageState(event.operationId, 'idle');
      }
    } catch (err) {
      this.logger.error('Action card approval failed', err, { operationId: event.operationId });
      await this.haptics.notification('error');
      this.updateInlineYieldMessageState(event.operationId, 'idle');
    }
  }

  /** Handle text reply from the action card. */
  protected async onReplyAction(event: ActionCardReplyEvent): Promise<void> {
    this.logger.info('Action card reply', { operationId: event.operationId });
    this.breadcrumb.trackUserAction('action-card-reply', {
      operationId: event.operationId,
    });
    this.updateInlineYieldMessageState(event.operationId, 'submitting');

    try {
      const activeYield = this.activeYieldState();
      const success =
        activeYield?.reason === 'needs_input'
          ? await this.resumeYieldedOperation(event.operationId, event.response)
          : await this.jobService.replyOperation(event.operationId, event.response);
      if (success) {
        await this.haptics.notification('success');
        this.updateInlineYieldMessageState(event.operationId, 'resolved', 'Reply sent — resuming');
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
        this.updateInlineYieldMessageState(event.operationId, 'idle');
      }
    } catch (err) {
      this.logger.error('Action card reply failed', err, { operationId: event.operationId });
      await this.haptics.notification('error');
      this.updateInlineYieldMessageState(event.operationId, 'idle');
    }
  }

  protected async onPauseResume(event: PauseResumeEvent): Promise<void> {
    this.logger.info('Pause card resume requested', { operationId: event.operationId });
    this.breadcrumb.trackUserAction('pause-card-resume', {
      operationId: event.operationId,
    });
    this.updateInlineYieldMessageState(event.operationId, 'submitting');

    try {
      // Empty string = plain resume with no extra user input. Sending a sentinel
      // word like 'resume' would be appended to the replay history and cause the
      // LLM to treat it as a fresh message rather than continuing the paused task.
      const success = await this.resumeYieldedOperation(event.operationId, '');
      if (success) {
        await this.haptics.notification('success');
        this.updateInlineYieldMessageState(event.operationId, 'resolved', 'Resuming operation…');
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_REPLIED, {
          operationId: event.operationId,
          source: 'operation-chat-pause-card',
        });

        setTimeout(() => {
          this.yieldResolved.set(true);
        }, 600);
      } else {
        await this.haptics.notification('error');
        this.updateInlineYieldMessageState(event.operationId, 'idle');
      }
    } catch (err) {
      this.logger.error('Pause card resume failed', err, { operationId: event.operationId });
      await this.haptics.notification('error');
      this.updateInlineYieldMessageState(event.operationId, 'idle');
    }
  }

  protected yieldOperationId(): string {
    const activeYield = this.activeYieldState();
    return this.resolveYieldOperationId(activeYield ?? undefined) ?? this.contextId;
  }

  private resolveYieldOperationId(yieldState?: AgentYieldState | null): string | undefined {
    const toolInputOperationId =
      yieldState?.pendingToolCall?.toolInput &&
      typeof yieldState.pendingToolCall.toolInput['operationId'] === 'string'
        ? yieldState.pendingToolCall.toolInput['operationId'].trim()
        : null;

    const candidates = [
      toolInputOperationId,
      this._currentOperationId?.trim() || undefined,
      this.resumeOperationId?.trim() || undefined,
      this.resolveFirestoreOperationId() ?? undefined,
      this.contextId?.trim() || undefined,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      if (this.isFirestoreOperationId(candidate)) return candidate;
    }

    return candidates.find((candidate): candidate is string => !!candidate);
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
    this.beginResponseTurn('resume-yielded');

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
  // INLINE APPROVAL
  // ============================================

  /**
   * Resolve an inline approval (draft email, confirmation card).
   * Calls the backend `resolveApproval` endpoint, shows a toast, and — if the
   * operation was resumed — attaches this component to the new SSE stream so the
   * user sees the continuation in real time.
   */
  async resolveInlineApproval(params: {
    approvalId: string;
    decision: 'approved' | 'rejected';
    toolInput?: Record<string, unknown>;
    successMessage?: string;
  }): Promise<boolean> {
    this.logger.info('Resolving inline approval', {
      approvalId: params.approvalId,
      decision: params.decision,
    });
    this.breadcrumb.trackStateChange('agent-x-operation-chat:inline-approval', {
      approvalId: params.approvalId,
      decision: params.decision,
    });

    try {
      const result = await this.api.resolveApproval(
        params.approvalId,
        params.decision,
        params.toolInput
      );

      if (!result) {
        this.logger.warn('Inline approval returned null', {
          approvalId: params.approvalId,
          decision: params.decision,
        });
        this.toast.error('Failed to process approval');
        return false;
      }

      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATION_APPROVED, {
        approvalId: params.approvalId,
        decision: params.decision,
        resumed: result.resumed,
      });

      if (params.decision === 'rejected') {
        this.toast.success(params.successMessage ?? 'Request rejected');
        return true;
      }

      this.toast.success(params.successMessage ?? 'Approved — Agent X is resuming');

      if (result.resumed && result.operationId) {
        await this._attachToResumedOperation({
          operationId: result.operationId,
          threadId: result.threadId ?? undefined,
        });
      }

      return true;
    } catch (err) {
      this.logger.error('Failed to resolve inline approval', err, {
        approvalId: params.approvalId,
        decision: params.decision,
      });
      this.toast.error('Failed to process approval');
      return false;
    }
  }

  /**
   * Attach this component to a resumed SSE stream (after approval or drop-recovery).
   * Injects a typing indicator and calls `_sendViaStream` with `resumeOperationId`.
   * @internal
   */
  async _attachToResumedOperation(params: {
    operationId: string;
    threadId?: string;
    afterSeq?: number;
  }): Promise<void> {
    const trimmedOperationId = params.operationId?.trim();
    if (!trimmedOperationId) {
      this.logger.warn('Cannot attach to resumed operation without operationId');
      return;
    }

    if (
      this._currentOperationId === trimmedOperationId &&
      this.activeStream &&
      !this.activeStream.signal.aborted
    ) {
      this.logger.debug('Skipping duplicate resumed stream attach (already active)', {
        operationId: trimmedOperationId,
      });
      return;
    }

    if (this._lastResumeAttachOperationId === trimmedOperationId && this._loading()) {
      this.logger.debug('Skipping duplicate resumed stream attach (in-flight)', {
        operationId: trimmedOperationId,
      });
      return;
    }

    this._lastResumeAttachOperationId = trimmedOperationId;

    const authToken = await this.getAuthToken?.().catch(() => null);
    if (!authToken || !isPlatformBrowser(this.platformId)) {
      this.logger.info('Approval resumed without live stream attachment', {
        operationId: trimmedOperationId,
      });
      return;
    }

    this.activeStream?.abort();
    this.activeStream = null;

    if (params.threadId) {
      this._resolvedThreadId.set(params.threadId);
    }

    this._currentOperationId = trimmedOperationId;
    this.beginResponseTurn('attach-resumed-operation');

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
          message: 'Resume approved operation',
          ...(params.threadId ? { threadId: params.threadId } : {}),
          resumeOperationId: trimmedOperationId,
          ...(params.afterSeq !== undefined ? { afterSeq: params.afterSeq } : {}),
        },
        authToken
      );
    } catch (err) {
      this.logger.error('Failed to attach to resumed operation stream', err, {
        operationId: trimmedOperationId,
      });
      this.replaceTyping({
        id: this.uid(),
        role: 'assistant',
        content: 'Failed to resume operation. Please refresh and try again.',
        timestamp: new Date(),
        error: true,
      });
      this._loading.set(false);
    }
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
      agentId: 'router',
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
