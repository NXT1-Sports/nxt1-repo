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
import { PROFILE_COMPLETION_TIERS, getCompletionTier, getNextTier } from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';

// ⚠️ TEMPORARY: Mock data for development (remove when backend is ready)
import {
  MOCK_EDIT_PROFILE_FORM_DATA,
  MOCK_PROFILE_COMPLETION,
  MOCK_EDIT_PROFILE_SECTIONS,
} from './edit-profile.mock-data';

/**
 * Edit Profile state management service.
 * Provides reactive state for the profile editing interface.
 */
@Injectable({ providedIn: 'root' })
export class EditProfileService {
  // ⚠️ TEMPORARY: API service commented out - using mock data
  // private readonly api = inject(EditProfileApiService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('EditProfileService');

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
  // PUBLIC METHODS
  // ============================================

  /**
   * Load profile data for editing.
   * Uses mock data for now.
   */
  async loadProfile(userId?: string): Promise<void> {
    this.logger.info('Loading profile for editing', { userId });
    this._isLoading.set(true);
    this._error.set(null);

    try {
      // ⚠️ TEMPORARY: Using mock data
      await this.simulateDelay(500);

      this._formData.set(MOCK_EDIT_PROFILE_FORM_DATA);
      this._completion.set(MOCK_PROFILE_COMPLETION);
      this._sections.set(MOCK_EDIT_PROFILE_SECTIONS);

      this.logger.info('Profile loaded successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load profile';
      this._error.set(message);
      this.logger.error('Failed to load profile', { error: err });
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
   * Update the profile image gallery used by the profile carousel.
   */
  updatePhotoGallery(images: readonly string[]): void {
    this._dirtyFields.update((fields) => {
      const newFields = new Set(fields);
      newFields.add('photos.profileImages');
      newFields.add('photos.profileImg');
      return newFields;
    });

    this._formData.update((data) => {
      if (!data) return data;

      return {
        ...data,
        photos: {
          ...data.photos,
          profileImages: [...images],
          profileImg: images[0] ?? '',
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
   * Save all changes.
   */
  async saveChanges(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) {
      this.logger.debug('No changes to save');
      return true;
    }

    this._isSaving.set(true);
    this._error.set(null);

    try {
      // ⚠️ TEMPORARY: Simulating API call
      await this.simulateDelay(800);

      // Check for tier upgrade
      const oldTier = this.currentTier();
      const newCompletion = this.calculateCompletion();

      // Update completion
      this._completion.set(newCompletion);

      // Check for tier upgrade celebration
      if (newCompletion.tier !== oldTier) {
        this._lastUnlockedTier.set(newCompletion.tier);
        this._showCompletionCelebration.set(true);
        await this.haptics.notification('success');
      } else {
        await this.haptics.impact('medium');
      }

      // Clear dirty fields
      this._dirtyFields.set(new Set());

      this.toast.success('Profile saved successfully!');
      this.logger.info('Profile saved', { dirtyFields: this._dirtyFields().size });

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save profile';
      this._error.set(message);
      this.toast.error(message);
      this.logger.error('Failed to save profile', { error: err });
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
    await this.loadProfile();
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

  private calculateCompletion(): ProfileCompletionData {
    // Count completed fields
    const sections = this._sections();
    let fieldsCompleted = 0;
    let fieldsTotal = 0;
    let xpEarned = 0;
    let xpTotal = 0;

    const sectionData = sections.map((section) => {
      const completedFields = section.fields.filter(
        (f) => f.countsTowardCompletion !== false && f.value && f.value !== ''
      ).length;
      const totalFields = section.fields.filter((f) => f.countsTowardCompletion !== false).length;
      const sectionXp = section.fields
        .filter((f) => f.value && f.value !== '')
        .reduce((sum, f) => sum + (f.xpReward ?? 0), 0);

      fieldsCompleted += completedFields;
      fieldsTotal += totalFields;
      xpEarned += sectionXp;
      xpTotal += section.xpReward;

      return {
        sectionId: section.id,
        percentage: totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0,
        fieldsCompleted: completedFields,
        fieldsTotal: totalFields,
        xpEarned: sectionXp,
        isComplete: completedFields === totalFields,
      };
    });

    const percentage = fieldsTotal > 0 ? Math.round((fieldsCompleted / fieldsTotal) * 100) : 0;
    const tier = getCompletionTier(percentage);
    const nextTier = getNextTier(tier);

    return {
      percentage,
      tier,
      xpEarned,
      xpTotal,
      progressToNextTier: this.progressToNextTier(),
      nextTier: nextTier ?? undefined,
      fieldsCompleted,
      fieldsTotal,
      sections: sectionData,
      recentAchievements: this._completion()?.recentAchievements ?? [],
    };
  }

  private simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
