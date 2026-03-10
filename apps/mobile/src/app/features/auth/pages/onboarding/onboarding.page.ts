/**
 * @fileoverview Onboarding Page - UI Layer Only
 * @module @nxt1/mobile/features/auth
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
 * │                 OnboardingPage (THIS FILE)                 │
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
 * - State machine logic lives in @nxt1/core (shared with web)
 * - UI components live in @nxt1/ui (shared with web)
 * - Only platform-specific code remains here (native geolocation, haptics)
 *
 * Route: /auth/onboarding
 *
 * ⭐ SHARES STATE MACHINE WITH web/onboarding.component.ts ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  effect,
  OnInit,
  OnDestroy,
  ViewChild,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { NavController } from '@ionic/angular/standalone';

// Shared UI Components
import { AuthShellComponent } from '@nxt1/ui';
import {
  OnboardingRoleSelectionComponent,
  OnboardingProfileStepComponent,
  OnboardingLinkDropStepComponent,
  OnboardingTeamStepComponent,
  OnboardingSportStepComponent,
  OnboardingReferralStepComponent,
  OnboardingButtonMobileComponent,
  OnboardingStepCardComponent,
  OnboardingAgentXTypewriterComponent,
  NxtLogoComponent,
  type AnimationDirection,
} from '@nxt1/ui';

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
  type ReferralSourceData,
  type LinkSourcesFormData,
  ONBOARDING_STEPS,
  AGENT_X_ONBOARDING_MESSAGES as _AGENT_X_ONBOARDING_MESSAGES,
  getAgentXMessage,
  // ⭐ SHARED STATE MACHINE - Single source of truth
  createOnboardingStateMachine,
  type OnboardingStateMachine,
  type OnboardingStateSnapshot,
  type OnboardingMachineEvent,
  type OnboardingMachineSession as _OnboardingMachineSession,
  // State machine types (shared with web)
  type OnboardingMachineState,
  type PartialOnboardingFormData,
  serializeSession,
  deserializeSession,
} from '@nxt1/core/api';
import { AUTH_ROUTES } from '@nxt1/core/constants';
import { STORAGE_KEYS } from '@nxt1/core/storage';
import { createNativeStorageAdapter } from '../../../../core/infrastructure/native-storage.adapter';

// Geolocation - Native Capacitor implementation
import {
  createGeolocationService,
  createCapacitorGeolocationAdapter,
  NominatimGeocodingAdapter,
  CachedGeocodingAdapter,
  type GeolocationService,
  GEOLOCATION_DEFAULTS,
} from '@nxt1/core/geolocation';
import { Geolocation } from '@capacitor/geolocation';

// App Services
import {
  AuthFlowService,
  AuthErrorHandler,
  AuthApiService,
  OnboardingAnalyticsService,
} from '../../services';
import { AgentXJobService } from '@nxt1/ui';
import type { OnboardingProfileData } from '@nxt1/core/auth';
import { NxtThemeService } from '@nxt1/ui';
import { HapticsService, NxtToastService, NxtLoggingService } from '@nxt1/ui';
import type { ILogger } from '@nxt1/core/logging';

// Types are imported directly from @nxt1/core/api - no local aliases needed

// ============================================
// CONSTANTS
// ============================================

/** Session storage key for machine session */
const MACHINE_SESSION_KEY = STORAGE_KEYS.ONBOARDING_SESSION;

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
    OnboardingRoleSelectionComponent,
    OnboardingProfileStepComponent,
    OnboardingLinkDropStepComponent,
    OnboardingTeamStepComponent,
    OnboardingSportStepComponent,
    OnboardingReferralStepComponent,
    OnboardingButtonMobileComponent,
    OnboardingStepCardComponent,
    OnboardingAgentXTypewriterComponent,
    NxtLogoComponent,
  ],
  template: `
    <nxt1-auth-shell
      variant="minimal"
      [showLogo]="false"
      [showBackButton]="canGoBack()"
      [maxWidth]="'560px'"
      [mobileFooterPadding]="true"
      (backClick)="onBack()"
    >
      <div authContent class="nxt1-onboarding-flow">
        <!-- NXT1 logo, left-aligned under back button -->
        <div class="nxt1-onboarding-logo">
          <nxt1-logo size="sm" variant="auth" />
        </div>

        <!-- Agent X typewriter — left-aligned with logo icon -->
        <nxt1-onboarding-agent-x-typewriter
          [message]="agentXMessage()"
          alignment="left"
          [showLogo]="true"
        />

        <!-- Step content appears after Agent X finishes typing -->
        @if (contentReady()) {
          <nxt1-onboarding-step-card
            variant="seamless"
            [error]="error()"
            [animationDirection]="animationDirection()"
            [animationKey]="currentStep().id"
          >
            <!-- Step 1: Role Selection -->
            @if (currentStep().id === 'role') {
              <nxt1-onboarding-role-selection
                [selectedRole]="selectedRole()"
                [disabled]="isLoading()"
                variant="list-row"
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
                variant="list-row"
                (profileChange)="onProfileChange($event)"
                (photoSelect)="onPhotoSelect()"
                (fileSelected)="onFileSelected($event)"
                (locationRequest)="onLocationRequest()"
              />
            }

            <!-- Step 3: Link Data Sources (Connected Accounts) -->
            @if (currentStep().id === 'link-sources') {
              <nxt1-onboarding-link-drop-step
                [linkSourcesData]="linkSourcesFormData()"
                [selectedSports]="selectedSportNames()"
                [role]="selectedRole()"
                [disabled]="isLoading()"
                (linkSourcesChange)="onLinkSourcesChange($event)"
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
                variant="list-row"
                (sportChange)="onSportChange($event)"
              />
            }

            <!-- Step 4: Referral Source -->
            @if (currentStep().id === 'referral-source') {
              <nxt1-onboarding-referral-step
                [referralData]="referralFormData()"
                [disabled]="isLoading()"
                variant="list-row"
                (referralChange)="onReferralChange($event)"
              />
            }

            <!-- Future Steps -->
            @if (
              currentStep().id !== 'role' &&
              currentStep().id !== 'profile' &&
              currentStep().id !== 'link-sources' &&
              currentStep().id !== 'school' &&
              currentStep().id !== 'sport' &&
              currentStep().id !== 'referral-source'
            ) {
              <div class="py-12 text-center">
                <p class="text-text-secondary">
                  {{ currentStep().title || 'Step' }} coming soon...
                </p>
              </div>
            }
          </nxt1-onboarding-step-card>
        }
      </div>
    </nxt1-auth-shell>

    <!-- Mobile: Sticky Footer — fades in when content is ready -->
    <div class="nxt1-onboarding-footer" [class.nxt1-onboarding-footer--visible]="footerVisible()">
      <nxt1-onboarding-button-mobile
        [totalSteps]="totalSteps()"
        [currentStepIndex]="currentStepIndex()"
        [completedStepIndices]="completedStepIndices()"
        [showSkip]="isCurrentStepOptional()"
        [isLastStep]="isLastStep()"
        [loading]="isLoading()"
        [disabled]="!isCurrentStepValid() || !contentReady()"
        [showSignOut]="true"
        (skipClick)="onSkip()"
        (continueClick)="onContinue()"
        (signOutClick)="onSignOut()"
      />
    </div>
  `,
  styles: [
    `
      .onboarding-page {
        --background: var(--nxt1-color-bg-primary);
      }

      .nxt1-onboarding-flow {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        width: 100%;
      }

      .nxt1-onboarding-logo {
        margin-top: var(--nxt1-spacing-4, 16px);
        margin-bottom: var(--nxt1-spacing-5, 20px);
      }

      .nxt1-onboarding-footer {
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
      }

      .nxt1-onboarding-footer--visible {
        opacity: 1;
        pointer-events: auto;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingPage implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly navController = inject(NavController);
  private readonly authFlow = inject(AuthFlowService);
  private readonly agentXJobService = inject(AgentXJobService);
  private readonly authApi = inject(AuthApiService);
  private readonly errorHandler = inject(AuthErrorHandler);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly analytics = inject(OnboardingAnalyticsService);
  private readonly themeService = inject(NxtThemeService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('Onboarding');

  // ============================================
  // GEOLOCATION SERVICE (Platform-specific: Native Capacitor)
  // ============================================

  /** Native geolocation service with cached reverse geocoding */
  private readonly geolocationService: GeolocationService = createGeolocationService(
    createCapacitorGeolocationAdapter(Geolocation),
    new CachedGeocodingAdapter(new NominatimGeocodingAdapter())
  );

  /** Reference to profile step for location callbacks */
  @ViewChild('profileStep') profileStepRef?: OnboardingProfileStepComponent;

  /** Reference to Agent X typewriter for content timing */
  private readonly typewriterRef = viewChild(OnboardingAgentXTypewriterComponent);

  /** Latching signal — once footer is shown it stays shown */
  private readonly _footerVisible = signal(false);
  readonly footerVisible = computed(() => this._footerVisible());

  /** Content becomes visible after Agent X finishes typing */
  readonly contentReady = computed(() => {
    const tw = this.typewriterRef();
    if (!tw) return false;
    return !tw.isTyping();
  });

  // ============================================
  // SESSION PERSISTENCE (Platform-specific: Capacitor Preferences)
  // ============================================

  /** Native storage adapter for session persistence */
  private readonly storage = createNativeStorageAdapter();

  // ============================================
  // ⭐ SHARED STATE MACHINE (from @nxt1/core) ⭐
  // All business logic is delegated to this machine
  // ============================================

  /** The portable state machine instance - single source of truth */
  private machine!: OnboardingStateMachine;

  /** Cleanup function for state machine event listener */
  private machineUnsubscribe?: () => void;

  /** Track if we've already initialized the onboarding flow */
  hasInitialized = false;

  constructor() {
    // ⭐ THEME MANAGEMENT: Force light theme during onboarding for optimal UX
    // The light theme provides better readability for form inputs and content
    // Dark theme transition happens on completion for a celebratory reveal
    this.themeService.setTemporaryOverride('light');
    this.logger.debug('Set temporary light theme override for onboarding');

    // Latch footer visible once content is first ready (never hides again)
    effect(() => {
      if (this.contentReady()) {
        this._footerVisible.set(true);
      }
    });

    // Initialization moved to ngOnInit to avoid circular dependency NG0203
  }

  ngOnInit(): void {
    // Poll for auth to be ready (fixes timing issue with Firebase auth state)
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max

    const checkAuth = () => {
      attempts++;

      if (this.hasInitialized) {
        return; // Already initialized
      }

      const isAuthReady = this.authFlow.isInitialized();
      const user = this.authFlow.user();

      if (!isAuthReady || !user) {
        if (attempts >= maxAttempts) {
          this.logger.error('[OnboardingPage] Timeout waiting for auth');
          this.navController.navigateRoot('/auth');
          return;
        }
        setTimeout(checkAuth, 100);
        return;
      }

      // Initialize state machine
      this.hasInitialized = true;
      this.initializeStateMachine(user.uid);
    };

    checkAuth();
  }

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

  /** Selected sport display names (e.g. ["Football", "Basketball Mens"]) */
  readonly selectedSportNames = computed(() => {
    const sport = this.sportFormData();
    return sport?.sports?.map((s) => s.sport) ?? [];
  });

  /** Link sources data computed from _formData */
  readonly linkSourcesFormData = computed(() => this._formData().linkSources ?? null);

  /** Referral source form data computed from _formData */
  readonly referralFormData = computed(() => this._formData().referralSource ?? null);

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

  /** Completed step indices (0-based) for progress indicator */
  readonly completedStepIndices = computed(() => {
    const completedIds = this._completedSteps();
    const steps = this._steps();
    return steps
      .map((step, index) => (completedIds.has(step.id) ? index : -1))
      .filter((index) => index >= 0);
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  // ngOnInit(): void {
  //   // Initialize analytics session tracking
  //   this.analytics.initialize();
  // }

  ngOnDestroy(): void {
    // Cleanup state machine event listener
    this.machineUnsubscribe?.();
    // Cleanup analytics listeners
    this.analytics.cleanup();
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
      debug: false,
      onComplete: async (formData) => {
        await this.handleCompletion(formData);
      },
    });

    // Subscribe to state machine events and sync Angular signals
    this.machineUnsubscribe = this.machine.addEventListener((event) => {
      this.handleMachineEvent(event);
    });

    // Try to restore session from Capacitor storage
    this.tryRestoreSession(userId).then((restored) => {
      if (!restored) {
        // No valid session - start fresh
        this.machine.start();
        // Track onboarding started
        this.trackStarted();
      }
    });
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
        void this.saveSession();
        break;

      case 'STEP_VIEWED':
        this.trackStepViewed(event.stepId, event.stepIndex);
        break;

      case 'STEP_COMPLETED':
        this.trackStepCompleted(event.stepId, event.stepIndex);
        if (event.stepId === 'link-sources') {
          this.triggerLinkSourcesScrape();
        }
        break;

      case 'STEP_SKIPPED':
        this.trackStepSkipped(event.stepId, event.stepIndex);
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

      case 'SESSION_RESTORED': {
        const step = this._steps()[event.stepIndex];
        if (step) {
          this.trackStepViewed(step.id, event.stepIndex);
        }
        void this.haptics.impact('light');
        this.toast.info('Welcome back! Resuming where you left off.');
        break;
      }
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
  // USER ACTIONS (Delegates form updates to machine)
  // ============================================

  /**
   * Handle role selection (optional last step)
   */
  async onRoleSelect(type: OnboardingUserType): Promise<void> {
    await this.haptics.selection();
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
   * Uses native Capacitor Geolocation + Nominatim reverse geocoding.
   * (Platform-specific - stays in component)
   */
  async onLocationRequest(): Promise<void> {
    this.logger.info('Location detection requested');
    await this.haptics.selection();

    // Check if geolocation is supported
    if (!this.geolocationService.isSupported()) {
      this.profileStepRef?.setLocationError('Location detection is not supported on this device');
      return;
    }

    try {
      // Check current permission status first
      const currentPermission = await this.geolocationService.checkPermission();
      this.logger.debug('Location permission status', { status: currentPermission });

      // If permission is denied, guide user to Settings
      if (currentPermission === 'denied') {
        await this.haptics.notification('warning');
        this.profileStepRef?.setLocationError(
          'Location permission denied. Please enable in Settings → Privacy → Location Services.'
        );
        return;
      }

      // Request permission if not yet granted
      if (currentPermission !== 'granted') {
        const permission = await this.geolocationService.requestPermission();
        if (permission === 'denied') {
          await this.haptics.notification('warning');
          this.profileStepRef?.setLocationError(
            'Location permission denied. Please enable in Settings to auto-detect your location.'
          );
          return;
        }
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

        // Update profile step with haptic feedback
        await this.haptics.notification('success');
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
        // Handle error with haptic and user-friendly message
        await this.haptics.notification('error');
        let errorMessage = result.error.message || 'Unable to detect location';

        switch (result.error.code) {
          case 'PERMISSION_DENIED':
            errorMessage = 'Location permission denied. Please enable in Settings.';
            break;
          case 'POSITION_UNAVAILABLE':
            errorMessage =
              'Unable to determine your location. Please check that Location Services are enabled.';
            break;
          case 'TIMEOUT':
            errorMessage =
              'Location request timed out. Move to an area with better signal and try again.';
            break;
          case 'NOT_SUPPORTED':
            errorMessage = 'Location services are disabled. Please enable in Settings.';
            break;
        }

        this.profileStepRef?.setLocationError(errorMessage);
        this.logger.warn('Location detection failed', { error: result.error });
      }
    } catch (err) {
      await this.haptics.notification('error');
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
   * Handle sport data change (Step 3)
   */
  onSportChange(sportData: SportFormData): void {
    this.machine.updateSport(sportData);
  }

  /**
   * Handle link sources data change (Step 3)
   */
  onLinkSourcesChange(linkSourcesData: LinkSourcesFormData): void {
    this.machine.updateLinkSources(linkSourcesData);
  }

  /**
   * Handle referral source data change (Step 4)
   */
  onReferralChange(referralData: ReferralSourceData): void {
    this.machine.updateReferral(referralData);
  }

  /**
   * Handle photo select button click (Platform-specific)
   */
  async onPhotoSelect(): Promise<void> {
    await this.haptics.selection();
    this.logger.debug('Photo select triggered - using file input fallback');
  }

  /**
   * Handle file selected from web file picker (Platform-specific)
   */
  async onFileSelected(file: File): Promise<void> {
    this.logger.debug('File selected', { name: file.name, size: file.size });
    // TODO: Upload to Firebase Storage when backend integration is ready
  }

  /**
   * Handle continue button click (Delegates to machine)
   */
  async onContinue(): Promise<void> {
    await this.haptics.impact('medium');
    this.machine.continue();
  }

  /**
   * Handle skip button click (Delegates to machine)
   */
  async onSkip(): Promise<void> {
    await this.haptics.impact('light');
    this.machine.skip();
  }

  /**
   * Handle back button click (Delegates to machine)
   */
  async onBack(): Promise<void> {
    await this.haptics.impact('light');
    this.machine.back();
  }

  /**
   * Handle sign out button click
   */
  async onSignOut(): Promise<void> {
    try {
      await this.haptics.impact('light');
      await this.authFlow.signOut();
      void this.navController.navigateRoot(AUTH_ROUTES.ROOT);
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

    this.logger.info('Completing onboarding', { userId: user.uid });
    this.logger.debug('Form data', { formData: JSON.stringify(formData) });

    // Save all onboarding data to backend
    try {
      const sportEntries = formData.sport?.sports || [];
      const primarySport = sportEntries.find((e) => e.isPrimary) || sportEntries[0];
      const secondarySport = sportEntries.find((e) => !e.isPrimary);

      // Map 'recruiter' to 'recruiting-service' for backend API compatibility
      const userType: OnboardingProfileData['userType'] =
        formData.userType === 'recruiter'
          ? 'recruiting-service'
          : (formData.userType as OnboardingProfileData['userType']);

      const profileData = {
        userType,
        firstName: formData.profile?.firstName || '',
        lastName: formData.profile?.lastName || '',
        profileImg: formData.profile?.profileImgs?.[0] || undefined,
        bio: formData.profile?.bio,
        sport: primarySport?.sport,
        secondarySport: secondarySport?.sport,
        positions: primarySport?.positions,
        highSchool: primarySport?.team?.name || formData.school?.schoolName,
        highSchoolSuffix: primarySport?.team?.type || formData.school?.schoolType,
        classOf: formData.profile?.classYear ?? formData.school?.classYear ?? undefined,
        state: primarySport?.team?.state || formData.school?.state,
        city: primarySport?.team?.city || formData.school?.city,
        club: formData.school?.club,
        organization: formData.organization?.organizationName,
        coachTitle: formData.organization?.title,
        teamLogo: formData.school?.teamLogo || primarySport?.team?.logo,
        teamColors: formData.school?.teamColors || primarySport?.team?.colors,
        linkSources: formData.linkSources,
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

        this.trackReferralSourceSubmitted(formData.referralSource);
        this.logger.info('Referral source saved successfully');
      } catch (referralError) {
        this.logger.warn('Failed to save referral source, continuing', { error: referralError });
      }
    }

    // Mark onboarding complete
    this.logger.debug('Calling completeOnboarding API', { userId: user.uid });
    try {
      await this.authApi.completeOnboarding(user.uid);
    } catch (apiError) {
      this.logger.error('completeOnboarding API failed', apiError);
    }

    // Refresh user profile
    this.logger.debug('Refreshing user profile');
    try {
      await this.authFlow.refreshUserProfile();
    } catch (refreshError) {
      this.logger.error('refreshUserProfile failed', refreshError);
    }

    // Wait for auth state to update (with timeout)
    await this.waitForOnboardingComplete();

    // Clear session from storage
    await this.clearSession();

    // Track completion
    this.trackCompleted();

    // Navigate to congratulations page with haptic feedback (native-feel transition)
    await this.haptics.notification('success');
    this.logger.debug('Navigating to congratulations page');
    await this.navController.navigateForward('/auth/onboarding/congratulations', {
      animated: true,
      animationDirection: 'forward',
    });
  }

  /**
   * Wait for auth state to reflect onboarding completion (with timeout)
   * Uses exponential backoff for efficient polling
   */
  private async waitForOnboardingComplete(maxWaitMs = 2000): Promise<void> {
    const startTime = Date.now();
    let delay = 50;

    while (!this.authFlow.hasCompletedOnboarding() && Date.now() - startTime < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.5, 200); // Exponential backoff, max 200ms
    }
  }

  // ============================================
  // SESSION PERSISTENCE (Platform-specific: Capacitor Preferences)
  // ============================================

  /**
   * Try to restore session from Capacitor storage
   */
  private async tryRestoreSession(userId: string): Promise<boolean> {
    try {
      const sessionJson = await this.storage.get(MACHINE_SESSION_KEY);
      if (!sessionJson) return false;

      const session = deserializeSession(sessionJson);
      if (!session || session.userId !== userId) return false;

      // Check expiry
      if (Date.now() - session.timestamp > SESSION_EXPIRY_MS) {
        await this.storage.remove(MACHINE_SESSION_KEY);
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
   * Save session to Capacitor storage
   */
  private async saveSession(): Promise<void> {
    try {
      const session = this.machine.getSession();
      await this.storage.set(MACHINE_SESSION_KEY, serializeSession(session));
      this.logger.debug('Session saved', {
        step: this.currentStep().id,
        index: session.stepIndex,
      });
    } catch (err) {
      this.logger.warn('Failed to save session', { error: err });
    }
  }

  /**
   * Clear session from Capacitor storage
   */
  private async clearSession(): Promise<void> {
    try {
      await this.storage.remove(MACHINE_SESSION_KEY);
      this.logger.debug('Session cleared');
    } catch (err) {
      this.logger.warn('Failed to clear session', { error: err });
    }
  }

  // ============================================
  // ANALYTICS TRACKING (via OnboardingAnalyticsService)
  // ============================================

  /**
   * Track onboarding started event
   */
  private trackStarted(): void {
    const user = this.authFlow.user();
    if (!user) return;

    const steps = this._steps();
    const firstStep = steps[0];

    this.analytics.trackStarted({
      userId: user.uid,
      totalSteps: steps.length,
      firstStepId: firstStep?.id || 'profile',
    });
  }

  /**
   * Track step viewed event
   */
  private trackStepViewed(stepId: OnboardingStepId, stepIndex: number): void {
    const user = this.authFlow.user();
    if (!user) return;

    const steps = this._steps();
    const step = steps[stepIndex];
    if (!step) return;

    this.analytics.trackStepViewed(step, steps, stepIndex);
  }

  /**
   * Track step completed event
   */
  private trackStepCompleted(stepId: OnboardingStepId, stepIndex: number): void {
    const user = this.authFlow.user();
    if (!user) return;

    const steps = this._steps();
    const step = steps[stepIndex];
    if (!step) return;

    this.analytics.trackStepCompleted(step, steps, stepIndex);
  }

  /**
   * Track step skipped event
   */
  private trackStepSkipped(stepId: OnboardingStepId, stepIndex: number): void {
    const user = this.authFlow.user();
    if (!user) return;

    const steps = this._steps();
    const step = steps[stepIndex];
    if (!step) return;

    this.analytics.trackStepSkipped(step, steps, stepIndex);
  }

  /**
   * Track role selected
   */
  private trackRoleSelected(role: OnboardingUserType): void {
    const user = this.authFlow.user();
    if (!user) return;

    this.analytics.trackRoleSelected(role, this._steps().length);
  }

  /**
   * Track onboarding completed
   */
  private trackCompleted(): void {
    const user = this.authFlow.user();
    if (!user) return;

    const formData = this._formData();
    const sportEntries = formData.sport?.sports || [];
    const primarySport = sportEntries.find((e) => e.isPrimary) || sportEntries[0];

    this.analytics.trackCompleted({
      totalSteps: this._steps().length,
      userType: this.selectedRole() || 'athlete',
      sport: primarySport?.sport,
    });

    this.logger.info('Onboarding completed', {
      userId: user.uid,
      userType: this.selectedRole(),
      totalSteps: this._steps().length,
    });
  }

  /**
   * Fire-and-forget: enqueue an Agent X background job to scrape
   * the user's newly linked accounts. Called on link-sources STEP_COMPLETED.
   */
  private triggerLinkSourcesScrape(): void {
    const formData = this._formData();
    const linkSources = formData.linkSources;

    const connectedSources = linkSources?.links?.filter((l) => l.connected) ?? [];
    if (connectedSources.length === 0) {
      this.logger.info('No linked accounts, skipping Agent X scrape');
      return;
    }

    const user = this.authFlow.user();
    if (!user?.uid) {
      this.logger.warn('No authenticated user, skipping Agent X scrape');
      return;
    }

    const platformNames = connectedSources.map((s) => s.platform).join(', ');
    const intent = `Scrape and analyze linked accounts for new athlete profile: ${platformNames}`;

    const context: Record<string, unknown> = {
      origin: 'onboarding',
      step: 'link-sources',
      role: formData.userType,
      sport: formData.sport?.sports?.[0]?.sport,
      linkedAccounts: connectedSources.map((s) => ({
        platform: s.platform,
        username: s.username,
        url: s.url,
      })),
    };

    this.logger.info('Triggering Agent X link-sources scrape', {
      userId: user.uid,
      platforms: platformNames,
      count: connectedSources.length,
    });

    void this.agentXJobService.enqueue(intent, context).then((result) => {
      if (result) {
        this.logger.info('Agent X scrape job enqueued', {
          jobId: result.jobId,
          operationId: result.operationId,
        });
      }
    });
  }

  /**
   * Track onboarding error
   */
  private trackError(errorMessage: string): void {
    const step = this.currentStep();
    this.analytics.trackError(errorMessage, step.id);
    this.logger.error('Onboarding error', { error: errorMessage, step: step.id });
  }

  /**
   * Track referral source submitted
   */
  private trackReferralSourceSubmitted(data: ReferralSourceData): void {
    this.analytics.trackReferralSourceSubmitted({
      source: data.source,
      details: data.details,
      clubName: data.clubName,
      otherSpecify: data.otherSpecify,
    });
  }
}
