/**
 * @fileoverview Edit Profile Service - Shared State Management
 * @module @nxt1/ui/edit-profile
 * @version 1.0.0
 *
 * Signal-based state management for Edit Profile feature.
 * Shared between web and mobile applications.
 *
 * Features:
 * - Reactive state with Angular signals
 * - Section-based form management
 * - Profile completion tracking
 * - XP rewards on field completion
 * - Dirty state tracking
 * - Validation management
 * - Toggle between mock data and real API
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import type {
  EditProfileSectionId,
  EditProfileSection,
  EditProfileFormData,
  ProfileCompletionData,
  ProfileCompletionTier,
} from '@nxt1/core';
import { PROFILE_COMPLETION_TIERS, getNextTier } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../services/analytics';
import { NxtBreadcrumbService } from '../services/breadcrumb';

/**
 * Edit Profile state management service.
 * Provides reactive state for the profile editing interface.
 *
 * API Integration:
 * - Expects an optional EditProfileApiService to be provided
 * - Falls back to mock data if no API service is available
 * - Toggle USE_MOCK_DATA flag to switch between mock and real API
 */
@Injectable({ providedIn: 'root' })
export class EditProfileService {
  // Optional API service - must be provided by platform (mobile/web)
  // Platform can provide this via dependency injection
  private api?: {
    getProfile: (
      userId: string,
      sportIndex?: number
    ) => Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }>;
    updateSection: (
      userId: string,
      sectionId: string,
      data: Record<string, unknown>,
      sportIndex?: number
    ) => Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }>;
    updateActiveSportIndex: (
      userId: string,
      activeSportIndex: number
    ) => Promise<{
      success: boolean;
      data?: unknown;
      error?: string;
    }>;
    uploadPhoto: (
      userId: string,
      type: 'profile' | 'banner',
      file: File | Blob
    ) => Promise<{
      success: boolean;
      data?: { url: string; xpAwarded?: number };
      error?: string;
    }>;
  };

  // Store current user ID and sport index for save operations
  private currentUserId?: string;
  private currentSportIndex?: number;

  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('EditProfileService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _formData = signal<EditProfileFormData | null>(null);
  private readonly _completion = signal<ProfileCompletionData | null>(null);
  private readonly _sections = signal<EditProfileSection[]>([]);
  private readonly _expandedSection = signal<EditProfileSectionId | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _isSaving = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _dirtyFields = signal<Set<string>>(new Set());
  private readonly _validationErrors = signal<Record<string, string>>({});
  private readonly _rawUserData = signal<unknown>(null);
  private readonly _activeSportIndex = signal<number>(0);
  private readonly _showCompletionCelebration = signal(false);
  private readonly _lastUnlockedTier = signal<ProfileCompletionTier | null>(null);

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Current form data */
  readonly formData = computed(() => this._formData());

  /** Profile completion data */
  readonly completion = computed(() => this._completion());

  /** Edit profile sections with fields */
  readonly sections = computed(() => this._sections());

  /** Currently expanded section ID */
  readonly expandedSection = computed(() => this._expandedSection());

  /** Whether loading profile data */
  readonly isLoading = computed(() => this._isLoading());

  /** Whether saving changes */
  readonly isSaving = computed(() => this._isSaving());

  /** Current error message */
  readonly error = computed(() => this._error());

  /** Dirty fields set */
  readonly dirtyFields = computed(() => this._dirtyFields());

  /** Validation errors by field */
  readonly validationErrors = computed(() => this._validationErrors());

  /** Whether there are unsaved changes */
  readonly hasUnsavedChanges = computed(() => this._dirtyFields().size > 0);

  /** Whether to show completion celebration */
  readonly showCompletionCelebration = computed(() => this._showCompletionCelebration());

  /** Last unlocked tier for celebration */
  readonly lastUnlockedTier = computed(() => this._lastUnlockedTier());

  /** Raw user data with all sports */
  readonly rawUserData = computed(() => this._rawUserData());

  /** Currently active sport index being edited */
  readonly activeSportIndex = computed(() => this._activeSportIndex());

  /** All sports from raw user data */
  readonly allSports = computed(() => this._rawUserData()?.sports ?? []);

  // ============================================
  // DERIVED COMPUTEDS
  // ============================================

  /** Completion percentage */
  readonly completionPercent = computed(() => this._completion()?.percentage ?? 0);

  /** Current tier */
  readonly currentTier = computed(() => this._completion()?.tier ?? 'rookie');

  /** Current tier config */
  readonly currentTierConfig = computed(() => {
    const tier = this.currentTier();
    return PROFILE_COMPLETION_TIERS[tier];
  });

  /** Next tier config (if not at legend) */
  readonly nextTierConfig = computed(() => {
    const next = getNextTier(this.currentTier());
    return next ? PROFILE_COMPLETION_TIERS[next] : null;
  });

  /** Progress to next tier (0-100) */
  readonly progressToNextTier = computed(() => {
    const completion = this._completion();
    if (!completion || !completion.nextTier) return 100;

    const currentMin = PROFILE_COMPLETION_TIERS[completion.tier].minPercent;
    const nextMin = PROFILE_COMPLETION_TIERS[completion.nextTier].minPercent;
    const range = nextMin - currentMin;
    const progress = completion.percentage - currentMin;

    return Math.min(100, Math.max(0, (progress / range) * 100));
  });

  /** XP earned / total */
  readonly xpProgress = computed(() => {
    const completion = this._completion();
    return {
      earned: completion?.xpEarned ?? 0,
      total: completion?.xpTotal ?? 800,
    };
  });

  /** Fields completed / total */
  readonly fieldsProgress = computed(() => {
    const completion = this._completion();
    return {
      completed: completion?.fieldsCompleted ?? 0,
      total: completion?.fieldsTotal ?? 36,
    };
  });

  /** Completed sections */
  readonly completedSections = computed(() => {
    return this._sections().filter((s) => s.completionPercent === 100);
  });

  /** Incomplete sections */
  readonly incompleteSections = computed(() => {
    return this._sections().filter((s) => s.completionPercent < 100);
  });

  // ============================================
  // API SETTER (for platform-specific injection)
  // ============================================

  /**
   * Set the API service to use for data fetching.
   * This allows mobile/web to inject their own API adapter.
   */
  setApiService(api: {
    getProfile: (
      userId: string,
      sportIndex?: number
    ) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    updateSection: (
      userId: string,
      sectionId: string,
      data: Record<string, unknown>,
      sportIndex?: number
    ) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    updateActiveSportIndex: (
      userId: string,
      activeSportIndex: number
    ) => Promise<{ success: boolean; data?: unknown; error?: string }>;
    uploadPhoto: (
      userId: string,
      type: 'profile' | 'banner',
      file: File | Blob
    ) => Promise<{ success: boolean; data?: unknown; error?: string }>;
  }): void {
    this.api = api;
    this.logger.debug('API service configured');
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Load profile data for editing.
      // Requires EditProfileApiService to be configured.
   *
   * @param userId - User ID to load
   * @param sportIndex - Optional sport index to load (defaults to activeSportIndex)
   */
  async loadProfile(userId?: string, sportIndex?: number): Promise<void> {
    const effectiveUserId = userId ?? this.currentUserId;
    const effectiveSportIndex = sportIndex ?? this.currentSportIndex;

    this.logger.info('Loading profile for editing', {
      userId: effectiveUserId,
      sportIndex: effectiveSportIndex,
    });

    // Store user ID and sport index for save operations
    if (effectiveUserId) {
      this.currentUserId = effectiveUserId;
    }
    if (effectiveSportIndex !== undefined) {
      this.currentSportIndex = effectiveSportIndex;
    }

    // Set active sport index immediately from parameter (before API call)
    // This ensures positionOptions computed updates right away
    if (effectiveSportIndex !== undefined) {
      this._activeSportIndex.set(effectiveSportIndex);
      this.logger.info('Set active sport index from parameter', {
        sportIndex: effectiveSportIndex,
      });
    }

    // Clear previous data to avoid showing stale data
    this._formData.set(null);
    this._isLoading.set(true);
    this._error.set(null);

    try {
      // Use real API
      if (this.api && effectiveUserId) {
        const response = await this.api.getProfile(effectiveUserId, effectiveSportIndex);

        if (!response.success || !response.data) {
          throw new Error(response.error ?? 'Failed to load profile');
        }

        this.logger.info('Profile data received from API', {
          userId: effectiveUserId,
          requestedSportIndex: effectiveSportIndex,
          receivedSport: response.data.formData.sportsInfo.sport,
          receivedJerseyNumber: response.data.formData.sportsInfo.jerseyNumber,
          receivedPrimaryPosition: response.data.formData.sportsInfo.primaryPosition,
          receivedSecondaryPositions: response.data.formData.sportsInfo.secondaryPositions,
          receivedActiveSportIndex: response.data.activeSportIndex,
          totalSports: response.data.rawUser?.sports?.length,
          completion: response.data.completion.percentage,
        });

        // Store raw user data and active sport index for sport switching
        if (response.data.rawUser) {
          this._rawUserData.set(response.data.rawUser);
        }
        if (response.data.activeSportIndex !== undefined) {
          this._activeSportIndex.set(response.data.activeSportIndex);
        }

        this._formData.set(response.data.formData);
        this._completion.set(response.data.completion);
        this._sections.set([]);

        this.logger.info('Profile loaded from API - formData updated', {
          sport: this._formData()?.sportsInfo?.sport,
          jerseyNumber: this._formData()?.sportsInfo?.jerseyNumber,
          primaryPosition: this._formData()?.sportsInfo?.primaryPosition,
        });
      } else {
        throw new Error(
          !this.api
            ? 'Edit profile API is not configured'
            : 'Missing user context for edit profile reload'
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load profile';
      this._error.set(message);
      this.logger.error('Failed to load profile', err);
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Toggle section expansion.
   */
  toggleSection(sectionId: EditProfileSectionId): void {
    const current = this._expandedSection();
    const newExpanded = current === sectionId ? null : sectionId;
    this._expandedSection.set(newExpanded);

    // Haptic feedback
    this.haptics.impact('light');

    this.logger.debug('Section toggled', { sectionId, expanded: newExpanded === sectionId });
  }

  /**
   * Expand a specific section.
   */
  expandSection(sectionId: EditProfileSectionId): void {
    this._expandedSection.set(sectionId);
    this.haptics.impact('light');
  }

  /**
   * Collapse all sections.
   */
  collapseAllSections(): void {
    this._expandedSection.set(null);
  }

  /**
   * Switch to a different sport profile for editing.
   * Re-generates formData from rawUser based on the new sport index.
   */
  switchSport(sportIndex: number): void {
    const rawUser = this._rawUserData();
    if (!rawUser || !rawUser.sports || sportIndex >= rawUser.sports.length) {
      this.logger.warn('Cannot switch sport: invalid index or no raw user data', {
        sportIndex,
        totalSports: rawUser?.sports?.length,
      });
      return;
    }

    const targetSport = rawUser.sports[sportIndex];

    this.logger.info('Switching to different sport profile', {
      fromIndex: this._activeSportIndex(),
      toIndex: sportIndex,
      fromSport: this._formData()?.sportsInfo?.sport,
      toSport: targetSport.sport,
    });

    // Update active sport index
    this._activeSportIndex.set(sportIndex);
    this.currentSportIndex = sportIndex;

    // Re-generate formData for the new sport
    const currentFormData = this._formData();
    if (!currentFormData) return;

    const updatedFormData: EditProfileFormData = {
      ...currentFormData,
      sportsInfo: {
        sport: targetSport.sport,
        primaryPosition: targetSport.positions?.[0],
        secondaryPositions: targetSport.positions?.slice(1),
        jerseyNumber: targetSport.jerseyNumber,
        yearsExperience: targetSport.yearsExperience,
        teamName: targetSport.team?.name,
        teamType: targetSport.team?.type,
        teamLogoUrl: targetSport.team?.logoUrl,
        teamOrganizationId: targetSport.team?.organizationId,
      },
      academics: {
        ...currentFormData.academics,
        school: targetSport.team?.name,
        graduationDate: rawUser.classOf ? String(rawUser.classOf) : undefined,
      },
      physical: {
        height: rawUser.height,
        weight: rawUser.weight,
        wingspan: targetSport.metrics?.['wingspan']
          ? String(targetSport.metrics['wingspan'])
          : undefined,
        fortyYardDash: targetSport.metrics?.['40YardDash']
          ? String(targetSport.metrics['40YardDash'])
          : undefined,
        verticalJump: targetSport.metrics?.['verticalJump']
          ? String(targetSport.metrics['verticalJump'])
          : undefined,
      },
    };

    this._formData.set(updatedFormData);

    this.logger.debug('Sport switched successfully', {
      sportIndex,
      sport: targetSport.sport,
      jerseyNumber: targetSport.jerseyNumber,
      primaryPosition: targetSport.positions?.[0],
    });
  }

  /**
   * Update a field value.
   */
  updateField(sectionId: EditProfileSectionId, fieldId: string, value: unknown): void {
    // Mark field as dirty
    this._dirtyFields.update((fields) => {
      const newFields = new Set(fields);
      newFields.add(`${sectionId}.${fieldId}`);
      return newFields;
    });

    // Clear validation error for this field
    this._validationErrors.update((errors) => {
      const newErrors = { ...errors };
      delete newErrors[fieldId];
      return newErrors;
    });

    // Update form data
    this._formData.update((data) => {
      if (!data) return data;
      // Deep update based on section
      return this.updateFormDataField(data, sectionId, fieldId, value);
    });

    // Update section field value
    this._sections.update((sections) => {
      return sections.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          fields: section.fields.map((field) => {
            if (field.id !== fieldId) return field;
            return { ...field, value };
          }),
        };
      });
    });

    this.logger.debug('Field updated', { sectionId, fieldId, value });
  }

  /**
   * Upload photo to Firebase Storage
   * @param userId - User ID
   * @param type - Photo type ('profile' | 'banner')
   * @param file - Image file to upload
   */
  async uploadPhoto(
    userId: string,
    type: 'profile' | 'banner',
    file: File | Blob
  ): Promise<{ url: string; xpAwarded?: number }> {
    if (!this.api) {
      throw new Error('API service not configured');
    }

    const response = await this.api.uploadPhoto(userId, type, file);

    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Failed to upload photo');
    }

    return response.data;
  }

  /**
   * Update the profile image gallery used by the profile carousel.
   */
  updatePhotoGallery(images: readonly string[]): void {
    this._dirtyFields.update((fields) => {
      const newFields = new Set(fields);
      newFields.add('photos.profileImgs');
      newFields.add('photos.profileImg');
      return newFields;
    });

    this._formData.update((data) => {
      if (!data) return data;

      return {
        ...data,
        photos: {
          ...data.photos,
          profileImgs: [...images],
        },
      };
    });

    this._sections.update((sections) => {
      return sections.map((section) => {
        if (section.id !== 'photos') return section;

        return {
          ...section,
          fields: section.fields.map((field) => {
            if (field.id !== 'profileImg') return field;
            return { ...field, value: images[0] ?? '' };
          }),
        };
      });
    });

    this.logger.debug('Photo gallery updated', { count: images.length });
  }

  /**
   * Remove a photo from the gallery by URL and immediately persist — no Save button needed.
   * Uses optimistic update with rollback on failure.
   */
  async removePhoto(photoUrl: string, currentImages: readonly string[]): Promise<void> {
    if (!this.currentUserId) {
      this.logger.warn('Cannot remove photo: no user ID');
      return;
    }

    const nextImages = currentImages.filter((url) => url !== photoUrl);

    // Optimistic update
    this.updatePhotoGallery(nextImages);
    this.breadcrumb.trackStateChange('edit-profile: photo-removing', {
      total: nextImages.length,
    });
    this.logger.info('Removing photo from gallery', {
      total: nextImages.length,
    });

    if (!this.api) {
      // No API wired — change will be persisted via saveChanges
      this.logger.debug('No API configured — photo removal queued for batch save');
      return;
    }

    this._isSaving.set(true);
    try {
      const response = await this.api.updateSection(
        this.currentUserId,
        'photos',
        { profileImgs: nextImages },
        this.currentSportIndex
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to remove photo');
      }

      // Keep dirty flags so the button still shows "Save" (consistent with add).
      // saveChanges() will clear them when the user taps Save.

      this.logger.info('Photo removed and saved', { remaining: nextImages.length });
      this.analytics?.trackEvent(APP_EVENTS.PROFILE_PHOTO_REMOVED, {
        remaining: nextImages.length,
      });
      this.breadcrumb.trackStateChange('edit-profile: photo-removed', {
        total: nextImages.length,
      });
      await this.haptics.impact('medium');
    } catch (err) {
      // Rollback local state
      this.updatePhotoGallery(currentImages);
      this.logger.error('Failed to remove photo', err);
      this.toast.error('Failed to remove photo. Please try again.');
      throw err;
    } finally {
      this._isSaving.set(false);
    }
  }

  /**
   * Save all changes.
   */
  async saveChanges(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) {
      this.logger.debug('No changes to save');
      return true;
    }

    if (!this.currentUserId) {
      this.logger.error('Cannot save: no user ID');
      this.toast.error('Unable to save: user not identified');
      return false;
    }

    this._isSaving.set(true);
    this._error.set(null);

    try {
      const formData = this._formData();
      if (!formData) {
        throw new Error('No form data to save');
      }

      // Group dirty fields by section
      const dirtySections = this.getDirtySections();
      const oldTier = this.currentTier();

      // Use real API
      if (this.api) {
        let totalXpAwarded = 0;
        let newTier = oldTier;
        let newCompletionPercentage = this._completion()?.percentage ?? 0;

        // Update each dirty section via API
        for (const sectionId of dirtySections) {
          const sectionData = this.getSectionData(formData, sectionId);

          this.logger.debug('Updating section via API', { sectionId, data: sectionData });

          const response = await this.api.updateSection(
            this.currentUserId,
            sectionId,
            sectionData,
            this.currentSportIndex
          );

          if (!response.success) {
            throw new Error(response.error ?? `Failed to update ${sectionId}`);
          }

          // Accumulate XP and track tier changes
          if (response.data) {
            totalXpAwarded += response.data.xpAwarded ?? 0;
            if (response.data.newTier) {
              newTier = response.data.newTier;
            }
            if (response.data.newCompletionPercentage !== undefined) {
              newCompletionPercentage = response.data.newCompletionPercentage;
            }
          }
        }

        // Update completion data from API response without reloading formData
        // This prevents losing data from other sports
        const currentCompletion = this._completion();
        if (currentCompletion) {
          this._completion.set({
            ...currentCompletion,
            percentage: newCompletionPercentage,
            tier: newTier,
          });
        }

        // Check for tier upgrade celebration
        if (newTier !== oldTier) {
          this._lastUnlockedTier.set(newTier);
          this._showCompletionCelebration.set(true);
          await this.haptics.notification('success');
        } else {
          await this.haptics.impact('medium');
        }

        this.logger.info('Profile saved via API', {
          sectionsUpdated: dirtySections.length,
          xpAwarded: totalXpAwarded,
          tierUpgrade: newTier !== oldTier ? newTier : null,
        });
      } else {
        throw new Error('Edit profile API is not configured');
      }

      // Clear dirty fields
      this._dirtyFields.set(new Set());

      this.toast.success('Profile saved successfully!');

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save profile';
      this._error.set(message);
      this.toast.error(message);
      this.logger.error('Failed to save profile', err);
      return false;
    } finally {
      this._isSaving.set(false);
    }
  }

  /**
   * Discard unsaved changes.
   */
  async discardChanges(): Promise<void> {
    this._dirtyFields.set(new Set());
    this._validationErrors.set({});
    await this.loadProfile(this.currentUserId, this.currentSportIndex);
    this.haptics.impact('light');
  }

  /**
   * Dismiss completion celebration.
   */
  dismissCelebration(): void {
    this._showCompletionCelebration.set(false);
    this._lastUnlockedTier.set(null);
  }

  /**
   * Set validation error for a field.
   */
  setValidationError(fieldId: string, error: string): void {
    this._validationErrors.update((errors) => ({
      ...errors,
      [fieldId]: error,
    }));
  }

  /**
   * Clear all validation errors.
   */
  clearValidationErrors(): void {
    this._validationErrors.set({});
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  private updateFormDataField(
    data: EditProfileFormData,
    sectionId: EditProfileSectionId,
    fieldId: string,
    value: unknown
  ): EditProfileFormData {
    const sectionMap: Record<EditProfileSectionId, keyof EditProfileFormData> = {
      'basic-info': 'basicInfo',
      photos: 'photos',
      'sports-info': 'sportsInfo',
      academics: 'academics',
      physical: 'physical',
      'social-links': 'socialLinks',
      contact: 'contact',
      preferences: 'contact', // Map to contact for now
    };

    const sectionKey = sectionMap[sectionId];
    if (!sectionKey) return data;

    return {
      ...data,
      [sectionKey]: {
        ...data[sectionKey],
        [fieldId]: value,
      },
    };
  }

  /**
   * Get list of sections that have dirty fields.
   */
  private getDirtySections(): EditProfileSectionId[] {
    const dirtyFields = this._dirtyFields();
    const sections = new Set<EditProfileSectionId>();

    for (const fieldPath of dirtyFields) {
      const sectionId = fieldPath.split('.')[0] as EditProfileSectionId;
      sections.add(sectionId);
    }

    return Array.from(sections);
  }

  /**
   * Extract section data from form data.
   * Only include fields that have been modified (dirty fields).
   */
  private getSectionData(
    formData: EditProfileFormData,
    sectionId: EditProfileSectionId
  ): Record<string, unknown> {
    const dirtyFields = this._dirtyFields();
    const sectionPrefix = `${sectionId}.`;

    // Get all dirty field IDs for this section
    const dirtyFieldIds = Array.from(dirtyFields)
      .filter((field) => field.startsWith(sectionPrefix))
      .map((field) => field.substring(sectionPrefix.length));

    this.logger.debug('Extracting section data for API', {
      sectionId,
      allDirtyFields: Array.from(dirtyFields),
      sectionDirtyFields: dirtyFieldIds,
    });

    // If no dirty fields, return empty (shouldn't happen but defensive)
    if (dirtyFieldIds.length === 0) {
      return {};
    }

    // Extract only dirty fields from the section
    const sectionData: Record<string, unknown> = {};

    switch (sectionId) {
      case 'basic-info':
        dirtyFieldIds.forEach((fieldId) => {
          if (fieldId in formData.basicInfo) {
            sectionData[fieldId] = formData.basicInfo[fieldId as keyof typeof formData.basicInfo];
          }
        });
        break;
      case 'photos':
        dirtyFieldIds.forEach((fieldId) => {
          if (fieldId in formData.photos) {
            sectionData[fieldId] = formData.photos[fieldId as keyof typeof formData.photos];
          }
        });
        break;
      case 'sports-info':
        dirtyFieldIds.forEach((fieldId) => {
          if (fieldId in formData.sportsInfo) {
            sectionData[fieldId] = formData.sportsInfo[fieldId as keyof typeof formData.sportsInfo];
          }
        });
        break;
      case 'academics':
        dirtyFieldIds.forEach((fieldId) => {
          if (fieldId in formData.academics) {
            sectionData[fieldId] = formData.academics[fieldId as keyof typeof formData.academics];
          }
        });
        break;
      case 'physical':
        dirtyFieldIds.forEach((fieldId) => {
          if (fieldId in formData.physical) {
            sectionData[fieldId] = formData.physical[fieldId as keyof typeof formData.physical];
          }
        });
        break;
      case 'social-links':
        dirtyFieldIds.forEach((fieldId) => {
          if (fieldId in formData.socialLinks) {
            sectionData[fieldId] =
              formData.socialLinks[fieldId as keyof typeof formData.socialLinks];
          }
        });
        break;
      case 'contact':
        dirtyFieldIds.forEach((fieldId) => {
          if (fieldId in formData.contact) {
            sectionData[fieldId] = formData.contact[fieldId as keyof typeof formData.contact];
          }
        });
        break;
    }

    this.logger.debug('Section data extracted', { sectionId, data: sectionData });

    return sectionData;
  }
}
