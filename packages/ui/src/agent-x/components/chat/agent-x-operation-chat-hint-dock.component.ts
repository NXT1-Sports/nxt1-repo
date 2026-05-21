import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AGENT_X_OPERATION_CHAT_TEST_IDS } from '@nxt1/core/testing';

export interface AgentXHintDockItem {
  readonly hintKey: string;
  readonly icon: string;
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly tone?: 'neutral' | 'brand';
}

@Component({
  selector: 'nxt1-agent-x-operation-chat-hint-dock',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (hints.length > 0) {
      <div class="hint-dock" [attr.data-testid]="testIds.HINT_DOCK">
        @for (hint of hints; track hint.hintKey) {
          <div
            class="hint-dock__item"
            [class.hint-dock__item--brand]="hint.tone === 'brand'"
            [attr.data-testid]="testIds.HINT_ITEM"
          >
            <div class="hint-dock__icon">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>

            <div class="hint-dock__content">
              <div class="hint-dock__title">{{ hint.title }}</div>
              <p class="hint-dock__description">{{ hint.description }}</p>
            </div>

            @if (hint.actionLabel) {
              <button
                type="button"
                class="hint-dock__action"
                [attr.data-testid]="testIds.HINT_ACTION"
                (click)="onHintAction(hint.hintKey)"
              >
                {{ hint.actionLabel }}
              </button>
            }

            <button
              type="button"
              class="hint-dock__close"
              aria-label="Dismiss hint"
              [attr.data-testid]="testIds.HINT_CLOSE"
              (click)="onDismissHint(hint.hintKey)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .hint-dock {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 0 18px 6px;
      }

      .hint-dock__item {
        --hint-accent: var(--nxt1-color-feedback-info, #3b82f6);
        --hint-accent-soft: color-mix(in srgb, var(--hint-accent) 18%, var(--op-surface) 82%);
        --hint-accent-muted: color-mix(in srgb, var(--hint-accent) 10%, var(--op-surface) 90%);
        --hint-accent-border: color-mix(in srgb, var(--hint-accent) 42%, transparent);
        --hint-accent-glow: color-mix(in srgb, var(--hint-accent) 18%, transparent);
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid var(--hint-accent-border);
        border-radius: 12px;
        background: linear-gradient(135deg, var(--hint-accent-soft), var(--hint-accent-muted));
        box-shadow: 0 10px 24px -18px var(--hint-accent-glow);
        animation: hint-slide-in 0.3s ease-out;
      }

      .hint-dock__item--brand {
        --hint-accent: var(--nxt1-color-primary, #ccff00);
        --hint-accent-soft: color-mix(
          in srgb,
          var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.2)) 72%,
          var(--op-surface) 28%
        );
        --hint-accent-muted: color-mix(
          in srgb,
          var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1)) 78%,
          var(--op-surface) 22%
        );
        --hint-accent-border: color-mix(
          in srgb,
          var(--nxt1-color-primary, #ccff00) 54%,
          transparent
        );
        --hint-accent-glow: var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.2));
      }

      .hint-dock__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--hint-accent) 14%, transparent);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hint-accent) 22%, transparent);
        color: var(--hint-accent);
        flex-shrink: 0;
      }

      .hint-dock__content {
        flex: 1;
        min-width: 0;
      }

      .hint-dock__title {
        font-size: 0.8rem;
        font-weight: 600;
        color: color-mix(in srgb, var(--op-text) 95%, transparent);
        margin: 0 0 2px;
      }

      .hint-dock__description {
        font-size: 0.72rem;
        color: color-mix(in srgb, var(--op-text) 72%, transparent);
        line-height: 1.4;
        margin: 0;
      }

      .hint-dock__action {
        padding: 4px 10px;
        border: 1px solid color-mix(in srgb, var(--hint-accent) 62%, transparent);
        border-radius: 6px;
        background: color-mix(in srgb, var(--hint-accent) 10%, transparent);
        color: var(--hint-accent);
        font-size: 0.7rem;
        font-weight: 600;
        cursor: pointer;
        flex-shrink: 0;
        transition: all 0.2s ease;
      }

      .hint-dock__action:hover {
        background: color-mix(in srgb, var(--hint-accent) 16%, transparent);
        border-color: color-mix(in srgb, var(--hint-accent) 82%, transparent);
      }

      .hint-dock__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: color-mix(in srgb, var(--op-text) 50%, transparent);
        cursor: pointer;
        flex-shrink: 0;
        transition: all 0.2s ease;
      }

      .hint-dock__close:hover {
        background: color-mix(in srgb, var(--op-text) 8%, transparent);
        color: color-mix(in srgb, var(--op-text) 70%, transparent);
      }

      @keyframes hint-slide-in {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXOperationChatHintDockComponent {
  @Input() hints: readonly AgentXHintDockItem[] = [];

  @Output() readonly dismissHint = new EventEmitter<string>();
  @Output() readonly hintAction = new EventEmitter<string>();

  protected readonly testIds = AGENT_X_OPERATION_CHAT_TEST_IDS;

  onDismissHint(hintKey: string): void {
    this.dismissHint.emit(hintKey);
  }

  onHintAction(hintKey: string): void {
    this.hintAction.emit(hintKey);
  }
}
