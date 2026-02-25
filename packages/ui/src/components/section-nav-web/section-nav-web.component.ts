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
  /** Optional badge count shown beside the label. */
  readonly badge?: number;
  /**
   * Optional group header. When the group value changes between
   * consecutive items, a visual group header is rendered.
   */
  readonly group?: string;
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
      @for (item of items(); track item.id; let i = $index) {
        @if (item.group && (i === 0 || items()[i - 1]?.group !== item.group)) {
          <span class="nav-group-header" role="presentation">{{ item.group }}</span>
        }
        <button
          class="nav-item"
          [class.nav-item--active]="activeId() === item.id"
          [class.nav-item--grouped]="!!item.group"
          role="tab"
          [attr.aria-selected]="activeId() === item.id"
          [attr.aria-controls]="'section-' + item.id"
          (click)="onSelect(item)"
        >
          {{ item.label }}
          @if (item.badge != null && item.badge > 0) {
            <span class="nav-badge">{{ item.badge }}</span>
          }
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
        /* Stretch to fill grid/flex parent height so sticky has room to scroll */
        align-self: stretch;
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
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: 0;
        color: var(--nxt1-color-text-secondary);
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--nxt1-radius-lg, 12px);
        cursor: pointer;
        text-align: left;
        transition:
          color var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out),
          background var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out),
          border-color var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out);
      }

      .nav-item:hover {
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-state-hover);
      }

      .nav-item--active {
        color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-normal);
        font-size: var(--nxt1-fontSize-sm);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: 0;
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-primary);
      }

      .nav-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        margin-left: 6px;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        background: var(--nxt1-color-alpha-primary15);
        color: var(--nxt1-color-primary);
      }

      .nav-item--active .nav-badge {
        background: var(--nxt1-color-alpha-primary20);
      }

      /* ==============================
         GROUP HEADERS
         ============================== */

      .nav-group-header {
        display: block;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
        margin-top: var(--nxt1-spacing-2);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-tertiary, #999);
        user-select: none;
      }

      .nav-group-header:first-child {
        margin-top: 0;
      }

      .nav-item--grouped {
        padding-left: var(--nxt1-spacing-4, 16px);
      }

      .nav-item:focus,
      .nav-item:focus-visible {
        outline: none;
        box-shadow: none;
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

        .nav-badge {
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          font-size: 9px;
        }

        .nav-group-header {
          flex-shrink: 0;
          margin-top: 0;
          padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
          font-size: 9px;
          color: var(--nxt1-color-text-tertiary, #999);
          align-self: center;
        }

        .nav-item--grouped {
          padding-left: var(--nxt1-spacing-3);
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
