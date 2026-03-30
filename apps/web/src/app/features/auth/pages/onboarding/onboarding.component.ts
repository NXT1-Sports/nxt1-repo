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
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

// Shared UI Components
import { AuthShellComponent } from '@nxt1/ui/auth/auth-shell';
import { AuthTitleComponent } from '@nxt1/ui/auth/auth-title';
import { AuthSubtitleComponent } from '@nxt1/ui/auth/auth-subtitle';
import { OnboardingRoleSelectionComponent } from '@nxt1/ui/onboarding/onboarding-role-selection';
import { OnboardingProfileStepComponent } from '@nxt1/ui/onboarding/onboarding-profile-step';
import { OnboardingTeamStepComponent } from '@nxt1/ui/onboarding/onboarding-team-step';
import { Nxt1OnboardingCreateTeamStepComponent } from '@nxt1/ui/onboarding/onboarding-create-team-step';
import { OnboardingSportStepComponent } from '@nxt1/ui/onboarding/onboarding-sport-step';
import { OnboardingTeamSelectionStepComponent } from '@nxt1/ui/onboarding/onboarding-team-selection-step';
import type { TeamSearchResult } from '@nxt1/ui/onboarding/onboarding-team-selection-step';
import { OnboardingPositionStepComponent } from '@nxt1/ui/onboarding/onboarding-position-step';
import { OnboardingContactStepComponent } from '@nxt1/ui/onboarding/onboarding-contact-step';
import { OnboardingReferralStepComponent } from '@nxt1/ui/onboarding/onboarding-referral-step';
import { OnboardingLinkDropStepComponent } from '@nxt1/ui/onboarding/onboarding-link-drop-step';
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
  type CreateTeamProfileFormData,
  type SportFormData,
  type PositionsFormData,
  type ContactFormData,
  type ReferralSourceData,
  type LinkSourcesFormData,
  type TeamSelectionFormData,
  type PlatformScope,
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
  // Invite team-skip
  getSkipStepIdsForInviteUser,
  INVITE_TEAM_JOINED_KEY,
  // Sport helpers
  createEmptySportEntry,
} from '@nxt1/core/api';
import { AUTH_ROUTES, AUTH_REDIRECTS as _AUTH_REDIRECTS, USER_ROLES } from '@nxt1/core/constants';
import { normalizeName } from '@nxt1/core/helpers';
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
  BrowserAuthService,
} from '../../services';
import type { OnboardingProfileData } from '@nxt1/core/auth';
import { SeoService } from '../../../../core/services';
import { ProfileGenerationStateService } from '@nxt1/ui/profile';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import type { ILogger } from '@nxt1/core/logging';
import { environment } from '../../../../../environments/environment';

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
    Nxt1OnboardingCreateTeamStepComponent,
    OnboardingSportStepComponent,
    OnboardingTeamSelectionStepComponent,
    OnboardingPositionStepComponent,
    OnboardingContactStepComponent,
    OnboardingReferralStepComponent,
    OnboardingLinkDropStepComponent,
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
        <h1 class="mb-2 mt-2 text-2xl font-bold text-text-primary">
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
                [excludeRoles]="isTeamInvite() ? ['director', 'parent'] : []"
                [variant]="isMobile() ? 'list-row' : 'cards'"
                (roleSelected)="onRoleSelect($event)"
              />
            }

            <!-- Step 2: Profile -->
            @if (currentStep().id === 'profile') {
              <nxt1-onboarding-profile-step
                #profileStep
                [profileData]="profileFormData()"
                [userType]="selectedRole()"
                [disabled]="isLoading()"
                [showGender]="true"
                [showLocation]="true"
                [showClassYear]="selectedRole() === USER_ROLES.ATHLETE"
                [showCoachTitleField]="false"
                (profileChange)="onProfileChange($event)"
                (photoSelect)="onPhotoSelect()"
                (filesSelected)="onFilesSelected($event)"
                (locationRequest)="onLocationRequest()"
              />
            }

            <!-- Step 3: Link Data Sources (Connected Accounts) -->
            @if (currentStep().id === 'link-sources' || currentStep().id === 'team-link-sources') {
              <nxt1-onboarding-link-drop-step
                #linkSourcesStep
                [linkSourcesData]="linkSourcesFormData()"
                [selectedSports]="selectedSportNames()"
                [role]="selectedRole()"
                [disabled]="isLoading()"
                [scope]="
                  selectedRole() === USER_ROLES.COACH || selectedRole() === USER_ROLES.DIRECTOR
                    ? 'team'
                    : 'athlete'
                "
                (linkSourcesChange)="onLinkSourcesChange($event)"
                (signinTokenConnect)="onSigninTokenConnect($event)"
              />
            }

            <!-- Step 2b: Create Team Profile -->
            @if (currentStep().id === 'create-team-profile') {
              <nxt1-onboarding-create-team-step
                [teamData]="createTeamProfileFormData()"
                [disabled]="isLoading()"
                (teamChange)="onCreateTeamProfileChange($event)"
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

            <!-- Step 4: Select Teams -->
            @if (currentStep().id === 'select-teams') {
              <nxt1-onboarding-team-selection-step
                variant="list-row"
                [teamSelectionData]="teamSelectionFormData()"
                [sportData]="sportFormData()"
                [disabled]="isLoading()"
                [searchTeams]="searchTeamsFn"
                [userType]="selectedRole()"
                (teamSelectionChange)="onTeamSelectionChange($event)"
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
              currentStep().id !== 'link-sources' &&
              currentStep().id !== 'team-link-sources' &&
              currentStep().id !== 'create-team-profile' &&
              currentStep().id !== 'school' &&
              currentStep().id !== 'sport' &&
              currentStep().id !== 'select-teams' &&
              currentStep().id !== 'positions' &&
              currentStep().id !== 'contact' &&
              currentStep().id !== 'referral-source'
            ) {
              <div class="py-12 text-center">
                <div
                  class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-200"
                >
                  <svg viewBox="0 0 24 24" fill="none" class="h-8 w-8 text-text-tertiary">
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
            [showBack]="false"
            [isLastStep]="isLastStep()"
            [loading]="isLoading()"
            [disabled]="!isCurrentStepValid() && !isCurrentStepOptional()"
            (skipClick)="onSkip()"
            (backClick)="onBack()"
            (continueClick)="onContinue()"
          />
        }
        <!-- TODO: Re-enable sign out link when ready
        <button
          type="button"
          (click)="onSignOut()"
          class="text-text-tertiary hover:text-error mt-4 text-sm hover:underline"
        >
          Sign out and start over
        </button>
        -->
      </div>
    </nxt1-auth-shell>

    <!-- Mobile Web: Professional Sticky Footer -->
    @if (isMobile()) {
      <nxt1-onboarding-button-mobile
        [showSkip]="isCurrentStepOptional()"
        [isLastStep]="isLastStep()"
        [loading]="isLoading()"
        [disabled]="!isCurrentStepValid() && !isCurrentStepOptional()"
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
  host: { ngSkipHydration: 'true' },
})
export class OnboardingComponent implements OnInit, OnDestroy {
  protected readonly USER_ROLES = USER_ROLES;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authFlow = inject(AuthFlowService);
  private readonly authApi = inject(AuthApiService);
  private readonly errorHandler = inject(AuthErrorHandler);
  private readonly seo = inject(SeoService);
  private readonly toast = inject(NxtToastService);
  private readonly platform = inject(NxtPlatformService);
  private readonly themeService = inject(NxtThemeService);
  private readonly onboardingAnalytics = inject(OnboardingAnalyticsService);
  private readonly profileGenerationState = inject(ProfileGenerationStateService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('Onboarding');
  private readonly http = inject(HttpClient);
  private readonly browserAuth = inject(BrowserAuthService);

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

  /** Reference to link-sources step for markSigninConnected() callbacks */
  @ViewChild('linkSourcesStep') linkSourcesStepRef?: OnboardingLinkDropStepComponent;

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

  /** Whether the user is joining via a team invite (filters role options) */
  readonly isTeamInvite = signal(false);

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

  /** Pre-fetched scrape job ID from Step 5 (avoids re-enqueue at completion) */
  private preloadScrapeJobId: string | undefined;

  // ============================================
  // COMPUTED SIGNALS (Derived from state)
  // ============================================

  /** Profile form data computed from _formData */
  readonly profileFormData = computed(() => this._formData().profile ?? null);

  /** Create Team Profile form data computed from _formData */
  readonly createTeamProfileFormData = computed(() => this._formData().createTeamProfile ?? null);

  /** Team form data computed from _formData */
  readonly teamFormData = computed(() => this._formData().team ?? null);

  /** Link sources form data computed from _formData */
  readonly linkSourcesFormData = computed(() => this._formData().linkSources ?? null);

  /** Sport form data computed from _formData */
  readonly sportFormData = computed(() => this._formData().sport ?? null);

  /** Team selection form data computed from _formData */
  readonly teamSelectionFormData = computed(() => this._formData().teamSelection ?? null);

  /** Selected sport display names (e.g. ["Football", "Basketball Mens"]) */
  readonly selectedSportNames = computed(() => {
    const sport = this.sportFormData();
    return sport?.sports?.map((s) => s.sport) ?? [];
  });

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

      // Initialize the shared state machine (async to allow API fallback)
      void this.initializeStateMachine(user.uid);
    });
  }

  ngOnInit(): void {
    // Set SEO metadata
    this.seo.updatePage({
      title: 'Complete Your Profile',
      description:
        'Complete your NXT1 profile to access personalized features and connect with the sports intelligence community.',
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
  private async initializeStateMachine(userId: string): Promise<void> {
    this.logger.info('Initializing shared state machine', { userId });

    // Check if user has pending invite data (either from flag or pending referral)
    let skipStepIds: OnboardingStepId[] = [];
    let hasSportData = false;
    let hasInviteData = false;
    let isTeamTypeInvite = false;
    let teamData: {
      sport?: string;
      teamName?: string;
      teamCode?: string;
      teamType?: string;
      type?: string;
    } | null = null;

    if (isPlatformBrowser(this.platformId)) {
      // Debug: dump all relevant sessionStorage keys
      this.logger.info('DEBUG: Checking sessionStorage for invite data', {
        hasPendingReferral: !!sessionStorage.getItem('nxt1:pending_referral'),
        hasInviteSport: !!sessionStorage.getItem('nxt1:invite_sport'),
        inviteSport: sessionStorage.getItem('nxt1:invite_sport'),
        pendingReferralPreview: sessionStorage.getItem('nxt1:pending_referral')?.substring(0, 300),
      });

      const joinedViaInvite = sessionStorage.getItem(INVITE_TEAM_JOINED_KEY) === 'true';

      // 1. Try sessionStorage first
      try {
        const raw = sessionStorage.getItem('nxt1:pending_referral');
        this.logger.info('Reading pending referral from sessionStorage', {
          hasRawData: !!raw,
          rawPreview: raw ? raw.substring(0, 200) : null,
        });

        if (raw) {
          teamData = JSON.parse(raw);
        }
      } catch (err) {
        this.logger.warn('Failed to parse pending referral data', { error: err });
      }

      // 2. If no sessionStorage data, try URL params with API fetch
      if (!teamData) {
        const params = this.route.snapshot.queryParamMap;
        const inviteType = params.get('inviteType');
        const invite = params.get('invite');

        this.logger.info('DEBUG: No sessionStorage data, checking URL params', {
          inviteType,
          invite,
          allParams: params.keys,
          currentUrl: window.location.href,
        });

        if (inviteType === 'team' && invite) {
          this.logger.info('No sessionStorage data, fetching from API...', { invite });

          try {
            const result = await this.authApi.validateTeamCode(invite);
            if (result.valid && result.teamCode) {
              teamData = {
                sport: result.teamCode.sport,
                teamName: result.teamCode.teamName,
                teamCode: invite,
                teamType: result.teamCode.teamType,
                type: inviteType,
              };

              this.logger.info('Fetched team data from API', {
                teamCode: teamData.teamCode,
                teamName: teamData.teamName,
                sport: teamData.sport,
              });

              // Save to sessionStorage for future use
              sessionStorage.setItem(
                'nxt1:pending_referral',
                JSON.stringify({
                  code: invite,
                  inviterUid: 'unknown',
                  type: inviteType,
                  teamCode: invite,
                  teamName: teamData.teamName,
                  sport: teamData.sport,
                  teamType: teamData.teamType,
                  role: 'Athlete',
                  timestamp: Date.now(),
                })
              );
            } else {
              this.logger.warn('Team validation failed', { invite, valid: result.valid });
            }
          } catch (err) {
            this.logger.error('Failed to fetch team data from API', { error: err, invite });
          }
        }
      }

      // Process team data if found
      if (teamData) {
        hasSportData = !!(teamData.sport && teamData.teamName);
        hasInviteData = !!teamData.teamCode;
        isTeamTypeInvite = teamData.type === 'team' && hasInviteData;

        this.logger.info('Parsed pending referral data', {
          hasFlag: joinedViaInvite,
          hasSportData,
          hasInviteData,
          isTeamTypeInvite,
          type: teamData.type,
          teamCode: teamData.teamCode,
          teamName: teamData.teamName,
          sport: teamData.sport,
        });
      } else {
        this.logger.warn(
          'No pending referral found in sessionStorage or URL - role filter will NOT be applied'
        );
      }

      // Set isTeamInvite signal early so role selection filters are applied
      // This must happen BEFORE the machine starts and renders the role step
      if (isTeamTypeInvite) {
        this.isTeamInvite.set(true);
        this.logger.info('Team invite detected - filtering role options', {
          hasInviteData,
          hasSportData,
        });
      }

      if (joinedViaInvite || hasInviteData) {
        skipStepIds = getSkipStepIdsForInviteUser(undefined, hasSportData);

        this.logger.info('User has invite data — skipping steps', {
          skipStepIds,
          hasSportData,
          hasInviteData,
          hadJoinedFlag: joinedViaInvite,
          sportStepSkipped: skipStepIds.includes('sport'),
        });

        // Warn if sport step will still show (missing sport data from API)
        if (!hasSportData && isTeamTypeInvite) {
          this.logger.warn(
            'Team invite detected but sport data missing - sport step will NOT be skipped. ' +
              'Ensure team exists in Firestore with sport field populated.'
          );
        }

        if (joinedViaInvite) {
          sessionStorage.removeItem(INVITE_TEAM_JOINED_KEY);
        }
      }
    }

    // Create the portable state machine
    this.machine = createOnboardingStateMachine({
      userId,
      initialSteps: ONBOARDING_STEPS.athlete,
      skipStepIds,
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
    // BUT: If we have a fresh team invite, don't restore old session (it may have wrong role/steps)
    let restored = false;
    if (isTeamTypeInvite) {
      this.logger.info(
        'Team invite detected - clearing any existing session to ensure fresh start'
      );
      this.clearSession();
    } else {
      restored = this.tryRestoreSession(userId);
    }

    if (!restored) {
      // No valid session - start fresh
      this.machine.start();
      this.applyInviteSportPreselection();
      // Track onboarding started event
      this.trackStarted();
    } else {
      // Session restored - but still apply invite sport preselection if available
      this.applyInviteSportPreselection();
      this.logger.info('Session restored, also applied invite sport preselection');
    }
  }

  /**
   * Pre-select sport and team from invite link if available.
   * Reads full team data from PENDING_REFERRAL_KEY and applies it to the state machine.
   * Note: isTeamInvite signal is set in initializeStateMachine() earlier.
   */
  private applyInviteSportPreselection(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      // Try to get full team data first
      const raw = sessionStorage.getItem('nxt1:pending_referral');
      if (raw) {
        const teamData = JSON.parse(raw) as {
          sport?: string;
          teamName?: string;
          teamType?: string;
          teamId?: string;
          teamCode?: string;
          type?: string;
        };

        if (teamData.sport && teamData.teamName) {
          // We have full team data - create complete sport entry
          const sportEntry = createEmptySportEntry(teamData.sport, true);
          sportEntry.team.name = teamData.teamName;
          sportEntry.team.type = teamData.teamType as any;

          const sportData: SportFormData = {
            sports: [sportEntry],
          };

          this.machine.updateSport(sportData);
          this.logger.info('Applied full team data from invite', {
            sport: teamData.sport,
            teamName: teamData.teamName,
            teamType: teamData.teamType,
          });
          return;
        }
      }

      const sport = sessionStorage.getItem('nxt1:invite_sport');
      if (sport) {
        sessionStorage.removeItem('nxt1:invite_sport');
        const sportData: SportFormData = {
          sports: [createEmptySportEntry(sport, true)],
        };

        this.machine.updateSport(sportData);
        this.logger.info('Applied sport pre-selection from invite', { sport });
      }
    } catch (err) {
      this.logger.warn('Failed to apply sport pre-selection', { error: err });
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
        // Fire optimistic pre-fetch when link-sources step completes
        if (
          (event.stepId === 'link-sources' || event.stepId === 'team-link-sources') &&
          !this.preloadScrapeJobId
        ) {
          void this.firePreloadScrape();
        }
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
   * Handle create team profile data change
   */
  onCreateTeamProfileChange(data: CreateTeamProfileFormData): void {
    this.machine.updateCreateTeamProfile(data);
  }

  /**
   * Handle sport data change (Step 4)
   */
  onSportChange(sportData: SportFormData): void {
    this.machine.updateSport(sportData);
  }

  /**
   * Handle team selection data change (Select Teams step)
   */
  onTeamSelectionChange(data: TeamSelectionFormData): void {
    this.machine.updateTeamSelection(data);
  }

  /**
   * Handle "Create Program" from team selection step
   */
  onCreateProgram(): void {
    this.logger.info('Create program requested from onboarding');
    this.toast.info('Create Program is coming soon!');
  }

  /**
   * Handle "Join Program" from team selection step
   */
  onJoinProgram(): void {
    this.logger.info('Join program requested from onboarding');
    this.toast.info('Join Program is coming soon!');
  }

  /**
   * Team search function — passed to the team selection component.
   * Searches programs (organizations) via the backend API.
   */
  readonly searchTeamsFn = async (query: string): Promise<TeamSearchResult[]> => {
    this.logger.debug('Program search requested', { query });
    try {
      const url = `${environment.apiURL}/programs/search`;
      const response = await firstValueFrom(
        this.http.get<{
          success: boolean;
          data: Array<{
            id: string;
            name: string;
            type: string;
            location?: { state?: string; city?: string };
            logoUrl?: string;
            primaryColor?: string;
            secondaryColor?: string;
            mascot?: string;
            teamCount?: number;
            isClaimed?: boolean;
          }>;
        }>(url, { params: { q: query, limit: '20' } })
      );

      if (!response.success || !response.data) return [];

      // Map organization results to TeamSearchResult shape
      return response.data.map((org) => ({
        id: org.id,
        name: org.name,
        sport: '', // Programs span multiple sports
        teamType: org.type,
        location:
          org.location?.city && org.location?.state
            ? `${org.location.city}, ${org.location.state}`
            : (org.location?.state ?? ''),
        logoUrl: org.logoUrl ?? undefined,
        colors: [org.primaryColor, org.secondaryColor].filter(Boolean) as string[],
        memberCount: org.teamCount ?? 0,
        isSchool: org.type === 'high-school' || org.type === 'middle-school',
        organizationId: org.id,
      }));
    } catch (err) {
      this.logger.error('Program search failed', err, { query });
      return [];
    }
  };

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
   * Handle link sources data change (Link Data Sources step)
   */
  onLinkSourcesChange(linkSourcesData: LinkSourcesFormData): void {
    this.machine.updateLinkSources(linkSourcesData);
  }

  /**
   * Handle Google / Microsoft sign-in token connect from the link-sources step.
   * Calls the backend connect endpoint, then marks the platform as connected in the UI.
   */
  async onSigninTokenConnect(event: {
    platform: 'google' | 'microsoft';
    accessToken: string;
    refreshToken?: string;
    scopeType: PlatformScope;
    scopeId?: string;
  }): Promise<void> {
    const { platform, accessToken, refreshToken, scopeType, scopeId } = event;

    const idToken = await this.browserAuth.getIdToken();
    if (!idToken) {
      this.toast.error('Not signed in. Please refresh and try again.');
      return;
    }

    try {
      const endpoint =
        platform === 'google'
          ? `${environment.apiURL}/auth/google/connect-gmail`
          : `${environment.apiURL}/auth/microsoft/connect-mail`;

      const body =
        platform === 'google'
          ? { accessToken }
          : { accessToken, ...(refreshToken ? { refreshToken } : {}) };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        this.logger.warn(`[${platform} connect] Backend failed`, {
          status: response.status,
          errorText,
        });
        this.toast.error(
          `Failed to connect ${platform === 'google' ? 'Google' : 'Microsoft'}: ${response.status}`
        );
        return;
      }

      const result = (await response.json()) as { success?: boolean; email?: string };
      this.logger.info(`[${platform} connect] Success`, { email: result.email });

      this.linkSourcesStepRef?.markSigninConnected(platform, scopeType, scopeId);
      this.toast.success(`${platform === 'google' ? 'Google' : 'Microsoft'} connected!`);
    } catch (err) {
      this.logger.error(`[${platform} connect] Error`, err);
      this.toast.error('Connection failed. Please try again.');
    }
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
   * Handle files selected from file picker (Platform-specific) - now supports multiple
   */
  async onFilesSelected(files: File[] | Event): Promise<void> {
    const fileArray = Array.isArray(files) ? files : [];
    this.logger.debug('Files selected', {
      count: fileArray.length,
      names: fileArray.map((f) => f.name),
    });

    const user = this.authFlow.user();
    if (!user) {
      this.toast.error('Please login to upload photos');
      return;
    }

    if (fileArray.length === 0) return;

    try {
      this.isLoading.set(true);
      this.toast.info(`Uploading ${fileArray.length} photo(s)...`);
      const uploadedUrls: string[] = [];
      for (const file of fileArray) {
        try {
          const photoURL = await this.authFlow.uploadProfilePhoto(file, user.uid);
          uploadedUrls.push(photoURL);
        } catch (err) {
          this.logger.error('Failed to upload photo', err, { fileName: file.name });
          this.toast.error(`Failed to upload ${file.name}`);
        }
      }

      if (uploadedUrls.length > 0) {
        const currentProfile = this._formData().profile;
        const existingImgs = (currentProfile?.profileImgs || []).filter(
          (url) => !url.startsWith('blob:')
        );

        this.machine.updateProfile({
          firstName: currentProfile?.firstName || '',
          lastName: currentProfile?.lastName || '',
          ...(currentProfile || {}),
          profileImgs: [...existingImgs, ...uploadedUrls],
        });

        this.toast.success(`Uploaded ${uploadedUrls.length} photo(s) successfully!`);
      }
    } catch (err) {
      this.logger.error('Failed to upload photos', err);
      this.toast.error('Failed to upload photos. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Handle file selected from file picker (Legacy single file - delegates to onFilesSelected)
   */
  async onFileSelected(file: File): Promise<void> {
    await this.onFilesSelected([file]);
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
  // PRE-FETCH SCRAPE (Optimistic — fires at Step 5)
  // ============================================

  /**
   * Fire the scraping pipeline early while the user finishes remaining steps.
   * The returned scrapeJobId is passed to the final onboarding save so the
   * backend skips re-enqueuing.
   */
  private async firePreloadScrape(): Promise<void> {
    const user = this.authFlow.user();
    if (!user) return;

    const formData = this._formData();
    const links = formData.linkSources?.links?.filter((l) => l.connected && l.url);
    if (!links || links.length === 0) return;

    const linkedAccounts = links
      .filter(
        (l): l is typeof l & { platform: string; url: string } =>
          !!l.platform && !!l.url && l.url.startsWith('http')
      )
      .map((l) => ({ platform: l.platform.toLowerCase(), profileUrl: l.url }));

    if (linkedAccounts.length === 0) return;

    const sport = formData.sport?.sports?.[0]?.sport;
    const role = formData.userType ?? undefined;

    try {
      const result = await this.authApi.preloadScrape(user.uid, linkedAccounts, sport, role);
      if (result.scrapeJobId) {
        this.preloadScrapeJobId = result.scrapeJobId;
        this.logger.info('Pre-fetch scrape enqueued from Step 5', {
          scrapeJobId: result.scrapeJobId,
          platforms: linkedAccounts.map((a) => a.platform).join(', '),
        });
      }
    } catch (err) {
      // Non-fatal — the completion endpoint will enqueue if this failed
      this.logger.warn('Pre-fetch scrape failed, will retry at completion', {
        error: err instanceof Error ? err.message : String(err),
        platforms: linkedAccounts.map((a) => a.platform).join(', '),
      });
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
      // Map sports array from form data
      let sportEntries = formData.sport?.sports || [];

      if (isPlatformBrowser(this.platformId)) {
        try {
          const pendingRaw = sessionStorage.getItem('nxt1:pending_referral');
          if (pendingRaw) {
            const pending = JSON.parse(pendingRaw) as {
              sport?: string;
              teamName?: string;
              teamType?: string;
            };
            if (pending.teamName) {
              sportEntries = sportEntries.map((entry) =>
                !entry.team?.name && entry.sport === pending.sport
                  ? {
                      ...entry,
                      team: {
                        ...entry.team,
                        name: pending.teamName!,
                        type: (entry.team?.type || pending.teamType) as typeof entry.team.type,
                      },
                    }
                  : entry
              );
              this.logger.info('Enriched sport entries with invite team data', {
                teamName: pending.teamName,
                sport: pending.sport,
              });
            }
          }
        } catch (enrichErr) {
          this.logger.warn('Failed to enrich sport entries from invite data', { error: enrichErr });
        }
      }

      // Map 'recruiter' to 'recruiting-service' for backend API compatibility
      const userType: OnboardingProfileData['userType'] =
        formData.userType === USER_ROLES.RECRUITER
          ? 'recruiting-service'
          : (formData.userType as OnboardingProfileData['userType']);

      const profileData: OnboardingProfileData = {
        userType,
        firstName: normalizeName(formData.profile?.firstName || ''),
        lastName: normalizeName(formData.profile?.lastName || ''),
        profileImgs: formData.profile?.profileImgs || undefined,
        bio: formData.profile?.bio,
        gender: formData.profile?.gender ?? undefined,
        // V2: Send sports array directly
        sports: sportEntries.map((entry) => ({
          sport: entry.sport,
          isPrimary: entry.isPrimary,
          positions: entry.positions,
          team: entry.team
            ? {
                name: entry.team.name,
                type: entry.team.type,
                city: entry.team.city,
                state: entry.team.state,
                logo: entry.team.logo ?? undefined,
                colors: entry.team.colors,
              }
            : undefined,
        })),
        // Legacy fallback data for potential API compatibility
        highSchool: sportEntries[0]?.team?.name || formData.school?.schoolName,
        highSchoolSuffix: sportEntries[0]?.team?.type || formData.school?.schoolType,
        classOf: formData.profile?.classYear ?? formData.school?.classYear ?? undefined,
        state:
          sportEntries[0]?.team?.state ||
          formData.school?.state ||
          formData.profile?.location?.state,
        city:
          sportEntries[0]?.team?.city || formData.school?.city || formData.profile?.location?.city,
        zipCode: formData.profile?.location?.zipCode,
        address: formData.profile?.location?.address,
        country: formData.profile?.location?.country,
        teamLogo: formData.school?.teamLogo || sportEntries[0]?.team?.logo,
        teamColors: formData.school?.teamColors || sportEntries[0]?.team?.colors,
        club: formData.school?.club,
        organization: formData.organization?.organizationName,
        coachTitle: formData.sport?.coachTitle ?? formData.organization?.title,
        linkSources: formData.linkSources,
        teamSelection: formData.teamSelection,
        createTeamProfile: formData.createTeamProfile,
        // Pass pre-fetched scrape job ID so backend skips re-enqueuing
        ...(this.preloadScrapeJobId && { scrapeJobId: this.preloadScrapeJobId }),
        // Phone number from profile basics step
        phoneNumber: formData.profile?.phoneNumber || undefined,
      };

      const result = await this.authApi.saveOnboardingProfile(user.uid, profileData);
      this.logger.info('Profile data saved successfully');

      // Start profile generation overlay if backend enqueued a scrape job
      if (result.scrapeJobId) {
        const platformNames =
          formData.linkSources?.links
            ?.filter((l) => l.connected)
            .map((l) => l.platform)
            .join(', ') ?? '';
        this.profileGenerationState.startGeneration(result.scrapeJobId, platformNames);
        this.logger.info('Backend scrape job started', { scrapeJobId: result.scrapeJobId });
      }
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
    this.logger.info('Calling completeOnboarding API', { userId: user.uid });
    await this.authFlow.acceptPendingInvite(formData.userType ?? undefined);
    const result = await this.authApi.completeOnboarding(user.uid);
    this.logger.info('completeOnboarding API responded', { result });

    // CRITICAL: Wait a bit for backend to persist
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Force clear ALL cache to ensure fresh fetch
    const { globalAuthUserCache } = await import('@nxt1/core/auth');
    await globalAuthUserCache.clear();
    this.logger.debug('Cleared all auth cache');

    // Refresh user profile
    await this.authFlow.refreshUserProfile();

    // Verify onboarding status
    const updatedUser = this.authFlow.user();
    this.logger.info('Onboarding complete, user state verified', {
      userId: user.uid,
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
