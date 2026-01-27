/**
 * @fileoverview MainLayoutComponent - Desktop Web App Shell
 * @module @nxt1/web/core/layout
 * @version 1.0.0
 *
 * Professional app shell providing consistent navigation experience.
 * Following 2026 best practices from apps like Linear, Notion, Figma.
 *
 * Architecture:
 * - Top navigation bar (desktop)
 * - Main content area with proper spacing
 * - Responsive: hides top nav on mobile (use mobile footer instead)
 * - SSR-safe with proper hydration
 *
 * Performance:
 * - OnPush change detection
 * - Signal-based state management
 * - Lazy-loaded child routes
 * - Minimal DOM with CSS-based responsiveness
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import {
  NxtDesktopNavComponent,
  NxtPlatformService,
  type TopNavItem,
  type TopNavUserData,
  type TopNavUserMenuItem,
  type TopNavConfig,
  type TopNavSelectEvent,
  type TopNavUserMenuEvent,
  createTopNavConfig,
} from '@nxt1/ui';
import { AuthFlowService } from '../../features/auth/services';

// ============================================
// NAV CONFIGURATION
// ============================================

/**
 * Desktop navigation items - Main menu
 */
const DESKTOP_NAV_ITEMS: TopNavItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: 'home',
    route: '/home',
  },
  {
    id: 'explore',
    label: 'Explore',
    icon: 'compass',
    route: '/explore',
  },
  {
    id: 'rankings',
    label: 'Rankings',
    icon: 'trophy',
    route: '/rankings',
  },
  {
    id: 'colleges',
    label: 'Colleges',
    icon: 'graduationCap',
    route: '/colleges',
  },
  {
    id: 'messages',
    label: 'Messages',
    icon: 'messages',
    route: '/messages',
    badge: 3, // Demo badge
  },
];

/**
 * User menu dropdown items
 */
const USER_MENU_ITEMS: TopNavUserMenuItem[] = [
  { id: 'profile', label: 'View Profile', icon: 'user' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'help', label: 'Help & Support', icon: 'help' },
  { id: 'logout', label: 'Sign Out', icon: 'logout', variant: 'danger', divider: true },
];

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NxtDesktopNavComponent],
  template: `
    <!-- Desktop Top Navigation -->
    <nxt1-desktop-nav
      [items]="navItems"
      [user]="userData()"
      [userMenuItems]="userMenuItems"
      [config]="navConfig"
      (navigate)="onNavigate($event)"
      (userMenuAction)="onUserMenuAction($event)"
      (notificationsClick)="onNotificationsClick()"
      (logoClick)="onLogoClick()"
    />

    <!-- Main Content Area -->
    <main class="main-content" [class.with-nav]="showNav()">
      <router-outlet />
    </main>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        min-height: 100dvh;
        background: var(--nxt1-color-background-primary, #0a0a0a);
      }

      .main-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        /* No padding - let child pages control their own padding */
      }

      /* Add top padding when nav is visible (desktop) */
      .main-content.with-nav {
        padding-top: var(--nxt1-nav-height, 56px);
      }

      /* On mobile, hide the padding since nav is hidden */
      @media (max-width: 768px) {
        .main-content.with-nav {
          padding-top: 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly platform = inject(NxtPlatformService);
  private readonly authFlow = inject(AuthFlowService);
  private readonly destroy$ = new Subject<void>();

  // ============================================
  // NAVIGATION CONFIG
  // ============================================

  /** Navigation items */
  readonly navItems = DESKTOP_NAV_ITEMS;

  /** User menu items */
  readonly userMenuItems = USER_MENU_ITEMS;

  /** Navigation configuration */
  readonly navConfig: TopNavConfig = createTopNavConfig({
    variant: 'default',
    showSearch: true,
    showNotifications: true,
    sticky: true,
    hideOnScroll: false,
    bordered: true,
  });

  // ============================================
  // STATE
  // ============================================

  /** Current route for active state detection */
  private readonly _currentRoute = signal('/home');

  /** Whether to show the nav (desktop only) */
  readonly showNav = computed(() => {
    // Always show on desktop, the component itself handles hiding on mobile via CSS
    return true;
  });

  /** User data for the nav avatar/menu */
  readonly userData = computed<TopNavUserData | null>(() => {
    const user = this.authFlow.user();
    if (!user) return null;

    return {
      name: user.displayName || user.email?.split('@')[0] || 'User',
      email: user.email || undefined,
      avatarUrl: user.photoURL || undefined,
      verified: false, // Can be connected to user's verification status
      roleBadge: undefined, // Can show 'Athlete', 'Coach', etc.
    };
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    this.setupRouteTracking();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============================================
  // NAVIGATION HANDLERS
  // ============================================

  /**
   * Handle nav item selection
   */
  onNavigate(event: TopNavSelectEvent): void {
    const { item } = event;

    if (item.route) {
      this.router.navigate([item.route]);
    }
  }

  /**
   * Handle user menu action
   */
  onUserMenuAction(event: TopNavUserMenuEvent): void {
    const { item } = event;

    switch (item.id) {
      case 'profile':
        this.router.navigate(['/profile']);
        break;
      case 'settings':
        this.router.navigate(['/settings']);
        break;
      case 'help':
        this.router.navigate(['/help']);
        break;
      case 'logout':
        this.signOut();
        break;
    }
  }

  /**
   * Handle notifications bell click
   */
  onNotificationsClick(): void {
    this.router.navigate(['/notifications']);
  }

  /**
   * Handle logo click - navigate to home
   */
  onLogoClick(): void {
    this.router.navigate(['/home']);
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Track route changes for nav active state
   */
  private setupRouteTracking(): void {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event) => {
        this._currentRoute.set(event.urlAfterRedirects);
      });

    // Set initial route
    this._currentRoute.set(this.router.url);
  }

  /**
   * Sign out user
   */
  private async signOut(): Promise<void> {
    try {
      await this.authFlow.signOut();
      this.router.navigate(['/auth/login']);
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  }
}
