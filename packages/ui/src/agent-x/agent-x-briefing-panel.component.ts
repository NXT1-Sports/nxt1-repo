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
import {
  IonContent,
  IonLabel,
  IonRange,
  IonToggle,
  ModalController,
} from '@ionic/angular/standalone';
import { NxtIconComponent } from '../components/icon';
import { NxtFormFieldComponent } from '../components/form-field';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';
import { NxtSheetFooterComponent } from '../components/bottom-sheet/sheet-footer.component';
import { NxtModalFooterComponent } from '../components/overlay/modal-footer.component';
import { NxtToastService } from '../services/toast/toast.service';
import {
  AGENT_X_GOAL_OPTIONS,
  AGENT_X_STATUS_DEFINITIONS,
  AgentXBriefingBadgeStateService,
  type AgentXBriefingPanelKind,
  type AgentXBriefingPresentation,
} from './agent-x-briefing-badge-state.service';

interface AgentXBriefingPanelCloseResult {
  readonly panel: AgentXBriefingPanelKind;
  readonly saved?: boolean;
}

@Component({
  selector: 'nxt1-agent-x-briefing-panel',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonLabel,
    IonRange,
    NxtIconComponent,
    NxtFormFieldComponent,
    NxtSheetHeaderComponent,
    NxtSheetFooterComponent,
    NxtModalFooterComponent,
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

      <ion-content class="panel-content">
        <div class="panel-body">
          <p class="panel-intro">{{ subtitle() }}</p>

          @if (panel === 'status') {
            <div
              class="status-hero"
              [class.status-hero--warning]="statusTone() === 'warning'"
              [class.status-hero--critical]="statusTone() === 'critical'"
            >
              <div
                class="status-hero-dot"
                [class.status-hero-dot--warning]="statusTone() === 'warning'"
                [class.status-hero-dot--critical]="statusTone() === 'critical'"
              ></div>
              <div>
                <div class="status-hero-label">{{ currentStatus().label }}</div>
                <p class="status-hero-copy">{{ currentStatus().summary }}</p>
              </div>
            </div>

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
                  <p class="status-card-summary">{{ status.summary }}</p>
                  <p class="status-card-detail">{{ status.detail }}</p>
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
              <div class="goals-hero">
                <span class="goals-count">{{ draftGoals().length }}/3 goals selected</span>
                <p class="goals-copy">
                  Pick the top three outcomes you want Agent X optimizing for right now.
                </p>
              </div>

              <div class="selected-goals">
                @for (goal of selectedGoalLabels(); track goal.id) {
                  <div class="selected-goal-pill">
                    <span>{{ goal.label }}</span>
                    <button type="button" (click)="toggleGoal(goal.id)" aria-label="Remove goal">
                      <nxt1-icon name="close" [size]="14" />
                    </button>
                  </div>
                }
                @if (draftGoals().length === 0) {
                  <div class="selected-goals-empty">Choose up to three focus areas below.</div>
                }
              </div>

              <div class="custom-goal-row">
                <input
                  class="nxt1-input custom-goal-input"
                  type="text"
                  placeholder="Type a custom goal…"
                  [attr.maxlength]="100"
                  [value]="customGoalText()"
                  [disabled]="draftGoals().length >= 3"
                  (input)="onCustomGoalInput($event)"
                  (keyup.enter)="addCustomGoal()"
                />
                <button
                  type="button"
                  class="custom-goal-add-btn"
                  [disabled]="!customGoalText().trim() || draftGoals().length >= 3"
                  (click)="addCustomGoal()"
                >
                  <nxt1-icon name="send" [size]="18" />
                </button>
              </div>

              <div class="goal-grid">
                @for (goal of goalOptions; track goal.id) {
                  <button
                    type="button"
                    class="goal-option"
                    [class.goal-option--selected]="isGoalSelected(goal.id)"
                    [disabled]="!isGoalSelected(goal.id) && draftGoals().length >= 3"
                    (click)="toggleGoal(goal.id)"
                  >
                    <div class="goal-option-top">
                      <span class="goal-option-title">{{ goal.label }}</span>
                      @if (isGoalSelected(goal.id)) {
                        <nxt1-icon name="checkmarkCircle" [size]="18" />
                      }
                    </div>
                    <p class="goal-option-copy">{{ goal.description }}</p>
                  </button>
                }
              </div>
            </section>
          }
        </div>
      </ion-content>

      @if (presentation === 'modal') {
        <div class="modal-footer-sticky">
          @if (panel === 'status') {
            <nxt1-modal-footer label="Close" variant="secondary" (action)="dismiss()" />
          } @else {
            <nxt1-modal-footer
              [label]="panel === 'budget' ? 'Save budget' : 'Save goals'"
              [disabled]="panel === 'goals' && draftGoals().length === 0"
              (action)="savePanel()"
            />
          }
        </div>
      } @else if (panel === 'status') {
        <nxt1-sheet-footer label="Close" (action)="dismiss()" />
      } @else {
        <nxt1-sheet-footer
          [label]="panel === 'budget' ? 'Save budget' : 'Save goals'"
          [disabled]="panel === 'goals' && draftGoals().length === 0"
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
        overflow: visible;
        flex: none;
        min-height: unset;
      }

      .modal-footer-sticky {
        position: sticky;
        bottom: 0;
        z-index: 10;
        background: var(--nxt1-color-bg-primary);
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
      .status-card-detail,
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
        color: var(--nxt1-color-on-primary);
      }

      .status-card-summary,
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
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .selected-goal-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 9999px;
        background: var(--nxt1-color-alpha-primary10);
        border: 1px solid var(--nxt1-color-alpha-primary20);
      }

      .selected-goal-pill button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        background: transparent;
        color: inherit;
        padding: 0;
        cursor: pointer;
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

      .custom-goal-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 16px;
      }

      .custom-goal-input {
        flex: 1;
        min-width: 0;
        border-radius: 14px;
        font-size: 15px;
      }

      .custom-goal-add-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: none;
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-on-surface, #000);
        cursor: pointer;
        flex-shrink: 0;
        transition:
          background 0.18s ease,
          color 0.18s ease;
      }

      .custom-goal-add-btn:disabled {
        background: var(--ion-color-step-150, #e0e0e0);
        color: var(--ion-color-step-400, #999);
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
export class AgentXBriefingPanelComponent implements OnInit {
  private readonly modalController = inject(ModalController);
  private readonly toast = inject(NxtToastService);
  private readonly state = inject(AgentXBriefingBadgeStateService);

  readonly close = output<AgentXBriefingPanelCloseResult>();

  @Input() panel: AgentXBriefingPanelKind = 'status';
  @Input() presentation: AgentXBriefingPresentation = 'modal';
  @Input() required = false;

  readonly title = computed(() => {
    switch (this.panel) {
      case 'status':
        return 'Agent status';
      case 'budget':
        return 'Agent budget';
      case 'goals':
        return 'Manage agent goals';
    }
  });

  readonly subtitle = computed(() => {
    switch (this.panel) {
      case 'status':
        return 'See what Active means, and how degraded or down states should appear across the command center.';
      case 'budget':
        return 'Tune the budget ceiling, set an exact amount, and decide if Agent X should auto top-off.';
      case 'goals':
        return this.required
          ? 'Pick at least one goal so Agent X knows what to work on for you.'
          : 'Choose up to three priorities so Agent X knows what to optimize for first.';
    }
  });

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
    this.draftBudget.set(this.state.monthlyBudget());
    this.draftAutoTopOffEnabled.set(this.state.autoTopOffEnabled());
    this.draftAutoTopOffAmount.set(this.state.autoTopOffAmount());
    this.draftGoals.set([...this.state.goals()]);
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

  addCustomGoal(): void {
    const text = this.customGoalText().trim();
    if (!text || this.draftGoals().length >= 3) return;
    const id = `custom:${text}`;
    if (this.draftGoals().includes(id)) return;
    this.draftGoals.update((current) => [...current, id]);
    this.customGoalText.set('');
  }

  savePanel(): void {
    if (this.panel === 'budget') {
      this.state.saveBudget({
        monthlyBudget: this.draftBudget(),
        autoTopOffEnabled: this.draftAutoTopOffEnabled(),
        autoTopOffAmount: this.draftAutoTopOffAmount(),
      });
      this.toast.success('Agent X budget updated.');
      this.dismiss({ panel: 'budget', saved: true });
      return;
    }

    if (this.panel === 'goals') {
      this.state.saveGoals(this.draftGoals());
      this.toast.success('Agent goals saved.');
      this.dismiss({ panel: 'goals', saved: true });
    }
  }

  dismiss(result: AgentXBriefingPanelCloseResult = { panel: this.panel }): void {
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
