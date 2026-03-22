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

import { Component, ChangeDetectionStrategy, input, output, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AgentYieldState } from '@nxt1/core';
import { AGENT_X_ACTION_CARD_TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../components/icon';

// ============================================
// INTERFACES
// ============================================

/** Emitted when the user approves or rejects an operation. */
export interface ActionCardApprovalEvent {
  readonly operationId: string;
  readonly decision: 'approve' | 'reject';
}

/** Emitted when the user replies to an agent's question. */
export interface ActionCardReplyEvent {
  readonly operationId: string;
  readonly response: string;
}

/** Visual state of the action card. */
type CardState = 'idle' | 'submitting' | 'resolved';

@Component({
  selector: 'nxt1-agent-action-card',
  standalone: true,
  imports: [FormsModule, NxtIconComponent],
  template: `
    <div
      class="action-card"
      [class.action-card--approval]="isApproval()"
      [class.action-card--input]="!isApproval()"
      [class.action-card--submitting]="cardState() === 'submitting'"
      [class.action-card--resolved]="cardState() === 'resolved'"
      [attr.data-testid]="testIds.CARD"
    >
      <!-- ═══ HEADER ═══ -->
      <div class="action-card__header" [attr.data-testid]="testIds.HEADER">
        <div class="action-card__icon-wrap">
          @if (isApproval()) {
            <nxt1-icon name="shield-checkmark" [size]="18" />
          } @else {
            <nxt1-icon name="help-circle" [size]="18" />
          }
        </div>
        <div class="action-card__header-text">
          <span class="action-card__title">
            {{ isApproval() ? 'Agent Needs Approval' : 'Question from Agent X' }}
          </span>
          @if (expiresLabel()) {
            <span class="action-card__expires">{{ expiresLabel() }}</span>
          }
        </div>
      </div>

      <!-- ═══ BODY ═══ -->
      <div class="action-card__body">
        <p class="action-card__prompt" [attr.data-testid]="testIds.PROMPT">
          {{ yield().promptToUser }}
        </p>

        <!-- Approval: collapsible tool args for transparency -->
        @if (isApproval() && yield().pendingToolCall) {
          <details class="action-card__details" [attr.data-testid]="testIds.DETAILS_TOGGLE">
            <summary class="action-card__details-summary">
              <nxt1-icon name="code-slash" [size]="14" />
              <span>{{ yield().pendingToolCall!.toolName }}</span>
              <nxt1-icon name="chevron-down" [size]="12" class="action-card__chevron" />
            </summary>
            <pre class="action-card__code" [attr.data-testid]="testIds.TOOL_ARGS">{{
              toolArgsJson()
            }}</pre>
          </details>
        }
      </div>

      <!-- ═══ ACTIONS ═══ -->
      @switch (cardState()) {
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
            <nxt1-icon name="checkmark-circle" [size]="16" />
            <span class="action-card__resolved-text">{{ resolvedText() }}</span>
          </div>
        }
        @default {
          <!-- Idle: show action buttons -->
          @if (isApproval()) {
            <div class="action-card__footer">
              <button
                type="button"
                class="action-card__btn action-card__btn--reject"
                [attr.data-testid]="testIds.BTN_REJECT"
                (click)="onReject()"
              >
                <nxt1-icon name="close" [size]="14" />
                Reject
              </button>
              <button
                type="button"
                class="action-card__btn action-card__btn--approve"
                [attr.data-testid]="testIds.BTN_APPROVE"
                (click)="onApprove()"
              >
                <nxt1-icon name="checkmark" [size]="14" />
                Approve
              </button>
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
                <nxt1-icon name="send" [size]="14" />
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
        max-width: 340px;
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
        background: rgba(255, 152, 0, 0.12);
        color: #ff9800;
      }

      .action-card--input .action-card__icon-wrap {
        background: rgba(204, 255, 0, 0.1);
        color: #ccff00;
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

      .action-card__details-summary::-webkit-details-marker {
        display: none;
      }

      .action-card__details[open] .action-card__chevron {
        transform: rotate(180deg);
      }

      .action-card__chevron {
        margin-left: auto;
        transition: transform 0.2s ease;
      }

      .action-card__code {
        margin: 0;
        padding: 10px;
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 11px;
        line-height: 1.4;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        background: rgba(0, 0, 0, 0.3);
        border-top: 1px solid rgba(255, 255, 255, 0.04);
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-all;
        max-height: 180px;
      }

      /* ── FOOTER / ACTIONS ── */
      .action-card__footer {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px 14px;
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

      .action-card__resolved-text {
        font-size: 13px;
        font-weight: 500;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXActionCardComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** The yield state from the agent (determines card variant + content). */
  readonly yield = input.required<AgentYieldState>();

  /** The operation ID needed to approve/reply. */
  readonly operationId = input.required<string>();

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when user clicks Approve or Reject. */
  readonly approve = output<ActionCardApprovalEvent>();

  /** Emitted when user submits a text reply. */
  readonly reply = output<ActionCardReplyEvent>();

  // ============================================
  // LOCAL STATE
  // ============================================

  /** Test IDs from @nxt1/core/testing constants. */
  protected readonly testIds = AGENT_X_ACTION_CARD_TEST_IDS;

  /** Inline reply text bound to textarea. */
  replyText = '';

  /** Visual card state for optimistic transitions. */
  readonly cardState = signal<CardState>('idle');

  /** Text shown after the card resolves. */
  readonly resolvedText = signal('');

  // ============================================
  // DERIVED STATE
  // ============================================

  /** Whether this card is an approval variant. */
  readonly isApproval = computed(() => this.yield().reason === 'needs_approval');

  /** Prettified JSON of the pending tool call arguments. */
  readonly toolArgsJson = computed(() => {
    const toolCall = this.yield().pendingToolCall;
    if (!toolCall) return '';
    try {
      return JSON.stringify(toolCall.toolInput, null, 2);
    } catch {
      return '{ … }';
    }
  });

  /** Human-readable expiry label. */
  readonly expiresLabel = computed(() => {
    const expiresAt = this.yield().expiresAt;
    if (!expiresAt) return '';
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / 3_600_000);
    const mins = Math.floor((diff % 3_600_000) / 60_000);
    if (hours > 0) return `Expires in ${hours}h ${mins}m`;
    return `Expires in ${mins}m`;
  });

  // ============================================
  // EVENT HANDLERS
  // ============================================

  onApprove(): void {
    this.cardState.set('submitting');
    this.approve.emit({
      operationId: this.operationId(),
      decision: 'approve',
    });
  }

  onReject(): void {
    this.cardState.set('submitting');
    this.approve.emit({
      operationId: this.operationId(),
      decision: 'reject',
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
      operationId: this.operationId(),
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
}
