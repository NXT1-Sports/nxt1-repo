/**
 * @fileoverview Scout Report Category Tabs Component
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Horizontal scrolling category tabs/chips for filtering scout reports.
 * Native-feeling touch scrolling with snap points.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Horizontal scroll with momentum
 * - Active state indicator with animation
 * - Category icons
 * - Badge counts (optional)
 * - Haptic feedback on selection
 *
 * @example
 * ```html
 * <nxt1-scout-report-category-tabs
 *   [activeCategory]="'trending'"
 *   [categories]="categories"
 *   (categoryChange)="onCategoryChange($event)"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  ElementRef,
  viewChildren,
  afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  appsOutline,
  flameOutline,
  starOutline,
  bookmarkOutline,
  footballOutline,
  basketballOutline,
  baseballOutline,
  trophyOutline,
} from 'ionicons/icons';
import type { ScoutReportCategoryId, ScoutReportCategory } from '@nxt1/core';

// Register icons
@Component({
  selector: 'nxt1-scout-report-category-tabs',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <div class="tabs-container">
      <div class="tabs-scroll" #scrollContainer>
        @for (category of categories(); track category.id) {
          <button
            #tabButton
            class="tab"
            [class.tab--active]="category.id === activeCategory()"
            [attr.data-category]="category.id"
            (click)="selectCategory(category.id)"
          >
            <ion-icon [name]="category.icon" class="tab__icon"></ion-icon>
            <span class="tab__label">{{ category.label }}</span>
            @if (category.badge !== undefined && category.badge > 0) {
              <span class="tab__badge">{{ formatCount(category.badge) }}</span>
            }
          </button>
        }
      </div>

      <!-- Gradient Fade Edges -->
      <div class="tabs-fade tabs-fade--left"></div>
      <div class="tabs-fade tabs-fade--right"></div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         TABS CONTAINER
         ============================================ */

      :host {
        display: block;
        width: 100%;
      }

      .tabs-container {
        position: relative;
        width: 100%;
        overflow: hidden;
      }

      /* ============================================
         SCROLL CONTAINER
         ============================================ */

      .tabs-scroll {
        display: flex;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-4, 16px);
        overflow-x: auto;
        overflow-y: hidden;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .tabs-scroll::-webkit-scrollbar {
        display: none;
      }

      /* ============================================
         TAB BUTTON
         ============================================ */

      .tab {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-3, 12px);
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        background: var(--nxt1-color-surface-elevated, #252525);
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        border-radius: var(--nxt1-radius-full, 9999px);
        cursor: pointer;
        scroll-snap-align: start;
        transition: all 0.2s ease;
        flex-shrink: 0;
      }

      .tab:hover {
        color: var(--nxt1-color-text-primary, #ffffff);
        background: var(--nxt1-color-surface, #1a1a1a);
        border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
      }

      .tab:active {
        transform: scale(0.97);
      }

      /* Active State */
      .tab--active {
        color: var(--nxt1-color-primary, #3b82f6);
        background: var(--nxt1-color-primary-alpha-10, rgba(59, 130, 246, 0.1));
        border-color: var(--nxt1-color-primary-alpha-30, rgba(59, 130, 246, 0.3));
      }

      .tab--active:hover {
        background: var(--nxt1-color-primary-alpha-15, rgba(59, 130, 246, 0.15));
      }

      /* ============================================
         TAB ICON
         ============================================ */

      .tab__icon {
        font-size: 16px;
        flex-shrink: 0;
      }

      .tab--active .tab__icon {
        color: var(--nxt1-color-primary, #3b82f6);
      }

      /* ============================================
         TAB LABEL
         ============================================ */

      .tab__label {
        letter-spacing: -0.01em;
      }

      /* ============================================
         TAB BADGE
         ============================================ */

      .tab__badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 6px;
        font-size: 10px;
        font-weight: 700;
        color: var(--nxt1-color-text-inverse, #0f0f0f);
        background: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        border-radius: var(--nxt1-radius-full, 9999px);
        margin-left: var(--nxt1-spacing-1, 4px);
      }

      .tab--active .tab__badge {
        background: var(--nxt1-color-primary, #3b82f6);
        color: var(--nxt1-color-text-inverse, #ffffff);
      }

      /* ============================================
         FADE EDGES
         ============================================ */

      .tabs-fade {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 24px;
        pointer-events: none;
        z-index: 1;
      }

      .tabs-fade--left {
        left: 0;
        background: linear-gradient(to right, var(--nxt1-color-surface, #1a1a1a), transparent);
      }

      .tabs-fade--right {
        right: 0;
        background: linear-gradient(to left, var(--nxt1-color-surface, #1a1a1a), transparent);
      }

      /* ============================================
         THEME VARIANTS
         ============================================ */

      :host-context(.light-theme) {
        .tab {
          color: var(--nxt1-color-gray-600, #4b5563);
          background: var(--nxt1-color-gray-100, #f3f4f6);
          border-color: var(--nxt1-color-gray-200, #e5e7eb);
        }

        .tab:hover {
          color: var(--nxt1-color-gray-900, #111827);
          background: var(--nxt1-color-gray-200, #e5e7eb);
        }

        .tab--active {
          color: var(--nxt1-color-primary, #3b82f6);
          background: var(--nxt1-color-primary-alpha-10, rgba(59, 130, 246, 0.1));
          border-color: var(--nxt1-color-primary-alpha-30, rgba(59, 130, 246, 0.3));
        }

        .tab__badge {
          background: var(--nxt1-color-gray-400, #9ca3af);
          color: var(--nxt1-color-white, #ffffff);
        }

        .tabs-fade--left {
          background: linear-gradient(to right, var(--nxt1-color-surface, #ffffff), transparent);
        }

        .tabs-fade--right {
          background: linear-gradient(to left, var(--nxt1-color-surface, #ffffff), transparent);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportCategoryTabsComponent {
  // ============================================
  // VIEW QUERIES
  // ============================================

  private readonly tabButtons = viewChildren<ElementRef>('tabButton');
  private readonly scrollContainer = viewChildren<ElementRef>('scrollContainer');

  // ============================================
  // INPUTS
  // ============================================

  /** Currently active category */
  readonly activeCategory = input<ScoutReportCategoryId>('all');

  /** Available categories */
  readonly categories = input<readonly ScoutReportCategory[]>([]);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when category is selected */
  readonly categoryChange = output<ScoutReportCategoryId>();

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    addIcons({
      appsOutline,
      flameOutline,
      starOutline,
      bookmarkOutline,
      footballOutline,
      basketballOutline,
      baseballOutline,
      trophyOutline,
    });
    // Scroll active tab into view on init
    afterNextRender(() => {
      this.scrollToActiveTab();
    });
  }

  // ============================================
  // METHODS
  // ============================================

  /**
   * Select a category.
   */
  protected selectCategory(categoryId: ScoutReportCategoryId): void {
    this.categoryChange.emit(categoryId);
    this.scrollToTab(categoryId);
  }

  /**
   * Format count for display.
   */
  protected formatCount(count: number): string {
    if (count >= 1000) {
      return `${Math.floor(count / 1000)}k`;
    }
    return count.toString();
  }

  /**
   * Scroll to active tab.
   */
  private scrollToActiveTab(): void {
    this.scrollToTab(this.activeCategory());
  }

  /**
   * Scroll a specific tab into view.
   */
  private scrollToTab(categoryId: ScoutReportCategoryId): void {
    const buttons = this.tabButtons();
    const container = this.scrollContainer()[0]?.nativeElement;

    if (!container) return;

    const button = buttons.find((el) => el.nativeElement.dataset.category === categoryId);

    if (button) {
      const buttonEl = button.nativeElement;
      const buttonRect = buttonEl.getBoundingClientRect();

      // Calculate scroll position to center the button
      const scrollLeft = buttonEl.offsetLeft - container.offsetWidth / 2 + buttonRect.width / 2;

      container.scrollTo({
        left: Math.max(0, scrollLeft),
        behavior: 'smooth',
      });
    }
  }
}
