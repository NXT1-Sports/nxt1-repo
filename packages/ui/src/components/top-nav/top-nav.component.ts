/**
 * @fileoverview NxtHeaderComponent - Professional Responsive Navigation
 * @module @nxt1/ui/components/top-nav
 * @version 2.0.0
 *
 * A professional responsive navigation component that provides native app
 * appearance on all screen sizes using NXT1's design token system.
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
  selector: 'nxt1-header',
  standalone: true,
  imports: [CommonModule, RouterModule, NxtLogoComponent, NxtIconComponent],
  template: `
    <!--
      NxtHeaderComponent Template
      Professional 2026 Responsive Navigation with Design Token Integration

      Styling Strategy:
      - Tailwind: Layout, spacing, flexbox, responsive breakpoints
      - CSS Variables: Colors, theming (via navigation.css)
      - Component CSS: States, animations, transitions
    -->

    <header
      class="nxt1-desktop-nav"
      [class.blur]="config.variant === 'blur'"
      [class.transparent]="config.variant === 'transparent'"
      [class.elevated]="config.variant === 'elevated'"
      [class.minimal]="config.variant === 'minimal'"
      [class.bordered]="config.bordered !== false"
      [class.hidden]="isHidden()"
      [class.mobile-menu-open]="mobileMenuOpen()"
      role="banner"
    >
      <!-- Nav Container: max-width centered -->
      <div
        class="nav-container relative flex h-full w-full items-center gap-6 px-6"
        [class.max-w-[1536px]]="config.maxWidth !== 'full'"
      >
        <!-- ============================================
             LOGO SECTION (Small, Left-Aligned)
             ============================================ -->
        @if (config.showLogo !== false) {
          <div class="nav-logo z-[2] flex-shrink-0">
            <button
              type="button"
              class="logo-btn"
              aria-label="Go to home"
              (click)="onLogoClick($event)"
            >
              <nxt1-logo [size]="'sm'" variant="header" />
            </button>
          </div>
        }

        <!-- ============================================
             PRIMARY NAVIGATION / CENTERED SEARCH (hidden on mobile)
             ============================================ -->
        <nav
          class="nav-primary absolute left-1/2 z-[1] hidden h-full -translate-x-1/2 items-center md:flex"
          role="navigation"
          aria-label="Main navigation"
        >
          <!-- When sidebar mode (showLogo=false), show centered search bar -->
          @if (config.showLogo === false && showSearch()) {
            <div class="nav-search-centered relative w-[400px] lg:w-[500px] xl:w-[600px]">
              <form
                class="search-form relative flex items-center"
                (submit)="onSearchSubmit($event)"
              >
                <nxt1-icon
                  name="searchSparkle"
                  class="search-icon search-icon--ai pointer-events-none absolute left-4"
                  size="20"
                />
                <input
                  type="search"
                  class="search-input search-input--centered"
                  [placeholder]="config.searchPlaceholder || 'Search athletes, teams...'"
                  [value]="searchQuery()"
                  autocomplete="off"
                  spellcheck="false"
                  (input)="onSearchInput($event)"
                  (focus)="onSearchFocus()"
                  (blur)="onSearchBlur()"
                />
                @if (searchQuery()) {
                  <button
                    type="button"
                    class="search-clear absolute right-3 flex h-7 w-7 items-center justify-center rounded-full p-0"
                    aria-label="Clear search"
                    (click)="clearSearch()"
                  >
                    <nxt1-icon name="close" size="18" />
                  </button>
                }
              </form>
            </div>
          } @else {
            <!-- Standard nav items when not in sidebar mode -->
            <ul class="nav-list m-0 flex h-full list-none items-center gap-1 p-0" role="menubar">
              @for (item of items; track item.id; let i = $index) {
                @if (item.showOnMobile !== false) {
                  <li
                    class="nav-item relative flex h-full items-center"
                    [class.active]="isActiveItem(item)"
                    [class.featured]="item.featured"
                    [class.has-dropdown]="item.children && item.children.length > 0"
                    [class.dropdown-open]="activeDropdown() === item.id"
                    role="none"
                  >
                    <!-- Nav Item Button -->
                    <button
                      type="button"
                      class="nav-item-btn"
                      [class.active]="isActiveItem(item)"
                      [class.featured]="item.featured"
                      [attr.aria-expanded]="item.children ? activeDropdown() === item.id : null"
                      [attr.aria-haspopup]="item.children ? 'menu' : null"
                      [attr.aria-current]="isActiveItem(item) ? 'page' : null"
                      [attr.aria-label]="item.ariaLabel || item.label"
                      [attr.tabindex]="getTabIndex(item, i)"
                      [disabled]="item.disabled"
                      role="menuitem"
                      (click)="onItemClick(item, $event)"
                      (keydown)="onItemKeydown($event, i)"
                    >
                      <!-- Icon (optional) -->
                      @if (item.icon) {
                        <nxt1-icon
                          [name]="isActiveItem(item) ? item.icon + 'Filled' : item.icon"
                          class="nav-item-icon"
                          [class.active]="isActiveItem(item)"
                          size="20"
                        />
                      }

                      <!-- Label -->
                      <span class="nav-item-label">{{ item.label }}</span>

                      <!-- Badge -->
                      @if (item.badge && item.badge > 0) {
                        <span
                          class="nav-item-badge"
                          [attr.aria-label]="item.badge + ' notifications'"
                        >
                          {{ item.badge > 99 ? '99+' : item.badge }}
                        </span>
                      }

                      <!-- Dropdown Indicator -->
                      @if (item.children && item.children.length > 0) {
                        <nxt1-icon
                          name="chevronDown"
                          class="nav-item-chevron"
                          [class.open]="activeDropdown() === item.id"
                          size="16"
                        />
                      }
                    </button>

                    <!-- Dropdown Menu -->
                    @if (item.children && item.children.length > 0) {
                      <div
                        class="nav-dropdown"
                        [class.open]="activeDropdown() === item.id"
                        role="menu"
                        [attr.aria-label]="item.label + ' submenu'"
                      >
                        <ul class="dropdown-list m-0 list-none p-1">
                          @for (child of item.children; track child.id) {
                            @if (child.divider) {
                              <li class="dropdown-divider" role="separator"></li>
                            }
                            <li role="none">
                              <button
                                type="button"
                                class="dropdown-item"
                                [class.disabled]="child.disabled"
                                [disabled]="child.disabled"
                                role="menuitem"
                                (click)="onDropdownItemClick(item, child, $event)"
                              >
                                @if (child.icon) {
                                  <nxt1-icon
                                    [name]="child.icon"
                                    class="dropdown-icon flex-shrink-0"
                                    size="18"
                                  />
                                }
                                <div class="dropdown-content flex flex-col gap-0.5">
                                  <span class="dropdown-label leading-tight">{{
                                    child.label
                                  }}</span>
                                  @if (child.description) {
                                    <span class="dropdown-description text-xs leading-snug">{{
                                      child.description
                                    }}</span>
                                  }
                                </div>
                              </button>
                            </li>
                          }
                        </ul>
                      </div>
                    }

                    <!-- Active Indicator -->
                    @if (isActiveItem(item) && !item.featured) {
                      <span class="nav-active-indicator" aria-hidden="true"></span>
                    }
                  </li>
                }
              }
            </ul>
          }
        </nav>

        <!-- ============================================
             ACTIONS SECTION
             ============================================ -->
        <div class="nav-actions z-[2] ml-auto flex flex-shrink-0 items-center gap-3">
          <!-- Search Bar (only when NOT in sidebar mode - sidebar mode has centered search) -->
          @if (showSearch() && config.showLogo !== false) {
            <div
              class="nav-search relative hidden w-[200px] transition-[width] duration-200 md:block"
              [class.expanded]="searchExpanded()"
              [class.!w-[320px]]="searchExpanded()"
            >
              <form
                class="search-form relative flex items-center"
                (submit)="onSearchSubmit($event)"
              >
                <nxt1-icon
                  name="search"
                  class="search-icon pointer-events-none absolute left-3"
                  size="18"
                />
                <input
                  type="search"
                  class="search-input"
                  [placeholder]="config.searchPlaceholder || 'Search...'"
                  [value]="searchQuery()"
                  autocomplete="off"
                  spellcheck="false"
                  (input)="onSearchInput($event)"
                  (focus)="onSearchFocus()"
                  (blur)="onSearchBlur()"
                />
                @if (searchQuery()) {
                  <button
                    type="button"
                    class="search-clear absolute right-2 flex h-6 w-6 items-center justify-center rounded-full p-0"
                    aria-label="Clear search"
                    (click)="clearSearch()"
                  >
                    <nxt1-icon name="close" size="16" />
                  </button>
                }
              </form>
            </div>
          }

          <!-- Create Button -->
          @if (config.showCreate !== false) {
            <button
              type="button"
              class="nav-create-btn"
              aria-label="Create new post"
              (click)="onCreateClick($event)"
            >
              <nxt1-icon name="plus" size="20" />
              <span class="nav-create-label hidden lg:inline">Create</span>
            </button>
          }

          <!-- Notifications -->
          @if (showNotifications()) {
            <button
              type="button"
              class="nav-action-btn notifications-btn"
              [attr.aria-label]="
                'Notifications' +
                (config.notificationCount ? ', ' + config.notificationCount + ' unread' : '')
              "
              (click)="onNotificationsClick($event)"
            >
              <nxt1-icon name="bell" size="22" />
              @if (config.notificationCount && config.notificationCount > 0) {
                <span class="notification-badge">
                  {{ config.notificationCount > 99 ? '99+' : config.notificationCount }}
                </span>
              }
            </button>
          }

          <!-- User Menu -->
          @if (showUserMenu()) {
            <div class="nav-user relative" [class.open]="userMenuOpen()">
              <button
                type="button"
                class="user-btn"
                [attr.aria-expanded]="userMenuOpen()"
                aria-haspopup="menu"
                [attr.aria-label]="'User menu for ' + user?.name"
                (click)="toggleUserMenu()"
              >
                <!-- Avatar -->
                <div class="user-avatar">
                  @if (user?.avatarUrl) {
                    <img
                      [src]="user!.avatarUrl"
                      [alt]="user?.name || 'User avatar'"
                      class="avatar-img"
                      loading="lazy"
                    />
                  } @else {
                    <span class="avatar-initials">{{ userInitials() }}</span>
                  }
                  @if (user?.verified) {
                    <span class="avatar-verified" aria-label="Verified">
                      <nxt1-icon name="checkmarkCircle" size="12" />
                    </span>
                  }
                </div>

                <!-- Chevron indicator -->
                <nxt1-icon
                  name="chevronDown"
                  class="user-chevron"
                  [class.open]="userMenuOpen()"
                  size="16"
                />
              </button>

              <!-- User Dropdown Menu -->
              <div
                class="user-dropdown"
                [class.open]="userMenuOpen()"
                role="menu"
                aria-label="User menu"
              >
                <!-- User Info Header -->
                <div class="user-info">
                  <div class="user-info-avatar">
                    @if (user?.avatarUrl) {
                      <img
                        [src]="user!.avatarUrl"
                        [alt]="user?.name || 'User avatar'"
                        class="avatar-img-lg"
                      />
                    } @else {
                      <span class="avatar-initials-lg">{{ userInitials() }}</span>
                    }
                  </div>
                  <div class="user-info-text">
                    <span class="user-info-name">{{ user?.name }}</span>
                    @if (user?.email) {
                      <span class="user-info-email">{{ user?.email }}</span>
                    }
                    @if (user?.roleBadge) {
                      <span class="user-info-role">{{ user?.roleBadge }}</span>
                    }
                  </div>
                  @if (user?.isPremium) {
                    <span class="premium-badge">PRO</span>
                  }
                </div>

                <div class="user-menu-divider"></div>

                <!-- Menu Items -->
                <ul class="user-menu-list m-0 list-none p-1">
                  @for (menuItem of userMenuItems; track menuItem.id) {
                    @if (menuItem.divider) {
                      <li class="user-menu-divider" role="separator"></li>
                    }
                    <li role="none">
                      <button
                        type="button"
                        class="user-menu-item"
                        [class.danger]="menuItem.variant === 'danger'"
                        [class.disabled]="menuItem.disabled"
                        [disabled]="menuItem.disabled"
                        role="menuitem"
                        (click)="onUserMenuItemClick(menuItem, $event)"
                      >
                        @if (menuItem.icon) {
                          <nxt1-icon
                            [name]="menuItem.icon"
                            class="menu-item-icon flex-shrink-0"
                            size="18"
                          />
                        }
                        <span class="menu-item-label flex-1 leading-tight">{{
                          menuItem.label
                        }}</span>
                      </button>
                    </li>
                  }
                </ul>
              </div>
            </div>
          }
        </div>
      </div>
    </header>

    <!-- ============================================
         MOBILE MENU PANEL (slide-out drawer)
         ============================================ -->
    <div
      class="mobile-menu-overlay"
      [class.open]="mobileMenuOpen()"
      (click)="closeMobileMenu()"
      aria-hidden="true"
    ></div>

    <nav
      id="mobile-menu"
      class="mobile-menu"
      [class.open]="mobileMenuOpen()"
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div class="mobile-menu-content flex min-h-full flex-col pt-[calc(56px+16px)]">
        <!-- Mobile Nav Items -->
        <ul class="mobile-nav-list m-0 list-none p-2">
          @for (item of items; track item.id) {
            <li class="mobile-nav-item mb-1" [class.active]="isActiveItem(item)">
              <button
                type="button"
                class="mobile-nav-btn"
                [class.active]="isActiveItem(item)"
                (click)="onItemClick(item, $event); closeMobileMenu()"
              >
                @if (item.icon) {
                  <nxt1-icon
                    [name]="isActiveItem(item) ? item.icon + 'Filled' : item.icon"
                    size="22"
                  />
                }
                <span class="mobile-nav-label flex-1">{{ item.label }}</span>
                @if (item.badge && item.badge > 0) {
                  <span
                    class="mobile-nav-badge flex min-w-[20px] items-center justify-center rounded-[10px] bg-[var(--nxt1-ui-error)] px-1.5 text-[11px] font-semibold text-white"
                  >
                    {{ item.badge > 99 ? '99+' : item.badge }}
                  </span>
                }
              </button>
            </li>
          }
        </ul>

        <!-- Mobile User Section -->
        @if (user) {
          <div class="mobile-user-section mt-auto border-t border-[var(--nxt1-nav-border)] p-4">
            <div class="mobile-user-info mb-4 flex items-center gap-3">
              <div
                class="mobile-user-avatar flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[var(--nxt1-nav-active-bg)]"
              >
                @if (user.avatarUrl) {
                  <img
                    [src]="user.avatarUrl"
                    [alt]="user.name || 'User avatar'"
                    class="h-full w-full object-cover"
                  />
                } @else {
                  <span
                    class="mobile-avatar-initials text-lg font-semibold text-[var(--nxt1-nav-text)]"
                  >
                    {{ userInitials() }}
                  </span>
                }
              </div>
              <div class="mobile-user-text flex flex-col gap-0.5">
                <span
                  class="mobile-user-name text-base font-semibold text-[var(--nxt1-nav-text)]"
                  >{{ user.name }}</span
                >
                @if (user.email) {
                  <span class="mobile-user-email text-sm text-[var(--nxt1-nav-text-secondary)]">{{
                    user.email
                  }}</span>
                }
              </div>
            </div>

            <ul class="mobile-user-menu m-0 list-none p-0">
              @for (menuItem of userMenuItems; track menuItem.id) {
                @if (menuItem.divider) {
                  <li class="mobile-menu-divider my-2 h-px bg-[var(--nxt1-nav-border)]"></li>
                }
                <li>
                  <button
                    type="button"
                    class="mobile-menu-btn flex w-full items-center gap-3 rounded-md px-2 py-3 text-left text-sm text-[var(--nxt1-nav-text-secondary)] transition-colors hover:bg-[var(--nxt1-nav-hover-bg)] hover:text-[var(--nxt1-nav-text)]"
                    [class.danger]="menuItem.variant === 'danger'"
                    (click)="onUserMenuItemClick(menuItem, $event); closeMobileMenu()"
                  >
                    @if (menuItem.icon) {
                      <nxt1-icon [name]="menuItem.icon" size="20" />
                    }
                    <span>{{ menuItem.label }}</span>
                  </button>
                </li>
              }
            </ul>
          </div>
        } @else {
          <!-- Mobile Auth Buttons (for unauthenticated users) -->
          <div class="mobile-auth-section flex flex-col gap-3 p-6">
            <button
              type="button"
              class="mobile-auth-btn mobile-auth-btn--primary flex h-12 w-full items-center justify-center rounded-xl bg-[var(--nxt1-color-primary)] font-semibold text-white transition-all duration-200 hover:bg-[var(--nxt1-color-primary-dark)] active:scale-[0.98]"
              (click)="closeMobileMenu()"
              routerLink="/auth/login"
            >
              Sign In
            </button>
            <button
              type="button"
              class="mobile-auth-btn mobile-auth-btn--secondary flex h-12 w-full items-center justify-center rounded-xl border border-[var(--nxt1-nav-border)] bg-transparent font-semibold text-[var(--nxt1-nav-text)] transition-all duration-200 hover:bg-[var(--nxt1-nav-hover-bg)] active:scale-[0.98]"
              (click)="closeMobileMenu()"
              routerLink="/auth/register"
            >
              Create Account
            </button>
          </div>
        }

        <!-- ============================================
             MOBILE HAMBURGER BUTTON (visible on mobile only, right side)
             ============================================ -->
        <button
          type="button"
          class="mobile-menu-btn relative z-[1001] flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-lg bg-transparent transition-colors duration-200 hover:bg-[var(--nxt1-nav-hover-bg)] lg:hidden"
          [class.open]="mobileMenuOpen()"
          [attr.aria-expanded]="mobileMenuOpen()"
          aria-controls="mobile-menu"
          aria-label="Toggle menu"
          (click)="toggleMobileMenu()"
        >
          <span
            class="hamburger-line block h-0.5 w-5 origin-center rounded-full bg-[var(--nxt1-nav-text)] transition-all duration-300"
          ></span>
          <span
            class="hamburger-line block h-0.5 w-5 origin-center rounded-full bg-[var(--nxt1-nav-text)] transition-all duration-300"
          ></span>
          <span
            class="hamburger-line block h-0.5 w-5 origin-center rounded-full bg-[var(--nxt1-nav-text)] transition-all duration-300"
          ></span>
        </button>
      </div>
    </nav>
  `,
  styles: [
    `
      /* Styles are defined in @nxt1/ui/styles/components/navigation.css */
      /* This component uses Tailwind for layout + CSS variables for theming */
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtHeaderComponent implements OnDestroy {
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

  /** Emits when create button is clicked */
  @Output() createClick = new EventEmitter<Event>();

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

  /** Whether mobile menu is open */
  readonly mobileMenuOpen = signal(false);

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
   * Handle create button click
   */
  onCreateClick(event: Event): void {
    this.haptics.impact('medium');
    this.createClick.emit(event);
  }

  /**
   * Toggle user menu
   */
  toggleUserMenu(): void {
    this.activeDropdown.set(null);
    this.mobileMenuOpen.set(false);
    this.userMenuOpen.update((open) => !open);
    this.haptics.impact('light');
  }

  /**
   * Toggle mobile menu
   */
  toggleMobileMenu(): void {
    this.activeDropdown.set(null);
    this.userMenuOpen.set(false);
    this.mobileMenuOpen.update((open) => !open);
    this.haptics.impact('light');
  }

  /**
   * Close mobile menu (for navigation)
   */
  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
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
    this.mobileMenuOpen.set(false);

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
