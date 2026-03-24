/**
 * @fileoverview NxtModalHeaderComponent — Standardized web modal header
 * @module @nxt1/ui/components/overlay
 * @version 1.0.0
 *
 * A reusable header for web overlays opened via `NxtOverlayService`.
 * The web equivalent of `NxtSheetHeaderComponent` on mobile — provides
 * a consistent, polished header chrome across all web modal surfaces.
 *
 * Layout Variants:
 * 1. **Standard** (closePosition='right', default):
 *    `[icon?] [subtitle + title] ——— [action?] [close]`
 *
 * 2. **Close-left** (closePosition='left'):
 *    `[close] [icon?] [subtitle + title ———] [action?]`
 *
 * 3. **No close** (closePosition='none'):
 *    `[icon?] [subtitle + title ———] [action?]`
 *
 * Features:
 * - Theme-aware via NXT1 design tokens (dark/light/sport themes)
 * - Configurable icon (circle or rounded-rect shape)
 * - Optional Agent X brand mark
 * - Content projection slot for right-side actions (Save, Reset, etc.)
 * - Optional subtitle label displayed above title
 * - data-testid support for E2E testing
 * - Keyboard accessible (aria-label, button semantics)
 * - No safe-area-inset — web desktop only (no notch/home bar)
 *
 * Usage:
 * ```html
 * <!-- Standard: title on left, close on right -->
 * <nxt1-modal-header
 *   title="Edit Profile"
 *   (closeModal)="close()"
 * />
 *
 * <!-- With icon and subtitle label -->
 * <nxt1-modal-header
 *   title="Activity Log"
 *   subtitle="Operations"
 *   icon="time"
 *   [showIcon]="true"
 *   (closeModal)="close()"
 * />
 *
 * <!-- Close on left with save action on right -->
 * <nxt1-modal-header
 *   title="Edit Profile"
 *   closePosition="left"
 *   (closeModal)="close()"
 * >
 *   <button modalHeaderAction (click)="save()">Save</button>
 * </nxt1-modal-header>
 *
 * <!-- Agent X branding -->
 * <nxt1-modal-header
 *   title="Agent X"
 *   [showAgentXIcon]="true"
 *   (closeModal)="close()"
 * />
 * ```
 *
 * ⭐ WEB OVERLAY ONLY — Mobile uses NxtSheetHeaderComponent ⭐
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { NxtIconComponent } from '../icon/icon.component';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '../../agent-x/fab/agent-x-logo.constants';

/** Supported shapes for the optional header icon container. */
export type ModalHeaderIconShape = 'circle' | 'rounded';

/** Position of the close button within the modal header. 'none' hides the close button. */
export type ModalHeaderClosePosition = 'left' | 'right' | 'none';

@Component({
  selector: 'nxt1-modal-header',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <header
      class="nxt1-modal-header"
      [class.nxt1-modal-header--border]="showBorder()"
      [attr.data-testid]="testId()"
    >
      <!-- Close button (left position) -->
      @if (showClose() && closePosition() === 'left') {
        <button
          type="button"
          class="nxt1-modal-header__close"
          (click)="closeModal.emit()"
          [attr.data-testid]="closeTestId()"
          aria-label="Close"
        >
          <nxt1-icon name="close" [size]="20" aria-hidden="true" />
        </button>
      }

      <!-- Optional icon before title (opt-in) -->
      @if (showIcon() && icon()) {
        <div
          class="nxt1-modal-header__icon"
          [class.nxt1-modal-header__icon--circle]="iconShape() === 'circle'"
          [class.nxt1-modal-header__icon--rounded]="iconShape() === 'rounded'"
        >
          <nxt1-icon [name]="icon()!" [size]="18" aria-hidden="true" />
        </div>
      }

      <!-- Optional Agent X brand mark (opt-in) -->
      @if (showAgentXIcon()) {
        <div class="nxt1-modal-header__agent-x-icon" aria-hidden="true">
          <svg
            viewBox="0 0 612 792"
            width="32"
            height="32"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="10"
            stroke-linejoin="round"
          >
            <path [attr.d]="agentXLogoPath" />
            <polygon [attr.points]="agentXLogoPolygon" />
          </svg>
        </div>
      }

      <!-- Title block: optional subtitle label above title -->
      <div
        class="nxt1-modal-header__title-block"
        [class.nxt1-modal-header__title-block--with-agent-x]="showAgentXIcon()"
      >
        @if (subtitle()) {
          <p class="nxt1-modal-header__subtitle">{{ subtitle() }}</p>
        }
        <h2 class="nxt1-modal-header__title">{{ title() }}</h2>
      </div>

      <!-- Projected action slot (Save button, Reset, etc.) -->
      <div class="nxt1-modal-header__actions">
        <ng-content select="[modalHeaderAction]" />
      </div>

      <!-- Close button (right position) -->
      @if (showClose() && closePosition() === 'right') {
        <button
          type="button"
          class="nxt1-modal-header__close"
          (click)="closeModal.emit()"
          [attr.data-testid]="closeTestId()"
          aria-label="Close"
        >
          <nxt1-icon name="close" [size]="20" aria-hidden="true" />
        </button>
      }
    </header>
  `,
  styles: [
    `
      /* ============================================
       * Modal Header — Base Layout
       * ============================================ */
      :host {
        display: block;
        flex-shrink: 0;
      }

      .nxt1-modal-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-5, 20px);
        min-height: 56px;
      }

      .nxt1-modal-header--border {
        border-bottom: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      /* ============================================
       * Close Button
       * ============================================ */
      .nxt1-modal-header__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        cursor: pointer;
        flex-shrink: 0;
        -webkit-tap-highlight-color: transparent;
        transition:
          background 0.15s ease,
          color 0.15s ease;
      }

      .nxt1-modal-header__close:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
        color: var(--nxt1-color-text-primary, #fff);
      }

      .nxt1-modal-header__close:active {
        transform: scale(0.95);
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
      }

      .nxt1-modal-header__close:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      /* ============================================
       * Icon Container
       * ============================================ */
      .nxt1-modal-header__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        color: var(--nxt1-color-primary, #ccff00);
        flex-shrink: 0;
      }

      .nxt1-modal-header__icon--circle {
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      .nxt1-modal-header__icon--rounded {
        border-radius: var(--nxt1-radius-md, 10px);
      }

      /* ============================================
       * Agent X Brand Mark
       * ============================================ */
      .nxt1-modal-header__agent-x-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-primary, #ccff00);
        filter: drop-shadow(0 0 6px var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.2)));
        flex-shrink: 0;
      }

      /* ============================================
       * Title Block
       * ============================================ */
      .nxt1-modal-header__title-block {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
        gap: 1px;
      }

      .nxt1-modal-header__title-block--with-agent-x {
        margin-left: -4px;
      }

      .nxt1-modal-header__subtitle {
        font-family: var(--nxt1-fontFamily-base, system-ui, sans-serif);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--nxt1-color-primary, #ccff00);
        margin: 0;
        line-height: 1.2;
      }

      .nxt1-modal-header__title {
        font-family: var(--nxt1-fontFamily-brand, system-ui, sans-serif);
        font-size: 17px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
        margin: 0;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* ============================================
       * Actions Slot
       * ============================================ */
      .nxt1-modal-header__actions {
        display: flex;
        align-items: center;
        flex-shrink: 0;
      }

      .nxt1-modal-header__actions:empty {
        display: none;
      }

      /* ============================================
       * Reduced Motion
       * ============================================ */
      @media (prefers-reduced-motion: reduce) {
        .nxt1-modal-header__close {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtModalHeaderComponent {
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;

  // ============================================
  // INPUTS
  // ============================================

  /** Title displayed prominently in the header. Required. */
  readonly title = input.required<string>();

  /** Optional label displayed above the title (small caps, primary color accent). */
  readonly subtitle = input<string | undefined>(undefined);

  /** Optional icon name displayed before the title block. */
  readonly icon = input<string | undefined>(undefined);

  /** Render icon beside title only when explicitly enabled. Default false. */
  readonly showIcon = input<boolean>(false);

  /** Render the Agent X brand mark beside title only when explicitly enabled. Default false. */
  readonly showAgentXIcon = input<boolean>(false);

  /** Shape of the icon container: 'circle' (default) or 'rounded' (rounded rectangle). */
  readonly iconShape = input<ModalHeaderIconShape>('circle');

  /**
   * Whether to render the close button.
   * When false, the close button is hidden regardless of `closePosition`.
   * Default true.
   */
  readonly showClose = input<boolean>(true);

  /**
   * Position of the close button: 'right' (default), 'left', or 'none'.
   * 'none' acts as a shorthand for `[showClose]="false"`.
   */
  readonly closePosition = input<ModalHeaderClosePosition>('right');

  /** Whether to show a border at the bottom of the header. Default true. */
  readonly showBorder = input<boolean>(true);

  /** Optional data-testid for the header container. */
  readonly testId = input<string | undefined>(undefined);

  /** Optional data-testid for the close button. */
  readonly closeTestId = input<string | undefined>(undefined);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when the close button is clicked. Parent handles overlay dismissal. */
  readonly closeModal = output<void>();
}
