/**
 * @fileoverview AddSportService - State Management for the Add Sport Wizard
 * @module @nxt1/mobile/features/add-sport
 *
 * Lightweight 2-step wizard that lets users add a new sport to their profile
 * after initial onboarding:
 *
 *   Step 1 – Sport selection  (/add-sport/sport)
 *   Step 2 – Connected accounts (/add-sport/link-sources)
 *
 * Saves via:
 *   - ProfileApiService.addSport()            → adds the sport entry
 *   - ProfileApiService.updateProfile()       → merges connected sources
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
} from '@nxt1/ui';

import type { SportFormData, LinkSourcesFormData } from '@nxt1/core/api';

import type { ConnectedSource } from '@nxt1/core/models';

import { DEFAULT_SPORTS, isTeamRole, type SportCell } from '@nxt1/core/constants';
import type { OnboardingUserType } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { mapToConnectedSources, mergeConnectedSources } from '@nxt1/core/profile';

import { AuthFlowService } from '../auth/services/auth-flow.service';
import { ProfileApiService } from '../../core/services/api/profile-api.service';
import { ProfileService } from '../../core/services/profile.service';

// ============================================
// TYPES
// ============================================

type AddSportStep = 'sport' | 'link-sources';

interface QuickAddLinkTarget {
  quickAddLink(
    url: string
  ): Promise<
    { added: false; reason: string } | { added: true; kind: 'platform' | 'custom'; label: string }
  >;
}

const STEPS: AddSportStep[] = ['sport', 'link-sources'];

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
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('AddSport');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  // ============================================
  // WRITABLE SIGNALS
  // ============================================

  private readonly _currentStepIndex = signal(0);
  private readonly _sportFormData = signal<SportFormData | null>(null);
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

  readonly isCurrentStepValid = computed(() => {
    if (this.currentStep() === 'sport') return this.isSportStepValid();
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

  onLinkSourcesChange(data: LinkSourcesFormData): void {
    this._linkSourcesFormData.set(data);
  }

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
      // Advance to link-sources step
      this._currentStepIndex.set(1);
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
    // Only link-sources is skippable
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

    this._currentStepIndex.set(0);
    this._contentReady.set(false);
    this._footerVisible.set(false);
    this.breadcrumb.trackStateChange('add-sport:step-changed', { step: 'sport' });
    this.analytics?.trackEvent(APP_EVENTS.ADD_SPORT_STEP_CHANGED, {
      step: 'sport',
      direction: 'backward',
    });
    await this.navigateToStep('sport', 'backward');
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
      // 1. Add the new sport to the user's profile
      const sportResponse = await this.profileApi.addSport(uid, {
        sport: primarySport.sport,
        positions: primarySport.positions ?? [],
      });

      if (!sportResponse.success) {
        this.logger.error('Failed to add sport', sportResponse);
        this.toast.error('Failed to add sport. Please try again.');
        return;
      }

      this.logger.info('Sport added', { sport: primarySport.sport });

      // 2. Save connected accounts (link sources) if any were provided
      const linkSourcesData = this._linkSourcesFormData();
      const connectedEntries = linkSourcesData?.links ?? [];
      const newSources = mapToConnectedSources(connectedEntries);

      if (newSources.length > 0) {
        const existingUser = this.profileService.user();
        const existingSources: ConnectedSource[] = existingUser?.connectedSources ?? [];
        const mergedSources = mergeConnectedSources(existingSources, newSources);

        const updateResponse = await this.profileApi.updateProfile(uid, {
          connectedSources: mergedSources,
        });

        if (updateResponse.success) {
          this.logger.info('Connected sources updated', { count: newSources.length });
        } else {
          this.logger.warn('Failed to update connected sources', { error: updateResponse.error });
        }
      }

      // 3. Refresh user data
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
