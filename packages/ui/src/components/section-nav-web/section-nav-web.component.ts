/**
 * @fileoverview NxtSectionNavWebComponent — Reusable Page Section Navigation
 * @module @nxt1/ui/components/section-nav-web
 * @version 1.0.0
 *
 * Sticky vertical side-navigation for multi-section pages.
 * Renders a column of tab-like buttons; the active item is highlighted.
 *
 * On mobile (≤768 px) collapses into a horizontal scrollable pill strip.
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 *
 * Used by Billing & Usage, Agent X, and any page that needs
 * a two-column "settings-style" layout.
 *
 * @example
 * ```html
 * <nxt1-section-nav-web
 *   [items]="navItems"
 *   [activeId]="activeSectionId()"
 *   (selectionChange)="onSectionChange($event)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';

// ============================================
// PUBLIC TYPES
// ============================================

/** Single navigation item rendered in the side-nav. */
export interface SectionNavItem {
  /** Unique identifier for this section. */
  readonly id: string;
  /** Display label shown in the nav button. */
  readonly label: string;
}

/** Emitted when the user clicks a different section. */
export interface SectionNavChangeEvent {
  /** The item that was selected. */
  readonly item: SectionNavItem;
  /** Shorthand: selected item id. */
  readonly id: string;
}

@Component({
  selector: 'nxt1-section-nav-web',
  standalone: true,
  template: `
    <nav class="section-nav" role="tablist" [attr.aria-label]="ariaLabel()">
      @for (item of items(); track item.id) {
        <button
          class="nav-item"
          [class.nav-item--active]="activeId() === item.id"
          role="tab"
          [attr.aria-selected]="activeId() === item.id"
          [attr.aria-controls]="'section-' + item.id"
          (click)="onSelect(item)"
        >
          {{ item.label }}
        </button>
      }
    </nav>
  `,
  styles: [
    `
      /* ============================================
         SECTION NAV — Sticky Vertical Side-Nav
         Zero Ionic, SSR-safe, design-token CSS
         ============================================ */

      :host {
        display: block;
      }

      .section-nav {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0-5);
        position: sticky;
        top: var(--nxt1-spacing-6);
      }

      .nav-item {
        display: block;
        width: 100%;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-normal);
        color: var(--nxt1-color-text-secondary);
        background: transparent;
        border: none;
        border-radius: var(--nxt1-radius-lg, 12px);
        cursor: pointer;
        text-align: left;
        line-height: var(--nxt1-lineHeight-normal);
        transition:
          color var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out),
          background var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out);
      }

      .nav-item:hover {
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-state-hover);
      }

      .nav-item--active {
        color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-medium);
        background: var(--nxt1-color-surface-200);
      }

      /* ==============================
         RESPONSIVE: Mobile → Horizontal Pill Strip
         ============================== */

      @media (max-width: 768px) {
        .section-nav {
          flex-direction: row;
          overflow-x: auto;
          gap: var(--nxt1-spacing-2);
          position: static;
          padding-bottom: var(--nxt1-spacing-3);
          border-bottom: 1px solid var(--nxt1-color-border-subtle);
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }

        .section-nav::-webkit-scrollbar {
          display: none;
        }

        .nav-item {
          flex-shrink: 0;
          white-space: nowrap;
          padding: var(--nxt1-spacing-1-5) var(--nxt1-spacing-3);
          border-radius: var(--nxt1-radius-full);
          font-size: var(--nxt1-fontSize-xs);
          background: var(--nxt1-color-surface-100);
          border: 1px solid var(--nxt1-color-border-subtle);
          color: var(--nxt1-color-text-secondary);
        }

        .nav-item:hover {
          background: var(--nxt1-color-surface-200);
          color: var(--nxt1-color-text-primary);
        }

        .nav-item--active {
          background: var(--nxt1-color-surface-300);
          border-color: var(--nxt1-color-primary);
          color: var(--nxt1-color-text-primary);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtSectionNavWebComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Navigation items to render. */
  readonly items = input.required<readonly SectionNavItem[]>();

  /** Currently active item id. */
  readonly activeId = input.required<string>();

  /** Accessible label for the <nav> element. */
  readonly ariaLabel = input<string>('Page sections');

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when a different section is selected. */
  readonly selectionChange = output<SectionNavChangeEvent>();

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onSelect(item: SectionNavItem): void {
    this.selectionChange.emit({ item, id: item.id });
  }
}
