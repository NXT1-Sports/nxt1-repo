/**
 * @fileoverview Mobile Shell Component - Native App Shell
 * @module @nxt1/mobile/core/layout
 * @version 2.0.0
 *
 * Professional app shell providing persistent bottom navigation.
 * Following Instagram, TikTok, Twitter patterns for native mobile UX.
 *
 * Architecture:
 * - Bottom tab bar persists across all screens (no re-render)
 * - Child routes render inside <router-outlet>
 * - Pages own their own headers via <nxt1-page-header>
 * - Seamless transitions between tabs
 * - Safe area handling for notched devices
 *
 * Shell Responsibilities:
 * - Persistent bottom navigation (footer)
 * - Tab state synchronization with router
 * - Haptic feedback on tab selection
 * - Safe area insets
 *
 * Page Responsibilities:
 * - Header (via NxtPageHeaderComponent)
 * - Content and scrolling
 * - Page-specific actions
 *
 * @example
 * ```typescript
 * // In app.routes.ts
 * {
 *   path: 'tabs',
 *   loadComponent: () => import('./core/layout/shell').then(m => m.MobileShellComponent),
 *   children: [
 *     { path: 'home', loadComponent: () => import('./features/home/home.component') },
 *     { path: 'discover', loadComponent: () => import('./features/discover/discover.component') },
 *   ]
 * }
 * ```
 */

import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  OnInit,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { IonRouterOutlet } from '@ionic/angular/standalone';

import {
  NxtMobileFooterComponent,
  NxtPlatformService,
  type FooterTabItem,
  type FooterTabSelectEvent,
  type FooterConfig,
  DEFAULT_FOOTER_TABS,
  findTabByRoute,
} from '@nxt1/ui';

/**
 * MobileShellComponent
 *
 * Root layout shell for all authenticated mobile screens.
 * Provides persistent bottom navigation with professional UX:
 *
 * - Footer stays mounted (no flicker on navigation)
 * - Active tab synced with current route
 * - Smooth transitions via router animations
 * - Haptic feedback on tab selection
 * - Safe area handling for notched devices
 *
 * Individual pages are responsible for their own headers using NxtPageHeaderComponent.
 */
@Component({
  selector: 'app-mobile-shell',
  standalone: true,
  imports: [CommonModule, IonRouterOutlet, NxtMobileFooterComponent],
  template: `
    <!-- Mobile Shell Container -->
    <div class="mobile-shell">
      <!-- Page Content Area - Uses IonRouterOutlet for proper Ionic page lifecycle -->
      <div class="shell-content">
        <ion-router-outlet></ion-router-outlet>
      </div>

      <!-- Persistent Bottom Navigation -->
      <nxt1-mobile-footer
        [tabs]="tabs"
        [activeTabId]="activeTabId()"
        [config]="footerConfig()"
        (tabSelect)="onTabSelect($event)"
      />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      .mobile-shell {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        position: relative;
        background: var(--nxt1-color-background-primary, var(--ion-background-color, #0a0a0a));
      }

      .shell-content {
        flex: 1;
        overflow: hidden;
        position: relative;

        /* Account for footer height + safe area + floating offset */
        padding-bottom: calc(
          var(--nxt1-footer-height, 80px) + env(safe-area-inset-bottom, 0px) + 24px
        );
      }

      /* Ensure ion-router-outlet and its pages fill available space */
      .shell-content ion-router-outlet {
        display: block;
        height: 100%;
        width: 100%;
      }

      /* ion-router-outlet uses .ion-page class for child pages */
      .shell-content ion-router-outlet .ion-page {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
      }

      /* Position footer at bottom */
      nxt1-mobile-footer {
        position: fixed;
        bottom: 20px;
        left: 0;
        right: 0;
        z-index: var(--nxt1-z-index-footer, 100);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileShellComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly platform = inject(NxtPlatformService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Tab configuration - can be customized per user role in the future
   * For now, uses the default 5-tab layout from @nxt1/ui
   */
  readonly tabs: FooterTabItem[] = DEFAULT_FOOTER_TABS;

  /** Currently active tab ID, synced with router */
  private readonly _activeTabId = signal<string>('home');
  readonly activeTabId = this._activeTabId.asReadonly();

  /** Footer configuration based on platform */
  readonly footerConfig = computed<FooterConfig>(() => {
    const isIos = this.platform.os() === 'ios';
    return {
      showLabels: true,
      enableHaptics: true,
      variant: isIos ? 'default' : 'elevated',
      hidden: false,
      translucent: isIos,
      indicatorStyle: 'none',
    };
  });

  ngOnInit(): void {
    // Sync active tab with current route on init
    this.syncActiveTabFromRoute(this.router.url);

    // Listen for route changes to update active tab
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        this.syncActiveTabFromRoute(event.urlAfterRedirects);
      });
  }

  /**
   * Handle tab selection from footer
   * Uses router.navigate for proper Angular routing with state preservation
   */
  onTabSelect(event: FooterTabSelectEvent): void {
    const { tab } = event;

    // Handle action button (Agent X) differently if needed
    if (tab.isActionButton) {
      this.handleAgentAction(tab);
      return;
    }

    // Navigate to tab route
    if (tab.route) {
      void this.router.navigate([tab.route], {
        // Preserve query params and fragment for deep linking
        queryParamsHandling: 'preserve',
        // Don't add to browser history for tab switches (cleaner back button)
        replaceUrl: false,
      });
    }
  }

  /**
   * Special handling for the center action button (Agent X)
   * Can open a modal, bottom sheet, or navigate to a dedicated page
   */
  private handleAgentAction(tab: FooterTabItem): void {
    // For now, navigate to the agent page
    // In the future, this could open a floating AI assistant modal
    if (tab.route) {
      void this.router.navigate([tab.route]);
    }
  }

  /**
   * Sync active tab based on current route
   * Matches route prefix to find the corresponding tab
   */
  private syncActiveTabFromRoute(url: string): void {
    const matchedTab = findTabByRoute(this.tabs, url);

    if (matchedTab) {
      this._activeTabId.set(matchedTab.id);
    }
  }
}

// Re-export with old name for backwards compatibility during migration
export { MobileShellComponent as TabsLayoutComponent };
