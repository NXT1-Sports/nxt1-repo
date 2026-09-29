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
import { NxtFormFieldComponent } from '../../../components/form-field';
import { NxtSheetHeaderComponent } from '../../../components/bottom-sheet/sheet-header.component';
import { NxtSheetFooterComponent } from '../../../components/bottom-sheet/sheet-footer.component';
import { NxtModalFooterComponent } from '../../../components/overlay/modal-footer.component';
import { UsageService } from '../../../usage/usage.service';
import { HapticsService } from '../../../services/haptics/haptics.service';
import { TEST_IDS } from '@nxt1/core/testing';
import {
  AGENT_X_GOAL_OPTIONS,
  AGENT_X_STATUS_DEFINITIONS,
  AgentXControlPanelStateService,
  type AgentXBudgetDraftMode,
  type AgentXControlPanelKind,
  type AgentXControlPanelPresentation,
} from '../../services/agent-x-control-panel-state.service';
import { AgentXService } from '../../services/agent-x.service';
import { formatPrice, type AgentDashboardGoal, type BudgetInterval } from '@nxt1/core';
import type { ShellWeeklyPlaybookItem } from '@nxt1/core/ai';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';
import { AgentXGoalHistoryComponent } from '../shared/agent-x-goal-history.component';

export interface AgentXControlPanelCloseResult {
  readonly panel: AgentXControlPanelKind;
  readonly saved?: boolean;
  readonly actionTask?: ShellWeeklyPlaybookItem;
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
          @if (panel === 'status' || panel === 'budget') {
            <p class="panel-intro">{{ subtitle() }}</p>
          }

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
            @if (budgetContextReady()) {
              <section class="budget-shell">
                <div class="budget-hero">
                  <span class="budget-label">{{ selectedBudgetLabel() }}</span>
                  <strong class="budget-value">&#36;{{ draftBudget() }}</strong>
                  <p class="budget-copy">
                    {{ selectedBudgetIntervalLabel() }} budget for
                    {{
                      selectedBudgetTarget().type === 'team' ? 'this team' : 'the full organization'
                    }}
                  </p>
                </div>

                @if (canSelectTeamBudget()) {
                  <section class="control-card">
                    <span class="field-label">Budget scope</span>
                    <div class="budget-scope-grid">
                      <nxt1-form-field
                        label="Apply budget to"
                        inputId="agent-x-budget-scope-select"
                      >
                        <div class="budget-select-wrap">
                          <select
                            id="agent-x-budget-scope-select"
                            class="budget-select"
                            [value]="selectedBudgetScope()"
                            (change)="onBudgetScopeChange($event)"
                          >
                            <option value="organization">Organization</option>
                            <option value="team">Specific team</option>
                          </select>
                          <span class="budget-select-icon" aria-hidden="true">▾</span>
                        </div>
                      </nxt1-form-field>

                      @if (selectedBudgetScope() === 'team') {
                        <nxt1-form-field label="Team" inputId="agent-x-budget-team-select">
                          <div class="budget-select-wrap">
                            <select
                              id="agent-x-budget-team-select"
                              class="budget-select"
                              [value]="draftBudgetTargetId()"
                              (change)="onBudgetTargetSelect($event)"
                            >
                              @for (target of availableTeamBudgetTargets(); track target.id) {
                                <option [value]="target.id">{{ target.label }}</option>
                              }
                            </select>
                            <span class="budget-select-icon" aria-hidden="true">▾</span>
                          </div>
                        </nxt1-form-field>
                      }
                    </div>
                    <div class="budget-target-summary">
                      <span class="budget-target-summary__label">Selected target</span>
                      <strong class="budget-target-summary__title">{{
                        selectedBudgetLabel()
                      }}</strong>
                      <span class="budget-target-summary__copy">
                        {{ selectedBudgetTarget().detail }}
                      </span>
                    </div>
                    <p class="field-help">
                      Organization budgets cover the whole program. Team budgets let you cap a
                      single roster independently.
                    </p>
                  </section>
                }

                <section class="control-card">
                  <span class="field-label">Budget cadence</span>
                  <div class="budget-pill-group budget-pill-group--compact">
                    @for (option of budgetIntervalOptions; track option.id) {
                      <button
                        type="button"
                        class="budget-pill budget-pill--compact"
                        [class.budget-pill--active]="draftBudgetInterval() === option.id"
                        (click)="selectBudgetInterval(option.id)"
                      >
                        <span class="budget-pill-title">{{ option.label }}</span>
                      </button>
                    }
                  </div>
                  <p class="field-help">
                    Daily resets every day, weekly resets on Monday, and monthly resets on the first
                    of the month.
                  </p>
                </section>

                <section class="control-card control-card--toggle">
                  <div class="toggle-copy-block">
                    <span class="field-label">Hard stop</span>
                    @if (selectedBudgetTarget().type === 'organization') {
                      <strong class="toggle-title">
                        {{
                          draftHardStop()
                            ? 'Stop usage at the organization cap'
                            : 'Allow alerts only'
                        }}
                      </strong>
                      <p class="field-help">
                        When enabled, Agent X actions stop once the organization budget is reached.
                      </p>
                    } @else {
                      <strong class="toggle-title"
                        >Team limits already stop overages automatically</strong
                      >
                      <p class="field-help">
                        Team caps are always enforced. This toggle only applies to the master
                        organization budget.
                      </p>
                    }
                  </div>

                  @if (selectedBudgetTarget().type === 'organization') {
                    <button
                      type="button"
                      class="nxt1-toggle-switch"
                      [class.nxt1-toggle-switch--on]="draftHardStop()"
                      [attr.aria-pressed]="draftHardStop()"
                      [attr.aria-label]="draftHardStop() ? 'Disable hard stop' : 'Enable hard stop'"
                      (click)="toggleHardStop()"
                    >
                      <span class="nxt1-toggle-switch__thumb"></span>
                    </button>
                  }
                </section>

                <div class="budget-grid">
                  <section class="control-card">
                    <label class="field-label" for="agent-x-budget-slider">Budget range</label>
                    <ion-range
                      id="agent-x-budget-slider"
                      class="budget-range"
                      [min]="0"
                      [max]="10000"
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
                    <nxt1-form-field label="Budget amount" inputId="agent-x-budget-input">
                      <input
                        id="agent-x-budget-input"
                        class="nxt1-input"
                        type="number"
                        inputmode="numeric"
                        [value]="draftBudget()"
                        (input)="onBudgetCustomInput($event)"
                      />
                    </nxt1-form-field>
                    <p class="field-help">
                      Save {{ selectedBudgetIntervalLabel().toLowerCase() }} limits in dollars. Use
                      $0 if you want to clear the current cap.
                    </p>
                  </section>
                </div>

                <section class="control-card">
                  <span class="field-label">Current snapshot</span>
                  <div class="budget-summary-grid">
                    <div class="budget-summary-card">
                      <span class="budget-summary-label">Current spend</span>
                      <strong class="budget-summary-value">
                        {{ formatCurrency(selectedBudgetSpend()) }}
                      </strong>
                    </div>
                    <div class="budget-summary-card">
                      <span class="budget-summary-label">Existing limit</span>
                      <strong class="budget-summary-value">
                        {{ formatCurrency(selectedBudgetExistingLimit()) }}
                      </strong>
                    </div>
                  </div>
                </section>
              </section>
            } @else {
              <section class="budget-shell">
                <section class="control-card control-card--loading">
                  <span class="field-label">Budget settings</span>
                  <p class="field-help">Loading current budget data...</p>
                </section>
              </section>
            }
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
                <button type="button" class="goals-history-trigger">View task history</button>
              }
            </section>

            <section class="action-cards-section" aria-label="This Week's Action Plan">
              <div class="action-plan-header">
                <h3 class="action-plan-title">This Week's Action Plan</h3>
                @if (weeklyPlaybook().length > 0) {
                  <div class="action-plan-status">
                    <div class="action-plan-status-main">
                      <span class="action-plan-percent">{{ actionPlanProgressPercent() }}%</span>
                      <div
                        class="action-plan-progress"
                        aria-label="Action plan progress"
                        [attr.aria-valuenow]="actionPlanProgressPercent()"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        role="progressbar"
                      >
                        <div
                          class="action-plan-progress-bar"
                          [style.width.%]="actionPlanProgressPercent()"
                        ></div>
                      </div>
                    </div>
                    <p class="action-plan-meta">{{ actionPlanCompletionLabel() }}</p>
                  </div>
                }
              </div>

              @if (agentX.playbookGenerating()) {
                <div class="action-plan-generating" aria-label="Loading action plan" role="status">
                  <div class="generating-hero">
                    <div class="generating-logo-ring">
                      <svg viewBox="0 0 612 792" class="generating-x-mark" aria-hidden="true">
                        <path [attr.d]="agentXLogoPath" />
                      </svg>
                    </div>
                    <p class="generating-status">
                      Agent X is building your playbook<span class="typing-dots"
                        ><span>.</span><span>.</span><span>.</span></span
                      >
                    </p>
                    <p class="generating-sub">
                      Reading your profile, reviewing activity, and generating tasks
                    </p>
                  </div>
                  <div class="generating-steps">
                    @for (step of generatingSteps; track step.label; let i = $index) {
                      <div class="generating-step" [style.animation-delay]="i * 600 + 'ms'">
                        <div class="step-indicator">
                          <div class="step-dot"></div>
                        </div>
                        <span class="step-label">{{ step.label }}</span>
                      </div>
                    }
                  </div>
                </div>
              } @else if (allTasksSnoozed()) {
                <div
                  class="action-empty-state action-empty-state--visible"
                  role="status"
                  aria-live="polite"
                >
                  <div class="action-empty-icon" aria-hidden="true">
                    <svg
                      class="agent-x-mark"
                      width="40"
                      height="40"
                      viewBox="0 0 612 792"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path [attr.d]="agentXLogoPath" />
                      <polygon [attr.points]="agentXLogoPolygon" />
                    </svg>
                  </div>
                  <h4 class="action-empty-title">All Tasks Snoozed</h4>
                  <p class="action-empty-copy">
                    You snoozed everything. Want Agent X to generate a fresh set of actions?
                  </p>
                  <button type="button" class="action-empty-btn" (click)="onRegeneratePlaybook()">
                    Give Me More
                  </button>
                </div>
              } @else if (weeklyPlaybook().length > 0 && !allTasksComplete()) {
                @if (showCategoryPills()) {
                  <div class="category-pills" role="tablist" aria-label="Filter action plan">
                    @for (pill of categoryPills(); track pill.id) {
                      <button
                        type="button"
                        role="tab"
                        class="category-pill"
                        [class.category-pill--active]="activeCategoryId() === pill.id"
                        [attr.aria-selected]="activeCategoryId() === pill.id"
                        (click)="selectCategory(pill.id)"
                      >
                        {{ pill.label }}
                      </button>
                    }
                  </div>
                }
                @for (task of filteredPlaybookItems(); track task.id; let i = $index) {
                  <div
                    class="action-card action-card--enter"
                    [style.animation-delay]="i * 80 + 'ms'"
                  >
                    <div class="card-coordinator">
                      <div class="coordinator-avatar" aria-hidden="true">
                        <svg viewBox="0 0 612 792" class="coordinator-mark">
                          <path [attr.d]="agentXLogoPath" />
                        </svg>
                      </div>
                      <div class="coordinator-copy">
                        <span class="coordinator-brand">Agent X</span>
                        @if (task.coordinator) {
                          <span class="coordinator-role">{{ task.coordinator.label }}</span>
                        }
                      </div>
                    </div>
                    <div class="card-content">
                      <div class="card-title">{{ task.title }}</div>
                      <p class="card-description">{{ task.summary }}</p>
                      @if (task.why) {
                        <p class="card-why">
                          <svg
                            class="agent-x-mark"
                            width="16"
                            height="16"
                            viewBox="0 0 612 792"
                            fill="currentColor"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path [attr.d]="agentXLogoPath" />
                            <polygon [attr.points]="agentXLogoPolygon" />
                          </svg>
                          {{ task.why }}
                        </p>
                      }
                    </div>
                    <div class="card-actions">
                      <button
                        type="button"
                        class="action-btn primary-btn"
                        (click)="onPlaybookAction(task)"
                      >
                        {{ task.actionLabel }}
                      </button>
                      <div class="card-secondary-actions">
                        <button
                          type="button"
                          class="action-btn snooze-btn"
                          (click)="onSnoozeTask(task)"
                        >
                          Snooze
                        </button>
                      </div>
                    </div>
                  </div>
                }
              } @else if (allTasksComplete()) {
                <div
                  class="action-empty-state action-empty-state--visible"
                  role="status"
                  aria-live="polite"
                >
                  <div class="action-empty-icon" aria-hidden="true">
                    <svg
                      class="agent-x-mark"
                      width="40"
                      height="40"
                      viewBox="0 0 612 792"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path [attr.d]="agentXLogoPath" />
                      <polygon [attr.points]="agentXLogoPolygon" />
                    </svg>
                  </div>
                  <h4 class="action-empty-title">Week Complete 🏆</h4>
                  <p class="action-empty-copy">
                    You crushed it. Agent X is still monitoring for new opportunities.
                  </p>
                  <button type="button" class="action-empty-btn" (click)="onRegeneratePlaybook()">
                    Give Me More
                  </button>
                </div>
              } @else {
                <div
                  class="action-empty-state action-empty-state--visible"
                  role="status"
                  aria-live="polite"
                >
                  <div class="action-empty-icon" aria-hidden="true">
                    <svg
                      class="agent-x-mark"
                      width="40"
                      height="40"
                      viewBox="0 0 612 792"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path [attr.d]="agentXLogoPath" />
                      <polygon [attr.points]="agentXLogoPolygon" />
                    </svg>
                  </div>
                  <h4 class="action-empty-title">No Actions Yet</h4>
                  <p class="action-empty-copy">
                    Agent X will generate your personalized action plan based on your goals and
                    profile data.
                  </p>
                  <button type="button" class="action-empty-btn" (click)="onGenerateActionsClick()">
                    {{ agentX.goals().length > 0 ? 'Generate Actions' : 'Set Goals' }}
                  </button>
                </div>
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
      } @else if (panel === 'status') {
        <nxt1-sheet-footer label="Close" (action)="dismiss()" />
      } @else if (panel === 'goals') {
        <!-- no footer: Save Goals action lives inline in the goals section -->
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

        --agent-bg: var(--nxt1-color-bg-primary, var(--ion-background-color, #0a0a0a));
        --agent-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --agent-surface-hover: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        --agent-border: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        --agent-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --agent-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --agent-text-muted: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --agent-primary: var(--nxt1-color-primary, #ccff00);
        --agent-primary-glow: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        --agent-glass-bg: var(--nxt1-glass-bg, rgba(18, 18, 18, 0.8));
        --agent-glass-border: var(--nxt1-glass-border, rgba(255, 255, 255, 0.1));
      }

      :host-context(.light),
      :host-context([data-theme='light']) {
        --agent-bg: var(--nxt1-color-bg-primary, #ffffff);
        --agent-surface: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.03));
        --agent-surface-hover: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.05));
        --agent-border: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.08));
        --agent-text-primary: var(--nxt1-color-text-primary, #1a1a1a);
        --agent-text-secondary: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        --agent-text-muted: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.5));
        --agent-glass-bg: var(--nxt1-glass-bg, rgba(255, 255, 255, 0.8));
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

      .budget-shell {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .goals-shell {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding-bottom: var(--nxt1-spacing-5, 20px);
        margin-bottom: var(--nxt1-spacing-5, 20px);
        border-bottom: 1px solid var(--agent-border);
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

      .control-card--loading {
        min-height: 148px;
        justify-content: center;
      }

      .field-help {
        margin: 0;
        font-size: 13px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary);
      }

      .budget-pill-group {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .budget-scope-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .budget-select-wrap {
        position: relative;
      }

      .budget-select {
        width: 100%;
        min-height: 48px;
        padding: 0 44px 0 14px;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: 14px;
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
        font-size: 14px;
        font-weight: 600;
        line-height: 1.2;
        outline: none;
        appearance: none;
        -webkit-appearance: none;
        transition:
          border-color 0.16s ease,
          box-shadow 0.16s ease,
          background 0.16s ease;
      }

      .budget-select:hover {
        border-color: var(--nxt1-color-primary);
      }

      .budget-select:focus {
        border-color: var(--nxt1-color-primary);
        box-shadow: 0 0 0 3px var(--nxt1-color-alpha-primary10, rgba(221, 255, 0, 0.08));
      }

      .budget-select option {
        background: var(--nxt1-color-surface-300, #161616);
        color: var(--nxt1-color-text-primary);
      }

      .budget-select-icon {
        position: absolute;
        top: 50%;
        right: 14px;
        transform: translateY(-50%);
        pointer-events: none;
        color: var(--nxt1-color-text-secondary);
        font-size: 14px;
      }

      .budget-target-summary {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 14px 16px;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: 16px;
        background: linear-gradient(
          180deg,
          var(--nxt1-color-surface-200) 0%,
          var(--nxt1-color-surface-100) 100%
        );
      }

      .budget-target-summary__label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-secondary);
      }

      .budget-target-summary__title {
        font-size: 16px;
        line-height: 1.2;
        color: var(--nxt1-color-text-primary);
      }

      .budget-target-summary__copy {
        font-size: 13px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary);
      }

      .budget-pill-group--compact {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .budget-pill {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        min-width: 0;
        padding: 12px 14px;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: 16px;
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        cursor: pointer;
        transition:
          border-color 0.16s ease,
          background 0.16s ease,
          transform 0.16s ease;
      }

      .budget-pill:hover {
        border-color: var(--nxt1-color-primary);
      }

      .budget-pill--compact {
        align-items: center;
        justify-content: center;
        text-align: center;
      }

      .budget-pill--active {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary10, rgba(221, 255, 0, 0.08));
        transform: translateY(-1px);
      }

      .budget-pill-title {
        font-size: 13px;
        font-weight: 700;
        color: inherit;
      }

      .budget-pill-copy {
        font-size: 12px;
        line-height: 1.4;
        color: var(--nxt1-color-text-secondary);
      }

      .budget-summary-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .budget-summary-card {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 14px;
        border-radius: 16px;
        background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .budget-summary-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
      }

      .budget-summary-value {
        font-size: 20px;
        line-height: 1.1;
        color: var(--nxt1-color-text-primary);
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

        .budget-scope-grid,
        .budget-pill-group--compact,
        .budget-summary-grid {
          grid-template-columns: 1fr;
        }
      }

      /* ═══ ACTION PLAN PANEL (IN GOALS TAB) ═══ */
      .action-cards-section {
        display: flex;
        flex-direction: column;
        width: 100%;
      }

      .action-plan-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3, 12px);
        margin-bottom: var(--nxt1-spacing-4, 16px);
      }

      .action-plan-title {
        font-size: 16px;
        font-weight: 700;
        color: var(--agent-text-primary);
        padding-top: 2px;
        margin: 0;
      }

      .action-plan-status {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        flex: 0 0 auto;
        min-width: 0;
      }

      .action-plan-status-main {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        min-width: 0;
        white-space: nowrap;
      }

      .action-plan-meta {
        margin: 0;
        font-size: 11px;
        line-height: 1;
        color: var(--agent-text-secondary);
      }

      .action-plan-percent {
        font-size: 14px;
        font-weight: 700;
        line-height: 1;
        color: var(--agent-text-primary);
      }

      .action-plan-progress {
        position: relative;
        width: 56px;
        flex: 0 0 56px;
        height: 4px;
        border-radius: 999px;
        overflow: hidden;
        background: var(--agent-surface-hover);
      }

      .action-plan-progress-bar {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          var(--agent-primary),
          color-mix(in srgb, var(--agent-primary) 65%, white)
        );
        transition: width 0.28s ease;
      }

      .category-pills {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding-bottom: var(--nxt1-spacing-3, 12px);
        margin-bottom: var(--nxt1-spacing-2, 8px);
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }
      .category-pills::-webkit-scrollbar {
        display: none;
      }
      .category-pill {
        flex: 0 0 auto;
        padding: 6px 14px;
        border-radius: 999px;
        border: 1px solid var(--agent-border);
        background: transparent;
        color: var(--agent-text-secondary);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
      }
      .category-pill--active {
        background: var(--agent-primary);
        color: #111;
        border-color: var(--agent-primary);
      }

      .action-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-4, 16px);
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        margin-bottom: var(--nxt1-spacing-3, 12px);
        transition:
          background 0.2s ease,
          border-color 0.2s ease;
      }

      .action-card:active {
        background: var(--agent-surface-hover);
      }

      .card-coordinator {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .coordinator-avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--agent-primary-glow);
        color: var(--agent-primary);
        flex-shrink: 0;
      }

      .coordinator-mark {
        width: 26px;
        height: 26px;
        fill: currentColor;
      }

      .coordinator-copy {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .coordinator-brand {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.01em;
        color: var(--agent-text-primary, #fff);
      }

      .coordinator-role {
        font-size: 13px;
        font-weight: 600;
        color: var(--agent-text-secondary);
      }

      .card-content {
        flex: 1;
        min-width: 0;
      }

      .card-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--agent-text-primary);
        line-height: 1.4;
      }

      .card-description {
        margin: 8px 0 0;
        font-size: 13px;
        line-height: 1.5;
        color: var(--agent-text-secondary);
      }

      .card-why {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin: 6px 0 0;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 500;
        line-height: 1.45;
        color: var(--agent-primary);
        background: var(--agent-primary-glow);
        border-radius: var(--nxt1-radius-md, 8px);
        border-left: 2px solid var(--agent-primary);
      }

      .card-why .agent-x-mark {
        flex-shrink: 0;
        margin-top: 1px;
      }

      .card-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 16px;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition:
          opacity 0.15s ease,
          transform 0.1s ease;
        border: none;
        font-family: inherit;
        -webkit-tap-highlight-color: transparent;
        white-space: nowrap;
      }

      .action-btn:active {
        opacity: 0.9;
        transform: scale(0.96);
      }

      .action-btn.primary-btn {
        background: var(--agent-primary);
        color: #000;
        animation: agent-pulse 2.8s ease-in-out infinite;
        width: 100%;
      }

      .card-secondary-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 0 0 auto;
      }

      .action-btn.done-btn {
        background: transparent;
        border: 1px solid var(--agent-primary);
        color: var(--agent-primary);
      }

      .action-btn.snooze-btn {
        background: transparent;
        border: 1px solid var(--agent-border);
        color: var(--agent-text-secondary);
      }

      .action-empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-5, 20px);
        border-radius: var(--nxt1-radius-lg, 12px);
        border: 1px dashed var(--agent-border);
        background: var(--agent-surface);
        opacity: 0;
        transform: translateY(10px);
      }

      .action-empty-state--visible {
        opacity: 1;
        transform: translateY(0);
        transition:
          opacity 0.28s ease,
          transform 0.28s ease;
      }

      .action-empty-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        color: var(--agent-primary);
        background: var(--agent-primary-glow);
      }

      .action-empty-title {
        margin: 0;
        font-size: var(--nxt1-font-size-lg, 18px);
        font-weight: var(--nxt1-font-weight-semibold, 600);
        color: var(--agent-text-primary);
      }

      .action-empty-copy {
        margin: 0;
        font-size: var(--nxt1-font-size-sm, 14px);
        line-height: 1.5;
        color: var(--agent-text-secondary);
        max-width: 38ch;
      }

      .action-empty-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 16px;
        border-radius: var(--nxt1-radius-full, 9999px);
        border: 1px solid transparent;
        background: var(--agent-primary);
        color: #000;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.01em;
        cursor: pointer;
        font-family: inherit;
        -webkit-tap-highlight-color: transparent;
        transition:
          opacity 0.15s ease,
          transform 0.1s ease;
        animation: agent-pulse 2.8s ease-in-out infinite;
      }

      .action-empty-btn:active {
        opacity: 0.9;
        transform: scale(0.96);
      }

      .action-plan-generating {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-6, 24px);
        padding: var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-4, 16px);
        background: var(--agent-surface);
        border: 1px solid var(--agent-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        animation: gen-fade-in 0.4s ease forwards;
      }

      .generating-hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        text-align: center;
      }

      .generating-logo-ring {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: var(--agent-primary-glow);
        animation: gen-pulse 2s ease-in-out infinite;
      }

      .generating-x-mark {
        width: 32px;
        height: 32px;
        fill: var(--agent-primary);
        animation: gen-spin 3s linear infinite;
      }

      .generating-status {
        font-size: 15px;
        font-weight: 700;
        color: var(--agent-text-primary, #fff);
        margin: 0;
      }

      .typing-dots span {
        animation: typing-blink 1.4s steps(1) infinite;
        opacity: 0;
      }
      .typing-dots span:nth-child(1) {
        animation-delay: 0s;
      }
      .typing-dots span:nth-child(2) {
        animation-delay: 0.3s;
      }
      .typing-dots span:nth-child(3) {
        animation-delay: 0.6s;
      }

      .generating-sub {
        font-size: 13px;
        color: var(--agent-text-secondary);
        margin: 0;
        max-width: 280px;
      }

      .generating-steps {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
        width: 100%;
        max-width: 280px;
      }

      .generating-step {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        opacity: 0;
        animation: step-appear 0.4s ease forwards;
      }

      .step-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }

      .step-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--agent-primary);
        animation: dot-pulse 1.6s ease-in-out infinite;
      }

      .step-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--agent-text-secondary);
      }

      .action-card--enter {
        opacity: 0;
        animation: card-slide-in 0.38s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXControlPanelComponent implements OnInit {
  private readonly modalController = inject(ModalController);
  private readonly state = inject(AgentXControlPanelStateService);
  private readonly usageService = inject(UsageService);
  protected readonly agentX = inject(AgentXService);
  private readonly haptics = inject(HapticsService);

  protected readonly testIds = TEST_IDS.AGENT_X_GOALS;

  readonly close = output<AgentXControlPanelCloseResult>();

  @Input() panel: AgentXControlPanelKind = 'status';
  @Input() presentation: AgentXControlPanelPresentation = 'modal';
  @Input() required = false;
  @Input() initialGoals: string[] = [];
  @Input() budgetTargetTeamId: string | null = null;
  @Input() budgetDraftMode: AgentXBudgetDraftMode = 'current';
  @Input() budgetDraftInterval: BudgetInterval | null = null;

  readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;

  readonly weeklyPlaybook = computed<ShellWeeklyPlaybookItem[]>(() => this.agentX.weeklyPlaybook());
  readonly playbookTotalCount = computed(
    () => this.weeklyPlaybook().filter((t) => t.status !== 'snoozed').length
  );
  readonly playbookCompletedCount = computed(
    () => this.weeklyPlaybook().filter((t) => t.status === 'complete').length
  );
  readonly pendingPlaybookItems = this.agentX.pendingPlaybookItems;
  readonly actionPlanProgressPercent = computed(() => {
    const total = this.playbookTotalCount();
    if (total === 0) return 0;
    return Math.round((this.playbookCompletedCount() / total) * 100);
  });
  readonly actionPlanCompletionLabel = computed(
    () => `${this.playbookCompletedCount()} of ${this.playbookTotalCount()} complete`
  );
  readonly allTasksComplete = computed(
    () =>
      this.weeklyPlaybook().length > 0 &&
      this.weeklyPlaybook().every((t) => t.status === 'complete')
  );
  readonly allTasksSnoozed = computed(() => {
    const items = this.weeklyPlaybook();
    return items.length > 0 && items.every((t) => t.status === 'snoozed');
  });
  readonly categoryPills = this.agentX.categoryPills;
  readonly showCategoryPills = this.agentX.showCategoryPills;
  readonly activeCategoryId = this.agentX.activeCategoryId;
  readonly filteredPlaybookItems = this.agentX.filteredPlaybookItems;
  readonly generatingSteps = [
    { label: 'Reading your profile & metrics' },
    { label: 'Analyzing recent platform activity' },
    { label: 'Generating prioritized weekly actions' },
  ];

  readonly title = computed(() => {
    switch (this.panel) {
      case 'status':
        return 'Agent X status';
      case 'budget':
        return 'Budget settings';
      case 'goals':
        return 'Manage agent goals';
    }
  });

  readonly subtitle = computed(() => {
    switch (this.panel) {
      case 'status':
        return 'Active means Agent X is running normally, Degraded means some actions may be slower, and Down means Agent X is temporarily unavailable.';
      case 'budget':
        return 'Set the budget cadence, choose whether it applies to the full organization or a team, and save the limit in one step.';
      case 'goals':
        return this.required
          ? 'Pick at least one goal so Agent X knows what to work on for you.'
          : 'Choose up to three priorities so Agent X knows what to optimize for first.';
    }
  });

  readonly saving = signal(false);
  readonly budgetContextReady = signal(false);
  readonly draftBudget = signal(0);
  readonly draftBudgetInterval = signal<BudgetInterval>('monthly');
  readonly draftHardStop = signal(false);
  readonly draftBudgetTargetId = signal('organization');
  readonly draftGoals = signal<string[]>([]);
  readonly customGoalText = signal('');
  readonly currentStatus = this.state.statusDefinition;
  readonly statusTone = this.state.statusTone;
  readonly canSelectTeamBudget = computed(
    () => this.panel === 'budget' && this.usageService.isOrgAdmin() && this.usageService.isOrg()
  );
  readonly availableTeamBudgetTargets = computed(() =>
    this.budgetTargetOptions().filter((target) => target.type === 'team')
  );
  readonly budgetIntervalOptions: ReadonlyArray<{ id: BudgetInterval; label: string }> = [
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
  ];
  readonly budgetTargetOptions = computed(() => {
    const billingContext = this.usageService.billingContext();
    const organizationId = billingContext?.organizationId ?? 'organization';
    const baseTarget = {
      id: organizationId,
      label: 'Organization',
      type: 'organization' as const,
      detail: 'Entire program budget',
    };

    if (!this.canSelectTeamBudget()) {
      return [baseTarget] as const;
    }

    const availableTargets = billingContext?.availableBudgetTargets ?? [];

    return [
      baseTarget,
      ...availableTargets
        .filter((target) => target.type === 'team')
        .map((target) => ({
          id: target.id,
          label: target.label,
          type: 'team' as const,
          detail: 'Team-specific cap',
        })),
    ] as const;
  });
  readonly selectedBudgetTarget = computed(() => {
    const targets = this.budgetTargetOptions();
    return targets.find((target) => target.id === this.draftBudgetTargetId()) ?? targets[0] ?? null;
  });
  readonly selectedBudgetLabel = computed(() => this.selectedBudgetTarget()?.label ?? 'Budget');
  readonly selectedBudgetScope = computed<'organization' | 'team'>(() =>
    this.selectedBudgetTarget()?.type === 'team' ? 'team' : 'organization'
  );
  readonly selectedBudgetIntervalLabel = computed(() => {
    const interval = this.draftBudgetInterval();
    return interval.charAt(0).toUpperCase() + interval.slice(1);
  });
  readonly selectedBudgetDocument = computed(() => {
    const target = this.selectedBudgetTarget();
    const interval = this.draftBudgetInterval();

    if (!target) {
      return null;
    }

    return (
      this.usageService
        .budgets()
        .find(
          (budget) =>
            budget.targetScope === target.type &&
            budget.targetId === target.id &&
            budget.budgetInterval === interval
        ) ?? null
    );
  });
  readonly selectedBudgetSpend = computed(() => this.selectedBudgetDocument()?.spent ?? 0);
  readonly selectedBudgetExistingLimit = computed(
    () => this.selectedBudgetDocument()?.budgetLimit ?? 0
  );
  readonly selectedBudgetHardStop = computed(
    () => this.selectedBudgetDocument()?.stopOnLimit ?? false
  );
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
    void this.initializePanelState();
  }

  private async initializePanelState(): Promise<void> {
    if (this.panel === 'budget') {
      this.budgetContextReady.set(false);
      await this.usageService.ensureBudgetEditorContext();
      this.draftHardStop.set(this.selectedBudgetHardStop());
      if (this.budgetDraftMode === 'new') {
        this.applyNewBudgetDraft();
      } else {
        this.applyBudgetDraft(this.budgetTargetTeamId ?? 'organization');
      }
      this.budgetContextReady.set(true);
      return;
    }

    const goals = this.initialGoals.length > 0 ? this.initialGoals : this.state.goals();
    this.draftGoals.set([...goals]);
  }

  selectCategory(id: string): void {
    void this.haptics.impact('light');
    this.agentX.selectCategory(id);
  }

  onPlaybookAction(task: ShellWeeklyPlaybookItem): void {
    if (task.id === 'goal-setup') {
      return;
    }
    void this.haptics.impact('light');
    this.dismiss({ panel: 'goals', actionTask: task });
  }

  onSnoozeTask(task: ShellWeeklyPlaybookItem): void {
    void this.haptics.impact('light');
    this.agentX.snoozePlaybookItem(task.id);
  }

  onRegeneratePlaybook(): void {
    void this.haptics.impact('medium');
    void this.agentX.generatePlaybook(true);
  }

  onGenerateActionsClick(): void {
    if (this.agentX.goals().length > 0) {
      void this.agentX.generatePlaybook(true);
    }
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

  selectBudgetTarget(targetId: string): void {
    this.hydrateBudgetDraft(targetId, this.draftBudgetInterval());
  }

  onBudgetScopeChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    if (target.value === 'team') {
      const firstTeamTarget = this.availableTeamBudgetTargets()[0];
      if (firstTeamTarget) {
        this.hydrateBudgetDraft(
          firstTeamTarget.id,
          this.findFirstMissingInterval(firstTeamTarget.id)
        );
      }
      return;
    }

    const organizationTargetId =
      this.budgetTargetOptions().find((option) => option.type === 'organization')?.id ??
      'organization';
    this.hydrateBudgetDraft(
      organizationTargetId,
      this.findFirstMissingInterval(organizationTargetId)
    );
  }

  onBudgetTargetSelect(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    this.hydrateBudgetDraft(target.value, this.draftBudgetInterval());
  }

  selectBudgetInterval(interval: BudgetInterval): void {
    this.hydrateBudgetDraft(this.draftBudgetTargetId(), interval);
  }

  toggleHardStop(): void {
    this.draftHardStop.update((current) => !current);
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

  async savePanel(): Promise<void> {
    if (this.panel === 'budget') {
      this.saving.set(true);
      const budgetCents = Math.max(0, Math.round(this.draftBudget() * 100));
      const selectedTarget = this.selectedBudgetTarget();
      const budgetInterval = this.draftBudgetInterval();

      try {
        const success =
          selectedTarget?.type === 'team'
            ? await this.usageService.updateTeamBudget(selectedTarget.id, {
                monthlyBudget: budgetCents,
                budgetInterval,
              })
            : await this.usageService.updateBudget({
                monthlyBudget: budgetCents,
                budgetInterval,
                hardStop: this.draftHardStop(),
              });
        if (!success) {
          this.saving.set(false);
          return; // UsageService already showed error toast
        }

        this.state.saveBudget({
          monthlyBudget: this.draftBudget(),
          autoTopOffEnabled: false,
          autoTopOffAmount: 0,
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
      const role = result.actionTask ? 'action' : result.saved ? 'save' : 'dismiss';
      void this.modalController.dismiss(result, role);
      return;
    }

    this.close.emit(result);
  }

  formatCurrency(cents: number): string {
    return formatPrice(cents);
  }

  private applyBudgetDraft(targetId: string): void {
    this.hydrateBudgetDraft(targetId, this.budgetDraftInterval ?? this.draftBudgetInterval());
  }

  private hydrateBudgetDraft(targetId: string, interval: BudgetInterval): void {
    const target =
      this.budgetTargetOptions().find((option) => option.id === targetId) ??
      this.budgetTargetOptions()[0] ??
      null;

    if (!target) {
      return;
    }

    this.draftBudgetTargetId.set(target.id);
    this.draftBudgetInterval.set(interval);

    const existingBudget = this.usageService
      .budgets()
      .find(
        (budget) =>
          budget.targetScope === target.type &&
          budget.targetId === target.id &&
          budget.budgetInterval === interval
      );

    this.draftBudget.set(existingBudget ? Math.round(existingBudget.budgetLimit / 100) : 0);
    this.draftHardStop.set(
      target.type === 'organization' ? (existingBudget?.stopOnLimit ?? false) : true
    );
  }

  private applyNewBudgetDraft(): void {
    const targets = this.budgetTargetOptions();
    const explicitTarget = this.budgetTargetTeamId
      ? targets.find((target) => target.id === this.budgetTargetTeamId)
      : null;
    const organizationTarget = targets.find((target) => target.type === 'organization') ?? null;
    const targetWithOpenInterval =
      targets.find((target) =>
        this.budgetIntervalOptions.some(
          (option) =>
            !this.usageService
              .budgets()
              .some(
                (budget) =>
                  budget.targetScope === target.type &&
                  budget.targetId === target.id &&
                  budget.budgetInterval === option.id
              )
        )
      ) ?? null;
    const preferredTarget =
      explicitTarget ?? organizationTarget ?? targetWithOpenInterval ?? targets[0] ?? null;

    if (!preferredTarget) {
      return;
    }

    this.hydrateBudgetDraft(preferredTarget.id, this.findFirstMissingInterval(preferredTarget.id));
  }

  private findFirstMissingInterval(targetId: string): BudgetInterval {
    const target = this.budgetTargetOptions().find((option) => option.id === targetId);
    if (!target) {
      return 'monthly';
    }

    return (
      this.budgetIntervalOptions.find(
        (option) =>
          !this.usageService
            .budgets()
            .some(
              (budget) =>
                budget.targetScope === target.type &&
                budget.targetId === target.id &&
                budget.budgetInterval === option.id
            )
      )?.id ?? 'monthly'
    );
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
