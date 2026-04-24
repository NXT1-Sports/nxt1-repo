/**
 * @fileoverview AddSportService - State Management for the Add Sport Wizard
 * @module @nxt1/mobile/features/add-sport
 *
 * Lightweight 3-step wizard that lets users add a new sport to their profile
 * after initial onboarding:
 *
 *   Step 1 – Sport selection  (/add-sport/sport)
 *   Step 2 – Organization/program selection (/add-sport/organization)
 *   Step 3 – Connected accounts (/add-sport/link-sources)
 *
 * Saves via:
 *   - ProfileApiService.addSport()            → adds the sport entry and persists connectedSources
 *   - ProfileService.refresh()                → refreshes user data in-app
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import { Location } from '@angular/common';
import { NavController } from '@ionic/angular/standalone';

import {
  HapticsService,
  NxtToastService,
  NxtLoggingService,
  NxtBreadcrumbService,
  ANALYTICS_ADAPTER,
  type AnimationDirection,
  type TeamSearchResult,
} from '@nxt1/ui';
import { PerformanceService } from '../../core/services/infrastructure/performance.service';

import type { SportFormData, LinkSourcesFormData, TeamSelectionFormData } from '@nxt1/core/api';

import { DEFAULT_SPORTS, isTeamRole, type SportCell } from '@nxt1/core/constants';
import type { OnboardingUserType } from '@nxt1/core';
import { TRACE_NAMES, ATTRIBUTE_NAMES } from '@nxt1/core/performance';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { mapToConnectedSources } from '@nxt1/core/profile';
import { validateTeamSelection } from '@nxt1/core/api';

import { AuthFlowService } from '../../core/services/auth/auth-flow.service';
import { ProfileApiService } from '../../core/services/api/profile-api.service';
import { ProfileService } from '../../core/services/state/profile.service';
import { CapacitorHttpAdapter } from '../../core/infrastructure';
import { environment } from '../../../environments/environment';

// ============================================
// TYPES
// ============================================

type AddSportStep = 'sport' | 'organization' | 'link-sources';

interface QuickAddLinkTarget {
  quickAddLink(
    url: string
  ): Promise<
    { added: false; reason: string } | { added: true; kind: 'platform' | 'custom'; label: string }
  >;
}

const STEPS: AddSportStep[] = ['sport', 'organization', 'link-sources'];

function normalizeSportName(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

@Injectable()
export class AddSportService {
  // ============================================
  // INJECTED SERVICES
  // ============================================

  private readonly navController = inject(NavController);
  private readonly location = inject(Location);
  private readonly authFlow = inject(AuthFlowService);
  private readonly profileApi = inject(ProfileApiService);
  private readonly profileService = inject(ProfileService);
  private readonly http = inject(CapacitorHttpAdapter);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('AddSport');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly performance = inject(PerformanceService);

  // ============================================
  // WRITABLE SIGNALS
  // ============================================

  private readonly _currentStepIndex = signal(0);
  private readonly _sportFormData = signal<SportFormData | null>(null);
  private readonly _teamSelectionFormData = signal<TeamSelectionFormData | null>(null);
  private readonly _linkSourcesFormData = signal<LinkSourcesFormData | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _contentReady = signal(false);
  private readonly _footerVisible = signal(false);
  private readonly _quickAddLinkValue = signal('');

  // ============================================
  // QUICK-ADD LINK REF (set by link-sources page)
  // ============================================

  linkSourcesStepRef: QuickAddLinkTarget | null = null;

  // ============================================
  // PUBLIC COMPUTED SIGNALS
  // ============================================

  readonly currentStepIndex = computed(() => this._currentStepIndex());
  readonly sportFormData = computed(() => this._sportFormData());
  readonly teamSelectionFormData = computed(() => this._teamSelectionFormData());
  readonly linkSourcesFormData = computed(() => this._linkSourcesFormData());
  readonly isLoading = computed(() => this._isLoading());
  readonly contentReady = computed(() => this._contentReady());
  readonly footerVisible = computed(() => this._footerVisible());
  readonly quickAddLinkValue = computed(() => this._quickAddLinkValue());

  readonly currentStep = computed<AddSportStep>(() => STEPS[this._currentStepIndex()] ?? 'sport');

  readonly totalSteps = computed(() => STEPS.length);

  readonly isLastStep = computed(() => this._currentStepIndex() === STEPS.length - 1);

  readonly canGoBack = computed(() => this._currentStepIndex() > 0);

  readonly isLinkSourcesStep = computed(() => this.currentStep() === 'link-sources');

  readonly isOrganizationStep = computed(() => this.currentStep() === 'organization');

  readonly canSubmitQuickLink = computed(
    () => this._quickAddLinkValue().trim().length > 0 && !this._isLoading()
  );

  /** Selected sport names for the link-sources step sport picker */
  readonly selectedSportNames = computed<string[]>(() => {
    const data = this._sportFormData();
    return data?.sports?.map((s) => s.sport).filter(Boolean) ?? [];
  });

  /** Sports/teams already associated with the current user profile */
  readonly existingSportNames = computed<string[]>(() => {
    const user = this.profileService.user() as {
      sports?: Array<{ sport?: string | null }>;
      teamCode?: { sport?: string | null } | null;
    } | null;
    if (!user) return [];

    const fromSports = Array.isArray(user.sports)
      ? user.sports.map((s) => s?.sport).filter((s): s is string => typeof s === 'string')
      : [];
    const fromTeam = user.teamCode?.sport ? [user.teamCode.sport] : [];

    return Array.from(
      new Set([...fromSports, ...fromTeam].map((name) => normalizeSportName(name)).filter(Boolean))
    );
  });

  /** Available sports list with already-owned sports removed */
  readonly availableSports = computed<SportCell[]>(() => {
    const taken = new Set(this.existingSportNames());
    return (DEFAULT_SPORTS as SportCell[]).filter(
      (sport) => !taken.has(normalizeSportName(sport.name))
    );
  });

  /** Whether the sport step has a valid sport selected */
  readonly isSportStepValid = computed(() => {
    const data = this._sportFormData();
    return (data?.sports?.length ?? 0) > 0 && !!data?.sports?.[0]?.sport?.trim();
  });

  readonly isOrganizationStepValid = computed(() =>
    validateTeamSelection(this._teamSelectionFormData() ?? undefined)
  );

  readonly isCurrentStepValid = computed(() => {
    if (this.currentStep() === 'sport') return this.isSportStepValid();
    if (this.currentStep() === 'organization') return this.isOrganizationStepValid();
    // link-sources is always skippable
    return true;
  });

  /** The user's current role — used by link-sources to set scope */
  readonly selectedRole = computed<OnboardingUserType | null>(() => {
    const user = this.profileService.user();
    return (user?.role as OnboardingUserType | null) ?? null;
  });

  /** Whether the user has a team-management role (coach / director) */
  readonly isTeamRoleUser = computed(() => {
    const role = this.profileService.user()?.role;
    return role ? isTeamRole(role) : false;
  });

  /** Link scope based on user role */
  readonly linkScope = computed<'athlete' | 'team'>(() =>
    this.isTeamRoleUser() ? 'team' : 'athlete'
  );

  /** Page title adapts per role */
  readonly pageTitle = computed(() => (this.isTeamRoleUser() ? 'Add Team' : 'Add Sport'));

  // ============================================
  // LIFECYCLE
  // ============================================

  initialize(): void {
    this._currentStepIndex.set(0);
    this._sportFormData.set(null);
    this._teamSelectionFormData.set(null);
    this._linkSourcesFormData.set(null);
    this._isLoading.set(false);
    this._contentReady.set(false);
    this._footerVisible.set(false);
    this._quickAddLinkValue.set('');
    this.linkSourcesStepRef = null;
    this.logger.info('AddSportService initialized');
    this.breadcrumb.trackStateChange('add-sport:opened');
    this.analytics?.trackEvent(APP_EVENTS.ADD_SPORT_WIZARD_OPENED, {
      role: this.selectedRole() ?? 'unknown',
    });
  }

  destroy(): void {
    this.linkSourcesStepRef = null;
  }

  // ============================================
  // CONTENT READY (set by step pages)
  // ============================================

  setContentReady(ready: boolean): void {
    this._contentReady.set(ready);
    if (ready) this._footerVisible.set(true);
  }

  // ============================================
  // FORM DATA HANDLERS
  // ============================================

  onSportChange(data: SportFormData): void {
    this._sportFormData.set(data);
  }

  onTeamSelectionChange(data: TeamSelectionFormData): void {
    this._teamSelectionFormData.set(data);
  }

  onLinkSourcesChange(data: LinkSourcesFormData): void {
    this._linkSourcesFormData.set(data);
  }

  onCreateProgram(): void {
    this.logger.info('Create program requested from add-sport');
  }

  onJoinProgram(): void {
    this.logger.info('Join program requested from add-sport');
  }

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
    const rawValue = this._quickAddLinkValue().trim();
    if (!rawValue || !this.linkSourcesStepRef) return;

    const result = await this.linkSourcesStepRef.quickAddLink(rawValue);
    if (result.added) {
      this._quickAddLinkValue.set('');
    }
  }

  // ============================================
  // NAVIGATION
  // ============================================

  async onContinue(): Promise<void> {
    await this.haptics.impact('medium');

    if (this.currentStep() === 'sport') {
      const selected = normalizeSportName(this._sportFormData()?.sports?.[0]?.sport);
      if (selected && this.existingSportNames().includes(selected)) {
        const label = this.isTeamRoleUser() ? 'team' : 'sport';
        this.toast.error(`You already have this ${label}. Please choose a different one.`);
        return;
      }
      // Advance to organization step
      this._currentStepIndex.set(1);
      this._contentReady.set(false);
      this._footerVisible.set(false);
      this.breadcrumb.trackStateChange('add-sport:step-changed', { step: 'organization' });
      this.analytics?.trackEvent(APP_EVENTS.ADD_SPORT_STEP_CHANGED, {
        step: 'organization',
        direction: 'forward',
      });
      await this.navigateToStep('organization', 'forward');
      return;
    }

    if (this.currentStep() === 'organization') {
      this._currentStepIndex.set(2);
      this._contentReady.set(false);
      this._footerVisible.set(false);
      this.breadcrumb.trackStateChange('add-sport:step-changed', { step: 'link-sources' });
      this.analytics?.trackEvent(APP_EVENTS.ADD_SPORT_STEP_CHANGED, {
        step: 'link-sources',
        direction: 'forward',
      });
      await this.navigateToStep('link-sources', 'forward');
      return;
    }

    // Last step — save and finish
    await this.save();
  }

  async onSkip(): Promise<void> {
    await this.haptics.impact('light');
    // Organization step is optional — skip to link-sources
    if (this.isOrganizationStep()) {
      this._currentStepIndex.set(2);
      this._contentReady.set(false);
      this._footerVisible.set(false);
      this.breadcrumb.trackStateChange('add-sport:step-skipped', { step: 'organization' });
      this.analytics?.trackEvent(APP_EVENTS.ADD_SPORT_STEP_CHANGED, {
        step: 'link-sources',
        direction: 'forward',
        skipped: true,
      });
      await this.navigateToStep('link-sources', 'forward');
      return;
    }
    // link-sources is always skippable
    if (this.isLastStep()) {
      await this.save();
    }
  }

  async onBack(): Promise<void> {
    await this.haptics.impact('light');

    if (this._currentStepIndex() === 0) {
      // Exit the flow
      await this.navController.navigateBack('/');
      return;
    }

    const previousStepIndex = this._currentStepIndex() - 1;
    const previousStep = STEPS[previousStepIndex] ?? 'sport';

    this._currentStepIndex.set(previousStepIndex);
    this._contentReady.set(false);
    this._footerVisible.set(false);
    this.breadcrumb.trackStateChange('add-sport:step-changed', { step: previousStep });
    this.analytics?.trackEvent(APP_EVENTS.ADD_SPORT_STEP_CHANGED, {
      step: previousStep,
      direction: 'backward',
    });
    await this.navigateToStep(previousStep, 'backward');
  }

  // ============================================
  // SAVE
  // ============================================

  private async save(): Promise<void> {
    // Defensive check — route is already protected by authGuard, but guard against
    // unexpected token expiry between route entry and form submission.
    const user = this.authFlow.user();
    if (!user) {
      this.toast.error('You must be signed in to add a sport.');
      return;
    }
    const uid = user.uid;

    const sportData = this._sportFormData();
    const primarySport = sportData?.sports?.[0];
    if (!primarySport?.sport?.trim()) {
      this.toast.error('Please select a sport first.');
      return;
    }

    const selected = normalizeSportName(primarySport.sport);
    if (selected && this.existingSportNames().includes(selected)) {
      const label = this.isTeamRoleUser() ? 'team' : 'sport';
      this.toast.error(`You already have this ${label}. Please choose a different one.`);
      return;
    }

    this._isLoading.set(true);
    this.breadcrumb.trackStateChange('add-sport:saving', { sport: primarySport.sport });

    try {
      const newSources = mapToConnectedSources(this._linkSourcesFormData()?.links ?? []);

      // 1. Add the new sport to the user's profile
      const sportResponse = await this.performance.trace(
        TRACE_NAMES.PROFILE_SPORT_ADD,
        () =>
          this.profileApi.addSport(uid, {
            sport: primarySport.sport,
            positions: primarySport.positions ?? [],
            teamSelection: this._teamSelectionFormData() ?? undefined,
            connectedSources: newSources,
          }),
        {
          attributes: {
            [ATTRIBUTE_NAMES.SPORT_TYPE]: primarySport.sport,
          },
        }
      );

      if (!sportResponse.success) {
        this.logger.error('Failed to add sport', sportResponse);
        this.toast.error('Failed to add sport. Please try again.');
        return;
      }

      this.logger.info('Sport added', { sport: primarySport.sport });

      // 2. Refresh user data
      try {
        await this.profileService.refresh(uid);
      } catch (err) {
        this.logger.warn('Profile refresh failed', { error: err });
      }

      this.analytics?.trackEvent(APP_EVENTS.PROFILE_SPORT_ADDED, {
        sport: primarySport.sport,
        role: this.selectedRole() ?? 'unknown',
      });
      this.analytics?.trackEvent(APP_EVENTS.ADD_SPORT_WIZARD_COMPLETED, {
        sport: primarySport.sport,
        connectedSourcesCount: newSources.length,
      });
      this.breadcrumb.trackStateChange('add-sport:completed', { sport: primarySport.sport });
      this.toast.success(`${primarySport.sport} added to your profile!`);

      // Navigate back to main app
      await this.navController.navigateRoot('/', { animated: true, animationDirection: 'back' });
    } catch (err) {
      this.logger.error('AddSport save error', err);
      this.breadcrumb.trackStateChange('add-sport:error');
      this.toast.error('Something went wrong. Please try again.');
    } finally {
      this._isLoading.set(false);
    }
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private async navigateToStep(step: AddSportStep, direction: AnimationDirection): Promise<void> {
    const targetPath = `/add-sport/${step}`;
    const currentPath = this.location.path();
    if (currentPath === targetPath) return;

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
      await this.navController.navigateForward(targetPath, { animated: false });
    }
  }
}
