/**
 * @fileoverview OnboardingService - State Management for Onboarding Flow
 * @module @nxt1/mobile/features/auth
 *
 * Extracted from OnboardingPage to enable per-step Ionic page navigation
 * with native slide transitions via IonRouterOutlet + NavController.
 *
 * Architecture:
 * ┌────────────────────────────────────────────────────────────┐
 * │              OnboardingShellComponent                       │
 * │   IonRouterOutlet (step pages) + persistent footer          │
 * ├────────────────────────────────────────────────────────────┤
 * │         ⭐ OnboardingService (THIS FILE) ⭐                 │
 * │   State machine, signals, handlers, navigation              │
 * ├────────────────────────────────────────────────────────────┤
 * │       createOnboardingStateMachine() from @nxt1/core        │
 * └────────────────────────────────────────────────────────────┘
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import { Location } from '@angular/common';
import { NavController } from '@ionic/angular/standalone';

// Shared UI services
import {
  HapticsService,
  NxtToastService,
  NxtLoggingService,
  NxtThemeService,
  NxtBreadcrumbService,
  ProfileGenerationStateService,
  type AnimationDirection,
} from '@nxt1/ui';

// Core API — Types, State Machine & Constants
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
  type ReferralSourceData,
  type LinkSourcesFormData,
  type TeamSelectionFormData,
  ONBOARDING_STEPS,
  getAgentXMessage,
  createOnboardingStateMachine,
  type OnboardingStateMachine,
  type OnboardingStateSnapshot,
  type OnboardingMachineEvent,
  type OnboardingMachineState,
  type PartialOnboardingFormData,
  serializeSession,
  deserializeSession,
  getSkipStepIdsForInviteUser,
  INVITE_TEAM_JOINED_KEY,
  createEmptySportEntry,
} from '@nxt1/core/api';
import { AUTH_ROUTES, USER_ROLES } from '@nxt1/core/constants';
import { STORAGE_KEYS } from '@nxt1/core/storage';
import { TEST_IDS } from '@nxt1/core/testing';
import type { OnboardingProfileData } from '@nxt1/core/auth';
import type { ILogger } from '@nxt1/core/logging';
import { TRACE_NAMES } from '@nxt1/core/performance';
import {
  createGeolocationService,
  createCapacitorGeolocationAdapter,
  NominatimGeocodingAdapter,
  CachedGeocodingAdapter,
  type GeolocationService,
} from '@nxt1/core/geolocation';
import { Geolocation } from '@capacitor/geolocation';

// Mobile infrastructure
import { createNativeStorageAdapter, CapacitorHttpAdapter } from '../../infrastructure';
import { normalizeImageFileForUpload } from '@nxt1/ui';
import { environment } from '../../../../environments/environment';

// Auth services (import directly to avoid barrel circular deps)
import { AuthFlowService } from './auth-flow.service';
import { AuthApiService } from './auth-api.service';
import { OnboardingAnalyticsService } from './onboarding-analytics.service';

// Feature services
import { EditProfileApiService } from '../api/edit-profile-api.service';
import { PerformanceService } from '../infrastructure/performance.service';

import type { TeamSearchResult } from '@nxt1/ui';

// ============================================
// CONSTANTS
// ============================================

const MACHINE_SESSION_KEY = STORAGE_KEYS.ONBOARDING_SESSION;
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

// ============================================
// Quick-add link ref interface (avoids importing full component)
// ============================================

interface QuickAddLinkTarget {
  quickAddLink(
    url: string
  ): Promise<
    { added: false; reason: string } | { added: true; kind: 'platform' | 'custom'; label: string }
  >;
}

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  // ============================================
  // INJECTED SERVICES
  // ============================================

  private readonly navController = inject(NavController);
  private readonly location = inject(Location);
  private readonly authFlow = inject(AuthFlowService);
  private readonly profileGenerationState = inject(ProfileGenerationStateService);
  private readonly authApi = inject(AuthApiService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly analytics = inject(OnboardingAnalyticsService);
  private readonly themeService = inject(NxtThemeService);
  private readonly editProfileApi = inject(EditProfileApiService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('Onboarding');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly performance = inject(PerformanceService);
  private readonly http = inject(CapacitorHttpAdapter);

  // ============================================
  // PLATFORM SERVICES
  // ============================================

  readonly geolocationService: GeolocationService = createGeolocationService(
    createCapacitorGeolocationAdapter(Geolocation),
    new CachedGeocodingAdapter(new NominatimGeocodingAdapter())
  );

  private readonly storage = createNativeStorageAdapter();

  // ============================================
  // STATE MACHINE
  // ============================================

  private machine!: OnboardingStateMachine;
  private machineUnsubscribe?: () => void;
  private hasInitialized = false;

  // ============================================
  // WRITABLE SIGNALS (private)
  // ============================================

  private readonly _state = signal<OnboardingMachineState>('idle');
  private readonly _currentStepIndex = signal(0);
  private readonly _selectedRole = signal<OnboardingUserType | null>(null);
  private readonly _steps = signal<OnboardingStep[]>(ONBOARDING_STEPS.athlete);
  private readonly _completedSteps = signal<Set<OnboardingStepId>>(new Set());
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _formData = signal<PartialOnboardingFormData>({ userType: null });
  private readonly _animationDirection = signal<AnimationDirection>('none');
  private readonly _isCurrentStepValid = signal(true);
  private readonly _contentReady = signal(false);
  private readonly _footerVisible = signal(false);
  // Pre-detect invite status synchronously from localStorage to avoid flash on reload.
  // resolveSkipStepIds() will confirm/update this via native storage async.
  readonly isTeamInvite = signal(
    (() => {
      if (typeof localStorage === 'undefined') return false;
      try {
        const raw = localStorage.getItem('nxt1:pending_referral');
        if (!raw) return false;
        const data = JSON.parse(raw) as { type?: string; teamCode?: string };
        return data.type === 'team' && !!data.teamCode;
      } catch {
        return false;
      }
    })()
  );

  // ============================================
  // QUICK-ADD LINK STATE
  // ============================================

  private readonly _quickAddLinkValue = signal('');
  readonly quickAddLinkValue = computed(() => this._quickAddLinkValue());
  readonly linkSourceTestIds = TEST_IDS.LINK_SOURCES;
  linkSourcesStepRef: QuickAddLinkTarget | null = null;

  // ============================================
  // COMPUTED SIGNALS (public readonly)
  // ============================================

  readonly selectedRole = computed(() => this._selectedRole());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());
  readonly animationDirection = computed(() => this._animationDirection());
  readonly contentReady = computed(() => this._contentReady());
  readonly footerVisible = computed(() => this._footerVisible());

  readonly profileFormData = computed(() => this._formData().profile ?? null);
  readonly teamFormData = computed(() => this._formData().team ?? null);
  readonly createTeamProfileFormData = computed(() => this._formData().createTeamProfile ?? null);
  readonly sportFormData = computed(() => this._formData().sport ?? null);
  readonly teamSelectionFormData = computed(() => this._formData().teamSelection ?? null);
  readonly selectedSportNames = computed(() => {
    const sport = this.sportFormData();
    return sport?.sports?.map((s) => s.sport) ?? [];
  });
  readonly linkSourcesFormData = computed(() => this._formData().linkSources ?? null);
  readonly referralFormData = computed(() => this._formData().referralSource ?? null);

  readonly steps = computed(() => this._steps());
  readonly totalSteps = computed(() => this._steps().length);
  readonly currentStepIndex = computed(() => this._currentStepIndex());
  readonly completedStepIds = computed(() => this._completedSteps());

  readonly currentStep = computed(() => {
    const steps = this._steps();
    const index = this._currentStepIndex();
    return (
      steps[index] ??
      steps[0] ?? {
        id: 'profile' as OnboardingStepId,
        title: 'Loading...',
        subtitle: '',
        required: true,
      }
    );
  });

  readonly agentXMessage = computed(() => {
    const stepId = this.currentStep().id;
    const role = this._selectedRole();
    return getAgentXMessage(stepId, role);
  });

  readonly canGoBack = computed(() => this._currentStepIndex() > 0);

  readonly isLastStep = computed(() => {
    return this._currentStepIndex() === this._steps().length - 1;
  });

  readonly isCurrentStepOptional = computed(() => {
    if (this.isLastStep()) return false;
    return !this.currentStep().required;
  });

  readonly isCurrentStepValid = computed(() => this._isCurrentStepValid());

  readonly completedStepIndices = computed(() => {
    const completedIds = this._completedSteps();
    const steps = this._steps();
    return steps
      .map((step, index) => (completedIds.has(step.id) ? index : -1))
      .filter((index) => index >= 0);
  });

  readonly isLinkSourcesStep = computed(() => {
    const stepId = this.currentStep().id;
    return stepId === 'link-sources' || stepId === 'team-link-sources';
  });

  readonly canSubmitQuickLink = computed(() => {
    return this.quickAddLinkValue().trim().length > 0 && !this._isLoading();
  });

  // ============================================
  // INITIALIZATION
  // ============================================

  /**
   * Initialize the onboarding service. Called by OnboardingShellComponent.
   * Polls for auth readiness before creating the state machine.
   */
  initialize(): void {
    if (this.hasInitialized) return;

    // Force light theme during onboarding
    this.themeService.setTemporaryOverride('light');
    this.logger.debug('Set temporary light theme override for onboarding');

    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max

    const checkAuth = () => {
      attempts++;

      if (this.hasInitialized) return;

      const isAuthReady = this.authFlow.isInitialized();
      const user = this.authFlow.user();

      if (!isAuthReady || !user) {
        if (attempts >= maxAttempts) {
          this.logger.error('Timeout waiting for auth');
          void this.navController.navigateRoot('/auth');
          return;
        }
        setTimeout(checkAuth, 100);
        return;
      }

      this.hasInitialized = true;
      this.initializeStateMachine(user.uid);
    };

    checkAuth();
  }

  /**
   * Cleanup resources. Called by OnboardingShellComponent on destroy.
   */
  destroy(): void {
    this.machineUnsubscribe?.();
    this.analytics.cleanup();
    this.hasInitialized = false;
    this.linkSourcesStepRef = null;

    // Reset all signals to prevent stale state on re-entry
    this._state.set('idle');
    this._currentStepIndex.set(0);
    this._selectedRole.set(null);
    this._steps.set(ONBOARDING_STEPS.athlete);
    this._completedSteps.set(new Set());
    this._isLoading.set(false);
    this._error.set(null);
    this._formData.set({ userType: null });
    this._animationDirection.set('none');
    this._isCurrentStepValid.set(true);
    this._contentReady.set(false);
    this._footerVisible.set(false);
    this._quickAddLinkValue.set('');
  }

  // ============================================
  // CONTENT READY (set by step pages)
  // ============================================

  setContentReady(ready: boolean): void {
    this._contentReady.set(ready);
    if (ready) this._footerVisible.set(true); // Latch: once visible, stays visible
  }

  // ============================================
  // USER ACTIONS (delegated to state machine)
  // ============================================

  async onRoleSelect(type: OnboardingUserType): Promise<void> {
    await this.haptics.selection();
    this.machine.selectRole(type);
    this.logger.info('Role selected', { role: type });
  }

  onProfileChange(profileData: ProfileFormData): void {
    this.machine.updateProfile(profileData);
  }

  /**
   * Update profile with location data after geolocation detection.
   * Called by ProfileStepPage after successful location fetch.
   */
  updateProfileWithLocation(locationData: ProfileLocationData): void {
    const currentProfile = this._formData().profile;
    this.machine.updateProfile({
      ...currentProfile,
      firstName: currentProfile?.firstName || '',
      lastName: currentProfile?.lastName || '',
      location: locationData,
    });
    this.logger.info('Location updated', {
      city: locationData.city,
      state: locationData.state,
    });
  }

  onTeamChange(teamData: TeamFormData): void {
    this.machine.updateTeam(teamData);
  }

  onCreateTeamProfileChange(data: CreateTeamProfileFormData): void {
    this.machine.updateCreateTeamProfile(data);
  }

  onSportChange(sportData: SportFormData): void {
    this.machine.updateSport(sportData);
  }

  onTeamSelectionChange(data: TeamSelectionFormData): void {
    this.machine.updateTeamSelection(data);
  }

  onLinkSourcesChange(linkSourcesData: LinkSourcesFormData): void {
    this.machine.updateLinkSources(linkSourcesData);
  }

  onReferralChange(referralData: ReferralSourceData): void {
    this.machine.updateReferral(referralData);
  }

  async onContinue(): Promise<void> {
    await this.haptics.impact('medium');
    this.machine.continue();
  }

  async onSkip(): Promise<void> {
    await this.haptics.impact('light');
    this.machine.skip();
  }

  async onBack(): Promise<void> {
    await this.haptics.impact('light');
    this.machine.back();
  }

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
  // PHOTO UPLOAD
  // ============================================

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
      this._isLoading.set(true);
      this.toast.info(`Uploading ${fileArray.length} photo(s)...`);

      const uploadedUrls: string[] = [];

      const normalizedFiles = await Promise.all(
        fileArray.map((file) => normalizeImageFileForUpload(file))
      );

      for (const file of normalizedFiles) {
        try {
          const result = await this.editProfileApi.uploadPhoto(user.uid, 'profile', file);
          if (result.success && result.data) {
            uploadedUrls.push(result.data.url);
          } else {
            throw new Error(result.error || 'Upload failed');
          }
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
      this.toast.error('Failed to upload photos');
    } finally {
      this._isLoading.set(false);
    }
  }

  async onPhotoSelect(): Promise<void> {
    await this.haptics.selection();
    this.logger.debug('Photo select triggered - using file input fallback');
  }

  // ============================================
  // TEAM SEARCH
  // ============================================

  readonly searchTeamsFn = async (query: string): Promise<readonly TeamSearchResult[]> => {
    this.logger.debug('Program search requested', { query });
    try {
      const url = `${environment.apiUrl}/programs/search`;
      const response = await this.http.get<{
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
      }>(url, { params: { q: query, limit: 20 } });

      if (!response.success || !response.data) return [];

      return response.data.map((org) => ({
        id: org.id,
        name: org.name,
        sport: '',
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

  // ============================================
  // QUICK-ADD LINK
  // ============================================

  onQuickLinkInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this._quickAddLinkValue.set(input?.value ?? '');
  }

  async onQuickLinkSubmit(event: Event): Promise<void> {
    event.preventDefault();

    const rawValue = this.quickAddLinkValue().trim();
    if (!rawValue || !this.linkSourcesStepRef) return;

    await this.haptics.impact('light');
    const result = await this.linkSourcesStepRef.quickAddLink(rawValue);
    if (!result.added) {
      await this.haptics.notification('error');
      this.toast.error(result.reason);
      return;
    }

    this._quickAddLinkValue.set('');
    await this.haptics.notification('success');
    if (result.kind === 'platform') {
      this.toast.success(`${result.label} added`);
      return;
    }

    this.toast.success(`${result.label} saved`);
  }

  // ============================================
  // PRIVATE: STATE MACHINE INITIALIZATION
  // ============================================

  private initializeStateMachine(userId: string): void {
    this.logger.info('Initializing shared state machine', { userId });

    this.resolveSkipStepIds().then((skipStepIds) => {
      this.machine = createOnboardingStateMachine({
        userId,
        initialSteps: ONBOARDING_STEPS.athlete,
        skipStepIds,
        debug: false,
        onComplete: async (formData) => {
          await this.handleCompletion(formData);
        },
      });

      this.machineUnsubscribe = this.machine.addEventListener((event) => {
        this.handleMachineEvent(event);
      });

      this.tryRestoreSession(userId).then(async (restored) => {
        if (!restored) {
          this.machine.start();
          await this.applyInviteSportPreselection();
          this.trackStarted();
        } else {
          await this.applyInviteSportPreselection();
        }
      });
    });
  }

  private async applyInviteSportPreselection(): Promise<void> {
    const PENDING_REFERRAL_KEY = 'nxt1:pending_referral';
    try {
      const nativeData = await this.storage.get(PENDING_REFERRAL_KEY);
      if (nativeData) {
        const teamData = JSON.parse(nativeData) as {
          sport?: string;
          teamName?: string;
          teamType?: string;
          teamId?: string;
          teamCode?: string;
          type?: string;
        };
        if (teamData.sport && teamData.teamName) {
          const sportEntry = createEmptySportEntry(teamData.sport, true);
          sportEntry.team.name = teamData.teamName;
          // Keep raw TeamTypeApi value — backend createSportProfile validates against VALID_TEAM_TYPES
          sportEntry.team.type = teamData.teamType as typeof sportEntry.team.type;
          // Pass teamId so backend can look up organizationId from the Teams collection
          if (teamData.teamId) {
            sportEntry.team.teamId = teamData.teamId;
          }
          const sportData: SportFormData = {
            sports: [sportEntry],
          };
          this.machine.updateSport(sportData);
          this.logger.info('applyInviteSportPreselection: Applied full team data from invite', {
            sport: teamData.sport,
            teamName: teamData.teamName,
            teamType: teamData.teamType,
            teamId: teamData.teamId,
          });
        }
      }
    } catch (err) {
      this.logger.warn('applyInviteSportPreselection: Failed to apply sport preselection', {
        error: err,
      });
    }
  }

  private async resolveSkipStepIds(): Promise<OnboardingStepId[]> {
    const PENDING_REFERRAL_KEY = 'nxt1:pending_referral';
    try {
      // Check flag first (quick path - user joined team then navigated)
      const joinedFlag = await this.storage.get(INVITE_TEAM_JOINED_KEY);

      // Check pending referral data from native storage (set by JoinComponent)
      let hasSportData = false;
      let isTeamInvite = false;

      try {
        const nativeData = await this.storage.get(PENDING_REFERRAL_KEY);
        if (nativeData) {
          const teamData = JSON.parse(nativeData) as {
            sport?: string;
            teamName?: string;
            teamCode?: string;
            type?: string;
          };
          hasSportData = !!(teamData.sport && teamData.teamName);
          isTeamInvite = teamData.type === 'team' && !!teamData.teamCode;

          this.logger.info('resolveSkipStepIds: Found pending referral in native storage', {
            teamCode: teamData.teamCode,
            teamName: teamData.teamName,
            sport: teamData.sport,
            type: teamData.type,
            hasSportData,
            isTeamInvite,
          });

          if (isTeamInvite) {
            this.isTeamInvite.set(true);
          }
        }
      } catch (err) {
        this.logger.warn('resolveSkipStepIds: Failed to read pending referral', { error: err });
      }

      if (joinedFlag === 'true' || isTeamInvite) {
        if (joinedFlag === 'true') {
          await this.storage.remove(INVITE_TEAM_JOINED_KEY);
        }
        const ids = getSkipStepIdsForInviteUser(undefined, hasSportData);
        this.logger.info('resolveSkipStepIds: Invite detected — skipping steps', {
          skipStepIds: ids,
          hasSportData,
          hadJoinedFlag: joinedFlag === 'true',
          sportStepSkipped: ids.includes('sport'),
        });
        return ids;
      }
    } catch (err) {
      this.logger.warn('Failed to read invite-team-joined flag from storage', { error: err });
    }
    return [];
  }

  // ============================================
  // PRIVATE: STATE MACHINE EVENT HANDLER
  // ============================================

  private handleMachineEvent(event: OnboardingMachineEvent): void {
    switch (event.type) {
      case 'STATE_CHANGE':
        this.syncSignalsFromSnapshot(event.state);
        this.breadcrumb.trackStateChange(`onboarding:${event.state.machineState}`, {
          step: event.state.steps[event.state.currentStepIndex]?.id,
          stepIndex: event.state.currentStepIndex,
        });
        void this.navigateToStep(event.state);
        void this.saveSession();
        break;

      case 'STEP_VIEWED':
        this.trackStepViewed(event.stepId, event.stepIndex);
        break;

      case 'STEP_COMPLETED':
        this.trackStepCompleted(event.stepId, event.stepIndex);
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

  // ============================================
  // PRIVATE: NAVIGATION (NavController-based)
  // ============================================

  /**
   * Navigate to the current step page using Ionic NavController.
   * Direction determines animation: forward (push), backward (pop), none (no animation).
   */
  private async navigateToStep(snapshot: OnboardingStateSnapshot): Promise<void> {
    // Don't navigate during or after completion — handleCompletion manages its own navigation.
    // The finally block in machine.complete() fires notifyStateChange() AFTER onComplete resolves
    // (which already navigated to congratulations). Without this guard, navigateToStep would see
    // the user is no longer on the last step page and try to navigate back, triggering the
    // onboardingInProgressGuard which redirects to /agent (since hasCompletedOnboarding is now true).
    if (snapshot.machineState === 'completing' || snapshot.machineState === 'complete') {
      return;
    }

    const stepId = snapshot.steps[snapshot.currentStepIndex]?.id;
    if (!stepId) return;

    const targetPath = `/auth/onboarding/${stepId}`;
    const currentPath = this.location.path();
    if (currentPath === targetPath) return; // Already on correct page

    const direction = snapshot.animationDirection as AnimationDirection;

    if (direction === 'forward') {
      await this.navController.navigateForward(targetPath, {
        animated: true,
        animationDirection: 'forward',
      });
    } else if (direction === 'backward') {
      await this.navController.navigateBack(targetPath, {
        animated: true,
        animationDirection: 'back',
      });
    } else {
      // 'none' — initial load or session restore, navigate without animation
      await this.navController.navigateForward(targetPath, { animated: false });
    }
  }

  private syncSignalsFromSnapshot(state: OnboardingStateSnapshot): void {
    this._state.set(state.machineState);
    this._currentStepIndex.set(state.currentStepIndex);
    this._steps.set([...state.steps]);
    this._completedSteps.set(new Set(state.completedStepIds));
    this._formData.set({ ...state.formData });
    this._selectedRole.set(state.selectedRole);
    this._isLoading.set(state.isLoading);
    this._error.set(state.error);
    this._animationDirection.set(state.animationDirection as AnimationDirection);
    this._isCurrentStepValid.set(state.isCurrentStepValid);
  }

  // ============================================
  // PRIVATE: COMPLETION HANDLER
  // ============================================

  private async handleCompletion(formData: OnboardingFormData): Promise<void> {
    const user = this.authFlow.user();
    if (!user) {
      throw new Error('User not authenticated');
    }

    this.logger.info('Completing onboarding', { userId: user.uid });
    this.logger.debug('Form data', { formData: JSON.stringify(formData) });
    this.breadcrumb.trackStateChange('onboarding:completing', { userId: user.uid });

    try {
      const sportEntries = formData.sport?.sports || [];

      const userType: OnboardingProfileData['userType'] =
        formData.userType as OnboardingProfileData['userType'];

      const profileData: OnboardingProfileData = {
        userType,
        firstName: formData.profile?.firstName || '',
        lastName: formData.profile?.lastName || '',
        profileImg: formData.profile?.profileImgs?.[0] || undefined,
        profileImgs: formData.profile?.profileImgs || undefined,
        gender: formData.profile?.gender ?? undefined,
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
                logoUrl: entry.team.logoUrl ?? entry.team.logo ?? undefined,
                primaryColor: entry.team.primaryColor ?? entry.team.colors?.[0] ?? undefined,
                secondaryColor: entry.team.secondaryColor ?? entry.team.colors?.[1] ?? undefined,
                logo: entry.team.logoUrl ?? entry.team.logo ?? undefined,
                colors: entry.team.colors,
                teamId: entry.team.teamId ?? undefined,
              }
            : undefined,
        })),
        classOf: formData.profile?.classYear ?? undefined,
        // Location from profile step geolocation
        state: formData.profile?.location?.state,
        city: formData.profile?.location?.city,
        organization: formData.organization?.organizationName,
        coachTitle: formData.sport?.coachTitle ?? formData.organization?.title,
        linkSources: formData.linkSources,
        teamSelection: formData.teamSelection,
        createTeamProfile: formData.createTeamProfile,
        // Phone number from profile basics step
        phoneNumber: formData.profile?.phoneNumber || undefined,
      };

      const result = await this.performance.trace(
        TRACE_NAMES.ONBOARDING_PROFILE_SAVE,
        () => this.authApi.saveOnboardingProfile(user.uid, profileData),
        {
          attributes: { userType: profileData.userType ?? 'unknown' },
        }
      );
      this.logger.info('Profile data saved successfully');

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

    // Accept pending team invite before completing onboarding (creates RosterEntry + links sport)
    await this.authFlow.acceptPendingInvite(formData.userType ?? undefined);

    // Refresh user profile (bulk save already set onboardingCompleted: true)
    this.logger.debug('Refreshing user profile');
    try {
      await this.authFlow.refreshUserProfile();
    } catch (refreshError) {
      this.logger.error('refreshUserProfile failed', refreshError);
    }

    await this.waitForOnboardingComplete();
    await this.clearSession();
    this.trackCompleted();

    await this.haptics.notification('success');
    this.logger.debug('Navigating to congratulations page');
    // Use navigateRoot to replace the entire navigation stack.
    // navigateForward from inside the onboarding shell's IonRouterOutlet causes
    // a conflict when activating a route OUTSIDE the shell — the shell's outlet
    // destruction pops the page immediately after it renders ("flash then skip").
    await this.navController.navigateRoot('/auth/onboarding/congratulations', {
      animated: true,
      animationDirection: 'forward',
    });
  }

  private async waitForOnboardingComplete(maxWaitMs = 2000): Promise<void> {
    const startTime = Date.now();
    let delay = 50;

    while (!this.authFlow.hasCompletedOnboarding() && Date.now() - startTime < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.5, 200);
    }
  }

  // ============================================
  // PRIVATE: SESSION PERSISTENCE
  // ============================================

  private async tryRestoreSession(userId: string): Promise<boolean> {
    try {
      const sessionJson = await this.storage.get(MACHINE_SESSION_KEY);
      if (!sessionJson) return false;

      const session = deserializeSession(sessionJson);
      if (!session || session.userId !== userId) return false;

      if (Date.now() - session.timestamp > SESSION_EXPIRY_MS) {
        await this.storage.remove(MACHINE_SESSION_KEY);
        return false;
      }

      return this.machine.restoreSession(session);
    } catch (err) {
      this.logger.warn('Failed to restore session', { error: err });
      return false;
    }
  }

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

  private async clearSession(): Promise<void> {
    try {
      await this.storage.remove(MACHINE_SESSION_KEY);
      this.logger.debug('Session cleared');
    } catch (err) {
      this.logger.warn('Failed to clear session', { error: err });
    }
  }

  // ============================================
  // PRIVATE: ANALYTICS
  // ============================================

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

  private trackStepViewed(stepId: OnboardingStepId, stepIndex: number): void {
    const user = this.authFlow.user();
    if (!user) return;

    const steps = this._steps();
    const step = steps[stepIndex];
    if (!step) return;

    this.analytics.trackStepViewed(step, steps, stepIndex);
  }

  private trackStepCompleted(stepId: OnboardingStepId, stepIndex: number): void {
    const user = this.authFlow.user();
    if (!user) return;

    const steps = this._steps();
    const step = steps[stepIndex];
    if (!step) return;

    this.analytics.trackStepCompleted(step, steps, stepIndex);
  }

  private trackStepSkipped(stepId: OnboardingStepId, stepIndex: number): void {
    const user = this.authFlow.user();
    if (!user) return;

    const steps = this._steps();
    const step = steps[stepIndex];
    if (!step) return;

    this.analytics.trackStepSkipped(step, steps, stepIndex);
  }

  private trackRoleSelected(role: OnboardingUserType): void {
    const user = this.authFlow.user();
    if (!user) return;

    this.analytics.trackRoleSelected(role, this._steps().length);
  }

  private trackCompleted(): void {
    const user = this.authFlow.user();
    if (!user) return;

    const formData = this._formData();
    const sportEntries = formData.sport?.sports || [];
    const primarySport = sportEntries.find((e) => e.isPrimary) || sportEntries[0];

    this.analytics.trackCompleted({
      totalSteps: this._steps().length,
      userType: this._selectedRole() || 'athlete',
      sport: primarySport?.sport,
    });

    this.logger.info('Onboarding completed', {
      userId: user.uid,
      userType: this._selectedRole(),
      totalSteps: this._steps().length,
    });
  }

  private trackError(errorMessage: string): void {
    const step = this.currentStep();
    this.analytics.trackError(errorMessage, step.id);
    this.logger.error('Onboarding error', new Error(errorMessage), { step: step.id });
  }

  private trackReferralSourceSubmitted(data: ReferralSourceData): void {
    this.analytics.trackReferralSourceSubmitted({
      source: data.source,
      details: data.details,
      clubName: data.clubName,
      otherSpecify: data.otherSpecify,
    });
  }
}
