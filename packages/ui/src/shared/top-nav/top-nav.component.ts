/**
 * @fileoverview NxtDesktopNavComponent - Professional Desktop Top Navigation
 * @module @nxt1/ui/shared/top-nav
 * @version 1.0.0
 *
 * A professional desktop top navigation component that provides native macOS/Windows
 * desktop app appearance using NXT1's design token system.
 *
 * Design Philosophy:
 * - 2026 Native Desktop UX: Blur effects, refined hover states, smooth animations
 * - Framework Parity: Matches Figma, Notion, Linear app navigation patterns
 * - Full Design Token Integration: All colors, spacing, typography from tokens
 * - Accessibility First: Full keyboard navigation, ARIA labels, focus management
 *
 * Features:
 * - NXT1 Logo with design tokens
 * - Primary navigation items with active state detection
 * - Search bar with expandable animation
 * - Notifications bell with badge
 * - User menu dropdown with avatar
 * - Sticky/fixed positioning with optional hide-on-scroll
 * - Multiple visual variants (default, blur, transparent, elevated)
 * - Full dark/light theme support
 * - SSR-safe with proper browser guards
 *
 * Usage:
 * ```html
 * <nxt1-desktop-nav
 *   [items]="navItems"
 *   [user]="currentUser"
 *   [config]="navConfig"
 *   (navigate)="onNavigate($event)"
 *   (search)="onSearch($event)"
 *   (userMenuAction)="onUserMenuAction($event)"
 * />
 * ```
 *
 * ⭐ DESKTOP WEB ONLY - Use NxtMobileFooter for mobile ⭐
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
  ElementRef,
  OnDestroy,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { NxtLogoComponent } from '../logo';
import { NxtIconComponent } from '../icon';
import { NxtPlatformService } from '../../services/platform';
import { HapticsService } from '../../services/haptics';
import type { TopNavItem, TopNavUserMenuItem, TopNavUserData, TopNavConfig } from '@nxt1/core';
import {
  DEFAULT_TOP_NAV_ITEMS,
  DEFAULT_USER_MENU_ITEMS,
  createTopNavConfig,
  findTopNavItemByRoute,
} from '@nxt1/core';
import type {
  TopNavSelectEvent,
  TopNavUserMenuEvent,
  TopNavSearchSubmitEvent,
} from './top-nav.types';

@Component({
  selector: 'nxt1-desktop-nav',
  standalone: true,
  imports: [CommonModule, RouterModule, NxtLogoComponent, NxtIconComponent],
  templateUrl: './top-nav.component.html',
  styleUrl: './top-nav.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtDesktopNavComponent implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly platform = inject(NxtPlatformService);
  private readonly haptics = inject(HapticsService);
  private readonly elementRef = inject(ElementRef);
  private readonly destroy$ = new Subject<void>();

  // ============================================
  // INPUTS
  // ============================================

  /** Navigation items to display */
  @Input() items: TopNavItem[] = DEFAULT_TOP_NAV_ITEMS;

  /** User data for avatar/menu display */
  @Input() user: TopNavUserData | null = null;

  /** User menu items */
  @Input() userMenuItems: TopNavUserMenuItem[] = DEFAULT_USER_MENU_ITEMS;

  /** Navigation configuration */
  @Input() config: TopNavConfig = createTopNavConfig();

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emits when a nav item is selected */
  @Output() navigate = new EventEmitter<TopNavSelectEvent>();

  /** Emits when search is submitted */
  @Output() search = new EventEmitter<TopNavSearchSubmitEvent>();

  /** Emits when a user menu action is triggered */
  @Output() userMenuAction = new EventEmitter<TopNavUserMenuEvent>();

  /** Emits when notifications bell is clicked */
  @Output() notificationsClick = new EventEmitter<Event>();

  /** Emits when logo is clicked */
  @Output() logoClick = new EventEmitter<Event>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Search input value */
  readonly searchQuery = signal('');

  /** Whether search is expanded/focused */
  readonly searchExpanded = signal(false);

  /** Whether user menu dropdown is open */
  readonly userMenuOpen = signal(false);

  /** Active dropdown menu ID (for nav items with children) */
  readonly activeDropdown = signal<string | null>(null);

  /** Whether nav is hidden (scroll-to-hide) */
  readonly isHidden = signal(false);

  /** Internal active item tracking based on router */
  private readonly _activeItemId = signal<string | null>(null);

  /** Whether component is in browser */
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  /** Last scroll position for hide-on-scroll */
  private lastScrollY = 0;

  /** Scroll threshold before hiding */
  private readonly scrollThreshold = 64;

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Get the currently active nav item */
  readonly activeItem = computed(() => {
    const id = this._activeItemId();
    return this.items.find((item) => item.id === id);
  });

  /** Whether to show search bar */
  readonly showSearch = computed(() => this.config.showSearch !== false);

  /** Whether to show notifications */
  readonly showNotifications = computed(() => this.config.showNotifications !== false);

  /** Whether to show user menu */
  readonly showUserMenu = computed(() => this.config.showUserMenu !== false && this.user !== null);

  /** Whether to show compact layout (smaller desktops) */
  readonly isCompact = computed(() => this.platform.viewport().width < 1280);

  /** User initials for avatar fallback */
  readonly userInitials = computed(() => {
    if (this.user?.initials) return this.user.initials;
    if (this.user?.name) {
      const parts = this.user.name.split(' ');
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return parts[0].substring(0, 2).toUpperCase();
    }
    return 'U';
  });

  // ============================================
  // HOST BINDINGS
  // ============================================

  @HostBinding('class.nxt1-desktop-nav-host')
  readonly hostClass = true;

  @HostBinding('class.sticky')
  get isSticky(): boolean {
    return this.config.sticky !== false;
  }

  @HostBinding('class.hidden')
  get isNavHidden(): boolean {
    return this.isHidden();
  }

  @HostBinding('attr.data-variant')
  get hostVariant(): string {
    return this.config.variant || 'default';
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  constructor() {
    // Listen to route changes after render (SSR-safe)
    afterNextRender(() => {
      this.setupRouteTracking();
      this.setupScrollTracking();
      this.setupClickOutside();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Check if a nav item is currently active
   */
  isActiveItem(item: TopNavItem): boolean {
    if (item.active !== undefined) return item.active;
    return this._activeItemId() === item.id;
  }

  /**
   * Handle nav item click
   */
  onItemClick(item: TopNavItem, event: Event): void {
    if (item.disabled) {
      event.preventDefault();
      return;
    }

    // Haptic feedback
    this.haptics.impact('light');

    // Handle dropdown toggle
    if (item.children && item.children.length > 0) {
      event.preventDefault();
      this.toggleDropdown(item.id);
      return;
    }

    // Close any open dropdowns
    this.activeDropdown.set(null);
    this.userMenuOpen.set(false);

    // Emit navigation event
    const navEvent: TopNavSelectEvent = {
      item,
      event,
      timestamp: Date.now(),
    };
    this.navigate.emit(navEvent);

    // Handle internal navigation if route is provided
    if (item.route && !navEvent.preventDefault) {
      this.router.navigate([item.route]);
    } else if (item.href) {
      window.open(item.href, '_blank', 'noopener,noreferrer');
    }
  }

  /**
   * Handle dropdown item click
   */
  onDropdownItemClick(
    parentItem: TopNavItem,
    childItem: NonNullable<TopNavItem['children']>[number],
    event: Event
  ): void {
    if (childItem.disabled) {
      event.preventDefault();
      return;
    }

    this.haptics.impact('light');
    this.activeDropdown.set(null);

    if (childItem.route) {
      this.router.navigate([childItem.route]);
    } else if (childItem.href) {
      window.open(childItem.href, '_blank', 'noopener,noreferrer');
    } else if (childItem.action) {
      // Emit as navigation action
      this.navigate.emit({
        item: parentItem,
        event,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Toggle dropdown menu visibility
   */
  toggleDropdown(itemId: string): void {
    this.userMenuOpen.set(false);
    if (this.activeDropdown() === itemId) {
      this.activeDropdown.set(null);
    } else {
      this.activeDropdown.set(itemId);
    }
  }

  /**
   * Handle logo click
   */
  onLogoClick(event: Event): void {
    this.haptics.impact('light');
    this.logoClick.emit(event);

    if (this.config.logoLinksHome !== false) {
      this.router.navigate(['/']);
    }
  }

  /**
   * Handle search input change
   */
  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  /**
   * Handle search form submit
   */
  onSearchSubmit(event: Event): void {
    event.preventDefault();
    const query = this.searchQuery().trim();
    if (query) {
      this.haptics.impact('medium');
      this.search.emit({
        query,
        event,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle search focus
   */
  onSearchFocus(): void {
    this.searchExpanded.set(true);
  }

  /**
   * Handle search blur
   */
  onSearchBlur(): void {
    // Delay to allow click events on search suggestions
    setTimeout(() => {
      this.searchExpanded.set(false);
    }, 200);
  }

  /**
   * Clear search query
   */
  clearSearch(): void {
    this.searchQuery.set('');
    this.haptics.impact('light');
  }

  /**
   * Handle notifications click
   */
  onNotificationsClick(event: Event): void {
    this.haptics.impact('medium');
    this.notificationsClick.emit(event);
  }

  /**
   * Toggle user menu
   */
  toggleUserMenu(): void {
    this.activeDropdown.set(null);
    this.userMenuOpen.update((open) => !open);
    this.haptics.impact('light');
  }

  /**
   * Handle user menu item click
   */
  onUserMenuItemClick(item: TopNavUserMenuItem, event: Event): void {
    if (item.disabled) {
      event.preventDefault();
      return;
    }

    this.haptics.impact('light');
    this.userMenuOpen.set(false);

    const menuEvent: TopNavUserMenuEvent = {
      item,
      action: item.action || item.id,
      event,
      timestamp: Date.now(),
    };
    this.userMenuAction.emit(menuEvent);

    // Handle internal navigation
    if (item.route) {
      this.router.navigate([item.route]);
    }
  }

  /**
   * Keyboard navigation for nav items
   */
  onItemKeydown(event: KeyboardEvent, index: number): void {
    const items = this.items.filter((item) => !item.disabled);

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        this.focusItem((index + 1) % items.length);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.focusItem(index === 0 ? items.length - 1 : index - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.onItemClick(items[index], event);
        break;
      case 'Escape':
        this.activeDropdown.set(null);
        this.userMenuOpen.set(false);
        break;
    }
  }

  /**
   * Get tabindex for keyboard navigation
   */
  getTabIndex(item: TopNavItem, _index: number): number {
    if (item.disabled) return -1;
    return this.isActiveItem(item) ? 0 : -1;
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Set up router tracking for active item detection
   */
  private setupRouteTracking(): void {
    // Set initial active item
    this.updateActiveFromRoute(this.router.url);

    // Listen for navigation events
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event) => {
        if (event instanceof NavigationEnd) {
          this.updateActiveFromRoute(event.urlAfterRedirects);
        }
      });
  }

  /**
   * Update active item based on current route
   */
  private updateActiveFromRoute(url: string): void {
    const item = findTopNavItemByRoute(this.items, url);
    this._activeItemId.set(item?.id ?? null);
  }

  /**
   * Set up scroll tracking for hide-on-scroll behavior
   */
  private setupScrollTracking(): void {
    if (!this.isBrowser || !this.config.hideOnScroll) return;

    const onScroll = (): void => {
      const currentScrollY = window.scrollY;

      if (currentScrollY > this.lastScrollY && currentScrollY > this.scrollThreshold) {
        // Scrolling down - hide
        this.isHidden.set(true);
      } else {
        // Scrolling up - show
        this.isHidden.set(false);
      }

      this.lastScrollY = currentScrollY;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    this.destroy$.subscribe(() => {
      window.removeEventListener('scroll', onScroll);
    });
  }

  /**
   * Set up click outside handler for dropdowns
   */
  private setupClickOutside(): void {
    if (!this.isBrowser) return;

    const onClick = (event: MouseEvent): void => {
      const target = event.target as HTMLElement;
      if (!this.elementRef.nativeElement.contains(target)) {
        this.activeDropdown.set(null);
        this.userMenuOpen.set(false);
      }
    };

    document.addEventListener('click', onClick);
    this.destroy$.subscribe(() => {
      document.removeEventListener('click', onClick);
    });
  }

  /**
   * Focus a nav item by index
   */
  private focusItem(index: number): void {
    const buttons = this.elementRef.nativeElement.querySelectorAll('.nav-item-btn');
    if (buttons[index]) {
      (buttons[index] as HTMLButtonElement).focus();
    }
  }
}
