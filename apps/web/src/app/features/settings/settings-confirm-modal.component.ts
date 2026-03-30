import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NxtModalHeaderComponent } from '@nxt1/ui/components/overlay/modal-header.component';

/**
 * Settings Confirm Modal — Web Desktop
 *
 * Matches the shared web modal pattern used by Connected Accounts,
 * QR Code, and Edit Profile modals. Uses NxtModalHeaderComponent for
 * header chrome and mirrors NxtModalFooterComponent styling for the
 * two-button confirm/cancel footer.
 *
 * Opened via NxtOverlayService — never used directly in templates.
 *
 * ⭐ WEB DESKTOP ONLY ⭐
 */
@Component({
  selector: 'app-settings-confirm-modal',
  standalone: true,
  imports: [NxtModalHeaderComponent],
  template: `
    <div class="nxt1-confirm-modal">
      <nxt1-modal-header
        [title]="title()"
        [icon]="icon()"
        [showIcon]="!!icon()"
        iconShape="rounded"
        [showBorder]="true"
        (closeModal)="onCancel()"
      />

      <div class="nxt1-confirm-modal__body">
        @if (message()) {
          <p class="nxt1-confirm-modal__message">{{ message() }}</p>
        }
      </div>

      <div class="nxt1-confirm-modal__footer">
        <button
          type="button"
          class="nxt1-confirm-modal__btn nxt1-confirm-modal__btn--secondary"
          (click)="onCancel()"
        >
          {{ cancelText() }}
        </button>

        <button
          type="button"
          class="nxt1-confirm-modal__btn"
          [class.nxt1-confirm-modal__btn--primary]="!destructive()"
          [class.nxt1-confirm-modal__btn--destructive]="destructive()"
          (click)="onConfirm()"
        >
          {{ confirmText() }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      /* ================================================================
         Settings Confirm Modal
         Matches the shared NxtOverlayService modal pattern.
         No custom background — inherits overlay panel surface.
         Footer mirrors NxtModalFooterComponent design tokens.
         ================================================================ */

      :host {
        display: block;
        width: 100%;
        height: 100%;
      }

      .nxt1-confirm-modal {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }

      /* ── BODY (scrollable if content overflows) ── */
      .nxt1-confirm-modal__body {
        flex: 1;
        overflow-y: auto;
        padding: var(--nxt1-spacing-5, 20px);
      }

      .nxt1-confirm-modal__message {
        margin: 0;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        font-family: var(--nxt1-fontFamily-brand, system-ui, sans-serif);
        font-size: var(--nxt1-fontSize-base, 1rem);
        line-height: 1.6;
      }

      /* ── FOOTER (mirrors NxtModalFooterComponent chrome) ── */
      .nxt1-confirm-modal__footer {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-5, 20px);
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        flex-shrink: 0;
      }

      /* ── BUTTON BASE (matches NxtModalFooterComponent btn) ── */
      .nxt1-confirm-modal__btn {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
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

      /* ── SECONDARY VARIANT ── */
      .nxt1-confirm-modal__btn--secondary {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-primary, #fff);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .nxt1-confirm-modal__btn--secondary:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
      }

      /* ── PRIMARY VARIANT ── */
      .nxt1-confirm-modal__btn--primary {
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
      }

      .nxt1-confirm-modal__btn--primary:hover {
        opacity: 0.92;
      }

      /* ── DESTRUCTIVE VARIANT ── */
      .nxt1-confirm-modal__btn--destructive {
        background: var(--nxt1-color-error, #ff4444);
        color: #fff;
      }

      .nxt1-confirm-modal__btn--destructive:hover {
        opacity: 0.88;
      }

      /* ── STATES ── */
      .nxt1-confirm-modal__btn:active {
        transform: scale(0.98);
        opacity: 0.9;
      }

      .nxt1-confirm-modal__btn:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      /* ── REDUCED MOTION ── */
      @media (prefers-reduced-motion: reduce) {
        .nxt1-confirm-modal__btn {
          transition: none;
        }

        .nxt1-confirm-modal__btn:active {
          transform: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsConfirmModalComponent {
  readonly title = input.required<string>();
  readonly message = input<string>('');
  readonly confirmText = input<string>('Confirm');
  readonly cancelText = input<string>('Cancel');
  readonly destructive = input(false);
  readonly icon = input<string>();

  readonly close = output<{ confirmed: boolean }>();

  protected onCancel(): void {
    this.close.emit({ confirmed: false });
  }

  protected onConfirm(): void {
    this.close.emit({ confirmed: true });
  }
}
