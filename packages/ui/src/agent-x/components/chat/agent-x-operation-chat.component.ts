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
import type {
  AgentXToolStep,
  AgentXPlannerItem,
  AgentXMessagePart,
  AgentXRichCard,
  AgentXSelectedAction,
} from '@nxt1/core/ai';
import { AGENT_X_ALLOWED_MIME_TYPES, resolveAttachmentType } from '@nxt1/core/ai';
import { ModalController } from '@ionic/angular/standalone';
import { NxtSheetHeaderComponent } from '../../../components/bottom-sheet/sheet-header.component';
import { NxtChatBubbleComponent } from '../../../components/chat-bubble';
import { NxtIconComponent } from '../../../components/icon';
import { AGENT_X_OPERATION_CHAT_TEST_IDS } from '@nxt1/core/testing';
import { AgentXInputBarComponent } from '../inputs/agent-x-input-bar.component';
import { ChatBubbleActionsComponent } from './agent-x-chat-bubble-actions.component';
import { AgentXOperationChatQuickPromptsComponent } from './agent-x-operation-chat-quick-prompts.component';
import { AgentXOperationChatThinkingComponent } from './agent-x-operation-chat-thinking.component';
import { AgentXOperationChatExecutionPlanComponent } from './agent-x-operation-chat-execution-plan.component';
import { AgentXMessageUndoComponent } from './agent-x-message-undo.component';
import { AgentXOperationChatMessageFacade } from './agent-x-operation-chat-message.facade';
import { AgentXOperationChatAttachmentsFacade } from './agent-x-operation-chat-attachments.facade';
import { AgentXOperationChatRunControlFacade } from './agent-x-operation-chat-run-control.facade';
import { AgentXOperationChatSessionFacade } from './agent-x-operation-chat-session.facade';
import { AgentXOperationChatTransportFacade } from './agent-x-operation-chat-transport.facade';
import { resolveCoordinatorActionId } from './agent-x-operation-chat.utils';
import { AgentXOperationChatYieldFacade } from './agent-x-operation-chat-yield.facade';
import type { OperationEventSubscription } from '../../services/agent-x-operation-event.service';
import { NxtPlatformIconComponent } from '../../../components/platform-icon/platform-icon.component';
import { NxtDragDropDirective } from '../../../services/gesture';
import { AgentXActionCardComponent } from '../cards/agent-x-action-card.component';
import { AgentXAskUserCardComponent } from '../cards/agent-x-ask-user-card.component';
import { AgentXPausedCardComponent } from '../cards/agent-x-paused-card.component';
import type { DraftSubmittedEvent } from '../cards/agent-x-draft-card.component';
import type { AgentYieldState } from '@nxt1/core';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';
import type { AgentXPendingFile } from '../../types/agent-x-pending-file';
import { getThinkingLabel } from '../../types/agent-x-agent-presentation';
import type { OperationQuickAction } from './agent-x-operation-chat.types';
import type { ConnectedAppSource } from '../modals/agent-x-attachments-sheet.component';
import type {
  AgentXUser,
  AgentXConnectedAccountsSaveRequest,
} from '../shell/agent-x-shell.component';
import {
  bindAgentXKeyboardOffset,
  type AgentXKeyboardOffsetBinding,
} from '../../utils/agent-x-keyboard-offset.util';
import type { OperationMessage, PendingFile } from './agent-x-operation-chat.models';

export type { OperationQuickAction } from './agent-x-operation-chat.types';

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
    AgentXOperationChatQuickPromptsComponent,
    AgentXOperationChatThinkingComponent,
    AgentXOperationChatExecutionPlanComponent,
    AgentXMessageUndoComponent,
    AgentXActionCardComponent,
    AgentXAskUserCardComponent,
    AgentXPausedCardComponent,
  ],
  template: `
    <div
      class="operation-chat-shell"
      nxtDragDrop
      (dragStateChange)="attachmentsFacade.onDragStateChange($event)"
      (filesDropped)="attachmentsFacade.onFilesDropped($event)"
      (click)="attachmentsFacade.onShellClick($event)"
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
          <nxt1-agent-x-operation-chat-quick-prompts
            [welcomeMessage]="welcomeMessage()"
            [suggestedActions]="suggestedActions"
            [quickActions]="normalizedQuickActions()"
            [scheduledActions]="scheduledActions"
            [showQuickPromptsHeading]="contextId !== 'agent-x-chat'"
            (actionSelected)="onQuickAction($event)"
          />
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
                [operationId]="msg.operationId || yieldFacade.yieldOperationId()"
                [externalCardState]="msg.yieldCardState ?? null"
                [externalResolvedText]="msg.yieldResolvedText ?? ''"
                (approve)="yieldFacade.onApproveAction($event)"
                (reply)="yieldFacade.onReplyAction($event)"
              />
            } @else if (isPauseYieldMessage(msg)) {
              <nxt1-agent-x-paused-card
                [operationId]="msg.operationId || yieldFacade.yieldOperationId()"
                [message]="
                  msg.yieldState?.promptToUser || 'Operation paused. Resume whenever you are ready.'
                "
                (resumeRequested)="yieldFacade.onPauseResume($event)"
              />
            } @else if (isAskUserYield(msg)) {
              <nxt1-agent-x-ask-user-card
                [card]="buildAskUserCardFromYield(msg)"
                (replySubmitted)="yieldFacade.onAskUserReply($event)"
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
                (billingActionResolved)="yieldFacade.onBillingActionResolved($event)"
                (confirmationAction)="yieldFacade.onConfirmationAction($event)"
                (draftSubmitted)="yieldFacade.onDraftSubmitted($event)"
                (askUserReply)="yieldFacade.onAskUserReply($event)"
                (retryRequested)="runControlFacade.onRetryErrorMessage(msg)"
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
                        (click)="attachmentsFacade.openAttachmentViewer(msg.attachments!, $index)"
                      />
                    } @else if (att.type === 'video') {
                      <video
                        [src]="att.url"
                        class="msg-attachment__thumb"
                        preload="metadata"
                        (click)="attachmentsFacade.openAttachmentViewer(msg.attachments!, $index)"
                      ></video>
                      <div class="msg-attachment__play">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                          <path d="M8 5v14l11-7L8 5z" />
                        </svg>
                      </div>
                    } @else {
                      <div
                        class="msg-attachment__doc"
                        (click)="attachmentsFacade.openAttachmentViewer(msg.attachments!, $index)"
                        style="cursor: pointer;"
                      >
                        <div
                          class="msg-attachment__doc-icon-wrap"
                          [style.background]="attachmentsFacade.getFileColor(att.name, 0.15)"
                          [style.color]="attachmentsFacade.getFileColor(att.name, 1)"
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
                          <span class="msg-attachment__doc-meta">{{
                            attachmentsFacade.getFileExt(att.name)
                          }}</span>
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
                (copy)="messageFacade.copyMessageContent(msg)"
              />
            }
          </div>
        }

        <!-- ═══ THINKING INDICATOR (Copilot-style: spinning icon + shimmering text) ═══ -->
        @if (showThinking()) {
          <nxt1-agent-x-operation-chat-thinking [label]="thinkingLabel()" />
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
          <nxt1-agent-x-operation-chat-execution-plan
            [title]="executionPlan.title"
            [items]="executionPlanItems()"
            [expanded]="executionPlanExpanded()"
            (expandedChange)="executionPlanExpanded.set($event)"
          />
        }

        <nxt1-agent-x-message-undo
          [visible]="pendingUndoState() !== null"
          [triggerId]="undoBannerTriggerId()"
          [durationSeconds]="10"
          (undo)="messageFacade.undoDeletedMessage()"
          (expired)="messageFacade.clearUndoState()"
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
          (send)="runControlFacade.send()"
          (pause)="runControlFacade.pauseStream()"
          (toggleAttachments)="attachmentsFacade.onUploadClick()"
          (openFile)="attachmentsFacade.openPendingFileViewer($event)"
          (removeFile)="attachmentsFacade.removePendingFile($event)"
          (removeSource)="attachmentsFacade.removePendingConnectedSource($event)"
          (focusInput)="onInputFocus()"
        ></nxt1-agent-x-input-bar>

        @if (attachmentsFacade.showDesktopAttachmentMenu()) {
          <button
            type="button"
            class="desktop-attach-menu-backdrop"
            aria-label="Close attachment menu"
            (click)="attachmentsFacade.closeDesktopAttachmentMenu()"
          ></button>
          <div class="desktop-attach-menu" role="menu" aria-label="Attachment options">
            <button
              type="button"
              class="desktop-attach-menu__item desktop-attach-menu__item--primary"
              (click)="attachmentsFacade.onDesktopAttachmentUploadClick()"
            >
              <nxt1-icon name="plus" [size]="15" />
              <div class="desktop-attach-menu__copy">
                <span class="desktop-attach-menu__title">Upload File</span>
                <span class="desktop-attach-menu__meta">Photo, video, PDF, doc, or sheet</span>
              </div>
            </button>

            <div class="desktop-attach-menu__section">Connected Apps</div>

            @if (attachmentsFacade.desktopAttachmentSources().length > 0) {
              <div class="desktop-attach-menu__apps-row" role="list">
                @for (
                  source of attachmentsFacade.desktopAttachmentSources();
                  track source.platform + source.profileUrl
                ) {
                  <button
                    type="button"
                    class="desktop-attach-menu__app-chip"
                    [title]="source.platform"
                    role="listitem"
                    (click)="attachmentsFacade.onDesktopAttachmentSourceSelected(source)"
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
                  (click)="attachmentsFacade.onDesktopManageConnectedApps()"
                >
                  <nxt1-icon name="plusCircle" [size]="14" />
                  Connect more
                </button>
              </div>
            } @else {
              <button
                type="button"
                class="desktop-attach-menu__apps-placeholder"
                (click)="attachmentsFacade.onDesktopManageConnectedApps()"
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
          (change)="attachmentsFacade.onDesktopAttachmentFilesSelected($event)"
        />
      </div>

      @if (attachmentsFacade.isDragActive()) {
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
        bottom: calc(100% + 6px);
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
        padding-top: 24px;
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
    `,
  ],
  providers: [
    AgentXOperationChatMessageFacade,
    AgentXOperationChatTransportFacade,
    AgentXOperationChatAttachmentsFacade,
    AgentXOperationChatRunControlFacade,
    AgentXOperationChatSessionFacade,
    AgentXOperationChatYieldFacade,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXOperationChatComponent implements AfterViewInit, OnDestroy {
  private readonly modalCtrl = inject(ModalController);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly messageFacade = inject(AgentXOperationChatMessageFacade);
  protected readonly runControlFacade = inject(AgentXOperationChatRunControlFacade);
  protected readonly attachmentsFacade = inject(AgentXOperationChatAttachmentsFacade);
  private readonly sessionFacade = inject(AgentXOperationChatSessionFacade);
  private readonly transportFacade = inject(AgentXOperationChatTransportFacade);
  protected readonly yieldFacade = inject(AgentXOperationChatYieldFacade);
  private readonly hostElement = inject(ElementRef);
  private readonly desktopAttachmentFileInput = viewChild<ElementRef<HTMLInputElement>>(
    'desktopAttachmentFileInput'
  );

  /** Shared keyboard offset binding used by shell and operation chat. */
  private keyboardOffsetBinding?: AgentXKeyboardOffsetBinding;
  /** Active SSE abort controller — cancelled on destroy or when a new message starts. */
  private activeStream: AbortController | null = null;

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

  /**
   * Forward Watermark Reconciliation state for the active SSE turn.
   *
   * - `optimisticChars` — total characters already rendered to the UI via
   *   the live SSE delta stream.
   * - `confirmedChars`  — total characters silently observed by the shadow
   *   Firestore listener (advances 300 ms behind SSE as the
   *   DebouncedEventWriter flushes batches).
   *
   * When SSE drops mid-stream, the Firestore fallback uses these counts to
   * slice each incoming batch by length and emit ONLY the new tail beyond
   * `optimisticChars`. The user never sees a flicker, rollback, or
   * duplicated word — text generation is append-only, so length-based
   * reconciliation is mathematically exact.
   *
   * Reset to `null` at the start of every new turn and on every terminal
   * stream event (done, fatal error, stream-replaced).
   */
  private _streamTurnWatermark: {
    optimisticChars: number;
    confirmedChars: number;
  } | null = null;

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

  /** Optional list of personalized suggested actions shown ahead of static quick prompts. */
  @Input() suggestedActions: readonly OperationQuickAction[] = [];

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
      this.messageFacade.upsertInlineYieldMessage(
        value,
        this.yieldFacade.resolveYieldOperationId(value) ?? this.contextId
      );
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
  protected readonly messages = this.messageFacade.messages;

  /** Active inline edit target for a user message. */
  protected readonly editingMessageId = this.messageFacade.editingMessageId;

  /** Current draft text shown in the inline edit component. */
  protected readonly editingMessageDraft = this.messageFacade.editingMessageDraft;

  /** Assistant message selected for feedback modal submission. */
  protected readonly feedbackTargetMessageId = this.messageFacade.feedbackTargetMessageId;

  /** Preferred initial star rating when opening the feedback modal. */
  protected readonly feedbackDefaultRating = this.messageFacade.feedbackDefaultRating;

  /** Pending delete token used by the undo countdown banner. */
  protected readonly pendingUndoState = this.messageFacade.pendingUndoState;

  /** Incremented for each delete action so the undo countdown restarts. */
  protected readonly undoBannerTriggerId = this.messageFacade.undoBannerTriggerId;

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

  /** Structured quick action metadata for the next auto-sent chip selection. */
  private readonly _pendingSelectedAction = signal<AgentXSelectedAction | null>(null);

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
  protected readonly pendingFiles = this.attachmentsFacade.pendingFiles;

  /** Connected app sources staged from the attachments sheet — shown as chips in the input bar. */
  protected readonly pendingConnectedSources = this.attachmentsFacade.pendingConnectedSources;

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
          const p = part.card.payload;
          // Only show card when plan has ≥3 tasks — single/dual-task plans run silently
          if ('items' in p && Array.isArray(p.items) && p.items.length >= 3) {
            return part.card;
          }
          return null;
        }
      }

      const cards = message.cards ?? [];
      for (let cardIndex = cards.length - 1; cardIndex >= 0; cardIndex -= 1) {
        const card = cards[cardIndex];
        if (card?.type === 'planner') {
          const p = card.payload;
          if ('items' in p && Array.isArray(p.items) && p.items.length >= 3) {
            return card;
          }
          return null;
        }
      }
    }

    return null;
  });

  /** Composer-adjacent execution-plan accordion expansion state. */
  protected readonly executionPlanExpanded = signal(true);

  protected readonly executionPlanItems = computed<readonly AgentXPlannerItem[]>(() => {
    const card = this.executionPlanCard();
    if (!card || card.type !== 'planner') return [];
    const payload = card.payload;
    if (!('items' in payload) || !Array.isArray(payload.items)) return [];
    return payload.items as readonly AgentXPlannerItem[];
  });

  /** Whether to show the persistent backend-driven progress indicator. */
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
  constructor() {
    this.sessionFacade.configure({
      contextId: () => this.contextId,
      contextType: () => this.contextType,
      threadId: () => this.threadId,
      resumeOperationId: () => this.resumeOperationId,
      initialMessage: () => this.initialMessage,
      initialFiles: () => this.initialFiles,
      errorMessage: () => this.errorMessage,
      threadMode: this._isThreadMode,
      inputValue: this.inputValue,
      loading: this._loading,
      latestProgressLabel: this._latestProgressLabel,
      resolvedThreadId: this._resolvedThreadId,
      activeYieldState: this.activeYieldState,
      yieldResolved: this.yieldResolved,
      getOperationStatus: () => this.operationStatus,
      setOperationStatus: (status) => {
        this.operationStatus = status;
      },
      getCurrentOperationId: () => this._currentOperationId,
      setCurrentOperationId: (operationId) => {
        this._currentOperationId = operationId;
      },
      getActiveStream: () => this.activeStream,
      setActiveStream: (controller) => {
        this.activeStream = controller;
      },
      getActiveFirestoreSub: () => this._activeFirestoreSub,
      setActiveFirestoreSub: (subscription) => {
        this._activeFirestoreSub = subscription;
      },
      getShadowFirestoreSub: () => this._shadowFirestoreSub,
      setShadowFirestoreSub: (subscription) => {
        this._shadowFirestoreSub = subscription;
      },
      getStreamTurnWatermark: () => this._streamTurnWatermark,
      setStreamTurnWatermark: (watermark) => {
        this._streamTurnWatermark = watermark;
      },
      hasUserSent: () => this.hasUserSent(),
      markUserMessageSent: () => {
        this.hasUserSent.set(true);
        this.userMessageSent.emit();
      },
      send: () => this.runControlFacade.send(),
      attachToResumedOperation: (params) => this._attachToResumedOperation(params),
      uid: () => this.uid(),
    });
    this.messageFacade.configure({
      contextId: () => this.contextId,
      contextType: () => this.contextType,
      threadId: () => this.threadId,
      resolvedThreadId: this._resolvedThreadId,
      resolveActiveThreadId: () => this.sessionFacade.resolveActiveThreadId(),
      loadThreadMessages: (threadId) => this.sessionFacade.loadThreadMessages(threadId),
      attachToResumedOperation: (params) => this._attachToResumedOperation(params),
    });
    this.transportFacade.configure({
      contextId: () => this.contextId,
      contextType: () => this.contextType,
      threadId: () => this.threadId,
      messages: this.messages,
      loading: this._loading,
      latestProgressLabel: this._latestProgressLabel,
      resolvedThreadId: this._resolvedThreadId,
      activeYieldState: this.activeYieldState,
      yieldResolved: this.yieldResolved,
      getActiveStream: () => this.activeStream,
      setActiveStream: (controller) => {
        this.activeStream = controller;
      },
      getCurrentOperationId: () => this._currentOperationId,
      setCurrentOperationId: (operationId) => {
        this._currentOperationId = operationId;
      },
      getShadowFirestoreSub: () => this._shadowFirestoreSub,
      setShadowFirestoreSub: (subscription) => {
        this._shadowFirestoreSub = subscription;
      },
      getActiveFirestoreSub: () => this._activeFirestoreSub,
      getStreamTurnWatermark: () => this._streamTurnWatermark,
      setStreamTurnWatermark: (watermark) => {
        this._streamTurnWatermark = watermark;
      },
      resolveActiveThreadId: () => this.sessionFacade.resolveActiveThreadId(),
      setOperationStatus: (status) => {
        this.operationStatus = status;
      },
      emitResponseComplete: () => this.responseComplete.emit(),
      subscribeToFirestoreJobEvents: (operationId, startAfterSeq, initialWatermark) =>
        this.sessionFacade.subscribeToFirestoreJobEvents(
          operationId,
          startAfterSeq,
          initialWatermark
        ),
      uid: () => this.uid(),
    });
    this.attachmentsFacade.configure({
      contextId: () => this.contextId,
      contextType: () => this.contextType,
      embedded: () => this.embedded,
      resolvedThreadId: this._resolvedThreadId,
      videoUploadPercent: this._videoUploadPercent,
      user: () => this.user,
      clickDesktopAttachmentInput: () => {
        this.desktopAttachmentFileInput()?.nativeElement.click();
      },
      emitConnectedAccountsSave: (request) => {
        this.connectedAccountsSave.emit(request);
      },
      uid: () => this.uid(),
    });
    this.runControlFacade.configure({
      contextId: () => this.contextId,
      contextTitle: () => this.contextTitle,
      contextType: () => this.contextType,
      inputValue: this.inputValue,
      loading: this._loading,
      retryStarted: this.retryStarted,
      activeYieldState: this.activeYieldState,
      yieldResolved: this.yieldResolved,
      setOperationStatus: (status) => {
        this.operationStatus = status;
      },
      getCurrentOperationId: () => this._currentOperationId,
      setCurrentOperationId: (operationId) => {
        this._currentOperationId = operationId;
      },
      getActiveStream: () => this.activeStream,
      setActiveStream: (controller) => {
        this.activeStream = controller;
      },
      resolveActiveThreadId: () => this.sessionFacade.resolveActiveThreadId(),
      hasUserSent: () => this.hasUserSent(),
      markUserMessageSent: () => {
        this.hasUserSent.set(true);
        this.userMessageSent.emit();
      },
      getPendingSelectedAction: () => this._pendingSelectedAction(),
      setPendingSelectedAction: (action) => {
        this._pendingSelectedAction.set(action);
      },
      yieldOperationId: () => this.yieldFacade.yieldOperationId(),
      uid: () => this.uid(),
    });
    this.yieldFacade.configure({
      contextId: () => this.contextId,
      contextType: () => this.contextType,
      threadId: () => this.threadId,
      resumeOperationId: () => this.resumeOperationId,
      errorMessage: () => this.errorMessage,
      inputValue: this.inputValue,
      loading: this._loading,
      activeYieldState: this.activeYieldState,
      yieldResolved: this.yieldResolved,
      resolvedThreadId: this._resolvedThreadId,
      getCurrentOperationId: () => this._currentOperationId,
      setCurrentOperationId: (operationId) => {
        this._currentOperationId = operationId;
      },
      getActiveStream: () => this.activeStream,
      setActiveStream: (controller) => {
        this.activeStream = controller;
      },
      send: () => this.runControlFacade.send(),
      uid: () => this.uid(),
      resolveFirestoreOperationId: () => this.sessionFacade.resolveFirestoreOperationId(),
      isFirestoreOperationId: (id) => this.sessionFacade.isFirestoreOperationId(id),
    });

    // When the component is destroyed (e.g. session switch), detach from the
    // stream registry instead of aborting. The stream continues running in the
    // background and buffers its output. When the user returns to this session,
    // the component remounts and rehydrates from the buffer.
    this.destroyRef.onDestroy(() => {
      this.sessionFacade.handleDestroy();
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
        this.messageFacade.upsertInlineYieldMessage(
          yieldState,
          this.yieldFacade.resolveYieldOperationId(yieldState) ?? this.contextId
        );
        this.scrollToBottom({ behavior: 'smooth' });
      }
    });
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  ngAfterViewInit(): void {
    // Bind immediately so all code paths (including early returns) get keyboard lift.
    void this.bindKeyboardOffset();
    this.sessionFacade.initializeAfterView();
  }

  ngOnDestroy(): void {
    // Stream lifecycle cleanup is handled in the constructor's destroyRef callback.
    // Keep this hook for non-stream resources only to avoid aborting resumed runs
    // during component remounts.
    this.attachmentsFacade.clearPendingFiles();
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

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /** Dismiss the bottom sheet. */
  async dismiss(): Promise<void> {
    if (this.embedded) return;
    await this.modalCtrl.dismiss(undefined, 'close');
  }

  /** Handle a quick action chip tap — auto-sends as user message. */
  async onQuickAction(action: OperationQuickAction): Promise<void> {
    if (this.delegateCoordinatorQuickActions && resolveCoordinatorActionId(action)) {
      this.coordinatorQuickActionSelected.emit(action);
      return;
    }

    await this.runControlFacade.send({
      text: action.promptText?.trim() || action.label,
      selectedAction: action.selectedAction ?? null,
      preserveDraft: true,
    });
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

  // ============================================
  // PRIVATE HELPERS
  // ============================================

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
    return this.yieldFacade.resolveInlineApproval(params);
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
    await this.yieldFacade.attachToResumedOperation(params);
  }
}
