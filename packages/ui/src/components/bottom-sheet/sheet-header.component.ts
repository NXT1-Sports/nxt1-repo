/**
 * @fileoverview NxtSheetHeaderComponent — Standardized content sheet header
 * @module @nxt1/ui/components/bottom-sheet
 * @version 1.0.0
 *
 * A reusable header for content sheets opened via `NxtBottomSheetService.openSheet()`.
 * Provides a consistent, native-quality layout across all features.
 *
 * Layout Variants:
 * 1. **Standard** (closePosition='right', default):
 *    `[icon?] [subtitle + title] ——— [action?] [close]`
 *
 * 2. **Close-left** (closePosition='left'):
 *    `[close] [icon?] [subtitle + title ———] [action?]`
 *
 * 3. **Centered title** (centerTitle=true, closePosition='left'):
 *    `[close] [——— title ———] [action? | spacer]`
 *
 * Features:
 * - Theme-aware via NXT1 design tokens (dark/light/sport themes)
 * - Platform-adaptive sizing (iOS vs Android)
 * - Configurable icon (circle or rounded-rect shape)
 * - Content projection slot for right-side actions (Save, XP badge, Reset, etc.)
 * - data-testid support for E2E testing
 * - Haptic feedback on close tap (native only)
 * - Keyboard accessible (aria-label, button semantics)
 *
 * Usage:
 * ```html
 * <!-- Standard: icon + label + title on left, close on right -->
 * <nxt1-sheet-header
 *   title="Activity Log"
 *   subtitle="Operations"
 *   icon="time"
 *   (closeSheet)="dismiss()"
 * />
 *
 * <!-- Close on left with centered title (iOS style) -->
 * <nxt1-sheet-header
 *   title="QR Code"
 *   closePosition="left"
 *   [centerTitle]="true"
 *   (closeSheet)="dismiss()"
 * />
 *
 * <!-- With projected action button on the right -->
 * <nxt1-sheet-header
 *   title="Edit Profile"
 *   [showClose]="false"
 *   (closeSheet)="dismiss()"
 * >
 *   <button sheetHeaderAction (click)="save()">Save</button>
 * </nxt1-sheet-header>
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { NxtIconComponent } from '../icon/icon.component';
import { HapticsService } from '../../services/haptics/haptics.service';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';

/** Supported shapes for the optional header icon container. */
export type SheetHeaderIconShape = 'circle' | 'rounded';

/** Position of the close button within the header. */
export type SheetHeaderClosePosition = 'left' | 'right';

@Component({
  selector: 'nxt1-sheet-header',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <header
      class="nxt1-sheet-header"
      [class.nxt1-sheet-header--border]="showBorder()"
      [attr.data-testid]="testId()"
    >
      <!-- Close button (left position) -->
      @if (showClose() && closePosition() === 'left') {
        <button
          type="button"
          class="nxt1-sheet-header__close"
          (click)="onClose()"
          [attr.data-testid]="closeTestId()"
          aria-label="Close"
        >
          <nxt1-icon name="close" [size]="20" aria-hidden="true" />
        </button>
      }

      <!-- Optional icon before title (opt-in to avoid changing existing headers) -->
      @if (showIcon() && icon()) {
        <div
          class="nxt1-sheet-header__icon"
          [class.nxt1-sheet-header__icon--circle]="iconShape() === 'circle'"
          [class.nxt1-sheet-header__icon--rounded]="iconShape() === 'rounded'"
        >
          <nxt1-icon [name]="icon()!" [size]="18" aria-hidden="true" />
        </div>
      }

      @if (showAgentXIcon()) {
        <div class="nxt1-sheet-header__agent-x-icon" aria-hidden="true">
          <svg
            viewBox="0 0 612 792"
            width="36"
            height="36"
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

      <!-- Title block -->
      <div
        class="nxt1-sheet-header__title-block"
        [class.nxt1-sheet-header__title-block--with-agent-x]="showAgentXIcon()"
      >
        <h2 class="nxt1-sheet-header__title">{{ title() }}</h2>
      </div>

      <!-- Projected action slot (Save button, XP badge, Reset, etc.) -->
      <div class="nxt1-sheet-header__actions">
        <ng-content select="[sheetHeaderAction]" />
      </div>

      <!-- Close button (right position) -->
      @if (showClose() && closePosition() === 'right') {
        <button
          type="button"
          class="nxt1-sheet-header__close"
          (click)="onClose()"
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
       * Sheet Header — Base Layout
       * ============================================ */
      :host {
        display: block;
        flex-shrink: 0;
      }

      .nxt1-sheet-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: calc(var(--nxt1-spacing-4, 16px) + var(--nxt1-sheet-header-offset-top, 0px))
          var(--nxt1-spacing-5, 20px) var(--nxt1-spacing-3, 12px);
        min-height: var(--nxt1-touch-target-min, 44px);
      }

      .nxt1-sheet-header--border {
        border-bottom: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      /* ============================================
       * Close Button
       * ============================================ */
      .nxt1-sheet-header__close {
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

      .nxt1-sheet-header__close:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
        color: var(--nxt1-color-text-primary, #fff);
      }

      .nxt1-sheet-header__close:active {
        transform: scale(0.95);
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
      }

      /* ============================================
       * Icon Container
       * ============================================ */
      .nxt1-sheet-header__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        color: var(--nxt1-color-primary, #ccff00);
        flex-shrink: 0;
      }

      .nxt1-sheet-header__icon--circle {
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      .nxt1-sheet-header__icon--rounded {
        border-radius: var(--nxt1-radius-md, 10px);
      }

      .nxt1-sheet-header__agent-x-icon {
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
      .nxt1-sheet-header__title-block {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }

      .nxt1-sheet-header__title-block--with-agent-x {
        margin-left: -4px;
      }

      .nxt1-sheet-header__title {
        font-family: var(--nxt1-fontFamily-brand);
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
      .nxt1-sheet-header__actions {
        display: flex;
        align-items: center;
        flex-shrink: 0;
      }

      .nxt1-sheet-header__actions:empty {
        display: none;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtSheetHeaderComponent {
  private readonly haptics = inject(HapticsService);
  private readonly modalCtrl = inject(ModalController);

  // ============================================
  // INPUTS
  // ============================================

  /** Title displayed prominently in the header. */
  readonly title = input.required<string>();

  /** Optional subtitle/label displayed above the title (smaller, uppercase, primary color). */
  readonly subtitle = input<string | undefined>(undefined);

  /** Optional icon name displayed before the title block. */
  readonly icon = input<string | undefined>(undefined);

  /** Render icon beside title only when explicitly enabled. */
  readonly showIcon = input<boolean>(false);

  /** Render the Agent X brand mark beside title only when explicitly enabled. */
  readonly showAgentXIcon = input<boolean>(false);

  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;

  /** Shape of the icon container: 'circle' (default) or 'rounded' (rounded rectangle). */
  readonly iconShape = input<SheetHeaderIconShape>('circle');

  /** Whether to show the close button. Default true. */
  readonly showClose = input<boolean>(true);

  /** Position of the close button: 'right' (default) or 'left' (iOS centered-title style). */
  readonly closePosition = input<SheetHeaderClosePosition>('right');

  /** Whether to center the title text. Useful for iOS-style centered headers. Default false. */
  readonly centerTitle = input<boolean>(false);

  /** Whether to show a border at the bottom of the header. Default true. */
  readonly showBorder = input<boolean>(true);

  /** Optional data-testid for the header container. */
  readonly testId = input<string | undefined>(undefined);

  /** Optional data-testid for the close button. */
  readonly closeTestId = input<string | undefined>(undefined);

  /**
   * When true, the header attempts to dismiss the active Ionic modal directly before
   * notifying the parent. Set to false for sheets that need custom save/cancel logic.
   */
  readonly dismissOnClose = input<boolean>(true);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when the close button is tapped. Parent handles dismiss logic. */
  readonly closeSheet = output<void>();

  // ============================================
  // EVENT HANDLERS
  // ============================================

  async onClose(): Promise<void> {
    await this.haptics.impact('light');

    if (!this.dismissOnClose()) {
      this.closeSheet.emit();
      return;
    }

    // Dismiss immediately so backdrop and sheet close timing match classic behavior.
    const topOverlay = await this.modalCtrl.getTop();
    if (
      topOverlay instanceof Element &&
      topOverlay.tagName.toLowerCase() === 'ion-modal' &&
      typeof (topOverlay as { dismiss?: unknown }).dismiss === 'function'
    ) {
      const modal = topOverlay as {
        dismiss(data?: unknown, role?: string): Promise<boolean>;
      };

      // Fallback: standard dismiss
      const dismissed = await modal.dismiss(undefined, 'cancel');
      if (dismissed) return;
    }

    this.closeSheet.emit();
  }
}
