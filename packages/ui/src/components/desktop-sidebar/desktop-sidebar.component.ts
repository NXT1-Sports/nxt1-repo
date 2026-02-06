/**
 * @fileoverview NxtDesktopSidebarComponent - Professional Fixed Desktop Sidebar
 * @module @nxt1/ui/components/desktop-sidebar
 * @version 1.0.0
 *
 * Professional fixed sidebar for desktop web applications.
 * YouTube/Twitter/LinkedIn-inspired navigation pattern.
 *
 * Design Philosophy:
 * - Fixed position sidebar (not drawer/overlay)
 * - Responsive: expanded (≥1280px), collapsed (768-1279px)
 * - Hover expand when collapsed for quick access
 * - Full keyboard navigation and ARIA accessibility
 * - 100% design token + Tailwind theme awareness
 * - SSR-safe implementation
 *
 * Features:
 * - NXT1 Logo at top
 * - Sectioned navigation items with icons
 * - Active state highlighting with route detection
 * - Badge support for notifications
 * - User section at bottom
 * - Theme toggle
 * - Collapse/expand toggle
 * - Smooth animations
 *
 * ⭐ DESKTOP WEB ONLY — Use NxtMobileFooter for mobile ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  input,
  output,
  PLATFORM_ID,
  afterNextRender,
  DestroyRef,
  HostBinding,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { NxtLogoComponent } from '../logo';
import { NxtIconComponent } from '../icon';
import { NxtAvatarComponent } from '../avatar';
import { NxtThemeSelectorComponent } from '../theme-selector';
import type {
  DesktopSidebarConfig,
  DesktopSidebarSection,
  DesktopSidebarItem,
  DesktopSidebarUserData,
  DesktopSidebarSelectEvent,
} from './desktop-sidebar.types';
import {
  DEFAULT_DESKTOP_SIDEBAR_CONFIG,
  DEFAULT_DESKTOP_SIDEBAR_SECTIONS,
  SIDEBAR_WIDTHS,
  SIDEBAR_BREAKPOINTS,
} from './desktop-sidebar.types';

@Component({
  selector: 'nxt1-desktop-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NxtLogoComponent,
    NxtIconComponent,
    NxtAvatarComponent,
    NxtThemeSelectorComponent,
  ],
  template: `
    <aside
      class="sidebar"
      [class.sidebar--collapsed]="isCollapsed()"
      [class.sidebar--expanded]="!isCollapsed()"
      [class.sidebar--hover-expanded]="isHoverExpanded()"
      [class.sidebar--bordered]="config().bordered !== false"
      [class.sidebar--elevated]="config().variant === 'elevated'"
      [class.sidebar--minimal]="config().variant === 'minimal'"
      (mouseenter)="onMouseEnter()"
      (mouseleave)="onMouseLeave()"
      role="navigation"
      aria-label="Main navigation"
    >
      <!-- Logo Section -->
      @if (config().showLogo !== false) {
        <div class="sidebar__logo">
          <!-- Collapse/Menu toggle (always visible) -->
          <button
            type="button"
            class="sidebar__menu-btn"
            (click)="toggleCollapse($event)"
            [attr.aria-label]="isCollapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
            [attr.aria-expanded]="!isCollapsed()"
          >
            <nxt1-icon name="menu" [size]="22" />
          </button>

          <!-- Logo (hidden when collapsed) -->
          @if (!isCollapsed() || isHoverExpanded()) {
            <button
              type="button"
              class="sidebar__logo-btn"
              (click)="onLogoClick($event)"
              aria-label="Go to home"
            >
              <nxt1-logo size="sm" variant="header" />
            </button>
          }
        </div>
      }

      <!-- Navigation Sections -->
      <nav class="sidebar__nav">
        @for (section of sections(); track section.id; let isLast = $last) {
          <div class="sidebar__section" [class.sidebar__section--last]="isLast">
            <!-- Section Label (only when expanded) -->
            @if (section.label && (!isCollapsed() || isHoverExpanded())) {
              <div class="sidebar__section-label">{{ section.label }}</div>
            }

            <!-- Section Items -->
            <ul class="sidebar__items" role="menu">
              @for (item of section.items; track item.id) {
                @if (!item.hidden) {
                  @if (item.divider) {
                    <li class="sidebar__divider" role="separator"></li>
                  } @else {
                    <li role="none">
                      <button
                        type="button"
                        class="sidebar__item"
                        [class.sidebar__item--active]="isActiveItem(item)"
                        [class.sidebar__item--disabled]="item.disabled"
                        [class.sidebar__item--collapsed]="isCollapsed() && !isHoverExpanded()"
                        [disabled]="item.disabled"
                        [attr.aria-current]="isActiveItem(item) ? 'page' : null"
                        [attr.aria-label]="item.ariaLabel ?? item.label"
                        role="menuitem"
                        (click)="onItemClick(item, section.id, $event)"
                      >
                        <!-- Icon (same icon, color changes on active state via CSS) -->
                        <span class="sidebar__item-icon">
                          <nxt1-icon [name]="item.icon" [size]="22" />
                        </span>

                        <!-- Label (hidden when collapsed) -->
                        @if (!isCollapsed() || isHoverExpanded()) {
                          <span class="sidebar__item-label">{{ item.label }}</span>
                        }

                        <!-- Badge -->
                        @if (item.badge && item.badge > 0) {
                          <span
                            class="sidebar__item-badge"
                            [class.sidebar__item-badge--collapsed]="
                              isCollapsed() && !isHoverExpanded()
                            "
                          >
                            {{ item.badge > 99 ? '99+' : item.badge }}
                          </span>
                        }

                        <!-- Tooltip (only when collapsed) -->
                        @if (isCollapsed() && !isHoverExpanded()) {
                          <span class="sidebar__tooltip">{{ item.label }}</span>
                        }
                      </button>
                    </li>
                  }
                }
              }
            </ul>
          </div>
        }
      </nav>

      <!-- Bottom Section: Theme & User -->
      <div class="sidebar__bottom">
        <!-- Theme Toggle -->
        @if (config().showThemeToggle !== false) {
          <div class="sidebar__theme">
            @if (!isCollapsed() || isHoverExpanded()) {
              <nxt1-theme-selector
                variant="compact"
                [showLabels]="false"
                [showAppearance]="true"
                [showSportThemes]="true"
              />
            } @else {
              <button
                type="button"
                class="sidebar__item sidebar__item--collapsed"
                (click)="toggleTheme($event)"
                aria-label="Toggle theme"
              >
                <span class="sidebar__item-icon">
                  <nxt1-icon name="moon" [size]="22" />
                </span>
                <span class="sidebar__tooltip">Toggle theme</span>
              </button>
            }
          </div>
        }

        <!-- User Section -->
        @if (config().showUserSection !== false && user()) {
          <div class="sidebar__user">
            <button
              type="button"
              class="sidebar__user-btn"
              [class.sidebar__user-btn--collapsed]="isCollapsed() && !isHoverExpanded()"
              (click)="onUserClick($event)"
              aria-label="User menu"
            >
              <nxt1-avatar
                [src]="user()!.avatarUrl"
                [name]="user()!.name"
                [initials]="user()!.initials"
                [size]="isCollapsed() && !isHoverExpanded() ? 'sm' : 'md'"
                [badge]="user()!.verified ? 'verified' : undefined"
              />

              @if (!isCollapsed() || isHoverExpanded()) {
                <div class="sidebar__user-info">
                  <span class="sidebar__user-name">{{ user()!.name }}</span>
                  @if (user()!.handle) {
                    <span class="sidebar__user-handle">{{ user()!.handle }}</span>
                  }
                </div>
                <nxt1-icon name="moreHorizontal" [size]="18" class="sidebar__user-more" />
              }
            </button>
          </div>
        }
      </div>
    </aside>
  `,
  styles: [
    `
      /* ============================================
       CSS CUSTOM PROPERTIES (Design Tokens)
       ============================================ */
      :host {
        --sidebar-width-expanded: ${SIDEBAR_WIDTHS.EXPANDED}px;
        --sidebar-width-collapsed: ${SIDEBAR_WIDTHS.COLLAPSED}px;
        --sidebar-width-hover: ${SIDEBAR_WIDTHS.HOVER_EXPANDED}px;

        --sidebar-bg: var(--nxt1-color-bg-primary);
        --sidebar-border: var(--nxt1-color-border-default);
        --sidebar-text-primary: var(--nxt1-color-text-primary);
        --sidebar-text-secondary: var(--nxt1-color-text-secondary);
        --sidebar-text-tertiary: var(--nxt1-color-text-tertiary);

        --sidebar-item-hover: var(--nxt1-color-surface-200);
        --sidebar-item-active: var(--nxt1-color-surface-300);
        --sidebar-item-active-text: var(--nxt1-color-text-primary);
        --sidebar-item-radius: var(--nxt1-borderRadius-xl);

        --sidebar-accent: var(--nxt1-color-primary);
        --sidebar-badge-bg: var(--nxt1-color-error);
        --sidebar-badge-text: white;

        --sidebar-transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);

        display: block;
        height: 100%;
      }

      /* ============================================
       SIDEBAR CONTAINER
       ============================================ */
      .sidebar {
        display: flex;
        flex-direction: column;
        height: 100vh;
        height: 100dvh;
        width: var(--sidebar-width-expanded);
        background: var(--sidebar-bg);
        transition: width var(--sidebar-transition);
        overflow: hidden;
        position: sticky;
        top: 0;
        z-index: 50;
      }

      .sidebar--bordered {
        border-right: 1px solid var(--sidebar-border);
      }

      .sidebar--elevated {
        box-shadow: var(--nxt1-shadow-lg);
      }

      .sidebar--collapsed {
        width: var(--sidebar-width-collapsed);
      }

      .sidebar--hover-expanded {
        width: var(--sidebar-width-hover);
        position: absolute;
        box-shadow: var(--nxt1-shadow-2xl);
        z-index: 100;
      }

      /* ============================================
       LOGO SECTION
       ============================================ */
      .sidebar__logo {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        min-height: 56px;
      }

      .sidebar--bordered .sidebar__logo {
        border-bottom: 1px solid var(--sidebar-border);
      }

      .sidebar__menu-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        background: none;
        border: none;
        border-radius: var(--sidebar-item-radius);
        cursor: pointer;
        color: var(--sidebar-text-secondary);
        transition: all var(--sidebar-transition);
        flex-shrink: 0;
      }

      .sidebar__menu-btn:hover {
        background: var(--sidebar-item-hover);
        color: var(--sidebar-text-primary);
      }

      .sidebar__logo-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        border-radius: var(--sidebar-item-radius);
        transition: opacity var(--sidebar-transition);
      }

      .sidebar__logo-btn:hover {
        opacity: 0.8;
      }

      .sidebar--collapsed .sidebar__logo {
        justify-content: center;
        padding: 12px;
      }

      /* ============================================
       NAVIGATION
       ============================================ */
      .sidebar__nav {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 8px;
        scrollbar-width: thin;
        scrollbar-color: var(--sidebar-border) transparent;
      }

      .sidebar__nav::-webkit-scrollbar {
        width: 4px;
      }

      .sidebar__nav::-webkit-scrollbar-track {
        background: transparent;
      }

      .sidebar__nav::-webkit-scrollbar-thumb {
        background: var(--sidebar-border);
        border-radius: 2px;
      }

      .sidebar__section {
        margin-bottom: 8px;
      }

      .sidebar__section--last {
        margin-top: auto;
      }

      .sidebar__section-label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--sidebar-text-tertiary);
        padding: 12px 12px 8px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .sidebar__items {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .sidebar__divider {
        height: 1px;
        background: var(--sidebar-border);
        margin: 8px 12px;
      }

      /* ============================================
       NAVIGATION ITEM
       ============================================ */
      .sidebar__item {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 10px 12px;
        background: none;
        border: none;
        border-radius: var(--sidebar-item-radius);
        cursor: pointer;
        color: var(--sidebar-text-secondary);
        font-size: 14px;
        font-weight: 500;
        text-align: left;
        transition: all var(--sidebar-transition);
        position: relative;
        white-space: nowrap;
      }

      .sidebar__item:hover:not(:disabled) {
        background: var(--sidebar-item-hover);
        color: var(--sidebar-text-primary);
      }

      .sidebar__item--active {
        background: var(--sidebar-item-active);
        color: var(--sidebar-item-active-text);
        font-weight: 600;
      }

      .sidebar__item--active .sidebar__item-icon {
        color: var(--sidebar-accent);
      }

      .sidebar__item--disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .sidebar__item--collapsed {
        justify-content: center;
        padding: 12px;
      }

      .sidebar__item-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        color: inherit;
      }

      .sidebar__item-label {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .sidebar__item-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        background: var(--sidebar-badge-bg);
        color: var(--sidebar-badge-text);
        font-size: 11px;
        font-weight: 600;
        border-radius: 10px;
      }

      .sidebar__item-badge--collapsed {
        position: absolute;
        top: 6px;
        right: 10px;
        min-width: 8px;
        height: 8px;
        padding: 0;
        font-size: 0;
      }

      /* ============================================
       TOOLTIP (Collapsed State)
       ============================================ */
      .sidebar__tooltip {
        position: absolute;
        left: calc(100% + 12px);
        top: 50%;
        transform: translateY(-50%);
        padding: 6px 12px;
        background: var(--nxt1-color-surface-300);
        color: var(--sidebar-text-primary);
        font-size: 13px;
        font-weight: 500;
        border-radius: 8px;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: all 150ms ease;
        box-shadow: var(--nxt1-shadow-lg);
        z-index: 1000;
      }

      .sidebar__tooltip::before {
        content: '';
        position: absolute;
        left: -6px;
        top: 50%;
        transform: translateY(-50%);
        border: 6px solid transparent;
        border-right-color: var(--nxt1-color-surface-300);
      }

      .sidebar__item:hover .sidebar__tooltip {
        opacity: 1;
        visibility: visible;
      }

      /* ============================================
       BOTTOM SECTION (Theme + User)
       ============================================ */
      .sidebar__bottom {
        flex-shrink: 0;
        border-top: 1px solid var(--sidebar-border);
      }

      /* ============================================
       THEME TOGGLE
       ============================================ */
      .sidebar__theme {
        padding: 8px;
      }

      /* ============================================
       USER SECTION
       ============================================ */
      .sidebar__user {
        padding: 8px;
        border-top: 1px solid var(--sidebar-border);
      }

      .sidebar__user-btn {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 8px;
        background: none;
        border: none;
        border-radius: var(--sidebar-item-radius);
        cursor: pointer;
        transition: background var(--sidebar-transition);
      }

      .sidebar__user-btn:hover {
        background: var(--sidebar-item-hover);
      }

      .sidebar__user-btn--collapsed {
        justify-content: center;
      }

      .sidebar__user-info {
        flex: 1;
        min-width: 0;
        text-align: left;
      }

      .sidebar__user-name {
        display: block;
        font-size: 14px;
        font-weight: 600;
        color: var(--sidebar-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .sidebar__user-handle {
        display: block;
        font-size: 12px;
        color: var(--sidebar-text-tertiary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .sidebar__user-more {
        color: var(--sidebar-text-tertiary);
        flex-shrink: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtDesktopSidebarComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  // ============================================
  // INPUTS
  // ============================================

  /** Navigation sections */
  readonly sections = input<readonly DesktopSidebarSection[]>(DEFAULT_DESKTOP_SIDEBAR_SECTIONS);

  /** User data for footer section */
  readonly user = input<DesktopSidebarUserData | null>(null);

  /** Configuration */
  readonly config = input<DesktopSidebarConfig>(DEFAULT_DESKTOP_SIDEBAR_CONFIG);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when an item is selected */
  readonly itemSelect = output<DesktopSidebarSelectEvent>();

  /** Emitted when user section is clicked */
  readonly userClick = output<Event>();

  /** Emitted when logo is clicked */
  readonly logoClick = output<Event>();

  /** Emitted when collapse state changes */
  readonly collapseChange = output<boolean>();

  // ============================================
  // STATE
  // ============================================

  /** Current route path */
  private readonly _currentRoute = signal('/');

  /** Whether sidebar is collapsed */
  private readonly _isCollapsed = signal(false);

  /** Whether sidebar is hover-expanded (when collapsed but mouse is over) */
  private readonly _isHoverExpanded = signal(false);

  /** Computed: is collapsed (respects config and stored preference) */
  readonly isCollapsed = computed(() => this._isCollapsed());

  /** Computed: is hover expanded */
  readonly isHoverExpanded = computed(() => this._isCollapsed() && this._isHoverExpanded());

  // ============================================
  // HOST BINDINGS
  // ============================================

  @HostBinding('class.sidebar-collapsed')
  get hostCollapsed(): boolean {
    return this._isCollapsed();
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  constructor() {
    // Initialize route tracking
    this._currentRoute.set(this.router.url);

    // Track route changes
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        this._currentRoute.set(event.urlAfterRedirects);
      });

    // Initialize from storage (browser only)
    afterNextRender(() => {
      this.loadCollapsedState();
    });
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Check if an item is active based on current route.
   */
  isActiveItem(item: DesktopSidebarItem): boolean {
    if (!item.route) return false;
    const currentPath = this._currentRoute();

    // Exact match for home, prefix match for others
    if (item.route === '/home') {
      return currentPath === '/home' || currentPath === '/';
    }

    return currentPath.startsWith(item.route);
  }

  /**
   * Toggle collapsed state.
   */
  toggleCollapse(event?: Event): void {
    event?.stopPropagation();
    const newState = !this._isCollapsed();
    this._isCollapsed.set(newState);
    this._isHoverExpanded.set(false);
    this.saveCollapsedState(newState);
    this.collapseChange.emit(newState);
  }

  /**
   * Set collapsed state programmatically.
   */
  setCollapsed(collapsed: boolean): void {
    this._isCollapsed.set(collapsed);
    this._isHoverExpanded.set(false);
    this.saveCollapsedState(collapsed);
    this.collapseChange.emit(collapsed);
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  onMouseEnter(): void {
    if (this._isCollapsed() && this.config().expandOnHover !== false) {
      this._isHoverExpanded.set(true);
    }
  }

  onMouseLeave(): void {
    this._isHoverExpanded.set(false);
  }

  onItemClick(item: DesktopSidebarItem, sectionId: string, event: Event): void {
    if (item.disabled) return;

    // Handle special actions
    if (item.action) {
      this.itemSelect.emit({ item, sectionId, event });
      return;
    }

    // Handle external links
    if (item.href) {
      window.open(item.href, '_blank', 'noopener,noreferrer');
      return;
    }

    // Handle route navigation
    if (item.route) {
      this.router.navigate([item.route]);
      this.itemSelect.emit({ item, sectionId, event });
    }
  }

  onUserClick(event: Event): void {
    this.userClick.emit(event);
  }

  onLogoClick(event: Event): void {
    this.router.navigate(['/home']);
    this.logoClick.emit(event);
  }

  toggleTheme(event: Event): void {
    event.stopPropagation();
    // Theme toggle is handled by NxtThemeSelectorComponent
    // This is just a placeholder for collapsed state
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private loadCollapsedState(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const config = this.config();
    if (!config.persistState) return;

    const key = config.storageKey ?? 'nxt1_sidebar_collapsed';
    const stored = localStorage.getItem(key);

    if (stored !== null) {
      this._isCollapsed.set(stored === 'true');
    } else if (config.collapsed !== undefined) {
      this._isCollapsed.set(config.collapsed);
    }
  }

  private saveCollapsedState(collapsed: boolean): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const config = this.config();
    if (!config.persistState) return;

    const key = config.storageKey ?? 'nxt1_sidebar_collapsed';
    localStorage.setItem(key, String(collapsed));
  }
}
