/**
 * @fileoverview NxtModalFooterComponent — Standardized web modal footer
 * @module @nxt1/ui/components/overlay
 * @version 1.0.0
 *
 * A reusable sticky-bottom action button for web overlays.
 * The web equivalent of `NxtSheetFooterComponent` on mobile — provides
 * a consistent, full-width CTA footer chrome across all web modal surfaces.
 *
 * Renders a full-width primary CTA with:
 *   - Optional leading icon (via `NxtIconComponent`)
 *   - CSS loading spinner state with optional alternate label
 *   - Variant support: primary (default), secondary, destructive
 *   - Slot for additional content: `[modalFooterBefore]` / `[modalFooterAfter]`
 *
 * ⭐ WEB OVERLAY ONLY — Mobile uses NxtSheetFooterComponent ⭐
 * No Ionic dependencies. No safe-area-inset-bottom (web desktop).
 *
 * Usage:
 * ```html
 * <!-- Basic primary CTA -->
 * <nxt1-modal-footer
 *   label="Save Changes"
 *   icon="checkmark"
 *   [loading]="isSaving()"
 *   loadingLabel="Saving..."
 *   (action)="onSave()"
 * />
 *
 * <!-- Destructive variant with disclaimer above -->
 * <nxt1-modal-footer
 *   label="Delete Account"
 *   variant="destructive"
 *   (action)="onDelete()"
 * >
 *   <p modalFooterBefore class="disclaimer">This action cannot be undone.</p>
 * </nxt1-modal-footer>
 *
 * <!-- Secondary variant -->
 * <nxt1-modal-footer
 *   label="Cancel"
 *   variant="secondary"
 *   (action)="onCancel()"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { NxtIconComponent } from '../icon/icon.component';

/** Visual variant of the modal footer CTA button. */
export type ModalFooterVariant = 'primary' | 'secondary' | 'destructive';

@Component({
  selector: 'nxt1-modal-footer',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div class="nxt1-modal-footer">
      <!-- Optional slot: content above the button -->
      <ng-content select="[modalFooterBefore]" />

      <button
        type="button"
        class="nxt1-modal-footer__btn"
        [class.nxt1-modal-footer__btn--primary]="variant() === 'primary'"
        [class.nxt1-modal-footer__btn--secondary]="variant() === 'secondary'"
        [class.nxt1-modal-footer__btn--destructive]="variant() === 'destructive'"
        [class.nxt1-modal-footer__btn--loading]="loading()"
        [disabled]="loading() || disabled()"
        [attr.aria-label]="ariaLabel() || null"
        (click)="action.emit()"
      >
        @if (loading()) {
          <span class="nxt1-modal-footer__spinner" aria-hidden="true"></span>
        } @else if (icon()) {
          <nxt1-icon [name]="icon()!" [size]="20" aria-hidden="true" />
        }
        <span class="nxt1-modal-footer__label">
          {{ loading() ? loadingLabel() || label() : label() }}
        </span>
      </button>

      <!-- Optional slot: content below the button -->
      <ng-content select="[modalFooterAfter]" />
    </div>
  `,
  styles: [
    `
      /* ================================================================
         NxtModalFooterComponent — 100% design tokens, zero hardcoding
         Web-only equivalent of NxtSheetFooterComponent.
         No Ionic. No safe-area-inset-bottom.
         ================================================================ */

      :host {
        display: block;
        flex-shrink: 0;
      }

      .nxt1-modal-footer {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-5, 20px);
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-bg-primary);
      }

      /* ── BUTTON BASE ── */
      .nxt1-modal-footer__btn {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
        width: 100%;
        height: 52px;
        border: none;
        border-radius: var(--nxt1-radius-xl, 16px);
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

      /* ── PRIMARY VARIANT (default) ── */
      .nxt1-modal-footer__btn--primary {
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
      }

      .nxt1-modal-footer__btn--primary:hover:not(:disabled) {
        opacity: 0.92;
      }

      /* ── SECONDARY VARIANT ── */
      .nxt1-modal-footer__btn--secondary {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-primary, #fff);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .nxt1-modal-footer__btn--secondary:hover:not(:disabled) {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
      }

      /* ── DESTRUCTIVE VARIANT ── */
      .nxt1-modal-footer__btn--destructive {
        background: var(--nxt1-color-error, #ff4444);
        color: #fff;
      }

      .nxt1-modal-footer__btn--destructive:hover:not(:disabled) {
        opacity: 0.88;
      }

      /* ── STATES ── */
      .nxt1-modal-footer__btn:active:not(:disabled) {
        transform: scale(0.98);
        opacity: 0.9;
      }

      .nxt1-modal-footer__btn:disabled,
      .nxt1-modal-footer__btn--loading {
        opacity: 0.65;
        cursor: not-allowed;
        pointer-events: none;
      }

      .nxt1-modal-footer__btn:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .nxt1-modal-footer__label {
        font-weight: inherit;
        line-height: 1;
      }

      /* ── CSS LOADING SPINNER (no Ionic) ── */
      .nxt1-modal-footer__spinner {
        display: inline-block;
        width: 18px;
        height: 18px;
        border: 2px solid rgba(currentcolor, 0.3);
        border-top-color: currentcolor;
        border-radius: 50%;
        animation: nxt1ModalFooterSpin 0.7s linear infinite;
        flex-shrink: 0;
      }

      @keyframes nxt1ModalFooterSpin {
        to {
          transform: rotate(360deg);
        }
      }

      /* ── REDUCED MOTION ── */
      @media (prefers-reduced-motion: reduce) {
        .nxt1-modal-footer__btn {
          transition: none;
        }

        .nxt1-modal-footer__btn:active:not(:disabled) {
          transform: none;
        }

        .nxt1-modal-footer__spinner {
          animation: none;
          opacity: 0.7;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtModalFooterComponent {
  /** Button label text. Required. */
  readonly label = input.required<string>();

  /** Optional icon name (from NxtIconComponent registry). */
  readonly icon = input<string | undefined>(undefined);

  /** Whether the button is in loading state (shows spinner, disables click). */
  readonly loading = input<boolean>(false);

  /** Whether the button is disabled (no loading state). */
  readonly disabled = input<boolean>(false);

  /** Alternate label shown while loading. Falls back to `label`. */
  readonly loadingLabel = input<string | undefined>(undefined);

  /** Accessible label override. Defaults to `label`. */
  readonly ariaLabel = input<string | undefined>(undefined);

  /**
   * Visual variant of the button.
   * - `primary` (default) — brand accent color, primary action
   * - `secondary` — muted surface color, secondary action
   * - `destructive` — error red, irreversible actions
   */
  readonly variant = input<ModalFooterVariant>('primary');

  /** Emitted when the CTA button is clicked (not fired when loading/disabled). */
  readonly action = output<void>();
}
