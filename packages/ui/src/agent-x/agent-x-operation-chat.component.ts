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
  AgentXRichCard,
  AgentXBillingActionReason,
  AgentXStreamStepEvent,
  AgentXStreamCardEvent,
} from '@nxt1/core/ai';
import { AGENT_X_ENDPOINTS, resolveAttachmentType } from '@nxt1/core/ai';
import { ModalController } from '@ionic/angular/standalone';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';
import { NxtChatBubbleComponent } from '../components/chat-bubble';
import { NxtIconComponent } from '../components/icon';
import { NxtLoggingService } from '../services/logging/logging.service';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { AGENT_X_OPERATION_CHAT_TEST_IDS } from '@nxt1/core/testing';
import { AgentXInputComponent } from './agent-x-input.component';
import {
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
  AgentXJobService,
} from './agent-x-job.service';
import { NxtMediaViewerService } from '../components/media-viewer/media-viewer.service';
import type { MediaViewerItem } from '../components/media-viewer/media-viewer.types';
import { KeyboardService } from '../services/keyboard/keyboard.service';
import {
  AgentXActionCardComponent,
  type ActionCardApprovalEvent,
  type ActionCardReplyEvent,
} from './agent-x-action-card.component';
import type { BillingActionResolvedEvent } from './agent-x-billing-action-card.component';
import type { AgentYieldState } from '@nxt1/core';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from './fab/agent-x-logo.constants';

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
    AgentXInputComponent,
    AgentXActionCardComponent,
  ],
  template: `
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
        <div class="quick-options">
          @for (action of normalizedQuickActions(); track action.id) {
            <button type="button" class="quick-option-chip" (click)="onQuickAction(action)">
              {{ action.label }}
            </button>
          }
        </div>
      }

      @for (msg of messages(); track msg.id; let first = $first) {
        <!-- Operation Brief card for the first user message in an operation context -->
        @if (first && msg.role === 'user' && isOperation) {
          <div class="operation-brief">
            <div class="operation-brief__header">
              <svg
                class="agent-x-mark"
                width="18"
                height="18"
                viewBox="0 0 612 792"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path [attr.d]="agentXLogoPath" />
                <polygon [attr.points]="agentXLogoPolygon" />
              </svg>
              <span class="operation-brief__label">Operation Brief</span>
            </div>
            <p class="operation-brief__text">{{ msg.content }}</p>
          </div>
        } @else {
          <div
            class="msg-row"
            [class.msg-user]="msg.role === 'user'"
            [class.msg-assistant]="msg.role === 'assistant'"
            [class.msg-system]="msg.role === 'system'"
            [class.msg-error]="msg.error"
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
              (billingActionResolved)="onBillingActionResolved($event)"
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
      }

      <!-- ═══ THINKING INDICATOR (when operation is processing and no AI reply yet) ═══ -->
      @if (showThinking()) {
        <div class="thinking-block">
          <div class="thinking-block__avatar">
            <svg
              class="agent-x-mark"
              width="22"
              height="22"
              viewBox="0 0 612 792"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path [attr.d]="agentXLogoPath" />
              <polygon [attr.points]="agentXLogoPolygon" />
            </svg>
          </div>
          <div class="thinking-block__content">
            <div class="thinking-block__dots"><span></span><span></span><span></span></div>
            <span class="thinking-block__label">Agent X is working on this…</span>
          </div>
        </div>
      }

      <!-- ═══ HITL ACTION CARD (when operation is yielded) ═══ -->
      @if (activeYieldState() && !yieldResolved()) {
        <div class="msg-row msg-assistant">
          <nxt1-agent-action-card
            #actionCard
            [yield]="activeYieldState()!"
            [operationId]="contextId"
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

    <!-- ═══ PENDING FILES PREVIEW ═══ -->
    @if (pendingFiles().length > 0) {
      <div class="pending-files-strip">
        @for (pf of pendingFiles(); track pf.file.name + $index) {
          <div class="pending-file" [class.pending-file--media]="pf.isImage || pf.isVideo">
            @if (pf.isImage && pf.previewUrl) {
              <img
                [src]="pf.previewUrl"
                [alt]="pf.file.name"
                class="pending-file__thumb"
                (click)="openPendingFileViewer($index)"
              />
            } @else if (pf.isVideo && pf.previewUrl) {
              <video
                [src]="pf.previewUrl"
                class="pending-file__thumb"
                preload="metadata"
                (click)="openPendingFileViewer($index)"
              ></video>
              <div class="pending-file__play">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                  <path d="M8 5v14l11-7L8 5z" />
                </svg>
              </div>
            } @else {
              <div
                class="pending-file__doc"
                (click)="openPendingFileViewer($index)"
                style="cursor: pointer;"
              >
                <div
                  class="pending-file__doc-icon-wrap"
                  [style.background]="getFileColor(pf.file.name, 0.15)"
                  [style.color]="getFileColor(pf.file.name, 1)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    width="16"
                    height="16"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div class="pending-file__doc-info">
                  <span class="pending-file__doc-name">{{ pf.file.name }}</span>
                  <span class="pending-file__doc-meta"
                    >{{ getFileExt(pf.file.name) }} · {{ formatFileSize(pf.file.size) }}</span
                  >
                </div>
              </div>
            }
            <button
              class="pending-file__remove"
              (click)="removePendingFile($index)"
              aria-label="Remove file"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
                <path
                  d="M4.11 3.05a.75.75 0 0 0-1.06 1.06L6.94 8l-3.89 3.89a.75.75 0 1 0 1.06 1.06L8 9.06l3.89 3.89a.75.75 0 1 0 1.06-1.06L9.06 8l3.89-3.89a.75.75 0 0 0-1.06-1.06L8 6.94 4.11 3.05z"
                />
              </svg>
            </button>
          </div>
        }
      </div>
    }

    <!-- ═══ INPUT ═══ -->
    <nxt1-agent-x-input
      class="embedded"
      [hasMessages]="messages().length > 0"
      [selectedTask]="null"
      [isLoading]="_loading()"
      [canSend]="canSend()"
      [userMessage]="inputValue()"
      [placeholder]="'Start your agent'"
      (messageChange)="inputValue.set($event)"
      (send)="send()"
      (stop)="cancelStream()"
      (toggleTasks)="onUploadClick()"
    />
    <input
      #fileInput
      class="file-input-hidden"
      type="file"
      accept="image/*,video/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx,.zip,.rar"
      multiple
      (change)="onFileSelected($event)"
    />
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
      }

      :host.agent-x-operation-chat--embedded {
        flex: 1 1 auto;
        height: auto;
        min-height: 0;
        border: 1px solid var(--op-border);
        border-radius: var(--nxt1-radius-2xl, 20px);
        background: transparent;
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
        /* Adjust for keyboard on mobile - no transition for instant response */
        max-height: calc(100vh - var(--keyboard-offset, 0px) - 200px);
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
        transform: translateY(calc(-1 * var(--keyboard-offset, 0px)));
        transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
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
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 4px 0 12px;
        animation: fadeSlideIn 0.3s ease-out;
      }

      .quick-option-chip {
        display: inline-flex;
        align-items: center;
        padding: 8px 14px;
        border: 1px solid var(--op-border);
        border-radius: 999px;
        background: var(--op-surface);
        color: var(--op-text-secondary);
        font-size: 13px;
        font-weight: 500;
        font-family: inherit;
        line-height: 1.3;
        cursor: pointer;
        white-space: nowrap;
        -webkit-tap-highlight-color: transparent;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;
      }

      .quick-option-chip:active {
        background: var(--op-primary-glow);
        border-color: var(--op-primary);
        color: var(--op-primary);
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

      /* ── OPERATION BRIEF CARD ── */
      .operation-brief {
        margin: 4px 0 12px;
        padding: 14px 16px;
        border-radius: 14px;
        border: 1px solid var(--op-border);
        background: var(--op-surface, rgba(255, 255, 255, 0.04));
        animation: fadeSlideIn 0.3s ease-out;
      }

      .operation-brief__header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 8px;
        color: var(--op-text-secondary);
      }

      .operation-brief__label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--op-text-secondary);
      }

      .operation-brief__text {
        font-size: 13px;
        line-height: 1.55;
        color: var(--op-text-primary);
        margin: 0;
        white-space: pre-line;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
      }

      /* ── THINKING INDICATOR ── */
      .thinking-block {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 14px 0;
        animation: fadeSlideIn 0.3s ease-out;
      }

      .thinking-block__avatar {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        background: var(--op-primary-glow);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--op-primary);
        flex-shrink: 0;
      }

      .thinking-block__content {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .thinking-block__dots {
        display: flex;
        gap: 4px;
        align-items: center;
        height: 20px;
      }

      .thinking-block__dots span {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--op-primary);
        animation: thinkingPulse 1.4s ease-in-out infinite;
      }

      .thinking-block__dots span:nth-child(2) {
        animation-delay: 0.2s;
      }

      .thinking-block__dots span:nth-child(3) {
        animation-delay: 0.4s;
      }

      .thinking-block__label {
        font-size: 12px;
        color: var(--op-text-secondary);
        letter-spacing: -0.01em;
      }

      @keyframes thinkingPulse {
        0%,
        80%,
        100% {
          opacity: 0.25;
          transform: scale(0.8);
        }
        40% {
          opacity: 1;
          transform: scale(1);
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
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly keyboard = inject(KeyboardService, { optional: true });
  private readonly platformId = inject(PLATFORM_ID);
  private readonly jobService = inject(AgentXJobService);
  private readonly mediaViewer = inject(NxtMediaViewerService);
  private readonly getAuthToken = inject(AGENT_X_AUTH_TOKEN_FACTORY, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

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

  /** Optional list of quick action suggestions shown as tappable chips. */
  @Input() quickActions: readonly OperationQuickAction[] = [];

  /** Optional initial message to auto-send when the sheet opens. */
  @Input() initialMessage = '';

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

  /** Active yield state for this operation (set via input binding). */
  protected readonly activeYieldState = signal<AgentYieldState | null>(null);

  /** Whether the yield has been resolved (approved/replied). */
  protected readonly yieldResolved = signal(false);

  /** Agent X SVG logo path data for inline icon rendering. */
  protected readonly agentXLogoPath: string = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon: string = AGENT_X_LOGO_POLYGON;

  /** Test IDs for failure banner elements. */
  protected readonly failureTestIds = AGENT_X_OPERATION_CHAT_TEST_IDS;

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

  /** Tracks whether the user has sent at least one message. */
  private readonly hasUserSent = signal(false);

  /** Emitted when the user sends their first message (briefing should hide). */
  readonly userMessageSent = output<void>();

  /** Emitted after a chat response completes (stream done or HTTP returned). */
  readonly responseComplete = output<void>();

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
    // Abort any in-flight SSE stream when the component is destroyed
    this.destroyRef.onDestroy(() => {
      this.activeStream?.abort();
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

    // Apply keyboard offset to messages area (mobile only)
    if (isPlatformBrowser(this.platformId) && this.keyboard) {
      effect(() => {
        const offset = this.keyboard!.keyboardHeight();
        const messagesEl = this.messagesArea()?.nativeElement;
        if (messagesEl) {
          // Set keyboard offset immediately
          messagesEl.style.setProperty('--keyboard-offset', `${offset}px`);
          // Force immediate reflow for instant layout update
          void messagesEl.offsetHeight;
          // Auto-scroll instantly when keyboard opens
          if (offset > 0) {
            this.scrollToBottom();
          }
        }
      });
    }
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  /** Auto-send the initial message if provided. */
  private initialMessageSent = false;

  ngAfterViewInit(): void {
    // If opening an existing operation/thread, load its persisted messages.
    if (this.threadId?.trim()) {
      this._isThreadMode.set(true);
      void this.loadThreadMessages(this.threadId.trim());
      return;
    }

    // If the operation failed but has no thread, still show the failure context.
    if (this.operationStatus === 'error') {
      this._isThreadMode.set(true);
      this.injectFailureMessage();
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

  /**
   * Load a historical thread into this isolated operation chat view.
   * Preserves the operation sheet UX while showing the persisted conversation.
   */
  private async loadThreadMessages(threadId: string): Promise<void> {
    this._loading.set(true);
    this.logger.info('Loading operation thread', { threadId, contextId: this.contextId });

    try {
      const response = await firstValueFrom(
        this.http.get<{
          success: boolean;
          data?: {
            items: Array<{
              id?: string;
              role: string;
              content: string;
              createdAt?: string;
              resultData?: Record<string, unknown>;
            }>;
            hasMore?: boolean;
          };
          error?: string;
        }>(`${this.baseUrl}/agent-x/threads/${encodeURIComponent(threadId)}/messages?limit=50`)
      );

      if (!response.success || !response.data?.items?.length) {
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

      const mapped: OperationMessage[] = response.data.items.map((msg) => ({
        id: msg.id ?? this.uid(),
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
        timestamp: msg.createdAt ? new Date(msg.createdAt) : new Date(),
        ...(typeof msg.resultData?.['imageUrl'] === 'string'
          ? { imageUrl: msg.resultData['imageUrl'] as string }
          : {}),
        ...(typeof msg.resultData?.['videoUrl'] === 'string'
          ? { videoUrl: msg.resultData['videoUrl'] as string }
          : {}),
      }));

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
   */
  cancelStream(): void {
    if (this.activeStream) {
      this.activeStream.abort();
      this.activeStream = null;
      this._loading.set(false);
      this.logger.info('Stream cancelled by user');
      this.breadcrumb.trackStateChange('agent-x-operation-chat:stream-cancelled', {
        contextId: this.contextId,
      });
    }
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
    this.inputValue.set(action.label);
    await this.send();
  }

  /** Open native file picker from the shared input plus button. */
  protected onUploadClick(): void {
    this.fileInput()?.nativeElement.click();
  }

  /** Handle selected files/images — stage them as pending previews above input. */
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;

    const newPending: PendingFile[] = files.map((file) => {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      return {
        file,
        previewUrl: isImage || isVideo ? URL.createObjectURL(file) : null,
        isImage,
        isVideo,
      };
    });

    this.pendingFiles.update((prev) => [...prev, ...newPending]);
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

  ngOnDestroy(): void {
    this._clearPendingFiles();
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
    // Build conversation history from local messages (exclude typing indicators)
    const request = {
      message: userInput,
      history: this.messages()
        .filter((m) => !m.isTyping && m.role !== 'system')
        .slice(-10)
        .map((m) => ({
          id: this.uid(),
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(),
        })),
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
   * @internal
   */
  private _sendViaStream(request: AgentXChatRequest, authToken: string): Promise<void> {
    // Cancel any previous in-flight stream
    this.activeStream?.abort();
    this.activeStream = null;

    const streamingId = 'typing'; // The ID used by the existing typing indicator

    return new Promise<void>((resolve, reject) => {
      this.activeStream = this.api.streamMessage(
        request,
        {
          onThread: (evt) => {
            this.logger.debug('Stream thread resolved', { threadId: evt.threadId });
          },

          onDelta: (evt) => {
            // Append the new token to the typing indicator in-place
            this.messages.update((msgs) =>
              msgs.map((m) =>
                m.id === streamingId
                  ? { ...m, content: m.content + evt.content, isTyping: false }
                  : m
              )
            );
          },

          onStep: (evt: AgentXStreamStepEvent) => {
            this.messages.update((msgs) =>
              msgs.map((m) => {
                if (m.id !== streamingId) return m;
                const prev = m.steps ?? [];
                const idx = prev.findIndex((s) => s.id === evt.id);
                const step: AgentXToolStep = {
                  id: evt.id,
                  label: evt.label,
                  status: evt.status,
                  detail: evt.detail,
                };
                const next =
                  idx >= 0 ? prev.map((s, i) => (i === idx ? step : s)) : [...prev, step];
                return { ...m, steps: next };
              })
            );
          },

          onCard: (evt: AgentXStreamCardEvent) => {
            this.messages.update((msgs) =>
              msgs.map((m) =>
                m.id === streamingId
                  ? {
                      ...m,
                      cards: [
                        ...(m.cards ?? []),
                        { type: evt.type, title: evt.title, payload: evt.payload },
                      ],
                    }
                  : m
              )
            );
          },

          onDone: (evt) => {
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
            this.logger.info('Stream complete', {
              model: evt.model,
              outputTokens: evt.usage?.outputTokens,
              threadId: evt.threadId,
            });
            resolve();
          },

          onError: (evt) => {
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
      const success = await this.jobService.replyOperation(event.operationId, event.response);
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
