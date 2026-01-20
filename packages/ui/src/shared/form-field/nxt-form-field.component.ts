/**
 * @fileoverview NxtFormFieldComponent - Cross-Platform Form Field Container
 * @module @nxt1/ui/shared
 * @version 1.0.0
 *
 * Reusable form field wrapper with label and error support.
 * Provides consistent spacing, label styling, and error display.
 *
 * Features:
 * - Consistent label styling across all forms
 * - Optional required indicator
 * - Error message display
 * - Design token based styling
 * - Content projection for inputs
 *
 * Usage:
 * ```html
 * <nxt1-form-field label="First Name" [required]="true" [error]="nameError()">
 *   <ion-input [value]="name" />
 * </nxt1-form-field>
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-form-field',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="nxt1-form-field" [attr.data-testid]="testId()">
      @if (label()) {
        <label class="nxt1-form-label" [attr.for]="inputId()">
          {{ label() }}
          @if (required()) {
            <span class="nxt1-required" aria-hidden="true">*</span>
          }
          @if (optional()) {
            <span class="nxt1-optional">(Optional)</span>
          }
        </label>
      }

      <div class="nxt1-form-control">
        <ng-content />
      </div>

      @if (error()) {
        <span class="nxt1-form-error" role="alert" [attr.id]="errorId()">
          {{ error() }}
        </span>
      }

      @if (hint() && !error()) {
        <span class="nxt1-form-hint" [attr.id]="hintId()">
          {{ hint() }}
        </span>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* ============================================
       FORM FIELD CONTAINER
       ============================================ */
      .nxt1-form-field {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1-5);
      }

      /* ============================================
       LABEL
       ============================================ */
      .nxt1-form-label {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 13px;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .nxt1-required {
        color: var(--nxt1-color-error);
        margin-left: 2px;
      }

      .nxt1-optional {
        font-weight: 400;
        text-transform: none;
        color: var(--nxt1-color-text-tertiary);
        font-size: 11px;
        margin-left: 4px;
      }

      /* ============================================
       FORM CONTROL CONTAINER
       ============================================ */
      .nxt1-form-control {
        display: flex;
        flex-direction: column;
        width: 100%;
      }

      /* ============================================
       ERROR MESSAGE
       ============================================ */
      .nxt1-form-error {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 12px;
        color: var(--nxt1-color-error);
        padding-left: 2px;
      }

      /* ============================================
       HINT TEXT
       ============================================ */
      .nxt1-form-hint {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary);
        padding-left: 2px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtFormFieldComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Field label text */
  readonly label = input<string>('');

  /** Whether the field is required */
  readonly required = input<boolean>(false);

  /** Whether to show "(Optional)" text */
  readonly optional = input<boolean>(false);

  /** Error message to display */
  readonly error = input<string | null>(null);

  /** Hint text to display when no error */
  readonly hint = input<string | null>(null);

  /** ID for the input element (for label association) */
  readonly inputId = input<string | null>(null);

  /** Test ID for E2E testing */
  readonly testId = input<string | null>(null);

  // ============================================
  // COMPUTED IDS
  // ============================================

  /** Generate error ID for aria-describedby */
  errorId(): string | null {
    const id = this.inputId();
    return id ? `${id}-error` : null;
  }

  /** Generate hint ID for aria-describedby */
  hintId(): string | null {
    const id = this.inputId();
    return id ? `${id}-hint` : null;
  }
}
