/**
 * @fileoverview Onboarding Page - Profile Setup Flow
 * @module @nxt1/mobile/features/auth
 *
 * Enterprise-grade onboarding wizard using shared components from @nxt1/ui/onboarding.
 * Implements a clean state machine pattern with native haptic feedback.
 *
 * Architecture:
 * ┌────────────────────────────────────────────────────────────┐
 * │                   @nxt1/ui/onboarding                      │
 * │    OnboardingRoleSelection, ProgressBar, StepCard, etc.    │
 * ├────────────────────────────────────────────────────────────┤
 * │                    OnboardingPage (UI)                     │
 * │         Orchestrates state, uses shared components         │
 * ├────────────────────────────────────────────────────────────┤
 * │                  @nxt1/core/api/onboarding                 │
 * │         Pure functions, types, step configurations         │
 * └────────────────────────────────────────────────────────────┘
 *
 * Features:
 * - Session persistence (Capacitor Preferences) for resume capability
 * - Step transition animations (fade + slide)
 * - Native haptic feedback
 * - Unified flow (role = last optional step)
 *
 * Route: /auth/onboarding
 *
 * ⭐ MATCHES WEB'S onboarding.component.ts INTERFACE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';

// Shared UI Components
import { AuthShellComponent, AuthTitleComponent, AuthSubtitleComponent } from '@nxt1/ui';
import {
  OnboardingRoleSelectionComponent,
  OnboardingProfileStepComponent,
  OnboardingTeamStepComponent,
  OnboardingSportStepComponent,
  OnboardingProgressBarComponent,
  OnboardingButtonMobileComponent,
  OnboardingStepCardComponent,
  type AnimationDirection,
} from '@nxt1/ui';

// Core API - Types & Constants
import {
  type OnboardingUserType,
  type OnboardingStepId,
  type OnboardingStep,
  type OnboardingFormData,
  type ProfileFormData,
  type TeamFormData,
  type SportFormData,
  ONBOARDING_STEPS,
  ROLE_SELECTION_STEP,
  validateStep,
  // Session persistence
  createOnboardingSessionApi,
  type OnboardingSession,
} from '@nxt1/core/api';
import { AUTH_ROUTES, AUTH_REDIRECTS } from '@nxt1/core/constants';
import { STORAGE_KEYS } from '@nxt1/core/storage';
import { createNativeStorageAdapter } from '../../../../core/infrastructure/native-storage.adapter';

// App Services
import { AuthFlowService, AuthErrorHandler, AuthApiService } from '../../services';
import { HapticsService, NxtToastService } from '@nxt1/ui';

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

/** Initial steps - role selection is the default starting step */
const DEFAULT_STEPS: OnboardingStep[] = [ROLE_SELECTION_STEP];

/** Session expiry time (24 hours in milliseconds) */
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    IonContent,
    AuthShellComponent,
    AuthTitleComponent,
    AuthSubtitleComponent,
    OnboardingRoleSelectionComponent,
    OnboardingProfileStepComponent,
    OnboardingTeamStepComponent,
    OnboardingSportStepComponent,
    OnboardingProgressBarComponent,
    OnboardingButtonMobileComponent,
    OnboardingStepCardComponent,
  ],
  template: `
    <ion-content class="onboarding-page" [fullscreen]="true">
      <nxt1-auth-shell
        variant="card-glass"
        [showLogo]="true"
        [showBackButton]="canGoBack()"
        [maxWidth]="'560px'"
        [mobileFooterPadding]="true"
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
          <!-- Progress Indicator (shown throughout flow) -->
          <nxt1-onboarding-progress-bar
            [steps]="steps()"
            [currentStepIndex]="currentStepIndex()"
            [completedStepIds]="completedStepIds()"
            (stepClick)="goToStep($event)"
          />

          <!-- Step Card Container with Animations -->
          <nxt1-onboarding-step-card
            [error]="error()"
            [animationDirection]="animationDirection()"
            [animationKey]="currentStep().id"
          >
            <!-- Role Selection (Optional - Last Step) -->
            @if (currentStep().id === 'role') {
              <nxt1-onboarding-role-selection
                [selectedRole]="selectedRole()"
                [disabled]="isLoading()"
                (roleSelected)="onRoleSelect($event)"
              />
            }

            <!-- Step 2: Profile -->
            @if (currentStep().id === 'profile') {
              <nxt1-onboarding-profile-step
                [profileData]="profileFormData()"
                [disabled]="isLoading()"
                [showClassYear]="selectedRole() === 'athlete'"
                (profileChange)="onProfileChange($event)"
                (photoSelect)="onPhotoSelect()"
                (fileSelected)="onFileSelected($event)"
              />
            }

            <!-- Step 3: Team (School) -->
            @if (currentStep().id === 'school') {
              <nxt1-onboarding-team-step
                [teamData]="teamFormData()"
                [disabled]="isLoading()"
                (teamChange)="onTeamChange($event)"
              />
            }

            <!-- Step 4: Sport Selection (uses DEFAULT_SPORTS from @nxt1/core/constants) -->
            @if (currentStep().id === 'sport') {
              <nxt1-onboarding-sport-step
                [sportData]="sportFormData()"
                [disabled]="isLoading()"
                (sportChange)="onSportChange($event)"
              />
            }

            <!-- Future Steps: Organization, Positions, Contact, etc. -->
            @if (
              currentStep().id !== 'role' &&
              currentStep().id !== 'profile' &&
              currentStep().id !== 'school' &&
              currentStep().id !== 'sport'
            ) {
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
                <p class="text-text-secondary">
                  {{ currentStep().title || 'Step' }} coming soon...
                </p>
              </div>
            }
          </nxt1-onboarding-step-card>
        </div>
      </nxt1-auth-shell>
    </ion-content>

    <!-- Mobile: Professional Sticky Footer -->
    <nxt1-onboarding-button-mobile
      [showSkip]="isCurrentStepOptional()"
      [isLastStep]="isLastStep()"
      [loading]="isLoading()"
      [disabled]="!isCurrentStepValid()"
      [showSignOut]="true"
      (skipClick)="onSkip()"
      (continueClick)="onContinue()"
      (signOutClick)="onSignOut()"
    />
  `,
  styles: [
    `
      .onboarding-page {
        --background: var(--nxt1-color-bg-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingPage implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly authFlow = inject(AuthFlowService);
  private readonly authApi = inject(AuthApiService);
  private readonly errorHandler = inject(AuthErrorHandler);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);

  // ============================================
  // SESSION PERSISTENCE
  // ============================================

  /** Native storage adapter for session persistence (uses static Capacitor imports) */
  private readonly storage = createNativeStorageAdapter();

  /** Session API for save/load operations */
  private readonly sessionApi = createOnboardingSessionApi(this.storage);

  /** Track if we've already initialized the onboarding flow */
  private hasInitialized = false;

  constructor() {
    // Use effect to initialize the onboarding flow once auth is ready
    // Note: Route guard (onboardingInProgressGuard) handles auth checks and redirects
    // This effect just initializes the state machine when user data is available
    effect(() => {
      const isInitialized = this.authFlow.isInitialized();
      const user = this.authFlow.user();

      // Skip if already initialized
      if (this.hasInitialized) {
        return;
      }

      // Wait for auth to be initialized and user to be available
      // Guard ensures we only get here with valid auth state
      if (!isInitialized || !user) {
        return;
      }

      // Mark as initialized to prevent re-running
      this.hasInitialized = true;

      // Try to restore session from Capacitor storage
      this.restoreSession(user.uid).then((restored) => {
        if (!restored) {
          // No valid session - start fresh
          this._state.set('role_selection');
          this._currentStepIndex.set(0);
          // Track onboarding started event
          this.trackStarted();
        }
      });
    });
  }

  // ============================================
  // STATE SIGNALS
  // ============================================

  /** Current state machine state */
  private readonly _state = signal<OnboardingState>('idle');

  /** Current step index */
  private readonly _currentStepIndex = signal(0);

  /** Selected role (optional last step) */
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

  /** Animation direction for step transitions */
  readonly animationDirection = signal<AnimationDirection>('none');

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Profile form data computed from _formData */
  readonly profileFormData = computed(() => this._formData().profile ?? null);

  /** Team form data computed from _formData */
  readonly teamFormData = computed(() => this._formData().team ?? null);

  /** Sport form data computed from _formData */
  readonly sportFormData = computed(() => this._formData().sport ?? null);

  /** Current steps array */
  readonly steps = computed(() => this._steps());

  /** Total number of steps */
  readonly totalSteps = computed(() => this._steps().length);

  /** Current step index */
  readonly currentStepIndex = computed(() => this._currentStepIndex());

  /** Completed step IDs set */
  readonly completedStepIds = computed(() => this._completedSteps());

  /** Current step object - always returns a valid step (defaults to first step or role selection) */
  readonly currentStep = computed(() => {
    const steps = this._steps();
    const index = this._currentStepIndex();
    return steps[index] ?? steps[0] ?? ROLE_SELECTION_STEP;
  });

  /** Whether user can go back */
  readonly canGoBack = computed(() => this._currentStepIndex() > 0);

  /** Whether current step is the last step */
  readonly isLastStep = computed(() => {
    // Role selection is never the last step (even if it's the only step in the array initially)
    const currentStep = this.currentStep();
    if (currentStep.id === 'role') return false;
    return this._currentStepIndex() === this._steps().length - 1;
  });

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
    // Auth checking is handled in constructor effect
    // to wait for auth initialization
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
  async goToStep(index: number): Promise<void> {
    if (this.canNavigateToStep(index)) {
      const currentIndex = this._currentStepIndex();
      await this.haptics.impact('light');
      // Set animation direction based on navigation direction
      this.animationDirection.set(index > currentIndex ? 'forward' : 'backward');
      this._currentStepIndex.set(index);
      // Save session after navigation
      void this.saveSession();
    }
  }

  // ============================================
  // USER ACTIONS
  // ============================================

  /**
   * Handle role selection (optional last step)
   */
  async onRoleSelect(type: OnboardingUserType): Promise<void> {
    await this.haptics.selection();
    this.selectedRole.set(type);
    this._formData.update((data) => ({ ...data, userType: type }));

    // Configure steps based on selected role
    this.configureStepsForRole();
  }

  /**
   * Handle profile data change (Step 2)
   */
  onProfileChange(profileData: ProfileFormData): void {
    this._formData.update((data) => ({
      ...data,
      profile: profileData,
    }));
  }

  /**
   * Handle team data change (Step 3)
   */
  onTeamChange(teamData: TeamFormData): void {
    this._formData.update((data) => ({
      ...data,
      team: teamData,
    }));
  }

  /**
   * Handle sport data change (Step 4)
   * Uses DEFAULT_SPORTS from @nxt1/core/constants - no hardcoded values
   */
  onSportChange(sportData: SportFormData): void {
    this._formData.update((data) => ({
      ...data,
      sport: sportData,
    }));
  }

  /**
   * Handle photo select button click (for native photo picker)
   * On mobile, this can trigger the Capacitor Camera plugin
   */
  async onPhotoSelect(): Promise<void> {
    await this.haptics.selection();
    // Note: Native photo picker integration handled by Capacitor Camera plugin
    // The file input fallback in the component handles web file selection
    console.debug('[Onboarding] Photo select triggered - using file input fallback');
  }

  /**
   * Handle file selected from web file picker
   * The component already creates a preview, this is for upload handling
   */
  async onFileSelected(file: File): Promise<void> {
    console.debug('[Onboarding] File selected:', file.name, file.size);
    // TODO: Upload to Firebase Storage when backend integration is ready
    // For now, the component handles preview locally via DataURL
  }

  /**
   * Handle continue button click
   */
  async onContinue(): Promise<void> {
    if (!this.isCurrentStepValid()) return;

    await this.haptics.impact('medium');

    const step = this.currentStep();
    if (!step) return;

    // Mark current step as completed
    this._completedSteps.update((set) => {
      const newSet = new Set(set);
      newSet.add(step.id);
      return newSet;
    });

    // Handle role step specially - reconfigure steps and navigate
    // configureStepsForRole() handles the navigation internally
    if (step.id === 'role') {
      this.configureStepsForRole();
      return; // Already navigated to step 2 in configureStepsForRole
    }

    // Set animation direction for forward navigation
    this.animationDirection.set('forward');

    // Navigate to next step or complete
    if (this.isLastStep()) {
      await this.completeOnboarding();
    } else {
      this._currentStepIndex.update((i) => i + 1);
      // Save session after step completion
      void this.saveSession();
    }
  }

  /**
   * Handle skip button click
   */
  async onSkip(): Promise<void> {
    const step = this.currentStep();
    if (!step || step.required) return;

    await this.haptics.impact('light');

    // Mark as completed without data
    this._completedSteps.update((set) => {
      const newSet = new Set(set);
      newSet.add(step.id);
      return newSet;
    });

    // Set animation direction for forward navigation
    this.animationDirection.set('forward');

    // Navigate to next step or complete
    if (this.isLastStep()) {
      await this.completeOnboarding();
    } else {
      this._currentStepIndex.update((i) => i + 1);
      // Save session after step skip
      void this.saveSession();
    }
  }

  /**
   * Handle back button click
   */
  async onBack(): Promise<void> {
    if (this._currentStepIndex() > 0) {
      await this.haptics.impact('light');
      // Set animation direction for backward navigation
      this.animationDirection.set('backward');
      this._currentStepIndex.update((i) => i - 1);
      // Save session after back navigation
      void this.saveSession();
    }
  }

  /**
   * Handle sign out button click
   * Signs out and redirects to auth page for testing/recovery
   */
  async onSignOut(): Promise<void> {
    try {
      await this.haptics.impact('light');
      await this.authFlow.signOut();
      void this.router.navigate([AUTH_ROUTES.ROOT]);
    } catch (err) {
      console.error('[Onboarding] Sign out failed:', err);
      this.toast.error('Failed to sign out');
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Configure steps based on selected role
   *
   * IMPORTANT: Role selection step is configured at the END (order: 999) as optional.
   * This ensures a unified wizard experience: Profile → Sport → ... → Role (optional).
   */
  private configureStepsForRole(): void {
    const role = this.selectedRole();
    if (!role) {
      console.error('[Onboarding] configureStepsForRole called without selected role');
      return;
    }

    // Get role-specific steps from @nxt1/core
    const roleSteps = ONBOARDING_STEPS[role] ?? ONBOARDING_STEPS.athlete;

    // Filter out role step from roleSteps since we add ROLE_SELECTION_STEP at the beginning
    // This prevents duplicate role steps in the array
    const stepsWithoutRole = roleSteps.filter((step) => step.id !== 'role');

    // Role selection is now at the beginning, other steps follow
    const allSteps = [ROLE_SELECTION_STEP, ...stepsWithoutRole];
    this._steps.set(allSteps);

    // Set animation direction for forward navigation
    this.animationDirection.set('forward');

    // Move to first configured step (profile/team based on role)
    this._currentStepIndex.set(1);

    // Track role selection
    this.trackRoleSelected(role);

    // Save session after role configuration
    void this.saveSession();

    console.info(
      `[Onboarding] Configured ${allSteps.length} total steps (including role) for: ${role}`
    );
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
      // Save form data to backend
      const formData = this._formData() as OnboardingFormData;
      console.info('[Onboarding] Completing onboarding for user:', user.uid);
      console.debug('[Onboarding] Form data:', formData);

      // First, save all onboarding data to backend
      try {
        // Flatten nested form data to match OnboardingProfileData structure
        // v3.0: Extract sport data from SportEntry[] model
        const sportEntries = formData.sport?.sports || [];
        const primarySport = sportEntries.find((e) => e.isPrimary) || sportEntries[0];
        const secondarySport = sportEntries.find((e) => !e.isPrimary);

        const profileData = {
          userType: formData.userType,
          firstName: formData.profile?.firstName || '',
          lastName: formData.profile?.lastName || '',
          profileImg: formData.profile?.profileImg || undefined,
          bio: formData.profile?.bio,
          // v3.0: Sport data from SportEntry
          sport: primarySport?.sport,
          secondarySport: secondarySport?.sport,
          // v3.0: Positions from primary sport entry
          positions: primarySport?.positions,
          // v3.0: Team data from primary sport entry
          highSchool: primarySport?.team?.name || formData.school?.schoolName,
          highSchoolSuffix: primarySport?.team?.type || formData.school?.schoolType,
          classOf: formData.profile?.classYear ?? formData.school?.classYear ?? undefined,
          state: primarySport?.team?.state || formData.school?.state,
          city: primarySport?.team?.city || formData.school?.city,
          // v3.0: Team logo and colors
          teamLogo: primarySport?.team?.logo,
          teamColors: primarySport?.team?.colors,
          // Legacy fields
          club: formData.school?.club,
          organization: formData.organization?.organizationName,
          coachTitle: formData.organization?.title,
        };

        await this.authApi.saveOnboardingProfile(user.uid, profileData);
        console.info('[Onboarding] Profile data saved successfully');
      } catch (saveError) {
        console.warn('[Onboarding] Failed to save profile data, continuing:', saveError);
        // Don't fail the entire onboarding if profile save fails
      }

      // Save referral source to user document + track via GA4
      if (formData.referralSource?.source) {
        try {
          // Save to user document (single source of truth)
          await this.authApi.saveReferralSource(user.uid, {
            source: formData.referralSource.source,
            details: formData.referralSource.details,
            clubName: formData.referralSource.clubName,
            otherSpecify: formData.referralSource.otherSpecify,
          });

          // TODO: Add GA4 tracking when MobileAnalyticsService is implemented
          // this.analytics.trackReferralSourceSubmitted({
          //   source: formData.referralSource.source,
          //   details: formData.referralSource.details,
          //   clubName: formData.referralSource.clubName,
          //   otherSpecify: formData.referralSource.otherSpecify,
          // });

          console.info('[Onboarding] Referral source saved successfully');
        } catch (referralError) {
          console.warn('[Onboarding] Failed to save referral source, continuing:', referralError);
          // Don't fail the entire onboarding if referral save fails
        }
      }

      // Then call backend to mark onboarding complete
      console.log('[Onboarding] Calling completeOnboarding API for user:', user.uid);
      try {
        const completeResponse = await this.authApi.completeOnboarding(user.uid);
        console.log('[Onboarding] completeOnboarding API SUCCESS:', completeResponse);
      } catch (apiError) {
        console.error('[Onboarding] completeOnboarding API FAILED:', apiError);
        // Continue anyway - we'll manually mark as complete
      }

      // Refresh user profile to update hasCompletedOnboarding flag
      console.log('[Onboarding] Calling refreshUserProfile...');
      try {
        await this.authFlow.refreshUserProfile();
        console.log('[Onboarding] refreshUserProfile completed successfully');
      } catch (refreshError) {
        console.error('[Onboarding] refreshUserProfile FAILED:', refreshError);
      }

      // IMPORTANT: Wait for signal to update before navigation
      // Poll until hasCompletedOnboarding is true (with timeout)
      const maxWait = 2000; // 2 seconds max
      const pollInterval = 50; // Check every 50ms
      const startTime = Date.now();

      while (!this.authFlow.hasCompletedOnboarding() && Date.now() - startTime < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      // Debug: Verify state before navigation
      const updatedUser = this.authFlow.user();
      console.log('[Onboarding] User state before navigation:', {
        uid: updatedUser?.uid,
        hasCompletedOnboarding: updatedUser?.hasCompletedOnboarding,
        waitedMs: Date.now() - startTime,
      });

      if (!updatedUser?.hasCompletedOnboarding) {
        console.warn(
          '[Onboarding] hasCompletedOnboarding still false after waiting! Proceeding anyway...'
        );
      }

      // Success haptic feedback
      await this.haptics.notification('success');

      // Clear session from storage - onboarding complete!
      await this.clearSession();

      // Mark state as complete
      this._state.set('complete');

      // Track completion
      this.trackCompleted();

      // Show success toast
      this.toast.success('Profile setup complete! Welcome to NXT1.');

      // Navigate to home - guard will now see hasCompletedOnboarding = true
      // router.navigate() expects path segments (without leading slash), not full URL
      console.log('[Onboarding] Navigating to home');

      try {
        const navigationResult = await this.router.navigate(['home']);
        console.log('[Onboarding] Navigation result:', navigationResult);

        if (!navigationResult) {
          console.error('[Onboarding] Navigation failed, trying navigateByUrl as fallback');
          // Fallback: Use navigateByUrl which accepts full URL string
          await this.router.navigateByUrl(AUTH_REDIRECTS.DEFAULT);
        }
      } catch (navError) {
        console.error('[Onboarding] Navigation error:', navError);
        // Last resort: Force reload to home page
        window.location.href = AUTH_REDIRECTS.DEFAULT;
      }

      console.log('[Onboarding] Navigation completed, current URL:', this.router.url);
    } catch (err) {
      console.error('[Onboarding] Failed to complete:', err);

      // Error haptic feedback
      await this.haptics.notification('error');

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
      step: this.currentStep().id,
    });
  }

  // ============================================
  // SESSION PERSISTENCE
  // ============================================

  /**
   * Save current session state to Capacitor Preferences.
   * Called after each step navigation/completion.
   */
  private async saveSession(): Promise<void> {
    const user = this.authFlow.user();
    if (!user) return;

    try {
      const session: OnboardingSession = this.sessionApi.updateSession(
        this.sessionApi.createSession(user.uid),
        {
          stepIndex: this._currentStepIndex(),
          selectedRole: this.selectedRole(),
          completedSteps: Array.from(this._completedSteps()) as OnboardingStepId[],
          formData: this._formData() as OnboardingFormData,
        }
      );

      await this.sessionApi.saveSession(session);
      console.debug('[Onboarding] Session saved:', {
        step: this.currentStep().id,
        index: session.stepIndex,
      });
    } catch (err) {
      // Non-critical - log but don't interrupt flow
      console.warn('[Onboarding] Failed to save session:', err);
    }
  }

  /**
   * Restore session from Capacitor Preferences.
   * Called during initialization to resume previous progress.
   *
   * @param userId - Current user's ID to verify session belongs to them
   * @returns True if session was restored, false if starting fresh
   */
  private async restoreSession(userId: string): Promise<boolean> {
    try {
      const session = await this.sessionApi.loadValidSession(userId, {
        expiryMs: SESSION_EXPIRY_MS,
      });

      // No valid session found
      if (!session) {
        console.debug('[Onboarding] No valid session found, starting fresh');
        return false;
      }

      // Restore state from session
      console.info('[Onboarding] Restoring session:', {
        index: session.stepIndex,
        role: session.selectedRole,
        completedSteps: session.completedSteps,
      });

      // Restore role if previously selected
      if (session.selectedRole) {
        this.selectedRole.set(session.selectedRole);

        // Reconfigure steps for the role
        const roleSteps = ONBOARDING_STEPS[session.selectedRole] ?? ONBOARDING_STEPS.athlete;
        const allSteps = [ROLE_SELECTION_STEP, ...roleSteps];
        this._steps.set(allSteps);
      }

      // Restore completed steps
      if (session.completedSteps?.length) {
        this._completedSteps.set(new Set(session.completedSteps));
      }

      // Restore form data
      if (session.formData) {
        this._formData.set(session.formData as PartialOnboardingFormData);
      }

      // Restore step index (with validation)
      const maxIndex = this._steps().length - 1;
      const restoredIndex = Math.min(session.stepIndex, maxIndex);
      this._currentStepIndex.set(restoredIndex);

      // Set initial state based on restored step
      const restoredStep = this._steps()[restoredIndex];
      this._state.set((restoredStep?.id ?? 'role') as OnboardingState);

      // No animation on restore
      this.animationDirection.set('none');

      // Light haptic to indicate restored session
      await this.haptics.impact('light');

      // Show toast notifying user of resumed session
      this.toast.info('Welcome back! Resuming where you left off.');

      return true;
    } catch (err) {
      console.warn('[Onboarding] Failed to restore session:', err);
      return false;
    }
  }

  /**
   * Clear session from Capacitor Preferences.
   * Called on successful completion or explicit reset.
   */
  private async clearSession(): Promise<void> {
    try {
      await this.sessionApi.deleteSession(STORAGE_KEYS.ONBOARDING_SESSION);
      console.debug('[Onboarding] Session cleared');
    } catch (err) {
      // Non-critical - log but don't interrupt flow
      console.warn('[Onboarding] Failed to clear session:', err);
    }
  }
}
