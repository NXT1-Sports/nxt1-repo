import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  AgentXOutputOption,
  AgentXOutputOptionIcon,
  AgentXOutputSelectionPayload,
  AgentXOutputSelectionStep,
  AgentXOutputSelectionStepResponse,
  AgentXRichCard,
} from '@nxt1/core/ai';
import { AGENT_X_OUTPUT_SELECTION_TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../../../components/icon/icon.component';
import { HapticsService } from '../../../services/haptics/haptics.service';

const PDF_ICON_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
    <path d="M14 4h24l12 12v42a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V4Z" fill="#fff"/>
    <path d="M38 4v12h12" fill="#F4F4F5"/>
    <path d="M38 4v12h12" stroke="#D4D4D8" stroke-width="2.25" stroke-linejoin="round"/>
    <path d="M14 4h24l12 12v42a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V4Z" stroke="#D4D4D8" stroke-width="2.25" stroke-linejoin="round"/>
    <rect x="8" y="30" width="48" height="20" rx="10" fill="#DC2626"/>
    <path d="M18 43.5V35h5.196c1.895 0 3.171 1.223 3.171 2.975 0 1.776-1.276 2.987-3.171 2.987h-2.624V43.5H18Zm2.572-4.642h2.191c.746 0 1.182-.44 1.182-.88 0-.44-.436-.88-1.182-.88h-2.191v1.76ZM28.524 43.5V35h3.867c2.6 0 4.47 1.706 4.47 4.25 0 2.557-1.87 4.25-4.47 4.25h-3.867Zm2.571-2.27h1.095c1.229 0 1.944-.857 1.944-1.98 0-1.15-.667-1.98-1.944-1.98h-1.095v3.96ZM39.418 43.5V35h6.011v2.27h-3.44v1.028h3.32v2.27h-3.32V43.5h-2.571Z" fill="#fff"/>
  </svg>`
)}`;

const CSV_ICON_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
    <path d="M14 4h24l12 12v42a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V4Z" fill="#fff"/>
    <path d="M38 4v12h12" fill="#ECFDF5"/>
    <path d="M38 4v12h12" stroke="#A7F3D0" stroke-width="2.25" stroke-linejoin="round"/>
    <path d="M14 4h24l12 12v42a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V4Z" stroke="#A7F3D0" stroke-width="2.25" stroke-linejoin="round"/>
    <rect x="8" y="30" width="48" height="20" rx="10" fill="#059669"/>
    <path d="M24.287 43.848c-2.621 0-4.565-1.834-4.565-4.598 0-2.773 1.944-4.608 4.565-4.608 1.395 0 2.633.514 3.503 1.467l-1.78 1.593c-.44-.494-.995-.796-1.582-.796-1.142 0-1.965.921-1.965 2.344 0 1.425.823 2.345 1.965 2.345.587 0 1.142-.302 1.582-.796l1.78 1.593c-.87.954-2.108 1.456-3.503 1.456ZM33.139 43.848c-2.747 0-4.765-1.889-4.765-4.598 0-2.71 2.018-4.608 4.765-4.608 2.746 0 4.766 1.898 4.766 4.608 0 2.709-2.02 4.598-4.766 4.598Zm0-2.386c1.11 0 1.965-.845 1.965-2.212 0-1.369-.855-2.223-1.965-2.223-1.112 0-1.965.854-1.965 2.223 0 1.367.853 2.212 1.965 2.212ZM39.033 43.649v-8.81h2.81l2.37 3.93 2.369-3.93h2.81v8.81h-2.62v-4.07l-1.975 3.196h-1.174l-1.977-3.196v4.07h-2.613Z" fill="#fff"/>
  </svg>`
)}`;

const OUTPUT_FORMAT_FAVICONS: Readonly<
  Partial<Record<AgentXOutputOption['formatTag'], string>>
> = {
  PDF: PDF_ICON_DATA_URI,
  GAMMA: 'https://www.google.com/s2/favicons?domain=gamma.app&sz=64',
  XLSX: 'https://www.google.com/s2/favicons?domain=excel.cloud.microsoft&sz=64',
  PPTX: 'https://www.google.com/s2/favicons?domain=powerpoint.cloud.microsoft&sz=64',
  CSV: CSV_ICON_DATA_URI,
  WEB: 'https://www.google.com/s2/favicons?domain=google.com&sz=64',
};

interface OutputSelectionStepDraft {
  readonly selectedOptionIds: readonly string[];
  readonly customText: string;
  readonly skipped: boolean;
}

export interface OutputSelectionStepSubmitEvent {
  readonly stepId: string;
  readonly prompt?: string;
  readonly selectedOptionIds?: readonly string[];
  readonly selectedOptionTitles?: readonly string[];
  readonly customText?: string;
  readonly skipped?: boolean;
}

export interface OutputSelectionSubmitEvent {
  readonly messageId?: string;
  readonly operationId?: string;
  readonly selectedOptionIds: readonly string[];
  readonly customText?: string;
  readonly stepResponses?: readonly OutputSelectionStepSubmitEvent[];
}

type OutputCardState = 'idle' | 'submitting' | 'resolved';

@Component({
  selector: 'nxt1-agent-x-output-selection-card',
  standalone: true,
  imports: [FormsModule, NxtIconComponent],
  template: `
    <section
      class="output-card"
      [class.output-card--resolved]="displayState() === 'resolved'"
      [attr.data-testid]="testIds.CARD"
    >
      <div class="output-card__header">
        <div class="output-card__header-copy">
          @if (questionCount() > 1) {
            <span class="output-card__step-meta">Question {{ currentQuestionNumber() }} of {{ questionCount() }}</span>
          }
          <h3 class="output-card__prompt" [attr.data-testid]="testIds.PROMPT">
            {{ currentPrompt() }}
          </h3>
        </div>
        @if (displayState() === 'resolved') {
          <span class="output-card__resolved" [attr.data-testid]="testIds.RESOLVED_BADGE">
            {{ resolvedBadgeText() }}
          </span>
        } @else if (questionCount() > 1) {
          <span class="output-card__resolved output-card__resolved--progress">
            {{ currentQuestionNumber() }}/{{ questionCount() }}
          </span>
        }
      </div>

      @if (currentContext()) {
        <p class="output-card__context">{{ currentContext() }}</p>
      }

      @if (displayState() === 'resolved') {
        <div class="output-card__summary">
          <span class="output-card__summary-label">{{ resolvedSummaryLabel() }}</span>
          <strong>{{ resolvedSummary() }}</strong>
        </div>
      } @else {
        @if (currentOptions().length > 0) {
          <div
            class="output-card__options"
            [attr.role]="isMultiSelect() ? 'group' : 'radiogroup'"
            [attr.aria-label]="currentPrompt()"
          >
            @for (option of currentOptions(); track option.id) {
              <button
                type="button"
                class="output-option"
                [class.output-option--selected]="isSelected(option.id)"
                [class.output-option--disabled]="option.disabled"
                [class]="optionClass(option)"
                [disabled]="option.disabled || displayState() === 'submitting'"
                [attr.data-testid]="testIds.OPTION_TILE"
                [attr.aria-checked]="isSelected(option.id)"
                [attr.role]="isMultiSelect() ? 'checkbox' : 'radio'"
                (click)="toggleOption(option)"
              >
                <span class="output-option__mark" [attr.data-testid]="markerTestId()">
                  @if (isSelected(option.id)) { ✓ }
                </span>
                <span
                  class="output-option__icon"
                  [class.output-option__icon--hidden]="!shouldRenderOptionIcon(option)"
                  [style.width.px]="optionIconSize(option)"
                  [style.height.px]="optionIconSize(option)"
                  aria-hidden="true"
                >
                  @if (shouldRenderOptionIcon(option)) {
                    @if (shouldShowFavicon(option)) {
                      <img
                        class="output-option__favicon"
                        [src]="faviconUrlForOption(option)"
                        [alt]="''"
                        [width]="optionIconSize(option)"
                        [height]="optionIconSize(option)"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                        (error)="onOptionIconError(option.id)"
                      />
                    } @else {
                      <nxt1-icon [name]="resolvedIconName(option)" [size]="optionIconSize(option)" />
                    }
                  }
                </span>
                <span class="output-option__copy">
                  <span class="output-option__title-row">
                    <span class="output-option__title">{{ option.title }}</span>
                    @if (showHigherCostTag(option)) {
                      <span class="output-option__badge output-option__badge--cost">Higher $</span>
                    }
                    @if (option.badge) {
                      <span class="output-option__badge">{{ option.badge }}</span>
                    }
                  </span>
                  <span class="output-option__description">{{ option.description }}</span>
                  @if (option.disabled && option.disabledReason) {
                    <span class="output-option__disabled-reason">{{ option.disabledReason }}</span>
                  }
                </span>
                <span class="output-option__shortcut" aria-hidden="true">
                  {{ $index + 1 }}
                </span>
              </button>
            }
          </div>
        }

        @if (shouldShowCustomInput()) {
          <label class="output-card__custom">
            <span class="output-card__custom-icon" aria-hidden="true">
              <nxt1-icon name="pencil" [size]="18" />
            </span>
            <textarea
              class="output-card__custom-input"
              [attr.data-testid]="testIds.CUSTOM_INPUT"
              [ngModel]="currentCustomText()"
              (focus)="onCustomInputFocus()"
              (ngModelChange)="onCustomTextChange($event)"
              rows="1"
              [placeholder]="customPlaceholder()"
            ></textarea>
            <span class="output-option__shortcut" aria-hidden="true">
              {{ currentOptions().length + 1 }}
            </span>
          </label>
        }

        <div class="output-card__footer" [class.output-card__footer--stacked]="questionCount() > 1">
          @if (questionCount() > 1) {
            <div class="output-card__nav-group">
              <button
                type="button"
                class="output-card__secondary"
                [disabled]="!canGoBack() || displayState() === 'submitting'"
                (click)="onBack()"
              >
                Back
              </button>
              <button
                type="button"
                class="output-card__secondary"
                [disabled]="displayState() === 'submitting'"
                (click)="onSkip()"
              >
                Skip
              </button>
            </div>
          }

          <button
            type="button"
            class="output-card__submit"
            [class.output-card__submit--wide]="questionCount() > 1"
            [disabled]="!canAdvance() || displayState() === 'submitting'"
            [attr.data-testid]="testIds.SUBMIT_BTN"
            [attr.aria-label]="submitLabel()"
            (click)="onAdvance()"
          >
            <nxt1-icon [name]="isLastQuestion() ? 'arrowUp' : 'arrowForward'" [size]="16" />
            @if (questionCount() > 1) {
              <span class="output-card__submit-label output-card__submit-label--visible">
                {{ submitLabel() }}
              </span>
            } @else {
              <span class="output-card__submit-label">{{ submitLabel() }}</span>
            }
          </button>
        </div>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: min(100%, 620px);
        --input-surface: var(--nxt1-color-surface-100);
        --input-border: var(--nxt1-color-border-default);
        --input-text: var(--nxt1-color-text-primary);
        --input-muted: var(--nxt1-color-text-tertiary);
        --input-attach-fg: var(--nxt1-color-text-secondary);
        --input-primary: var(--nxt1-color-brand-volt-400, #ccff00);
        --input-primary-glow: color-mix(
          in srgb,
          var(--nxt1-color-brand-volt-400, #ccff00) 10%,
          transparent
        );
        --input-surface-hover: var(--nxt1-color-surface-200);
        --output-card-hover: color-mix(
          in srgb,
          var(--nxt1-color-brand-volt-400, #ccff00) 6%,
          var(--input-surface)
        );
      }

      .output-card {
        display: grid;
        gap: 4px;
        padding: 8px;
        border: 1px solid var(--input-border);
        border-radius: 18px;
        background: var(--input-surface);
        color: var(--input-text);
        box-shadow:
          0 8px 24px rgba(0, 0, 0, 0.12),
          0 0 0 1px var(--input-border);
        backdrop-filter: saturate(160%) blur(14px);
        -webkit-backdrop-filter: saturate(160%) blur(14px);
        --output-card-surface: var(--input-surface);
        --output-card-border: var(--input-border);
      }

      .output-card__header {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 12px;
        padding: 4px 6px 6px;
      }

      .output-card__header-copy {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .output-card__prompt,
      .output-card__context {
        margin: 0;
      }

      .output-card__step-meta {
        color: var(--input-muted);
        font-size: 0.7rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .output-card__resolved,
      .output-option__badge {
        padding: 3px 8px;
        border-radius: 999px;
        border: 1px solid var(--input-border);
        background: var(--input-surface-hover);
        color: var(--input-attach-fg);
        font-size: 0.66rem;
        font-weight: 800;
      }

      .output-card__resolved--progress {
        min-width: 42px;
        justify-content: center;
        text-align: center;
      }

      .output-option__badge--cost {
        border-color: var(--input-border);
        background: transparent;
        color: var(--input-muted);
      }

      .output-card__prompt {
        max-width: 34rem;
        font-size: 0.98rem;
        font-weight: 700;
        line-height: 1.28;
      }

      .output-card__context {
        color: var(--input-muted);
        font-size: 0.72rem;
        line-height: 1.45;
        padding: 0 6px 8px;
        display: -webkit-box;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .output-card__options {
        display: grid;
        gap: 6px;
      }

      .output-option {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 12px;
        min-height: 0;
        padding: 10px 12px;
        border: 1px solid transparent;
        border-radius: 14px;
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
        transition:
          border-color 160ms ease,
          background 160ms ease,
          transform 160ms ease;
      }

      .output-option:hover:not(:disabled),
      .output-option--selected {
        background: var(--output-card-hover);
      }

      .output-option--selected {
        border-color: color-mix(in srgb, var(--input-primary) 52%, var(--input-border));
        background: color-mix(in srgb, var(--input-primary-glow) 78%, var(--output-card-surface));
      }

      .output-option:disabled {
        cursor: not-allowed;
        opacity: 0.56;
      }

      .output-option__mark {
        display: grid;
        place-items: center;
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
        border: 2px solid color-mix(in srgb, var(--input-attach-fg) 72%, transparent);
        border-radius: 999px;
        color: var(--input-primary);
        font-size: 0.58rem;
        font-weight: 900;
      }

      .output-option--selected .output-option__mark {
        border-color: var(--input-primary);
        background: var(--input-primary-glow);
      }

      .output-card__options[role='group'] .output-option__mark {
        border-radius: 6px;
      }

      .output-option__icon {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        color: var(--input-attach-fg);
      }

      .output-option__icon--hidden {
        display: none;
      }

      .output-option__favicon {
        display: block;
        width: 18px;
        height: 18px;
        border-radius: 4px;
        object-fit: contain;
      }

      .output-option__copy {
        display: grid;
        gap: 2px;
        min-width: 0;
        flex: 1 1 auto;
      }

      .output-option__title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .output-option__title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.83rem;
        font-weight: 600;
        line-height: 1.2;
      }

      .output-option__description,
      .output-option__disabled-reason {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--input-muted);
        font-size: 0.72rem;
        line-height: 1.25;
      }

      .output-option__disabled-reason {
        color: var(--input-muted);
      }

      .output-option__shortcut {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 24px;
        height: 24px;
        border: 1px solid var(--input-border);
        border-radius: 6px;
        color: var(--input-muted);
        font-size: 0.76rem;
        font-weight: 800;
      }

      .output-card__custom {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 0;
        padding: 10px 12px;
        border: 1px solid transparent;
        border-radius: 14px;
        background: transparent;
      }

      .output-card__custom:focus-within {
        border-color: color-mix(in srgb, var(--input-primary) 42%, var(--input-border));
        background: color-mix(in srgb, var(--input-primary-glow) 72%, var(--output-card-surface));
      }

      .output-card__custom-icon {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        color: var(--input-attach-fg);
      }

      .output-card__custom-input {
        width: 100%;
        flex: 1 1 auto;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        min-height: 22px;
        padding: 5px 0;
        resize: vertical;
      }

      .output-card__custom-input::placeholder {
        color: var(--input-muted);
        font-weight: 600;
      }

      .output-card__custom-input:focus {
        outline: none;
      }

      .output-card__footer {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 10px;
        padding: 4px 4px 0;
      }

      .output-card__footer--stacked {
        justify-content: space-between;
      }

      .output-card__nav-group {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .output-card__secondary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 34px;
        padding: 0 12px;
        border: 1px solid var(--input-border);
        border-radius: 999px;
        background: transparent;
        color: var(--input-muted);
        font-size: 0.76rem;
        font-weight: 800;
        cursor: pointer;
      }

      .output-card__secondary:hover:not(:disabled),
      .output-card__secondary:focus-visible {
        background: var(--input-surface-hover);
        color: var(--input-text);
        outline: none;
      }

      .output-card__secondary:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }

      .output-card__submit {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 36px;
        width: 36px;
        padding: 0;
        border: 1px solid var(--input-primary);
        border-radius: 999px;
        background: var(--input-primary-glow);
        color: var(--input-primary);
        font-weight: 900;
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease,
          border-color 0.15s ease,
          opacity 0.15s ease,
          box-shadow 0.15s ease;
      }

      .output-card__submit--wide {
        width: auto;
        padding: 0 14px;
      }

      .output-card__submit:hover:not(:disabled),
      .output-card__submit:focus-visible {
        background: color-mix(in srgb, var(--input-primary-glow) 88%, var(--output-card-surface));
        color: var(--input-primary);
        border-color: var(--input-primary);
        box-shadow: 0 4px 12px rgba(204, 255, 0, 0.15);
        outline: none;
      }

      .output-card__submit:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      .output-card__submit-label {
        display: none;
      }

      .output-card__submit-label--visible {
        display: inline;
      }

      .output-card__summary {
        display: grid;
        gap: 4px;
        padding: 10px 12px;
        border-radius: 14px;
        background: transparent;
        border: 1px solid var(--input-border);
      }

      .output-card__summary strong {
        white-space: pre-wrap;
      }

      .output-card__summary-label {
        color: var(--input-muted);
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
      }

      @media (max-width: 560px) {
        .output-card {
          padding: 12px;
        }

        .output-option {
          min-height: 0;
          gap: 10px;
        }

        .output-option__badge {
          display: none;
        }

        .output-option__description,
        .output-option__disabled-reason {
          white-space: normal;
        }

        .output-card__footer,
        .output-card__footer--stacked {
          flex-wrap: wrap;
          justify-content: space-between;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXOutputSelectionCardComponent {
  private readonly haptics = inject(HapticsService);

  readonly card = input.required<AgentXRichCard>();
  readonly messageId = input<string | undefined>();
  readonly operationId = input<string | undefined>();
  readonly externalCardState = input<OutputCardState | null>(null);
  readonly externalResolvedText = input<string>('');

  readonly outputSelected = output<OutputSelectionSubmitEvent>();

  protected readonly testIds = AGENT_X_OUTPUT_SELECTION_TEST_IDS;
  protected readonly currentStepIndex = signal(0);
  private readonly failedFaviconOptionIds = signal<Record<string, boolean>>({});
  private readonly stepDrafts = signal<Record<string, OutputSelectionStepDraft>>({});
  private initializedCardKey: string | null = null;

  protected readonly payload = computed(() => this.card().payload as AgentXOutputSelectionPayload);
  protected readonly steps = computed<readonly AgentXOutputSelectionStep[]>(() => {
    const payload = this.payload();
    if (payload.steps && payload.steps.length > 0) {
      return payload.steps;
    }

    return [
      {
        id: 'step_1',
        prompt: payload.prompt,
        ...(payload.context ? { context: payload.context } : {}),
        inputMode: payload.multiSelect ? 'multi_select' : 'single_select',
        options: payload.options ?? [],
        allowCustomOption: payload.allowCustomOption,
        defaultSelectedIds: payload.defaultSelectedIds,
        customPlaceholder: 'Custom',
      },
    ];
  });
  protected readonly questionCount = computed(() => this.steps().length);
  protected readonly currentStep = computed(() => {
    const steps = this.steps();
    const index = Math.min(this.currentStepIndex(), Math.max(steps.length - 1, 0));
    return steps[index] ?? steps[0]!;
  });
  protected readonly currentOptions = computed(() =>
    (this.currentStep().options ?? []).filter(
      (option) => !option.isCustomInput && option.formatTag !== 'CUSTOM'
    )
  );
  protected readonly displayState = computed<OutputCardState>(() => {
    if (this.externalCardState()) return this.externalCardState() ?? 'idle';
    return this.payload().resolvedSelection ? 'resolved' : 'idle';
  });
  protected readonly isResolvedSkipped = computed(() => {
    const selection = this.payload().resolvedSelection;
    if (selection?.stepResponses && selection.stepResponses.length > 0) {
      return selection.stepResponses.every((response) => response.skipped === true);
    }

    if ((selection?.selectedOptionIds?.length ?? 0) > 0) return false;
    if ((selection?.customText?.trim().length ?? 0) > 0) return false;

    const externalLines = this.externalResolvedText()
      .split('\n')
      .map((line) => line.replace(/^\d+\.\s*/, '').trim().toLowerCase())
      .filter((line) => line.length > 0);
    return externalLines.length > 0 && externalLines.every((line) => line === 'skipped');
  });
  protected readonly currentQuestionNumber = computed(() => this.currentStepIndex() + 1);
  protected readonly isMultiSelect = computed(
    () => this.currentStep().inputMode === 'multi_select'
  );
  protected readonly resolvedBadgeText = computed(() =>
    this.isResolvedSkipped() ? 'Skipped' : 'Selected'
  );
  protected readonly resolvedSummaryLabel = computed(() =>
    this.isResolvedSkipped() ? 'Status' : 'Output selected'
  );
  protected readonly activeSelectedIds = computed(() => {
    const resolved = this.payload().resolvedSelection?.selectedOptionIds;
    if (resolved && resolved.length > 0 && this.displayState() === 'resolved') {
      return resolved;
    }
    return this.currentDraft().selectedOptionIds;
  });
  protected readonly currentCustomText = computed(() => this.currentDraft().customText);
  protected readonly submitLabel = computed(() => {
    if (this.displayState() === 'submitting') return 'Sending';
    return this.isLastQuestion() ? 'Submit' : 'Next';
  });
  protected readonly resolvedSummary = computed(() => {
    const selection = this.payload().resolvedSelection;
    if (selection?.stepResponses && selection.stepResponses.length > 0) {
      return selection.stepResponses
        .map((response) => {
          const parts = [
            ...(response.selectedOptionTitles ?? response.selectedOptionIds ?? []),
            ...(response.customText?.trim() ? [response.customText.trim()] : []),
          ];
          return `${response.prompt}: ${response.skipped ? 'Skipped' : parts.join(' | ') || 'Answered'}`;
        })
        .join('\n');
    }

      const external = this.externalResolvedText().trim();
      if (external) return external;

    const ids = selection?.selectedOptionIds ?? this.activeSelectedIds();
    const labels = ids
      .map((id) => this.currentOptions().find((option) => option.id === id)?.title ?? id)
      .filter((label) => label.trim().length > 0);
    const custom = selection?.customText?.trim();
    if (custom && labels.length === 0) return custom;
    return labels.join(' + ') || custom || 'Skipped';
  });
  protected readonly canAdvance = computed(() => {
    if (this.displayState() !== 'idle') return false;
    if (this.currentDraft().skipped) return true;
    if (this.activeSelectedIds().length > 0 || this.currentCustomText().trim().length > 0) {
      return true;
    }
    return this.isLastQuestion();
  });

  protected markerTestId(): string {
    return this.isMultiSelect() ? this.testIds.OPTION_CHECKBOX : this.testIds.OPTION_RADIO;
  }

  protected currentPrompt(): string {
    return this.currentStep().prompt;
  }

  protected currentContext(): string {
    return this.currentStep().context ?? '';
  }

  protected isLastQuestion(): boolean {
    return this.currentStepIndex() >= this.questionCount() - 1;
  }

  protected canGoBack(): boolean {
    return this.currentStepIndex() > 0;
  }

  protected shouldShowCustomInput(): boolean {
    const step = this.currentStep();
    return step.inputMode === 'text' || step.allowCustomOption !== false;
  }

  protected customPlaceholder(): string {
    const step = this.currentStep();
    if (step.customPlaceholder?.trim()) return step.customPlaceholder.trim();
    return step.inputMode === 'text' ? 'Type your answer...' : 'Custom';
  }

  protected isSelected(optionId: string): boolean {
    return this.activeSelectedIds().includes(optionId);
  }

  protected optionClass(option: AgentXOutputOption): string {
    const tag = option.formatTag.toLowerCase();
    return `output-option--${tag} output-option--${option.icon}`;
  }

  protected showHigherCostTag(option: AgentXOutputOption): boolean {
    return option.formatTag === 'GAMMA';
  }

  protected shouldRenderOptionIcon(option: AgentXOutputOption): boolean {
    return option.formatTag !== 'CHOICE';
  }

  protected resolvedIconName(option: AgentXOutputOption): string {
    const icon = option.icon || this.iconForFormatTag(option.formatTag);
    switch (icon) {
      case 'sparkles':
      case 'presentation':
        return 'sparkles';
      case 'spreadsheet':
        return 'barChart';
      case 'slides':
        return 'documentText';
      case 'web':
        return 'download';
      case 'edit':
      case 'choice':
        return 'pencil';
      case 'pdf':
      default:
        return 'documentText';
    }
  }

  protected faviconUrlForOption(option: AgentXOutputOption): string | null {
    return OUTPUT_FORMAT_FAVICONS[option.formatTag] ?? null;
  }

  protected shouldShowFavicon(option: AgentXOutputOption): boolean {
    return !!this.faviconUrlForOption(option) && !this.failedFaviconOptionIds()[option.id];
  }

  protected optionIconSize(option: AgentXOutputOption): number {
    return option.formatTag === 'PDF' ? 26 : 18;
  }

  protected onOptionIconError(optionId: string): void {
    this.failedFaviconOptionIds.update((current) => ({
      ...current,
      [optionId]: true,
    }));
  }

  protected async toggleOption(option: AgentXOutputOption): Promise<void> {
    if (option.disabled || this.displayState() !== 'idle') return;

    const current = this.currentDraft().selectedOptionIds;
    const exists = current.includes(option.id);
    const next = this.isMultiSelect()
      ? exists
        ? current.filter((id) => id !== option.id)
        : [...current, option.id]
      : [option.id];

    this.updateCurrentDraft({ selectedOptionIds: next, customText: '', skipped: false });
    await this.haptics.impact('light');
  }

  protected onCustomTextChange(value: string): void {
    this.updateCurrentDraft({
      customText: value,
      selectedOptionIds: value.trim().length > 0 ? [] : this.currentDraft().selectedOptionIds,
      skipped: false,
    });
  }

  protected onCustomInputFocus(): void {
    if (this.currentStep().inputMode !== 'text') {
      this.updateCurrentDraft({ selectedOptionIds: [], skipped: false });
    }
  }

  protected onBack(): void {
    if (!this.canGoBack() || this.displayState() !== 'idle') return;
    this.currentStepIndex.update((value) => Math.max(0, value - 1));
  }

  protected onSkip(): void {
    if (this.displayState() !== 'idle') return;
    this.updateCurrentDraft({ selectedOptionIds: [], customText: '', skipped: true });
    if (this.isLastQuestion()) {
      this.submit();
      return;
    }
    this.currentStepIndex.update((value) => Math.min(this.questionCount() - 1, value + 1));
  }

  protected onAdvance(): void {
    if (!this.canAdvance()) return;
    if (this.isLastQuestion()) {
      if (
        !this.currentDraft().skipped &&
        this.activeSelectedIds().length === 0 &&
        this.currentCustomText().trim().length === 0
      ) {
        this.updateCurrentDraft({ selectedOptionIds: [], customText: '', skipped: true });
      }
      this.submit();
      return;
    }
    this.currentStepIndex.update((value) => Math.min(this.questionCount() - 1, value + 1));
  }

  protected submit(): void {
    if (this.displayState() !== 'idle') return;

    const stepResponses = this.steps()
      .map((step) => this.buildStepResponse(step))
      .filter((response): response is AgentXOutputSelectionStepResponse => response !== null);
    if (stepResponses.length === 0) return;

    const flattenedSelectedOptionIds = Array.from(
      new Set(stepResponses.flatMap((response) => [...(response.selectedOptionIds ?? [])]))
    );
    const firstCustomText = stepResponses.find((response) => response.customText?.trim())?.customText;

    this.outputSelected.emit({
      messageId: this.messageId(),
      operationId: this.operationId() ?? this.payload().operationId,
      selectedOptionIds: flattenedSelectedOptionIds,
      ...(stepResponses.length === 1 && firstCustomText ? { customText: firstCustomText } : {}),
      stepResponses: stepResponses.map((response) => ({
        stepId: response.stepId,
        prompt: response.prompt,
        ...(response.selectedOptionIds ? { selectedOptionIds: response.selectedOptionIds } : {}),
        ...(response.selectedOptionTitles
          ? { selectedOptionTitles: response.selectedOptionTitles }
          : {}),
        ...(response.customText ? { customText: response.customText } : {}),
        ...(response.skipped ? { skipped: true } : {}),
      })),
    });
  }

  constructor() {
    effect(() => {
      this.initializeSelection(this.payload());
    });
  }

  private currentDraft(): OutputSelectionStepDraft {
    const stepId = this.currentStep().id;
    return (
      this.stepDrafts()[stepId] ?? {
        selectedOptionIds: [],
        customText: '',
        skipped: false,
      }
    );
  }

  private updateCurrentDraft(patch: Partial<OutputSelectionStepDraft>): void {
    const stepId = this.currentStep().id;
    const current = this.currentDraft();
    this.stepDrafts.update((drafts) => ({
      ...drafts,
      [stepId]: {
        selectedOptionIds: patch.selectedOptionIds ?? current.selectedOptionIds,
        customText: patch.customText ?? current.customText,
        skipped: patch.skipped ?? current.skipped,
      },
    }));
  }

  private buildStepResponse(
    step: AgentXOutputSelectionStep
  ): AgentXOutputSelectionStepResponse | null {
    const draft =
      this.stepDrafts()[step.id] ??
      ({ selectedOptionIds: [], customText: '', skipped: false } satisfies OutputSelectionStepDraft);
    const selectedOptionIds = Array.from(
      new Set(draft.selectedOptionIds.map((id) => id.trim()).filter((id) => id.length > 0))
    );
    const customText = draft.customText.trim();

    if (draft.skipped) {
      return {
        stepId: step.id,
        prompt: step.prompt,
        skipped: true,
      };
    }

    if (selectedOptionIds.length === 0 && customText.length === 0) {
      return null;
    }

    const optionTitleById = new Map((step.options ?? []).map((option) => [option.id, option.title]));
    const selectedOptionTitles = selectedOptionIds
      .map((id) => optionTitleById.get(id) ?? id)
      .filter((title) => title.trim().length > 0);

    return {
      stepId: step.id,
      prompt: step.prompt,
      ...(selectedOptionIds.length > 0 ? { selectedOptionIds } : {}),
      ...(selectedOptionTitles.length > 0 ? { selectedOptionTitles } : {}),
      ...(customText ? { customText } : {}),
    };
  }

  private initializeSelection(payload: AgentXOutputSelectionPayload): void {
    const key = `${payload.operationId ?? ''}:${this.card().title}:${(payload.steps ?? []).length}:${(
      payload.options ?? []
    ).length}`;
    if (this.initializedCardKey === key) return;
    this.initializedCardKey = key;
    this.failedFaviconOptionIds.set({});
    this.currentStepIndex.set(0);

    const drafts: Record<string, OutputSelectionStepDraft> = {};
    for (const step of this.steps()) {
      const validIds = new Set(
        (step.options ?? [])
          .filter((option) => !option.isCustomInput && option.formatTag !== 'CUSTOM')
          .map((option) => option.id)
      );
      const defaults = (step.defaultSelectedIds ?? []).filter((id) => validIds.has(id));
      const recommended = (step.options ?? []).find(
        (option) => !option.disabled && option.badge?.toLowerCase().includes('recommended')
      );
      const selectedOptionIds =
        defaults.length > 0
          ? step.inputMode === 'multi_select'
            ? defaults
            : [defaults[0] ?? '']
          : recommended
            ? [recommended.id]
            : [];
      drafts[step.id] = {
        selectedOptionIds,
        customText: '',
        skipped: false,
      };
    }
    this.stepDrafts.set(drafts);
  }

  private iconForFormatTag(formatTag: AgentXOutputOption['formatTag']): AgentXOutputOptionIcon {
    switch (formatTag) {
      case 'GAMMA':
        return 'sparkles';
      case 'XLSX':
      case 'CSV':
        return 'spreadsheet';
      case 'PPTX':
        return 'slides';
      case 'WEB':
        return 'web';
      case 'CHOICE':
        return 'edit';
      case 'CUSTOM':
        return 'edit';
      case 'PDF':
      default:
        return 'pdf';
    }
  }
}
