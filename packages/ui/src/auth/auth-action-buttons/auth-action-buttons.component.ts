/**
 * @fileoverview AuthActionButtonsComponent - Cross-Platform Auth Action Buttons
 * @module @nxt1/ui/auth
 *
 * Shared action buttons for email sign-in and team code entry.
 * Uses Ionic buttons for native mobile feel with design system styling.
 *
 * Features:
 * - Native platform feel on iOS/Android via Ionic
 * - SSR-safe with pre-hydration CSS fallbacks
 * - Professional inline SVG icons
 * - Loading state management
 * - Accessible with proper ARIA labels
 * - Configurable button visibility
 *
 * Usage:
 * ```html
 * <nxt1-auth-action-buttons
 *   [loading]="isLoading"
 *   [showTeamCode]="true"
 *   (emailClick)="onEmailClick()"
 *   (teamCodeClick)="onTeamCodeClick()"
 * />
 * ```
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton } from '@ionic/angular/standalone';
import { NxtIconComponent } from '../../components/icon';

@Component({
  selector: 'nxt1-auth-action-buttons',
  standalone: true,
  imports: [CommonModule, IonButton, NxtIconComponent],
  template: `
    <div class="nxt1-social-buttons" data-testid="auth-action-buttons">
      <!-- Continue with Email -->
      <ion-button
        fill="outline"
        class="nxt1-auth-btn nxt1-auth-btn--email"
        [disabled]="loading"
        (click)="onEmailClick()"
        aria-label="Continue with Email"
        data-testid="auth-btn-email"
      >
        <div class="btn-content">
          <nxt1-icon name="mail" size="20" class="btn-icon" aria-hidden="true" />
          <span class="btn-text">Continue with Email</span>
        </div>
      </ion-button>

      <!-- Have a Team Code? -->
      @if (showTeamCode) {
        <ion-button
          fill="clear"
          class="nxt1-auth-btn nxt1-auth-btn--team-code"
          [disabled]="loading"
          (click)="onTeamCodeClick()"
          aria-label="Enter team code"
          data-testid="auth-btn-team-code"
        >
          <div class="btn-content">
            <nxt1-icon name="lock" size="20" class="btn-icon" aria-hidden="true" />
            <span class="btn-text">Have a Team Code?</span>
          </div>
        </ion-button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .nxt1-social-buttons {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        width: 100%;
      }

      /* Base auth button - uses design system tokens */
      .nxt1-auth-btn {
        --background: var(--nxt1-color-surface-100);
        --background-hover: var(--nxt1-color-state-pressed);
        --background-activated: var(--nxt1-color-state-pressed);
        --background-focused: var(--nxt1-color-state-pressed);
        --border-color: var(--nxt1-color-border-default);
        --border-radius: var(--nxt1-borderRadius-lg);
        --border-width: 1px;
        --color: var(--nxt1-color-text-primary);
        --padding-start: var(--nxt1-spacing-4);
        --padding-end: var(--nxt1-spacing-4);
        --box-shadow: none;
        height: 52px;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        text-transform: none;
        letter-spacing: normal;
        margin: 0;
        --transition: all var(--nxt1-duration-normal) ease-out;
      }

      .nxt1-auth-btn::part(native) {
        transition: all var(--nxt1-duration-normal) ease-out;
      }

      .nxt1-auth-btn:hover::part(native) {
        transform: translateY(-1px);
      }

      .nxt1-auth-btn:active::part(native) {
        transform: translateY(0);
      }

      /* Button content wrapper - ensures horizontal layout */
      .btn-content {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-3);
        width: 100%;
      }

      /* Icon styling */
      .btn-icon {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }

      /* Email button hover */
      .nxt1-auth-btn--email:hover {
        --border-color: var(--nxt1-color-border-primary);
      }

      /* Team code button - dashed outline style */
      .nxt1-auth-btn--team-code {
        --background: transparent;
        --background-hover: var(--nxt1-color-state-hover);
        --border-style: dashed;
        --border-color: var(--nxt1-color-border-default);
        --color: var(--nxt1-color-text-secondary);
        height: 48px;
      }

      .nxt1-auth-btn--team-code:hover {
        --border-style: solid;
        --color: var(--nxt1-color-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthActionButtonsComponent {
  /** Whether buttons should be disabled (e.g., during loading) */
  @Input() loading = false;

  /** Whether to show the team code button */
  @Input() showTeamCode = true;

  /** Emitted when "Continue with Email" is clicked */
  @Output() emailClick = new EventEmitter<void>();

  /** Emitted when "Have a Team Code?" is clicked */
  @Output() teamCodeClick = new EventEmitter<void>();

  onEmailClick(): void {
    this.emailClick.emit();
  }

  onTeamCodeClick(): void {
    this.teamCodeClick.emit();
  }
}
