import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  afterNextRender,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AGENT_X_MESSAGE_EDIT_TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../../../components/icon';

@Component({
  selector: 'nxt1-agent-x-message-edit',
  standalone: true,
  imports: [FormsModule, NxtIconComponent],
  template: `
    <div class="msg-edit" [attr.data-testid]="testIds.ROOT">
      <textarea
        #textareaRef
        [(ngModel)]="draftText"
        rows="1"
        class="msg-edit__textarea"
        placeholder="Edit your message"
        aria-label="Edit your message"
        [disabled]="saving"
        [attr.data-testid]="testIds.TEXTAREA"
        (input)="resizeTextarea()"
        (keydown)="onKeydown($event)"
      ></textarea>
      <div class="msg-edit__footer">
        <span class="msg-edit__status" role="status">{{ saving ? 'Saving edit...' : '' }}</span>
        <div class="msg-edit__actions">
          <button
            type="button"
            class="msg-edit__btn msg-edit__btn--confirm"
            aria-label="Save and resend"
            title="Save and resend"
            [disabled]="!canSave()"
            [attr.data-testid]="testIds.BTN_SAVE"
            (click)="saveEdit()"
          >
            <nxt1-icon name="checkmark" [size]="14" />
          </button>
          <button
            type="button"
            class="msg-edit__btn msg-edit__btn--cancel"
            aria-label="Cancel edit"
            title="Cancel edit"
            [disabled]="saving"
            [attr.data-testid]="testIds.BTN_CANCEL"
            (click)="cancel.emit()"
          >
            <nxt1-icon name="close" [size]="14" />
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        max-width: 100%;
        /* Stretch to the message row's full width (same column bubbles use)
           instead of the parent's shrink-to-fit alignment for bubbles. */
        align-self: stretch;
        box-sizing: border-box;
      }

      .msg-edit {
        width: 100%;
        box-sizing: border-box;
        padding: 10px 8px 5px 14px;
        border: 1px solid var(--op-border, var(--nxt1-color-border-subtle));
        border-radius: 14px;
        border-bottom-right-radius: 4px;
        background: var(--nxt1-color-surface-100, var(--op-surface));
      }

      .msg-edit__textarea {
        display: block;
        width: 100%;
        box-sizing: border-box;
        min-height: 26px;
        max-height: 140px;
        padding: 0;
        border: 0;
        outline: none;
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
        color: var(--nxt1-color-text-primary, var(--op-text));
        font: inherit;
        font-size: 16px;
        line-height: 1.5;
        resize: none;
        overflow-y: auto;
        caret-color: var(--nxt1-color-primary);
        accent-color: var(--nxt1-color-primary);
        box-shadow: none;
        -webkit-tap-highlight-color: transparent;
      }

      .msg-edit__textarea:focus,
      .msg-edit__textarea:focus-visible {
        outline: none;
        box-shadow: none;
      }

      .msg-edit__textarea::selection {
        color: var(--nxt1-color-text-primary, var(--op-text));
        background: color-mix(in srgb, var(--nxt1-color-primary) 24%, transparent);
      }

      .msg-edit__textarea::-moz-selection {
        color: var(--nxt1-color-text-primary, var(--op-text));
        background: color-mix(in srgb, var(--nxt1-color-primary) 24%, transparent);
      }

      .msg-edit__textarea::placeholder {
        color: var(--nxt1-color-text-tertiary, var(--op-text-muted));
      }

      .msg-edit__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 34px;
        margin-top: 2px;
      }

      .msg-edit__status {
        min-width: 0;
        font-size: 12px;
        color: var(--op-text-muted, rgba(255, 255, 255, 0.6));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .msg-edit__actions {
        display: flex;
        justify-content: flex-end;
        gap: 4px;
        margin-left: auto;
        flex-shrink: 0;
      }

      .msg-edit__btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 72%, transparent);
        border-radius: 8px;
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 65%, transparent);
        color: var(--nxt1-color-text-secondary, var(--op-text-muted));
        cursor: pointer;
        transition:
          background-color 140ms ease,
          border-color 140ms ease,
          color 140ms ease;
      }

      .msg-edit__btn--confirm:hover:not(:disabled),
      .msg-edit__btn--confirm:focus-visible {
        border-color: color-mix(in srgb, var(--nxt1-color-primary) 40%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-primary) 14%, transparent);
        color: var(--nxt1-color-primary);
      }

      .msg-edit__btn--cancel:hover:not(:disabled),
      .msg-edit__btn--cancel:focus-visible {
        border-color: color-mix(in srgb, var(--nxt1-color-error, #ff5f57) 40%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-error, #ff5f57) 12%, transparent);
        color: var(--nxt1-color-error, #ff5f57);
      }

      .msg-edit__btn:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .msg-edit__btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXMessageEditComponent {
  protected readonly testIds = AGENT_X_MESSAGE_EDIT_TEST_IDS;

  private readonly textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('textareaRef');

  @Input()
  set initialText(value: string) {
    this._initialText = value ?? '';
    this.draftText = value ?? '';
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => this.resizeTextarea());
    }
  }
  get initialText(): string {
    return this._initialText;
  }
  private _initialText = '';

  @Input() saving = false;
  @Output() readonly save = new EventEmitter<string>();
  @Output() readonly cancel = new EventEmitter<void>();

  protected draftText = '';

  constructor() {
    afterNextRender(() => {
      const textarea = this.textareaRef()?.nativeElement;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        this.resizeTextarea();
      }
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel.emit();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.saveEdit();
    }
  }

  protected canSave(): boolean {
    if (this.saving) return false;
    const trimmed = this.draftText.trim();
    return Boolean(trimmed && trimmed !== this._initialText.trim());
  }

  protected saveEdit(): void {
    if (!this.canSave()) return;
    this.save.emit(this.draftText.trim());
  }

  protected resizeTextarea(): void {
    const textarea = this.textareaRef()?.nativeElement;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  }
}
