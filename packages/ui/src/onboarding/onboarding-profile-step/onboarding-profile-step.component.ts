/**
 * @fileoverview OnboardingProfileStepComponent - Cross-Platform Profile Form
 * @module @nxt1/ui/onboarding
 * @version 2.0.0
 *
 * Reusable profile step component for onboarding Step 2.
 * Collects user's photo (optional), first name, last name, and graduation year (athletes only).
 *
 * Features:
 * - Platform-adaptive with Ionic components
 * - Profile photo upload with preview (max 5MB, JPG/PNG/WebP/GIF)
 * - Graduation year selector for athletes (Class of 2026-2036)
 * - Real-time validation using @nxt1/core helpers
 * - Accessible with ARIA labels and role="radiogroup"
 * - Haptic feedback ready
 * - Test IDs for E2E testing
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-profile-step
 *   [profileData]="profileFormData()"
 *   [disabled]="isLoading()"
 *   [showClassYear]="isAthlete()"
 *   (profileChange)="onProfileChange($event)"
 *   (photoSelect)="onPhotoSelect()"
 *   (fileSelected)="onFileSelected($event)"
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
import { IonInput } from '@ionic/angular/standalone';
import { isValidName } from '@nxt1/core/helpers';
import type { ProfileFormData } from '@nxt1/core/api';
import type { ILogger } from '@nxt1/core/logging';
import { HapticButtonDirective } from '../../services/haptics';
import { NxtLoggingService } from '../../services/logging';
import { NxtToastService } from '../../services/toast';
import { NxtChipComponent } from '../../shared/chip';
import { NxtFormFieldComponent } from '../../shared/form-field';

// ============================================
// CONSTANTS
// ============================================

/** Accepted image MIME types */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Maximum file size in bytes (5MB) */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** Start year for graduation options */
const GRADUATION_YEAR_START = 2026;

/** End year for graduation options */
const GRADUATION_YEAR_END = 2036;

/**
 * Generate graduation year options
 * Uses constants for maintainability
 */
function generateGraduationYears(): readonly number[] {
  const years: number[] = [];
  for (let year = GRADUATION_YEAR_START; year <= GRADUATION_YEAR_END; year++) {
    years.push(year);
  }
  return Object.freeze(years);
}

/** Available graduation years */
const GRADUATION_YEAR_OPTIONS: readonly number[] = generateGraduationYears();

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
    HapticButtonDirective,
    NxtChipComponent,
    NxtFormFieldComponent,
  ],
  template: `
    <div class="nxt1-profile-form" data-testid="onboarding-profile-step">
      <!-- Photo Upload Section -->
      <div class="nxt1-photo-section">
        <button
          type="button"
          class="nxt1-photo-upload"
          [class.has-image]="hasProfileImage()"
          [disabled]="disabled()"
          (click)="onPhotoClick()"
          data-testid="onboarding-photo-upload"
          aria-label="Add profile photo"
          nxtHaptic="selection"
        >
          @if (hasProfileImage()) {
            <!-- Profile Image Preview -->
            <img [src]="profileImg()" alt="Profile photo preview" class="nxt1-photo-preview" />
            <div class="nxt1-photo-edit-badge">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path
                  d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                />
              </svg>
            </div>
          } @else {
            <!-- Placeholder Icon -->
            <div class="nxt1-photo-placeholder">
              <svg viewBox="0 0 24 24" fill="none" class="nxt1-photo-icon" aria-hidden="true">
                <path
                  d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <span class="nxt1-photo-label">Add Photo</span>
          }
        </button>
        <p class="nxt1-photo-hint">Optional</p>
      </div>

      <!-- Hidden File Input -->
      <input
        #fileInput
        type="file"
        [accept]="acceptedTypes"
        class="hidden"
        (change)="onFileSelected($event)"
        data-testid="onboarding-photo-input"
      />

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
      </div>

      <!-- Graduation Year (Class Of) - Athletes Only -->
      @if (showClassYear()) {
        <nxt1-form-field label="Class Of (Graduation Year)" testId="onboarding-classyear-field">
          <div class="nxt1-year-chips" role="radiogroup" aria-label="Select graduation year">
            @for (year of graduationYears; track year) {
              <nxt1-chip
                [selected]="classYear() === year"
                [disabled]="disabled()"
                [testId]="'onboarding-class-year-' + year"
                ariaRole="radio"
                (chipClick)="onYearSelect(year)"
              >
                {{ year }}
              </nxt1-chip>
            }
          </div>
        </nxt1-form-field>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       PROFILE FORM CONTAINER
       ============================================ */
      .nxt1-profile-form {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-6);
        width: 100%;
      }

      /* ============================================
       PHOTO UPLOAD SECTION
       ============================================ */
      .nxt1-photo-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .nxt1-photo-upload {
        position: relative;
        width: var(--nxt1-spacing-32);
        height: var(--nxt1-spacing-32);
        border-radius: 50%;
        border: 2px solid var(--nxt1-color-border-default);
        background: transparent;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        cursor: pointer;
        transition: all 0.2s ease;
        /* Removed overflow: hidden to prevent clipping edit badge */
      }

      .nxt1-photo-upload:hover:not(:disabled) {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary5);
      }

      .nxt1-photo-upload:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .nxt1-photo-upload.has-image {
        border-style: solid;
        border-color: var(--nxt1-color-primary);
      }

      /* Photo placeholder */
      .nxt1-photo-placeholder {
        width: var(--nxt1-spacing-12);
        height: var(--nxt1-spacing-12);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .nxt1-photo-icon {
        width: var(--nxt1-spacing-10);
        height: var(--nxt1-spacing-10);
        color: var(--nxt1-color-text-tertiary);
      }

      .nxt1-photo-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary);
      }

      /* Photo preview */
      .nxt1-photo-preview {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 50%;
      }

      /* Edit badge on hover */
      .nxt1-photo-edit-badge {
        position: absolute;
        bottom: 0;
        right: 0;
        width: var(--nxt1-spacing-7);
        height: var(--nxt1-spacing-7);
        border-radius: 50%;
        background: var(--nxt1-color-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-onPrimary);
        border: 2px solid var(--nxt1-color-bg-primary);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }

      /* Photo hint text */
      .nxt1-photo-hint {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
        text-align: center;
        margin: 0;
      }

      /* Hidden file input */
      .hidden {
        display: none;
      }

      /* ============================================
       NAME FIELDS - Grid layout only
       Field/label styles handled by NxtFormFieldComponent
       ============================================ */
      .nxt1-name-fields {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-4);
        width: 100%;
      }

      @media (max-width: 480px) {
        .nxt1-name-fields {
          grid-template-columns: 1fr;
        }
      }

      /* ============================================
       INPUT STYLING - Matches auth-email-form design tokens
       ============================================ */
      .nxt1-input {
        --background: var(--nxt1-color-state-hover);
        --border-color: var(--nxt1-color-border-default);
        --border-radius: var(--nxt1-borderRadius-lg);
        --border-width: 1px;
        --color: var(--nxt1-color-text-primary);
        --placeholder-color: var(--nxt1-color-text-tertiary);
        --placeholder-opacity: 1;
        --padding-start: 16px;
        --padding-end: 16px;
        --padding-top: 14px;
        --padding-bottom: 14px;
        --highlight-color-focused: var(--nxt1-color-border-strong);
        --highlight-color-valid: var(--nxt1-color-border-strong);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        min-height: 52px;
      }

      .nxt1-input:hover:not(.nxt1-input-error) {
        --border-color: var(--nxt1-color-border-strong);
      }

      .nxt1-input-error {
        --border-color: var(--nxt1-color-error);
        --highlight-color-focused: var(--nxt1-color-error);
      }

      /* ============================================
       YEAR CHIPS - Container layout only
       Chip styles handled by NxtChipComponent
       ============================================ */
      .nxt1-year-chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingProfileStepComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly loggingService = inject(NxtLoggingService);
  private readonly toast = inject(NxtToastService);

  /** Namespaced logger for this component */
  private readonly logger: ILogger = this.loggingService.child('OnboardingProfileStep');

  /** Reference to the hidden file input element */
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  // ============================================
  // SIGNAL INPUTS (Angular 19+ pattern)
  // ============================================

  /** Current profile data from parent */
  readonly profileData = input<ProfileFormData | null>(null);

  /** Whether interaction is disabled */
  readonly disabled = input<boolean>(false);

  /** Whether to show class year (athletes only) */
  readonly showClassYear = input<boolean>(true);

  // ============================================
  // SIGNAL OUTPUTS (Angular 19+ pattern)
  // ============================================

  /** Emits when profile data changes */
  readonly profileChange = output<ProfileFormData>();

  /** Emits when photo picker should be shown (for native photo picker integration) */
  readonly photoSelect = output<void>();

  /** Emits when a file is selected from the web file picker */
  readonly fileSelected = output<File>();

  // ============================================
  // CONFIGURATION (readonly for immutability)
  // ============================================

  /** Accepted file types for input */
  readonly acceptedTypes = ACCEPTED_IMAGE_TYPES.join(',');

  /** Graduation year options */
  readonly graduationYears = GRADUATION_YEAR_OPTIONS;

  // ============================================
  // INTERNAL STATE (signals for reactivity)
  // ============================================

  /** First name value */
  readonly firstName = signal('');

  /** Last name value */
  readonly lastName = signal('');

  /** Profile image URL or data URI */
  readonly profileImg = signal<string | null>(null);

  /** Selected class year */
  readonly classYear = signal<number | null>(null);

  /** First name field touched */
  readonly firstNameTouched = signal(false);

  /** Last name field touched */
  readonly lastNameTouched = signal(false);

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Whether profile has an image */
  readonly hasProfileImage = computed(() => !!this.profileImg());

  /** Check if first name is valid using shared helper */
  readonly isFirstNameValid = computed(() => isValidName(this.firstName()));

  /** Check if last name is valid using shared helper */
  readonly isLastNameValid = computed(() => isValidName(this.lastName()));

  /** Whether running in browser (SSR safety) */
  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  // ============================================
  // CONSTRUCTOR - Effect for syncing input
  // ============================================

  constructor() {
    // Sync internal state when profileData input changes
    effect(
      () => {
        const data = this.profileData();
        if (data) {
          this.firstName.set(data.firstName || '');
          this.lastName.set(data.lastName || '');
          this.profileImg.set(data.profileImg || null);
          this.classYear.set(data.classYear ?? null);
        }
      },
      { allowSignalWrites: true }
    );
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
   * Handle graduation year selection
   */
  onYearSelect(year: number): void {
    this.classYear.set(year);
    this.logger.debug('Graduation year selected', { classYear: year });
    this.emitProfileChange();
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
   * Handle file selection from web file picker
   */
  onFileSelected(event: Event): void {
    if (!this.isBrowser) return;

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    // Validate file type
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      this.logger.warn('Invalid file type rejected', {
        fileType: file.type,
        fileName: file.name,
        acceptedTypes: ACCEPTED_IMAGE_TYPES,
      });
      this.toast.warning('Please select a valid image file (JPG, PNG, WebP, or GIF)');
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      this.logger.warn('File too large rejected', {
        fileSize: file.size,
        maxSize: MAX_FILE_SIZE,
        fileName: file.name,
      });
      this.toast.warning('Image must be smaller than 5MB');
      return;
    }

    // Log successful file selection
    this.logger.debug('Profile photo selected', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });

    // Emit file for parent to handle upload
    this.fileSelected.emit(file);

    // Create preview URL
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      this.profileImg.set(dataUrl);
      this.emitProfileChange();
      this.logger.debug('Profile photo preview loaded');
    };
    reader.onerror = () => {
      this.logger.error('Failed to read profile photo', reader.error, {
        fileName: file.name,
      });
      this.toast.error('Failed to load image preview');
    };
    reader.readAsDataURL(file);

    // Reset input to allow selecting same file again
    input.value = '';
  }

  /**
   * Set profile image from external source (e.g., native photo picker)
   */
  setProfileImage(imageUrl: string): void {
    this.profileImg.set(imageUrl);
    this.emitProfileChange();
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Emit profile change event with current data
   */
  private emitProfileChange(): void {
    this.profileChange.emit({
      firstName: this.firstName(),
      lastName: this.lastName(),
      profileImg: this.profileImg(),
      classYear: this.classYear(),
    });
  }
}
