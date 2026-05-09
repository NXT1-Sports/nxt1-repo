/**
 * @fileoverview NXT1 Overlay Component — Pure Angular Modal Host
 * @module @nxt1/ui/components/overlay
 * @version 1.0.0
 *
 * A shared, reusable modal overlay component built with pure Angular —
 * no Ionic ModalController. Uses native DOM, CSS animations, and
 * Angular's template system for a clean, SSR-safe implementation.
 *
 * Features:
 * - Backdrop with blur + click-to-dismiss
 * - Centered panel with size presets (sm/md/lg/xl/full)
 * - CSS enter/exit animations (fade + scale)
 * - Escape key dismissal
 * - Focus trap (traps Tab within the dialog)
 * - ARIA dialog role with labelling
 * - Scroll lock on body while open
 * - Reduced motion support
 * - Dark mode aware via design tokens
 * - 2026 Angular patterns: signals, OnPush, standalone
 *
 * This component is created dynamically by NxtOverlayService — it is
 * never used directly in templates.
 *
 * ⭐ WEB ONLY — Mobile uses Ionic ModalController ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  output,
  inject,
  ElementRef,
  afterNextRender,
  type OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { OverlayDismissReason, OverlaySize } from './overlay.types';

@Component({
  selector: 'nxt1-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Backdrop -->
    <div
      class="nxt1-overlay-backdrop"
      [class.nxt1-overlay-backdrop--visible]="visible()"
      (click)="onBackdropClick()"
      aria-hidden="true"
    ></div>

    <!-- Dialog Panel -->
    <div
      class="nxt1-overlay-panel"
      [class.nxt1-overlay-panel--visible]="visible()"
      [class]="panelSizeClass()"
      [style.max-width]="customMaxWidth()"
      role="dialog"
      [attr.aria-label]="ariaLabel()"
      aria-modal="true"
      (click)="$event.stopPropagation()"
    >
      <!-- Close button — fixed above scrollable content -->
      @if (showCloseButton()) {
        <button
          type="button"
          class="nxt1-overlay-close"
          (click)="onClose()"
          aria-label="Close dialog"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      }

      <!-- Scrollable content area -->
      <div class="nxt1-overlay-content">
        <ng-content />
      </div>
    </div>
  `,
  styles: [
    `
      /* ═══════════════════════════════════════════
         OVERLAY HOST
         ═══════════════════════════════════════════ */
      :host {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
      }

      /* ═══════════════════════════════════════════
         BACKDROP
         ═══════════════════════════════════════════ */
      .nxt1-overlay-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      .nxt1-overlay-backdrop--visible {
        opacity: 1;
      }

      /* ═══════════════════════════════════════════
         DIALOG PANEL
         ═══════════════════════════════════════════ */
      .nxt1-overlay-panel {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        width: 100%;
        max-height: 90vh;
        max-height: 90dvh;
        overflow: hidden;
        background: var(--nxt1-color-surface-100, #1a1a2e);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        border-radius: var(--nxt1-borderRadius-2xl, 20px);
        box-shadow:
          0 25px 60px -12px rgba(0, 0, 0, 0.5),
          0 10px 20px -5px rgba(0, 0, 0, 0.3);

        /* Animation — enter */
        opacity: 0;
        transform: scale(0.92) translateY(8px);
        transition:
          opacity 0.25s cubic-bezier(0.32, 0.72, 0, 1),
          transform 0.25s cubic-bezier(0.32, 0.72, 0, 1);
      }

      /* Subtle top edge highlight for depth */
      .nxt1-overlay-panel::before {
        content: '';
        position: absolute;
        inset: 0 0 auto 0;
        height: 1px;
        background: linear-gradient(
          90deg,
          transparent 0%,
          var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08)) 20%,
          var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12)) 50%,
          var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08)) 80%,
          transparent 100%
        );
        z-index: 1;
        pointer-events: none;
        border-radius: var(--nxt1-borderRadius-2xl, 20px) var(--nxt1-borderRadius-2xl, 20px) 0 0;
      }

      .nxt1-overlay-panel--visible {
        opacity: 1;
        transform: scale(1) translateY(0);
      }

      /* ─── SIZE PRESETS ─── */
      .nxt1-overlay-panel--sm {
        max-width: 400px;
      }

      .nxt1-overlay-panel--md {
        max-width: 520px;
      }

      .nxt1-overlay-panel--lg {
        max-width: 640px;
      }

      .nxt1-overlay-panel--xl {
        max-width: 800px;
      }

      .nxt1-overlay-panel--full {
        max-width: 90vw;
        width: 90vw;
        height: 90vh;
        height: 90dvh;
        max-height: 90vh;
        max-height: 90dvh;
      }

      /* ─── RESPONSIVE: mobile full-width with margin ─── */
      @media (max-width: 480px) {
        .nxt1-overlay-panel {
          max-width: calc(100% - 24px) !important;
          border-radius: var(--nxt1-borderRadius-xl, 16px);
        }

        .nxt1-overlay-panel--full {
          width: calc(100% - 24px);
          height: calc(100% - 24px);
          max-height: calc(100dvh - 24px);
        }
      }

      /* Agent X attachment viewer: intentionally shorter on mobile so
         the parent operation sheet context still feels present beneath it. */
      @media (max-width: 768px) {
        .nxt1-overlay-panel.nxt1-media-viewer-overlay--compact-mobile {
          height: 62vh;
          height: 62dvh;
          max-height: 62vh;
          max-height: 62dvh;
        }
      }

      /* ═══════════════════════════════════════════
         CLOSE BUTTON
         ═══════════════════════════════════════════ */
      .nxt1-overlay-close {
        position: absolute;
        top: var(--nxt1-spacing-4, 16px);
        right: var(--nxt1-spacing-4, 16px);
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        padding: 0;
        border: none;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .nxt1-overlay-close:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
        color: var(--nxt1-color-text-primary);
        transform: scale(1.05);
      }

      .nxt1-overlay-close:active {
        transform: scale(0.95);
      }

      .nxt1-overlay-close:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      /* ═══════════════════════════════════════════
         SCROLLABLE CONTENT AREA
         ═══════════════════════════════════════════ */
      .nxt1-overlay-content {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        scrollbar-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12)) transparent;
      }

      .nxt1-overlay-content::-webkit-scrollbar {
        width: 6px;
      }

      .nxt1-overlay-content::-webkit-scrollbar-track {
        background: transparent;
      }

      .nxt1-overlay-content::-webkit-scrollbar-thumb {
        background: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        border-radius: 3px;
      }

      /* ═══════════════════════════════════════════
         DARK MODE
         ═══════════════════════════════════════════ */
      @media (prefers-color-scheme: dark) {
        .nxt1-overlay-panel {
          box-shadow:
            0 25px 60px -12px rgba(0, 0, 0, 0.7),
            0 10px 20px -5px rgba(0, 0, 0, 0.5);
        }
      }

      /* ═══════════════════════════════════════════
         ACCESSIBILITY
         ═══════════════════════════════════════════ */
      @media (prefers-reduced-motion: reduce) {
        .nxt1-overlay-backdrop {
          transition: none;
        }

        .nxt1-overlay-panel {
          transition: none;
        }
      }

      @media (forced-colors: active) {
        .nxt1-overlay-panel {
          border: 2px solid CanvasText;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtOverlayComponent implements OnDestroy {
  private readonly el = inject(ElementRef);
  private previouslyFocusedElement: HTMLElement | null = null;
  private previousBodyOverflow: string | null = null;

  // ============================================
  // CONFIGURATION (set by NxtOverlayService)
  // ============================================

  /** Panel size preset */
  readonly size = signal<OverlaySize>('md');

  /** Custom max-width override */
  readonly customMaxWidth = signal<string | undefined>(undefined);

  /** Whether backdrop click dismisses */
  readonly backdropDismiss = signal(true);

  /** Whether Escape key dismisses */
  readonly escDismiss = signal(true);

  /** ARIA label for the dialog */
  readonly ariaLabel = signal<string | undefined>(undefined);

  /** Whether to show the built-in close button */
  readonly showCloseButton = signal(false);

  /**
   * Optional guard called before backdrop-click or Escape dismissal.
   * Set by NxtOverlayService when `canDismiss` is provided in OverlayConfig.
   */
  readonly canDismiss = signal<(() => boolean | Promise<boolean>) | undefined>(undefined);

  /** Visibility state — controls CSS animations */
  readonly visible = signal(false);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when the overlay requests dismissal */
  readonly dismissed = output<OverlayDismissReason>();

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly panelSizeClass = computed(() => `nxt1-overlay-panel--${this.size()}`);

  // ============================================
  // LIFECYCLE
  // ============================================

  constructor() {
    afterNextRender(() => {
      this.previouslyFocusedElement = document.activeElement as HTMLElement;

      // Lock body scroll — save previous value for proper restore
      this.previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      // Listen for Escape key
      document.addEventListener('keydown', this.onKeyDown);

      // Animate in on next frame
      requestAnimationFrame(() => {
        this.visible.set(true);
        this.trapFocus();
      });
    });
  }

  ngOnDestroy(): void {
    // Restore body scroll to previous value
    document.body.style.overflow = this.previousBodyOverflow ?? '';

    // Remove Escape listener
    document.removeEventListener('keydown', this.onKeyDown);

    // Restore focus
    this.previouslyFocusedElement?.focus();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /** Backdrop click handler */
  protected async onBackdropClick(): Promise<void> {
    if (!this.backdropDismiss()) return;
    const guard = this.canDismiss();
    if (guard && !(await guard())) return;
    this.dismissed.emit('backdrop');
  }

  /** Close button handler */
  protected onClose(): void {
    this.dismissed.emit('close');
  }

  /** Escape key handler (bound as arrow function for proper `this`) */
  private readonly onKeyDown = async (event: KeyboardEvent): Promise<void> => {
    if (event.key === 'Escape' && this.escDismiss()) {
      event.preventDefault();
      event.stopPropagation();
      const guard = this.canDismiss();
      if (guard && !(await guard())) return;
      this.dismissed.emit('escape');
    }
  };

  // ============================================
  // ANIMATION
  // ============================================

  /**
   * Animate out and return a promise that resolves when complete.
   * Called by NxtOverlayService before removing the component.
   */
  animateOut(): Promise<void> {
    return new Promise((resolve) => {
      this.visible.set(false);
      // Match the CSS transition duration
      setTimeout(resolve, 250);
    });
  }

  // ============================================
  // FOCUS MANAGEMENT
  // ============================================

  /** Trap focus within the dialog panel */
  private trapFocus(): void {
    const panel = this.el.nativeElement.querySelector('.nxt1-overlay-panel') as HTMLElement | null;
    if (!panel) return;

    const focusable = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    if (focusable.length > 0) {
      focusable[0].focus();
    } else {
      panel.setAttribute('tabindex', '-1');
      panel.focus();
    }
  }
}
