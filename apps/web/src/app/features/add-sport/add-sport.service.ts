/**
 * @fileoverview AddSportService - State Management for the Add Sport Wizard (Web)
 * @module @nxt1/web/features/add-sport
 *
 * Signal-based service that manages the 3-step add-sport wizard state.
 * Follows the 4-pillar observability pattern.
 *
 *   Step 1 – Sport selection
 *   Step 2 – Organization/program selection
 *   Step 3 – Connected accounts
 *
 * Saves via:
 *   - ProfileService.addSport()        → adds the sport entry and persists connectedSources
 */

import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { NxtToastService } from '@nxt1/ui/services/toast';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { ProfileGenerationStateService } from '@nxt1/ui/profile';

import type { SportFormData, LinkSourcesFormData, TeamSelectionFormData } from '@nxt1/core/api';
import type { OnboardingUserType } from '@nxt1/core';
import { DEFAULT_SPORTS, isTeamRole, type SportCell } from '@nxt1/core/constants';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { validateTeamSelection } from '@nxt1/core/api';
import { mapToConnectedSources } from '@nxt1/core/profile';
import { environment } from '../../../environments/environment';

import { AuthFlowService } from '../../core/services/auth/auth-flow.service';
import { ProfileService } from '../../core/services/api/profile-api.service';

// ============================================
// TYPES
// ============================================

type AddSportStep = 'sport' | 'organization' | 'link-sources';

const STEPS: AddSportStep[] = ['sport', 'organization', 'link-sources'];

function normalizeSportName(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function hasAttachedTeam(sport: {
  team?: { teamId?: string | null; organizationId?: string | null; id?: string | null } | null;
}): boolean {
  const team = sport.team;
  if (!team) return false;

  return Boolean(team.teamId?.trim() || team.organizationId?.trim() || team.id?.trim());
}

@Injectable({ providedIn: 'root' })
export class AddSportService {
  // ============================================
  // INJECTED SERVICES — 4 observability pillars
  // ============================================

  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly authFlow = inject(AuthFlowService);
  private readonly profileService = inject(ProfileService);
  private readonly toast = inject(NxtToastService);
  private readonly platform = inject(NxtPlatformService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly profileGenerationState = inject(ProfileGenerationStateService);

  private readonly logger = inject(NxtLoggingService).child('AddSport');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  // ============================================
  // PRIVATE SIGNALS
  // ============================================

  private readonly _currentStepIndex = signal(0);
  private readonly _sportFormData = signal<SportFormData | null>(null);
  private readonly _teamSelectionFormData = signal<TeamSelectionFormData | null>(null);
  private readonly _linkSourcesFormData = signal<LinkSourcesFormData | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _animationDirection = signal<'forward' | 'backward'>('forward');

  // ============================================
  // PUBLIC COMPUTED SIGNALS
  // ============================================

  readonly currentStepIndex = computed(() => this._currentStepIndex());
  readonly currentStep = computed<AddSportStep>(() => STEPS[this._currentStepIndex()] ?? 'sport');
  readonly isLastStep = computed(() => this._currentStepIndex() === STEPS.length - 1);
  readonly isOrganizationStep = computed(() => this.currentStep() === 'organization');
  readonly canGoBack = computed(() => this._currentStepIndex() > 0);
  readonly isLoading = computed(() => this._isLoading());
  readonly animationDirection = computed(() => this._animationDirection());
  readonly sportFormData = computed(() => this._sportFormData());
  readonly teamSelectionFormData = computed(() => this._teamSelectionFormData());
  readonly linkSourcesFormData = computed(() => this._linkSourcesFormData());
  readonly isMobile = computed(() => this.platform.isMobile());
  readonly totalSteps = STEPS.length;

  /** The user's current role */
  readonly userRole = computed<OnboardingUserType | null>(() => {
    const user = this.authFlow.user();
    return (user?.role as OnboardingUserType | null) ?? null;
  });

  /** Whether the user has a team-management role (coach / director) */
  readonly isTeamRoleUser = computed(() => {
    const role = this.authFlow.user()?.role;
    return role ? isTeamRole(role) : false;
  });

  /** Link scope — 'team' for coaches/directors, 'athlete' for everyone else */
  readonly linkScope = computed<'athlete' | 'team'>(() =>
    this.isTeamRoleUser() ? 'team' : 'athlete'
  );

  /** Page title adapts per role */
  readonly pageTitle = computed(() => (this.isTeamRoleUser() ? 'Add Team' : 'Add Sport'));

  /** Role-aware prompt for the sport selection step */
  readonly sportStepPrompt = computed(() =>
    this.isTeamRoleUser()
      ? 'Select the sport your team competes in.'
      : 'Select the sport you want to add to your profile.'
  );

  /** Agent X message adapts per role and step */
  readonly agentXMessage = computed(() => {
    if (this.currentStep() === 'link-sources') {
      return 'Connect your accounts to unlock AI-powered insights for this sport.';
    }
    if (this.currentStep() === 'organization') {
      return this.isTeamRoleUser()
        ? 'Which organization or program should this new team belong to?'
        : 'Which organization or program should this sport be connected to?';
    }
    return this.isTeamRoleUser()
      ? 'Which sport does your team play?'
      : 'Which sport are you adding to your profile?';
  });

  /** Sport names for passing to link-sources step */
  readonly selectedSportNames = computed<string[]>(() => {
    const data = this._sportFormData();
    return data?.sports?.map((s) => s.sport).filter(Boolean) ?? [];
  });

  /** Sports/teams already associated with the current user profile */
  readonly existingSportNames = computed<string[]>(() => {
    const user = this.authFlow.user() as {
      sports?: Array<{
        sport?: string | null;
        team?: {
          teamId?: string | null;
          organizationId?: string | null;
          id?: string | null;
        } | null;
      }>;
      teamCode?: { sport?: string | null } | null;
    } | null;
    if (!user) return [];

    const fromSports = Array.isArray(user.sports)
      ? this.isTeamRoleUser()
        ? user.sports
            .filter((sport) => hasAttachedTeam(sport))
            .map((sport) => sport.sport)
            .filter((sport): sport is string => typeof sport === 'string')
        : user.sports
            .map((sport) => sport?.sport)
            .filter((sport): sport is string => typeof sport === 'string')
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

  /** Whether Step 1 (sport) is valid */
  private readonly isSportStepValid = computed(() => {
    const data = this._sportFormData();
    return (data?.sports?.length ?? 0) > 0 && !!data?.sports?.[0]?.sport?.trim();
  });

  private readonly isOrganizationStepValid = computed(() =>
    validateTeamSelection(this._teamSelectionFormData() ?? undefined)
  );

  /** Whether the current step passes validation */
  readonly isCurrentStepValid = computed(() => {
    if (this.currentStep() === 'sport') return this.isSportStepValid();
    if (this.currentStep() === 'organization') return this.isOrganizationStepValid();
    return true; // link-sources is always skippable/valid
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  initialize(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const user = this.authFlow.user();
    if (!user) {
      this.logger.warn('Add sport accessed without auth — redirecting');
      void this.router.navigate(['/auth']);
      return;
    }

    this._currentStepIndex.set(0);
    this._sportFormData.set(null);
    this._teamSelectionFormData.set(null);
    this._linkSourcesFormData.set(null);
    this._isLoading.set(false);
    this._animationDirection.set('forward');

    this.logger.info('Add sport wizard opened', { role: user.role });
    this.breadcrumb.trackStateChange('add-sport:opened', { role: user.role ?? 'unknown' });
    this.analytics?.trackEvent(APP_EVENTS.ADD_SPORT_WIZARD_OPENED, {
      role: user.role ?? 'unknown',
    });
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
    this.toast.info('Create Program is coming soon!');
  }

  onJoinProgram(): void {
    this.logger.info('Join program requested from add-sport');
    this.toast.info('Join Program is coming soon!');
  }

  readonly searchTeamsFn = async (query: string) => {
    this.logger.debug('Program search requested', { query });
    try {
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
        }>(`${environment.apiURL}/programs/search`, { params: { q: query, limit: '20' } })
      );

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
  // NAVIGATION
  // ============================================

  onContinue(): void {
    if (this.currentStep() === 'sport') {
      const selected = normalizeSportName(this._sportFormData()?.sports?.[0]?.sport);
      if (selected && this.existingSportNames().includes(selected)) {
        const label = this.isTeamRoleUser() ? 'team' : 'sport';
        this.toast.error(`You already have this ${label}. Please choose a different one.`);
        return;
      }
      this._animationDirection.set('forward');
      this._currentStepIndex.set(1);
      this.breadcrumb.trackStateChange('add-sport:step-changed', { step: 'organization' });
      this.analytics?.trackEvent(APP_EVENTS.ADD_SPORT_STEP_CHANGED, {
        step: 'organization',
        direction: 'forward',
      });
      return;
    }

    if (this.currentStep() === 'organization') {
      this._animationDirection.set('forward');
      this._currentStepIndex.set(2);
      this.breadcrumb.trackStateChange('add-sport:step-changed', { step: 'link-sources' });
      this.analytics?.trackEvent(APP_EVENTS.ADD_SPORT_STEP_CHANGED, {
        step: 'link-sources',
        direction: 'forward',
      });
      return;
    }
    // Last step — save
    void this.save();
  }

  onSkip(): void {
    // Organization step is optional — skip to link-sources
    if (this.isOrganizationStep()) {
      this._animationDirection.set('forward');
      this._currentStepIndex.set(2);
      this.breadcrumb.trackStateChange('add-sport:step-skipped', { step: 'organization' });
      this.analytics?.trackEvent(APP_EVENTS.ADD_SPORT_STEP_CHANGED, {
        step: 'link-sources',
        direction: 'forward',
        skipped: true,
      });
      return;
    }
    if (this.isLastStep()) {
      void this.save();
    }
  }

  onBack(): void {
    if (this._currentStepIndex() === 0) {
      void this.router.navigate(['/']);
      return;
    }

    const previousStepIndex = this._currentStepIndex() - 1;
    const previousStep = STEPS[previousStepIndex] ?? 'sport';

    this._animationDirection.set('backward');
    this._currentStepIndex.set(previousStepIndex);
    this.breadcrumb.trackStateChange('add-sport:step-changed', { step: previousStep });
    this.analytics?.trackEvent(APP_EVENTS.ADD_SPORT_STEP_CHANGED, {
      step: previousStep,
      direction: 'backward',
    });
  }

  // ============================================
  // SAVE
  // ============================================

  private async save(): Promise<void> {
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
      const sportResponse = await firstValueFrom(
        this.profileService.addSport(uid, {
          sport: primarySport.sport,
          positions: primarySport.positions ?? [],
          teamSelection: this._teamSelectionFormData() ?? undefined,
          connectedSources: newSources,
        })
      );

      if (!sportResponse.success) {
        this.logger.error('Failed to add sport', { error: sportResponse.error });
        this.toast.error('Failed to add sport. Please try again.');
        return;
      }

      this.logger.info('Sport added', { sport: primarySport.sport });

      // Invalidate profile cache so home page reflects new sport
      this.profileService.invalidateCache(uid);

      // Refresh the auth user signal so sidebar/header reflect new sport immediately
      await this.authFlow.refreshUserProfile();

      const allScrapeJobIds =
        sportResponse.data?.scrapeJobIds ??
        (sportResponse.data?.scrapeJobId ? [sportResponse.data.scrapeJobId] : []);
      if (allScrapeJobIds.length > 0) {
        const platformNames =
          this._linkSourcesFormData()
            ?.links?.filter((link) => link.connected)
            .map((link) => link.platform)
            .join(', ') ?? '';

        // Primary job: starts the banner + opens the SSE resume stream
        this.profileGenerationState.attachToOperation(
          allScrapeJobIds[0],
          sportResponse.data?.scrapeThreadId,
          platformNames
        );
        // Additional jobs: register observers so their tool-step events advance the same banner
        for (const jobId of allScrapeJobIds.slice(1)) {
          this.profileGenerationState.watchForProfileWrites(jobId, platformNames);
        }
        this.logger.info('Backend scrape jobs started for add-sport', {
          scrapeJobIds: allScrapeJobIds,
          scrapeThreadId: sportResponse.data?.scrapeThreadId,
          sport: primarySport.sport,
          jobCount: allScrapeJobIds.length,
        });
      }

      const label = this.isTeamRoleUser() ? 'Team' : 'Sport';
      this.analytics?.trackEvent(APP_EVENTS.PROFILE_SPORT_ADDED, {
        sport: primarySport.sport,
        role: user.role ?? 'unknown',
      });
      this.analytics?.trackEvent(APP_EVENTS.ADD_SPORT_WIZARD_COMPLETED, {
        sport: primarySport.sport,
        connectedSourcesCount: newSources.length,
      });
      this.breadcrumb.trackStateChange('add-sport:completed', { sport: primarySport.sport });
      this.toast.success(`${primarySport.sport} added to your profile!`);
      this.logger.info(`${label} added successfully`, { sport: primarySport.sport });

      await this.router.navigate(['/']);
    } catch (err) {
      this.logger.error('AddSport save error', err);
      this.breadcrumb.trackStateChange('add-sport:error');
      this.toast.error('Something went wrong. Please try again.');
    } finally {
      this._isLoading.set(false);
    }
  }
}
