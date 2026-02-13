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
import { NxtThemeService } from '../../services/theme';
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
                        <span
                          class="sidebar__item-icon"
                          [class.sidebar__item-icon--agent-x]="isAgentXIcon(item.icon)"
                        >
                          @if (isAgentXIcon(item.icon)) {
                            <!-- Agent X Logo SVG - Theme-aware via currentColor (same as footer) -->
                            <svg
                              class="agent-x-logo"
                              viewBox="0 0 612 792"
                              width="40"
                              height="40"
                              fill="currentColor"
                              stroke="currentColor"
                              stroke-width="12"
                              stroke-linejoin="round"
                              aria-hidden="true"
                            >
                              <path
                                d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
                              />
                              <polygon
                                points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
                              />
                            </svg>
                          } @else {
                            <nxt1-icon [name]="item.icon" [size]="22" />
                          }
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
                [singleRow]="true"
              />
            } @else {
              <button
                type="button"
                class="sidebar__item sidebar__item--collapsed"
                (click)="toggleTheme($event)"
                aria-label="Toggle theme"
              >
                <span class="sidebar__item-icon">
                  <nxt1-icon [name]="theme.isDark() ? 'sun' : 'moon'" [size]="22" />
                </span>
                <span class="sidebar__tooltip">Toggle theme</span>
              </button>
            }
          </div>
        }

        <!-- Sign In Prompt (unauthenticated) -->
        @if (config().showSignIn !== false && !user()) {
          <div class="sidebar__signin">
            @if (!isCollapsed() || isHoverExpanded()) {
              <a class="sidebar__signin-btn" routerLink="/auth" aria-label="Sign in"> Sign In </a>
            } @else {
              <button
                type="button"
                class="sidebar__item sidebar__item--collapsed sidebar__item--signin"
                (click)="onSignInClick($event)"
                aria-label="Sign in"
              >
                <span class="sidebar__item-icon">
                  <nxt1-icon name="person" [size]="22" />
                </span>
                <span class="sidebar__tooltip">Sign in</span>
              </button>
            }
          </div>
        }

        <!-- User Section (authenticated) -->
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

      /* Agent X Logo - larger size (matches footer FAB) */
      .sidebar__item-icon--agent-x {
        width: 24px;
        height: 24px;
        overflow: visible;
      }

      .sidebar__item-icon .agent-x-logo {
        display: block;
        width: 40px;
        height: 40px;
        margin-left: -2px;
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

      /* ============================================
       SIGN IN PROMPT
       ============================================ */
      .sidebar__signin {
        padding: 8px;
        border-top: 1px solid var(--sidebar-border);
      }

      .sidebar__signin-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 36px;
        padding: 0 20px;
        background: var(--nxt1-color-primary);
        color: var(--nxt1-ui-text-inverse, #000000);
        border: none;
        border-radius: 9999px;
        font-size: 14px;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
        box-shadow: var(--nxt1-glow-md);
        transition:
          background-color var(--sidebar-transition),
          transform var(--sidebar-transition),
          box-shadow var(--sidebar-transition);
      }

      .sidebar__signin-btn:hover {
        background: var(--nxt1-color-primary-dark, var(--nxt1-color-primary));
        transform: translateY(-1px);
      }

      .sidebar__signin-btn:active {
        transform: translateY(0);
        box-shadow: var(--nxt1-glow-sm);
      }

      .sidebar__signin-btn:focus-visible {
        outline: 2px solid var(--sidebar-accent);
        outline-offset: 2px;
      }

      .sidebar__item--signin {
        color: var(--nxt1-color-primary);
      }

      .sidebar__item--signin:hover:not(:disabled) {
        background: color-mix(in srgb, var(--nxt1-color-primary) 10%, transparent);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtDesktopSidebarComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly theme = inject(NxtThemeService);

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

  /** Emitted when sign-in is clicked */
  readonly signInClick = output<Event>();

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
      return currentPath === '/home';
    }

    return currentPath.startsWith(item.route);
  }

  /**
   * Check if an icon should render as the Agent X custom logo.
   * Uses same SVG as footer FAB for consistency.
   */
  isAgentXIcon(icon: string | undefined): boolean {
    if (!icon) return false;
    const agentIcons = ['agent-x', 'agent', 'agentx', 'agentX'];
    return agentIcons.includes(icon);
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
    this.logoClick.emit(event);
  }

  onSignInClick(event: Event): void {
    this.router.navigate(['/auth']);
    this.signInClick.emit(event);
  }

  toggleTheme(event: Event): void {
    event.stopPropagation();
    if (this.theme.hasSportTheme()) {
      this.theme.clearSportTheme();
    }
    this.theme.toggle();
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
