/**
 * @fileoverview NxtSheetFooterComponent — Standardised content sheet footer
 * @module @nxt1/ui/components/bottom-sheet
 * @version 1.0.0
 *
 * Reusable sticky-bottom action button for any bottom sheet or modal.
 * Renders a full-width primary CTA with:
 *   - Optional leading icon (via `NxtIconComponent`)
 *   - Loading spinner state with optional alternate label
 *   - `env(safe-area-inset-bottom)` padding on all platforms
 *   - Slot for additional content: `[sheetFooterBefore]` / `[sheetFooterAfter]`
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Usage:
 * ```html
 * <!-- Basic -->
 * <nxt1-sheet-footer
 *   label="Invite"
 *   icon="share"
 *   [loading]="isSharing()"
 *   loadingLabel="Opening..."
 *   (action)="onInvite()"
 * />
 *
 * <!-- With extra content above the button -->
 * <nxt1-sheet-footer label="Save" (action)="onSave()">
 *   <p sheetFooterBefore class="disclaimer">By continuing you agree to our Terms.</p>
 * </nxt1-sheet-footer>
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { IonRippleEffect, IonSpinner } from '@ionic/angular/standalone';
import { NxtIconComponent } from '../icon/icon.component';

@Component({
  selector: 'nxt1-sheet-footer',
  standalone: true,
  imports: [IonRippleEffect, IonSpinner, NxtIconComponent],
  template: `
    <div class="nxt1-sheet-footer">
      <!-- Optional slot: content above the button -->
      <ng-content select="[sheetFooterBefore]" />

      <button
        type="button"
        class="nxt1-sheet-footer__btn"
        [class.nxt1-sheet-footer__btn--loading]="loading()"
        [disabled]="loading() || disabled()"
        [attr.aria-label]="ariaLabel() || null"
        (click)="action.emit()"
      >
        <ion-ripple-effect />
        @if (loading()) {
          <ion-spinner name="crescent" class="nxt1-sheet-footer__spinner" aria-hidden="true" />
        } @else if (icon()) {
          <nxt1-icon [name]="icon()!" [size]="20" aria-hidden="true" />
        }
        <span class="nxt1-sheet-footer__label">
          {{ loading() ? loadingLabel() || label() : label() }}
        </span>
      </button>

      <!-- Optional slot: content below the button -->
      <ng-content select="[sheetFooterAfter]" />
    </div>
  `,
  styles: [
    `
      /* ================================================================
         NxtSheetFooterComponent — 100% design tokens, zero hardcoding
         ================================================================ */

      :host {
        display: block;
        flex-shrink: 0;
      }

      .nxt1-sheet-footer {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-5, 20px);
        padding-bottom: calc(var(--nxt1-spacing-4, 16px) + env(safe-area-inset-bottom, 0px));
        border-top: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-bg-primary);
      }

      .nxt1-sheet-footer__btn {
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
        width: 100%;
        height: 52px;
        border: none;
        border-radius: var(--nxt1-radius-xl, 16px);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        font-family: var(--nxt1-fontFamily-brand, system-ui, sans-serif);
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        letter-spacing: 0.01em;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition:
          opacity var(--nxt1-motion-duration-fast, 150ms) var(--nxt1-motion-easing-standard, ease),
          transform var(--nxt1-motion-duration-fast, 150ms) var(--nxt1-motion-easing-standard, ease);
      }

      .nxt1-sheet-footer__btn:active:not(:disabled) {
        transform: scale(0.98);
        opacity: 0.9;
      }

      .nxt1-sheet-footer__btn:disabled,
      .nxt1-sheet-footer__btn--loading {
        opacity: 0.65;
        cursor: not-allowed;
        pointer-events: none;
      }

      .nxt1-sheet-footer__label {
        font-weight: inherit;
        line-height: 1;
      }

      .nxt1-sheet-footer__spinner {
        --color: var(--nxt1-color-text-onPrimary);
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }

      /* ── REDUCED MOTION ── */

      @media (prefers-reduced-motion: reduce) {
        .nxt1-sheet-footer__btn {
          transition: none;
        }

        .nxt1-sheet-footer__btn:active:not(:disabled) {
          transform: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtSheetFooterComponent {
  /** Button label text. Required. */
  readonly label = input.required<string>();

  /** Optional icon name (from NxtIconComponent registry). */
  readonly icon = input<string | undefined>(undefined);

  /** Whether the button is in loading state (shows spinner). */
  readonly loading = input<boolean>(false);

  /** Whether the button is disabled (no loading). */
  readonly disabled = input<boolean>(false);

  /** Alternate label shown while loading. Falls back to `label`. */
  readonly loadingLabel = input<string | undefined>(undefined);

  /** Accessible label override. Defaults to `label`. */
  readonly ariaLabel = input<string | undefined>(undefined);

  /** Emitted when the CTA button is clicked (not fired when loading/disabled). */
  readonly action = output<void>();
}
