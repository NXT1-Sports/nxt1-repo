import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonLabel, IonRange, ModalController } from '@ionic/angular/standalone';
import { NxtFormFieldComponent } from '../components/form-field';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';
import { NxtSheetFooterComponent } from '../components/bottom-sheet/sheet-footer.component';
import { NxtModalFooterComponent } from '../components/overlay/modal-footer.component';
import { NxtToastService } from '../services/toast/toast.service';
import { UsageService } from '../usage/usage.service';
import { TEST_IDS } from '@nxt1/core/testing';
import {
  AGENT_X_GOAL_OPTIONS,
  AGENT_X_STATUS_DEFINITIONS,
  AgentXControlPanelStateService,
  type AgentXControlPanelKind,
  type AgentXControlPanelPresentation,
} from './agent-x-control-panel-state.service';
import { AgentXService } from './agent-x.service';
import type { AgentDashboardGoal } from '@nxt1/core';
import { AgentXGoalHistoryComponent } from './agent-x-goal-history.component';

interface AgentXControlPanelCloseResult {
  readonly panel: AgentXControlPanelKind;
  readonly saved?: boolean;
}

@Component({
  selector: 'nxt1-agent-x-control-panel',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonLabel,
    IonRange,
    NxtFormFieldComponent,
    NxtSheetHeaderComponent,
    NxtSheetFooterComponent,
    NxtModalFooterComponent,
    AgentXGoalHistoryComponent,
  ],
  host: {
    '[class.modal-presentation]': 'presentation === "modal"',
  },
  template: `
    <div
      class="panel-shell"
      [class.panel-shell--modal]="presentation === 'modal'"
      [attr.data-panel-kind]="panel"
    >
      <nxt1-sheet-header
        [title]="title()"
        closePosition="right"
        [showBorder]="true"
        [showClose]="true"
        (closeSheet)="dismiss()"
      />

      @if (presentation === 'modal') {
        <div class="panel-content panel-content--web">
          <ng-container *ngTemplateOutlet="panelBody" />
        </div>
      } @else {
        <ion-content class="panel-content">
          <ng-container *ngTemplateOutlet="panelBody" />
        </ion-content>
      }

      <ng-template #panelBody>
        <div class="panel-body">
          <p class="panel-intro">{{ subtitle() }}</p>

          @if (panel === 'status') {
            <div class="status-grid">
              @for (status of statusDefinitions; track status.id) {
                <article
                  class="status-card"
                  [class.status-card--active]="status.id === currentStatus().id"
                  [class.status-card--warning]="status.tone === 'warning'"
                  [class.status-card--critical]="status.tone === 'critical'"
                >
                  <div class="status-card-top">
                    <span
                      class="status-chip"
                      [class.status-chip--warning]="status.tone === 'warning'"
                      [class.status-chip--critical]="status.tone === 'critical'"
                    >
                      {{ status.label }}
                    </span>
                    @if (status.id === currentStatus().id) {
                      <span class="status-current">Current</span>
                    }
                  </div>
                </article>
              }
            </div>
          }

          @if (panel === 'budget') {
            <section class="budget-shell">
              <div class="budget-hero">
                <span class="budget-label">Monthly agent budget</span>
                <strong class="budget-value">&#36;{{ draftBudget() }}</strong>
                <p class="budget-copy">Set your monthly Agent X budget</p>
              </div>

              <div class="budget-grid">
                <section class="control-card">
                  <label class="field-label" for="agent-x-budget-slider">Budget range</label>
                  <ion-range
                    id="agent-x-budget-slider"
                    class="budget-range"
                    [min]="25"
                    [max]="2500"
                    [step]="25"
                    [snaps]="true"
                    [pin]="true"
                    [value]="draftBudget()"
                    (ionChange)="onBudgetSliderInput($event)"
                  >
                    <ion-label slot="start">$25</ion-label>
                    <ion-label slot="end">$2,500</ion-label>
                  </ion-range>
                </section>

                <section class="control-card">
                  <nxt1-form-field label="Custom budget" inputId="agent-x-budget-input">
                    <input
                      id="agent-x-budget-input"
                      class="nxt1-input"
                      type="number"
                      inputmode="numeric"
                      [value]="draftBudget()"
                      (input)="onBudgetCustomInput($event)"
                    />
                  </nxt1-form-field>
                </section>

                <section class="control-card control-card--toggle">
                  <div class="toggle-copy-block">
                    <div class="toggle-title">Auto top-off</div>
                    <p class="toggle-copy">
                      Refill your Agent X budget automatically when it gets close to empty.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    class="nxt1-toggle-switch"
                    [class.nxt1-toggle-switch--on]="draftAutoTopOffEnabled()"
                    [attr.aria-checked]="draftAutoTopOffEnabled()"
                    (click)="onAutoTopOffClick()"
                  >
                    <span class="nxt1-toggle-switch__thumb"></span>
                  </button>
                </section>

                @if (draftAutoTopOffEnabled()) {
                  <section class="control-card">
                    <nxt1-form-field label="Auto top-off amount" inputId="agent-x-topoff-input">
                      <input
                        id="agent-x-topoff-input"
                        class="nxt1-input"
                        type="number"
                        inputmode="numeric"
                        [value]="draftAutoTopOffAmount()"
                        (input)="onTopOffInput($event)"
                      />
                    </nxt1-form-field>
                  </section>
                }
              </div>
            </section>
          }

          @if (panel === 'goals') {
            <section class="goals-shell">
              <p class="goals-subtitle">Add up to 3 goals for Agent X to optimize around.</p>

              <div class="goals-input-row">
                <input
                  class="goals-input"
                  type="text"
                  placeholder="Type a goal"
                  [attr.maxlength]="100"
                  [value]="customGoalText()"
                  [disabled]="draftGoals().length >= 3"
                  (input)="onCustomGoalInput($event)"
                  (keyup.enter)="addCustomGoal()"
                />
                <button
                  type="button"
                  class="goals-add-btn"
                  [disabled]="!customGoalText().trim() || draftGoals().length >= 3"
                  (click)="addCustomGoal()"
                >
                  Add
                </button>
              </div>

              @if (selectedGoalLabels().length > 0) {
                <div class="goals-pills" [attr.data-testid]="testIds.ACTIVE_LIST">
                  @for (goal of selectedGoalLabels(); track goal.id) {
                    <div class="goals-pill" [attr.data-testid]="testIds.ACTIVE_ITEM">
                      <svg
                        class="goals-pill-check"
                        viewBox="0 0 24 24"
                        width="13"
                        height="13"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span class="goals-pill-text">{{ goal.label }}</span>
                      <button
                        type="button"
                        class="goals-pill-complete"
                        [attr.data-testid]="testIds.COMPLETE_BTN"
                        aria-label="Mark goal as complete"
                        title="Mark as done"
                        (click)="completeGoalFromPanel(goal.id)"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="12"
                          height="12"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        class="goals-pill-remove"
                        aria-label="Remove goal"
                        (click)="toggleGoal(goal.id)"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="11"
                          height="11"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  }
                </div>
              }

              <div class="goals-footer">
                <span class="goals-counter">{{ draftGoals().length }}/3 selected</span>
                <button type="button" class="goals-save-btn" (click)="savePanel()">
                  Save Goals
                </button>
              </div>

              @defer (on interaction) {
                <nxt1-agent-x-goal-history />
              } @placeholder {
                <button type="button" class="goals-history-trigger">View completed goals</button>
              }
            </section>
          }
        </div>
      </ng-template>

      @if (presentation === 'modal') {
        <div class="modal-footer-sticky">
          @if (panel === 'status' || panel === 'goals') {
            <nxt1-modal-footer label="Close" variant="secondary" (action)="dismiss()" />
          } @else {
            <nxt1-modal-footer
              label="Save budget"
              [loadingLabel]="'Saving...'"
              [loading]="saving()"
              [disabled]="saving()"
              (action)="savePanel()"
            />
          }
        </div>
      } @else if (panel === 'status' || panel === 'goals') {
        <nxt1-sheet-footer label="Close" (action)="dismiss()" />
      } @else {
        <nxt1-sheet-footer
          label="Save budget"
          [loadingLabel]="'Saving...'"
          [loading]="saving()"
          [disabled]="saving()"
          (action)="savePanel()"
        />
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        overflow: hidden;
        color: var(--nxt1-color-text-primary);
      }

      /* Modal mode: let overlay handle scrolling, footer sticky */
      :host(.modal-presentation) {
        display: block;
        height: auto;
        overflow: visible;
      }

      .panel-shell {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        background: var(--nxt1-color-bg-primary);
      }

      .panel-shell--modal {
        display: block;
        overflow: visible;
      }

      .panel-content {
        flex: 1;
        min-height: 0;
      }

      .panel-shell--modal .panel-content {
        overflow-y: auto;
        flex: none;
        min-height: unset;
      }

      .modal-footer-sticky {
        position: sticky;
        bottom: 0;
        z-index: 10;
        background: var(--nxt1-color-bg-primary);
        --nxt1-color-text-onPrimary: #000;
      }

      nxt1-sheet-footer {
        --nxt1-color-text-onPrimary: #000;
      }

      .panel-body {
        display: flex;
        flex-direction: column;
        gap: 18px;
        width: 100%;
        max-width: 560px;
        margin: 0 auto;
        padding: var(--nxt1-spacing-5, 20px);
        padding-bottom: var(--nxt1-spacing-6, 24px);
      }

      .panel-intro {
        margin: 0;
        font-size: 14px;
        line-height: 1.55;
        color: var(--nxt1-color-text-secondary);
      }

      .status-hero,
      .budget-hero,
      .goals-hero {
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: 20px;
        padding: 18px;
        background: var(--nxt1-color-surface-100);
      }

      .status-hero {
        display: flex;
        align-items: flex-start;
        gap: 14px;
        background: var(--nxt1-color-successBg);
        border-color: var(--nxt1-color-success);
      }

      .status-hero--warning {
        background: var(--nxt1-color-warningBg);
        border-color: var(--nxt1-color-warning);
      }

      .status-hero--critical {
        background: var(--nxt1-color-errorBg);
        border-color: var(--nxt1-color-error);
      }

      .status-hero-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-top: 4px;
        flex-shrink: 0;
        background: var(--nxt1-color-success);
        box-shadow: 0 0 0 6px var(--nxt1-color-successBg);
      }

      .status-hero-dot--warning {
        background: var(--nxt1-color-warning);
        box-shadow: 0 0 0 6px var(--nxt1-color-warningBg);
      }

      .status-hero-dot--critical {
        background: var(--nxt1-color-error);
        box-shadow: 0 0 0 6px var(--nxt1-color-errorBg);
      }

      .status-hero-label,
      .budget-label,
      .goals-count,
      .toggle-title,
      .field-label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
      }

      .status-hero-copy,
      .budget-copy,
      .goals-copy,
      .toggle-copy,
      .goal-option-copy,
      .selected-goals-empty {
        margin: 8px 0 0;
        font-size: 14px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary);
      }

      .status-grid,
      .budget-grid,
      .goal-grid {
        display: grid;
        gap: 12px;
      }

      .status-card,
      .goal-option {
        width: 100%;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: 18px;
        padding: 16px;
        background: var(--nxt1-color-surface-100);
        text-align: left;
      }

      .status-card--active {
        border-color: var(--nxt1-color-primary);
        box-shadow: inset 0 0 0 1px var(--nxt1-color-alpha-primary20);
      }

      .status-card--warning {
        border-color: var(--nxt1-color-warning);
      }

      .status-card--critical {
        border-color: var(--nxt1-color-error);
      }

      .status-card-top,
      .goal-option-top,
      .toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .status-chip,
      .status-current {
        display: inline-flex;
        align-items: center;
        border-radius: 9999px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 700;
      }

      .status-chip {
        background: var(--nxt1-color-successBg);
        color: var(--nxt1-color-success);
      }

      .status-chip--warning {
        background: var(--nxt1-color-warningBg);
        color: var(--nxt1-color-warning);
      }

      .status-chip--critical {
        background: var(--nxt1-color-errorBg);
        color: var(--nxt1-color-error);
      }

      .status-current {
        background: var(--nxt1-color-primary);
        color: #000;
      }

      .goal-option-title {
        margin: 12px 0 0;
        font-size: 16px;
        font-weight: 700;
        color: inherit;
      }

      .budget-value {
        display: block;
        margin-top: 12px;
        font-size: 42px;
        line-height: 1;
      }

      .budget-shell,
      .goals-shell {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .control-card {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: 18px;
        background: var(--nxt1-color-surface-100);
      }

      .control-card--toggle {
        flex-direction: row;
        align-items: flex-start;
        justify-content: space-between;
      }

      .toggle-copy-block {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }

      .budget-range {
        --bar-background: var(--nxt1-color-border-subtle);
        --bar-background-active: var(--nxt1-color-primary);
        --knob-background: var(--nxt1-color-primary);
        --pin-background: var(--nxt1-color-primary);
        --pin-color: var(--nxt1-color-on-primary);
      }

      /* Native toggle switch — matches settings-item ion-toggle style */
      .nxt1-toggle-switch {
        position: relative;
        display: inline-flex;
        align-items: center;
        width: 51px;
        height: 31px;
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.22);
        border: none;
        cursor: pointer;
        transition: background 0.2s ease;
        flex-shrink: 0;
        padding: 0;
      }

      .nxt1-toggle-switch--on {
        background: var(--nxt1-color-primary);
      }

      .nxt1-toggle-switch__thumb {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 27px;
        height: 27px;
        border-radius: 50%;
        background: #ffffff;
        transition:
          transform 0.2s ease,
          background 0.2s ease;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
      }

      .nxt1-toggle-switch--on .nxt1-toggle-switch__thumb {
        transform: translateX(20px);
        background: #1a1a1a;
      }

      .selected-goals {
        display: none;
      }

      .goals-subtitle {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary);
      }

      .goals-input-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .goals-input {
        flex: 1;
        min-width: 0;
        height: 40px;
        padding: 0 14px;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: 999px;
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        font-size: 14px;
        outline: none;
        transition: border-color 0.15s;
      }

      .goals-input:focus {
        border-color: var(--nxt1-color-primary);
      }

      .goals-input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .goals-add-btn {
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        border-radius: 999px;
        height: 40px;
        min-width: 64px;
        padding: 0 16px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        flex-shrink: 0;
        transition:
          border-color 0.15s,
          opacity 0.15s;
      }

      .goals-add-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .goals-add-btn:not(:disabled):hover {
        border-color: var(--nxt1-color-primary);
        color: var(--nxt1-color-primary);
      }

      .goals-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .goals-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 999px;
        background: var(--nxt1-color-alpha-primary10, rgba(59, 130, 246, 0.1));
        border: 1px solid var(--nxt1-color-primary, #3b82f6);
      }

      .goals-pill-check {
        flex-shrink: 0;
        color: var(--nxt1-color-primary);
      }

      .goals-pill-text {
        font-size: 13px;
        font-weight: 500;
        color: var(--nxt1-color-text-primary);
      }

      .goals-pill-remove {
        background: none;
        border: none;
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        padding: 2px;
        display: flex;
        border-radius: 999px;
        transition: color 0.15s;
      }

      .goals-pill-remove:hover {
        color: var(--nxt1-color-text-primary);
      }

      .goals-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .goals-counter {
        font-size: 12px;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
      }

      .goals-save-btn {
        border: none;
        background: var(--nxt1-color-primary);
        color: #000;
        border-radius: 999px;
        height: 36px;
        padding: 0 20px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.15s;
      }

      .goals-save-btn:hover {
        opacity: 0.9;
      }

      .goals-history-trigger {
        width: 100%;
        background: none;
        border: 1px dashed var(--nxt1-color-border-subtle);
        border-radius: 12px;
        padding: 12px;
        font-size: 13px;
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        text-align: center;
        transition:
          border-color 0.15s,
          color 0.15s;
      }

      .goals-history-trigger:hover {
        border-color: var(--nxt1-color-primary);
        color: var(--nxt1-color-primary);
      }

      .goals-pill-complete {
        background: none;
        border: none;
        color: var(--nxt1-color-success, #22c55e);
        cursor: pointer;
        padding: 2px;
        display: flex;
        border-radius: 999px;
        transition:
          color 0.15s,
          transform 0.15s;
        flex-shrink: 0;
      }

      .goals-pill-complete:hover {
        transform: scale(1.15);
        color: var(--nxt1-color-success, #22c55e);
      }

      .goal-option {
        cursor: pointer;
        transition:
          border-color 0.18s ease,
          transform 0.18s ease;
      }

      .goal-option--selected {
        border-color: var(--nxt1-color-primary);
        transform: translateY(-1px);
      }

      .goal-option:disabled {
        opacity: 0.48;
        cursor: not-allowed;
      }

      @media (min-width: 900px) {
        .panel-shell--modal[data-panel-kind='budget'] .panel-body {
          max-width: 760px;
        }

        .panel-shell--modal[data-panel-kind='budget'] .budget-shell {
          gap: 20px;
        }

        .panel-shell--modal[data-panel-kind='budget'] .budget-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          align-items: start;
        }

        .panel-shell--modal[data-panel-kind='budget'] .budget-copy {
          max-width: 44ch;
        }
      }

      @media (max-width: 640px) {
        .budget-value {
          font-size: 36px;
        }

        .panel-body {
          padding-left: 18px;
          padding-right: 18px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXControlPanelComponent implements OnInit {
  private readonly modalController = inject(ModalController);
  private readonly toast = inject(NxtToastService);
  private readonly state = inject(AgentXControlPanelStateService);
  private readonly usageService = inject(UsageService);
  private readonly agentX = inject(AgentXService);

  protected readonly testIds = TEST_IDS.AGENT_X_GOALS;

  readonly close = output<AgentXControlPanelCloseResult>();

  @Input() panel: AgentXControlPanelKind = 'status';
  @Input() presentation: AgentXControlPanelPresentation = 'modal';
  @Input() required = false;
  @Input() initialGoals: string[] = [];

  readonly title = computed(() => {
    switch (this.panel) {
      case 'status':
        return 'Agent X status';
      case 'budget':
        return 'Agent budget';
      case 'goals':
        return 'Manage agent goals';
    }
  });

  readonly subtitle = computed(() => {
    switch (this.panel) {
      case 'status':
        return 'Active means Agent X is running normally, Degraded means some actions may be slower, and Down means Agent X is temporarily unavailable.';
      case 'budget':
        return 'Tune the budget ceiling, set an exact amount, and decide if Agent X should auto top-off.';
      case 'goals':
        return this.required
          ? 'Pick at least one goal so Agent X knows what to work on for you.'
          : 'Choose up to three priorities so Agent X knows what to optimize for first.';
    }
  });

  readonly saving = signal(false);
  readonly draftBudget = signal(150);
  readonly draftAutoTopOffEnabled = signal(true);
  readonly draftAutoTopOffAmount = signal(50);
  readonly draftGoals = signal<string[]>([]);
  readonly customGoalText = signal('');
  readonly currentStatus = this.state.statusDefinition;
  readonly statusTone = this.state.statusTone;
  readonly selectedGoalLabels = computed(() => {
    return this.draftGoals().map((id) => {
      if (id.startsWith('custom:')) {
        return { id, label: id.slice(7) };
      }
      const option = AGENT_X_GOAL_OPTIONS.find((g) => g.id === id);
      return { id, label: option?.label ?? id };
    });
  });

  readonly statusDefinitions = AGENT_X_STATUS_DEFINITIONS;
  readonly goalOptions = AGENT_X_GOAL_OPTIONS;

  ngOnInit(): void {
    // Hydrate budget from backend billing context (cents → dollars) if available,
    // otherwise fall back to local badge state
    const billingCtx = this.usageService.billingContext();
    const budgetDollars = billingCtx?.monthlyBudget
      ? Math.round(billingCtx.monthlyBudget / 100)
      : this.state.monthlyBudget();
    this.draftBudget.set(budgetDollars);
    this.draftAutoTopOffEnabled.set(this.state.autoTopOffEnabled());
    this.draftAutoTopOffAmount.set(this.state.autoTopOffAmount());

    // Prefer initialGoals input (passed directly from shell) over state service
    const goals = this.initialGoals.length > 0 ? this.initialGoals : this.state.goals();
    this.draftGoals.set([...goals]);
  }

  onBudgetSliderInput(
    event: CustomEvent<{ value: number | { lower: number; upper: number } | null }>
  ): void {
    const value = this.readNumberFromEvent(event);
    if (value !== null) {
      this.draftBudget.set(value);
    }
  }

  onBudgetCustomInput(event: Event | CustomEvent<{ value: string | number | null }>): void {
    const value = this.readNumberFromEvent(event);
    if (value !== null) {
      this.draftBudget.set(value);
    }
  }

  onTopOffInput(event: Event | CustomEvent<{ value: string | number | null }>): void {
    const value = this.readNumberFromEvent(event);
    if (value !== null) {
      this.draftAutoTopOffAmount.set(value);
    }
  }

  onAutoTopOffClick(): void {
    this.draftAutoTopOffEnabled.update((v) => !v);
  }

  toggleGoal(goalId: string): void {
    this.draftGoals.update((current) => {
      if (current.includes(goalId)) {
        return current.filter((entry) => entry !== goalId);
      }

      if (current.length >= 3) {
        return current;
      }

      return [...current, goalId];
    });
  }

  isGoalSelected(goalId: string): boolean {
    return this.draftGoals().includes(goalId);
  }

  onCustomGoalInput(event: Event | CustomEvent<{ value: string | number | null }>): void {
    if ('detail' in event && typeof event.detail === 'object' && event.detail !== null) {
      const val = 'value' in event.detail ? event.detail.value : null;
      this.customGoalText.set(String(val ?? ''));
      return;
    }
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.customGoalText.set(target.value);
    }
  }

  async completeGoalFromPanel(goalId: string): Promise<void> {
    await this.agentX.completeGoal(goalId);
    // Also remove from draft so the panel reflects the completion immediately
    this.draftGoals.update((gs) => gs.filter((id) => id !== goalId));
  }

  addCustomGoal(): void {
    const text = this.customGoalText().trim();
    if (!text || this.draftGoals().length >= 3) return;
    const id = `custom:${text}`;
    if (this.draftGoals().includes(id)) return;
    this.draftGoals.update((current) => [...current, id]);
    this.customGoalText.set('');
  }

  async savePanel(): Promise<void> {
    if (this.panel === 'budget') {
      this.saving.set(true);
      const budgetCents = Math.round(this.draftBudget() * 100);

      try {
        const success = await this.usageService.updateBudget(budgetCents);
        if (!success) {
          this.saving.set(false);
          return; // UsageService already showed error toast
        }

        // Only update badge state after backend confirms
        this.state.saveBudget({
          monthlyBudget: this.draftBudget(),
          autoTopOffEnabled: this.draftAutoTopOffEnabled(),
          autoTopOffAmount: this.draftAutoTopOffAmount(),
        });
        this.dismiss({ panel: 'budget', saved: true });
      } catch {
        // UsageService handles error toast/logging internally
      } finally {
        this.saving.set(false);
      }
      return;
    }

    if (this.panel === 'goals') {
      this.saving.set(true);
      try {
        const now = new Date().toISOString();
        const goals: AgentDashboardGoal[] = this.draftGoals().map((id) => {
          if (id.startsWith('custom:')) {
            const text = id.slice(7);
            return { id, text, category: 'custom', createdAt: now };
          }
          const option = AGENT_X_GOAL_OPTIONS.find((g) => g.id === id);
          return { id, text: option?.label ?? id, category: 'preset', createdAt: now };
        });
        const success = await this.agentX.setGoals(goals);
        if (success) {
          this.state.saveGoals(this.draftGoals());
          this.dismiss({ panel: 'goals', saved: true });
        }
      } finally {
        this.saving.set(false);
      }
    }
  }

  dismiss(result: AgentXControlPanelCloseResult = { panel: this.panel }): void {
    // In required mode without saving, dismiss with 'back' role so the shell can navigate back
    if (this.required && !result.saved) {
      if (this.presentation === 'sheet') {
        void this.modalController.dismiss(result, 'back');
      } else {
        this.close.emit(result);
      }
      return;
    }

    if (this.presentation === 'sheet') {
      void this.modalController.dismiss(result, result.saved ? 'save' : 'dismiss');
      return;
    }

    this.close.emit(result);
  }

  private readNumberFromEvent(
    event: Event | CustomEvent<{ value: string | number | null }>
  ): number | null {
    if ('detail' in event && typeof event.detail === 'object' && event.detail !== null) {
      const detailValue = 'value' in event.detail ? event.detail.value : null;
      const value = Number(detailValue);
      return Number.isFinite(value) ? value : null;
    }

    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return null;
    }

    const value = Number(target.value);
    return Number.isFinite(value) ? value : null;
  }
}
