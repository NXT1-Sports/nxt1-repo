/**
 * @fileoverview Onboarding Component - UI Layer Only
 * @module @nxt1/web/features/auth
 *
 * Enterprise-grade onboarding wizard using:
 * - Shared state machine from @nxt1/core/api/onboarding (ALL business logic)
 * - Shared UI components from @nxt1/ui/onboarding
 *
 * Architecture (2026 Best Practice):
 * ┌────────────────────────────────────────────────────────────┐
 * │                   @nxt1/ui/onboarding                      │
 * │    OnboardingRoleSelection, ProgressBar, StepCard, etc.    │
 * ├────────────────────────────────────────────────────────────┤
 * │              OnboardingComponent (THIS FILE)               │
 * │     UI ONLY: Renders state, handles platform concerns      │
 * ├────────────────────────────────────────────────────────────┤
 * │        ⭐ createOnboardingStateMachine() from @nxt1/core ⭐ │
 * │     ALL LOGIC: State transitions, validation, navigation   │
 * ├────────────────────────────────────────────────────────────┤
 * │                  @nxt1/core/api/onboarding                 │
 * │         Pure functions, types, step configurations         │
 * └────────────────────────────────────────────────────────────┘
 *
 * This component is THIN (~800 lines) because:
 * - State machine logic lives in @nxt1/core (portable to mobile)
 * - UI components live in @nxt1/ui (shared with mobile)
 * - Only platform-specific code remains here (geolocation, file upload, SEO)
 *
 * Route: /auth/onboarding
 *
 * ⭐ SHARES STATE MACHINE WITH mobile/onboarding.page.ts ⭐
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
  ViewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

// Shared UI Components
import { AuthShellComponent } from '@nxt1/ui/auth/auth-shell';
import { AuthTitleComponent } from '@nxt1/ui/auth/auth-title';
import { AuthSubtitleComponent } from '@nxt1/ui/auth/auth-subtitle';
import { OnboardingRoleSelectionComponent } from '@nxt1/ui/onboarding/onboarding-role-selection';
import { OnboardingProfileStepComponent } from '@nxt1/ui/onboarding/onboarding-profile-step';
import { OnboardingTeamStepComponent } from '@nxt1/ui/onboarding/onboarding-team-step';
import { OnboardingSportStepComponent } from '@nxt1/ui/onboarding/onboarding-sport-step';
import { OnboardingPositionStepComponent } from '@nxt1/ui/onboarding/onboarding-position-step';
import { OnboardingContactStepComponent } from '@nxt1/ui/onboarding/onboarding-contact-step';
import { OnboardingReferralStepComponent } from '@nxt1/ui/onboarding/onboarding-referral-step';
import { OnboardingProgressBarComponent } from '@nxt1/ui/onboarding/onboarding-progress-bar';
import { OnboardingNavigationButtonsComponent } from '@nxt1/ui/onboarding/onboarding-navigation-buttons';
import { OnboardingButtonMobileComponent } from '@nxt1/ui/onboarding/onboarding-button-mobile';
import {
  OnboardingStepCardComponent,
  type AnimationDirection,
} from '@nxt1/ui/onboarding/onboarding-step-card';
import { OnboardingAgentXTypewriterComponent } from '@nxt1/ui/onboarding/onboarding-agent-x-typewriter';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtThemeService } from '@nxt1/ui/services/theme';

// Core API - Types, State Machine & Constants
import {
  type OnboardingUserType,
  type OnboardingStepId,
  type OnboardingStep,
  type OnboardingFormData,
  type ProfileFormData,
  type ProfileLocationData,
  type TeamFormData,
  type SportFormData,
  type PositionsFormData,
  type ContactFormData,
  type ReferralSourceData,
  ONBOARDING_STEPS,
  AGENT_X_ONBOARDING_MESSAGES as _AGENT_X_ONBOARDING_MESSAGES,
  getAgentXMessage,
  // ⭐ SHARED STATE MACHINE - Single source of truth
  createOnboardingStateMachine,
  type OnboardingStateMachine,
  type OnboardingStateSnapshot,
  type OnboardingMachineEvent,
  type OnboardingMachineSession as _OnboardingMachineSession,
  // Session persistence
  createOnboardingSessionApi as _createOnboardingSessionApi,
  type OnboardingSession as _OnboardingSession,
  // State machine types (shared with mobile)
  type OnboardingMachineState,
  type StepAnimationDirection as _StepAnimationDirection,
  type PartialOnboardingFormData,
  serializeSession,
  deserializeSession,
} from '@nxt1/core/api';
import { AUTH_ROUTES, AUTH_REDIRECTS as _AUTH_REDIRECTS } from '@nxt1/core/constants';
import { createBrowserStorageAdapter, STORAGE_KEYS as _STORAGE_KEYS } from '@nxt1/core/storage';

// Geolocation - Cross-platform location detection
import {
  createGeolocationService,
  BrowserGeolocationAdapter,
  NominatimGeocodingAdapter,
  CachedGeocodingAdapter,
  type GeolocationService,
  GEOLOCATION_DEFAULTS,
} from '@nxt1/core/geolocation';

// App Services
import {
  AuthFlowService,
  AuthErrorHandler,
  AuthApiService,
  OnboardingAnalyticsService,
} from '../../services';
import type { OnboardingProfileData } from '@nxt1/core/auth';
import { SeoService } from '../../../../core/services';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import type { ILogger } from '@nxt1/core/logging';

// Types are imported directly from @nxt1/core/api - no local aliases needed

// ============================================
// CONSTANTS
// ============================================

/** Session storage key for machine session */
const MACHINE_SESSION_KEY = 'nxt1_onboarding_machine_session';

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
    OnboardingAgentXTypewriterComponent,
  ],
  template: `
    <nxt1-auth-shell
      variant="onboarding"
      [showLogo]="true"
      [showBackButton]="canGoBack()"
      [mobileFooterPadding]="isMobile()"
      (backClick)="onBack()"
    >
      <!-- Desktop: Title & Subtitle shown in branding panel (left side) -->
      <nxt1-auth-title authTitle testId="onboarding-title">
        {{ currentStep().title || 'Loading...' }}
      </nxt1-auth-title>
      <nxt1-auth-subtitle authSubtitle testId="onboarding-subtitle">
        <nxt1-onboarding-agent-x-typewriter [message]="agentXMessage()" />
      </nxt1-auth-subtitle>

      <!-- Mobile: Title & Subtitle shown in form panel (top) -->
      <div authTitleMobile class="nxt1-mobile-titles">
        <nxt1-onboarding-agent-x-typewriter [message]="agentXMessage()" />
        <h1 class="text-text-primary mt-2 mb-2 text-2xl font-bold">
          {{ currentStep().title || 'Loading...' }}
        </h1>
      </div>

      <!-- Main Content (Form Panel) -->
      <div authContent class="flex flex-col">
        <!-- Progress Indicator (shown throughout flow) -->
        <nxt1-onboarding-progress-bar
          [steps]="steps()"
          [currentStepIndex]="currentStepIndex()"
          [completedStepIds]="completedStepIds()"
          (stepClick)="goToStep($event)"
        />

        <!-- Step Content Container -->
        <div class="nxt1-step-content">
          <!-- Step Card Container with Animations -->
          <nxt1-onboarding-step-card
            variant="seamless"
            [error]="error()"
            [animationDirection]="animationDirection()"
            [animationKey]="currentStep().id || 'loading'"
          >
            <!-- Step 1: Role Selection -->
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
                #profileStep
                [profileData]="profileFormData()"
                [disabled]="isLoading()"
                [showGender]="true"
                [showLocation]="true"
                [showClassYear]="false"
                (profileChange)="onProfileChange($event)"
                (photoSelect)="onPhotoSelect()"
                (fileSelected)="onFileSelected($event)"
                (locationRequest)="onLocationRequest()"
              />
            }

            <!-- Step 2: Team (School) -->
            @if (currentStep().id === 'school') {
              <nxt1-onboarding-team-step
                [teamData]="teamFormData()"
                [disabled]="isLoading()"
                (teamChange)="onTeamChange($event)"
              />
            }

            <!-- Step 3: Sport Selection -->
            @if (currentStep().id === 'sport') {
              <nxt1-onboarding-sport-step
                [sportData]="sportFormData()"
                [role]="selectedRole()"
                [disabled]="isLoading()"
                (sportChange)="onSportChange($event)"
              />
            }

            <!-- Step 4: Position Selection -->
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

            <!-- Step 4: Referral Source -->
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
      </div>

      <!-- Desktop: Navigation Buttons (in footer - always visible) -->
      <div authFooter class="desktop-footer">
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
        }
        <button
          type="button"
          (click)="onSignOut()"
          class="text-text-tertiary hover:text-error mt-4 text-sm hover:underline"
        >
          Sign out and start over
        </button>
      </div>
    </nxt1-auth-shell>

    <!-- Mobile Web: Professional Sticky Footer -->
    @if (isMobile()) {
      <nxt1-onboarding-button-mobile
        [showSkip]="isCurrentStepOptional()"
        [isLastStep]="isLastStep()"
        [loading]="isLoading()"
        [disabled]="!isCurrentStepValid()"
        (skipClick)="onSkip()"
        (continueClick)="onContinue()"
      />
    }
  `,
  styles: [
    `
      /* ============================================
       STEP CONTENT CONTAINER
       Natural flow layout
       ============================================ */
      .nxt1-step-content {
        /* Natural flow layout */
        width: 100%;

        /* Spacing around content */
        padding: var(--nxt1-spacing-2) 0;
        margin: var(--nxt1-spacing-2) 0 var(--nxt1-spacing-4) 0;
      }

      /* Mobile titles styling — fixed min-height prevents logo from shifting */
      .nxt1-mobile-titles {
        text-align: center;
        padding: var(--nxt1-spacing-2) 0 var(--nxt1-spacing-4) 0;
        min-height: 7rem;
      }

      /* Desktop footer visibility */
      .desktop-footer {
        display: none;
      }

      @media (min-width: 1024px) {
        .desktop-footer {
          display: block;
          padding-top: var(--nxt1-spacing-4);
          border-top: 1px solid var(--nxt1-color-border-subtle);
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
  private readonly themeService = inject(NxtThemeService);
  private readonly onboardingAnalytics = inject(OnboardingAnalyticsService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('Onboarding');

  /** Check if running on mobile (native or mobile web) */
  readonly isMobile = computed(() => this.platform.isMobile());

  // ============================================
  // GEOLOCATION SERVICE (Platform-specific)
  // ============================================

  /** Cross-platform geolocation service with cached reverse geocoding */
  private readonly geolocationService: GeolocationService = createGeolocationService(
    new BrowserGeolocationAdapter(),
    new CachedGeocodingAdapter(new NominatimGeocodingAdapter())
  );

  /** Reference to profile step for location callbacks */
  @ViewChild('profileStep') profileStepRef?: OnboardingProfileStepComponent;

  // ============================================
  // SESSION PERSISTENCE (Platform-specific)
  // ============================================

  /** Browser storage adapter for session persistence */
  private readonly storage = createBrowserStorageAdapter('local');

  // ============================================
  // ⭐ SHARED STATE MACHINE (from @nxt1/core) ⭐
  // All business logic is delegated to this machine
  // ============================================

  /** The portable state machine instance - single source of truth */
  private machine!: OnboardingStateMachine;

  /** Cleanup function for state machine event listener */
  private machineUnsubscribe?: () => void;

  // ============================================
  // UI SIGNALS (Mirror state machine for Angular reactivity)
  // These are kept in sync via machine.addEventListener()
  // ============================================

  /** Current state machine state */
  private readonly _state = signal<OnboardingMachineState>('idle');

  /** Current step index */
  private readonly _currentStepIndex = signal(0);

  /** Selected role (optional last step) */
  readonly selectedRole = signal<OnboardingUserType | null>(null);

  /** Configured steps based on selected role */
  private readonly _steps = signal<OnboardingStep[]>(ONBOARDING_STEPS.athlete);

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

  /** Whether current step passes validation (synced from state machine) */
  private readonly _isCurrentStepValid = signal(true);

  // ============================================
  // COMPUTED SIGNALS (Derived from state)
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

  /** Current step object - always returns a valid step */
  readonly currentStep = computed(() => {
    const steps = this._steps();
    const index = this._currentStepIndex();
    return (
      steps[index] ??
      steps[0] ?? { id: 'profile', title: 'Loading...', subtitle: '', required: true }
    );
  });

  /** Agent X typewriter message for the current step — role-personalised */
  readonly agentXMessage = computed(() => {
    const stepId = this.currentStep().id;
    const role = this.selectedRole();
    return getAgentXMessage(stepId, role);
  });

  /** Whether user can go back */
  readonly canGoBack = computed(() => this._currentStepIndex() > 0);

  /** Whether current step is the last step */
  readonly isLastStep = computed(() => {
    return this._currentStepIndex() === this._steps().length - 1;
  });

  /** Whether current step is optional (but NOT the last step) */
  readonly isCurrentStepOptional = computed(() => {
    if (this.isLastStep()) return false;
    return !this.currentStep().required;
  });

  /** Whether current step is valid (synced from state machine snapshot) */
  readonly isCurrentStepValid = computed(() => this._isCurrentStepValid());

  // ============================================
  // LIFECYCLE
  // ============================================

  /** Track if we've already initialized the onboarding flow */
  private hasInitialized = false;

  constructor() {
    // ⭐ THEME MANAGEMENT: Force light theme during onboarding for optimal UX
    // The light theme provides better readability for form inputs and content
    // Dark theme transition happens on completion for a celebratory reveal
    if (isPlatformBrowser(this.platformId)) {
      this.themeService.setTemporaryOverride('light');
      this.logger.debug('Set temporary light theme override for onboarding');
    }

    // Use effect to initialize the onboarding flow once auth is ready
    effect(() => {
      const isInitialized = this.authFlow.isInitialized();
      const user = this.authFlow.user();

      // Skip if not in browser or already initialized
      if (!isPlatformBrowser(this.platformId) || this.hasInitialized) {
        return;
      }

      // Wait for auth to be initialized and user to be available
      if (!isInitialized || !user) {
        return;
      }

      // Mark as initialized to prevent re-running
      this.hasInitialized = true;

      // Initialize the shared state machine
      this.initializeStateMachine(user.uid);
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
    // Cleanup state machine event listener
    this.machineUnsubscribe?.();
    // End analytics session
    this.onboardingAnalytics.endSession();
  }

  // ============================================
  // STATE MACHINE INITIALIZATION
  // ============================================

  /**
   * Initialize the shared state machine from @nxt1/core
   * This is the SINGLE SOURCE OF TRUTH for all onboarding logic
   */
  private initializeStateMachine(userId: string): void {
    this.logger.info('Initializing shared state machine', { userId });

    // Create the portable state machine
    this.machine = createOnboardingStateMachine({
      userId,
      initialSteps: ONBOARDING_STEPS.athlete,
      debug: false, // Set to true for debugging
      onComplete: async (formData) => {
        // This is called when the machine completes
        // We handle the actual backend save here (platform-specific)
        await this.handleCompletion(formData);
      },
    });

    // Subscribe to state machine events and sync Angular signals
    this.machineUnsubscribe = this.machine.addEventListener((event) => {
      this.handleMachineEvent(event);
    });

    // Try to restore session from localStorage
    const restored = this.tryRestoreSession(userId);

    if (!restored) {
      // No valid session - start fresh
      this.machine.start();
      // Track onboarding started event
      this.trackStarted();
    } else {
      // Session restored - toast shown in tryRestoreSession
    }
  }

  /**
   * Handle events from the state machine and sync Angular signals
   */
  private handleMachineEvent(event: OnboardingMachineEvent): void {
    switch (event.type) {
      case 'STATE_CHANGE':
        // Sync all Angular signals from the state snapshot
        this.syncSignalsFromSnapshot(event.state);
        // Save session after any state change
        this.saveSession();
        break;

      case 'STEP_VIEWED':
        this.trackStepViewed();
        break;

      case 'STEP_COMPLETED':
        this.trackStepCompleted();
        break;

      case 'STEP_SKIPPED':
        this.trackStepSkipped();
        break;

      case 'ROLE_SELECTED':
        this.trackRoleSelected(event.role);
        break;

      case 'STARTED':
        this.logger.debug('Onboarding started', { totalSteps: event.totalSteps });
        break;

      case 'COMPLETED':
        this.logger.info('Onboarding completed');
        break;

      case 'ERROR':
        this.logger.error('Onboarding error', { message: event.message });
        this.trackError(event.message);
        break;

      case 'SESSION_RESTORED':
        this.trackStepViewed();
        this.toast.info('Welcome back! Resuming where you left off.');
        break;
    }
  }

  /**
   * Sync Angular signals from state machine snapshot
   */
  private syncSignalsFromSnapshot(state: OnboardingStateSnapshot): void {
    this._state.set(state.machineState);
    this._currentStepIndex.set(state.currentStepIndex);
    this._steps.set([...state.steps]);
    this._completedSteps.set(new Set(state.completedStepIds));
    this._formData.set({ ...state.formData });
    this.selectedRole.set(state.selectedRole);
    this.isLoading.set(state.isLoading);
    this.error.set(state.error);
    this.animationDirection.set(state.animationDirection as AnimationDirection);
    this._isCurrentStepValid.set(state.isCurrentStepValid);
  }

  // ============================================
  // NAVIGATION (Delegates to state machine)
  // ============================================

  /**
   * Navigate to specific step
   */
  goToStep(index: number): void {
    this.machine.goToStep(index);
  }

  // ============================================
  // USER ACTIONS (Delegates form updates to machine)
  // ============================================

  /**
   * Handle role selection (optional last step)
   */
  onRoleSelect(type: OnboardingUserType): void {
    this.machine.selectRole(type);
    this.logger.info('Role selected', { role: type });
  }

  /**
   * Handle profile data change (Step 1)
   */
  onProfileChange(profileData: ProfileFormData): void {
    this.machine.updateProfile(profileData);
  }

  /**
   * Handle location detection request from profile step.
   * Uses browser geolocation + Nominatim reverse geocoding.
   * (Platform-specific - stays in component)
   */
  async onLocationRequest(): Promise<void> {
    this.logger.info('Location detection requested');

    // Check if geolocation is supported (includes HTTPS check)
    if (!this.geolocationService.isSupported()) {
      const errorMessage =
        typeof window !== 'undefined' && !window.isSecureContext
          ? 'Location requires a secure connection (HTTPS). Please access the site via HTTPS.'
          : 'Location detection is not supported on this device or browser.';
      this.profileStepRef?.setLocationError(errorMessage);
      this.logger.warn('Geolocation not supported', { isSecureContext: window?.isSecureContext });
      return;
    }

    try {
      // Check current permission status first
      const permissionStatus = await this.geolocationService.checkPermission();
      this.logger.debug('Permission status', { status: permissionStatus });

      // If permission is denied, show helpful message
      if (permissionStatus === 'denied') {
        this.profileStepRef?.setLocationError(
          'Location access was previously denied. Please enable location in your browser settings and try again.'
        );
        return;
      }

      // Request location with quick settings
      const result = await this.geolocationService.getCurrentLocation(GEOLOCATION_DEFAULTS.QUICK);

      if (result.success) {
        const { address } = result.data;

        // Map to ProfileLocationData
        const locationData: ProfileLocationData = {
          city: address?.city,
          state: address?.state,
          country: address?.countryCode,
          formatted: address?.formatted,
          isAutoDetected: true,
        };

        // Update profile step
        this.profileStepRef?.setLocation(locationData);

        // Update form data via machine
        const currentProfile = this._formData().profile;
        this.machine.updateProfile({
          ...currentProfile,
          firstName: currentProfile?.firstName || '',
          lastName: currentProfile?.lastName || '',
          location: locationData,
        });

        this.logger.info('Location detected', {
          city: address?.city,
          state: address?.state,
        });
      } else {
        // Handle error with user-friendly messages
        let errorMessage = result.error.message || 'Unable to detect location';

        switch (result.error.code) {
          case 'PERMISSION_DENIED':
            errorMessage =
              'Location permission denied. Please allow location access in your browser and try again.';
            break;
          case 'POSITION_UNAVAILABLE':
            errorMessage =
              'Unable to determine your location. Please check your internet connection and try again.';
            break;
          case 'TIMEOUT':
            errorMessage =
              'Location request timed out. Please try again or enter your location manually.';
            break;
          case 'NOT_SUPPORTED':
            errorMessage = 'Location is not available. Please enter your location manually.';
            break;
        }

        this.profileStepRef?.setLocationError(errorMessage);
        this.logger.warn('Location detection failed', { error: result.error });
      }
    } catch (err) {
      this.profileStepRef?.setLocationError(
        'An unexpected error occurred. Please try again or enter your location manually.'
      );
      this.logger.error('Location detection error', err);
    }
  }

  /**
   * Handle team data change (Step 2)
   */
  onTeamChange(teamData: TeamFormData): void {
    this.machine.updateTeam(teamData);
  }

  /**
   * Handle sport data change (Step 4)
   */
  onSportChange(sportData: SportFormData): void {
    this.machine.updateSport(sportData);
  }

  /**
   * Handle position data change (Step 5)
   */
  onPositionChange(positionData: PositionsFormData): void {
    this.machine.updatePositions(positionData);
  }

  /**
   * Handle contact data change (Step 6)
   */
  onContactChange(contactData: ContactFormData): void {
    this.machine.updateContact(contactData);
  }

  /**
   * Handle referral source data change (Step 7 - Final)
   */
  onReferralChange(referralData: ReferralSourceData): void {
    this.machine.updateReferral(referralData);
  }

  /**
   * Handle photo select button click (Platform-specific)
   */
  onPhotoSelect(): void {
    this.logger.debug('Photo select triggered');
  }

  /**
   * Handle file selected from file picker (Platform-specific)
   */
  async onFileSelected(file: File): Promise<void> {
    this.logger.debug('File selected', { name: file.name, size: file.size });

    const user = this.authFlow.user();
    if (!user) {
      this.toast.error('Please login to upload photos');
      return;
    }

    try {
      this.isLoading.set(true);

      // Upload to Firebase Storage
      const photoURL = await this.authFlow.uploadProfilePhoto(file, user.uid);

      // Update profile form data via machine
      const currentProfile = this._formData().profile;
      this.machine.updateProfile({
        firstName: currentProfile?.firstName || '',
        lastName: currentProfile?.lastName || '',
        ...(currentProfile || {}),
        profileImg: photoURL,
      });

      this.toast.success('Photo uploaded successfully!');
    } catch (err) {
      this.logger.error('Failed to upload photo', err);
      this.toast.error('Failed to upload photo. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Handle continue button click (Delegates to machine)
   */
  onContinue(): void {
    this.machine.continue();
  }

  /**
   * Handle skip button click (Delegates to machine)
   */
  onSkip(): void {
    this.machine.skip();
  }

  /**
   * Handle back button click (Delegates to machine)
   */
  onBack(): void {
    this.machine.back();
  }

  /**
   * Handle sign out button click
   */
  async onSignOut(): Promise<void> {
    // Blur to prevent aria-hidden focus warning during navigation
    if (typeof document !== 'undefined') {
      (document.activeElement as HTMLElement)?.blur?.();
    }

    try {
      await this.authFlow.signOut();
      await this.router.navigate([AUTH_ROUTES.ROOT], { replaceUrl: true });
    } catch (err) {
      this.logger.error('Sign out failed', err);
      this.toast.error('Failed to sign out');
    }
  }

  // ============================================
  // COMPLETION HANDLER (Platform-specific backend logic)
  // ============================================

  /**
   * Handle completion - save to backend and navigate
   * Called by state machine's onComplete callback
   */
  private async handleCompletion(formData: OnboardingFormData): Promise<void> {
    const user = this.authFlow.user();
    if (!user) {
      throw new Error('User not authenticated');
    }

    this.logger.info('Completing onboarding for user', { userId: user.uid });
    this.logger.debug('Form data', { formData });

    // Save all onboarding data to backend
    try {
      // Flatten nested form data to match OnboardingProfileData structure
      const sportEntries = formData.sport?.sports || [];
      const primarySport = sportEntries.find((e) => e.isPrimary) || sportEntries[0];
      const nonPrimarySports = sportEntries.filter((e) => !e.isPrimary);
      const secondarySport = nonPrimarySports[0];
      const tertiarySport = nonPrimarySports[1];

      // Map 'recruiter' to 'recruiting-service' for backend API compatibility
      const userType: OnboardingProfileData['userType'] =
        formData.userType === 'recruiter'
          ? 'recruiting-service'
          : (formData.userType as OnboardingProfileData['userType']);

      const profileData = {
        userType,
        firstName: formData.profile?.firstName || '',
        lastName: formData.profile?.lastName || '',
        profileImg: formData.profile?.profileImg || undefined,
        bio: formData.profile?.bio,
        gender: formData.profile?.gender ?? undefined,
        sport: primarySport?.sport,
        secondarySport: secondarySport?.sport,
        tertiarySport: tertiarySport?.sport,
        positions: primarySport?.positions,
        highSchool: primarySport?.team?.name || formData.school?.schoolName,
        highSchoolSuffix: primarySport?.team?.type || formData.school?.schoolType,
        classOf: formData.profile?.classYear ?? formData.school?.classYear ?? undefined,
        state:
          primarySport?.team?.state || formData.school?.state || formData.profile?.location?.state,
        city: primarySport?.team?.city || formData.school?.city || formData.profile?.location?.city,
        zipCode: formData.profile?.location?.zipCode,
        address: formData.profile?.location?.address,
        country: formData.profile?.location?.country,
        teamLogo: formData.school?.teamLogo || primarySport?.team?.logo,
        teamColors: formData.school?.teamColors || primarySport?.team?.colors,
        club: formData.school?.club,
        organization: formData.organization?.organizationName,
        coachTitle: formData.organization?.title,
      };

      await this.authApi.saveOnboardingProfile(user.uid, profileData);
      this.logger.info('Profile data saved successfully');
    } catch (saveError) {
      this.logger.warn('Failed to save profile data, continuing', { error: saveError });
    }

    // Save referral source
    if (formData.referralSource?.source) {
      try {
        await this.authApi.saveReferralSource(user.uid, {
          source: formData.referralSource.source,
          details: formData.referralSource.details,
          clubName: formData.referralSource.clubName,
          otherSpecify: formData.referralSource.otherSpecify,
        });

        this.onboardingAnalytics.trackReferralSourceSubmitted({
          source: formData.referralSource.source,
          details: formData.referralSource.details,
          clubName: formData.referralSource.clubName,
          otherSpecify: formData.referralSource.otherSpecify,
        });

        this.logger.info('Referral source saved successfully');
      } catch (referralError) {
        this.logger.warn('Failed to save referral source, continuing', { error: referralError });
      }
    }

    // Mark onboarding complete
    console.log('📝 [Onboarding] Calling completeOnboarding API', { uid: user.uid });
    const result = await this.authApi.completeOnboarding(user.uid);
    console.log('✅ [Onboarding] API Response', { result });

    // CRITICAL: Wait a bit for backend to persist
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Force clear ALL cache to ensure fresh fetch
    const { globalAuthUserCache } = await import('@nxt1/core/auth');
    await globalAuthUserCache.clear();
    console.log('🧹 [Onboarding] Cleared all auth cache');

    // Refresh user profile
    await this.authFlow.refreshUserProfile();

    // Verify onboarding status
    const updatedUser = this.authFlow.user();
    console.log('✅ [Onboarding] Complete, user state:', {
      uid: user.uid,
      hasCompletedOnboarding: updatedUser?.hasCompletedOnboarding,
      displayName: updatedUser?.displayName,
    });

    // Clear session from localStorage
    this.clearSession();

    // Track completion
    this.trackCompleted();

    // Blur any focused element
    if (typeof document !== 'undefined') {
      (document.activeElement as HTMLElement)?.blur?.();
    }

    // Navigate to congratulations page
    await this.router.navigate(['/auth/onboarding/congratulations']);
  }

  // ============================================
  // SESSION PERSISTENCE (Platform-specific: localStorage)
  // ============================================

  /**
   * Try to restore session from localStorage
   */
  private tryRestoreSession(userId: string): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;

    try {
      const sessionJson = localStorage.getItem(MACHINE_SESSION_KEY);
      if (!sessionJson) return false;

      const session = deserializeSession(sessionJson);
      if (!session || session.userId !== userId) return false;

      // Check expiry
      if (Date.now() - session.timestamp > SESSION_EXPIRY_MS) {
        localStorage.removeItem(MACHINE_SESSION_KEY);
        return false;
      }

      // Restore to machine
      return this.machine.restoreSession(session);
    } catch (err) {
      this.logger.warn('Failed to restore session', { error: err });
      return false;
    }
  }

  /**
   * Save session to localStorage
   */
  private saveSession(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const session = this.machine.getSession();
      localStorage.setItem(MACHINE_SESSION_KEY, serializeSession(session));
      this.logger.debug('Session saved', { step: this.currentStep().id });
    } catch (err) {
      this.logger.warn('Failed to save session', { error: err });
    }
  }

  /**
   * Clear session from localStorage
   */
  private clearSession(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      localStorage.removeItem(MACHINE_SESSION_KEY);
      this.logger.debug('Session cleared');
    } catch (err) {
      this.logger.warn('Failed to clear session', { error: err });
    }
  }

  // ============================================
  // ANALYTICS TRACKING
  // ============================================

  /**
   * Track onboarding started event
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
   * Track role selected
   */
  private trackRoleSelected(role: OnboardingUserType): void {
    this.onboardingAnalytics.trackRoleSelected(role, this._steps().length);
  }

  /**
   * Track step viewed
   */
  private trackStepViewed(): void {
    const step = this.currentStep();
    if (!step) return;
    this.onboardingAnalytics.trackStepViewed(step, this._steps(), this._currentStepIndex());
  }

  /**
   * Track step completed
   */
  private trackStepCompleted(): void {
    const step = this.currentStep();
    if (!step) return;
    this.onboardingAnalytics.trackStepCompleted(step, this._steps(), this._currentStepIndex());
  }

  /**
   * Track step skipped
   */
  private trackStepSkipped(): void {
    const step = this.currentStep();
    if (!step) return;
    this.onboardingAnalytics.trackStepSkipped(step, this._steps(), this._currentStepIndex());
  }

  /**
   * Track onboarding completed
   */
  private trackCompleted(): void {
    const role = this.selectedRole();
    if (!role) return;

    const formData = this._formData();
    const primarySport =
      formData.sport?.sports?.find((e) => e.isPrimary) || formData.sport?.sports?.[0];

    this.onboardingAnalytics.trackCompleted({
      userType: role,
      totalSteps: this._steps().length,
      sport: primarySport?.sport,
    });
  }

  /**
   * Track onboarding error
   */
  private trackError(errorMessage: string): void {
    this.onboardingAnalytics.trackError(errorMessage, this.currentStep().id);
  }
}
