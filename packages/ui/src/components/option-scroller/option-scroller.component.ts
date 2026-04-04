/**
 * @fileoverview NxtOptionScrollerComponent - Professional Horizontal Tab Selector
 * @module @nxt1/ui/components/option-scroller
 * @version 1.0.0
 *
 * Enterprise-grade horizontal option scroller following Twitter/TikTok patterns.
 * Supports both tap selection and swipe gestures with smooth animations.
 *
 * Features:
 * - Twitter/TikTok style sliding indicator animation
 * - Swipe gesture support for navigation
 * - Multiple visual variants (underline, pill, minimal)
 * - Spring physics animation option
 * - Badge support for notifications
 * - Haptic feedback on selection
 * - Full accessibility support (ARIA tabs pattern)
 * - Design token integration
 * - Platform-aware styling
 *
 * @example
 * ```html
 * <!-- Basic usage (Twitter style) -->
 * <nxt1-option-scroller
 *   [options]="[
 *     { id: 'for-you', label: 'For You' },
 *     { id: 'following', label: 'Following' }
 *   ]"
 *   [selectedId]="selectedTab()"
 *   (selectionChange)="onTabChange($event)"
 * />
 *
 * <!-- Pill variant (TikTok style) -->
 * <nxt1-option-scroller
 *   [options]="feedOptions"
 *   [selectedId]="'trending'"
 *   [config]="{ variant: 'pill' }"
 *   (selectionChange)="onTabChange($event)"
 * />
 *
 * <!-- With badges -->
 * <nxt1-option-scroller
 *   [options]="[
 *     { id: 'all', label: 'All' },
 *     { id: 'mentions', label: 'Mentions', badge: 3 }
 *   ]"
 *   [selectedId]="'all'"
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
  AfterViewInit,
  OnDestroy,
  ViewChild,
  effect,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { IonIcon, IonBadge } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronForward, chevronBack } from 'ionicons/icons';

import { HapticsService } from '../../services/haptics';
import type {
  OptionScrollerItem,
  OptionScrollerConfig,
  OptionScrollerChangeEvent,
  OptionScrollerSize,
  OptionScrollerVariant,
} from './option-scroller.types';
import { DEFAULT_OPTION_SCROLLER_CONFIG } from './option-scroller.types';

// Register icons
@Component({
  selector: 'nxt1-option-scroller',
  standalone: true,
  imports: [CommonModule, IonIcon, IonBadge],
  template: `
    <div
      class="option-scroller"
      [class.option-scroller--default]="variant() === 'default'"
      [class.option-scroller--pill]="variant() === 'pill'"
      [class.option-scroller--minimal]="variant() === 'minimal'"
      [class.option-scroller--sm]="size() === 'sm'"
      [class.option-scroller--md]="size() === 'md'"
      [class.option-scroller--lg]="size() === 'lg'"
      [class.option-scroller--stretch]="mergedConfig().stretchToFill"
      [class.option-scroller--centered]="mergedConfig().centered"
      [class.option-scroller--scrollable]="mergedConfig().scrollable"
      [class.option-scroller--divider]="mergedConfig().showDivider"
      role="tablist"
      [attr.aria-label]="ariaLabel()"
    >
      <!-- Options Container -->
      <div #optionsContainer class="option-scroller__container">
        <!-- Sliding Indicator (for default/pill variants) -->
        @if (variant() !== 'minimal' && options().length > 0) {
          <div
            class="option-scroller__indicator"
            [class.option-scroller__indicator--spring]="mergedConfig().indicatorStyle === 'spring'"
            [style.width.px]="indicatorWidth()"
            [style.transform]="'translateX(' + indicatorOffset() + 'px)'"
            [style.background-color]="mergedConfig().indicatorColor || null"
          ></div>
        }

        <!-- Option Buttons -->
        @for (option of options(); track option.id; let i = $index) {
          <button
            #optionButton
            type="button"
            class="option-scroller__option"
            [class.option-scroller__option--active]="option.id === selectedId()"
            [class.option-scroller__option--disabled]="option.disabled"
            [disabled]="option.disabled"
            [attr.role]="'tab'"
            [attr.aria-selected]="option.id === selectedId()"
            [attr.aria-controls]="'panel-' + option.id"
            [attr.tabindex]="option.id === selectedId() ? 0 : -1"
            [style.color]="getOptionColor(option)"
            (click)="selectOption(option, i, false)"
            (keydown.enter)="selectOption(option, i, false)"
            (keydown.space)="selectOption(option, i, false); $event.preventDefault()"
            (keydown.arrowRight)="navigateNext($event)"
            (keydown.arrowLeft)="navigatePrev($event)"
          >
            @if (option.icon) {
              <ion-icon [name]="option.icon" class="option-scroller__icon"></ion-icon>
            }
            <span class="option-scroller__label">{{ option.label }}</span>
            @if (option.badge && option.badge > 0) {
              <ion-badge class="option-scroller__badge" color="danger">
                {{ option.badge > 99 ? '99+' : option.badge }}
              </ion-badge>
            }
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         OPTION SCROLLER - Design System Tokens
         ============================================ */

      :host {
        display: block;
        width: 100%;
      }

      .option-scroller {
        position: relative;
        width: 100%;
        background: var(--nxt1-color-surface-primary, var(--ion-background-color));
      }

      /* Divider at bottom */
      .option-scroller--divider {
        border-bottom: 0.55px solid var(--nxt1-color-border-secondary, rgba(255, 255, 255, 0.1));
      }

      /* ============================================
         CONTAINER
         ============================================ */

      .option-scroller__container {
        position: relative;
        display: flex;
        align-items: stretch;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .option-scroller__container::-webkit-scrollbar {
        display: none;
      }

      .option-scroller--scrollable .option-scroller__container {
        overflow-x: auto;
        /* Tell the browser this container handles horizontal panning.
           This prevents the browser from firing click on a different element
           (e.g. the wrong tab) after the user drags/scrolls the tab bar. */
        touch-action: pan-x;
      }

      .option-scroller--stretch .option-scroller__container {
        width: 100%;
      }

      .option-scroller--centered .option-scroller__container {
        justify-content: center;
      }

      /* ============================================
         SIZE VARIANTS
         ============================================ */

      .option-scroller--sm {
        --scroller-height: 40px;
        --scroller-font-size: 13px;
        --scroller-padding: 12px;
      }

      .option-scroller--md {
        --scroller-height: 48px;
        --scroller-font-size: 15px;
        --scroller-padding: 16px;
      }

      /* Explore-style scrollable rows: tighten spacing between items */
      .option-scroller--scrollable.option-scroller--md {
        --scroller-padding: 12px;
      }

      .option-scroller--lg {
        --scroller-height: 56px;
        --scroller-font-size: 17px;
        --scroller-padding: 20px;
      }

      /* ============================================
         OPTION BUTTONS
         ============================================ */

      .option-scroller__option {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-1, 4px);
        height: var(--scroller-height);
        padding: 0 var(--scroller-padding);
        background: transparent;
        border: none;
        cursor: pointer;
        font-family: var(--nxt1-font-family-brand, var(--ion-font-family));
        font-size: var(--scroller-font-size);
        font-weight: var(--nxt1-font-weight-semibold, 600);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        white-space: nowrap;
        transition: color 0.2s ease;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        z-index: 1;
      }

      .option-scroller--stretch .option-scroller__option {
        flex: 1;
      }

      .option-scroller__option:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #a3e635);
        outline-offset: -2px;
        border-radius: var(--nxt1-radius-sm, 4px);
      }

      .option-scroller__option--active {
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .option-scroller__option--disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .option-scroller__option:active:not(.option-scroller__option--disabled) {
        opacity: 0.7;
      }

      /* Icon */
      .option-scroller__icon {
        font-size: calc(var(--scroller-font-size) + 2px);
        flex-shrink: 0;
      }

      /* Label */
      .option-scroller__label {
        position: relative;
      }

      /* Badge */
      .option-scroller__badge {
        --padding-start: 5px;
        --padding-end: 5px;
        font-size: 10px;
        min-width: 16px;
        height: 16px;
        margin-left: var(--nxt1-spacing-1, 4px);
      }

      /* ============================================
         INDICATOR - Default (Underline) Variant
         ============================================ */

      .option-scroller--default .option-scroller__indicator {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: var(--nxt1-color-primary, #a3e635);
        border-radius: var(--nxt1-radius-full, 9999px) var(--nxt1-radius-full, 9999px) 0 0;
        transition:
          transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
          width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        will-change: transform, width;
      }

      .option-scroller--default .option-scroller__indicator--spring {
        transition:
          transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
          width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }

      /* ============================================
         INDICATOR - Pill Variant
         ============================================ */

      .option-scroller--pill .option-scroller__container {
        padding: var(--nxt1-spacing-1, 4px);
        background: var(--nxt1-color-surface-secondary, rgba(255, 255, 255, 0.05));
        border-radius: var(--nxt1-radius-lg, 12px);
        margin: var(--nxt1-spacing-2, 8px);
      }

      .option-scroller--pill .option-scroller__indicator {
        position: absolute;
        top: var(--nxt1-spacing-1, 4px);
        bottom: var(--nxt1-spacing-1, 4px);
        left: 0;
        background: var(--nxt1-color-surface-elevated, rgba(255, 255, 255, 0.1));
        border-radius: var(--nxt1-radius-md, 8px);
        transition:
          transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
          width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        will-change: transform, width;
      }

      .option-scroller--pill .option-scroller__indicator--spring {
        transition:
          transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
          width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .option-scroller--pill .option-scroller__option {
        border-radius: var(--nxt1-radius-md, 8px);
        height: calc(var(--scroller-height) - var(--nxt1-spacing-2, 8px));
      }

      /* ============================================
         MINIMAL VARIANT
         ============================================ */

      .option-scroller--minimal .option-scroller__option--active {
        color: var(--nxt1-color-primary, #a3e635);
      }

      /* ============================================
         RESPONSIVE
         ============================================ */

      @media (max-width: 320px) {
        .option-scroller--md {
          --scroller-font-size: 14px;
          --scroller-padding: 12px;
        }
      }

      /* ============================================
         REDUCED MOTION
         ============================================ */

      @media (prefers-reduced-motion: reduce) {
        .option-scroller__indicator {
          transition: none;
        }

        .option-scroller__option {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtOptionScrollerComponent implements AfterViewInit, OnDestroy {
  private readonly haptics = inject(HapticsService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly elementRef = inject(ElementRef);

  @ViewChild('optionsContainer') optionsContainer!: ElementRef<HTMLElement>;

  // ============================================
  // INPUTS
  // ============================================

  /** Array of options to display */
  readonly options = input.required<OptionScrollerItem[]>();

  /** Currently selected option ID */
  readonly selectedId = input<string>('');

  /** Configuration options */
  readonly configInput = input<Partial<OptionScrollerConfig>>({}, { alias: 'config' });

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

  /** Indicator position (pixels from left) */
  private readonly _indicatorOffset = signal(0);
  readonly indicatorOffset = computed(() => this._indicatorOffset());

  /** Indicator width (pixels) */
  private readonly _indicatorWidth = signal(0);
  readonly indicatorWidth = computed(() => this._indicatorWidth());

  /** Touch tracking */
  private touchStartX = 0;
  private touchStartY = 0;
  private isSwiping = false;
  private swipeThreshold = 50;

  /** Element refs for options */
  private optionElements: HTMLButtonElement[] = [];

  /** ResizeObserver for recalculating indicator */
  private resizeObserver?: ResizeObserver;

  /** Bound event handlers for cleanup */
  private boundTouchStart = this.onTouchStart.bind(this);
  private boundTouchMove = this.onTouchMove.bind(this);
  private boundTouchEnd = this.onTouchEnd.bind(this);

  // ============================================
  // COMPUTED
  // ============================================

  /** Merged configuration with defaults */
  readonly mergedConfig = computed(() => ({
    ...DEFAULT_OPTION_SCROLLER_CONFIG,
    ...this.configInput(),
  }));

  /** Current variant */
  readonly variant = computed<OptionScrollerVariant>(() => this.mergedConfig().variant);

  /** Current size */
  readonly size = computed<OptionScrollerSize>(() => this.mergedConfig().size);

  /** Currently selected index */
  readonly selectedIndex = computed(() => {
    const id = this.selectedId();
    const opts = this.options();
    return opts.findIndex((o) => o.id === id);
  });

  /** Currently selected option */
  readonly selectedOption = computed(() => {
    const idx = this.selectedIndex();
    const opts = this.options();
    return idx >= 0 ? opts[idx] : undefined;
  });

  constructor() {
    addIcons({ chevronForward, chevronBack });
    // Effect to update indicator when selection or options change
    effect(() => {
      // Read signals to establish reactive dependency
      this.selectedId();
      this.options();
      // Double-rAF: first frame lets Angular commit DOM changes,
      // second frame lets the browser fully paint/layout so measurements
      // (getBoundingClientRect) are stable — critical on mobile.
      if (isPlatformBrowser(this.platformId)) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.cacheOptionElements();
            this.updateIndicator();
          });
        });
      }
    });
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Initial indicator position
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.cacheOptionElements();
        this.updateIndicator();
      });
    });

    // Watch for resize changes
    this.resizeObserver = new ResizeObserver(() => {
      this.cacheOptionElements();
      this.updateIndicator();
    });
    this.resizeObserver.observe(this.elementRef.nativeElement);

    // Add passive touch event listeners (avoids Chrome violations)
    const container = this.optionsContainer?.nativeElement;
    if (container) {
      container.addEventListener('touchstart', this.boundTouchStart, { passive: true });
      container.addEventListener('touchmove', this.boundTouchMove, { passive: true });
      container.addEventListener('touchend', this.boundTouchEnd, { passive: true });
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();

    // Clean up touch event listeners
    const container = this.optionsContainer?.nativeElement;
    if (container) {
      container.removeEventListener('touchstart', this.boundTouchStart);
      container.removeEventListener('touchmove', this.boundTouchMove);
      container.removeEventListener('touchend', this.boundTouchEnd);
    }
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Select an option programmatically or via user interaction
   */
  selectOption(option: OptionScrollerItem, index: number, fromSwipe: boolean): void {
    if (option.disabled) return;
    if (option.id === this.selectedId()) return;

    // Haptic feedback
    void this.haptics.impact('light');

    const previousOption = this.selectedOption();
    const previousIndex = this.selectedIndex();

    // Emit change event
    this.selectionChange.emit({
      option,
      index,
      previousOption,
      previousIndex: previousIndex >= 0 ? previousIndex : undefined,
      fromSwipe,
    });
  }

  /**
   * Navigate to next option (keyboard navigation)
   */
  navigateNext(event: Event): void {
    // Only preventDefault for non-touch events (passive listeners don't allow it)
    if (!(event instanceof TouchEvent)) {
      event.preventDefault();
    }
    const currentIdx = this.selectedIndex();
    const opts = this.options();
    let nextIdx = currentIdx + 1;

    // Find next non-disabled option
    while (nextIdx < opts.length && opts[nextIdx].disabled) {
      nextIdx++;
    }

    if (nextIdx < opts.length) {
      this.selectOption(opts[nextIdx], nextIdx, false);
      this.focusOption(nextIdx);
    }
  }

  /**
   * Navigate to previous option (keyboard navigation)
   */
  navigatePrev(event: Event): void {
    // Only preventDefault for non-touch events (passive listeners don't allow it)
    if (!(event instanceof TouchEvent)) {
      event.preventDefault();
    }
    const currentIdx = this.selectedIndex();
    const opts = this.options();
    let prevIdx = currentIdx - 1;

    // Find previous non-disabled option
    while (prevIdx >= 0 && opts[prevIdx].disabled) {
      prevIdx--;
    }

    if (prevIdx >= 0) {
      this.selectOption(opts[prevIdx], prevIdx, false);
      this.focusOption(prevIdx);
    }
  }

  /**
   * Get color for an option based on active state and config
   */
  getOptionColor(option: OptionScrollerItem): string | null {
    const config = this.mergedConfig();
    const isActive = option.id === this.selectedId();

    if (isActive && config.activeTextColor) {
      return config.activeTextColor;
    }
    if (!isActive && config.inactiveTextColor) {
      return config.inactiveTextColor;
    }
    return null;
  }

  // ============================================
  // TOUCH HANDLING (Swipe Gestures)
  // ============================================

  onTouchStart(event: TouchEvent): void {
    if (!this.mergedConfig().swipeEnabled) return;

    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
    this.isSwiping = false;
  }

  onTouchMove(event: TouchEvent): void {
    if (!this.mergedConfig().swipeEnabled) return;

    const deltaX = event.touches[0].clientX - this.touchStartX;
    const deltaY = event.touches[0].clientY - this.touchStartY;

    // Only track horizontal swipes (not vertical scrolling)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      this.isSwiping = true;
    }
  }

  onTouchEnd(event: TouchEvent): void {
    if (!this.mergedConfig().swipeEnabled || !this.isSwiping) return;

    // When the tab bar itself is scrollable, the user drags the tab bar to
    // reveal off-screen tabs.  That horizontal drag must NOT also fire swipe
    // section-navigation — those two interactions conflict and cause the
    // indicator to land on the wrong option.
    if (this.mergedConfig().scrollable) {
      this.isSwiping = false;
      return;
    }

    const deltaX = event.changedTouches[0].clientX - this.touchStartX;

    if (Math.abs(deltaX) > this.swipeThreshold) {
      if (deltaX > 0) {
        // Swipe right → previous
        this.navigatePrev(event);
      } else {
        // Swipe left → next
        this.navigateNext(event);
      }
    }

    this.isSwiping = false;
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Cache option element references
   */
  private cacheOptionElements(): void {
    if (!this.optionsContainer?.nativeElement) return;
    this.optionElements = Array.from(
      this.optionsContainer.nativeElement.querySelectorAll('.option-scroller__option')
    );
  }

  /**
   * Update indicator position and width
   */
  private updateIndicator(): void {
    const idx = this.selectedIndex();
    if (idx < 0 || !this.optionElements.length) {
      this._indicatorWidth.set(0);
      return;
    }

    const element = this.optionElements[idx];
    if (!element) return;

    const containerRect = this.optionsContainer?.nativeElement.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    if (!containerRect) return;

    // Calculate offset relative to container
    const offset = elementRect.left - containerRect.left;
    const scrollLeft = this.optionsContainer?.nativeElement.scrollLeft || 0;

    this._indicatorOffset.set(offset + scrollLeft);
    this._indicatorWidth.set(elementRect.width);

    // Scroll the selected option into view (for scrollable tab bars)
    this.scrollOptionIntoView(element);
  }

  /**
   * Smoothly scroll the selected option into full view within the container.
   * No-op when the element is already fully visible.
   */
  private scrollOptionIntoView(element: HTMLButtonElement): void {
    const container = this.optionsContainer?.nativeElement;
    if (!container || container.scrollWidth <= container.clientWidth) return;

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;

    const elementLogicalLeft = elementRect.left - containerRect.left + scrollLeft;
    const elementLogicalRight = elementLogicalLeft + elementRect.width;

    if (elementLogicalLeft < scrollLeft) {
      container.scrollTo({ left: elementLogicalLeft - 16, behavior: 'smooth' });
    } else if (elementLogicalRight > scrollLeft + container.clientWidth) {
      container.scrollTo({
        left: elementLogicalRight - container.clientWidth + 16,
        behavior: 'smooth',
      });
    }
  }

  /**
   * Focus a specific option (for keyboard navigation)
   */
  private focusOption(index: number): void {
    const element = this.optionElements[index];
    if (element) {
      element.focus();
    }
  }
}
