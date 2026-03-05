/**
 * @fileoverview Agent Onboarding Shell (Web)
 * @module @nxt1/ui/agent-x/onboarding
 * @version 1.0.0
 *
 * Orchestrator component for the agent onboarding flow.
 * Renders progress bar and the current step via @switch.
 * Handles step transitions, navigation, and data flow.
 *
 * ⭐ This is a WEB-only shell. Mobile uses its own shell via Ionic. ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  output,
  OnInit,
} from '@angular/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { AGENT_ONBOARDING_STEPS } from '@nxt1/core';
import type { SelectedProgramData, AgentGoal, AgentConnection } from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon/icon.component';
import { OnboardingNavigationButtonsComponent } from '../../onboarding/onboarding-navigation-buttons/onboarding-navigation-buttons.component';
import { AgentOnboardingService } from './agent-onboarding.service';
import { AgentOnboardingWelcomeComponent } from './agent-onboarding-welcome.component';
import { AgentOnboardingProgramComponent } from './agent-onboarding-program.component';
import { AgentOnboardingGoalsComponent } from './agent-onboarding-goals.component';
import { AgentOnboardingConnectionsComponent } from './agent-onboarding-connections.component';
import { AgentOnboardingLoadingComponent } from './agent-onboarding-loading.component';

@Component({
  selector: 'nxt1-agent-onboarding-shell',
  standalone: true,
  imports: [
    NxtIconComponent,
    OnboardingNavigationButtonsComponent,
    AgentOnboardingWelcomeComponent,
    AgentOnboardingProgramComponent,
    AgentOnboardingGoalsComponent,
    AgentOnboardingConnectionsComponent,
    AgentOnboardingLoadingComponent,
  ],
  template: `
    <div class="onboarding-shell" [attr.data-testid]="testIds.SHELL">
      <!-- Progress Bar (hidden on welcome & loading steps) -->
      @if (showProgress()) {
        <div class="progress-header" [attr.data-testid]="testIds.PROGRESS_BAR">
          <div class="progress-track">
            <div class="progress-fill" [style.width.%]="progressPercent()"></div>
          </div>

          <div class="step-indicators">
            @for (step of visibleSteps(); track step.id; let i = $index) {
              <div
                class="step-dot"
                [class.active]="i <= activeVisibleIndex()"
                [class.current]="i === activeVisibleIndex()"
              >
                @if (i < activeVisibleIndex()) {
                  <nxt1-icon name="checkmark" size="12" />
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- Step Content -->
      <div class="step-container">
        @switch (currentStepId()) {
          @case ('welcome') {
            <nxt1-agent-onboarding-welcome (start)="onStart()" />
          }

          @case ('program-search') {
            <nxt1-agent-onboarding-program
              [searchResults]="service.programSearchResults()"
              [isSearching]="service.isProgramSearching()"
              (searchChange)="onProgramSearch($event)"
              (programSelected)="onProgramSelected($event)"
            />
          }

          @case ('goals') {
            <nxt1-agent-onboarding-goals
              [predefinedGoals]="service.predefinedGoals()"
              (goalsChanged)="onGoalsChanged($event)"
              (continueClicked)="onContinue()"
            />
          }

          @case ('connections') {
            <nxt1-agent-onboarding-connections
              [searchResults]="service.connectionSearchResults()"
              [suggestedConnections]="service.suggestedConnections()"
              [isSearching]="service.isConnectionSearching()"
              (searchChange)="onConnectionSearch($event)"
              (connectionsChanged)="onConnectionsChanged($event)"
            />
          }

          @case ('loading') {
            <nxt1-agent-onboarding-loading (loadingComplete)="onLoadingComplete()" />
          }
        }
      </div>

      <!-- Navigation Footer (hidden on welcome & loading steps) -->
      @if (showNavigation()) {
        <div class="nav-footer" [attr.data-testid]="'agent-onboarding-nav-footer'">
          <nxt1-onboarding-navigation-buttons
            [showBack]="service.canGoBack()"
            [showSkip]="currentStep().skippable"
            [disabled]="!service.canProceed()"
            [continueText]="continueLabel()"
            [continueTestId]="testIds.BTN_CONTINUE"
            [skipTestId]="testIds.BTN_SKIP"
            [backTestId]="testIds.BTN_BACK"
            [compact]="true"
            (backClick)="onBack()"
            (skipClick)="onSkip()"
            (continueClick)="onContinue()"
          />
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--nxt1-color-bg-primary);
      }

      .onboarding-shell {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        max-width: 720px;
        margin: 0 auto;
        padding: 0 var(--nxt1-spacing-4);
      }

      /* ──────────────────────────────────
       Progress Header
    ────────────────────────────────── */
      .progress-header {
        padding: var(--nxt1-spacing-6) 0 var(--nxt1-spacing-4);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .progress-track {
        width: 100%;
        height: 4px;
        background: var(--nxt1-color-surface-200);
        border-radius: 2px;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: var(--nxt1-color-primary);
        border-radius: 2px;
        transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .step-indicators {
        display: flex;
        justify-content: center;
        gap: var(--nxt1-spacing-3);
      }

      .step-dot {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 2px solid var(--nxt1-color-border-subtle);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
        background: transparent;
      }

      .step-dot.active {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-bg-primary);
      }

      .step-dot.current {
        border-color: var(--nxt1-color-primary);
        background: transparent;
        box-shadow: 0 0 0 3px rgba(204, 255, 0, 0.2);
      }

      .step-dot.current.active {
        background: var(--nxt1-color-primary);
      }

      /* ──────────────────────────────────
       Step Container
    ────────────────────────────────── */
      .step-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        animation: fadeSlideIn 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      }

      @keyframes fadeSlideIn {
        from {
          opacity: 0;
          transform: translateY(12px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ──────────────────────────────────
       Navigation Footer
    ────────────────────────────────── */
      .nav-footer {
        padding: var(--nxt1-spacing-4) 0 var(--nxt1-spacing-6);
        border-top: 1px solid var(--nxt1-color-border-subtle);
        margin-top: auto;
      }

      /* ──────────────────────────────────
       Responsive
    ────────────────────────────────── */
      @media (max-width: 640px) {
        .onboarding-shell {
          padding: 0 var(--nxt1-spacing-3);
        }

        .nav-footer {
          padding: var(--nxt1-spacing-3) 0 var(--nxt1-spacing-4);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentOnboardingShellComponent implements OnInit {
  protected readonly service = inject(AgentOnboardingService);

  protected readonly testIds = TEST_IDS.AGENT_ONBOARDING;
  protected readonly steps = AGENT_ONBOARDING_STEPS;

  /** Emitted when onboarding is fully complete */
  readonly onboardingComplete = output<void>();

  // ── Computed State ─────────────────────────────

  protected readonly currentStepId = computed(() => this.service.currentStepId());
  protected readonly currentStep = computed(() => this.service.currentStep());

  /** Steps to show in progress dots (exclude welcome & loading) */
  protected readonly visibleSteps = computed(() =>
    AGENT_ONBOARDING_STEPS.filter((s) => s.id !== 'welcome' && s.id !== 'loading').filter(
      (s) => this.service.isCoach() || s.id !== 'program-search'
    )
  );

  /** Index of current step within visible steps */
  protected readonly activeVisibleIndex = computed(() => {
    const currentId = this.currentStepId();
    const visible = this.visibleSteps();
    const idx = visible.findIndex((s) => s.id === currentId);
    return idx >= 0 ? idx : visible.length;
  });

  /** Progress as percentage */
  protected readonly progressPercent = computed(() => {
    const visible = this.visibleSteps();
    const active = this.activeVisibleIndex();
    if (visible.length <= 1) return 100;
    return Math.round((active / (visible.length - 1)) * 100);
  });

  /** Show progress bar? (not on welcome/loading) */
  protected readonly showProgress = computed(() => {
    const id = this.currentStepId();
    return id !== 'welcome' && id !== 'loading' && id !== 'goals';
  });

  /** Show navigation footer? (not on welcome/loading) */
  protected readonly showNavigation = computed(() => {
    const id = this.currentStepId();
    return id !== 'welcome' && id !== 'loading' && id !== 'goals';
  });

  /** Dynamic continue button label */
  protected readonly continueLabel = computed(() => {
    const id = this.currentStepId();
    const totalVisible = this.visibleSteps().length;
    const activeIdx = this.activeVisibleIndex();

    if (activeIdx >= totalVisible - 1) return 'Finish';
    if (id === 'connections') return 'Launch Agent X';
    return 'Continue';
  });

  // ── Lifecycle ──────────────────────────────────

  ngOnInit(): void {
    // Load suggested connections preemptively
    this.service.loadSuggestedConnections();
  }

  // ── Event Handlers ─────────────────────────────

  onStart(): void {
    this.service.start();
  }

  onProgramSearch(query: string): void {
    this.service.searchPrograms(query);
  }

  onProgramSelected(data: SelectedProgramData): void {
    this.service.setProgramData(data);
  }

  onGoalsChanged(goals: AgentGoal[]): void {
    this.service.setGoals(goals);
  }

  onConnectionSearch(query: string): void {
    this.service.searchConnections(query);
  }

  onConnectionsChanged(connections: AgentConnection[]): void {
    this.service.setConnections(connections);
  }

  async onContinue(): Promise<void> {
    if (!this.service.canProceed()) return;

    const currentId = this.currentStepId();

    // If on the last visible step before loading, trigger loading
    if (currentId === 'connections') {
      await this.service.completeOnboarding();
      await this.service.nextStep(); // go to loading step
    } else {
      await this.service.nextStep();
    }
  }

  async onBack(): Promise<void> {
    await this.service.previousStep();
  }

  async onSkip(): Promise<void> {
    await this.service.skipStep();
  }

  onLoadingComplete(): void {
    this.onboardingComplete.emit();
  }
}
