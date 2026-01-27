/**
 * @fileoverview Tabs Layout Shell - Mobile
 * @module @nxt1/mobile/core/layout
 *
 * Professional tab bar shell that wraps all authenticated content.
 * This is how Instagram, TikTok, Twitter, and other professional apps structure navigation.
 *
 * Architecture:
 * - Single layout component contains the footer
 * - Child routes render inside <router-outlet>
 * - Footer persists across all tab navigations (no re-render)
 * - Seamless transitions between tabs
 *
 * @example
 * ```typescript
 * // In app.routes.ts - all authenticated routes under tabs shell
 * {
 *   path: '',
 *   loadComponent: () => import('./core/layout/tabs-layout').then(m => m.TabsLayoutComponent),
 *   children: [
 *     { path: 'home', loadComponent: () => import('./features/home/home.component') },
 *     { path: 'discover', loadComponent: () => import('./features/discover/discover.component') },
 *     // ...
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
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';

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
 * TabsLayoutComponent
 *
 * Root layout shell for all authenticated mobile screens.
 * Provides persistent bottom navigation with professional UX:
 *
 * - Footer stays mounted (no flicker on navigation)
 * - Active tab synced with current route
 * - Smooth transitions via router animations
 * - Haptic feedback on tab selection
 * - Safe area handling for notched devices
 */
@Component({
  selector: 'app-tabs-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NxtMobileFooterComponent],
  template: `
    <!-- Main Content Area -->
    <div class="tabs-layout">
      <!-- Page Content (scrollable per page) -->
      <div class="tabs-content">
        <router-outlet></router-outlet>
      </div>

      <!-- Persistent Footer -->
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

      .tabs-layout {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        position: relative;
        background: var(--nxt-surface-primary, var(--ion-background-color, #fff));
      }

      .tabs-content {
        flex: 1;
        overflow: hidden;
        position: relative;

        /* Account for footer height + safe area */
        padding-bottom: calc(var(--nxt-footer-height, 49px) + env(safe-area-inset-bottom, 0px));
      }

      /* Ensure router-outlet content fills available space */
      .tabs-content ::ng-deep > * {
        display: block;
        height: 100%;
        overflow: auto;
      }

      /* Position footer at bottom */
      nxt1-mobile-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 100;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabsLayoutComponent implements OnInit {
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
