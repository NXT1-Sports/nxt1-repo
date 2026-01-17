/**
 * @fileoverview Onboarding Component - State Machine-Based Profile Setup
 * @module @nxt1/web/features/auth
 *
 * Enterprise-grade onboarding wizard using shared components from @nxt1/ui/onboarding.
 * Implements a clean state machine pattern with minimal UI code.
 *
 * Architecture:
 * ┌────────────────────────────────────────────────────────────┐
 * │                   @nxt1/ui/onboarding                      │
 * │    OnboardingRoleSelection, ProgressBar, StepCard, etc.    │
 * ├────────────────────────────────────────────────────────────┤
 * │                 OnboardingComponent (UI)                   │
 * │         Orchestrates state, uses shared components         │
 * ├────────────────────────────────────────────────────────────┤
 * │                  @nxt1/core/api/onboarding                 │
 * │         Pure functions, types, step configurations         │
 * └────────────────────────────────────────────────────────────┘
 *
 * State Machine Steps:
 * 1. Role Selection (Who are you?)
 * 2+ Dynamic steps based on selected role
 *
 * Route: /auth/onboarding
 *
 * ⭐ MATCHES MOBILE'S onboarding.page.ts INTERFACE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

// Shared UI Components
import { AuthShellComponent, AuthTitleComponent, AuthSubtitleComponent } from '@nxt1/ui/auth';
import {
  OnboardingRoleSelectionComponent,
  OnboardingProgressBarComponent,
  OnboardingNavigationButtonsComponent,
  OnboardingStepCardComponent,
} from '@nxt1/ui/onboarding';
import { NxtToastService } from '@nxt1/ui/services';

// Core API - Types & Constants
import {
  type OnboardingUserType,
  type OnboardingStepId,
  type OnboardingStep,
  type OnboardingFormData,
  ONBOARDING_STEPS,
  ROLE_SELECTION_STEP,
  validateStep,
} from '@nxt1/core/api';
import { AUTH_ROUTES, AUTH_REDIRECTS } from '@nxt1/core/constants';

// App Services
import { AuthFlowService, AuthErrorHandler } from '../../services';
import { SeoService } from '../../../../core/services';

// ============================================
// TYPES
// ============================================

/** State machine states - matches step IDs plus workflow states */
type OnboardingState =
  | 'idle'
  | 'role_selection'
  | 'profile'
  | 'school'
  | 'organization'
  | 'sport'
  | 'positions'
  | 'contact'
  | 'referral'
  | 'completing'
  | 'complete';

/** Partial form data with nullable userType for initial state */
interface PartialOnboardingFormData extends Omit<Partial<OnboardingFormData>, 'userType'> {
  userType: OnboardingUserType | null;
}

// ============================================
// CONSTANTS
// ============================================

/** Default steps before role selection */
const DEFAULT_STEPS: OnboardingStep[] = [ROLE_SELECTION_STEP];

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    AuthShellComponent,
    AuthTitleComponent,
    AuthSubtitleComponent,
    OnboardingRoleSelectionComponent,
    OnboardingProgressBarComponent,
    OnboardingNavigationButtonsComponent,
    OnboardingStepCardComponent,
  ],
  template: `
    <nxt1-auth-shell
      variant="card-glass"
      [showLogo]="true"
      [showBackButton]="canGoBack()"
      [maxWidth]="'560px'"
      (backClick)="onBack()"
    >
      <!-- Title & Subtitle -->
      <nxt1-auth-title authTitle testId="onboarding-title">
        {{ currentStep().title }}
      </nxt1-auth-title>
      <nxt1-auth-subtitle authSubtitle testId="onboarding-subtitle">
        {{ currentStep().subtitle }}
      </nxt1-auth-subtitle>

      <!-- Main Content -->
      <div authContent>
        <!-- Progress Indicator -->
        <nxt1-onboarding-progress-bar
          [steps]="steps()"
          [currentStepIndex]="currentStepIndex()"
          [completedStepIds]="completedStepIds()"
          (stepClick)="goToStep($event)"
        />

        <!-- Step Card Container -->
        <nxt1-onboarding-step-card [error]="error()">
          <!-- Step 1: Role Selection -->
          @if (currentStep().id === 'role') {
            <nxt1-onboarding-role-selection
              [selectedRole]="selectedRole()"
              [disabled]="isLoading()"
              (roleSelected)="onRoleSelect($event)"
            />
          }

          <!-- Future Steps: Profile, School, etc. (placeholder for now) -->
          @if (currentStep().id !== 'role') {
            <div class="py-12 text-center">
              <div
                class="bg-surface-200 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
              >
                <svg viewBox="0 0 24 24" fill="none" class="text-text-tertiary h-8 w-8">
                  <path
                    d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <p class="text-text-secondary">{{ currentStep().title }} coming soon...</p>
            </div>
          }
        </nxt1-onboarding-step-card>

        <!-- Navigation Buttons -->
        <nxt1-onboarding-navigation-buttons
          [showSkip]="isCurrentStepOptional()"
          [showBack]="canGoBack()"
          [isLastStep]="isLastStep()"
          [loading]="isLoading()"
          [disabled]="!isCurrentStepValid()"
          (skipClick)="onSkip()"
          (backClick)="onBack()"
          (continueClick)="onContinue()"
        />
      </div>
    </nxt1-auth-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent implements OnInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly authFlow = inject(AuthFlowService);
  private readonly errorHandler = inject(AuthErrorHandler);
  private readonly seo = inject(SeoService);
  private readonly toast = inject(NxtToastService);

  // ============================================
  // STATE SIGNALS
  // ============================================

  /** Current state machine state */
  private readonly _state = signal<OnboardingState>('idle');

  /** Current step index */
  private readonly _currentStepIndex = signal(0);

  /** Selected role (Step 1) */
  readonly selectedRole = signal<OnboardingUserType | null>(null);

  /** Configured steps based on selected role */
  private readonly _steps = signal<OnboardingStep[]>(DEFAULT_STEPS);

  /** Completed step IDs */
  private readonly _completedSteps = signal<Set<OnboardingStepId>>(new Set());

  /** Loading state */
  readonly isLoading = signal(false);

  /** Error message */
  readonly error = signal<string | null>(null);

  /** Form data - uses shared types from @nxt1/core */
  private readonly _formData = signal<PartialOnboardingFormData>({ userType: null });

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Current steps array */
  readonly steps = computed(() => this._steps());

  /** Total number of steps */
  readonly totalSteps = computed(() => this._steps().length);

  /** Current step index */
  readonly currentStepIndex = computed(() => this._currentStepIndex());

  /** Completed step IDs set */
  readonly completedStepIds = computed(() => this._completedSteps());

  /** Current step object - always returns a valid step (defaults to first step) */
  readonly currentStep = computed(() => {
    const steps = this._steps();
    const index = this._currentStepIndex();
    return steps[index] ?? steps[0];
  });

  /** Whether user can go back */
  readonly canGoBack = computed(() => this._currentStepIndex() > 0);

  /** Whether current step is the last step */
  readonly isLastStep = computed(() => this._currentStepIndex() === this._steps().length - 1);

  /** Whether current step is optional */
  readonly isCurrentStepOptional = computed(() => !this.currentStep().required);

  /** Whether current step is valid (can proceed) - uses shared validation from @nxt1/core */
  readonly isCurrentStepValid = computed(() => {
    const step = this.currentStep();
    const formData = this._formData();

    // Role selection step
    if (step.id === 'role') {
      return this.selectedRole() !== null;
    }

    // Use shared validation from @nxt1/core for all other steps
    if (formData.userType) {
      return validateStep(step.id, formData as OnboardingFormData);
    }

    return true;
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    // Set SEO metadata
    this.seo.updatePage({
      title: 'Complete Your Profile',
      description:
        'Complete your NXT1 profile to access personalized features and connect with the sports recruiting community.',
      keywords: [
        'onboarding',
        'profile setup',
        'account setup',
        'athlete profile',
        'coach profile',
      ],
    });

    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // Check if user is authenticated
    const user = this.authFlow.user();
    if (!user) {
      console.warn('[Onboarding] No authenticated user, redirecting to auth');
      void this.router.navigate([AUTH_ROUTES.ROOT]);
      return;
    }

    // Check if user already completed onboarding
    if (user.hasCompletedOnboarding) {
      console.info('[Onboarding] User already completed onboarding, redirecting to home');
      void this.router.navigate([AUTH_REDIRECTS.DEFAULT]);
      return;
    }

    // Initialize state machine to role selection
    this._state.set('role_selection');
    this._currentStepIndex.set(0);

    // Track onboarding started event
    this.trackStarted();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  // ============================================
  // STATE MACHINE METHODS
  // ============================================

  /**
   * Check if step is completed
   */
  isStepCompleted(stepId: OnboardingStepId): boolean {
    return this._completedSteps().has(stepId);
  }

  /**
   * Check if can navigate to a specific step
   */
  canNavigateToStep(index: number): boolean {
    if (index < 0 || index >= this._steps().length) return false;
    if (index === this._currentStepIndex()) return true;

    // Can only navigate to completed steps or next step
    const targetStep = this._steps()[index];
    if (!targetStep) return false;

    // Can always go back to completed steps
    if (this.isStepCompleted(targetStep.id)) return true;

    // Can go to next step if current is completed
    if (index === this._currentStepIndex() + 1) {
      const currentStep = this.currentStep();
      return currentStep
        ? this.isStepCompleted(currentStep.id) || this.isCurrentStepValid()
        : false;
    }

    return false;
  }

  /**
   * Navigate to specific step
   */
  goToStep(index: number): void {
    if (this.canNavigateToStep(index)) {
      this._currentStepIndex.set(index);
    }
  }

  // ============================================
  // USER ACTIONS
  // ============================================

  /**
   * Handle role selection (Step 1)
   */
  onRoleSelect(type: OnboardingUserType): void {
    this.selectedRole.set(type);
    this._formData.update((data) => ({ ...data, userType: type }));
  }

  /**
   * Handle continue button click
   */
  onContinue(): void {
    if (!this.isCurrentStepValid()) return;

    const step = this.currentStep();
    if (!step) return;

    // Mark current step as completed
    this._completedSteps.update((set) => {
      const newSet = new Set(set);
      newSet.add(step.id);
      return newSet;
    });

    // Handle role step specially - reconfigure steps based on selection
    if (step.id === 'role') {
      this.configureStepsForRole();
    }

    // Navigate to next step or complete
    if (this.isLastStep()) {
      this.completeOnboarding();
    } else {
      this._currentStepIndex.update((i) => i + 1);
    }
  }

  /**
   * Handle skip button click
   */
  onSkip(): void {
    const step = this.currentStep();
    if (!step || step.required) return;

    // Mark as completed without data
    this._completedSteps.update((set) => {
      const newSet = new Set(set);
      newSet.add(step.id);
      return newSet;
    });

    // Navigate to next step or complete
    if (this.isLastStep()) {
      this.completeOnboarding();
    } else {
      this._currentStepIndex.update((i) => i + 1);
    }
  }

  /**
   * Handle back button click
   */
  onBack(): void {
    if (this._currentStepIndex() > 0) {
      this._currentStepIndex.update((i) => i - 1);
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Configure steps based on selected role
   */
  private configureStepsForRole(): void {
    const role = this.selectedRole();
    if (!role) {
      console.error('[Onboarding] configureStepsForRole called without selected role');
      return;
    }

    // Use shared step configuration from @nxt1/core
    const steps = ONBOARDING_STEPS[role] ?? ONBOARDING_STEPS.athlete;
    this._steps.set(steps);

    // Track role selection
    this.trackRoleSelected(role);

    console.info(`[Onboarding] Configured ${steps.length} steps for role: ${role}`);
  }

  /**
   * Complete onboarding and redirect
   */
  private async completeOnboarding(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    this._state.set('completing');

    const user = this.authFlow.user();
    if (!user) {
      this.error.set('User not authenticated');
      this.isLoading.set(false);
      void this.router.navigate([AUTH_ROUTES.ROOT]);
      return;
    }

    try {
      // Save form data to backend via auth flow service
      // Note: Backend integration pending - tracking completion only
      console.info('[Onboarding] Completing onboarding for user:', user.uid);
      console.debug('[Onboarding] Form data:', this._formData());

      // Mark state as complete
      this._state.set('complete');

      // Track completion
      this.trackCompleted();

      // Show success toast
      this.toast.success('Profile setup complete! Welcome to NXT1.');

      // Navigate to home
      await this.router.navigate([AUTH_REDIRECTS.DEFAULT]);
    } catch (err) {
      console.error('[Onboarding] Failed to complete:', err);

      // Use shared error handler for consistent messaging
      const handledError = this.errorHandler.handle(err);
      this.error.set(handledError.message);
      this._state.set('role_selection');

      // Show error toast
      this.toast.error(handledError.message);

      // Track error
      this.trackError(handledError.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  // ============================================
  // ANALYTICS TRACKING
  // ============================================

  /**
   * Track onboarding started
   */
  /**
   * Track onboarding started event.
   * Analytics integration: @nxt1/core/api createOnboardingAnalyticsApi
   */
  private trackStarted(): void {
    const user = this.authFlow.user();
    if (!user) return;

    console.debug('[Onboarding] Started:', {
      userId: user.uid,
      totalSteps: this._steps().length,
    });
  }

  /**
   * Track role selected
   */
  private trackRoleSelected(role: OnboardingUserType): void {
    const user = this.authFlow.user();
    if (!user) return;

    console.debug('[Onboarding] Role selected:', {
      userId: user.uid,
      userType: role,
      totalSteps: this._steps().length,
    });
  }

  /**
   * Track onboarding completed
   */
  private trackCompleted(): void {
    const user = this.authFlow.user();
    if (!user) return;

    console.info('[Onboarding] Completed:', {
      userId: user.uid,
      userType: this.selectedRole(),
      totalSteps: this._steps().length,
    });
  }

  /**
   * Track onboarding error
   */
  private trackError(errorMessage: string): void {
    const user = this.authFlow.user();
    console.error('[Onboarding] Error:', {
      userId: user?.uid,
      error: errorMessage,
      step: this.currentStep()?.id,
    });
  }
}
