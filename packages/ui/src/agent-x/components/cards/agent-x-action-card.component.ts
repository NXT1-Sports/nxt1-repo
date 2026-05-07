/**
 * @fileoverview Agent X Action Card — Copilot-style HITL Prompt
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Renders inline "Action Cards" when Agent X yields control back to the user.
 * Two variants based on `AgentYieldReason`:
 *
 * - **Approval Card** (`needs_approval`): Shows what the agent wants to do,
 *   collapsible tool args, and [Approve] / [Reject] buttons.
 * - **Input Card** (`needs_input`): Shows the agent's question with an inline
 *   text area and [Send Reply] button.
 *
 * Follows the Copilot inline-permission-popup pattern for trust & transparency.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  computed,
  effect,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { NxtMediaViewerService } from '../../../components/media-viewer/media-viewer.service';
import type { MediaViewerItem } from '../../../components/media-viewer/media-viewer.types';
import type {
  AgentYieldState,
  AgentXRichCard,
  AgentXConfirmationPayload,
  AgentXConfirmationVariant,
  AgentXGenericApprovalData,
  AgentXConfirmationTimelinePostData,
  AgentXPlanApprovalData,
  ApprovalRichPreview,
} from '@nxt1/core';
import { AGENT_X_ACTION_CARD_TEST_IDS } from '@nxt1/core/testing';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';

// ============================================
// INTERFACES
// ============================================

/** Emitted when the user approves or rejects an operation. */
export interface ActionCardApprovalEvent {
  readonly messageId?: string;
  readonly decision: 'approve' | 'reject';
  readonly toolInput?: Record<string, unknown>;
  /** When true, the user checked "Trust for this session" and future same-group approvals should be skipped. */
  readonly trustForSession?: boolean;
}

/** Emitted when the user replies to an agent's question. */
export interface ActionCardReplyEvent {
  readonly messageId?: string;
  readonly response: string;
}

/** Emitted when user opens attached media from timeline/team approval editor. */
export interface ActionCardOpenMediaEvent {
  readonly attachments: readonly {
    readonly url: string;
    readonly type: 'image' | 'video';
    readonly name: string;
  }[];
  readonly index: number;
}

/** Visual state of the action card. */
type CardState = 'idle' | 'submitting' | 'resolved';

/**
 * Structured recipient entry for batch email approvals.
 * Preserves the per-recipient `variables` map through the approval round-trip
 * so deterministic placeholder substitution works after the user edits the card.
 */
export interface BatchEmailRecipientEdit {
  readonly toEmail: string;
  readonly variables: Record<string, string | number | boolean>;
  /** Display label shown in the pill — falls back to toEmail when absent. */
  readonly displayName?: string;
}

@Component({
  selector: 'nxt1-agent-action-card',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div
      class="action-card"
      [class.action-card--approval]="isApproval()"
      [class.action-card--input]="!isApproval()"
      [class.action-card--submitting]="displayCardState() === 'submitting'"
      [class.action-card--resolved]="displayCardState() === 'resolved'"
      [attr.data-testid]="testIds.CARD"
    >
      @if (displayCardState() !== 'resolved') {
        <!-- ═══ HEADER ═══ -->
        <div class="action-card__header" [attr.data-testid]="testIds.HEADER">
          <div class="action-card__icon-wrap">
            <svg class="action-card__agent-mark" viewBox="0 0 612 792" aria-hidden="true">
              <path [attr.d]="agentXLogoPath" />
              <polygon [attr.points]="agentXLogoPolygon" />
            </svg>
          </div>
          <div class="action-card__header-text">
            <span class="action-card__title">
              {{ cardTitle() }}
            </span>
            @if (isApproval() && genericApprovalData()) {
              <span
                class="action-card__risk-badge"
                [class.action-card__risk-badge--medium]="
                  genericApprovalData()?.riskLevel === 'medium'
                "
                [class.action-card__risk-badge--high]="genericApprovalData()?.riskLevel === 'high'"
                [class.action-card__risk-badge--critical]="
                  genericApprovalData()?.riskLevel === 'critical'
                "
              >
                {{ riskLevelLabel() }}
              </span>
            }
            @if (expiresLabel()) {
              <span
                class="action-card__expires"
                [class.action-card__expires--urgent]="isExpiringSoon()"
                >{{ expiresLabel() }}</span
              >
            }
          </div>
        </div>

        <!-- ═══ BODY ═══ -->
        <div class="action-card__body">
          <p class="action-card__prompt" [attr.data-testid]="testIds.PROMPT">
            {{ yield().promptToUser }}
          </p>

          @if (isApproval() && isEmailApproval()) {
            <!-- ═══ EMAIL DRAFT EDITOR ═══ -->
            <div class="action-card__email-editor" [attr.data-testid]="testIds.DETAILS_TOGGLE">
              <div class="action-card__email-field">
                <label class="action-card__email-label">Recipients</label>
                @if (isBatchEmail()) {
                  <!-- Pill list for batch emails -->
                  <div class="action-card__recipients-bubbles">
                    @for (recipient of visibleEmailRecipients(); track recipient.toEmail) {
                      <span class="action-card__recipient-bubble">
                        {{ recipient.displayName || recipient.toEmail }}
                        <button
                          type="button"
                          class="action-card__recipient-remove"
                          (click)="removeRecipient(resolveRecipientIndex(recipient.toEmail))"
                          aria-label="Remove recipient"
                        >
                          &#x2715;
                        </button>
                      </span>
                    }
                  </div>
                  @if (hiddenRecipientCount() > 0) {
                    <button
                      type="button"
                      class="action-card__recipients-toggle"
                      (click)="toggleBatchRecipients()"
                    >
                      {{
                        showAllBatchRecipients()
                          ? 'Show fewer'
                          : 'Show ' + hiddenRecipientCount() + ' more'
                      }}
                    </button>
                  }
                } @else {
                  <input
                    type="text"
                    class="action-card__email-input"
                    [ngModel]="editEmailTo()"
                    (ngModelChange)="editEmailTo.set($event)"
                    placeholder="recipient@example.com"
                  />
                }
              </div>
              <div class="action-card__email-field">
                <label class="action-card__email-label">Subject</label>
                <input
                  type="text"
                  class="action-card__email-input"
                  [ngModel]="editEmailSubject()"
                  (ngModelChange)="editEmailSubject.set($event)"
                  placeholder="Subject line"
                />
              </div>
              <div class="action-card__email-field">
                <label class="action-card__email-label">Body</label>
                <div
                  class="action-card__email-preview action-card__email-preview--editable"
                  contenteditable="true"
                  spellcheck="true"
                  [innerHTML]="safeBodyHtml()"
                  (blur)="onBodyHtmlBlur($event)"
                ></div>
              </div>
            </div>
          } @else if (isApproval() && isPlanApproval() && planApprovalData()) {
            <!-- ═══ PLAN APPROVAL — GOAL + ORDERED STEPS ═══ -->
            <div class="action-card__plan" [attr.data-testid]="testIds.DETAILS_TOGGLE">
              <p class="action-card__plan-goal" [attr.data-testid]="testIds.PLAN_GOAL">
                <span class="action-card__plan-goal-label">Goal</span>
                <span class="action-card__plan-goal-text">{{ planApprovalData()!.goal }}</span>
              </p>
              <ol class="action-card__plan-steps" [attr.data-testid]="testIds.PLAN_STEP_LIST">
                @for (step of planApprovalData()!.steps; track step.id; let idx = $index) {
                  <li class="action-card__plan-step" [attr.data-testid]="testIds.PLAN_STEP_ITEM">
                    <span class="action-card__plan-step-index" aria-hidden="true">{{
                      idx + 1
                    }}</span>
                    <div class="action-card__plan-step-body">
                      <span class="action-card__plan-step-label">{{ step.label }}</span>
                      @if (step.description && step.description !== step.label) {
                        <span class="action-card__plan-step-desc">{{ step.description }}</span>
                      }
                      @if (step.coordinator) {
                        <span class="action-card__plan-step-meta">
                          <svg
                            class="action-card__plan-step-meta-icon"
                            viewBox="0 0 16 16"
                            aria-hidden="true"
                          >
                            <circle cx="8" cy="6" r="3" />
                            <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" />
                          </svg>
                          {{ formatCoordinator(step.coordinator) }}
                        </span>
                      }
                    </div>
                  </li>
                }
              </ol>
            </div>
          } @else if (isApproval() && isTimelinePostApproval() && timelinePostData()) {
            <!-- ═══ TIMELINE POST EDITOR ═══ -->
            <div class="action-card__email-editor" [attr.data-testid]="testIds.DETAILS_TOGGLE">
              <div class="action-card__email-field">
                <label class="action-card__email-label">Title</label>
                <input
                  type="text"
                  class="action-card__email-input"
                  [ngModel]="editPostTitle()"
                  (ngModelChange)="editPostTitle.set($event)"
                  placeholder="Post title"
                />
              </div>
              <div class="action-card__email-field">
                <label class="action-card__email-label">Description</label>
                <textarea
                  class="action-card__email-textarea"
                  [ngModel]="editPostDescription()"
                  (ngModelChange)="editPostDescription.set($event)"
                  placeholder="What's this post about?"
                  rows="5"
                ></textarea>
              </div>
              @if (timelineMediaAttachments().length > 0) {
                <div class="action-card__timeline-media">
                  <label class="action-card__email-label">Attached Media</label>
                  <div class="action-card__timeline-media-grid">
                    @for (media of timelineMediaAttachments(); track media.url; let idx = $index) {
                      <button
                        type="button"
                        class="action-card__timeline-media-button"
                        [attr.aria-label]="'Open attached ' + media.type"
                        (click)="onTimelineMediaClick(idx)"
                      >
                        @if (media.type === 'image') {
                          <img
                            class="action-card__timeline-media-thumb"
                            [src]="media.url"
                            [alt]="media.name"
                            loading="lazy"
                          />
                        } @else {
                          <video
                            class="action-card__timeline-media-thumb"
                            [src]="media.url"
                            preload="metadata"
                          ></video>
                          <span class="action-card__timeline-media-play" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                              <path d="M8 5v14l11-7L8 5z" />
                            </svg>
                          </span>
                        }
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          } @else if (isApproval() && isGenericApproval() && genericApprovalData()) {
            <!-- ═══ GENERIC APPROVAL RICH PREVIEW ═══ -->
            <div
              class="action-card__generic-preview"
              [class.action-card__generic-preview--destructive]="isDestructiveApproval()"
              [attr.data-testid]="testIds.DETAILS_TOGGLE"
            >
              <p class="action-card__generic-summary">
                {{ genericApprovalData()!.actionSummary }}
              </p>

              <!-- Season Stats Preview -->
              @if (richPreview() && richPreview()!.type === 'season_stats') {
                <div class="action-card__rich-preview action-card__stats-table">
                  <p>Preview rendering coming soon</p>
                </div>
              }

              <!-- Data display (fallback) -->
              @if (!richPreview() && genericApprovalData()!.dataFields?.length) {
                <table class="action-card__data-table">
                  @for (field of genericApprovalData()!.dataFields!; track field.key) {
                    <tr class="action-card__data-row">
                      <td class="action-card__data-key">{{ field.key }}</td>
                      <td class="action-card__data-value">{{ field.value }}</td>
                    </tr>
                  }
                </table>
              }
              @if (isDestructiveApproval()) {
                <p class="action-card__destructive-warning">
                  <svg class="action-card__warn-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 1L15 14H1L8 1Z" />
                    <line x1="8" y1="6" x2="8" y2="10" />
                    <circle cx="8" cy="12" r="0.5" />
                  </svg>
                  This action may be irreversible.
                </p>
              }
            </div>
          } @else if (isApproval() && yield().pendingToolCall) {
            <details class="action-card__details" [attr.data-testid]="testIds.DETAILS_TOGGLE">
              <summary class="action-card__details-summary">
                <span class="action-card__summary-bullet" aria-hidden="true"></span>
                <span>{{ friendlyToolName() }}</span>
                <svg class="action-card__chevron" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M2.25 4.5L6 8.25L9.75 4.5" />
                </svg>
              </summary>
              @if (toolSummaryLines().length > 0) {
                <ul class="action-card__summary-list">
                  @for (line of toolSummaryLines(); track line) {
                    <li>{{ line }}</li>
                  }
                </ul>
              }
              @if (toolDetailLines().length > 0) {
                <ul class="action-card__summary-list action-card__summary-list--compact">
                  @for (line of toolDetailLines(); track line) {
                    <li>{{ line }}</li>
                  }
                </ul>
              }
            </details>
          }
        </div>
      }
      <!-- /@if displayCardState !== 'resolved' -->

      <!-- ═══ ACTIONS ═══ -->
      @switch (displayCardState()) {
        @case ('submitting') {
          <div
            class="action-card__footer action-card__footer--loading"
            [attr.data-testid]="testIds.LOADING"
          >
            <div class="action-card__spinner"></div>
            <span class="action-card__loading-text">
              {{ isApproval() ? 'Resuming operation…' : 'Sending reply…' }}
            </span>
          </div>
        }
        @case ('resolved') {
          <div
            class="action-card__footer action-card__footer--resolved"
            [attr.data-testid]="testIds.RESOLVED"
          >
            <span class="action-card__resolved-dot" aria-hidden="true"></span>
            <span class="action-card__resolved-text">{{ displayResolvedText() }}</span>
          </div>
        }
        @default {
          <!-- Idle: show action buttons -->
          @if (isApproval()) {
            <div class="action-card__footer">
              @if (isTrustEligible()) {
                <label class="action-card__trust-label">
                  <input
                    type="checkbox"
                    class="action-card__trust-checkbox"
                    [checked]="trustForSession()"
                    (change)="trustForSession.set(!trustForSession())"
                  />
                  <span>Trust this action type for this session</span>
                </label>
              }
              <div class="action-card__footer-btns">
                <button
                  type="button"
                  class="action-card__btn action-card__btn--reject"
                  [attr.data-testid]="testIds.BTN_REJECT"
                  (click)="onReject()"
                >
                  <svg class="action-card__btn-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4 4L12 12M12 4L4 12" />
                  </svg>
                  Reject
                </button>
                <button
                  type="button"
                  class="action-card__btn action-card__btn--approve"
                  [attr.data-testid]="testIds.BTN_APPROVE"
                  (click)="onApprove()"
                >
                  <svg class="action-card__btn-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
                  </svg>
                  Approve
                </button>
              </div>
            </div>
          } @else {
            <div class="action-card__footer action-card__footer--input">
              <textarea
                class="action-card__textarea"
                [attr.data-testid]="testIds.TEXTAREA"
                [placeholder]="'Type your response…'"
                [(ngModel)]="replyText"
                (keydown.enter)="onSendReply($event)"
                rows="2"
              ></textarea>
              <button
                type="button"
                class="action-card__btn action-card__btn--send"
                [attr.data-testid]="testIds.BTN_REPLY"
                [disabled]="!replyText.trim()"
                (click)="onSendReply()"
              >
                <svg class="action-card__btn-icon" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M2 8H12M8 4L12 8L8 12" />
                </svg>
                Reply
              </button>
            </div>
          }
        }
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         ACTION CARD — COPILOT-STYLE HITL PROMPT
         ============================================ */

      .action-card {
        border-radius: 14px;
        overflow: hidden;
        animation: card-entrance 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        width: 100%;
        max-width: 100%;
      }

      @keyframes card-entrance {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      /* ── Approval variant ── */
      .action-card--approval {
        background: linear-gradient(
          135deg,
          rgba(255, 152, 0, 0.08) 0%,
          rgba(255, 152, 0, 0.03) 100%
        );
        border: 1px solid rgba(255, 152, 0, 0.2);
      }

      /* ── Input variant ── */
      .action-card--input {
        background: linear-gradient(
          135deg,
          rgba(204, 255, 0, 0.06) 0%,
          rgba(204, 255, 0, 0.02) 100%
        );
        border: 1px solid rgba(204, 255, 0, 0.15);
      }

      /* ── Submitting state ── */
      .action-card--submitting {
        opacity: 0.85;
        pointer-events: none;
      }

      /* ── Resolved state ── */
      .action-card--resolved {
        opacity: 0.7;
      }

      /* ── HEADER ── */
      .action-card__header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 16px 0;
      }

      .action-card__icon-wrap {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .action-card--approval .action-card__icon-wrap {
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        color: var(--nxt1-color-primary, #ccff00);
      }

      .action-card--input .action-card__icon-wrap {
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        color: var(--nxt1-color-primary, #ccff00);
      }

      .action-card__agent-mark {
        width: 18px;
        height: 18px;
        fill: currentColor;
      }

      .action-card__header-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .action-card__title {
        font-size: 13px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #fff);
        letter-spacing: 0.01em;
      }

      .action-card__expires {
        font-size: 11px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .action-card__expires--urgent {
        color: #ff7043;
        font-weight: 600;
        animation: expiry-pulse 1.5s ease-in-out infinite;
      }

      @keyframes expiry-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.6;
        }
      }
      .action-card__risk-badge {
        display: inline-flex;
        align-items: center;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        border-radius: 4px;
        padding: 2px 6px;
        width: fit-content;
      }

      .action-card__risk-badge--medium {
        background: rgba(255, 167, 38, 0.12);
        color: #ffa726;
        border: 1px solid rgba(255, 167, 38, 0.25);
      }

      .action-card__risk-badge--high {
        background: rgba(255, 112, 67, 0.12);
        color: #ff7043;
        border: 1px solid rgba(255, 112, 67, 0.25);
      }

      .action-card__risk-badge--critical {
        background: rgba(239, 83, 80, 0.14);
        color: #ef5350;
        border: 1px solid rgba(239, 83, 80, 0.3);
      }

      /* ── BODY ── */
      .action-card__body {
        padding: 12px 16px;
      }

      .action-card__prompt {
        font-size: 14px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.85));
        margin: 0;
        white-space: pre-wrap;
      }

      .action-card__details {
        margin-top: 10px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        overflow: hidden;
      }

      .action-card__details-summary {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        cursor: pointer;
        user-select: none;
        list-style: none;
      }

      .action-card__summary-bullet {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: var(--nxt1-color-primary, #ccff00);
        flex-shrink: 0;
      }

      .action-card__details-summary::-webkit-details-marker {
        display: none;
      }

      .action-card__details[open] .action-card__chevron {
        transform: rotate(180deg);
      }

      .action-card__chevron {
        margin-left: auto;
        width: 12px;
        height: 12px;
        stroke: currentColor;
        stroke-width: 1.5;
        fill: none;
        transition: transform 0.2s ease;
      }

      .action-card__btn-icon {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        stroke-width: 1.7;
        fill: none;
      }

      .action-card__summary-list {
        margin: 0;
        padding: 0 10px 8px 24px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.8));
        font-size: 12px;
        line-height: 1.5;
      }

      .action-card__summary-list--compact {
        padding-top: 0;
      }

      /* ── Generic approval preview ── */
      .action-card__generic-preview {
        margin-top: 10px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .action-card__generic-preview--destructive {
        background: rgba(239, 83, 80, 0.05);
        border-color: rgba(239, 83, 80, 0.2);
      }

      .action-card__generic-summary {
        font-size: 13px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.8));
        margin: 0;
      }

      .action-card__data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }

      .action-card__data-row {
        border-top: 1px solid rgba(255, 255, 255, 0.04);
      }

      .action-card__data-row:first-child {
        border-top: none;
      }

      .action-card__data-key {
        padding: 4px 8px 4px 0;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        font-weight: 600;
        letter-spacing: 0.02em;
        white-space: nowrap;
        vertical-align: top;
        width: 35%;
      }

      .action-card__data-value {
        padding: 4px 0;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.75));
        word-break: break-word;
        vertical-align: top;
      }

      .action-card__destructive-warning {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 500;
        color: #ef5350;
        margin: 0;
        padding-top: 4px;
        border-top: 1px solid rgba(239, 83, 80, 0.15);
      }

      /* ── Plan approval preview ── */
      .action-card__plan {
        margin-top: 10px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.07);
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .action-card__plan-goal {
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .action-card__plan-goal-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
      }

      .action-card__plan-goal-text {
        font-size: 14px;
        line-height: 1.45;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, rgba(255, 255, 255, 0.95));
        word-break: break-word;
      }

      .action-card__plan-steps {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
        counter-reset: plan-step;
      }

      .action-card__plan-step {
        position: relative;
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.05);
      }

      .action-card__plan-step-index {
        flex-shrink: 0;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: rgba(204, 255, 0, 0.18);
        color: #ccff00;
        font-size: 11px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }

      .action-card__plan-step-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
        flex: 1;
      }

      .action-card__plan-step-label {
        font-size: 13px;
        font-weight: 600;
        line-height: 1.4;
        color: var(--nxt1-color-text-primary, rgba(255, 255, 255, 0.92));
        word-break: break-word;
      }

      .action-card__plan-step-desc {
        font-size: 12px;
        line-height: 1.45;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        word-break: break-word;
      }

      .action-card__plan-step-meta {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.55));
        margin-top: 2px;
      }

      .action-card__plan-step-meta-icon {
        width: 11px;
        height: 11px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.5;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .action-card__warn-icon {
        width: 14px;
        height: 14px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.5;
        flex-shrink: 0;
      }

      /* ── Rich preview formatting ── */
      .action-card__rich-preview {
        margin-top: 8px;
      }

      .action-card__stats-header,
      .action-card__roster-header {
        font-size: 12px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #fff);
        margin: 0 0 6px 0;
        letter-spacing: 0.02em;
      }

      .action-card__table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }

      .action-card__table--compact {
        font-size: 11px;
      }

      .action-card__table--roster thead {
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .action-card__table-header-row {
        display: contents;
      }

      .action-card__table-header {
        padding: 6px 8px;
        text-align: left;
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        letter-spacing: 0.02em;
        text-transform: uppercase;
        font-size: 10px;
      }

      .action-card__table-row {
        border-top: 1px solid rgba(255, 255, 255, 0.04);
      }

      .action-card__table-row:first-child {
        border-top: none;
      }

      .action-card__table-label {
        padding: 6px 8px 6px 0;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        font-weight: 600;
        letter-spacing: 0.02em;
        white-space: nowrap;
        vertical-align: top;
        width: 40%;
      }

      .action-card__table-value {
        padding: 6px 0;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.75));
        word-break: break-word;
        vertical-align: top;
      }

      .action-card__table-value--name {
        font-weight: 500;
      }

      .action-card__table-value--center {
        text-align: center;
      }

      .action-card__identity-sections {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .action-card__identity-section {
        padding: 6px 0;
      }

      .action-card__section-title {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        margin: 0 0 4px 0;
      }

      /* ── Email editor ── */
      .action-card__email-editor {
        margin-top: 10px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .action-card__email-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .action-card__email-label {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
      }

      .action-card__email-input,
      .action-card__email-textarea {
        width: 100%;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
        color: var(--nxt1-color-text-primary, #fff);
        font-size: 13px;
        line-height: 1.5;
        padding: 7px 10px;
        outline: none;
        font-family: inherit;
        box-sizing: border-box;
        transition: border-color 0.15s ease;
      }

      /* ── Email body HTML preview (dark, matches card theme) ── */
      .action-card__email-preview {
        width: 100%;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
        color: var(--nxt1-color-text-primary, #fff);
        font-size: 13px;
        line-height: 1.65;
        padding: 7px 10px;
        word-break: break-word;
        white-space: normal;
        box-sizing: border-box;
      }

      .action-card__email-preview--editable {
        min-height: 140px;
        outline: none;
        cursor: text;
      }

      .action-card__email-preview--editable:focus {
        border-color: rgba(204, 255, 0, 0.35);
      }

      .action-card__email-preview ::ng-deep p {
        margin: 0 0 8px;
      }

      .action-card__email-preview ::ng-deep p:last-child {
        margin-bottom: 0;
      }

      .action-card__email-preview ::ng-deep ul,
      .action-card__email-preview ::ng-deep ol {
        margin: 4px 0 8px;
        padding-left: 18px;
      }

      .action-card__email-preview ::ng-deep li {
        margin-bottom: 3px;
      }

      .action-card__email-preview ::ng-deep strong {
        font-weight: 600;
      }

      .action-card__email-preview ::ng-deep a {
        color: #ccff00;
      }

      .action-card__email-input::placeholder {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.3));
      }

      .action-card__email-input:focus {
        border-color: rgba(204, 255, 0, 0.35);
      }

      /* ── Recipient pills (batch email) ── */
      .action-card__recipients-bubbles {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 4px 0;
      }

      .action-card__recipient-bubble {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: rgba(204, 255, 0, 0.12);
        color: #ccff00;
        border: 1px solid rgba(204, 255, 0, 0.22);
        border-radius: 16px;
        padding: 4px 10px;
        font-size: 12px;
        line-height: 1.3;
      }

      .action-card__recipient-remove {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border: none;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 11px;
        padding: 0;
        border-radius: 50%;
        transition: background 0.15s ease;
        flex-shrink: 0;
      }

      .action-card__recipient-remove:hover {
        background: rgba(204, 255, 0, 0.2);
      }

      .action-card__recipients-toggle {
        align-self: flex-start;
        margin-top: 2px;
        border: none;
        background: transparent;
        color: #ccff00;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.3;
        padding: 0;
        cursor: pointer;
      }

      .action-card__recipients-toggle:hover {
        opacity: 0.85;
      }

      .action-card__email-textarea {
        resize: vertical;
        min-height: 110px;
      }

      .action-card__timeline-media {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .action-card__timeline-media-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .action-card__timeline-media-button {
        border: 0;
        padding: 0;
        background: transparent;
        border-radius: 8px;
        cursor: pointer;
        position: relative;
      }

      .action-card__timeline-media-button:focus-visible {
        outline: 2px solid rgba(171, 255, 29, 0.7);
        outline-offset: 2px;
      }

      .action-card__timeline-media-thumb {
        width: 72px;
        height: 72px;
        object-fit: cover;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.04);
      }

      .action-card__timeline-media-play {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.7);
        color: #fff;
        pointer-events: none;
      }

      .action-card__email-textarea::placeholder {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.3));
      }

      .action-card__email-textarea:focus {
        border-color: rgba(204, 255, 0, 0.35);
      }

      /* ── FOOTER / ACTIONS ── */
      .action-card__footer {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px 16px 14px;
      }

      .action-card__footer-btns {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .action-card__trust-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.55);
        cursor: pointer;
        user-select: none;
        padding: 0 2px;
      }

      .action-card__trust-checkbox {
        width: 13px;
        height: 13px;
        accent-color: #c084fc;
        cursor: pointer;
      }

      .action-card__footer--loading,
      .action-card__footer--resolved {
        justify-content: center;
        padding: 12px 16px 14px;
        gap: 8px;
      }

      .action-card__footer--input {
        flex-direction: column;
        gap: 8px;
      }

      /* ── Buttons ── */
      .action-card__btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        padding: 8px 16px;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
      }

      .action-card__btn--approve {
        background: rgba(76, 175, 80, 0.15);
        color: #66bb6a;
        flex: 1;
      }

      .action-card__btn--approve:hover {
        background: rgba(76, 175, 80, 0.25);
      }

      .action-card__btn--approve:active {
        transform: scale(0.97);
      }

      .action-card__btn--reject {
        background: rgba(255, 255, 255, 0.06);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        flex: 1;
      }

      .action-card__btn--reject:hover {
        background: rgba(244, 67, 54, 0.12);
        color: #f44336;
      }

      .action-card__btn--reject:active {
        transform: scale(0.97);
      }

      .action-card__btn--send {
        background: var(--nxt1-color-primary, #ccff00);
        color: #000;
        align-self: flex-end;
      }

      .action-card__btn--send:hover {
        filter: brightness(1.1);
      }

      .action-card__btn--send:active {
        transform: scale(0.97);
      }

      .action-card__btn--send:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      /* ── Textarea ── */
      .action-card__textarea {
        width: 100%;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
        color: var(--nxt1-color-text-primary, #fff);
        font-size: 13px;
        line-height: 1.4;
        padding: 10px 12px;
        resize: none;
        outline: none;
        font-family: inherit;
        box-sizing: border-box;
        transition: border-color 0.15s ease;
      }

      .action-card__textarea::placeholder {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .action-card__textarea:focus {
        border-color: rgba(204, 255, 0, 0.3);
      }

      /* ── Loading spinner ── */
      .action-card__spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.15);
        border-top-color: var(--nxt1-color-primary, #ccff00);
        border-radius: 50%;
        animation: ac-spin 0.6s linear infinite;
      }

      @keyframes ac-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .action-card__loading-text {
        font-size: 13px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      /* ── Resolved ── */
      .action-card__footer--resolved {
        color: rgba(76, 175, 80, 0.9);
      }

      .action-card__resolved-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: currentColor;
      }

      .action-card__resolved-text {
        font-size: 13px;
        font-weight: 500;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXActionCardComponent implements OnDestroy {
  // ============================================
  // INPUTS
  // ============================================

  /** The yield state from the agent (determines card variant + content). */
  readonly yield = input.required<AgentYieldState>();

  /** The rich card object (optional, reserved for future card payload extension). */
  readonly card = input<AgentXRichCard | null>(null);

  /** The operation ID needed to approve/reply. */
  readonly operationId = input.required<string>();

  /** Optional persisted message id associated with this card render. */
  readonly messageId = input<string | null>(null);

  /** Optional externally controlled visual state for inline timeline rendering. */
  readonly externalCardState = input<CardState | null>(null);

  /** Optional externally controlled resolved label for inline timeline rendering. */
  readonly externalResolvedText = input<string>('');

  // ============================================
  // OUTPUTS
  private static readonly MAX_COLLAPSED_BATCH_RECIPIENTS = 10;

  // ============================================

  /** Emitted when user clicks Approve or Reject. */
  readonly approve = output<ActionCardApprovalEvent>();

  /** Emitted when user submits a text reply. */
  /** Whether the full batch recipient list is expanded. */
  readonly showAllBatchRecipients = signal(false);
  readonly reply = output<ActionCardReplyEvent>();

  /** Emitted when user taps attached media in timeline/team approval editor. */
  readonly openMedia = output<ActionCardOpenMediaEvent>();

  // ============================================
  // LOCAL STATE
  // ============================================

  /** Test IDs from @nxt1/core/testing constants. */
  protected readonly testIds = AGENT_X_ACTION_CARD_TEST_IDS;
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;

  /** Inline reply text bound to textarea. */
  replyText = '';
  /** Whether the user checked "Trust this action type for the session". */
  readonly trustForSession = signal(false);
  /** Visual card state for optimistic transitions. */
  readonly cardState = signal<CardState>('idle');

  /**
   * Ticker signal that increments every 30 seconds.
   * Forces `expiresLabel` (a computed) to re-evaluate since `Date.now()` is
   * not reactive — without this, the label would only compute once on mount.
   */
  private readonly _tick = signal(0);
  private readonly _tickInterval = setInterval(() => {
    this._tick.update((n) => n + 1);
  }, 30_000);

  ngOnDestroy(): void {
    clearInterval(this._tickInterval);
  }

  // ============================================
  // CARD PAYLOAD ACCESSORS
  // ============================================

  /**
   * Typed confirmation payload from the rich card (when available).
   * Used for variant-driven rendering and to supply the card title from
   * the backend rather than a hardcoded string.
   */
  private readonly confirmationPayload = computed<AgentXConfirmationPayload | null>(() => {
    const c = this.card();
    if (!c || c.type !== 'confirmation') return null;
    return c.payload as AgentXConfirmationPayload;
  });

  /**
   * Card rendering variant from the payload (`email | email-batch | generic_approval`).
   * Falls back to toolName-based detection for legacy cards that pre-date the variant field.
   */
  readonly cardVariant = computed<AgentXConfirmationVariant | null>(() => {
    const explicitVariant = this.confirmationPayload()?.variant;
    if (explicitVariant) return explicitVariant;
    // Legacy fallback: derive from toolName
    const name = this.yield().pendingToolCall?.toolName ?? '';
    if (name === 'send_email') return 'email';
    if (name === 'batch_send_email') return 'email-batch';
    if (
      name === 'write_timeline_post' ||
      name === 'write_team_post' ||
      name === 'update_timeline_post' ||
      name === 'update_team_post'
    )
      return 'timeline_post';
    if (this.yield().reason === 'needs_approval' && name) return 'generic_approval';
    return null;
  });

  /**
   * Structured data for the `generic_approval` variant card.
   * Provides action summary, risk level, resource name, and data field previews.
   */
  readonly genericApprovalData = computed<AgentXGenericApprovalData | null>(() => {
    if (this.cardVariant() !== 'generic_approval') return null;
    return this.confirmationPayload()?.genericApprovalData ?? null;
  });

  /**
   * Rich preview data extracted from generic approval card.
   * Renders as formatted tables/sections instead of raw key-value pairs.
   * Returns null if no richPreview or fallback to dataFields display.
   */
  readonly richPreview = computed<ApprovalRichPreview | null>(() => {
    return this.genericApprovalData()?.richPreview ?? null;
  });

  /** Structured data for the `timeline_post` variant card. */
  readonly timelinePostData = computed<AgentXConfirmationTimelinePostData | null>(() => {
    if (this.cardVariant() !== 'timeline_post') return null;

    const payloadData = this.confirmationPayload()?.timelinePostData;
    if (payloadData) return payloadData;

    // Fallback for legacy/live yield cards that do not include rich-card payload yet.
    const toolName = this.yield().pendingToolCall?.toolName ?? '';
    const input = (this.yield().pendingToolCall?.toolInput ?? {}) as Record<string, unknown>;

    if (toolName === 'write_team_post' || toolName === 'update_team_post') {
      const posts = Array.isArray(input['posts']) ? (input['posts'] as Array<unknown>) : [];
      const firstPost = posts.find((p) => p && typeof p === 'object') as
        | Record<string, unknown>
        | undefined;
      if (!firstPost) return null;
      const description =
        (typeof firstPost['content'] === 'string' && firstPost['content'].trim()) ||
        (typeof firstPost['description'] === 'string' && firstPost['description'].trim()) ||
        '';
      if (!description) return null;
      const title =
        typeof firstPost['title'] === 'string' && firstPost['title'].trim()
          ? firstPost['title'].trim()
          : undefined;
      const postType =
        typeof firstPost['type'] === 'string' && firstPost['type'].trim()
          ? firstPost['type'].trim()
          : undefined;
      return {
        ...(title ? { title } : {}),
        description,
        ...(postType ? { postType } : {}),
        isTeamPost: true,
      };
    }

    const description =
      (typeof input['content'] === 'string' && input['content'].trim()) ||
      (typeof input['description'] === 'string' && input['description'].trim()) ||
      '';
    if (!description) return null;
    const title =
      typeof input['title'] === 'string' && input['title'].trim()
        ? input['title'].trim()
        : undefined;
    const postType =
      typeof input['type'] === 'string' && input['type'].trim() ? input['type'].trim() : undefined;
    return {
      ...(title ? { title } : {}),
      description,
      ...(postType ? { postType } : {}),
      isTeamPost: false,
    };
  });

  /** Image previews extracted from timeline/team post toolInput media fields. */
  readonly timelineImagePreviews = computed(() => {
    if (!this.isTimelinePostApproval()) return [] as string[];
    const input = (this.yield().pendingToolCall?.toolInput ?? {}) as Record<string, unknown>;
    return this.extractTimelineMediaFromInput(input).images;
  });

  /** Optional video preview extracted from timeline/team post toolInput media fields. */
  readonly timelineVideoPreview = computed(() => {
    if (!this.isTimelinePostApproval()) return null;
    const input = (this.yield().pendingToolCall?.toolInput ?? {}) as Record<string, unknown>;
    return this.extractTimelineMediaFromInput(input).videoUrl;
  });

  /** Ordered media attachments used by shared chat media viewer. */
  readonly timelineMediaAttachments = computed(() => {
    if (!this.isTimelinePostApproval()) {
      return [] as { url: string; type: 'image' | 'video'; name: string }[];
    }
    const input = (this.yield().pendingToolCall?.toolInput ?? {}) as Record<string, unknown>;
    const media = this.extractTimelineMediaFromInput(input);

    return media.mediaUrls.map((url, index) => {
      const isVideo =
        this.isLikelyVideoUrl(url) || (media.videoUrl !== null && media.videoUrl === url);
      return {
        url,
        type: isVideo ? ('video' as const) : ('image' as const),
        name: isVideo ? `video-${index + 1}` : `image-${index + 1}`,
      };
    });
  });

  /** Whether this is a generic (non-email) approval card. */
  readonly isGenericApproval = computed(() => this.cardVariant() === 'generic_approval');

  /** Whether this approval is for a destructive / critical-risk action. */
  readonly isDestructiveApproval = computed(() => {
    const data = this.genericApprovalData();
    if (!data) return false;
    return (
      data.riskLevel === 'critical' ||
      data.category === 'profileDelete' ||
      data.category === 'teamDelete' ||
      data.category === 'destructive'
    );
  });

  /** Human-readable risk level label for the badge. */
  readonly riskLevelLabel = computed(() => {
    switch (this.genericApprovalData()?.riskLevel) {
      case 'critical':
        return 'Critical';
      case 'high':
        return 'High Risk';
      case 'medium':
        return 'Review Required';
      default:
        return '';
    }
  });

  /** Whether this approval is for an email tool (send_email / batch_send_email). */
  readonly isEmailApproval = computed(() => {
    const v = this.cardVariant();
    return v === 'email' || v === 'email-batch';
  });

  /** Whether this is specifically a batch email approval. */
  readonly isBatchEmail = computed(() => this.cardVariant() === 'email-batch');

  /** Compact recipient list shown by default for batch email approvals. */
  readonly visibleEmailRecipients = computed(() => {
    const recipients = this.editEmailRecipients();
    if (this.showAllBatchRecipients()) {
      return recipients;
    }

    return recipients.slice(0, AgentXActionCardComponent.MAX_COLLAPSED_BATCH_RECIPIENTS);
  });

  /** Number of hidden recipients behind the batch-email toggle. */
  readonly hiddenRecipientCount = computed(() => {
    const hidden =
      this.editEmailRecipients().length - AgentXActionCardComponent.MAX_COLLAPSED_BATCH_RECIPIENTS;
    return hidden > 0 ? hidden : 0;
  });

  /** Whether this approval is an editable timeline/team post. */
  readonly isTimelinePostApproval = computed(() => this.cardVariant() === 'timeline_post');

  /** Whether this is a multi-step plan approval card. */
  readonly isPlanApproval = computed(() => this.cardVariant() === 'plan_approval');

  /** Structured plan data — goal + ordered steps — for `plan_approval` cards. */
  readonly planApprovalData = computed<AgentXPlanApprovalData | null>(() => {
    if (this.cardVariant() !== 'plan_approval') return null;
    return this.confirmationPayload()?.planApprovalData ?? null;
  });

  /**
   * Convert a coordinator/agent identifier (e.g. `communication_coordinator`)
   * into a short, human-friendly label for the plan step meta line.
   */
  formatCoordinator(coordinator: string): string {
    const trimmed = coordinator.trim();
    if (!trimmed) return '';
    const stripped = trimmed.replace(/_coordinator$/i, '').replace(/_agent$/i, '');
    return stripped
      .split(/[_\s-]+/)
      .filter((word) => word.length > 0)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /** Editable recipient field for single send_email (plain string). */
  readonly editEmailTo = signal('');
  /** Editable recipient pills for batch_send_email (array preserving per-recipient variables). */
  readonly editEmailRecipients = signal<BatchEmailRecipientEdit[]>([]);
  /** Editable subject field, initialized from toolInput. */
  readonly editEmailSubject = signal('');
  /** Editable body plain text, kept in sync with HTML for bodyText compatibility. */
  readonly editEmailBody = signal('');
  /** Raw HTML body for rendered preview; updated alongside editEmailBody on init. */
  readonly editEmailBodyHtml = signal('');

  /** Editable timeline/team post title (optional). */
  readonly editPostTitle = signal('');
  /** Editable timeline/team post description/content. */
  readonly editPostDescription = signal('');

  /** Sanitized HTML for the body preview renderer. */
  private readonly sanitizer = inject(DomSanitizer);
  private readonly mediaViewer = inject(NxtMediaViewerService);
  readonly safeBodyHtml = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.editEmailBodyHtml())
  );

  /** Text shown after the card resolves. */
  readonly resolvedText = signal('');

  /** Effective visual state, allowing parent timeline to own the card lifecycle. */
  readonly displayCardState = computed<CardState>(
    () => this.externalCardState() ?? this.cardState()
  );

  /** Effective resolved text, allowing parent timeline to own the resolved label. */
  readonly displayResolvedText = computed(() => this.externalResolvedText() || this.resolvedText());

  // ============================================
  // DERIVED STATE
  // ============================================

  /** Whether this card is an approval variant. */
  readonly isApproval = computed(() => this.yield().reason === 'needs_approval');

  /**
   * True when the approval is eligible for session-level trust.
   * Excluded: critical-risk actions (deletes, destructive ops).
   */
  readonly isTrustEligible = computed(() => {
    if (!this.isApproval()) return false;
    const risk = this.genericApprovalData()?.riskLevel;
    // Critical-risk actions (permanent deletes, destructive) are never trust-eligible.
    return risk !== 'critical';
  });

  readonly cardTitle = computed(() => {
    if (!this.isApproval()) return 'Quick Question from Agent X';
    // Prefer the backend-authored title from the rich card when available.
    const backendTitle = this.card()?.title;
    if (backendTitle) return backendTitle;
    return 'Review and Confirm';
  });

  /** Human-friendly tool name label for athletes/coaches. */
  readonly friendlyToolName = computed(() => {
    const name = this.yield().pendingToolCall?.toolName ?? '';
    switch (name) {
      case 'execute_saved_plan':
        return 'Execution Plan Ready';
      case 'send_email':
        return 'Email Draft Ready';
      case 'post_to_social':
        return 'Social Post Draft';
      case 'send_sms':
        return 'Text Message Draft';
      default:
        return 'Agent Action Details';
    }
  });

  /** Friendly summary lines without developer/internal IDs. */
  readonly toolSummaryLines = computed(() => {
    const toolCall = this.yield().pendingToolCall;
    if (!toolCall) return [] as string[];
    const input = (toolCall.toolInput ?? {}) as Record<string, unknown>;

    if (toolCall.toolName === 'send_email') {
      const to = this.readString(input, ['toEmail', 'to', 'recipientEmail']);
      const subject = this.readString(input, ['subject']);
      const message =
        this.readString(input, ['bodyText', 'body', 'message']) ??
        this.htmlToText(this.readString(input, ['bodyHtml']) ?? '');
      const summary: string[] = [];
      if (to) summary.push(`To: ${to}`);
      if (subject) summary.push(`Subject: ${subject}`);
      if (message) summary.push(`Message: ${this.truncate(message, 160)}`);
      return summary;
    }

    return [] as string[];
  });

  /** Clean key-value details for all tools (no raw HTML/JSON dump). */
  readonly toolDetailLines = computed(() => {
    const toolCall = this.yield().pendingToolCall;
    if (!toolCall) return [] as string[];

    const raw = this.redactPayload(toolCall.toolInput);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [] as string[];

    const payload = raw as Record<string, unknown>;
    const lines: string[] = [];

    for (const [key, value] of Object.entries(payload)) {
      const formatted = this.formatDetailValue(value);
      if (!formatted) continue;
      lines.push(`${this.humanizeKey(key)}: ${formatted}`);
      if (lines.length >= 6) break;
    }

    return lines;
  });

  /** Human-readable expiry label. Re-evaluates every 30 s via `_tick`. */
  readonly expiresLabel = computed(() => {
    void this._tick(); // subscribe to ticker so computed re-runs every 30 s
    const expiresAt = this.yield().expiresAt;
    if (!expiresAt) return '';
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / 3_600_000);
    const mins = Math.floor((diff % 3_600_000) / 60_000);
    if (diff < 300_000) {
      // < 5 min — show urgent label
      return mins <= 1 ? 'Expires in < 1 min' : `Expires in ${mins}m`;
    }
    if (hours > 0) return `Expires in ${hours}h ${mins}m`;
    return `Expires in ${mins}m`;
  });

  /** True when fewer than 5 minutes remain — drives urgent styling. */
  readonly isExpiringSoon = computed(() => {
    void this._tick();
    const expiresAt = this.yield().expiresAt;
    if (!expiresAt) return false;
    const diff = new Date(expiresAt).getTime() - Date.now();
    return diff > 0 && diff < 300_000;
  });

  // ============================================
  // EVENT HANDLERS
  // ============================================

  onApprove(): void {
    this.cardState.set('submitting');
    this.approve.emit({
      messageId: this.messageId() ?? undefined,
      decision: 'approve',
      toolInput: this.isEmailApproval()
        ? this.buildEditedEmailInput()
        : this.isTimelinePostApproval()
          ? this.buildEditedTimelinePostInput()
          : undefined,
      ...(this.trustForSession() ? { trustForSession: true } : {}),
    });
  }

  onReject(): void {
    this.trustForSession.set(false);
    this.cardState.set('submitting');
    this.approve.emit({
      messageId: this.messageId() ?? undefined,
      decision: 'reject',
    });
  }

  constructor() {
    // Initialize editable email fields from toolInput whenever the yield changes.
    effect(() => {
      if (!this.isEmailApproval()) return;
      const toolName = this.yield().pendingToolCall?.toolName ?? '';
      const input = (this.yield().pendingToolCall?.toolInput ?? {}) as Record<string, unknown>;

      if (toolName === 'batch_send_email') {
        // batch_send_email: recipients (array), subjectTemplate, bodyHtmlTemplate
        const recipientsRaw = input['recipients'];
        this.editEmailRecipients.set(this.parseBatchRecipients(recipientsRaw));
        this.showAllBatchRecipients.set(false);
        this.editEmailSubject.set(this.readString(input, ['subjectTemplate', 'subject']) ?? '');
        const bodyHtml = this.readString(input, ['bodyHtmlTemplate', 'bodyHtml']) ?? '';
        this.editEmailBodyHtml.set(bodyHtml);
        this.editEmailBody.set(this.htmlToText(bodyHtml));
      } else {
        // send_email: toEmail, subject, bodyHtml
        this.editEmailTo.set(this.readString(input, ['toEmail', 'to', 'recipientEmail']) ?? '');
        this.editEmailSubject.set(this.readString(input, ['subject']) ?? '');
        const rawHtml = this.readString(input, ['bodyHtml']) ?? '';
        const textBody =
          this.readString(input, ['bodyText', 'body', 'message']) ?? this.htmlToText(rawHtml);
        this.showAllBatchRecipients.set(false);
        this.editEmailBodyHtml.set(rawHtml || this.plainTextToHtml(textBody));
        this.editEmailBody.set(textBody);
      }
    });

    // Initialize editable timeline/team post fields from toolInput payload.
    effect(() => {
      if (!this.isTimelinePostApproval()) return;
      const input = (this.yield().pendingToolCall?.toolInput ?? {}) as Record<string, unknown>;
      const data = this.timelinePostData();

      if (Array.isArray(input['posts'])) {
        const firstPost = (input['posts'] as Array<unknown>).find(
          (p) => p && typeof p === 'object'
        ) as Record<string, unknown> | undefined;
        const title =
          (typeof firstPost?.['title'] === 'string' && firstPost['title'].trim()) ||
          data?.title ||
          '';
        const description =
          (typeof firstPost?.['content'] === 'string' && firstPost['content'].trim()) ||
          (typeof firstPost?.['description'] === 'string' && firstPost['description'].trim()) ||
          data?.description ||
          '';
        const media = this.extractTimelineMediaFromInput(input);
        const sanitizedDescription = this.cleanTimelineDescriptionSeed(description, {
          hasMedia: media.mediaUrls.length > 0 || !!media.videoUrl,
          title,
        });
        this.editPostTitle.set(title);
        this.editPostDescription.set(sanitizedDescription);
        return;
      }

      const title =
        (typeof input['title'] === 'string' && input['title'].trim()) || data?.title || '';
      const description =
        (typeof input['content'] === 'string' && input['content'].trim()) ||
        (typeof input['description'] === 'string' && input['description'].trim()) ||
        data?.description ||
        '';
      const media = this.extractTimelineMediaFromInput(input);
      const sanitizedDescription = this.cleanTimelineDescriptionSeed(description, {
        hasMedia: media.mediaUrls.length > 0 || !!media.videoUrl,
        title,
      });
      this.editPostTitle.set(title);
      this.editPostDescription.set(sanitizedDescription);
    });
  }

  onSendReply(event?: Event): void {
    // Prevent newline on Enter
    if (event instanceof KeyboardEvent) {
      if (event.shiftKey) return; // Allow Shift+Enter for newline
      event.preventDefault();
    }
    const text = this.replyText.trim();
    if (!text) return;
    this.cardState.set('submitting');
    this.reply.emit({
      messageId: this.messageId() ?? undefined,
      response: text,
    });
  }

  // ============================================
  // PUBLIC API (called by parent after API success/failure)
  // ============================================

  /** Transition the card to its resolved visual state. */
  markResolved(text: string): void {
    this.resolvedText.set(text);
    this.cardState.set('resolved');
  }

  /** Reset the card back to idle (e.g. on API failure). */
  markIdle(): void {
    this.cardState.set('idle');
  }

  /** Build the edited toolInput to send back with approval (merges user edits into original). */
  private buildEditedEmailInput(): Record<string, unknown> {
    const toolName = this.yield().pendingToolCall?.toolName ?? '';
    const original = (this.yield().pendingToolCall?.toolInput ?? {}) as Record<string, unknown>;
    const result: Record<string, unknown> = { ...original };

    const subject = this.editEmailSubject().trim();
    const bodyHtml = this.editEmailBodyHtml().trim();
    const to = this.editEmailTo().trim();

    if (toolName === 'batch_send_email') {
      // Write back into batch-specific field names.
      // Recipients are sent as structured {toEmail, variables} objects so the
      // backend can perform deterministic per-recipient variable substitution.
      if (subject) result['subjectTemplate'] = subject;
      if (bodyHtml) result['bodyHtmlTemplate'] = bodyHtml;
      const structuredRecipients = this.editEmailRecipients();
      if (structuredRecipients.length > 0) {
        result['recipients'] = structuredRecipients.map(({ toEmail, variables }) => ({
          toEmail,
          variables,
        }));
      }
    } else {
      // send_email field names
      if (to) {
        if ('toEmail' in original) result['toEmail'] = to;
        else if ('recipientEmail' in original) result['recipientEmail'] = to;
        else result['toEmail'] = to;
      }
      if (subject) result['subject'] = subject;
      if (bodyHtml) {
        result['bodyHtml'] = bodyHtml;
        if ('bodyText' in original) result['bodyText'] = this.editEmailBody().trim();
      }
    }

    return result;
  }

  /** Build edited toolInput for timeline/team post approvals. */
  private buildEditedTimelinePostInput(): Record<string, unknown> {
    const original = (this.yield().pendingToolCall?.toolInput ?? {}) as Record<string, unknown>;
    const result: Record<string, unknown> = { ...original };
    const title = this.editPostTitle().trim();
    const description = this.editPostDescription().trim();
    const media = this.extractTimelineMediaFromInput(original);

    // write_team_post shape: { posts: [{ title, content, ... }] }
    if (Array.isArray(original['posts'])) {
      const nextPosts = [...(original['posts'] as Array<unknown>)];
      const firstIndex = nextPosts.findIndex((p) => p && typeof p === 'object');
      if (firstIndex >= 0) {
        const existingFirstPost = nextPosts[firstIndex] as Record<string, unknown>;
        const existingContent =
          this.readString(existingFirstPost, ['content', 'description']) ?? '';
        const firstPost: Record<string, unknown> = {
          ...existingFirstPost,
          content: description || existingContent,
          ...(media.mediaUrls.length > 0 ? { mediaUrls: media.mediaUrls } : {}),
        };
        if (title) {
          firstPost['title'] = title;
        } else {
          delete firstPost['title'];
        }

        if (media.videoUrl) {
          firstPost['videoUrl'] = media.videoUrl;
        }

        // Normalize common upstream variations so media is not dropped.
        delete firstPost['images'];
        delete firstPost['imageUrls'];

        nextPosts[firstIndex] = firstPost;
        result['posts'] = nextPosts;
      }
      return result;
    }

    // write_timeline_post shape: { content, type, ... } (+ optional title passthrough)
    const existingDescription = this.readString(original, ['content', 'description']) ?? '';
    result['content'] = description || existingDescription;
    if (media.images.length > 0) {
      result['images'] = media.images;
    }
    if (media.videoUrl) {
      result['videoUrl'] = media.videoUrl;
    }

    // Normalize common aliases to the canonical timeline fields.
    delete result['mediaUrls'];
    delete result['imageUrls'];
    delete result['video'];

    if (title) {
      result['title'] = title;
    } else if ('title' in result) {
      delete result['title'];
    }
    return result;
  }

  /**
   * Extract media from both timeline and team-post tool input shapes.
   * Supports canonical and alias field names so attachments survive approval edits.
   */
  private extractTimelineMediaFromInput(input: Record<string, unknown>): {
    images: string[];
    mediaUrls: string[];
    videoUrl: string | null;
  } {
    const collectUrls = (value: unknown): string[] => {
      if (!Array.isArray(value)) return [];
      return value
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.trim());
    };

    const firstString = (value: unknown): string | null => {
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (Array.isArray(value)) {
        const candidate = value.find((v) => typeof v === 'string' && v.trim().length > 0);
        return typeof candidate === 'string' ? candidate.trim() : null;
      }
      return null;
    };

    // Team post shape: { posts: [{ mediaUrls?: string[]; videoUrl?: string }] }
    const posts = Array.isArray(input['posts']) ? (input['posts'] as Array<unknown>) : [];
    const firstPost = posts.find((p) => p && typeof p === 'object') as
      | Record<string, unknown>
      | undefined;

    const urlsFromTeamPost = firstPost
      ? [
          ...collectUrls(firstPost['mediaUrls']),
          ...collectUrls(firstPost['images']),
          ...collectUrls(firstPost['imageUrls']),
        ]
      : [];
    const videoFromTeamPost =
      (firstPost && firstString(firstPost['videoUrl'])) ||
      (firstPost && firstString(firstPost['video'])) ||
      null;

    // Timeline post shape: { images?: string[]; videoUrl?: string }
    const urlsFromTimelinePost = [
      ...collectUrls(input['images']),
      ...collectUrls(input['mediaUrls']),
      ...collectUrls(input['imageUrls']),
    ];
    const videoFromTimelinePost = firstString(input['videoUrl']) || firstString(input['video']);

    const rawUrls = [...urlsFromTeamPost, ...urlsFromTimelinePost];
    const mediaUrls = [...new Set(rawUrls)];
    let videoUrl = videoFromTeamPost || videoFromTimelinePost || null;
    const images: string[] = [];

    for (const url of mediaUrls) {
      if (this.isLikelyVideoUrl(url)) {
        if (!videoUrl) {
          videoUrl = url;
        }
        continue;
      }
      images.push(url);
    }

    if (videoUrl && !mediaUrls.includes(videoUrl)) {
      mediaUrls.push(videoUrl);
    }

    return { images, mediaUrls, videoUrl };
  }

  /**
   * Hide auto-generated media filename text from the description editor seed.
   * Keeps the UI clean while preserving backend content requirements on submit.
   */
  private cleanTimelineDescriptionSeed(
    description: string,
    options: { hasMedia: boolean; title: string }
  ): string {
    const value = description.trim();
    if (!value || !options.hasMedia) return value;

    // Common macOS/iOS default recording titles are not meaningful captions.
    if (/^screen\s+recording\b/i.test(value)) {
      return '';
    }

    // If description is just a media filename/URL-ish token, hide it from the editor.
    const mediaLikeToken = /\.(mp4|mov|m4v|webm|m3u8|jpg|jpeg|png|gif|webp|heic|heif)(\?.*)?$/i;
    if (mediaLikeToken.test(value)) {
      return '';
    }

    // Avoid showing duplicate title/description when title carries the same media label.
    if (options.title && value.toLowerCase() === options.title.trim().toLowerCase()) {
      return '';
    }

    return value;
  }

  private isLikelyVideoUrl(url: string): boolean {
    const value = url.trim().toLowerCase();
    return (
      value.includes('/manifest/video.m3u8') || /\.(mp4|mov|m4v|webm|m3u8)(\?|#|$)/i.test(value)
    );
  }

  /** Remove a recipient pill by index (batch email). */
  removeRecipient(index: number): void {
    if (index < 0) return;
    this.editEmailRecipients.update((list) => list.filter((_, i) => i !== index));
    if (
      this.editEmailRecipients().length <= AgentXActionCardComponent.MAX_COLLAPSED_BATCH_RECIPIENTS
    ) {
      this.showAllBatchRecipients.set(false);
    }
  }

  toggleBatchRecipients(): void {
    this.showAllBatchRecipients.update((value) => !value);
  }

  resolveRecipientIndex(toEmail: string): number {
    return this.editEmailRecipients().findIndex((recipient) => recipient.toEmail === toEmail);
  }

  /** Capture in-place body HTML edits from contenteditable field. */
  onBodyHtmlBlur(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const html = target.innerHTML.trim();
    this.editEmailBodyHtml.set(html);
    this.editEmailBody.set(this.htmlToText(html));
  }

  onTimelineMediaClick(index: number): void {
    const attachments = this.timelineMediaAttachments();
    if (attachments.length === 0) return;

    const mediaItems: MediaViewerItem[] = attachments.map((attachment) => ({
      url: attachment.url,
      type: attachment.type,
      alt: attachment.name,
    }));

    // Direct open keeps behavior consistent with chat attachments even if parent
    // event wiring is bypassed in some embedded render paths.
    void this.mediaViewer.open({
      items: mediaItems,
      initialIndex: Math.max(0, Math.min(index, mediaItems.length - 1)),
      source: 'agent-x-chat',
    });

    this.openMedia.emit({
      attachments,
      index: Math.max(0, Math.min(index, attachments.length - 1)),
    });
  }

  /** Parse the raw recipients value from toolInput into structured BatchEmailRecipientEdit objects. */
  private parseBatchRecipients(recipients: unknown): BatchEmailRecipientEdit[] {
    if (!Array.isArray(recipients)) return [];
    return recipients
      .map((r): BatchEmailRecipientEdit | null => {
        if (typeof r === 'string' && r.trim()) {
          return { toEmail: r.trim(), variables: {} };
        }
        if (r && typeof r === 'object') {
          const obj = r as Record<string, unknown>;
          const toEmail = (
            typeof obj['toEmail'] === 'string'
              ? obj['toEmail']
              : typeof obj['email'] === 'string'
                ? obj['email']
                : ''
          ).trim();
          if (!toEmail) return null;
          // Preserve variables map for deterministic template rendering.
          const variables =
            obj['variables'] &&
            typeof obj['variables'] === 'object' &&
            !Array.isArray(obj['variables'])
              ? (obj['variables'] as Record<string, string | number | boolean>)
              : {};
          const displayName =
            typeof obj['displayName'] === 'string' && obj['displayName'].trim()
              ? obj['displayName'].trim()
              : typeof obj['name'] === 'string' && obj['name'].trim()
                ? obj['name'].trim()
                : undefined;
          return { toEmail, variables, ...(displayName ? { displayName } : {}) };
        }
        return null;
      })
      .filter((r): r is BatchEmailRecipientEdit => r !== null);
  }

  private readString(source: Record<string, unknown>, keys: readonly string[]): string | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength).trim()}...`;
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** Convert plain text (with \n line breaks) back to basic HTML for sending. */
  private plainTextToHtml(text: string): string {
    if (!text.trim()) return '';
    // If text already looks like HTML, return as-is
    if (/<[a-z][a-z0-9]*[\s/>]/i.test(text)) return text;
    // Split on double newlines for paragraphs, single newlines for <br>
    const paragraphs = text.split(/\n\n+/);
    if (paragraphs.length > 1) {
      return paragraphs.map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`).join('');
    }
    // Flat text with no newlines — split into paragraphs by sentence boundary
    // (period/exclamation/question followed by space and capital letter)
    const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
    if (sentences.length > 1) {
      return sentences.map((s) => `<p>${s.trim()}</p>`).join('');
    }
    return `<p>${text}</p>`;
  }

  private humanizeKey(key: string): string {
    return key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (char) => char.toUpperCase());
  }

  private formatDetailValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'string') {
      const cleaned = this.htmlToText(value);
      return cleaned ? this.truncate(cleaned, 120) : null;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      const items = value
        .map((item) => this.formatDetailValue(item))
        .filter((item): item is string => !!item);
      if (!items.length) return null;
      return this.truncate(items.join(', '), 120);
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !this.isSensitiveKey(key))
        .slice(0, 2)
        .map(([key, item]) => {
          const formatted = this.formatDetailValue(item);
          if (!formatted) return null;
          return `${this.humanizeKey(key)} ${formatted}`;
        })
        .filter((item): item is string => !!item);

      if (!entries.length) return null;
      return this.truncate(entries.join(' | '), 120);
    }

    return null;
  }

  private redactPayload(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactPayload(item));
    }
    if (!value || typeof value !== 'object') return value;

    const objectValue = value as Record<string, unknown>;
    const redacted: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(objectValue)) {
      if (this.isSensitiveKey(key)) {
        continue;
      }
      redacted[key] = this.redactPayload(raw);
    }
    return redacted;
  }

  private isSensitiveKey(key: string): boolean {
    const normalized = key.toLowerCase();
    return (
      normalized === 'userid' ||
      normalized === 'toolcallid' ||
      normalized === 'operationid' ||
      normalized === 'approvalid' ||
      normalized === 'threadid' ||
      normalized === 'sessionid' ||
      normalized === 'developer' ||
      normalized === 'internal' ||
      normalized.endsWith('token') ||
      normalized.endsWith('secret') ||
      normalized.endsWith('apikey') ||
      normalized.endsWith('password')
    );
  }
}
