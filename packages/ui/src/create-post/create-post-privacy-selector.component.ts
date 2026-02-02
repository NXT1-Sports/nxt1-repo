/**
 * @fileoverview Create Post Privacy Selector Component
 * @module @nxt1/ui/create-post
 * @version 1.0.0
 *
 * Privacy level selector with bottom sheet on mobile.
 * Displays current privacy level and allows selection.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Current privacy display with icon
 * - Bottom sheet/dropdown for selection
 * - Recommended privacy highlight
 * - Haptic feedback
 * - Accessibility support
 *
 * @example
 * ```html
 * <nxt1-create-post-privacy-selector
 *   [privacy]="currentPrivacy()"
 *   (privacyChange)="onPrivacyChange($event)"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  globeOutline,
  peopleOutline,
  shieldOutline,
  schoolOutline,
  lockClosedOutline,
  chevronDownOutline,
  checkmarkOutline,
} from 'ionicons/icons';
import { type PostPrivacy, PRIVACY_OPTIONS } from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';

// Register icons
addIcons({
  'globe-outline': globeOutline,
  'people-outline': peopleOutline,
  'shield-outline': shieldOutline,
  'school-outline': schoolOutline,
  'lock-closed-outline': lockClosedOutline,
  'chevron-down-outline': chevronDownOutline,
  'checkmark-outline': checkmarkOutline,
});

@Component({
  selector: 'nxt1-create-post-privacy-selector',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect],
  template: `
    <div class="privacy-selector">
      <!-- Current privacy button -->
      <button
        type="button"
        class="privacy-trigger"
        [class.privacy-trigger--open]="isOpen()"
        (click)="toggleDropdown()"
        [attr.aria-expanded]="isOpen()"
        aria-haspopup="listbox"
        aria-label="Select post privacy"
      >
        <ion-ripple-effect></ion-ripple-effect>

        <div class="privacy-trigger__content">
          <ion-icon [name]="currentIcon()"></ion-icon>
          <span class="privacy-trigger__label">{{ currentLabel() }}</span>
        </div>

        <ion-icon
          name="chevron-down-outline"
          class="privacy-trigger__chevron"
          [class.privacy-trigger__chevron--rotated]="isOpen()"
        ></ion-icon>
      </button>

      <!-- Dropdown menu -->
      @if (isOpen()) {
        <div class="privacy-dropdown" role="listbox" [attr.aria-label]="'Privacy options'">
          <!-- Backdrop -->
          <div
            class="privacy-dropdown__backdrop"
            (click)="closeDropdown()"
            aria-hidden="true"
          ></div>

          <!-- Options panel -->
          <div class="privacy-dropdown__panel">
            <div class="privacy-dropdown__header">
              <span class="privacy-dropdown__title">Who can see your post?</span>
            </div>

            <div class="privacy-dropdown__options">
              @for (option of privacyOptions; track option.id) {
                <button
                  type="button"
                  class="privacy-option"
                  [class.privacy-option--selected]="privacy() === option.id"
                  [class.privacy-option--recommended]="option.recommended"
                  (click)="selectPrivacy(option.id)"
                  role="option"
                  [attr.aria-selected]="privacy() === option.id"
                >
                  <ion-ripple-effect></ion-ripple-effect>

                  <div class="privacy-option__icon">
                    <ion-icon [name]="option.icon"></ion-icon>
                  </div>

                  <div class="privacy-option__content">
                    <span class="privacy-option__label">
                      {{ option.label }}
                      @if (option.recommended) {
                        <span class="privacy-option__badge">Recommended</span>
                      }
                    </span>
                    <span class="privacy-option__description">{{ option.description }}</span>
                  </div>

                  @if (privacy() === option.id) {
                    <div class="privacy-option__check">
                      <ion-icon name="checkmark-outline"></ion-icon>
                    </div>
                  }
                </button>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         PRIVACY SELECTOR - Theme-aware Design
         ============================================ */

      :host {
        display: inline-block;
        position: relative;
      }

      .privacy-selector {
        position: relative;
      }

      /* ============================================
         TRIGGER BUTTON
         ============================================ */

      .privacy-trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 12px;
        min-width: 140px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-radius-lg, 12px);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        position: relative;
        overflow: hidden;
        -webkit-tap-highlight-color: transparent;
      }

      .privacy-trigger:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
      }

      .privacy-trigger--open {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
        border-color: var(--nxt1-color-primary, #ccff00);
      }

      .privacy-trigger__content {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .privacy-trigger__content ion-icon {
        font-size: 18px;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .privacy-trigger__label {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .privacy-trigger__chevron {
        font-size: 16px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        transition: transform var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
      }

      .privacy-trigger__chevron--rotated {
        transform: rotate(180deg);
      }

      /* ============================================
         DROPDOWN
         ============================================ */

      .privacy-dropdown {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: flex-end;
        justify-content: center;
      }

      .privacy-dropdown__backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        animation: backdrop-fade-in 0.2s ease-out;
      }

      .privacy-dropdown__panel {
        position: relative;
        width: 100%;
        max-width: 400px;
        max-height: 60vh;
        background: var(--nxt1-color-surface-elevated, #1a1a1a);
        border-radius: var(--nxt1-radius-2xl, 24px) var(--nxt1-radius-2xl, 24px) 0 0;
        overflow: hidden;
        animation: panel-slide-up 0.3s ease-out;
        padding-bottom: env(safe-area-inset-bottom, 0);
      }

      @media (min-width: 768px) {
        .privacy-dropdown {
          position: absolute;
          inset: auto;
          top: calc(100% + 8px);
          left: 0;
          align-items: flex-start;
        }

        .privacy-dropdown__backdrop {
          display: none;
        }

        .privacy-dropdown__panel {
          border-radius: var(--nxt1-radius-xl, 16px);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          max-width: 280px;
          animation: dropdown-enter 0.2s ease-out;
        }
      }

      .privacy-dropdown__header {
        padding: 16px 20px 12px;
        border-bottom: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .privacy-dropdown__title {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .privacy-dropdown__options {
        padding: 8px 0;
        overflow-y: auto;
      }

      /* ============================================
         OPTION BUTTON
         ============================================ */

      .privacy-option {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 14px 20px;
        background: transparent;
        border: none;
        cursor: pointer;
        transition: background var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        position: relative;
        overflow: hidden;
        text-align: left;
        -webkit-tap-highlight-color: transparent;
      }

      .privacy-option:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      }

      .privacy-option--selected {
        background: var(--nxt1-color-alpha-primary6, rgba(204, 255, 0, 0.06));
      }

      .privacy-option--selected:hover {
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      .privacy-option__icon {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
        border-radius: 50%;
        flex-shrink: 0;
      }

      .privacy-option__icon ion-icon {
        font-size: 20px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .privacy-option--selected .privacy-option__icon {
        background: var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.2));
      }

      .privacy-option--selected .privacy-option__icon ion-icon {
        color: var(--nxt1-color-primary, #ccff00);
      }

      .privacy-option__content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .privacy-option__label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .privacy-option--selected .privacy-option__label {
        color: var(--nxt1-color-primary, #ccff00);
      }

      .privacy-option__badge {
        padding: 2px 8px;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: 600;
        color: var(--nxt1-color-success, #22c55e);
        background: var(--nxt1-color-alpha-success10, rgba(34, 197, 94, 0.1));
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      .privacy-option__description {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .privacy-option__check {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .privacy-option__check ion-icon {
        font-size: 20px;
        color: var(--nxt1-color-primary, #ccff00);
      }

      /* ============================================
         ANIMATIONS
         ============================================ */

      @keyframes backdrop-fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes panel-slide-up {
        from {
          transform: translateY(100%);
        }
        to {
          transform: translateY(0);
        }
      }

      @keyframes dropdown-enter {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ============================================
         REDUCED MOTION
         ============================================ */

      @media (prefers-reduced-motion: reduce) {
        .privacy-dropdown__backdrop,
        .privacy-dropdown__panel {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePostPrivacySelectorComponent {
  private readonly haptics = inject(HapticsService);

  /** Current privacy setting */
  readonly privacy = input<PostPrivacy>('public');

  /** Emitted when privacy selection changes */
  readonly privacyChange = output<PostPrivacy>();

  /** Expose privacy options for template */
  protected readonly privacyOptions = PRIVACY_OPTIONS;

  /** Whether dropdown is open */
  protected readonly isOpen = signal(false);

  /** Current privacy option */
  private readonly currentOption = computed(() => {
    const current = this.privacy();
    return PRIVACY_OPTIONS.find((opt) => opt.id === current) ?? PRIVACY_OPTIONS[0];
  });

  /** Current privacy label */
  protected readonly currentLabel = computed(() => this.currentOption().label);

  /** Current privacy icon */
  protected readonly currentIcon = computed(() => this.currentOption().icon);

  /**
   * Toggle dropdown visibility.
   */
  protected async toggleDropdown(): Promise<void> {
    const newState = !this.isOpen();
    this.isOpen.set(newState);
    await this.haptics.impact('light');
  }

  /**
   * Close dropdown.
   */
  protected closeDropdown(): void {
    this.isOpen.set(false);
  }

  /**
   * Select a privacy option.
   */
  protected async selectPrivacy(privacy: PostPrivacy): Promise<void> {
    if (privacy !== this.privacy()) {
      this.privacyChange.emit(privacy);
      await this.haptics.selection();
    }
    this.closeDropdown();
  }
}
