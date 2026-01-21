/**
 * @fileoverview OnboardingRoleSelectionComponent - Cross-Platform Role Selection
 * @module @nxt1/ui/onboarding
 *
 * Reusable role selection component for onboarding Step 1.
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
import { NxtIconComponent } from '../../shared/icon';
import { HapticButtonDirective } from '../../services/haptics';
import type { OnboardingUserType } from '@nxt1/core/api';
import type { RoleIconName } from '@nxt1/design-tokens/assets/icons';

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
  icon: RoleIconName;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Role options for onboarding Step 1.
 * Maps to OnboardingUserType from @nxt1/core/api.
 * Icons reference @nxt1/design-tokens ROLE_ICONS.
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
    description: 'High school, club, or college coach managing a team',
    icon: 'coach',
  },
  {
    type: 'parent',
    label: 'Parent / Guardian',
    description: 'Supporting an athlete on their recruiting journey',
    icon: 'parent',
  },
  {
    type: 'scout',
    label: 'Scout / Recruiter',
    description: 'Discovering and evaluating athletic talent',
    icon: 'scout',
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
       ROLE CARD - Matches auth page glassmorphic style
       ============================================ */
      .nxt1-role-card {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4);
        width: 100%;
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5);
        background: var(--nxt1-color-state-hover);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: left;
      }

      .nxt1-role-card:hover:not(.selected):not(:disabled) {
        border-color: var(--nxt1-color-border-strong);
        background: var(--nxt1-color-state-hover);
        transform: translateY(-1px);
      }

      .nxt1-role-card:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .nxt1-role-card.selected {
        border-color: var(--nxt1-color-primary, #ccff00);
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      .nxt1-role-card.selected .nxt1-role-icon {
        background: var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.2));
        border-color: var(--nxt1-color-alpha-primary30, rgba(204, 255, 0, 0.3));
        color: var(--nxt1-color-primary, #ccff00);
      }

      .nxt1-role-card.selected .nxt1-role-label {
        color: var(--nxt1-color-primary, #ccff00);
      }

      /* ============================================
       ROLE ICON
       ============================================ */
      .nxt1-role-icon {
        width: var(--nxt1-spacing-12);
        height: var(--nxt1-spacing-12);
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-state-hover);
        border: 1px solid var(--nxt1-color-border-default);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all 0.2s ease;
        color: var(--nxt1-color-text-secondary);
      }

      /* ============================================
       ROLE CONTENT
       ============================================ */
      .nxt1-role-content {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
        flex: 1;
        min-width: 0;
      }

      .nxt1-role-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        transition: color 0.2s ease;
      }

      .nxt1-role-description {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        line-height: 1.4;
      }

      /* ============================================
       CHECK INDICATOR
       ============================================ */
      .nxt1-role-check {
        width: var(--nxt1-spacing-6);
        height: var(--nxt1-spacing-6);
        border-radius: 50%;
        background: var(--nxt1-color-primary, #ccff00);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--nxt1-color-text-onPrimary, #000000);
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
