/**
 * @fileoverview NxtMobileFooterComponent - Native Ionic Tab Bar
 * @module @nxt1/ui/components/footer
 * @version 2.0.0
 *
 * Professional mobile footer/tab bar using Ionic Framework's native components
 * with NXT1 design token icons for consistent branding.
 *
 * Design Philosophy:
 * - Uses Ionic's native ion-tab-bar for proper platform behavior
 * - iOS 18: Native translucent blur, haptic feedback, SF Symbols style
 * - Android: Material You theming, proper ripple effects
 * - Both: NXT1 design token SVG icons for consistent branding
 *
 * Features:
 * - Native Ionic tab bar with automatic safe area handling
 * - Platform-adaptive styling (iOS blur vs Android elevation)
 * - Custom NXT1 SVG icons (not ionicons) for brand consistency
 * - Haptic feedback on tab selection
 * - Badge support with Ionic's native badge
 * - Center action button variant (floating FAB style)
 * - Route-based active state detection
 * - Full accessibility via Ionic's built-in ARIA
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
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { IonTabBar, IonTabButton, IonLabel, IonBadge } from '@ionic/angular/standalone';
import { NxtIconComponent } from '../icon';
import { NxtPlatformService } from '../../services/platform';
import { HapticsService } from '../../services/haptics';
import type { FooterTabItem, FooterConfig, FooterTabSelectEvent } from './footer.types';
import { DEFAULT_FOOTER_TABS } from './footer.types';

@Component({
  selector: 'nxt1-mobile-footer',
  standalone: true,
  imports: [IonTabBar, IonTabButton, IonLabel, IonBadge, NxtIconComponent],
  template: `
    <!-- Footer wrapper for pill + FAB layout -->
    <div class="footer-container">
      <!-- Floating Pill Tab Bar -->
      <ion-tab-bar
        [translucent]="config.translucent"
        [class.footer--hidden]="config.hidden"
        [class.footer--show-labels]="shouldShowLabels()"
        [class.footer--hide-labels]="!shouldShowLabels()"
        [selectedTab]="activeTabId ?? _activeTabId()"
      >
        @for (tab of regularTabs(); track tab.id) {
          <ion-tab-button
            [tab]="tab.id"
            [disabled]="tab.disabled"
            [class.tab-button--active]="isActiveTab(tab)"
            (click)="onTabClick(tab, $event)"
          >
            <!-- Custom NXT1 SVG Icon (same icon, color changes on select) -->
            <div class="tab-icon-wrapper">
              <nxt1-icon [name]="tab.icon" [size]="22" class="tab-icon" />
            </div>

            <!-- Label -->
            @if (shouldShowLabels()) {
              <ion-label>{{ tab.label }}</ion-label>
            }

            <!-- Badge -->
            @if (tab.badge && tab.badge > 0) {
              <ion-badge color="danger">
                {{ tab.badge > 99 ? '99+' : tab.badge }}
              </ion-badge>
            }
          </ion-tab-button>
        }
      </ion-tab-bar>

      <!-- FAB Button (right of pill) -->
      @if (actionTab(); as actionButton) {
        <button
          class="fab-button"
          (click)="onTabClick(actionButton, $event)"
          [attr.aria-label]="actionButton.ariaLabel ?? actionButton.label"
        >
          <nxt1-icon [name]="actionButton.icon" [size]="22" />
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        background: transparent;
      }

      /* Container for pill + FAB side by side - using global tokens */
      .footer-container {
        display: flex;
        align-items: center;
        gap: var(--nxt1-pill-gap, 8px);
        padding: 0 var(--nxt1-pill-gap, 8px);
      }

      /* Floating Pill Tab Bar - Sleeker, more compact design */
      ion-tab-bar {
        --background: #1a1a1a;
        --color: var(--nxt1-icon-inactive, #666666);
        --color-selected: var(--nxt1-icon-active, #ffffff);
        flex: 1;
        border: 1px solid var(--nxt1-glass-border, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-pill-radius, 28px);
        padding: var(--nxt1-pill-padding, 2px);
        height: var(--nxt1-pill-height, 52px);
        box-shadow: var(--nxt1-glass-shadow, 0 2px 12px rgba(0, 0, 0, 0.5));
      }

      /* Hidden state */
      .footer--hidden {
        display: none;
      }

      /* Tab Button Styling - More rounded containers */
      ion-tab-button {
        --color: var(--nxt1-icon-inactive, #666666);
        --color-selected: var(--nxt1-icon-active, #ffffff);
        --padding-top: var(--nxt1-tab-padding-y, 6px);
        --padding-bottom: var(--nxt1-tab-padding-y, 6px);
        --background: transparent;
        --background-focused: transparent;
        max-width: none;
        flex: 1;
        border-radius: var(--nxt1-tab-radius, 24px);
        margin: 2px;
        transition: background 0.2s ease;
      }

      /* Active tab background highlight - subtle */
      ion-tab-button.tab-button--active {
        --background: var(--nxt1-tab-active-bg, rgba(255, 255, 255, 0.12));
        background: var(--nxt1-tab-active-bg, rgba(255, 255, 255, 0.12));
      }

      /* Icon wrapper */
      .tab-icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        height: var(--nxt1-tab-icon-size, 22px);
      }

      /* Icon colors */
      .tab-icon {
        color: var(--nxt1-icon-inactive, #666666);
        transition: color 0.2s ease;
      }

      .tab-button--active .tab-icon {
        color: var(--nxt1-icon-active, #ffffff);
      }

      /* Label styling - more space between icon and text */
      ion-tab-button ion-label {
        font-size: var(--nxt1-tab-label-size, 10px);
        font-weight: 500;
        letter-spacing: 0.02em;
        margin-top: var(--nxt1-tab-label-gap, 4px);
        color: inherit;
      }

      .tab-button--active ion-label {
        color: var(--nxt1-icon-active, #ffffff);
      }

      /* Badge positioning */
      ion-tab-button ion-badge {
        position: absolute;
        top: 0px;
        right: calc(50% - 18px);
        font-size: 9px;
        min-width: 14px;
        height: 14px;
        padding: 0 3px;
      }

      /* Hide labels mode - even more compact */
      .footer--hide-labels ion-tab-button {
        --padding-top: 10px;
        --padding-bottom: 10px;
      }

      /* FAB Button - Using global tokens */
      .fab-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-fab-size, 48px);
        height: var(--nxt1-fab-size, 48px);
        border-radius: var(--nxt1-fab-radius, 50%);
        border: none;
        background: #ccff00;
        color: #000000;
        box-shadow: 0 2px 12px rgba(204, 255, 0, 0.35);
        cursor: pointer;
        flex-shrink: 0;
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease;
      }

      .fab-button:active {
        transform: scale(0.92);
      }

      /* iOS-specific - translucent blur using global token */
      :host-context(.ios) ion-tab-bar {
        --background: var(--nxt1-glass-bg, rgba(26, 26, 26, 0.88));
        -webkit-backdrop-filter: blur(var(--nxt1-glass-blur, 24px));
        backdrop-filter: blur(var(--nxt1-glass-blur, 24px));
      }

      /* Android/MD-specific */
      :host-context(.md) ion-tab-button {
        --ripple-color: rgba(255, 255, 255, 0.08);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtMobileFooterComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly platform = inject(NxtPlatformService);
  private readonly haptics = inject(HapticsService);
  private readonly destroyRef = inject(DestroyRef);

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
  readonly _activeTabId = signal<string | null>(null);

  /** Whether component is in browser */
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  /** Previous tab for event emission */
  private previousTab?: FooterTabItem;

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

  /** Regular tabs (non-action buttons) for the tab bar */
  readonly regularTabs = computed(() => {
    return this.tabs.filter((tab) => !tab.isActionButton);
  });

  /** Action button tab (floating FAB) */
  readonly actionTab = computed(() => {
    return this.tabs.find((tab) => tab.isActionButton) ?? null;
  });

  // ============================================
  // HOST BINDINGS
  // ============================================

  @HostBinding('class.nxt1-mobile-footer-host')
  readonly hostClass = true;

  @HostBinding('attr.data-platform')
  get hostPlatform(): 'ios' | 'android' {
    return this.isIos() ? 'ios' : 'android';
  }

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
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        this.updateActiveTabFromRoute(event.urlAfterRedirects);
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
   * Get the appropriate icon for a tab (filled when active, outline when inactive)
   */
  getTabIcon(tab: FooterTabItem): string {
    if (this.isActiveTab(tab) && tab.iconActive) {
      return tab.iconActive;
    }
    return tab.icon;
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
}
