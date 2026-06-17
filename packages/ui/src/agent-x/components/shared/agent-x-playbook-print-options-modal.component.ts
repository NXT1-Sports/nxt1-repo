import { ChangeDetectionStrategy, Component, Input, computed, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtModalHeaderComponent } from '../../../components/overlay';
import type { CallsheetSummary, PracticeScriptSummary } from './agent-x-playbooks-panel.types';

export type AgentXPlaybookPrintTargetTab = 'plays' | 'install' | 'callsheet' | 'play-script';

export type AgentXPlaybookPrintScope = 'current' | 'full';

export interface AgentXPlaybookPrintSelection {
  readonly scope: AgentXPlaybookPrintScope;
  readonly targetTab: AgentXPlaybookPrintTargetTab;
  readonly useFilteredPlays: boolean;
  readonly useGeneratedCallsheetBoard: boolean;
  readonly callsheetId: string | null;
  readonly practiceScriptId: string | null;
}

type AgentXPlaybookPrintOptionValue = AgentXPlaybookPrintTargetTab | 'full';

interface AgentXPlaybookPrintOption {
  readonly value: AgentXPlaybookPrintOptionValue;
  readonly label: string;
  readonly description: string;
  readonly testId: string;
}

type PlaybookPrintModalTestIds = typeof TEST_IDS.PLAYBOOK & {
  readonly PLAYBOOK_PRINT_MODAL: string;
  readonly PLAYBOOK_PRINT_MODE_CURRENT_BUTTON: string;
  readonly PLAYBOOK_PRINT_MODE_FULL_BUTTON: string;
  readonly PLAYBOOK_PRINT_TARGET_PLAYS_BUTTON: string;
  readonly PLAYBOOK_PRINT_TARGET_INSTALL_BUTTON: string;
  readonly PLAYBOOK_PRINT_TARGET_CALLSHEET_BUTTON: string;
  readonly PLAYBOOK_PRINT_TARGET_PRACTICE_SCRIPT_BUTTON: string;
  readonly PLAYBOOK_PRINT_FILTERED_TOGGLE: string;
  readonly PLAYBOOK_PRINT_GENERATED_CALLSHEET_TOGGLE: string;
  readonly PLAYBOOK_PRINT_CALLSHEET_SELECT: string;
  readonly PLAYBOOK_PRINT_PRACTICE_SCRIPT_SELECT: string;
  readonly PLAYBOOK_PRINT_SUMMARY: string;
  readonly PLAYBOOK_PRINT_CONFIRM_BUTTON: string;
  readonly PLAYBOOK_PRINT_CANCEL_BUTTON: string;
};

@Component({
  selector: 'nxt1-agent-x-playbook-print-options-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, NxtModalHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="print-options-modal" [attr.data-testid]="testIds.PLAYBOOK_PRINT_MODAL">
      <nxt1-modal-header
        title="Print Playbook"
        closePosition="left"
        [showBorder]="true"
        (closeModal)="close.emit(null)"
      />

      <div class="print-options-modal__body">
        @for (option of availablePrintOptions(); track option.value) {
          <button
            type="button"
            class="print-options-modal__choice print-options-modal__choice--list"
            [class.print-options-modal__choice--active]="isPrintOptionSelected(option.value)"
            [attr.data-testid]="option.testId"
            (click)="selectPrintOption(option.value)"
          >
            <span class="print-options-modal__choice-copy">
              <strong>{{ option.label }}</strong>
              <span>{{ option.description }}</span>
            </span>
            <span class="print-options-modal__choice-indicator">
              {{ isPrintOptionSelected(option.value) ? 'Selected' : 'Choose' }}
            </span>
          </button>
        }

        @if (showFilteredPlaysOption()) {
          <section class="print-options-modal__section">
            <label
              class="print-options-modal__toggle"
              [attr.data-testid]="testIds.PLAYBOOK_PRINT_FILTERED_TOGGLE"
            >
              <input
                type="checkbox"
                [ngModel]="useFilteredPlays()"
                (ngModelChange)="onUseFilteredPlaysChange($event)"
              />
              <span>
                <strong>Use current play filters</strong>
                <small
                  >Print {{ filteredPlayCount }} filtered plays instead of
                  {{ totalPlayCount }} total.</small
                >
              </span>
            </label>
          </section>
        }

        @if (showCallsheetOptions()) {
          <section class="print-options-modal__section">
            <p class="print-options-modal__eyebrow">Callsheet Source</p>
            <div class="print-options-modal__stack">
              <label
                class="print-options-modal__toggle"
                [attr.data-testid]="testIds.PLAYBOOK_PRINT_GENERATED_CALLSHEET_TOGGLE"
              >
                <input
                  type="checkbox"
                  [ngModel]="useGeneratedCallsheetBoard()"
                  (ngModelChange)="onUseGeneratedCallsheetBoardChange($event)"
                />
                <span>
                  <strong>Use generated board from active callsheet filters</strong>
                  <small
                    >Build a printable board from the current situation filters and AI
                    rankings.</small
                  >
                </span>
              </label>

              @if (!useGeneratedCallsheetBoard()) {
                <label class="print-options-modal__field">
                  <span>Saved callsheet</span>
                  <select
                    class="print-options-modal__select"
                    [ngModel]="callsheetId()"
                    [attr.data-testid]="testIds.PLAYBOOK_PRINT_CALLSHEET_SELECT"
                    (ngModelChange)="onCallsheetIdChange($event)"
                  >
                    <option [ngValue]="null">Choose a callsheet</option>
                    @for (sheet of callsheets; track sheet.id) {
                      <option [ngValue]="sheet.id">{{ sheet.title }}</option>
                    }
                  </select>
                </label>
              }
            </div>
          </section>
        }

        @if (showPracticeScriptOptions()) {
          <section class="print-options-modal__section">
            <label class="print-options-modal__field">
              <span>Practice script</span>
              <select
                class="print-options-modal__select"
                [ngModel]="practiceScriptId()"
                [attr.data-testid]="testIds.PLAYBOOK_PRINT_PRACTICE_SCRIPT_SELECT"
                (ngModelChange)="onPracticeScriptIdChange($event)"
              >
                <option [ngValue]="null">
                  {{
                    scope() === 'full'
                      ? 'Do not include a practice script'
                      : 'Choose a practice script'
                  }}
                </option>
                @for (script of practiceScripts; track script.id) {
                  <option [ngValue]="script.id">{{ script.title }}</option>
                }
              </select>
            </label>
          </section>
        }

        <section
          class="print-options-modal__summary"
          [attr.data-testid]="testIds.PLAYBOOK_PRINT_SUMMARY"
        >
          <p class="print-options-modal__eyebrow">Print Summary</p>
          <h3>{{ summaryTitle() }}</h3>
          <p>{{ summaryDescription() }}</p>
        </section>
      </div>

      <div class="print-options-modal__footer">
        <button
          type="button"
          class="print-options-modal__secondary-btn"
          [attr.data-testid]="testIds.PLAYBOOK_PRINT_CANCEL_BUTTON"
          (click)="close.emit(null)"
        >
          Cancel
        </button>
        <button
          type="button"
          class="print-options-modal__primary-btn"
          [disabled]="!canConfirm()"
          [attr.data-testid]="testIds.PLAYBOOK_PRINT_CONFIRM_BUTTON"
          (click)="confirm()"
        >
          {{ confirmLabel() }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .print-options-modal {
        display: flex;
        flex-direction: column;
        max-height: 82vh;
      }

      .print-options-modal__body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 20px;
        overflow: auto;
      }

      .print-options-modal__section,
      .print-options-modal__summary {
        display: grid;
        gap: 10px;
        margin-top: 8px;
        padding: 14px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: 12px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
      }

      .print-options-modal__summary {
        gap: 8px;
      }

      .print-options-modal__summary h3 {
        margin: 0;
        font-size: 0.98rem;
        line-height: 1.25;
        color: var(--nxt1-color-text-primary, #f1f5f9);
      }

      .print-options-modal__summary p:last-child {
        margin: 0;
        font-size: 0.82rem;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary, #94a3b8);
      }

      .print-options-modal__eyebrow {
        margin: 0;
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-tertiary, #64748b);
      }

      .print-options-modal__choice {
        display: grid;
        gap: 6px;
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: 10px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-primary, #f1f5f9);
        text-align: left;
        cursor: pointer;
        transition:
          border-color 0.16s ease,
          background 0.16s ease,
          transform 0.16s ease,
          box-shadow 0.16s ease;
      }

      .print-options-modal__choice--list {
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
      }

      .print-options-modal__choice-copy {
        display: grid;
        gap: 2px;
        min-width: 0;
      }

      .print-options-modal__choice-indicator {
        font-size: 0.72rem;
        font-weight: 700;
        color: var(--nxt1-color-text-tertiary, #64748b);
        white-space: nowrap;
      }

      .print-options-modal__choice:hover {
        border-color: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.14));
        transform: translateY(-1px);
      }

      .print-options-modal__choice--active {
        border-color: var(--nxt1-color-primary, #ccff00);
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        box-shadow: 0 0 0 1px var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.18));
      }

      .print-options-modal__choice--active .print-options-modal__choice-indicator {
        color: var(--nxt1-color-primary, #ccff00);
      }

      .print-options-modal__choice strong {
        font-size: 0.84rem;
        color: var(--nxt1-color-text-primary, #f1f5f9);
      }

      .print-options-modal__choice span,
      .print-options-modal__toggle small,
      .print-options-modal__field span {
        font-size: 0.74rem;
        line-height: 1.35;
        color: var(--nxt1-color-text-secondary, #94a3b8);
      }

      .print-options-modal__stack {
        display: grid;
        gap: 12px;
      }

      .print-options-modal__toggle {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 12px;
        align-items: start;
        padding: 12px 14px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: 12px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
      }

      .print-options-modal__toggle input {
        margin-top: 2px;
        accent-color: var(--nxt1-color-primary, #ccff00);
      }

      .print-options-modal__toggle span {
        display: grid;
        gap: 4px;
      }

      .print-options-modal__toggle strong {
        font-size: 0.84rem;
        color: var(--nxt1-color-text-primary, #f1f5f9);
      }

      .print-options-modal__field {
        display: grid;
        gap: 8px;
      }

      .print-options-modal__select {
        width: 100%;
        min-height: 42px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: 10px;
        padding: 0 12px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-primary, #f1f5f9);
        font: inherit;
      }

      .print-options-modal__footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 16px 20px 20px;
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .print-options-modal__primary-btn,
      .print-options-modal__secondary-btn {
        min-height: 40px;
        border-radius: 10px;
        padding: 0 16px;
        font: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease,
          opacity 0.15s ease,
          background 0.15s ease,
          border-color 0.15s ease;
      }

      .print-options-modal__primary-btn {
        border: 1px solid transparent;
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-on-primary, #000);
        box-shadow: 0 10px 24px -14px var(--nxt1-color-alpha-primary30, rgba(204, 255, 0, 0.24));
      }

      .print-options-modal__secondary-btn {
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-primary, #f1f5f9);
      }

      .print-options-modal__primary-btn:not(:disabled):hover,
      .print-options-modal__secondary-btn:hover {
        transform: translateY(-1px);
      }

      .print-options-modal__primary-btn:not(:disabled):hover {
        box-shadow: 0 16px 30px -18px var(--nxt1-color-alpha-primary30, rgba(204, 255, 0, 0.24));
      }

      .print-options-modal__secondary-btn:hover {
        border-color: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.14));
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
      }

      .print-options-modal__primary-btn:focus-visible,
      .print-options-modal__secondary-btn:focus-visible,
      .print-options-modal__choice:focus-visible,
      .print-options-modal__select:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.18));
      }

      .print-options-modal__primary-btn:disabled {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        border-color: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        color: var(--nxt1-color-text-tertiary, #64748b);
        box-shadow: none;
        opacity: 1;
        cursor: not-allowed;
      }

      @media (max-width: 760px) {
        .print-options-modal__footer {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
      }
    `,
  ],
})
export class AgentXPlaybookPrintOptionsModalComponent {
  readonly close = output<AgentXPlaybookPrintSelection | null>();

  protected readonly testIds = TEST_IDS.PLAYBOOK as PlaybookPrintModalTestIds;

  protected readonly scope = signal<AgentXPlaybookPrintScope>('current');
  protected readonly targetTab = signal<AgentXPlaybookPrintTargetTab>('plays');
  protected readonly useFilteredPlays = signal(false);
  protected readonly useGeneratedCallsheetBoard = signal(false);
  protected readonly callsheetId = signal<string | null>(null);
  protected readonly practiceScriptId = signal<string | null>(null);

  @Input() playbookTitle = 'Playbook';
  @Input() sport = '';
  @Input() practiceScriptsOnly = false;
  @Input() hasActivePlayFilters = false;
  @Input() filteredPlayCount = 0;
  @Input() totalPlayCount = 0;
  @Input() callsheets: readonly CallsheetSummary[] = [];
  @Input() practiceScripts: readonly PracticeScriptSummary[] = [];

  @Input()
  set initialSelection(value: AgentXPlaybookPrintSelection | null) {
    if (!value) return;
    this.scope.set(value.scope);
    this.targetTab.set(value.targetTab);
    this.useFilteredPlays.set(value.useFilteredPlays);
    this.useGeneratedCallsheetBoard.set(value.useGeneratedCallsheetBoard);
    this.callsheetId.set(value.callsheetId ?? null);
    this.practiceScriptId.set(value.practiceScriptId ?? null);
  }

  protected readonly availablePrintOptions = computed<readonly AgentXPlaybookPrintOption[]>(() => {
    if (this.practiceScriptsOnly) {
      return [
        {
          value: 'full',
          label: 'Full Packet',
          description: 'Print the practice script packet with all available supporting sections.',
          testId: this.testIds.PLAYBOOK_PRINT_MODE_FULL_BUTTON,
        },
        {
          value: 'play-script' as const,
          label: 'Practice Script',
          description: 'Print a coach-ready script matrix with periods, reps, and teaching points.',
          testId: this.testIds.PLAYBOOK_PRINT_TARGET_PRACTICE_SCRIPT_BUTTON,
        },
      ];
    }

    return [
      {
        value: 'full',
        label: 'Full Packet',
        description:
          'Print the full staff packet with plays plus any selected callsheet and practice script.',
        testId: this.testIds.PLAYBOOK_PRINT_MODE_FULL_BUTTON,
      },
      {
        value: 'plays' as const,
        label: 'Play Cards',
        description: 'Print the install-ready play card stack for staff and position rooms.',
        testId: this.testIds.PLAYBOOK_PRINT_TARGET_PLAYS_BUTTON,
      },
      {
        value: 'install' as const,
        label: 'Install Board',
        description: 'Print the staged install summary grouped by install, rep, and game-ready.',
        testId: this.testIds.PLAYBOOK_PRINT_TARGET_INSTALL_BUTTON,
      },
      {
        value: 'callsheet' as const,
        label: 'Callsheet',
        description: 'Print a saved callsheet or a generated board from your active filters.',
        testId: this.testIds.PLAYBOOK_PRINT_TARGET_CALLSHEET_BUTTON,
      },
      {
        value: 'play-script' as const,
        label: 'Practice Script',
        description: 'Print a coach-ready script matrix with periods, reps, and teaching points.',
        testId: this.testIds.PLAYBOOK_PRINT_TARGET_PRACTICE_SCRIPT_BUTTON,
      },
    ];
  });

  protected readonly canConfirm = computed(() => {
    if (this.scope() === 'full') return true;
    if (this.targetTab() === 'callsheet') {
      return this.useGeneratedCallsheetBoard() || !!this.callsheetId();
    }
    if (this.targetTab() === 'play-script') {
      return !!this.practiceScriptId();
    }
    return true;
  });

  protected readonly confirmLabel = computed(() =>
    this.scope() === 'full' ? 'Print Packet' : 'Print Selection'
  );

  protected readonly summaryTitle = computed(() => {
    if (this.scope() === 'full') {
      return `Full ${this.playbookTitle} packet`;
    }

    switch (this.targetTab()) {
      case 'install':
        return `Install board for ${this.playbookTitle}`;
      case 'callsheet':
        return this.useGeneratedCallsheetBoard()
          ? `Generated callsheet board for ${this.playbookTitle}`
          : `Callsheet printout for ${this.playbookTitle}`;
      case 'play-script':
        return `Practice script printout for ${this.playbookTitle}`;
      case 'plays':
      default:
        return `Play card packet for ${this.playbookTitle}`;
    }
  });

  protected readonly summaryDescription = computed(() => {
    const sportLabel = this.sport.trim().length > 0 ? `${this.sport} ` : '';

    if (this.scope() === 'full') {
      const includes = [
        `${this.useFilteredPlays() ? this.filteredPlayCount : this.totalPlayCount} ${sportLabel}plays`,
      ];
      if (this.useGeneratedCallsheetBoard()) {
        includes.push('generated callsheet board');
      } else if (this.callsheetId()) {
        includes.push('saved callsheet');
      }
      if (this.practiceScriptId()) {
        includes.push('practice script');
      }
      return `This packet will include ${includes.join(', ')} in one professional staff-ready printout.`;
    }

    if (this.targetTab() === 'callsheet') {
      return this.useGeneratedCallsheetBoard()
        ? 'This will print a callsheet board using the active callsheet filters and current AI rankings.'
        : 'This will print the selected saved callsheet in a coach-sheet board layout.';
    }

    if (this.targetTab() === 'play-script') {
      return 'This will print the selected practice script with period order, reps, play calls, and coaching points.';
    }

    if (this.targetTab() === 'install') {
      return `This will print the install progression for ${this.useFilteredPlays() ? this.filteredPlayCount : this.totalPlayCount} plays.`;
    }

    return `This will print ${this.useFilteredPlays() ? this.filteredPlayCount : this.totalPlayCount} play cards for staff review.`;
  });

  protected showFilteredPlaysOption(): boolean {
    if (!this.hasActivePlayFilters) return false;
    if (this.scope() === 'full') return true;
    return this.targetTab() === 'plays' || this.targetTab() === 'install';
  }

  protected showCallsheetOptions(): boolean {
    if (this.scope() === 'full') {
      return this.callsheets.length > 0 || this.hasActivePlayFilters;
    }
    return this.targetTab() === 'callsheet';
  }

  protected showPracticeScriptOptions(): boolean {
    if (this.scope() === 'full') {
      return this.practiceScripts.length > 0;
    }
    return this.targetTab() === 'play-script';
  }

  protected isPrintOptionSelected(value: AgentXPlaybookPrintOptionValue): boolean {
    return value === 'full'
      ? this.scope() === 'full'
      : this.scope() === 'current' && this.targetTab() === value;
  }

  protected selectPrintOption(value: AgentXPlaybookPrintOptionValue): void {
    if (value === 'full') {
      this.scope.set('full');
      return;
    }

    this.scope.set('current');
    this.targetTab.set(value);
  }

  protected onUseFilteredPlaysChange(value: unknown): void {
    this.useFilteredPlays.set(Boolean(value));
  }

  protected onUseGeneratedCallsheetBoardChange(value: unknown): void {
    const nextValue = Boolean(value);
    this.useGeneratedCallsheetBoard.set(nextValue);
    if (nextValue) {
      this.callsheetId.set(null);
    }
  }

  protected onCallsheetIdChange(value: string | null): void {
    this.callsheetId.set(value);
  }

  protected onPracticeScriptIdChange(value: string | null): void {
    this.practiceScriptId.set(value);
  }

  protected confirm(): void {
    if (!this.canConfirm()) return;

    this.close.emit({
      scope: this.scope(),
      targetTab: this.practiceScriptsOnly ? 'play-script' : this.targetTab(),
      useFilteredPlays: this.showFilteredPlaysOption() ? this.useFilteredPlays() : false,
      useGeneratedCallsheetBoard: this.showCallsheetOptions()
        ? this.useGeneratedCallsheetBoard()
        : false,
      callsheetId:
        this.showCallsheetOptions() && !this.useGeneratedCallsheetBoard()
          ? this.callsheetId()
          : null,
      practiceScriptId: this.showPracticeScriptOptions() ? this.practiceScriptId() : null,
    });
  }
}
