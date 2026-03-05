/**
 * @fileoverview Agent Onboarding Shell — Mobile (Ionic)
 * @module @nxt1/ui/agent-x/onboarding
 * @version 1.0.0
 *
 * Mobile-optimized onboarding shell using Ionic navigation primitives.
 * Native iOS/Android feel with haptic feedback, safe-area handling,
 * and smooth step transitions.
 *
 * ⭐ MOBILE ONLY — Uses Ionic components for native layout ⭐
 *
 * The step components (welcome, program, goals, connections, loading)
 * are shared with web — only this shell orchestrator is platform-specific.
 *
 * @example
 * ```html
 * <nxt1-agent-onboarding-shell-mobile
 *   (onboardingComplete)="onOnboardingComplete()"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  output,
  OnInit,
} from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { TEST_IDS } from '@nxt1/core/testing';
import { AGENT_ONBOARDING_STEPS } from '@nxt1/core';
import type { SelectedProgramData, AgentGoal, AgentConnection } from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon/icon.component';
import { NxtBackButtonComponent } from '../../components/back-button/back-button.component';
import { OnboardingNavigationButtonsComponent } from '../../onboarding/onboarding-navigation-buttons/onboarding-navigation-buttons.component';
import { HapticsService } from '../../services/haptics/haptics.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { AgentOnboardingService } from './agent-onboarding.service';
import { AgentOnboardingPromptComponent } from './agent-onboarding-prompt.component';
import { AgentOnboardingProgramComponent } from './agent-onboarding-program.component';
import { AgentOnboardingGoalsComponent } from './agent-onboarding-goals.component';
import { AgentOnboardingConnectionsComponent } from './agent-onboarding-connections.component';
import { AgentOnboardingLoadingComponent } from './agent-onboarding-loading.component';

@Component({
  selector: 'nxt1-agent-onboarding-shell-mobile',
  standalone: true,
  imports: [
    IonContent,
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

    <ion-content [fullscreen]="true" class="onboarding-content">
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
        <div
          class="step-container"
          [class.step-container--welcome]="currentStepId() === 'welcome'"
          [class.step-container--goals]="currentStepId() === 'goals'"
        >
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
      </div>
    </ion-content>

    <!-- Navigation Footer — Fixed bottom, glass morphism (matches Agent X input bar) -->
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
            [mobileLayout]="'row'"
            (skipClick)="onSkip()"
            (continueClick)="onContinue()"
          />
        </div>
      </div>
    }
  `,
  styles: [
    `
      /* ──────────────────────────────────
       Host & Content
      ────────────────────────────────── */
      :host {
        display: block;
        height: 100%;
      }

      /* ──────────────────────────────────
       Floating Back Button (top-left)
      ────────────────────────────────── */
      .floating-header {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 1000;
        padding: var(--nxt1-spacing-4, 16px);
        padding-top: calc(var(--nxt1-spacing-4, 16px) + env(safe-area-inset-top, 0px));
        pointer-events: none;
      }

      .floating-header nxt1-back-button {
        pointer-events: auto;
      }

      .onboarding-content {
        --background: var(--nxt1-color-bg-primary, #0a0a0a);
      }

      .onboarding-shell {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        max-width: 640px;
        margin: 0 auto;
        padding: 0 var(--nxt1-spacing-3, 12px);
        padding-top: env(safe-area-inset-top, 0);
      }

      /* ──────────────────────────────────
       Progress Header
      ────────────────────────────────── */
      .progress-header {
        padding: var(--nxt1-spacing-3, 12px) 0 var(--nxt1-spacing-2, 8px);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .progress-track {
        width: 100%;
        height: 4px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        border-radius: 2px;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: var(--nxt1-color-primary, #c8ff00);
        border-radius: 2px;
        transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .step-indicators {
        display: flex;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .step-dot {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 2px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.1));
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
        background: transparent;
      }

      .step-dot.active {
        border-color: var(--nxt1-color-primary, #c8ff00);
        background: var(--nxt1-color-primary, #c8ff00);
        color: var(--nxt1-color-bg-primary, #0a0a0a);
      }

      .step-dot.current {
        border-color: var(--nxt1-color-primary, #c8ff00);
        background: transparent;
        box-shadow: 0 0 0 3px rgba(200, 255, 0, 0.2);
      }

      .step-dot.current.active {
        background: var(--nxt1-color-primary, #c8ff00);
      }

      .agent-header-shell {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: clamp(248px, 34vh, 320px);
        margin-bottom: clamp(6px, 1.2vh, 12px);
      }

      /* ──────────────────────────────────
       Step Container
      ────────────────────────────────── */
      .step-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding-bottom: var(--nxt1-spacing-2, 8px);
        animation: fadeSlideIn 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .step-container--welcome {
        justify-content: flex-start;
        padding-top: 0;
        padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px));
      }

      .step-container--goals {
        justify-content: flex-start;
        padding-top: clamp(10px, 3.2vh, 24px);
        padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
      }

      .welcome-step-spacer {
        flex: 1;
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
       Navigation Footer — Fixed bottom, glass morphism (matches Agent X input bar)
      ────────────────────────────────── */
      .nav-footer-fixed {
        position: fixed;
        left: var(--nxt1-footer-left, 16px);
        right: var(--nxt1-footer-right, 16px);
        bottom: calc(var(--nxt1-footer-bottom, 20px) + var(--nxt1-pill-height, 44px) + 16px);
        z-index: var(--nxt1-z-index-fixed, 999);
        pointer-events: none;
      }

      .nav-footer-inner {
        max-width: 344px;
        margin: 0 auto;
        pointer-events: auto;
        background: var(--nxt1-glass-bg, rgba(18, 18, 18, 0.8));
        border: 1px solid var(--nxt1-glass-borderSubtle, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-ui-radius-full, 999px);
        box-shadow: var(--nxt1-glass-shadow, 0 4px 16px rgba(0, 0, 0, 0.16));
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        padding: 0.3125rem 0.75rem;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentOnboardingShellMobileComponent implements OnInit {
  protected readonly service = inject(AgentOnboardingService);
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('AgentOnboardingShellMobile');

  protected readonly testIds = TEST_IDS.AGENT_ONBOARDING;

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
    this.logger.info('Agent onboarding shell initialized (mobile)');
    this.service.loadSuggestedConnections();
  }

  // ── Event Handlers ─────────────────────────────

  async onStart(): Promise<void> {
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
      await this.haptics.impact('light');
      this.onStart();
      return;
    }

    if (!this.service.canProceed()) return;
    await this.haptics.impact('light');

    if (currentId === 'connections') {
      await this.service.completeOnboarding();
      await this.service.nextStep();
    } else {
      await this.service.nextStep();
    }
  }

  async onBack(): Promise<void> {
    await this.haptics.impact('light');
    await this.service.previousStep();
  }

  async onSkip(): Promise<void> {
    await this.haptics.impact('light');
    await this.service.skipStep();
  }

  onLoadingComplete(): void {
    this.haptics.notification('success');
    this.logger.info('Onboarding complete, transitioning to Agent X shell');
    this.onboardingComplete.emit();
  }
}
