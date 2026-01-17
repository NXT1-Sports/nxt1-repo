/**
 * @fileoverview OnboardingStepCardComponent - Cross-Platform Step Container
 * @module @nxt1/ui/onboarding
 *
 * Reusable card container for onboarding step content.
 * Provides consistent styling and error message display.
 *
 * Features:
 * - Glass morphism styling matching auth shell
 * - Error message display
 * - Content projection for step-specific content
 * - Accessible error announcements
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-step-card [error]="error()">
 *   <nxt1-onboarding-role-selection ... />
 * </nxt1-onboarding-step-card>
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../shared/icon';

@Component({
  selector: 'nxt1-onboarding-step-card',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <div class="nxt1-onboarding-card">
      <!-- Step Content (projected) -->
      <ng-content></ng-content>

      <!-- Error Message -->
      @if (error) {
        <div class="nxt1-error-message" role="alert" data-testid="onboarding-error">
          <nxt1-icon name="alertCircle" [size]="20" />
          <span>{{ error }}</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       ONBOARDING CARD
       ============================================ */
      .nxt1-onboarding-card {
        width: 100%;
        background: var(--nxt1-color-surface-100, #1a1a1a);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-radius-xl, 16px);
        padding: 24px;
        backdrop-filter: blur(20px);
      }

      /* ============================================
       ERROR MESSAGE
       ============================================ */
      .nxt1-error-message {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 16px;
        padding: 12px;
        border-radius: 8px;
        background: var(--nxt1-color-errorBg, rgba(239, 68, 68, 0.1));
        color: var(--nxt1-color-errorLight, #f87171);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 14px;
      }

      .nxt1-error-message nxt1-icon {
        flex-shrink: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingStepCardComponent {
  /** Error message to display */
  @Input() error: string | null = null;
}
