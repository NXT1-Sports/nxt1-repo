/**
 * @fileoverview OnboardingReferralStepComponent - Cross-Platform Referral Source Form
 * @module @nxt1/ui/onboarding
 * @version 2.0.0
 *
 * Reusable referral step component for onboarding Step 7 (final step).
 * Collects how the user heard about NXT1 for marketing attribution.
 *
 * Features:
 * - Platform-adaptive with Ionic components
 * - Clear visual cards for each referral source
 * - Conditional text inputs for 'club' and 'other' options
 * - Optional step (can be skipped)
 * - Accessible with ARIA labels
 * - Haptic feedback ready
 * - Test IDs for E2E testing
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-referral-step
 *   [referralData]="referralFormData()"
 *   [teamCodeUsed]="hasTeamCode()"
 *   [disabled]="isLoading()"
 *   (referralChange)="onReferralChange($event)"
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
import { trigger, transition, style, animate } from '@angular/animations';
import { IonInput } from '@ionic/angular/standalone';
import type { ReferralSourceData } from '@nxt1/core/api';
import type { ILogger } from '@nxt1/core/logging';
import { NxtLoggingService } from '../../services/logging';
import { NxtValidationSummaryComponent } from '../../components/validation-summary';
import { HapticButtonDirective } from '../../services/haptics';

// ============================================
// TYPES
// ============================================

/** Referral source types */
export type ReferralSourceType =
  | 'club'
  | 'social'
  | 'search'
  | 'friend'
  | 'advertisement'
  | 'team-code'
  | 'other';

/** Referral option configuration */
export interface ReferralOption {
  type: ReferralSourceType;
  label: string;
  description: string;
  icon: 'club' | 'social' | 'search' | 'friend' | 'ad' | 'team-code' | 'other';
  hasInput?: boolean;
  inputPlaceholder?: string;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Available referral source options
 * Ordered by typical frequency of selection for optimal UX
 */
export const REFERRAL_OPTIONS: readonly ReferralOption[] = [
  {
    type: 'social',
    label: 'Social Media',
    description: 'Instagram, TikTok, Twitter, Facebook, etc.',
    icon: 'social',
  },
  {
    type: 'friend',
    label: 'Friend or Teammate',
    description: 'Recommended by someone I know',
    icon: 'friend',
  },
  {
    type: 'search',
    label: 'Search Engine',
    description: 'Google, Bing, or another search engine',
    icon: 'search',
  },
  {
    type: 'advertisement',
    label: 'Advertisement',
    description: 'Online ad or sponsored content',
    icon: 'ad',
  },
  {
    type: 'team-code',
    label: 'Team Invite Code',
    description: 'Received an invite code from my team',
    icon: 'team-code',
  },
  {
    type: 'club',
    label: 'Club or Team',
    description: 'My club/team uses NXT1',
    icon: 'club',
    hasInput: true,
    inputPlaceholder: 'Enter team name...',
  },
  {
    type: 'other',
    label: 'Other',
    description: 'Something else not listed',
    icon: 'other',
    hasInput: true,
    inputPlaceholder: 'Please specify how you found us...',
  },
] as const;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-onboarding-referral-step',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonInput,
    NxtValidationSummaryComponent,
    HapticButtonDirective,
  ],
  template: `
    <div class="nxt1-referral-form" data-testid="onboarding-referral-step">
      <!-- Referral Options Grid -->
      <div
        class="nxt1-referral-options"
        role="radiogroup"
        aria-label="How did you hear about NXT1?"
      >
        @for (option of referralOptions; track option.type; let idx = $index) {
          <button
            type="button"
            class="nxt1-referral-card"
            role="radio"
            [class.nxt1-referral-card-selected]="selectedSource() === option.type"
            [attr.aria-checked]="selectedSource() === option.type"
            [attr.aria-describedby]="'referral-desc-' + option.type"
            [attr.tabindex]="
              selectedSource() === option.type || (!selectedSource() && idx === 0) ? 0 : -1
            "
            [disabled]="disabled()"
            (click)="onSourceSelect(option.type)"
            (keydown)="onKeyDown($event, idx)"
            nxtHaptic="selection"
            [attr.data-testid]="'onboarding-referral-option-' + option.type"
          >
            <!-- Radio Indicator -->
            <div class="nxt1-card-radio" aria-hidden="true">
              <div class="nxt1-radio-inner"></div>
            </div>

            <!-- Card Content -->
            <div class="nxt1-card-content">
              <!-- Icon -->
              <div class="nxt1-card-icon">
                @switch (option.icon) {
                  @case ('club') {
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  }
                  @case ('social') {
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                    </svg>
                  }
                  @case ('search') {
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                  }
                  @case ('friend') {
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  }
                  @case ('ad') {
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <path d="M8 21h8" />
                      <path d="M12 17v4" />
                    </svg>
                  }
                  @case ('team-code') {
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  }
                  @case ('other') {
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4" />
                      <path d="M12 8h.01" />
                    </svg>
                  }
                }
              </div>

              <!-- Text -->
              <div class="nxt1-card-text">
                <span class="nxt1-card-label">{{ option.label }}</span>
                <span class="nxt1-card-description" [id]="'referral-desc-' + option.type">{{
                  option.description
                }}</span>
              </div>
            </div>

            <!-- Conditional Input -->
            @if (option.hasInput && selectedSource() === option.type) {
              <div class="nxt1-card-input" (click)="$event.stopPropagation()">
                <ion-input
                  type="text"
                  class="nxt1-input"
                  fill="outline"
                  [placeholder]="option.inputPlaceholder || 'Please specify...'"
                  [value]="option.type === 'club' ? clubName() : otherSpecify()"
                  (ionInput)="
                    option.type === 'club' ? onClubNameInput($event) : onOtherSpecifyInput($event)
                  "
                  [disabled]="disabled()"
                  [attr.aria-label]="option.inputPlaceholder"
                  [attr.data-testid]="'onboarding-referral-input-' + option.type"
                />
              </div>
            }
          </button>
        }
      </div>

      <!-- Validation Summary -->
      @if (showValidationSummary()) {
        <div class="nxt1-validation-container" @fadeSlideIn>
          <nxt1-validation-summary testId="onboarding-referral-validation">
            Thanks for sharing how you found us!
          </nxt1-validation-summary>
        </div>
      }
    </div>
  `,
  animations: [
    trigger('fadeSlideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-8px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
  ],
  styles: [
    `
      /* ============================================
       REFERRAL FORM CONTAINER
       ============================================ */
      .nxt1-referral-form {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5, 20px);
        width: 100%;
      }

      /* ============================================
       REFERRAL OPTIONS GRID
       ============================================ */
      .nxt1-referral-options {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
      }

      /* ============================================
       REFERRAL CARD - Base State (White with gray hover)
       Matches footer/input pattern
       ============================================ */
      .nxt1-referral-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-4, 16px);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        text-align: left;
        width: 100%;
        -webkit-tap-highlight-color: transparent;
      }

      /* Hover State - lighter surface for non-selected */
      .nxt1-referral-card:hover:not(:disabled):not(.nxt1-referral-card-selected) {
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
        transform: translateY(-2px);
      }

      /* Focus State */
      .nxt1-referral-card:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      /* Disabled State */
      .nxt1-referral-card:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
      }

      /* Selected State - Fill with primary like role selection */
      .nxt1-referral-card-selected {
        border-color: var(--nxt1-color-primary, #ccff00);
        background: var(--nxt1-color-primary, #ccff00);
      }

      /* Selected + Hover State - No transform */
      .nxt1-referral-card-selected:hover:not(:disabled) {
        border-color: var(--nxt1-color-primary, #ccff00);
        background: var(--nxt1-color-primary, #ccff00);
        transform: none;
      }

      /* ============================================
       CARD CONTENT LAYOUT
       ============================================ */
      .nxt1-card-content {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
      }

      /* ============================================
       RADIO INDICATOR
       ============================================ */
      .nxt1-card-radio {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        border: 2px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
      }

      .nxt1-referral-card-selected .nxt1-card-radio {
        border-color: var(--nxt1-color-text-onPrimary, #0a0a0a);
      }

      .nxt1-radio-inner {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: transparent;
        transition: background var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
      }

      .nxt1-referral-card-selected .nxt1-radio-inner {
        background: var(--nxt1-color-text-onPrimary, #0a0a0a);
      }

      /* ============================================
       CARD ICON - Surface background for icon container
       ============================================ */
      .nxt1-card-icon {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-borderRadius-md, 8px);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
      }

      .nxt1-referral-card-selected .nxt1-card-icon {
        background: var(--nxt1-color-alpha-black20);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
      }

      .nxt1-card-icon svg {
        width: 20px;
        height: 20px;
      }

      /* ============================================
       CARD TEXT
       ============================================ */
      .nxt1-card-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }

      .nxt1-card-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        line-height: 1.3;
        transition: color var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
      }

      .nxt1-referral-card-selected .nxt1-card-label {
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
      }

      .nxt1-card-description {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        line-height: 1.3;
        transition: color var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
      }

      .nxt1-referral-card-selected .nxt1-card-description {
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
        opacity: 0.8;
      }

      /* ============================================
       CONDITIONAL INPUT - White base with gray hover
       ============================================ */
      .nxt1-card-input {
        width: 100%;
        padding-left: 56px; /* Align with text after radio + icon */
      }

      .nxt1-card-input .nxt1-input {
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

      /* Input inside selected card - needs dark text on light background */
      .nxt1-referral-card-selected .nxt1-card-input .nxt1-input {
        --background: var(--nxt1-color-bg-secondary);
        --border-color: var(--nxt1-color-border-subtle);
        --color: var(--nxt1-color-text-onPrimary);
        --placeholder-color: var(--nxt1-color-text-secondary);
        --highlight-color-focused: var(--nxt1-color-border-strong);
        --highlight-color-valid: var(--nxt1-color-border-strong);
      }

      .nxt1-card-input .nxt1-input:hover:not(:disabled) {
        --background: var(--nxt1-color-surface-200);
        --border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
      }

      /* ============================================
       VALIDATION CONTAINER
       ============================================ */
      .nxt1-validation-container {
        margin-top: var(--nxt1-spacing-1, 4px);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingReferralStepComponent {
  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly loggingService = inject(NxtLoggingService);

  /** Namespaced logger for this component */
  private readonly logger: ILogger = this.loggingService.child('OnboardingReferralStep');

  // ============================================
  // INPUTS
  // ============================================

  /** Current referral form data */
  readonly referralData = input<ReferralSourceData | null>(null);

  /** Whether user came via team code (auto-selects team-code option) */
  readonly teamCodeUsed = input<boolean>(false);

  /** Disabled state */
  readonly disabled = input<boolean>(false);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when referral source changes */
  readonly referralChange = output<ReferralSourceData>();

  // ============================================
  // LOCAL STATE
  // ============================================

  /** Selected referral source */
  readonly selectedSource = signal<ReferralSourceType | null>(null);

  /** Club name if source is 'club' */
  readonly clubName = signal<string>('');

  /** Other specification if source is 'other' */
  readonly otherSpecify = signal<string>('');

  // ============================================
  // COMPUTED
  // ============================================

  /** Check if a source is selected */
  readonly hasSelection = computed(() => !!this.selectedSource());

  /** Show validation summary when a source is selected */
  readonly showValidationSummary = computed(() => {
    const source = this.selectedSource();
    if (!source) return false;

    // For sources with input, require the input to have value
    if (source === 'club') {
      return this.clubName().trim().length > 0;
    }
    if (source === 'other') {
      return this.otherSpecify().trim().length > 0;
    }

    // Other sources just need selection
    return true;
  });

  // ============================================
  // TEMPLATE CONSTANTS
  // ============================================

  /** Available referral options */
  readonly referralOptions = REFERRAL_OPTIONS;

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    // Sync input data to local signals
    effect(() => {
      const data = this.referralData();
      const teamCodeUsed = this.teamCodeUsed();

      if (data?.source) {
        this.selectedSource.set(data.source as ReferralSourceType);

        if (data.clubName) {
          this.clubName.set(data.clubName);
        }

        if (data.otherSpecify) {
          this.otherSpecify.set(data.otherSpecify);
        }
      } else if (teamCodeUsed && !this.selectedSource()) {
        // Auto-select team-code if user came via team code
        this.selectedSource.set('team-code');
        this.emitChange();
      }

      this.logger.debug('Referral data synced from input', {
        source: this.selectedSource(),
        hasClubName: !!this.clubName(),
        hasOtherSpecify: !!this.otherSpecify(),
        teamCodeUsed,
      });
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle source selection
   */
  onSourceSelect(source: ReferralSourceType): void {
    this.selectedSource.set(source);

    // Clear conditional inputs when switching sources
    if (source !== 'club') {
      this.clubName.set('');
    }
    if (source !== 'other') {
      this.otherSpecify.set('');
    }

    this.emitChange();
  }

  /**
   * Handle club name input
   */
  onClubNameInput(event: CustomEvent): void {
    const value = event.detail.value || '';
    this.clubName.set(value);
    this.emitChange();
  }

  /**
   * Handle other specify input
   */
  onOtherSpecifyInput(event: CustomEvent): void {
    const value = event.detail.value || '';
    this.otherSpecify.set(value);
    this.emitChange();
  }

  /**
   * Handle keyboard navigation for radiogroup
   * Implements WAI-ARIA radio group keyboard patterns
   */
  onKeyDown(event: KeyboardEvent, currentIndex: number): void {
    const options = this.referralOptions;
    let newIndex: number | null = null;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        newIndex = (currentIndex + 1) % options.length;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        newIndex = (currentIndex - 1 + options.length) % options.length;
        break;
      case 'Home':
        event.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        newIndex = options.length - 1;
        break;
      default:
        return;
    }

    if (newIndex !== null) {
      // Select the new option
      this.onSourceSelect(options[newIndex].type);

      // Focus the new button
      const container = (event.target as HTMLElement).closest('.nxt1-referral-options');
      if (container) {
        const buttons = container.querySelectorAll<HTMLButtonElement>('.nxt1-referral-card');
        buttons[newIndex]?.focus();
      }
    }
  }

  // ============================================
  // INTERNAL
  // ============================================

  /**
   * Emit current referral data to parent
   */
  private emitChange(): void {
    const source = this.selectedSource();
    if (!source) return;

    const data: ReferralSourceData = {
      source,
    };

    if (source === 'club' && this.clubName()) {
      data.clubName = this.clubName();
    }

    if (source === 'other' && this.otherSpecify()) {
      data.otherSpecify = this.otherSpecify();
    }

    this.logger?.debug('Referral change emitted', {
      source: data.source,
      hasClubName: !!data.clubName,
      hasOtherSpecify: !!data.otherSpecify,
    });

    this.referralChange.emit(data);
  }
}
