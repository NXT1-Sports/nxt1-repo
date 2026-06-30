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
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import type {
  AgentXPlannerItem,
  AgentXExecutionMode,
  AgentXMessagePart,
  AgentXRichCard,
  AgentXSelectedAction,
  AgentXToolStep,
} from '@nxt1/core/ai';
import {
  AGENT_X_ALLOWED_MIME_TYPES,
  AGENT_X_RUNTIME_CONFIG,
  resolveAttachmentType,
} from '@nxt1/core/ai';
import { ModalController } from '@ionic/angular/standalone';
import { NxtSheetHeaderComponent } from '../../../components/bottom-sheet/sheet-header.component';
import {
  NxtChatBubbleComponent,
  type ChatBubbleMediaRequestedEvent,
} from '../../../components/chat-bubble';
import { NxtIconComponent } from '../../../components/icon';
import { AGENT_X_OPERATION_CHAT_TEST_IDS } from '@nxt1/core/testing';
import { AgentXInputBarComponent } from '../inputs/agent-x-input-bar.component';
import { ChatBubbleActionsComponent } from './agent-x-chat-bubble-actions.component';
import { AgentXOperationChatQuickPromptsComponent } from './agent-x-operation-chat-quick-prompts.component';
import { AgentXOperationChatThinkingComponent } from './agent-x-operation-chat-thinking.component';
import { AgentXOperationChatExecutionPlanComponent } from './agent-x-operation-chat-execution-plan.component';
import { AgentXMessageUndoComponent } from './agent-x-message-undo.component';
import { AgentXOperationChatMessageFacade } from './agent-x-operation-chat-message.facade';
import {
  AgentXOperationChatAttachmentsFacade,
  buildVideoUploadProgressDetail,
  type VideoUploadBatchProgressState,
} from './agent-x-operation-chat-attachments.facade';
import { AgentXOperationChatRunControlFacade } from './agent-x-operation-chat-run-control.facade';
import { AgentXOperationChatSessionFacade } from './agent-x-operation-chat-session.facade';
import { AgentXOperationChatTransportFacade } from './agent-x-operation-chat-transport.facade';
import type { BatchEmailCampaignProgress } from './agent-x-operation-chat-transport.facade';
import {
  buildOperationChatInputPlaceholder,
  collectOperationChatMediaUrlsFromText,
  normalizeOperationChatMediaUrl,
  resolveCoordinatorActionId,
} from './agent-x-operation-chat.utils';
import { AgentXOperationChatYieldFacade } from './agent-x-operation-chat-yield.facade';
import { AgentXOperationChatRecurringFacade } from './agent-x-operation-chat-recurring.facade';
import { AgentXOperationChatRecurringTasksDockComponent } from './agent-x-operation-chat-recurring-tasks-dock.component';
import {
  AgentXOperationChatHintFacade,
  type AgentXPanelHintKind,
} from './agent-x-operation-chat-hint.facade';
import { AgentXOperationChatHintDockComponent } from './agent-x-operation-chat-hint-dock.component';
import {
  AgentXOperationEventService,
  type OperationEventSubscription,
} from '../../services/agent-x-operation-event.service';
import { NxtPlatformIconComponent } from '../../../components/platform-icon/platform-icon.component';
import { NxtInlineVideoPreviewDirective } from '../../../components/video-preview';
import { NxtDragDropDirective } from '../../../services/gesture';
import {
  AgentXActionCardComponent,
  type ActionCardOpenMediaEvent,
} from '../cards/agent-x-action-card.component';
import type { BillingActionResolvedEvent } from '../cards/agent-x-billing-action-card.component';
import type { AgentYieldState } from '@nxt1/core';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';
import type { AgentXPendingFile } from '../../types/agent-x-pending-file';
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
import type {
  OperationMessage,
  PendingFile,
  MessageAttachment,
  StreamTurnWatermark,
} from './agent-x-operation-chat.models';

export type { OperationQuickAction } from './agent-x-operation-chat.types';

const PAUSE_RESUME_TOOL_NAME = 'resume_paused_operation';
const ACTIVITY_GAP_TIMEOUT_MS = AGENT_X_RUNTIME_CONFIG.clientRecovery.activityGapTimeoutMs;
const LABEL_VARIANT_MIN_DISPLAY_MS = 2_500; // Minimum time between shimmer label rotations (connected/streaming)
const OPERATIONS_LOG_REFRESH_DELAYS_MS = [0, 1_000, 2_500, 5_000] as const;
const TECHNICAL_PROGRESS_PATTERN =
  /(\blatency\b|\bp95\b|\bp99\b|\btokens?\b|\btps\b|\bthroughput\b|\bwatermark\b|\bseq\b|\bsse\b|\bfirestore\b|\bidempotency\b|\b\d+(?:\.\d+)?\s*ms\b)/i;
const CONTEXT_READY_PROGRESS_PATTERN = /^context\s+(?:ready|loaded)\b[.!?]?/i;
const SENDING_PROGRESS_PATTERN = /^sending\b[.!?]?/i;
const RECONNECTING_PROGRESS_PATTERN = /^reconnecting\b[.!?]?/i;

type ChatActivityPhase =
  | 'idle'
  | 'sending'
  | 'connected'
  | 'streaming'
  | 'running_tool'
  | 'waiting_delta'
  | 'reconnecting'
  | 'paused'
  | 'awaiting_input'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

const DEFAULT_SPORTY_ACTIVITY_LABELS = [
  'Agent X is in your corner...',
  'Standing by for the next play...',
] as const;

const SPORTY_ACTIVITY_LABELS: Partial<Record<ChatActivityPhase, readonly string[]>> = {
  sending: ['Getting started...', 'Preparing to execute...'],
  connected: ['Reading the play...', 'Checking the matchups...'],
  streaming: ['Reading the play...', 'Working the game plan...'],
  running_tool: ['Running the next rep...', 'Checking the tape...'],
  waiting_delta: ['Setting up the next rep...', 'Building the next play...'],
  reconnecting: ['Back in the game...', 'Rejoining the huddle...'],
  idle: DEFAULT_SPORTY_ACTIVITY_LABELS,
};

type YieldStateSource =
  | 'input-binding'
  | 'sse-operation'
  | 'thread-metadata'
  | 'thread-metadata-empty'
  | 'firestore-fallback'
  | 'stored-state-rehydrate'
  | 'stored-state-pending';

export function resolveDockedExecutionPlanCard(
  messages: readonly OperationMessage[]
): AgentXRichCard | null {
  const resolvePlannerCard = (card: AgentXRichCard): AgentXRichCard | null => {
    if (card.type !== 'planner') return null;

    const payload = card.payload;
    if (!('items' in payload) || !Array.isArray(payload.items) || payload.items.length < 1) {
      return null;
    }

    const hasExecutionStarted = payload.items.some((item: unknown) => {
      if (!item || typeof item !== 'object') return false;
      const maybeItem = item as Record<string, unknown>;
      return (
        maybeItem['active'] === true ||
        maybeItem['done'] === true ||
        (typeof maybeItem['status'] === 'string' && maybeItem['status'] !== 'pending')
      );
    });

    return hasExecutionStarted ? card : null;
  };

  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (!message) continue;

    const parts = message.parts ?? [];
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex];
      if (part?.type === 'card') {
        const plannerCard = resolvePlannerCard(part.card);
        if (plannerCard) {
          return plannerCard;
        }
      }
    }

    const cards = message.cards ?? [];
    for (let cardIndex = cards.length - 1; cardIndex >= 0; cardIndex -= 1) {
      const card = cards[cardIndex];
      if (card) {
        const plannerCard = resolvePlannerCard(card);
        if (plannerCard) {
          return plannerCard;
        }
      }
    }
  }

  return null;
}

export function resolveVisibleDockedExecutionPlanCard(
  messages: readonly OperationMessage[],
  executionMode: AgentXExecutionMode,
  showApprovedExecutionPlanInExecuteMode = false
): AgentXRichCard | null {
  if (
    executionMode !== 'plan' &&
    !(executionMode === 'execute' && showApprovedExecutionPlanInExecuteMode)
  ) {
    return null;
  }

  return resolveDockedExecutionPlanCard(messages);
}

function isApprovedExecutionPlanDecisionMessage(msg: OperationMessage): boolean {
  return (
    typeof msg.idempotencyKey === 'string' && msg.idempotencyKey.endsWith(':user_approved_action')
  );
}

function messageIncludesExecuteSavedPlanStep(msg: OperationMessage): boolean {
  if (msg.yieldState?.pendingToolCall?.toolName === 'execute_saved_plan') {
    return true;
  }

  return (msg.steps ?? []).some((step) => {
    const metadata = step.metadata as Record<string, unknown> | undefined;
    const toolName = metadata?.['toolName'];
    return typeof toolName === 'string' && toolName.trim().toLowerCase() === 'execute_saved_plan';
  });
}

export function shouldShowApprovedExecutionPlanDockFromMessages(
  messages: readonly OperationMessage[]
): boolean {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;

    if (message.role === 'user' && !isApprovedExecutionPlanDecisionMessage(message)) {
      return false;
    }

    if (
      isApprovedExecutionPlanDecisionMessage(message) ||
      messageIncludesExecuteSavedPlanStep(message)
    ) {
      return true;
    }
  }

  return false;
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
    NxtInlineVideoPreviewDirective,
    NxtPlatformIconComponent,
    AgentXInputBarComponent,
    ChatBubbleActionsComponent,
    AgentXOperationChatQuickPromptsComponent,
    AgentXOperationChatThinkingComponent,
    AgentXOperationChatExecutionPlanComponent,
    AgentXMessageUndoComponent,
    AgentXActionCardComponent,
    AgentXOperationChatRecurringTasksDockComponent,
    AgentXOperationChatHintDockComponent,
  ],
  template: `
    <div
      class="operation-chat-shell"
      nxtDragDrop
      (focusin)="onFocusWithinChat($event)"
      (dragStateChange)="attachmentsFacade.onDragStateChange($event)"
      (filesDropped)="attachmentsFacade.onFilesDropped($event)"
      (selectedContextsDropped)="attachmentsFacade.addPendingSelectedContexts($event)"
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

        @for (msg of messages(); track msg.id; let first = $first; let idx = $index) {
          @if (!shouldHideMessage(msg)) {
            <div
              class="msg-row"
              [class.msg-user]="msg.role === 'user'"
              [class.msg-assistant]="msg.role === 'assistant'"
              [class.msg-system]="msg.role === 'system'"
              [class.msg-error]="msg.error"
              [class.msg-row--wide]="!!msg.yieldState"
            >
              @if (hasBubbleProse(msg) || (!approvalYieldForMessage(msg) && isAskUserYield(msg))) {
                <nxt1-chat-bubble
                  variant="agent-operation"
                  [isOwn]="msg.role === 'user'"
                  [content]="messageContentForBubble(msg)"
                  [isStreaming]="msg.id === 'typing' && isActivityInFlight()"
                  [typingLabel]="msg.id === 'typing' ? thinkingLabel() : 'Thinking...'"
                  [isError]="!!msg.error"
                  [isSystem]="msg.role === 'system'"
                  [steps]="messageStepsForBubble(msg)"
                  [cards]="messageCardsForBubble(msg)"
                  [parts]="messagePartsForBubble(msg)"
                  [externalCardState]="resolveExternalCardStateForMessage(msg, idx)"
                  [externalResolvedText]="msg.yieldResolvedText ?? ''"
                  (mediaRequested)="onBubbleMediaRequested($event)"
                  (timestampClicked)="onBubbleTimestampClicked($event)"
                  (billingActionResolved)="onBillingActionResolved($event)"
                  (retryRequested)="runControlFacade.onRetryErrorMessage(msg)"
                />
                @if (msg.id === 'typing' && showThinking()) {
                  <nxt1-agent-x-operation-chat-thinking
                    class="msg-inline-thinking"
                    [class.msg-inline-thinking--upload]="_videoUploadPercent() !== null"
                    [label]="thinkingLabel()"
                    [detail]="videoUploadDetail()"
                    [progressPercent]="_videoUploadPercent()"
                  />
                }
              }
              @if (approvalYieldForMessage(msg); as approvalYield) {
                <nxt1-agent-action-card
                  [yield]="approvalYield"
                  [card]="findApprovalCard(msg)"
                  [operationId]="msg.operationId || yieldFacade.yieldOperationId()"
                  [messageId]="msg.id"
                  [externalCardState]="approvalCardStateForMessage(msg, idx)"
                  [externalResolvedText]="approvalResolvedTextForMessage(msg)"
                  (approve)="yieldFacade.onApproveAction($event)"
                  (reply)="yieldFacade.onReplyAction($event)"
                  (openMedia)="onApprovalCardOpenMedia($event)"
                />
              }
              @if (!msg.yieldState && messageAttachmentsForStrip(msg).length) {
                <div class="msg-attachments">
                  @for (att of messageAttachmentsForStrip(msg); track att.name + $index) {
                    <div
                      class="msg-attachment"
                      [class.msg-attachment--media]="att.type === 'image' || att.type === 'video'"
                      [class.msg-attachment--app]="att.type === 'app'"
                    >
                      @if (att.type === 'image') {
                        @if (attachmentImageUrl(att); as imageUrl) {
                          <img
                            [src]="imageUrl"
                            [alt]="att.name"
                            class="msg-attachment__thumb"
                            (error)="onAttachmentThumbnailError($event, imageUrl)"
                            (click)="
                              attachmentsFacade.openAttachmentViewer(
                                messageAttachmentsForStrip(msg),
                                $index,
                                { messageId: msg.id }
                              )
                            "
                          />
                        } @else {
                          <button
                            type="button"
                            class="msg-attachment__thumb msg-attachment__image-fallback"
                            [attr.aria-label]="'Open image: ' + att.name"
                            (click)="
                              attachmentsFacade.openAttachmentViewer(
                                messageAttachmentsForStrip(msg),
                                $index,
                                { messageId: msg.id }
                              )
                            "
                          >
                            <nxt1-icon name="image" [size]="18" />
                          </button>
                        }
                      } @else if (att.type === 'video') {
                        <video
                          nxt1InlineVideoPreview
                          [nxt1InlineVideoPreview]="att.url"
                          [nxt1InlineVideoPreviewPoster]="attachmentVideoPosterUrl(att)"
                          class="msg-attachment__thumb msg-attachment__video-inline"
                          [attr.aria-label]="'Open video: ' + att.name"
                          (click)="
                            attachmentsFacade.openAttachmentViewer(
                              messageAttachmentsForStrip(msg),
                              $index,
                              { messageId: msg.id }
                            )
                          "
                        ></video>
                        <div
                          class="msg-attachment__play"
                          (click)="
                            attachmentsFacade.openAttachmentViewer(
                              messageAttachmentsForStrip(msg),
                              $index,
                              { messageId: msg.id }
                            )
                          "
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                            <path d="M8 5v14l11-7L8 5z" />
                          </svg>
                        </div>
                      } @else if (att.type === 'app') {
                        <a
                          class="msg-attachment__app"
                          [href]="att.url"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <nxt1-platform-icon
                            class="msg-attachment__app-icon"
                            icon="link"
                            [faviconUrl]="att.faviconUrl"
                            [size]="28"
                            [alt]="att.platform || att.name"
                          />
                          <span class="msg-attachment__app-name">{{
                            att.platform || att.name
                          }}</span>
                        </a>
                      } @else if (att.type === 'context') {
                        <div class="msg-attachment__context">
                          <div class="msg-attachment__context-icon">
                            <nxt1-icon [name]="contextAttachmentIcon(att)" [size]="16" />
                          </div>
                          <div class="msg-attachment__context-info">
                            <span class="msg-attachment__context-name">{{ att.name }}</span>
                            <span class="msg-attachment__context-meta">{{
                              att.contextSource || contextAttachmentLabel(att)
                            }}</span>
                          </div>
                        </div>
                      } @else {
                        <div
                          class="msg-attachment__doc"
                          (click)="
                            attachmentsFacade.openAttachmentViewer(msg.attachments!, $index, {
                              messageId: msg.id,
                            })
                          "
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
        }

        <!-- ═══ BATCH EMAIL CAMPAIGN PROGRESS PANEL ═══ -->
        @if (showBatchEmailProgress()) {
          <div class="batch-email-progress">
            <div class="batch-email-progress__header">
              <svg
                class="batch-email-progress__icon"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                aria-hidden="true"
              >
                <path
                  d="M2.5 5.5h15M2.5 5.5l7.5 6 7.5-6M2.5 5.5v9h15v-9"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span class="batch-email-progress__label">{{ batchEmailProgressLabel() }}</span>
            </div>
            <div class="batch-email-progress__bar-track">
              <div
                class="batch-email-progress__bar-fill"
                [style.width.%]="
                  _batchEmailProgress()!.total > 0
                    ? ((_batchEmailProgress()!.sent + _batchEmailProgress()!.failed) /
                        _batchEmailProgress()!.total) *
                      100
                    : 0
                "
              ></div>
            </div>
            <div class="batch-email-progress__recipients">
              @for (r of _batchEmailProgress()!.recipients; track r.email) {
                <div
                  class="batch-email-progress__recipient"
                  [class.batch-email-progress__recipient--sending]="r.status === 'sending'"
                  [class.batch-email-progress__recipient--sent]="r.status === 'sent'"
                  [class.batch-email-progress__recipient--failed]="r.status === 'failed'"
                >
                  <svg
                    class="batch-email-progress__status-icon"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden="true"
                  >
                    @if (r.status === 'sent') {
                      <path
                        d="M2 6l3 3 5-5"
                        stroke="#66bb6a"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    } @else if (r.status === 'failed') {
                      <path
                        d="M3 3l6 6M9 3l-6 6"
                        stroke="#ef5350"
                        stroke-width="1.5"
                        stroke-linecap="round"
                      />
                    } @else {
                      <circle
                        cx="6"
                        cy="6"
                        r="4"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-dasharray="3 3"
                      />
                    }
                  </svg>
                  <span class="batch-email-progress__email">{{ r.email }}</span>
                </div>
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
            [paused]="isExecutionPlanPaused()"
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

        @if (recurringFacade.shouldRenderDock()) {
          <nxt1-agent-x-operation-chat-recurring-tasks-dock
            [tasks]="recurringFacade.items()"
            [loading]="recurringFacade.loading()"
            [cancellingTaskKeys]="recurringFacade.cancellingTaskKeys()"
            [expanded]="recurringDockExpanded()"
            (expandedChange)="recurringDockExpanded.set($event)"
            (cancelTask)="recurringFacade.cancelRecurringTask($event)"
          />
        }

        @if (hintFacade.shouldRenderDock()) {
          <nxt1-agent-x-operation-chat-hint-dock
            [hints]="hintFacade.hints()"
            (dismissHint)="hintFacade.dismissHint($event)"
          />
        }

        <nxt1-agent-x-input-bar
          [userMessage]="inputValue()"
          [isLoading]="_loading()"
          [canSend]="canSend()"
          [pendingFiles]="promptInputPendingFiles()"
          [pendingSources]="pendingConnectedSources()"
          [pendingContexts]="pendingSelectedContexts()"
          [selectedTask]="null"
          [executionMode]="selectedExecutionMode()"
          [placeholder]="getInputPlaceholder()"
          (messageChange)="inputValue.set($event)"
          (executionModeChange)="selectedExecutionMode.set($event)"
          (send)="onSendRequested()"
          (pause)="runControlFacade.pauseStream()"
          (toggleAttachments)="attachmentsFacade.onUploadClick()"
          (filesPasted)="attachmentsFacade.onFilesPasted($event)"
          (openFile)="attachmentsFacade.openPendingFileViewer($event)"
          (removeFile)="attachmentsFacade.removePendingFile($event)"
          (removeSource)="attachmentsFacade.removePendingConnectedSource($event)"
          (removeContext)="attachmentsFacade.removePendingSelectedContext($event)"
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
            <h3 class="chat-drop-overlay__title">Drop to attach</h3>
            <p class="chat-drop-overlay__copy">
              Images, videos, PDFs, docs, spreadsheets, clips, plays, and game plans are supported.
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
        --op-context-icon-fg: var(--op-primary);
        --op-context-icon-bg: color-mix(in srgb, var(--op-primary) 14%, transparent);
        --op-glass-bg: var(--agent-glass-bg, var(--nxt1-glass-bg, rgba(18, 18, 18, 0.8)));
        --op-drop-overlay-gradient-top: color-mix(in srgb, var(--op-primary) 16%, transparent);
        --op-drop-overlay-gradient-bottom: color-mix(in srgb, var(--op-primary) 6%, transparent);
        --op-drop-overlay-bg: color-mix(in srgb, var(--op-glass-bg) 82%, transparent);
        --op-drop-overlay-border: color-mix(in srgb, var(--op-primary) 32%, transparent);
        --op-drop-overlay-shadow: 0 18px 48px var(--nxt1-color-alpha-black30, rgba(0, 0, 0, 0.3));
        --op-drop-overlay-card-bg: color-mix(
          in srgb,
          var(--op-glass-bg) 88%,
          var(--nxt1-color-bg-primary, #0a0a0a)
        );
        --op-drop-overlay-card-border: color-mix(
          in srgb,
          var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12)) 86%,
          transparent
        );
        --op-drop-overlay-icon-bg: color-mix(in srgb, var(--op-primary) 12%, transparent);
        --op-drop-overlay-icon-ring: color-mix(in srgb, var(--op-primary) 16%, transparent);
      }

      :host-context(.light),
      :host-context([data-theme='light']),
      :host-context([data-base-theme='light']) {
        color: var(--nxt1-color-text-primary, #1a1a1a);

        --op-surface: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.03));
        --op-border: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.08));
        --op-text: var(--nxt1-color-text-primary, #1a1a1a);
        --op-text-secondary: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        --op-text-muted: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.45));
        --op-context-icon-fg: var(--nxt1-color-text-primary, #1a1a1a);
        --op-context-icon-bg: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.06));
        --op-glass-bg: var(--nxt1-glass-bg, rgba(255, 255, 255, 0.8));
        --op-drop-overlay-bg: color-mix(in srgb, var(--op-glass-bg) 90%, transparent);
        --op-drop-overlay-card-bg: color-mix(
          in srgb,
          var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.95)) 96%,
          transparent
        );
        --op-drop-overlay-card-border: color-mix(
          in srgb,
          var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.14)) 92%,
          transparent
        );
        --op-drop-overlay-shadow: 0 18px 40px var(--nxt1-color-alpha-black12, rgba(0, 0, 0, 0.12));

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
          linear-gradient(
            180deg,
            var(--op-drop-overlay-gradient-top),
            var(--op-drop-overlay-gradient-bottom)
          ),
          var(--op-drop-overlay-bg);
        border: 1px solid var(--op-drop-overlay-border);
        border-radius: 24px;
        box-shadow: var(--op-drop-overlay-shadow);
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
        background: var(--op-drop-overlay-card-bg);
        border: 1px solid var(--op-drop-overlay-card-border);
      }

      .chat-drop-overlay__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: 18px;
        color: var(--op-primary);
        background: var(--op-drop-overlay-icon-bg);
        box-shadow: inset 0 0 0 1px var(--op-drop-overlay-icon-ring);
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

      /* ── BATCH EMAIL CAMPAIGN PROGRESS PANEL ── */
      .batch-email-progress {
        border-radius: 12px;
        border: 1px solid rgba(204, 255, 0, 0.15);
        background: rgba(204, 255, 0, 0.04);
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        animation: card-entrance 0.25s ease;
      }

      .batch-email-progress__header {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .batch-email-progress__icon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      .batch-email-progress__label {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.01em;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .batch-email-progress__bar-track {
        width: 100%;
        height: 3px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        overflow: hidden;
      }

      .batch-email-progress__bar-fill {
        height: 100%;
        background: var(--nxt1-color-primary, #ccff00);
        border-radius: 999px;
        transition: width 0.4s ease;
        min-width: 4px;
      }

      .batch-email-progress__recipients {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 140px;
        overflow-y: auto;
      }

      .batch-email-progress__recipient {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .batch-email-progress__status-icon {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
      }

      .batch-email-progress__recipient--sending .batch-email-progress__status-icon {
        color: var(--nxt1-color-primary, #ccff00);
        animation: ac-spin 1.2s linear infinite;
        transform-origin: center center;
      }

      .batch-email-progress__recipient--sent .batch-email-progress__email {
        color: rgba(255, 255, 255, 0.5);
      }

      .batch-email-progress__recipient--failed .batch-email-progress__email {
        color: rgba(239, 83, 80, 0.8);
      }

      .batch-email-progress__email {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
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

      @keyframes ac-spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
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
        max-width: 94%;
      }

      .msg-inline-thinking {
        align-self: flex-start;
        /* Label should align with assistant bubble text start (16px inset).
           Spinner(16px)+gap(8px)=24px, so shift the inline shimmer left by 24px. */
        margin-left: -24px;
      }

      .msg-inline-thinking--upload {
        margin-left: 0;
        max-width: min(100%, 296px);
      }

      .msg-assistant ::ng-deep nxt1-chat-bubble {
        background: var(--op-surface);
        border: 1px solid var(--op-border);
        border-radius: 14px;
        padding: 16px 18px;
        color: var(--op-text);
        font-size: 1.02rem;
        line-height: 1.62;
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

      .msg-attachment:has(.msg-attachment__context) {
        height: auto;
      }

      .msg-attachment__thumb {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
        cursor: pointer;
        background: #000;
      }

      .msg-attachment__image-fallback,
      .msg-attachment__video-fallback {
        appearance: none;
        border: 0;
        padding: 0;
        color: var(--op-text-secondary, rgba(255, 255, 255, 0.72));
        background:
          radial-gradient(circle at 32% 22%, rgba(204, 255, 0, 0.22), transparent 36%),
          linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.035)), #111;
      }

      .msg-attachment__image-fallback {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Inline <video> tile — uses a real poster when available and otherwise
         matches nxt1-markdown's timestamp preview fallback for mobile Safari. */
      .msg-attachment__video-inline {
        display: block;
        width: 100%;
        height: 100%;
        background: #000;
        object-fit: contain;
        pointer-events: auto;
      }

      .msg-attachment__play {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        color: #fff;
        pointer-events: none;
      }

      .msg-attachment__play svg {
        width: 24px;
        height: 24px;
        padding: 7px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.58);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
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

      .msg-attachment__context {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 150px;
        max-width: 220px;
        min-height: 56px;
        padding: 8px 10px;
        box-sizing: border-box;
      }

      .msg-attachment__context-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border-radius: 8px;
        color: var(--op-context-icon-fg);
        background: var(--op-context-icon-bg);
        flex-shrink: 0;
      }

      .msg-attachment__context-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .msg-attachment__context-name,
      .msg-attachment__context-meta {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .msg-attachment__context-name {
        color: var(--op-text);
        font-size: 12px;
        font-weight: 700;
      }

      .msg-attachment__context-meta {
        color: var(--op-text-secondary);
        font-size: 10px;
        text-transform: capitalize;
      }

      .msg-attachment--app {
        width: 72px;
        height: 72px;
        border-radius: 10px;
      }

      .msg-attachment__app {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 8px 6px;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        text-decoration: none;
        color: inherit;
      }

      .msg-attachment__app-icon {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        flex-shrink: 0;
      }

      .msg-attachment__app-info {
        display: none;
      }

      .msg-attachment__app-name {
        font-size: 9px;
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #fff);
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        line-height: 1.3;
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
    AgentXOperationChatRecurringFacade,
    AgentXOperationChatHintFacade,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXOperationChatComponent implements AfterViewInit, OnDestroy {
  private readonly modalCtrl = inject(ModalController);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  protected readonly messageFacade = inject(AgentXOperationChatMessageFacade);
  protected readonly runControlFacade = inject(AgentXOperationChatRunControlFacade);
  protected readonly attachmentsFacade = inject(AgentXOperationChatAttachmentsFacade);
  private readonly sessionFacade = inject(AgentXOperationChatSessionFacade);
  private readonly transportFacade = inject(AgentXOperationChatTransportFacade);
  private readonly operationEventService = inject(AgentXOperationEventService);
  protected readonly yieldFacade = inject(AgentXOperationChatYieldFacade);
  protected readonly recurringFacade = inject(AgentXOperationChatRecurringFacade);
  protected readonly hintFacade = inject(AgentXOperationChatHintFacade);
  private readonly hostElement = inject(ElementRef);
  private readonly desktopAttachmentFileInput = viewChild<ElementRef<HTMLInputElement>>(
    'desktopAttachmentFileInput'
  );

  /** Shared keyboard offset binding used by shell and operation chat. */
  private keyboardOffsetBinding?: AgentXKeyboardOffsetBinding;
  private readonly failedAttachmentThumbnailUrls = new Set<string>();
  /** Active SSE abort controller — cancelled on destroy or when a new message starts. */
  private activeStream: AbortController | null = null;

  /** RAF handle for batched auto-scroll writes. */
  private pendingScrollFrame: number | null = null;

  /** Most recent requested scroll behavior for the next batched scroll write. */
  private pendingScrollBehavior: ScrollBehavior = 'auto';

  /** Timers used for post-focus scroll corrections while keyboard animates in. */
  private focusScrollTimers: ReturnType<typeof setTimeout>[] = [];

  /** Last focus zone inside the sheet, used to keep keyboard auto-scroll targeted. */
  private lastFocusedZone: 'composer' | 'action-card' | 'other' = 'other';

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
  private _streamTurnWatermark: StreamTurnWatermark | null = null;

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

  /** Explicit recipient label for the composer placeholder. */
  @Input() inputRecipientLabel = '';

  protected getInputPlaceholder(): string {
    if (this.selectedExecutionMode() === 'plan') {
      return 'Outline the goal to plan out';
    }

    return buildOperationChatInputPlaceholder(this.inputRecipientLabel);
  }

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

  /** When true, stage initialMessage in the composer without auto-sending it. */
  @Input() draftOnlyOnOpen = false;

  /** Initial execution mode used for auto-sent composer payloads. */
  @Input() initialExecutionMode: AgentXExecutionMode = 'execute';

  /** Optional initial files to seed into the pending files strip when opening. */
  @Input() initialFiles: readonly PendingFile[] = [];

  /** Optional staged connected sources to seed into the composer when opening. */
  @Input() initialConnectedSources: readonly ConnectedAppSource[] = [];

  /** When true, auto-dispatches the initial composer payload after mount. */
  @Input() autoSendOnOpen = false;

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
   * Hint from parent shells that this thread has scheduled recurring tasks.
   * Used to keep recurring-task UI affordances visible during loading states.
   */
  @Input() hasRecurringTasksHint = false;

  /**
   * Optional callback to pass the current live view status to the parent.
   * Allows the hint facade to know when a live view session is active.
   */
  private readonly _hasActiveLiveView = signal(false);

  @Input()
  set hasActiveLiveView(value: boolean) {
    this._hasActiveLiveView.set(!!value);
  }

  get hasActiveLiveView(): boolean {
    return this._hasActiveLiveView();
  }

  private readonly _activeContextPanel = signal<AgentXPanelHintKind | null>(null);

  @Input()
  set activeContextPanel(value: AgentXPanelHintKind | null) {
    this._activeContextPanel.set(value);
  }

  get activeContextPanel(): AgentXPanelHintKind | null {
    return this._activeContextPanel();
  }

  /**
   * When the operation is in `awaiting_input` state, the shell passes
   * its yield state so the action card renders at the bottom of the thread.
   */
  @Input()
  set yieldState(value: AgentYieldState | null) {
    this.applyYieldState({
      yieldState: value,
      source: 'input-binding',
    });
  }

  /**
   * Current operation status — when `'error'`, the failure banner is shown
   * after thread messages load so the user knows what happened.
   */
  @Input()
  set operationStatus(
    value:
      | 'processing'
      | 'complete'
      | 'error'
      | 'paused'
      | 'awaiting_input'
      | 'awaiting_approval'
      | 'cancelled'
      | null
  ) {
    this._operationStatus.set(value);
  }

  get operationStatus():
    | 'processing'
    | 'complete'
    | 'error'
    | 'paused'
    | 'awaiting_input'
    | 'awaiting_approval'
    | 'cancelled'
    | null {
    return this._operationStatus();
  }

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
  protected readonly selectedExecutionMode = signal<AgentXExecutionMode>('execute');

  /** Whether an AI response is being generated. */
  protected readonly _loading = signal(false);

  /**
   * Video upload progress (0–100) while Cloudflare TUS upload is in-flight.
   * `null` when no upload is active. Drives the progress indicator in the
   * unified context/waiting loader so users see real-time feedback on large uploads.
   */
  protected readonly _videoUploadPercent = signal<number | null>(null);

  /** Queue-aware video upload state used to render smooth multi-file progress. */
  protected readonly _videoUploadBatch = signal<VideoUploadBatchProgressState | null>(null);

  /** Human-readable upload phase label for the inline upload status card. */
  protected readonly _videoUploadLabel = computed(() => {
    const uploadBatch = this._videoUploadBatch();
    if (!uploadBatch) return null;

    if (uploadBatch.totalFiles <= 1) {
      if (uploadBatch.overallPercent === 0) return 'Preparing video…';
      return 'Uploading video…';
    }

    if (uploadBatch.overallPercent === 0 && uploadBatch.completedFiles === 0) {
      return `Preparing ${uploadBatch.totalFiles} videos…`;
    }

    return `Uploading ${uploadBatch.totalFiles} videos…`;
  });

  /** Secondary upload detail for file name / batch completion counts. */
  protected readonly videoUploadDetail = computed(() => {
    return buildVideoUploadProgressDetail(this._videoUploadBatch());
  });

  /** Most recent backend progress commentary message (stage/subphase/metric). */
  protected readonly _latestProgressLabel = signal<string | null>(null);

  /** Per-recipient send status for in-flight batch email campaigns. */
  protected readonly _batchEmailProgress = signal<BatchEmailCampaignProgress | null>(null);

  /** Whether a batch email is currently being sent (drives the progress panel). */
  protected readonly showBatchEmailProgress = computed(
    () => this._batchEmailProgress() !== null && this.contextType === 'operation'
  );

  /** Friendly progress label for the batch email progress panel. */
  protected readonly batchEmailProgressLabel = computed(() => {
    const p = this._batchEmailProgress();
    if (!p) return '';
    const done = p.sent + p.failed;
    return `Sending email ${done + 1} of ${p.total}…`;
  });

  /** Signal-backed operation lifecycle status used by selectors and status badges. */
  private readonly _operationStatus = signal<
    | 'processing'
    | 'complete'
    | 'error'
    | 'paused'
    | 'awaiting_input'
    | 'awaiting_approval'
    | 'cancelled'
    | null
  >(null);

  /** Runtime-only activity phase for deterministic loader/shimmer state. */
  private readonly _activityPhase = signal<ChatActivityPhase>('idle');

  /** Runtime label associated with current in-flight activity phase. */
  private readonly _activityLabel = signal<string | null>(null);

  /** Rotates generic in-flight labels so long waits do not feel stuck. */
  private readonly _activityLabelVariant = signal(0);

  /** Last timestamp at which the variant was rotated (prevents too-frequent label flips). */
  private readonly _lastLabelVariantChangeAt = signal(0);

  /** Last timestamp at which a stream pulse (delta/step/progress) was observed. */
  private readonly _lastActivityPulseAt = signal(0);

  /** Timeout handle for transitioning from active work to waiting-delta shimmer state. */
  private activityGapTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * MongoDB thread ID resolved after the first message.
   * Captured from the SSE `event: thread` frame or HTTP response
   * and included in subsequent requests for conversation continuity.
   */
  private readonly _resolvedThreadId = signal<string | null>(null);
  protected readonly recurringDockExpanded = signal(false);

  /** Structured quick action metadata for the next auto-sent chip selection. */
  private readonly _pendingSelectedAction = signal<AgentXSelectedAction | null>(null);

  /** Active yield state for this operation (set via input binding). */
  protected readonly activeYieldState = signal<AgentYieldState | null>(null);

  /** Whether the yield has been resolved (approved/replied). */
  protected readonly yieldResolved = signal(false);

  /** Tracks the last accepted yield identity and source priority for deterministic reconciliation. */
  private readonly yieldResolutionStamp = signal<{ key: string; priority: number } | null>(null);

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

  /** Explicit user-selected contexts staged for this turn (film/playbook/game plan/etc.). */
  protected readonly pendingSelectedContexts = this.attachmentsFacade.pendingSelectedContexts;

  /** Pending files converted to AgentXPendingFile shape for prompt-input component. */
  protected readonly promptInputPendingFiles = computed<readonly AgentXPendingFile[]>(() =>
    this.pendingFiles().map((pf) => ({
      file: pf.file,
      ...(pf.nativeUri ? { nativeUri: pf.nativeUri } : {}),
      ...(pf.nativeWebPath ? { nativeWebPath: pf.nativeWebPath } : {}),
      ...(pf.sizeBytes ? { sizeBytes: pf.sizeBytes } : {}),
      previewUrl: pf.previewUrl,
      type: resolveAttachmentType(pf.file.type),
    }))
  );

  /** Live override for execute-mode plan docking; null falls back to persisted message history. */
  private readonly showApprovedExecutionPlanDock = signal<boolean | null>(null);

  /** Most recent planner card so execution plan can dock above the composer. */
  protected readonly executionPlanCard = computed<AgentXRichCard | null>(() => {
    const messages = this.messages();
    return resolveVisibleDockedExecutionPlanCard(
      messages,
      this.selectedExecutionMode(),
      this.showApprovedExecutionPlanDock() ??
        shouldShowApprovedExecutionPlanDockFromMessages(messages)
    );
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

  /** Freeze execution-plan active spinner whenever the operation is paused. */
  protected readonly isExecutionPlanPaused = computed(
    () => this.operationStatus === 'paused' || this._activityPhase() === 'paused'
  );

  /** Whether the activity state machine currently considers the run in-flight. */
  protected readonly isActivityInFlight = computed(() => {
    if (this.isTerminalOperationStatus()) {
      return false;
    }

    switch (this._activityPhase()) {
      case 'sending':
      case 'connected':
      case 'streaming':
      case 'running_tool':
      case 'waiting_delta':
      case 'reconnecting':
        return true;
      default:
        return false;
    }
  });

  /**
   * True when the typing bubble has visible text content already flushed into the
   * messages signal. Tool/card/thinking parts are intentionally excluded so waiting
   * phases can still render shimmer while no assistant text has been produced yet.
   */
  private readonly typingBubbleHasContent = computed(() => {
    const typing = this.messages().find((m) => m.id === 'typing');
    if (!typing) return false;
    // Only text content counts — tool-steps/thinking/card/image/video parts are
    // inline indicators, not final visible text. If only those parts exist the
    // shimmer should remain visible (e.g. between last tool completing and the
    // agent starting to stream its final text response).
    if (typing.content.length > 0) return true;
    return (typing.parts ?? []).some((p) => p.type === 'text' && p.content.length > 0);
  });

  /** True once at least one tool-step part is already visible in the typing bubble. */
  private readonly typingBubbleHasToolSteps = computed(() => {
    const typing = this.messages().find((m) => m.id === 'typing');
    if (!typing) return false;
    return (typing.parts ?? []).some((p) => p.type === 'tool-steps' && p.steps.length > 0);
  });

  /** Whether to show the persistent backend-driven progress indicator.
   * Connection and active streaming phases suppress shimmer once text is visible
   * so lifecycle re-entries do not flash over streamed prose. The explicit
   * waiting_delta phase is the exception: it must stay visible between deltas,
   * even after earlier assistant text has already rendered.
   */
  protected readonly showThinking = computed(() => {
    if (this.isTerminalOperationStatus()) {
      return false;
    }

    const phase = this._activityPhase();

    switch (phase) {
      // running_tool: always working — show until tool-step card is visible.
      case 'running_tool':
        return !this.typingBubbleHasToolSteps();

      // waiting_delta: backend is computing between deltas/tools.
      // Keep the shimmer visible between streamed chunks, even if earlier
      // assistant text has already rendered in the typing bubble.
      case 'waiting_delta':
        return true;

      // Early-connection and streaming phases: suppress once text is already visible.
      // This prevents shimmer re-appearing over existing text when lifecycle events
      // re-enter connected/reconnecting mid-stream (e.g. operation running|queued).
      case 'sending':
      case 'connected':
      case 'reconnecting':
      case 'streaming':
        return !this.typingBubbleHasContent();

      default:
        return false;
    }
  });

  /** Human-readable thinking shimmer label from activity phase and progress updates. */
  protected readonly thinkingLabel = computed(() => {
    const uploadLabel = this._videoUploadLabel();
    if (uploadLabel) return uploadLabel;
    const phase = this._activityPhase();
    // For active-work phases, always use a generic label — never echo raw backend
    // progress strings (e.g. 'Context loaded.', 'Fetching data…') which look confusing.
    if (phase === 'running_tool' || phase === 'waiting_delta') {
      return this.defaultThinkingLabelForPhase(phase);
    }
    const activityLabel = this.toUserFacingThinkingLabel(this._activityLabel());
    if (activityLabel) return activityLabel;
    const progressLabel = this.toUserFacingThinkingLabel(this._latestProgressLabel());
    if (progressLabel) return progressLabel;
    return this.defaultThinkingLabelForPhase(this._activityPhase());
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
  /** Ensures the delayed leave-thread hint is armed only once per chat session. */
  private firstUserRunHintArmed = false;

  /** Emitted when the user sends their first message (briefing should hide). */
  readonly userMessageSent = output<void>();

  /** Emitted after a chat response completes (stream done or HTTP returned). */
  readonly responseComplete = output<void>();

  /** Emitted when a coordinator chip should open a dedicated coordinator context. */
  readonly coordinatorQuickActionSelected = output<OperationQuickAction>();

  /** Emitted when the user saves connected accounts from the connected accounts modal. */
  readonly connectedAccountsSave = output<AgentXConnectedAccountsSaveRequest>();

  /** Emitted when attachments flow requests opening Film Review Library. */
  readonly filmReviewLibraryRequested = output<void>();

  /** Emitted when an assistant markdown timestamp should seek the Film Review panel. */
  readonly filmTimestampSeekRequested = output<number>();

  /** Whether this chat was opened to view a historical thread (suppresses generic welcome). */
  private readonly _isThreadMode = signal(false);

  /** Whether the send button should be enabled. */
  protected readonly canSend = computed(
    () =>
      (this.inputValue().trim().length > 0 || this.pendingFiles().length > 0) && !this._loading()
  );

  private emitOperationsLogRefreshRequest(): void {
    const resolvedThreadId = this.sessionFacade.resolveActiveThreadId()?.trim() || undefined;
    this.operationEventService.emitOperationsLogRefreshRequested(
      'chat-response-complete',
      resolvedThreadId,
      OPERATIONS_LOG_REFRESH_DELAYS_MS
    );
  }

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
    this.recurringFacade.configure({
      resolveActiveThreadId: () => this.sessionFacade.resolveActiveThreadId(),
      hasRecurringTasksHint: () => this.hasRecurringTasksHint,
    });

    this.sessionFacade.configure({
      contextId: () => this.contextId,
      contextType: () => this.contextType,
      threadId: () => this.threadId,
      resumeOperationId: () => this.resumeOperationId,
      initialMessage: () => this.initialMessage,
      initialExecutionMode: () => this.initialExecutionMode,
      draftOnlyOnOpen: () => this.draftOnlyOnOpen,
      initialFiles: () => this.initialFiles,
      initialConnectedSources: () => this.initialConnectedSources,
      autoSendOnOpen: () => this.autoSendOnOpen,
      errorMessage: () => this.errorMessage,
      threadMode: this._isThreadMode,
      inputValue: this.inputValue,
      loading: this._loading,
      latestProgressLabel: this._latestProgressLabel,
      resolvedThreadId: this._resolvedThreadId,
      activeYieldState: this.activeYieldState,
      yieldResolved: this.yieldResolved,
      applyYieldState: ({ yieldState, source, operationId }) => {
        this.applyYieldState({
          yieldState,
          source: source as YieldStateSource,
          ...(operationId ? { operationId } : {}),
        });
      },
      getOperationStatus: () => this.operationStatus,
      setOperationStatus: (status) => {
        this.operationStatus = status;
      },
      setActivityPhase: (phase, label) => {
        this.setActivityPhase(phase, label);
      },
      markActivityPulse: (label) => {
        this.markActivityPulse(label);
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
      hasUserSent: () => this.hasUserSent(),
      markUserMessageSent: () => {
        this.hasUserSent.set(true);
        this.userMessageSent.emit();
      },
      send: (options) =>
        this.runControlFacade.send(
          options
            ? {
                text: options.text,
                executionMode: options.executionMode,
                preserveDraft: options.preserveDraft,
              }
            : undefined
        ),
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
      batchEmailProgress: this._batchEmailProgress,
      resolvedThreadId: this._resolvedThreadId,
      activeYieldState: this.activeYieldState,
      yieldResolved: this.yieldResolved,
      setExecutionMode: (mode) => {
        this.selectedExecutionMode.set(mode);
      },
      setShowApprovedExecutionPlanDock: (visible) => {
        this.showApprovedExecutionPlanDock.set(visible);
      },
      applyYieldState: ({ yieldState, source, operationId }) => {
        this.applyYieldState({
          yieldState,
          source: source as YieldStateSource,
          ...(operationId ? { operationId } : {}),
        });
      },
      clearRealtimePipelines: () => {
        this.messageFacade.clearPendingTypingDelta();
        this._activeFirestoreSub?.unsubscribe();
        this._activeFirestoreSub = null;
        this._shadowFirestoreSub?.unsubscribe();
        this._shadowFirestoreSub = null;
        this._streamTurnWatermark = null;
      },
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
      setActivityPhase: (phase, label) => {
        this.setActivityPhase(phase, label);
      },
      markActivityPulse: (label) => {
        this.markActivityPulse(label);
      },
      emitResponseComplete: () => {
        this.emitOperationsLogRefreshRequest();
        this.responseComplete.emit();
      },
      subscribeToFirestoreJobEvents: (operationId: string, startAfterSeq?: number) =>
        this.sessionFacade.subscribeToFirestoreJobEvents(operationId, startAfterSeq),
      reconcileOperationFromStoredEvents: (operationId: string) => {
        void this.sessionFacade.reconcileOperationFromStoredEvents(operationId);
      },
      onEnqueueHeavyDone: () => {
        this.sessionFacade.handleEnqueueHeavyDone();
      },
      uid: () => this.uid(),
    });
    this.attachmentsFacade.configure({
      contextId: () => this.contextId,
      contextType: () => this.contextType,
      embedded: () => this.embedded,
      resolvedThreadId: this._resolvedThreadId,
      resolveActiveThreadId: () => this.sessionFacade.resolveActiveThreadId(),
      videoUploadPercent: this._videoUploadPercent,
      user: () => this.user,
      clickDesktopAttachmentInput: () => {
        this.desktopAttachmentFileInput()?.nativeElement.click();
      },
      videoUploadBatch: this._videoUploadBatch,
      openFilmReviewLibrary: () => {
        this.filmReviewLibraryRequested.emit();
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
      getOperationStatus: () => this.operationStatus,
      inputValue: this.inputValue,
      loading: this._loading,
      retryStarted: this.retryStarted,
      activeYieldState: this.activeYieldState,
      yieldResolved: this.yieldResolved,
      clearRealtimePipelines: () => {
        this.messageFacade.clearPendingTypingDelta();
        this._activeFirestoreSub?.unsubscribe();
        this._activeFirestoreSub = null;
        this._shadowFirestoreSub?.unsubscribe();
        this._shadowFirestoreSub = null;
        this._streamTurnWatermark = null;
      },
      markEnqueueStopped: () => {
        this.sessionFacade.markEnqueueStopped();
      },
      setOperationStatus: (status) => {
        this.operationStatus = status;
      },
      setActivityPhase: (phase, label) => {
        this.setActivityPhase(phase, label);
      },
      markActivityPulse: (label) => {
        this.markActivityPulse(label);
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
      setShowApprovedExecutionPlanDock: (visible) => {
        this.showApprovedExecutionPlanDock.set(visible);
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
      loadThreadMessages: (threadId) => this.sessionFacade.loadThreadMessages(threadId),
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
        this.scrollToBottom({ behavior: 'smooth' });
      }
    });

    // Trigger recurring task load whenever the thread resolves
    effect(() => {
      const resolvedId = this._resolvedThreadId();
      this.recurringFacade.refreshForThread(resolvedId ?? (this.threadId.trim() || null));
    });

    // Track live view status for hint facade.
    effect(() => {
      const hasLiveView = this._hasActiveLiveView();
      if (hasLiveView) {
        this.hintFacade.markLiveViewActive();
      } else {
        this.hintFacade.markLiveViewInactive();
      }
    });

    effect(() => {
      const activePanel = this._activeContextPanel();
      if (activePanel) {
        this.hintFacade.showPanelHint(activePanel);
      }
    });

    effect(() => {
      const hasUserSent = this.hasUserSent();
      if (hasUserSent && !this.firstUserRunHintArmed) {
        this.firstUserRunHintArmed = true;
        this.hintFacade.armFirstUserRunHint();
      }

      this.hintFacade.setFirstUserRunActive(this.isInFlightPhase(this._activityPhase()));
    });
  }

  private yieldSourcePriority(source: YieldStateSource): number {
    switch (source) {
      case 'sse-operation':
        return 600;
      case 'thread-metadata':
      case 'thread-metadata-empty':
        return 500;
      case 'stored-state-rehydrate':
        return 400;
      case 'firestore-fallback':
      case 'stored-state-pending':
        return 300;
      case 'input-binding':
      default:
        return 200;
    }
  }

  private yieldIdentityKey(yieldState: AgentYieldState | null): string {
    if (!yieldState) return '';
    const approvalId = yieldState.approvalId?.trim();
    if (approvalId) return `approval:${approvalId}`;
    const toolCallId = yieldState.pendingToolCall?.toolCallId?.trim();
    if (toolCallId) return `tool:${toolCallId}`;
    return `reason:${yieldState.reason}`;
  }

  private resolveYieldOperationId(
    yieldState: AgentYieldState,
    explicitOperationId?: string
  ): string {
    const toolInputOperationId =
      yieldState.pendingToolCall?.toolInput &&
      typeof yieldState.pendingToolCall.toolInput['operationId'] === 'string'
        ? yieldState.pendingToolCall.toolInput['operationId'].trim()
        : undefined;
    const candidates = [
      explicitOperationId?.trim(),
      toolInputOperationId,
      this._currentOperationId?.trim(),
      this.resumeOperationId?.trim(),
      this.sessionFacade.resolveFirestoreOperationId()?.trim(),
      this.contextId?.trim(),
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      if (this.sessionFacade.isFirestoreOperationId(candidate)) return candidate;
    }

    return candidates.find((candidate): candidate is string => !!candidate) ?? this.contextId;
  }

  private applyYieldState(params: {
    yieldState: AgentYieldState | null;
    source: YieldStateSource;
    operationId?: string;
  }): void {
    const { yieldState, source, operationId } = params;

    if (!yieldState) {
      this.activeYieldState.set(null);
      this.yieldResolutionStamp.set(null);
      return;
    }

    const incomingKey = this.yieldIdentityKey(yieldState);
    const incomingPriority = this.yieldSourcePriority(source);
    const currentStamp = this.yieldResolutionStamp();
    const currentKey = this.yieldIdentityKey(this.activeYieldState());

    if (
      currentStamp &&
      currentKey &&
      incomingKey !== currentKey &&
      incomingPriority < currentStamp.priority
    ) {
      return;
    }

    this.activeYieldState.set(yieldState);
    this.yieldResolved.set(false);
    this.yieldResolutionStamp.set({ key: incomingKey, priority: incomingPriority });
    this.messageFacade.upsertInlineYieldMessage(
      yieldState,
      this.resolveYieldOperationId(yieldState, operationId)
    );

    // Drop the input bar's loading state when the agent is awaiting user
    // input so the user can immediately type their reply. Without this, the
    // stop/pause button stays in place and the send button is unreachable.
    if (yieldState.reason === 'needs_input') {
      this._loading.set(false);
    }
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  ngAfterViewInit(): void {
    // Bind immediately so all code paths (including early returns) get keyboard lift.
    void this.bindKeyboardOffset();
    this.selectedExecutionMode.set(this.initialExecutionMode);
    this.sessionFacade.initializeAfterView();
  }

  ngOnDestroy(): void {
    // Stream lifecycle cleanup is handled in the constructor's destroyRef callback.
    // Keep this hook for non-stream resources only to avoid aborting resumed runs
    // during component remounts.
    this.attachmentsFacade.clearPendingFiles();
    this.clearActivityGapTimer();
    this.clearFocusScrollTimers();
    this.keyboardOffsetBinding?.teardown();
  }

  /** Move the runtime activity machine to a new phase and keep timeout rules consistent. */
  private setActivityPhase(phase: ChatActivityPhase, label?: string | null): void {
    const previousPhase = this._activityPhase();
    this._activityPhase.set(phase);
    if (previousPhase !== phase) {
      this._activityLabelVariant.update((value) => value + 1);
    }

    if (label !== undefined) {
      this._activityLabel.set(this.toUserFacingThinkingLabel(label));
    }

    if (this.isInFlightPhase(phase)) {
      this._lastActivityPulseAt.set(Date.now());
      this.armActivityGapTimer();
      return;
    }

    this.clearActivityGapTimer();
    if (phase === 'completed' || phase === 'failed' || phase === 'cancelled') {
      this._activityLabel.set(null);
      this._videoUploadPercent.set(null);
      this._videoUploadBatch.set(null);
    }
  }

  /** Register stream activity pulses (delta/progress/step updates) to prevent blank gaps. */
  private markActivityPulse(label?: string | null): void {
    if (label !== undefined) {
      const userLabel = this.toUserFacingThinkingLabel(label);
      if (userLabel) this._activityLabel.set(userLabel);
    }

    this._lastActivityPulseAt.set(Date.now());
    const phase = this._activityPhase();
    if (
      phase === 'sending' ||
      phase === 'connected' ||
      phase === 'waiting_delta' ||
      phase === 'reconnecting'
    ) {
      this._activityPhase.set('streaming');
    }
    // Slow-down rotation: Only increment variant if minimum display time has elapsed.
    // During connected/streaming phases with frequent deltas, this prevents label flips
    // from happening too rapidly (they should remain stable for 2-3s between rotations).
    const now = Date.now();
    const timeSinceLastChange = now - this._lastLabelVariantChangeAt();
    if (timeSinceLastChange >= LABEL_VARIANT_MIN_DISPLAY_MS) {
      this._activityLabelVariant.update((v) => v + 1);
      this._lastLabelVariantChangeAt.set(now);
    }
    this.armActivityGapTimer();
  }

  private isInFlightPhase(phase: ChatActivityPhase): boolean {
    if (this.isTerminalOperationStatus()) {
      return false;
    }

    return (
      phase === 'sending' ||
      phase === 'connected' ||
      phase === 'streaming' ||
      phase === 'running_tool' ||
      phase === 'waiting_delta' ||
      phase === 'reconnecting'
    );
  }

  /** When no deltas arrive for a short window, enter waiting_delta shimmer state. */
  private armActivityGapTimer(): void {
    this.clearActivityGapTimer();
    if (!this.isInFlightPhase(this._activityPhase())) {
      return;
    }

    this.activityGapTimer = setTimeout(() => {
      this.activityGapTimer = null;
      if (this.isTerminalOperationStatus()) {
        this.setActivityPhase(this.terminalActivityPhase());
        return;
      }
      if (!this.isInFlightPhase(this._activityPhase())) {
        return;
      }
      const elapsed = Date.now() - this._lastActivityPulseAt();
      if (elapsed < ACTIVITY_GAP_TIMEOUT_MS) {
        this.armActivityGapTimer();
        return;
      }

      // While a tool is genuinely running, leave both phase and label
      // alone. The phase default or the active
      // tool's own label ("Analyzing video...") is far more accurate than
      // the generic gap fallback, and tool calls can take 30-60s of silence.
      if (this._activityPhase() !== 'running_tool') {
        this._activityPhase.set('waiting_delta');
        this._activityLabelVariant.update((value) => value + 1);
      }

      this.armActivityGapTimer();
    }, ACTIVITY_GAP_TIMEOUT_MS);
  }

  private isTerminalOperationStatus(): boolean {
    return (
      this.operationStatus === 'complete' ||
      this.operationStatus === 'error' ||
      this.operationStatus === 'cancelled'
    );
  }

  private terminalActivityPhase(): Extract<
    ChatActivityPhase,
    'completed' | 'failed' | 'cancelled'
  > {
    if (this.operationStatus === 'error') return 'failed';
    if (this.operationStatus === 'cancelled') return 'cancelled';
    return 'completed';
  }

  private clearActivityGapTimer(): void {
    if (this.activityGapTimer === null) return;
    clearTimeout(this.activityGapTimer);
    this.activityGapTimer = null;
  }

  /** Strip technical telemetry from progress text so users see clean copy only. */
  private toUserFacingThinkingLabel(label?: string | null): string | null {
    if (!label) return null;

    const normalized = label.replace(/\s+/g, ' ').trim();
    if (!normalized) return null;

    // Remove inline metric blocks such as: (latency 321ms, p95 480ms)
    const withoutMetricParens = normalized
      .replace(/\((?:[^)]*(?:latency|p95|p99|tokens?|tps|throughput|ms)[^)]*)\)/gi, '')
      .replace(/\[(?:[^\]]*(?:latency|p95|p99|tokens?|tps|throughput|ms)[^\]]*)\]/gi, '')
      .replace(/\s+([.,!?])/g, '$1')
      .trim();

    if (!withoutMetricParens) return null;
    if (TECHNICAL_PROGRESS_PATTERN.test(withoutMetricParens)) return null;
    if (CONTEXT_READY_PROGRESS_PATTERN.test(withoutMetricParens)) {
      return 'Game plan locked. Building your answer...';
    }
    if (SENDING_PROGRESS_PATTERN.test(withoutMetricParens)) {
      return 'Getting started...';
    }
    if (RECONNECTING_PROGRESS_PATTERN.test(withoutMetricParens)) {
      return 'Back in the game...';
    }

    return withoutMetricParens.length > 72
      ? `${withoutMetricParens.slice(0, 69).trimEnd()}...`
      : withoutMetricParens;
  }

  private defaultThinkingLabelForPhase(phase: ChatActivityPhase): string {
    const labels = SPORTY_ACTIVITY_LABELS[phase] ?? DEFAULT_SPORTY_ACTIVITY_LABELS;
    // Phase-specific rotation control: For connected/streaming phases, always return
    // the first variant (index 0) to skip rotation. These phases have frequent updates
    // and should show a stable label. Other phases rotate normally via variant counter.
    const skipRotation = phase === 'connected' || phase === 'streaming';
    const index = skipRotation ? 0 : this._activityLabelVariant() % labels.length;
    return labels[index] ?? 'Agent X is in your corner...';
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
        // Keep composer replies visible, but do not yank approval-card editors off-screen.
        if (!this.shouldAutoScrollForKeyboard()) {
          return;
        }

        this.scrollToBottom({ behavior: 'auto' });
      },
    });
  }

  /** Track which editable region owns focus so keyboard lift only scrolls the composer. */
  protected onFocusWithinChat(event: FocusEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      this.lastFocusedZone = 'other';
      return;
    }

    if (target.closest('nxt1-agent-x-input-bar')) {
      this.lastFocusedZone = 'composer';
      return;
    }

    if (target.closest('nxt1-agent-action-card')) {
      this.lastFocusedZone = 'action-card';
      return;
    }

    this.lastFocusedZone = 'other';
  }

  private shouldAutoScrollForKeyboard(): boolean {
    return this.lastFocusedZone === 'composer';
  }

  /** Ensure latest messages remain visible when the input receives focus. */
  protected onInputFocus(): void {
    this.clearFocusScrollTimers();
    this.scrollToBottom({ behavior: 'auto' });

    if (Capacitor.isNativePlatform()) {
      return;
    }

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

  /** Route composer submit through ask_user reply flow when a pending ask-user yield exists. */
  protected async onSendRequested(): Promise<void> {
    const pendingAskUser = this.pendingAskUserReplyTarget();
    const reply = this.inputValue().trim();
    const hasStagedAttachments =
      this.pendingFiles().length > 0 || this.pendingConnectedSources().length > 0;

    if (pendingAskUser && reply.length > 0 && !hasStagedAttachments && !this._loading()) {
      this.inputValue.set('');
      await this.yieldFacade.onAskUserReply({
        answer: reply,
        ...(pendingAskUser.messageId ? { messageId: pendingAskUser.messageId } : {}),
        ...(pendingAskUser.operationId ? { operationId: pendingAskUser.operationId } : {}),
      });
      return;
    }

    await this.runControlFacade.send({ executionMode: this.selectedExecutionMode() });
  }

  public appendPromptToComposer(prompt: string): void {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      return;
    }

    const currentDraft = this.inputValue().trim();
    if (!currentDraft) {
      this.inputValue.set(trimmedPrompt);
      return;
    }

    if (currentDraft === trimmedPrompt || currentDraft.endsWith(`\n\n${trimmedPrompt}`)) {
      return;
    }

    this.inputValue.set(`${currentDraft}\n\n${trimmedPrompt}`);
  }

  /**
   * True when a message has visible content that should render in a chat
   * bubble alongside any yield card (approval / ask-user). When `false`,
   * synthetic yield-only rows (content === '' and no non-yield cards)
   * skip the bubble and render only the action/ask-user card.
   */
  /**
   * Attachments to render in the strip.
   *
   * - User messages: show all attachments (uploaded files, images, videos).
   * - Assistant messages: never render the strip. Assistant media is rendered
   *   inline from markdown/parts, and persisted assistant attachments are kept
   *   only as transport metadata for reload/replay fidelity.
   */
  protected attachmentImageUrl(
    attachment: NonNullable<OperationMessage['attachments']>[number]
  ): string | null {
    if (attachment.type !== 'image') return null;
    const url = attachment.url.trim();
    if (!this.isRenderableAttachmentThumbnailUrl(url)) return null;
    if (this.failedAttachmentThumbnailUrls.has(url)) return null;
    return url;
  }

  protected attachmentVideoPosterUrl(
    attachment: NonNullable<OperationMessage['attachments']>[number]
  ): string | null {
    if (attachment.type !== 'video') return null;
    const thumbnailUrl = attachment.thumbnailUrl?.trim();
    if (!this.isRenderableAttachmentThumbnailUrl(thumbnailUrl)) return null;
    if (this.failedAttachmentThumbnailUrls.has(thumbnailUrl)) return null;
    return thumbnailUrl;
  }

  private isRenderableAttachmentThumbnailUrl(url: string | null | undefined): url is string {
    const normalized = url?.trim();
    if (!normalized || normalized.length > 8192) return false;
    if (/^(blob:|data:image\/)/i.test(normalized)) return true;
    if (!/^https:\/\//i.test(normalized)) return false;

    try {
      const parsed = new URL(normalized);
      if (/(?:storage|firebasestorage)\.googleapis\.com/i.test(parsed.hostname)) {
        return true;
      }
      return true;
    } catch {
      return false;
    }
  }

  protected onAttachmentThumbnailError(event: Event, url: string): void {
    const fallbackUrl = (event.target as HTMLImageElement | null)?.currentSrc || url;
    if (fallbackUrl) this.failedAttachmentThumbnailUrls.add(fallbackUrl);
    if (url) this.failedAttachmentThumbnailUrls.add(url);
    this.cdr.markForCheck();
  }

  protected messageAttachmentsForStrip(
    msg: OperationMessage
  ): readonly NonNullable<OperationMessage['attachments']>[number][] {
    const attachments = msg.attachments ?? [];
    if (msg.role !== 'user') return [];

    return attachments;
  }

  protected hasBubbleProse(msg: OperationMessage): boolean {
    if (msg.id === 'typing') return true;
    if (this.visibleMessageContent(msg).length > 0) return true;
    if (this.messageAttachmentsForStrip(msg).length > 0) return true;
    if (this.messageStepsForBubble(msg).length > 0) return true;
    if (this.messageCardsForBubble(msg).length > 0) return true;
    if (this.messagePartsForBubble(msg).length > 0) return true;
    return false;
  }

  /**
   * Bubble text for an ask_user yield checkpoint.
   *
   * Option B (2026): the actual question is streamed as ordinary assistant
   * prose in the preceding assistant_partial bubble. The yield row itself is
   * ALWAYS a thin "Waiting for your reply…" affordance — never the question
   * text. The short `question` label the LLM passes to `ask_user` is used
   * for push/SMS notification previews only, not for the in-chat bubble.
   * This guarantees the bubble cannot duplicate (or shadow) the prose row
   * regardless of legacy data shape.
   */
  protected messageContentForBubble(msg: OperationMessage): string {
    if (!this.isAskUserYield(msg)) return this.visibleMessageContent(msg);
    if (msg.yieldCardState === 'resolved') return '';
    if ((msg.yieldResolvedText ?? '').trim().length > 0) return '';

    const index = this.messages().findIndex((candidate) => candidate.id === msg.id);
    if (index >= 0 && this.resolveExternalCardStateForMessage(msg, index) !== null) {
      return '';
    }
    return 'Waiting for your reply…';
  }

  protected contextAttachmentIcon(att: MessageAttachment): string {
    if (att.contextKind === 'film_play') return 'videocam';
    if (att.contextKind === 'playbook_item') return 'documentText';
    if (att.contextKind === 'game_plan_item') return 'analytics';
    return 'analytics';
  }

  protected contextAttachmentLabel(att: MessageAttachment): string {
    if (att.contextKind === 'film_play') return 'Film review';
    if (att.contextKind === 'playbook_item') return 'Playbook';
    if (att.contextKind === 'game_plan_item') return 'Game plan';
    return 'Context';
  }

  private visibleMessageContent(msg: OperationMessage): string {
    return this.stripSelectedContextPromptBlock(msg.content ?? '');
  }

  private stripSelectedContextPromptBlock(content: string): string {
    return content
      .replace(
        /\s*\[Selected contexts \(confirmed by user for this turn\):[\s\S]*?\n\]\s*\[Instruction: prioritize these contexts while reasoning and cite their timestamps when relevant\.\]/g,
        ''
      )
      .trim();
  }

  /**
   * Filter cards rendered inline in bubbles.
   *
   * - `planner` is rendered once in the composer dock
   * - pending approval confirmations are rendered by the dedicated action card
   * - `ask_user` is filtered out: the prior assistant prose already carries
   *   the question text in `content`, and the yield message renders the
   *   question via `messageContentForBubble`. Keeping ask_user inline here
   *   would shadow `msg.content` (the bubble template takes the parts/cards
   *   path whenever they are non-empty, skipping legacy content rendering)
   *   and visually erase the streamed prose.
   */
  protected messageCardsForBubble(msg: OperationMessage): readonly AgentXRichCard[] {
    return (msg.cards ?? []).filter(
      (card) =>
        card.type !== 'planner' &&
        card.type !== 'ask_user' &&
        !this.isApprovalConfirmationCard(card)
    );
  }

  /**
   * Filter parts rendered inline in bubbles. Same rationale as
   * `messageCardsForBubble` for ask_user: parts.length > 0 forces the bubble
   * onto the interleaved render path and skips `content`, so we must keep
   * ask_user out of parts to preserve the streamed prose.
   */
  protected messagePartsForBubble(msg: OperationMessage): readonly AgentXMessagePart[] {
    const suppressedToolIds = this.suppressedToolStepIdsForMessage(msg);
    const textRenderedMediaUrls = this.textRenderedMediaUrlsForMessage(msg);
    const filtered = (msg.parts ?? [])
      .map((part) => {
        if (part.type !== 'tool-steps') return part;
        if (!suppressedToolIds.size) return part;
        const remaining = part.steps.filter((step) => !suppressedToolIds.has(step.id));
        if (remaining.length === part.steps.length) return part;
        return remaining.length === 0 ? null : { type: 'tool-steps' as const, steps: remaining };
      })
      .filter(
        (part): part is AgentXMessagePart =>
          part !== null &&
          !(part.type === 'card' && part.card.type === 'planner') &&
          !(part.type === 'card' && part.card.type === 'ask_user') &&
          !(part.type === 'card' && this.isApprovalConfirmationCard(part.card)) &&
          !(
            (part.type === 'image' || part.type === 'video') &&
            textRenderedMediaUrls.has(normalizeOperationChatMediaUrl(part.url))
          )
      );

    return filtered;
  }

  private textRenderedMediaUrlsForMessage(msg: OperationMessage): Set<string> {
    const urls = collectOperationChatMediaUrlsFromText(this.visibleMessageContent(msg));

    for (const part of msg.parts ?? []) {
      if (part.type !== 'text') continue;
      for (const url of collectOperationChatMediaUrlsFromText(part.content)) {
        urls.add(url);
      }
    }

    return urls;
  }

  /**
   * Filter the legacy `msg.steps` array to hide approval-gated tool calls
   * before they run. The backend emits `step_active` the moment the LLM
   * proposes a gated tool call, then yields for approval with the same
   * toolCallId. Showing that proposal as an execution row above the card is
   * misleading, and after approval it duplicates the fresh resumed tool row.
   */
  protected messageStepsForBubble(msg: OperationMessage): readonly AgentXToolStep[] {
    const steps = msg.steps ?? [];
    if (!steps.length) return steps;
    const suppressedToolIds = this.suppressedToolStepIdsForMessage(msg);
    if (!suppressedToolIds.size) return steps;
    return steps.filter((step) => !suppressedToolIds.has(step.id));
  }

  /**
   * Tool steps hidden for this specific bubble.
   *
   * Hide only the exact tool call that yielded this message's action card;
   * preserve all prior tool steps from earlier bubbles so historical
   * execution context remains visible.
   */
  private suppressedToolStepIdsForMessage(msg: OperationMessage): Set<string> {
    const ids = new Set<string>();
    if (
      msg.yieldState &&
      (msg.yieldState.reason === 'needs_approval' || msg.yieldState.reason === 'needs_input')
    ) {
      // For approval gates: suppress ALL tool steps, not just active ones.
      //
      // When a coordinator is dispatched, the primary agent pre-emits a
      // `tool_result(success)` for `delegate_to_coordinator` before the
      // coordinator runs (so the step appears complete in the timeline).
      // When the coordinator then hits the approval gate, that delegation step
      // is already status='success' — not 'active' — so the old "active only"
      // suppression left it visible above the approval card.
      //
      // The intended UX for needs_approval is: intent text → approval card →
      // (tool runs after approval). Zero tool steps should appear before the
      // card. Suppressing everything on an approval yield delivers this.
      //
      // For needs_input (ask_user), keep the existing active-only suppression:
      // completed preparatory steps are legitimate conversation context.
      if (msg.yieldState.reason === 'needs_approval') {
        for (const part of msg.parts ?? []) {
          if (part.type === 'tool-steps') {
            for (const step of part.steps) {
              ids.add(step.id);
            }
          }
        }
        for (const step of msg.steps ?? []) {
          ids.add(step.id);
        }
      } else {
        // needs_input: hide only the suspended (active) step — prior completed
        // steps remain visible as context for the user's answer.
        for (const part of msg.parts ?? []) {
          if (part.type === 'tool-steps') {
            for (const step of part.steps) {
              if (step.status === 'active') ids.add(step.id);
            }
          }
        }
        for (const step of msg.steps ?? []) {
          if (step.status === 'active') ids.add(step.id);
        }
      }
      // Belt-and-suspenders: also add the raw toolCallId for any legacy message
      // whose step was assigned the LLM call ID directly as its id.
      const toolCallId = msg.yieldState.pendingToolCall?.toolCallId?.trim();
      if (toolCallId) ids.add(toolCallId);
    }
    return ids;
  }

  /**
   * Pending approval cards are rendered by the dedicated yield action-card,
   * so hide only actionable approval confirmations in bubbles.
   *
   * Resolved confirmation cards (no actions) should remain visible in history.
   */
  private isApprovalConfirmationCard(card: AgentXRichCard): boolean {
    if (card.type !== 'confirmation') return false;
    const payload = card.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object') return false;
    const hasApprovalId =
      typeof payload['approvalId'] === 'string' && payload['approvalId'].length > 0;
    if (!hasApprovalId) return false;

    const actions = payload['actions'];
    return Array.isArray(actions) && actions.length > 0;
  }

  /** Resolve approval yield state from either live message.yieldState or persisted card payload. */
  protected approvalYieldForMessage(msg: OperationMessage): AgentYieldState | null {
    const direct = msg.yieldState;
    if (direct?.reason === 'needs_approval' && direct.pendingToolCall?.toolName) {
      return direct;
    }

    const approvalCard = this.findApprovalCard(msg);
    if (!approvalCard || approvalCard.type !== 'confirmation') return null;

    const payload = approvalCard.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object') return null;

    const persisted = payload['yieldState'];
    if (!persisted || typeof persisted !== 'object') return null;

    const candidate = persisted as AgentYieldState;
    if (candidate.reason !== 'needs_approval' || !candidate.pendingToolCall?.toolName) {
      return null;
    }

    return candidate;
  }

  /**
   * Single source of truth for external card state — used by chat-bubble (confirmation/draft),
   * ask-user card, and approval card alike.
   *
   * Priority:
   *   1. In-memory yieldCardState for transient submitting/idle (lasts only for the duration
   *      of the server round-trip — does not need to survive history reloads).
   *   2. Message-array scan: if any user message exists after this index the yield was
   *      answered. This is the same way normal chat works — state lives in the array,
   *      not in a separate signal — so it survives history reloads automatically.
   */
  protected resolveExternalCardStateForMessage(
    msg: OperationMessage,
    idx: number
  ): 'idle' | 'submitting' | 'resolved' | null {
    if (msg.yieldCardState === 'submitting') return 'submitting';
    if (msg.yieldCardState === 'idle') return 'idle';
    if (msg.yieldCardState === 'resolved') return 'resolved'; // fast-path if still in memory
    // Derive resolved from the array itself — works after any reload
    const msgs = this.messages();
    const hasUserReplyAfter = msgs.slice(idx + 1).some((m) => m.role === 'user');
    return hasUserReplyAfter ? 'resolved' : null;
  }

  /** Resolve yield card visual state from live message state or persisted card payload.
   *
   * Uses the same checkpoint-state-machine approach as resolveExternalCardStateForMessage:
   *   1. Transient in-memory yieldCardState for the submitting/idle round-trip window.
   *   2. Array-derived scan: any user message after idx = checkpoint was answered. This
   *      survives every page reload — state is a fact of the timeline, not local memory.
   */
  protected approvalCardStateForMessage(
    msg: OperationMessage,
    idx: number
  ): 'idle' | 'submitting' | 'resolved' | null {
    // Fast-path: honour transient submitting/idle during the active round-trip.
    if (msg.yieldCardState === 'submitting') return 'submitting';
    if (msg.yieldCardState === 'idle') return 'idle';
    if (msg.yieldCardState === 'resolved') return 'resolved';
    // Persistent: derive resolved state from the message array — survives reloads.
    const msgs = this.messages();
    const hasUserReplyAfter = msgs.slice(idx + 1).some((m) => m.role === 'user');
    const operationId = typeof msg.operationId === 'string' ? msg.operationId : undefined;
    const hasAssistantContinuationAfter = msgs
      .slice(idx + 1)
      .some(
        (m) =>
          m.role === 'assistant' &&
          !m.yieldState &&
          (operationId ? m.operationId === operationId : true)
      );
    return hasUserReplyAfter || hasAssistantContinuationAfter ? 'resolved' : null;
  }

  /** Resolve yield card resolved text from live message state or persisted card payload. */
  protected approvalResolvedTextForMessage(msg: OperationMessage): string {
    if (msg.yieldResolvedText) return msg.yieldResolvedText;

    const approvalCard = this.findApprovalCard(msg);
    if (!approvalCard || approvalCard.type !== 'confirmation') return '';

    const payload = approvalCard.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object') return '';

    const text = payload['yieldResolvedText'];
    return typeof text === 'string' ? text : '';
  }

  /** Find the approval-backed confirmation card in a message (if present). */
  protected findApprovalCard(msg: OperationMessage): AgentXRichCard | null {
    if (!msg.cards?.length) return null;

    for (const card of msg.cards) {
      if (card.type === 'confirmation') {
        const payload = card.payload as Record<string, unknown> | undefined;
        if (payload && typeof payload['approvalId'] === 'string') {
          return card;
        }
      }
    }

    return null;
  }

  /** Open approval-card media in the same shared viewer used by chat attachments. */
  protected onApprovalCardOpenMedia(event: ActionCardOpenMediaEvent): void {
    const attachments: readonly MessageAttachment[] = event.attachments;
    this.attachmentsFacade.openAttachmentViewer(attachments, event.index);
  }

  /** Open markdown/inline media in the shared overlay viewer used by attachment chips. */
  protected onBubbleMediaRequested(event: ChatBubbleMediaRequestedEvent): void {
    const attachment: MessageAttachment = {
      url: event.url,
      type: event.type,
      name: this.deriveMediaName(event.url, event.type),
      ...(event.type === 'video' && event.poster ? { thumbnailUrl: event.poster } : {}),
    };
    this.attachmentsFacade.openAttachmentViewer([attachment], 0);
  }

  protected onBubbleTimestampClicked(timeMs: number): void {
    this.filmTimestampSeekRequested.emit(timeMs);
  }

  /** Handle billing card outcomes from inline chat bubbles. */
  protected async onBillingActionResolved(event: BillingActionResolvedEvent): Promise<void> {
    this.yieldFacade.onBillingActionResolved(event);

    // In sheet mode (mobile), close the chat after successful navigation so Usage is visible.
    if (event.completed && !this.embedded) {
      await this.dismiss();
    }
  }

  /** Remove dismissed pause-yield rows and legacy approval resolution artifacts from the timeline. */
  protected shouldHideMessage(msg: OperationMessage): boolean {
    if (msg.id === 'typing' && this.hasPendingAskUserYieldMessage()) {
      return true;
    }
    if (msg.id === 'typing' && !this.hasRenderableMessagePayload(msg) && !this.showThinking()) {
      return true;
    }
    if (this.isPersistedApprovalDecisionEventMessage(msg)) return true;
    if (this.isLegacyApprovalResolutionMessage(msg)) return true;
    return false;
  }

  private isPersistedApprovalDecisionEventMessage(msg: OperationMessage): boolean {
    return isApprovedExecutionPlanDecisionMessage(msg);
  }

  private hasPendingAskUserYieldMessage(): boolean {
    // Use the same array-derived resolver used for rendering — survives page reloads.
    // A checkpoint is considered "pending" only when resolveExternalCardStateForMessage
    // returns null (no user reply found after its index in the timeline).
    return this.messages().some(
      (msg, idx) =>
        this.isAskUserYield(msg) && this.resolveExternalCardStateForMessage(msg, idx) === null
    );
  }

  /** Most recent unresolved ask_user yield in the timeline. */
  private pendingAskUserYieldMessage(): OperationMessage | null {
    const allMessages = this.messages();
    for (let index = allMessages.length - 1; index >= 0; index -= 1) {
      const msg = allMessages[index];
      if (!this.isAskUserYield(msg)) continue;
      if (this.resolveExternalCardStateForMessage(msg, index) !== null) continue;
      return msg;
    }
    return null;
  }

  private pendingAskUserReplyTarget(): { messageId?: string; operationId?: string } | null {
    const pendingMessage = this.pendingAskUserYieldMessage();
    if (pendingMessage) {
      return {
        messageId: pendingMessage.id,
        ...(pendingMessage.operationId ? { operationId: pendingMessage.operationId } : {}),
      };
    }

    const yieldState = this.activeYieldState();
    if (!yieldState || this.yieldResolved()) return null;
    if (yieldState.reason !== 'needs_input') return null;
    const toolName = yieldState.pendingToolCall?.toolName;
    if (toolName === PAUSE_RESUME_TOOL_NAME || toolName === 'execute_saved_plan') return null;

    return {
      operationId: this.resolveYieldOperationId(yieldState),
    };
  }

  /**
   * Hide previously-persisted "Approval Confirmed" / "Approval Rejected"
   * resolution rows that older sessions wrote alongside the real approval
   * card. The current main resolved approval card has a different title
   * (e.g. "Review and Approve Email") and is left untouched.
   */
  private isLegacyApprovalResolutionMessage(msg: OperationMessage): boolean {
    if (msg.role !== 'assistant') return false;

    const cards: AgentXRichCard[] = [
      ...(msg.cards ?? []),
      ...(msg.parts ?? [])
        .filter(
          (part): part is Extract<AgentXMessagePart, { type: 'card' }> => part.type === 'card'
        )
        .map((part) => part.card),
    ];
    if (!cards.length) return false;

    return cards.every((card) => {
      if (card.type !== 'confirmation') return false;
      const title = (card as { title?: string }).title?.trim();
      return title === 'Approval Confirmed' || title === 'Approval Rejected';
    });
  }

  private deriveMediaName(url: string, type: 'image' | 'video'): string {
    try {
      const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      const parsed = new URL(normalized);
      const rawName = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? '');
      if (rawName.trim().length > 0) return rawName;
    } catch {
      // Fall through to generic label.
    }
    return type === 'video' ? 'Generated Video' : 'Generated Image';
  }

  private hasRenderableMessagePayload(msg: OperationMessage): boolean {
    if (msg.content.trim().length > 0) return true;
    if ((msg.cards?.length ?? 0) > 0) return true;
    if ((msg.steps?.length ?? 0) > 0) return true;
    if ((msg.attachments?.length ?? 0) > 0) return true;
    if ((msg.parts?.length ?? 0) > 0) return true;
    return false;
  }

  /**
   * True only for genuine ask-user yields (not pause yields in any state).
   * Pause yields have toolName === PAUSE_RESUME_TOOL_NAME and must never
   * fall through to the Quick Question card, even while being dismissed.
   */
  protected isAskUserYield(msg: OperationMessage): boolean {
    return (
      msg.yieldState?.reason === 'needs_input' &&
      msg.yieldState?.pendingToolCall?.toolName !== PAUSE_RESUME_TOOL_NAME &&
      msg.yieldState?.pendingToolCall?.toolName !== 'execute_saved_plan'
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
