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
 * Features:
 * - Session persistence (localStorage) for resume capability
 * - Step transition animations (fade + slide)
 * - Unified flow (role = last optional step)
 * - Mobile-ready architecture
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
  effect,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

// Shared UI Components
import { AuthShellComponent, AuthTitleComponent, AuthSubtitleComponent } from '@nxt1/ui';
import {
  OnboardingRoleSelectionComponent,
  OnboardingProfileStepComponent,
  OnboardingTeamStepComponent,
  OnboardingSportStepComponent,
  OnboardingPositionStepComponent,
  OnboardingContactStepComponent,
  OnboardingReferralStepComponent,
  OnboardingProgressBarComponent,
  OnboardingNavigationButtonsComponent,
  OnboardingButtonMobileComponent,
  OnboardingStepCardComponent,
  type AnimationDirection,
} from '@nxt1/ui';
import { NxtToastService, NxtPlatformService } from '@nxt1/ui';

// Core API - Types & Constants
import {
  type OnboardingUserType,
  type OnboardingStepId,
  type OnboardingStep,
  type OnboardingFormData,
  type ProfileFormData,
  type TeamFormData,
  type SportFormData,
  type PositionsFormData,
  type ContactFormData,
  type ReferralSourceData,
  ONBOARDING_STEPS,
  ROLE_SELECTION_STEP,
  validateStep,
  // Session persistence
  createOnboardingSessionApi,
  type OnboardingSession,
} from '@nxt1/core/api';
import { AUTH_ROUTES, AUTH_REDIRECTS } from '@nxt1/core/constants';
import { createBrowserStorageAdapter, STORAGE_KEYS } from '@nxt1/core/storage';

// App Services
import {
  AuthFlowService,
  AuthErrorHandler,
  AuthApiService,
  OnboardingAnalyticsService,
} from '../../services';
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

/** Initial steps - role selection is added at the END of configured flows */
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
    AuthShellComponent,
    AuthTitleComponent,
    AuthSubtitleComponent,
    OnboardingRoleSelectionComponent,
    OnboardingProfileStepComponent,
    OnboardingTeamStepComponent,
    OnboardingSportStepComponent,
    OnboardingPositionStepComponent,
    OnboardingContactStepComponent,
    OnboardingReferralStepComponent,
    OnboardingProgressBarComponent,
    OnboardingNavigationButtonsComponent,
    OnboardingButtonMobileComponent,
    OnboardingStepCardComponent,
  ],
  template: `
    <nxt1-auth-shell
      variant="card-glass"
      [showLogo]="true"
      [showBackButton]="canGoBack()"
      [maxWidth]="'560px'"
      [mobileFooterPadding]="isMobile()"
      (backClick)="onBack()"
    >
      <!-- Title & Subtitle -->
      <nxt1-auth-title authTitle testId="onboarding-title">
        {{ currentStep().title || 'Loading...' }}
      </nxt1-auth-title>
      <nxt1-auth-subtitle authSubtitle testId="onboarding-subtitle">
        {{ currentStep().subtitle || '' }}
      </nxt1-auth-subtitle>

      <!-- Main Content -->
      <div authContent class="flex flex-col">
        <!-- Progress Indicator (shown throughout flow) -->
        <nxt1-onboarding-progress-bar
          [steps]="steps()"
          [currentStepIndex]="currentStepIndex()"
          [completedStepIds]="completedStepIds()"
          (stepClick)="goToStep($event)"
        />

        <!-- Scrollable Step Content Container -->
        <div class="nxt1-step-scroll-container">
          <!-- Step Card Container with Animations -->
          <nxt1-onboarding-step-card
            variant="seamless"
            [error]="error()"
            [animationDirection]="animationDirection()"
            [animationKey]="currentStep().id || 'loading'"
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

            <!-- Step 4: Sport Selection -->
            @if (currentStep().id === 'sport') {
              <nxt1-onboarding-sport-step
                [sportData]="sportFormData()"
                [disabled]="isLoading()"
                (sportChange)="onSportChange($event)"
              />
            }

            <!-- Step 5: Position Selection -->
            @if (currentStep().id === 'positions') {
              <nxt1-onboarding-position-step
                [positionData]="positionFormData()"
                [selectedSport]="selectedSportName()"
                [disabled]="isLoading()"
                (positionChange)="onPositionChange($event)"
              />
            }

            <!-- Step 6: Contact Info -->
            @if (currentStep().id === 'contact') {
              <nxt1-onboarding-contact-step
                [contactData]="contactFormData()"
                [authEmail]="authUserEmail()"
                [disabled]="isLoading()"
                (contactChange)="onContactChange($event)"
              />
            }

            <!-- Step 7: Referral Source (Final Step) -->
            @if (currentStep().id === 'referral-source') {
              <nxt1-onboarding-referral-step
                [referralData]="referralFormData()"
                [disabled]="isLoading()"
                (referralChange)="onReferralChange($event)"
              />
            }

            <!-- Future Steps: Organization, etc. -->
            @if (
              currentStep().id !== 'role' &&
              currentStep().id !== 'profile' &&
              currentStep().id !== 'school' &&
              currentStep().id !== 'sport' &&
              currentStep().id !== 'positions' &&
              currentStep().id !== 'contact' &&
              currentStep().id !== 'referral-source'
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

        <!-- Desktop: Navigation Buttons (fixed below scroll area) -->
        @if (!isMobile()) {
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

          <!-- Desktop: Sign Out Link -->
          <div class="border-border-subtle mt-6 border-t pt-4 text-center">
            <button
              type="button"
              (click)="onSignOut()"
              class="text-text-tertiary hover:text-error text-sm hover:underline"
            >
              Sign out and start over
            </button>
          </div>
        }
      </div>
    </nxt1-auth-shell>

    <!-- Mobile Web: Professional Sticky Footer -->
    @if (isMobile()) {
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
    }
  `,
  styles: [
    `
      /* ============================================
       SCROLLABLE STEP CONTENT CONTAINER
       Fixed-height scroll container - button never moves
       ============================================ */
      .nxt1-step-scroll-container {
        /* FIXED height - prevents button shift */
        height: 320px;

        /* Scrollable content */
        overflow-y: auto;
        overflow-x: hidden;

        /* Smooth scrolling */
        scroll-behavior: smooth;
        -webkit-overflow-scrolling: touch;

        /* Thin scrollbar */
        scrollbar-width: thin;
        scrollbar-color: var(--nxt1-color-border-default) transparent;

        /* Minimal spacing */
        padding: var(--nxt1-spacing-1) 0;
        margin: var(--nxt1-spacing-2) 0;
      }

      /* Custom scrollbar styling (Webkit browsers) */
      .nxt1-step-scroll-container::-webkit-scrollbar {
        width: 4px;
      }

      .nxt1-step-scroll-container::-webkit-scrollbar-track {
        background: transparent;
      }

      .nxt1-step-scroll-container::-webkit-scrollbar-thumb {
        background: var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-full);
      }

      .nxt1-step-scroll-container::-webkit-scrollbar-thumb:hover {
        background: var(--nxt1-color-border-strong);
      }

      /* Mobile: disable fixed height, let content flow naturally */
      @media (max-width: 768px) {
        .nxt1-step-scroll-container {
          height: auto;
          overflow: visible;
          padding: 0;
          margin: var(--nxt1-spacing-2) 0;
        }
      }

      /* Taller screens get more space */
      @media (min-height: 800px) and (min-width: 769px) {
        .nxt1-step-scroll-container {
          height: 380px;
        }
      }

      @media (min-height: 900px) and (min-width: 769px) {
        .nxt1-step-scroll-container {
          height: 440px;
        }
      }

      @media (min-height: 1000px) and (min-width: 769px) {
        .nxt1-step-scroll-container {
          height: 500px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent implements OnInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly authFlow = inject(AuthFlowService);
  private readonly authApi = inject(AuthApiService);
  private readonly errorHandler = inject(AuthErrorHandler);
  private readonly seo = inject(SeoService);
  private readonly toast = inject(NxtToastService);
  private readonly platform = inject(NxtPlatformService);
  private readonly onboardingAnalytics = inject(OnboardingAnalyticsService);

  /** Check if running on mobile (native or mobile web) */
  readonly isMobile = computed(() => this.platform.isMobile());

  // ============================================
  // SESSION PERSISTENCE
  // ============================================

  /** Browser storage adapter for session persistence */
  private readonly storage = createBrowserStorageAdapter('local');

  /** Session API for save/load operations */
  private readonly sessionApi = createOnboardingSessionApi(this.storage);

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

  /** Position form data computed from _formData */
  readonly positionFormData = computed(() => this._formData().positions ?? null);

  /** Contact form data computed from _formData */
  readonly contactFormData = computed(() => this._formData().contact ?? {});

  /** Referral source form data computed from _formData */
  readonly referralFormData = computed(() => this._formData().referralSource ?? null);

  /** User's auth email for contact step default */
  readonly authUserEmail = computed(() => this.authFlow.user()?.email ?? '');

  /** Selected sport name for position step (first sport in array) */
  readonly selectedSportName = computed(() => {
    const sport = this._formData().sport;
    // v3.0: Use sports array (SportEntry[])
    return sport?.sports?.[0]?.sport ?? '';
  });

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

  /** Track if we've already initialized the onboarding flow */
  private hasInitialized = false;

  constructor() {
    // Use effect to initialize the onboarding flow once auth is ready
    // Note: Route guard (onboardingInProgressGuard) handles auth checks and redirects
    // This effect just initializes the state machine when user data is available
    effect(() => {
      const isInitialized = this.authFlow.isInitialized();
      const user = this.authFlow.user();

      // Skip if not in browser or already initialized
      if (!isPlatformBrowser(this.platformId) || this.hasInitialized) {
        return;
      }

      // Wait for auth to be initialized and user to be available
      // Guard ensures we only get here with valid auth state
      if (!isInitialized || !user) {
        return;
      }

      // Mark as initialized to prevent re-running
      this.hasInitialized = true;

      // Try to restore session from localStorage
      this.restoreSession(user.uid).then((restored) => {
        if (!restored) {
          // No valid session - start fresh
          this._state.set('role_selection');
          this._currentStepIndex.set(0);
          // Track onboarding started event
          this.trackStarted();
          // Track initial step view (role selection)
          this.trackStepViewed();
        } else {
          // Restored session - track the resumed step view
          this.trackStepViewed();
        }
      });
    });
  }

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
  }

  ngOnDestroy(): void {
    // End analytics session - this will track abandonment if onboarding wasn't completed
    this.onboardingAnalytics.endSession();
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
      const currentIndex = this._currentStepIndex();
      // Set animation direction based on navigation direction
      this.animationDirection.set(index > currentIndex ? 'forward' : 'backward');
      this._currentStepIndex.set(index);
      // Track step view for analytics funnel
      this.trackStepViewed();
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
  onRoleSelect(type: OnboardingUserType): void {
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
   */
  onSportChange(sportData: SportFormData): void {
    this._formData.update((data) => ({
      ...data,
      sport: sportData,
      // Clear positions when sport changes (positions are sport-specific)
      positions: undefined,
    }));
  }

  /**
   * Handle position data change (Step 5)
   */
  onPositionChange(positionData: PositionsFormData): void {
    this._formData.update((data) => ({
      ...data,
      positions: positionData,
    }));
  }

  /**
   * Handle contact data change (Step 6)
   */
  onContactChange(contactData: ContactFormData): void {
    this._formData.update((data) => ({
      ...data,
      contact: contactData,
    }));
  }

  /**
   * Handle referral source data change (Step 7 - Final)
   */
  onReferralChange(referralData: ReferralSourceData): void {
    this._formData.update((data) => ({
      ...data,
      referralSource: referralData,
    }));
  }

  /**
   * Handle photo select button click
   * On web, the file input handles this automatically
   */
  onPhotoSelect(): void {
    // File input click is triggered by the component
    console.debug('[Onboarding] Photo select triggered');
  }

  /**
   * Handle file selected from file picker
   */
  async onFileSelected(file: File): Promise<void> {
    console.debug('[Onboarding] File selected:', file.name, file.size);

    const user = this.authFlow.user();
    if (!user) {
      this.toast.error('Please login to upload photos');
      return;
    }

    try {
      this.isLoading.set(true);

      // Upload to Firebase Storage
      const photoURL = await this.authFlow.uploadProfilePhoto(file, user.uid);

      // Update profile form data with new photo URL
      this._formData.update((data) => ({
        ...data,
        profile: {
          firstName: data.profile?.firstName || '',
          lastName: data.profile?.lastName || '',
          ...(data.profile || {}),
          profileImg: photoURL,
        },
      }));

      this.toast.success('Photo uploaded successfully!');
    } catch (err) {
      console.error('[Onboarding] Failed to upload photo:', err);
      this.toast.error('Failed to upload photo. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Handle continue button click
   */
  onContinue(): void {
    if (!this.isCurrentStepValid()) return;

    const step = this.currentStep();
    if (!step) return;

    // Track step completion for analytics funnel
    this.trackStepCompleted();

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
      this.completeOnboarding();
    } else {
      this._currentStepIndex.update((i) => i + 1);
      // Track new step view for analytics funnel
      this.trackStepViewed();
      // Save session after step completion
      void this.saveSession();
    }
  }

  /**
   * Handle skip button click
   */
  onSkip(): void {
    const step = this.currentStep();
    if (!step || step.required) return;

    // Track step skipped for analytics funnel
    this.trackStepSkipped();

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
      this.completeOnboarding();
    } else {
      this._currentStepIndex.update((i) => i + 1);
      // Track new step view for analytics funnel
      this.trackStepViewed();
      // Save session after step skip
      void this.saveSession();
    }
  }

  /**
   * Handle back button click
   */
  onBack(): void {
    if (this._currentStepIndex() > 0) {
      // Set animation direction for backward navigation
      this.animationDirection.set('backward');
      this._currentStepIndex.update((i) => i - 1);
      // Track step view when going back
      this.trackStepViewed();
      // Save session after back navigation
      void this.saveSession();
    }
  }

  /**
   * Handle sign out button click
   * Signs out and redirects to auth page for testing
   */
  async onSignOut(): Promise<void> {
    try {
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

    // Track role selection analytics
    this.trackRoleSelected(role);

    // Track new step view (profile step)
    this.trackStepViewed();

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
      // Save complete profile to backend
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

          // Track to GA4 for analytics (replaces HearAbout collection)
          this.onboardingAnalytics.trackReferralSourceSubmitted({
            source: formData.referralSource.source,
            details: formData.referralSource.details,
            clubName: formData.referralSource.clubName,
            otherSpecify: formData.referralSource.otherSpecify,
          });

          console.info('[Onboarding] Referral source saved successfully');
        } catch (referralError) {
          console.warn('[Onboarding] Failed to save referral source, continuing:', referralError);
          // Don't fail the entire onboarding if referral save fails
        }
      }

      // Then call backend to mark onboarding complete
      await this.authApi.completeOnboarding(user.uid);

      // Refresh user profile to update hasCompletedOnboarding flag
      await this.authFlow.refreshUserProfile();

      // Clear session from localStorage - onboarding complete!
      await this.clearSession();

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
   * Track onboarding started event.
   * Called when user first enters the onboarding flow.
   */
  private trackStarted(): void {
    const user = this.authFlow.user();
    if (!user) return;

    this.onboardingAnalytics.startSession(user.uid);
    this.onboardingAnalytics.trackStarted({
      userId: user.uid,
      totalSteps: this._steps().length,
      firstStepId: this.currentStep().id,
    });
  }

  /**
   * Track role selected.
   * Called when user picks their role (athlete, coach, etc.)
   */
  private trackRoleSelected(role: OnboardingUserType): void {
    this.onboardingAnalytics.trackRoleSelected(role, this._steps().length);
  }

  /**
   * Track step viewed.
   * Called when a step becomes visible.
   */
  private trackStepViewed(): void {
    const step = this.currentStep();
    if (!step) return;

    this.onboardingAnalytics.trackStepViewed(step, this._steps(), this._currentStepIndex());
  }

  /**
   * Track step completed.
   * Called when user successfully completes a step.
   */
  private trackStepCompleted(): void {
    const step = this.currentStep();
    if (!step) return;

    this.onboardingAnalytics.trackStepCompleted(step, this._steps(), this._currentStepIndex());
  }

  /**
   * Track step skipped.
   * Called when user skips an optional step.
   */
  private trackStepSkipped(): void {
    const step = this.currentStep();
    if (!step) return;

    this.onboardingAnalytics.trackStepSkipped(step, this._steps(), this._currentStepIndex());
  }

  /**
   * Track onboarding completed successfully.
   */
  private trackCompleted(): void {
    const role = this.selectedRole();
    if (!role) return;

    const formData = this._formData();
    // v3.0: Get sport from SportEntry[] model
    const primarySport =
      formData.sport?.sports?.find((e) => e.isPrimary) || formData.sport?.sports?.[0];
    this.onboardingAnalytics.trackCompleted({
      userType: role,
      totalSteps: this._steps().length,
      sport: primarySport?.sport,
    });
  }

  /**
   * Track onboarding error.
   */
  private trackError(errorMessage: string): void {
    this.onboardingAnalytics.trackError(errorMessage, this.currentStep().id);
  }

  // ============================================
  // SESSION PERSISTENCE
  // ============================================

  /**
   * Save current session state to localStorage.
   * Called after each step navigation/completion.
   */
  private async saveSession(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

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
   * Restore session from localStorage.
   * Called during initialization to resume previous progress.
   *
   * @param userId - Current user's ID to verify session belongs to them
   * @returns True if session was restored, false if starting fresh
   */
  private async restoreSession(userId: string): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) return false;

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

      // Show toast notifying user of resumed session
      this.toast.info('Welcome back! Resuming where you left off.');

      return true;
    } catch (err) {
      console.warn('[Onboarding] Failed to restore session:', err);
      return false;
    }
  }

  /**
   * Clear session from localStorage.
   * Called on successful completion or explicit reset.
   */
  private async clearSession(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      await this.sessionApi.deleteSession(STORAGE_KEYS.ONBOARDING_SESSION);
      console.debug('[Onboarding] Session cleared');
    } catch (err) {
      // Non-critical - log but don't interrupt flow
      console.warn('[Onboarding] Failed to clear session:', err);
    }
  }
}
