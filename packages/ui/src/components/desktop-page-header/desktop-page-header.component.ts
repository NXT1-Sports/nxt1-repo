/**
 * @fileoverview NxtDesktopPageHeaderComponent - Desktop Page Title Header
 * @module @nxt1/ui/components/desktop-page-header
 * @version 1.0.0
 *
 * Reusable desktop page header matching the Billing & Usage design pattern.
 * Renders a large title + subtitle with an optional back arrow and optional
 * trailing action button (e.g., "How it works").
 *
 * SSR-safe, zero Ionic dependencies — designed for web desktop layouts where
 * the mobile page-header is hidden and the page needs its own branded heading.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <!-- Simple title + subtitle -->
 * <nxt1-desktop-page-header
 *   title="Billing & Usage"
 *   subtitle="Manage your billing, usage, and payment details."
 * />
 *
 * <!-- With back arrow -->
 * <nxt1-desktop-page-header
 *   title="Edit Profile"
 *   subtitle="Update your personal information."
 *   [showBack]="true"
 *   (back)="navigateBack()"
 * />
 *
 * <!-- With trailing action -->
 * <nxt1-desktop-page-header
 *   title="Billing & Usage"
 *   subtitle="Manage your billing, usage, and payment details."
 *   actionLabel="How it works"
 *   actionIcon="help-circle-outline"
 *   (actionClick)="showHelp()"
 * />
 *
 * <!-- With projected trailing content -->
 * <nxt1-desktop-page-header
 *   title="Settings"
 *   subtitle="Manage your account preferences."
 * >
 *   <button class="custom-btn">Custom Action</button>
 * </nxt1-desktop-page-header>
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtBackButtonComponent } from '../back-button';

@Component({
  selector: 'nxt1-desktop-page-header',
  standalone: true,
  imports: [CommonModule, NxtBackButtonComponent],
  template: `
    <header class="desktop-page-header" role="banner">
      <div class="header-row">
        <!-- Optional Back Arrow -->
        @if (showBack()) {
          <nxt1-back-button
            class="header-back"
            size="md"
            variant="ghost"
            [ariaLabel]="backAriaLabel()"
            (backClick)="onBack()"
          />
        }

        <!-- Title + Subtitle -->
        <div class="header-text">
          <h1 class="header-title">{{ title() }}</h1>
          @if (subtitle()) {
            <p class="header-subtitle">{{ subtitle() }}</p>
          }
        </div>

        <!-- Trailing Action Button (when actionLabel is set) -->
        @if (actionLabel()) {
          <button type="button" class="header-action-btn" (click)="onActionClick()">
            @if (actionIcon()) {
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                [attr.aria-hidden]="true"
              >
                @switch (actionIcon()) {
                  @case ('help-circle-outline') {
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  }
                  @case ('settings-outline') {
                    <circle cx="12" cy="12" r="3" />
                    <path
                      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                    />
                  }
                  @case ('information-circle-outline') {
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  }
                  @default {
                    <!-- Fallback: generic circle icon -->
                    <circle cx="12" cy="12" r="10" />
                  }
                }
              </svg>
            }
            <span>{{ actionLabel() }}</span>
          </button>
        }

        <!-- Projected trailing content (alternative to actionLabel) -->
        <ng-content />
      </div>
    </header>
  `,
  styles: [
    `
      /* ============================================
         DESKTOP PAGE HEADER
         Matches Billing & Usage desktop title style.
         SSR-safe, zero Ionic dependencies.
         ============================================ */

      :host {
        display: block;
      }

      .desktop-page-header {
        margin-bottom: var(--nxt1-spacing-6);
        padding-bottom: var(--nxt1-spacing-6);
        border-bottom: 1px solid var(--nxt1-color-border-default);
      }

      .header-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: var(--nxt1-spacing-4);
      }

      /* Back button alignment */
      .header-back {
        flex-shrink: 0;
        margin-top: var(--nxt1-spacing-1);
      }

      .header-text {
        flex: 1;
        min-width: 0;
      }

      .header-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-0-5, 2px) 0;
        line-height: var(--nxt1-lineHeight-tight);
      }

      .header-subtitle {
        font-size: var(--nxt1-fontSize-base);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        line-height: var(--nxt1-lineHeight-normal);
      }

      /* ==============================
         TRAILING ACTION BUTTON
         Matches usage shell help-btn style
         ============================== */

      .header-action-btn {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1-5);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        color: var(--nxt1-color-text-secondary);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out);
        white-space: nowrap;
        flex-shrink: 0;
      }

      .header-action-btn:hover {
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-border-default);
      }

      .header-action-btn:active {
        transform: scale(0.98);
      }

      .header-action-btn:focus-visible {
        outline: 2px solid var(--nxt1-color-focus-ring, var(--nxt1-color-primary, #ccff00));
        outline-offset: 2px;
      }

      .header-action-btn svg {
        flex-shrink: 0;
      }

      /* ==============================
         RESPONSIVE
         ============================== */

      @media (max-width: 640px) {
        .header-title {
          font-size: var(--nxt1-fontSize-xl);
        }

        .header-subtitle {
          font-size: var(--nxt1-fontSize-sm);
        }

        .header-action-btn span {
          /* Hide label on very small screens, show icon only */
          display: none;
        }

        .header-action-btn {
          padding: var(--nxt1-spacing-2);
        }
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .header-action-btn {
          transition: none;
        }

        .header-action-btn:active {
          transform: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtDesktopPageHeaderComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Page title (required) */
  readonly title = input.required<string>();

  /** Optional subtitle shown below the title */
  readonly subtitle = input<string>('');

  /** Show a back arrow before the title */
  readonly showBack = input<boolean>(false);

  /** ARIA label for back button */
  readonly backAriaLabel = input<string>('Go back');

  /** Label for the trailing action button (omit to hide) */
  readonly actionLabel = input<string>('');

  /**
   * Icon name for the trailing action button.
   * Supports: 'help-circle-outline', 'settings-outline', 'information-circle-outline'.
   * Falls back to a generic circle for unknown values.
   */
  readonly actionIcon = input<string>('');

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when the back arrow is clicked */
  readonly back = output<void>();

  /** Emitted when the trailing action button is clicked */
  readonly actionClick = output<void>();

  // ============================================
  // HANDLERS
  // ============================================

  onBack(): void {
    this.back.emit();
  }

  onActionClick(): void {
    this.actionClick.emit();
  }
}
