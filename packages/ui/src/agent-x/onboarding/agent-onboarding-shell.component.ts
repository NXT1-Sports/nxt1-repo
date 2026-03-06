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
import { NxtBackButtonComponent } from '../../components/back-button/back-button.component';
import { OnboardingNavigationButtonsComponent } from '../../onboarding/onboarding-navigation-buttons/onboarding-navigation-buttons.component';
import { AgentOnboardingService } from './agent-onboarding.service';
import { AgentOnboardingPromptComponent } from './agent-onboarding-prompt.component';
import { AgentOnboardingProgramComponent } from './agent-onboarding-program.component';
import { AgentOnboardingGoalsComponent } from './agent-onboarding-goals.component';
import { AgentOnboardingConnectionsComponent } from './agent-onboarding-connections.component';
import { AgentOnboardingLoadingComponent } from './agent-onboarding-loading.component';

@Component({
  selector: 'nxt1-agent-onboarding-shell',
  standalone: true,
  imports: [
    NxtIconComponent,
    NxtBackButtonComponent,
    OnboardingNavigationButtonsComponent,
    AgentOnboardingPromptComponent,
    AgentOnboardingProgramComponent,
    AgentOnboardingGoalsComponent,
    AgentOnboardingConnectionsComponent,
    AgentOnboardingLoadingComponent,
  ],
  template: `
    <!-- Floating Back Button (top-left, matches auth onboarding) -->
    @if (showBackButton()) {
      <div class="floating-header">
        <nxt1-back-button
          variant="floating"
          [testId]="testIds.BTN_BACK"
          ariaLabel="Go back"
          (backClick)="onBack()"
        />
      </div>
    }

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

      @if (showAgentHeader()) {
        <div class="agent-header-shell">
          @switch (currentStepId()) {
            @case ('welcome') {
              <nxt1-agent-onboarding-prompt
                [titleText]="'Let us get your agent started.'"
                [descriptionText]="'Hi, I am Agent X.'"
                [titleTestId]="testIds.WELCOME_TITLE"
                [orbSize]="'lg'"
              />
            }
            @case ('program-search') {
              <nxt1-agent-onboarding-prompt
                [titleText]="'Find your team.'"
                [descriptionText]="'Agent X: Let us map your program.'"
                [orbSize]="'lg'"
              />
            }
            @case ('goals') {
              <nxt1-agent-onboarding-prompt
                [titleText]="'Set your goals.'"
                [descriptionText]="'Agent X: Tell me what matters most.'"
                [orbSize]="'lg'"
              />
            }
            @case ('connections') {
              <nxt1-agent-onboarding-prompt
                [titleText]="'Add connections.'"
                [descriptionText]="'Agent X: Build your circle.'"
                [orbSize]="'lg'"
              />
            }
          }
        </div>
      }

      <!-- Step Content -->
      <div class="step-container" [class.step-container--welcome]="currentStepId() === 'welcome'">
        @switch (currentStepId()) {
          @case ('welcome') {
            <div class="welcome-step-spacer" [attr.data-testid]="testIds.WELCOME_STEP"></div>
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

      <!-- Navigation Footer — fixed above bottom, matches Agent X input bar -->
      @if (showNavigation()) {
        <div class="nav-footer-fixed" [attr.data-testid]="'agent-onboarding-nav-footer'">
          <div class="nav-footer-inner">
            <nxt1-onboarding-navigation-buttons
              [showSkip]="currentStep().skippable"
              [disabled]="!service.canProceed()"
              [continueText]="continueLabel()"
              [continueTestId]="testIds.BTN_CONTINUE"
              [skipTestId]="testIds.BTN_SKIP"
              [compact]="true"
              (skipClick)="onSkip()"
              (continueClick)="onContinue()"
            />
          </div>
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

      /* ──────────────────────────────────
       Floating Back Button (top-left)
      ────────────────────────────────── */
      .floating-header {
        position: fixed;
        top: 0;
        left: 0;
        z-index: var(--nxt1-zIndex-dropdown);
        padding: var(--nxt1-spacing-4);
        pointer-events: none;
      }

      .floating-header nxt1-back-button {
        pointer-events: auto;
      }

      .onboarding-shell {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        max-width: 720px;
        margin: 0 auto;
        padding: 0 var(--nxt1-spacing-4);
        padding-bottom: calc(var(--nxt1-spacing-20) + env(safe-area-inset-bottom, 0px));
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
        height: var(--nxt1-spacing-1);
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-borderRadius-xs);
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: var(--nxt1-color-primary);
        border-radius: var(--nxt1-borderRadius-xs);
        transition: width var(--nxt1-duration-slower) var(--nxt1-easing-inOut);
      }

      .step-indicators {
        display: flex;
        justify-content: center;
        gap: var(--nxt1-spacing-3);
      }

      .step-dot {
        width: var(--nxt1-spacing-7);
        height: var(--nxt1-spacing-7);
        border-radius: var(--nxt1-borderRadius-full);
        border: 2px solid var(--nxt1-color-border-subtle);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all var(--nxt1-duration-slow) var(--nxt1-easing-out);
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
        box-shadow: 0 0 0 3px var(--nxt1-color-alpha-primary20);
      }

      .step-dot.current.active {
        background: var(--nxt1-color-primary);
      }

      .agent-header-shell {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: clamp(260px, 36vh, 340px);
        margin-bottom: clamp(var(--nxt1-spacing-1_5), 1.2vh, var(--nxt1-spacing-3));
      }

      /* ──────────────────────────────────
       Step Container
      ────────────────────────────────── */
      .step-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        animation: fadeSlideIn var(--nxt1-duration-slow) var(--nxt1-easing-inOut);
      }

      .step-container--welcome {
        justify-content: flex-start;
        padding-top: 0;
        padding-bottom: calc(100px + env(safe-area-inset-bottom, 0px));
      }

      .welcome-step-spacer {
        flex: 1;
      }

      @keyframes fadeSlideIn {
        from {
          opacity: 0;
          transform: translateY(var(--nxt1-spacing-3));
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ──────────────────────────────────
       Navigation Footer — Fixed bottom, glass morphism (matches Agent X input bar)
      ────────────────────────────────── */
      .nav-footer-fixed {
        position: fixed;
        left: 0;
        right: 0;
        bottom: var(--nxt1-spacing-6);
        z-index: var(--nxt1-zIndex-fixed);
        pointer-events: none;
        padding: 0 var(--nxt1-spacing-3);
      }

      .nav-footer-inner {
        max-width: 720px;
        margin: 0 auto;
        pointer-events: auto;
        background: var(--nxt1-glass-bg);
        border: 1px solid var(--nxt1-glass-borderSubtle);
        border-radius: var(--nxt1-borderRadius-full);
        box-shadow: var(--nxt1-glass-shadow);
        backdrop-filter: var(--nxt1-glass-backdrop);
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop);
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-4);
      }

      /* ──────────────────────────────────
       Responsive
      ────────────────────────────────── */
      @media (max-width: 640px) {
        .onboarding-shell {
          padding: 0 var(--nxt1-spacing-3);
          padding-bottom: calc(var(--nxt1-spacing-20) + env(safe-area-inset-bottom, 0px));
        }

        .nav-footer-fixed {
          left: var(--nxt1-spacing-4);
          right: var(--nxt1-spacing-4);
          bottom: var(--nxt1-spacing-5);
        }

        .nav-footer-inner {
          max-width: 344px;
          margin: 0 auto;
          padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
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

  /** Show navigation footer? (all steps except loading) */
  protected readonly showNavigation = computed(() => {
    const id = this.currentStepId();
    return id !== 'loading';
  });

  /** Show fixed Agent X interview header? (all interactive steps) */
  protected readonly showAgentHeader = computed(() => this.currentStepId() !== 'loading');

  /** Show floating back button? (not on welcome/loading, and only when can go back) */
  protected readonly showBackButton = computed(() => {
    const id = this.currentStepId();
    return id !== 'welcome' && id !== 'loading' && this.service.canGoBack();
  });

  /** Dynamic continue button label */
  protected readonly continueLabel = computed(() => {
    const id = this.currentStepId();
    const totalVisible = this.visibleSteps().length;
    const activeIdx = this.activeVisibleIndex();

    if (id === 'welcome') return 'Get Started';
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
    const currentId = this.currentStepId();

    // Welcome step: start onboarding flow
    if (currentId === 'welcome') {
      this.onStart();
      return;
    }

    if (!this.service.canProceed()) return;

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
