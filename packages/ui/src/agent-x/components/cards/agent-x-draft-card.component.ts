/**
 * @fileoverview Agent X Draft Card — Outreach Editor
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Renders an editable email/DM/social draft inline in the Agent X chat timeline.
 * The user can review and edit the AI-generated copy before approving it for send.
 * One-shot: disables editing after the user clicks Send/Approve.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  signal,
  type OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AgentXRichCard, AgentXDraftPayload } from '@nxt1/core/ai';

/** Event emitted when the user approves and sends the draft. */
export interface DraftSubmittedEvent {
  /** The card title (for context). */
  readonly cardTitle: string;
  /** Final subject line (may have been edited). */
  readonly subject: string;
  /** Final body content (may have been edited). */
  readonly content: string;
  /** Recipient email address (from the card payload). */
  readonly toEmail?: string;
  /** Pending approval request id when the draft is approval-backed. */
  readonly approvalId?: string;
  /** Operation id associated with the approval-backed draft. */
  readonly operationId?: string;
}

@Component({
  selector: 'nxt1-agent-x-draft-card',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="draft-card" [class.draft-card--sent]="sent()">
      <div class="draft-card__header">
        <svg class="draft-card__icon" viewBox="0 0 20 20" fill="none">
          <path
            d="M3 5L10 10L17 5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <rect
            x="2"
            y="4"
            width="16"
            height="12"
            rx="2"
            stroke="currentColor"
            stroke-width="1.5"
          />
        </svg>
        <span class="draft-card__title">{{ card().title }}</span>
        @if (recipientsCount() > 0) {
          <span class="draft-card__badge"
            >{{ recipientsCount() }} recipient{{ recipientsCount() === 1 ? '' : 's' }}</span
          >
        }
      </div>

      <div class="draft-card__body">
        @if (hasSubject()) {
          <div class="draft-field">
            <label class="draft-field__label" for="agx-draft-subject">Subject</label>
            <input
              class="draft-field__input"
              type="text"
              id="agx-draft-subject"
              name="subject"
              [ngModel]="subjectValue()"
              (ngModelChange)="subjectValue.set($event)"
              [disabled]="sent()"
              placeholder="Email subject…"
            />
          </div>
        }

        <div class="draft-field">
          <label class="draft-field__label" for="agx-draft-content">Message</label>
          <textarea
            class="draft-field__textarea"
            id="agx-draft-content"
            name="content"
            [ngModel]="contentValue()"
            (ngModelChange)="contentValue.set($event)"
            [disabled]="sent()"
            rows="6"
            placeholder="Draft content…"
          ></textarea>
        </div>
      </div>

      <div class="draft-card__footer">
        <button
          class="draft-card__send"
          type="button"
          [disabled]="sent() || !contentValue()"
          (click)="onSend()"
        >
          @if (sent()) {
            <svg class="draft-card__check" viewBox="0 0 16 16" fill="none">
              <path
                d="M3.5 8.5L6.5 11.5L12.5 4.5"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Sent
          } @else {
            <svg class="draft-card__send-icon" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 8L14 2L8 14L7 9L2 8Z"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linejoin="round"
              />
            </svg>
            Approve & Send
          }
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .draft-card {
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        border-radius: 12px;
        overflow: hidden;
        margin-top: 8px;
      }

      .draft-card--sent {
        opacity: 0.7;
      }

      .draft-card__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .draft-card__icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .draft-card__title {
        flex: 1;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .draft-card__badge {
        font-size: 0.6875rem;
        font-weight: 500;
        color: var(--nxt1-color-primary, #ccff00);
        background: rgba(204, 255, 0, 0.1);
        padding: 2px 8px;
        border-radius: 999px;
        flex-shrink: 0;
      }

      .draft-card__body {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
      }

      /* ── Fields ── */

      .draft-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .draft-field__label {
        font-size: 0.6875rem;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .draft-field__input,
      .draft-field__textarea {
        width: 100%;
        padding: 8px 10px;
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.15));
        border-radius: 8px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        color: var(--nxt1-color-text-primary, #ffffff);
        font-size: 0.8125rem;
        font-family: inherit;
        outline: none;
        transition: border-color 0.15s ease;
        box-sizing: border-box;
      }

      .draft-field__input::placeholder,
      .draft-field__textarea::placeholder {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.3));
      }

      .draft-field__input:focus,
      .draft-field__textarea:focus {
        border-color: var(--nxt1-color-primary, #ccff00);
      }

      .draft-field__input:disabled,
      .draft-field__textarea:disabled {
        opacity: 0.5;
        cursor: default;
      }

      .draft-field__textarea {
        resize: vertical;
        min-height: 80px;
        max-height: 240px;
        line-height: 1.5;
      }

      /* ── Footer ── */

      .draft-card__footer {
        padding: 0 12px 12px;
      }

      .draft-card__send {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 20px;
        border: none;
        border-radius: 8px;
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
        font-size: 0.8125rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .draft-card__send:hover:not(:disabled) {
        background: var(--nxt1-color-primary-hover, #b8e600);
      }

      .draft-card__send:active:not(:disabled) {
        background: var(--nxt1-color-primary-active, #a3cc00);
      }

      .draft-card__send:disabled {
        opacity: 0.6;
        cursor: default;
      }

      .draft-card__send-icon,
      .draft-card__check {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXDraftCardComponent implements OnInit {
  /** The rich card data (type, title, payload). */
  readonly card = input.required<AgentXRichCard>();

  /** Emitted when the user approves the draft for sending. */
  readonly draftSubmitted = output<DraftSubmittedEvent>();

  /** Whether the draft has been sent (one-shot lock). */
  protected readonly sent = signal(false);

  /** Editable subject line. */
  protected readonly subjectValue = signal('');

  /** Editable body content. */
  protected readonly contentValue = signal('');

  /** Whether the payload includes a subject field. */
  protected readonly hasSubject = computed<boolean>(() => {
    const payload = this.card().payload as AgentXDraftPayload;
    return typeof payload?.subject === 'string';
  });

  /** Number of recipients (display-only). */
  protected readonly recipientsCount = computed<number>(() => {
    const payload = this.card().payload as AgentXDraftPayload;
    return typeof payload?.recipientsCount === 'number' ? payload.recipientsCount : 0;
  });

  ngOnInit(): void {
    const payload = this.card().payload as AgentXDraftPayload;
    if (typeof payload?.content === 'string') {
      this.contentValue.set(payload.content);
    }
    if (typeof payload?.subject === 'string') {
      this.subjectValue.set(payload.subject);
    }
  }

  protected onSend(): void {
    if (this.sent() || !this.contentValue()) return;
    this.sent.set(true);
    const payload = this.card().payload as AgentXDraftPayload;
    this.draftSubmitted.emit({
      cardTitle: this.card().title,
      subject: this.subjectValue(),
      content: this.contentValue(),
      toEmail: typeof payload?.toEmail === 'string' ? payload.toEmail : undefined,
      approvalId: typeof payload?.approvalId === 'string' ? payload.approvalId : undefined,
      operationId: typeof payload?.operationId === 'string' ? payload.operationId : undefined,
    });
  }
}
