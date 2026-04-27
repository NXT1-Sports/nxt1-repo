import {
  ChangeDetectionStrategy,
  Component,
  OnChanges,
  SimpleChanges,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AGENT_X_MESSAGE_EDIT_TEST_IDS } from '@nxt1/core/testing';

@Component({
  selector: 'nxt1-agent-x-message-edit',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="msg-edit" [attr.data-testid]="testIds.ROOT">
      <textarea
        [(ngModel)]="draftText"
        rows="3"
        class="msg-edit__textarea"
        placeholder="Edit your message"
        [attr.data-testid]="testIds.TEXTAREA"
      ></textarea>
      <div class="msg-edit__actions">
        <button
          type="button"
          class="msg-edit__btn"
          [attr.data-testid]="testIds.BTN_CANCEL"
          (click)="cancel.emit()"
        >
          Cancel
        </button>
        <button
          type="button"
          class="msg-edit__btn msg-edit__btn--primary"
          [attr.data-testid]="testIds.BTN_SAVE"
          (click)="saveEdit()"
        >
          Save & Resend
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .msg-edit {
        width: 100%;
        max-width: 520px;
        padding: 8px;
        border: 1px solid var(--op-border, rgba(255, 255, 255, 0.12));
        border-radius: 10px;
        background: var(--op-surface, rgba(255, 255, 255, 0.03));
      }

      .msg-edit__textarea {
        width: 100%;
        border-radius: 8px;
        border: 1px solid var(--op-border, rgba(255, 255, 255, 0.12));
        background: rgba(0, 0, 0, 0.2);
        color: var(--op-text, #fff);
        font: inherit;
        padding: 8px;
        resize: vertical;
        min-height: 74px;
        box-sizing: border-box;
      }

      .msg-edit__actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 8px;
      }

      .msg-edit__btn {
        border: 1px solid var(--op-border, rgba(255, 255, 255, 0.12));
        background: transparent;
        color: var(--op-text-muted, rgba(255, 255, 255, 0.75));
        border-radius: 8px;
        padding: 6px 10px;
        cursor: pointer;
      }

      .msg-edit__btn--primary {
        border-color: color-mix(in srgb, var(--op-primary, #ccff00) 42%, var(--op-border));
        color: var(--op-text, #fff);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXMessageEditComponent implements OnChanges {
  protected readonly testIds = AGENT_X_MESSAGE_EDIT_TEST_IDS;

  readonly initialText = input('');
  readonly save = output<string>();
  readonly cancel = output<void>();

  protected draftText = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialText']) {
      this.draftText = this.initialText();
    }
  }

  protected saveEdit(): void {
    const next = this.draftText.trim();
    if (!next) return;
    this.save.emit(next);
  }
}
