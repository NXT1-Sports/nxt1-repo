/**
 * @fileoverview OnboardingContactStepComponent - Cross-Platform Contact Info Form
 * @module @nxt1/ui/onboarding
 * @version 2.0.0
 *
 * Reusable contact step component for onboarding Step 6.
 * Collects user's contact information including email, phone, and location.
 *
 * Features:
 * - Platform-adaptive with Ionic components
 * - Contact email with validation
 * - Phone number with formatting
 * - City and state selection with search
 * - Real-time validation using @nxt1/core helpers
 * - Accessible with ARIA labels
 * - Haptic feedback ready
 * - Test IDs for E2E testing
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-contact-step
 *   [contactData]="contactFormData()"
 *   [authEmail]="userEmail()"
 *   [disabled]="isLoading()"
 *   (contactChange)="onContactChange($event)"
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
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonInput, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import type { ContactFormData } from '@nxt1/core/api';
import { US_STATES, type USState } from '@nxt1/core/constants';
import { isValidEmail, isValidPhone } from '@nxt1/core/helpers';
import type { ILogger } from '@nxt1/core/logging';
import { NxtLoggingService } from '../../services/logging';
import { NxtValidationSummaryComponent } from '../../shared/validation-summary';
import { NxtFormFieldComponent } from '../../shared/form-field';

// ============================================
// CONSTANTS
// ============================================

/** Default country for onboarding */
const DEFAULT_COUNTRY = 'United States';

/** Minimum city name length */
const MIN_CITY_LENGTH = 2;

/** Maximum city name length */
const MAX_CITY_LENGTH = 100;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-onboarding-contact-step',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonInput,
    IonSelect,
    IonSelectOption,
    NxtValidationSummaryComponent,
    NxtFormFieldComponent,
  ],
  template: `
    <div class="nxt1-contact-form" data-testid="onboarding-contact-step">
      <!-- Contact Email -->
      <nxt1-form-field
        label="Contact Email"
        inputId="contactEmail"
        [error]="emailError()"
        hint="Coaches will use this to contact you"
        testId="onboarding-contact-email-field"
      >
        <ion-input
          id="contactEmail"
          type="email"
          class="nxt1-input"
          [class.nxt1-input-error]="emailError()"
          fill="outline"
          placeholder="your@email.com"
          [value]="contactEmail()"
          (ionInput)="onEmailInput($event)"
          (ionBlur)="emailTouched.set(true)"
          [disabled]="disabled()"
          autocomplete="email"
          inputmode="email"
          data-testid="onboarding-input-contact-email"
        />
      </nxt1-form-field>

      <!-- Phone Number -->
      <nxt1-form-field
        label="Phone Number"
        inputId="phoneNumber"
        [optional]="true"
        [error]="phoneError()"
        hint="Optional - for direct contact from coaches"
        testId="onboarding-contact-phone-field"
      >
        <ion-input
          id="phoneNumber"
          type="tel"
          class="nxt1-input"
          [class.nxt1-input-error]="phoneError()"
          fill="outline"
          placeholder="(555) 123-4567"
          [value]="phoneNumber()"
          (ionInput)="onPhoneInput($event)"
          (ionBlur)="phoneTouched.set(true)"
          [disabled]="disabled()"
          autocomplete="tel"
          inputmode="tel"
          data-testid="onboarding-input-phone-number"
        />
      </nxt1-form-field>

      <!-- Location Fields - City and State side by side -->
      <div class="nxt1-location-fields">
        <!-- City Input -->
        <nxt1-form-field
          label="City"
          inputId="city"
          [error]="cityError()"
          testId="onboarding-contact-city-field"
        >
          <ion-input
            id="city"
            type="text"
            class="nxt1-input"
            [class.nxt1-input-error]="cityError()"
            fill="outline"
            placeholder="Enter your city"
            [value]="city()"
            (ionInput)="onCityInput($event)"
            (ionBlur)="cityTouched.set(true)"
            [disabled]="disabled()"
            autocomplete="address-level2"
            autocapitalize="words"
            data-testid="onboarding-input-city"
          />
        </nxt1-form-field>

        <!-- State Selection -->
        <nxt1-form-field
          label="State"
          inputId="state"
          [error]="stateError()"
          testId="onboarding-contact-state-field"
        >
          <ion-select
            id="state"
            class="nxt1-select"
            [class.nxt1-select-error]="stateError()"
            interface="popover"
            [interfaceOptions]="selectPopoverOptions"
            placeholder="Select your state"
            [value]="state()"
            (ionChange)="onStateChange($event)"
            (ionBlur)="stateTouched.set(true)"
            [disabled]="disabled()"
            data-testid="onboarding-select-state"
          >
            @for (stateOption of usStates; track stateOption.abbreviation) {
              <ion-select-option [value]="stateOption.abbreviation">
                {{ stateOption.name }}
              </ion-select-option>
            }
          </ion-select>
        </nxt1-form-field>
      </div>

      <!-- Social Media Section -->
      <div class="nxt1-section-header">
        <span class="nxt1-section-title">Social Media</span>
        <span class="nxt1-section-subtitle">Optional - Help coaches find your content</span>
      </div>

      <!-- Instagram -->
      <nxt1-form-field
        label="Instagram"
        inputId="instagram"
        [optional]="true"
        hint="Your Instagram username"
        testId="onboarding-contact-instagram-field"
      >
        <ion-input
          id="instagram"
          type="text"
          class="nxt1-input"
          fill="outline"
          placeholder="@username"
          [value]="instagram()"
          (ionInput)="onInstagramInput($event)"
          [disabled]="disabled()"
          autocomplete="off"
          autocapitalize="off"
          data-testid="onboarding-input-instagram"
        />
      </nxt1-form-field>

      <!-- Twitter/X -->
      <nxt1-form-field
        label="X (Twitter)"
        inputId="twitter"
        [optional]="true"
        hint="Your X/Twitter username"
        testId="onboarding-contact-twitter-field"
      >
        <ion-input
          id="twitter"
          type="text"
          class="nxt1-input"
          fill="outline"
          placeholder="@username"
          [value]="twitter()"
          (ionInput)="onTwitterInput($event)"
          [disabled]="disabled()"
          autocomplete="off"
          autocapitalize="off"
          data-testid="onboarding-input-twitter"
        />
      </nxt1-form-field>

      <!-- TikTok -->
      <nxt1-form-field
        label="TikTok"
        inputId="tiktok"
        [optional]="true"
        hint="Your TikTok username"
        testId="onboarding-contact-tiktok-field"
      >
        <ion-input
          id="tiktok"
          type="text"
          class="nxt1-input"
          fill="outline"
          placeholder="@username"
          [value]="tiktok()"
          (ionInput)="onTiktokInput($event)"
          [disabled]="disabled()"
          autocomplete="off"
          autocapitalize="off"
          data-testid="onboarding-input-tiktok"
        />
      </nxt1-form-field>

      <!-- Platform Links Section -->
      <div class="nxt1-section-header">
        <span class="nxt1-section-title">Athletic Profiles</span>
        <span class="nxt1-section-subtitle">Optional - Share your highlight videos</span>
      </div>

      <!-- Hudl -->
      <nxt1-form-field
        label="Hudl Profile"
        inputId="hudl"
        [optional]="true"
        hint="Full URL to your Hudl profile"
        testId="onboarding-contact-hudl-field"
      >
        <ion-input
          id="hudl"
          type="url"
          class="nxt1-input"
          fill="outline"
          placeholder="https://www.hudl.com/profile/..."
          [value]="hudl()"
          (ionInput)="onHudlInput($event)"
          [disabled]="disabled()"
          autocomplete="url"
          inputmode="url"
          data-testid="onboarding-input-hudl"
        />
      </nxt1-form-field>

      <!-- YouTube -->
      <nxt1-form-field
        label="YouTube Channel"
        inputId="youtube"
        [optional]="true"
        hint="Full URL to your YouTube channel"
        testId="onboarding-contact-youtube-field"
      >
        <ion-input
          id="youtube"
          type="url"
          class="nxt1-input"
          fill="outline"
          placeholder="https://www.youtube.com/..."
          [value]="youtube()"
          (ionInput)="onYoutubeInput($event)"
          [disabled]="disabled()"
          autocomplete="url"
          inputmode="url"
          data-testid="onboarding-input-youtube"
        />
      </nxt1-form-field>

      <!-- MaxPreps / Sports Link -->
      <nxt1-form-field
        label="MaxPreps / Other"
        inputId="maxpreps"
        [optional]="true"
        hint="Full URL to MaxPreps or other sports profile"
        testId="onboarding-contact-maxpreps-field"
      >
        <ion-input
          id="maxpreps"
          type="url"
          class="nxt1-input"
          fill="outline"
          placeholder="https://www.maxpreps.com/..."
          [value]="maxpreps()"
          (ionInput)="onMaxprepsInput($event)"
          [disabled]="disabled()"
          autocomplete="url"
          inputmode="url"
          data-testid="onboarding-input-maxpreps"
        />
      </nxt1-form-field>

      <!-- Validation Summary -->
      @if (showValidationSummary()) {
        <nxt1-validation-summary testId="onboarding-contact-validation">
          Contact info looks good!
        </nxt1-validation-summary>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       CONTACT FORM CONTAINER
       ============================================ */
      .nxt1-contact-form {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5, 20px);
        width: 100%;
      }

      /* ============================================
       INPUT STYLING - Matches auth-email-form design tokens
       ============================================ */
      .nxt1-input {
        --background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.04));
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
      }

      .nxt1-input:hover:not(.nxt1-input-error) {
        --border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
      }

      .nxt1-input-error {
        --border-color: var(--nxt1-color-error, #ef4444);
        --highlight-color-focused: var(--nxt1-color-error, #ef4444);
      }

      /* ============================================
       SELECT STYLING - Matches input design
       ============================================ */
      .nxt1-select {
        --background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.04));
        --border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        --border-radius: var(--nxt1-borderRadius-lg, 12px);
        --border-width: 1px;
        --color: var(--nxt1-color-text-primary, #ffffff);
        --placeholder-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --placeholder-opacity: 1;
        --padding-start: 12px;
        --padding-end: 12px;
        --highlight-color-focused: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base, 1rem);
        min-height: 52px;
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.04));
      }

      .nxt1-select:hover:not(:disabled) {
        border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
      }

      .nxt1-select::part(icon) {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .nxt1-select:disabled {
        opacity: 0.4;
      }

      .nxt1-select-error {
        --border-color: var(--nxt1-color-error, #ef4444);
        border-color: var(--nxt1-color-error, #ef4444);
      }

      /* ============================================
       LOCATION FIELDS - Side by side layout
       ============================================ */
      .nxt1-location-fields {
        display: grid;
        grid-template-columns: 1fr 140px;
        gap: var(--nxt1-spacing-3, 12px);
        width: 100%;
      }

      @media (max-width: 480px) {
        .nxt1-location-fields {
          grid-template-columns: 1fr;
        }
      }

      /* ============================================
       SECTION HEADERS
       ============================================ */
      .nxt1-section-header {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1, 4px);
        padding-top: var(--nxt1-spacing-2, 8px);
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.05));
      }

      .nxt1-section-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide, 0.05em);
      }

      .nxt1-section-subtitle {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingContactStepComponent {
  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly loggingService = inject(NxtLoggingService);

  /** Namespaced logger for this component */
  private readonly logger: ILogger = this.loggingService.child('OnboardingContactStep');

  // ============================================
  // INPUTS
  // ============================================

  /** Current contact form data */
  readonly contactData = input<ContactFormData>({});

  /** User's auth email - used as default contact email if not set */
  readonly authEmail = input<string>('');

  /** Disabled state */
  readonly disabled = input<boolean>(false);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when any contact field changes */
  readonly contactChange = output<ContactFormData>();

  // ============================================
  // LOCAL STATE
  // ============================================

  /** Contact email */
  readonly contactEmail = signal<string>('');

  /** Phone number */
  readonly phoneNumber = signal<string>('');

  /** City */
  readonly city = signal<string>('');

  /** State abbreviation */
  readonly state = signal<string>('');

  // Social media handles
  readonly instagram = signal<string>('');
  readonly twitter = signal<string>('');
  readonly tiktok = signal<string>('');

  // Platform profile links
  readonly hudl = signal<string>('');
  readonly youtube = signal<string>('');
  readonly maxpreps = signal<string>('');

  /** Touched states for validation display */
  readonly emailTouched = signal<boolean>(false);
  readonly phoneTouched = signal<boolean>(false);
  readonly cityTouched = signal<boolean>(false);
  readonly stateTouched = signal<boolean>(false);

  // ============================================
  // COMPUTED
  // ============================================

  /** Email validation */
  readonly isEmailValid = computed(() => {
    const email = this.contactEmail();
    return !email || isValidEmail(email);
  });

  /** Email error message */
  readonly emailError = computed(() => {
    if (!this.emailTouched() || !this.contactEmail()) return null;
    if (!this.isEmailValid()) return 'Please enter a valid email address';
    return null;
  });

  /** Phone validation (optional field, validate only if provided) */
  readonly isPhoneValid = computed(() => {
    const phone = this.phoneNumber();
    if (!phone || phone.trim() === '') return true; // Optional field
    return isValidPhone(phone);
  });

  /** Phone error message */
  readonly phoneError = computed(() => {
    if (!this.phoneTouched() || !this.phoneNumber()) return null;
    if (!this.isPhoneValid()) return 'Please enter a valid phone number';
    return null;
  });

  /** City validation */
  readonly isCityValid = computed(() => {
    const cityVal = this.city().trim();
    if (!cityVal) return false;
    return cityVal.length >= MIN_CITY_LENGTH && cityVal.length <= MAX_CITY_LENGTH;
  });

  /** City error message */
  readonly cityError = computed(() => {
    if (!this.cityTouched() || !this.city()) return null;
    if (!this.isCityValid()) return `City must be ${MIN_CITY_LENGTH}-${MAX_CITY_LENGTH} characters`;
    return null;
  });

  /** State validation */
  readonly isStateValid = computed(() => {
    return !!this.state();
  });

  /** State error message */
  readonly stateError = computed(() => {
    if (!this.stateTouched()) return null;
    if (!this.isStateValid()) return 'Please select a state';
    return null;
  });

  /** Overall form validity for validation summary */
  readonly isFormValid = computed(() => {
    return (
      this.contactEmail().trim() !== '' &&
      this.isEmailValid() &&
      this.isPhoneValid() &&
      this.isCityValid() &&
      this.isStateValid()
    );
  });

  /** Show validation summary when form is complete and valid */
  readonly showValidationSummary = computed(() => {
    return this.isFormValid() && this.emailTouched() && this.cityTouched() && this.stateTouched();
  });

  // ============================================
  // TEMPLATE CONSTANTS
  // ============================================

  /** US states list from core constants */
  readonly usStates: readonly USState[] = US_STATES;

  /** Popover options for ion-select */
  readonly selectPopoverOptions = {
    cssClass: 'nxt1-select-popover',
    showBackdrop: true,
  };

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    // Sync input data to local signals when contactData or authEmail changes
    effect(() => {
      const data = this.contactData();
      const authEmail = this.authEmail();

      // Use auth email as default if no contact email set
      const emailValue = data.contactEmail || authEmail || '';

      if (emailValue !== this.contactEmail()) {
        this.contactEmail.set(emailValue);
      }

      if ((data.phoneNumber ?? '') !== this.phoneNumber()) {
        this.phoneNumber.set(data.phoneNumber ?? '');
      }

      if ((data.city ?? '') !== this.city()) {
        this.city.set(data.city ?? '');
      }

      if ((data.state ?? '') !== this.state()) {
        this.state.set(data.state ?? '');
      }

      // Social media
      if ((data.instagram ?? '') !== this.instagram()) {
        this.instagram.set(data.instagram ?? '');
      }

      if ((data.twitter ?? '') !== this.twitter()) {
        this.twitter.set(data.twitter ?? '');
      }

      if ((data.tiktok ?? '') !== this.tiktok()) {
        this.tiktok.set(data.tiktok ?? '');
      }

      // Platform links
      if ((data.hudlAccountLink ?? '') !== this.hudl()) {
        this.hudl.set(data.hudlAccountLink ?? '');
      }

      if ((data.youtubeAccountLink ?? '') !== this.youtube()) {
        this.youtube.set(data.youtubeAccountLink ?? '');
      }

      if ((data.sportsAccountLink ?? '') !== this.maxpreps()) {
        this.maxpreps.set(data.sportsAccountLink ?? '');
      }

      this.logger.debug('Contact data synced from input', {
        hasEmail: !!emailValue,
        hasPhone: !!(data.phoneNumber ?? ''),
        hasCity: !!(data.city ?? ''),
        hasState: !!(data.state ?? ''),
        hasSocial: !!(data.instagram || data.twitter || data.tiktok),
        hasLinks: !!(data.hudlAccountLink || data.youtubeAccountLink || data.sportsAccountLink),
      });
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle email input change
   */
  onEmailInput(event: CustomEvent): void {
    const value = (event.detail.value || '').trim();
    this.contactEmail.set(value);
    this.emitChange();
  }

  /**
   * Handle phone input change with formatting
   */
  onPhoneInput(event: CustomEvent): void {
    const rawValue = event.detail.value || '';
    // Store raw value, format on display only
    this.phoneNumber.set(rawValue);
    this.emitChange();
  }

  /**
   * Handle city input change
   */
  onCityInput(event: CustomEvent): void {
    const value = (event.detail.value || '').trim();
    this.city.set(value);
    this.emitChange();
  }

  /**
   * Handle state selection change
   */
  onStateChange(event: CustomEvent): void {
    const value = event.detail.value || '';
    this.state.set(value);
    this.stateTouched.set(true);
    this.emitChange();
  }

  /**
   * Handle Instagram input change
   */
  onInstagramInput(event: CustomEvent): void {
    const value = (event.detail.value || '').trim();
    this.instagram.set(value);
    this.emitChange();
  }

  /**
   * Handle Twitter/X input change
   */
  onTwitterInput(event: CustomEvent): void {
    const value = (event.detail.value || '').trim();
    this.twitter.set(value);
    this.emitChange();
  }

  /**
   * Handle TikTok input change
   */
  onTiktokInput(event: CustomEvent): void {
    const value = (event.detail.value || '').trim();
    this.tiktok.set(value);
    this.emitChange();
  }

  /**
   * Handle Hudl input change
   */
  onHudlInput(event: CustomEvent): void {
    const value = (event.detail.value || '').trim();
    this.hudl.set(value);
    this.emitChange();
  }

  /**
   * Handle YouTube input change
   */
  onYoutubeInput(event: CustomEvent): void {
    const value = (event.detail.value || '').trim();
    this.youtube.set(value);
    this.emitChange();
  }

  /**
   * Handle MaxPreps/Sports input change
   */
  onMaxprepsInput(event: CustomEvent): void {
    const value = (event.detail.value || '').trim();
    this.maxpreps.set(value);
    this.emitChange();
  }

  // ============================================
  // INTERNAL
  // ============================================

  /**
   * Emit current contact data to parent
   */
  private emitChange(): void {
    const formData: ContactFormData = {
      contactEmail: this.contactEmail(),
      phoneNumber: this.phoneNumber() || undefined,
      city: this.city() || undefined,
      state: this.state() || undefined,
      country: DEFAULT_COUNTRY,
      // Social media
      instagram: this.instagram() || undefined,
      twitter: this.twitter() || undefined,
      tiktok: this.tiktok() || undefined,
      // Platform links
      hudlAccountLink: this.hudl() || undefined,
      youtubeAccountLink: this.youtube() || undefined,
      sportsAccountLink: this.maxpreps() || undefined,
    };

    this.logger?.debug('Contact change emitted', {
      email: !!formData.contactEmail,
      phone: !!formData.phoneNumber,
      city: !!formData.city,
      state: !!formData.state,
      social: !!(formData.instagram || formData.twitter || formData.tiktok),
      links: !!(
        formData.hudlAccountLink ||
        formData.youtubeAccountLink ||
        formData.sportsAccountLink
      ),
    });

    this.contactChange.emit(formData);
  }
}
