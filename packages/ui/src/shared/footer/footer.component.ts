/**
 * @fileoverview NxtMobileFooterComponent - Native Tab Bar for Mobile & Web
 * @module @nxt1/ui/shared/footer
 * @version 1.0.0
 *
 * A professional mobile footer/tab bar component that provides native iOS 18+ and
 * Material Design 3 (2026) appearance using NXT1's design token system.
 *
 * Design Philosophy:
 * - iOS 18: SF Symbols style, subtle blur, refined haptics, compact labels
 * - Android: Material You theming, motion system, predictive back gesture ready
 * - Both: Uses NXT1 design tokens for colors, spacing, and typography
 *
 * Features:
 * - Platform-adaptive styling (iOS vs Android via design tokens)
 * - Theme-aware (dark/light mode via CSS custom properties)
 * - Safe area handling for notched/Dynamic Island devices
 * - Haptic feedback on tab selection
 * - Active state animations (scale, color transitions)
 * - Badge support with animated notifications
 * - Center action button variant (floating FAB style)
 * - Configurable labels (show/hide)
 * - Route-based active state detection
 * - Keyboard accessibility (roving tabindex)
 * - SSR-safe with proper browser guards
 *
 * Usage:
 * ```html
 * <nxt1-mobile-footer
 *   [tabs]="footerTabs"
 *   [activeTabId]="currentTab"
 *   (tabSelect)="onTabSelect($event)"
 * />
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  inject,
  signal,
  computed,
  HostBinding,
  PLATFORM_ID,
  afterNextRender,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { NxtIconComponent } from '../icon';
import { NxtPlatformService } from '../../services/platform';
import { HapticsService } from '../../services/haptics';
import type { FooterTabItem, FooterConfig, FooterTabSelectEvent } from './footer.types';
import { DEFAULT_FOOTER_TABS } from './footer.types';

@Component({
  selector: 'nxt1-mobile-footer',
  standalone: true,
  imports: [CommonModule, RouterModule, NxtIconComponent],
  template: `
    <nav
      class="nxt1-footer"
      [class.ios]="isIos()"
      [class.android]="!isIos()"
      [class.hidden]="config.hidden"
      [class.show-labels]="shouldShowLabels()"
      [class.hide-labels]="!shouldShowLabels()"
      [attr.aria-label]="'Main navigation'"
      role="navigation"
    >
      <div class="footer-container">
        <!-- Main pill container with regular tabs -->
        <ul class="footer-tabs" role="tablist">
          @for (tab of regularTabs(); track tab.id; let i = $index) {
            <li
              class="footer-tab"
              [class.active]="isActiveTab(tab)"
              [class.disabled]="tab.disabled"
              role="presentation"
            >
              <button
                type="button"
                class="tab-button"
                [class.active]="isActiveTab(tab)"
                [attr.aria-selected]="isActiveTab(tab)"
                [attr.aria-label]="tab.ariaLabel || tab.label"
                [attr.aria-current]="isActiveTab(tab) ? 'page' : null"
                [attr.tabindex]="getTabIndex(tab, i)"
                [disabled]="tab.disabled"
                role="tab"
                (click)="onTabClick(tab, $event)"
                (keydown)="onTabKeydown($event, i)"
              >
                <!-- Icon -->
                <span class="tab-icon-wrapper">
                  <nxt1-icon [name]="tab.icon" [size]="22" class="tab-icon" />

                  <!-- Badge -->
                  @if (tab.badge && tab.badge > 0) {
                    <span
                      class="tab-badge"
                      [class.large]="tab.badge > 9"
                      [attr.aria-label]="tab.badge + ' notifications'"
                    >
                      {{ tab.badge > 99 ? '99+' : tab.badge }}
                    </span>
                  }
                </span>

                <!-- Label -->
                @if (shouldShowLabels()) {
                  <span class="tab-label">{{ tab.label }}</span>
                }
              </button>
            </li>
          }
        </ul>

        <!-- Action button floats outside the pill (like Slack's search) -->
        @if (actionTab(); as actionButton) {
          <div class="footer-tab action-button" role="presentation">
            <button
              type="button"
              class="tab-button"
              [class.active]="isActiveTab(actionButton)"
              [attr.aria-label]="actionButton.ariaLabel || actionButton.label"
              [style.--action-color]="actionButton.actionButtonColor"
              role="tab"
              (click)="onTabClick(actionButton, $event)"
            >
              <span class="tab-icon-wrapper">
                <span class="action-button-bg"></span>
                <nxt1-icon [name]="actionButton.icon" [size]="24" class="tab-icon" />
              </span>
            </button>
          </div>
        }
      </div>
    </nav>
  `,
  styleUrl: './footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtMobileFooterComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly platform = inject(NxtPlatformService);
  private readonly haptics = inject(HapticsService);
  private readonly destroy$ = new Subject<void>();

  // ============================================
  // INPUTS
  // ============================================

  /** Tab items to display */
  @Input() tabs: FooterTabItem[] = DEFAULT_FOOTER_TABS;

  /** Currently active tab ID (if controlling externally) */
  @Input() activeTabId?: string;

  /** Footer configuration */
  @Input() config: FooterConfig = {
    showLabels: true,
    enableHaptics: true,
    variant: 'default',
    hidden: false,
    translucent: true,
    indicatorStyle: 'none',
  };

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emits when a tab is selected */
  @Output() tabSelect = new EventEmitter<FooterTabSelectEvent>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Internal active tab tracking based on router */
  private readonly _activeTabId = signal<string | null>(null);

  /** Whether component is in browser */
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  /** Previous tab for event emission */
  private previousTab?: FooterTabItem;

  /** Focused tab index for keyboard navigation */
  private focusedTabIndex = 0;

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Platform detection - iOS or Android/Web */
  readonly isIos = computed(() => this.platform.isIOS());

  /** Whether to show labels based on config and device */
  readonly shouldShowLabels = computed(() => {
    if (this.config.showLabels !== undefined) {
      return this.config.showLabels;
    }
    // Default: show on mobile, hide on tablet
    return this.platform.isMobile();
  });

  /** Get the currently active tab */
  readonly activeTab = computed(() => {
    const id = this.activeTabId ?? this._activeTabId();
    return this.tabs.find((t) => t.id === id);
  });

  /** Regular tabs (non-action buttons) for the main pill */
  readonly regularTabs = computed(() => {
    return this.tabs.filter((tab) => !tab.isActionButton);
  });

  /** Action button tab (floats outside the pill) */
  readonly actionTab = computed(() => {
    return this.tabs.find((tab) => tab.isActionButton) ?? null;
  });

  // ============================================
  // HOST BINDINGS
  // ============================================

  @HostBinding('attr.data-platform')
  get hostPlatform(): string {
    return this.isIos() ? 'ios' : 'android';
  }

  @HostBinding('class.nxt1-mobile-footer-host')
  readonly hostClass = true;

  // ============================================
  // LIFECYCLE
  // ============================================

  constructor() {
    // Listen to route changes after render (SSR-safe)
    afterNextRender(() => {
      this.initRouteListener();
      this.detectInitialRoute();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Initialize router event listener for active tab detection
   */
  private initRouteListener(): void {
    if (!this.isBrowser) return;

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event) => {
        const navEvent = event as NavigationEnd;
        this.updateActiveTabFromRoute(navEvent.urlAfterRedirects);
      });
  }

  /**
   * Detect initial route on component init
   */
  private detectInitialRoute(): void {
    if (!this.isBrowser) return;
    this.updateActiveTabFromRoute(this.router.url);
  }

  /**
   * Update active tab based on current route
   */
  private updateActiveTabFromRoute(url: string): void {
    const matchedTab = this.tabs.find((tab) => {
      if (tab.routeExact) {
        return url === tab.route;
      }
      return url.startsWith(tab.route);
    });

    if (matchedTab) {
      this._activeTabId.set(matchedTab.id);
    }
  }

  /**
   * Trigger haptic feedback
   */
  private async triggerHaptic(): Promise<void> {
    if (!this.config.enableHaptics) return;
    await this.haptics.impact('light');
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Check if a tab is the currently active tab
   */
  isActiveTab(tab: FooterTabItem): boolean {
    const activeId = this.activeTabId ?? this._activeTabId();
    return tab.id === activeId;
  }

  /**
   * Get tab index for accessibility
   */
  getTabIndex(tab: FooterTabItem, index: number): number {
    if (tab.disabled) return -1;
    // Roving tabindex pattern
    return index === this.focusedTabIndex ? 0 : -1;
  }

  /**
   * Calculate indicator offset for underline style
   */
  getIndicatorOffset(): string {
    const activeIndex = this.tabs.findIndex((t) => this.isActiveTab(t));
    if (activeIndex === -1) return '0%';
    const tabWidth = 100 / this.tabs.length;
    return `${activeIndex * tabWidth}%`;
  }

  /**
   * Calculate indicator width
   */
  getIndicatorWidth(): string {
    return `${100 / this.tabs.length}%`;
  }

  /**
   * Handle tab click
   */
  async onTabClick(tab: FooterTabItem, event: Event): Promise<void> {
    if (tab.disabled) return;

    // Store previous tab
    this.previousTab = this.activeTab();

    // Trigger haptic feedback
    await this.triggerHaptic();

    // Update internal state
    this._activeTabId.set(tab.id);

    // Emit selection event
    this.tabSelect.emit({
      tab,
      previousTab: this.previousTab,
      event,
    });

    // Navigate (only if not handled externally)
    if (this.isBrowser && tab.route) {
      this.router.navigate([tab.route]);
    }
  }

  /**
   * Handle keyboard navigation (Arrow keys, Home, End)
   */
  onTabKeydown(event: KeyboardEvent, currentIndex: number): void {
    const enabledIndices = this.tabs.map((t, i) => (!t.disabled ? i : -1)).filter((i) => i !== -1);

    let newIndex = currentIndex;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown': {
        event.preventDefault();
        const nextEnabledIndex = enabledIndices.find((i) => i > currentIndex);
        newIndex = nextEnabledIndex ?? enabledIndices[0];
        break;
      }

      case 'ArrowLeft':
      case 'ArrowUp': {
        event.preventDefault();
        const prevEnabledIndices = enabledIndices.filter((i) => i < currentIndex);
        newIndex =
          prevEnabledIndices.length > 0
            ? prevEnabledIndices[prevEnabledIndices.length - 1]
            : enabledIndices[enabledIndices.length - 1];
        break;
      }

      case 'Home':
        event.preventDefault();
        newIndex = enabledIndices[0];
        break;

      case 'End':
        event.preventDefault();
        newIndex = enabledIndices[enabledIndices.length - 1];
        break;

      case 'Enter':
      case ' ': {
        event.preventDefault();
        const tab = this.tabs[currentIndex];
        if (tab && !tab.disabled) {
          this.onTabClick(tab, event);
        }
        return;
      }

      default:
        return;
    }

    // Update focused index and focus the tab button
    this.focusedTabIndex = newIndex;

    if (this.isBrowser) {
      const tabButtons = document.querySelectorAll('.nxt1-footer .tab-button');
      const targetButton = tabButtons[newIndex] as HTMLButtonElement;
      targetButton?.focus();
    }
  }
}
