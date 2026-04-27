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
  input,
  output,
  signal,
  computed,
  effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AgentYieldState } from '@nxt1/core';
import { AGENT_X_ACTION_CARD_TEST_IDS } from '@nxt1/core/testing';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';

// ============================================
// INTERFACES
// ============================================

/** Emitted when the user approves or rejects an operation. */
export interface ActionCardApprovalEvent {
  readonly operationId: string;
  readonly decision: 'approve' | 'reject';
  readonly approvalId?: string;
  readonly toolInput?: Record<string, unknown>;
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
            {{ isApproval() ? 'Review and Confirm' : 'Quick Question from Agent X' }}
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
              <span class="action-card__summary-bullet" aria-hidden="true"></span>
              <span>{{ friendlyToolName() }}</span>
              <svg class="action-card__chevron" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.25 4.5L6 8.25L9.75 4.5" />
              </svg>
            </summary>
            @if (isEmailDraftApproval()) {
              <div class="action-card__editor">
                <label class="action-card__editor-label" for="ax-email-to">To</label>
                <input
                  id="ax-email-to"
                  class="action-card__editor-input"
                  type="text"
                  [(ngModel)]="editEmailTo"
                />

                <label class="action-card__editor-label" for="ax-email-subject">Subject</label>
                <input
                  id="ax-email-subject"
                  class="action-card__editor-input"
                  type="text"
                  [(ngModel)]="editEmailSubject"
                />

                <label class="action-card__editor-label" for="ax-email-body">Message</label>
                <textarea
                  id="ax-email-body"
                  class="action-card__editor-textarea"
                  rows="8"
                  [(ngModel)]="editEmailBody"
                ></textarea>
              </div>
            } @else if (toolSummaryLines().length > 0) {
              <ul class="action-card__summary-list">
                @for (line of toolSummaryLines(); track line) {
                  <li>{{ line }}</li>
                }
              </ul>
            }
            @if (!isEmailDraftApproval() && toolDetailLines().length > 0) {
              <ul class="action-card__summary-list action-card__summary-list--compact">
                @for (line of toolDetailLines(); track line) {
                  <li>{{ line }}</li>
                }
              </ul>
            }
          </details>
        }
      </div>

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

      .action-card__editor {
        display: grid;
        gap: 8px;
        padding: 8px 10px 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.04);
      }

      .action-card__editor-label {
        font-size: 11px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.6));
        margin-top: 2px;
      }

      .action-card__editor-input,
      .action-card__editor-textarea {
        width: 100%;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(0, 0, 0, 0.24);
        color: var(--nxt1-color-text-primary, #fff);
        font-size: 12px;
        line-height: 1.45;
        padding: 8px 10px;
        box-sizing: border-box;
        outline: none;
      }

      .action-card__editor-textarea {
        resize: vertical;
        min-height: 132px;
        font-family: inherit;
      }

      .action-card__editor-input:focus,
      .action-card__editor-textarea:focus {
        border-color: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 45%, transparent);
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
export class AgentXActionCardComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** The yield state from the agent (determines card variant + content). */
  readonly yield = input.required<AgentYieldState>();

  /** The operation ID needed to approve/reply. */
  readonly operationId = input.required<string>();

  /** Optional externally controlled visual state for inline timeline rendering. */
  readonly externalCardState = input<CardState | null>(null);

  /** Optional externally controlled resolved label for inline timeline rendering. */
  readonly externalResolvedText = input<string>('');

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
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;

  /** Inline reply text bound to textarea. */
  replyText = '';
  editEmailTo = '';
  editEmailSubject = '';
  editEmailBody = '';
  private lastLoadedDraftKey = '';

  /** Visual card state for optimistic transitions. */
  readonly cardState = signal<CardState>('idle');

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
  readonly isEmailDraftApproval = computed(
    () => this.isApproval() && this.yield().pendingToolCall?.toolName === 'send_email'
  );

  /** Human-friendly tool name label for athletes/coaches. */
  readonly friendlyToolName = computed(() => {
    const name = this.yield().pendingToolCall?.toolName ?? '';
    switch (name) {
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
      approvalId: this.yield().approvalId,
      toolInput: this.buildEditedToolInput(),
    });
  }

  onReject(): void {
    this.cardState.set('submitting');
    this.approve.emit({
      operationId: this.operationId(),
      decision: 'reject',
      approvalId: this.yield().approvalId,
    });
  }

  constructor() {
    effect(() => {
      const yieldState = this.yield();
      const toolCall = yieldState.pendingToolCall;
      const draftKey = `${yieldState.approvalId ?? ''}:${toolCall?.toolName ?? ''}`;

      if (!toolCall || toolCall.toolName !== 'send_email') {
        this.lastLoadedDraftKey = '';
        return;
      }
      if (draftKey === this.lastLoadedDraftKey) return;

      const input = (toolCall.toolInput ?? {}) as Record<string, unknown>;
      this.editEmailTo = this.readString(input, ['toEmail', 'to', 'recipientEmail']) ?? '';
      this.editEmailSubject = this.readString(input, ['subject']) ?? '';
      this.editEmailBody =
        this.readString(input, ['bodyText', 'body', 'message']) ??
        this.htmlToText(this.readString(input, ['bodyHtml']) ?? '');

      this.lastLoadedDraftKey = draftKey;
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
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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

  private buildEditedToolInput(): Record<string, unknown> | undefined {
    const toolCall = this.yield().pendingToolCall;
    if (!toolCall || toolCall.toolName !== 'send_email') return undefined;

    const base =
      toolCall.toolInput &&
      typeof toolCall.toolInput === 'object' &&
      !Array.isArray(toolCall.toolInput)
        ? ({ ...(toolCall.toolInput as Record<string, unknown>) } as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    const to = this.editEmailTo.trim();
    const subject = this.editEmailSubject.trim();
    const body = this.editEmailBody.trim();

    base['toEmail'] = to;
    base['to'] = to;
    base['subject'] = subject;
    base['body'] = body;
    base['bodyText'] = body;
    base['message'] = body;
    if ('bodyHtml' in base) {
      base['bodyHtml'] = this.textToHtml(body);
    }

    return base;
  }

  private textToHtml(text: string): string {
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped.replace(/\n/g, '<br/>');
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
