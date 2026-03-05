/**
 * @fileoverview Agent Onboarding Service
 * @module @nxt1/ui/agent-x/onboarding
 * @version 1.0.0
 *
 * Signal-based state management for the Agent X onboarding flow.
 * Manages step navigation, program search, goal selection, and connections.
 *
 * ⭐ All 4 observability pillars: Logger, Analytics, Breadcrumbs, Performance ⭐
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import {
  type AgentGoal,
  type AgentConnection,
  type AgentProgramResult,
  type SelectedProgramData,
  type AgentOnboardingPayload,
  AGENT_ONBOARDING_STEPS,
  COACH_PREDEFINED_GOALS,
  ATHLETE_PREDEFINED_GOALS,
} from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { HapticsService } from '../../services/haptics/haptics.service';

@Injectable({ providedIn: 'root' })
export class AgentOnboardingService {
  // ============================================
  // OBSERVABILITY (All 4 pillars)
  // ============================================
  private readonly logger = inject(NxtLoggingService).child('AgentOnboardingService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly haptics = inject(HapticsService);

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================
  private readonly _currentStepIndex = signal(0);
  private readonly _isComplete = signal(false);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _programData = signal<SelectedProgramData | null>(null);
  private readonly _goals = signal<AgentGoal[]>([]);
  private readonly _connections = signal<AgentConnection[]>([]);
  private readonly _programSearchResults = signal<AgentProgramResult[]>([]);
  private readonly _isProgramSearching = signal(false);
  private readonly _connectionSearchResults = signal<AgentConnection[]>([]);
  private readonly _suggestedConnections = signal<AgentConnection[]>([]);
  private readonly _isConnectionSearching = signal(false);
  private readonly _userRole = signal<string>('coach');
  private readonly _needsOnboarding = signal(true);

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Steps configuration */
  readonly steps = computed(() => AGENT_ONBOARDING_STEPS);

  /** Current step index */
  readonly currentStepIndex = computed(() => this._currentStepIndex());

  /** Current step config */
  readonly currentStep = computed(() => AGENT_ONBOARDING_STEPS[this._currentStepIndex()]);

  /** Current step ID */
  readonly currentStepId = computed(() => this.currentStep().id);

  /** Total steps */
  readonly totalSteps = computed(() => AGENT_ONBOARDING_STEPS.length);

  /** Progress (0 to 1) */
  readonly progress = computed(
    () => this._currentStepIndex() / (AGENT_ONBOARDING_STEPS.length - 1)
  );

  /** Whether onboarding is complete */
  readonly isComplete = computed(() => this._isComplete());

  /** Whether currently loading */
  readonly isLoading = computed(() => this._isLoading());

  /** Error state */
  readonly error = computed(() => this._error());

  /** Selected program data */
  readonly programData = computed(() => this._programData());

  /** Selected goals */
  readonly goals = computed(() => this._goals());

  /** Added connections */
  readonly connections = computed(() => this._connections());

  /** Program search results */
  readonly programSearchResults = computed(() => this._programSearchResults());

  /** Whether program search is in progress */
  readonly isProgramSearching = computed(() => this._isProgramSearching());

  /** Connection search results */
  readonly connectionSearchResults = computed(() => this._connectionSearchResults());

  /** Suggested connections */
  readonly suggestedConnections = computed(() => this._suggestedConnections());

  /** Whether connection search is in progress */
  readonly isConnectionSearching = computed(() => this._isConnectionSearching());

  /** Whether the user needs to go through agent onboarding */
  readonly needsOnboarding = computed(() => this._needsOnboarding());

  /** User's role */
  readonly userRole = computed(() => this._userRole());

  /** Whether the user is a coach */
  readonly isCoach = computed(() => {
    const role = this._userRole();
    return role === 'coach' || role === 'director';
  });

  /** Predefined goals based on user role */
  readonly predefinedGoals = computed(() =>
    this.isCoach() ? [...COACH_PREDEFINED_GOALS] : [...ATHLETE_PREDEFINED_GOALS]
  );

  /** Whether current step can proceed */
  readonly canProceed = computed(() => {
    const step = this.currentStepId();
    switch (step) {
      case 'welcome':
        return true;
      case 'program-search':
        return this._programData() !== null;
      case 'goals':
        return this._goals().length >= 1;
      case 'connections':
        return true; // Skippable
      case 'loading':
        return false; // Auto-advances
      default:
        return true;
    }
  });

  /** Whether can go back from current step */
  readonly canGoBack = computed(() => this._currentStepIndex() > 0);

  // ============================================
  // ACTIONS
  // ============================================

  /**
   * Initialize the onboarding with user context.
   */
  initialize(userRole: string, needsOnboarding: boolean): void {
    this._userRole.set(userRole);
    this._needsOnboarding.set(needsOnboarding);
    this.logger.info('Agent onboarding initialized', { userRole, needsOnboarding });

    if (needsOnboarding) {
      this.analytics?.trackEvent(APP_EVENTS.AGENT_ONBOARDING_STARTED, { userRole });
      this.breadcrumb.trackStateChange('agent-onboarding:started', { userRole });
    }
  }

  /**
   * Start the onboarding (from welcome step).
   */
  async start(): Promise<void> {
    await this.haptics.impact('medium');
    this.logger.info('Agent onboarding started');
    this.analytics?.trackEvent(APP_EVENTS.AGENT_ONBOARDING_STEP_VIEWED, { step: 'welcome' });

    // Move to next step (program-search for coaches, goals for athletes)
    if (this.isCoach()) {
      this._currentStepIndex.set(1); // program-search
    } else {
      this._currentStepIndex.set(2); // goals (skip program-search)
    }

    this.trackStepView();
  }

  /**
   * Navigate to the next step.
   */
  async nextStep(): Promise<void> {
    const currentId = this.currentStepId();
    this.logger.info('Step completed', { step: currentId });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_ONBOARDING_STEP_COMPLETED, { step: currentId });
    this.breadcrumb.trackStateChange('agent-onboarding:step-completed', { step: currentId });

    await this.haptics.impact('light');

    const nextIndex = this._currentStepIndex() + 1;
    if (nextIndex < AGENT_ONBOARDING_STEPS.length) {
      // Skip program-search for non-coaches
      const nextStep = AGENT_ONBOARDING_STEPS[nextIndex];
      if (nextStep.id === 'program-search' && !this.isCoach()) {
        this._currentStepIndex.set(nextIndex + 1);
      } else {
        this._currentStepIndex.set(nextIndex);
      }
      this.trackStepView();
    }
  }

  /**
   * Navigate to the previous step.
   */
  async previousStep(): Promise<void> {
    await this.haptics.impact('light');

    const prevIndex = this._currentStepIndex() - 1;
    if (prevIndex >= 0) {
      // Skip program-search for non-coaches when going back
      const prevStep = AGENT_ONBOARDING_STEPS[prevIndex];
      if (prevStep.id === 'program-search' && !this.isCoach()) {
        this._currentStepIndex.set(Math.max(prevIndex - 1, 0));
      } else {
        this._currentStepIndex.set(prevIndex);
      }
      this.trackStepView();
    }
  }

  /**
   * Skip the current step.
   */
  async skipStep(): Promise<void> {
    const step = this.currentStepId();
    this.logger.info('Step skipped', { step });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_ONBOARDING_SKIPPED, { step });
    await this.nextStep();
  }

  /**
   * Search for programs (debounced call from component).
   */
  async searchPrograms(query: string): Promise<void> {
    if (query.length < 2) {
      this._programSearchResults.set([]);
      return;
    }

    this._isProgramSearching.set(true);
    this.logger.info('Searching programs', { query });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_ONBOARDING_PROGRAM_SEARCHED, { query });

    try {
      // TODO: Wire to actual API — currently simulated
      await new Promise((resolve) => setTimeout(resolve, 600));
      const mockResults: AgentProgramResult[] = [
        {
          id: 'mock-1',
          name: `${query} High School`,
          sport: 'Football',
          state: 'TX',
          city: 'Dallas',
          teamType: 'High School',
          isClaimed: false,
        },
        {
          id: 'mock-2',
          name: `${query} Academy`,
          sport: 'Basketball',
          state: 'CA',
          city: 'Los Angeles',
          teamType: 'Club',
          isClaimed: false,
        },
        {
          id: 'mock-3',
          name: `${query} Prep`,
          sport: 'Soccer',
          state: 'FL',
          city: 'Miami',
          teamType: 'High School',
          isClaimed: true,
        },
      ];

      this._programSearchResults.set(mockResults);
      this.logger.info('Program search results', { count: mockResults.length });
    } catch (err) {
      this.logger.error('Program search failed', err, { query });
      this._programSearchResults.set([]);
    } finally {
      this._isProgramSearching.set(false);
    }
  }

  /**
   * Set the selected program data.
   */
  setProgramData(data: SelectedProgramData): void {
    this._programData.set(data);
    this.logger.info('Program selected', {
      action: data.action,
      role: data.role,
      name: data.program.name,
    });

    if (data.action === 'claim') {
      this.analytics?.trackEvent(APP_EVENTS.AGENT_ONBOARDING_PROGRAM_SELECTED, {
        programId: data.program.id,
        role: data.role,
      });
    } else {
      this.analytics?.trackEvent(APP_EVENTS.AGENT_ONBOARDING_PROGRAM_CREATED, {
        programName: data.program.name,
        role: data.role,
      });
    }

    this.breadcrumb.trackStateChange('agent-onboarding:program-set', {
      action: data.action,
      role: data.role,
    });
  }

  /**
   * Update selected goals.
   */
  setGoals(goals: AgentGoal[]): void {
    this._goals.set(goals);
    this.logger.info('Goals updated', { count: goals.length, ids: goals.map((g) => g.id) });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_ONBOARDING_GOAL_SELECTED, {
      count: goals.length,
      goals: goals.map((g) => g.id).join(','),
    });
  }

  /**
   * Update connections.
   */
  setConnections(connections: AgentConnection[]): void {
    this._connections.set(connections);
    this.logger.info('Connections updated', { count: connections.length });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_ONBOARDING_CONNECTION_ADDED, {
      count: connections.length,
    });
  }

  /**
   * Search for connections.
   */
  async searchConnections(query: string): Promise<void> {
    if (query.length < 2) {
      this._connectionSearchResults.set([]);
      return;
    }

    this._isConnectionSearching.set(true);
    this.logger.info('Searching connections', { query });

    try {
      // TODO: Wire to actual API — currently simulated
      await new Promise((resolve) => setTimeout(resolve, 500));
      const mockResults: AgentConnection[] = [
        {
          id: 'user-1',
          displayName: `${query} Smith`,
          role: 'athlete',
          sport: 'Football',
          teamName: 'Lincoln Lions',
        },
        {
          id: 'user-2',
          displayName: `Coach ${query}`,
          role: 'coach',
          sport: 'Basketball',
          teamName: 'Eagles Basketball',
        },
      ];

      this._connectionSearchResults.set(mockResults);
    } catch (err) {
      this.logger.error('Connection search failed', err, { query });
      this._connectionSearchResults.set([]);
    } finally {
      this._isConnectionSearching.set(false);
    }
  }

  /**
   * Load suggested connections.
   */
  async loadSuggestedConnections(): Promise<void> {
    this.logger.info('Loading suggested connections');

    try {
      // TODO: Wire to actual API — currently simulated
      await new Promise((resolve) => setTimeout(resolve, 400));
      const suggestions: AgentConnection[] = [
        {
          id: 'sug-1',
          displayName: 'Marcus Johnson',
          role: 'athlete',
          sport: 'Football',
          teamName: 'Lincoln Lions',
        },
        {
          id: 'sug-2',
          displayName: 'Sarah Williams',
          role: 'coach',
          sport: 'Volleyball',
          teamName: 'Eagles VB',
        },
        {
          id: 'sug-3',
          displayName: 'James Chen',
          role: 'athlete',
          sport: 'Basketball',
          teamName: 'Hawks',
        },
        {
          id: 'sug-4',
          displayName: 'Coach Davis',
          role: 'coach',
          sport: 'Soccer',
          teamName: 'United FC',
        },
      ];

      this._suggestedConnections.set(suggestions);
      this.logger.info('Suggested connections loaded', { count: suggestions.length });
    } catch (err) {
      this.logger.error('Failed to load suggested connections', err);
    }
  }

  /**
   * Complete the onboarding and submit data to backend.
   */
  async completeOnboarding(): Promise<void> {
    this._isLoading.set(true);
    this._error.set(null);
    this.logger.info('Completing agent onboarding');
    this.breadcrumb.trackStateChange('agent-onboarding:completing');

    try {
      const payload: AgentOnboardingPayload = {
        program: this._programData() ?? undefined,
        goals: this._goals(),
        connectionIds: this._connections().map((c) => c.id),
        completedAt: new Date().toISOString(),
      };

      // TODO: Wire to actual API
      this.logger.info('Onboarding payload', { payload });
      await new Promise((resolve) => setTimeout(resolve, 500));

      this._isComplete.set(true);
      this._needsOnboarding.set(false);
      this.logger.info('Agent onboarding completed');
      this.analytics?.trackEvent(APP_EVENTS.AGENT_ONBOARDING_COMPLETED, {
        goalsCount: payload.goals.length,
        connectionsCount: payload.connectionIds.length,
        hasProgram: !!payload.program,
      });
      this.breadcrumb.trackStateChange('agent-onboarding:completed');
    } catch (err) {
      this.logger.error('Failed to complete onboarding', err);
      this._error.set(err instanceof Error ? err.message : 'Failed to complete onboarding');
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Mark onboarding as not needed (user already completed it).
   */
  markAsCompleted(): void {
    this._needsOnboarding.set(false);
    this._isComplete.set(true);
  }

  /**
   * Reset onboarding state (for testing/re-onboarding).
   */
  reset(): void {
    this._currentStepIndex.set(0);
    this._isComplete.set(false);
    this._isLoading.set(false);
    this._error.set(null);
    this._programData.set(null);
    this._goals.set([]);
    this._connections.set([]);
    this._programSearchResults.set([]);
    this._connectionSearchResults.set([]);
    this._suggestedConnections.set([]);
    this._needsOnboarding.set(true);
    this.logger.info('Agent onboarding reset');
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private trackStepView(): void {
    const step = this.currentStepId();
    this.analytics?.trackEvent(APP_EVENTS.AGENT_ONBOARDING_STEP_VIEWED, { step });
    this.breadcrumb.trackStateChange(`agent-onboarding:viewing-${step}`);
  }
}
