/**
 * @fileoverview Onboarding State Machine
 * @module @nxt1/core/api/onboarding
 * @since 2.0.0 - Refactored as single source of truth for web & mobile
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Pure TypeScript state machine for onboarding flow.
 * Shared between web (Angular) and mobile (Ionic/Capacitor) platforms.
 *
 * Architecture:
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                   Components (UI Layer)                     │
 * │       OnboardingComponent / OnboardingPage                  │
 * ├─────────────────────────────────────────────────────────────┤
 * │         ⭐ OnboardingStateMachine (THIS FILE) ⭐            │
 * │    Pure state transitions, validation, form data            │
 * ├─────────────────────────────────────────────────────────────┤
 * │               Platform Services (DOM, haptics)              │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * Features:
 * - Pure TypeScript (no Angular, React, or framework dependencies)
 * - Type-safe state transitions with validation
 * - Session persistence/restoration for resume support
 * - Immutable form data management
 * - Event-driven architecture for UI updates
 * - Analytics event emission hooks
 *
 * @example
 * ```typescript
 * import { createOnboardingStateMachine } from '@nxt1/core/api';
 *
 * const machine = createOnboardingStateMachine({
 *   userId: 'user123',
 *   onComplete: async (formData) => await saveToBackend(formData),
 * });
 *
 * // Subscribe to state changes
 * const unsubscribe = machine.addEventListener((event) => {
 *   if (event.type === 'STATE_CHANGE') {
 *     updateUISignals(event.state);
 *   }
 * });
 *
 * // Navigation
 * machine.start();
 * machine.continue();
 * machine.back();
 * machine.skip();
 *
 * // Form updates
 * machine.updateProfile({ firstName: 'John', lastName: 'Doe' });
 *
 * // Cleanup
 * unsubscribe();
 * ```
 *
 * @author NXT1 Engineering
 */

import type {
  OnboardingUserType,
  OnboardingStepId,
  OnboardingStep,
  OnboardingFormData,
  ProfileFormData,
  TeamFormData,
  SportFormData,
  ReferralSourceData,
  LinkSourcesFormData,
  TeamSelectionFormData,
  CreateTeamProfileFormData,
} from './onboarding-navigation.api';
import { validateStep, ONBOARDING_STEPS, ROLE_SELECTION_STEP } from './onboarding-navigation.api';

// ============================================
// TYPES
// ============================================

/**
 * State machine workflow states
 */
export type OnboardingMachineState =
  | 'idle'
  | 'profile'
  | 'link-sources'
  | 'school'
  | 'organization'
  | 'sport'
  | 'select-teams'
  | 'referral'
  | 'role'
  | 'completing'
  | 'complete'
  | 'error';

/**
 * Animation direction for step transitions
 */
export type StepAnimationDirection = 'none' | 'forward' | 'backward';

/**
 * Partial form data with nullable userType (for initial state)
 */
export interface PartialOnboardingFormData extends Omit<Partial<OnboardingFormData>, 'userType'> {
  userType: OnboardingUserType | null;
}

/**
 * State machine snapshot (read-only)
 */
export interface OnboardingStateSnapshot {
  /** Current workflow state */
  readonly machineState: OnboardingMachineState;

  /** Current step index */
  readonly currentStepIndex: number;

  /** All configured steps */
  readonly steps: readonly OnboardingStep[];

  /** Current step object */
  readonly currentStep: OnboardingStep;

  /** Completed step IDs */
  readonly completedStepIds: ReadonlySet<OnboardingStepId>;

  /** Form data */
  readonly formData: Readonly<PartialOnboardingFormData>;

  /** Selected role (for role step) */
  readonly selectedRole: OnboardingUserType | null;

  /** Whether current step is valid */
  readonly isCurrentStepValid: boolean;

  /** Whether on last step */
  readonly isLastStep: boolean;

  /** Whether can go back */
  readonly canGoBack: boolean;

  /** Whether current step is optional */
  readonly isCurrentStepOptional: boolean;

  /** Loading state */
  readonly isLoading: boolean;

  /** Error message */
  readonly error: string | null;

  /** Animation direction for transitions */
  readonly animationDirection: StepAnimationDirection;
}

/**
 * Events emitted by the state machine
 */
export type OnboardingMachineEvent =
  | { type: 'STATE_CHANGE'; state: OnboardingStateSnapshot }
  | { type: 'STEP_VIEWED'; stepId: OnboardingStepId; stepIndex: number }
  | { type: 'STEP_COMPLETED'; stepId: OnboardingStepId; stepIndex: number }
  | { type: 'STEP_SKIPPED'; stepId: OnboardingStepId; stepIndex: number }
  | { type: 'ROLE_SELECTED'; role: OnboardingUserType }
  | { type: 'STARTED'; totalSteps: number; firstStepId: OnboardingStepId }
  | { type: 'COMPLETED'; formData: OnboardingFormData }
  | { type: 'ERROR'; message: string }
  | { type: 'SESSION_RESTORED'; stepIndex: number };

/**
 * Event listener callback
 */
export type OnboardingEventListener = (event: OnboardingMachineEvent) => void;

/**
 * State machine configuration
 */
export interface OnboardingStateMachineConfig {
  /** User ID for session tracking */
  readonly userId: string;

  /** Initial steps configuration (can change based on role) */
  readonly initialSteps?: readonly OnboardingStep[];

  /**
   * Step IDs to skip (remove from the flow).
   * Used when the user already completed an action outside of onboarding
   * (e.g., joined a team via invite link before reaching onboarding).
   * Applied at initialization and whenever the role changes via selectRole().
   */
  readonly skipStepIds?: readonly OnboardingStepId[];

  /** Callback when state changes */
  readonly onStateChange?: (state: OnboardingStateSnapshot) => void;

  /** Callback when onboarding completes */
  readonly onComplete?: (formData: OnboardingFormData) => Promise<void>;

  /** Enable debug logging */
  readonly debug?: boolean;
}

/**
 * Session data for persistence
 */
export interface OnboardingMachineSession {
  readonly userId: string;
  readonly stepIndex: number;
  readonly completedStepIds: readonly OnboardingStepId[];
  readonly formData: PartialOnboardingFormData;
  readonly selectedRole: OnboardingUserType | null;
  readonly timestamp: number;
}

/**
 * Onboarding state machine interface
 */
export interface OnboardingStateMachine {
  // ============================================
  // STATE ACCESS
  // ============================================

  /** Get current state snapshot */
  getState(): OnboardingStateSnapshot;

  /** Get serializable session for persistence */
  getSession(): OnboardingMachineSession;

  // ============================================
  // NAVIGATION
  // ============================================

  /** Continue to next step (validates current step) */
  continue(): void;

  /** Go back to previous step */
  back(): void;

  /** Skip current step (if optional) */
  skip(): void;

  /** Navigate to specific step (if allowed) */
  goToStep(index: number): boolean;

  /** Check if can navigate to step */
  canNavigateToStep(index: number): boolean;

  // ============================================
  // FORM DATA UPDATES
  // ============================================

  /** Update selected role */
  selectRole(role: OnboardingUserType): void;

  /** Update profile data */
  updateProfile(data: ProfileFormData): void;

  /** Update team/school data */
  updateTeam(data: TeamFormData): void;

  /** Update sport data */
  updateSport(data: SportFormData): void;

  /** Update link sources (connected accounts) data */
  updateLinkSources(data: LinkSourcesFormData): void;

  /** Update team selection data (select-teams step) */
  updateTeamSelection(data: TeamSelectionFormData): void;

  /** Update create team profile data */
  updateCreateTeamProfile(data: CreateTeamProfileFormData): void;

  /** Update referral source data */
  updateReferral(data: ReferralSourceData): void;

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  /** Restore state from session */
  restoreSession(session: OnboardingMachineSession): boolean;

  /** Reset to initial state */
  reset(): void;

  // ============================================
  // LIFECYCLE
  // ============================================

  /** Start the onboarding flow */
  start(): void;

  /** Complete the onboarding flow */
  complete(): Promise<void>;

  /** Set loading state */
  setLoading(loading: boolean): void;

  /** Set error state */
  setError(error: string | null): void;

  // ============================================
  // EVENTS
  // ============================================

  /** Subscribe to events */
  addEventListener(listener: OnboardingEventListener): () => void;

  /** Remove event listener */
  removeEventListener(listener: OnboardingEventListener): void;
}

// ============================================
// CONSTANTS
// ============================================

/** One hour in milliseconds */
const ONE_HOUR_MS = 60 * 60 * 1000;

/** Session expiry time (24 hours) */
const SESSION_EXPIRY_MS = 24 * ONE_HOUR_MS;

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create an onboarding state machine instance
 *
 * @param config - Configuration options
 * @returns State machine instance
 *
 * @example
 * ```typescript
 * const machine = createOnboardingStateMachine({
 *   userId: 'user123',
 *   onStateChange: (state) => {
 *     // Update Angular/React signals here
 *     this._state.set(state.machineState);
 *     this._currentStepIndex.set(state.currentStepIndex);
 *   },
 *   onComplete: async (formData) => {
 *     await this.authApi.saveOnboardingProfile(userId, formData);
 *   },
 * });
 * ```
 */
export function createOnboardingStateMachine(
  config: OnboardingStateMachineConfig
): OnboardingStateMachine {
  const {
    userId,
    initialSteps = ONBOARDING_STEPS.athlete,
    skipStepIds = [],
    onStateChange,
    onComplete,
    debug = false,
  } = config;

  /** Apply skipStepIds filter to a step array */
  const applySkipFilter = (rawSteps: readonly OnboardingStep[]): OnboardingStep[] => {
    if (skipStepIds.length === 0) return [...rawSteps];
    return rawSteps.filter((s) => !skipStepIds.includes(s.id));
  };

  // ============================================
  // INTERNAL STATE
  // ============================================

  let machineState: OnboardingMachineState = 'idle';
  let currentStepIndex = 0;
  let steps: OnboardingStep[] = applySkipFilter(initialSteps);
  let completedStepIds = new Set<OnboardingStepId>();
  let formData: PartialOnboardingFormData = { userType: null };
  let selectedRole: OnboardingUserType | null = null;
  let isLoading = false;
  let error: string | null = null;
  let animationDirection: StepAnimationDirection = 'none';

  const eventListeners = new Set<OnboardingEventListener>();

  // ============================================
  // HELPERS
  // ============================================

  const log = (message: string, data?: unknown) => {
    if (debug) {
      console.debug(`[OnboardingStateMachine] ${message}`, data ?? '');
    }
  };

  const emit = (event: OnboardingMachineEvent) => {
    eventListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('[OnboardingStateMachine] Event listener error:', err);
      }
    });
  };

  const getCurrentStep = (): OnboardingStep => {
    return steps[currentStepIndex] ?? steps[0] ?? ROLE_SELECTION_STEP;
  };

  const isStepValid = (): boolean => {
    const step = getCurrentStep();

    // Role selection step
    if (step.id === 'role') {
      return selectedRole !== null;
    }

    // Use shared validation from @nxt1/core for all other steps
    if (formData.userType) {
      return validateStep(step.id, formData as OnboardingFormData);
    }

    // If no userType yet, allow proceeding (will be set during flow)
    return true;
  };

  const createSnapshot = (): OnboardingStateSnapshot => {
    const step = getCurrentStep();
    return {
      machineState,
      currentStepIndex,
      steps: Object.freeze([...steps]),
      currentStep: step,
      completedStepIds: new Set(completedStepIds),
      formData: { ...formData },
      selectedRole,
      isCurrentStepValid: isStepValid(),
      isLastStep: currentStepIndex === steps.length - 1,
      canGoBack: currentStepIndex > 0,
      isCurrentStepOptional: currentStepIndex < steps.length - 1 && !getCurrentStep().required,
      isLoading,
      error,
      animationDirection,
    };
  };

  const notifyStateChange = () => {
    const snapshot = createSnapshot();
    emit({ type: 'STATE_CHANGE', state: snapshot });
    onStateChange?.(snapshot);
  };

  // ============================================
  // MACHINE IMPLEMENTATION
  // ============================================

  const machine: OnboardingStateMachine = {
    // ============================================
    // STATE ACCESS
    // ============================================

    getState(): OnboardingStateSnapshot {
      return createSnapshot();
    },

    getSession(): OnboardingMachineSession {
      return {
        userId,
        stepIndex: currentStepIndex,
        completedStepIds: Array.from(completedStepIds),
        formData: { ...formData },
        selectedRole,
        timestamp: Date.now(),
      };
    },

    // ============================================
    // NAVIGATION
    // ============================================

    continue(): void {
      const step = getCurrentStep();

      // For optional steps, allow continuing even if the step is not filled in
      // (acts like skip — data just won't be saved for this step)
      if (!isStepValid() && step.required) {
        log('Cannot continue - required step is invalid');
        return;
      }

      // Mark step as completed
      completedStepIds.add(step.id);

      // Emit step completed event
      emit({ type: 'STEP_COMPLETED', stepId: step.id, stepIndex: currentStepIndex });

      // Set animation direction
      animationDirection = 'forward';

      // Navigate to next step or complete
      if (currentStepIndex === steps.length - 1) {
        log('Last step completed, triggering completion');
        void machine.complete();
      } else {
        currentStepIndex++;
        machineState = getCurrentStep().id as OnboardingMachineState;

        // Emit step viewed event
        emit({ type: 'STEP_VIEWED', stepId: getCurrentStep().id, stepIndex: currentStepIndex });

        notifyStateChange();
        log('Moved to step', { index: currentStepIndex, step: getCurrentStep().id });
      }
    },

    back(): void {
      if (currentStepIndex > 0) {
        animationDirection = 'backward';
        currentStepIndex--;
        machineState = getCurrentStep().id as OnboardingMachineState;
        notifyStateChange();
        log('Moved back to step', { index: currentStepIndex, step: getCurrentStep().id });
      }
    },

    skip(): void {
      const step = getCurrentStep();

      // Cannot skip required steps or last step
      if (step.required || currentStepIndex === steps.length - 1) {
        log('Cannot skip - required or last step');
        return;
      }

      // Mark as completed (skipped counts as completed)
      completedStepIds.add(step.id);

      // Emit skipped event
      emit({ type: 'STEP_SKIPPED', stepId: step.id, stepIndex: currentStepIndex });

      // Move to next step
      animationDirection = 'forward';
      currentStepIndex++;
      machineState = getCurrentStep().id as OnboardingMachineState;

      emit({ type: 'STEP_VIEWED', stepId: getCurrentStep().id, stepIndex: currentStepIndex });
      notifyStateChange();
      log('Skipped to step', { index: currentStepIndex, step: getCurrentStep().id });
    },

    goToStep(index: number): boolean {
      if (!machine.canNavigateToStep(index)) {
        log('Cannot navigate to step', { index });
        return false;
      }

      animationDirection = index > currentStepIndex ? 'forward' : 'backward';
      currentStepIndex = index;
      machineState = getCurrentStep().id as OnboardingMachineState;

      emit({ type: 'STEP_VIEWED', stepId: getCurrentStep().id, stepIndex: currentStepIndex });
      notifyStateChange();
      log('Jumped to step', { index, step: getCurrentStep().id });
      return true;
    },

    canNavigateToStep(index: number): boolean {
      if (index < 0 || index >= steps.length) return false;
      if (index === currentStepIndex) return true;

      const targetStep = steps[index];
      if (!targetStep) return false;

      // Can always go back to completed steps
      if (completedStepIds.has(targetStep.id)) return true;

      // Can go to next step if current is valid
      if (index === currentStepIndex + 1 && isStepValid()) return true;

      return false;
    },

    // ============================================
    // FORM DATA UPDATES
    // ============================================

    selectRole(role: OnboardingUserType): void {
      selectedRole = role;
      formData = { ...formData, userType: role };

      // Update steps based on role, applying skip filter
      steps = applySkipFilter(ONBOARDING_STEPS[role] || ONBOARDING_STEPS.athlete);

      emit({ type: 'ROLE_SELECTED', role });
      notifyStateChange();
      log('Role selected', { role, skippedSteps: skipStepIds });
    },

    updateProfile(data: ProfileFormData): void {
      formData = { ...formData, profile: data };
      notifyStateChange();
    },

    updateTeam(data: TeamFormData): void {
      formData = { ...formData, team: data };
      notifyStateChange();
    },

    updateSport(data: SportFormData): void {
      formData = {
        ...formData,
        sport: data,
      };
      notifyStateChange();
    },

    updateLinkSources(data: LinkSourcesFormData): void {
      formData = { ...formData, linkSources: data };
      notifyStateChange();
    },

    updateTeamSelection(data: TeamSelectionFormData): void {
      formData = { ...formData, teamSelection: data };
      notifyStateChange();
    },

    updateCreateTeamProfile(data: CreateTeamProfileFormData): void {
      formData = { ...formData, createTeamProfile: data };
      notifyStateChange();
    },

    updateReferral(data: ReferralSourceData): void {
      formData = { ...formData, referralSource: data };
      notifyStateChange();
    },

    // ============================================
    // SESSION MANAGEMENT
    // ============================================

    restoreSession(session: OnboardingMachineSession): boolean {
      // Validate session
      if (session.userId !== userId) {
        log('Session user mismatch', { expected: userId, got: session.userId });
        return false;
      }

      // Check expiry
      if (Date.now() - session.timestamp > SESSION_EXPIRY_MS) {
        log('Session expired');
        return false;
      }

      // Restore state — re-apply skip filter in case skipStepIds changed since session was saved
      if (session.selectedRole) {
        steps = applySkipFilter(ONBOARDING_STEPS[session.selectedRole] || ONBOARDING_STEPS.athlete);
      }
      currentStepIndex = Math.min(session.stepIndex, steps.length - 1);
      completedStepIds = new Set(session.completedStepIds);
      formData = { ...session.formData };
      selectedRole = session.selectedRole;
      machineState = getCurrentStep().id as OnboardingMachineState;

      emit({ type: 'SESSION_RESTORED', stepIndex: currentStepIndex });
      notifyStateChange();
      log('Session restored', { stepIndex: currentStepIndex });
      return true;
    },

    reset(): void {
      machineState = 'idle';
      currentStepIndex = 0;
      steps = applySkipFilter(initialSteps);
      completedStepIds = new Set();
      formData = { userType: null };
      selectedRole = null;
      isLoading = false;
      error = null;
      animationDirection = 'none';
      notifyStateChange();
      log('Machine reset');
    },

    // ============================================
    // LIFECYCLE
    // ============================================

    start(): void {
      currentStepIndex = 0;
      machineState = getCurrentStep().id as OnboardingMachineState;

      emit({
        type: 'STARTED',
        totalSteps: steps.length,
        firstStepId: getCurrentStep().id,
      });

      emit({
        type: 'STEP_VIEWED',
        stepId: getCurrentStep().id,
        stepIndex: 0,
      });

      notifyStateChange();
      log('Machine started');
    },

    async complete(): Promise<void> {
      if (machineState === 'completing' || machineState === 'complete') {
        log('Already completing/complete');
        return;
      }

      machineState = 'completing';
      isLoading = true;
      error = null;
      notifyStateChange();

      try {
        // Call completion handler
        if (onComplete) {
          await onComplete(formData as OnboardingFormData);
        }

        machineState = 'complete';
        emit({ type: 'COMPLETED', formData: formData as OnboardingFormData });
        log('Onboarding completed');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to complete onboarding';
        error = message;
        machineState = 'error';
        emit({ type: 'ERROR', message });
        log('Completion failed', { error: message });
      } finally {
        isLoading = false;
        notifyStateChange();
      }
    },

    setLoading(loading: boolean): void {
      isLoading = loading;
      notifyStateChange();
    },

    setError(err: string | null): void {
      error = err;
      if (err) {
        emit({ type: 'ERROR', message: err });
      }
      notifyStateChange();
    },

    // ============================================
    // EVENTS
    // ============================================

    addEventListener(listener: OnboardingEventListener): () => void {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },

    removeEventListener(listener: OnboardingEventListener): void {
      eventListeners.delete(listener);
    },
  };

  return machine;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if a session is valid (not expired, correct user)
 */
export function isValidSession(
  session: OnboardingMachineSession | null,
  userId: string
): session is OnboardingMachineSession {
  if (!session) return false;
  if (session.userId !== userId) return false;
  if (Date.now() - session.timestamp > SESSION_EXPIRY_MS) return false;
  return true;
}

/**
 * Serialize session for storage
 */
export function serializeSession(session: OnboardingMachineSession): string {
  return JSON.stringify(session);
}

/**
 * Deserialize session from storage
 */
export function deserializeSession(json: string): OnboardingMachineSession | null {
  try {
    return JSON.parse(json) as OnboardingMachineSession;
  } catch {
    return null;
  }
}
