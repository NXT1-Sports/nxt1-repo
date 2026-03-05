/**
 * @fileoverview Agent Onboarding Goals Step
 * @module @nxt1/ui/agent-x/onboarding
 * @version 1.0.0
 *
 * Step where users select up to 2 goals for Agent X.
 * Includes predefined goal cards and a custom goal input.
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  input,
  output,
} from '@angular/core';
import { type AgentGoal, AGENT_MAX_GOALS, AGENT_GOAL_CATEGORIES } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../../components/icon/icon.component';
import { NxtSearchBarComponent } from '../../components/search-bar/search-bar.component';
import { HapticsService } from '../../services/haptics/haptics.service';

@Component({
  selector: 'nxt1-agent-onboarding-goals',
  standalone: true,
  imports: [NxtIconComponent, NxtSearchBarComponent],
  template: `
    <section class="goals-container" [attr.data-testid]="testIds.GOALS_STEP">
      <div class="step-header">
        <div class="goals-counter" [attr.data-testid]="testIds.GOALS_COUNT">
          <span class="counter-current">{{ selectedGoals().length }}</span>
          <span class="counter-sep">/</span>
          <span class="counter-max">{{ maxGoals }}</span>
          <span class="counter-label">selected</span>
        </div>
      </div>

      <!-- Shared Input Bar (custom goal) -->
      <div class="custom-goal-section" [class.custom-goal-section--disabled]="isMaxReached()">
        <div class="custom-goal-input-row">
          <nxt1-search-bar
            variant="desktop-centered"
            placeholder="Add a custom goal"
            [value]="customGoalText()"
            [attr.data-testid]="testIds.GOAL_CUSTOM_INPUT"
            (searchInput)="onCustomInputValue($event)"
            (searchSubmit)="onCustomSubmit()"
            (searchClear)="clearCustomGoal()"
          />
          <button
            type="button"
            class="custom-add-goal-btn"
            [disabled]="!canAddCustom()"
            (click)="addCustomGoal()"
          >
            Add
          </button>
        </div>
        <p class="custom-label">Press Enter to add your custom goal</p>
      </div>

      <!-- Selected Goals Summary -->
      @if (selectedGoals().length > 0) {
        <div class="selected-summary">
          @for (goal of selectedGoals(); track goal.id) {
            <div class="selected-pill">
              <nxt1-icon [name]="goal.icon || 'flag-outline'" [size]="14" />
              <span class="pill-text">{{ goal.text }}</span>
              <button
                type="button"
                class="pill-remove"
                aria-label="Remove goal"
                (click)="removeGoal(goal.id)"
              >
                <nxt1-icon name="close" [size]="12" />
              </button>
            </div>
          }
        </div>
      }

      <div class="quick-options-panel">
        <button type="button" class="quick-options-toggle" (click)="toggleQuickOptions()">
          <span>{{ showQuickOptions() ? 'Hide quick options' : 'Show quick options' }}</span>
          <nxt1-icon [name]="showQuickOptions() ? 'chevronUp' : 'chevronDown'" [size]="16" />
        </button>

        @if (showQuickOptions()) {
          <div class="goal-category-list">
            @for (section of categorizedGoals(); track section.category) {
              <div class="goal-category">
                <p class="goal-category-label">{{ section.label }}</p>
                <div class="goals-row" role="list">
                  @for (goal of section.goals; track goal.id) {
                    <button
                      type="button"
                      class="goal-card"
                      [class.goal-card--selected]="isSelected(goal.id)"
                      [class.goal-card--disabled]="isMaxReached() && !isSelected(goal.id)"
                      [attr.data-testid]="testIds.GOAL_OPTION"
                      [disabled]="isMaxReached() && !isSelected(goal.id)"
                      (click)="toggleGoal(goal)"
                    >
                      <span class="goal-text">{{ goal.text }}</span>
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .goals-container {
        padding: var(--nxt1-spacing-xs) 0
          calc(var(--nxt1-spacing-xl, 24px) + env(safe-area-inset-bottom, 0px));
        max-width: 540px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: clamp(10px, 1.8vh, 18px);
      }

      .step-header {
        margin-bottom: var(--nxt1-spacing-sm);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: clamp(6px, 1.1vh, 10px);
      }

      /* Counter */
      .goals-counter {
        display: inline-flex;
        align-items: baseline;
        gap: 4px;
        padding: 6px 16px;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .counter-current {
        font-size: var(--nxt1-fontSize-lg, 18px);
        font-weight: 700;
        color: var(--nxt1-color-primary);
      }

      .counter-sep {
        color: var(--nxt1-color-text-tertiary);
      }

      .counter-max {
        font-size: var(--nxt1-fontSize-md, 16px);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
      }

      .counter-label {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: var(--nxt1-color-text-tertiary);
        margin-left: 4px;
      }

      .goal-category-list {
        width: 100%;
        max-width: 520px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: var(--nxt1-spacing-md);
      }

      .goal-category {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .goal-category-label {
        margin: 0;
        padding-left: 2px;
        font-size: var(--nxt1-fontSize-xs, 11px);
        font-weight: 600;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-tertiary);
      }

      .goals-row {
        display: flex;
        flex-wrap: nowrap;
        gap: 6px;
        width: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        padding-bottom: 2px;
      }

      .goals-row::-webkit-scrollbar {
        display: none;
      }

      .goal-card {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 7px 11px;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms);
        text-align: center;
        min-height: 0;
        max-width: 100%;
        white-space: nowrap;
        flex: 0 0 auto;
      }

      .goal-card:hover:not(:disabled) {
        border-color: var(--nxt1-color-primary);
        background: rgba(204, 255, 0, 0.03);
      }

      .goal-card--selected {
        border-color: var(--nxt1-color-primary) !important;
        background: rgba(204, 255, 0, 0.06) !important;
      }

      .goal-card--disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .goal-text {
        font-size: var(--nxt1-fontSize-xs, 11.5px);
        font-weight: 500;
        color: var(--nxt1-color-text-primary);
        line-height: 1.2;
        white-space: nowrap;
      }

      /* Custom Goal */
      .custom-goal-section {
        margin-bottom: var(--nxt1-spacing-md);
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }

      .custom-goal-input-row {
        width: 100%;
        max-width: 520px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .custom-goal-section nxt1-search-bar {
        width: 100%;
        max-width: none;
        flex: 1;
      }

      .custom-add-goal-btn {
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        height: 40px;
        padding: 0 14px;
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: 600;
        cursor: pointer;
        flex: 0 0 auto;
        transition: all var(--nxt1-duration-fast, 150ms);
      }

      .custom-add-goal-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .custom-add-goal-btn:not(:disabled):active {
        transform: scale(0.97);
      }

      .custom-add-goal-btn:not(:disabled):hover {
        border-color: var(--nxt1-color-primary);
        color: var(--nxt1-color-primary);
      }

      .custom-goal-section--disabled {
        opacity: 0.55;
      }

      .custom-label {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        text-align: center;
      }

      /* Selected Summary */
      .selected-summary {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-xs);
        width: 100%;
      }

      .goals-continue-row {
        width: min(100%, 320px);
        margin-top: 2px;
      }

      .quick-options-panel {
        width: 100%;
        max-width: 520px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .quick-options-toggle {
        width: 100%;
        height: 38px;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-secondary);
        display: inline-flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 14px;
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: 600;
        cursor: pointer;
        transition: border-color var(--nxt1-duration-fast, 150ms);
      }

      .quick-options-toggle:active {
        transform: scale(0.99);
      }

      .quick-options-toggle:hover {
        border-color: var(--nxt1-color-primary);
      }

      .selected-pill {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-sm);
        padding: 10px 14px;
        border-radius: var(--nxt1-borderRadius-md, 8px);
        background: rgba(204, 255, 0, 0.08);
        border: 1px solid rgba(204, 255, 0, 0.2);
        animation: fadeIn var(--nxt1-duration-normal, 200ms) ease-out;
      }

      .pill-text {
        flex: 1;
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: 500;
        color: var(--nxt1-color-text-primary);
      }

      .pill-remove {
        background: none;
        border: none;
        color: var(--nxt1-color-text-tertiary);
        cursor: pointer;
        padding: 4px;
        display: flex;
        border-radius: 50%;
        transition: color var(--nxt1-duration-fast, 150ms);
      }

      .pill-remove:hover {
        color: var(--nxt1-color-text-primary);
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (max-width: 480px) {
        .step-title {
          font-size: clamp(1.4rem, 7.2vw, 1.9rem);
        }

        .goal-category-list {
          gap: 8px;
          max-width: 100%;
        }

        .quick-options-panel {
          max-width: 100%;
        }

        .quick-options-toggle {
          height: 36px;
        }

        .goal-category-label {
          font-size: 10.5px;
        }

        .goals-row {
          gap: 5px;
        }

        .goal-card {
          padding: 6px 10px;
        }

        .goal-text {
          font-size: 11px;
        }

        .custom-goal-input-row {
          width: 94%;
          max-width: 400px;
          gap: 6px;
        }

        .custom-add-goal-btn {
          height: 36px;
          padding: 0 12px;
        }

        .custom-goal-section nxt1-search-bar {
          width: 100%;
          max-width: none;
        }

        .goals-continue-row {
          width: min(100%, 300px);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentOnboardingGoalsComponent {
  private readonly haptics = inject(HapticsService);

  protected readonly testIds = TEST_IDS.AGENT_ONBOARDING;
  protected readonly maxGoals = AGENT_MAX_GOALS;

  /** Predefined goals passed from parent (role-specific) */
  readonly predefinedGoals = input<AgentGoal[]>([]);

  /** Emitted when goals change */
  readonly goalsChanged = output<AgentGoal[]>();

  // Internal state
  protected readonly selectedGoals = signal<AgentGoal[]>([]);
  protected readonly customGoalText = signal('');
  protected readonly showQuickOptions = signal(false);

  protected readonly isMaxReached = computed(() => this.selectedGoals().length >= AGENT_MAX_GOALS);

  protected readonly hasSelectedGoals = computed(() => this.selectedGoals().length >= 1);

  protected readonly canAddCustom = computed(
    () => this.customGoalText().trim().length > 0 && !this.isMaxReached()
  );

  protected readonly categorizedGoals = computed(() =>
    AGENT_GOAL_CATEGORIES.map((category) => ({
      category: category.id,
      label: category.label,
      goals: this.predefinedGoals().filter((goal) => goal.category === category.id),
    })).filter((section) => section.goals.length > 0)
  );

  isSelected(goalId: string): boolean {
    return this.selectedGoals().some((g) => g.id === goalId);
  }

  async toggleGoal(goal: AgentGoal): Promise<void> {
    await this.haptics.impact('light');

    const current = this.selectedGoals();
    const exists = current.some((g) => g.id === goal.id);

    if (exists) {
      this.selectedGoals.set(current.filter((g) => g.id !== goal.id));
    } else if (current.length < AGENT_MAX_GOALS) {
      this.selectedGoals.set([...current, goal]);
    }

    this.goalsChanged.emit(this.selectedGoals());
  }

  removeGoal(goalId: string): void {
    this.selectedGoals.update((goals) => goals.filter((g) => g.id !== goalId));
    this.goalsChanged.emit(this.selectedGoals());
  }

  onCustomInputValue(value: string): void {
    this.customGoalText.set(value);
  }

  clearCustomGoal(): void {
    this.customGoalText.set('');
  }

  async onCustomSubmit(): Promise<void> {
    await this.addCustomGoal();
  }

  toggleQuickOptions(): void {
    this.showQuickOptions.update((value) => !value);
  }

  async addCustomGoal(): Promise<void> {
    const text = this.customGoalText().trim();
    if (!text || this.isMaxReached()) return;

    await this.haptics.impact('light');

    const customGoal: AgentGoal = {
      id: `custom-${Date.now()}`,
      text,
      type: 'custom',
      icon: 'create-outline',
    };

    this.selectedGoals.update((goals) => [...goals, customGoal]);
    this.customGoalText.set('');
    this.goalsChanged.emit(this.selectedGoals());
  }
}
