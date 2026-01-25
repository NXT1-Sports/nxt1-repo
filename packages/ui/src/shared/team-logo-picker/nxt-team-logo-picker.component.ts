/**
 * @fileoverview NxtTeamLogoPickerComponent - Cross-Platform Team Logo Picker
 * @module @nxt1/ui/shared
 * @version 2.0.0
 *
 * Compact, professional team logo picker component for onboarding.
 * Displays inline with team name input for seamless UX.
 *
 * Features:
 * - Compact design with size variants (sm: 40px, md: 48px, lg: 64px)
 * - Image upload with preview (max 5MB, JPG/PNG/WebP/GIF)
 * - Native photo picker integration for mobile
 * - Fallback icon when no logo selected
 * - Edit badge overlay on hover
 * - Accessible with ARIA labels
 * - Haptic feedback via directive
 * - Test IDs for E2E testing
 *
 * Usage:
 * ```html
 * <nxt1-team-logo-picker
 *   [logoUrl]="teamLogo()"
 *   [disabled]="isLoading()"
 *   size="md"
 *   (logoChange)="onLogoChange($event)"
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
  ViewChild,
  ElementRef,
  inject,
  PLATFORM_ID,
  effect,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import type { ILogger } from '@nxt1/core/logging';
import { HapticButtonDirective } from '../../services/haptics';
import { NxtLoggingService } from '../../services/logging';
import { NxtToastService } from '../../services/toast';

// ============================================
// TYPES
// ============================================

/** Size variants for the logo picker */
export type LogoPickerSize = 'sm' | 'md' | 'lg';

// ============================================
// CONSTANTS
// ============================================

/** Accepted image MIME types */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Maximum file size in bytes (5MB) */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-team-logo-picker',
  standalone: true,
  imports: [CommonModule, HapticButtonDirective],
  template: `
    <div class="nxt1-logo-picker" [attr.data-testid]="testId()">
      <button
        type="button"
        class="nxt1-logo-button"
        [class.has-logo]="hasLogo()"
        [class.nxt1-logo-sm]="size() === 'sm'"
        [class.nxt1-logo-lg]="size() === 'lg'"
        [disabled]="disabled()"
        (click)="onLogoClick()"
        [attr.aria-label]="hasLogo() ? 'Change team logo' : 'Add team logo'"
        nxtHaptic="selection"
      >
        @if (hasLogo()) {
          <!-- Logo Preview -->
          <img [src]="currentLogo()" alt="Team logo" class="nxt1-logo-preview" />
          <div class="nxt1-logo-edit-badge">
            <svg viewBox="0 0 24 24" fill="currentColor" class="nxt1-edit-icon" aria-hidden="true">
              <path
                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
              />
            </svg>
          </div>
        } @else {
          <!-- Placeholder Icon (Image/Photo) -->
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="nxt1-logo-placeholder-icon"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
        }
      </button>

      <!-- Hidden File Input -->
      <input
        #fileInput
        type="file"
        [accept]="acceptedTypes"
        class="nxt1-hidden-input"
        (change)="onFileSelected($event)"
        [attr.data-testid]="testId() + '-input'"
      />
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }

      .nxt1-hidden-input {
        display: none;
      }

      /* ============================================
         LOGO PICKER CONTAINER
         ============================================ */
      .nxt1-logo-picker {
        display: inline-flex;
        align-items: center;
      }

      /* ============================================
         LOGO BUTTON - Base (md size: 48px)
         ============================================ */
      .nxt1-logo-button {
        position: relative;
        width: 48px;
        height: 48px;
        min-width: 48px;
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-state-hover);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all var(--nxt1-duration-fast) ease;
        padding: 0;
        -webkit-tap-highlight-color: transparent;
      }

      /* Size: sm (40px) */
      .nxt1-logo-button.nxt1-logo-sm {
        width: 40px;
        height: 40px;
        min-width: 40px;
      }

      /* Size: lg (64px) */
      .nxt1-logo-button.nxt1-logo-lg {
        width: 64px;
        height: 64px;
        min-width: 64px;
      }

      .nxt1-logo-button:hover:not(:disabled) {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary5);
      }

      .nxt1-logo-button:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .nxt1-logo-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .nxt1-logo-button.has-logo {
        border-style: solid;
        border-color: var(--nxt1-color-primary);
      }

      /* ============================================
         PLACEHOLDER ICON
         ============================================ */
      .nxt1-logo-placeholder-icon {
        width: 24px;
        height: 24px;
        color: var(--nxt1-color-text-tertiary);
        transition: color var(--nxt1-duration-fast) ease;
      }

      .nxt1-logo-sm .nxt1-logo-placeholder-icon {
        width: 20px;
        height: 20px;
      }

      .nxt1-logo-lg .nxt1-logo-placeholder-icon {
        width: 28px;
        height: 28px;
      }

      .nxt1-logo-button:hover:not(:disabled) .nxt1-logo-placeholder-icon {
        color: var(--nxt1-color-primary);
      }

      /* ============================================
         LOGO PREVIEW
         ============================================ */
      .nxt1-logo-preview {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: calc(var(--nxt1-borderRadius-lg) - 2px);
        overflow: hidden;
      }

      /* ============================================
         EDIT BADGE
         ============================================ */
      .nxt1-logo-edit-badge {
        position: absolute;
        bottom: -2px;
        right: -2px;
        width: 20px;
        height: 20px;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-onPrimary);
        border: 2px solid var(--nxt1-color-bg-primary);
        box-shadow: var(--nxt1-shadow-sm);
        opacity: 0;
        transition: opacity var(--nxt1-duration-fast) ease;
      }

      .nxt1-logo-sm .nxt1-logo-edit-badge {
        width: 18px;
        height: 18px;
      }

      .nxt1-logo-lg .nxt1-logo-edit-badge {
        width: 24px;
        height: 24px;
      }

      .nxt1-edit-icon {
        width: 12px;
        height: 12px;
      }

      .nxt1-logo-sm .nxt1-edit-icon {
        width: 10px;
        height: 10px;
      }

      .nxt1-logo-lg .nxt1-edit-icon {
        width: 14px;
        height: 14px;
      }

      .nxt1-logo-button:hover .nxt1-logo-edit-badge,
      .nxt1-logo-button:focus-visible .nxt1-logo-edit-badge {
        opacity: 1;
      }

      /* Always show on touch devices */
      @media (hover: none) {
        .nxt1-logo-button.has-logo .nxt1-logo-edit-badge {
          opacity: 1;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtTeamLogoPickerComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly loggingService = inject(NxtLoggingService);
  private readonly toast = inject(NxtToastService);

  /** Namespaced logger for this component */
  private readonly logger: ILogger = this.loggingService.child('TeamLogoPicker');

  /** Reference to the hidden file input element */
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  // ============================================
  // SIGNAL INPUTS (Angular 19+ pattern)
  // ============================================

  /** Current logo URL or data URI */
  readonly logoUrl = input<string | null>(null);

  /** Size variant (sm: 40px, md: 48px, lg: 64px) */
  readonly size = input<LogoPickerSize>('md');

  /** Whether interaction is disabled */
  readonly disabled = input<boolean>(false);

  /** Test ID for E2E testing */
  readonly testId = input<string>('team-logo-picker');

  // ============================================
  // SIGNAL OUTPUTS (Angular 19+ pattern)
  // ============================================

  /** Emits when logo changes (URL or null for removal) */
  readonly logoChange = output<string | null>();

  /** Emits when a file is selected from the web file picker */
  readonly fileSelected = output<File>();

  /** Emits when picker is clicked (for native photo picker integration) */
  readonly pickerClick = output<void>();

  // ============================================
  // CONFIGURATION
  // ============================================

  /** Accepted file types for input */
  readonly acceptedTypes = ACCEPTED_IMAGE_TYPES.join(',');

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Local logo preview (for when file is selected but not yet uploaded) */
  readonly localPreview = signal<string | null>(null);

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Current logo to display (local preview takes precedence) */
  readonly currentLogo = computed(() => this.localPreview() ?? this.logoUrl());

  /** Whether a logo is set */
  readonly hasLogo = computed(() => !!this.currentLogo());

  /** Whether running in browser (SSR safety) */
  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    // Sync local preview when logoUrl changes externally
    effect(() => {
      const url = this.logoUrl();
      if (url) {
        this.localPreview.set(null);
      }
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle logo button click
   */
  onLogoClick(): void {
    // Emit event for native photo picker (mobile)
    this.pickerClick.emit();

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

    this.logger.debug('Team logo selected', {
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
      this.localPreview.set(dataUrl);
      this.logoChange.emit(dataUrl);
      this.logger.debug('Team logo preview loaded');
    };
    reader.onerror = () => {
      this.logger.error('Failed to read team logo', reader.error, {
        fileName: file.name,
      });
      this.toast.error('Failed to load image preview');
    };
    reader.readAsDataURL(file);

    // Reset input to allow selecting same file again
    input.value = '';
  }

  /**
   * Set logo from external source (e.g., native photo picker)
   */
  setLogo(imageUrl: string): void {
    this.localPreview.set(imageUrl);
    this.logoChange.emit(imageUrl);
  }

  /**
   * Clear the current logo
   */
  clearLogo(): void {
    this.localPreview.set(null);
    this.logoChange.emit(null);
  }
}
