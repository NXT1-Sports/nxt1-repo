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

@Component({
  selector: 'nxt1-auth-action-buttons',
  standalone: true,
  imports: [CommonModule, IonButton],
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
          <svg
            class="btn-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
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
            <svg
              class="btn-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
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
        gap: 0.75rem;
        width: 100%;
      }

      /* Base auth button - uses design system tokens */
      .nxt1-auth-btn {
        --background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.04));
        --background-hover: var(--nxt1-color-state-pressed, rgba(255, 255, 255, 0.08));
        --background-activated: var(--nxt1-color-state-pressed, rgba(255, 255, 255, 0.08));
        --background-focused: var(--nxt1-color-state-pressed, rgba(255, 255, 255, 0.08));
        --border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        --border-radius: var(--nxt1-radius-default, 8px);
        --border-width: 1px;
        --color: var(--nxt1-color-text-primary, #ffffff);
        --padding-start: 1rem;
        --padding-end: 1rem;
        --box-shadow: none;
        height: 52px;
        font-family: var(--nxt1-fontFamily-brand, -apple-system, BlinkMacSystemFont, sans-serif);
        font-size: 1rem;
        font-weight: 600;
        text-transform: none;
        letter-spacing: normal;
        margin: 0;
        --transition: all var(--nxt1-duration-normal, 200ms) ease-out;
      }

      .nxt1-auth-btn::part(native) {
        transition: all 200ms ease-out;
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
        gap: 0.75rem;
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
        --border-color: var(--auth-border-focus, rgba(204, 255, 0, 0.5));
      }

      /* Team code button - dashed outline style */
      .nxt1-auth-btn--team-code {
        --background: transparent;
        --background-hover: var(--auth-bg-input, rgba(255, 255, 255, 0.04));
        --border-style: dashed;
        --border-color: var(--auth-border-hover, rgba(255, 255, 255, 0.15));
        --color: var(--auth-text-secondary, rgba(255, 255, 255, 0.7));
        height: 48px;
      }

      .nxt1-auth-btn--team-code:hover {
        --border-style: solid;
        --color: var(--auth-primary, #ccff00);
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
