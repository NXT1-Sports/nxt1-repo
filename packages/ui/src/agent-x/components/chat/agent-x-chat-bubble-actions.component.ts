import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../../../components/icon';

@Component({
  selector: 'nxt1-agent-x-chat-bubble-actions',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div class="msg-actions" [class.msg-actions--end]="alignEnd" [attr.data-testid]="testIds.ROOT">
      @if (canEdit) {
        <button
          type="button"
          class="msg-action-btn msg-action-btn--edit"
          [attr.data-testid]="testIds.BTN_EDIT"
          aria-label="Edit prompt"
          title="Edit prompt"
          (click)="edit.emit()"
        >
          <nxt1-icon name="pencil" [size]="13" />
        </button>
      }

      <button
        type="button"
        class="msg-action-btn"
        [attr.data-testid]="testIds.BTN_COPY"
        aria-label="Copy prompt"
        title="Copy prompt"
        (click)="copy.emit()"
      >
        <nxt1-icon name="copyDocs" [size]="14" />
      </button>
    </div>
  `,
  styles: [
    `
      .msg-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }

      .msg-actions--end {
        justify-content: flex-end;
      }

      .msg-action-btn {
        display: inline-flex;
        align-items: center;
        border: none;
        background: transparent;
        color: var(--op-text-muted, rgba(255, 255, 255, 0.45));
        padding: 2px;
        cursor: pointer;
        transition:
          color 0.15s,
          background 0.15s;
      }

      .msg-action-btn:hover {
        color: var(--op-text, #fff);
      }

      .msg-action-btn--edit {
        gap: 4px;
        padding: 2px 5px;
        border-radius: 4px;
      }

      .msg-action-btn--edit:hover {
        background: rgba(255, 255, 255, 0.08);
      }

      @media (hover: hover) {
        .msg-actions {
          opacity: 0;
          transition: opacity 0.15s;
        }

        :host-context(.msg-row:hover) .msg-actions {
          opacity: 1;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatBubbleActionsComponent {
  protected readonly testIds = AGENT_X_CHAT_BUBBLE_ACTIONS_TEST_IDS;

  @Input() alignEnd = false;
  @Input() canEdit = false;

  @Output() readonly copy = new EventEmitter<void>();
  @Output() readonly edit = new EventEmitter<void>();
}
