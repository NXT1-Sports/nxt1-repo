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
import { IonTabBar, IonTabButton } from '@ionic/angular/standalone';
import { NxtIconComponent } from '../icon';
import { NxtPlatformService } from '../../services/platform';
import { HapticsService } from '../../services/haptics';
import type { FooterTabItem, FooterConfig, FooterTabSelectEvent } from './footer.types';
import { DEFAULT_FOOTER_TABS } from './footer.types';

@Component({
  selector: 'nxt1-mobile-footer',
  standalone: true,
  imports: [IonTabBar, IonTabButton, NxtIconComponent],
  template: `
    <!-- Footer wrapper for pill + FAB layout -->
    <div class="footer-container">
      <!-- Floating Pill Tab Bar -->
      <ion-tab-bar
        [translucent]="config.translucent"
        [class.footer--hidden]="config.hidden"
        [class.footer--solid]="!config.glass"
        [class.footer--glass]="config.glass"
        [class.footer--show-labels]="shouldShowLabels()"
        [class.footer--hide-labels]="!shouldShowLabels()"
        [selectedTab]="activeTabId ?? _activeTabId()"
      >
        @for (tab of regularTabs(); track tab.id) {
          <ion-tab-button
            [tab]="tab.id"
            [disabled]="tab.disabled"
            [class.tab-button--active]="isActiveTab(tab)"
            [class.has-badge]="tab.badge && tab.badge > 0"
            (click)="onTabClick(tab, $event)"
          >
            <!-- Custom NXT1 SVG Icon (same icon, color changes on select) -->
            <div class="tab-icon-wrapper">
              <nxt1-icon [name]="tab.icon" [size]="26" class="tab-icon" />

              <!-- Professional Red Dot Badge (Instagram/Twitter style) -->
              @if (tab.badge && tab.badge > 0) {
                <span class="badge-dot" aria-label="Unread notifications"></span>
              }
            </div>
          </ion-tab-button>
        }
      </ion-tab-bar>

      <!-- FAB Button (right of pill) -->
      @if (actionTab(); as actionButton) {
        <button
          class="fab-button"
          [class.fab-button--active]="isActiveTab(actionButton)"
          (click)="onTabClick(actionButton, $event)"
          [attr.aria-label]="actionButton.ariaLabel ?? actionButton.label"
        >
          <nxt1-icon [name]="actionButton.icon" [size]="26" />
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        background: transparent;

        /* iOS 26 Liquid Glass Design Tokens - 100% Theme Aware */
        --footer-glass-bg: var(--nxt1-glass-bg);
        --footer-glass-border: var(--nxt1-glass-border);
        --footer-glass-shadow: var(--nxt1-glass-shadow);
        --footer-glass-backdrop: var(--nxt1-glass-backdrop);
        --footer-icon-active: var(--nxt1-icon-active);
        --footer-icon-inactive: var(--nxt1-icon-inactive);
        --footer-tab-active-bg: var(--nxt1-tab-activeBg);
        --footer-fab-shadow: var(--nxt1-fab-shadow);
        --footer-fab-shadow-active: var(--nxt1-fab-shadowActive);
        --footer-fab-gradient-active: var(--nxt1-fab-gradientActive);
        --footer-fab-glow-active: var(--nxt1-fab-glowActive);

        /* Solid navigation tokens (from design tokens) */
        --footer-solid-bg: var(--nxt1-nav-bgSolid);
        --footer-solid-border: var(--nxt1-nav-borderSolid);
        --footer-solid-shadow: var(--nxt1-nav-shadowSolid);
      }

      /* Container for pill + FAB side by side */
      .footer-container {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-pill-gap);
        padding: 0 16px;
        background: transparent;
        max-width: 360px;
        margin: 0 auto;
      }

      /* Floating Pill Tab Bar - Base styles */
      ion-tab-bar {
        --background: var(--footer-solid-bg) !important;
        --color: var(--footer-icon-inactive);
        --color-selected: var(--footer-icon-active);
        flex: 1;
        border: 1px solid var(--footer-solid-border) !important;
        border-radius: var(--nxt1-pill-radius);
        padding: var(--nxt1-pill-padding);
        height: var(--nxt1-pill-height);
        box-shadow: var(--footer-solid-shadow);
        background: var(--footer-solid-bg) !important;
        -webkit-backdrop-filter: none !important;
        backdrop-filter: none !important;
      }

      /* Solid mode (default) - Opaque background from design tokens */
      ion-tab-bar.footer--solid {
        --background: var(--footer-solid-bg) !important;
        background: var(--footer-solid-bg) !important;
        border-color: var(--footer-solid-border) !important;
        box-shadow: var(--footer-solid-shadow);
        -webkit-backdrop-filter: none !important;
        backdrop-filter: none !important;
      }

      /* Glass mode (opt-in) - iOS 26 Liquid Glass Effect */
      ion-tab-bar.footer--glass {
        --background: var(--footer-glass-bg) !important;
        background: var(--footer-glass-bg) !important;
        border-color: var(--footer-glass-border) !important;
        box-shadow: var(--footer-glass-shadow), var(--nxt1-glass-shadowInner);
        -webkit-backdrop-filter: var(--footer-glass-backdrop) !important;
        backdrop-filter: var(--footer-glass-backdrop) !important;
      }

      /* Hidden state */
      .footer--hidden {
        display: none;
      }

      /* Tab Button Styling - Rounded containers */
      ion-tab-button {
        --color: var(--footer-icon-inactive);
        --color-selected: var(--footer-icon-active);
        --padding-top: var(--nxt1-tab-paddingY);
        --padding-bottom: var(--nxt1-tab-paddingY);
        --background: transparent;
        --background-focused: transparent;
        max-width: none;
        flex: 1;
        border-radius: var(--nxt1-tab-radius);
        margin: 1px;
        transition: background 0.2s ease;
      }

      /* Active tab background highlight */
      ion-tab-button.tab-button--active {
        --background: var(--footer-tab-active-bg);
        background: var(--footer-tab-active-bg);
      }

      /* Icon wrapper */
      .tab-icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        height: var(--nxt1-tab-iconSize);
      }

      /* Icon colors - theme aware */
      .tab-icon {
        color: var(--footer-icon-inactive);
        transition: color 0.2s ease;
      }

      .tab-button--active .tab-icon {
        color: var(--footer-icon-active);
      }

      /* Label styling */
      ion-tab-button ion-label {
        font-size: var(--nxt1-tab-labelSize);
        font-weight: 500;
        letter-spacing: 0.02em;
        margin-top: var(--nxt1-tab-labelGap);
        color: inherit;
      }

      .tab-button--active ion-label {
        color: var(--footer-icon-active);
      }

      /* Badge positioning - Professional Red Dot (Instagram/Twitter style) */
      .tab-icon-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Professional notification dot - positioned top-right of icon */
      .badge-dot {
        position: absolute;
        top: -2px;
        right: -6px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        /* Design token: badge background from design system */
        background: var(--nxt1-color-badge-background, var(--nxt1-color-error, #ef4444));
        /* Design token: badge shadow for subtle glow */
        box-shadow: 0 0 4px var(--nxt1-color-badge-shadow, rgba(239, 68, 68, 0.5));
        /* Subtle border for visibility on any background */
        border: 1.5px solid var(--nxt1-color-background-primary, #0a0a0a);
        /* Pop-in animation */
        animation: badge-dot-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        z-index: 10;
      }

      @keyframes badge-dot-pop {
        0% {
          transform: scale(0);
          opacity: 0;
        }
        50% {
          transform: scale(1.3);
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }

      /* Hide labels mode - even more compact */
      .footer--hide-labels ion-tab-button {
        --padding-top: 10px;
        --padding-bottom: 10px;
      }

      /* FAB Button - Theme-aware with semantic tokens */
      .fab-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-fab-size);
        height: var(--nxt1-fab-size);
        border-radius: var(--nxt1-fab-radius);
        border: none;
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        box-shadow: var(--footer-fab-shadow);
        cursor: pointer;
        flex-shrink: 0;
        transition:
          transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
          box-shadow 0.3s ease,
          background 0.3s ease;
        position: relative;
        overflow: visible;
      }

      /* FAB Glow ring (pseudo element) */
      .fab-button::before {
        content: '';
        position: absolute;
        inset: -3px;
        border-radius: 50%;
        background: var(--nxt1-glow-md);
        opacity: 0;
        transition: opacity 0.3s ease;
        z-index: -1;
      }

      .fab-button:active {
        transform: scale(0.92);
      }

      /* FAB Active State - Gemini AI-style gradient (theme-aware) */
      .fab-button.fab-button--active {
        background: var(
          --footer-fab-gradient-active,
          linear-gradient(135deg, #00ff88, #00ccff, #8855ff, #ff0088, #ff6600)
        );
        background-size: 200% 200%;
        animation: gemini-gradient 3s ease infinite;
        box-shadow: var(--footer-fab-shadow-active);
        color: var(--nxt1-color-text-primary);
      }

      .fab-button.fab-button--active::before {
        opacity: 1;
        background: var(
          --footer-fab-glow-active,
          linear-gradient(135deg, rgba(0, 255, 136, 0.4), rgba(204, 255, 0, 0.4))
        );
        filter: blur(12px);
        inset: -8px;
        animation: gemini-gradient 3s ease infinite;
        background-size: 200% 200%;
      }

      @keyframes gemini-gradient {
        0%,
        100% {
          background-position: 0% 50%;
        }
        50% {
          background-position: 100% 50%;
        }
      }

      /* iOS-specific - Ensure liquid glass effect only when glass mode enabled */
      :host-context(.ios) ion-tab-bar.footer--glass {
        --background: var(--footer-glass-bg) !important;
        background: var(--footer-glass-bg) !important;
        -webkit-backdrop-filter: var(--footer-glass-backdrop) !important;
        backdrop-filter: var(--footer-glass-backdrop) !important;
      }

      /* Android/MD-specific */
      :host-context(.md) ion-tab-button {
        --ripple-color: var(--nxt1-ripple-color);
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
    glass: false, // Solid background by default
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
