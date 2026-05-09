import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { NxtChatBubbleComponent } from '../../../components/chat-bubble';
import type { OperationQuickAction } from './agent-x-operation-chat.types';
import { chunkOperationActions, resolveCoordinatorChipId } from './agent-x-operation-chat.utils';

@Component({
  selector: 'nxt1-agent-x-operation-chat-quick-prompts',
  standalone: true,
  imports: [NxtChatBubbleComponent],
  template: `
    <div class="msg-row msg-assistant">
      <nxt1-chat-bubble
        variant="agent-operation"
        [isOwn]="false"
        [content]="welcomeMessage"
        [isError]="false"
        [isSystem]="false"
      />
    </div>

    @if (suggestedActions.length > 0) {
      <h4 class="quick-prompts-title quick-prompts-title--suggested">Suggested Actions</h4>

      <div class="quick-options quick-options--desktop quick-options--suggested">
        @for (action of suggestedActions; track action.id) {
          <button
            type="button"
            class="quick-option-chip quick-option-chip--suggested"
            [attr.data-coordinator]="resolveCoordinatorId(action)"
            (click)="selectAction(action)"
          >
            <span class="quick-option-chip__topline">
              <span class="quick-option-chip__title">{{ action.label }}</span>
            </span>
            @if (action.description) {
              <span class="quick-option-chip__description">{{ action.description }}</span>
            }
          </button>
        }
      </div>

      <div class="quick-options-rows quick-options--mobile quick-options--suggested">
        @for (row of suggestedActionRows; track $index) {
          <div class="quick-options-row">
            @for (action of row; track action.id) {
              <button
                type="button"
                class="quick-option-chip quick-option-chip--suggested"
                [attr.data-coordinator]="resolveCoordinatorId(action)"
                (click)="selectAction(action)"
              >
                <span class="quick-option-chip__topline">
                  <span class="quick-option-chip__title">{{ action.label }}</span>
                </span>
                @if (action.description) {
                  <span class="quick-option-chip__description">{{ action.description }}</span>
                }
              </button>
            }
          </div>
        }
      </div>
    }

    @if (quickActions.length > 0) {
      @if (showQuickPromptsTitle) {
        <h4
          class="quick-prompts-title"
          [class.quick-prompts-title--after-suggested]="suggestedActions.length > 0"
        >
          Quick Prompts
        </h4>
      }

      <div class="quick-options quick-options--desktop">
        @for (action of quickActions; track action.id) {
          <button
            type="button"
            class="quick-option-chip"
            [attr.data-coordinator]="resolveCoordinatorId(action)"
            (click)="selectAction(action)"
          >
            <span class="quick-option-chip__topline">
              <span class="quick-option-chip__title">{{ action.label }}</span>
            </span>
            @if (action.description) {
              <span class="quick-option-chip__description">{{ action.description }}</span>
            }
          </button>
        }
      </div>

      <div class="quick-options-rows quick-options--mobile">
        @for (row of quickActionRows; track $index) {
          <div class="quick-options-row">
            @for (action of row; track action.id) {
              <button
                type="button"
                class="quick-option-chip"
                [attr.data-coordinator]="resolveCoordinatorId(action)"
                (click)="selectAction(action)"
              >
                <span class="quick-option-chip__topline">
                  <span class="quick-option-chip__title">{{ action.label }}</span>
                </span>
                @if (action.description) {
                  <span class="quick-option-chip__description">{{ action.description }}</span>
                }
              </button>
            }
          </div>
        }
      </div>
    }

    @if (scheduledActions.length > 0) {
      <h4 class="quick-prompts-title scheduled-title">Scheduled Actions</h4>

      <div class="quick-options quick-options--desktop scheduled-options">
        @for (action of scheduledActions; track action.id) {
          <button
            type="button"
            class="quick-option-chip scheduled-chip"
            (click)="selectAction(action)"
          >
            <span class="quick-option-chip__topline">
              <span class="quick-option-chip__title">{{ action.label }}</span>
            </span>
            @if (action.description) {
              <span class="quick-option-chip__description">{{ action.description }}</span>
            }
          </button>
        }
      </div>

      <div class="quick-options-rows quick-options--mobile scheduled-options">
        @for (row of scheduledActionRows; track $index) {
          <div class="quick-options-row">
            @for (action of row; track action.id) {
              <button
                type="button"
                class="quick-option-chip scheduled-chip"
                (click)="selectAction(action)"
              >
                <span class="quick-option-chip__topline">
                  <span class="quick-option-chip__title">{{ action.label }}</span>
                </span>
                @if (action.description) {
                  <span class="quick-option-chip__description">{{ action.description }}</span>
                }
              </button>
            }
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

      .msg-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-width: 88%;
        margin-bottom: 16px;
        animation: fadeSlideIn 0.25s ease-out;
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

      .quick-options {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        padding: 0 0 16px;
        animation: fadeSlideIn 0.3s ease-out;
      }

      .quick-options--suggested {
        padding-top: 4px;
      }

      .quick-option-chip {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        gap: 4px;
        min-height: 74px;
        padding: 10px 14px;
        border: 1px solid var(--op-border);
        border-radius: 22px;
        background: var(--op-surface);
        color: var(--op-text);
        font-size: 13px;
        font-weight: 600;
        font-family: inherit;
        line-height: 1.3;
        cursor: pointer;
        text-align: left;
        -webkit-tap-highlight-color: transparent;
        box-shadow:
          0 14px 34px color-mix(in srgb, var(--op-shadow, #000) 22%, transparent),
          inset 0 1px 0 color-mix(in srgb, white 7%, transparent);
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease,
          box-shadow 0.15s ease,
          transform 0.15s ease;
      }

      .quick-option-chip:active {
        background: var(--op-primary-glow);
        border-color: var(--op-primary);
        color: var(--op-primary);
        transform: translateY(1px) scale(0.99);
      }

      .quick-option-chip--suggested {
        border-color: color-mix(in srgb, var(--op-primary) 22%, var(--op-border));
        background: color-mix(in srgb, var(--op-primary-glow) 48%, var(--op-surface));
      }

      .quick-option-chip__topline {
        display: flex;
        align-items: flex-start;
        width: 100%;
      }

      .quick-option-chip__title {
        display: block;
        font-size: 14px;
        font-weight: 700;
        line-height: 1.25;
        letter-spacing: 0.01em;
      }

      .quick-option-chip__description {
        display: -webkit-box;
        overflow: hidden;
        width: 100%;
        color: var(--op-text-secondary);
        font-size: 12px;
        font-weight: 500;
        line-height: 1.45;
        margin-top: 1px;
        text-wrap: pretty;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
      }

      .quick-option-chip[data-coordinator] {
        --coordinator-pill-accent: var(--op-primary);
        border-color: var(--coordinator-pill-accent);
        background: color-mix(in srgb, var(--coordinator-pill-accent) 12%, transparent);
        color: var(--op-text);
        font-weight: 600;
        box-shadow:
          0 4px 16px color-mix(in srgb, var(--coordinator-pill-accent) 20%, transparent),
          inset 0 1px 0 color-mix(in srgb, var(--coordinator-pill-accent) 25%, white);
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        transition:
          border-color 0.15s ease,
          background 0.15s ease,
          box-shadow 0.15s ease,
          color 0.15s ease,
          transform 0.15s ease;
      }

      .quick-option-chip[data-coordinator]:active {
        background: color-mix(in srgb, var(--coordinator-pill-accent) 22%, transparent);
        box-shadow:
          0 6px 18px color-mix(in srgb, var(--coordinator-pill-accent) 28%, transparent),
          inset 0 1px 0 color-mix(in srgb, var(--coordinator-pill-accent) 30%, white);
        transform: translateY(1px) scale(0.99);
      }

      :host-context(.light) .quick-option-chip[data-coordinator],
      :host-context([data-theme='light']) .quick-option-chip[data-coordinator],
      :host-context([data-base-theme='light']) .quick-option-chip[data-coordinator] {
        background: color-mix(in srgb, var(--coordinator-pill-accent) 16%, transparent);
      }

      :host-context(.light) .quick-option-chip[data-coordinator]:active,
      :host-context([data-theme='light']) .quick-option-chip[data-coordinator]:active,
      :host-context([data-base-theme='light']) .quick-option-chip[data-coordinator]:active {
        background: color-mix(in srgb, var(--coordinator-pill-accent) 26%, transparent);
      }

      .quick-option-chip[data-coordinator='coord-admin'] {
        --coordinator-pill-accent: #3fa3ff;
      }

      .quick-option-chip[data-coordinator='coord-brand'] {
        --coordinator-pill-accent: #ff7a45;
      }

      .quick-option-chip[data-coordinator='coord-strategy'] {
        --coordinator-pill-accent: #9d7bff;
      }

      .quick-option-chip[data-coordinator='coord-performance'] {
        --coordinator-pill-accent: #41b8ff;
      }

      .quick-option-chip[data-coordinator='coord-data'] {
        --coordinator-pill-accent: #2fd39a;
      }

      .quick-option-chip[data-coordinator='coord-recruiting'] {
        --coordinator-pill-accent: #ccff00;
      }

      .quick-option-chip[data-coordinator='coord-media'] {
        --coordinator-pill-accent: #ff7a45;
      }

      .quick-option-chip[data-coordinator='coord-scout'] {
        --coordinator-pill-accent: #41b8ff;
      }

      .quick-option-chip[data-coordinator='coord-academics'] {
        --coordinator-pill-accent: #9d7bff;
      }

      .quick-option-chip[data-coordinator='coord-roster'] {
        --coordinator-pill-accent: #2fd39a;
      }

      .quick-option-chip[data-coordinator='coord-scouting'] {
        --coordinator-pill-accent: #3fa3ff;
      }

      .quick-option-chip[data-coordinator='coord-team-media'] {
        --coordinator-pill-accent: #ff5d8f;
      }

      .quick-option-chip[data-coordinator='coord-prospect-search'] {
        --coordinator-pill-accent: #ffd447;
      }

      .quick-option-chip[data-coordinator='coord-evaluation'] {
        --coordinator-pill-accent: #57d4ff;
      }

      .quick-option-chip[data-coordinator='coord-outreach'] {
        --coordinator-pill-accent: #ff9a3d;
      }

      .quick-option-chip[data-coordinator='coord-compliance'] {
        --coordinator-pill-accent: #44d6c2;
      }

      .scheduled-title {
        margin-top: 18px;
      }

      .scheduled-chip {
        border-color: rgba(168, 130, 255, 0.45);
        border-style: dashed;
      }

      .scheduled-chip:active {
        border-color: #a882ff;
        color: #a882ff;
        background: color-mix(in srgb, #a882ff 10%, transparent);
      }

      .quick-prompts-title {
        margin: 2px 0 12px;
        padding: 0;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.1;
        color: var(--ion-text-color, #fff);
        text-align: left;
        opacity: 0.85;
      }

      .quick-prompts-title--after-suggested {
        margin-top: 6px;
      }

      .quick-options--mobile {
        display: none;
      }

      @media (max-width: 420px) {
        .quick-options--desktop {
          display: none;
        }

        .quick-options--mobile {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 0 0 14px;
        }

        .quick-options-row {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          overflow-y: hidden;
          scroll-snap-type: x proximity;
          -webkit-overflow-scrolling: touch;
        }

        .quick-options-row::-webkit-scrollbar {
          display: none;
        }

        .quick-options-row .quick-option-chip {
          flex: 0 0 224px;
          min-height: 68px;
          padding: 9px 12px;
          scroll-snap-align: start;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXOperationChatQuickPromptsComponent {
  @Input() welcomeMessage = '';
  @Input() suggestedActions: readonly OperationQuickAction[] = [];
  @Input() quickActions: readonly OperationQuickAction[] = [];
  @Input() scheduledActions: readonly OperationQuickAction[] = [];
  @Input() showQuickPromptsHeading = true;
  @Output() readonly actionSelected = new EventEmitter<OperationQuickAction>();

  protected get showQuickPromptsTitle(): boolean {
    return this.showQuickPromptsHeading && this.quickActions.length > 0;
  }

  protected get quickActionRows(): OperationQuickAction[][] {
    return chunkOperationActions(this.quickActions);
  }

  protected get suggestedActionRows(): OperationQuickAction[][] {
    return chunkOperationActions(this.suggestedActions);
  }

  protected get scheduledActionRows(): OperationQuickAction[][] {
    return chunkOperationActions(this.scheduledActions);
  }

  protected selectAction(action: OperationQuickAction): void {
    this.actionSelected.emit(action);
  }

  protected resolveCoordinatorId(action: OperationQuickAction): string | null {
    return resolveCoordinatorChipId(action);
  }
}
