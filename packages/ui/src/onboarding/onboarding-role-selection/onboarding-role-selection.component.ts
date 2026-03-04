/**
 * @fileoverview OnboardingRoleSelectionComponent - Cross-Platform Role Selection
 * @module @nxt1/ui/onboarding
 *
 * Reusable role selection component for onboarding (optional last step).
 * Uses shared constants from @nxt1/core and icons from @nxt1/design-tokens.
 *
 * Features:
 * - Platform-adaptive with Ionic components
 * - Accessible with ARIA labels
 * - Haptic feedback ready
 * - Test IDs for E2E testing
 * - Signal-based selected state
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-role-selection
 *   [selectedRole]="selectedRole()"
 *   [disabled]="isLoading()"
 *   (roleSelected)="onRoleSelect($event)"
 * />
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import { HapticButtonDirective } from '../../services/haptics';
import type { OnboardingUserType } from '@nxt1/core/api';
import type { IconName } from '@nxt1/design-tokens/assets/icons';

// ============================================
// TYPES
// ============================================

/** Role option configuration for display */
export interface RoleOption {
  /** Role type from @nxt1/core */
  type: OnboardingUserType;
  /** Display label */
  label: string;
  /** Description text */
  description: string;
  /** Icon name from @nxt1/design-tokens */
  icon: IconName;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Role options for onboarding (optional last step).
 * Maps to OnboardingUserType from @nxt1/core/api.
 * Icons reference @nxt1/design-tokens.
 *
 * 6 roles displayed during onboarding:
 * - athlete, coach, college-coach (includes scout), director,
 *   recruiting-service, parent
 */
export const ONBOARDING_ROLE_OPTIONS: readonly RoleOption[] = [
  {
    type: 'athlete',
    label: 'Athlete',
    description: 'High school, club, or college athlete',
    icon: 'athlete',
  },
  {
    type: 'coach',
    label: 'Coach',
    description: 'High school, JUCO, club, or travel coach',
    icon: 'clipboard',
  },
  {
    type: 'college-coach',
    label: 'College Coach / Scout',
    description: 'College coach or scout recruiting athletes',
    icon: 'college-coach',
  },
  {
    type: 'director',
    label: 'Director',
    description: 'Program director or administrator',
    icon: 'director',
  },
  {
    type: 'recruiting-service',
    label: 'Professional Service',
    description: 'Recruiting service or sports professional',
    icon: 'recruiting-service',
  },
  {
    type: 'parent',
    label: 'Parent / Guardian',
    description: 'Supporting an athlete',
    icon: 'parent',
  },
] as const;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-onboarding-role-selection',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, HapticButtonDirective],
  template: `
    <div class="nxt1-role-options" role="radiogroup" aria-label="Select your role">
      @for (role of roles; track role.type) {
        <button
          type="button"
          class="nxt1-role-card"
          [class.selected]="selectedRole === role.type"
          [disabled]="disabled"
          (click)="onRoleClick(role.type)"
          [attr.data-testid]="'onboarding-role-' + role.type"
          [attr.aria-pressed]="selectedRole === role.type"
          [attr.aria-label]="role.label + ': ' + role.description"
          role="radio"
          [attr.aria-checked]="selectedRole === role.type"
          nxtHaptic="selection"
        >
          <!-- Role Icon -->
          <div class="nxt1-role-icon">
            <nxt1-icon [name]="role.icon" [size]="24" />
          </div>

          <!-- Role Content -->
          <div class="nxt1-role-content">
            <span class="nxt1-role-label">{{ role.label }}</span>
            <span class="nxt1-role-description">{{ role.description }}</span>
          </div>

          <!-- Check Indicator -->
          @if (selectedRole === role.type) {
            <div class="nxt1-role-check">
              <nxt1-icon name="checkmark" [size]="14" />
            </div>
          }
        </button>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       ROLE OPTIONS CONTAINER
       ============================================ */
      .nxt1-role-options {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        width: 100%;
      }

      /* ============================================
       ROLE CARD - White base with gray hover
       ============================================ */
      .nxt1-role-card {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4, 16px);
        width: 100%;
        padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-5, 20px);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        text-align: left;
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-role-card:hover:not(.selected):not(:disabled) {
        border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
        background: var(--nxt1-color-surface-200);
        transform: translateY(-2px);
      }

      .nxt1-role-card:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .nxt1-role-card:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
      }

      .nxt1-role-card.selected {
        border-color: var(--nxt1-color-primary, #ccff00);
        background: var(--nxt1-color-primary, #ccff00);
      }

      .nxt1-role-card.selected .nxt1-role-icon {
        background: var(--nxt1-color-alpha-black20);
        border-color: transparent;
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
      }

      .nxt1-role-card.selected .nxt1-role-label {
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
      }

      .nxt1-role-card.selected .nxt1-role-description {
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
        opacity: 0.8;
      }

      /* ============================================
       ROLE ICON - White base with gray hover
       ============================================ */
      .nxt1-role-icon {
        width: var(--nxt1-spacing-12, 48px);
        height: var(--nxt1-spacing-12, 48px);
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.08));
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      /* ============================================
       ROLE CONTENT
       ============================================ */
      .nxt1-role-content {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1, 4px);
        flex: 1;
        min-width: 0;
      }

      .nxt1-role-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        transition: color var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
      }

      .nxt1-role-description {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        line-height: 1.4;
      }

      /* ============================================
       CHECK INDICATOR
       ============================================ */
      .nxt1-role-check {
        width: var(--nxt1-spacing-6, 24px);
        height: var(--nxt1-spacing-6, 24px);
        border-radius: 50%;
        background: var(--nxt1-color-primary, #ccff00);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--nxt1-color-text-onPrimary, #1a1a2e);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingRoleSelectionComponent {
  /** Currently selected role */
  @Input() selectedRole: OnboardingUserType | null = null;

  /** Whether interaction is disabled */
  @Input() disabled = false;

  /** Emits when a role is selected */
  @Output() roleSelected = new EventEmitter<OnboardingUserType>();

  /** Available role options */
  protected readonly roles = ONBOARDING_ROLE_OPTIONS;

  /**
   * Handle role card click
   */
  protected onRoleClick(type: OnboardingUserType): void {
    if (!this.disabled) {
      this.roleSelected.emit(type);
    }
  }
}
