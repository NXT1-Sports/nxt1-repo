/**
 * @fileoverview NxtOptionScrollerWebComponent - Web Option Scroller (Zero Ionic)
 * @module @nxt1/ui/components/option-scroller-web
 * @version 1.0.0
 *
 * Pure CSS/HTML option scroller for web shells.
 * Mirrors the NxtOptionScrollerComponent API but uses zero Ionic dependencies,
 * making it SSR-safe and compatible with the web shell layout system.
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 *
 * Features:
 * - Twitter/TikTok style sliding underline indicator
 * - Stretch-to-fill and centered layouts
 * - Design token integration
 * - Keyboard navigation (arrow keys, Enter, Space)
 * - ARIA tabs pattern for accessibility
 * - SSR-safe (platform-guarded DOM access)
 *
 * @example
 * ```html
 * <nxt1-option-scroller-web
 *   [options]="modeOptions"
 *   [selectedId]="selectedMode()"
 *   (selectionChange)="onModeChange($event)"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  signal,
  inject,
  ElementRef,
  DestroyRef,
  afterNextRender,
  viewChild,
  effect,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import type {
  OptionScrollerItem,
  OptionScrollerChangeEvent,
} from '../option-scroller/option-scroller.types';

// Re-export types for convenience
export type { OptionScrollerItem, OptionScrollerChangeEvent };

@Component({
  selector: 'nxt1-option-scroller-web',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="scroller"
      [class.scroller--stretch]="stretchToFill()"
      [class.scroller--scrollable]="scrollable()"
      [class.scroller--divider]="showDivider()"
      role="tablist"
      [attr.aria-label]="ariaLabel()"
    >
      <div #optionsContainer class="scroller__container">
        <!-- Sliding Underline Indicator -->
        @if (options().length > 0) {
          <div
            class="scroller__indicator"
            [style.width.px]="indicatorWidth()"
            [style.transform]="'translateX(' + indicatorOffset() + 'px)'"
          ></div>
        }

        <!-- Option Buttons -->
        @for (option of options(); track option.id; let i = $index) {
          <button
            #optionButton
            type="button"
            class="scroller__option"
            [class.scroller__option--active]="option.id === selectedId()"
            [class.scroller__option--disabled]="option.disabled"
            [disabled]="option.disabled"
            [attr.role]="'tab'"
            [attr.aria-selected]="option.id === selectedId()"
            [attr.aria-controls]="'panel-' + option.id"
            [attr.tabindex]="option.id === selectedId() ? 0 : -1"
            (click)="selectOption(option, i)"
            (keydown.enter)="selectOption(option, i)"
            (keydown.space)="selectOption(option, i); $event.preventDefault()"
            (keydown.arrowRight)="navigateNext($event)"
            (keydown.arrowLeft)="navigatePrev($event)"
          >
            <span class="scroller__label">{{ option.label }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         WEB OPTION SCROLLER — Design Token CSS
         Zero Ionic, SSR-safe
         ============================================ */

      :host {
        display: block;
        width: 100%;
      }

      .scroller {
        position: relative;
        width: 100%;
        background: var(--nxt1-color-bg-primary);
      }

      .scroller--divider {
        border-bottom: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      /* ============================================
         CONTAINER
         ============================================ */

      .scroller__container {
        position: relative;
        display: flex;
        align-items: stretch;
        overflow-x: hidden;
      }

      .scroller--scrollable .scroller__container {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .scroller--scrollable .scroller__container::-webkit-scrollbar {
        display: none;
      }

      .scroller--stretch .scroller__container {
        width: 100%;
      }

      /* ============================================
         OPTION BUTTONS
         ============================================ */

      .scroller__option {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-1, 4px);
        height: 48px;
        padding: 0 var(--nxt1-spacing-4, 16px);
        background: transparent;
        border: none;
        cursor: pointer;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base, 15px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        white-space: nowrap;
        transition: color 0.2s ease;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        z-index: 1;
      }

      .scroller--stretch .scroller__option {
        flex: 1;
      }

      .scroller__option:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: -2px;
        border-radius: var(--nxt1-radius-sm, 4px);
      }

      .scroller__option--active {
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .scroller__option--disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .scroller__option:hover:not(.scroller__option--disabled) {
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .scroller__option:active:not(.scroller__option--disabled) {
        opacity: 0.7;
      }

      .scroller__label {
        position: relative;
      }

      /* ============================================
         SLIDING UNDERLINE INDICATOR
         ============================================ */

      .scroller__indicator {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: var(--nxt1-color-primary);
        border-radius: var(--nxt1-radius-full, 9999px) var(--nxt1-radius-full, 9999px) 0 0;
        transition:
          transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
          width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        will-change: transform, width;
      }

      /* ============================================
         REDUCED MOTION
         ============================================ */

      @media (prefers-reduced-motion: reduce) {
        .scroller__indicator {
          transition: none;
        }

        .scroller__option {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtOptionScrollerWebComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly elementRef = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly optionsContainer = viewChild<ElementRef<HTMLElement>>('optionsContainer');

  // ============================================
  // INPUTS
  // ============================================

  /** Array of options to display */
  readonly options = input.required<OptionScrollerItem[]>();

  /** Currently selected option ID */
  readonly selectedId = input<string>('');

  /** Stretch options to fill the full width */
  readonly stretchToFill = input<boolean>(true);

  /** Allow horizontal scrolling when options overflow */
  readonly scrollable = input<boolean>(false);

  /** Show bottom divider line */
  readonly showDivider = input<boolean>(true);

  /** Accessible label for the tab list */
  readonly ariaLabel = input<string>('Navigation tabs');

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when selection changes */
  readonly selectionChange = output<OptionScrollerChangeEvent>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  private readonly _indicatorOffset = signal(0);
  readonly indicatorOffset = computed(() => this._indicatorOffset());

  private readonly _indicatorWidth = signal(0);
  readonly indicatorWidth = computed(() => this._indicatorWidth());

  private optionElements: HTMLButtonElement[] = [];
  private resizeObserver?: ResizeObserver;

  // ============================================
  // COMPUTED
  // ============================================

  private readonly selectedIndex = computed(() => {
    const id = this.selectedId();
    return this.options().findIndex((o) => o.id === id);
  });

  private readonly selectedOption = computed(() => {
    const idx = this.selectedIndex();
    const opts = this.options();
    return idx >= 0 ? opts[idx] : undefined;
  });

  constructor() {
    // Reactive indicator repositioning when selection or options change
    effect(() => {
      this.selectedId();
      this.options();
      if (isPlatformBrowser(this.platformId)) {
        requestAnimationFrame(() => this.updateIndicator());
      }
    });

    // DOM setup: cache elements + attach ResizeObserver (browser only)
    afterNextRender(() => {
      this.cacheOptionElements();
      this.updateIndicator();

      this.resizeObserver = new ResizeObserver(() => {
        this.cacheOptionElements();
        this.updateIndicator();
      });
      this.resizeObserver.observe(this.elementRef.nativeElement);

      this.destroyRef.onDestroy(() => this.resizeObserver?.disconnect());
    });
  }

  // ============================================
  // TEMPLATE METHODS
  // ============================================

  protected selectOption(option: OptionScrollerItem, index: number): void {
    if (option.disabled || option.id === this.selectedId()) return;

    this.selectionChange.emit({
      option,
      index,
      previousOption: this.selectedOption(),
      previousIndex: this.selectedIndex() >= 0 ? this.selectedIndex() : undefined,
      fromSwipe: false,
    });
  }

  protected navigateNext(event: Event): void {
    event.preventDefault();
    const currentIdx = this.selectedIndex();
    const opts = this.options();
    let nextIdx = currentIdx + 1;

    while (nextIdx < opts.length && opts[nextIdx].disabled) {
      nextIdx++;
    }

    if (nextIdx < opts.length) {
      this.selectOption(opts[nextIdx], nextIdx);
      this.focusOption(nextIdx);
    }
  }

  protected navigatePrev(event: Event): void {
    event.preventDefault();
    const currentIdx = this.selectedIndex();
    const opts = this.options();
    let prevIdx = currentIdx - 1;

    while (prevIdx >= 0 && opts[prevIdx].disabled) {
      prevIdx--;
    }

    if (prevIdx >= 0) {
      this.selectOption(opts[prevIdx], prevIdx);
      this.focusOption(prevIdx);
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private cacheOptionElements(): void {
    const container = this.optionsContainer();
    if (!container?.nativeElement) return;
    this.optionElements = Array.from(container.nativeElement.querySelectorAll('.scroller__option'));
  }

  private updateIndicator(): void {
    // Always re-cache DOM elements — options array may have changed
    this.cacheOptionElements();

    const idx = this.selectedIndex();
    if (idx < 0 || !this.optionElements.length) {
      this._indicatorWidth.set(0);
      return;
    }

    const element = this.optionElements[idx];
    if (!element) return;

    const containerRect = this.optionsContainer()?.nativeElement.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    if (!containerRect) return;

    this._indicatorOffset.set(elementRect.left - containerRect.left);
    this._indicatorWidth.set(elementRect.width);
  }

  private focusOption(index: number): void {
    this.optionElements[index]?.focus();
  }
}
