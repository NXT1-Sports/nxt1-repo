/**
 * @fileoverview OnboardingProfileStepComponent - Cross-Platform Profile Form
 * @module @nxt1/ui/onboarding
 * @version 3.0.0
 *
 * Progressive disclosure profile step for onboarding.
 * Collects ONLY essential info first: photo (optional), first name, last name.
 *
 * ⭐ 2026 UX BEST PRACTICES:
 * - Athlete class year collected alongside name for recruiting accuracy
 * - Gender selection: Inclusive options with professional UI
 * - Location: Auto-detect via geolocation with manual fallback
 * - Minimal cognitive load on first interaction
 *
 * Features:
 * - Platform-adaptive with Ionic components
 * - Profile photo upload with preview (max 5MB, JPG/PNG/WebP/GIF)
 * - Professional gender selection (Male/Female/Non-binary/Prefer not to say)
 * - Geolocation-based location auto-detect
 * - Real-time validation using @nxt1/core helpers
 * - Accessible with ARIA labels
 * - Haptic feedback ready
 * - Test IDs for E2E testing
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-profile-step
 *   [profileData]="profileFormData()"
 *   [disabled]="isLoading()"
 *   [showGender]="true"
 *   [showLocation]="true"
 *   (profileChange)="onProfileChange($event)"
 *   (photoSelect)="onPhotoSelect()"
 *   (filesSelected)="onFilesSelected($event)"
 *   (locationRequest)="onLocationRequest()"
 * />
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
  signal,
  computed,
  effect,
  ViewChild,
  ElementRef,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonInput, IonSelect, IonSelectOption, IonSpinner } from '@ionic/angular/standalone';
import { isValidName } from '@nxt1/core/helpers';
import { USER_ROLES } from '@nxt1/core';
import type {
  ProfileFormData,
  GenderOption,
  ProfileLocationData,
  OnboardingUserType,
} from '@nxt1/core/api';
import { GENDER_OPTIONS } from '@nxt1/core/api';
import type { ILogger } from '@nxt1/core/logging';
import { HapticButtonDirective } from '../../services/haptics';
import { NxtLoggingService } from '../../services/logging';
import { NxtToastService } from '../../services/toast';
import { NxtChipComponent } from '../../components/chip';
import { NxtFormFieldComponent } from '../../components/form-field';
import { NxtListRowComponent } from '../../components/list-row';
import { NxtListSectionComponent } from '../../components/list-section';
import { NxtModalService } from '../../services/modal';
import { NxtMediaGalleryComponent } from '../../components/media-gallery';

// ============================================
// CONSTANTS
// ============================================

/** Accepted image MIME types */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Maximum file size in bytes (5MB) */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** Coach title selection options */
const COACH_TITLE_OPTIONS = [
  { value: 'head-coach' as const, label: 'Head Coach' },
  { value: 'assistant-coach' as const, label: 'Assistant Coach' },
] as const;

/** Athlete class year options shown during onboarding */
const CLASS_YEAR_OPTIONS = Array.from({ length: 10 }, (_, index) => {
  const year = new Date().getFullYear() - 1 + index;
  return {
    value: year,
    label: `Class of ${year}`,
  } as const;
});

export type CoachTitleOption = (typeof COACH_TITLE_OPTIONS)[number]['value'];

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-onboarding-profile-step',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    HapticButtonDirective,
    NxtChipComponent,
    NxtFormFieldComponent,
    NxtListRowComponent,
    NxtListSectionComponent,
    NxtMediaGalleryComponent,
  ],
  template: `
    @if (variant() === 'list-row') {
      <div class="nxt1-profile-form" data-testid="onboarding-profile-step">
        <!-- Profile Photos Gallery (list-row variant) -->
        @if (showPhotos()) {
          <div class="nxt1-photo-gallery-section">
            <p class="nxt1-gallery-label">Profile Photos</p>
            <nxt1-media-gallery
              [images]="profileImgs()"
              [maxImages]="8"
              [addLabel]="'Add Photo'"
              (add)="openImagePicker()"
              (remove)="removeImage($event)"
            />
          </div>
        }

        <nxt1-list-section>
          <nxt1-list-row label="First Name" (tap)="openFirstNamePrompt()">
            <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!firstName()">
              {{ firstName() || 'Enter first name' }}
            </span>
          </nxt1-list-row>
          <nxt1-list-row label="Last Name" (tap)="openLastNamePrompt()">
            <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!lastName()">
              {{ lastName() || 'Enter last name' }}
            </span>
          </nxt1-list-row>
          @if (showAthleteClassYear()) {
            <nxt1-list-row label="Class" (tap)="openClassYearPicker()">
              <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!classYear()">
                {{ classYearDisplayLabel() || 'Select class' }}
              </span>
            </nxt1-list-row>
          }
          @if (showCoachTitle()) {
            <nxt1-list-row label="Title" (tap)="openCoachTitlePicker()">
              <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!coachTitle()">
                {{ coachTitleDisplayLabel() || 'Select title' }}
              </span>
            </nxt1-list-row>
          }
          @if (showGender()) {
            <nxt1-list-row label="Gender" (tap)="openGenderPicker()">
              <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!gender()">
                {{ genderDisplayLabel() || 'Select gender' }}
              </span>
            </nxt1-list-row>
          }
          @if (showLocation()) {
            <nxt1-list-row label="Location" (tap)="onDetectLocation()">
              <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!hasLocation()">
                @if (isLoadingLocation()) {
                  Detecting...
                } @else {
                  {{ locationDisplay() || 'Detect location' }}
                }
              </span>
            </nxt1-list-row>
          }
        </nxt1-list-section>
      </div>
    } @else {
      <div class="nxt1-profile-form" data-testid="onboarding-profile-step">
        <!-- Name Fields -->
        <div class="nxt1-name-fields">
          <!-- First Name -->
          <nxt1-form-field
            label="First Name"
            inputId="firstName"
            [error]="
              firstNameTouched() && firstName() && !isFirstNameValid() ? '2-50 letters only' : null
            "
            testId="onboarding-firstname-field"
          >
            <ion-input
              id="firstName"
              type="text"
              class="nxt1-input"
              [class.nxt1-input-error]="firstNameTouched() && firstName() && !isFirstNameValid()"
              fill="outline"
              placeholder="Enter first name"
              [value]="firstName()"
              (ionInput)="onFirstNameInput($event)"
              (ionBlur)="firstNameTouched.set(true)"
              [disabled]="disabled()"
              autocomplete="given-name"
              autocapitalize="words"
              data-testid="onboarding-input-first-name"
            />
          </nxt1-form-field>

          <!-- Last Name -->
          <nxt1-form-field
            label="Last Name"
            inputId="lastName"
            [error]="
              lastNameTouched() && lastName() && !isLastNameValid() ? '2-50 letters only' : null
            "
            testId="onboarding-lastname-field"
          >
            <ion-input
              id="lastName"
              type="text"
              class="nxt1-input"
              [class.nxt1-input-error]="lastNameTouched() && lastName() && !isLastNameValid()"
              fill="outline"
              placeholder="Enter last name"
              [value]="lastName()"
              (ionInput)="onLastNameInput($event)"
              (ionBlur)="lastNameTouched.set(true)"
              [disabled]="disabled()"
              autocomplete="family-name"
              autocapitalize="words"
              data-testid="onboarding-input-last-name"
            />
          </nxt1-form-field>

          @if (showAthleteClassYear()) {
            <nxt1-form-field
              label="Class"
              testId="onboarding-classyear-field"
              [error]="classYearTouched() && !classYear() ? 'Select your class year' : null"
            >
              <ion-select
                class="nxt1-select"
                interface="popover"
                [interfaceOptions]="classYearPopoverOptions"
                placeholder="Select class"
                [value]="classYear()"
                (ionChange)="onClassYearChange($event)"
                (ionBlur)="classYearTouched.set(true)"
                [disabled]="disabled()"
                data-testid="onboarding-select-class-year"
              >
                @for (option of classYearOptions; track option.value) {
                  <ion-select-option [value]="option.value">
                    {{ option.label }}
                  </ion-select-option>
                }
              </ion-select>
            </nxt1-form-field>
          }
        </div>

        <!-- Profile Photos Gallery -->
        @if (showPhotos()) {
          <nxt1-form-field label="Profile Photos" testId="onboarding-photos-field">
            <nxt1-media-gallery
              [images]="profileImgs()"
              [maxImages]="8"
              [addLabel]="'Add Photo'"
              (add)="openImagePicker()"
              (remove)="removeImage($event)"
            />
          </nxt1-form-field>
        }

        <!-- Coach Title Selection (only shown for coach role) -->
        @if (showCoachTitle()) {
          <nxt1-form-field label="Title" testId="onboarding-coach-title-field">
            <div class="nxt1-gender-chips" role="radiogroup" aria-label="Select your title">
              @for (option of coachTitleOptions; track option.value) {
                <nxt1-chip
                  [selected]="coachTitle() === option.value"
                  [disabled]="disabled()"
                  [testId]="'onboarding-coach-title-' + option.value"
                  ariaRole="radio"
                  (chipClick)="onCoachTitleSelect(option.value)"
                >
                  {{ option.label }}
                </nxt1-chip>
              }
            </div>
          </nxt1-form-field>
        }

        <!-- Gender Selection (Progressive disclosure - optional) -->
        @if (showGender()) {
          <nxt1-form-field label="Gender" testId="onboarding-gender-field">
            <div class="nxt1-gender-chips" role="radiogroup" aria-label="Select gender">
              @for (option of genderOptions; track option.value) {
                <nxt1-chip
                  [selected]="gender() === option.value"
                  [disabled]="disabled()"
                  [testId]="'onboarding-gender-' + option.value"
                  ariaRole="radio"
                  (chipClick)="onGenderSelect(option.value)"
                >
                  {{ option.label }}
                </nxt1-chip>
              }
            </div>
          </nxt1-form-field>
        }

        <!-- Location Selection (with auto-detect) -->
        @if (showLocation()) {
          <nxt1-form-field label="Location" testId="onboarding-location-field">
            <div class="nxt1-location-section">
              <!-- Auto-detect button -->
              <button
                type="button"
                class="nxt1-location-detect"
                [class.has-location]="hasLocation()"
                [disabled]="disabled() || isLoadingLocation()"
                (click)="onDetectLocation()"
                data-testid="onboarding-location-detect"
                nxtHaptic="selection"
              >
                @if (isLoadingLocation()) {
                  <ion-spinner name="crescent" class="nxt1-location-spinner"></ion-spinner>
                  <span>Detecting location...</span>
                } @else if (hasLocation()) {
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    class="nxt1-location-icon check"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                    />
                  </svg>
                  <span class="nxt1-location-text">{{ locationDisplay() }}</span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    class="nxt1-location-edit"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                    />
                  </svg>
                } @else {
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    class="nxt1-location-icon"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"
                    />
                  </svg>
                  <span>Detect My Location</span>
                }
              </button>

              <!-- Location error -->
              @if (locationError()) {
                <p class="nxt1-location-error">{{ locationError() }}</p>
              }
            </div>
          </nxt1-form-field>
        }
      </div>
    }

    <!-- Hidden file input for web photo upload (supports multiple) -->
    <input
      #fileInput
      type="file"
      class="hidden"
      accept="image/jpeg,image/png,image/webp,image/gif"
      multiple
      (change)="onFileSelected($event)"
    />
  `,
  styles: [
    `
      /* ============================================
       PROFILE FORM CONTAINER
       ============================================ */
      .nxt1-profile-form {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-6, 24px);
        width: 100%;
      }

      /* ============================================
       PHOTO UPLOAD SECTION
       ============================================ */
      .nxt1-photo-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .nxt1-photo-upload {
        position: relative;
        width: var(--nxt1-spacing-32, 128px);
        height: var(--nxt1-spacing-32, 128px);
        border-radius: 50%;
        border: 2px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        background: transparent;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-photo-upload:hover:not(:disabled) {
        border-color: var(--nxt1-color-primary, #ccff00);
        background: var(--nxt1-color-alpha-primary5, rgba(204, 255, 0, 0.05));
        transform: scale(1.02);
      }

      .nxt1-photo-upload:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .nxt1-photo-upload:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
      }

      .nxt1-photo-upload.has-image {
        border-style: solid;
        border-color: var(--nxt1-color-primary, #ccff00);
      }

      .nxt1-photo-placeholder {
        width: var(--nxt1-spacing-12, 48px);
        height: var(--nxt1-spacing-12, 48px);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .nxt1-photo-icon {
        width: var(--nxt1-spacing-10, 40px);
        height: var(--nxt1-spacing-10, 40px);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .nxt1-photo-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .nxt1-photo-preview {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 50%;
      }

      .nxt1-photo-edit-badge {
        position: absolute;
        bottom: 0;
        right: 0;
        width: var(--nxt1-spacing-7, 28px);
        height: var(--nxt1-spacing-7, 28px);
        border-radius: 50%;
        background: var(--nxt1-color-primary, #ccff00);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-onPrimary, #1a1a2e);
        border: 2px solid var(--nxt1-color-bg-primary, #1a1a2e);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }

      .hidden {
        display: none;
      }

      /* ============================================
       NAME FIELDS
       ============================================ */
      .nxt1-name-fields {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-4, 16px);
        width: 100%;
      }

      @media (max-width: 480px) {
        .nxt1-name-fields {
          grid-template-columns: 1fr;
        }
      }

      /* ============================================
       INPUT STYLING - White base with gray hover
       ============================================ */
      .nxt1-input {
        --background: var(--nxt1-color-surface-100);
        --border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        --border-radius: var(--nxt1-borderRadius-lg, 12px);
        --border-width: 1px;
        --color: var(--nxt1-color-text-primary, #ffffff);
        --placeholder-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --placeholder-opacity: 1;
        --padding-start: 16px;
        --padding-end: 16px;
        --padding-top: 14px;
        --padding-bottom: 14px;
        --highlight-color-focused: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
        --highlight-color-valid: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base, 1rem);
        min-height: 52px;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
      }

      .nxt1-input:hover:not(.nxt1-input-error) {
        --background: var(--nxt1-color-surface-200);
        --border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
      }

      .nxt1-select {
        --background: var(--nxt1-color-surface-100);
        --border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        --border-radius: var(--nxt1-borderRadius-lg, 12px);
        --border-width: 1px;
        --color: var(--nxt1-color-text-primary, #ffffff);
        --placeholder-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --padding-start: 16px;
        --padding-end: 16px;
        min-height: 52px;
        width: 100%;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base, 1rem);
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        background: var(--nxt1-color-surface-100);
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
      }

      .nxt1-select:hover {
        --background: var(--nxt1-color-surface-200);
        --border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
        border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
        background: var(--nxt1-color-surface-200);
      }

      .nxt1-select::part(text),
      .nxt1-select::part(placeholder),
      .nxt1-select::part(icon) {
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .nxt1-input-error {
        --border-color: var(--nxt1-color-error, #ef4444);
        --highlight-color-focused: var(--nxt1-color-error, #ef4444);
      }

      /* ============================================
       GENDER CHIPS
       ============================================ */
      .nxt1-gender-chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
      }

      /* ============================================
       LOCATION SECTION - White base with gray hover
       ============================================ */
      .nxt1-location-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .nxt1-location-detect {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-3, 12px);
        width: 100%;
        padding: var(--nxt1-spacing-4, 16px);
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 500;
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-location-detect:hover:not(:disabled):not(.has-location) {
        border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary, #ffffff);
        transform: translateY(-1px);
      }

      .nxt1-location-detect:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .nxt1-location-detect:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
      }

      .nxt1-location-detect.has-location {
        border-style: solid;
        border-color: var(--nxt1-color-primary, #ccff00);
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
        justify-content: flex-start;
      }

      .nxt1-location-detect.has-location:hover:not(:disabled) {
        border-color: var(--nxt1-color-primary, #ccff00);
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
        transform: none;
      }

      .nxt1-location-icon {
        width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
        flex-shrink: 0;
      }

      .nxt1-location-icon.check {
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
      }

      .nxt1-location-text {
        flex: 1;
        text-align: left;
      }

      .nxt1-location-edit {
        width: var(--nxt1-spacing-4);
        height: var(--nxt1-spacing-4);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
        opacity: 0.7;
      }

      .nxt1-location-spinner {
        width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
        --color: var(--nxt1-color-primary);
      }

      .nxt1-location-hint {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
        margin: 0;
      }

      .nxt1-location-error {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-error);
        margin: 0;
      }

      /* List-row variant styles */
      .nxt1-list-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
      }

      .nxt1-list-placeholder {
        color: var(--nxt1-color-text-tertiary);
      }

      /* Photo gallery section in list-row variant */
      .nxt1-photo-gallery-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .nxt1-gallery-label {
        margin: 0;
        padding: 0 var(--nxt1-spacing-2, 8px);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingProfileStepComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly loggingService = inject(NxtLoggingService);
  private readonly toast = inject(NxtToastService);
  private readonly modal = inject(NxtModalService);

  /** Namespaced logger for this component */
  private readonly logger: ILogger = this.loggingService.child('OnboardingProfileStep');

  /** Reference to the hidden file input element */
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  // ============================================
  // SIGNAL INPUTS (Angular 19+ pattern)
  // ============================================

  /** Current profile data from parent */
  readonly profileData = input<ProfileFormData | null>(null);

  /** Display variant: 'form' for desktop, 'list-row' for mobile */
  readonly variant = input<'form' | 'list-row'>('form');

  /** Whether interaction is disabled */
  readonly disabled = input<boolean>(false);

  /** Whether coach title should be collected in this step */
  readonly showCoachTitleField = input<boolean>(true);

  /**
   * Whether to show gender selection
   * @default true - Progressive disclosure but included for most users
   */
  readonly showGender = input<boolean>(true);

  /**
   * Whether to show location selection
   * @default true - Helps connect users with local teams
   */
  readonly showLocation = input<boolean>(true);

  /**
   * @deprecated Use showGender/showLocation instead. ClassYear moved to sport step.
   */
  readonly showClassYear = input<boolean>(false);

  /** User role — shows role-specific fields (e.g. coach title for 'coach') */
  readonly userType = input<OnboardingUserType | null>(null);

  // ============================================
  // SIGNAL OUTPUTS (Angular 19+ pattern)
  // ============================================

  /** Emits when profile data changes */
  readonly profileChange = output<ProfileFormData>();

  /** Emits when photo picker should be shown (for native photo picker integration) */
  readonly photoSelect = output<void>();

  /** Emits when files are selected from the web file picker - now supports multiple */
  readonly filesSelected = output<File[]>();

  /** Emits when location detection is requested */
  readonly locationRequest = output<void>();

  // ============================================
  // CONFIGURATION (readonly for immutability)
  // ============================================

  /** Accepted file types for input */
  readonly acceptedTypes = ACCEPTED_IMAGE_TYPES.join(',');

  /** Gender options from core */
  readonly genderOptions = GENDER_OPTIONS;

  /** Coach title options */
  readonly coachTitleOptions = COACH_TITLE_OPTIONS;

  /** Athlete class year options */
  readonly classYearOptions = CLASS_YEAR_OPTIONS;

  /** Class year popover configuration */
  readonly classYearPopoverOptions = {
    cssClass: 'nxt1-select-popover',
  } as const;

  // ============================================
  // INTERNAL STATE (signals for reactivity)
  // ============================================

  /** First name value */
  readonly firstName = signal('');

  /** Last name value */
  readonly lastName = signal('');

  /** Profile images array (URLs or data URIs) */
  readonly profileImgs = signal<string[]>([]);

  /** Selected gender */
  readonly gender = signal<GenderOption | null>(null);

  /** Selected coach title */
  readonly coachTitle = signal<CoachTitleOption | null>(null);

  /** Selected athlete class year */
  readonly classYear = signal<number | null>(null);

  /** Location data */
  readonly location = signal<ProfileLocationData | null>(null);

  /** Whether location is being detected */
  readonly isLoadingLocation = signal(false);

  /** Location error message */
  readonly locationError = signal<string | null>(null);

  /** First name field touched */
  readonly firstNameTouched = signal(false);

  /** Last name field touched */
  readonly lastNameTouched = signal(false);

  /** Class year field touched */
  readonly classYearTouched = signal(false);

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Whether profile has images */
  readonly hasProfileImage = computed(() => this.profileImgs().length > 0);

  /** Whether location is set */
  readonly hasLocation = computed(() => {
    const loc = this.location();
    return !!(loc?.city || loc?.state);
  });

  /** Location display string */
  readonly locationDisplay = computed(() => {
    const loc = this.location();
    if (!loc) return '';

    const parts: string[] = [];
    if (loc.city) parts.push(loc.city);
    if (loc.state) parts.push(loc.state);

    return parts.join(', ') || loc.formatted || '';
  });

  /** Gender display label for list-row variant */
  readonly genderDisplayLabel = computed(() => {
    const g = this.gender();
    if (!g) return '';
    const option = GENDER_OPTIONS.find((o) => o.value === g);
    return option?.label ?? '';
  });

  /** Check if first name is valid using shared helper */
  readonly isFirstNameValid = computed(() => isValidName(this.firstName()));

  /** Check if last name is valid using shared helper */
  readonly isLastNameValid = computed(() => isValidName(this.lastName()));

  /** Whether to show coach title selection */
  readonly showCoachTitle = computed(
    () => this.showCoachTitleField() && this.userType() === USER_ROLES.COACH
  );

  /** Whether to show class year selection for athletes */
  readonly showAthleteClassYear = computed(
    () => this.showClassYear() && this.userType() === USER_ROLES.ATHLETE
  );

  /** Whether to show profile photo gallery (hidden for coaches, directors, and recruiters) */
  readonly showPhotos = computed(
    () =>
      this.userType() !== USER_ROLES.COACH &&
      this.userType() !== USER_ROLES.DIRECTOR &&
      this.userType() !== USER_ROLES.RECRUITER
  );

  /** Display label for coach title in list-row variant */
  readonly coachTitleDisplayLabel = computed(() => {
    const t = this.coachTitle();
    if (!t) return '';
    return COACH_TITLE_OPTIONS.find((o) => o.value === t)?.label ?? '';
  });

  /** Display label for class year in both variants */
  readonly classYearDisplayLabel = computed(() => {
    const year = this.classYear();
    if (!year) return '';
    return CLASS_YEAR_OPTIONS.find((option) => option.value === year)?.label ?? `Class of ${year}`;
  });

  /** Whether running in browser (SSR safety) */
  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  // ============================================
  // CONSTRUCTOR - Effect for syncing input
  // ============================================

  constructor() {
    // Sync internal state when profileData input changes
    effect(() => {
      const data = this.profileData();
      if (data) {
        this.firstName.set(data.firstName || '');
        this.lastName.set(data.lastName || '');
        this.profileImgs.set(data.profileImgs || []);
        this.gender.set(data.gender ?? null);
        this.location.set(data.location ?? null);
        this.coachTitle.set((data.coachTitle as CoachTitleOption) ?? null);
        this.classYear.set(data.classYear ?? null);
      }
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle first name input
   */
  onFirstNameInput(event: CustomEvent): void {
    const input = event.target as HTMLInputElement;
    this.firstName.set(input.value || '');
    this.emitProfileChange();
  }

  /**
   * Handle last name input
   */
  onLastNameInput(event: CustomEvent): void {
    const input = event.target as HTMLInputElement;
    this.lastName.set(input.value || '');
    this.emitProfileChange();
  }

  /**
   * Handle gender selection
   */
  onGenderSelect(value: GenderOption): void {
    this.gender.set(value);
    this.logger.debug('Gender selected', { gender: value });
    this.emitProfileChange();
  }

  /**
   * Handle coach title selection
   */
  onCoachTitleSelect(value: CoachTitleOption): void {
    this.coachTitle.set(value);
    this.logger.debug('Coach title selected', { coachTitle: value });
    this.emitProfileChange();
  }

  /**
   * Handle athlete class year selection
   */
  onClassYearChange(event: CustomEvent): void {
    const year = Number(event.detail.value);
    this.classYear.set(Number.isFinite(year) ? year : null);
    this.classYearTouched.set(true);
    this.logger.debug('Class year selected', { classYear: this.classYear() });
    this.emitProfileChange();
  }

  /**
   * Handle location detection request
   */
  onDetectLocation(): void {
    this.isLoadingLocation.set(true);
    this.locationError.set(null);
    this.logger.debug('Location detection requested');

    // Emit event for parent to handle geolocation
    this.locationRequest.emit();
  }

  /**
   * Set location from external source (e.g., geolocation service)
   */
  setLocation(location: ProfileLocationData): void {
    this.location.set(location);
    this.isLoadingLocation.set(false);
    this.locationError.set(null);
    this.logger.debug('Location set', { location });
    this.emitProfileChange();
  }

  /**
   * Set location error
   */
  setLocationError(error: string): void {
    this.isLoadingLocation.set(false);
    this.locationError.set(error);
    this.logger.warn('Location detection failed', { error });
  }

  /**
   * Handle photo upload button click
   */
  onPhotoClick(): void {
    // Emit event for native photo picker (mobile)
    this.photoSelect.emit();

    // Trigger file input for web (SSR-safe)
    if (this.isBrowser && this.fileInputRef?.nativeElement) {
      this.fileInputRef.nativeElement.click();
    }
  }

  /**
   * Open image picker (for media gallery "Add" button)
   */
  openImagePicker(): void {
    // Emit event for native photo picker (mobile)
    this.photoSelect.emit();

    // Trigger file input for web (SSR-safe)
    if (this.isBrowser && this.fileInputRef?.nativeElement) {
      this.fileInputRef.nativeElement.click();
    }
  }

  /**
   * Remove image at specified index from gallery
   */
  removeImage(index: number): void {
    const currentImages = this.profileImgs();
    const urlToRemove = currentImages[index];
    if (urlToRemove && urlToRemove.startsWith('blob:')) {
      URL.revokeObjectURL(urlToRemove);
    }
    const nextImages = currentImages.filter((_, i) => i !== index);
    this.profileImgs.set(nextImages);
    this.emitProfileChange();

    this.logger.debug('Image removed from gallery', {
      removedIndex: index,
      remainingCount: nextImages.length,
    });
  }

  /**
   * Handle file selection from web file picker - now supports multiple files
   */
  onFileSelected(event: Event): void {
    if (!this.isBrowser) return;

    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    if (files.length === 0) return;

    const validFiles: File[] = [];

    // Validate each file
    for (const file of files) {
      // Validate file type
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        this.logger.warn('Invalid file type rejected', {
          fileType: file.type,
          fileName: file.name,
          acceptedTypes: ACCEPTED_IMAGE_TYPES,
        });
        this.toast.warning(
          `${file.name}: Please select a valid image file (JPG, PNG, WebP, or GIF)`
        );
        continue;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        this.logger.warn('File too large rejected', {
          fileSize: file.size,
          maxSize: MAX_FILE_SIZE,
          fileName: file.name,
        });
        this.toast.warning(`${file.name}: Image must be smaller than 5MB`);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    // Log successful file selection
    this.logger.debug('Profile photos selected', {
      count: validFiles.length,
      fileNames: validFiles.map((f) => f.name),
    });

    // Emit files for parent to handle upload
    this.filesSelected.emit(validFiles);

    // Create instant preview URLs for all selected images
    const previewUrls: string[] = [];
    for (const file of validFiles) {
      const previewUrl = URL.createObjectURL(file);
      previewUrls.push(previewUrl);
    }

    // Add preview URLs to existing images
    const currentImages = this.profileImgs();
    this.profileImgs.set([...currentImages, ...previewUrls]);
    this.emitProfileChange();

    this.logger.debug('Profile photo previews created', {
      count: previewUrls.length,
      totalImages: this.profileImgs().length,
    });

    // Reset input to allow selecting same file again
    input.value = '';
  }

  /**
   * Set profile image from external source (e.g., native photo picker)
   * Adds the image to the existing gallery
   */
  setProfileImage(imageUrl: string): void {
    const currentImages = this.profileImgs();
    this.profileImgs.set([...currentImages, imageUrl]);
    this.emitProfileChange();
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Emit profile change event with current data
   */
  private emitProfileChange(): void {
    const images = this.profileImgs();
    this.profileChange.emit({
      firstName: this.firstName(),
      lastName: this.lastName(),
      profileImgs: images.length > 0 ? images : null,
      gender: this.gender(),
      location: this.location(),
      coachTitle: this.showCoachTitle() ? this.coachTitle() : null,
      classYear: this.showAthleteClassYear() ? this.classYear() : null,
    });
  }

  // ============================================
  // LIST-ROW VARIANT METHODS
  // ============================================

  /**
   * Open prompt dialog for first name input
   */
  async openFirstNamePrompt(): Promise<void> {
    const result = await this.modal.prompt({
      title: 'First Name',
      placeholder: 'Enter your first name',
      defaultValue: this.firstName(),
      submitText: 'Done',
      cancelText: 'Cancel',
      inputType: 'text',
      required: true,
      preferNative: 'native',
    });

    if (result.confirmed && result.value.trim()) {
      this.firstName.set(result.value.trim());
      this.firstNameTouched.set(true);
      this.emitProfileChange();
    }
  }

  /**
   * Open prompt dialog for last name input
   */
  async openLastNamePrompt(): Promise<void> {
    const result = await this.modal.prompt({
      title: 'Last Name',
      placeholder: 'Enter your last name',
      defaultValue: this.lastName(),
      submitText: 'Done',
      cancelText: 'Cancel',
      inputType: 'text',
      required: true,
      preferNative: 'native',
    });

    if (result.confirmed && result.value.trim()) {
      this.lastName.set(result.value.trim());
      this.lastNameTouched.set(true);
      this.emitProfileChange();
    }
  }

  /**
   * Open action sheet for athlete class year selection
   */
  async openClassYearPicker(): Promise<void> {
    const result = await this.modal.actionSheet({
      title: 'Select Class',
      actions: CLASS_YEAR_OPTIONS.map((option) => ({
        text: option.label,
        data: option.value,
      })),
      preferNative: 'native',
    });

    if (result?.selected && typeof result.data === 'number') {
      this.classYear.set(result.data);
      this.classYearTouched.set(true);
      this.logger.debug('Class year selected via picker', { classYear: result.data });
      this.emitProfileChange();
    }
  }

  /**
   * Open action sheet for gender selection
   */
  async openGenderPicker(): Promise<void> {
    const result = await this.modal.actionSheet({
      title: 'Select Gender',
      actions: GENDER_OPTIONS.map((option) => ({
        text: option.label,
        data: option.value,
      })),
      preferNative: 'native',
    });

    if (result?.selected && result.data) {
      this.gender.set(result.data as GenderOption);
      this.logger.debug('Gender selected via picker', { gender: result.data });
      this.emitProfileChange();
    }
  }

  /**
   * Open action sheet for coach title selection (list-row variant)
   */
  async openCoachTitlePicker(): Promise<void> {
    const result = await this.modal.actionSheet({
      title: 'Select Title',
      actions: COACH_TITLE_OPTIONS.map((option) => ({
        text: option.label,
        data: option.value,
      })),
      preferNative: 'native',
    });

    if (result?.selected && result.data) {
      this.coachTitle.set(result.data as CoachTitleOption);
      this.logger.debug('Coach title selected via picker', { coachTitle: result.data });
      this.emitProfileChange();
    }
  }
}
