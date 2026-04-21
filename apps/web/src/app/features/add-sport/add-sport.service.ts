/**
 * @fileoverview AddSportService - State Management for the Add Sport Wizard (Web)
 * @module @nxt1/web/features/add-sport
 *
 * Signal-based service that manages the 2-step add-sport wizard state.
 * Follows the 4-pillar observability pattern.
 *
 *   Step 1 – Sport selection
 *   Step 2 – Connected accounts
 *
 * Saves via:
 *   - ProfileService.addSport()        → adds the sport entry and persists connectedSources
 */

import { Injectable, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { NxtToastService } from '@nxt1/ui/services/toast';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';

import type { SportFormData, LinkSourcesFormData } from '@nxt1/core/api';
import type { OnboardingUserType } from '@nxt1/core';
import { DEFAULT_SPORTS, isTeamRole, type SportCell } from '@nxt1/core/constants';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { mapToConnectedSources } from '@nxt1/core/profile';

import { AuthFlowService } from '../../core/services/auth/auth-flow.service';
import { ProfileService } from '../../core/services/api/profile-api.service';

// ============================================
// TYPES
// ============================================

type AddSportStep = 'sport' | 'link-sources';

const STEPS: AddSportStep[] = ['sport', 'link-sources'];

function normalizeSportName(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

@Injectable({ providedIn: 'root' })
export class AddSportService {
  // ============================================
  // INJECTED SERVICES — 4 observability pillars
  // ============================================

  private readonly router = inject(Router);
  private readonly authFlow = inject(AuthFlowService);
  private readonly profileService = inject(ProfileService);
  private readonly toast = inject(NxtToastService);
  private readonly platform = inject(NxtPlatformService);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly logger = inject(NxtLoggingService).child('AddSport');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  // ============================================
  // PRIVATE SIGNALS
  // ============================================

  private readonly _currentStepIndex = signal(0);
  private readonly _sportFormData = signal<SportFormData | null>(null);
  private readonly _linkSourcesFormData = signal<LinkSourcesFormData | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _animationDirection = signal<'forward' | 'backward'>('forward');

  // ============================================
  // PUBLIC COMPUTED SIGNALS
  // ============================================

  readonly currentStepIndex = computed(() => this._currentStepIndex());
  readonly currentStep = computed<AddSportStep>(() => STEPS[this._currentStepIndex()] ?? 'sport');
  readonly isLastStep = computed(() => this._currentStepIndex() === STEPS.length - 1);
  readonly canGoBack = computed(() => this._currentStepIndex() > 0);
  readonly isLoading = computed(() => this._isLoading());
  readonly animationDirection = computed(() => this._animationDirection());
  readonly sportFormData = computed(() => this._sportFormData());
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

  /** Whether Step 1 (sport) is valid */
  private readonly isSportStepValid = computed(() => {
    const data = this._sportFormData();
    return (data?.sports?.length ?? 0) > 0 && !!data?.sports?.[0]?.sport?.trim();
  });

  /** Whether the current step passes validation */
  readonly isCurrentStepValid = computed(() => {
    if (this.currentStep() === 'sport') return this.isSportStepValid();
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

  onLinkSourcesChange(data: LinkSourcesFormData): void {
    this._linkSourcesFormData.set(data);
  }

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
    if (this.isLastStep()) {
      void this.save();
    }
  }

  onBack(): void {
    if (this._currentStepIndex() === 0) {
      void this.router.navigate(['/']);
      return;
    }
    this._animationDirection.set('backward');
    this._currentStepIndex.set(0);
    this.breadcrumb.trackStateChange('add-sport:step-changed', { step: 'sport' });
    this.analytics?.trackEvent(APP_EVENTS.ADD_SPORT_STEP_CHANGED, {
      step: 'sport',
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
