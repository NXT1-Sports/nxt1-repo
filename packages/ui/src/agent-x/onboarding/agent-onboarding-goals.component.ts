/**
 * @fileoverview Agent Onboarding Goals Step
 * @module @nxt1/ui/agent-x/onboarding
 * @version 1.0.0
 *
 * Step where users select up to 3 goals for Agent X.
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
import { NxtSearchBarComponent } from '../../components/search-bar/search-bar.component';
import { HapticsService } from '../../services/haptics/haptics.service';

@Component({
  selector: 'nxt1-agent-onboarding-goals',
  standalone: true,
  imports: [NxtSearchBarComponent],
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
              <svg
                class="pill-check"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span class="pill-text">{{ goal.text }}</span>
              <button
                type="button"
                class="pill-remove"
                aria-label="Remove goal"
                (click)="removeGoal(goal.id)"
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
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .goals-container {
        padding: var(--nxt1-spacing-1) 0
          calc(var(--nxt1-spacing-6) + env(safe-area-inset-bottom, 0px));
        max-width: min(100%, 640px);
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: clamp(var(--nxt1-spacing-2_5), 1.8vh, var(--nxt1-spacing-4_5));
      }

      .step-header {
        margin-bottom: var(--nxt1-spacing-2);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: clamp(var(--nxt1-spacing-1_5), 1.1vh, var(--nxt1-spacing-2_5));
      }

      /* Counter */
      .goals-counter {
        display: inline-flex;
        align-items: baseline;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .counter-current {
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
      }

      .counter-sep {
        color: var(--nxt1-color-text-tertiary);
      }

      .counter-max {
        font-size: var(--nxt1-fontSize-md);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-secondary);
      }

      .counter-label {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
        margin-left: var(--nxt1-spacing-1);
      }

      .goal-category-list {
        width: 100%;
        max-width: 520px;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2_5);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .goal-category {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1_5);
      }

      .goal-category-label {
        margin: 0;
        padding-left: 2px;
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-tertiary);
        text-align: left;
      }

      .goals-row {
        display: flex;
        flex-wrap: nowrap;
        gap: var(--nxt1-spacing-1_5);
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
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast);
        text-align: center;
        min-height: 0;
        max-width: 100%;
        white-space: nowrap;
        flex: 0 0 auto;
      }

      .goal-card:hover:not(:disabled) {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary4);
      }

      .goal-card--selected {
        border-color: var(--nxt1-color-primary) !important;
        background: var(--nxt1-color-alpha-primary6) !important;
      }

      .goal-card--disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .goal-text {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-tight);
        white-space: nowrap;
      }

      /* Custom Goal */
      .custom-goal-section {
        margin-bottom: var(--nxt1-spacing-4);
        width: 100%;
        max-width: min(100%, 640px);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .custom-goal-input-row {
        width: 100%;
        max-width: none;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
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
        border-radius: var(--nxt1-borderRadius-full);
        height: var(--nxt1-spacing-10);
        min-width: 76px;
        padding: 0 var(--nxt1-spacing-3_5);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        cursor: pointer;
        flex: 0 0 auto;
        transition: all var(--nxt1-duration-fast);
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
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        text-align: center;
      }

      /* Selected Summary */
      .selected-summary {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
        width: 100%;
        max-width: min(100%, 640px);
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
        gap: var(--nxt1-spacing-2);
      }

      .quick-options-toggle {
        width: 100%;
        height: 38px;
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-secondary);
        display: inline-flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 var(--nxt1-spacing-3_5);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        cursor: pointer;
        transition: border-color var(--nxt1-duration-fast);
      }

      .quick-options-toggle:active {
        transform: scale(0.99);
      }

      .quick-options-toggle:hover {
        border-color: var(--nxt1-color-primary);
      }

      .goal-category-list--hidden {
        display: none;
      }

      .selected-pill {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3_5);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary6);
        border: 1px solid var(--nxt1-color-primary);
        animation: fadeIn var(--nxt1-duration-normal) var(--nxt1-easing-out);
      }

      .pill-check {
        flex-shrink: 0;
        color: var(--nxt1-color-primary);
      }

      .pill-text {
        flex: 1;
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
      }

      .pill-remove {
        background: none;
        border: none;
        color: var(--nxt1-color-text-tertiary);
        cursor: pointer;
        padding: var(--nxt1-spacing-1);
        display: flex;
        border-radius: var(--nxt1-borderRadius-full);
        transition: color var(--nxt1-duration-fast);
      }

      .pill-remove:hover {
        color: var(--nxt1-color-text-primary);
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(var(--nxt1-spacing-1));
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (max-width: 480px) {
        .goals-container {
          max-width: 100%;
        }

        .step-title {
          font-size: clamp(1.4rem, 7.2vw, 1.9rem);
        }

        .goal-category-list {
          gap: var(--nxt1-spacing-2);
          max-width: 100%;
        }

        .quick-options-panel {
          max-width: 100%;
        }

        .quick-options-toggle {
          height: 36px;
        }

        .goal-category-label {
          font-size: var(--nxt1-fontSize-2xs);
          text-align: left;
        }

        .goals-row {
          gap: var(--nxt1-spacing-1);
        }

        .goal-card {
          padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-2_5);
        }

        .goal-text {
          font-size: var(--nxt1-fontSize-2xs);
        }

        .custom-goal-section {
          max-width: 100%;
          align-items: stretch;
        }

        .custom-goal-input-row {
          width: 100%;
          max-width: none;
          flex-direction: column;
          gap: var(--nxt1-spacing-2);
        }

        .custom-add-goal-btn {
          height: 36px;
          min-width: 62px;
          width: 100%;
          padding: 0 var(--nxt1-spacing-2_5);
        }

        .custom-goal-section nxt1-search-bar {
          width: 100%;
          max-width: none;
        }

        .goals-continue-row {
          width: min(100%, 300px);
        }
      }

      @media (min-width: 768px) {
        .custom-goal-section {
          gap: var(--nxt1-spacing-2_5);
        }

        .custom-goal-input-row {
          gap: var(--nxt1-spacing-3);
        }

        .custom-add-goal-btn {
          height: 44px;
          padding: 0 var(--nxt1-spacing-4);
        }

        .custom-label {
          width: 100%;
          text-align: left;
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
